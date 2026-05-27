import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { vol } from "memfs";

vi.mock("../../src/fs/interactions-writer.js", () => ({
  appendInteraction: vi.fn().mockResolvedValue(undefined),
  readInteractions: vi.fn().mockResolvedValue(""),
}));

vi.mock("../../src/fs/sync-state.js", () => ({
  updateSlugSyncState: vi.fn(),
  getLastGmailSync: vi.fn().mockReturnValue(undefined),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();

  // Restore default mock implementations after clearAllMocks
  const iw = await import("../../src/fs/interactions-writer.js");
  vi.mocked(iw.appendInteraction).mockResolvedValue(undefined);
  vi.mocked(iw.readInteractions).mockResolvedValue("");

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const EMPTY_RESPONSE = { value: [] };

const ONE_EVENT_RESPONSE = {
  value: [
    {
      id: "evt-001",
      subject: "Product Demo",
      bodyPreview: "Demo of the new features",
      start: { dateTime: "2026-05-10T10:00:00Z" },
      end: { dateTime: "2026-05-10T11:00:00Z" },
      attendees: [
        { emailAddress: { name: "Alice Smith", address: "alice@acme.com" } },
      ],
      organizer: { emailAddress: { name: "Bob Jones", address: "bob@us.com" } },
    },
  ],
};

describe("syncMicrosoftCalendar", () => {
  it("returns zero synced/skipped/errors on 200 empty response", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(EMPTY_RESPONSE) });
    const { syncMicrosoftCalendar } = await import("../../src/sync/microsoft-calendar.js");
    const result = await syncMicrosoftCalendar({ slug: "acme-corp", dataDir: "/crm", accessToken: "tok" });
    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("syncs one event from Graph response", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(ONE_EVENT_RESPONSE) });
    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { syncMicrosoftCalendar } = await import("../../src/sync/microsoft-calendar.js");
    const result = await syncMicrosoftCalendar({ slug: "acme-corp", dataDir: "/crm", accessToken: "tok" });
    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(vi.mocked(appendInteraction)).toHaveBeenCalledOnce();
    const call = vi.mocked(appendInteraction).mock.calls[0]!;
    const entry = call[2] as { type: string; sourceRef: string; with: string };
    expect(entry.type).toBe("Meeting");
    expect(entry.sourceRef).toBe("microsoft://calendar/evt-001");
    expect(entry.with).toBe("Alice Smith");
  });

  it("skips already-synced events (sourceRef present in existing interactions)", async () => {
    const { readInteractions } = await import("../../src/fs/interactions-writer.js");
    vi.mocked(readInteractions).mockResolvedValue("microsoft://calendar/evt-001\n");
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(ONE_EVENT_RESPONSE) });
    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { syncMicrosoftCalendar } = await import("../../src/sync/microsoft-calendar.js");
    const result = await syncMicrosoftCalendar({ slug: "acme-corp", dataDir: "/crm", accessToken: "tok" });
    expect(result.skipped).toBe(1);
    expect(result.synced).toBe(0);
    expect(vi.mocked(appendInteraction)).not.toHaveBeenCalled();
  });

  it("handles network errors gracefully", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const { syncMicrosoftCalendar } = await import("../../src/sync/microsoft-calendar.js");
    const result = await syncMicrosoftCalendar({ slug: "acme-corp", dataDir: "/crm", accessToken: "tok" });
    expect(result.synced).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/ECONNREFUSED/);
  });

  it("handles Graph API non-200 gracefully", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" });
    const { syncMicrosoftCalendar } = await import("../../src/sync/microsoft-calendar.js");
    const result = await syncMicrosoftCalendar({ slug: "acme-corp", dataDir: "/crm", accessToken: "bad" });
    expect(result.synced).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/401/);
  });

  it("follows @odata.nextLink for pagination", async () => {
    const page1 = {
      value: [
        {
          id: "evt-page1",
          subject: "Meeting 1",
          bodyPreview: "First meeting",
          start: { dateTime: "2026-05-10T10:00:00Z" },
          attendees: [],
          organizer: { emailAddress: { name: "Alice" } },
        },
      ],
      "@odata.nextLink": "https://graph.microsoft.com/next-page",
    };
    const page2 = {
      value: [
        {
          id: "evt-page2",
          subject: "Meeting 2",
          bodyPreview: "Second meeting",
          start: { dateTime: "2026-05-11T10:00:00Z" },
          attendees: [],
          organizer: { emailAddress: { name: "Bob" } },
        },
      ],
    };
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(page1) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(page2) });

    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { syncMicrosoftCalendar } = await import("../../src/sync/microsoft-calendar.js");
    const result = await syncMicrosoftCalendar({ slug: "acme-corp", dataDir: "/crm", accessToken: "tok" });
    expect(result.synced).toBe(2);
    expect(vi.mocked(appendInteraction)).toHaveBeenCalledTimes(2);
  });

  it("uses 'Meeting' interaction type", async () => {
    // This is already verified in the "syncs one event" test above.
    // We verify it again here as a standalone assertion by checking the synced event structure.
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(ONE_EVENT_RESPONSE) });
    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { syncMicrosoftCalendar } = await import("../../src/sync/microsoft-calendar.js");
    const result = await syncMicrosoftCalendar({ slug: "acme-corp", dataDir: "/crm", accessToken: "tok" });
    expect(result.synced).toBe(1);
    // appendInteraction is called with (dataDir, slug, entry)
    const mockFn = vi.mocked(appendInteraction);
    expect(mockFn.mock.calls.length).toBeGreaterThan(0);
    const call = mockFn.mock.calls[0]!;
    const entry = call[2] as { type: string };
    expect(entry.type).toBe("Meeting");
  });
});
