import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import {
  readSyncState,
  writeSyncState,
  updateSlugSyncState,
  getLastGmailSync,
} from "../../src/fs/sync-state.js";

const DATA_DIR = "/data";
const SYNC_STATE_PATH = `${DATA_DIR}/.agentic/sync-state.json`;

beforeEach(() => {
  vol.reset();
});

describe("readSyncState", () => {
  it("returns empty object if file does not exist", () => {
    const state = readSyncState(DATA_DIR);
    expect(state).toEqual({});
  });

  it("returns parsed state when file exists", () => {
    vol.fromJSON({
      [SYNC_STATE_PATH]: JSON.stringify({
        "acme-corp": { lastGmailSync: "2026-05-26T10:00:00.000Z" },
      }),
    });

    const state = readSyncState(DATA_DIR);
    expect(state["acme-corp"]).toBeDefined();
    expect(state["acme-corp"]?.lastGmailSync).toBe("2026-05-26T10:00:00.000Z");
  });

  it("returns empty object if file contains invalid JSON", () => {
    vol.fromJSON({ [SYNC_STATE_PATH]: "not-valid-json" });
    const state = readSyncState(DATA_DIR);
    expect(state).toEqual({});
  });
});

describe("writeSyncState", () => {
  it("creates .agentic directory if it does not exist", () => {
    vol.fromJSON({ [`${DATA_DIR}/`]: null });
    writeSyncState(DATA_DIR, { "test-slug": { lastGmailSync: "2026-05-26T00:00:00.000Z" } });
    const { fs } = vol;
    expect(fs.existsSync(SYNC_STATE_PATH)).toBe(true);
  });

  it("writes correct JSON to sync-state.json", () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/`]: null });
    const state = { "acme-corp": { lastGmailSync: "2026-05-26T12:00:00.000Z" } };
    writeSyncState(DATA_DIR, state);
    const written = JSON.parse(vol.fs.readFileSync(SYNC_STATE_PATH, "utf-8") as string) as typeof state;
    expect(written["acme-corp"]?.lastGmailSync).toBe("2026-05-26T12:00:00.000Z");
  });
});

describe("updateSlugSyncState", () => {
  it("creates entry for new slug", () => {
    vol.fromJSON({ [`${DATA_DIR}/`]: null });
    updateSlugSyncState(DATA_DIR, "new-slug", { lastGmailSync: "2026-05-26T10:00:00.000Z" });
    const state = readSyncState(DATA_DIR);
    expect(state["new-slug"]?.lastGmailSync).toBe("2026-05-26T10:00:00.000Z");
  });

  it("merges updates into existing entry", () => {
    vol.fromJSON({
      [SYNC_STATE_PATH]: JSON.stringify({
        "acme-corp": {
          lastGmailSync: "2026-05-25T10:00:00.000Z",
          lastCalendarSync: "2026-05-25T09:00:00.000Z",
        },
      }),
    });

    updateSlugSyncState(DATA_DIR, "acme-corp", { lastGmailSync: "2026-05-26T10:00:00.000Z" });

    const state = readSyncState(DATA_DIR);
    expect(state["acme-corp"]?.lastGmailSync).toBe("2026-05-26T10:00:00.000Z");
    // Calendar sync should be preserved
    expect(state["acme-corp"]?.lastCalendarSync).toBe("2026-05-25T09:00:00.000Z");
  });

  it("writes and reads back correctly", () => {
    vol.fromJSON({ [`${DATA_DIR}/`]: null });
    const ts = "2026-05-26T11:00:00.000Z";
    updateSlugSyncState(DATA_DIR, "test-corp", { lastGmailSync: ts });
    const state = readSyncState(DATA_DIR);
    expect(state["test-corp"]?.lastGmailSync).toBe(ts);
  });
});

describe("getLastGmailSync", () => {
  it("returns undefined if no entry for slug", () => {
    vol.fromJSON({ [`${DATA_DIR}/`]: null });
    const result = getLastGmailSync(DATA_DIR, "unknown-slug");
    expect(result).toBeUndefined();
  });

  it("returns undefined if slug exists but no lastGmailSync", () => {
    vol.fromJSON({
      [SYNC_STATE_PATH]: JSON.stringify({
        "acme-corp": { lastCalendarSync: "2026-05-26T10:00:00.000Z" },
      }),
    });
    const result = getLastGmailSync(DATA_DIR, "acme-corp");
    expect(result).toBeUndefined();
  });

  it("returns correct Date when lastGmailSync exists", () => {
    const ts = "2026-05-26T10:00:00.000Z";
    vol.fromJSON({
      [SYNC_STATE_PATH]: JSON.stringify({
        "acme-corp": { lastGmailSync: ts },
      }),
    });
    const result = getLastGmailSync(DATA_DIR, "acme-corp");
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe(ts);
  });

  it("returns undefined if file does not exist", () => {
    const result = getLastGmailSync(DATA_DIR, "acme-corp");
    expect(result).toBeUndefined();
  });
});
