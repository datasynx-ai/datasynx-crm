import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { createVaultSession, DEFAULT_VAULT_SESSION_TTL_MS } from "../../core/vault-session.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

/** Base URL the operator's browser should hit. Defaults to a local link. */
function baseUrl(): string {
  const explicit = process.env["DXCRM_PUBLIC_URL"];
  if (explicit) return explicit.replace(/\/+$/, "");
  const port = process.env["DXCRM_MCP_PORT"] ?? "3847";
  return `http://localhost:${port}`;
}

/** Best-effort check whether the HTTP MCP server (which serves /vault) is up. */
function isServerRunning(dataDir: string): boolean {
  const pidFile = path.join(dataDir, ".agentic", "server.pid");
  if (!fs.existsSync(pidFile)) return false;
  const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
  if (Number.isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function handleGetVaultLink(
  input: { ttlMinutes?: number },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const ttlMs =
    input.ttlMinutes && input.ttlMinutes > 0
      ? Math.min(input.ttlMinutes, 240) * 60 * 1000
      : DEFAULT_VAULT_SESSION_TTL_MS;

  const { token, expiresAt } = createVaultSession(dataDir, ttlMs);
  const url = `${baseUrl()}/vault?t=${token}`;
  const serverRunning = isServerRunning(dataDir);
  const vaultKeyConfigured = Boolean(process.env["DXCRM_VAULT_KEY"]);

  const payload: Record<string, unknown> = {
    url,
    expiresAt,
    expiresInMinutes: Math.round(ttlMs / 60000),
    serverRunning,
    vaultKeyConfigured,
    instructions:
      "Open this link in your browser to add, view, or remove credentials. Values are entered in the browser, encrypted with AES-256-GCM, and stored locally — they never pass through this chat or the AI. Hand the link to the human operator; do not ask them to paste secrets here.",
  };

  if (!serverRunning) {
    payload["setup"] =
      "The HTTP server that serves this link is not running. Start it with: dxcrm server start";
  }
  if (!vaultKeyConfigured) {
    payload["setup"] =
      `${payload["setup"] ? payload["setup"] + " " : ""}The vault master key (DXCRM_VAULT_KEY) must be set in the server's environment before secrets can be saved.`;
  }

  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

export function registerGetVaultLink(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "get_vault_link",
    {
      description: `Get a one-time link to the local, browser-based credential vault GUI where the human operator can securely enter, view, and remove secrets (API keys, portal passwords, access tokens).

Use this whenever a secret/credential is needed: instead of asking the user to paste a key into the chat (where it would flow through the AI), hand them this link. Values are entered directly in the browser, encrypted with AES-256-GCM into the local vault, and never pass through the LLM. Agents read stored secrets out-of-band via the vault — never via this tool.

The link carries a short-lived session token (default 15 min) and requires the HTTP MCP server (\`dxcrm server start\`) with DXCRM_VAULT_KEY configured.
Returns: { url, expiresAt, expiresInMinutes, serverRunning, vaultKeyConfigured, instructions }`,
      inputSchema: z.object({
        ttlMinutes: z
          .number()
          .optional()
          .describe("How long the link stays valid, in minutes (default 15, max 240)."),
      }),
    },
    ({ ttlMinutes }) =>
      handleGetVaultLink({ ...(ttlMinutes !== undefined ? { ttlMinutes } : {}) }, dataDir)
  );
}
