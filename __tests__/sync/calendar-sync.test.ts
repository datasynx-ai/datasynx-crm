import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { vol } from "memfs";

vi.mock("../../src/fs/interactions-writer.js", () => ({
  appendInteraction: vi.fn().mockResolvedValue(undefined),
  readInteractions: vi.fn().mockResolvedValue(""),
}));

const mockEventsList = vi.hoisted(() => vi.fn());

vi.mock("googleapis", () => ({
  google: {
    calendar: () => ({
      events: { list: mockEventsList },
    }),
  },
}));

beforeEach(async () => {
  vol.reset();
  vi.clearAllMocks();
  mockEventsList.mockResolvedValue({ data: { items: [] } });
  const iw = await import("../../src/fs/interactions-writer.js");
  vi.mocked(iw.appendInteraction).mockResolvedValue(undefined);
  vi.mocked(iw.readInteractions).mockResolvedValue("");
});

afterEach(() => {
  vi.restoreAllMocks();
});

const OPTS = {
  slug: "acme-corp",
  dataDir: "/crm",
  auth: {} as never,
};

const ONE_EVENT = {
  data: {
    items: [
      {
        id: "gcal-001",
        summary: "Product Demo",
        description: "Demo of new features",
        start: { dateTime: "2026-05-10T10:00:00Z" },
        attendees: [{ email: "alice@acme.com" }, { email: "bob@vendor.com" }],
      },
    ],
  },
};

describe("syncCalendar", () => {
  it("returns synced:0 and skipped:0 when no events", async () => {
    mockEventsList.mockResolvedValue({ data: { items: [] } });
    const { syncCalendar } = await import("../../src/sync/calendar-sync.js");
    const result = await syncCalendar(OPTS);
    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("syncs one event and returns synced:1", async () => {
    mockEventsList.mockResolvedValue(ONE_EVENT);
    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { syncCalendar } = await import("../../src/sync/calendar-sync.js");
    const result = await syncCalendar(OPTS);
    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(0);
    expect(vi.mocked(appendInteraction)).toHaveBeenCalledOnce();
    const call = vi.mocked(appendInteraction).mock.calls[0]!;
    const entry = call[2] as { type: string; sourceRef: string };
    expect(entry.type).toBe("Meeting");
    expect(entry.sourceRef).toBe("gcal://event/gcal-001");
  });

  it("includes attendees in 'with' field", async () => {
    mockEventsList.mockResolvedValue(ONE_EVENT);
    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { syncCalendar } = await import("../../src/sync/calendar-sync.js");
    await syncCalendar(OPTS);
    const call = vi.mocked(appendInteraction).mock.calls[0]!;
    const entry = call[2] as { with: string };
    expect(entry.with).toContain("alice@acme.com");
  });

  it("skips events already in existing interactions (dedup)", async () => {
    mockEventsList.mockResolvedValue(ONE_EVENT);
    const { readInteractions, appendInteraction } = await import("../../src/fs/interactions-writer.js");
    vi.mocked(readInteractions).mockResolvedValue("gcal://event/gcal-001\n");
    const { syncCalendar } = await import("../../src/sync/calendar-sync.js");
    const result = await syncCalendar(OPTS);
    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(1);
    expect(vi.mocked(appendInteraction)).not.toHaveBeenCalled();
  });

  it("skips events without an id", async () => {
    mockEventsList.mockResolvedValue({
      data: {
        items: [
          { summary: "No ID event", start: { dateTime: "2026-05-10T10:00:00Z" } },
        ],
      },
    });
    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { syncCalendar } = await import("../../src/sync/calendar-sync.js");
    const result = await syncCalendar(OPTS);
    expect(result.synced).toBe(0);
    expect(vi.mocked(appendInteraction)).not.toHaveBeenCalled();
  });

  it("uses 'since' option as timeMin when provided", async () => {
    mockEventsList.mockResolvedValue({ data: { items: [] } });
    const { syncCalendar } = await import("../../src/sync/calendar-sync.js");
    const since = new Date("2026-01-01T00:00:00Z");
    await syncCalendar({ ...OPTS, since });
    const callArgs = mockEventsList.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs["timeMin"]).toBe("2026-01-01T00:00:00.000Z");
  });

  it("handles null/missing items gracefully", async () => {
    mockEventsList.mockResolvedValue({ data: {} });
    const { syncCalendar } = await import("../../src/sync/calendar-sync.js");
    const result = await syncCalendar(OPTS);
    expect(result.synced).toBe(0);
  });
});
