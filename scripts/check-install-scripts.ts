#!/usr/bin/env tsx
/**
 * Install-script transparency guard (#88): fails the build if a package that
 * runs a lifecycle install/postinstall script enters the tree without being on
 * a reviewed allowlist. Offline, CI-friendly — reads `package-lock.json` only
 * (npm records `hasInstallScript: true` per package), Node built-ins only.
 *
 * Rationale: native install scripts are a supply-chain surface. Every package
 * allowed to run one is enumerated below with a justification, so a future
 * dependency bump that silently adds a native build is caught in CI rather than
 * executing unreviewed code on every `npm install`.
 *
 * Policy (see CONTRIBUTING.md → "Native install scripts"): pinned exact versions
 * (`save-exact=true`) + `npm ci` lockfile integrity + this allowlist. We do NOT
 * use `--ignore-scripts` because the embeddings/OCR features need the native
 * binaries (sharp/libvips, onnxruntime-node) built at install time.
 *
 * Exit code 1 with a findings list when an unreviewed install-script package is
 * present.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Packages allowed to run install/postinstall scripts, each with a reason. */
export const ALLOWED_INSTALL_SCRIPTS: Record<string, string> = {
  sharp: "libvips native build — image preprocessing for local embeddings (via @huggingface/transformers)",
  "onnxruntime-node": "downloads the native ONNX runtime binary — local embeddings (via @huggingface/transformers)",
  protobufjs: "protobuf codegen postinstall (via onnxruntime-web)",
  "tesseract.js": "opencollective funding notice only — no native build (direct dep, OCR)",
  esbuild: "dev-only bundler binary download (tsdown/vitest tooling)",
  fsevents: "macOS-only optional file-watching native addon (via chokidar)",
};

export interface ScriptViolation {
  name: string;
  version: string;
  path: string;
}

interface Lockfile {
  packages?: Record<string, { version?: string; hasInstallScript?: boolean }>;
}

/** Derive the package name from a lockfile `packages` key (handles nesting + scopes). */
function packageName(lockKey: string): string {
  // e.g. "node_modules/a/node_modules/@scope/sharp" → "@scope/sharp"
  const segments = lockKey.split("node_modules/");
  return segments[segments.length - 1] ?? "";
}

/** Return install-script packages that are NOT on the reviewed allowlist. */
export function findUnexpectedInstallScripts(lock: Lockfile): ScriptViolation[] {
  const violations: ScriptViolation[] = [];
  for (const [key, info] of Object.entries(lock.packages ?? {})) {
    if (key === "" || !info?.hasInstallScript) continue;
    const name = packageName(key);
    if (name in ALLOWED_INSTALL_SCRIPTS) continue;
    violations.push({ name, version: info.version ?? "?", path: key });
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
  const violations = findUnexpectedInstallScripts(lock);

  if (violations.length > 0) {
    console.error(`✗ ${violations.length} unreviewed install-script package(s) (#88 guard):\n`);
    for (const v of violations) {
      console.error(`  ${v.name}@${v.version}\n    at ${v.path}`);
    }
    console.error(
      `\nA new dependency runs a lifecycle install/postinstall script. Review what` +
        ` it does, then add it to ALLOWED_INSTALL_SCRIPTS in` +
        ` scripts/check-install-scripts.ts with a justification, or remove/replace` +
        ` the dependency.`
    );
    process.exit(1);
  }
  console.log(
    `✓ all install-script packages are reviewed` +
      ` (allowlisted: ${Object.keys(ALLOWED_INSTALL_SCRIPTS).join(", ")})`
  );
}

// Run only when invoked directly (not when imported by the unit test).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
