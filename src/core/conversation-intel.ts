/**
 * Conversation-Intelligence-Lite (domino D16 / C7): deterministic, offline call
 * analytics over a speaker-labelled transcript — talk-ratio, discovery-question
 * count, objection detection and longest monologue — plus rule-based coaching
 * tips. Reuses the D9 objection heuristic. The heavy lifting (ASR, diarization,
 * realtime) lives in the agent/voice framework, not in this package; here we
 * turn an existing transcript into structured, actionable signal.
 */
const OBJECTION_RE =
  /\b(concern|worried|too expensive|expensive|hesitant|however|push back|budget)\b/i;
const DEFAULT_REP_LABELS = ["rep", "sales", "ae", "me", "agent"];

export interface Turn {
  speaker: string;
  text: string;
  words: number;
  isRep: boolean;
}

export interface ConversationAnalysis {
  turns: number;
  talkRatio: number; // rep words / total words (0–1)
  questionsAsked: number; // questions asked by the rep
  longestMonologue: number; // words in the rep's longest single turn
  objections: string[];
  coaching: string[];
}

const TURN_RE = /^([A-Za-z][\w .'-]{0,40}):\s*(.*)$/;

/** Parse "Speaker: text" lines into turns; lines without a label are ignored. */
export function parseTurns(transcript: string, repLabels: string[] = DEFAULT_REP_LABELS): Turn[] {
  const reps = repLabels.map((r) => r.toLowerCase());
  const turns: Turn[] = [];
  for (const raw of transcript.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(TURN_RE);
    if (!m) continue;
    const speaker = m[1]!.trim();
    const text = m[2]!.trim();
    const isRep = reps.some((r) => speaker.toLowerCase().includes(r));
    turns.push({ speaker, text, words: text.split(/\s+/).filter(Boolean).length, isRep });
  }
  return turns;
}

function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

export function analyzeConversation(
  transcript: string,
  repLabels: string[] = DEFAULT_REP_LABELS
): ConversationAnalysis {
  const turns = parseTurns(transcript, repLabels);

  const repWords = turns.filter((t) => t.isRep).reduce((s, t) => s + t.words, 0);
  const totalWords = turns.reduce((s, t) => s + t.words, 0);
  const talkRatio = totalWords > 0 ? repWords / totalWords : 0;
  const questionsAsked = turns
    .filter((t) => t.isRep)
    .reduce((s, t) => s + countQuestions(t.text), 0);
  const longestMonologue = turns.filter((t) => t.isRep).reduce((m, t) => Math.max(m, t.words), 0);

  // Objections: scan the whole transcript so unlabeled text still yields signal.
  const objections = transcript
    .split(/[\n.]/)
    .map((s) => s.trim())
    .filter((s) => s && OBJECTION_RE.test(s))
    .slice(0, 10);

  const coaching: string[] = [];
  if (turns.length > 0) {
    if (talkRatio > 0.65)
      coaching.push(
        "Talk ratio is high — listen more and ask open questions to draw the customer out."
      );
    if (talkRatio < 0.35 && repWords > 0)
      coaching.push(
        "You spoke very little — make sure you're steering the conversation and confirming next steps."
      );
    if (questionsAsked < 2)
      coaching.push("Few discovery questions — ask more to uncover needs and budget.");
    if (longestMonologue > 40)
      coaching.push(
        "Long monologue detected — break value pitches into shorter, interactive chunks."
      );
  }
  if (objections.length > 0)
    coaching.push(`Address ${objections.length} surfaced objection(s) explicitly before closing.`);
  if (coaching.length === 0) coaching.push("Balanced conversation — keep confirming next steps.");

  return {
    turns: turns.length,
    talkRatio: Math.round(talkRatio * 100) / 100,
    questionsAsked,
    longestMonologue,
    objections,
    coaching,
  };
}
