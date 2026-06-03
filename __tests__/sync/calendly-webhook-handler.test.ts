import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

const DATA_DIR = "/data";

function makeMainFacts(email: string): string {
  return `# Acme Corp\n\nemail: ${email}\nname: Acme\n`;
}

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    event: "invitee.created",
    payload: {
      invitee: { name: "Alice Smith", email: "alice@acme.com" },
      scheduled_event: {
        name: "30 Minute Discovery Call",
        start_time: "2026-06-01T10:00:00.000Z",
        end_time: "2026-06-01T10:30:00.000Z",
        uri: "https://api.calendly.com/scheduled_events/ABCDEF",
      },
      ...overrides,
    },
  };
}

describe("handleCalendlyWebhook", () => {
  it("appends a Meeting interaction when slug is resolved by email", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/main_facts.md`]: makeMainFacts("alice@acme.com"),
    });
    const { handleCalendlyWebhook } = await import("../../src/sync/calendly-webhook-handler.js");
    await handleCalendlyWebhook(
      makePayload() as Parameters<typeof handleCalendlyWebhook>[0],
      DATA_DIR
    );
    const interactionsPath = `/data/customers/acme-corp/interactions.md`;
    const content = vol.readFileSync(interactionsPath, "utf-8") as string;
    expect(content).toContain("Meeting");
    expect(content).toContain("Discovery Call");
  });

  it("returns early when event type is not invitee.created", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/main_facts.md`]: makeMainFacts("alice@acme.com"),
    });
    const { handleCalendlyWebhook } = await import("../../src/sync/calendly-webhook-handler.js");
    await handleCalendlyWebhook(
      { event: "invitee.canceled", payload: {} } as Parameters<typeof handleCalendlyWebhook>[0],
      DATA_DIR
    );
    expect(vol.existsSync(`${DATA_DIR}/customers/acme-corp/interactions.md`)).toBe(false);
  });

  it("returns early when invitee email is missing", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/main_facts.md`]: makeMainFacts("alice@acme.com"),
    });
    const { handleCalendlyWebhook } = await import("../../src/sync/calendly-webhook-handler.js");
    await handleCalendlyWebhook(
      {
        event: "invitee.created",
        payload: { invitee: { name: "Alice" } },
      } as Parameters<typeof handleCalendlyWebhook>[0],
      DATA_DIR
    );
    expect(vol.existsSync(`${DATA_DIR}/customers/acme-corp/interactions.md`)).toBe(false);
  });

  it("returns early when email not found in any customer", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/main_facts.md`]: makeMainFacts("other@acme.com"),
    });
    const { handleCalendlyWebhook } = await import("../../src/sync/calendly-webhook-handler.js");
    await handleCalendlyWebhook(
      makePayload() as Parameters<typeof handleCalendlyWebhook>[0],
      DATA_DIR
    );
    expect(vol.existsSync(`${DATA_DIR}/customers/acme-corp/interactions.md`)).toBe(false);
  });

  it("falls back to payload.email when invitee.email is absent", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/main_facts.md`]: makeMainFacts("alice@acme.com"),
    });
    const { handleCalendlyWebhook } = await import("../../src/sync/calendly-webhook-handler.js");
    await handleCalendlyWebhook(
      {
        event: "invitee.created",
        payload: {
          email: "alice@acme.com",
          name: "Alice",
          scheduled_event: { name: "Call", start_time: "2026-06-01T10:00:00.000Z" },
        },
      } as Parameters<typeof handleCalendlyWebhook>[0],
      DATA_DIR
    );
    const content = vol.readFileSync(
      `/data/customers/acme-corp/interactions.md`,
      "utf-8"
    ) as string;
    expect(content).toContain("Meeting");
  });

  it("handles no customers dir gracefully", async () => {
    vol.fromJSON({});
    const { handleCalendlyWebhook } = await import("../../src/sync/calendly-webhook-handler.js");
    await expect(
      handleCalendlyWebhook(makePayload() as Parameters<typeof handleCalendlyWebhook>[0], DATA_DIR)
    ).resolves.toBeUndefined();
  });

  it("uses scheduled_event_uuid as sourceRef when uri is absent", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme-corp/main_facts.md`]: makeMainFacts("alice@acme.com"),
    });
    const { handleCalendlyWebhook } = await import("../../src/sync/calendly-webhook-handler.js");
    await handleCalendlyWebhook(
      {
        event: "invitee.created",
        payload: {
          invitee: { name: "Alice", email: "alice@acme.com" },
          scheduled_event_uuid: "uuid-1234",
          scheduled_event: { name: "Call", start_time: "2026-06-01T10:00:00.000Z" },
        },
      } as Parameters<typeof handleCalendlyWebhook>[0],
      DATA_DIR
    );
    const content = vol.readFileSync(
      `/data/customers/acme-corp/interactions.md`,
      "utf-8"
    ) as string;
    expect(content).toContain("uuid-1234");
  });
});
