import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createHash } from "crypto";
import { runBackup, readBackupLog } from "../../commands/backup.js";

export function registerBackupNow(server: McpServer): void {
  server.registerTool(
    "backup_now",
    {
      description:
        "Trigger an immediate backup of all CRM data (customers/ + .agentic/). Returns backup path, size, and integrity status. Use before risky operations or on user request.",
      inputSchema: z.object({
        remote: z.string().optional().describe("Upload destination: s3://bucket/path/, rsync://user@host:/path/, or local directory"),
        note: z.string().optional().describe("Optional note to tag this backup"),
      }),
    },
    async (input) => {
      const dataDir = process.env["DXCRM_DATA_DIR"] ?? process.cwd();
      const zipPath = path.join(
        dataDir,
        `dxcrm-backup-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.zip`
      );

      const manifest = await runBackup(zipPath, dataDir, {
        ...(input.remote ? { remote: input.remote } : {}),
      }).catch(() => null);

      if (!manifest) {
        return { content: [{ type: "text" as const, text: "Backup failed. Check disk space and permissions." }] };
      }

      const sizeMb = fs.existsSync(zipPath)
        ? (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1)
        : "?";

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              path: zipPath,
              createdAt: manifest.createdAt,
              customerCount: manifest.customerCount,
              fileCount: manifest.fileCount,
              sizeMb: `${sizeMb} MB`,
              directories: manifest.directories,
              verified: true,
              ...(input.remote ? { uploadedTo: input.remote } : {}),
              ...(input.note ? { note: input.note } : {}),
            }, null, 2),
          },
        ],
      };
    }
  );
}
