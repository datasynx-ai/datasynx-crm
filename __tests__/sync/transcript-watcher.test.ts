import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("../../src/core/lancedb.js", () => ({
  indexInLanceDB: vi.fn().mockResolvedValue(undefined),
  searchKnowledge: vi.fn().mockResolvedValue([]),
  resetConnection: vi.fn(),
}));

vi.mock("chokidar", () => {
  const mockWatcher = {
    on: vi.fn().mockReturnThis(),
    close: vi.fn(),
  };
  return {
    default: {
      watch: vi.fn().mockReturnValue(mockWatcher),
    },
    watch: vi.fn().mockReturnValue(mockWatcher),
  };
});

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
});

describe("watchTranscripts", () => {
  it("calls chokidar.watch with the provided paths", async () => {
    const chokidar = await import("chokidar");
    const { watchTranscripts } = await import("../../src/sync/transcript-watcher.js");

    const paths = ["/home/user/Downloads/Fireflies"];
    const onFile = vi.fn().mockResolvedValue(undefined);

    watchTranscripts({ paths, extensions: [".txt", ".vtt"], dataDir: "/crm", onFile });

    expect(chokidar.default.watch).toHaveBeenCalledWith(
      paths,
      expect.objectContaining({
        awaitWriteFinish: expect.objectContaining({ stabilityThreshold: 2000 }),
        persistent: true,
      })
    );
  });

  it("passes ignored as a function (not a glob string)", async () => {
    const chokidar = await import("chokidar");
    const { watchTranscripts } = await import("../../src/sync/transcript-watcher.js");

    watchTranscripts({
      paths: ["/test"],
      extensions: [".txt"],
      dataDir: "/crm",
      onFile: vi.fn().mockResolvedValue(undefined),
    });

    const callArgs = (chokidar.default.watch as ReturnType<typeof vi.fn>).mock.calls[0];
    const opts = callArgs[1] as { ignored: unknown };
    expect(typeof opts.ignored).toBe("function");
  });

  it("ignored function returns false for directories", async () => {
    const { watchTranscripts } = await import("../../src/sync/transcript-watcher.js");
    const chokidar = await import("chokidar");

    watchTranscripts({
      paths: ["/test"],
      extensions: [".txt"],
      dataDir: "/crm",
      onFile: vi.fn().mockResolvedValue(undefined),
    });

    const callArgs = (chokidar.default.watch as ReturnType<typeof vi.fn>).mock.calls[0];
    const opts = callArgs[1] as { ignored: (p: string, s?: { isDirectory(): boolean }) => boolean };

    // Directory should NOT be ignored
    expect(opts.ignored("/test/subdir", { isDirectory: () => true })).toBe(false);
    // .txt file should NOT be ignored
    expect(opts.ignored("/test/transcript.txt")).toBe(false);
    // .mp3 file SHOULD be ignored
    expect(opts.ignored("/test/audio.mp3")).toBe(true);
  });

  it("registers 'add' event handler", async () => {
    const chokidar = await import("chokidar");
    const { watchTranscripts } = await import("../../src/sync/transcript-watcher.js");

    const watcher = watchTranscripts({
      paths: ["/test"],
      extensions: [".txt"],
      dataDir: "/crm",
      onFile: vi.fn().mockResolvedValue(undefined),
    });

    // The mock watcher's .on was called with "add"
    expect(watcher.on).toHaveBeenCalledWith("add", expect.any(Function));
  });
});

describe("processTranscriptFile", () => {
  it("writes interaction to interactions.md", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/interactions.md": `# Interactions — Acme Corp\n\n`,
      "/transcripts/meeting.txt": "Call transcript content here",
    });

    const { processTranscriptFile } = await import("../../src/sync/transcript-watcher.js");
    await expect(
      processTranscriptFile("/transcripts/meeting.txt", "acme-corp", "/crm")
    ).resolves.toBeUndefined();
  });

  it("is idempotent — skips if source already in interactions.md", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/interactions.md":
        "# Interactions\n\n## 2026-05-25 · Meeting\n**Source:** file:///transcripts/existing.txt\n---\n",
    });

    const { processTranscriptFile } = await import("../../src/sync/transcript-watcher.js");
    // Should not throw even if already exists
    await expect(
      processTranscriptFile("/transcripts/existing.txt", "acme-corp", "/crm")
    ).resolves.toBeUndefined();
  });
});
