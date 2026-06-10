import { getSecret } from "./vault.js";

/**
 * Unified integration-secret lookup (#72): environment first, then the AES
 * vault (`.agentic/vault.enc`, GUI #21) when a master key is present.
 *
 * - Env always wins, and an empty env value counts as unset — operators can
 *   keep overriding vault entries per process without editing the vault.
 * - Without `DXCRM_VAULT_KEY`, without a vault file, or on a wrong master key
 *   the lookup degrades to plain env behavior (returns undefined, never
 *   throws): live paths stay credential-gated no-ops exactly as before.
 *
 * Used by the webhook/send paths for WHATSAPP_*, STRIPE_* and
 * MS_GRAPH_CLIENT_STATE — secrets entered once via the vault GUI activate the
 * integrations without duplicating them as env vars.
 */
export function resolveSecret(
  dataDir: string,
  name: string,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const fromEnv = env[name];
  if (fromEnv) return fromEnv;
  const masterKey = env["DXCRM_VAULT_KEY"];
  if (!masterKey) return undefined;
  try {
    return getSecret(dataDir, masterKey, name) || undefined;
  } catch {
    return undefined; // wrong key / corrupted vault → behave like env-only
  }
}
