import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const mockEmitEvent = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/webhooks.js", () => ({ emitEvent: mockEmitEvent }));

const DATA_DIR = "/data";

beforeEach(async () => {
  vol.reset();
  vi.clearAllMocks();
  mockEmitEvent.mockResolvedValue(undefined);
  vol.mkdirSync(`${DATA_DIR}/.agentic`, { recursive: true });
  const { createCustomer } = await import("../../src/commands/create.js");
  await createCustomer({ name: "Acme", domain: "acme.com", dataDir: DATA_DIR });
});

describe("Teams transcript resource parsing (#56)", () => {
  it("detects and parses transcript resources", async () => {
    const { isTeamsTranscriptResource, parseTeamsTranscriptResource } =
      await import("../../src/sync/transcript-discovery.js");
    const r = "users('u-1')/onlineMeetings('m-9')/transcripts('t-3')";
    expect(isTeamsTranscriptResource(r)).toBe(true);
    expect(parseTeamsTranscriptResource(r)).toEqual({
      userId: "u-1",
      meetingId: "m-9",
      transcriptId: "t-3",
    });
    expect(isTeamsTranscriptResource("/me/messages")).toBe(false);
    expect(parseTeamsTranscriptResource("/me/messages")).toBeNull();
  });

  it("parses communications-scoped resources without a user id", async () => {
    const { parseTeamsTranscriptResource } = await import("../../src/sync/transcript-discovery.js");
    expect(
      parseTeamsTranscriptResource("communications/onlineMeetings('m-2')/transcripts('t-1')")
    ).toEqual({ meetingId: "m-2", transcriptId: "t-1" });
  });
});

describe("extractConferenceRecordId (#56)", () => {
  it("pulls the conference record id from a workspace event payload", async () => {
    const { extractConferenceRecordId } = await import("../../src/sync/transcript-discovery.js");
    expect(
      extractConferenceRecordId({
        ce: { data: { transcript: { name: "conferenceRecords/abc-123/transcripts/t1" } } },
      })
    ).toBe("conferenceRecords/abc-123");
    expect(extractConferenceRecordId({ nothing: true })).toBeNull();
  });
});

describe("routeByAttendees (#56)", () => {
  it("routes by domain, returns null when nothing matches", async () => {
    const { routeByAttendees } = await import("../../src/sync/transcript-discovery.js");
    expect(routeByAttendees(DATA_DIR, ["someone@acme.com"])).toBe("acme");
    expect(routeByAttendees(DATA_DIR, ["nobody@other.io"])).toBeNull();
    expect(routeByAttendees(DATA_DIR, [])).toBeNull();
  });
});

describe("discoverTeamsTranscript (#56)", () => {
  it("routes to a customer and calls syncTeams + emits meeting.transcribed", async () => {
    const { discoverTeamsTranscript } = await import("../../src/sync/transcript-discovery.js");
    const syncTeams = vi.fn().mockResolvedValue({ synced: true });
    const res = await discoverTeamsTranscript(
      DATA_DIR,
      {
        subscriptionId: "sub-1",
        resource: "users('u-1')/onlineMeetings('m-9')/transcripts('t-3')",
        resourceData: { id: "t-3", "@odata.type": "#microsoft.graph.callTranscript" },
      },
      { accessToken: "tok", fetchAttendees: async () => ["jane@acme.com"], syncTeams }
    );
    expect(res.status).toBe("routed");
    expect(res.slug).toBe("acme");
    expect(syncTeams).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-1", meetingId: "m-9", slug: "acme", dataDir: DATA_DIR })
    );
    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "meeting.transcribed",
      expect.objectContaining({ slug: "acme", source: "teams" })
    );
  });

  it("queues unmatched transcripts when no customer matches", async () => {
    const { discoverTeamsTranscript } = await import("../../src/sync/transcript-discovery.js");
    const syncTeams = vi.fn();
    const res = await discoverTeamsTranscript(
      DATA_DIR,
      { subscriptionId: "s", resource: "users('u')/onlineMeetings('m-x')/transcripts('t')" },
      { accessToken: "tok", fetchAttendees: async () => ["stranger@nope.io"], syncTeams }
    );
    expect(res.status).toBe("unmatched");
    expect(syncTeams).not.toHaveBeenCalled();
    const { readUnmatched } = await import("../../src/fs/unmatched-transcripts.js");
    const q = readUnmatched(DATA_DIR);
    expect(q).toHaveLength(1);
    expect(q[0]!.filePath).toContain("m-x");
    expect(mockEmitEvent).not.toHaveBeenCalled();
  });

  it("skips non-transcript resources and attendee-less meetings", async () => {
    const { discoverTeamsTranscript } = await import("../../src/sync/transcript-discovery.js");
    const syncTeams = vi.fn();
    const deps = { accessToken: "t", fetchAttendees: async () => [], syncTeams };
    expect(
      (
        await discoverTeamsTranscript(
          DATA_DIR,
          { subscriptionId: "s", resource: "/me/messages" },
          deps
        )
      ).status
    ).toBe("skipped");
    expect(
      (
        await discoverTeamsTranscript(
          DATA_DIR,
          { subscriptionId: "s", resource: "users('u')/onlineMeetings('m')/transcripts('t')" },
          deps
        )
      ).status
    ).toBe("skipped");
    expect(syncTeams).not.toHaveBeenCalled();
  });
});

describe("discoverMeetTranscript (#56)", () => {
  it("routes a Meet conference record to a customer", async () => {
    const { discoverMeetTranscript } = await import("../../src/sync/transcript-discovery.js");
    const syncMeet = vi.fn().mockResolvedValue({ synced: true });
    const res = await discoverMeetTranscript(
      DATA_DIR,
      { conferenceRecordId: "conferenceRecords/abc" },
      { accessToken: "tok", fetchAttendees: async () => ["bob@acme.com"], syncMeet }
    );
    expect(res.status).toBe("routed");
    expect(res.slug).toBe("acme");
    expect(syncMeet).toHaveBeenCalledWith(
      expect.objectContaining({ conferenceRecordId: "conferenceRecords/abc", slug: "acme" })
    );
    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "meeting.transcribed",
      expect.objectContaining({ slug: "acme", source: "meet" })
    );
  });

  it("queues unmatched Meet records", async () => {
    const { discoverMeetTranscript } = await import("../../src/sync/transcript-discovery.js");
    const res = await discoverMeetTranscript(
      DATA_DIR,
      { conferenceRecordId: "conferenceRecords/zzz" },
      { accessToken: "tok", fetchAttendees: async () => ["x@nomatch.io"], syncMeet: vi.fn() }
    );
    expect(res.status).toBe("unmatched");
    const { readUnmatched } = await import("../../src/fs/unmatched-transcripts.js");
    expect(readUnmatched(DATA_DIR)[0]!.filePath).toContain("zzz");
  });
});

describe("handleMicrosoftPushEvent transcript dispatch (#56)", () => {
  it("routes transcript notifications through discovery, leaves email path intact", async () => {
    const { handleMicrosoftPushEvent } =
      await import("../../src/sync/microsoft-webhook-handler.js");
    const syncTeams = vi.fn().mockResolvedValue({ synced: true });
    const result = await handleMicrosoftPushEvent(
      DATA_DIR,
      [
        {
          subscriptionId: "sub-t",
          resource: "users('u')/onlineMeetings('m-77')/transcripts('t')",
          resourceData: { id: "t", "@odata.type": "#microsoft.graph.callTranscript" },
        },
      ],
      "tok",
      {
        transcriptDeps: {
          accessToken: "tok",
          fetchAttendees: async () => ["a@acme.com"],
          syncTeams,
        },
      }
    );
    expect(result.processed).toBe(1);
    expect(syncTeams).toHaveBeenCalled();
  });
});

describe("harvestEmails (#56)", () => {
  it("collects email-looking strings from any nested shape", async () => {
    const { harvestEmails } = await import("../../src/sync/transcript-discovery.js");
    const payload = {
      participants: {
        organizer: { upn: "Host@Acme.com" },
        attendees: [{ identity: { user: { email: "guest@acme.com" } } }, { upn: "x" }],
      },
      note: "ping me at sales@globex.io",
    };
    expect(harvestEmails(payload).sort()).toEqual(["guest@acme.com", "host@acme.com"]);
    expect(harvestEmails({})).toEqual([]);
  });
});

describe("poll fallbacks (#56)", () => {
  it("dispatches Teams refs through discovery and tallies outcomes", async () => {
    const { pollTeamsTranscripts } = await import("../../src/sync/transcript-discovery.js");
    const syncTeams = vi.fn().mockResolvedValue({ synced: true });
    const summary = await pollTeamsTranscripts(
      DATA_DIR,
      [
        { userId: "u", meetingId: "m-1" },
        { userId: "u", meetingId: "m-2" },
      ],
      {
        accessToken: "t",
        // first routes (acme), second is unmatched
        fetchAttendees: async (ref) =>
          ref.meetingId === "m-1" ? ["a@acme.com"] : ["b@nomatch.io"],
        syncTeams,
      }
    );
    expect(summary).toEqual({ routed: 1, unmatched: 1, skipped: 0 });
  });

  it("dispatches Meet conference records through discovery", async () => {
    const { pollMeetTranscripts } = await import("../../src/sync/transcript-discovery.js");
    const summary = await pollMeetTranscripts(DATA_DIR, ["conferenceRecords/x"], {
      accessToken: "t",
      fetchAttendees: async () => ["a@acme.com"],
      syncMeet: vi.fn().mockResolvedValue({ synced: true }),
    });
    expect(summary).toEqual({ routed: 1, unmatched: 0, skipped: 0 });
  });
});

describe("buildMicrosoftRenewFn (#56)", () => {
  it("PATCHes the Graph subscription and returns the new expiry", async () => {
    const { buildMicrosoftRenewFn } = await import("../../src/sync/transcript-discovery.js");
    const newExp = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ expirationDateTime: newExp }),
    });
    const renew = buildMicrosoftRenewFn("tok", fetchFn as never);
    const out = await renew({
      providerData: { microsoftSubscriptionId: "graph-sub-1" },
    } as never);
    expect(out.expiresAt).toBe(newExp);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/subscriptions/graph-sub-1",
      expect.objectContaining({ method: "PATCH" })
    );
  });
});
