import fs from "fs";
import path from "path";
import { computeCustomerHealth } from "./relationship-health.js";

/**
 * Churn early-warning (domino D13 / C4): turns the per-contact relationship
 * health signals (recency, cadence, momentum, champion-silence) into an
 * account-level churn-risk read with plain-language signals, so the agent can
 * surface at-risk customers before they quietly lapse. Builds on the D5-clean
 * data and the existing relationship-health engine — no new data required.
 */
export type ChurnLevel = "low" | "medium" | "high";

export interface ChurnAssessment {
  slug: string;
  riskScore: number; // 0–100, higher = more likely to churn
  level: ChurnLevel;
  signals: string[];
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

function levelFromScore(score: number): ChurnLevel {
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

/**
 * Assess one customer's churn risk. Risk is the inverse of relationship health,
 * amplified by explicit risk flags (no-contact windows, silent champions) and
 * declining/cold trends across the customer's contacts.
 */
export function assessChurn(
  dataDir: string,
  slug: string,
  today: string = new Date().toISOString().slice(0, 10)
): ChurnAssessment {
  const health = computeCustomerHealth(dataDir, slug, today);
  const signals: string[] = [];

  // Base risk is the inverse of overall relationship health.
  let risk = 100 - health.overallHealth;

  if (health.contacts.length === 0) {
    signals.push("No logged interactions — relationship never established");
    risk = Math.max(risk, 65);
  }

  const flagged = new Set<string>();
  for (const c of health.contacts) {
    for (const f of c.riskFlags) flagged.add(f);
    if (c.trend === "cold") signals.push(`${c.name} has gone cold (${c.daysSinceContact}d silent)`);
    else if (c.trend === "declining") signals.push(`${c.name}'s engagement is declining`);
  }

  if (flagged.has("NO_CONTACT_30D")) {
    signals.push("A key contact has had no contact in 30+ days");
    risk += 15;
  } else if (flagged.has("NO_CONTACT_14D")) {
    signals.push("A key contact has had no contact in 14+ days");
    risk += 5;
  }
  if (flagged.has("CHAMPION_SILENT")) {
    signals.push("Champion has gone silent — high-leverage risk");
    risk += 20;
  }

  const riskScore = Math.max(0, Math.min(100, Math.round(risk)));
  return { slug, riskScore, level: levelFromScore(riskScore), signals };
}

/** Assess every customer and return them ranked by churn risk (highest first). */
export function scanChurn(
  dataDir: string,
  today: string = new Date().toISOString().slice(0, 10)
): ChurnAssessment[] {
  return listSlugs(dataDir)
    .map((slug) => assessChurn(dataDir, slug, today))
    .sort((a, b) => b.riskScore - a.riskScore);
}
