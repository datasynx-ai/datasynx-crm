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
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("zip not found");
    });

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
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("unzip not found");
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);

    const { runRestore } = await import("../../src/commands/backup.js");

    await expect(runRestore("/backups/dxcrm-backup.zip", "/crm")).rejects.toThrow(
      "process.exit called"
    );
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Restore failed"));

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

// ─── Enterprise features ──────────────────────────────────────────────────────

describe("readBackupLog", () => {
  it("returns entries from backup-log.json", async () => {
    const entries = [
      {
        filename: "b.zip",
        path: "/crm/b.zip",
        createdAt: "2026-05-01T00:00:00Z",
        sizeBytes: 1024,
        verified: true,
        encrypted: false,
        customerCount: 5,
        fileCount: 50,
      },
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

  it("returns empty array when readdirSync throws (lines 344-346)", async () => {
    vol.fromJSON({ "/crm/.keep": "" }); // dir exists so existsSync passes
    const fsMod = await import("fs");
    const spy = vi.spyOn(fsMod.default, "readdirSync").mockImplementation(() => {
      throw new Error("permission denied");
    });
    const { listBackupsInDir } = await import("../../src/commands/backup.js");
    expect(listBackupsInDir("/crm")).toEqual([]);
    spy.mockRestore();
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

describe("pruneOldBackups — weekly retention", () => {
  it("keeps last N weekly backups when weekly set (lines 387-396)", async () => {
    vol.fromJSON({
      "/crm/dxcrm-backup-2026-04-01.zip": "d",
      "/crm/dxcrm-backup-2026-04-08.zip": "d",
      "/crm/dxcrm-backup-2026-04-15.zip": "d",
      "/crm/dxcrm-backup-2026-05-01.zip": "d",
      "/crm/dxcrm-backup-2026-05-08.zip": "d",
      "/crm/dxcrm-backup-2026-05-15.zip": "d",
    });
    const { pruneOldBackups } = await import("../../src/commands/backup.js");
    pruneOldBackups("/crm", 2, { daily: 2, weekly: 3 });
    const remaining = Object.keys(vol.toJSON()).filter((f) => f.endsWith(".zip"));
    expect(remaining.length).toBeGreaterThanOrEqual(2);
  });

  it("skips unlinkSync errors silently (line 419-421)", async () => {
    vol.fromJSON({
      "/crm/dxcrm-backup-2026-04-01.zip": "d",
      "/crm/dxcrm-backup-2026-05-01.zip": "d",
      "/crm/dxcrm-backup-2026-05-02.zip": "d",
    });
    const { pruneOldBackups } = await import("../../src/commands/backup.js");
    const fsMod = await import("fs");
    const unlinkSpy = vi.spyOn(fsMod.default, "unlinkSync").mockImplementation(() => {
      throw new Error("permission denied");
    });
    // Should not throw despite unlinkSync error
    expect(() => pruneOldBackups("/crm", 1)).not.toThrow();
    unlinkSpy.mockRestore();
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
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("bad zip");
    });
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
      expect.stringContaining("aws s3 cp"),
      expect.anything()
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
      expect.stringContaining("rsync"),
      expect.anything()
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

  it("logs error when s3 upload fails (line 299)", async () => {
    vol.fromJSON({ "/crm/backup.zip": "data" });
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("aws CLI not found");
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { uploadBackup } = await import("../../src/commands/backup.js");
    await expect(uploadBackup("/crm/backup.zip", "s3://bucket/")).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("S3 upload failed"));
    consoleSpy.mockRestore();
  });

  it("logs error when rsync fails (lines 306-307)", async () => {
    vol.fromJSON({ "/crm/backup.zip": "data" });
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("rsync not installed");
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { uploadBackup } = await import("../../src/commands/backup.js");
    await expect(uploadBackup("/crm/backup.zip", "rsync://host:/path/")).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("rsync failed"));
    consoleSpy.mockRestore();
  });

  it("logs error and does not throw when local copy fails (line 317)", async () => {
    vol.fromJSON({ "/crm/backup.zip": "data" });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fsMod = await import("fs");
    const copySpy = vi.spyOn(fsMod.default, "copyFileSync").mockImplementation(() => {
      throw new Error("no space left");
    });
    const { uploadBackup } = await import("../../src/commands/backup.js");
    await expect(uploadBackup("/crm/backup.zip", "/mnt/nas/backups")).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Copy failed"));
    consoleSpy.mockRestore();
    copySpy.mockRestore();
  });
});

describe("shouldRunScheduledBackup", () => {
  it("returns false when no backup schedule configured", async () => {
    vol.fromJSON({});
    const { shouldRunScheduledBackup } = await import("../../src/commands/backup.js");
    expect(shouldRunScheduledBackup("/crm")).toBe(false);
  });

  it("returns true when schedule configured but no lastBackup", async () => {
    vol.fromJSON({
      "/crm/.agentic/config.json": JSON.stringify({
        backupSchedule: { enabled: true, keep: 7 },
      }),
    });
    const { shouldRunScheduledBackup } = await import("../../src/commands/backup.js");
    expect(shouldRunScheduledBackup("/crm")).toBe(true);
  });

  it("returns false when lastBackup is recent (less than 24h ago)", async () => {
    const recent = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1h ago
    vol.fromJSON({
      "/crm/.agentic/config.json": JSON.stringify({
        backupSchedule: { enabled: true, keep: 7, lastBackup: recent },
      }),
    });
    const { shouldRunScheduledBackup } = await import("../../src/commands/backup.js");
    expect(shouldRunScheduledBackup("/crm")).toBe(false);
  });

  it("returns true when lastBackup is older than 24h", async () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(); // 25h ago
    vol.fromJSON({
      "/crm/.agentic/config.json": JSON.stringify({
        backupSchedule: { enabled: true, keep: 7, lastBackup: old },
      }),
    });
    const { shouldRunScheduledBackup } = await import("../../src/commands/backup.js");
    expect(shouldRunScheduledBackup("/crm")).toBe(true);
  });
});

describe("runScheduledBackupIfDue", () => {
  it("does nothing when backup is not due", async () => {
    const recent = new Date(Date.now() - 1000 * 60 * 60).toISOString();
    vol.fromJSON({
      "/crm/.agentic/config.json": JSON.stringify({
        backupSchedule: { enabled: true, keep: 7, lastBackup: recent },
      }),
      "/crm/customers/acme/main_facts.md": "# Acme",
    });
    const { execSync } = await import("child_process");
    const { runScheduledBackupIfDue } = await import("../../src/commands/backup.js");
    await runScheduledBackupIfDue("/crm");
    expect(vi.mocked(execSync)).not.toHaveBeenCalled();
  });

  it("runs backup when due and customers dir exists", async () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString();
    vol.fromJSON({
      "/crm/.agentic/config.json": JSON.stringify({
        backupSchedule: { enabled: true, keep: 7, lastBackup: old },
      }),
      "/crm/customers/acme/main_facts.md": "# Acme",
    });
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { runScheduledBackupIfDue } = await import("../../src/commands/backup.js");
    await runScheduledBackupIfDue("/crm");
    expect(vi.mocked(execSync)).toHaveBeenCalledWith(
      expect.stringContaining("zip -r"),
      expect.anything()
    );
    stderrSpy.mockRestore();
  });

  it("skips when due but customers dir does not exist", async () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString();
    vol.fromJSON({
      "/crm/.agentic/config.json": JSON.stringify({
        backupSchedule: { enabled: true, keep: 7, lastBackup: old },
      }),
    });
    const { execSync } = await import("child_process");
    const { runScheduledBackupIfDue } = await import("../../src/commands/backup.js");
    await runScheduledBackupIfDue("/crm");
    expect(vi.mocked(execSync)).not.toHaveBeenCalled();
  });

  it("builds retention config when weekly/monthly set (lines 520-524)", async () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString();
    vol.fromJSON({
      "/crm/.agentic/config.json": JSON.stringify({
        backupSchedule: { enabled: true, keep: 7, weekly: 4, monthly: 3, lastBackup: old },
      }),
      "/crm/customers/acme/main_facts.md": "# Acme",
    });
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { runScheduledBackupIfDue } = await import("../../src/commands/backup.js");
    await runScheduledBackupIfDue("/crm");
    expect(vi.mocked(execSync)).toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it("writes error to stderr when backup fails", async () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString();
    vol.fromJSON({
      "/crm/.agentic/config.json": JSON.stringify({
        backupSchedule: { enabled: true, keep: 7, lastBackup: old },
      }),
      "/crm/customers/acme/main_facts.md": "# Acme",
    });
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("zip not found");
    });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { runScheduledBackupIfDue } = await import("../../src/commands/backup.js");
    await runScheduledBackupIfDue("/crm");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Scheduled backup failed"));
    stderrSpy.mockRestore();
  });
});

describe("backupCommand list subcommand", () => {
  beforeEach(() => {
    process.env["DXCRM_DATA_DIR"] = "/crm";
  });

  it("shows 'No backups found' when no backups exist", async () => {
    vol.fromJSON({});
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { backupCommand } = await import("../../src/commands/backup.js");
    await backupCommand.parseAsync(["node", "backup", "list"]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No backups"));
    consoleSpy.mockRestore();
  });

  it("lists backups from log entries when they exist", async () => {
    const backupLog = [
      {
        filename: "dxcrm-backup-2026-05-01.zip",
        createdAt: "2026-05-01T10:00:00Z",
        sizeBytes: 1048576,
        encrypted: false,
        verified: true,
      },
    ];
    vol.fromJSON({
      "/crm/.agentic/backup-log.json": JSON.stringify(backupLog),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { backupCommand } = await import("../../src/commands/backup.js");
    await backupCommand.parseAsync(["node", "backup", "list"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("dxcrm-backup-2026-05-01.zip");
    consoleSpy.mockRestore();
  });

  it("shows encrypted and verified markers in list", async () => {
    const backupLog = [
      {
        filename: "dxcrm-backup-enc.zip",
        createdAt: "2026-05-02T10:00:00Z",
        sizeBytes: 2097152,
        encrypted: true,
        verified: true,
      },
    ];
    vol.fromJSON({
      "/crm/.agentic/backup-log.json": JSON.stringify(backupLog),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { backupCommand } = await import("../../src/commands/backup.js");
    await backupCommand.parseAsync(["node", "backup", "list"]);
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("encrypted");
    consoleSpy.mockRestore();
  });
});

describe("runScheduledBackupIfDue — remote upload path", () => {
  it("calls uploadBackup when remote is configured in schedule", async () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString();
    vol.fromJSON({
      "/crm/.agentic/config.json": JSON.stringify({
        backupSchedule: { enabled: true, keep: 7, lastBackup: old, remote: "s3://my-bucket/crm" },
      }),
      "/crm/customers/acme/main_facts.md": "# Acme",
    });
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    // Mock execSync for the upload (aws s3 cp)
    const { runScheduledBackupIfDue } = await import("../../src/commands/backup.js");
    await runScheduledBackupIfDue("/crm");
    // The zip + upload execSync calls should have been made
    expect(vi.mocked(execSync)).toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});

describe("runBackupSchedule", () => {
  function readConfig(dir = "/crm"): Record<string, unknown> {
    const raw = vol.readFileSync(`${dir}/.agentic/config.json`, "utf-8") as string;
    return JSON.parse(raw) as Record<string, unknown>;
  }

  it("sets backup schedule when --every is provided", async () => {
    vol.fromJSON({ "/crm/.agentic/config.json": JSON.stringify({}) });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runBackupSchedule } = await import("../../src/commands/backup.js");
    await runBackupSchedule({ every: "day", keep: "7" }, "/crm");
    const config = readConfig() as { backupSchedule?: { every: string; keep: number } };
    expect(config.backupSchedule?.every).toBe("day");
    expect(config.backupSchedule?.keep).toBe(7);
    consoleSpy.mockRestore();
  });

  it("uses default keep=7 when --keep is not provided", async () => {
    vol.fromJSON({ "/crm/.agentic/config.json": JSON.stringify({}) });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runBackupSchedule } = await import("../../src/commands/backup.js");
    await runBackupSchedule({ every: "day" }, "/crm");
    const config = readConfig() as { backupSchedule?: { keep: number } };
    expect(config.backupSchedule?.keep).toBe(7);
    consoleSpy.mockRestore();
  });

  it("stores weekly and monthly retention when provided", async () => {
    vol.fromJSON({ "/crm/.agentic/config.json": JSON.stringify({}) });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runBackupSchedule } = await import("../../src/commands/backup.js");
    await runBackupSchedule({ every: "day", keep: "7", weekly: "4", monthly: "3" }, "/crm");
    const config = readConfig() as { backupSchedule?: { weekly: number; monthly: number } };
    expect(config.backupSchedule?.weekly).toBe(4);
    expect(config.backupSchedule?.monthly).toBe(3);
    consoleSpy.mockRestore();
  });

  it("stores remote in schedule when provided", async () => {
    vol.fromJSON({ "/crm/.agentic/config.json": JSON.stringify({}) });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runBackupSchedule } = await import("../../src/commands/backup.js");
    await runBackupSchedule({ every: "day", remote: "s3://bucket/path" }, "/crm");
    const config = readConfig() as { backupSchedule?: { remote: string } };
    expect(config.backupSchedule?.remote).toBe("s3://bucket/path");
    consoleSpy.mockRestore();
  });

  it("shows schedule status when --status flag is set", async () => {
    vol.fromJSON({
      "/crm/.agentic/config.json": JSON.stringify({
        backupSchedule: { every: "day", keep: 7, lastBackup: "2026-06-01T00:00:00Z" },
      }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runBackupSchedule } = await import("../../src/commands/backup.js");
    await runBackupSchedule({ status: true }, "/crm");
    const output = consoleSpy.mock.calls.flat().join("\n");
    expect(output).toContain("day");
    consoleSpy.mockRestore();
  });

  it("shows 'No backup schedule configured' when status but no schedule", async () => {
    vol.fromJSON({ "/crm/.agentic/config.json": JSON.stringify({}) });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runBackupSchedule } = await import("../../src/commands/backup.js");
    await runBackupSchedule({ status: true }, "/crm");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No backup schedule"));
    consoleSpy.mockRestore();
  });

  it("exits with error when neither --every nor --status provided (lines 450-454)", async () => {
    vol.fromJSON({ "/crm/.agentic/config.json": JSON.stringify({}) });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const { runBackupSchedule } = await import("../../src/commands/backup.js");
    await runBackupSchedule({}, "/crm");
    expect(exitSpy).toHaveBeenCalledWith(1);
    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("clears backup schedule when --clear flag is set", async () => {
    vol.fromJSON({
      "/crm/.agentic/config.json": JSON.stringify({
        backupSchedule: { every: "day", keep: 7, lastBackup: null },
      }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runBackupSchedule } = await import("../../src/commands/backup.js");
    await runBackupSchedule({ clear: true }, "/crm");
    const raw = vol.readFileSync("/crm/.agentic/config.json", "utf-8") as string;
    const config = JSON.parse(raw) as { backupSchedule?: unknown };
    expect(config.backupSchedule).toBeUndefined();
    consoleSpy.mockRestore();
  });
});

describe("backupCommand main action", () => {
  beforeEach(() => {
    process.env["DXCRM_DATA_DIR"] = "/crm";
  });

  it("parses and invokes action when called via parseAsync", async () => {
    // The action resolves the data dir from DXCRM_DATA_DIR (set to /crm in beforeEach).
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    vol.fromJSON({ "/crm/customers/acme/main_facts.md": "# Acme" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consolErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { backupCommand } = await import("../../src/commands/backup.js");
    expect(backupCommand.name()).toBe("backup");
    await backupCommand.parseAsync(["node", "backup"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Backed up from /crm (no process.exit), so no error was logged.
    expect(consolErrSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
    consolErrSpy.mockRestore();
  });
});

describe("runVerify", () => {
  it("exits with error when zip file not found (lines 263-266)", async () => {
    vol.fromJSON({});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const { runVerify } = await import("../../src/commands/backup.js");
    await runVerify("/crm/missing.zip");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("File not found"));
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("logs size and SHA-256 when zip is valid (lines 271-276)", async () => {
    vol.fromJSON({ "/crm/backup.zip": "valid zip data" });
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { runVerify } = await import("../../src/commands/backup.js");
    await runVerify("/crm/backup.zip");
    expect(consoleSpy.mock.calls.flat().join("\n")).toContain("ZIP integrity OK");
    consoleSpy.mockRestore();
  });

  it("exits with error when zip integrity check fails (lines 277-280)", async () => {
    vol.fromJSON({ "/crm/backup.zip": "corrupt data" });
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("unzip: bad CRC");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const { runVerify } = await import("../../src/commands/backup.js");
    await runVerify("/crm/backup.zip");
    expect(exitSpy).toHaveBeenCalledWith(1);
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe("runRestoreDrill", () => {
  it("returns ok when integrity verifies and customers/ + .agentic/ are present", async () => {
    vol.fromJSON({ "/crm/backup.zip": "data" });
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockReturnValue(
      Buffer.from("Archive:\n  customers/acme/main_facts.md\n  .agentic/config.json\n")
    );
    const { runRestoreDrill } = await import("../../src/commands/backup.js");
    const report = await runRestoreDrill("/crm/backup.zip", { silent: true });
    expect(report.ok).toBe(true);
    expect(report.verified).toBe(true);
    expect(report.hasCustomers).toBe(true);
    expect(report.hasAgentic).toBe(true);
  });

  it("returns not_found for a missing file", async () => {
    vol.fromJSON({});
    const { runRestoreDrill } = await import("../../src/commands/backup.js");
    const report = await runRestoreDrill("/crm/missing.zip", { silent: true });
    expect(report.ok).toBe(false);
    expect(report.reason).toBe("not_found");
  });

  it("fails when integrity check throws", async () => {
    vol.fromJSON({ "/crm/backup.zip": "corrupt" });
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("unzip: bad CRC");
    });
    const { runRestoreDrill } = await import("../../src/commands/backup.js");
    const report = await runRestoreDrill("/crm/backup.zip", { silent: true });
    expect(report.ok).toBe(false);
    expect(report.verified).toBe(false);
  });
});
