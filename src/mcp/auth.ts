import { createHash, randomBytes, timingSafeEqual } from "crypto";
import path from "path";
import { readJsonArray, writeJsonArray } from "../fs/json-store.js";

export type McpRole = "admin" | "manager" | "rep";

export interface McpTokenRecord {
  hash: string;
  actor: string;
  role: McpRole;
  label?: string;
  createdAt?: string;
}

export interface AuthResult {
  ok: boolean;
  actor?: string;
  role?: McpRole;
}

function tokensPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "mcp-tokens.json");
}

/** SHA-256 hex of a token. Only hashes are ever persisted. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function loadMcpTokens(dataDir: string): McpTokenRecord[] {
  return readJsonArray<McpTokenRecord>(tokensPath(dataDir), "tokens");
}

/**
 * Whether the HTTP MCP endpoint must require a bearer token.
 * - `DXCRM_MCP_AUTH=required` forces auth on (even with no tokens yet).
 * - `DXCRM_MCP_AUTH=off` forces it off.
 * - Otherwise: on as soon as at least one token is configured (opt-in by
 *   provisioning a token; stays open for local/firewalled dev by default).
 */
export function isAuthRequired(dataDir: string): boolean {
  const mode = process.env["DXCRM_MCP_AUTH"];
  if (mode === "required") return true;
  if (mode === "off") return false;
  return loadMcpTokens(dataDir).length > 0;
}

/** Validate an `Authorization: Bearer <token>` header against stored hashes. */
export function verifyBearer(authHeader: string | undefined, dataDir: string): AuthResult {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return { ok: false };
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return { ok: false };

  const candidate = hashToken(token);
  const candidateBuf = Buffer.from(candidate, "hex");
  for (const rec of loadMcpTokens(dataDir)) {
    if (rec.hash.length !== candidate.length) continue;
    let recBuf: Buffer;
    try {
      recBuf = Buffer.from(rec.hash, "hex");
    } catch {
      continue;
    }
    if (recBuf.length === candidateBuf.length && timingSafeEqual(recBuf, candidateBuf)) {
      return { ok: true, actor: rec.actor, role: rec.role };
    }
  }
  return { ok: false };
}

/**
 * Mint a new token: generates a random secret, persists only its hash mapped
 * to an actor/role, and returns the plaintext ONCE (never stored).
 */
export function createMcpToken(
  dataDir: string,
  actor: string,
  role: McpRole,
  label?: string
): string {
  const token = randomBytes(24).toString("base64url");
  const records = loadMcpTokens(dataDir);
  records.push({
    hash: hashToken(token),
    actor,
    role,
    ...(label ? { label } : {}),
    createdAt: new Date().toISOString(),
  });
  writeJsonArray(tokensPath(dataDir), "tokens", records);
  return token;
}

/** RFC 9728 OAuth 2.0 Protected Resource Metadata document. */
export function protectedResourceMetadata(resourceUrl: string): Record<string, unknown> {
  return {
    resource: resourceUrl,
    // Self-hosted default: tokens are provisioned out-of-band (createMcpToken).
    // Populate with an external Authorization Server to enable full OAuth flows.
    authorization_servers: [] as string[],
    bearer_methods_supported: ["header"],
    scopes_supported: ["crm:read", "crm:write"],
  };
}

/** Value for the `WWW-Authenticate` header on a 401 (RFC 9728 §5.1). */
export function wwwAuthenticateHeader(metadataUrl: string): string {
  return `Bearer resource_metadata="${metadataUrl}"`;
}
