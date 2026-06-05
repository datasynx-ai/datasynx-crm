import fs from "fs";
import path from "path";

/**
 * Unified structured logging (enterprise observability). Every log entry is a
 * structured record appended as NDJSON to `.agentic/logs.ndjson`, so logs are
 * durable, queryable and aggregatable — over the CLI (`dxcrm logs`) and over
 * MCP (`get_logs`). A formatted copy is mirrored to stderr for live tailing.
 *
 * Logging must never break the caller: persistence failures are swallowed.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LogEntry {
  ts: string; // ISO timestamp
  level: LogLevel;
  component: string;
  message: string;
  context?: Record<string, unknown>;
}

function resolveDataDir(dataDir?: string): string {
  return dataDir ?? process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export function logsPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "logs.ndjson");
}

function minLevel(): number {
  const env = (process.env["DXCRM_LOG_LEVEL"] ?? "info").toLowerCase();
  return LEVELS[env as LogLevel] ?? LEVELS.info;
}

/** Max bytes for the active ledger before it rotates (default 5 MB). */
function maxBytes(): number {
  const n = parseInt(process.env["DXCRM_LOG_MAX_BYTES"] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 5_000_000;
}

/** Number of rotated archives to keep (default 5; 0 = truncate, no archives). */
function maxFiles(): number {
  const n = parseInt(process.env["DXCRM_LOG_MAX_FILES"] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

/**
 * Size-based log rotation. Before an append would push the active ledger past
 * the byte budget, the archives shift (logs.ndjson.1 → .2 → … dropping the
 * oldest) and the current ledger becomes logs.ndjson.1, leaving a fresh active
 * file. Best-effort: any fs error here is swallowed so logging never breaks.
 */
function rotateIfNeeded(p: string, incomingBytes: number): void {
  let size = 0;
  try {
    size = fs.statSync(p).size;
  } catch {
    return; // no active file yet
  }
  if (size + incomingBytes <= maxBytes()) return;

  const keep = maxFiles();
  try {
    if (keep <= 0) {
      fs.rmSync(p, { force: true });
      return;
    }
    fs.rmSync(`${p}.${keep}`, { force: true });
    for (let i = keep - 1; i >= 1; i--) {
      if (fs.existsSync(`${p}.${i}`)) fs.renameSync(`${p}.${i}`, `${p}.${i + 1}`);
    }
    fs.renameSync(p, `${p}.1`);
  } catch {
    /* rotation is best-effort */
  }
}

/** Core log primitive. Honors DXCRM_LOG_LEVEL; mirrors to stderr unless off. */
export function log(
  level: LogLevel,
  component: string,
  message: string,
  context?: Record<string, unknown>,
  opts: { dataDir?: string } = {}
): void {
  if (LEVELS[level] < minLevel()) return;

  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    component,
    message,
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
  };

  // Persist (never throw from logging).
  try {
    const p = logsPath(resolveDataDir(opts.dataDir));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const line = JSON.stringify(entry) + "\n";
    rotateIfNeeded(p, Buffer.byteLength(line));
    fs.appendFileSync(p, line, "utf-8");
  } catch {
    /* logging must not break the caller */
  }

  // Mirror to stderr for live tailing (stdout is reserved for the MCP protocol).
  if (process.env["DXCRM_LOG_STDERR"] !== "off") {
    const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
    try {
      process.stderr.write(`[${component}] ${message}${ctx}\n`);
    } catch {
      /* ignore */
    }
  }
}

export const logger = {
  debug: (component: string, message: string, context?: Record<string, unknown>): void =>
    log("debug", component, message, context),
  info: (component: string, message: string, context?: Record<string, unknown>): void =>
    log("info", component, message, context),
  warn: (component: string, message: string, context?: Record<string, unknown>): void =>
    log("warn", component, message, context),
  error: (component: string, message: string, context?: Record<string, unknown>): void =>
    log("error", component, message, context),
};

export interface LogQuery {
  level?: LogLevel; // minimum level to include
  component?: string;
  since?: string; // ISO timestamp; only entries at or after this
  contains?: string; // case-insensitive substring of the message
  limit?: number; // return only the last N matches
}

/** Read the active ledger plus rotated archives, oldest first. */
function readLedgerText(p: string): string {
  const parts: string[] = [];
  for (let i = maxFiles(); i >= 1; i--) {
    const archive = `${p}.${i}`;
    if (fs.existsSync(archive)) {
      try {
        parts.push(fs.readFileSync(archive, "utf-8") as string);
      } catch {
        /* skip unreadable archive */
      }
    }
  }
  if (fs.existsSync(p)) {
    try {
      parts.push(fs.readFileSync(p, "utf-8") as string);
    } catch {
      /* skip */
    }
  }
  return parts.join("");
}

/** Read the log ledger (incl. rotated archives), skipping malformed lines, and filter. */
export function queryLogs(dataDir: string, query: LogQuery = {}): LogEntry[] {
  const entries = readLedgerText(logsPath(dataDir))
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LogEntry];
      } catch {
        return [];
      }
    });

  const minRank = query.level ? LEVELS[query.level] : 0;
  const contains = query.contains?.toLowerCase();

  const filtered = entries.filter((e) => {
    if (LEVELS[e.level] < minRank) return false;
    if (query.component && e.component !== query.component) return false;
    if (query.since && e.ts < query.since) return false;
    if (contains && !e.message.toLowerCase().includes(contains)) return false;
    return true;
  });

  return query.limit && query.limit > 0 ? filtered.slice(-query.limit) : filtered;
}

export interface LogSummary {
  total: number;
  byLevel: Record<LogLevel, number>;
  byComponent: Record<string, number>;
  firstTs?: string;
  lastTs?: string;
  recentErrors: LogEntry[];
}

/** Aggregate the (optionally filtered) log ledger for at-a-glance analysis. */
export function summarizeLogs(dataDir: string, query: LogQuery = {}): LogSummary {
  const entries = queryLogs(dataDir, query);
  const byLevel: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
  const byComponent: Record<string, number> = {};

  for (const e of entries) {
    byLevel[e.level] = (byLevel[e.level] ?? 0) + 1;
    byComponent[e.component] = (byComponent[e.component] ?? 0) + 1;
  }

  const summary: LogSummary = {
    total: entries.length,
    byLevel,
    byComponent,
    recentErrors: entries.filter((e) => e.level === "error").slice(-5),
  };
  if (entries.length > 0) {
    summary.firstTs = entries[0]!.ts;
    summary.lastTs = entries[entries.length - 1]!.ts;
  }
  return summary;
}
