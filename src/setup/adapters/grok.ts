// src/setup/adapters/grok.ts
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "../framework-adapter.js";
import { buildAgentsMd, buildGrokSettingsJson } from "../harness-content.js";

const HOME = os.homedir();
const GROK_DIR = path.join(HOME, ".grok");
const GROK_USER_SETTINGS = path.join(GROK_DIR, "user-settings.json");

interface GrokMcpEntry {
  name: string;
  transport: {
    type: "stdio" | "http";
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  };
}

interface GrokSettings {
  mcpServers?: GrokMcpEntry[];
  [key: string]: unknown;
}

export class GrokAdapter implements FrameworkAdapter {
  readonly name = "Grok Build";

  detect(): boolean {
    try {
      execSync("which grok", { stdio: "ignore" });
      return true;
    } catch {}
    return fs.existsSync(GROK_DIR);
  }

  isInstalled(): boolean {
    if (!fs.existsSync(GROK_USER_SETTINGS)) return false;
    try {
      const settings = JSON.parse(fs.readFileSync(GROK_USER_SETTINGS, "utf-8")) as GrokSettings;
      return (settings.mcpServers ?? []).some((s) => s.name === "datasynx-opencrm");
    } catch {
      return false;
    }
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    fs.mkdirSync(GROK_DIR, { recursive: true });
    const harnessFiles: string[] = [];

    // 1. User-level MCP config: ~/.grok/user-settings.json
    // Grok uses an array format (not object/map like Claude Desktop)
    if (!this.isInstalled()) {
      let settings: GrokSettings = {};
      if (fs.existsSync(GROK_USER_SETTINGS)) {
        try {
          settings = JSON.parse(fs.readFileSync(GROK_USER_SETTINGS, "utf-8")) as GrokSettings;
        } catch {}
      }
      if (!settings.mcpServers) settings.mcpServers = [];
      settings.mcpServers.push({
        name: config.serverName,
        transport: {
          type: "stdio",
          command: process.execPath,
          args: [config.mcpServerPath],
          env: { DXCRM_DATA_DIR: config.dataDir },
        },
      });
      fs.writeFileSync(GROK_USER_SETTINGS, JSON.stringify(settings, null, 2));
    }

    // 2. Project-level .grok/settings.json in dataDir
    // Allows project-scoped MCP registration (useful in team repos)
    const grokProjectDir = path.join(config.dataDir, ".grok");
    fs.mkdirSync(grokProjectDir, { recursive: true });
    const projectSettings = path.join(grokProjectDir, "settings.json");
    fs.writeFileSync(projectSettings, buildGrokSettingsJson(config));
    harnessFiles.push(projectSettings);

    // 3. AGENTS.md — Grok Build reads this natively (same as Codex)
    // Also reads CLAUDE.md but AGENTS.md is the cross-vendor standard
    const agentsPath = path.join(config.dataDir, "AGENTS.md");
    if (!fs.existsSync(agentsPath)) {
      fs.writeFileSync(agentsPath, buildAgentsMd(config.dataDir));
      harnessFiles.push(agentsPath);
    } else {
      const existing = fs.readFileSync(agentsPath, "utf-8");
      if (!existing.includes("DatasynxOpenCRM")) {
        fs.appendFileSync(agentsPath, "\n\n---\n\n" + buildAgentsMd(config.dataDir));
        harnessFiles.push(agentsPath + " (appended)");
      }
    }

    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: GROK_USER_SETTINGS,
      harnessFiles,
      notes:
        "MCP registered in ~/.grok/user-settings.json (array format). " +
        "Project config written to .grok/settings.json. " +
        "AGENTS.md written — Grok Build reads it natively alongside CLAUDE.md.",
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(GROK_USER_SETTINGS)) return;
    try {
      const settings = JSON.parse(fs.readFileSync(GROK_USER_SETTINGS, "utf-8")) as GrokSettings;
      if (settings.mcpServers) {
        settings.mcpServers = settings.mcpServers.filter((s) => s.name !== "datasynx-opencrm");
      }
      fs.writeFileSync(GROK_USER_SETTINGS, JSON.stringify(settings, null, 2));
    } catch {}
  }
}
