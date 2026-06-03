/**
 * Guardrails against (indirect) prompt injection in untrusted CRM content
 * (emails, transcripts, imported notes). Detection is always available;
 * neutralization is applied to LLM inputs when DXCRM_GUARDRAILS=on.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|the\s+|any\s+)?(previous|above|prior|preceding)\s+(instructions?|prompts?|messages?)/gi,
  /disregard\s+(all\s+|the\s+|any\s+)?(previous|above|prior|preceding)/gi,
  /forget\s+(all\s+|the\s+|everything\s+)?(previous|above|prior|you were told)/gi,
  /you\s+are\s+now\b/gi,
  /reveal\s+(your|the)\s+(system\s+)?(instructions?|prompt|prompts?)/gi,
  /(print|show|repeat)\s+(your|the)\s+(system\s+)?(instructions?|prompt)/gi,
  /act\s+as\s+(an?\s+)?(system|admin|administrator|developer|root)\b/gi,
  /<\/?(system|assistant|tool)\b[^>]*>/gi,
  /\bBEGIN\s+SYSTEM\b/gi,
];

export function guardrailsEnabled(): boolean {
  return process.env["DXCRM_GUARDRAILS"] === "on";
}

export function detectPromptInjection(text: string): { flagged: boolean; matches: string[] } {
  const matches: string[] = [];
  for (const re of INJECTION_PATTERNS) {
    re.lastIndex = 0;
    const found = text.match(re);
    if (found) matches.push(...found);
  }
  return { flagged: matches.length > 0, matches };
}

/** Replace known injection spans with a [filtered] marker, keeping other text. */
export function neutralizeUntrusted(text: string): string {
  let out = text;
  for (const re of INJECTION_PATTERNS) {
    out = out.replace(re, "[filtered]");
  }
  return out;
}
