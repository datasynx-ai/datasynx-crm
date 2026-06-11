#!/usr/bin/env tsx
/**
 * Sourcemap publish guard: fails the build if the published package would ship
 * any sourcemap (`.map`) file. The package ships only the built `dist/` plus
 * README/LICENSE (`files` in package.json) — it does NOT ship the TypeScript
 * source the maps point at, so sourcemaps only bloat the tarball. Before this
 * guard, `.js.map` + `.cjs.map` accounted for ~66% of the unpacked package size.
 *
 * Offline, CI-friendly: inspects the exact file list that `npm pack` would
 * publish (`npm pack --dry-run --json`), so it respects the `files` field and
 * catches maps regardless of which build step produced them.
 *
 * Maps are disabled at the source in the build config (`tsdown` `sourcemap:
 * false`) and the type build (`tsconfig` `declarationMap: false`); this guard is
 * the regression net that keeps them out if either is ever flipped back on.
 *
 * Exit code 1 with a findings list when a `.map` file is in the publish set.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

/** Return the publish-set entries that are sourcemaps (`.map` files). */
export function findSourcemaps(files: string[]): string[] {
  return files.filter((f) => f.endsWith(".map"));
}

interface PackEntry {
  path: string;
}
interface PackResult {
  files?: PackEntry[];
}

/** The file paths `npm pack` would include in the published tarball. */
function publishedFiles(): string[] {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    encoding: "utf-8",
  });
  const result = JSON.parse(out) as PackResult[];
  return (result[0]?.files ?? []).map((f) => f.path);
}

function main(): void {
  const maps = findSourcemaps(publishedFiles());

  if (maps.length > 0) {
    console.error(`✗ ${maps.length} sourcemap file(s) would be published:\n`);
    for (const m of maps) console.error(`  ${m}`);
    console.error(
      `\nSourcemaps bloat the tarball and point at TypeScript source the package` +
        ` does not ship. Disable them at the source — 'sourcemap: false' in` +
        ` tsdown.config.ts and 'declarationMap: false' in tsconfig.json — or` +
        ` exclude '*.map' from the published 'files' in package.json.`
    );
    process.exit(1);
  }
  console.log("✓ no sourcemap (.map) files in the published package");
}

// Run only when invoked directly (not when imported by the unit test).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
