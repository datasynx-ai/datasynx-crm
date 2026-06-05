import { createHash, randomBytes, timingSafeEqual } from "crypto";
import path from "path";
import { readJsonArray, writeJsonArray } from "../fs/json-store.js";

/**
 * Short-lived access tokens for the local vault GUI (issue #21).
 *
 * The MCP tool that hands an operator a vault link runs in the stdio MCP
 * process, while the GUI is served by the HTTP server process — two different
 * processes that share no memory. So sessions are persisted (only as SHA-256
 * hashes, exactly like the bearer tokens in mcp/auth.ts) to a small JSON store,
 * letting any process mint a token the HTTP server can later validate.
 *
 * Tokens are deliberately ephemeral (default 15 min): a leaked link to the
 * credential GUI stops working almost immediately. Expired sessions are pruned
 * lazily on every read/write.
 */
export interface VaultSessionRecord {
  hash: string;
  createdAt: string;
  expiresAt: string;
}

export const DEFAULT_VAULT_SESSION_TTL_MS = 15 * 60 * 1000;

function sessionsPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "vault-sessions.json");
}

/** SHA-256 hex of a token. Only hashes are ever persisted. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function loadSessions(dataDir: string): VaultSessionRecord[] {
  return readJsonArray<VaultSessionRecord>(sessionsPath(dataDir), "sessions");
}

function notExpired(records: VaultSessionRecord[], now: number): VaultSessionRecord[] {
  return records.filter((r) => {
    const exp = Date.parse(r.expiresAt);
    return !Number.isNaN(exp) && exp > now;
  });
}

/**
 * Mint a new vault-GUI session. Persists only the token hash, prunes any
 * already-expired sessions, and returns the plaintext token ONCE.
 */
export function createVaultSession(
  dataDir: string,
  ttlMs: number = DEFAULT_VAULT_SESSION_TTL_MS,
  now: number = Date.now()
): { token: string; expiresAt: string } {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now + ttlMs).toISOString();
  const records = notExpired(loadSessions(dataDir), now);
  records.push({ hash: hashToken(token), createdAt: new Date(now).toISOString(), expiresAt });
  writeJsonArray(sessionsPath(dataDir), "sessions", records);
  return { token, expiresAt };
}

/** Whether `token` matches a stored, unexpired session. Constant-time compare. */
export function verifyVaultSession(
  dataDir: string,
  token: string | undefined,
  now: number = Date.now()
): boolean {
  if (!token) return false;
  const candidateBuf = Buffer.from(hashToken(token), "hex");
  for (const rec of notExpired(loadSessions(dataDir), now)) {
    let recBuf: Buffer;
    try {
      recBuf = Buffer.from(rec.hash, "hex");
    } catch {
      continue;
    }
    if (recBuf.length === candidateBuf.length && timingSafeEqual(recBuf, candidateBuf)) {
      return true;
    }
  }
  return false;
}

/** Revoke a single session. Returns true when a matching session was removed. */
export function revokeVaultSession(
  dataDir: string,
  token: string,
  now: number = Date.now()
): boolean {
  const target = hashToken(token);
  const records = notExpired(loadSessions(dataDir), now);
  const remaining = records.filter((r) => r.hash !== target);
  if (remaining.length === records.length) return false;
  writeJsonArray(sessionsPath(dataDir), "sessions", remaining);
  return true;
}
