import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env["WORKOS_API_KEY"];
});

afterEach(() => {
  delete process.env["WORKOS_API_KEY"];
});

describe("isSsoConfigured", () => {
  it("returns false when WORKOS_API_KEY is not set", async () => {
    const { isSsoConfigured } = await import("../../src/core/sso.js");
    expect(isSsoConfigured()).toBe(false);
  });

  it("returns true when WORKOS_API_KEY is set", async () => {
    process.env["WORKOS_API_KEY"] = "sk_test_abc123";
    const { isSsoConfigured } = await import("../../src/core/sso.js");
    expect(isSsoConfigured()).toBe(true);
  });
});

describe("getSsoAuthorizationUrl", () => {
  it("throws when WORKOS_API_KEY is not configured", async () => {
    const { getSsoAuthorizationUrl } = await import("../../src/core/sso.js");
    await expect(
      getSsoAuthorizationUrl("org_123", "https://app.example.com/callback")
    ).rejects.toThrow("WORKOS_API_KEY not configured");
  });

  it("constructs correct URL with org + redirect", async () => {
    const { getSsoAuthorizationUrl } = await import("../../src/core/sso.js");
    const url = await getSsoAuthorizationUrl(
      "org_abc",
      "https://app.example.com/callback",
      "sk_live_key"
    );

    expect(url).toContain("https://api.workos.com/sso/authorize");
    expect(url).toContain("organization_id=org_abc");
    expect(url).toContain("redirect_uri=");
    expect(url).toContain("client_id=sk_live_key");
    expect(url).toContain("response_type=code");
  });
});

describe("authenticateWithCode", () => {
  it("returns SsoSession on success", async () => {
    const mockProfile = {
      id: "profile_abc",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Smith",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "at_live_abc123",
          profile: mockProfile,
        }),
      })
    );

    const { authenticateWithCode } = await import("../../src/core/sso.js");
    const session = await authenticateWithCode("auth_code_xyz", "sk_live_key");

    expect(session.accessToken).toBe("at_live_abc123");
    expect(session.profile.id).toBe("profile_abc");
    expect(session.profile.email).toBe("alice@example.com");
    expect(session.profile.firstName).toBe("Alice");
  });

  it("throws on non-200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized: invalid code",
      })
    );

    const { authenticateWithCode } = await import("../../src/core/sso.js");
    await expect(
      authenticateWithCode("bad_code", "sk_live_key")
    ).rejects.toThrow(/401/);
  });
});
