import * as lancedb from "@lancedb/lancedb";
import { Index } from "@lancedb/lancedb";
import { makeArrowTable } from "@lancedb/lancedb";
import { Schema, Field, FixedSizeList, Float32 as ArrowFloat32, Utf8 } from "apache-arrow";
import path from "path";
import { embedText } from "./embedder.js";

let _db: lancedb.Connection | null = null;

async function getDb(dataDir: string): Promise<lancedb.Connection> {
  if (!_db) {
    const dbPath = path.join(dataDir, ".agentic", "lancedb");
    _db = await lancedb.connect(dbPath);
  }
  return _db;
}

// Reset connection (useful for testing)
export function resetConnection(): void {
  _db = null;
}

const CUSTOMER_TABLE_SCHEMA = new Schema([
  new Field("source_ref", new Utf8(), false),
  new Field("text", new Utf8(), false),
  new Field("date", new Utf8(), false),
  new Field("type", new Utf8(), false),
  new Field("vector", new FixedSizeList(384, new Field("item", new ArrowFloat32(), true)), false),
]);

async function getOrCreateCustomerTable(
  db: lancedb.Connection,
  tableName: string
): Promise<lancedb.Table> {
  const tableNames: string[] = await db.tableNames();
  if (!tableNames.includes(tableName)) {
    const table = await db.createEmptyTable(tableName, CUSTOMER_TABLE_SCHEMA);
    await table.createIndex("source_ref", { config: Index.btree() });
    return table;
  }
  return db.openTable(tableName);
}

export async function indexInLanceDB(
  dataDir: string,
  slug: string,
  text: string,
  sourceRef: string,
  meta?: { date?: string; type?: string }
): Promise<void> {
  try {
    const vectorFloat32 = await embedText(text);
    const db = await getDb(dataDir);
    const tableName = `docs_${slug.replace(/[^a-z0-9]/gi, "_")}`;
    const table = await getOrCreateCustomerTable(db, tableName);

    const date = meta?.date ?? new Date().toISOString().slice(0, 10);
    const type = meta?.type ?? "unknown";

    const data = makeArrowTable([
      {
        source_ref: sourceRef,
        text: text.slice(0, 2000),
        date,
        type,
        vector: Array.from(vectorFloat32),
      },
    ]);

    await table
      .mergeInsert("source_ref")
      .whenMatchedUpdateAll()
      .whenNotMatchedInsertAll()
      .execute(data);
  } catch (err) {
    process.stderr.write(
      `[lancedb] indexInLanceDB failed: ${(err as Error).message}\n`
    );
  }
}

export async function dropCustomerTable(dataDir: string, slug: string): Promise<void> {
  try {
    const db = await getDb(dataDir);
    const tableName = `docs_${slug.replace(/[^a-z0-9]/gi, "_")}`;
    const tableNames: string[] = await db.tableNames();
    if (tableNames.includes(tableName)) {
      await db.dropTable(tableName);
    }
  } catch (err) {
    process.stderr.write(`[lancedb] dropCustomerTable failed: ${(err as Error).message}\n`);
  }
}

export async function searchKnowledge(
  dataDir: string,
  slug: string,
  query: string,
  limit: number
): Promise<Array<{ content: string; score: number; source: string }>> {
  try {
    const vectorFloat32 = await embedText(query);
    const db = await getDb(dataDir);
    const tableName = `docs_${slug.replace(/[^a-z0-9]/gi, "_")}`;

    // Check if table exists
    const tableNames: string[] = await db.tableNames();
    if (!tableNames.includes(tableName)) {
      return [];
    }

    const table = await db.openTable(tableName);

    const results = await table
      .search(Array.from(vectorFloat32))
      .limit(limit)
      .toArray();

    return results.map((r: Record<string, unknown>) => ({
      content: String(r["text"] ?? ""),
      score: typeof r["_distance"] === "number" ? 1 - r["_distance"] : 1,
      source: String(r["source_ref"] ?? ""),
    }));
  } catch {
    // If LanceDB table doesn't exist or search fails, return empty array
    return [];
  }
}
