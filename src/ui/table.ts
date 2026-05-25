import Table from "cli-table3";
import type { MainFacts } from "../schemas/main-facts.js";
import type { PipelineDeal } from "../schemas/pipeline.js";

export interface CustomerRow {
  slug: string;
  facts: MainFacts;
  lastTouchpoint?: string;
}

export function renderCustomerTable(customers: CustomerRow[]): string {
  const table = new Table({
    head: ["Slug", "Name", "Stage", "Industry", "Tags", "Updated"],
    style: { head: ["cyan"] },
    colWidths: [20, 25, 15, 15, 20, 12],
    wordWrap: true,
  });

  for (const { slug, facts } of customers) {
    table.push([
      slug,
      facts.name,
      facts.relationship_stage,
      facts.industry ?? "—",
      facts.tags.join(", ") || "—",
      facts.updated,
    ]);
  }

  return table.toString();
}

export function renderPipelineTable(deals: PipelineDeal[]): string {
  const table = new Table({
    head: ["Name", "Stage", "Value", "Prob%", "Close Date", "Updated"],
    style: { head: ["cyan"] },
    colWidths: [30, 15, 12, 8, 12, 12],
    wordWrap: true,
  });

  for (const deal of deals) {
    const valueStr =
      deal.value !== undefined
        ? `${deal.value.toLocaleString()} ${deal.currency}`
        : "—";
    const probStr = deal.probability !== undefined ? `${deal.probability}%` : "—";
    table.push([
      deal.name,
      deal.stage,
      valueStr,
      probStr,
      deal.close_date ?? "—",
      deal.updated,
    ]);
  }

  return table.toString();
}
