import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type { GraphNode, GraphEdge, EdgeType, CustomerGraph } from "./graph.js";
import { writeGraph, upsertNode, upsertEdge, setNodeRole } from "./graph.js";
import { normalizeEmail } from "./email-normalizer.js";
import { detectStakeholderRoles } from "./role-detection.js";

export interface ExtractionInput {
  slug: string;
  withStr: string;
  interactionDate: string;
  domain?: string;
  companyName?: string;
}

export function extractEmail(withStr: string): string | undefined {
  const angleMatch = withStr.match(/<([^>]+@[^>]+)>/);
  if (angleMatch?.[1]) return angleMatch[1].toLowerCase();
  const bareMatch = withStr.match(/^([^\s]+@[^\s]+)$/);
  if (bareMatch?.[1]) return bareMatch[1].toLowerCase();
  return undefined;
}

export function extractDisplayName(withStr: string): string {
  const match = withStr.match(/^(.+?)\s*<[^>]+>$/);
  if (match?.[1]) return match[1].trim();
  return withStr.trim();
}

export function makePersonId(withStr: string, slug: string): string {
  const email = normalizeEmail(withStr);
  if (email.includes("@")) return `person:${email}`;
  const name = extractDisplayName(withStr);
  const nameSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `person:${slug}:${nameSlug}`;
}

export function makeCompanyId(domain?: string, slug?: string, companyName?: string): string {
  if (domain) return `company:${domain.toLowerCase()}`;
  if (slug) return `company:${slug}`;
  if (companyName) {
    const s = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `company:${s}`;
  }
  return `company:unknown`;
}

export function extractNodes(input: ExtractionInput): Omit<GraphNode, "createdAt" | "updatedAt">[] {
  const email = extractEmail(input.withStr);
  const label = extractDisplayName(input.withStr);
  const personId = makePersonId(input.withStr, input.slug);

  const personProps: GraphNode["properties"] = {};
  if (email !== undefined) personProps["email"] = email;
  if (input.companyName !== undefined) personProps["company"] = input.companyName;
  if (input.domain !== undefined) personProps["domain"] = input.domain;

  const personNode: Omit<GraphNode, "createdAt" | "updatedAt"> = {
    id: personId,
    type: "person",
    label,
    properties: personProps,
  };

  const nodes: Omit<GraphNode, "createdAt" | "updatedAt">[] = [personNode];

  if (input.domain !== undefined || input.companyName !== undefined) {
    const companyId = makeCompanyId(input.domain, input.slug, input.companyName);
    const companyProps: GraphNode["properties"] = {};
    if (input.domain !== undefined) companyProps["domain"] = input.domain;

    const companyNode: Omit<GraphNode, "createdAt" | "updatedAt"> = {
      id: companyId,
      type: "company",
      label: input.companyName ?? input.domain ?? input.slug,
      properties: companyProps,
    };
    nodes.push(companyNode);
  }

  return nodes;
}

export function extractEdges(
  personId: string,
  companyId: string | undefined,
  interactionDate: string
): GraphEdge[] {
  if (!companyId) return [];
  return [
    {
      id: `WORKS_AT:${personId}__${companyId}`,
      from: personId,
      to: companyId,
      type: "WORKS_AT" as EdgeType,
      weight: 0.5,
      sentiment: 0,
      lastContact: interactionDate,
      contactCount: 1,
      properties: {},
    },
  ];
}

export async function updateGraphFromInteraction(
  dataDir: string,
  slug: string,
  input: { withStr: string; interactionDate: string; text?: string }
): Promise<void> {
  if (!input.withStr.trim()) return;

  // Auto-detect stakeholder roles from the interaction text (#41 A5) so a
  // contact described as e.g. "CFO … budget concerns" is tagged economic_buyer
  // instead of staying role: unknown.
  const detectedRoles = input.text ? detectStakeholderRoles(input.text) : [];

  let domain: string | undefined;
  let companyName: string | undefined;
  const factsPath = path.join(dataDir, "customers", slug, "main_facts.md");
  if (fs.existsSync(factsPath)) {
    try {
      const parsed = matter(fs.readFileSync(factsPath, "utf-8"));
      domain = parsed.data["domain"] as string | undefined;
      companyName = parsed.data["name"] as string | undefined;
    } catch {
      // non-critical
    }
  }

  const extractionInput: ExtractionInput = {
    slug,
    withStr: input.withStr,
    interactionDate: input.interactionDate,
  };
  if (domain !== undefined) extractionInput.domain = domain;
  if (companyName !== undefined) extractionInput.companyName = companyName;
  const nodes = extractNodes(extractionInput);

  const personId = makePersonId(input.withStr, slug);
  const companyId =
    domain !== undefined || companyName !== undefined
      ? makeCompanyId(domain, slug, companyName)
      : undefined;
  const edges = extractEdges(personId, companyId, input.interactionDate);

  await writeGraph(dataDir, slug, (current) => {
    const empty: CustomerGraph = {
      schemaVersion: "1",
      slug,
      nodes: [],
      edges: [],
      updatedAt: new Date().toISOString(),
    };
    let graph = current ?? empty;
    for (const node of nodes) graph = upsertNode(graph, node);
    for (const edge of edges) graph = upsertEdge(graph, edge);
    // Attribute detected roles to the person who was on this interaction.
    const roleTarget = companyId ?? personId;
    for (const { role } of detectedRoles) {
      graph = setNodeRole(graph, personId, roleTarget, role);
    }
    return graph;
  });
}
