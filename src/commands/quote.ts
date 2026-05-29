import { Command } from "commander";
import { success, error, info, bold } from "../ui/colors.js";
import { generateQuote, listQuotes, readQuote } from "../core/quote-generator.js";

export const quoteCommand = new Command("quote").description("Manage customer quotes");

quoteCommand
  .command("generate <slug>")
  .description("Generate a quote for a customer")
  .requiredOption("--deal <name>", "Deal name")
  .option("--items <items>", 'Line items: "Description Qty Price,..." (e.g. "Consulting 1 5000,Support 12 500")')
  .option("--vat <percent>", "VAT percent", "19")
  .option("--valid <days>", "Valid for N days", "30")
  .action(async (slug: string, opts: { deal: string; items?: string; vat: string; valid: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

    const lineItems = (opts.items ?? "Service 1 1000")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const parts = item.split(/\s+/);
        const unitPrice = parseFloat(parts[parts.length - 1] ?? "0");
        const quantity = parseFloat(parts[parts.length - 2] ?? "1");
        const description = parts.slice(0, -2).join(" ") || item;
        return { description, quantity, unitPrice };
      });

    try {
      const quote = await generateQuote(dataDir, {
        slug,
        dealName: opts.deal,
        lineItems,
        vatPercent: parseFloat(opts.vat),
        validUntilDays: parseInt(opts.valid, 10),
      });
      console.log(success(`✓ Quote ${bold(quote.quoteNumber)} generated`));
      console.log(info(`  Total:     ${quote.total.toFixed(2)} ${quote.currency}`));
      console.log(info(`  Valid until: ${quote.validUntil}`));
      console.log(info(`  HTML: ${quote.htmlPath}`));
    } catch (err) {
      console.error(error(`Failed to generate quote: ${(err as Error).message}`));
      process.exit(1);
    }
  });

quoteCommand
  .command("list")
  .description("List quotes")
  .option("--slug <slug>", "Filter by customer slug")
  .action((opts: { slug?: string }) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const quotes = listQuotes(dataDir, opts.slug);

    if (quotes.length === 0) {
      console.log(info("No quotes found."));
      return;
    }

    for (const q of quotes) {
      console.log(`  ${bold(q.quoteNumber)}  ${q.slug}  ${q.dealName}  ${q.total.toFixed(2)} ${q.currency}  [${q.status}]  ${q.validUntil}`);
    }
  });

quoteCommand
  .command("get <quoteNumber>")
  .description("Show quote details")
  .action((quoteNumber: string) => {
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
    const quote = readQuote(dataDir, quoteNumber);

    if (!quote) {
      console.error(error(`Quote '${quoteNumber}' not found`));
      process.exit(1);
    }

    console.log(bold(`Quote: ${quote.quoteNumber}`));
    console.log(`Customer: ${quote.slug}  Deal: ${quote.dealName}`);
    console.log(`Status: ${quote.status}  Valid until: ${quote.validUntil}`);
    console.log(`Subtotal: ${quote.subtotal.toFixed(2)}  VAT: ${quote.vat.toFixed(2)}  Total: ${quote.total.toFixed(2)} ${quote.currency}`);
    for (const item of quote.lineItems) {
      console.log(`  - ${item.description}: ${item.quantity} × ${item.unitPrice} = ${item.total}`);
    }
  });
