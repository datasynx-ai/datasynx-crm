import { describe, it, expect } from "vitest";
import AdmZip from "adm-zip";
import { extractSlideText, pptxConverter } from "../../../src/sync/converters/pptx.js";

describe("extractSlideText", () => {
  it("joins <a:t> runs and decodes entities", () => {
    const xml = "<p:sld><a:t>Hello</a:t><a:t>R&amp;D &lt;world&gt;</a:t></p:sld>";
    expect(extractSlideText(xml)).toBe("Hello R&D <world>");
  });

  it("returns empty string when there are no text runs", () => {
    expect(extractSlideText("<p:sld></p:sld>")).toBe("");
  });
});

describe("pptxConverter", () => {
  function makePptx(slides: string[]): Buffer {
    const zip = new AdmZip();
    slides.forEach((text, i) => {
      zip.addFile(`ppt/slides/slide${i + 1}.xml`, Buffer.from(`<p:sld><a:t>${text}</a:t></p:sld>`));
    });
    // A non-slide entry that must be ignored.
    zip.addFile("ppt/presentation.xml", Buffer.from("<p:presentation/>"));
    return zip.toBuffer();
  }

  it("emits one section per slide in numeric order", async () => {
    const res = await pptxConverter.convert(makePptx(["First", "Second"]), "deck.pptx");
    expect(res.markdown).toBe("## Slide 1\n\nFirst\n\n## Slide 2\n\nSecond");
    expect(res.meta?.["slides"]).toBe(2);
  });
});
