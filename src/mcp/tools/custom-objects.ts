import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { enforceRbac } from "../../core/rbac.js";
import {
  defineCustomObject,
  loadCustomObjects,
  createRecord,
  listRecords,
} from "../../core/custom-objects.js";
import type { CustomFieldType } from "../../core/custom-fields.js";

const DATA_DIR = process.env["DXCRM_DATA_DIR"] ?? process.cwd();

const FIELD_TYPES = ["text", "number", "boolean", "date", "select"] as const;

function json(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function handleDefineCustomObject(
  input: {
    name: string;
    label?: string;
    fields: Array<{ name: string; type: CustomFieldType; label?: string; options?: string[] }>;
  },
  dataDir: string = DATA_DIR
): { content: Array<{ type: "text"; text: string }> } {
  enforceRbac(dataDir, "define_custom_object");
  const objects = defineCustomObject(dataDir, {
    name: input.name,
    ...(input.label ? { label: input.label } : {}),
    fields: input.fields,
  });
  return json({ defined: input.name, objectCount: objects.length });
}

export function handleCreateRecord(
  input: { object: string; values: Record<string, string> },
  dataDir: string = DATA_DIR
): { content: Array<{ type: "text"; text: string }> } {
  enforceRbac(dataDir, "create_record");
  const res = createRecord(dataDir, input.object, input.values);
  if (!res.ok) return json({ error: (res.errors ?? []).join("; ") });
  // Fire-and-forget outbound webhook (event-driven; failures queue for replay).
  void import("../../core/webhooks.js").then(({ emitEvent }) =>
    emitEvent(dataDir, "record.created", { object: input.object, record: res.record })
  );
  return json({ record: res.record });
}

export function handleListRecords(
  input: { object: string },
  dataDir: string = DATA_DIR
): { content: Array<{ type: "text"; text: string }> } {
  return json({ object: input.object, records: listRecords(dataDir, input.object) });
}

export function handleListCustomObjects(dataDir: string = DATA_DIR): {
  content: Array<{ type: "text"; text: string }>;
} {
  return json({ objects: loadCustomObjects(dataDir) });
}

export function registerCustomObjectTools(server: McpServer, dataDir: string = DATA_DIR): void {
  server.registerTool(
    "define_custom_object",
    {
      description:
        "Define a custom object (runtime entity type) with typed fields — no code migration. admin only.",
      inputSchema: z.object({
        name: z.string().describe("Object name (e.g. contract)"),
        label: z.string().optional(),
        fields: z
          .array(
            z.object({
              name: z.string(),
              type: z.enum(FIELD_TYPES),
              label: z.string().optional(),
              options: z.array(z.string()).optional(),
            })
          )
          .describe("Field definitions"),
      }),
    },
    ({ name, label, fields }) =>
      handleDefineCustomObject(
        { name, ...(label ? { label } : {}), fields: fields as never },
        dataDir
      )
  );

  server.registerTool(
    "create_record",
    {
      description:
        "Create a record of a custom object. Values are validated against the schema. rep+.",
      inputSchema: z.object({
        object: z.string().describe("Custom object name"),
        values: z.record(z.string(), z.string()).describe("Field values (key=value)"),
      }),
    },
    ({ object, values }) => handleCreateRecord({ object, values }, dataDir)
  );

  server.registerTool(
    "list_records",
    {
      description: "List records of a custom object.",
      inputSchema: z.object({ object: z.string().describe("Custom object name") }),
    },
    ({ object }) => handleListRecords({ object }, dataDir)
  );

  server.registerTool(
    "list_custom_objects",
    {
      description: "List all defined custom objects and their field schemas.",
      inputSchema: z.object({}),
    },
    () => handleListCustomObjects(dataDir)
  );
}
