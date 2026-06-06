import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapCsvFieldsHeuristic } from "../../src/core/llm.js";

const mockMessagesCreate = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function () {
    return { messages: { create: mockMessagesCreate } };
  }),
}));

describe("mapCsvFieldsHeuristic (no-LLM fallback)", () => {
  it("maps exact lowercase matches", () => {
    const result = mapCsvFieldsHeuristic(
      ["name", "email", "domain", "phone"],
      ["name", "email", "domain", "phone", "industry"]
    );

    expect(result.name).toBe("name");
    expect(result.email).toBe("email");
    expect(result.domain).toBe("domain");
    expect(result.phone).toBe("phone");
    expect(result.industry).toBeNull();
  });

  it("maps common aliases (Company → name)", () => {
    const result = mapCsvFieldsHeuristic(
      ["Company", "Email Address", "Website", "Phone Number"],
      ["name", "email", "domain", "phone", "industry"]
    );

    expect(result.name).toBe("Company");
    expect(result.email).toBe("Email Address");
    expect(result.domain).toBe("Website");
    expect(result.phone).toBe("Phone Number");
  });

  it("maps HubSpot-style column names", () => {
    const result = mapCsvFieldsHeuristic(
      ["Company Name", "Email", "Company Domain Name", "Phone", "Industry"],
      ["name", "email", "domain", "phone", "industry"]
    );

    expect(result.name).toBe("Company Name");
    expect(result.email).toBe("Email");
    expect(result.domain).toBe("Company Domain Name");
    expect(result.industry).toBe("Industry");
  });

  it("maps Pipedrive-style column names", () => {
    const result = mapCsvFieldsHeuristic(
      ["Organization", "Email", "Website", "Phone", "Contact"],
      ["name", "email", "domain", "phone", "primary_contact"]
    );

    expect(result.name).toBe("Organization");
    expect(result.email).toBe("Email");
    expect(result.domain).toBe("Website");
    expect(result.phone).toBe("Phone");
    expect(result.primary_contact).toBe("Contact");
  });

  it("returns null for unmappable fields", () => {
    const result = mapCsvFieldsHeuristic(
      ["Company", "Email"],
      ["name", "email", "domain", "phone", "industry", "primary_contact"]
    );

    expect(result.domain).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.industry).toBeNull();
    expect(result.primary_contact).toBeNull();
  });

  it("is case-insensitive", () => {
    const result = mapCsvFieldsHeuristic(["NAME", "EMAIL", "DOMAIN"], ["name", "email", "domain"]);

    expect(result.name).toBe("NAME");
    expect(result.email).toBe("EMAIL");
    expect(result.domain).toBe("DOMAIN");
  });

  it("handles duplicate mappings by taking the first match", () => {
    const result = mapCsvFieldsHeuristic(["Company", "Company Name", "Email"], ["name", "email"]);

    // "Company" matches 'name' first, so it wins
    expect(result.name).toBeDefined();
    expect(result.email).toBe("Email");
  });
});

describe("mapCsvFields — LLM path", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env["ANTHROPIC_API_KEY"];
  });

  async function getMapCsvFields() {
    const mod = await import("../../src/core/llm.js");
    return mod.mapCsvFields;
  }

  it("falls back to heuristic when no API key is set", async () => {
    const mapCsvFields = await getMapCsvFields();
    const result = await mapCsvFields(
      ["Company Name", "Email", "Website"],
      ["name", "email", "domain"]
    );
    expect(result.name).toBe("Company Name");
    expect(result.email).toBe("Email");
    expect(result.domain).toBe("Website");
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it("returns LLM mapping when API key is set and response is valid JSON", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"name":"Company","email":"Email Address","domain":null}' }],
    });

    const mapCsvFields = await getMapCsvFields();
    const result = await mapCsvFields(
      ["Company", "Email Address", "Website"],
      ["name", "email", "domain"]
    );

    expect(result.name).toBe("Company");
    expect(result.email).toBe("Email Address");
    expect(result.domain).toBeNull();
    expect(mockMessagesCreate).toHaveBeenCalledOnce();
  });

  it("strips markdown code fences from LLM response", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    mockMessagesCreate.mockResolvedValueOnce({
      content: [
        { type: "text", text: '```json\n{"name":"Company","email":null,"domain":null}\n```' },
      ],
    });

    const mapCsvFields = await getMapCsvFields();
    const result = await mapCsvFields(["Company", "Phone"], ["name", "email", "domain"]);

    expect(result.name).toBe("Company");
  });

  it("falls back to heuristic on JSON parse error", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "not valid json at all" }],
    });

    const mapCsvFields = await getMapCsvFields();
    const result = await mapCsvFields(["name", "email"], ["name", "email"]);

    // Heuristic maps exact matches
    expect(result.name).toBe("name");
    expect(result.email).toBe("email");
  });

  it("falls back to heuristic when name is not mapped in LLM response", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"name":null,"email":"Email","domain":null}' }],
    });

    const mapCsvFields = await getMapCsvFields();
    // Heuristic should map "name" header to name
    const result = await mapCsvFields(["name", "Email"], ["name", "email", "domain"]);

    expect(result.name).toBe("name");
  });

  it("rejects hallucinated column names not present in headers", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"name":"Firma","email":"Ghost Column","domain":null}' }],
    });

    const mapCsvFields = await getMapCsvFields();
    // "Ghost Column" is not in headers — should be nullified
    const result = await mapCsvFields(["Firma", "Mail"], ["name", "email", "domain"]);

    expect(result.name).toBe("Firma");
    expect(result.email).toBeNull(); // hallucinated column rejected
  });

  it("uses cache_control ephemeral on the system prompt block", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"name":"Name","email":null,"domain":null}' }],
    });

    const mapCsvFields = await getMapCsvFields();
    await mapCsvFields(["Name"], ["name", "email", "domain"]);

    const callArgs = mockMessagesCreate.mock.calls[0]?.[0] as {
      system?: Array<{ cache_control?: { type: string } }>;
    };
    expect(callArgs?.system?.[0]?.cache_control?.type).toBe("ephemeral");
  });

  it("falls back to heuristic on API error", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    mockMessagesCreate.mockRejectedValueOnce(new Error("Network error"));

    const mapCsvFields = await getMapCsvFields();
    const result = await mapCsvFields(["name", "email"], ["name", "email"]);

    // Heuristic still maps exact matches
    expect(result.name).toBe("name");
    expect(result.email).toBe("email");
  });
});
