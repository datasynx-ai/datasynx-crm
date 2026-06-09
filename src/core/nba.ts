import { readPipeline } from "../fs/pipeline-writer.js";
import { readInteractions } from "../fs/interactions-writer.js";
import { scoreOpportunity } from "./opportunity-score.js";
import type { PipelineDeal } from "../schemas/pipeline.js";

/**
 * Next-Best-Action engine (domino D11 / C3): from a customer's open pipeline +
 * engagement recency, recommend prioritized next steps with rationale. Builds
 * on opportunity scoring; actions are meant to run through the D4 approval gate.
 */
export type Priority = "high" | "medium" | "low";

export interface NbaAction {
  action: string;
  reason: string;
  priority: Priority;
  deal?: string;
}

const STAGE_ACTION: Record<PipelineDeal["stage"], string> = {
  lead: "Qualify the lead and book a discovery call",
  qualified: "Send a tailored proposal",
  proposal: "Follow up on the open proposal",
  negotiation: "Address objections and push to close",
  won: "Kick off onboarding",
  lost: "Run a loss post-mortem",
};

const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export async function nextBestAction(dataDir: string, slug: string): Promise<NbaAction[]> {
  const actions: NbaAction[] = [];

  const deals = await readPipeline(dataDir, slug).catch(() => [] as PipelineDeal[]);
  const open = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  for (const d of open) {
    const { score } = scoreOpportunity(d);
    const priority: Priority = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
    actions.push({
      action: STAGE_ACTION[d.stage] ?? `Advance deal '${d.name}' (stage: ${d.stage})`,
      reason: `Deal '${d.name}' is in ${d.stage} (win-likelihood ${score})`,
      priority,
      deal: d.name,
    });
  }

  const interactions = await readInteractions(dataDir, slug).catch(() => "");
  if (!/## \d{4}-\d{2}-\d{2}/.test(interactions)) {
    actions.push({
      action: "Re-engage — no logged interactions yet",
      reason: "No interaction history for this customer",
      priority: "medium",
    });
  }

  if (open.length === 0 && deals.length === 0) {
    actions.push({
      action: "Create an opportunity",
      reason: "No pipeline deals exist for this customer",
      priority: "low",
    });
  }

  return actions.sort((a, b) => RANK[a.priority] - RANK[b.priority]);
}
