import path from "path";
import { readJsonFile, writeJsonFile } from "./json-store.js";

/**
 * Centralized access to `.agentic/config.json` — the per-vault settings document
 * written by `dxcrm init`. Multiple subsystems (backup scheduling, starter-content
 * seeding) read and write this file; keeping the path resolution and the
 * read/mutate/write cycle in one place ensures they never diverge and that
 * unknown keys written by one subsystem (or by `init`) survive a write by another.
 */

export interface BackupScheduleConfig {
  every: string;
  keep: number;
  weekly?: number;
  monthly?: number;
  lastBackup: string | null;
  remote?: string;
}

/**
 * Record of which starter templates/sequences have already been offered to this
 * vault. Stored cumulatively: once an id appears here it is never re-seeded, so a
 * user who deletes a starter does not get it resurrected on the next `init`. The
 * `version` enables future starter-set expansions to seed only the genuinely new ids.
 */
export interface StarterSeedState {
  version: number;
  seededAt: string;
  templateIds: string[];
  sequenceIds: string[];
}

export interface AgenticConfig {
  backupSchedule?: BackupScheduleConfig;
  starterSeed?: StarterSeedState;
  /** Preserve base keys written by `init` (version, dataDir, created, …) across writes. */
  [key: string]: unknown;
}

export function getConfigPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "config.json");
}

export function readAgenticConfig(dataDir: string): AgenticConfig {
  return readJsonFile<AgenticConfig>(getConfigPath(dataDir), {});
}

export function writeAgenticConfig(dataDir: string, config: AgenticConfig): void {
  writeJsonFile(getConfigPath(dataDir), config);
}
