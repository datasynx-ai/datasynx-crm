// WorkOS SDK abstraction layer
// NOTE: We do NOT install the actual @workos-inc/node package.
// This module provides the interface and a mock-able wrapper so the feature
// can be enabled when WORKOS_API_KEY is set.

export interface SsoProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  organizationId?: string;
  rawAttributes?: Record<string, unknown>;
}

export interface SsoSession {
  profile: SsoProfile;
  accessToken: string;
}

export async function getSsoAuthorizationUrl(
  organizationId: string,
  redirectUri: string,
  apiKey?: string // defaults to process.env.WORKOS_API_KEY
): Promise<string> {
  const key = apiKey ?? process.env["WORKOS_API_KEY"];
  if (!key) {
    throw new Error("WORKOS_API_KEY not configured");
  }

  const params = new URLSearchParams({
    client_id: key,
    redirect_uri: redirectUri,
    response_type: "code",
    organization_id: organizationId,
  });

  const url = `https://api.workos.com/sso/authorize?${params.toString()}`;
  return url;
}

export async function authenticateWithCode(
  code: string,
  apiKey?: string
): Promise<SsoSession> {
  const key = apiKey ?? process.env["WORKOS_API_KEY"];
  if (!key) {
    throw new Error("WORKOS_API_KEY not configured");
  }

  const response = await fetch("https://api.workos.com/sso/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: key,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "unknown error");
    throw new Error(`WorkOS SSO error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    profile: SsoProfile;
  };

  return {
    profile: data.profile,
    accessToken: data.access_token,
  };
}

export function isSsoConfigured(): boolean {
  return !!process.env["WORKOS_API_KEY"];
}
