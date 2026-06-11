#!/usr/bin/env tsx
/**
 * Deprecated-dependency regression guard (#85): fails the build if a known
 * deprecated transitive package re-enters the tree. Offline, CI-friendly —
 * reads `package-lock.json` only, Node built-ins only.
 *
 * Background: issue #85's deprecated cluster (glob@7, inflight, rimraf@2,
 * fstream, lodash.isequal) was rooted in `exceljs` (production) and
 * `license-checker` (dev). Both were replaced (read-excel-file / write-excel-file
 * and license-checker-rseidelsohn), removing the cluster. This guard prevents it
 * from creeping back via a future dependency bump.
 *
 * Residual tracking (#87, re-checked 2026-06-12):
 *  - boolean@3 — RESOLVED. It came in via
 *    @huggingface/transformers → onnxruntime-node → global-agent@3. global-agent@4
 *    dropped its `boolean` dependency, so an `overrides: { "global-agent": "^4.1.3" }`
 *    in package.json removes it from the tree (verified: build, full suite, and a
 *    real embedding run all green; onnxruntime-node@1.24.3 runs fine under
 *    global-agent@4). boolean is now on the DENYLIST so it cannot creep back.
 *  - node-domexception@1 — STILL BLOCKED, accepted upstream-only residual. Chain:
 *    google-auth-library → gaxios → node-fetch@3 → fetch-blob@3 → node-domexception@1.
 *    No semver-safe override exists: fetch-blob@4 still declares
 *    node-domexception@^1, and gaxios@latest still depends on node-fetch@3. Resolves
 *    when gaxios/google-auth-library move off node-fetch@3 (e.g. to native fetch).
 *
 * Exit code 1 with a findings list when a denylisted package is present.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * A package is a violation when its name matches and — if `maxMajorExclusive`
 * is set — its major version is below that bound. Bare entries match any
 * version (the package is unsupported at every release).
 */
export interface DenyRule {
  name: string;
  /** Flag only when major version < this value (e.g. glob < 9, rimraf < 4). */
  maxMajorExclusive?: number;
  /** Short human-readable reason, shown in the failure output. */
  reason: string;
}

export const DENYLIST: DenyRule[] = [
  { name: "lodash.isequal", reason: "deprecated; use node:util.isDeepStrictEqual" },
  { name: "inflight", reason: "memory leak, unsupported" },
  { name: "fstream", reason: "unsupported" },
  { name: "rimraf", maxMajorExclusive: 4, reason: "versions < 4 are unsupported" },
  { name: "glob", maxMajorExclusive: 9, reason: "versions < 9 carry known advisories" },
  { name: "boolean", reason: "deprecated; removed by forcing global-agent@^4 (#87)" },
];

/** Deprecated transitives we knowingly accept (upstream-only, no safe override). */
export const ACCEPTED_RESIDUALS: string[] = ["node-domexception"];

export interface Violation {
  name: string;
  version: string;
  path: string;
  reason: string;
}

interface Lockfile {
  packages?: Record<string, { version?: string }>;
}

/** Derive the package name from a lockfile `packages` key (handles nesting + scopes). */
function packageName(lockKey: string): string {
  // e.g. "node_modules/a/node_modules/@scope/glob" → "@scope/glob"
  const segments = lockKey.split("node_modules/");
  return segments[segments.length - 1] ?? "";
}

function majorOf(version: string): number {
  return Number.parseInt(version.split(".")[0] ?? "", 10);
}

/** Return every denylisted package present in the given parsed lockfile. */
export function findDeprecatedDeps(lock: Lockfile): Violation[] {
  const violations: Violation[] = [];
  const packages = lock.packages ?? {};
  for (const [key, info] of Object.entries(packages)) {
    if (key === "" || !info?.version) continue;
    const name = packageName(key);
    const rule = DENYLIST.find((r) => r.name === name);
    if (!rule) continue;
    if (rule.maxMajorExclusive !== undefined && majorOf(info.version) >= rule.maxMajorExclusive) {
      continue;
    }
    violations.push({ name, version: info.version, path: key, reason: rule.reason });
  }
  return violations;
}

function main(): void {
  const lockPath = path.join(ROOT, "package-lock.json");
  if (!fs.existsSync(lockPath)) {
    console.error(`✗ package-lock.json not found at ${lockPath}`);
    process.exit(1);
  }
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8")) as Lockfile;
  const violations = findDeprecatedDeps(lock);

  if (violations.length > 0) {
    console.error(`✗ ${violations.length} deprecated dependency regression(s) (#85 guard):\n`);
    for (const v of violations) {
      console.error(`  ${v.name}@${v.version} — ${v.reason}\n    at ${v.path}`);
    }
    console.error(
      `\nThese deprecated packages must not re-enter the tree. Find the new parent` +
        ` with \`npm ls ${violations[0]?.name}\` and bump or replace it, or — if it is a` +
        ` genuine upstream-only residual — add it to ACCEPTED_RESIDUALS / DENYLIST in` +
        ` scripts/check-deprecated-deps.ts with justification.`
    );
    process.exit(1);
  }
  console.log(
    `✓ no denylisted deprecated dependencies in package-lock.json` +
      ` (accepted residuals: ${ACCEPTED_RESIDUALS.join(", ")})`
  );
}

// Run only when invoked directly (not when imported by the unit test).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
