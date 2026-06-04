import { piiMaskingEnabled } from "./pii.js";
import { guardrailsEnabled } from "./guardrails.js";

/**
 * Compliance hardening (domino D17 / §3): the cross-cutting governance layer.
 *  - EU-AI-Act Art. 50 transparency: a localized disclosure that AI generated
 *    the content, on by default (opt-out), wrappable around any generated text.
 *  - Provider-agnostic LLM selection so the workspace can run against a local,
 *    self-hosted model (Ollama / OpenAI-compatible) as a data-residency moat —
 *    no customer data leaves the machine. The provider runtime itself stays in
 *    the agent framework; here we only resolve and expose the configuration.
 *  - A single read-out of the active privacy/compliance posture.
 */
export type DisclosureLang = "de" | "en";

export type LlmProviderName = "anthropic" | "ollama" | "openai" | "local";

const DISCLOSURES: Record<DisclosureLang, string> = {
  de: "Hinweis: Dieser Inhalt wurde mithilfe von KI erstellt (EU-AI-Act Art. 50).",
  en: "Note: This content was generated with the help of AI (EU AI Act Art. 50).",
};

/** Localized Art. 50 disclosure string. */
export function aiDisclosure(lang: DisclosureLang = "en"): string {
  return DISCLOSURES[lang] ?? DISCLOSURES.en;
}

/** Disclosure is ON by default (Art. 50); opt out with DXCRM_AI_DISCLOSURE=off. */
export function aiDisclosureEnabled(): boolean {
  return process.env["DXCRM_AI_DISCLOSURE"] !== "off";
}

/** Prepend the Art. 50 disclosure to generated content (unless disabled). */
export function labelAiContent(
  text: string,
  opts: { lang?: DisclosureLang; enabled?: boolean } = {}
): string {
  const enabled = opts.enabled ?? aiDisclosureEnabled();
  if (!enabled) return text;
  const lang = opts.lang ?? ((process.env["DXCRM_AI_DISCLOSURE_LANG"] as DisclosureLang) || "en");
  return `${aiDisclosure(lang)}\n\n${text}`;
}

/** Resolve the configured LLM provider (default Anthropic). */
export function llmProvider(): LlmProviderName {
  const p = (process.env["DXCRM_LLM_PROVIDER"] ?? "anthropic").toLowerCase();
  if (p === "ollama" || p === "openai" || p === "local") return p;
  return "anthropic";
}

export interface LocalLlmConfig {
  baseUrl: string;
  model: string;
}

/** OpenAI-compatible local endpoint config (Ollama defaults), env-overridable. */
export function localLlmConfig(): LocalLlmConfig {
  return {
    baseUrl: process.env["DXCRM_LLM_BASE_URL"] ?? "http://127.0.0.1:11434/v1",
    model: process.env["DXCRM_LLM_MODEL"] ?? "llama3.1",
  };
}

export interface ComplianceConfig {
  provider: LlmProviderName;
  local: LocalLlmConfig | null;
  aiDisclosure: boolean;
  piiMasking: boolean;
  guardrails: boolean;
}

/** A single read-out of the active privacy/compliance posture. */
export function complianceConfig(): ComplianceConfig {
  const provider = llmProvider();
  return {
    provider,
    local: provider === "anthropic" ? null : localLlmConfig(),
    aiDisclosure: aiDisclosureEnabled(),
    piiMasking: piiMaskingEnabled(),
    guardrails: guardrailsEnabled(),
  };
}
