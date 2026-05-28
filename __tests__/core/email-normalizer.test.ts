import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => { vi.resetModules(); });

describe("normalizeEmail", () => {
  it("lowercases plain email addresses", async () => {
    const { normalizeEmail } = await import("../../src/core/email-normalizer.js");
    expect(normalizeEmail("Alice@ACME.com")).toBe("alice@acme.com");
  });

  it("extracts email from RFC 5322 display-name format", async () => {
    const { normalizeEmail } = await import("../../src/core/email-normalizer.js");
    expect(normalizeEmail("John Doe <john@example.com>")).toBe("john@example.com");
  });

  it("handles display name with special characters", async () => {
    const { normalizeEmail } = await import("../../src/core/email-normalizer.js");
    expect(normalizeEmail('"Müller, Hans" <hans@mueller.de>')).toBe("hans@mueller.de");
  });

  it("trims surrounding whitespace", async () => {
    const { normalizeEmail } = await import("../../src/core/email-normalizer.js");
    expect(normalizeEmail("  alice@example.com  ")).toBe("alice@example.com");
  });

  it("returns empty string for empty input", async () => {
    const { normalizeEmail } = await import("../../src/core/email-normalizer.js");
    expect(normalizeEmail("")).toBe("");
  });

  it("handles address with uppercase domain", async () => {
    const { normalizeEmail } = await import("../../src/core/email-normalizer.js");
    expect(normalizeEmail("CEO <ceo@BigCorp.COM>")).toBe("ceo@bigcorp.com");
  });

  it("returns raw lowercased value when no angle brackets present", async () => {
    const { normalizeEmail } = await import("../../src/core/email-normalizer.js");
    expect(normalizeEmail("NO-AT-SIGN")).toBe("no-at-sign");
  });
});

describe("isSameContact", () => {
  it("returns true for identical normalized emails", async () => {
    const { isSameContact } = await import("../../src/core/email-normalizer.js");
    expect(isSameContact("alice@acme.com", "alice@acme.com")).toBe(true);
  });

  it("returns true for display-name vs plain email of same address", async () => {
    const { isSameContact } = await import("../../src/core/email-normalizer.js");
    expect(isSameContact("Alice <alice@acme.com>", "alice@acme.com")).toBe(true);
  });

  it("returns false for different email addresses", async () => {
    const { isSameContact } = await import("../../src/core/email-normalizer.js");
    expect(isSameContact("alice@acme.com", "bob@acme.com")).toBe(false);
  });

  it("ignores case differences", async () => {
    const { isSameContact } = await import("../../src/core/email-normalizer.js");
    expect(isSameContact("ALICE@ACME.COM", "alice@acme.com")).toBe(true);
  });
});

describe("normalizeContactId", () => {
  it("produces stable ID from display name format", async () => {
    const { normalizeContactId } = await import("../../src/core/email-normalizer.js");
    const id1 = normalizeContactId("Alice Smith <alice@acme.com>");
    const id2 = normalizeContactId("alice@acme.com");
    expect(id1).toBe(id2);
  });

  it("replaces @ and . with safe characters for use as object key", async () => {
    const { normalizeContactId } = await import("../../src/core/email-normalizer.js");
    const id = normalizeContactId("alice@acme.com");
    expect(id).not.toContain("@");
    expect(id).toMatch(/^[a-z0-9_.-]+$/);
  });
});
