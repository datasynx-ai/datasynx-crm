import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { vol } from "memfs";

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runBackup", () => {
  it("calls execSync with zip command when customers dir exists", async () => {
    vol.fromJSON({ "/crm/customers/acme-corp/main_facts.md": "# Acme" });

    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runBackup } = await import("../../src/commands/backup.js");

    await runBackup("/crm/backup.zip", "/crm");

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining("zip"),
      expect.objectContaining({ cwd: "/crm" })
    );
    consoleSpy.mockRestore();
  });

  it("uses default zip path containing current date when no output given", async () => {
    vol.fromJSON({ "/crm/customers/acme-corp/main_facts.md": "# Acme" });

    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runBackup } = await import("../../src/commands/backup.js");

    await runBackup(undefined, "/crm");

    const call = vi.mocked(execSync).mock.calls[0]?.[0] as string;
    expect(call).toMatch(/dxcrm-backup-\d{4}-\d{2}-\d{2}/);
    consoleSpy.mockRestore();
  });

  it("exits with error when customers dir does not exist", async () => {
    vol.fromJSON({});

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);

    const { runBackup } = await import("../../src/commands/backup.js");

    await expect(runBackup(undefined, "/crm")).rejects.toThrow("process.exit called");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("No customers directory found"));

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("exits with error when execSync throws", async () => {
    vol.fromJSON({ "/crm/customers/acme-corp/main_facts.md": "# Acme" });

    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockImplementation(() => { throw new Error("zip not found"); });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);

    const { runBackup } = await import("../../src/commands/backup.js");

    await expect(runBackup(undefined, "/crm")).rejects.toThrow("process.exit called");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Backup failed"));

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe("runRestore", () => {
  it("calls execSync with unzip command including the zip path", async () => {
    vol.fromJSON({});

    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runRestore } = await import("../../src/commands/backup.js");

    await runRestore("/backups/dxcrm-backup.zip", "/crm");

    const call = vi.mocked(execSync).mock.calls[0]?.[0] as string;
    expect(call).toMatch(/unzip -o/);
    expect(call).toContain("dxcrm-backup.zip");
    consoleSpy.mockRestore();
  });

  it("exits with error when unzip fails", async () => {
    vol.fromJSON({});

    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockImplementation(() => { throw new Error("unzip not found"); });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);

    const { runRestore } = await import("../../src/commands/backup.js");

    await expect(runRestore("/backups/dxcrm-backup.zip", "/crm")).rejects.toThrow("process.exit called");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Restore failed"));

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
