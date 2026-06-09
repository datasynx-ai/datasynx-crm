import { createHmac, timingSafeEqual } from "node:crypto";
import type { DxcrmPlugin } from "../core/plugin-registry.js";

export interface StripeContext {
  customerId?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  mrr?: number;
  totalRevenue?: number;
  invoices: Array<{ id: string; amount: number; status: string; date: string }>;
}

export async function fetchStripeCustomerByEmail(
  token: string,
  email: string
): Promise<StripeContext> {
  const searchRes = await fetch(
    `https://api.stripe.com/v1/customers/search?query=email:"${email}"&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!searchRes.ok) return { invoices: [] };

  const searchData = (await searchRes.json()) as { data: Array<{ id: string }> };
  if (!searchData.data.length) return { invoices: [] };

  const customerId = searchData.data[0]!.id;

  const subRes = await fetch(
    `https://api.stripe.com/v1/subscriptions?customer=${customerId}&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const subData = (await subRes.json()) as {
    data: Array<{ id: string; status: string; plan?: { amount?: number } }>;
  };
  const sub = subData.data[0];

  const invRes = await fetch(`https://api.stripe.com/v1/invoices?customer=${customerId}&limit=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const invData = (await invRes.json()) as {
    data: Array<{ id: string; amount_paid: number; status: string; created: number }>;
  };

  const invoices = invData.data.map((inv) => ({
    id: inv.id,
    amount: inv.amount_paid / 100,
    status: inv.status,
    date: new Date(inv.created * 1000).toISOString().slice(0, 10),
  }));

  return {
    customerId,
    ...(sub?.id !== undefined ? { subscriptionId: sub.id } : {}),
    ...(sub?.status !== undefined ? { subscriptionStatus: sub.status } : {}),
    ...(sub?.plan?.amount ? { mrr: sub.plan.amount / 100 } : {}),
    totalRevenue: invoices.reduce((sum, inv) => sum + inv.amount, 0),
    invoices,
  };
}

export async function handleGetStripeContext(
  input: { slug: string; email?: string },
  dataDir: string,
  stripeToken: string
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  let email = input.email;
  if (!email) {
    try {
      const { readMainFacts } = await import("../fs/customer-dir.js");
      const facts = await readMainFacts(dataDir, input.slug);
      email = (facts as Record<string, unknown>)["email"] as string | undefined;
    } catch {
      // no facts found
    }
  }
  if (!email) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: false, error: "No email found for customer" }),
        },
      ],
    };
  }
  const context = await fetchStripeCustomerByEmail(stripeToken, email);
  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, ...context }, null, 2) }],
  };
}

export function createStripePlugin(stripeToken: string): DxcrmPlugin {
  void stripeToken; // stored in closure for actual usage
  return {
    name: "stripe",
    version: "1.0.0",
    description: "Stripe subscription and revenue context for CRM customers",
    mcpTools: ["get_stripe_context"],
  };
}

/**
 * Create a Stripe payment link for a quote total (#49). Creates an ad-hoc
 * price + payment link via the REST API; the quote number rides along as
 * metadata so the webhook can map the payment back to the quote.
 * Returns the hosted payment URL, or null when Stripe is unreachable.
 */
export async function createStripePaymentLink(
  token: string,
  opts: { amount: number; currency: string; quoteNumber: string; description: string }
): Promise<string | null> {
  try {
    const form = (o: Record<string, string>) =>
      Object.entries(o)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

    const priceRes = await fetch("https://api.stripe.com/v1/prices", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form({
        unit_amount: String(Math.round(opts.amount * 100)),
        currency: opts.currency.toLowerCase(),
        "product_data[name]": opts.description,
      }),
    });
    if (!priceRes.ok) return null;
    const price = (await priceRes.json()) as { id: string };

    const linkRes = await fetch("https://api.stripe.com/v1/payment_links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form({
        "line_items[0][price]": price.id,
        "line_items[0][quantity]": "1",
        "metadata[quoteNumber]": opts.quoteNumber,
      }),
    });
    if (!linkRes.ok) return null;
    const link = (await linkRes.json()) as { url: string };
    return link.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Verify a Stripe webhook signature (Stripe-Signature header: `t=...,v1=...`).
 * Implements Stripe's scheme: HMAC-SHA256 over `${t}.${rawBody}` with the
 * webhook secret, timing-safe compare, and a tolerance window on `t`.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  webhookSecret: string,
  toleranceSeconds = 300,
  nowMs: number = Date.now()
): boolean {
  if (!signatureHeader) return false;
  const parts = new Map(
    signatureHeader.split(",").map((p) => {
      const eq = p.indexOf("=");
      return [p.slice(0, eq).trim(), p.slice(eq + 1).trim()] as const;
    })
  );
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) return false;
  const ts = parseInt(t, 10);
  if (isNaN(ts) || Math.abs(nowMs / 1000 - ts) > toleranceSeconds) return false;

  const expected = createHmac("sha256", webhookSecret).update(`${t}.${rawBody}`).digest("hex");
  if (expected.length !== v1.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}
