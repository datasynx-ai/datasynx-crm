export interface DxcrmPlugin {
  name: string;
  version: string;
  description?: string;
  onInstall?(): Promise<void>;
  onUninstall?(): Promise<void>;
  mcpTools?: string[]; // names of MCP tools this plugin registers
}

const _plugins = new Map<string, DxcrmPlugin>();

export function registerPlugin(plugin: DxcrmPlugin): void {
  if (_plugins.has(plugin.name)) {
    throw new Error(`Plugin '${plugin.name}' is already registered`);
  }
  _plugins.set(plugin.name, plugin);
}

export function getPlugin(name: string): DxcrmPlugin | undefined {
  return _plugins.get(name);
}

export function listPlugins(): DxcrmPlugin[] {
  return Array.from(_plugins.values());
}

export function unregisterPlugin(name: string): boolean {
  return _plugins.delete(name);
}
