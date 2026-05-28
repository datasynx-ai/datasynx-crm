export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  msg: string;
  ts?: string;
  domain?: string;
  durationMs?: number;
  slug?: string;
  toolName?: string;
  errorKind?: string;
  [key: string]: unknown;
}

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function getMinLevel(): LogLevel {
  const env = process.env["DXCRM_LOG_LEVEL"];
  return (env && (env as LogLevel) in LEVELS) ? (env as LogLevel) : "debug";
}

function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_key, val) => {
    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) return "[Circular]";
      seen.add(val as object);
    }
    return val as unknown;
  });
}

export function log(domain: string, entry: Omit<LogEntry, "ts" | "domain">): void {
  const minLevel = getMinLevel();
  const entryLevel = entry.level as LogLevel;
  if ((LEVELS[entryLevel] ?? 0) < (LEVELS[minLevel] ?? 0)) return;

  const full: Record<string, unknown> = {
    ts: new Date().toISOString(),
    domain,
    ...entry,
  };

  process.stderr.write(safeStringify(full) + "\n");
}

export function withTimer(domain: string, msg: string, slug?: string): () => void {
  const t0 = Date.now();
  return () => {
    const durationMs = Date.now() - t0;
    log(domain, {
      level: "info",
      msg,
      durationMs,
      ...(slug !== undefined ? { slug } : {}),
    });
  };
}
