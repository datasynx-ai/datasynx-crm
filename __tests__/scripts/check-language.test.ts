import { describe, it, expect } from "vitest";
import { findStopwords, GERMAN_STOPWORDS } from "../../scripts/check-language.js";

describe("findStopwords", () => {
  it("flags a German stopword in a line", () => {
    const hits = findStopwords("Das ist nicht für uns relevant");
    expect(hits.map((h) => h.word)).toEqual(expect.arrayContaining(["nicht", "für"]));
  });

  it("reports the 1-based line number of the match", () => {
    const hits = findStopwords("first line is fine\nzweite Zeile wird geprüft");
    expect(hits.some((h) => h.word === "wird" && h.line === 2)).toBe(true);
  });

  it("does NOT flag English words that look like German (homographs)", () => {
    // war, die, man, was, hat, den are English words — must not be in the list
    expect(findStopwords("The war is over; the die was cast by a man in his den")).toEqual([]);
  });

  it("does not flag English prose", () => {
    expect(findStopwords("This is a normal English sentence about a customer deal.")).toEqual([]);
  });

  it("respects an inline i18n-allow marker on the line", () => {
    expect(findStopwords('"kein budget" // i18n-allow')).toEqual([]);
  });

  it("does not flag proper names with umlauts", () => {
    expect(findStopwords('const name = "Max Müller";')).toEqual([]);
  });

  it("matches case-insensitively and on whole words only", () => {
    // "und" inside "fund"/"rund" must NOT match; standalone "Und" must
    expect(findStopwords("a fund and a rund thing")).toEqual([]);
    expect(findStopwords("Und so weiter").map((h) => h.word)).toContain("und");
  });

  it("handles umlaut-initial stopwords (über)", () => {
    expect(findStopwords("Das gilt über alles").map((h) => h.word)).toContain("über");
  });

  it("exports a non-trivial curated stopword list", () => {
    expect(GERMAN_STOPWORDS.length).toBeGreaterThan(20);
    // the issue's explicit examples must be present
    for (const w of ["und", "nicht", "für", "über", "wird", "muss"]) {
      expect(GERMAN_STOPWORDS).toContain(w);
    }
    // English homographs must be absent
    for (const w of ["war", "die", "man", "was", "hat", "den"]) {
      expect(GERMAN_STOPWORDS).not.toContain(w);
    }
  });
});
