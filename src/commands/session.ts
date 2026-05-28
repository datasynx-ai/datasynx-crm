import { Command } from "commander";
import fs from "fs";
import path from "path";
import { setSession, getSession, clearSession } from "../core/session-store.js";
import { readMainFacts, customerExists } from "../fs/customer-dir.js";
import { success, error, info } from "../ui/colors.js";

function sessionsDir(dataDir: string): string {
  return path.join(dataDir, ".agentic", "sessions");
}

export function persistSession(dataDir: string, session: {
  customerSlug: string; customerName: string; startedAt: string; owner?: string;
}): void {
  const dir = sessionsDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const key = (session.owner ?? `pid-${process.pid}`).replace(/[^a-zA-Z0-9_-]/g, "_");
  fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify({ ...session, pid: process.pid }));
}

export function clearPersistedSession(dataDir: string, owner?: string): void {
  const dir = sessionsDir(dataDir);
  const key = (owner ?? `pid-${process.pid}`).replace(/[^a-zA-Z0-9_-]/g, "_");
  const file = path.join(dir, `${key}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function readAllSessions(dataDir: string): Array<{ customerSlug: string; customerName: string; startedAt: string; owner?: string }> {
  const dir = sessionsDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as { customerSlug: string; customerName: string; startedAt: string; owner?: string };
      } catch {
        return null;
      }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
}

export const sessionCommand = new Command("session");

sessionCommand
  .command("open <slug>")
  .option("--owner <owner>", "Set the owner of this session")
  .action(async (slug: string, opts: { owner?: string }) => {
    const dataDir = process.cwd();
    if (!customerExists(dataDir, slug)) {
      console.error(error(`✗ Customer not found: ${slug}`));
      process.exit(1);
    }
    const facts = await readMainFacts(dataDir, slug);
    const owner = opts.owner ?? process.env["DXCRM_ACTOR"];
    const session = {
      customerSlug: slug,
      customerName: facts.name,
      startedAt: new Date().toISOString(),
      ...(owner !== undefined ? { owner } : {}),
    };
    setSession(session);
    persistSession(dataDir, session);
    console.log(success(`✓ Session opened: ${facts.name}`));
  });

sessionCommand.command("close").action(() => {
  const dataDir = process.cwd();
  const s = getSession();
  clearSession();
  clearPersistedSession(dataDir, s?.owner);
  console.log(success("✓ Session closed."));
});

sessionCommand.command("status").action(() => {
  const s = getSession();
  if (!s) {
    console.log(info("No active session."));
  } else {
    console.log(info(`Active: ${s.customerName} (${s.customerSlug}) since ${s.startedAt}`));
  }
});
