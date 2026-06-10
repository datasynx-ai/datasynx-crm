import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";

const DATA_DIR = "/data";
const MASTER_KEY = "test-master-key";

const ENV_KEYS = ["DXCRM_VAULT_KEY", "STRIPE_WEBHOOK_SECRET"];
const backup: Record<string, string | undefined> = {};

beforeEach(() => {
  vol.reset();
  vol.mkdirSync(`${DATA_DIR}/.agentic`, { recursive: true });
  for (const k of ENV_KEYS) {
    backup[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (backup[k] === undefined) delete process.env[k];
    else process.env[k] = backup[k];
  }
});

async function seedVault(name: string, value: string): Promise<void> {
  const { setSecret } = await import("../../src/core/vault.js");
  setSecret(DATA_DIR, MASTER_KEY, name, value);
}

describe("resolveSecret — env → vault lookup (#72)", () => {
  it("returns the env value and never touches the vault when set", async () => {
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_env";
    process.env["DXCRM_VAULT_KEY"] = MASTER_KEY;
    await seedVault("STRIPE_WEBHOOK_SECRET", "whsec_vault");
    const { resolveSecret } = await import("../../src/core/secrets.js");
    expect(resolveSecret(DATA_DIR, "STRIPE_WEBHOOK_SECRET")).toBe("whsec_env");
  });

  it("falls back to the vault when the env var is unset", async () => {
    process.env["DXCRM_VAULT_KEY"] = MASTER_KEY;
    await seedVault("STRIPE_WEBHOOK_SECRET", "whsec_vault");
    const { resolveSecret } = await import("../../src/core/secrets.js");
    expect(resolveSecret(DATA_DIR, "STRIPE_WEBHOOK_SECRET")).toBe("whsec_vault");
  });

  it("treats an empty env value as unset", async () => {
    process.env["STRIPE_WEBHOOK_SECRET"] = "";
    process.env["DXCRM_VAULT_KEY"] = MASTER_KEY;
    await seedVault("STRIPE_WEBHOOK_SECRET", "whsec_vault");
    const { resolveSecret } = await import("../../src/core/secrets.js");
    expect(resolveSecret(DATA_DIR, "STRIPE_WEBHOOK_SECRET")).toBe("whsec_vault");
  });

  it("returns undefined without a master key, vault file, or entry", async () => {
    const { resolveSecret } = await import("../../src/core/secrets.js");
    // no DXCRM_VAULT_KEY
    expect(resolveSecret(DATA_DIR, "STRIPE_WEBHOOK_SECRET")).toBeUndefined();
    // key set but no vault file
    process.env["DXCRM_VAULT_KEY"] = MASTER_KEY;
    expect(resolveSecret(DATA_DIR, "STRIPE_WEBHOOK_SECRET")).toBeUndefined();
    // vault exists but entry missing
    await seedVault("OTHER", "x");
    expect(resolveSecret(DATA_DIR, "STRIPE_WEBHOOK_SECRET")).toBeUndefined();
  });

  it("never throws on a wrong master key (env-only behavior preserved)", async () => {
    await seedVault("STRIPE_WEBHOOK_SECRET", "whsec_vault");
    process.env["DXCRM_VAULT_KEY"] = "wrong-key";
    const { resolveSecret } = await import("../../src/core/secrets.js");
    expect(resolveSecret(DATA_DIR, "STRIPE_WEBHOOK_SECRET")).toBeUndefined();
  });
});
