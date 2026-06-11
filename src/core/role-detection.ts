import type { StakeholderRole } from "./graph.js";

/**
 * Lightweight stakeholder-role detection from interaction text (#41 A5). When a
 * rep logs "CFO Thomas Berger raises budget concerns", the economic-buyer signal
 * should flow into the relationship graph instead of leaving the contact as
 * `role: unknown`. Keyword/phrase based (English + German keywords), deliberately
 * conservative — it only fires on strong signals so it never mislabels a casual mention.
 */

type DetectableRole = Exclude<StakeholderRole, "user">;

const ROLE_SIGNALS: Record<DetectableRole, RegExp[]> = {
  economic_buyer: [
    /\bCFO\b/i,
    /\bchief financial\b/i,
    /\bbudget[\s-]?(owner|holder|authority|bedenken|verantwortung)\b/i,
    /\bholds? the budget\b/i,
    /\bsigns? (the )?(contract|deal|agreement)\b/i,
    /\bfinal sign[\s-]?off\b/i,
    /\b(economic|final) decision[\s-]?maker\b/i,
    /\bprocurement (lead|owner)\b/i,
    /\b(unterschreibt|freigabe|geschäftsführer|entscheider)\b/i,
  ],
  champion: [
    /\bchampion\b/i,
    /\b(internal )?(advocate|sponsor)\b/i,
    /\bwill push (this|it)?\s*internally\b/i,
    /\b(rooting|fighting) for us\b/i,
    /\bdriving (this|the) (deal|project)\b/i,
    /\b(befürworter|treibt (das|den)|interner sponsor)\b/i,
  ],
  blocker: [
    /\bblocker\b/i,
    /\b(strongly )?against (us|this|the deal)\b/i,
    /\bwon'?t (approve|sign|budge)\b/i,
    /\b(pushing back|push[\s-]?back|detractor|opposed|resistant)\b/i,
    /\b(blockiert|lehnt .{0,20}ab|widerstand|skeptisch gegenüber)\b/i,
  ],
};

export interface RoleSignal {
  role: DetectableRole;
  signal: string;
}

/**
 * Detect stakeholder roles signalled by a piece of text. Returns one entry per
 * matched role (deduped), with the matched phrase for transparency/auditing.
 */
export function detectStakeholderRoles(text: string): RoleSignal[] {
  if (!text || !text.trim()) return [];
  const out: RoleSignal[] = [];
  for (const role of Object.keys(ROLE_SIGNALS) as DetectableRole[]) {
    for (const re of ROLE_SIGNALS[role]) {
      const m = text.match(re);
      if (m) {
        out.push({ role, signal: m[0] });
        break; // one signal per role is enough
      }
    }
  }
  return out;
}
