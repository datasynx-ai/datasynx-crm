import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
});

const DATA_DIR = "/crm";
const KEY = "master-pass-phrase";

describe("vault", () => {
  it("round-trips a secret and lists keys", async () => {
    const { setSecret, getSecret, listSecretKeys } = await import("../../src/core/vault.js");
    setSecret(DATA_DIR, KEY, "stripe_api_key", "sk_live_123");
    setSecret(DATA_DIR, KEY, "acme/portal_pw", "hunter2");
    expect(getSecret(DATA_DIR, KEY, "stripe_api_key")).toBe("sk_live_123");
    expect(listSecretKeys(DATA_DIR, KEY).sort()).toEqual(["acme/portal_pw", "stripe_api_key"]);
  });

  it("stores the vault encrypted (plaintext not on disk)", async () => {
    const { setSecret } = await import("../../src/core/vault.js");
    setSecret(DATA_DIR, KEY, "token", "super-secret-value");
    const raw = vol.readFileSync("/crm/.agentic/vault.enc", "utf-8") as string;
    expect(raw).not.toContain("super-secret-value");
  });

  it("fails to decrypt with the wrong master key (clear error)", async () => {
    const { setSecret, getSecret } = await import("../../src/core/vault.js");
    setSecret(DATA_DIR, KEY, "token", "x");
    expect(() => getSecret(DATA_DIR, "wrong-key", "token")).toThrow(/wrong master key/i);
  });

  it("removes a secret", async () => {
    const { setSecret, removeSecret, listSecretKeys } = await import("../../src/core/vault.js");
    setSecret(DATA_DIR, KEY, "a", "1");
    expect(removeSecret(DATA_DIR, KEY, "a")).toBe(true);
    expect(listSecretKeys(DATA_DIR, KEY)).toEqual([]);
  });
});
