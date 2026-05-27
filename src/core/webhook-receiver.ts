import crypto from "crypto";

export interface IncomingWebhookRequest {
  headers: Record<string, string>;
  rawBody: Buffer;
  body: unknown;
}

export function verifyHmacSha256(
  secret: string,
  payload: Buffer,
  signature: string
): boolean {
  if (!signature.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export function verifyStripeSignature(
  secret: string,
  rawBody: Buffer,
  stripeSignatureHeader: string
): boolean {
  const t = stripeSignatureHeader.match(/t=(\d+)/)?.[1];
  const v1 = stripeSignatureHeader.match(/v1=([a-f0-9]+)/)?.[1];
  if (!t || !v1) return false;
  const signedPayload = `${t}.${rawBody.toString()}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  try {
    const v1Buf = Buffer.from(v1);
    const expBuf = Buffer.from(expected);
    if (v1Buf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(v1Buf, expBuf);
  } catch {
    return false;
  }
}

export interface WebhookHandler {
  provider: string;
  handle(payload: unknown): Promise<void>;
}

export class WebhookQueue {
  private queue: Array<{ handler: WebhookHandler; payload: unknown }> = [];
  private processing = false;

  enqueue(handler: WebhookHandler, payload: unknown): void {
    this.queue.push({ handler, payload });
    if (!this.processing) void this.drain();
  }

  private async drain(): Promise<void> {
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        await item.handler.handle(item.payload);
      } catch (err) {
        process.stderr.write(`[webhook] ${item.handler.provider} error: ${(err as Error).message}\n`);
      }
    }
    this.processing = false;
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}

export const PROVIDER_SIGNATURE_HEADERS: Record<string, string> = {
  github: "x-hub-signature-256",
  hubspot: "x-hubspot-signature-v3",
  stripe: "stripe-signature",
  linear: "linear-signature",
};
