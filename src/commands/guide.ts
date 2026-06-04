import { Command } from "commander";
import { CAPABILITIES_TEXT } from "../mcp/capabilities.js";
import { info } from "../ui/colors.js";

export const guideCommand = new Command("guide")
  .description("Full CRM documentation in terminal")
  .action(() => {
    console.log(CAPABILITIES_TEXT);
  });

export const mcpCommand = new Command("mcp").description("MCP server management and documentation");

mcpCommand.command("docs").action(() => {
  console.log(CAPABILITIES_TEXT);
});

mcpCommand
  .command("token")
  .description("Mint a bearer token for the HTTP MCP server (printed once)")
  .requiredOption("--actor <actor>", "Actor/user the token authenticates as")
  .option("--role <role>", "RBAC role: admin | manager | rep", "rep")
  .option("--label <label>", "Optional label (e.g. device name)")
  .action(async (opts: { actor: string; role: string; label?: string }) => {
    const role = ["admin", "manager", "rep"].includes(opts.role)
      ? (opts.role as "admin" | "manager" | "rep")
      : "rep";
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const { createMcpToken } = await import("../mcp/auth.js");
    const token = createMcpToken(dataDir, opts.actor, role, opts.label);
    console.log(info("MCP bearer token (store it now — it is not shown again):"));
    console.log(token);
    console.log(info(`actor=${opts.actor} role=${role} — HTTP /mcp now requires this token.`));
  });

mcpCommand
  .command("start")
  .description("Start MCP server (stdio by default)")
  .option("--http", "Use HTTP transport instead of stdio")
  .option("--port <port>", "HTTP port (default 3847)", "3847")
  .action(async (opts: { http?: boolean; port: string }) => {
    if (opts.http) {
      const port = parseInt(opts.port, 10);
      console.error(info(`Starting MCP server in HTTP mode on port ${port}...`));
      const { startHttp } = await import("../mcp/server.js");
      await startHttp(port);
    } else {
      const { startStdio } = await import("../mcp/server.js");
      await startStdio();
    }
  });
