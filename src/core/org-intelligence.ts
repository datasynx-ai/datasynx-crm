import { readGraph, getStakeholders, type MissingRole } from "./graph.js";
import { readHealth } from "./relationship-health.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StakeholderRole =
  | "champion"
  | "economic_buyer"
  | "blocker"
  | "influencer"
  | "user"
  | "unknown";

export interface StakeholderProfile {
  name: string;
  email?: string;
  role: StakeholderRole;
  healthScore: number;
  daysSinceContact: number;
  contactStrength: number;
  riskFlags: string[];
}

export interface StakeholderMap {
  slug: string;
  dealName?: string;
  updatedAt: string;
  people: StakeholderProfile[];
  missingRoles: MissingRole[];
  riskAssessment: string;
  recommendation: string;
}

// ─── Core functions ───────────────────────────────────────────────────────────

export function buildStakeholderMap(
  dataDir: string,
  slug: string,
  _today: string,
  dealName?: string
): StakeholderMap {
  const graph = readGraph(dataDir, slug);
  const stakeholders = getStakeholders(graph);
  const health = readHealth(dataDir, slug);

  const champIds = new Set(stakeholders.champions.map((n) => n.id));
  const buyerIds = new Set(stakeholders.economicBuyers.map((n) => n.id));
  const blockerIds = new Set(stakeholders.blockers.map((n) => n.id));

  const healthByContactId = new Map(
    (health?.contacts ?? []).map((c) => [c.contactId, c])
  );

  const personNodes = graph.nodes.filter((n) => n.type === "person");

  const people: StakeholderProfile[] = personNodes.map((node) => {
    const contactHealth = healthByContactId.get(node.id);

    let role: StakeholderRole = "unknown";
    if (champIds.has(node.id)) role = "champion";
    else if (buyerIds.has(node.id)) role = "economic_buyer";
    else if (blockerIds.has(node.id)) role = "blocker";

    const edges = graph.edges.filter((e) => e.from === node.id);
    const contactStrength =
      edges.length > 0
        ? Math.round(Math.max(...edges.map((e) => e.weight)) * 100) / 100
        : 0.5;

    const profile: StakeholderProfile = {
      name: node.label,
      role,
      healthScore: contactHealth?.score ?? 50,
      daysSinceContact: contactHealth?.daysSinceContact ?? 999,
      contactStrength,
      riskFlags: contactHealth?.riskFlags ?? [],
    };
    if (node.properties.email) {
      profile.email = node.properties.email as string;
    }
    return profile;
  });

  const riskAssessment = buildRiskAssessment(people, stakeholders.missingRoles, []);

  const recommendation = deriveRecommendation(people, stakeholders.missingRoles);

  return {
    slug,
    ...(dealName ? { dealName } : {}),
    updatedAt: new Date().toISOString(),
    people,
    missingRoles: stakeholders.missingRoles,
    riskAssessment,
    recommendation,
  };
}

export function buildRiskAssessment(
  people: Partial<StakeholderProfile>[],
  missingRoles: MissingRole[],
  _signals: unknown[]
): string {
  const risks: string[] = [];

  if (missingRoles.some((r) => r.role === "champion")) {
    risks.push("No champion identified — deal lacks an internal advocate.");
  }
  if (missingRoles.some((r) => r.role === "economic_buyer")) {
    risks.push("Economic buyer unknown — decision authority not confirmed.");
  }

  const coldPeople = people.filter((p) => p.riskFlags?.includes("NO_CONTACT_30D"));
  if (coldPeople.length > 0) {
    risks.push(
      `Cold contacts (30d+ silence): ${coldPeople.map((p) => p.name ?? "unknown").join(", ")}.`
    );
  }

  const lowHealth = people.filter((p) => (p.healthScore ?? 100) < 40);
  if (lowHealth.length > 0) {
    risks.push(
      `Low health score (<40): ${lowHealth.map((p) => p.name ?? "unknown").join(", ")}.`
    );
  }

  return risks.length > 0 ? risks.join(" ") : "No critical risks detected.";
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function deriveRecommendation(
  people: StakeholderProfile[],
  missingRoles: MissingRole[]
): string {
  const critical = missingRoles.find((r) => r.urgency === "critical");
  if (critical) return critical.suggestion;

  const coldPeople = people.filter((p) => p.riskFlags.includes("NO_CONTACT_30D"));
  if (coldPeople.length > 0) {
    return `Re-engage ${coldPeople.map((p) => p.name).join(", ")} — no contact in 30+ days.`;
  }

  const important = missingRoles.find((r) => r.urgency === "important");
  if (important) return important.suggestion;

  const avgHealth =
    people.length > 0
      ? Math.round(people.reduce((s, p) => s + p.healthScore, 0) / people.length)
      : 0;
  return `Relationship health avg ${avgHealth}/100. Maintain regular contact cadence.`;
}
