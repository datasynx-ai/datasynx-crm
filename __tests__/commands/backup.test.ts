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

// ─── Enterprise features ──────────────────────────────────────────────────────

describe("readBackupLog", () => {
  it("returns entries from backup-log.json", async () => {
    const entries = [
      { filename: "b.zip", path: "/crm/b.zip", createdAt: "2026-05-01T00:00:00Z",
        sizeBytes: 1024, verified: true, encrypted: false, customerCount: 5, fileCount: 50 },
    ];
    vol.fromJSON({ "/crm/.agentic/backup-log.json": JSON.stringify(entries) });
    const { readBackupLog } = await import("../../src/commands/backup.js");
    const result = readBackupLog("/crm");
    expect(result).toHaveLength(1);
    expect(result[0]?.filename).toBe("b.zip");
    expect(result[0]?.verified).toBe(true);
  });

  it("returns empty array when log does not exist", async () => {
    vol.fromJSON({});
    const { readBackupLog } = await import("../../src/commands/backup.js");
    expect(readBackupLog("/crm")).toEqual([]);
  });

  it("returns empty array on corrupted log", async () => {
    vol.fromJSON({ "/crm/.agentic/backup-log.json": "not json" });
    const { readBackupLog } = await import("../../src/commands/backup.js");
    expect(readBackupLog("/crm")).toEqual([]);
  });
});

describe("listBackupsInDir", () => {
  it("lists backup zip files matching naming pattern", async () => {
    vol.fromJSON({
      "/crm/dxcrm-backup-2026-05-01.zip": "data",
      "/crm/dxcrm-backup-2026-05-02.zip": "data",
      "/crm/other-file.txt": "not a backup",
    });
    const { listBackupsInDir } = await import("../../src/commands/backup.js");
    const results = listBackupsInDir("/crm");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.filename.startsWith("dxcrm-backup"))).toBe(true);
  });

  it("returns empty array when dir does not exist", async () => {
    vol.fromJSON({});
    const { listBackupsInDir } = await import("../../src/commands/backup.js");
    expect(listBackupsInDir("/nonexistent")).toEqual([]);
  });

  it("identifies encrypted .dxbak files", async () => {
    vol.fromJSON({ "/crm/dxcrm-backup-2026-05-01.dxbak": "enc" });
    const { listBackupsInDir } = await import("../../src/commands/backup.js");
    const results = listBackupsInDir("/crm");
    expect(results).toHaveLength(1);
    expect(results[0]?.encrypted).toBe(true);
  });
});

describe("pruneOldBackups — simple keep count", () => {
  it("deletes oldest files to keep only N newest", async () => {
    vol.fromJSON({
      "/crm/dxcrm-backup-2026-05-01.zip": "d",
      "/crm/dxcrm-backup-2026-05-02.zip": "d",
      "/crm/dxcrm-backup-2026-05-03.zip": "d",
      "/crm/dxcrm-backup-2026-05-04.zip": "d",
      "/crm/dxcrm-backup-2026-05-05.zip": "d",
    });
    const { pruneOldBackups } = await import("../../src/commands/backup.js");
    pruneOldBackups("/crm", 3);
    const remaining = Object.keys(vol.toJSON()).filter((f) => f.endsWith(".zip"));
    expect(remaining).toHaveLength(3);
    expect(remaining.some((f) => f.includes("2026-05-05"))).toBe(true);
    expect(remaining.some((f) => f.includes("2026-05-04"))).toBe(true);
    expect(remaining.some((f) => f.includes("2026-05-03"))).toBe(true);
  });

  it("does not delete when count is within keep limit", async () => {
    vol.fromJSON({
      "/crm/dxcrm-backup-2026-05-01.zip": "d",
      "/crm/dxcrm-backup-2026-05-02.zip": "d",
    });
    const { pruneOldBackups } = await import("../../src/commands/backup.js");
    pruneOldBackups("/crm", 5);
    const remaining = Object.keys(vol.toJSON()).filter((f) => f.endsWith(".zip"));
    expect(remaining).toHaveLength(2);
  });
});

describe("pruneOldBackups — grandfathering retention", () => {
  it("keeps last N daily plus one per month when using retention config", async () => {
    vol.fromJSON({
      "/crm/dxcrm-backup-2026-04-01.zip": "d",
      "/crm/dxcrm-backup-2026-05-01.zip": "d",
      "/crm/dxcrm-backup-2026-05-02.zip": "d",
      "/crm/dxcrm-backup-2026-05-03.zip": "d",
      "/crm/dxcrm-backup-2026-05-04.zip": "d",
      "/crm/dxcrm-backup-2026-05-05.zip": "d",
    });
    const { pruneOldBackups } = await import("../../src/commands/backup.js");
    pruneOldBackups("/crm", 2, { daily: 2, monthly: 2 });
    const remaining = Object.keys(vol.toJSON()).filter((f) => f.endsWith(".zip"));
    // Newest 2 daily: 05-05 and 05-04
    expect(remaining.some((f) => f.includes("2026-05-05"))).toBe(true);
    expect(remaining.some((f) => f.includes("2026-05-04"))).toBe(true);
    // Monthly grandfathering keeps at least 2 months worth
    expect(remaining.length).toBeGreaterThanOrEqual(2);
  });
});

describe("verifyBackupFile", () => {
  it("returns true when unzip -t succeeds", async () => {
    vol.fromJSON({ "/crm/backup.zip": "data" });
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    const { verifyBackupFile } = await import("../../src/commands/backup.js");
    expect(verifyBackupFile("/crm/backup.zip")).toBe(true);
    expect(vi.mocked(execSync)).toHaveBeenCalledWith(
      expect.stringContaining("unzip -t"),
      expect.anything()
    );
  });

  it("returns false when unzip -t throws", async () => {
    vol.fromJSON({ "/crm/backup.zip": "data" });
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockImplementation(() => { throw new Error("bad zip"); });
    const { verifyBackupFile } = await import("../../src/commands/backup.js");
    expect(verifyBackupFile("/crm/backup.zip")).toBe(false);
  });

  it("returns false when file does not exist", async () => {
    vol.fromJSON({});
    const { verifyBackupFile } = await import("../../src/commands/backup.js");
    expect(verifyBackupFile("/crm/nonexistent.zip")).toBe(false);
  });
});

describe("uploadBackup", () => {
  it("calls aws s3 cp for s3:// remote", async () => {
    vol.fromJSON({ "/crm/backup.zip": "data" });
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { uploadBackup } = await import("../../src/commands/backup.js");
    await uploadBackup("/crm/backup.zip", "s3://my-bucket/backups/");
    expect(vi.mocked(execSync)).toHaveBeenCalledWith(
      expect.stringContaining("aws s3 cp"), expect.anything()
    );
    consoleSpy.mockRestore();
  });

  it("calls rsync for rsync:// remote", async () => {
    vol.fromJSON({ "/crm/backup.zip": "data" });
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { uploadBackup } = await import("../../src/commands/backup.js");
    await uploadBackup("/crm/backup.zip", "rsync://host:/backups/");
    expect(vi.mocked(execSync)).toHaveBeenCalledWith(
      expect.stringContaining("rsync"), expect.anything()
    );
    consoleSpy.mockRestore();
  });

  it("copies file locally for plain directory remote", async () => {
    vol.fromJSON({ "/crm/backup.zip": "zipdata" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { uploadBackup } = await import("../../src/commands/backup.js");
    await uploadBackup("/crm/backup.zip", "/mnt/nas/backups");
    expect(vol.toJSON()["/mnt/nas/backups/backup.zip"]).toBe("zipdata");
    consoleSpy.mockRestore();
  });
});
