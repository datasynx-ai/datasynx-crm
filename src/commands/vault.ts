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
