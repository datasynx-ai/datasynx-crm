import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { KbArticle } from "../../src/schemas/kb-article.js";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockListKbArticles = vi.hoisted(() => vi.fn());
const mockGetKbArticle = vi.hoisted(() => vi.fn());
const mockWriteKbArticle = vi.hoisted(() => vi.fn());
const mockDeleteKbArticle = vi.hoisted(() => vi.fn());
const mockSearchKbSimple = vi.hoisted(() => vi.fn());

vi.mock("../../src/fs/knowledge-base.js", () => ({
  listKbArticles: mockListKbArticles,
  getKbArticle: mockGetKbArticle,
  writeKbArticle: mockWriteKbArticle,
  deleteKbArticle: mockDeleteKbArticle,
  searchKbSimple: mockSearchKbSimple,
}));

function makeArticle(overrides: Partial<KbArticle> = {}): KbArticle {
  return {
    id: "onboarding-faq",
    title: "Onboarding FAQ",
    category: "general",
    tags: ["onboarding"],
    public: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    body: "## Problem\n\nHow do I get started?\n\n## Solution\n\nRun dxcrm init.",
    ...overrides,
  };
}

const DATA_DIR = "/data";

describe("kbCommand — process.cwd() fallbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["DXCRM_DATA_DIR"];
    mockListKbArticles.mockReturnValue([]);
    mockGetKbArticle.mockReturnValue(makeArticle());
    mockSearchKbSimple.mockReturnValue([]);
    mockWriteKbArticle.mockImplementation(() => undefined);
    mockDeleteKbArticle.mockReturnValue(true);
  });

  afterEach(() => {
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("list uses process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "list"]);
    consoleSpy.mockRestore();
  });

  it("get uses process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "get", "onboarding-faq"]);
    consoleSpy.mockRestore();
  });

  it("search uses process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "search", "faq"]);
    consoleSpy.mockRestore();
  });

  it("create uses process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "create", "test-faq", "--title", "Test"]);
    consoleSpy.mockRestore();
  });

  it("delete uses process.cwd() when env not set", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "delete", "onboarding-faq"]);
    consoleSpy.mockRestore();
  });
});

describe("kbCommand get — article with no tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("shows (none) when article has no tags", async () => {
    mockGetKbArticle.mockReturnValue(makeArticle({ tags: [] }));
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "get", "onboarding-faq"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("(none)"));
    consoleSpy.mockRestore();
  });
});

describe("kbCommand list — with options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("passes category filter when --category is provided", async () => {
    mockListKbArticles.mockReturnValue([makeArticle()]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "list", "--category", "general"]);

    expect(mockListKbArticles).toHaveBeenCalledWith(
      DATA_DIR,
      expect.objectContaining({ category: "general" })
    );
    consoleSpy.mockRestore();
  });

  it("passes publicOnly when --public flag is used", async () => {
    mockListKbArticles.mockReturnValue([makeArticle({ public: true })]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "list", "--public"]);

    expect(mockListKbArticles).toHaveBeenCalledWith(
      DATA_DIR,
      expect.objectContaining({ publicOnly: true })
    );
    consoleSpy.mockRestore();
  });
});

describe("kbCommand list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("shows KB articles", async () => {
    mockListKbArticles.mockReturnValue([makeArticle()]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("onboarding-faq"));
    consoleSpy.mockRestore();
  });

  it("shows 'No articles found' when empty", async () => {
    mockListKbArticles.mockReturnValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No articles"));
    consoleSpy.mockRestore();
  });

  it("shows public articles with [public] tag", async () => {
    mockListKbArticles.mockReturnValue([makeArticle({ public: true })]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "list"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[public]"));
    consoleSpy.mockRestore();
  });
});

describe("kbCommand get", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("prints article body", async () => {
    mockGetKbArticle.mockReturnValue(makeArticle());
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "get", "onboarding-faq"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Onboarding FAQ"));
    consoleSpy.mockRestore();
  });

  it("exits when article not found", async () => {
    mockGetKbArticle.mockReturnValue(null);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as () => never);

    const { kbCommand } = await import("../../src/commands/kb.js");
    await expect(kbCommand.parseAsync(["node", "kb", "get", "no-such-article"])).rejects.toThrow(
      "process.exit"
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("kbCommand search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("shows search results", async () => {
    mockSearchKbSimple.mockReturnValue([makeArticle()]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "search", "onboarding"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Onboarding FAQ"));
    consoleSpy.mockRestore();
  });

  it("shows 'No results' when search is empty", async () => {
    mockSearchKbSimple.mockReturnValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "search", "zzznomatch"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No results"));
    consoleSpy.mockRestore();
  });

  it("passes publicOnly option when --public flag is used", async () => {
    mockSearchKbSimple.mockReturnValue([makeArticle()]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "search", "faq", "--public"]);

    expect(mockSearchKbSimple).toHaveBeenCalledWith(
      DATA_DIR,
      "faq",
      expect.objectContaining({ publicOnly: true })
    );
    consoleSpy.mockRestore();
  });
});

describe("kbCommand create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
    mockWriteKbArticle.mockImplementation(() => undefined);
  });

  it("creates an article", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "create", "new-faq", "--title", "New FAQ"]);

    expect(mockWriteKbArticle).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("created"));
    consoleSpy.mockRestore();
  });

  it("includes sourceTicketId when --ticket option is given", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync([
      "node",
      "kb",
      "create",
      "ticket-faq",
      "--title",
      "Ticket FAQ",
      "--ticket",
      "T-42",
    ]);

    expect(mockWriteKbArticle).toHaveBeenCalledWith(
      DATA_DIR,
      expect.objectContaining({ sourceTicketId: "T-42" })
    );
    consoleSpy.mockRestore();
  });
});

describe("kbCommand delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["DXCRM_DATA_DIR"] = DATA_DIR;
  });

  it("deletes existing article", async () => {
    mockDeleteKbArticle.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { kbCommand } = await import("../../src/commands/kb.js");
    await kbCommand.parseAsync(["node", "kb", "delete", "onboarding-faq"]);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("deleted"));
    consoleSpy.mockRestore();
  });

  it("exits when article not found for deletion", async () => {
    mockDeleteKbArticle.mockReturnValue(false);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as () => never);

    const { kbCommand } = await import("../../src/commands/kb.js");
    await expect(kbCommand.parseAsync(["node", "kb", "delete", "no-such"])).rejects.toThrow(
      "process.exit"
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
