import fs from "fs";
import path from "path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readJsonFile, writeJsonFile } from "../fs/json-store.js";
import { createRateLimiter } from "./http-guard.js";
import { emitEvent } from "./webhooks.js";
import { logger } from "./logger.js";

/**
 * Inbound lead capture (#60): embeddable web forms POST to the HTTP server and
 * land directly in the CRM — customer + contact + first interaction +
 * `lead.captured` event (workflow-engine ready). Honeypot + per-IP rate limit
 * for spam protection; optional GDPR double-opt-in via signed confirm tokens.
 */

export interface FormDef {
  id: string;
  name: string;
  /** form field name → CRM field (name | email | company | phone | message). */
  fields: Record<string, string>;
  /** Require email confirmation before the lead is created (GDPR). */
  doubleOptIn?: boolean;
  /** Where to redirect the browser after a successful submit. */
  redirectUrl?: string;
  createdAt: string;
}

function formsDir(dataDir: string): string {
  return path.join(dataDir, ".agentic", "forms");
}
function formPath(dataDir: string, id: string): string {
  return path.join(formsDir(dataDir), `${id}.json`);
}

export function listForms(dataDir: string): FormDef[] {
  const dir = formsDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      const def = readJsonFile<FormDef | null>(path.join(dir, f), null);
      return def?.id ? [def] : [];
    });
}

export function getForm(dataDir: string, id: string): FormDef | null {
  return readJsonFile<FormDef | null>(formPath(dataDir, id), null);
}

export function createForm(
  dataDir: string,
  def: Omit<FormDef, "createdAt"> & { createdAt?: string }
): FormDef {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(def.id)) {
    throw new Error("Form id must be lowercase alphanumeric/hyphens.");
  }
  const form: FormDef = { ...def, createdAt: def.createdAt ?? new Date().toISOString() };
  writeJsonFile(formPath(dataDir, def.id), form);
  return form;
}

// ─── Spam protection ──────────────────────────────────────────────────────────

const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });

/** Sliding-window per-IP throttle. Exported reset for tests. */
export function rateLimited(ip: string, now: number = Date.now()): boolean {
  return limiter.limited(ip, now);
}
export function resetRateLimiter(): void {
  limiter.reset();
}

// ─── Double-opt-in tokens ─────────────────────────────────────────────────────

function secret(env: NodeJS.ProcessEnv = process.env): string {
  return env["DXCRM_FORMS_SECRET"] ?? "dxcrm-forms-default-secret";
}

interface ConfirmPayload {
  f: string; // form id
  d: Record<string, string>; // mapped lead data
  exp: number;
}

export function signConfirmToken(
  payload: ConfirmPayload,
  env: NodeJS.ProcessEnv = process.env
): string {
  const body = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const sig = createHmac("sha256", secret(env)).update(body).digest("hex").slice(0, 24);
  return `${body}.${sig}`;
}

export function verifyConfirmToken(
  token: string,
  now: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env
): ConfirmPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret(env)).update(body).digest("hex").slice(0, 24);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as ConfirmPayload;
    if (!parsed.f || typeof parsed.exp !== "number" || parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ─── Submission processing ────────────────────────────────────────────────────

export interface SubmissionResult {
  status: "created" | "pending_confirmation" | "spam_ignored" | "rate_limited" | "invalid";
  slug?: string;
  confirmToken?: string;
  error?: string;
}

function mapFields(form: FormDef, body: Record<string, unknown>): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [formField, crmField] of Object.entries(form.fields)) {
    const v = body[formField];
    if (typeof v === "string" && v.trim()) data[crmField] = v.trim().slice(0, 500);
  }
  return data;
}

/** Create customer + contact + interaction and emit lead.captured. */
export async function createLead(
  dataDir: string,
  formId: string,
  data: Record<string, string>
): Promise<{ slug: string }> {
  const { createCustomer } = await import("../commands/create.js");
  const { appendInteraction } = await import("../fs/interactions-writer.js");

  const name = data["company"] || data["name"] || data["email"] || "Unknown Lead";
  const created = await createCustomer({
    name,
    ...(data["email"] ? { email: data["email"], domain: data["email"].split("@")[1] } : {}),
    dataDir,
  });

  const now = new Date().toISOString();
  await appendInteraction(dataDir, created.id, {
    date: now.slice(0, 10),
    type: "Note",
    direction: "inbound",
    with: data["name"] || data["email"] || "Website visitor",
    subject: `Lead via form '${formId}'`,
    summary:
      data["message"] ||
      `Inbound lead captured via web form '${formId}' (${Object.entries(data)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")}).`,
    nextSteps: ["Qualify the lead"],
    sourceRef: `form:${formId}`,
    synced: now,
  }).catch(() => undefined);

  await emitEvent(dataDir, "lead.captured", { slug: created.id, formId, ...data }).catch(
    () => undefined
  );
  logger.info("forms", "lead captured", { formId, slug: created.id });
  return { slug: created.id };
}

export async function processFormSubmission(
  dataDir: string,
  formId: string,
  body: Record<string, unknown>,
  meta: { ip?: string } = {}
): Promise<SubmissionResult> {
  const form = getForm(dataDir, formId);
  if (!form) return { status: "invalid", error: `Form '${formId}' not found` };

  // Honeypot: bots fill every field — a non-empty `_hp` is silently dropped.
  if (typeof body["_hp"] === "string" && body["_hp"].trim() !== "") {
    return { status: "spam_ignored" };
  }
  if (meta.ip && rateLimited(meta.ip)) return { status: "rate_limited" };

  const data = mapFields(form, body);
  if (!data["email"] && !data["name"] && !data["company"]) {
    return { status: "invalid", error: "Submission contains no usable fields" };
  }
  // Minimal email sanity when present.
  if (data["email"] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data["email"])) {
    return { status: "invalid", error: "Invalid email address" };
  }

  if (form.doubleOptIn) {
    if (!data["email"]) return { status: "invalid", error: "Double-opt-in requires an email" };
    const confirmToken = signConfirmToken({
      f: formId,
      d: data,
      exp: Date.now() + 7 * 86_400_000,
    });
    logger.info("forms", "double-opt-in pending", { formId, email: data["email"] });
    return { status: "pending_confirmation", confirmToken };
  }

  const { slug } = await createLead(dataDir, formId, data);
  return { status: "created", slug };
}

/** Embeddable HTML snippet for a form. */
export function renderEmbedSnippet(form: FormDef, baseUrl: string): string {
  const inputs = Object.keys(form.fields)
    .map(
      (f) =>
        `  <label>${f}<br><input type="${f.toLowerCase().includes("email") ? "email" : "text"}" name="${f}"${f.toLowerCase().includes("email") ? " required" : ""}></label><br>`
    )
    .join("\n");
  return `<form method="POST" action="${baseUrl}/forms/${form.id}">
${inputs}
  <input type="text" name="_hp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <button type="submit">Send</button>
</form>`;
}
