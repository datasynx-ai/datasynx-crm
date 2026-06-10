import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";

const DATA_DIR = "/data";

beforeEach(() => {
  vol.reset();
  vol.mkdirSync(`${DATA_DIR}/.agentic`, { recursive: true });
});

describe("getGoogleToken (#69)", () => {
  it("returns null when no token file exists", async () => {
    const { getGoogleToken } = await import("../../src/sync/google-auth.js");
    expect(await getGoogleToken(DATA_DIR)).toBeNull();
  });

  it("reads accessToken (camelCase) and access_token (snake_case)", async () => {
    const { getGoogleToken } = await import("../../src/sync/google-auth.js");
    vol.writeFileSync(
      `${DATA_DIR}/.agentic/google-token.json`,
      JSON.stringify({ accessToken: "ya29.camel" })
    );
    expect(await getGoogleToken(DATA_DIR)).toBe("ya29.camel");
    vol.writeFileSync(
      `${DATA_DIR}/.agentic/google-token.json`,
      JSON.stringify({ access_token: "ya29.snake" })
    );
    expect(await getGoogleToken(DATA_DIR)).toBe("ya29.snake");
  });

  it("returns null for corrupt JSON or a file without a token", async () => {
    const { getGoogleToken } = await import("../../src/sync/google-auth.js");
    vol.writeFileSync(`${DATA_DIR}/.agentic/google-token.json`, "{not json");
    expect(await getGoogleToken(DATA_DIR)).toBeNull();
    vol.writeFileSync(`${DATA_DIR}/.agentic/google-token.json`, JSON.stringify({ other: 1 }));
    expect(await getGoogleToken(DATA_DIR)).toBeNull();
  });
});
