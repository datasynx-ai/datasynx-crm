import { Command } from "commander";
import { info, bold, error } from "../ui/colors.js";
import { readUnmatched, clearUnmatched } from "../fs/unmatched-transcripts.js";

const dataDir = (): string => process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export interface TranscriptsSubscribeOptions {
  url?: string;
  user?: string;
  topic?: string;
  target?: string;
}

/** `dxcrm transcripts subscribe teams|meet` — create the live subscription (#63). */
export async function runTranscriptsSubscribe(
  provider: string,
  opts: TranscriptsSubscribeOptions
): Promise<void> {
  if (provider === "teams") {
    const baseUrl = opts.url ?? process.env["DXCRM_PUBLIC_URL"];
    if (!baseUrl) {
      console.error(error("Pass --url <publicBaseUrl> or set DXCRM_PUBLIC_URL."));
      process.exitCode = 1;
      return;
    }
    const { getMicrosoftToken } = await import("../sync/microsoft-auth.js");
    const token = await getMicrosoftToken(dataDir()).catch(() => null);
    if (!token) {
      console.error(
        error(
          "No Microsoft Graph token available. Connect the Microsoft account first (see docs/integrations.md)."
        )
      );
      process.exitCode = 1;
      return;
    }
    const { createTeamsTranscriptSubscription } = await import("../sync/subscription-create.js");
    const sub = await createTeamsTranscriptSubscription({
      dataDir: dataDir(),
      accessToken: token,
      webhookBaseUrl: baseUrl,
      ...(opts.user ? { userId: opts.user } : {}),
    });
    console.log(info(`Teams transcript subscription created: ${sub.id}`));
    console.log(`  resource:  ${sub.providerData.microsoftResource}`);
    console.log(`  notifies:  ${sub.webhookUrl}`);
    console.log(`  expires:   ${sub.expiresAt} (auto-renewed by the daemon)`);
    return;
  }
  if (provider === "meet") {
    if (!opts.topic) {
      console.error(
        error(
          "Pass --topic projects/<p>/topics/<t> (the Pub/Sub topic pushing to /webhooks/google)."
        )
      );
      process.exitCode = 1;
      return;
    }
    const { getGoogleToken } = await import("../sync/google-auth.js");
    const token = await getGoogleToken(dataDir()).catch(() => null);
    if (!token) {
      console.error(
        error(
          "No Google token available. Connect the Google account first (see docs/integrations.md)."
        )
      );
      process.exitCode = 1;
      return;
    }
    const { createMeetTranscriptSubscription } = await import("../sync/subscription-create.js");
    const sub = await createMeetTranscriptSubscription({
      dataDir: dataDir(),
      accessToken: token,
      pubsubTopic: opts.topic,
      ...(opts.target ? { targetResource: opts.target } : {}),
    });
    console.log(info(`Meet transcript subscription created: ${sub.id}`));
    console.log(`  name:      ${sub.providerData.googleSubscriptionName}`);
    console.log(`  target:    ${sub.providerData.googleTargetResource}`);
    console.log(`  expires:   ${sub.expiresAt} (auto-renewed by the daemon)`);
    return;
  }
  console.error(error(`Unknown provider '${provider}' — use teams or meet.`));
  process.exitCode = 1;
}

/** `dxcrm transcripts subscriptions` — list transcript push subscriptions. */
export async function runTranscriptsSubscriptions(): Promise<void> {
  const { readSubscriptions } = await import("../sync/push-manager.js");
  const subs = (await readSubscriptions(dataDir())).filter(
    (s) =>
      s.provider === "google-workspace" ||
      (s.provider === "microsoft-graph" &&
        (s.providerData.microsoftResource ?? "").includes("Transcripts"))
  );
  if (subs.length === 0) {
    console.log(
      info("No transcript subscriptions. Create one with: dxcrm transcripts subscribe teams|meet")
    );
    return;
  }
  console.log(bold(`${subs.length} transcript subscription(s):`));
  for (const s of subs) {
    console.log(
      `  ${s.id}  ${s.provider}  ${s.status}  expires ${s.expiresAt ?? "never"}  events ${s.eventsProcessed}`
    );
  }
}

export const transcriptsCommand = new Command("transcripts").description(
  "Auto-discovered meeting transcripts (Teams/Meet): subscriptions & unmatched queue"
);

transcriptsCommand
  .command("subscribe <provider>")
  .description(
    "Create the live transcript subscription (teams: Graph change notifications, meet: Workspace Events)"
  )
  .option("--url <baseUrl>", "Public base URL of this CRM server (default: DXCRM_PUBLIC_URL)")
  .option("--user <userId>", "teams: subscribe per-user instead of tenant-wide")
  .option("--topic <pubsubTopic>", "meet: Pub/Sub topic that pushes to /webhooks/google")
  .option("--target <resource>", "meet: Workspace Events targetResource override")
  .action(runTranscriptsSubscribe);

transcriptsCommand
  .command("subscriptions")
  .description("List transcript push subscriptions and their status")
  .action(runTranscriptsSubscriptions);

transcriptsCommand
  .command("unmatched")
  .description("List transcripts that could not be routed to a customer")
  .action(() => {
    const queue = readUnmatched(dataDir());
    if (queue.length === 0) {
      console.log(info("No unmatched transcripts. Every call landed on a customer. 🎉"));
      return;
    }
    console.log(bold(`${queue.length} unmatched transcript(s):`));
    for (const t of queue) {
      console.log(`  ${t.filePath}  (${t.reason}, ${t.addedAt})`);
    }
    console.log(
      info("Add the meeting's domain/email to a customer's main_facts, then re-poll, or clear.")
    );
  });

transcriptsCommand
  .command("clear")
  .description("Clear the unmatched-transcript queue")
  .action(() => {
    clearUnmatched(dataDir());
    console.log(info("Unmatched-transcript queue cleared."));
  });
