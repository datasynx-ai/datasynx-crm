import { describe, it } from "vitest";
import fc from "fast-check";
import path from "node:path";
import { isSafePathSegment, assertSafePathSegment } from "../../src/fs/safe-path.js";

// Deterministic runs so CI never flakes on a random seed.
const RUNS = { numRuns: 1000, seed: 0x5afe } as const;

describe("isSafePathSegment — properties", () => {
  it("a segment it accepts can never escape its parent directory", () => {
    const base = path.resolve("/srv/crm/customers");
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (seg) => {
        fc.pre(isSafePathSegment(seg));
        const resolved = path.resolve(base, seg);
        // The resolved path must stay strictly inside `base`.
        return resolved === path.join(base, seg) && resolved.startsWith(base + path.sep);
      }),
      RUNS
    );
  });

  it("never accepts a string containing a separator, NUL, or traversal", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (seg) => {
        if (seg.includes("/") || seg.includes("\\") || seg.includes("\0") || seg.includes("..")) {
          return isSafePathSegment(seg) === false;
        }
        return true;
      }),
      RUNS
    );
  });

  it("only ever accepts strings of length 1..128 that are not '.'", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (seg) => {
        if (!isSafePathSegment(seg)) return true;
        return typeof seg === "string" && seg.length >= 1 && seg.length <= 128 && seg !== ".";
      }),
      RUNS
    );
  });

  it("rejects every non-string input", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
          fc.object(),
          fc.array(fc.anything())
        ),
        (value) => isSafePathSegment(value) === false
      ),
      RUNS
    );
  });

  it("assertSafePathSegment throws iff isSafePathSegment is false", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (seg) => {
        const safe = isSafePathSegment(seg);
        let threw = false;
        try {
          assertSafePathSegment(seg);
        } catch {
          threw = true;
        }
        return threw === !safe;
      }),
      RUNS
    );
  });
});
