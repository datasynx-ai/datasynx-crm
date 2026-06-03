import { describe, it, expect } from "vitest";
import { VERSION } from "../../src/version.js";

describe("VERSION", () => {
  it("is a semver string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("starts with 0.1", () => {
    expect(VERSION.startsWith("0.1")).toBe(true);
  });
});
