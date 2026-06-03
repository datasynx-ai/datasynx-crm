import { Command } from "commander";
import { info, success, error } from "../ui/colors.js";
import type { CustomFieldType } from "../core/custom-fields.js";

const VALID_TYPES = ["text", "number", "boolean", "date", "select"];

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

export const fieldsCommand = new Command("fields").description(
  "Manage custom fields (metadata-driven extensibility)"
);

fieldsCommand
  .command("list")
  .description("List defined custom fields")
  .action(async () => {
    const { loadFieldDefinitions } = await import("../core/custom-fields.js");
    const defs = loadFieldDefinitions(dataDir());
    if (defs.length === 0) {
      console.log(info("No custom fields defined. Add one with: dxcrm fields add <name> <type>"));
      return;
    }
    for (const d of defs) {
      const opts = d.options ? ` [${d.options.join(", ")}]` : "";
      console.log(`${d.name} (${d.type})${opts}${d.label ? ` — ${d.label}` : ""}`);
    }
  });

fieldsCommand
  .command("add <name> <type>")
  .description("Define a custom field (type: text|number|boolean|date|select)")
  .option("--label <label>", "Human-readable label")
  .option("--options <csv>", "Comma-separated options (for select)")
  .action(async (name: string, type: string, opts: { label?: string; options?: string }) => {
    if (!VALID_TYPES.includes(type)) {
      console.error(error(`Invalid type '${type}'. Use one of: ${VALID_TYPES.join(", ")}`));
      process.exitCode = 1;
      return;
    }
    const { defineCustomField } = await import("../core/custom-fields.js");
    defineCustomField(dataDir(), {
      name,
      type: type as CustomFieldType,
      ...(opts.label ? { label: opts.label } : {}),
      ...(opts.options ? { options: opts.options.split(",").map((s) => s.trim()) } : {}),
    });
    console.log(success(`Custom field '${name}' (${type}) defined.`));
  });
