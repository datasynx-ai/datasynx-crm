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
    fs.appendFileSync(p, JSON.stringify(entry) + "\n", "utf-8");
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

/**
 * Start a timer; the returned function logs an `info` entry with `durationMs`
 * when called. Useful for timing syncs, LLM calls, and other operations.
 */
export function withTimer(
  component: string,
  message: string,
  context?: Record<string, unknown>
): () => void {
  const t0 = Date.now();
  return () => log("info", component, message, { ...context, durationMs: Date.now() - t0 });
}

export interface LogQuery {
  level?: LogLevel; // minimum level to include
  component?: string;
  since?: string; // ISO timestamp; only entries at or after this
  contains?: string; // case-insensitive substring of the message
  limit?: number; // return only the last N matches
}

/** Read the log ledger, skipping malformed lines, and apply the filter. */
export function queryLogs(dataDir: string, query: LogQuery = {}): LogEntry[] {
  const p = logsPath(dataDir);
  if (!fs.existsSync(p)) return [];

  const entries = (fs.readFileSync(p, "utf-8") as string)
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
