import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const indexInLanceDB = vi.fn().mockResolvedValue(undefined);
vi.mock("../../src/core/lancedb.js", () => ({
  indexInLanceDB,
  searchKnowledge: vi.fn().mockResolvedValue([]),
  resetConnection: vi.fn(),
}));

import { ingestEmail, type NormalizedEmail } from "../../src/sync/email-ingest.js";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
});

function baseMsg(over: Partial<NormalizedEmail> = {}): NormalizedEmail {
  return {
    messageId: "m1",
    from: "Buyer <buyer@acme.com>",
    toAddresses: ["me@myco.com"],
    subject: "Quote request",
    date: "2026-06-04",
    bodyMarkdown: "Please send pricing for 100 units.",
    attachments: [],
    sourceRef: "imap://me@myco.com/INBOX/42",
    ...over,
  };
}

describe("ingestEmail", () => {
  it("logs an interaction and indexes the body", async () => {
    vol.fromJSON({ "/data/customers/acme/interactions.md": "# Interactions\n" });

    const res = await ingestEmail("/data", "acme", baseMsg());

    expect(res.chunks).toBeGreaterThanOrEqual(1);
    const md = vol.toJSON()["/data/customers/acme/interactions.md"] as string;
    expect(md).toContain("buyer@acme.com");
    expect(md).toContain("imap://me@myco.com/INBOX/42");

    // Subject + body are both indexed for search even though the entry renders the sender.
    const indexedTexts = indexInLanceDB.mock.calls.map((c) => c[2] as string);
    expect(indexedTexts.some((t) => t.includes("Quote request"))).toBe(true);
    expect(indexedTexts.some((t) => t.includes("Please send pricing"))).toBe(true);
  });

  it("converts, stores, indexes and links attachments", async () => {
    vol.fromJSON({ "/data/customers/acme/interactions.md": "# Interactions\n" });

    const res = await ingestEmail(
      "/data",
      "acme",
      baseMsg({
        attachments: [
          {
            filename: "order.csv",
            mimeType: "text/csv",
            content: Buffer.from("item,qty\nWidget,3"),
          },
        ],
      })
    );

    expect(res.attachments).toBe(1);
    const json = vol.toJSON();
    expect(json["/data/customers/acme/attachments/m1__order.csv"]).toBe("item,qty\nWidget,3");
    const attMd = json["/data/customers/acme/attachments/m1__order.csv.md"] as string;
    expect(attMd).toContain("| item | qty |");
    const interactions = json["/data/customers/acme/interactions.md"] as string;
    expect(interactions).toContain("(attachments/m1__order.csv.md)");
  });

  it("skips oversized attachments", async () => {
    vol.fromJSON({ "/data/customers/acme/interactions.md": "# Interactions\n" });
    const res = await ingestEmail(
      "/data",
      "acme",
      baseMsg({
        attachments: [
          {
            filename: "big.bin",
            mimeType: "application/octet-stream",
            content: Buffer.alloc(2048),
          },
        ],
      }),
      { maxAttachmentBytes: 1024 }
    );
    expect(res.attachments).toBe(0);
  });

  it("respects includeAttachments=false", async () => {
    vol.fromJSON({ "/data/customers/acme/interactions.md": "# Interactions\n" });
    const res = await ingestEmail(
      "/data",
      "acme",
      baseMsg({
        attachments: [
          { filename: "x.csv", mimeType: "text/csv", content: Buffer.from("a,b\n1,2") },
        ],
      }),
      { includeAttachments: false }
    );
    expect(res.attachments).toBe(0);
    expect(vol.toJSON()["/data/customers/acme/attachments/m1__x.csv"]).toBeUndefined();
  });
});
