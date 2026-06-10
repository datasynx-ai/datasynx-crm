import { Command } from "commander";
import { info, bold } from "../ui/colors.js";
import {
  createBookingPage,
  listBookingPages,
  buildBookingLink,
  type CreateBookingPageInput,
} from "../core/booking.js";

const dataDir = (): string => process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export const bookingCommand = new Command("booking").description(
  "Native meeting scheduler (availability + round-robin)"
);

bookingCommand
  .command("create <id>")
  .description("Create a public booking page")
  .requiredOption("--title <title>", "Heading shown on the page")
  .requiredOption("--reps <names>", "Comma-separated rep actor names (round-robin)")
  .option("--duration <min>", "Slot length in minutes", "30")
  .option("--buffer <min>", "Gap before/after a meeting", "0")
  .option("--days <n>", "Days ahead to offer", "14")
  .option("--start-hour <h>", "Working-hours start (UTC)", "9")
  .option("--end-hour <h>", "Working-hours end (UTC)", "17")
  .option("--slug <slug>", "Customer slug to log against")
  .option("--location <text>", "Location / video link label")
  .action(
    (
      id: string,
      opts: {
        title: string;
        reps: string;
        duration: string;
        buffer: string;
        days: string;
        startHour: string;
        endHour: string;
        slug?: string;
        location?: string;
      }
    ) => {
      const input: CreateBookingPageInput = {
        id,
        title: opts.title,
        reps: opts.reps
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean),
        durationMin: parseInt(opts.duration, 10) || 30,
        bufferMin: parseInt(opts.buffer, 10) || 0,
        days: parseInt(opts.days, 10) || 14,
        startHour: parseInt(opts.startHour, 10),
        endHour: parseInt(opts.endHour, 10),
        ...(opts.slug ? { slug: opts.slug } : {}),
        ...(opts.location ? { location: opts.location } : {}),
      };
      const page = createBookingPage(dataDir(), input);
      console.log(bold(buildBookingLink(page.id)));
      console.log(
        info(
          `${page.reps.length} rep(s) · ${page.durationMin} min slots · requires the HTTP server (dxcrm server start)`
        )
      );
    }
  );

bookingCommand
  .command("list")
  .description("List booking pages")
  .action(() => {
    const pages = listBookingPages(dataDir());
    if (pages.length === 0) {
      console.log(info("No booking pages yet. Create one with `dxcrm booking create`."));
      return;
    }
    for (const p of pages) {
      console.log(`${bold(p.id)} — ${p.title}  (${p.reps.join(", ")})  ${buildBookingLink(p.id)}`);
    }
  });
