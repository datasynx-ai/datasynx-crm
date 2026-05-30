import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const mockReadBackupLog = vi.hoisted(() => vi.fn());
const mockListBackupsInDir = vi.hoisted(() => vi.fn());

vi.mock("../../../src/commands/backup.js", () => ({
  runBackup: vi.fn(),
  readBackupLog: mockReadBackupLog,
  listBackupsInDir: mockListBackupsInDir,
}));

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

const DATA_DIR = "/data";

function makeLogEntry(filename: string, sizeBytes = 1024 * 1024, customerCount = 3) {
  return {
    filename,
    createdAt: "2026-05-30T10:00:00Z",
    sizeBytes,
    verified: true,
    encrypted: false,
    customerCount,
    fileCount: customerCount * 4,
  };
}

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
});

describe("handleListBackups", () => {
  it("returns no-backups message when empty", async () => {
    mockReadBackupLog.mockReturnValue([]);
    mockListBackupsInDir.mockReturnValue([]);

    const { handleListBackups } = await import("../../../src/mcp/tools/list-backups.js");
    const result = await handleListBackups({ limit: 10 }, DATA_DIR);
    expect(result.content[0].text).toContain("No backups found");
  });

  it("prefers log entries over directory scan", async () => {
    mockReadBackupLog.mockReturnValue([makeLogEntry("backup-log.zip")]);
    mockListBackupsInDir.mockReturnValue([makeLogEntry("backup-dir.zip")]);

    const { handleListBackups } = await import("../../../src/mcp/tools/list-backups.js");
    const result = await handleListBackups({ limit: 10 }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { backups: Array<{ filename: string }> };
    expect(parsed.backups[0].filename).toBe("backup-log.zip");
  });

  it("falls back to directory scan when log is empty", async () => {
    mockReadBackupLog.mockReturnValue([]);
    mockListBackupsInDir.mockReturnValue([makeLogEntry("backup-dir.zip")]);

    const { handleListBackups } = await import("../../../src/mcp/tools/list-backups.js");
    const result = await handleListBackups({ limit: 10 }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { backups: Array<{ filename: string }> };
    expect(parsed.backups[0].filename).toBe("backup-dir.zip");
  });

  it("respects limit", async () => {
    mockReadBackupLog.mockReturnValue([
      makeLogEntry("b1.zip"),
      makeLogEntry("b2.zip"),
      makeLogEntry("b3.zip"),
    ]);
    mockListBackupsInDir.mockReturnValue([]);

    const { handleListBackups } = await import("../../../src/mcp/tools/list-backups.js");
    const result = await handleListBackups({ limit: 2 }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { count: number; totalAvailable: number };
    expect(parsed.count).toBe(2);
    expect(parsed.totalAvailable).toBe(3);
  });

  it("formats size in MB", async () => {
    mockReadBackupLog.mockReturnValue([makeLogEntry("b.zip", 2 * 1024 * 1024)]);
    mockListBackupsInDir.mockReturnValue([]);

    const { handleListBackups } = await import("../../../src/mcp/tools/list-backups.js");
    const result = await handleListBackups({ limit: 10 }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { backups: Array<{ sizeMb: string }> };
    expect(parsed.backups[0].sizeMb).toBe("2.0 MB");
  });

  it("shows unknown for zero-byte entries", async () => {
    mockReadBackupLog.mockReturnValue([makeLogEntry("b.zip", 0)]);
    mockListBackupsInDir.mockReturnValue([]);

    const { handleListBackups } = await import("../../../src/mcp/tools/list-backups.js");
    const result = await handleListBackups({ limit: 10 }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { backups: Array<{ sizeMb: string }> };
    expect(parsed.backups[0].sizeMb).toBe("unknown");
  });

  it("returns customer count in backup metadata", async () => {
    mockReadBackupLog.mockReturnValue([makeLogEntry("b.zip", 1024 * 1024, 7)]);
    mockListBackupsInDir.mockReturnValue([]);

    const { handleListBackups } = await import("../../../src/mcp/tools/list-backups.js");
    const result = await handleListBackups({ limit: 10 }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { backups: Array<{ customerCount: number }> };
    expect(parsed.backups[0].customerCount).toBe(7);
  });
});
