import { Command } from "commander";
import { info, warning, error, success, bold } from "../ui/colors.js";
import type { LogLevel, LogQuery } from "../core/logger.js";

const LEVELS = ["debug", "info", "warn", "error"];

function paintLevel(level: LogLevel, text: string): string {
  if (level === "error") return error(text);
  if (level === "warn") return warning(text);
  if (level === "info") return info(text);
  return text;
}

function buildQuery(opts: {
  level?: string;
  component?: string;
  since?: string;
  contains?: string;
  limit?: number;
}): LogQuery {
  return {
    ...(opts.level && LEVELS.includes(opts.level) ? { level: opts.level as LogLevel } : {}),
    ...(opts.component !== undefined ? { component: opts.component } : {}),
    ...(opts.since !== undefined ? { since: opts.since } : {}),
    ...(opts.contains !== undefined ? { contains: opts.contains } : {}),
    limit: opts.limit ?? 50,
  };
}

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const logsCommand = new Command("logs")
  .description("View and analyze the structured application log")
  .option("--level <level>", "Minimum level: debug | info | warn | error")
  .option("--component <name>", "Filter by component (e.g. gmail-sync, lancedb)")
  .option("--since <iso>", "Only entries at or after this ISO timestamp")
  .option("--contains <text>", "Filter by message substring")
  .option("--limit <n>", "Max entries to show (default: 50)", parseInt)
  .option("--summary", "Show aggregated counts (by level + component) instead of entries")
  .action(
    async (opts: {
      level?: string;
      component?: string;
      since?: string;
      contains?: string;
      limit?: number;
      summary?: boolean;
    }) => {
      const query = buildQuery(opts);

      if (opts.summary) {
        const { summarizeLogs } = await import("../core/logger.js");
        const s = summarizeLogs(dataDir(), query);
        console.log(bold(`Logs — ${s.total} entr${s.total === 1 ? "y" : "ies"}`));
        if (s.firstTs) console.log(info(`  ${s.firstTs} → ${s.lastTs}`));
        console.log("  By level:");
        for (const lvl of LEVELS) {
          const n = s.byLevel[lvl as LogLevel];
          if (n > 0) console.log(`    ${paintLevel(lvl as LogLevel, lvl.padEnd(6))} ${n}`);
        }
        console.log("  By component:");
        for (const [comp, n] of Object.entries(s.byComponent).sort((a, b) => b[1] - a[1])) {
          console.log(`    ${comp.padEnd(22)} ${n}`);
        }
        if (s.recentErrors.length > 0) {
          console.log(error("  Recent errors:"));
          for (const e of s.recentErrors) console.log(`    ${e.ts}  [${e.component}] ${e.message}`);
        }
        return;
      }

      const { queryLogs } = await import("../core/logger.js");
      const entries = queryLogs(dataDir(), query);
      if (entries.length === 0) {
        console.log(success("No matching log entries."));
        return;
      }
      for (const e of entries) {
        const ctx = e.context ? ` ${JSON.stringify(e.context)}` : "";
        console.log(
          `${e.ts}  ${paintLevel(e.level, e.level.padEnd(5))}  ${e.component.padEnd(18)}  ${e.message}${ctx}`
        );
      }
    }
  );
