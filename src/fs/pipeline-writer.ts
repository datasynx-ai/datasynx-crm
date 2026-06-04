import fs from "fs";
import path from "path";
import { PipelineDealSchema, type PipelineDeal } from "../schemas/pipeline.js";
import { writeFileAtomic } from "./atomic-write.js";
import { assertSafeSlug } from "./customer-dir.js";

const PIPELINE_HEADER = "# Pipeline\n\n";
const TABLE_HEADER = `| Name | Stage | Value | Currency | Probability | Close Date | Notes | Updated |
|------|-------|-------|----------|-------------|------------|-------|---------|`;

function escapeMd(val: string | undefined | null): string {
  if (val === undefined || val === null) return "";
  return String(val).replace(/\|/g, "\\|");
}

function serializeDeal(deal: PipelineDeal): string {
  return `| ${escapeMd(deal.name)} | ${escapeMd(deal.stage)} | ${deal.value !== undefined ? String(deal.value) : ""} | ${escapeMd(deal.currency)} | ${deal.probability !== undefined ? String(deal.probability) : ""} | ${escapeMd(deal.close_date)} | ${escapeMd(deal.notes)} | ${escapeMd(deal.updated)} |`;
}

function parseDealsFromMarkdown(content: string): PipelineDeal[] {
  const lines = content.split("\n");
  const deals: PipelineDeal[] = [];

  let inTable = false;
  let headerParsed = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Look for the table header row
    if (!inTable && trimmed.startsWith("| Name |")) {
      inTable = true;
      headerParsed = false;
      continue;
    }

    if (inTable && !headerParsed && trimmed.startsWith("|---")) {
      headerParsed = true;
      continue;
    }

    if (inTable && headerParsed && trimmed.startsWith("|")) {
      // Parse a data row
      const cells = trimmed
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim().replace(/\\\|/g, "|"));

      const [name, stage, valueStr, currency, probabilityStr, close_date, notes, updated] =
        cells as [string, string, string, string, string, string, string, string];

      if (!name || !stage || !updated) continue;

      const raw: Record<string, unknown> = {
        name,
        stage,
        currency: currency || "EUR",
        updated,
      };

      if (valueStr) raw["value"] = parseFloat(valueStr);
      if (probabilityStr) raw["probability"] = parseFloat(probabilityStr);
      if (close_date) raw["close_date"] = close_date;
      if (notes) raw["notes"] = notes;

      const result = PipelineDealSchema.safeParse(raw);
      if (result.success) {
        deals.push(result.data);
      }
    } else if (inTable && !trimmed.startsWith("|")) {
      // End of table
      inTable = false;
    }
  }

  return deals;
}

function serializeDeals(deals: PipelineDeal[]): string {
  if (deals.length === 0) {
    return `${PIPELINE_HEADER}<!-- Deals listed here -->\n`;
  }
  const rows = deals.map(serializeDeal).join("\n");
  return `${PIPELINE_HEADER}${TABLE_HEADER}\n${rows}\n`;
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
  const existing = await readPipeline(dataDir, slug);

  const idx = existing.findIndex((d) => d.name === deal.name);
  let updated: PipelineDeal[];
  if (idx >= 0) {
    updated = [...existing];
    updated[idx] = deal;
  } else {
    updated = [...existing, deal];
  }

  const content = serializeDeals(updated);
  writeFileAtomic(filePath, content);
}
