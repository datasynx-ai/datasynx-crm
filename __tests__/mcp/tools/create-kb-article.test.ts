import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

const DATA_DIR = "/data";

beforeEach(() => {
  vol.reset();
});

describe("handleCreateKbArticle", () => {
  it("creates article with defaults", async () => {
    vol.fromJSON({});
    const { handleCreateKbArticle } = await import("../../../src/mcp/tools/create-kb-article.js");
    const result = await handleCreateKbArticle(
      { id: "my-article", title: "My First Article", body: "This is the content." },
      DATA_DIR
    );
    const parsed = JSON.parse(result.content[0].text) as {
      id: string;
      title: string;
      category: string;
      path: string;
    };
    expect(parsed.id).toBe("my-article");
    expect(parsed.category).toBe("general");
    expect(parsed.path).toContain("my-article.md");
  });

  it("writes article file to disk", async () => {
    vol.fromJSON({});
    const { handleCreateKbArticle } = await import("../../../src/mcp/tools/create-kb-article.js");
    await handleCreateKbArticle(
      { id: "disk-test", title: "Disk Test", body: "Body text." },
      DATA_DIR
    );
    const { fs } = await import("memfs");
    const filePath = `${DATA_DIR}/.agentic/knowledge-base/general/disk-test.md`;
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8") as string;
    expect(content).toContain("Disk Test");
    expect(content).toContain("Body text.");
  });

  it("uses provided category", async () => {
    vol.fromJSON({});
    const { handleCreateKbArticle } = await import("../../../src/mcp/tools/create-kb-article.js");
    await handleCreateKbArticle(
      {
        id: "troubleshoot-api",
        title: "API Troubleshooting",
        body: "Steps...",
        category: "troubleshooting",
      },
      DATA_DIR
    );
    const { fs } = await import("memfs");
    expect(
      fs.existsSync(`${DATA_DIR}/.agentic/knowledge-base/troubleshooting/troubleshoot-api.md`)
    ).toBe(true);
  });

  it("returns error if article already exists", async () => {
    const existing = [
      "---",
      "id: existing-article",
      'title: "Existing"',
      "category: general",
      "tags: []",
      "public: false",
      "createdAt: '2026-05-30T10:00:00Z'",
      "updatedAt: '2026-05-30T10:00:00Z'",
      "---",
      "Body.",
    ].join("\n");
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/knowledge-base/general/existing-article.md`]: existing,
    });
    const { handleCreateKbArticle } = await import("../../../src/mcp/tools/create-kb-article.js");
    const result = await handleCreateKbArticle(
      { id: "existing-article", title: "Dup", body: "Dup body." },
      DATA_DIR
    );
    const parsed = JSON.parse(result.content[0].text) as { error: string };
    expect(parsed.error).toContain("existing-article");
  });

  it("stores sourceTicketId when provided", async () => {
    vol.fromJSON({});
    const { handleCreateKbArticle } = await import("../../../src/mcp/tools/create-kb-article.js");
    await handleCreateKbArticle(
      { id: "ticket-kb", title: "From Ticket", body: "Content.", sourceTicketId: "T-042" },
      DATA_DIR
    );
    const { fs } = await import("memfs");
    const content = fs.readFileSync(
      `${DATA_DIR}/.agentic/knowledge-base/general/ticket-kb.md`,
      "utf-8"
    ) as string;
    expect(content).toContain("T-042");
  });

  it("registered handler invokes handleCreateKbArticle with optional params", async () => {
    vol.fromJSON({});
    const { registerCreateKbArticle } = await import("../../../src/mcp/tools/create-kb-article.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerCreateKbArticle(fakeServer as never, DATA_DIR);
    const result = await capturedHandler!({
      id: "reg-article",
      title: "Registration Test",
      body: "Body content.",
      category: "howto",
      tags: ["test"],
      public: true,
      sourceTicketId: "T-001",
    });
    const parsed = JSON.parse(result.content[0]!.text) as { id: string };
    expect(parsed.id).toBe("reg-article");
  });

  it("marks article as public when requested", async () => {
    vol.fromJSON({});
    const { handleCreateKbArticle } = await import("../../../src/mcp/tools/create-kb-article.js");
    await handleCreateKbArticle(
      { id: "pub-article", title: "Public Article", body: "Public content.", public: true },
      DATA_DIR
    );
    const { fs } = await import("memfs");
    const content = fs.readFileSync(
      `${DATA_DIR}/.agentic/knowledge-base/general/pub-article.md`,
      "utf-8"
    ) as string;
    expect(content).toContain("public: true");
  });
});
