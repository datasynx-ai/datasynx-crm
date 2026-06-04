import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

// We mock gmail-auth so we don't need real credentials
vi.mock("../../src/sync/gmail-auth.js", () => ({
  getGmailAuth: vi.fn(),
}));

import { getGmailAuth as loadAuthFromDisk } from "../../src/sync/gmail-auth.js";

const mockLoadAuth = vi.mocked(loadAuthFromDisk);

const DATA_DIR = "/data";
const CRED_PATH = `${DATA_DIR}/.agentic/gmail-credentials.json`;
const TOKEN_PATH = `${DATA_DIR}/.agentic/gmail-token.json`;

const fakeCredentials = JSON.stringify({
  installed: {
    client_id: "test-id",
    client_secret: "test-secret",
    redirect_uris: ["urn:ietf:wg:oauth:2.0:oob"],
  },
});

const fakeToken = JSON.stringify({ access_token: "test-token" });

beforeEach(async () => {
  vol.reset();
  vi.clearAllMocks();
  // Reset the oauth store singleton between tests
  const { resetOAuthStore } = await import("../../src/core/oauth-store.js");
  resetOAuthStore();
});

describe("getGmailAuth (oauth-store)", () => {
  it("returns null initially before any init", async () => {
    const { getGmailAuth } = await import("../../src/core/oauth-store.js");
    expect(getGmailAuth()).toBeNull();
  });
});

describe("initOAuthFromDisk", () => {
  it("returns false if credential file is missing", async () => {
    vol.fromJSON({ [`${DATA_DIR}/.agentic/`]: null });
    const { initOAuthFromDisk } = await import("../../src/core/oauth-store.js");
    const result = await initOAuthFromDisk(DATA_DIR);
    expect(result).toBe(false);
  });

  it("returns false if token file is missing", async () => {
    vol.fromJSON({ [CRED_PATH]: fakeCredentials });
    const { initOAuthFromDisk } = await import("../../src/core/oauth-store.js");
    const result = await initOAuthFromDisk(DATA_DIR);
    expect(result).toBe(false);
  });

  it("calls getGmailAuth from gmail-auth.js with correct paths", async () => {
    vol.fromJSON({
      [CRED_PATH]: fakeCredentials,
      [TOKEN_PATH]: fakeToken,
    });

    const fakeClient = {
      setCredentials: vi.fn(),
    } as unknown as import("google-auth-library").OAuth2Client;
    mockLoadAuth.mockResolvedValue(fakeClient);

    const { initOAuthFromDisk } = await import("../../src/core/oauth-store.js");
    const result = await initOAuthFromDisk(DATA_DIR);

    expect(result).toBe(true);
    expect(mockLoadAuth).toHaveBeenCalledWith(CRED_PATH, TOKEN_PATH);
  });

  it("stores the auth client so getGmailAuth returns it", async () => {
    vol.fromJSON({
      [CRED_PATH]: fakeCredentials,
      [TOKEN_PATH]: fakeToken,
    });

    const fakeClient = {
      setCredentials: vi.fn(),
    } as unknown as import("google-auth-library").OAuth2Client;
    mockLoadAuth.mockResolvedValue(fakeClient);

    const { initOAuthFromDisk, getGmailAuth } = await import("../../src/core/oauth-store.js");
    await initOAuthFromDisk(DATA_DIR);

    expect(getGmailAuth()).toBe(fakeClient);
  });

  it("returns false and does not throw if getGmailAuth throws", async () => {
    vol.fromJSON({
      [CRED_PATH]: fakeCredentials,
      [TOKEN_PATH]: fakeToken,
    });

    mockLoadAuth.mockRejectedValue(new Error("Auth failed"));

    const { initOAuthFromDisk } = await import("../../src/core/oauth-store.js");
    const result = await initOAuthFromDisk(DATA_DIR);
    expect(result).toBe(false);
  });
});

describe("resetOAuthStore", () => {
  it("resets the stored auth client to null", async () => {
    vol.fromJSON({
      [CRED_PATH]: fakeCredentials,
      [TOKEN_PATH]: fakeToken,
    });

    const fakeClient = {
      setCredentials: vi.fn(),
    } as unknown as import("google-auth-library").OAuth2Client;
    mockLoadAuth.mockResolvedValue(fakeClient);

    const { initOAuthFromDisk, getGmailAuth, resetOAuthStore } =
      await import("../../src/core/oauth-store.js");

    await initOAuthFromDisk(DATA_DIR);
    expect(getGmailAuth()).not.toBeNull();

    resetOAuthStore();
    expect(getGmailAuth()).toBeNull();
  });
});
