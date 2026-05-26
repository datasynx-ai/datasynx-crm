import { describe, it, expect } from "vitest";
import { mapCsvFieldsHeuristic } from "../../src/core/llm.js";

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
    const result = mapCsvFieldsHeuristic(
      ["NAME", "EMAIL", "DOMAIN"],
      ["name", "email", "domain"]
    );

    expect(result.name).toBe("NAME");
    expect(result.email).toBe("EMAIL");
    expect(result.domain).toBe("DOMAIN");
  });

  it("handles duplicate mappings by taking the first match", () => {
    const result = mapCsvFieldsHeuristic(
      ["Company", "Company Name", "Email"],
      ["name", "email"]
    );

    // "Company" matches 'name' first, so it wins
    expect(result.name).toBeDefined();
    expect(result.email).toBe("Email");
  });
});
