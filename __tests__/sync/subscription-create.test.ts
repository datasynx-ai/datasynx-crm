import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  vol.fromJSON({ "/data/.agentic/.keep": "" });
});

function okFetch(payload: unknown): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
}

describe("createTeamsTranscriptSubscription (#63)", () => {
  it("POSTs a Graph subscription and registers it with the returned expiry", async () => {
    const fetchFn = okFetch({ id: "graph-sub-1", expirationDateTime: "2026-06-13T00:00:00Z" });
    const { createTeamsTranscriptSubscription } =
      await import("../../src/sync/subscription-create.js");
    const sub = await createTeamsTranscriptSubscription({
      dataDir: "/data",
      accessToken: "tok",
      webhookBaseUrl: "https://crm.example.com/",
      clientState: "cs-secret",
      fetchFn: fetchFn as never,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/subscriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    );
    const body = JSON.parse((fetchFn.mock.calls[0]![1] as { body: string }).body) as Record<
      string,
      string
    >;
    expect(body).toMatchObject({
      changeType: "created",
      notificationUrl: "https://crm.example.com/webhooks/microsoft",
      resource: "communications/onlineMeetings/getAllTranscripts",
      clientState: "cs-secret",
    });
    expect(new Date(body["expirationDateTime"]!).getTime()).toBeGreaterThan(Date.now());

    expect(sub.provider).toBe("microsoft-graph");
    expect(sub.expiresAt).toBe("2026-06-13T00:00:00Z");
    expect(sub.providerData.microsoftSubscriptionId).toBe("graph-sub-1");
    expect(sub.providerData.microsoftResource).toBe(
      "communications/onlineMeetings/getAllTranscripts"
    );

    const { readSubscriptions } = await import("../../src/sync/push-manager.js");
    const stored = await readSubscriptions("/data");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: sub.id, status: "active" });
  });

  it("uses the per-user resource when userId is given", async () => {
    const fetchFn = okFetch({ id: "graph-sub-2", expirationDateTime: "2026-06-13T00:00:00Z" });
    const { createTeamsTranscriptSubscription } =
      await import("../../src/sync/subscription-create.js");
    await createTeamsTranscriptSubscription({
      dataDir: "/data",
      accessToken: "tok",
      webhookBaseUrl: "https://crm.example.com",
      userId: "user-42",
      fetchFn: fetchFn as never,
    });
    const body = JSON.parse((fetchFn.mock.calls[0]![1] as { body: string }).body) as Record<
      string,
      string
    >;
    expect(body["resource"]).toBe("users/user-42/onlineMeetings/getAllTranscripts");
  });

  it("throws with the Graph error and registers nothing on non-ok responses", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: "missing permission" } }),
      text: async () => '{"error":{"message":"missing permission"}}',
    });
    const { createTeamsTranscriptSubscription } =
      await import("../../src/sync/subscription-create.js");
    await expect(
      createTeamsTranscriptSubscription({
        dataDir: "/data",
        accessToken: "tok",
        webhookBaseUrl: "https://crm.example.com",
        fetchFn: fetchFn as never,
      })
    ).rejects.toThrow(/403/);
    const { readSubscriptions } = await import("../../src/sync/push-manager.js");
    expect(await readSubscriptions("/data")).toHaveLength(0);
  });
});

describe("createMeetTranscriptSubscription (#63)", () => {
  it("POSTs a Workspace Events subscription and registers it", async () => {
    const fetchFn = okFetch({
      name: "subscriptions/ws-1",
      expireTime: "2026-06-17T00:00:00Z",
    });
    const { createMeetTranscriptSubscription } =
      await import("../../src/sync/subscription-create.js");
    const sub = await createMeetTranscriptSubscription({
      dataDir: "/data",
      accessToken: "gtok",
      pubsubTopic: "projects/p/topics/meet-events",
      fetchFn: fetchFn as never,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      "https://workspaceevents.googleapis.com/v1/subscriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer gtok" }),
      })
    );
    const body = JSON.parse((fetchFn.mock.calls[0]![1] as { body: string }).body) as {
      targetResource: string;
      eventTypes: string[];
      notificationEndpoint: { pubsubTopic: string };
      ttl: string;
    };
    expect(body.eventTypes).toEqual(["google.workspace.meet.transcript.v2.fileGenerated"]);
    expect(body.notificationEndpoint).toEqual({ pubsubTopic: "projects/p/topics/meet-events" });
    expect(body.targetResource).toBe("//cloudidentity.googleapis.com/users/me");
    expect(body.ttl).toBe("604800s");

    expect(sub.provider).toBe("google-workspace");
    expect(sub.expiresAt).toBe("2026-06-17T00:00:00Z");
    expect(sub.providerData.googleSubscriptionName).toBe("subscriptions/ws-1");

    const { readSubscriptions } = await import("../../src/sync/push-manager.js");
    expect(await readSubscriptions("/data")).toHaveLength(1);
  });

  it("honors a custom targetResource", async () => {
    const fetchFn = okFetch({ name: "subscriptions/ws-2", expireTime: "2026-06-17T00:00:00Z" });
    const { createMeetTranscriptSubscription } =
      await import("../../src/sync/subscription-create.js");
    await createMeetTranscriptSubscription({
      dataDir: "/data",
      accessToken: "gtok",
      pubsubTopic: "projects/p/topics/t",
      targetResource: "//meet.googleapis.com/spaces/abc",
      fetchFn: fetchFn as never,
    });
    const body = JSON.parse((fetchFn.mock.calls[0]![1] as { body: string }).body) as {
      targetResource: string;
    };
    expect(body.targetResource).toBe("//meet.googleapis.com/spaces/abc");
  });

  it("throws and registers nothing on non-ok responses", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
      text: async () => "bad request",
    });
    const { createMeetTranscriptSubscription } =
      await import("../../src/sync/subscription-create.js");
    await expect(
      createMeetTranscriptSubscription({
        dataDir: "/data",
        accessToken: "gtok",
        pubsubTopic: "projects/p/topics/t",
        fetchFn: fetchFn as never,
      })
    ).rejects.toThrow(/400/);
    const { readSubscriptions } = await import("../../src/sync/push-manager.js");
    expect(await readSubscriptions("/data")).toHaveLength(0);
  });
});

describe("buildGoogleWorkspaceRenewFn (#63)", () => {
  it("PATCHes a fresh ttl and returns the new expiry", async () => {
    const fetchFn = okFetch({ expireTime: "2026-06-24T00:00:00Z" });
    const { buildGoogleWorkspaceRenewFn } = await import("../../src/sync/subscription-create.js");
    const renew = buildGoogleWorkspaceRenewFn("gtok", fetchFn as never);
    const result = await renew({
      providerData: { googleSubscriptionName: "subscriptions/ws-1" },
    } as never);

    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("https://workspaceevents.googleapis.com/v1/subscriptions/ws-1"),
      expect.objectContaining({ method: "PATCH" })
    );
    expect(result.expiresAt).toBe("2026-06-24T00:00:00Z");
  });

  it("rejects a subscription without a stored name", async () => {
    const { buildGoogleWorkspaceRenewFn } = await import("../../src/sync/subscription-create.js");
    const renew = buildGoogleWorkspaceRenewFn("gtok");
    await expect(renew({ providerData: {} } as never)).rejects.toThrow(/googleSubscriptionName/);
  });
});

describe("workspace renew + create fallback branches (#69)", () => {
  it("renew throws with the API error on non-ok responses", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 403, text: async () => "permission denied" });
    const { buildGoogleWorkspaceRenewFn } = await import("../../src/sync/subscription-create.js");
    const renew = buildGoogleWorkspaceRenewFn("gtok", fetchFn as never);
    await expect(
      renew({ providerData: { googleSubscriptionName: "subscriptions/ws-1" } } as never)
    ).rejects.toThrow(/Workspace Events renew failed/);
  });

  it("renew computes a local expiry when the response carries no expireTime", async () => {
    const fetchFn = okFetch({});
    const { buildGoogleWorkspaceRenewFn } = await import("../../src/sync/subscription-create.js");
    const renew = buildGoogleWorkspaceRenewFn("gtok", fetchFn as never);
    const before = Date.now();
    const result = await renew({
      providerData: { googleSubscriptionName: "subscriptions/ws-2" },
    } as never);
    const exp = new Date(result.expiresAt).getTime();
    // 7-day Workspace Events TTL, computed locally
    expect(exp).toBeGreaterThanOrEqual(before + 604_800_000 - 5000);
    expect(exp).toBeLessThanOrEqual(Date.now() + 604_800_000 + 5000);
  });

  it("create registers without expiry/name when the API omits them", async () => {
    const fetchFn = okFetch({});
    const { createMeetTranscriptSubscription } =
      await import("../../src/sync/subscription-create.js");
    const sub = await createMeetTranscriptSubscription({
      dataDir: "/data",
      accessToken: "gtok",
      pubsubTopic: "projects/p/topics/t",
      fetchFn: fetchFn as never,
    });
    expect(sub.provider).toBe("google-workspace");
    // without an API expireTime, push-manager applies its provider default
    const exp = new Date(sub.expiresAt ?? 0).getTime();
    expect(exp).toBeGreaterThan(Date.now());
    expect(sub.providerData["googleSubscriptionName"]).toBeUndefined();
    expect(sub.providerData["googlePubsubTopic"]).toBe("projects/p/topics/t");
  });
});
