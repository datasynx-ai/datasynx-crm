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

  const invRes = await fetch(
    `https://api.stripe.com/v1/invoices?customer=${customerId}&limit=10`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
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
    content: [
      { type: "text", text: JSON.stringify({ success: true, ...context }, null, 2) },
    ],
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
