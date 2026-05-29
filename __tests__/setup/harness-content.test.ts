import { describe, it, expect } from "vitest";
import {
  buildClaudeMd,
  buildAgentsMd,
  buildSoulMd,
  buildHermesSkillMd,
  buildAgySkillMd,
  buildAgyGeminiMd,
  buildGrokSettingsJson,
  buildCursorRulesMdc,
  TOOL_COUNT,
} from "../../src/setup/harness-content.js";

const DATA_DIR = "/home/user/crm";

// All 33 registered tool names — must appear in at least one harness output
const ALL_TOOLS = [
  "get_capabilities",
  "get_active_session",
  "get_customer_context",
  "search_customer_knowledge",
  "list_customers",
  "log_interaction",
  "update_deal",
  "export_customer",
  "update_customer_facts",
  "get_deal_health",
  "get_pipeline_forecast",
  "summarize_meeting",
  "get_pipeline_stages",
  "get_market_intelligence",
  "get_relationship_graph",
  "get_relationship_health",
  "run_deal_agent",
  "approve_agent_action",
  "simulate_revenue",
  "get_org_intelligence",
  "get_playbook",
  "create_playbook",
  "list_playbooks",
  "distill_playbook",
  "pursue_goal",
  "get_goal_status",
  "register_push_subscription",
  "get_push_status",
  "open_deal_room",
  "get_proactive_briefing",
] as const;

// v2-critical tools that must appear in CLAUDE.md (highest-value harness file)
const V2_CRITICAL_TOOLS = [
  "get_proactive_briefing",
  "open_deal_room",
  "pursue_goal",
  "run_deal_agent",
  "get_relationship_graph",
  "get_relationship_health",
  "simulate_revenue",
  "get_org_intelligence",
  "get_playbook",
  "distill_playbook",
  "get_goal_status",
];

describe("TOOL_COUNT", () => {
  it("exports correct tool count (33)", () => {
    expect(TOOL_COUNT).toBe(33);
  });
});

describe("buildClaudeMd", () => {
  const content = buildClaudeMd(DATA_DIR);

  it("mentions correct tool count", () => {
    expect(content).toContain("33");
  });

  it("includes the data directory", () => {
    expect(content).toContain(DATA_DIR);
  });

  it("contains all v2-critical tools", () => {
    for (const tool of V2_CRITICAL_TOOLS) {
      expect(content, `CLAUDE.md missing tool: ${tool}`).toContain(tool);
    }
  });

  it("contains all 33 tools", () => {
    for (const tool of ALL_TOOLS) {
      expect(content, `CLAUDE.md missing: ${tool}`).toContain(tool);
    }
  });

  it("includes proactive session-start instruction", () => {
    expect(content).toContain("get_proactive_briefing");
    // Must be in the 'session start' / proactive section, not just the tool list
    expect(content.toLowerCase()).toMatch(/proactive|session start|without being asked/i);
  });

  it("includes open_deal_room as preferred deal-conversation tool", () => {
    expect(content).toContain("open_deal_room");
    // Should appear before get_customer_context in context of deals
    const dealIdx = content.indexOf("open_deal_room");
    expect(dealIdx).toBeGreaterThan(-1);
  });

  it("mentions run_deal_agent with autonomy levels", () => {
    expect(content).toContain("run_deal_agent");
    expect(content).toMatch(/observe|suggest|act/i);
  });

  it("is a non-empty string", () => {
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(500);
  });
});

describe("buildAgentsMd", () => {
  const content = buildAgentsMd(DATA_DIR);

  it("mentions correct tool count", () => {
    expect(content).toContain("33");
  });

  it("includes the data directory", () => {
    expect(content).toContain(DATA_DIR);
  });

  it("contains all v2-critical tools", () => {
    for (const tool of V2_CRITICAL_TOOLS) {
      expect(content, `AGENTS.md missing: ${tool}`).toContain(tool);
    }
  });

  it("includes proactive session-start instruction", () => {
    expect(content).toContain("get_proactive_briefing");
    expect(content.toLowerCase()).toMatch(/session start|proactive/i);
  });

  it("includes open_deal_room", () => {
    expect(content).toContain("open_deal_room");
  });
});

describe("buildSoulMd", () => {
  it("openclaw variant contains proactive behavior", () => {
    const content = buildSoulMd("openclaw");
    expect(content).toContain("get_proactive_briefing");
    expect(content.toLowerCase()).toMatch(/proactive/i);
  });

  it("hermes variant contains proactive behavior", () => {
    const content = buildSoulMd("hermes");
    expect(content).toContain("get_proactive_briefing");
  });

  it("mentions open_deal_room", () => {
    const content = buildSoulMd("openclaw");
    expect(content).toContain("open_deal_room");
  });

  it("mentions approve_agent_action for human oversight", () => {
    const content = buildSoulMd("openclaw");
    expect(content).toContain("approve_agent_action");
  });

  it("openclaw variant identifies framework", () => {
    const content = buildSoulMd("openclaw");
    expect(content.toLowerCase()).toContain("openclaw");
  });

  it("hermes variant identifies framework", () => {
    const content = buildSoulMd("hermes");
    expect(content.toLowerCase()).toContain("hermes");
  });
});

describe("buildHermesSkillMd", () => {
  const content = buildHermesSkillMd();

  it("includes YAML frontmatter with version 2.0.0", () => {
    expect(content).toContain("version: 2.0.0");
  });

  it("includes proactive briefing trigger", () => {
    expect(content).toContain("get_proactive_briefing");
  });

  it("includes open_deal_room", () => {
    expect(content).toContain("open_deal_room");
  });

  it("includes run_deal_agent", () => {
    expect(content).toContain("run_deal_agent");
  });

  it("includes pursue_goal", () => {
    expect(content).toContain("pursue_goal");
  });

  it("includes briefing trigger keyword in YAML", () => {
    expect(content).toContain("briefing");
  });
});

describe("buildAgySkillMd", () => {
  const content = buildAgySkillMd();

  it("includes YAML frontmatter with version 2.0.0", () => {
    expect(content).toContain("version: 2.0.0");
  });

  it("includes get_proactive_briefing", () => {
    expect(content).toContain("get_proactive_briefing");
  });

  it("includes open_deal_room", () => {
    expect(content).toContain("open_deal_room");
  });

  it("includes run_deal_agent", () => {
    expect(content).toContain("run_deal_agent");
  });

  it("includes pursue_goal", () => {
    expect(content).toContain("pursue_goal");
  });
});

describe("buildAgyGeminiMd — token budget (max 50 lines)", () => {
  const content = buildAgyGeminiMd(DATA_DIR);
  const lineCount = content.split("\n").length;

  it("stays within 50-line budget", () => {
    expect(lineCount).toBeLessThanOrEqual(50);
  });

  it("mentions correct tool count", () => {
    expect(content).toContain("33");
  });

  it("includes the data directory", () => {
    expect(content).toContain(DATA_DIR);
  });

  it("includes get_proactive_briefing", () => {
    expect(content).toContain("get_proactive_briefing");
  });

  it("includes open_deal_room", () => {
    expect(content).toContain("open_deal_room");
  });

  it("all 30 tools appear (may be in compact list)", () => {
    for (const tool of ALL_TOOLS) {
      expect(content, `GEMINI.md missing: ${tool}`).toContain(tool);
    }
  });
});

describe("buildGrokSettingsJson", () => {
  const config = {
    serverName: "datasynx-opencrm",
    mcpServerPath: "/usr/local/lib/mcp.js",
    dataDir: DATA_DIR,
  };
  const content = buildGrokSettingsJson(config);

  it("returns valid JSON", () => {
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it("includes mcpServers array", () => {
    const parsed = JSON.parse(content) as { mcpServers: unknown[] };
    expect(Array.isArray(parsed.mcpServers)).toBe(true);
    expect(parsed.mcpServers.length).toBe(1);
  });

  it("includes server name", () => {
    expect(content).toContain("datasynx-opencrm");
  });

  it("includes mcp server path", () => {
    expect(content).toContain(config.mcpServerPath);
  });

  it("includes data dir in env", () => {
    expect(content).toContain(DATA_DIR);
  });
});

describe("buildCursorRulesMdc", () => {
  const content = buildCursorRulesMdc(DATA_DIR);

  it("has MDC frontmatter with alwaysApply: true", () => {
    expect(content).toContain("alwaysApply: true");
  });

  it("mentions correct tool count", () => {
    expect(content).toContain("33");
  });

  it("includes all v2-critical tools", () => {
    for (const tool of V2_CRITICAL_TOOLS) {
      expect(content, `cursor rules missing: ${tool}`).toContain(tool);
    }
  });

  it("includes get_proactive_briefing in session start rule", () => {
    expect(content).toContain("get_proactive_briefing");
    expect(content.toLowerCase()).toMatch(/session start/i);
  });

  it("includes open_deal_room", () => {
    expect(content).toContain("open_deal_room");
  });

  it("includes data directory", () => {
    expect(content).toContain(DATA_DIR);
  });
});

describe("All tools coverage across harness files", () => {
  it("every tool name appears in at least one harness function", () => {
    const allContent = [
      buildClaudeMd(DATA_DIR),
      buildAgentsMd(DATA_DIR),
      buildSoulMd("openclaw"),
      buildHermesSkillMd(),
      buildAgySkillMd(),
      buildAgyGeminiMd(DATA_DIR),
      buildCursorRulesMdc(DATA_DIR),
    ].join("\n");

    for (const tool of ALL_TOOLS) {
      expect(allContent, `No harness file mentions tool: ${tool}`).toContain(tool);
    }
  });

  it("v2 autonomy pattern appears in CLAUDE.md (approve_agent_action)", () => {
    const claudeMd = buildClaudeMd(DATA_DIR);
    expect(claudeMd).toContain("approve_agent_action");
  });
});
