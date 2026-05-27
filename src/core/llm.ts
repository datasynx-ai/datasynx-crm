import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";

let _client: Anthropic | null = null;

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
  from: string
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
          text: 'You are a CRM assistant. Extract structured information from email metadata.\nReturn ONLY valid JSON matching: { "summary": string (2 sentences, German), "sentiment": "positive"|"neutral"|"negative"|"urgent", "nextSteps": string[] }',
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
    if (!textBlock || textBlock.type !== "text")
      return { slug: null, confidence: "low" };

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

export async function callLlm(prompt: string): Promise<string> {
  const client = getClient();
  if (!client) throw new Error("ANTHROPIC_API_KEY not set");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from LLM");
  return textBlock.text;
}

export type FieldMapping = Record<string, string | null>;

// Alias table: CRM field name → list of CSV column patterns (lowercased substrings)
const FIELD_ALIASES: Record<string, string[]> = {
  name: ["company name", "company", "organization", "organisation", "account name", "name", "firma"],
  email: ["email address", "e-mail", "email", "e-mail address", "mail"],
  domain: ["company domain", "website", "domain", "url", "web", "homepage"],
  phone: ["phone number", "phone", "tel", "telephone", "mobile", "cell"],
  industry: ["industry", "sector", "branche", "vertical"],
  primary_contact: ["contact name", "contact person", "contact", "ansprechpartner", "kontakt"],
  timezone: ["timezone", "time zone", "tz"],
};

export function mapCsvFieldsHeuristic(
  headers: string[],
  targetFields: string[]
): FieldMapping {
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

export async function mapCsvFields(
  headers: string[],
  targetFields: string[],
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
          text: `You are a CRM data mapping assistant. Map CSV column headers to CRM field names.
Return ONLY valid JSON: { "<crmField>": "<csvColumn>" | null, ... }
Use null when no column matches. Each CSV column may only be used once.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `CSV columns: ${JSON.stringify(headers)}\nCRM fields to map: ${JSON.stringify(targetFields)}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return mapCsvFieldsHeuristic(headers, targetFields);

    try {
      return JSON.parse(textBlock.text) as FieldMapping;
    } catch {
      return mapCsvFieldsHeuristic(headers, targetFields);
    }
  } catch {
    return mapCsvFieldsHeuristic(headers, targetFields);
  }
}
