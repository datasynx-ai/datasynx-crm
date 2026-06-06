import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("google-auth-library", () => {
  const setCredentials = vi.fn();
  const generateAuthUrl = vi.fn().mockReturnValue("https://accounts.google.com/o/oauth2/auth");
  const getToken = vi.fn().mockResolvedValue({ tokens: { access_token: "new-token" } });
  const OAuth2Client = vi.fn(function () {
    return { setCredentials, generateAuthUrl, getToken };
  });
  return { OAuth2Client };
});

vi.mock("readline", () => ({
  default: {
    createInterface: vi.fn().mockReturnValue({
      question: (_prompt: string, cb: (answer: string) => void) => cb("auth-code-123"),
      close: vi.fn(),
    }),
  },
  createInterface: vi.fn().mockReturnValue({
    question: (_prompt: string, cb: (answer: string) => void) => cb("auth-code-123"),
    close: vi.fn(),
  }),
}));

beforeEach(() => {
  vol.reset();
  vi.resetModules();
  vi.clearAllMocks();
});

const CREDENTIALS = {
  installed: {
    client_id: "cid",
    client_secret: "csecret",
    redirect_uris: ["urn:ietf:wg:oauth:2.0:oob"],
  },
};

const TOKEN = {
  access_token: "ya29.testtoken",
  refresh_token: "1//refresh",
  expiry_date: 9999999999999,
};

describe("getGmailAuth", () => {
  it("returns OAuth2Client when token file exists", async () => {
    vol.fromJSON({
      "/creds/credentials.json": JSON.stringify(CREDENTIALS),
      "/creds/token.json": JSON.stringify(TOKEN),
    });

    const { getGmailAuth } = await import("../../src/sync/gmail-auth.js");
    const client = await getGmailAuth("/creds/credentials.json", "/creds/token.json");
    expect(client).toBeDefined();
    expect(client.setCredentials).toHaveBeenCalledWith(TOKEN);
  });

  it("supports web credentials format", async () => {
    const webCreds = {
      web: {
        client_id: "webcid",
        client_secret: "websecret",
        redirect_uris: ["https://myapp.com/callback"],
      },
    };
    vol.fromJSON({
      "/creds/credentials.json": JSON.stringify(webCreds),
      "/creds/token.json": JSON.stringify(TOKEN),
    });

    const { getGmailAuth } = await import("../../src/sync/gmail-auth.js");
    const client = await getGmailAuth("/creds/credentials.json", "/creds/token.json");
    expect(client).toBeDefined();
    expect(client.setCredentials).toHaveBeenCalledWith(TOKEN);
  });

  it("sets token credentials from token file", async () => {
    const customToken = { access_token: "mytoken", expiry_date: 12345 };
    vol.fromJSON({
      "/creds/credentials.json": JSON.stringify(CREDENTIALS),
      "/creds/token.json": JSON.stringify(customToken),
    });

    const { getGmailAuth } = await import("../../src/sync/gmail-auth.js");
    const client = await getGmailAuth("/creds/credentials.json", "/creds/token.json");
    expect(client.setCredentials).toHaveBeenCalledWith(customToken);
  });

  it("prompts for authorization and saves token when no token file exists", async () => {
    vol.fromJSON({
      "/creds/credentials.json": JSON.stringify(CREDENTIALS),
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getGmailAuth } = await import("../../src/sync/gmail-auth.js");
    const client = await getGmailAuth("/creds/credentials.json", "/creds/token.json");
    expect(client).toBeDefined();
    expect(client.generateAuthUrl).toHaveBeenCalled();
    // Token should be saved to disk after auth
    const tokenExists = vol.existsSync("/creds/token.json");
    expect(tokenExists).toBe(true);
    errorSpy.mockRestore();
  });
});
