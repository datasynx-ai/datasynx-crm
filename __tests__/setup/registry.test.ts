import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

// Mock child_process so no real binary checks happen
vi.mock("child_process", () => ({
  execSync: vi.fn().mockImplementation(() => {
    throw new Error("not found");
  }),
}));

import { installAllDetected, FRAMEWORK_ADAPTERS } from "../../src/setup/framework-registry.js";
import type { InstallConfig } from "../../src/setup/framework-adapter.js";

const TEST_CONFIG: InstallConfig = {
  mcpServerPath: "/usr/local/lib/node_modules/datasynx-opencrm/dist/mcp.js",
  dataDir: "/home/user/crm",
  httpPort: 3847,
  serverName: "datasynx-opencrm",
};

beforeEach(() => {
  vol.reset();
});

describe("FRAMEWORK_ADAPTERS", () => {
  it("exports an array of 10 adapters", () => {
    expect(FRAMEWORK_ADAPTERS).toHaveLength(10);
  });

  it("contains all expected framework names", () => {
    const names = FRAMEWORK_ADAPTERS.map((a) => a.name);
    expect(names).toContain("Claude Code");
    expect(names).toContain("Claude Desktop");
    expect(names).toContain("Codex");
    expect(names).toContain("Grok Build");
    expect(names).toContain("OpenClaw");
    expect(names).toContain("Hermes Agent");
    expect(names).toContain("Antigravity CLI");
    expect(names).toContain("Cursor");
    expect(names).toContain("Windsurf");
    expect(names).toContain("Cline");
  });

  it("each adapter implements the FrameworkAdapter interface", () => {
    for (const adapter of FRAMEWORK_ADAPTERS) {
      expect(typeof adapter.name).toBe("string");
      expect(typeof adapter.detect).toBe("function");
      expect(typeof adapter.install).toBe("function");
      expect(typeof adapter.uninstall).toBe("function");
      expect(typeof adapter.isInstalled).toBe("function");
    }
  });
});

describe("installAllDetected", () => {
  it("returns empty array when no frameworks are detected", async () => {
    // vol is empty — no config dirs exist
    const results = await installAllDetected(TEST_CONFIG);
    expect(results).toHaveLength(0);
  });

  it("installs only detected adapters", async () => {
    const os = await import("os");
    const path = await import("path");
    const HOME = os.default.homedir();

    // Set up only Claude Code's detection signal
    vol.fromJSON({
      [path.join(HOME, ".claude.json")]: "{}",
      [TEST_CONFIG.dataDir]: null,
    });

    const results = await installAllDetected(TEST_CONFIG);
    const names = results.map((r) => r.framework);
    expect(names).toContain("Claude Code");
    // Claude Desktop also uses the same ~/.claude dir for detection check
    // but on linux, it checks ~/.config/claude-desktop/ which we haven't set
    // So only Claude Code should be detected
    expect(names).not.toContain("Codex");
    expect(names).not.toContain("OpenClaw");
  });

  it("continues when one adapter throws — isolates errors", async () => {
    const os = await import("os");
    const path = await import("path");
    const HOME = os.default.homedir();

    // Set up both Claude Code and Codex detection signals
    vol.fromJSON({
      [path.join(HOME, ".claude.json")]: "{}",
      [path.join(HOME, ".codex", ".keep")]: "",
      [TEST_CONFIG.dataDir]: null,
    });

    // Mock one adapter to throw
    const { ClaudeCodeAdapter } = await import("../../src/setup/adapters/claude-code.js");
    const originalInstall = ClaudeCodeAdapter.prototype.install;
    ClaudeCodeAdapter.prototype.install = vi.fn().mockRejectedValueOnce(
      new Error("Simulated install failure")
    );

    const results = await installAllDetected(TEST_CONFIG);

    // Restore
    ClaudeCodeAdapter.prototype.install = originalInstall;

    // Should have results for both — one failure, one success
    const claudeResult = results.find((r) => r.framework === "Claude Code");
    const codexResult = results.find((r) => r.framework === "Codex");

    expect(claudeResult).toBeDefined();
    expect(claudeResult?.success).toBe(false);
    expect(claudeResult?.notes).toContain("Simulated install failure");

    expect(codexResult).toBeDefined();
    expect(codexResult?.success).toBe(true);
  });

  it("failure result has correct shape", async () => {
    const os = await import("os");
    const path = await import("path");
    const HOME = os.default.homedir();

    vol.fromJSON({
      [path.join(HOME, ".claude.json")]: "{}",
      [TEST_CONFIG.dataDir]: null,
    });

    const { ClaudeCodeAdapter } = await import("../../src/setup/adapters/claude-code.js");
    const originalInstall = ClaudeCodeAdapter.prototype.install;
    ClaudeCodeAdapter.prototype.install = vi.fn().mockRejectedValueOnce(
      new Error("permission denied")
    );

    const results = await installAllDetected(TEST_CONFIG);

    // Always restore before assertions
    ClaudeCodeAdapter.prototype.install = originalInstall;

    const failed = results.find((r) => !r.success);

    expect(failed).toBeDefined();
    expect(failed?.framework).toBe("Claude Code");
    expect(failed?.transport).toBe("stdio");
    expect(failed?.configPath).toBe("");
    expect(failed?.harnessFiles).toHaveLength(0);
    expect(failed?.notes).toBe("permission denied");
  });

  it("installs multiple detected frameworks and returns all results", async () => {
    const os = await import("os");
    const path = await import("path");
    const HOME = os.default.homedir();

    // Set up detection signals for Claude Code, Codex, and Cursor
    vol.fromJSON({
      [path.join(HOME, ".claude.json")]: "{}",
      [path.join(HOME, ".codex", ".keep")]: "",
      [path.join(HOME, ".cursor", ".keep")]: "",
      [TEST_CONFIG.dataDir]: null,
    });

    const results = await installAllDetected(TEST_CONFIG);
    const names = results.map((r) => r.framework);

    expect(names).toContain("Claude Code");
    expect(names).toContain("Codex");
    expect(names).toContain("Cursor");
  });
});
