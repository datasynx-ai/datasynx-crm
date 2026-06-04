import { Command } from "commander";
import { info, success, error } from "../ui/colors.js";

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const webhookCommand = new Command("webhook").description(
  "Manage outbound webhooks (event-driven integrations)"
);

webhookCommand
  .command("add <url>")
  .description("Subscribe a URL to events (--events record.created,deal.updated or '*')")
  .option("--events <csv>", "Comma-separated event patterns", "*")
  .option("--secret <secret>", "HMAC secret for X-DXCRM-Signature")
  .action(async (url: string, opts: { events: string; secret?: string }) => {
    const { addWebhook } = await import("../core/webhooks.js");
    const events = opts.events
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const sub = addWebhook(dataDir(), url, events, opts.secret);
    console.log(success(`Webhook ${sub.id} → ${url} [${events.join(", ")}]`));
  });

webhookCommand
  .command("list")
  .description("List webhook subscriptions")
  .action(async () => {
    const { loadWebhooks } = await import("../core/webhooks.js");
    const subs = loadWebhooks(dataDir());
    if (subs.length === 0) {
      console.log(info("No webhooks configured."));
      return;
    }
    for (const s of subs) console.log(`${s.id}  ${s.url}  [${s.events.join(", ")}]`);
  });

webhookCommand
  .command("remove <id>")
  .description("Remove a webhook subscription")
  .action(async (id: string) => {
    const { removeWebhook } = await import("../core/webhooks.js");
    if (removeWebhook(dataDir(), id)) console.log(success(`Removed ${id}`));
    else {
      console.error(error(`Not found: ${id}`));
      process.exitCode = 1;
    }
  });

webhookCommand
  .command("retry")
  .description("Re-attempt failed webhook deliveries (replay store)")
  .action(async () => {
    const { retryFailures } = await import("../core/webhooks.js");
    const r = await retryFailures(dataDir());
    console.log(info(`Retried ${r.retried}, still failing ${r.stillFailing}.`));
  });
