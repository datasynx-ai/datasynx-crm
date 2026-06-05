import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { escapeRegExp } from "./regex.js";

const MAX_INTERACTIONS = 10;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function parseRecentInteractions(filePath: string, limit: number): string {
  if (!fs.existsSync(filePath)) return "";
  const content = fs.readFileSync(filePath, "utf-8") as string;

  // Split on ## date headings
  const entries = content.split(/(?=^## \d{4}-\d{2}-\d{2})/m).filter((e) => e.trim());
  const recent = entries.slice(0, limit);
  return recent.join("\n").trim();
}

function parsePipelineContent(filePath: string): string {
  if (!fs.existsSync(filePath)) return "";
  const content = fs.readFileSync(filePath, "utf-8") as string;
  return content.trim();
}

function extractSection(content: string, sectionName: string): string {
  const regex = new RegExp(`## ${escapeRegExp(sectionName)}([\\s\\S]*?)(?=^## |$)`, "m");
  const match = regex.exec(content);
  return match ? (match[1] ?? "").trim() : "";
}

/**
 * Retrieval-augmented section: when a `focus` query is supplied, pull the most
 * relevant entries from the indexed hybrid store (LanceDB BM25 + vector) so the
 * context surfaces pertinent *older* history that falls outside the last-N
 * recent window. Best-effort: returns "" if nothing is indexed or search fails.
 */
async function buildRetrievedSection(
  dataDir: string,
  slug: string,
  focus: string
): Promise<string> {
  try {
    const { searchKnowledge } = await import("./lancedb.js");
    const hits = await searchKnowledge(dataDir, slug, focus, 3);
    if (hits.length === 0) return "";
    return hits
      .map((h) => {
        const snippet = h.content.slice(0, 500).trim();
        const ellipsis = h.content.length > 500 ? "…" : "";
        return `- ${snippet}${ellipsis} _(${h.source})_`;
      })
      .join("\n");
  } catch {
    return "";
  }
}

export async function buildContext(dataDir: string, slug: string, focus?: string): Promise<string> {
  const customerDir = path.join(dataDir, "customers", slug);

  if (!fs.existsSync(customerDir)) {
    throw new Error(`Customer '${slug}' not found`);
  }

  const mainFactsPath = path.join(customerDir, "main_facts.md");
  const interactionsPath = path.join(customerDir, "interactions.md");
  const pipelinePath = path.join(customerDir, "pipeline.md");

  // Read main_facts.md
  let mainContent = "";
  let frontmatterStr = "";
  if (fs.existsSync(mainFactsPath)) {
    const fileContent = fs.readFileSync(mainFactsPath, "utf-8") as string;
    const raw = matter(fileContent);
    mainContent = raw.content ?? "";
    frontmatterStr = Object.entries(raw.data as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join("\n");
  }

  const quickRef = extractSection(mainContent, "Quick Reference");
  const contacts = extractSection(mainContent, "Contacts");
  const criticalContext = extractSection(mainContent, "Critical Context");
  const openQuestions = extractSection(mainContent, "Open Questions");
  const pipelineContent = parsePipelineContent(pipelinePath);

  const retrieved = focus ? await buildRetrievedSection(dataDir, slug, focus) : "";

  const assemble = (interactionLimit: number): string => {
    const trimmed = interactionLimit < MAX_INTERACTIONS;
    const recentActivity = parseRecentInteractions(interactionsPath, interactionLimit);
    return [
      `# Customer Context: ${slug}`,
      "",
      "## Metadata",
      frontmatterStr || "(no metadata)",
      "",
      "## Quick Reference",
      quickRef || "(not set)",
      "",
      "## Contacts",
      contacts || "(not set)",
      "",
      "## Critical Context",
      criticalContext || "(not set)",
      "",
      `## Recent Activity (last ${interactionLimit} interactions${
        trimmed ? " — trimmed for token budget" : ""
      })`,
      recentActivity || "(no interactions yet)",
      "",
      ...(retrieved ? [`## Relevant History (retrieved for "${focus}")`, retrieved, ""] : []),
      "## Pipeline",
      pipelineContent || "(no deals)",
      "",
      "## Open Questions",
      openQuestions || "(none)",
    ].join("\n");
  };

  const raw = assemble(MAX_INTERACTIONS);

  // If over 3000 tokens, trim interactions to the most recent 5.
  if (estimateTokens(raw) > 3000) {
    return assemble(5);
  }

  return raw;
}

/** Robust section-body extractor: from a `## Name` heading to the next `## ` heading. */
function sectionBody(content: string, name: string): string {
  const lines = content.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${name}`);
  if (start < 0) return "";
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith("## ")) break;
    body.push(lines[i]!);
  }
  return body.join("\n").trim();
}

export interface ContextBlock {
  slug: string;
  metadata: Record<string, unknown>;
  quickReference: string;
  contacts: string;
  criticalContext: string;
  openQuestions: string;
  recentActivity: string;
  pipeline: string;
}

/**
 * Structured variant of buildContext (REF-2): returns a typed object instead of
 * a markdown string, for callers that need fields programmatically (e.g. MCP
 * responses, SDK consumers). buildContext remains the token-budgeted string form.
 */
export async function buildContextBlock(
  dataDir: string,
  slug: string,
  role?: "admin" | "manager" | "rep"
): Promise<ContextBlock> {
  const customerDir = path.join(dataDir, "customers", slug);
  if (!fs.existsSync(customerDir)) {
    throw new Error(`Customer '${slug}' not found`);
  }

  const mainFactsPath = path.join(customerDir, "main_facts.md");
  const interactionsPath = path.join(customerDir, "interactions.md");
  const pipelinePath = path.join(customerDir, "pipeline.md");

  let mainContent = "";
  let metadata: Record<string, unknown> = {};
  if (fs.existsSync(mainFactsPath)) {
    const raw = matter(fs.readFileSync(mainFactsPath, "utf-8") as string);
    mainContent = raw.content ?? "";
    metadata = raw.data as Record<string, unknown>;
  }

  // Field-level security: redact metadata fields the role may not see.
  if (role) {
    const { loadFieldAcl, redactFields } = await import("./rbac.js");
    metadata = redactFields(metadata, role, loadFieldAcl(dataDir));
  }

  return {
    slug,
    metadata,
    quickReference: sectionBody(mainContent, "Quick Reference"),
    contacts: sectionBody(mainContent, "Contacts"),
    criticalContext: sectionBody(mainContent, "Critical Context"),
    openQuestions: sectionBody(mainContent, "Open Questions"),
    recentActivity: parseRecentInteractions(interactionsPath, MAX_INTERACTIONS),
    pipeline: parsePipelineContent(pipelinePath),
  };
}
