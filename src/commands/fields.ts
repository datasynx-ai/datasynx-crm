import { Command } from "commander";
import { info, success, error } from "../ui/colors.js";
import type { CustomFieldType, FieldDefinition } from "../core/custom-fields.js";

const VALID_TYPES = ["text", "number", "boolean", "date", "select"];

function dataDir(): string {
  return process.env["DXCRM_DATA_DIR"] ?? process.cwd();
}

function collect(value: string, prev: string[]): string[] {
  return [...prev, value];
}

/** Parse a `--field name:type[:opt1|opt2]` spec into a FieldDefinition. */
function parseFieldSpec(spec: string): FieldDefinition | null {
  const [name, type, opts] = spec.split(":");
  if (!name || !type || !VALID_TYPES.includes(type)) return null;
  return {
    name,
    type: type as CustomFieldType,
    ...(opts ? { options: opts.split("|").map((s) => s.trim()) } : {}),
  };
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

export const objectCommand = new Command("object").description(
  "Manage custom objects (runtime-defined entities, no-migration)"
);

objectCommand
  .command("define <name>")
  .description("Define a custom object with fields (--field name:type[:opt1|opt2])")
  .option("--label <label>", "Human-readable label")
  .option("--field <spec>", "Field spec, repeatable", collect, [] as string[])
  .action(async (name: string, opts: { label?: string; field: string[] }) => {
    const fields: FieldDefinition[] = [];
    for (const spec of opts.field) {
      const f = parseFieldSpec(spec);
      if (!f) {
        console.error(error(`Invalid --field spec '${spec}' (use name:type[:a|b])`));
        process.exitCode = 1;
        return;
      }
      fields.push(f);
    }
    const { defineCustomObject } = await import("../core/custom-objects.js");
    defineCustomObject(dataDir(), { name, ...(opts.label ? { label: opts.label } : {}), fields });
    console.log(success(`Custom object '${name}' defined with ${fields.length} field(s).`));
  });

objectCommand
  .command("add <name>")
  .description("Create a record (--set key=value, repeatable)")
  .option("--set <kv>", "key=value, repeatable", collect, [] as string[])
  .action(async (name: string, opts: { set: string[] }) => {
    const values: Record<string, string> = {};
    for (const kv of opts.set) {
      const eq = kv.indexOf("=");
      if (eq < 0) continue;
      values[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
    }
    const { createRecord } = await import("../core/custom-objects.js");
    const res = createRecord(dataDir(), name, values);
    if (!res.ok) {
      console.error(error(`Could not create record: ${(res.errors ?? []).join("; ")}`));
      process.exitCode = 1;
      return;
    }
    console.log(success(`Created ${name} record ${res.record!.id}`));
  });

objectCommand
  .command("list <name>")
  .description("List records of a custom object")
  .action(async (name: string) => {
    const { listRecords } = await import("../core/custom-objects.js");
    const records = listRecords(dataDir(), name);
    if (records.length === 0) {
      console.log(info(`No records for '${name}'.`));
      return;
    }
    for (const r of records) console.log(`${r.id}  ${JSON.stringify(r.values)}`);
  });
