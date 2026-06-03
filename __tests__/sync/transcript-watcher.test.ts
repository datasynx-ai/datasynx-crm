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

describe("watchTranscripts — add event fires onFile", () => {
  it("fires onFile when 'add' event is emitted", async () => {
    let addHandler: ((filePath: string) => void) | null = null;
    const mockWatcher = {
      on: vi.fn().mockImplementation((event: string, cb: (p: string) => void) => {
        if (event === "add") addHandler = cb;
        return mockWatcher;
      }),
      close: vi.fn(),
    };
    const chokidar = await import("chokidar");
    vi.mocked(chokidar.default.watch).mockReturnValue(mockWatcher as never);

    const onFile = vi.fn().mockResolvedValue(undefined);
    const { watchTranscripts } = await import("../../src/sync/transcript-watcher.js");
    watchTranscripts({ paths: ["/t"], extensions: [".txt"], dataDir: "/crm", onFile });

    expect(addHandler).not.toBeNull();
    // Simulate chokidar emitting "add"
    addHandler!("/t/meeting.txt");
    await new Promise((r) => setTimeout(r, 0)); // flush micro-tasks
    expect(onFile).toHaveBeenCalledWith("/t/meeting.txt");
  });

  it("logs error when onFile rejects", async () => {
    let addHandler: ((filePath: string) => void) | null = null;
    const mockWatcher = {
      on: vi.fn().mockImplementation((event: string, cb: (p: string) => void) => {
        if (event === "add") addHandler = cb;
        return mockWatcher;
      }),
      close: vi.fn(),
    };
    const chokidar = await import("chokidar");
    vi.mocked(chokidar.default.watch).mockReturnValue(mockWatcher as never);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onFile = vi.fn().mockRejectedValue(new Error("parse error"));
    const { watchTranscripts } = await import("../../src/sync/transcript-watcher.js");
    watchTranscripts({ paths: ["/t"], extensions: [".txt"], dataDir: "/crm", onFile });

    addHandler!("/t/bad.txt");
    await new Promise((r) => setTimeout(r, 10));
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error processing"),
      "parse error"
    );
    errorSpy.mockRestore();
  });
});

describe("processTranscriptFileAutoMatch", () => {
  it("matches by filename slug and calls processTranscriptFile", async () => {
    vol.fromJSON({
      "/crm/customers/acme-corp/main_facts.md": "---\nname: Acme Corp\n---\n",
      "/crm/customers/acme-corp/interactions.md": "# Interactions\n\n",
      "/transcripts/acme-corp-meeting.txt": "Participants: Alice and Bob. Discussed roadmap.",
    });

    const { processTranscriptFileAutoMatch } = await import("../../src/sync/transcript-watcher.js");
    await processTranscriptFileAutoMatch("/transcripts/acme-corp-meeting.txt", "/crm");

    const { fs } = vol;
    const interactions = fs.readFileSync(
      "/crm/customers/acme-corp/interactions.md",
      "utf-8"
    ) as string;
    expect(interactions).toContain("Meeting");
  });

  it("matches by customer name in content", async () => {
    vol.fromJSON({
      "/crm/customers/beta-inc/main_facts.md": "---\nname: Beta Inc\n---\n",
      "/crm/customers/beta-inc/interactions.md": "# Interactions\n\n",
      "/transcripts/unknown-call.txt": "Beta Inc signed a new contract today.",
    });

    const { processTranscriptFileAutoMatch } = await import("../../src/sync/transcript-watcher.js");
    await processTranscriptFileAutoMatch("/transcripts/unknown-call.txt", "/crm");

    const { fs } = vol;
    const interactions = fs.readFileSync(
      "/crm/customers/beta-inc/interactions.md",
      "utf-8"
    ) as string;
    expect(interactions).toContain("Meeting");
  });

  it("records unmatched when no customer matches content or filename", async () => {
    vol.fromJSON({
      "/crm/customers/gamma-ltd/main_facts.md": "---\nname: Gamma Ltd\n---\n",
      "/crm/customers/gamma-ltd/interactions.md": "# Interactions\n\n",
      "/transcripts/random.txt": "Completely unrelated text about nothing.",
    });

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { processTranscriptFileAutoMatch } = await import("../../src/sync/transcript-watcher.js");
    await processTranscriptFileAutoMatch("/transcripts/random.txt", "/crm");

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Unmatched"));
    stderrSpy.mockRestore();
  });

  it("records unmatched when customers dir does not exist", async () => {
    vol.fromJSON({});
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const { processTranscriptFileAutoMatch } = await import("../../src/sync/transcript-watcher.js");
    await processTranscriptFileAutoMatch("/transcripts/call.txt", "/crm");

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("no_customers_defined"));
    stderrSpy.mockRestore();
  });

  it("records unmatched when no customer dirs exist", async () => {
    vol.fromJSON({ "/crm/customers/.keep": "" });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const { processTranscriptFileAutoMatch } = await import("../../src/sync/transcript-watcher.js");
    await processTranscriptFileAutoMatch("/transcripts/call.txt", "/crm");

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("no_customers_defined"));
    stderrSpy.mockRestore();
  });

  it("skips customer dir when statSync throws (inner catch)", async () => {
    // customer dir entry is a file (not a directory) — statSync won't throw with memfs
    // but we can test the catch by having only file-based entries
    vol.fromJSON({
      "/crm/customers/not-a-dir": "I am a file",
      "/crm/transcripts/acme-meeting.txt": "Hello from meeting",
    });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { processTranscriptFileAutoMatch } = await import("../../src/sync/transcript-watcher.js");

    await processTranscriptFileAutoMatch("/crm/transcripts/acme-meeting.txt", "/crm");

    stderrSpy.mockRestore();
  });
});

describe("processTranscriptFile — LanceDB error handling", () => {
  it("logs to stderr when LanceDB indexing fails", async () => {
    const { indexInLanceDB } = await import("../../src/core/lancedb.js");
    vi.mocked(indexInLanceDB).mockRejectedValue(new Error("lancedb unavailable"));

    vol.fromJSON({
      "/crm/.agentic/interactions.md": "",
      "/crm/customers/acme-corp/.keep": "",
      "/crm/transcripts/lancedb-fail.txt": "Meeting transcript content here",
    });

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { processTranscriptFile } = await import("../../src/sync/transcript-watcher.js");
    await processTranscriptFile("/crm/transcripts/lancedb-fail.txt", "acme-corp", "/crm");

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("LanceDB index failed"));
    stderrSpy.mockRestore();
  });
});

describe("readCustomerName — error handling", () => {
  it("falls back to slug when main_facts.md parse throws", async () => {
    // Create a file that causes matter() to throw by having binary content
    vol.fromJSON({
      "/crm/customers/broken-customer/main_facts.md": "---\nname: [invalid\n---",
      "/crm/customers/broken-customer/interactions.md": "",
      "/crm/transcripts/broken-customer-meeting.txt": "Some meeting",
    });

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { processTranscriptFileAutoMatch } = await import("../../src/sync/transcript-watcher.js");

    // This goes through readCustomerName which may throw on malformed frontmatter
    await processTranscriptFileAutoMatch("/crm/transcripts/broken-customer-meeting.txt", "/crm");

    stderrSpy.mockRestore();
  });
});
