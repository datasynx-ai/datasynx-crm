import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const mockRunBackup = vi.hoisted(() => vi.fn());

vi.mock("../../../src/commands/backup.js", () => ({
  runBackup: mockRunBackup,
  readBackupLog: vi.fn(() => []),
  listBackupsInDir: vi.fn(() => []),
}));

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

const DATA_DIR = "/data";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
});

describe("handleBackupNow", () => {
  it("returns backup metadata on success", async () => {
    vol.fromJSON({ [`${DATA_DIR}/customers/acme/main_facts.md`]: "# Acme" });
    mockRunBackup.mockResolvedValue({
      createdAt: "2026-05-30T10:00:00Z",
      customerCount: 1,
      fileCount: 4,
      directories: ["customers/"],
    });
    // Simulate zip file on disk for size calculation
    const { fs } = await import("memfs");
    fs.writeFileSync(`${DATA_DIR}/dxcrm-backup-2026-05-30T10-00-00.zip`, "x".repeat(512 * 1024));

    const { handleBackupNow } = await import("../../../src/mcp/tools/backup-now.js");
    const result = await handleBackupNow({}, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as {
      customerCount: number; fileCount: number; verified: boolean; sizeMb: string;
    };
    expect(parsed.customerCount).toBe(1);
    expect(parsed.fileCount).toBe(4);
    expect(parsed.verified).toBe(true);
  });

  it("returns failure message when runBackup returns null", async () => {
    vol.fromJSON({});
    mockRunBackup.mockResolvedValue(null);

    const { handleBackupNow } = await import("../../../src/mcp/tools/backup-now.js");
    const result = await handleBackupNow({}, DATA_DIR);
    expect(result.content[0].text).toContain("Backup failed");
  });

  it("includes uploadedTo when remote provided", async () => {
    vol.fromJSON({});
    mockRunBackup.mockResolvedValue({
      createdAt: "2026-05-30T10:00:00Z",
      customerCount: 2,
      fileCount: 8,
      directories: ["customers/"],
    });

    const { handleBackupNow } = await import("../../../src/mcp/tools/backup-now.js");
    const result = await handleBackupNow({ remote: "s3://my-bucket/backups/" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { uploadedTo: string };
    expect(parsed.uploadedTo).toBe("s3://my-bucket/backups/");
  });

  it("includes note when provided", async () => {
    vol.fromJSON({});
    mockRunBackup.mockResolvedValue({
      createdAt: "2026-05-30T10:00:00Z",
      customerCount: 1,
      fileCount: 3,
      directories: ["customers/"],
    });

    const { handleBackupNow } = await import("../../../src/mcp/tools/backup-now.js");
    const result = await handleBackupNow({ note: "pre-migration" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { note: string };
    expect(parsed.note).toBe("pre-migration");
  });

  it("shows unknown size when zip file not on disk", async () => {
    vol.fromJSON({});
    mockRunBackup.mockResolvedValue({
      createdAt: "2026-05-30T10:00:00Z",
      customerCount: 0,
      fileCount: 0,
      directories: [],
    });

    const { handleBackupNow } = await import("../../../src/mcp/tools/backup-now.js");
    const result = await handleBackupNow({}, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { sizeMb: string };
    expect(parsed.sizeMb).toBe("? MB");
  });
});
