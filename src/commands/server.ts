import { Command } from "commander";
import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { success, info } from "../ui/colors.js";

function getPidFile(dataDir: string): string {
  return path.join(dataDir, ".agentic", "server.pid");
}

export async function runServerStart(
  opts: { port?: string; data?: string },
  dataDir?: string
): Promise<void> {
  const port = parseInt(opts.port ?? "3847", 10);
  const dir = opts.data ?? dataDir ?? process.cwd();

  // Set env var if --data provided
  if (opts.data) {
    process.env["DXCRM_DATA_DIR"] = opts.data;
  }

  const pidFile = getPidFile(dir);

  // Check if already running
  if (fs.existsSync(pidFile)) {
    const existing = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
    if (!isNaN(existing)) {
      try {
        process.kill(existing, 0);
        console.log(info(`Server already running (PID ${existing})`));
        return;
      } catch {
        // stale PID file — continue
      }
    }
  }

  // Spawn the MCP HTTP server process
  const serverEntry = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../../dist/mcp/server.js"
  );

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DXCRM_MCP_MODE: "http",
    DXCRM_MCP_PORT: String(port),
  };

  if (opts.data) {
    env["DXCRM_DATA_DIR"] = opts.data;
  }

  const child = spawn(process.execPath, [serverEntry], {
    detached: true,
    stdio: "ignore",
    env,
  });
  child.unref();

  // Write PID file
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  fs.writeFileSync(pidFile, String(child.pid), "utf-8");

  const hostname = os.hostname();

  console.log(success(`DatasynxOpenCRM server running on http://0.0.0.0:${port}/mcp`));
  console.log(info(`Data dir: ${dir}`));
  console.log(info(`Add to your AI framework config: url: http://${hostname}:${port}/mcp`));
}

export function runServerStatus(dataDir?: string): void {
  const dir = process.env["DXCRM_DATA_DIR"] ?? dataDir ?? process.cwd();
  const pidFile = getPidFile(dir);

  if (!fs.existsSync(pidFile)) {
    console.log(info("Server: not running."));
    return;
  }

  const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
  if (isNaN(pid)) {
    console.log(info("Server: not running (invalid PID file)."));
    return;
  }

  try {
    process.kill(pid, 0);
    console.log(success(`Server: running (PID ${pid})`));
  } catch {
    console.log(info("Server: not running (stale PID file)."));
    try {
      fs.unlinkSync(pidFile);
    } catch {
      // ignore
    }
  }
}

export const serverCommand = new Command("server").description(
  "Start the shared HTTP MCP server for team use"
);

serverCommand
  .command("start")
  .description("Start the DatasynxOpenCRM HTTP MCP server")
  .option("--port <port>", "HTTP port (default 3847)", "3847")
  .option("--data <dir>", "Data directory (sets DXCRM_DATA_DIR)")
  .action((opts: { port: string; data?: string }) => runServerStart(opts));

serverCommand
  .command("status")
  .description("Check if the server is running")
  .action(() => runServerStatus());
