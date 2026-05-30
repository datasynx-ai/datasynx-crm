import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readBackupLog, listBackupsInDir } from "../../commands/backup.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleListBackups(
  input: { limit: number },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const logEntries = readBackupLog(dataDir);
  const fileEntries = listBackupsInDir(dataDir);

  // Prefer log entries (have richer metadata), fallback to file scan
  const entries = logEntries.length > 0 ? logEntries : fileEntries;
  const limited = entries.slice(0, input.limit);

  if (limited.length === 0) {
    return {
      content: [{ type: "text", text: "No backups found. Run backup_now to create one." }],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          count: limited.length,
          totalAvailable: entries.length,
          backups: limited.map((e) => ({
            filename: e.filename,
            createdAt: e.createdAt,
            sizeMb: e.sizeBytes > 0 ? `${(e.sizeBytes / 1024 / 1024).toFixed(1)} MB` : "unknown",
            verified: e.verified,
            encrypted: e.encrypted,
            customerCount: e.customerCount,
            fileCount: e.fileCount,
          })),
        }, null, 2),
      },
    ],
  };
}

export function registerListBackups(server: McpServer): void {
  server.registerTool(
    "list_backups",
    {
      description:
        "List available CRM backups with metadata (date, size, verification status, customer count). Shows log-tracked backups first, falls back to directory scan.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of backups to return"),
      }),
    },
    (input) => handleListBackups(input)
  );
}
