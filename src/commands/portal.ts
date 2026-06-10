import { Command } from "commander";
import { info, bold } from "../ui/colors.js";
import { buildPortalLink } from "../core/portal.js";

export const portalCommand = new Command("portal").description(
  "Customer self-service portal (tickets & public KB)"
);

portalCommand
  .command("link <slug> <contactEmail>")
  .description("Mint a magic link for a contact")
  .option("--days <n>", "Link validity in days", "30")
  .action((slug: string, contactEmail: string, opts: { days: string }) => {
    const days = Math.max(1, parseInt(opts.days, 10) || 30);
    console.log(bold(buildPortalLink(slug, contactEmail, days)));
    console.log(info(`valid ${days} day(s) · requires the HTTP server (dxcrm server start)`));
  });
