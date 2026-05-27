import fs from "fs";
import path from "path";
import { readGraph } from "./graph.js";
import { extractEmail, extractDisplayName, makePersonId } from "./graph-extractor.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type HealthGrade = "A" | "B" | "C" | "D" | "F";

export type HealthTrend = "rising" | "stable" | "declining" | "cold";

export type RiskFlag =
  | "NO_CONTACT_14D"
  | "NO_CONTACT_30D"
  | "SENTIMENT_DECLINING"
  | "CHAMPION_SILENT"
  | "DEAL_STALLED"
  | "CLOSE_DATE_PASSED"
  | "CONTACT_LEFT_COMPANY"
  | "RESPONSE_LATENCY_INCREASING";

export interface ContactHealth {
  contactId: string;
  name: string;
  email?: string;
  score: number;
  grade: HealthGrade;
  trend: HealthTrend;
  daysSinceContact: number;
  avgCadenceDays: number;
  sentimentTrend: number;
  riskFlags: RiskFlag[];
  lastContact: string;
  interactionCount30d: number;
  recommendation: string;
  updatedAt: string;
}

export interface HealthSnapshot {
  schemaVersion: "1";
  slug: string;
  contacts: ContactHealth[];
  overallHealth: number;
  updatedAt: string;
}

// ─── Parsed interaction (from interactions.md) ────────────────────────────────

export interface ParsedInteraction {
  date: string;
  type: string;
  withStr: string;
}

export interface ContactInteractionGroup {
  contactId: string;
  name: string;
  email?: string;
  interactions: ParsedInteraction[];
}

// ─── File path ────────────────────────────────────────────────────────────────

export function healthPath(dataDir: string, slug: string): string {
  return path.join(dataDir, "customers", slug, "health.json");
}

// ─── Read / Write ─────────────────────────────────────────────────────────────

export function readHealth(dataDir: string, slug: string): HealthSnapshot | null {
  const p = healthPath(dataDir, slug);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as HealthSnapshot;
  } catch {
    return null;
  }
}

export function writeHealth(dataDir: string, slug: string, health: HealthSnapshot): void {
  const p = healthPath(dataDir, slug);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const updated: HealthSnapshot = { ...health, updatedAt: new Date().toISOString() };
  fs.writeFileSync(p, JSON.stringify(updated, null, 2), "utf-8");
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

export function parseContactInteractions(content: string): ParsedInteraction[] {
  const blocks = content
    .split(/(?=^## \d{4}-\d{2}-\d{2})/m)
    .filter((b) => b.trim().length > 0);

  const result: ParsedInteraction[] = [];
  for (const block of blocks) {
    const headingMatch = block.match(/^## (\d{4}-\d{2}-\d{2}) · (\w+)/m);
    if (!headingMatch) continue;
    const date = headingMatch[1]!;
    const type = headingMatch[2]!;

    const withMatch = block.match(/^\*\*(?:With|Subject):\*\*\s*(.+)$/m);
    if (!withMatch) continue;
    const withStr = withMatch[1]!.trim();

    result.push({ date, type, withStr });
  }
  return result;
}

// ─── Score functions (pure) ───────────────────────────────────────────────────

export function calcRecencyScore(daysSince: number): number {
  if (daysSince <= 0) return 100;
  if (daysSince >= 30) return 0;
  return Math.round(100 * (1 - daysSince / 30));
}

export function calcCadenceScore(daysSince: number, avgCadenceDays: number): number {
  if (avgCadenceDays <= 0) return 50;
  const ratio = daysSince / avgCadenceDays;
  if (ratio <= 1.0) return 100;
  if (ratio >= 3.0) return 0;
  return Math.round(100 * (1 - (ratio - 1.0) / 2.0));
}

export function calcMomentumScore(last30d: number, prev30d: number): number {
  if (last30d === 0 && prev30d === 0) return 50;
  if (prev30d === 0) return 80;
  const ratio = last30d / prev30d;
  if (ratio >= 1.5) return 100;
  if (ratio >= 1.0) return 75;
  if (ratio >= 0.5) return 50;
  if (ratio >= 0.25) return 25;
  return 0;
}

export function gradeFromScore(score: number): HealthGrade {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  if (score >= 20) return "D";
  return "F";
}

export function trendFromState(
  score: number,
  daysSince: number,
  avgCadenceDays: number,
  momentumScore: number
): HealthTrend {
  if (score < 20 || daysSince >= 30) return "cold";
  if (momentumScore > 70 && score > 60) return "rising";
  if (momentumScore < 30 || (daysSince > avgCadenceDays * 1.5 && score < 60)) return "declining";
  return "stable";
}

export function calcRiskFlags(
  _contactId: string,
  daysSince: number,
  score: number,
  isChampion: boolean
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (daysSince >= 30) flags.push("NO_CONTACT_30D");
  if (daysSince >= 14) flags.push("NO_CONTACT_14D");
  if (isChampion && score < 50) flags.push("CHAMPION_SILENT");
  return flags;
}

export function generateRecommendation(
  name: string,
  grade: HealthGrade,
  trend: HealthTrend,
  riskFlags: RiskFlag[],
  daysSince: number,
  avgCadenceDays: number
): string {
  if (riskFlags.includes("NO_CONTACT_30D")) {
    return `Re-engage ${name} urgently — no contact in ${daysSince} days.`;
  }
  if (riskFlags.includes("CHAMPION_SILENT")) {
    return `Champion ${name} has gone quiet — critical to re-engage before deal stalls.`;
  }
  if (riskFlags.includes("NO_CONTACT_14D")) {
    return `Schedule contact with ${name} — ${daysSince} days since last touchpoint.`;
  }
  if (trend === "declining") {
    return `${name} relationship declining — increase touchpoint frequency.`;
  }
  if (grade === "A") {
    return `${name} — strong relationship. Keep current cadence.`;
  }
  const daysUntilDue = Math.max(0, avgCadenceDays - daysSince);
  return `${name} — grade ${grade}. Next contact due in ~${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}.`;
}

// ─── Average cadence ──────────────────────────────────────────────────────────

export function calcAvgCadence(interactions: ParsedInteraction[]): number {
  if (interactions.length < 2) return 0;
  const sorted = [...interactions].sort((a, b) => b.date.localeCompare(a.date));
  let totalDays = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = Math.floor(
      (new Date(sorted[i]!.date).getTime() - new Date(sorted[i + 1]!.date).getTime()) /
        86_400_000
    );
    totalDays += gap;
  }
  return Math.round(totalDays / (sorted.length - 1));
}

// ─── Group interactions by contact ───────────────────────────────────────────

export function groupInteractionsByContact(
  interactions: ParsedInteraction[],
  slug: string
): ContactInteractionGroup[] {
  const map = new Map<
    string,
    { contactId: string; name: string; email?: string; interactions: ParsedInteraction[] }
  >();

  for (const ix of interactions) {
    const email = extractEmail(ix.withStr);
    const name = extractDisplayName(ix.withStr);
    const contactId = makePersonId(ix.withStr, slug);

    if (!map.has(contactId)) {
      const entry: { contactId: string; name: string; email?: string; interactions: ParsedInteraction[] } = {
        contactId,
        name,
        interactions: [],
      };
      if (email !== undefined) entry.email = email;
      map.set(contactId, entry);
    }
    map.get(contactId)!.interactions.push(ix);
  }

  return Array.from(map.values());
}

// ─── Per-contact health ───────────────────────────────────────────────────────

export function computeContactHealth(
  group: ContactInteractionGroup,
  today: string,
  isChampion: boolean
): ContactHealth {
  const sorted = [...group.interactions].sort((a, b) => b.date.localeCompare(a.date));
  const lastContact = sorted[0]?.date ?? "";

  const daysSince = lastContact
    ? Math.floor(
        (new Date(today).getTime() - new Date(lastContact).getTime()) / 86_400_000
      )
    : 999;

  const avgCadenceDays = calcAvgCadence(group.interactions);

  const todayMs = new Date(today).getTime();
  const d30 = todayMs - 30 * 86_400_000;
  const d60 = todayMs - 60 * 86_400_000;
  const last30d = group.interactions.filter((i) => new Date(i.date).getTime() >= d30).length;
  const prev30d = group.interactions.filter(
    (i) => new Date(i.date).getTime() >= d60 && new Date(i.date).getTime() < d30
  ).length;

  const recency = calcRecencyScore(daysSince);
  const cadence = calcCadenceScore(daysSince, avgCadenceDays);
  const sentiment = 50;
  const response = 50;
  const momentum = calcMomentumScore(last30d, prev30d);

  const score = Math.round(
    recency * 0.35 + cadence * 0.25 + sentiment * 0.2 + response * 0.1 + momentum * 0.1
  );

  const grade = gradeFromScore(score);
  const trend = trendFromState(score, daysSince, avgCadenceDays, momentum);
  const riskFlags = calcRiskFlags(group.contactId, daysSince, score, isChampion);
  const recommendation = generateRecommendation(
    group.name,
    grade,
    trend,
    riskFlags,
    daysSince,
    avgCadenceDays
  );

  const health: ContactHealth = {
    contactId: group.contactId,
    name: group.name,
    score,
    grade,
    trend,
    daysSinceContact: daysSince,
    avgCadenceDays,
    sentimentTrend: 0,
    riskFlags,
    lastContact,
    interactionCount30d: last30d,
    recommendation,
    updatedAt: new Date().toISOString(),
  };
  if (group.email !== undefined) health.email = group.email;
  return health;
}

// ─── Full customer health ─────────────────────────────────────────────────────

export function computeCustomerHealth(
  dataDir: string,
  slug: string,
  today: string = new Date().toISOString().slice(0, 10)
): HealthSnapshot {
  const interactionsPath = path.join(dataDir, "customers", slug, "interactions.md");
  const content = fs.existsSync(interactionsPath)
    ? (fs.readFileSync(interactionsPath, "utf-8") as string)
    : "";

  const parsed = parseContactInteractions(content);
  const groups = groupInteractionsByContact(parsed, slug);

  const graph = readGraph(dataDir, slug);
  const championIds = new Set(
    graph.edges.filter((e) => e.type === "IS_CHAMPION").map((e) => e.from)
  );

  const contacts = groups.map((group) =>
    computeContactHealth(group, today, championIds.has(group.contactId))
  );

  const overallHealth =
    contacts.length === 0
      ? 100
      : Math.round(contacts.reduce((sum, c) => sum + c.score, 0) / contacts.length);

  return {
    schemaVersion: "1",
    slug,
    contacts,
    overallHealth,
    updatedAt: new Date().toISOString(),
  };
}

// ─── Fire-and-forget update ───────────────────────────────────────────────────

export async function updateHealthFromInteraction(
  dataDir: string,
  slug: string
): Promise<void> {
  const health = computeCustomerHealth(dataDir, slug);
  writeHealth(dataDir, slug, health);
}
