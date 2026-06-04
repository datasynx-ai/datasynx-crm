import fs from "fs";
import path from "path";
import { encryptFieldStr, decryptFieldStr } from "./encryption.js";
import { writeFileAtomic } from "../fs/atomic-write.js";

/**
 * Local credential vault (domino D12 / F6): a dependency-free, AES-256-GCM
 * encrypted store for secrets the agent must hold (portal passwords, API keys)
 * but the customer markdown must never contain in plaintext. The whole vault is
 * a single encrypted blob at `.agentic/vault.enc`; the master key lives only in
 * the operator's environment (DXCRM_VAULT_KEY) — never on disk, never committed.
 * A GUI is a documented follow-up; this is the headless, scriptable core.
 */
type VaultData = Record<string, string>;

function vaultPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "vault.enc");
}

/** Read + decrypt the vault. Empty vault when the file does not exist yet. */
export function loadVault(dataDir: string, key: string): VaultData {
  const p = vaultPath(dataDir);
  if (!fs.existsSync(p)) return {};
  const encrypted = fs.readFileSync(p, "utf-8") as string;
  let decrypted: string;
  try {
    decrypted = decryptFieldStr(encrypted, key);
  } catch {
    // AES-GCM auth-tag failure → wrong master key (or a corrupted/tampered file).
    throw new Error("Unable to decrypt vault: wrong master key or corrupted vault file.");
  }
  const data = JSON.parse(decrypted) as VaultData;
  return data && typeof data === "object" ? data : {};
}

/** Encrypt + write the vault atomically (overwrites the single blob). */
export function saveVault(dataDir: string, key: string, data: VaultData): void {
  writeFileAtomic(vaultPath(dataDir), encryptFieldStr(JSON.stringify(data), key));
}

/** Store (or overwrite) a secret under `name`. */
export function setSecret(dataDir: string, key: string, name: string, value: string): void {
  const data = loadVault(dataDir, key);
  data[name] = value;
  saveVault(dataDir, key, data);
}

/** Retrieve a secret; returns undefined when absent. Throws on wrong master key. */
export function getSecret(dataDir: string, key: string, name: string): string | undefined {
  return loadVault(dataDir, key)[name];
}

/** List the names of all stored secrets (values stay encrypted). */
export function listSecretKeys(dataDir: string, key: string): string[] {
  return Object.keys(loadVault(dataDir, key));
}

/** Remove a secret; returns true when something was deleted. */
export function removeSecret(dataDir: string, key: string, name: string): boolean {
  const data = loadVault(dataDir, key);
  if (!(name in data)) return false;
  delete data[name];
  saveVault(dataDir, key, data);
  return true;
}
