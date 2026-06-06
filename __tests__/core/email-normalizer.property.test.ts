import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  normalizeEmail,
  isSameContact,
  normalizeContactId,
} from "../../src/core/email-normalizer.js";

const RUNS = { numRuns: 1000, seed: 0xe3a1 } as const;

// A display name that cannot itself contain an angle-bracket envelope.
const displayName = fc.string().filter((n) => !n.includes("<") && !n.includes(">"));

describe("normalizeEmail — properties", () => {
  it("is idempotent", () => {
    fc.assert(
      fc.property(fc.string(), (s) => normalizeEmail(normalizeEmail(s)) === normalizeEmail(s)),
      RUNS
    );
  });

  it("output is always lowercase and has no surrounding whitespace", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = normalizeEmail(s);
        return out === out.toLowerCase() && out === out.trim();
      }),
      RUNS
    );
  });

  it("extracts the address from a 'Display Name <addr>' envelope", () => {
    fc.assert(
      fc.property(fc.emailAddress(), displayName, (email, name) => {
        return normalizeEmail(`${name} <${email}>`) === email.toLowerCase();
      }),
      RUNS
    );
  });

  it("is case-insensitive on real addresses", () => {
    fc.assert(
      fc.property(fc.emailAddress(), (email) => {
        return normalizeEmail(email.toUpperCase()) === normalizeEmail(email.toLowerCase());
      }),
      RUNS
    );
  });
});

describe("isSameContact — properties", () => {
  it("is reflexive", () => {
    fc.assert(
      fc.property(fc.string(), (s) => isSameContact(s, s)),
      RUNS
    );
  });

  it("is symmetric", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => isSameContact(a, b) === isSameContact(b, a)),
      RUNS
    );
  });

  it("matches an address regardless of casing or display-name envelope", () => {
    fc.assert(
      fc.property(fc.emailAddress(), displayName, (email, name) => {
        return isSameContact(email.toUpperCase(), `${name} <${email}>`);
      }),
      RUNS
    );
  });
});

describe("normalizeContactId — properties", () => {
  it("contains no '@' for a single-@ address and is otherwise the normalized email", () => {
    fc.assert(
      fc.property(fc.emailAddress(), (email) => {
        const id = normalizeContactId(email);
        return !id.includes("@") && id === normalizeEmail(email).replace("@", "_at_");
      }),
      RUNS
    );
  });

  it("empty/whitespace input yields an empty id", () => {
    expect(normalizeContactId("")).toBe("");
    expect(normalizeContactId("   ")).toBe("");
  });
});
