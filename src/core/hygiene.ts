import fs from "fs";
import path from "path";
import { readMainFacts } from "../fs/customer-dir.js";
import { findDuplicateClusters, normalizeDomain } from "./identity.js";

/**
 * Data-hygiene agent (domino D5 / C5): scans customers for quality issues
 * (missing contact info, malformed fields, duplicates) and suggests fixes.
 * Fixes are meant to be applied through the approval gate (D4) — clean data
 * lifts the quality of every downstream AI feature.
 */
export type HygieneIssueType = "missing_contact" | "format_domain" | "format_email" | "duplicate";

export interface HygieneIssue {
  type: HygieneIssueType;
  slug: string;
  field?: string;
  detail: string;
  suggestedFix?: string;
}

function listSlugs(dataDir: string): string[] {
  const dir = path.join(dataDir, "customers");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((s) => {
    try {
      return fs.statSync(path.join(dir, s)).isDirectory();
    } catch {
      return false;
    }
  });
}

export async function scanHygiene(dataDir: string): Promise<HygieneIssue[]> {
  const issues: HygieneIssue[] = [];

  for (const slug of listSlugs(dataDir)) {
    const facts = await readMainFacts(dataDir, slug).catch(() => null);
    if (!facts) continue;

    if (!facts.domain && !facts.email) {
      issues.push({ type: "missing_contact", slug, detail: "No domain or email" });
    }
    if (facts.domain && /^https?:\/\/|^www\./i.test(facts.domain)) {
      issues.push({
        type: "format_domain",
        slug,
        field: "domain",
        detail: `Domain not normalized: ${facts.domain}`,
        suggestedFix: normalizeDomain(facts.domain),
      });
    }
    if (facts.email && !facts.email.includes("@")) {
      issues.push({
        type: "format_email",
        slug,
        field: "email",
        detail: `Email missing '@': ${facts.email}`,
      });
    }
  }

  // Duplicate clusters (reuse identity resolution)
  for (const cluster of await findDuplicateClusters(dataDir)) {
    for (const slug of cluster.slugs) {
      issues.push({
        type: "duplicate",
        slug,
        detail: `Shares canonical domain '${cluster.key}' with: ${cluster.slugs
          .filter((s) => s !== slug)
          .join(", ")}`,
      });
    }
  }

  return issues;
}
