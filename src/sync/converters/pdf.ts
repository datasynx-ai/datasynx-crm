// src/sync/converters/pdf.ts
import type { Converter, ConversionResult } from "./types.js";

/** Whether scanned-PDF OCR is enabled (opt-in, requires @napi-rs/canvas). */
export function isPdfOcrEnabled(): boolean {
  const v = (process.env["DXCRM_PDF_OCR"] ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * OCR a scanned PDF by rendering each page to a PNG (unpdf + @napi-rs/canvas)
 * and running tesseract.js over it. The canvas backend is an optional peer
 * dependency; if it isn't installed we throw a clear, catchable error so the
 * caller can fall back to the OCR-candidate stub. Page count is capped via
 * DXCRM_PDF_OCR_MAX_PAGES (default 20) to keep this slow path bounded.
 */
async function ocrPdf(pdf: unknown, totalPages: number): Promise<string> {
  // Fail fast with a helpful message when the optional canvas backend is absent.
  try {
    await import("@napi-rs/canvas");
  } catch {
    throw new Error(
      "PDF OCR requires the optional '@napi-rs/canvas' package — run `npm install @napi-rs/canvas`"
    );
  }

  const { renderPageAsImage } = await import("unpdf");
  const { recognize } = await import("tesseract.js");
  const lang = process.env["DXCRM_OCR_LANG"] ?? "eng";
  const canvasImport = (): Promise<unknown> => import("@napi-rs/canvas");

  const maxPages = Number(process.env["DXCRM_PDF_OCR_MAX_PAGES"] ?? 20) || 20;
  const pageCount = Math.min(totalPages, maxPages);

  const pages: string[] = [];
  for (let p = 1; p <= pageCount; p++) {
    const png = await renderPageAsImage(pdf as never, p, { canvasImport, scale: 2 } as never);
    const {
      data: { text },
    } = await recognize(Buffer.from(png), lang);
    if (text.trim()) pages.push(`## Page ${p}\n\n${text.trim()}`);
  }
  return pages.join("\n\n");
}

/**
 * PDF → Markdown. Extracts the digital text layer with unpdf (a serverless
 * pdf.js build). Scanned PDFs have no text layer: when DXCRM_PDF_OCR is enabled
 * they are rendered and OCR'd page-by-page, otherwise they're flagged as OCR
 * candidates rather than emitting garbage. unpdf is loaded lazily.
 */
export const pdfConverter: Converter = {
  name: "pdf",
  extensions: ["pdf"],
  mimeTypes: ["application/pdf"],
  async convert(buffer: Buffer, filename: string): Promise<ConversionResult> {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    const merged = (Array.isArray(text) ? text.join("\n\n") : text).trim();

    if (merged) return { markdown: merged, meta: { format: "pdf", pages: totalPages } };

    // No text layer — scanned PDF. OCR if opted in, else flag as a candidate.
    if (isPdfOcrEnabled()) {
      try {
        const ocr = await ocrPdf(pdf, totalPages);
        if (ocr.trim()) {
          return {
            markdown: `> _OCR of \`${filename}\` (${totalPages} pages):_\n\n${ocr.trim()}`,
            meta: { format: "pdf", pages: totalPages, ocr: true },
          };
        }
      } catch (err) {
        process.stderr.write(
          `[converters] pdf OCR failed for ${filename}: ${(err as Error).message}\n`
        );
      }
    }

    return { markdown: "", meta: { format: "pdf", pages: totalPages, ocrCandidate: true } };
  },
};
