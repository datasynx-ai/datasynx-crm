import { Command } from "commander";
import { ALL_COMMANDS } from "./commands/registry.js";

/** Build the `dxcrm` commander program with every registered command. */
export function buildProgram(): Command {
  const program = new Command();
  program
    .name("dxcrm")
    .description("DatasynxOpenCRM — local-first, MCP-native CRM")
    .version("0.1.0")
    .exitOverride(); // throw instead of process.exit so we control exit codes

  for (const command of ALL_COMMANDS) {
    program.addCommand(command);
  }
  return program;
}

/**
 * Parse argv and return the intended process exit code. Because the program
 * uses exitOverride(), commander turns *all* of its own exits — including the
 * normal `--version` and `--help` — into thrown CommanderErrors. We catch them
 * and honor the intended exit code (commander has already written version/help/
 * usage output), so the binary never crashes with a stack trace. Real errors
 * thrown from a command action are printed and mapped to exit code 1.
 */
export async function runCli(argv: string[]): Promise<number> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
    return 0;
  } catch (err) {
    const e = err as { code?: string; exitCode?: number; message?: string };
    if (typeof e.code === "string" && e.code.startsWith("commander.")) {
      // --version / --help (exitCode 0) or usage error (exitCode 1) — output
      // already emitted by commander.
      return e.exitCode ?? 0;
    }
    console.error(e.message ?? String(err));
    return 1;
  }
}
