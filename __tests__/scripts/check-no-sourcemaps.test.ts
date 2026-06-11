import { describe, it, expect } from "vitest";
import { findSourcemaps } from "../../scripts/check-no-sourcemaps.js";

describe("findSourcemaps", () => {
  it("flags JavaScript sourcemaps (.js.map / .cjs.map)", () => {
    expect(
      findSourcemaps(["dist/index.js", "dist/index.js.map", "dist/index.cjs", "dist/index.cjs.map"])
    ).toEqual(["dist/index.js.map", "dist/index.cjs.map"]);
  });

  it("flags declaration sourcemaps (.d.ts.map / .d.cts.map)", () => {
    expect(
      findSourcemaps(["dist/index.d.ts", "dist/index.d.ts.map", "dist/index.d.cts.map"])
    ).toEqual(["dist/index.d.ts.map", "dist/index.d.cts.map"]);
  });

  it("does NOT flag the emitted code or type files themselves", () => {
    expect(
      findSourcemaps(["dist/cli.js", "dist/index.cjs", "dist/index.d.ts", "README.md", "LICENSE"])
    ).toEqual([]);
  });

  it("detects sourcemaps nested in subdirectories", () => {
    expect(findSourcemaps(["dist/daemon/worker.js", "dist/daemon/worker.js.map"])).toEqual([
      "dist/daemon/worker.js.map",
    ]);
  });

  it("returns an empty array for a clean (map-free) publish set", () => {
    expect(findSourcemaps([])).toEqual([]);
    expect(findSourcemaps(["dist/index.js", "dist/index.d.ts"])).toEqual([]);
  });
});
