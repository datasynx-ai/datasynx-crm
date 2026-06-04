import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

const DATA_DIR = "/crm";
const ENV = { ...process.env };

beforeEach(() => {
  vol.reset();
  process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  process.env["DXCRM_LOG_STDERR"] = "off";
});
afterEach(() => {
  process.env = { ...ENV };
});

describe("handleGetDiagnostics", () => {
  it("returns a structured health report", async () => {
    vol.fromJSON({
      "/crm/.agentic/config.json": "{}",
      "/crm/customers/acme/main_facts.md":
        "---\nname: Acme\nrelationship_stage: active\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n",
    });
    const { handleGetDiagnostics } = await import("../../../src/mcp/tools/get-diagnostics.js");
    const res = await handleGetDiagnostics({}, DATA_DIR);
    const payload = JSON.parse(res.content[0]!.text) as {
      ok: boolean;
      checks: Array<{ name: string; status: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.checks.some((c) => c.name === "customer data")).toBe(true);
  });

  it("with fix=true removes orphaned temp files and reports the count", async () => {
    vol.fromJSON({
      "/crm/.agentic/config.json": "{}",
      "/crm/.agentic/vault.enc.1.abcd12.tmp": "x",
    });
    const { handleGetDiagnostics } = await import("../../../src/mcp/tools/get-diagnostics.js");
    const res = await handleGetDiagnostics({ fix: true }, DATA_DIR);
    const payload = JSON.parse(res.content[0]!.text) as { tempFilesRemoved: number };
    expect(payload.tempFilesRemoved).toBe(1);
    expect(vol.existsSync("/crm/.agentic/vault.enc.1.abcd12.tmp")).toBe(false);
  });
});
