import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runDiagnostics } from "../../core/doctor.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

export async function handleGetDiagnostics(
  input: { fix?: boolean },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  let cleaned = 0;
  if (input.fix) {
    const { cleanupTempFiles } = await import("../../core/doctor.js");
    cleaned = cleanupTempFiles(dataDir).length;
  }
  const report = await runDiagnostics(dataDir);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            ok: report.ok,
            ...(input.fix ? { tempFilesRemoved: cleaned } : {}),
            checks: report.checks,
          },
          null,
          2
        ),
      },
    ],
  };
}

export function registerGetDiagnostics(server: McpServer): void {
  server.registerTool(
    "get_diagnostics",
    {
      title: "Get Diagnostics",
      description: `Run a self-diagnostic health check of the CRM workspace.
Verifies the data directory, validates every customer's profile, detects orphaned
atomic-write temp files (a crash signature), surfaces recent log errors, and checks
backup freshness. Use to answer "is everything healthy?" before/after bulk operations.

Args:
  fix: When true, first remove orphaned temp files (the only safely auto-fixable issue)

Returns: { ok: boolean, tempFilesRemoved?: number, checks: [{ name, status: "ok"|"warn"|"fail", detail }] }`,
      inputSchema: z.object({
        fix: z.boolean().optional().describe("Clean orphaned temp files before reporting"),
      }),
    },
    async ({ fix }) => handleGetDiagnostics(fix !== undefined ? { fix } : {})
  );
}
