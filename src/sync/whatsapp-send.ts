import { logger } from "../core/logger.js";

/**
 * WhatsApp Cloud API text sender (#67). Unlike a bare `fetch`, this treats
 * non-ok responses as failures (an invalid token must not look like a
 * delivered reply) and retries only *transient* errors — network failures,
 * 429 and 5xx — with a short backoff. Auth/validation errors (other 4xx)
 * fail fast so the caller's failure path (recorded-but-undelivered warning)
 * fires immediately.
 */

export interface SendWhatsAppOptions {
  token: string;
  phoneId: string;
  to: string;
  text: string;
  /** Total attempts including the first one. */
  maxAttempts?: number;
  retryDelayMs?: number;
  fetchFn?: typeof fetch;
}

function transient(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function sendWhatsAppText(opts: SendWhatsAppOptions): Promise<void> {
  const fetchFn = opts.fetchFn ?? fetch;
  const maxAttempts = opts.maxAttempts ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? 1000;

  let lastError: Error = new Error("unreachable");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchFn(`https://graph.facebook.com/v21.0/${opts.phoneId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.token}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: opts.to,
          type: "text",
          text: { body: opts.text },
        }),
      });
      if (res.ok) return;
      const detail = await res.text().catch(() => "");
      lastError = new Error(
        `WhatsApp send failed: ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`
      );
      if (!transient(res.status)) throw lastError;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Non-transient HTTP errors were thrown above on purpose — re-throw.
      const m = lastError.message.match(/WhatsApp send failed: (\d+)/);
      if (m && !transient(Number(m[1]))) throw lastError;
    }
    if (attempt < maxAttempts) {
      logger.warn("whatsapp", "send attempt failed — retrying", {
        attempt,
        maxAttempts,
        error: lastError.message,
      });
      await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
    }
  }
  throw lastError;
}
