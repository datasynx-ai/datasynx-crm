import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vol.reset();
});

const DATA_DIR = "/data";
const SLUG = "acme-corp";

function parseResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe("handleOpenDealRoom", () => {
  it("returns slug and dealName", async () => {
    vol.fromJSON({});
    const { handleOpenDealRoom } = await import("../../../src/mcp/tools/open-deal-room.js");
    const result = await handleOpenDealRoom({ slug: SLUG, dealName: "Enterprise License" }, DATA_DIR);
    const parsed = parseResult(result);
    expect(parsed["slug"]).toBe(SLUG);
    expect(parsed["dealName"]).toBe("Enterprise License");
  });

  it("includes riskScore", async () => {
    vol.fromJSON({});
    const { handleOpenDealRoom } = await import("../../../src/mcp/tools/open-deal-room.js");
    const result = await handleOpenDealRoom({ slug: SLUG, dealName: "Test Deal" }, DATA_DIR);
    const parsed = parseResult(result);
    expect(typeof parsed["riskScore"]).toBe("number");
  });

  it("includes topPriorities array", async () => {
    vol.fromJSON({});
    const { handleOpenDealRoom } = await import("../../../src/mcp/tools/open-deal-room.js");
    const result = await handleOpenDealRoom({ slug: SLUG, dealName: "Test Deal" }, DATA_DIR);
    const parsed = parseResult(result);
    expect(Array.isArray(parsed["topPriorities"])).toBe(true);
  });
});
