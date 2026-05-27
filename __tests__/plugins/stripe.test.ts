import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const STRIPE_TOKEN = "sk_test_123";

const CUSTOMER_SEARCH_FOUND = {
  data: [{ id: "cus_abc123" }],
};
const CUSTOMER_SEARCH_EMPTY = { data: [] };

const SUBSCRIPTION_RESPONSE = {
  data: [{ id: "sub_xyz", status: "active", plan: { amount: 4900 } }],
};
const SUBSCRIPTION_EMPTY = { data: [] };

const INVOICES_RESPONSE = {
  data: [
    { id: "inv_1", amount_paid: 9800, status: "paid", created: 1716480000 },
    { id: "inv_2", amount_paid: 4900, status: "paid", created: 1713888000 },
  ],
};

function jsonRes(data: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(data) };
}

describe("fetchStripeCustomerByEmail", () => {
  it("returns StripeContext when customer is found", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(CUSTOMER_SEARCH_FOUND))
      .mockResolvedValueOnce(jsonRes(SUBSCRIPTION_RESPONSE))
      .mockResolvedValueOnce(jsonRes(INVOICES_RESPONSE));

    const { fetchStripeCustomerByEmail } = await import("../../src/plugins/stripe.js");
    const ctx = await fetchStripeCustomerByEmail(STRIPE_TOKEN, "alice@example.com");

    expect(ctx.customerId).toBe("cus_abc123");
    expect(ctx.subscriptionId).toBe("sub_xyz");
    expect(ctx.subscriptionStatus).toBe("active");
    expect(ctx.invoices).toHaveLength(2);
  });

  it("returns empty invoices array when no customer found", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(CUSTOMER_SEARCH_EMPTY));
    const { fetchStripeCustomerByEmail } = await import("../../src/plugins/stripe.js");
    const ctx = await fetchStripeCustomerByEmail(STRIPE_TOKEN, "unknown@example.com");
    expect(ctx.invoices).toEqual([]);
    expect(ctx.customerId).toBeUndefined();
  });

  it("returns empty context on API error", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({}, false));
    const { fetchStripeCustomerByEmail } = await import("../../src/plugins/stripe.js");
    const ctx = await fetchStripeCustomerByEmail(STRIPE_TOKEN, "error@example.com");
    expect(ctx.invoices).toEqual([]);
  });

  it("calculates MRR from plan.amount / 100", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(CUSTOMER_SEARCH_FOUND))
      .mockResolvedValueOnce(jsonRes(SUBSCRIPTION_RESPONSE))
      .mockResolvedValueOnce(jsonRes(INVOICES_RESPONSE));

    const { fetchStripeCustomerByEmail } = await import("../../src/plugins/stripe.js");
    const ctx = await fetchStripeCustomerByEmail(STRIPE_TOKEN, "alice@example.com");
    expect(ctx.mrr).toBe(49); // 4900 / 100
  });

  it("sums totalRevenue from all invoices", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(CUSTOMER_SEARCH_FOUND))
      .mockResolvedValueOnce(jsonRes(SUBSCRIPTION_RESPONSE))
      .mockResolvedValueOnce(jsonRes(INVOICES_RESPONSE));

    const { fetchStripeCustomerByEmail } = await import("../../src/plugins/stripe.js");
    const ctx = await fetchStripeCustomerByEmail(STRIPE_TOKEN, "alice@example.com");
    // (9800 + 4900) / 100 = 147
    expect(ctx.totalRevenue).toBe(147);
  });
});

describe("handleGetStripeContext", () => {
  it("returns success response with email provided", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes(CUSTOMER_SEARCH_FOUND))
      .mockResolvedValueOnce(jsonRes(SUBSCRIPTION_EMPTY))
      .mockResolvedValueOnce(jsonRes({ data: [] }));

    const { handleGetStripeContext } = await import("../../src/plugins/stripe.js");
    const result = await handleGetStripeContext(
      { slug: "acme-corp", email: "alice@example.com" },
      "/data",
      STRIPE_TOKEN
    );
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      success: boolean;
    };
    expect(parsed.success).toBe(true);
  });

  it("returns error when no email found", async () => {
    vi.mock("../../src/fs/customer-dir.js", () => ({
      readMainFacts: vi.fn().mockRejectedValue(new Error("not found")),
    }));

    const { handleGetStripeContext } = await import("../../src/plugins/stripe.js");
    const result = await handleGetStripeContext(
      { slug: "acme-corp" },
      "/data",
      STRIPE_TOKEN
    );
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text) as {
      success: boolean;
      error: string;
    };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("email");
  });
});

describe("createStripePlugin", () => {
  it("returns a valid DxcrmPlugin", async () => {
    const { createStripePlugin } = await import("../../src/plugins/stripe.js");
    const plugin = createStripePlugin(STRIPE_TOKEN);
    expect(plugin.name).toBe("stripe");
    expect(plugin.version).toBeDefined();
    expect(plugin.description).toBeDefined();
  });
});
