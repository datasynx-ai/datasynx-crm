import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

const DATA_DIR = "/data";

function makeArticle(
  id: string,
  title: string,
  body: string,
  category = "general",
  tags: string[] = [],
  pub = false
): string {
  return [
    "---",
    `id: ${id}`,
    `title: "${title}"`,
    `category: ${category}`,
    `tags: [${tags.map((t) => `"${t}"`).join(", ")}]`,
    `public: ${pub}`,
    `createdAt: '2026-05-30T10:00:00Z'`,
    `updatedAt: '2026-05-30T10:00:00Z'`,
    "---",
    body,
  ].join("\n");
}

beforeEach(() => {
  vol.reset();
});

describe("handleSearchKnowledgeBase", () => {
  it("returns empty when no articles", async () => {
    vol.fromJSON({});
    const { handleSearchKnowledgeBase } =
      await import("../../../src/mcp/tools/search-knowledge-base.js");
    const result = await handleSearchKnowledgeBase({ query: "timeout" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { count: number };
    expect(parsed.count).toBe(0);
  });

  it("finds articles by title match", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/knowledge-base/general/api-timeout.md`]: makeArticle(
        "api-timeout",
        "API Timeout Fix",
        "Increase the timeout in config."
      ),
      [`${DATA_DIR}/.agentic/knowledge-base/general/login-issue.md`]: makeArticle(
        "login-issue",
        "Login Problems",
        "Clear your cookie cache."
      ),
    });
    const { handleSearchKnowledgeBase } =
      await import("../../../src/mcp/tools/search-knowledge-base.js");
    const result = await handleSearchKnowledgeBase({ query: "timeout" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { count: number };
    expect(parsed.count).toBe(1);
  });

  it("finds articles by body content", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/knowledge-base/general/guide.md`]: makeArticle(
        "guide",
        "Setup Guide",
        "Use the API_KEY environment variable."
      ),
    });
    const { handleSearchKnowledgeBase } =
      await import("../../../src/mcp/tools/search-knowledge-base.js");
    const result = await handleSearchKnowledgeBase({ query: "API_KEY" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { count: number };
    expect(parsed.count).toBe(1);
  });

  it("filters by category", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/knowledge-base/general/a.md`]: makeArticle(
        "a",
        "General Article",
        "Content A",
        "general"
      ),
      [`${DATA_DIR}/.agentic/knowledge-base/howto/b.md`]: makeArticle(
        "b",
        "How to Article",
        "Content B",
        "howto"
      ),
    });
    const { handleSearchKnowledgeBase } =
      await import("../../../src/mcp/tools/search-knowledge-base.js");
    const result = await handleSearchKnowledgeBase(
      { query: "Article", category: "howto" },
      DATA_DIR
    );
    const parsed = JSON.parse(result.content[0].text) as {
      count: number;
      articles: Array<{ id: string }>;
    };
    expect(parsed.count).toBe(1);
    expect(parsed.articles[0].id).toBe("b");
  });

  it("filters publicOnly", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/knowledge-base/general/pub.md`]: makeArticle(
        "pub",
        "Public Article",
        "Public content",
        "general",
        [],
        true
      ),
      [`${DATA_DIR}/.agentic/knowledge-base/general/priv.md`]: makeArticle(
        "priv",
        "Private Article",
        "Private content",
        "general",
        [],
        false
      ),
    });
    const { handleSearchKnowledgeBase } =
      await import("../../../src/mcp/tools/search-knowledge-base.js");
    const result = await handleSearchKnowledgeBase(
      { query: "Article", publicOnly: true },
      DATA_DIR
    );
    const parsed = JSON.parse(result.content[0].text) as {
      count: number;
      articles: Array<{ id: string }>;
    };
    expect(parsed.count).toBe(1);
    expect(parsed.articles[0].id).toBe("pub");
  });

  it("respects limit", async () => {
    const files: Record<string, string> = {};
    for (let i = 1; i <= 5; i++) {
      files[`${DATA_DIR}/.agentic/knowledge-base/general/art-${i}.md`] = makeArticle(
        `art-${i}`,
        `Article ${i}`,
        "Common content"
      );
    }
    vol.fromJSON(files);
    const { handleSearchKnowledgeBase } =
      await import("../../../src/mcp/tools/search-knowledge-base.js");
    const result = await handleSearchKnowledgeBase({ query: "Common", limit: 3 }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { count: number };
    expect(parsed.count).toBe(3);
  });

  it("includes excerpt in results", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/knowledge-base/general/art.md`]: makeArticle(
        "art",
        "Test Article",
        "This is the body content."
      ),
    });
    const { handleSearchKnowledgeBase } =
      await import("../../../src/mcp/tools/search-knowledge-base.js");
    const result = await handleSearchKnowledgeBase({ query: "body" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { articles: Array<{ excerpt: string }> };
    expect(parsed.articles[0].excerpt).toContain("body content");
  });

  it("registered handler invokes handleSearchKnowledgeBase with optional params", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/knowledge-base/general/art.md`]: makeArticle("a1", "Test", "Body"),
    });
    const { registerSearchKnowledgeBase } =
      await import("../../../src/mcp/tools/search-knowledge-base.js");
    type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
    let capturedHandler: Handler | undefined;
    const fakeServer = {
      registerTool: (_name: string, _schema: unknown, handler: Handler) => {
        capturedHandler = handler;
      },
    };
    registerSearchKnowledgeBase(fakeServer as never, DATA_DIR);
    const result = await capturedHandler!({
      query: "Test",
      category: "general",
      publicOnly: false,
      limit: 5,
    });
    const parsed = JSON.parse(result.content[0]!.text) as { articles: unknown[] };
    expect(Array.isArray(parsed.articles)).toBe(true);
  });
});
