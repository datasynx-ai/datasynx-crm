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

describe("runDiagnostics", () => {
  it("reports ok for a clean, valid workspace", async () => {
    vol.fromJSON({
      "/crm/.agentic/config.json": "{}",
      "/crm/customers/acme/main_facts.md":
        "---\nname: Acme\nrelationship_stage: active\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n",
    });
    const { runDiagnostics } = await import("../../src/core/doctor.js");
    const report = await runDiagnostics(DATA_DIR);
    expect(report.ok).toBe(true);
    const byName = Object.fromEntries(report.checks.map((c) => [c.name, c.status]));
    expect(byName["data directory"]).toBe("ok");
    expect(byName["customer data"]).toBe("ok");
    expect(byName["temp files"]).toBe("ok");
  });

  it("flags invalid customer data as a failure", async () => {
    vol.fromJSON({
      "/crm/.agentic/config.json": "{}",
      "/crm/customers/broken/main_facts.md": "---\nname: \n---\n", // missing required fields
    });
    const { runDiagnostics } = await import("../../src/core/doctor.js");
    const report = await runDiagnostics(DATA_DIR);
    const check = report.checks.find((c) => c.name === "customer data")!;
    expect(check.status).toBe("fail");
    expect(report.ok).toBe(false);
  });

  it("detects orphaned atomic-write temp files", async () => {
    vol.fromJSON({
      "/crm/.agentic/config.json": "{}",
      "/crm/.agentic/vault.enc.12345.ab12cd.tmp": "leftover",
      "/crm/customers/acme/main_facts.md":
        "---\nname: Acme\nrelationship_stage: active\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n",
    });
    const { runDiagnostics } = await import("../../src/core/doctor.js");
    const report = await runDiagnostics(DATA_DIR);
    const check = report.checks.find((c) => c.name === "temp files")!;
    expect(check.status).toBe("warn");
    expect(check.detail).toMatch(/1 orphaned/i);
  });

  it("cleanupTempFiles removes orphaned temp files and reports them", async () => {
    vol.fromJSON({
      "/crm/.agentic/config.json": "{}",
      "/crm/.agentic/rbac.json.111.aa11bb.tmp": "x",
      "/crm/customers/acme/pipeline.md.222.cc22dd.tmp": "y",
      "/crm/customers/acme/main_facts.md":
        "---\nname: Acme\nrelationship_stage: active\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n",
    });
    const { cleanupTempFiles, runDiagnostics } = await import("../../src/core/doctor.js");
    const removed = cleanupTempFiles(DATA_DIR);
    expect(removed).toHaveLength(2);
    expect(vol.existsSync("/crm/.agentic/rbac.json.111.aa11bb.tmp")).toBe(false);
    // doctor now reports temp files clean
    const report = await runDiagnostics(DATA_DIR);
    expect(report.checks.find((c) => c.name === "temp files")!.status).toBe("ok");
  });

  it("surfaces recent log errors", async () => {
    vol.fromJSON({ "/crm/.agentic/config.json": "{}" });
    const { logger } = await import("../../src/core/logger.js");
    logger.error("gmail-sync", "boom");
    const { runDiagnostics } = await import("../../src/core/doctor.js");
    const report = await runDiagnostics(DATA_DIR);
    const check = report.checks.find((c) => c.name === "logs")!;
    expect(check.status).toBe("warn");
    expect(check.detail).toMatch(/error/i);
  });
});
