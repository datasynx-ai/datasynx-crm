import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { vol } from "memfs";

vi.mock("../../src/fs/interactions-writer.js", () => ({
  appendInteraction: vi.fn().mockResolvedValue(undefined),
  readInteractions: vi.fn().mockResolvedValue(""),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const OPTS = {
  conferenceRecordId: "conferenceRecords/abc123",
  slug: "acme-corp",
  dataDir: "/crm",
  accessToken: "tok",
};

describe("syncGoogleMeetTranscript", () => {
  it("returns synced:false when no transcripts", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ transcripts: [] }) });
    const { syncGoogleMeetTranscript } = await import("../../src/sync/google-meet-sync.js");
    const result = await syncGoogleMeetTranscript(OPTS);
    expect(result.synced).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it("returns synced:false when transcripts field is absent", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    const { syncGoogleMeetTranscript } = await import("../../src/sync/google-meet-sync.js");
    const result = await syncGoogleMeetTranscript(OPTS);
    expect(result.synced).toBe(false);
  });

  it("syncs transcript entries into an interaction", async () => {
    const transcriptsResp = {
      transcripts: [{ name: "conferenceRecords/abc123/transcripts/t1" }],
    };
    const entriesResp = {
      transcriptEntries: [
        {
          name: "entry-1",
          text: "Hello everyone",
          startTime: "2026-05-10T10:00:00Z",
          participantSession: { participant: { signedinUser: { displayName: "Alice" } } },
        },
        {
          name: "entry-2",
          text: "Let's begin",
          startTime: "2026-05-10T10:01:00Z",
          participantSession: { participant: { signedinUser: { displayName: "Bob" } } },
        },
      ],
    };
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(transcriptsResp) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(entriesResp) });

    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { syncGoogleMeetTranscript } = await import("../../src/sync/google-meet-sync.js");
    const result = await syncGoogleMeetTranscript(OPTS);
    expect(result.synced).toBe(true);
    expect(result.error).toBeUndefined();
    expect(vi.mocked(appendInteraction)).toHaveBeenCalledOnce();
    const call = vi.mocked(appendInteraction).mock.calls[0]!;
    const entry = call[2] as { type: string; sourceRef: string; summary: string; with: string };
    expect(entry.type).toBe("Meeting");
    expect(entry.with).toBe("Google Meet");
    expect(entry.sourceRef).toBe("google://meet/transcript/conferenceRecords/abc123/transcripts/t1");
    expect(entry.summary).toContain("Alice");
  });

  it("skips if already synced", async () => {
    const { readInteractions } = await import("../../src/fs/interactions-writer.js");
    vi.mocked(readInteractions).mockResolvedValue(
      "google://meet/transcript/conferenceRecords/abc123/transcripts/t1"
    );

    const transcriptsResp = {
      transcripts: [{ name: "conferenceRecords/abc123/transcripts/t1" }],
    };
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(transcriptsResp) });

    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { syncGoogleMeetTranscript } = await import("../../src/sync/google-meet-sync.js");
    const result = await syncGoogleMeetTranscript(OPTS);
    expect(result.synced).toBe(false);
    expect(vi.mocked(appendInteraction)).not.toHaveBeenCalled();
  });

  it("handles API errors gracefully", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" });
    const { syncGoogleMeetTranscript } = await import("../../src/sync/google-meet-sync.js");
    const result = await syncGoogleMeetTranscript(OPTS);
    expect(result.synced).toBe(false);
    expect(result.error).toMatch(/403/);
  });

  it("handles network errors gracefully", async () => {
    fetchMock.mockRejectedValue(new Error("DNS_FAIL"));
    const { syncGoogleMeetTranscript } = await import("../../src/sync/google-meet-sync.js");
    const result = await syncGoogleMeetTranscript(OPTS);
    expect(result.synced).toBe(false);
    expect(result.error).toMatch(/DNS_FAIL/);
  });

  it("uses correct sourceRef format: google://meet/transcript/...", async () => {
    const transcriptName = "conferenceRecords/abc123/transcripts/myTranscript";
    const transcriptsResp = { transcripts: [{ name: transcriptName }] };
    const entriesResp = { transcriptEntries: [] };
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(transcriptsResp) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(entriesResp) });

    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { syncGoogleMeetTranscript } = await import("../../src/sync/google-meet-sync.js");
    await syncGoogleMeetTranscript(OPTS);
    const call = vi.mocked(appendInteraction).mock.calls[0]!;
    const entry = call[2] as { sourceRef: string };
    expect(entry.sourceRef).toBe(`google://meet/transcript/${transcriptName}`);
  });
});
