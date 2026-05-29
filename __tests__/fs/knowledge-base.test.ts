import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";

function makeArticle(overrides: object = {}) {
  return {
    id: "how-to-reset",
    title: "How to Reset Password",
    category: "account",
    tags: ["password", "reset"],
    public: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    body: "## Problem\n\nCan't log in.\n\n## Solution\n\nClick forgot password.",
    ...overrides,
  };
}

// ─── writeKbArticle / listKbArticles ─────────────────────────────────────────

describe("writeKbArticle / listKbArticles", () => {
  it("round-trips an article with frontmatter", async () => {
    vol.fromJSON({});
    const { writeKbArticle, listKbArticles } = await import("../../src/fs/knowledge-base.js");
    writeKbArticle(DATA_DIR, makeArticle());
    const articles = listKbArticles(DATA_DIR);
    expect(articles).toHaveLength(1);
    expect(articles[0]?.id).toBe("how-to-reset");
    expect(articles[0]?.title).toBe("How to Reset Password");
    expect(articles[0]?.body).toContain("Click forgot password");
  });

  it("lists multiple articles across categories", async () => {
    vol.fromJSON({});
    const { writeKbArticle, listKbArticles } = await import("../../src/fs/knowledge-base.js");
    writeKbArticle(DATA_DIR, makeArticle({ id: "a1", category: "account" }));
    writeKbArticle(DATA_DIR, makeArticle({ id: "b1", category: "billing" }));
    const articles = listKbArticles(DATA_DIR);
    expect(articles).toHaveLength(2);
  });

  it("filters by category", async () => {
    vol.fromJSON({});
    const { writeKbArticle, listKbArticles } = await import("../../src/fs/knowledge-base.js");
    writeKbArticle(DATA_DIR, makeArticle({ id: "a1", category: "account" }));
    writeKbArticle(DATA_DIR, makeArticle({ id: "b1", category: "billing" }));
    const billing = listKbArticles(DATA_DIR, { category: "billing" });
    expect(billing).toHaveLength(1);
    expect(billing[0]?.id).toBe("b1");
  });

  it("filters public-only articles", async () => {
    vol.fromJSON({});
    const { writeKbArticle, listKbArticles } = await import("../../src/fs/knowledge-base.js");
    writeKbArticle(DATA_DIR, makeArticle({ id: "pub1", public: true }));
    writeKbArticle(DATA_DIR, makeArticle({ id: "priv1", public: false }));
    const pubOnly = listKbArticles(DATA_DIR, { publicOnly: true });
    expect(pubOnly).toHaveLength(1);
    expect(pubOnly[0]?.id).toBe("pub1");
  });

  it("returns empty array when kb dir missing", async () => {
    vol.fromJSON({});
    const { listKbArticles } = await import("../../src/fs/knowledge-base.js");
    expect(listKbArticles(DATA_DIR)).toEqual([]);
  });
});

// ─── getKbArticle ─────────────────────────────────────────────────────────────

describe("getKbArticle", () => {
  it("returns article by id", async () => {
    vol.fromJSON({});
    const { writeKbArticle, getKbArticle } = await import("../../src/fs/knowledge-base.js");
    writeKbArticle(DATA_DIR, makeArticle({ id: "faq-1" }));
    const found = getKbArticle(DATA_DIR, "faq-1");
    expect(found).not.toBeNull();
    expect(found?.id).toBe("faq-1");
  });

  it("returns null for unknown id", async () => {
    vol.fromJSON({});
    const { getKbArticle } = await import("../../src/fs/knowledge-base.js");
    expect(getKbArticle(DATA_DIR, "no-such-article")).toBeNull();
  });
});

// ─── deleteKbArticle ──────────────────────────────────────────────────────────

describe("deleteKbArticle", () => {
  it("deletes an existing article", async () => {
    vol.fromJSON({});
    const { writeKbArticle, deleteKbArticle, listKbArticles } = await import("../../src/fs/knowledge-base.js");
    writeKbArticle(DATA_DIR, makeArticle({ id: "del-me" }));
    const deleted = deleteKbArticle(DATA_DIR, "del-me");
    expect(deleted).toBe(true);
    expect(listKbArticles(DATA_DIR)).toHaveLength(0);
  });

  it("returns false for nonexistent article", async () => {
    vol.fromJSON({});
    const { deleteKbArticle } = await import("../../src/fs/knowledge-base.js");
    expect(deleteKbArticle(DATA_DIR, "ghost")).toBe(false);
  });
});

// ─── searchKbSimple ───────────────────────────────────────────────────────────

describe("searchKbSimple", () => {
  it("finds articles by title keyword", async () => {
    vol.fromJSON({});
    const { writeKbArticle, searchKbSimple } = await import("../../src/fs/knowledge-base.js");
    writeKbArticle(DATA_DIR, makeArticle({ id: "a", title: "Password Reset Guide", body: "How to reset your password.", tags: ["password"] }));
    writeKbArticle(DATA_DIR, makeArticle({ id: "b", title: "Billing FAQ", body: "Payment info and invoices.", tags: ["billing"] }));
    const results = searchKbSimple(DATA_DIR, "password");
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("a");
  });

  it("finds articles by body content", async () => {
    vol.fromJSON({});
    const { writeKbArticle, searchKbSimple } = await import("../../src/fs/knowledge-base.js");
    writeKbArticle(DATA_DIR, makeArticle({ id: "a", body: "Use SAML SSO for login." }));
    const results = searchKbSimple(DATA_DIR, "saml");
    expect(results).toHaveLength(1);
  });

  it("finds articles by tag", async () => {
    vol.fromJSON({});
    const { writeKbArticle, searchKbSimple } = await import("../../src/fs/knowledge-base.js");
    writeKbArticle(DATA_DIR, makeArticle({ id: "a", tags: ["api", "integration"] }));
    writeKbArticle(DATA_DIR, makeArticle({ id: "b", tags: ["billing"] }));
    const results = searchKbSimple(DATA_DIR, "api");
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("a");
  });

  it("returns empty for no matches", async () => {
    vol.fromJSON({});
    const { writeKbArticle, searchKbSimple } = await import("../../src/fs/knowledge-base.js");
    writeKbArticle(DATA_DIR, makeArticle({ id: "a", title: "Billing" }));
    expect(searchKbSimple(DATA_DIR, "xyzzy")).toHaveLength(0);
  });

  it("respects publicOnly filter", async () => {
    vol.fromJSON({});
    const { writeKbArticle, searchKbSimple } = await import("../../src/fs/knowledge-base.js");
    writeKbArticle(DATA_DIR, makeArticle({ id: "pub", public: true, title: "API Guide" }));
    writeKbArticle(DATA_DIR, makeArticle({ id: "priv", public: false, title: "API Internal" }));
    const results = searchKbSimple(DATA_DIR, "api", { publicOnly: true });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("pub");
  });
});
