import { describe, it, expect, beforeEach, vi } from "vitest";

// runCli builds the commander program and returns an exit code instead of
// calling process.exit, so the binary's exit behavior is testable. Regression
// guard for the bug where `dxcrm --version`/`--help` threw a CommanderError
// (from exitOverride) and crashed with a stack trace + exit 1.
beforeEach(() => vi.resetModules());

describe("runCli", () => {
  it("exits 0 for --version without throwing", async () => {
    const { runCli } = await import("../src/cli-main.js");
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const code = await runCli(["node", "dxcrm", "--version"]);
    out.mockRestore();
    expect(code).toBe(0);
  });

  it("exits 0 for --help without throwing", async () => {
    const { runCli } = await import("../src/cli-main.js");
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const code = await runCli(["node", "dxcrm", "--help"]);
    out.mockRestore();
    expect(code).toBe(0);
  });

  it("exits non-zero for an unknown command", async () => {
    const { runCli } = await import("../src/cli-main.js");
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runCli(["node", "dxcrm", "no-such-command-xyz"]);
    err.mockRestore();
    expect(code).toBeGreaterThan(0);
  });

  it("registers the full command set (incl. the new ones)", async () => {
    const { buildProgram } = await import("../src/cli-main.js");
    const names = buildProgram()
      .commands.map((c) => c.name())
      .filter(Boolean);
    for (const n of ["create", "list", "archive", "reindex", "eval-embeddings"]) {
      expect(names).toContain(n);
    }
  });
});
