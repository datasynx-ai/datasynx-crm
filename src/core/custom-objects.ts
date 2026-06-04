import { randomBytes } from "crypto";
import path from "path";
import { validateCustomFields, type FieldDefinition } from "./custom-fields.js";
import { readJsonArray, writeJsonArray } from "../fs/json-store.js";

/**
 * Custom objects — runtime-defined entity types with their own fields, stored
 * as JSON without code migrations (Twenty-style "no-migration" model, the
 * N5-1 increment of the metadata layer). Definitions live in
 * .agentic/schema/custom-objects.json; records in .agentic/objects/<name>.json.
 */
export interface ObjectDefinition {
  name: string;
  label?: string;
  fields: FieldDefinition[];
}

export interface ObjectRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  values: Record<string, string | number | boolean>;
}

export interface RecordResult {
  ok: boolean;
  record?: ObjectRecord;
  errors?: string[];
}

function objectsSchemaPath(dataDir: string): string {
  return path.join(dataDir, ".agentic", "schema", "custom-objects.json");
}
function recordsPath(dataDir: string, name: string): string {
  return path.join(dataDir, ".agentic", "objects", `${name}.json`);
}

export function loadCustomObjects(dataDir: string): ObjectDefinition[] {
  return readJsonArray<ObjectDefinition>(objectsSchemaPath(dataDir), "objects");
}

export function getObjectDefinition(dataDir: string, name: string): ObjectDefinition | undefined {
  return loadCustomObjects(dataDir).find((o) => o.name === name);
}

/** Add or update (by name) a custom object definition. */
export function defineCustomObject(dataDir: string, def: ObjectDefinition): ObjectDefinition[] {
  const objs = loadCustomObjects(dataDir);
  const idx = objs.findIndex((o) => o.name === def.name);
  if (idx >= 0) objs[idx] = def;
  else objs.push(def);
  writeJsonArray(objectsSchemaPath(dataDir), "objects", objs);
  return objs;
}

export function listRecords(dataDir: string, name: string): ObjectRecord[] {
  return readJsonArray<ObjectRecord>(recordsPath(dataDir, name), "records");
}

function writeRecords(dataDir: string, name: string, records: ObjectRecord[]): void {
  writeJsonArray(recordsPath(dataDir, name), "records", records);
}

export function getRecord(dataDir: string, name: string, id: string): ObjectRecord | undefined {
  return listRecords(dataDir, name).find((r) => r.id === id);
}

export function createRecord(
  dataDir: string,
  name: string,
  values: Record<string, unknown>
): RecordResult {
  const def = getObjectDefinition(dataDir, name);
  if (!def) return { ok: false, errors: [`Unknown object: ${name}`] };

  const validation = validateCustomFields(values, def.fields);
  if (!validation.valid) return { ok: false, errors: validation.errors };

  const now = new Date().toISOString();
  const record: ObjectRecord = {
    id: `${name}_${randomBytes(6).toString("hex")}`,
    createdAt: now,
    updatedAt: now,
    values: validation.values,
  };
  writeRecords(dataDir, name, [...listRecords(dataDir, name), record]);
  return { ok: true, record };
}

export function updateRecord(
  dataDir: string,
  name: string,
  id: string,
  values: Record<string, unknown>
): RecordResult {
  const def = getObjectDefinition(dataDir, name);
  if (!def) return { ok: false, errors: [`Unknown object: ${name}`] };

  const records = listRecords(dataDir, name);
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) return { ok: false, errors: [`Record not found: ${id}`] };

  const validation = validateCustomFields(values, def.fields);
  if (!validation.valid) return { ok: false, errors: validation.errors };

  const updated: ObjectRecord = {
    ...records[idx]!,
    updatedAt: new Date().toISOString(),
    values: { ...records[idx]!.values, ...validation.values },
  };
  records[idx] = updated;
  writeRecords(dataDir, name, records);
  return { ok: true, record: updated };
}

export function deleteRecord(dataDir: string, name: string, id: string): boolean {
  const records = listRecords(dataDir, name);
  const next = records.filter((r) => r.id !== id);
  if (next.length === records.length) return false;
  writeRecords(dataDir, name, next);
  return true;
}
