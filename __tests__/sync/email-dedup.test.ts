import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("normalizeSubject", () => {
  it("strips Re: prefix", async () => {
    const { normalizeSubject } = await import("../../src/sync/email-dedup.js");
    expect(normalizeSubject("Re: Hello there")).toBe("hello there");
  });

  it("strips Fwd: prefix", async () => {
    const { normalizeSubject } = await import("../../src/sync/email-dedup.js");
    expect(normalizeSubject("Fwd: Hello there")).toBe("hello there");
  });

  it("strips AW: prefix (German reply)", async () => {
    const { normalizeSubject } = await import("../../src/sync/email-dedup.js");
    expect(normalizeSubject("AW: Hallo Welt")).toBe("hallo welt");
  });

  it("strips WG: prefix (German forward)", async () => {
    const { normalizeSubject } = await import("../../src/sync/email-dedup.js");
    expect(normalizeSubject("WG: Hallo Welt")).toBe("hallo welt");
  });

  it("strips case-insensitively", async () => {
    const { normalizeSubject } = await import("../../src/sync/email-dedup.js");
    expect(normalizeSubject("RE: Test")).toBe("test");
    expect(normalizeSubject("fwd: Test")).toBe("test");
  });

  it("strips multiple prefixes", async () => {
    const { normalizeSubject } = await import("../../src/sync/email-dedup.js");
    expect(normalizeSubject("Re: Fwd: Hello")).toBe("hello");
  });

  it("trims whitespace", async () => {
    const { normalizeSubject } = await import("../../src/sync/email-dedup.js");
    expect(normalizeSubject("  Hello World  ")).toBe("hello world");
  });
});

describe("deduplicateRefs", () => {
  it("uses messageId when present", async () => {
    const { deduplicateRefs } = await import("../../src/sync/email-dedup.js");
    const ref = { messageId: "<msg123@example.com>", threadId: "t1" };
    const result = deduplicateRefs(ref);
    expect(result).toContain("msg123");
  });

  it("falls back to threadId when no messageId", async () => {
    const { deduplicateRefs } = await import("../../src/sync/email-dedup.js");
    const ref = { threadId: "thread-abc" };
    const result = deduplicateRefs(ref);
    expect(result).toContain("thread-abc");
  });

  it("falls back to hash when neither messageId nor threadId", async () => {
    const { deduplicateRefs } = await import("../../src/sync/email-dedup.js");
    const ref = { subject: "Hello World", from: "alice@example.com", date: "2026-05-01" };
    const result = deduplicateRefs(ref);
    expect(result).toMatch(/^hash:\/\//);
  });

  it("produces the same hash for identical inputs (deterministic)", async () => {
    const { deduplicateRefs } = await import("../../src/sync/email-dedup.js");
    const ref = { subject: "Test Subject", from: "bob@example.com", date: "2026-05-10" };
    expect(deduplicateRefs(ref)).toBe(deduplicateRefs(ref));
  });

  it("cross-provider: same hash for display-name vs bare email in from field", async () => {
    const { deduplicateRefs } = await import("../../src/sync/email-dedup.js");
    const gmailRef = { subject: "Meeting", from: "Alice <alice@acme.com>", date: "2026-05-10" };
    const msRef = { subject: "Meeting", from: "alice@acme.com", date: "2026-05-10" };
    // Both should produce the same hash since the email address is identical after normalization
    expect(deduplicateRefs(gmailRef)).toBe(deduplicateRefs(msRef));
  });
});

describe("isLikelySameThread", () => {
  it("returns true when threadIds match", async () => {
    const { isLikelySameThread } = await import("../../src/sync/email-dedup.js");
    const a = { threadId: "t1", subject: "Hello", from: "a@b.com" };
    const b = { threadId: "t1", subject: "Re: Hello", from: "b@a.com" };
    expect(isLikelySameThread(a, b)).toBe(true);
  });

  it("returns true when messageIds match and no threadId", async () => {
    const { isLikelySameThread } = await import("../../src/sync/email-dedup.js");
    const a = { messageId: "msg1", subject: "Hello", from: "a@b.com" };
    const b = { messageId: "msg1", subject: "Hello", from: "a@b.com" };
    expect(isLikelySameThread(a, b)).toBe(true);
  });

  it("returns true when normalized subject and from match", async () => {
    const { isLikelySameThread } = await import("../../src/sync/email-dedup.js");
    const a = { subject: "Hello World", from: "alice@example.com" };
    const b = { subject: "Re: Hello World", from: "alice@example.com" };
    expect(isLikelySameThread(a, b)).toBe(true);
  });

  it("returns false when subject differs", async () => {
    const { isLikelySameThread } = await import("../../src/sync/email-dedup.js");
    const a = { subject: "Hello World", from: "alice@example.com" };
    const b = { subject: "Different Topic", from: "alice@example.com" };
    expect(isLikelySameThread(a, b)).toBe(false);
  });

  it("cross-provider: matches display-name format with bare email", async () => {
    const { isLikelySameThread } = await import("../../src/sync/email-dedup.js");
    // Gmail sends "Alice Smith <alice@acme.com>", Microsoft Graph sends "alice@acme.com"
    const a = { subject: "Project Update", from: "Alice Smith <alice@acme.com>" };
    const b = { subject: "Project Update", from: "alice@acme.com" };
    expect(isLikelySameThread(a, b)).toBe(true);
  });

  it("cross-provider: matches case-insensitive emails across providers", async () => {
    const { isLikelySameThread } = await import("../../src/sync/email-dedup.js");
    const a = { subject: "Invoice", from: "ALICE@ACME.COM" };
    const b = { subject: "Invoice", from: "alice@acme.com" };
    expect(isLikelySameThread(a, b)).toBe(true);
  });

  it("cross-provider: quoted display-name matches bare email", async () => {
    const { isLikelySameThread } = await import("../../src/sync/email-dedup.js");
    const a = { subject: "Meeting", from: '"Müller, Hans" <hans@acme.de>' };
    const b = { subject: "Meeting", from: "hans@acme.de" };
    expect(isLikelySameThread(a, b)).toBe(true);
  });
});

describe("isAlreadySynced", () => {
  it("returns true when sourceRef appears in existing string", async () => {
    const { isAlreadySynced } = await import("../../src/sync/email-dedup.js");
    const existing = "some content\nhubspot-notes-123\nmore content";
    expect(isAlreadySynced(existing, "hubspot-notes-123")).toBe(true);
  });

  it("returns false when sourceRef not in string", async () => {
    const { isAlreadySynced } = await import("../../src/sync/email-dedup.js");
    const existing = "some content\nhubspot-notes-456\nmore content";
    expect(isAlreadySynced(existing, "hubspot-notes-123")).toBe(false);
  });
});
