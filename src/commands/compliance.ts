import { Command } from "commander";
import { info, success, warning } from "../ui/colors.js";

export const complianceCommand = new Command("compliance").description(
  "Privacy/compliance posture (AI-Act Art. 50, local-LLM, PII, guardrails)"
);

complianceCommand
  .command("status", { isDefault: true })
  .description("Show the active compliance configuration")
  .action(async () => {
    const { complianceConfig, aiDisclosure } = await import("../core/compliance.js");
    const cfg = complianceConfig();
    const onOff = (b: boolean): string => (b ? success("on") : warning("off"));

    console.log(info("Compliance posture"));
    console.log(`  LLM provider:        ${cfg.provider}`);
    if (cfg.local) {
      console.log(`  Local endpoint:      ${cfg.local.baseUrl}`);
      console.log(`  Local model:         ${cfg.local.model}`);
      console.log(success("  → Customer data stays on-machine (data-residency moat)."));
    }
    console.log(`  AI-Act Art.50 label: ${onOff(cfg.aiDisclosure)}`);
    console.log(`  PII masking:         ${onOff(cfg.piiMasking)}`);
    console.log(`  Prompt guardrails:   ${onOff(cfg.guardrails)}`);
    if (cfg.aiDisclosure) console.log(info(`  Disclosure: "${aiDisclosure()}"`));
  });
