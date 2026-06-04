import { describe, it, expect } from "vitest";
import { escapeRegExp } from "../../src/core/regex.js";

describe("escapeRegExp", () => {
  it("escapes all regex metacharacters", () => {
    expect(escapeRegExp("a.b*c+d?")).toBe("a\\.b\\*c\\+d\\?");
    expect(escapeRegExp("(x)[y]{z}")).toBe("\\(x\\)\\[y\\]\\{z\\}");
    expect(escapeRegExp("^a$|b\\c")).toBe("\\^a\\$\\|b\\\\c");
  });

  it("leaves plain text unchanged", () => {
    expect(escapeRegExp("acme_corp 123")).toBe("acme_corp 123");
  });

  it("produces a pattern that matches the literal string only", () => {
    const literal = "a.b+c"; // would match "axbxxc" if unescaped
    const re = new RegExp(`^${escapeRegExp(literal)}$`);
    expect(re.test("a.b+c")).toBe(true);
    expect(re.test("axbxxc")).toBe(false);
  });
});
