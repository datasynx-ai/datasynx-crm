import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

const DATA_DIR = "/crm";

beforeEach(() => {
  vol.reset();
  vol.mkdirSync(DATA_DIR, { recursive: true });
  delete process.env["DXCRM_PUBLIC_URL"];
  delete process.env["DXCRM_MCP_PORT"];
  delete process.env["DXCRM_VAULT_KEY"];
});

interface LinkResult {
  url: string;
  expiresAt: string;
  expiresInMinutes: number;
  serverRunning: boolean;
  vaultKeyConfigured: boolean;
  instructions: string;
  setup?: string;
}

async function call(): Promise<LinkResult> {
  const { handleGetVaultLink } = await import("../../../src/mcp/tools/get-vault-link.js");
  const res = await handleGetVaultLink({}, DATA_DIR);
  return JSON.parse(res.content[0].text) as LinkResult;
}

describe("handleGetVaultLink", () => {
  it("returns a /vault URL carrying a fresh session token", async () => {
    const r = await call();
    expect(r.url).toContain("/vault?t=");
    const token = new URL(r.url).searchParams.get("t");
    expect(token && token.length).toBeGreaterThan(20);

    // The token must actually be a valid, unexpired session.
    const { verifyVaultSession } = await import("../../../src/core/vault-session.js");
    expect(verifyVaultSession(DATA_DIR, token as string)).toBe(true);
  });

  it("never leaks a secret value — only a link", async () => {
    const { setSecret } = await import("../../../src/core/vault.js");
    setSecret(DATA_DIR, "k", "stripe", "sk_live_SECRET");
    const r = await call();
    expect(JSON.stringify(r)).not.toContain("sk_live_SECRET");
  });

  it("defaults to localhost:3847 and honors DXCRM_MCP_PORT", async () => {
    expect((await call()).url).toContain("http://localhost:3847/vault");
    process.env["DXCRM_MCP_PORT"] = "9999";
    expect((await call()).url).toContain("http://localhost:9999/vault");
  });

  it("honors DXCRM_PUBLIC_URL as the base", async () => {
    process.env["DXCRM_PUBLIC_URL"] = "https://crm.example.com";
    const r = await call();
    expect(r.url).toMatch(/^https:\/\/crm\.example\.com\/vault\?t=/);
  });

  it("reports whether the master key is configured", async () => {
    expect((await call()).vaultKeyConfigured).toBe(false);
    process.env["DXCRM_VAULT_KEY"] = "secret";
    expect((await call()).vaultKeyConfigured).toBe(true);
  });

  it("reports the server as not running when no pid file exists", async () => {
    const r = await call();
    expect(r.serverRunning).toBe(false);
    expect(r.setup).toBeTruthy();
  });
});
