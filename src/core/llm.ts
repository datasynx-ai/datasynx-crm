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
