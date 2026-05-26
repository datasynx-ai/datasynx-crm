// src/setup/framework-registry.ts
import { ClaudeCodeAdapter } from "./adapters/claude-code.js";
import { ClaudeDesktopAdapter } from "./adapters/claude-desktop.js";
import { CodexAdapter } from "./adapters/codex.js";
import { OpenClawAdapter } from "./adapters/openclaw.js";
import { HermesAdapter } from "./adapters/hermes.js";
import { AntigravityAdapter } from "./adapters/antigravity.js";
import { CursorAdapter } from "./adapters/cursor.js";
import { WindsurfAdapter } from "./adapters/windsurf.js";
import { ClineAdapter } from "./adapters/cline.js";
import { GrokAdapter } from "./adapters/grok.js";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "./framework-adapter.js";

export const FRAMEWORK_ADAPTERS: FrameworkAdapter[] = [
  // Tier 1 — full adapter (CLI binary detectable, harness injection)
  new ClaudeCodeAdapter(),
  new CodexAdapter(),
  new GrokAdapter(),
  new OpenClawAdapter(),
  new HermesAdapter(),
  new AntigravityAdapter(),
  // Tier 2 — config writer (IDE/Desktop, no global harness system)
  new CursorAdapter(),
  new WindsurfAdapter(),
  new ClineAdapter(),
  new ClaudeDesktopAdapter(), // non-developer audience, restart required
];

export async function installAllDetected(config: InstallConfig): Promise<InstallResult[]> {
  const results: InstallResult[] = [];
  for (const adapter of FRAMEWORK_ADAPTERS) {
    if (!adapter.detect()) continue;
    try {
      results.push(await adapter.install(config));
    } catch (err) {
      results.push({
        framework: adapter.name,
        success: false,
        transport: "stdio",
        configPath: "",
        harnessFiles: [],
        notes: (err as Error).message,
      });
    }
  }
  return results;
}

export type { FrameworkAdapter, InstallConfig, InstallResult };
