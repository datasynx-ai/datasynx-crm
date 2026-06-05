import * as lancedb from "@lancedb/lancedb";
import { Index } from "@lancedb/lancedb";
import { makeArrowTable } from "@lancedb/lancedb";
import { Schema, Field, FixedSizeList, Float32 as ArrowFloat32, Utf8 } from "apache-arrow";
import path from "path";
import { embedText, getEmbeddingDimension } from "./embedder.js";
import { reciprocalRankFusion } from "./hybrid-search.js";
import { logger } from "./logger.js";

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

/**
 * Build the per-customer table schema sized to the configured embedding model's
 * dimension (detected at runtime), so a different model — e.g. a 768-dim one —
 * works without code changes. The text/metadata columns are model-independent.
 */
async function buildCustomerSchema(): Promise<Schema> {
  const dim = await getEmbeddingDimension();
  return new Schema([
    new Field("source_ref", new Utf8(), false),
    new Field("text", new Utf8(), false),
    new Field("date", new Utf8(), false),
    new Field("type", new Utf8(), false),
    new Field("vector", new FixedSizeList(dim, new Field("item", new ArrowFloat32(), true)), false),
  ]);
}

async function getOrCreateCustomerTable(
  db: lancedb.Connection,
  tableName: string
): Promise<lancedb.Table> {
  const tableNames: string[] = await db.tableNames();
  if (!tableNames.includes(tableName)) {
    const table = await db.createEmptyTable(tableName, await buildCustomerSchema());
    await table.createIndex("source_ref", { config: Index.btree() });
    await ensureFtsIndex(table);
    return table;
  }
  return db.openTable(tableName);
}

/**
 * Ensure a full-text-search (Tantivy/BM25) index exists on the `text` column so
 * the keyword leg of hybrid search works. Idempotent and best-effort: an
 * "already exists" failure (or any other) is swallowed — FTS is an enhancement,
 * never a hard dependency. This also lazily migrates older `docs_<slug>` tables
 * that were created before FTS indexing was added.
 */
async function ensureFtsIndex(table: lancedb.Table): Promise<void> {
  try {
    await table.createIndex("text", { config: Index.fts() });
  } catch {
    // Index already exists or FTS unavailable — fall back to vector-only search.
  }
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
    logger.error("lancedb", "indexInLanceDB failed", { error: (err as Error).message });
  }
}

/**
 * Rebuild a customer's table from its own stored `text` column: re-embed every
 * row with the currently configured model and recreate the table sized to that
 * model's dimension, plus the FTS index. Use after switching DXCRM_EMBED_MODEL,
 * or to add the FTS index to a legacy table. No source files are needed — the
 * indexed text is the input. Returns the number of rows reindexed.
 */
export async function reindexCustomer(dataDir: string, slug: string): Promise<number> {
  try {
    const db = await getDb(dataDir);
    const tableName = `docs_${slug.replace(/[^a-z0-9]/gi, "_")}`;
    const tableNames: string[] = await db.tableNames();
    if (!tableNames.includes(tableName)) return 0;

    const table = await db.openTable(tableName);
    const rows = (await table.query().limit(1_000_000).toArray()) as Array<Record<string, unknown>>;
    if (rows.length === 0) return 0;

    // Recreate the table with the current embedding dimension + indexes.
    await db.dropTable(tableName);
    const fresh = await db.createEmptyTable(tableName, await buildCustomerSchema());
    await fresh.createIndex("source_ref", { config: Index.btree() });
    await ensureFtsIndex(fresh);

    let count = 0;
    for (const r of rows) {
      const sourceRef = String(r["source_ref"] ?? "");
      if (!sourceRef) continue;
      const text = String(r["text"] ?? "");
      const vector = await embedText(text);
      const data = makeArrowTable([
        {
          source_ref: sourceRef,
          text: text.slice(0, 2000),
          date: String(r["date"] ?? new Date().toISOString().slice(0, 10)),
          type: String(r["type"] ?? "unknown"),
          vector: Array.from(vector),
        },
      ]);
      await fresh
        .mergeInsert("source_ref")
        .whenMatchedUpdateAll()
        .whenNotMatchedInsertAll()
        .execute(data);
      count++;
    }
    return count;
  } catch (err) {
    logger.error("lancedb", "reindexCustomer failed", { error: (err as Error).message });
    return 0;
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
    logger.error("lancedb", "dropCustomerTable failed", { error: (err as Error).message });
  }
}

interface KnowledgeDoc {
  content: string;
  source: string;
}

/** Map LanceDB result rows to {source_ref → doc} and the source_ref ranking. */
function collectRanking(
  rows: Array<Record<string, unknown>>,
  docs: Map<string, KnowledgeDoc>
): string[] {
  const ranking: string[] = [];
  for (const r of rows) {
    const source = String(r["source_ref"] ?? "");
    if (!source) continue;
    ranking.push(source);
    if (!docs.has(source)) {
      docs.set(source, { content: String(r["text"] ?? ""), source });
    }
  }
  return ranking;
}

/**
 * Hybrid search across a customer's indexed knowledge: a semantic vector leg
 * (ANN over embeddings) and a keyword leg (LanceDB native full-text/BM25) are
 * each ranked, then fused with Reciprocal Rank Fusion. Vector handles semantic
 * similarity; FTS handles exact terms/IDs/names that vectors miss. The FTS leg
 * is best-effort: if no FTS index exists (legacy tables) or it errors, the
 * result degrades gracefully to vector-only. Never throws — returns [] on any
 * failure or when the customer has not been indexed yet.
 */
export async function searchKnowledge(
  dataDir: string,
  slug: string,
  query: string,
  limit: number
): Promise<Array<{ content: string; score: number; source: string }>> {
  try {
    const db = await getDb(dataDir);
    const tableName = `docs_${slug.replace(/[^a-z0-9]/gi, "_")}`;

    const tableNames: string[] = await db.tableNames();
    if (!tableNames.includes(tableName)) {
      return [];
    }

    const table = await db.openTable(tableName);

    // Over-fetch from each leg so fusion has candidates to work with.
    const overFetch = Math.max(limit * 4, 20);
    const docs = new Map<string, KnowledgeDoc>();

    // Vector leg (semantic).
    const vectorFloat32 = await embedText(query);
    const vecRows = (await table
      .search(Array.from(vectorFloat32))
      .limit(overFetch)
      .toArray()) as Array<Record<string, unknown>>;
    const vecRanking = collectRanking(vecRows, docs);

    // Keyword leg (BM25 full-text) — best-effort, falls back to vector-only.
    let ftsRanking: string[] = [];
    try {
      await ensureFtsIndex(table);
      const ftsRows = (await table.search(query, "fts").limit(overFetch).toArray()) as Array<
        Record<string, unknown>
      >;
      ftsRanking = collectRanking(ftsRows, docs);
    } catch {
      ftsRanking = [];
    }

    const rankings = ftsRanking.length > 0 ? [vecRanking, ftsRanking] : [vecRanking];
    const fused = reciprocalRankFusion(rankings);

    return fused.slice(0, limit).map(({ id, score }) => ({
      content: docs.get(id)?.content ?? "",
      score,
      source: id,
    }));
  } catch {
    // If LanceDB table doesn't exist or search fails, return empty array
    return [];
  }
}
