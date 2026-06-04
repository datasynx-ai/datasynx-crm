// src/setup/adapters/claude-code.ts
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "../framework-adapter.js";
import { buildClaudeMd, TOOL_COUNT } from "../harness-content.js";

const HOME = os.homedir();
const CLAUDE_JSON = path.join(HOME, ".claude.json");
const CLAUDE_DIR = path.join(HOME, ".claude");

export class ClaudeCodeAdapter implements FrameworkAdapter {
  readonly name = "Claude Code";

  detect(): boolean {
    try {
      execSync("which claude", { stdio: "ignore" });
      return true;
    } catch {}
    return fs.existsSync(CLAUDE_JSON) || fs.existsSync(CLAUDE_DIR);
  }

  isInstalled(): boolean {
    if (!fs.existsSync(CLAUDE_JSON)) return false;
    try {
      const json = JSON.parse(fs.readFileSync(CLAUDE_JSON, "utf-8")) as Record<string, unknown>;
      const servers = json["mcpServers"] as Record<string, unknown> | undefined;
      return !!servers?.["datasynx-opencrm"];
    } catch {
      return false;
    }
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    const harnessFiles: string[] = [];

    // 1. MCP server in ~/.claude.json (user scope)
    this.writeMcpConfig(config);

    // 2. Global ~/.claude/settings.json
    this.writeGlobalSettings();

    // 3. CLAUDE.md in CRM data directory
    const claudeMdPath = path.join(config.dataDir, "CLAUDE.md");
    fs.writeFileSync(claudeMdPath, buildClaudeMd(config.dataDir));
    harnessFiles.push(claudeMdPath);

    // 4. Project-scope .claude/settings.json in dataDir
    const projectSettingsDir = path.join(config.dataDir, ".claude");
    fs.mkdirSync(projectSettingsDir, { recursive: true });
    const allow = [
      "mcp__datasynx-opencrm__get_capabilities",
      "mcp__datasynx-opencrm__get_active_session",
      "mcp__datasynx-opencrm__get_customer_context",
      "mcp__datasynx-opencrm__search_customer_knowledge",
      "mcp__datasynx-opencrm__list_customers",
      "mcp__datasynx-opencrm__log_interaction",
      "mcp__datasynx-opencrm__update_deal",
      "mcp__datasynx-opencrm__export_customer",
    ];
    const projectSettings = { permissions: { allow } };
    const settingsPath = path.join(projectSettingsDir, "settings.json");
    fs.writeFileSync(settingsPath, JSON.stringify(projectSettings, null, 2));
    harnessFiles.push(settingsPath);

    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: CLAUDE_JSON,
      harnessFiles,
      notes: `${allow.length} of ${TOOL_COUNT} MCP tools pre-allowed (common read/write); CLAUDE.md written to CRM root.`,
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(CLAUDE_JSON)) return;
    try {
      const json = JSON.parse(fs.readFileSync(CLAUDE_JSON, "utf-8")) as Record<string, unknown>;
      const servers = json["mcpServers"] as Record<string, unknown> | undefined;
      if (servers) {
        delete servers["datasynx-opencrm"];
      }
      fs.writeFileSync(CLAUDE_JSON, JSON.stringify(json, null, 2));
    } catch {}
  }

  private writeMcpConfig(config: InstallConfig): void {
    let json: Record<string, unknown> = {};
    if (fs.existsSync(CLAUDE_JSON)) {
      try {
        json = JSON.parse(fs.readFileSync(CLAUDE_JSON, "utf-8")) as Record<string, unknown>;
      } catch {}
    }
    if (!json["mcpServers"]) json["mcpServers"] = {};
    (json["mcpServers"] as Record<string, unknown>)[config.serverName] = {
      type: "stdio",
      command: process.execPath,
      args: [config.mcpServerPath],
      env: { DXCRM_DATA_DIR: config.dataDir },
    };
    // Ensure parent directory exists (memfs requires this)
    fs.mkdirSync(path.dirname(CLAUDE_JSON), { recursive: true });
    fs.writeFileSync(CLAUDE_JSON, JSON.stringify(json, null, 2));
  }

  private writeGlobalSettings(): void {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    const settingsPath = path.join(CLAUDE_DIR, "settings.json");
    let settings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
      } catch {}
    }
    if (!settings["permissions"]) settings["permissions"] = {};
    const perms = settings["permissions"] as Record<string, unknown>;
    if (!perms["allow"]) perms["allow"] = [];
    const allow = perms["allow"] as string[];
    const wildcard = "mcp__datasynx-opencrm__*";
    if (!allow.includes(wildcard)) {
      allow.push(wildcard);
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }
}
