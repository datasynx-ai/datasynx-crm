// src/setup/framework-adapter.ts

export interface InstallConfig {
  mcpServerPath: string; // absolute path to dist/mcp.js
  dataDir: string; // CRM root (where customers/ lives)
  httpPort: number; // default: 3847
  serverName: string; // default: "datasynx-opencrm"
  httpUrl?: string; // team mode: full URL to shared HTTP server (overrides httpPort)
}

export interface InstallResult {
  framework: string;
  success: boolean;
  transport: "stdio" | "http";
  configPath: string;
  harnessFiles: string[]; // all written harness files
  notes?: string;
}

export interface FrameworkAdapter {
  readonly name: string;
  detect(): boolean; // sync, FS checks only
  install(config: InstallConfig): Promise<InstallResult>;
  uninstall(): Promise<void>;
  isInstalled(): boolean; // check if entry already in config
}
