import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const mockEmitEvent = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/webhooks.js", () => ({ emitEvent: mockEmitEvent }));

const DATA_DIR = "/data";

beforeEach(async () => {
  vol.reset();
  vi.clearAllMocks();
  mockEmitEvent.mockResolvedValue(undefined);
  const { resetRateLimiter } = await import("../../src/core/forms.js");
  resetRateLimiter();
});

async function seedForm(extra: Record<string, unknown> = {}) {
  const { createForm } = await import("../../src/core/forms.js");
  return createForm(DATA_DIR, {
    id: "contact",
    name: "Contact us",
    fields: { full_name: "name", work_email: "email", company: "company", msg: "message" },
    ...extra,
  } as never);
}

describe("forms (#60)", () => {
  it("a submission creates customer + interaction and fires lead.captured", async () => {
    await seedForm();
    const { processFormSubmission } = await import("../../src/core/forms.js");
    const result = await processFormSubmission(DATA_DIR, "contact", {
      full_name: "Jane Buyer",
      work_email: "jane@acme.com",
      company: "Acme Corp",
      msg: "Interested in a demo",
    });
    expect(result.status).toBe("created");
    expect(result.slug).toBe("acme-corp");

    const fs = (await import("fs")).default;
    expect(fs.existsSync(`${DATA_DIR}/customers/acme-corp/main_facts.md`)).toBe(true);
    const interactions = fs.readFileSync(
      `${DATA_DIR}/customers/acme-corp/interactions.md`,
      "utf-8"
    ) as string;
    expect(interactions).toContain("Interested in a demo");
    expect(interactions).toContain("form:contact");

    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "lead.captured",
      expect.objectContaining({ slug: "acme-corp", formId: "contact", email: "jane@acme.com" })
    );
  });

  it("honeypot submissions are silently ignored (no lead, looks like success)", async () => {
    await seedForm();
    const { processFormSubmission } = await import("../../src/core/forms.js");
    const result = await processFormSubmission(DATA_DIR, "contact", {
      full_name: "Bot",
      work_email: "bot@spam.com",
      _hp: "filled-by-bot",
    });
    expect(result.status).toBe("spam_ignored");
    expect(mockEmitEvent).not.toHaveBeenCalled();
  });

  it("rate-limits repeated submissions from the same IP", async () => {
    await seedForm();
    const { processFormSubmission } = await import("../../src/core/forms.js");
    let last: string = "";
    for (let i = 0; i < 7; i++) {
      const r = await processFormSubmission(
        DATA_DIR,
        "contact",
        { work_email: `u${i}@acme.com`, full_name: `U${i}`, company: `C${i}` },
        { ip: "203.0.113.9" }
      );
      last = r.status;
    }
    expect(last).toBe("rate_limited");
  });

  it("rejects invalid email and empty submissions", async () => {
    await seedForm();
    const { processFormSubmission } = await import("../../src/core/forms.js");
    expect(
      (await processFormSubmission(DATA_DIR, "contact", { work_email: "not-an-email" })).status
    ).toBe("invalid");
    expect((await processFormSubmission(DATA_DIR, "contact", { other: "x" })).status).toBe(
      "invalid"
    );
  });

  it("double-opt-in defers lead creation until the signed token is confirmed", async () => {
    await seedForm({ doubleOptIn: true });
    const { processFormSubmission, verifyConfirmToken, createLead } =
      await import("../../src/core/forms.js");
    const result = await processFormSubmission(DATA_DIR, "contact", {
      full_name: "Jane",
      work_email: "jane@acme.com",
      company: "Acme Corp",
    });
    expect(result.status).toBe("pending_confirmation");
    expect(mockEmitEvent).not.toHaveBeenCalled(); // nothing created yet

    const payload = verifyConfirmToken(result.confirmToken!);
    expect(payload?.f).toBe("contact");
    await createLead(DATA_DIR, payload!.f, payload!.d);
    expect(mockEmitEvent).toHaveBeenCalledWith(DATA_DIR, "lead.captured", expect.anything());

    // tampered token is rejected
    expect(verifyConfirmToken(result.confirmToken!.slice(0, -2) + "00")).toBeNull();
  });

  it("renders an embeddable snippet with honeypot", async () => {
    const form = await seedForm();
    const { renderEmbedSnippet } = await import("../../src/core/forms.js");
    const html = renderEmbedSnippet(form, "https://crm.test");
    expect(html).toContain('action="https://crm.test/forms/contact"');
    expect(html).toContain('name="_hp"');
    expect(html).toContain('name="work_email"');
  });
});
