import { describe, it, expect } from "vitest";
import {
  findDeprecatedDeps,
  DENYLIST,
  ACCEPTED_RESIDUALS,
} from "../../scripts/check-deprecated-deps.js";

/** Build a minimal npm lockfile (v3 `packages` shape) from name@version pairs. */
function lockfile(pkgs: Array<{ path: string; version: string }>): {
  packages: Record<string, { version: string }>;
} {
  const packages: Record<string, { version: string }> = { "": { version: "0.0.0" } };
  for (const { path, version } of pkgs) packages[path] = { version };
  return { packages };
}

describe("findDeprecatedDeps", () => {
  it("flags a legacy glob@7", () => {
    const v = findDeprecatedDeps(lockfile([{ path: "node_modules/glob", version: "7.2.3" }]));
    expect(v.map((x) => x.name)).toContain("glob");
  });

  it("flags inflight, fstream, lodash.isequal at any version and rimraf < 4", () => {
    const v = findDeprecatedDeps(
      lockfile([
        { path: "node_modules/inflight", version: "1.0.6" },
        { path: "node_modules/fstream", version: "1.0.12" },
        { path: "node_modules/lodash.isequal", version: "4.5.0" },
        { path: "node_modules/rimraf", version: "2.7.1" },
      ])
    );
    expect(v.map((x) => x.name).sort()).toEqual(
      ["fstream", "inflight", "lodash.isequal", "rimraf"].sort()
    );
  });

  it("does NOT flag modern glob (>=9) or rimraf (>=4)", () => {
    const v = findDeprecatedDeps(
      lockfile([
        { path: "node_modules/glob", version: "13.0.6" },
        { path: "node_modules/rimraf", version: "5.0.10" },
      ])
    );
    expect(v).toEqual([]);
  });

  it("does NOT flag the accepted upstream-only residuals", () => {
    const v = findDeprecatedDeps(
      lockfile([
        { path: "node_modules/boolean", version: "3.2.0" },
        { path: "node_modules/node-domexception", version: "1.0.0" },
      ])
    );
    expect(v).toEqual([]);
    // and they are documented as accepted residuals
    expect(ACCEPTED_RESIDUALS).toEqual(expect.arrayContaining(["boolean", "node-domexception"]));
  });

  it("detects a denylisted package nested under another node_modules", () => {
    const v = findDeprecatedDeps(
      lockfile([{ path: "node_modules/some-pkg/node_modules/glob", version: "7.2.3" }])
    );
    expect(v[0]?.name).toBe("glob");
    expect(v[0]?.path).toContain("some-pkg");
  });

  it("passes a clean lockfile", () => {
    const v = findDeprecatedDeps(
      lockfile([
        { path: "node_modules/read-excel-file", version: "9.2.0" },
        { path: "node_modules/glob", version: "13.0.6" },
      ])
    );
    expect(v).toEqual([]);
  });

  it("exports a non-empty denylist covering the issue's named packages", () => {
    const names = DENYLIST.map((r) => r.name);
    for (const n of ["glob", "rimraf", "inflight", "fstream", "lodash.isequal"]) {
      expect(names).toContain(n);
    }
  });
});
