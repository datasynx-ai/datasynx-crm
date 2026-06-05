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

describe("vault-session", () => {
  it("mints a token that verifies before it expires", async () => {
    const { createVaultSession, verifyVaultSession } =
      await import("../../src/core/vault-session.js");
    const { token } = createVaultSession(DATA_DIR);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);
    expect(verifyVaultSession(DATA_DIR, token)).toBe(true);
  });

  it("rejects an unknown token", async () => {
    const { createVaultSession, verifyVaultSession } =
      await import("../../src/core/vault-session.js");
    createVaultSession(DATA_DIR);
    expect(verifyVaultSession(DATA_DIR, "not-a-real-token")).toBe(false);
  });

  it("rejects an empty/undefined token", async () => {
    const { verifyVaultSession } = await import("../../src/core/vault-session.js");
    expect(verifyVaultSession(DATA_DIR, "")).toBe(false);
    expect(verifyVaultSession(DATA_DIR, undefined as unknown as string)).toBe(false);
  });

  it("rejects a token after it has expired", async () => {
    const { createVaultSession, verifyVaultSession } =
      await import("../../src/core/vault-session.js");
    const now = Date.now();
    const { token } = createVaultSession(DATA_DIR, 1000, now);
    expect(verifyVaultSession(DATA_DIR, token, now + 500)).toBe(true);
    expect(verifyVaultSession(DATA_DIR, token, now + 2000)).toBe(false);
  });

  it("never stores the plaintext token on disk (only its hash)", async () => {
    const { createVaultSession } = await import("../../src/core/vault-session.js");
    const { token } = createVaultSession(DATA_DIR);
    const raw = vol.readFileSync("/crm/.agentic/vault-sessions.json", "utf-8") as string;
    expect(raw).not.toContain(token);
  });

  it("prunes expired sessions when a new one is created", async () => {
    const { createVaultSession } = await import("../../src/core/vault-session.js");
    const now = Date.now();
    createVaultSession(DATA_DIR, 1000, now); // expires at now+1000
    createVaultSession(DATA_DIR, 60_000, now + 5000); // prunes the first
    const raw = vol.readFileSync("/crm/.agentic/vault-sessions.json", "utf-8") as string;
    const parsed = JSON.parse(raw) as { sessions: unknown[] };
    expect(parsed.sessions.length).toBe(1);
  });

  it("revokes a specific token", async () => {
    const { createVaultSession, verifyVaultSession, revokeVaultSession } =
      await import("../../src/core/vault-session.js");
    const { token } = createVaultSession(DATA_DIR);
    expect(revokeVaultSession(DATA_DIR, token)).toBe(true);
    expect(verifyVaultSession(DATA_DIR, token)).toBe(false);
    expect(revokeVaultSession(DATA_DIR, token)).toBe(false);
  });
});
