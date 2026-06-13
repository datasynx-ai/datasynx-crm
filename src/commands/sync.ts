import { Command } from "commander";
import path from "path";
import fs from "fs";
import { success, error, info, bold } from "../ui/colors.js";

export const syncCommand = new Command("sync")
  .argument("<slug>", "Customer slug to sync")
  .description("Sync Gmail and transcripts for a customer")
  .option("--since <date>", "Only sync emails/files after this date (YYYY-MM-DD)")
  .option("--gmail", "Sync Gmail only")
  .option("--transcripts", "Sync transcripts only")
  .option("--provider <provider>", "Sync provider: gmail | microsoft | transcripts")
  .option("--no-attachments", "Skip downloading/converting/indexing email attachments")
  .action(
    async (
      slug: string,
      opts: {
        since?: string;
        gmail?: boolean;
        transcripts?: boolean;
        provider?: string;
        attachments?: boolean;
      }
    ) => {
      const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
      const customerDir = path.join(dataDir, "customers", slug);

      if (!fs.existsSync(customerDir)) {
        console.error(
          error(`✗ Customer '${slug}' not found. Run 'dxcrm list' to see available customers.`)
        );
        process.exit(1);
      }

      const sourcesPath = path.join(customerDir, "sources.json");
      if (!fs.existsSync(sourcesPath)) {
        console.error(error(`✗ No sources.json found for '${slug}'.`));
        process.exit(1);
      }

      const sources = JSON.parse(fs.readFileSync(sourcesPath, "utf-8")) as {
        gmail?: { query?: string; enabled?: boolean };
      };

      const since = opts.since
        ? new Date(opts.since)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const provider = opts.provider;
      const syncGmail =
        !opts.transcripts &&
        provider !== "microsoft" &&
        provider !== "transcripts" &&
        provider !== "google-drive";
      const syncMicrosoft = provider === "microsoft";
      const syncTranscripts =
        !opts.gmail &&
        provider !== "gmail" &&
        provider !== "microsoft" &&
        provider !== "google-drive";
      const syncGoogleDrive = provider === "google-drive";

      let totalSynced = 0;

      // Gmail sync
      if (syncGmail && sources.gmail?.enabled && sources.gmail.query) {
        const tokenPath = path.join(dataDir, ".agentic", "gmail-token.json");
        const credPath = path.join(dataDir, ".agentic", "gmail-credentials.json");

        if (!fs.existsSync(tokenPath) || !fs.existsSync(credPath)) {
          console.log(info("  Gmail: credentials not configured (run dxcrm mailbox login gmail)"));
        } else {
          try {
            console.log(info(`  Syncing Gmail for ${bold(slug)}...`));
            const { getGmailAuth } = await import("../sync/gmail-auth.js");
            const { syncGmail: doGmailSync } = await import("../sync/gmail-sync.js");
            const auth = await getGmailAuth(credPath, tokenPath);
            const result = await doGmailSync({
              slug,
              dataDir,
              auth,
              query: sources.gmail.query,
              since,
              includeAttachments: opts.attachments !== false,
            });
            totalSynced += result.synced;
            console.log(success(`  ✓ Gmail: +${result.synced} synced, ${result.skipped} skipped`));
          } catch (err) {
            console.error(error(`  ✗ Gmail sync failed: ${(err as Error).message}`));
          }
        }
      } else if (syncGmail) {
        console.log(info("  Gmail: not configured (add domain/email to sources.json)"));
      }

      // Microsoft sync (email + calendar)
      if (syncMicrosoft) {
        try {
          console.log(info(`  Syncing Microsoft Outlook for ${bold(slug)}...`));
          const { getMicrosoftToken } = await import("../sync/microsoft-auth.js");
          const token = await getMicrosoftToken(dataDir);
          if (!token) {
            console.log(info("  Microsoft: no token found (.agentic/microsoft-token.json)"));
          } else {
            const { syncMicrosoft: doMsSync } = await import("../sync/microsoft-sync.js");
            const emailResult = await doMsSync({ slug, dataDir, accessToken: token, since });
            totalSynced += emailResult.synced;
            console.log(
              success(
                `  ✓ Microsoft Email: +${emailResult.synced} synced, ${emailResult.skipped} skipped`
              )
            );

            const { syncMicrosoftCalendar } = await import("../sync/microsoft-calendar.js");
            const calResult = await syncMicrosoftCalendar({
              slug,
              dataDir,
              accessToken: token,
              since,
            });
            totalSynced += calResult.synced;
            console.log(
              success(
                `  ✓ Microsoft Calendar: +${calResult.synced} synced, ${calResult.skipped} skipped`
              )
            );
          }
        } catch (err) {
          console.error(error(`  ✗ Microsoft sync failed: ${(err as Error).message}`));
        }
      }

      // Transcript sync
      if (syncTranscripts) {
        const agenticSourcesPath = path.join(dataDir, ".agentic", "sources.json");
        if (fs.existsSync(agenticSourcesPath)) {
          try {
            const agenticSources = JSON.parse(fs.readFileSync(agenticSourcesPath, "utf-8")) as {
              transcripts?: { paths?: string[]; extensions?: string[]; enabled?: boolean };
            };

            if (agenticSources.transcripts?.enabled && agenticSources.transcripts.paths?.length) {
              const { processTranscriptFile } = await import("../sync/transcript-watcher.js");
              const exts = agenticSources.transcripts.extensions ?? [".txt", ".vtt"];
              let transcriptSynced = 0;

              for (const watchPath of agenticSources.transcripts.paths) {
                if (!fs.existsSync(watchPath)) continue;
                const files = fs
                  .readdirSync(watchPath)
                  .filter((f) => exts.some((ext) => f.endsWith(ext)))
                  .map((f) => path.join(watchPath, f));

                for (const file of files) {
                  try {
                    await processTranscriptFile(file, slug, dataDir);
                    transcriptSynced++;
                  } catch {
                    /* already synced or error — skip */
                  }
                }
              }

              if (transcriptSynced > 0) {
                totalSynced += transcriptSynced;
                console.log(success(`  ✓ Transcripts: +${transcriptSynced} processed`));
              } else {
                console.log(info("  Transcripts: no new files"));
              }
            } else {
              console.log(info("  Transcripts: not configured"));
            }
          } catch (err) {
            console.error(error(`  ✗ Transcript sync failed: ${(err as Error).message}`));
          }
        }
      }

      // Google Drive sync
      if (syncGoogleDrive) {
        const tokenPath = path.join(dataDir, ".agentic", "google-token.json");
        if (!fs.existsSync(tokenPath)) {
          console.log(info("  Google Drive: token not configured (.agentic/google-token.json)"));
        } else {
          try {
            const tokenData = JSON.parse(fs.readFileSync(tokenPath, "utf-8")) as {
              accessToken?: string;
              access_token?: string;
            };
            const accessToken = tokenData.accessToken ?? tokenData.access_token;
            if (!accessToken) {
              console.log(info("  Google Drive: accessToken not found in token file"));
            } else {
              console.log(info(`  Syncing Google Drive for ${bold(slug)}...`));
              const { syncGoogleDriveFiles } = await import("../sync/google-drive-sync.js");
              const result = await syncGoogleDriveFiles({
                slug,
                dataDir,
                accessToken,
                customerName: slug,
              });
              totalSynced += result.synced;
              if (result.errors.length > 0) {
                for (const err of result.errors) {
                  console.error(error(`  ✗ Google Drive: ${err}`));
                }
              }
              console.log(
                success(`  ✓ Google Drive: +${result.synced} synced, ${result.skipped} skipped`)
              );
            }
          } catch (err) {
            console.error(error(`  ✗ Google Drive sync failed: ${(err as Error).message}`));
          }
        }
      }

      if (totalSynced > 0) {
        console.log(
          success(
            `\n✓ Sync complete: ${bold(String(totalSynced))} new interactions for ${bold(slug)}`
          )
        );
      } else {
        console.log(info(`\n✓ Sync complete: no new interactions for ${bold(slug)}`));
      }
    }
  );
