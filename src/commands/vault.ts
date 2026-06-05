import { Command } from "commander";
import { info, success, error } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

/** Master key from the environment only — never a flag (avoids shell history). */
function masterKey(): string {
  const key = process.env["DXCRM_VAULT_KEY"];
  if (!key) {
    console.error(error("DXCRM_VAULT_KEY is not set. Export your vault master key first."));
    process.exit(1);
  }
  return key;
}

/** Run a vault action, turning decryption/IO failures into a clean exit. */
async function guard(fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(error((e as Error).message));
    process.exit(1);
  }
}

export const vaultCommand = new Command("vault").description(
  "Local encrypted credential vault (AES-256-GCM)"
);

vaultCommand
  .command("set <name> <value>")
  .description("Store (or overwrite) a secret")
  .action((name: string, value: string) =>
    guard(async () => {
      const { setSecret } = await import("../core/vault.js");
      setSecret(dataDir(), masterKey(), name, value);
      console.log(success(`Secret '${name}' stored.`));
    })
  );

vaultCommand
  .command("get <name>")
  .description("Retrieve a secret")
  .action((name: string) =>
    guard(async () => {
      const { getSecret } = await import("../core/vault.js");
      const value = getSecret(dataDir(), masterKey(), name);
      if (value === undefined) {
        console.log(info(`No secret named '${name}'.`));
        return;
      }
      console.log(value);
    })
  );

vaultCommand
  .command("list")
  .description("List secret names (values stay encrypted)")
  .action(() =>
    guard(async () => {
      const { listSecretKeys } = await import("../core/vault.js");
      const names = listSecretKeys(dataDir(), masterKey());
      if (names.length === 0) {
        console.log(info("Vault is empty."));
        return;
      }
      for (const n of names.sort()) console.log(n);
    })
  );

vaultCommand
  .command("link")
  .description("Mint a browser link to the vault GUI (enter/manage secrets without the CLI)")
  .option("--ttl <minutes>", "How long the link stays valid, in minutes (default 15)", "15")
  .action((opts: { ttl: string }) =>
    guard(async () => {
      const { createVaultSession } = await import("../core/vault-session.js");
      const ttlMin = Math.min(Math.max(parseInt(opts.ttl, 10) || 15, 1), 240);
      const { token, expiresAt } = createVaultSession(dataDir(), ttlMin * 60 * 1000);
      const base = (
        process.env["DXCRM_PUBLIC_URL"] ??
        `http://localhost:${process.env["DXCRM_MCP_PORT"] ?? "3847"}`
      ).replace(/\/+$/, "");
      console.log(success(`${base}/vault?t=${token}`));
      console.log(info(`Valid until ${expiresAt} (${ttlMin} min).`));
      if (!process.env["DXCRM_VAULT_KEY"]) {
        console.log(
          info("Note: set DXCRM_VAULT_KEY in the server's environment before saving secrets.")
        );
      }
      console.log(info("Requires the HTTP server: dxcrm server start"));
    })
  );

vaultCommand
  .command("rm <name>")
  .description("Remove a secret")
  .action((name: string) =>
    guard(async () => {
      const { removeSecret } = await import("../core/vault.js");
      const removed = removeSecret(dataDir(), masterKey(), name);
      console.log(
        removed ? success(`Secret '${name}' removed.`) : info(`No secret named '${name}'.`)
      );
    })
  );
