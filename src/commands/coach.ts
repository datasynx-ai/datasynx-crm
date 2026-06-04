import fs from "fs";
import { Command } from "commander";
import { info, success } from "../ui/colors.js";

export const coachCommand = new Command("coach")
  .description("Conversation-intelligence: analyze a call transcript")
  .argument("<file>", 'Path to a speaker-labelled transcript ("Rep: ..." / "Customer: ...")')
  .option(
    "--rep <labels>",
    "Comma-separated speaker labels treated as the rep",
    "rep,sales,ae,me,agent"
  )
  .action(async (file: string, opts: { rep: string }) => {
    if (!fs.existsSync(file)) {
      console.error(`Transcript not found: ${file}`);
      process.exit(1);
    }
    const transcript = fs.readFileSync(file, "utf-8") as string;
    const { analyzeConversation } = await import("../core/conversation-intel.js");
    const labels = opts.rep
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const a = analyzeConversation(transcript, labels);

    console.log(success(`Conversation analysis (${a.turns} turns)`));
    console.log(`  Talk ratio (rep):   ${Math.round(a.talkRatio * 100)}%`);
    console.log(`  Questions asked:    ${a.questionsAsked}`);
    console.log(`  Longest monologue:  ${a.longestMonologue} words`);
    if (a.objections.length > 0) {
      console.log(info("  Objections:"));
      for (const o of a.objections) console.log(`    • ${o}`);
    }
    console.log(info("  Coaching:"));
    for (const c of a.coaching) console.log(`    → ${c}`);
  });
