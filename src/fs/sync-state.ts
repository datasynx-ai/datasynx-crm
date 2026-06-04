import path from "path";
import { readJsonFile, writeJsonFile } from "./json-store.js";

export interface SlugSyncState {
  lastGmailSync?: string;
  lastCalendarSync?: string;
  lastGmailPushHistoryId?: string;
  lastMicrosoftPushAt?: string;
}

export interface SyncState {
  [slug: string]: SlugSyncState;
}

function getSyncStatePath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "sync-state.json");
}

export function readSyncState(dataDir: string): SyncState {
  return readJsonFile<SyncState>(getSyncStatePath(dataDir), {});
}

export function writeSyncState(dataDir: string, state: SyncState): void {
  writeJsonFile(getSyncStatePath(dataDir), state);
}

export function updateSlugSyncState(
  dataDir: string,
  slug: string,
  update: Partial<SlugSyncState>
): void {
  const state = readSyncState(dataDir);
  state[slug] = { ...state[slug], ...update };
  writeJsonFile(getSyncStatePath(dataDir), state);
}

export function getLastGmailSync(dataDir: string, slug: string): Date | undefined {
  const ts = readSyncState(dataDir)[slug]?.lastGmailSync;
  return ts ? new Date(ts) : undefined;
}

export function getLastCalendarSync(dataDir: string, slug: string): Date | undefined {
  const ts = readSyncState(dataDir)[slug]?.lastCalendarSync;
  return ts ? new Date(ts) : undefined;
}
