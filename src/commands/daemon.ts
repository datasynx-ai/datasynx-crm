import { Command } from "commander";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { success, error, info } from "../ui/colors.js";

function getPidFile(): string {
  return path.join(process.cwd(), ".agentic", "daemon.pid");
}

export const daemonCommand = new Command("daemon").description("Manage the background sync daemon");

daemonCommand.command("start").action(async () => {
  const pidFile = getPidFile();

  if (fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, "utf-8") as string, 10);
    try {
      process.kill(pid, 0);
      console.log(info(`Daemon already running (PID ${pid})`));
      return;
    } catch {
      // stale PID file — continue
    }
  }

  const workerPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../../dist/daemon/worker.js"
  );

  const child = spawn(process.execPath, [workerPath], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  fs.writeFileSync(pidFile, String(child.pid));
  console.log(success(`✓ Daemon started (PID ${child.pid})`));
});

daemonCommand.command("stop").action(() => {
  const pidFile = getPidFile();

  if (!fs.existsSync(pidFile)) {
    console.log(info("Daemon not running."));
    return;
  }

  const pid = parseInt(fs.readFileSync(pidFile, "utf-8") as string, 10);
  try {
    process.kill(pid, "SIGTERM");
    fs.unlinkSync(pidFile);
    console.log(success("✓ Daemon stopped."));
  } catch (err) {
    console.error(error(`✗ ${(err as Error).message}`));
  }
});

daemonCommand.command("status").action(() => {
  const pidFile = getPidFile();

  if (!fs.existsSync(pidFile)) {
    console.log(info("Daemon: not running."));
    return;
  }

  const pid = parseInt(fs.readFileSync(pidFile, "utf-8") as string, 10);
  try {
    process.kill(pid, 0);
    console.log(success(`Daemon: running (PID ${pid})`));
  } catch {
    console.log(info("Daemon: stopped (stale PID file)."));
    fs.unlinkSync(pidFile);
  }
});
