import fs from "fs";
import path from "path";
import type { Auth } from "googleapis";

let _auth: Auth.OAuth2Client | null = null;

export async function initOAuthFromDisk(dataDir: string): Promise<boolean> {
  const credPath = path.join(dataDir, ".agentic", "gmail-credentials.json");
  const tokenPath = path.join(dataDir, ".agentic", "gmail-token.json");

  if (!fs.existsSync(credPath) || !fs.existsSync(tokenPath)) {
    return false;
  }

  try {
    const { getGmailAuth: loadAuth } = await import("../sync/gmail-auth.js");
    _auth = await loadAuth(credPath, tokenPath);
    return true;
  } catch {
    return false;
  }
}

export function getGmailAuth(): Auth.OAuth2Client | null {
  return _auth;
}

export function resetOAuthStore(): void {
  _auth = null;
}
