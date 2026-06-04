import path from "path";
import { readJsonArray, writeJsonArray } from "../fs/json-store.js";

/**
 * Metadata-driven custom fields — the first increment of the metadata model
 * (next-plan N1-7). Definitions live in .agentic/schema/custom-fields.json and
 * extend customers without code changes. Core schemas stay strict; custom
 * fields are validated separately against this registry.
 */
export type CustomFieldType = "text" | "number" | "boolean" | "date" | "select";

export interface FieldDefinition {
  name: string;
  type: CustomFieldType;
  label?: string;
  options?: string[];
}

function schemaPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "schema", "custom-fields.json");
}

export function loadFieldDefinitions(dataDir: string): FieldDefinition[] {
  return readJsonArray<FieldDefinition>(schemaPath(dataDir), "fields");
}

/** Add or update (by name) a custom field definition. */
export function defineCustomField(dataDir: string, def: FieldDefinition): FieldDefinition[] {
  const defs = loadFieldDefinitions(dataDir);
  const idx = defs.findIndex((d) => d.name === def.name);
  if (idx >= 0) defs[idx] = def;
  else defs.push(def);
  writeJsonArray(schemaPath(dataDir), "fields", defs);
  return defs;
}

export interface ValidationResult {
  valid: boolean;
  values: Record<string, string | number | boolean>;
  errors: string[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate + coerce a record of raw values against custom field definitions. */
export function validateCustomFields(
  input: Record<string, unknown>,
  defs: FieldDefinition[]
): ValidationResult {
  const byName = new Map(defs.map((d) => [d.name, d]));
  const values: Record<string, string | number | boolean> = {};
  const errors: string[] = [];

  for (const [key, raw] of Object.entries(input)) {
    const def = byName.get(key);
    if (!def) {
      errors.push(`Unknown custom field: ${key}`);
      continue;
    }
    const str = String(raw).trim();
    switch (def.type) {
      case "number": {
        const n = Number(str);
        if (!Number.isFinite(n)) errors.push(`${key}: not a number`);
        else values[key] = n;
        break;
      }
      case "boolean": {
        if (/^(true|yes|1)$/i.test(str)) values[key] = true;
        else if (/^(false|no|0)$/i.test(str)) values[key] = false;
        else errors.push(`${key}: not a boolean`);
        break;
      }
      case "date": {
        if (DATE_RE.test(str)) values[key] = str;
        else errors.push(`${key}: expected YYYY-MM-DD`);
        break;
      }
      case "select": {
        if (def.options && def.options.includes(str)) values[key] = str;
        else errors.push(`${key}: must be one of ${(def.options ?? []).join(", ")}`);
        break;
      }
      default:
        values[key] = str;
    }
  }

  return { valid: errors.length === 0, values, errors };
}
