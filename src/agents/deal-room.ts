import { buildStakeholderMap, type StakeholderMap } from "../core/org-intelligence.js";
import { readHealth } from "../core/relationship-health.js";
import { readPipeline } from "../fs/pipeline-writer.js";
import { scoreDealForToday } from "../core/deal-health.js";
import {
  buildSimulationInput,
  runSimulation,
  type SimulationResult,
} from "../core/revenue-simulation.js";
import { listPlaybooks, matchPlaybooks, type PlaybookMatch } from "../core/playbooks.js";
import type { DealHealthScore } from "../core/deal-health.js";
import type { ContactHealth } from "../core/relationship-health.js";
import type { MissingRole } from "../core/graph.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DealHealthEntry {
  deal: string;
  stage: string;
  score: number;
  grade: string;
  warnings: string[];
}

export interface DealRoomBrief {
  slug: string;
  dealName: string;
  generatedAt: string;
  stakeholders: StakeholderMap;
  relationshipHealth: ContactHealth[];
  dealHealth: DealHealthEntry[];
  revenueSimulation: Pick<SimulationResult, "p50" | "p10" | "p90" | "expected" | "atRiskRevenue">;
  recommendedPlaybook: PlaybookMatch | null;
  executiveSummary: string;
  topPriorities: string[];
  riskScore: number;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function buildDealRoom(
  dataDir: string,
  slug: string,
  dealName: string,
  today: string
): Promise<DealRoomBrief> {
  // Parallel data collection
  const [pipelineDeals, simInput] = await Promise.all([
    readPipeline(dataDir, slug).catch(() => []),
    buildSimulationInput(dataDir, "quarter", today).catch(() => ({
      deals: [],
      externalSignals: [],
      iterations: 1000,
      horizon: "quarter" as const,
      today,
    })),
  ]);

  // Sync reads (fast FS reads)
  const stakeholders = buildStakeholderMap(dataDir, slug, today, dealName);
  const health = readHealth(dataDir, slug);
  const simResult = runSimulation({ ...simInput, iterations: 1000 });

  // Deal health scores
  const todayDate = new Date(today);
  const dealHealth: DealHealthEntry[] = pipelineDeals
    .filter((d) => d.stage !== "won" && d.stage !== "lost")
    .map((deal) => {
      const scored: DealHealthScore = scoreDealForToday(deal, todayDate);
      return {
        deal: deal.name,
        stage: deal.stage,
        score: scored.score,
        grade: scored.grade,
        warnings: scored.warnings,
      };
    });

  // Playbook matching — use the first active deal as context
  const firstActiveDeal = pipelineDeals.find((d) => d.stage !== "won" && d.stage !== "lost");
  let recommendedPlaybook: PlaybookMatch | null = null;
  if (firstActiveDeal) {
    // Prefer champion's contact health for accurate daysSinceContact signal
    const championEmail = stakeholders.people.find((p) => p.role === "champion")?.email;
    const champContact = championEmail
      ? health?.contacts.find(
          (c) => c.email === championEmail || c.contactId === `person:${championEmail}`
        )
      : undefined;
    const contactHealth = champContact ?? health?.contacts?.[0];
    const daysSinceContact = contactHealth?.daysSinceContact ?? 999;
    const dealSnapshot = {
      slug,
      name: firstActiveDeal.name,
      stage: firstActiveDeal.stage,
      value: firstActiveDeal.value ?? 0,
      probability: firstActiveDeal.probability ?? 50,
      healthScore: health?.overallHealth ?? 50,
      daysSinceContact,
      championPresent: stakeholders.people.some((p) => p.role === "champion"),
    };
    const matches = matchPlaybooks(listPlaybooks(dataDir, slug), dealSnapshot, daysSinceContact);
    recommendedPlaybook = matches[0] ?? null;
  }

  const riskScore = computeRiskScore(
    stakeholders.missingRoles,
    dealHealth,
    health?.overallHealth ?? 100
  );
  const topPriorities = buildTopPriorities(stakeholders, dealHealth);
  const executiveSummary = buildExecutiveSummary(
    slug,
    dealName,
    stakeholders,
    health?.overallHealth ?? 100,
    simResult,
    riskScore
  );

  return {
    slug,
    dealName,
    generatedAt: new Date().toISOString(),
    stakeholders,
    relationshipHealth: health?.contacts ?? [],
    dealHealth,
    revenueSimulation: {
      p50: simResult.p50,
      p10: simResult.p10,
      p90: simResult.p90,
      expected: simResult.expected,
      atRiskRevenue: simResult.atRiskRevenue,
    },
    recommendedPlaybook,
    executiveSummary,
    topPriorities,
    riskScore,
  };
}

// ─── Synthesis helpers ────────────────────────────────────────────────────────

function computeRiskScore(
  missingRoles: MissingRole[],
  dealHealth: DealHealthEntry[],
  overallHealth: number
): number {
  let risk = 0;

  for (const mr of missingRoles) {
    risk += mr.urgency === "critical" ? 25 : 10;
  }

  const avgDealScore =
    dealHealth.length > 0 ? dealHealth.reduce((s, d) => s + d.score, 0) / dealHealth.length : 100;
  risk += Math.round((100 - avgDealScore) * 0.3);

  risk += Math.round((100 - overallHealth) * 0.2);

  return Math.min(100, Math.max(0, risk));
}

function buildTopPriorities(stakeholders: StakeholderMap, dealHealth: DealHealthEntry[]): string[] {
  const priorities: string[] = [];

  for (const mr of stakeholders.missingRoles) {
    if (mr.urgency === "critical") priorities.push(mr.suggestion);
  }

  const coldPeople = stakeholders.people.filter((p) => p.riskFlags.includes("NO_CONTACT_30D"));
  if (coldPeople.length > 0) {
    priorities.push(`Re-engage ${coldPeople.map((p) => p.name).join(", ")} — silent 30+ days.`);
  }

  const atRiskDeals = dealHealth.filter((d) => d.score < 50);
  const showCount = Math.min(3, atRiskDeals.length);
  for (const d of atRiskDeals.slice(0, showCount)) {
    priorities.push(
      `Rescue deal "${d.deal}" (health ${d.score}/100): ${d.warnings[0] ?? "at risk"}`
    );
  }
  if (atRiskDeals.length > showCount) {
    priorities.push(`+${atRiskDeals.length - showCount} more at-risk deal(s) need attention.`);
  }

  for (const mr of stakeholders.missingRoles) {
    if (mr.urgency === "important") priorities.push(mr.suggestion);
  }

  if (priorities.length === 0) {
    priorities.push("Maintain current momentum — schedule next check-in.");
  }

  return priorities;
}

function buildExecutiveSummary(
  slug: string,
  dealName: string,
  stakeholders: StakeholderMap,
  overallHealth: number,
  sim: Pick<SimulationResult, "p50" | "atRiskRevenue">,
  riskScore: number
): string {
  const champCount = stakeholders.people.filter((p) => p.role === "champion").length;
  const missingCritical = stakeholders.missingRoles.filter((r) => r.urgency === "critical").length;

  const parts: string[] = [];
  parts.push(
    `${slug}/${dealName}: relationship health ${overallHealth}/100, ${champCount} champion(s) identified.`
  );
  if (sim.p50 > 0) {
    parts.push(`Pipeline P50 forecast: €${(sim.p50 / 1000).toFixed(1)}k.`);
  }
  if (missingCritical > 0) {
    parts.push(
      `Critical gaps: ${missingCritical} key role(s) unidentified — risk score ${riskScore}/100.`
    );
  } else {
    parts.push(`Overall risk score: ${riskScore}/100.`);
  }
  return parts.join(" ");
}
