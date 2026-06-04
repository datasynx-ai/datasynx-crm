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

export async function buildContext(dataDir: string, slug: string): Promise<string> {
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

  const recentActivity = parseRecentInteractions(interactionsPath, MAX_INTERACTIONS);
  const pipelineContent = parsePipelineContent(pipelinePath);

  const sections: string[] = [
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
    "## Recent Activity (last 10 interactions)",
    recentActivity || "(no interactions yet)",
    "",
    "## Pipeline",
    pipelineContent || "(no deals)",
    "",
    "## Open Questions",
    openQuestions || "(none)",
  ];

  const raw = sections.join("\n");
  const tokenEstimate = estimateTokens(raw);

  // If over 3000 tokens, trim interactions
  if (tokenEstimate > 3000) {
    const trimmedActivity = parseRecentInteractions(interactionsPath, 5);
    const trimmedSections: string[] = [
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
      "## Recent Activity (last 5 interactions — trimmed for token budget)",
      trimmedActivity || "(no interactions yet)",
      "",
      "## Pipeline",
      pipelineContent || "(no deals)",
      "",
      "## Open Questions",
      openQuestions || "(none)",
    ];
    return trimmedSections.join("\n");
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
