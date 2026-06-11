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
  return import("../../src/core/tone.js");
}

describe("tone profiles", () => {
  it("resolves customer over global (per-field merge)", async () => {
    const { setTone, resolveTone } = await mod();
    setTone(DATA_DIR, { formality: "casual", language: "en" }); // global
    setTone(DATA_DIR, { formality: "formal" }, "acme"); // customer override

    const acme = resolveTone(DATA_DIR, "acme");
    expect(acme.formality).toBe("formal"); // customer wins
    expect(acme.language).toBe("en"); // inherited from global
  });

  it("toneInstruction builds a non-empty string from a profile, empty when blank", async () => {
    const { toneInstruction } = await mod();
    expect(toneInstruction({ formality: "formal", language: "de" })).toMatch(/formal/);
    expect(toneInstruction({})).toBe("");
  });

  it("languageName maps codes to English language names, defaulting to English", async () => {
    const { languageName } = await mod();
    expect(languageName("de")).toBe("German");
    expect(languageName("EN")).toBe("English");
    expect(languageName("fr")).toBe("French");
    expect(languageName(undefined)).toBe("English");
    expect(languageName("")).toBe("English");
    expect(languageName("xx")).toBe("English");
  });
});
