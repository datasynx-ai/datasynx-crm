import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("getMicrosoftToken", () => {
  it("returns null when no token file exists", async () => {
    vol.fromJSON({});
    const { getMicrosoftToken } = await import("../../src/sync/microsoft-auth.js");
    const token = await getMicrosoftToken("/crm");
    expect(token).toBeNull();
  });

  it("returns accessToken from token file", async () => {
    vol.fromJSON({
      "/crm/.agentic/microsoft-token.json": JSON.stringify({ accessToken: "tok_abc123" }),
    });
    const { getMicrosoftToken } = await import("../../src/sync/microsoft-auth.js");
    const token = await getMicrosoftToken("/crm");
    expect(token).toBe("tok_abc123");
  });

  it("supports access_token (snake_case) field", async () => {
    vol.fromJSON({
      "/crm/.agentic/microsoft-token.json": JSON.stringify({ access_token: "tok_snake" }),
    });
    const { getMicrosoftToken } = await import("../../src/sync/microsoft-auth.js");
    const token = await getMicrosoftToken("/crm");
    expect(token).toBe("tok_snake");
  });

  it("returns null on malformed JSON", async () => {
    vol.fromJSON({ "/crm/.agentic/microsoft-token.json": "not json" });
    const { getMicrosoftToken } = await import("../../src/sync/microsoft-auth.js");
    const token = await getMicrosoftToken("/crm");
    expect(token).toBeNull();
  });
});
