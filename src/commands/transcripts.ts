import { Command } from "commander";
import { info, bold } from "../ui/colors.js";
import { readUnmatched, clearUnmatched } from "../fs/unmatched-transcripts.js";

const dataDir = (): string => process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export const transcriptsCommand = new Command("transcripts").description(
  "Auto-discovered meeting transcripts (Teams/Meet) & unmatched queue"
);

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
