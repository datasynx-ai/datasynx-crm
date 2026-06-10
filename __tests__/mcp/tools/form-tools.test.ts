import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";

const DATA_DIR = "/data";

beforeEach(() => {
  vol.reset();
  vol.mkdirSync(`${DATA_DIR}/.agentic`, { recursive: true });
});

function parse(res: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(res.content[0]!.text) as Record<string, unknown>;
}

describe("create_form / list_forms (#60, #69)", () => {
  it("creates a form and returns the embeddable snippet", async () => {
    const { handleCreateForm, handleListForms } =
      await import("../../../src/mcp/tools/form-tools.js");
    const created = parse(
      await handleCreateForm(
        { id: "contact", name: "Contact us", fields: { work_email: "email", name: "name" } },
        DATA_DIR
      )
    );
    expect(created["success"]).toBe(true);
    expect(String(created["embedSnippet"])).toContain("/forms/contact");

    const listed = parse(await handleListForms({}, DATA_DIR));
    expect(listed["count"]).toBe(1);
    expect((listed["forms"] as Array<{ id: string }>)[0]!.id).toBe("contact");
  });

  it("passes doubleOptIn and redirectUrl through", async () => {
    const { handleCreateForm } = await import("../../../src/mcp/tools/form-tools.js");
    const created = parse(
      await handleCreateForm(
        {
          id: "doi",
          name: "DOI",
          fields: { email: "email" },
          doubleOptIn: true,
          redirectUrl: "https://example.com/thanks",
        },
        DATA_DIR
      )
    );
    expect(created["form"]).toMatchObject({
      doubleOptIn: true,
      redirectUrl: "https://example.com/thanks",
    });
  });

  it("reports validation errors as { success: false }", async () => {
    const { handleCreateForm } = await import("../../../src/mcp/tools/form-tools.js");
    const res = parse(await handleCreateForm({ id: "BAD ID!", name: "x", fields: {} }, DATA_DIR));
    expect(res["success"]).toBe(false);
    expect(res["error"]).toBeTruthy();
  });
});
