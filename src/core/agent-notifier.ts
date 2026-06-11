// src/core/agent-notifier.ts
// Sends a Telegram wake notification when a new inbound email from a customer
// domain is detected and an agent config exists for that customer slug.
// All errors are swallowed — this is a notification feature and must never
// crash the core loop.

import fs from "fs";
import https from "https";
import path from "path";
import { writeJsonFile } from "../fs/json-store.js";
import { AgentConfigSchema, type AgentConfig } from "../schemas/agent-config.js";
import { summarizeEmail } from "./llm.js";
import { resolveTone, languageName } from "./tone.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WakeContext {
  trigger: "email" | "calendar";
  subject: string;
  from: string;
  snippet: string;
}

// ─── Agent config helpers ─────────────────────────────────────────────────────

function agentConfigPath(dataDir: string, slug: string): string {
  return path.join(dataDir, ".agentic", "agents", `${slug}.agent.json`);
}

function readAgentConfig(dataDir: string, slug: string): AgentConfig | null {
  const p = agentConfigPath(dataDir, slug);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8") as string) as unknown;
    const result = AgentConfigSchema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function writeLastWake(dataDir: string, slug: string, config: AgentConfig): void {
  const p = agentConfigPath(dataDir, slug);
  try {
    const updated: AgentConfig = { ...config, lastWake: new Date().toISOString() };
    writeJsonFile(p, updated);
  } catch {
    // non-fatal — just a housekeeping write
  }
}

// ─── Telegram transport ───────────────────────────────────────────────────────

function sendTelegramMessage(token: string, chatId: string, text: string): Promise<void> {
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" });
  return new Promise<void>((resolve, reject) => {
    const req = https.request(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume();
        resolve();
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── Message builder ──────────────────────────────────────────────────────────

function buildWakeMessage(
  slug: string,
  subject: string,
  summary: string,
  nextSteps: string[]
): string {
  const suggestedAction = nextSteps[0] ?? "Follow up within 24h";
  return (
    `📧 New email from **${slug}**: ${subject}\n` +
    `${summary}\n\n` +
    `💡 Suggested action: ${suggestedAction}`
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fire-and-forget notification: reads the agent config for `slug`, summarises
 * the inbound email with the LLM, and sends a Telegram message.
 *
 * Silently returns (no throw) when:
 * - no agent config exists for the slug
 * - TELEGRAM_BOT_TOKEN env var is not set
 * - no chat id is available (neither in config nor in TELEGRAM_CHAT_ID env var)
 * - any HTTPS / LLM error occurs
 */
export async function notifyAgentWake(
  dataDir: string,
  slug: string,
  context: WakeContext
): Promise<void> {
  try {
    // 1. Read agent config — bail silently if not found
    const config = readAgentConfig(dataDir, slug);
    if (!config) return;

    // 2. Check for Telegram token — bail silently if absent
    const token = process.env["TELEGRAM_BOT_TOKEN"];
    if (!token) return;

    // 3. Determine chat id — config takes precedence, fallback to env var
    const chatId = config.telegramChatId ?? process.env["TELEGRAM_CHAT_ID"];
    if (!chatId) return;

    // 4. Summarise the email (LLM, with fallback built into summarizeEmail itself).
    // Summary language follows the operator's configured tone (default English).
    const summaryLang = languageName(resolveTone(dataDir).language);
    const emailSummary = await summarizeEmail(
      context.subject,
      context.snippet,
      context.from,
      summaryLang
    );

    // 5. Build and send the Telegram message
    const text = buildWakeMessage(
      slug,
      context.subject,
      emailSummary.summary,
      emailSummary.nextSteps
    );
    await sendTelegramMessage(token, chatId, text);

    // 6. Update lastWake on success
    writeLastWake(dataDir, slug, config);
  } catch {
    // Swallow all errors — this is a notification feature, never crashes core loop
  }
}
