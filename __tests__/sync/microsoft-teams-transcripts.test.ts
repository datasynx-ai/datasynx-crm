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
  userId: "user-123",
  meetingId: "meeting-456",
  slug: "acme-corp",
  dataDir: "/crm",
  accessToken: "tok",
};

describe("syncTeamsTranscript", () => {
  it("returns synced:false when transcripts list is empty", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ value: [] }) });
    const { syncTeamsTranscript } = await import("../../src/sync/microsoft-teams-transcripts.js");
    const result = await syncTeamsTranscript(OPTS);
    expect(result.synced).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it("syncs transcript entries into an interaction", async () => {
    const transcriptsResp = {
      value: [{ id: "transcript-001", createdDateTime: "2026-05-10T10:00:00Z" }],
    };
    const entriesResp = {
      value: [
        { id: "e1", text: "Hello team", participant: { user: { displayName: "Alice" } } },
        { id: "e2", text: "Thanks Alice", participant: { user: { displayName: "Bob" } } },
      ],
    };
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(transcriptsResp) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(entriesResp) });

    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { syncTeamsTranscript } = await import("../../src/sync/microsoft-teams-transcripts.js");
    const result = await syncTeamsTranscript(OPTS);
    expect(result.synced).toBe(true);
    expect(result.error).toBeUndefined();
    expect(vi.mocked(appendInteraction)).toHaveBeenCalledOnce();
    const call = vi.mocked(appendInteraction).mock.calls[0]!;
    const entry = call[2] as { type: string; sourceRef: string; summary: string };
    expect(entry.type).toBe("Meeting");
    expect(entry.sourceRef).toBe("microsoft://teams/transcript/transcript-001");
    expect(entry.summary).toContain("Alice");
    expect(entry.summary).toContain("Hello team");
  });

  it("skips if sourceRef already exists in interactions", async () => {
    const { readInteractions } = await import("../../src/fs/interactions-writer.js");
    vi.mocked(readInteractions).mockResolvedValue("microsoft://teams/transcript/transcript-001");

    const transcriptsResp = {
      value: [{ id: "transcript-001", createdDateTime: "2026-05-10T10:00:00Z" }],
    };
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(transcriptsResp) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ value: [] }) });

    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { syncTeamsTranscript } = await import("../../src/sync/microsoft-teams-transcripts.js");
    const result = await syncTeamsTranscript(OPTS);
    expect(result.synced).toBe(false);
    expect(vi.mocked(appendInteraction)).not.toHaveBeenCalled();
  });

  it("handles API errors gracefully", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" });
    const { syncTeamsTranscript } = await import("../../src/sync/microsoft-teams-transcripts.js");
    const result = await syncTeamsTranscript(OPTS);
    expect(result.synced).toBe(false);
    expect(result.error).toMatch(/403/);
  });

  it("handles network errors gracefully", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const { syncTeamsTranscript } = await import("../../src/sync/microsoft-teams-transcripts.js");
    const result = await syncTeamsTranscript(OPTS);
    expect(result.synced).toBe(false);
    expect(result.error).toMatch(/ECONNRESET/);
  });

  it("builds correct sourceRef format", async () => {
    const transcriptsResp = {
      value: [{ id: "my-transcript-id", createdDateTime: "2026-05-10T10:00:00Z" }],
    };
    const entriesResp = { value: [] };
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(transcriptsResp) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(entriesResp) });

    const { appendInteraction } = await import("../../src/fs/interactions-writer.js");
    const { syncTeamsTranscript } = await import("../../src/sync/microsoft-teams-transcripts.js");
    await syncTeamsTranscript(OPTS);
    const call = vi.mocked(appendInteraction).mock.calls[0]!;
    const entry = call[2] as { sourceRef: string };
    expect(entry.sourceRef).toBe("microsoft://teams/transcript/my-transcript-id");
  });
});
