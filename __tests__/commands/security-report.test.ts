import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

import { runSecurityReport } from "../../src/commands/security-report.js";

describe("runSecurityReport", () => {
  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
  });

  it("prints report to stdout when no --output flag", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runSecurityReport({});
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.flat().join("\n");
    expect(output).toContain("DatasynxOpenCRM");
    expect(output).toContain("Security Report");
    spy.mockRestore();
  });

  it("writes report to file when --output is given", async () => {
    vol.fromJSON({ "/tmp/.keep": "" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runSecurityReport({ output: "/tmp/security-report.md" });
    const { fs } = vol;
    expect(fs.existsSync("/tmp/security-report.md")).toBe(true);
    const content = fs.readFileSync("/tmp/security-report.md", "utf-8") as string;
    expect(content).toContain("DatasynxOpenCRM");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("security-report.md"));
    consoleSpy.mockRestore();
  });

  it("report contains GDPR section", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runSecurityReport({});
    const output = spy.mock.calls.flat().join("\n");
    expect(output).toContain("GDPR");
    spy.mockRestore();
  });

  it("report contains Audit Trail section", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runSecurityReport({});
    const output = spy.mock.calls.flat().join("\n");
    expect(output).toContain("Audit Trail");
    spy.mockRestore();
  });
});
