import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return { default: fs, ...fs };
});

beforeEach(() => {
  vol.reset();
});

const DATA_DIR = "/crm";

async function mod() {
  return import("../../src/core/custom-objects.js");
}

describe("custom object registry", () => {
  it("defines and lists custom objects", async () => {
    const { defineCustomObject, loadCustomObjects } = await mod();
    expect(loadCustomObjects(DATA_DIR)).toEqual([]);
    defineCustomObject(DATA_DIR, {
      name: "contract",
      label: "Contract",
      fields: [
        { name: "value", type: "number" },
        { name: "stage", type: "select", options: ["draft", "signed"] },
      ],
    });
    const objs = loadCustomObjects(DATA_DIR);
    expect(objs).toHaveLength(1);
    expect(objs[0]!.name).toBe("contract");
    expect(vol.existsSync("/crm/.agentic/schema/custom-objects.json")).toBe(true);
  });
});

describe("custom object records (CRUD)", () => {
  beforeEach(async () => {
    const { defineCustomObject } = await mod();
    defineCustomObject(DATA_DIR, {
      name: "contract",
      fields: [
        { name: "value", type: "number" },
        { name: "stage", type: "select", options: ["draft", "signed"] },
      ],
    });
  });

  it("creates a record with coerced, validated values", async () => {
    const { createRecord, listRecords } = await mod();
    const res = createRecord(DATA_DIR, "contract", { value: "5000", stage: "signed" });
    expect(res.ok).toBe(true);
    expect(res.record!.id).toBeTruthy();
    expect(res.record!.values).toEqual({ value: 5000, stage: "signed" });
    expect(listRecords(DATA_DIR, "contract")).toHaveLength(1);
  });

  it("rejects unknown object and invalid values", async () => {
    const { createRecord } = await mod();
    expect(createRecord(DATA_DIR, "ghost", { x: "1" }).ok).toBe(false);
    expect(createRecord(DATA_DIR, "contract", { stage: "bronze" }).ok).toBe(false);
  });

  it("updates and deletes records", async () => {
    const { createRecord, updateRecord, getRecord, deleteRecord, listRecords } = await mod();
    const id = createRecord(DATA_DIR, "contract", { value: "100" }).record!.id;

    const upd = updateRecord(DATA_DIR, "contract", id, { stage: "signed" });
    expect(upd.ok).toBe(true);
    expect(getRecord(DATA_DIR, "contract", id)!.values).toMatchObject({
      value: 100,
      stage: "signed",
    });

    expect(deleteRecord(DATA_DIR, "contract", id)).toBe(true);
    expect(listRecords(DATA_DIR, "contract")).toHaveLength(0);
  });
});
