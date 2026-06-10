import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  vol.fromJSON({ "/data/.agentic/.keep": "" });
});

const EMPTY_ENV = {} as NodeJS.ProcessEnv;

async function run(opts: {
  live?: boolean;
  fetchFn?: unknown;
  env?: NodeJS.ProcessEnv;
}): Promise<Array<{ provider: string; status: string; detail: string }>> {
  const { runIntegrationChecks } = await import("../../src/core/doctor-integrations.js");
  return runIntegrationChecks("/data", opts as never);
}

function byProvider(
  checks: Array<{ provider: string; status: string; detail: string }>,
  provider: string
): { provider: string; status: string; detail: string } {
  const c = checks.find((x) => x.provider === provider);
  if (!c) throw new Error(`missing check for ${provider}: ${JSON.stringify(checks)}`);
  return c;
}

describe("runIntegrationChecks (#64) — config states", () => {
  it("reports everything 'off' on a pristine data dir", async () => {
    const checks = await run({ env: EMPTY_ENV });
    for (const p of [
      "public-url",
      "microsoft-graph",
      "google",
      "whatsapp",
      "stripe",
      "slack",
      "telegram",
    ]) {
      expect(byProvider(checks, p).status).toBe("off");
    }
  });

  it("flags partially-configured WhatsApp as warn with the missing vars", async () => {
    const checks = await run({
      env: { WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_ID: "p" } as NodeJS.ProcessEnv,
    });
    const wa = byProvider(checks, "whatsapp");
    expect(wa.status).toBe("warn");
    expect(wa.detail).toContain("WHATSAPP_APP_SECRET");
    expect(wa.detail).toContain("WHATSAPP_VERIFY_TOKEN");
  });

  it("reports fully-configured WhatsApp as ok", async () => {
    const checks = await run({
      env: {
        WHATSAPP_TOKEN: "t",
        WHATSAPP_PHONE_ID: "p",
        WHATSAPP_APP_SECRET: "s",
        WHATSAPP_VERIFY_TOKEN: "v",
      } as NodeJS.ProcessEnv,
    });
    expect(byProvider(checks, "whatsapp").status).toBe("ok");
  });

  it("warns for a Stripe key without the webhook secret", async () => {
    const checks = await run({ env: { STRIPE_API_KEY: "sk_test_x" } as NodeJS.ProcessEnv });
    const stripe = byProvider(checks, "stripe");
    expect(stripe.status).toBe("warn");
    expect(stripe.detail).toContain("STRIPE_WEBHOOK_SECRET");
  });

  it("warns for a Microsoft token without MS_GRAPH_CLIENT_STATE", async () => {
    vol.fromJSON({
      "/data/.agentic/microsoft-token.json": JSON.stringify({ accessToken: "ms" }),
    });
    const checks = await run({ env: EMPTY_ENV });
    const ms = byProvider(checks, "microsoft-graph");
    expect(ms.status).toBe("warn");
    expect(ms.detail).toContain("MS_GRAPH_CLIENT_STATE");
  });

  it("reports Microsoft ok when token + clientState exist", async () => {
    vol.fromJSON({
      "/data/.agentic/microsoft-token.json": JSON.stringify({ accessToken: "ms" }),
    });
    const checks = await run({ env: { MS_GRAPH_CLIENT_STATE: "cs" } as NodeJS.ProcessEnv });
    expect(byProvider(checks, "microsoft-graph").status).toBe("ok");
  });

  it("reports the public URL when set", async () => {
    const checks = await run({
      env: { DXCRM_PUBLIC_URL: "https://crm.example.com" } as NodeJS.ProcessEnv,
    });
    const pub = byProvider(checks, "public-url");
    expect(pub.status).toBe("ok");
    expect(pub.detail).toContain("https://crm.example.com");
  });

  it("warns about expired/failed push subscriptions", async () => {
    const { register, writeSubscriptions, readSubscriptions } =
      await import("../../src/sync/push-manager.js");
    await register("/data", "microsoft-graph", "*", {
      webhookUrl: "https://x/webhooks/microsoft",
      expiresAt: new Date(Date.now() - 3_600_000).toISOString(), // already expired
    });
    const subs = await readSubscriptions("/data");
    subs[0] = { ...subs[0]!, status: "permanently_failed" };
    await writeSubscriptions("/data", subs);

    const checks = await run({ env: EMPTY_ENV });
    const push = byProvider(checks, "push-subscriptions");
    expect(push.status).toBe("warn");
    expect(push.detail).toContain("permanently_failed");
  });
});

describe("runIntegrationChecks (#64) — live probes", () => {
  it("probes Graph /me and reports ok on 200", async () => {
    vol.fromJSON({
      "/data/.agentic/microsoft-token.json": JSON.stringify({ accessToken: "ms" }),
    });
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const checks = await run({
      live: true,
      fetchFn,
      env: { MS_GRAPH_CLIENT_STATE: "cs" } as NodeJS.ProcessEnv,
    });
    expect(byProvider(checks, "microsoft-graph").status).toBe("ok");
    expect(fetchFn).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/me",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer ms" }),
      })
    );
  });

  it("downgrades to warn when the live probe fails", async () => {
    vol.fromJSON({
      "/data/.agentic/microsoft-token.json": JSON.stringify({ accessToken: "expired" }),
    });
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const checks = await run({
      live: true,
      fetchFn,
      env: { MS_GRAPH_CLIENT_STATE: "cs" } as NodeJS.ProcessEnv,
    });
    const ms = byProvider(checks, "microsoft-graph");
    expect(ms.status).toBe("warn");
    expect(ms.detail).toContain("401");
  });

  it("probes WhatsApp's phone endpoint with the token", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const checks = await run({
      live: true,
      fetchFn,
      env: {
        WHATSAPP_TOKEN: "t",
        WHATSAPP_PHONE_ID: "12345",
        WHATSAPP_APP_SECRET: "s",
        WHATSAPP_VERIFY_TOKEN: "v",
      } as NodeJS.ProcessEnv,
    });
    expect(byProvider(checks, "whatsapp").status).toBe("ok");
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("graph.facebook.com"),
      expect.anything()
    );
  });

  it("does not probe providers that are off", async () => {
    const fetchFn = vi.fn();
    await run({ live: true, fetchFn, env: EMPTY_ENV });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("runDoctorIntegrations CLI (#64)", () => {
  it("prints per-provider lines and exits 1 on warnings", async () => {
    vol.fromJSON({
      "/data/.agentic/microsoft-token.json": JSON.stringify({ accessToken: "ms" }),
    });
    vi.spyOn(process, "cwd").mockReturnValue("/data");
    const before = process.exitCode;
    process.exitCode = 0;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { runDoctorIntegrations } = await import("../../src/commands/doctor.js");
    // microsoft token without MS_GRAPH_CLIENT_STATE → warn → exit 1
    const hadClientState = process.env["MS_GRAPH_CLIENT_STATE"];
    delete process.env["MS_GRAPH_CLIENT_STATE"];
    await runDoctorIntegrations({});
    if (hadClientState !== undefined) process.env["MS_GRAPH_CLIENT_STATE"] = hadClientState;

    const out = logSpy.mock.calls.flat().join("\n");
    expect(out).toContain("microsoft-graph");
    expect(out).toContain("need attention");
    expect(process.exitCode).toBe(1);
    process.exitCode = before ?? 0;
    logSpy.mockRestore();
  });
});

describe("vault-backed secrets (#72)", () => {
  it("turns checks green from vault entries when env vars are absent", async () => {
    const { setSecret } = await import("../../src/core/vault.js");
    for (const [k, v] of [
      ["WHATSAPP_TOKEN", "t"],
      ["WHATSAPP_PHONE_ID", "p"],
      ["WHATSAPP_APP_SECRET", "s"],
      ["WHATSAPP_VERIFY_TOKEN", "v"],
    ] as const) {
      setSecret("/data", "master-key", k, v);
    }
    const { runIntegrationChecks } = await import("../../src/core/doctor-integrations.js");
    const checks = await runIntegrationChecks("/data", {
      env: { DXCRM_VAULT_KEY: "master-key" } as NodeJS.ProcessEnv,
    });
    const wa = checks.find((c) => c.provider === "whatsapp");
    expect(wa?.status).toBe("ok");
  });
});
