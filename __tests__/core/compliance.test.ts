import { describe, it, expect, afterEach } from "vitest";
import {
  aiDisclosure,
  aiDisclosureEnabled,
  labelAiContent,
  llmProvider,
  localLlmConfig,
  complianceConfig,
} from "../../src/core/compliance.js";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe("AI-Act Art. 50 disclosure", () => {
  it("returns a localized disclosure", () => {
    expect(aiDisclosure("de").toLowerCase()).toMatch(/ki|künstlich/);
    expect(aiDisclosure("en").toLowerCase()).toMatch(/ai|generated/);
  });

  it("is on by default and can be turned off", () => {
    delete process.env["DXCRM_AI_DISCLOSURE"];
    expect(aiDisclosureEnabled()).toBe(true);
    process.env["DXCRM_AI_DISCLOSURE"] = "off";
    expect(aiDisclosureEnabled()).toBe(false);
  });

  it("labels generated content when enabled and leaves it untouched when off", () => {
    delete process.env["DXCRM_AI_DISCLOSURE"];
    const labeled = labelAiContent("Hello", { lang: "en" });
    expect(labeled).toContain("Hello");
    expect(labeled.toLowerCase()).toMatch(/ai/);

    process.env["DXCRM_AI_DISCLOSURE"] = "off";
    expect(labelAiContent("Hello")).toBe("Hello");
  });
});

describe("provider-agnostic LLM (local-LLM option)", () => {
  it("defaults to anthropic and reads the provider env", () => {
    delete process.env["DXCRM_LLM_PROVIDER"];
    expect(llmProvider()).toBe("anthropic");
    process.env["DXCRM_LLM_PROVIDER"] = "ollama";
    expect(llmProvider()).toBe("ollama");
  });

  it("provides sensible local defaults overridable via env", () => {
    delete process.env["DXCRM_LLM_BASE_URL"];
    delete process.env["DXCRM_LLM_MODEL"];
    const def = localLlmConfig();
    expect(def.baseUrl).toContain("11434"); // ollama default port
    expect(def.model.length).toBeGreaterThan(0);

    process.env["DXCRM_LLM_BASE_URL"] = "http://host:1234/v1";
    process.env["DXCRM_LLM_MODEL"] = "llama3.1";
    const custom = localLlmConfig();
    expect(custom.baseUrl).toBe("http://host:1234/v1");
    expect(custom.model).toBe("llama3.1");
  });

  it("summarizes the compliance posture", () => {
    const cfg = complianceConfig();
    expect(cfg).toHaveProperty("provider");
    expect(cfg).toHaveProperty("aiDisclosure");
    expect(cfg).toHaveProperty("piiMasking");
    expect(cfg).toHaveProperty("guardrails");
  });
});
