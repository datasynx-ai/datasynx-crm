import { describe, it, expect } from "vitest";
import {
  GlobalSourcesSchema,
  GmailSourceSchema,
  TranscriptSourceSchema,
  type GlobalSources,
} from "../../src/schemas/sources.js";

describe("GmailSourceSchema", () => {
  it("accepts a valid gmail source", () => {
    const result = GmailSourceSchema.safeParse({
      type: "gmail",
      query: "from:acme.com OR to:acme.com",
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("defaults enabled to true", () => {
    const result = GmailSourceSchema.safeParse({
      type: "gmail",
      query: "from:acme.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
    }
  });

  it("requires type to be 'gmail'", () => {
    const result = GmailSourceSchema.safeParse({
      type: "email",
      query: "from:acme.com",
    });
    expect(result.success).toBe(false);
  });

  it("requires query", () => {
    const result = GmailSourceSchema.safeParse({
      type: "gmail",
      enabled: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("TranscriptSourceSchema", () => {
  it("accepts a valid transcript source", () => {
    const result = TranscriptSourceSchema.safeParse({
      type: "transcript",
      paths: ["/home/user/Downloads/Fireflies"],
      extensions: [".txt", ".vtt"],
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("defaults extensions to ['.txt', '.vtt']", () => {
    const result = TranscriptSourceSchema.safeParse({
      type: "transcript",
      paths: ["/home/user/Downloads/Fireflies"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.extensions).toEqual([".txt", ".vtt"]);
    }
  });

  it("defaults enabled to true", () => {
    const result = TranscriptSourceSchema.safeParse({
      type: "transcript",
      paths: ["/home/user/Downloads/Fireflies"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
    }
  });

  it("requires type to be 'transcript'", () => {
    const result = TranscriptSourceSchema.safeParse({
      type: "audio",
      paths: ["/home/user/Downloads/Fireflies"],
    });
    expect(result.success).toBe(false);
  });

  it("requires paths", () => {
    const result = TranscriptSourceSchema.safeParse({
      type: "transcript",
    });
    expect(result.success).toBe(false);
  });
});

describe("GlobalSourcesSchema", () => {
  const validSources: GlobalSources = {
    version: 1,
    created: "2024-06-01T10:00:00.000Z",
  };

  it("accepts minimal valid sources", () => {
    const result = GlobalSourcesSchema.safeParse(validSources);
    expect(result.success).toBe(true);
  });

  it("accepts sources with gmail", () => {
    const result = GlobalSourcesSchema.safeParse({
      ...validSources,
      gmail: {
        type: "gmail",
        query: "from:acme.com",
        enabled: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts sources with transcripts", () => {
    const result = GlobalSourcesSchema.safeParse({
      ...validSources,
      transcripts: {
        type: "transcript",
        paths: ["/home/user/Downloads/Fireflies"],
        extensions: [".txt"],
        enabled: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts sources with calendar", () => {
    const result = GlobalSourcesSchema.safeParse({
      ...validSources,
      calendar: { enabled: true },
    });
    expect(result.success).toBe(true);
  });

  it("defaults version to 1", () => {
    const { version: _version, ...withoutVersion } = validSources;
    const result = GlobalSourcesSchema.safeParse(withoutVersion);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
    }
  });

  it("requires created timestamp", () => {
    const { created: _created, ...withoutCreated } = validSources;
    const result = GlobalSourcesSchema.safeParse(withoutCreated);
    expect(result.success).toBe(false);
  });

  it("all source types are optional", () => {
    const result = GlobalSourcesSchema.safeParse({
      version: 1,
      created: "2024-06-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});
