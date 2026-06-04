import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const indexInLanceDB = vi.fn().mockResolvedValue(undefined);
vi.mock("../../src/core/lancedb.js", () => ({
  indexInLanceDB,
  searchKnowledge: vi.fn().mockResolvedValue([]),
  resetConnection: vi.fn(),
}));

import {
  collectAttachmentParts,
  sanitizeFilename,
  processMessageAttachments,
} from "../../src/sync/attachments.js";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
});

describe("collectAttachmentParts", () => {
  it("finds attachment parts recursively, skipping inline parts without a filename", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: { size: 10 } },
        {
          mimeType: "multipart/related",
          parts: [
            { filename: "logo.png", body: { size: 5, attachmentId: "noname-but-has" } },
            { filename: "", body: { attachmentId: "inline1" } },
          ],
        },
        { filename: "report.pdf", body: { size: 2048, attachmentId: "att-pdf" } },
      ],
    };
    const parts = collectAttachmentParts(payload as never);
    expect(parts.map((p) => p.filename).sort()).toEqual(["logo.png", "report.pdf"]);
  });

  it("returns empty for missing payload", () => {
    expect(collectAttachmentParts(undefined)).toEqual([]);
  });
});

describe("sanitizeFilename", () => {
  it("strips path separators and unsafe characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("my report (final).csv")).toBe("my_report_final_.csv");
  });
});

describe("processMessageAttachments", () => {
  function makeGmail(dataByName: Record<string, string>) {
    return {
      users: {
        messages: {
          attachments: {
            get: vi.fn().mockImplementation(({ id }: { id: string }) =>
              Promise.resolve({ data: { data: dataByName[id] } })
            ),
          },
        },
      },
    } as never;
  }

  it("downloads, stores raw + markdown, and indexes chunks", async () => {
    const csv = "name,amount\nAcme,100";
    const b64 = Buffer.from(csv).toString("base64url");
    const gmail = makeGmail({ "att-1": b64 });

    const payload = {
      mimeType: "multipart/mixed",
      parts: [{ filename: "invoice.csv", mimeType: "text/csv", body: { size: csv.length, attachmentId: "att-1" } }],
    };

    const saved = await processMessageAttachments({
      gmail,
      dataDir: "/data",
      slug: "acme",
      messageId: "msg9",
      source: "gmail://thread/t9",
      payload: payload as never,
      date: "2026-06-04",
    });

    expect(saved).toHaveLength(1);
    expect(saved[0]?.storedName).toBe("msg9__invoice.csv");
    expect(saved[0]?.markdownName).toBe("msg9__invoice.csv.md");

    const json = vol.toJSON();
    expect(json["/data/customers/acme/attachments/msg9__invoice.csv"]).toBe(csv);
    const md = json["/data/customers/acme/attachments/msg9__invoice.csv.md"] as string;
    expect(md).toContain("# invoice.csv");
    expect(md).toContain("| name | amount |");

    expect(indexInLanceDB).toHaveBeenCalled();
    const indexedRef = indexInLanceDB.mock.calls[0]?.[3];
    expect(indexedRef).toContain("gmail://thread/t9#att:invoice.csv");
  });

  it("skips oversized attachments", async () => {
    const gmail = makeGmail({});
    const payload = {
      parts: [{ filename: "huge.bin", mimeType: "application/octet-stream", body: { size: 999_999_999, attachmentId: "big" } }],
    };
    const saved = await processMessageAttachments({
      gmail,
      dataDir: "/data",
      slug: "acme",
      messageId: "m1",
      source: "gmail://thread/t1",
      payload: payload as never,
      date: "2026-06-04",
      maxBytes: 1024,
    });
    expect(saved).toHaveLength(0);
    expect(indexInLanceDB).not.toHaveBeenCalled();
  });

  it("returns empty when the message has no attachments", async () => {
    const saved = await processMessageAttachments({
      gmail: makeGmail({}),
      dataDir: "/data",
      slug: "acme",
      messageId: "m2",
      source: "gmail://thread/t2",
      payload: { mimeType: "text/plain", body: { size: 5 } } as never,
      date: "2026-06-04",
    });
    expect(saved).toEqual([]);
  });
});
