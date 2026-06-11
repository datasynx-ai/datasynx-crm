import Anthropic from "@anthropic-ai/sdk";
import { CircuitBreaker } from "./resilience.js";
import { guardLlmResponse } from "./input-guard.js";
import { maskPii, piiMaskingEnabled } from "./pii.js";
import { neutralizeUntrusted, guardrailsEnabled } from "./guardrails.js";
import { llmProvider, localLlmConfig } from "./compliance.js";

const MODEL = "claude-haiku-4-5-20251001";

let _client: Anthropic | null = null;
let llmCircuit = new CircuitBreaker({ threshold: 3, timeoutMs: 30_000, halfOpenAfter: 30_000 });

export function resetLlmCircuit(): void {
  llmCircuit = new CircuitBreaker({ threshold: 3, timeoutMs: 30_000, halfOpenAfter: 30_000 });
}

function getClient(): Anthropic | null {
  if (!process.env["ANTHROPIC_API_KEY"]) return null;
  if (!_client) _client = new Anthropic();
  return _client;
}

export interface EmailSummary {
  summary: string;
  sentiment: "positive" | "neutral" | "negative" | "urgent";
  nextSteps: string[];
}

export interface CustomerMatch {
  slug: string | null;
  confidence: "high" | "medium" | "low";
}

function emailFallback(snippet: string): EmailSummary {
  return {
    summary: snippet.slice(0, 300),
    sentiment: "neutral",
    nextSteps: [],
  };
}

export async function summarizeEmail(
  subject: string,
  snippet: string,
  from: string,
  language = "English"
): Promise<EmailSummary> {
  const client = getClient();
  if (!client) return emailFallback(snippet);

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: [
        {
          type: "text",
          text: `You are a CRM assistant. Extract structured information from email metadata.\nReturn ONLY valid JSON matching: { "summary": string (2 sentences, in ${language}), "sentiment": "positive"|"neutral"|"negative"|"urgent", "nextSteps": string[] }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Subject: ${subject}\nFrom: ${from}\nContent: ${snippet}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return emailFallback(snippet);

    try {
      const parsed = JSON.parse(textBlock.text) as {
        summary: string;
        sentiment: "positive" | "neutral" | "negative" | "urgent";
        nextSteps: string[];
      };
      return parsed;
    } catch {
      return emailFallback(snippet);
    }
  } catch {
    return emailFallback(snippet);
  }
}

export async function recognizeCustomer(
  transcriptContent: string,
  candidates: Array<{ slug: string; name: string }>
): Promise<CustomerMatch> {
  if (candidates.length === 0) return { slug: null, confidence: "low" };

  const client = getClient();
  if (!client) return { slug: null, confidence: "low" };

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 100,
      system: [
        {
          type: "text",
          text: 'You are a CRM assistant. Match a meeting transcript to the most likely customer.\nReturn ONLY valid JSON: { "slug": string|null, "confidence": "high"|"medium"|"low" }\nslug must be one of the provided candidates or null if no match.',
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Available customers: ${candidates.map((c) => `${c.slug} (${c.name})`).join(", ")}\nTranscript (first 1000 chars): ${transcriptContent.slice(0, 1000)}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return { slug: null, confidence: "low" };

    try {
      const parsed = JSON.parse(textBlock.text) as {
        slug: string | null;
        confidence: "high" | "medium" | "low";
      };
      return parsed;
    } catch {
      return { slug: null, confidence: "low" };
    }
  } catch {
    return { slug: null, confidence: "low" };
  }
}

export function resetLlmClient(): void {
  _client = null;
}

function recordCall(
  model: string,
  inputTokens: number,
  outputTokens: number,
  ctx?: { slug?: string; tool?: string }
): void {
  const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
  void import("./usage.js").then(({ recordUsage }) =>
    recordUsage(dataDir, {
      ...(ctx?.slug ? { slug: ctx.slug } : {}),
      ...(ctx?.tool ? { tool: ctx.tool } : {}),
      model,
      inputTokens,
      outputTokens,
    })
  );
}

/**
 * Local-LLM path (D17): call an OpenAI-compatible endpoint (Ollama/local) via
 * fetch — no extra dependency — so customer data can stay on-machine. Usage is
 * still recorded for cost/observability parity with the Anthropic path.
 */
async function callLocalLlm(
  masked: string,
  ctx?: { slug?: string; tool?: string }
): Promise<string> {
  const { baseUrl, model } = localLlmConfig();
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      messages: [{ role: "user", content: masked }],
    }),
  });
  if (!res.ok) throw new Error(`Local LLM error ${res.status}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("No text response from local LLM");
  if (data.usage)
    recordCall(model, data.usage.prompt_tokens ?? 0, data.usage.completion_tokens ?? 0, ctx);
  return text;
}

export async function callLlm(
  prompt: string,
  ctx?: { slug?: string; tool?: string }
): Promise<string> {
  const provider = llmProvider();
  const client = provider === "anthropic" ? getClient() : null;
  if (provider === "anthropic" && !client) throw new Error("ANTHROPIC_API_KEY not set");

  // Opt-in guardrails (neutralize prompt-injection) + PII masking, then restore.
  const guarded = guardrailsEnabled() ? neutralizeUntrusted(prompt) : prompt;
  const { masked, unmask } = piiMaskingEnabled()
    ? maskPii(guarded)
    : { masked: guarded, unmask: (t: string) => t };

  if (provider !== "anthropic") {
    return llmCircuit.call(async () => unmask(guardLlmResponse(await callLocalLlm(masked, ctx))));
  }

  return llmCircuit.call(async () => {
    const response = await client!.messages.create({
      model: MODEL,
      max_tokens: 500,
      messages: [{ role: "user", content: masked }],
    });

    // Token-cost observability (D3): record usage per customer/tool.
    const usage = response.usage;
    if (usage) recordCall(MODEL, usage.input_tokens, usage.output_tokens, ctx);

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No text response from LLM");
    return unmask(guardLlmResponse(textBlock.text));
  });
}

export type FieldMapping = Record<string, string | null>;

// Alias table: CRM field name → list of CSV column patterns (lowercased substrings)
const FIELD_ALIASES: Record<string, string[]> = {
  name: [
    "company name",
    "company",
    "organization",
    "organisation",
    "account name",
    "name",
    "firma",
  ],
  email: ["email address", "e-mail", "email", "e-mail address", "mail"],
  domain: ["company domain", "website", "domain", "url", "web", "homepage"],
  phone: ["phone number", "phone", "tel", "telephone", "mobile", "cell"],
  industry: ["industry", "sector", "branche", "vertical"],
  stage: [
    "relationship stage",
    "relationship_stage",
    "lifecycle stage",
    "lifecycle_stage",
    "lifecycle",
    "stage",
    "status",
  ],
  primary_contact: ["contact name", "contact person", "contact", "ansprechpartner", "kontakt"],
  timezone: ["timezone", "time zone", "tz"],
  // Import-specific fields
  notes: [
    "notes",
    "description",
    "body",
    "comment",
    "details",
    "note",
    "inhalt",
    "subject",
    "summary",
  ],
  date: ["activity date", "activity_date", "due date", "date", "created_at", "timestamp", "time"],
  activityType: ["activity type", "activity_type", "activitytype", "type", "category", "art"],
  sourceId: [
    "record id",
    "record_id",
    "source id",
    "source_id",
    "external id",
    "external_id",
    "activity id",
  ],
};

export function mapCsvFieldsHeuristic(headers: string[], targetFields: string[]): FieldMapping {
  const result: FieldMapping = {};
  const usedHeaders = new Set<string>();

  for (const field of targetFields) {
    const aliases = FIELD_ALIASES[field] ?? [field];
    let matched: string | null = null;

    for (const header of headers) {
      if (usedHeaders.has(header)) continue;
      const lower = header.toLowerCase();
      if (aliases.some((alias) => lower === alias || lower.includes(alias))) {
        matched = header;
        break;
      }
    }

    result[field] = matched;
    if (matched) usedHeaders.add(matched);
  }

  return result;
}

const FIELD_SEMANTICS = `CRM field semantics:
- name: Company or organization name (required)
- email: Contact email address
- domain: Company website or domain (e.g. "acme.com")
- notes: Interaction notes, description, or subject text
- date: Date of activity/interaction (ISO 8601 or YYYY-MM-DD)
- activityType: Type of interaction — Call, Email, Meeting, Note
- sourceId: Unique ID from the source system used for deduplication`;

export async function mapCsvFields(
  headers: string[],
  targetFields: string[]
): Promise<FieldMapping> {
  const client = getClient();
  if (!client) return mapCsvFieldsHeuristic(headers, targetFields);

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: [
        {
          type: "text",
          text: `You are a CRM data-import assistant. Map CSV column headers to internal CRM field names.

${FIELD_SEMANTICS}

Rules:
1. Return ONLY valid JSON: { "<crmField>": "<csvColumn>" | null, ... }
2. Every requested CRM field must appear as a key in the response.
3. Use null when no column is a reasonable match.
4. Each CSV column may only be assigned to one CRM field.
5. Only use column names that appear exactly in the provided CSV columns list.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `CSV columns: ${JSON.stringify(headers)}\nMap to CRM fields: ${JSON.stringify(targetFields)}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text")
      return mapCsvFieldsHeuristic(headers, targetFields);

    try {
      const raw = JSON.parse(
        textBlock.text
          .replace(/^```(?:json)?\n?/, "")
          .replace(/\n?```$/, "")
          .trim()
      ) as Record<string, string | null>;
      const validated: FieldMapping = {};
      const headerSet = new Set(headers);
      for (const field of targetFields) {
        const col = raw[field] ?? null;
        validated[field] = col !== null && headerSet.has(col) ? col : null;
      }
      // Require at least 'name' to be mapped; fall back otherwise
      if (!validated["name"]) return mapCsvFieldsHeuristic(headers, targetFields);
      return validated;
    } catch {
      return mapCsvFieldsHeuristic(headers, targetFields);
    }
  } catch {
    return mapCsvFieldsHeuristic(headers, targetFields);
  }
}
