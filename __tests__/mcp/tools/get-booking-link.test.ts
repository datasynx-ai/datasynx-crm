import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

const mockGetSchedulingLink = vi.hoisted(() => vi.fn());
const mockListEventTypes = vi.hoisted(() => vi.fn());

vi.mock("../../../src/sync/calendly.js", () => ({
  getSchedulingLink: mockGetSchedulingLink,
  listEventTypes: mockListEventTypes,
}));

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

const DATA_DIR = "/data";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  delete process.env["CALENDLY_API_KEY"];
});

describe("handleGetBookingLink", () => {
  it("returns error when no API key configured", async () => {
    vol.fromJSON({});
    const { handleGetBookingLink } = await import("../../../src/mcp/tools/get-booking-link.js");
    const result = await handleGetBookingLink({ slug: "acme" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { error: string };
    expect(parsed.error).toContain("Calendly API key");
  });

  it("returns booking URL when API key set via env", async () => {
    process.env["CALENDLY_API_KEY"] = "test-key";
    mockGetSchedulingLink.mockResolvedValue("https://calendly.com/test/30min?name=Acme");
    mockListEventTypes.mockResolvedValue([{ slug: "30min", name: "30 Minute Meeting", duration: 30 }]);
    vol.fromJSON({});

    const { handleGetBookingLink } = await import("../../../src/mcp/tools/get-booking-link.js");
    const result = await handleGetBookingLink({ slug: "acme" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { bookingUrl: string; slug: string };
    expect(parsed.bookingUrl).toContain("calendly.com");
    expect(parsed.slug).toBe("acme");
  });

  it("returns error when getSchedulingLink throws", async () => {
    process.env["CALENDLY_API_KEY"] = "test-key";
    mockGetSchedulingLink.mockRejectedValue(new Error("Calendly API error"));
    mockListEventTypes.mockRejectedValue(new Error("Calendly API error"));
    vol.fromJSON({});

    const { handleGetBookingLink } = await import("../../../src/mcp/tools/get-booking-link.js");
    const result = await handleGetBookingLink({ slug: "acme" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { error: string };
    expect(parsed.error).toBeTruthy();
  });

  it("reads API key from calendly.yaml config", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/integrations/calendly.yaml`]: "apiKey: yaml-key\ndefaultEventType: 60min\n",
    });
    mockGetSchedulingLink.mockResolvedValue("https://calendly.com/test/60min");
    mockListEventTypes.mockResolvedValue([{ slug: "60min", name: "60 Minute Meeting", duration: 60 }]);

    const { handleGetBookingLink } = await import("../../../src/mcp/tools/get-booking-link.js");
    const result = await handleGetBookingLink({ slug: "acme" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { error?: string; bookingUrl?: string };
    // Should succeed (no error) since yaml-key is found
    expect(parsed.error).toBeUndefined();
  });

  it("includes duration from event type", async () => {
    process.env["CALENDLY_API_KEY"] = "test-key";
    mockGetSchedulingLink.mockResolvedValue("https://calendly.com/test/30min");
    mockListEventTypes.mockResolvedValue([{ slug: "30min", name: "Quick Chat", duration: 30 }]);
    vol.fromJSON({});

    const { handleGetBookingLink } = await import("../../../src/mcp/tools/get-booking-link.js");
    const result = await handleGetBookingLink({ slug: "acme" }, DATA_DIR);
    const parsed = JSON.parse(result.content[0].text) as { duration: number };
    expect(parsed.duration).toBe(30);
  });
});
