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

async function mintToken(): Promise<string> {
  const { createVaultSession } = await import("../../src/core/vault-session.js");
  return createVaultSession(DATA_DIR).token;
}

describe("renderVaultGuiPage", () => {
  it("returns a valid HTML document", async () => {
    const { renderVaultGuiPage } = await import("../../src/mcp/vault-gui.js");
    const html = renderVaultGuiPage({ token: "abc123" });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("</html>");
  });

  it("embeds the (safe) token so the page's JS can call the API", async () => {
    const { renderVaultGuiPage } = await import("../../src/mcp/vault-gui.js");
    const html = renderVaultGuiPage({ token: "Ab_9-Z" });
    expect(html).toContain("Ab_9-Z");
  });

  it("refuses to embed a token with unsafe characters", async () => {
    const { renderVaultGuiPage } = await import("../../src/mcp/vault-gui.js");
    const html = renderVaultGuiPage({ token: "</script><script>alert(1)" });
    expect(html).not.toContain("<script>alert(1)");
  });
});

describe("vault-gui handlers — auth gating", () => {
  it("rejects list with an invalid token (401)", async () => {
    const { handleVaultList } = await import("../../src/mcp/vault-gui.js");
    const res = handleVaultList(DATA_DIR, KEY, "bogus");
    expect(res.status).toBe(401);
  });

  it("rejects set with an invalid token (401) and never writes", async () => {
    const { handleVaultSet } = await import("../../src/mcp/vault-gui.js");
    const res = handleVaultSet(DATA_DIR, KEY, "bogus", "k", "v");
    expect(res.status).toBe(401);
    expect(vol.existsSync("/crm/.agentic/vault.enc")).toBe(false);
  });

  it("returns 503 when the master key is not configured", async () => {
    const token = await mintToken();
    const { handleVaultList } = await import("../../src/mcp/vault-gui.js");
    const res = handleVaultList(DATA_DIR, undefined, token);
    expect(res.status).toBe(503);
  });
});

describe("vault-gui handlers — happy path", () => {
  it("set → list → reveal → delete round-trips, encrypted on disk", async () => {
    const token = await mintToken();
    const { handleVaultSet, handleVaultList, handleVaultReveal, handleVaultDelete } =
      await import("../../src/mcp/vault-gui.js");

    const setRes = handleVaultSet(DATA_DIR, KEY, token, "stripe_api_key", "sk_live_123");
    expect(setRes.status).toBe(200);

    // List returns names only — never values.
    const listRes = handleVaultList(DATA_DIR, KEY, token);
    expect(listRes.status).toBe(200);
    expect((listRes.body as { names: string[] }).names).toEqual(["stripe_api_key"]);
    expect(JSON.stringify(listRes.body)).not.toContain("sk_live_123");

    // Plaintext must not be on disk.
    const raw = vol.readFileSync("/crm/.agentic/vault.enc", "utf-8") as string;
    expect(raw).not.toContain("sk_live_123");

    // Reveal is explicit and returns the value.
    const revealRes = handleVaultReveal(DATA_DIR, KEY, token, "stripe_api_key");
    expect(revealRes.status).toBe(200);
    expect((revealRes.body as { value: string }).value).toBe("sk_live_123");

    const delRes = handleVaultDelete(DATA_DIR, KEY, token, "stripe_api_key");
    expect(delRes.status).toBe(200);
    expect((handleVaultList(DATA_DIR, KEY, token).body as { names: string[] }).names).toEqual([]);
  });

  it("rejects an empty secret name on set (400)", async () => {
    const token = await mintToken();
    const { handleVaultSet } = await import("../../src/mcp/vault-gui.js");
    expect(handleVaultSet(DATA_DIR, KEY, token, "", "v").status).toBe(400);
    expect(handleVaultSet(DATA_DIR, KEY, token, "   ", "v").status).toBe(400);
  });

  it("reveal of a missing secret returns 404", async () => {
    const token = await mintToken();
    const { handleVaultReveal } = await import("../../src/mcp/vault-gui.js");
    expect(handleVaultReveal(DATA_DIR, KEY, token, "nope").status).toBe(404);
  });

  it("surfaces a wrong-master-key failure as 500 (not a crash)", async () => {
    const token = await mintToken();
    const { handleVaultSet, handleVaultList } = await import("../../src/mcp/vault-gui.js");
    handleVaultSet(DATA_DIR, KEY, token, "k", "v");
    const res = handleVaultList(DATA_DIR, "the-wrong-key", token);
    expect(res.status).toBe(500);
  });
});

describe("isLoopbackAddress", () => {
  it("accepts IPv4 / IPv6 loopback (incl. IPv4-mapped)", async () => {
    const { isLoopbackAddress } = await import("../../src/mcp/vault-gui.js");
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("127.5.6.7")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
  });

  it("rejects non-loopback and unknown addresses", async () => {
    const { isLoopbackAddress } = await import("../../src/mcp/vault-gui.js");
    expect(isLoopbackAddress("192.168.1.10")).toBe(false);
    expect(isLoopbackAddress("10.0.0.4")).toBe(false);
    expect(isLoopbackAddress("203.0.113.7")).toBe(false);
    expect(isLoopbackAddress("::ffff:192.168.1.10")).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
    expect(isLoopbackAddress("")).toBe(false);
  });
});

describe("vaultRemoteAllowed", () => {
  it("defaults to false (localhost-only) and opts in via env", async () => {
    const { vaultRemoteAllowed } = await import("../../src/mcp/vault-gui.js");
    delete process.env["DXCRM_VAULT_GUI_ALLOW_REMOTE"];
    expect(vaultRemoteAllowed()).toBe(false);
    for (const v of ["1", "true", "yes"]) {
      process.env["DXCRM_VAULT_GUI_ALLOW_REMOTE"] = v;
      expect(vaultRemoteAllowed()).toBe(true);
    }
    process.env["DXCRM_VAULT_GUI_ALLOW_REMOTE"] = "0";
    expect(vaultRemoteAllowed()).toBe(false);
    delete process.env["DXCRM_VAULT_GUI_ALLOW_REMOTE"];
  });
});
