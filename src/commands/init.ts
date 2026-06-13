import { Command } from "commander";
import fs from "fs";
import path from "path";
import os from "os";
import { installAllDetected } from "../setup/framework-registry.js";
import { resolveMcpServerPath } from "../setup/resolve-mcp-path.js";
import { seedStarterContent } from "../core/starter-seed.js";
import { success, error, info, bold } from "../ui/colors.js";

export const initCommand = new Command("init")
  .description("Initialize CRM and configure AI frameworks")
  .option(
    "--team <url>",
    "Team mode: configure frameworks to connect to shared HTTP server at this URL (e.g. http://vm-ip:3847/mcp)"
  )
  .action(async (opts: { team?: string }) => {
    // Resolve the vault the same way every other command and the MCP server do
    // (logger.ts, llm.ts, all tools). init bakes this path into the framework
    // configs it writes (e.g. DXCRM_DATA_DIR in ~/.claude.json), so it must
    // initialize the *same* directory the server will later read from — not
    // silently diverge to cwd when DXCRM_DATA_DIR is set.
    const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

    // 1. Create .agentic/ directory
    const agenticDir = path.join(dataDir, ".agentic");
    fs.mkdirSync(agenticDir, { recursive: true });

    // 2. Create config.json
    const configPath = path.join(agenticDir, "config.json");
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(
        configPath,
        JSON.stringify(
          {
            version: 1,
            dataDir,
            created: new Date().toISOString(),
          },
          null,
          2
        )
      );
    }

    // 3. Discover transcript paths
    const home = os.homedir();
    const candidates = [
      path.join(home, "Downloads", "Fireflies"),
      path.join(home, "Downloads", "Otter"),
      path.join(home, "Documents", "Zoom"),
      path.join(home, "Downloads", "Zoom"),
    ];
    const transcriptPaths = candidates.filter((p) => fs.existsSync(p));

    // 4. Create sources.json
    const sourcesPath = path.join(agenticDir, "sources.json");
    if (!fs.existsSync(sourcesPath)) {
      const sources: Record<string, unknown> = {
        gmail: { type: "gmail", query: "", enabled: false },
        version: 1,
        created: new Date().toISOString(),
      };
      if (transcriptPaths.length > 0) {
        sources.transcripts = {
          type: "transcript",
          paths: transcriptPaths,
          extensions: [".txt", ".vtt"],
          enabled: true,
        };
      }
      fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2));
    }

    // 5. Create customers/ directory
    fs.mkdirSync(path.join(dataDir, "customers"), { recursive: true });

    // 5b. Write schema.json — human/machine-readable validation rules
    const schemaPath = path.join(agenticDir, "schema.json");
    if (!fs.existsSync(schemaPath)) {
      fs.writeFileSync(
        schemaPath,
        JSON.stringify(
          {
            version: 1,
            description: "DatasynxOpenCRM validation schema for main_facts.md frontmatter",
            main_facts: {
              required: ["name", "relationship_stage", "created", "tags", "currency"],
              properties: {
                name: { type: "string" },
                relationship_stage: {
                  type: "string",
                  enum: [
                    "lead",
                    "qualified",
                    "discovery",
                    "proposal",
                    "negotiation",
                    "active",
                    "churned",
                    "closed",
                  ],
                },
                domain: { type: "string" },
                email: { type: "string", format: "email" },
                created: { type: "string", format: "date" },
                updated: { type: "string", format: "date" },
                tags: { type: "array", items: { type: "string" } },
                currency: { type: "string", enum: ["EUR", "USD", "GBP", "CHF"] },
                deal_value: { type: "number", minimum: 0 },
                last_touchpoint: { type: "string", format: "date" },
                primary_contact: { type: "string" },
              },
            },
          },
          null,
          2
        )
      );
    }

    // 5c. Seed starter email templates & sequences so draft_email / enroll_in_sequence
    // and template-driven outreach work on a fresh vault. Idempotent and
    // non-resurrecting: deleted starters are never recreated on a later init.
    const seeded = seedStarterContent(dataDir);
    if (seeded.templatesSeeded.length > 0 || seeded.sequencesSeeded.length > 0) {
      console.log(
        info(
          `  Seeded ${seeded.templatesSeeded.length} starter templates and ` +
            `${seeded.sequencesSeeded.length} sequence — edit or delete freely (dxcrm template list).`
        )
      );
    }

    // 6. Install framework adapters
    console.log(info("Detecting AI frameworks..."));

    // Resolve dist/mcp.js across the bundled (prod) and tsx (dev) layouts.
    const mcpServerPath = resolveMcpServerPath(import.meta.url);

    if (opts.team) {
      console.log(info(`Team mode: connecting frameworks to ${bold(opts.team)}`));
    }

    const results = await installAllDetected({
      mcpServerPath,
      dataDir,
      httpPort: 3847,
      serverName: "datasynx-opencrm",
      ...(opts.team ? { httpUrl: opts.team } : {}),
    });

    if (results.length === 0) {
      console.log(
        info("  No AI frameworks detected. Configure manually: dxcrm guide --framework <name>")
      );
    } else {
      for (const r of results) {
        if (r.success) {
          console.log(success(`  ✓ ${r.framework} — ${r.transport} transport`));
          if (r.notes) console.log(`    ${r.notes}`);
        } else {
          console.log(error(`  ✗ ${r.framework} — ${r.notes ?? "failed"}`));
        }
      }
    }

    console.log(success(`\n✓ DatasynxOpenCRM initialized in ${bold(dataDir)}`));
    if (opts.team) {
      console.log(info(`  Team server: ${opts.team}`));
      console.log(info(`  Set identity: export DXCRM_ACTOR=<your-name>`));
    } else {
      console.log(info(`  Next: dxcrm create "Your Customer Name"`));
    }
  });
