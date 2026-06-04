import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getDocumentProxy = vi.fn();
const extractText = vi.fn();
const renderPageAsImage = vi.fn();
vi.mock("unpdf", () => ({ getDocumentProxy, extractText, renderPageAsImage }));

const recognize = vi.fn();
vi.mock("tesseract.js", () => ({ recognize }));

// Provide a stand-in for the optional, uninstalled canvas backend so the
// happy-path OCR test can exercise rendering.
vi.mock("@napi-rs/canvas", () => ({ default: {} }), { virtual: true } as never);

beforeEach(() => {
  vi.clearAllMocks();
  getDocumentProxy.mockResolvedValue({});
  delete process.env["DXCRM_PDF_OCR"];
});

afterEach(() => {
  delete process.env["DXCRM_PDF_OCR"];
});

describe("pdfConverter", () => {
  it("returns the extracted digital text layer", async () => {
    extractText.mockResolvedValue({ totalPages: 3, text: "Hello PDF" });
    const { pdfConverter } = await import("../../../src/sync/converters/pdf.js");
    const res = await pdfConverter.convert(Buffer.from("%PDF"), "doc.pdf");
    expect(res.markdown).toBe("Hello PDF");
    expect(res.meta?.["pages"]).toBe(3);
  });

  it("joins per-page arrays", async () => {
    extractText.mockResolvedValue({ totalPages: 2, text: ["one", "two"] });
    const { pdfConverter } = await import("../../../src/sync/converters/pdf.js");
    const res = await pdfConverter.convert(Buffer.from("%PDF"), "doc.pdf");
    expect(res.markdown).toBe("one\n\ntwo");
  });

  it("flags scanned PDFs as OCR candidates when OCR is disabled", async () => {
    extractText.mockResolvedValue({ totalPages: 1, text: "   " });
    const { pdfConverter } = await import("../../../src/sync/converters/pdf.js");
    const res = await pdfConverter.convert(Buffer.from("%PDF"), "scan.pdf");
    expect(res.markdown).toBe("");
    expect(res.meta?.["ocrCandidate"]).toBe(true);
    expect(renderPageAsImage).not.toHaveBeenCalled();
  });

  it("OCRs scanned PDFs page-by-page when DXCRM_PDF_OCR is enabled", async () => {
    process.env["DXCRM_PDF_OCR"] = "1";
    extractText.mockResolvedValue({ totalPages: 2, text: "" });
    renderPageAsImage.mockResolvedValue(new Uint8Array([1, 2, 3]));
    recognize
      .mockResolvedValueOnce({ data: { text: "page one text" } })
      .mockResolvedValueOnce({ data: { text: "page two text" } });

    const { pdfConverter } = await import("../../../src/sync/converters/pdf.js");
    const res = await pdfConverter.convert(Buffer.from("%PDF"), "scan.pdf");

    expect(renderPageAsImage).toHaveBeenCalledTimes(2);
    expect(res.markdown).toContain("OCR of `scan.pdf`");
    expect(res.markdown).toContain("page one text");
    expect(res.markdown).toContain("page two text");
    expect(res.meta?.["ocr"]).toBe(true);
  });
});
