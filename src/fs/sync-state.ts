import fs from "fs";
import path from "path";

export interface SyncState {
  [slug: string]: {
    lastGmailSync?: string; // ISO timestamp
    lastCalendarSync?: string;
  };
}

function syncStatePath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "sync-state.json");
}

export function readSyncState(dataDir: string): SyncState {
  const filePath = syncStatePath(dataDir);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as SyncState;
  } catch {
    return {};
  }
}

export function writeSyncState(dataDir: string, state: SyncState): void {
  const filePath = syncStatePath(dataDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

export function updateSlugSyncState(
  dataDir: string,
  slug: string,
  updates: Partial<SyncState[string]>
): void {
  const state = readSyncState(dataDir);
  state[slug] = { ...state[slug], ...updates };
  writeSyncState(dataDir, state);
}

export function getLastGmailSync(dataDir: string, slug: string): Date | undefined {
  const state = readSyncState(dataDir);
  const entry = state[slug];
  if (!entry?.lastGmailSync) {
    return undefined;
  }
  return new Date(entry.lastGmailSync);
}
