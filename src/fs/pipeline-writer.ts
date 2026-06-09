import fs from "fs";
import path from "path";
import { PipelineDealSchema, type PipelineDeal } from "../schemas/pipeline.js";
import { writeFileAtomic } from "./atomic-write.js";
import { assertSafeSlug } from "./customer-dir.js";

const DEFAULT_HEADING = "# Pipeline";
// Canonical, documented table format (docs/schemas.md + `dxcrm create` scaffold).
const TABLE_HEADER = `| Deal | Stage | Value | Currency | Probability | Close Date | Updated | Notes | Owner |
|---|---|---|---|---|---|---|---|---|`;

function escapeMd(val: string | undefined | null): string {
  if (val === undefined || val === null) return "";
  return String(val).replace(/\|/g, "\\|");
}

function serializeDeal(deal: PipelineDeal): string {
  return `| ${escapeMd(deal.name)} | ${escapeMd(deal.stage)} | ${deal.value !== undefined ? String(deal.value) : ""} | ${escapeMd(deal.currency)} | ${deal.probability !== undefined ? String(deal.probability) : ""} | ${escapeMd(deal.close_date)} | ${escapeMd(deal.updated)} | ${escapeMd(deal.notes)} | ${escapeMd(deal.owner)} |`;
}

/** Map a (lowercased) table-header cell to a canonical deal field name. */
const COLUMN_ALIASES: Record<string, keyof PipelineDeal> = {
  deal: "name",
  name: "name",
  stage: "stage",
  value: "value",
  amount: "value",
  currency: "currency",
  probability: "probability",
  prob: "probability",
  "close date": "close_date",
  close_date: "close_date",
  close: "close_date",
  updated: "updated",
  "last updated": "updated",
  notes: "notes",
  note: "notes",
  owner: "owner",
  rep: "owner",
};

function splitRow(line: string): string[] {
  return line
    .trim()
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

function isSeparatorRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.includes("-") && /^\|[\s:|-]+\|?$/.test(t);
}

/**
 * Header-driven, column-order-tolerant parser. It accepts every format the
 * project has historically emitted or documented — the `dxcrm create` scaffold
 * (`| Deal | … | Updated | Notes |`), the legacy writer output
 * (`| Name | … | Notes | Updated |`), and any reordered variant — by mapping
 * cells via the table's own header row rather than fixed positions.
 */
function parseDealsFromMarkdown(content: string): PipelineDeal[] {
  const lines = content.split("\n");
  const deals: PipelineDeal[] = [];

  // columns[i] = canonical field name for column i, or null to ignore.
  let columns: Array<keyof PipelineDeal | null> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed.startsWith("|")) {
      // Any non-table line ends the current table.
      columns = null;
      continue;
    }

    if (isSeparatorRow(trimmed)) continue;

    const cells = splitRow(trimmed);

    if (!columns) {
      // Treat this row as a header if it names at least a deal + stage column.
      const mapped = cells.map((c) => COLUMN_ALIASES[c.toLowerCase()] ?? null);
      if (mapped.includes("name") && mapped.includes("stage")) {
        columns = mapped;
      }
      continue;
    }

    // Data row — map cells by the header's column → field assignment.
    const row: Partial<Record<keyof PipelineDeal, string>> = {};
    cells.forEach((cell, i) => {
      const field = columns?.[i];
      if (field) row[field] = cell.replace(/\\\|/g, "|");
    });

    if (!row.name || !row.stage) continue;

    const raw: Record<string, unknown> = {
      name: row.name,
      stage: row.stage,
      currency: row.currency || "EUR",
      updated: row.updated ?? "",
    };
    if (row.value) raw["value"] = parseFloat(row.value);
    if (row.probability) raw["probability"] = parseFloat(row.probability);
    if (row.close_date) raw["close_date"] = row.close_date;
    if (row.notes) raw["notes"] = row.notes;
    if (row.owner) raw["owner"] = row.owner;

    const result = PipelineDealSchema.safeParse(raw);
    if (result.success) {
      deals.push(result.data);
    }
  }

  return deals;
}

/** Extract the existing `# …` heading so rewrites don't drop the customer name. */
function extractHeading(content: string): string {
  for (const line of content.split("\n")) {
    if (line.trimStart().startsWith("# ")) return line.trimEnd();
  }
  return DEFAULT_HEADING;
}

function serializeDeals(deals: PipelineDeal[], heading: string = DEFAULT_HEADING): string {
  const head = `${heading}\n\n`;
  if (deals.length === 0) {
    return `${head}<!-- Deals listed here -->\n`;
  }
  const rows = deals.map(serializeDeal).join("\n");
  return `${head}${TABLE_HEADER}\n${rows}\n`;
}

export function readPipelineSync(dataDir: string, slug: string): PipelineDeal[] {
  const filePath = path.join(dataDir, "customers", slug, "pipeline.md");
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, "utf-8") as string;
  return parseDealsFromMarkdown(content);
}

export async function readPipeline(dataDir: string, slug: string): Promise<PipelineDeal[]> {
  return readPipelineSync(dataDir, slug);
}

export async function upsertDeal(dataDir: string, slug: string, deal: PipelineDeal): Promise<void> {
  assertSafeSlug(slug);
  const filePath = path.join(dataDir, "customers", slug, "pipeline.md");
  const rawExisting = fs.existsSync(filePath) ? (fs.readFileSync(filePath, "utf-8") as string) : "";
  const heading = rawExisting ? extractHeading(rawExisting) : DEFAULT_HEADING;
  const existing = parseDealsFromMarkdown(rawExisting);

  const idx = existing.findIndex((d) => d.name === deal.name);
  let updated: PipelineDeal[];
  if (idx >= 0) {
    updated = [...existing];
    updated[idx] = deal;
  } else {
    updated = [...existing, deal];
  }

  const content = serializeDeals(updated, heading);
  writeFileAtomic(filePath, content);
}
