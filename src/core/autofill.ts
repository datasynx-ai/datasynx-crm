/**
 * Call/Meeting → CRM autofill (domino D9 / C1): extract structured fields from a
 * transcript so they can be written to the CRM (through the D4 approval gate).
 * Uses the LLM when available, with a deterministic heuristic fallback so it
 * always returns something useful and is testable offline.
 */
export type StageName = "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost";

export interface AutofillResult {
  summary: string;
  nextSteps: string[];
  objections: string[];
  stage?: StageName;
}

const NEXT_STEP_RE = /^(?:-?\s*\[ \]|next step|todo|follow.?up|action item)\b[:\-\s]*/i;
const OBJECTION_RE = /\b(concern|worried|too expensive|expensive|hesitant|however|push back)\b/i;

function detectStage(text: string): StageName | undefined {
  const t = text.toLowerCase();
  if (t.includes("closed won") || t.includes("signed")) return "won";
  if (t.includes("closed lost") || t.includes("lost the deal")) return "lost";
  if (t.includes("negotiat")) return "negotiation";
  if (t.includes("proposal") || t.includes("quote")) return "proposal";
  if (t.includes("qualif")) return "qualified";
  return undefined;
}

export function heuristicExtract(transcript: string): AutofillResult {
  const lines = transcript
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const nextSteps = lines
    .filter((l) => NEXT_STEP_RE.test(l))
    .map((l) => l.replace(NEXT_STEP_RE, "").trim())
    .filter(Boolean)
    .slice(0, 10);

  const objections = lines.filter((l) => OBJECTION_RE.test(l)).slice(0, 10);

  const base = { summary: transcript.slice(0, 400), nextSteps, objections };
  const stage = detectStage(transcript);
  return stage === undefined ? base : { ...base, stage };
}

export async function extractAutofill(
  transcript: string,
  ctx?: { slug?: string }
): Promise<AutofillResult> {
  try {
    const { callLlm } = await import("./llm.js");
    const prompt =
      `Extract CRM fields from this meeting transcript. Return ONLY JSON: ` +
      `{ "summary": string, "nextSteps": string[], "objections": string[], ` +
      `"stage": "lead"|"qualified"|"proposal"|"negotiation"|"won"|"lost"|null }.\n\n${transcript}`;
    const raw = await callLlm(prompt, {
      tool: "autofill",
      ...(ctx?.slug ? { slug: ctx.slug } : {}),
    });
    const parsed = JSON.parse(raw) as Partial<AutofillResult> & { stage?: string | null };
    const base = {
      summary: parsed.summary ?? transcript.slice(0, 400),
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
      objections: Array.isArray(parsed.objections) ? parsed.objections : [],
    };
    return parsed.stage ? { ...base, stage: parsed.stage as StageName } : base;
  } catch {
    return heuristicExtract(transcript);
  }
}
