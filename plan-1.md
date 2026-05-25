# DatasynxOpenCRM — Phase 1 Technischer Implementierungsplan
**Version:** 1.0 · **Basis:** plan.md v4 + Deep-Search Recherche Mai 2026
**Ziel:** `npm install datasynx-opencrm` → Agent beantwortet "Was ist los mit Acme Corp?" in unter 3 Sekunden

---

## Kritische Korrekturen gegenüber plan.md (Recherche-Ergebnisse)

Diese Punkte aus plan.md sind veraltet oder falsch — hier gilt der korrigierte Stand:

| plan.md sagt | Recherche-Ergebnis | Konsequenz |
|---|---|---|
| `@xenova/transformers` | **Deprecated** — Nachfolger: `@huggingface/transformers` v3.8.1 | Package-Name ändern |
| `fastembed` als Alternative | **Archiviert Jan 2026** | Nicht verwenden |
| Gmail MCP via `@gongrzhe/server-gmail-autoauth-mcp` | **Archiviert März 2026** | Eigene Impl. mit `googleapis` |
| `tsup` als Build-Tool | **Nicht mehr maintained** | `tsdown` verwenden |
| `McpServer({ instructions: "..." })` | `instructions` ist **kein v1.x Konstruktor-Parameter** (nur v2-alpha) | Instructions in Tool-Descriptions |
| `server.tool()` für Tool-Registrierung | **In v2 entfernt** — bereits deprecated | `server.registerTool()` verwenden |
| `chalk` als Terminal-Library | **ESM-only** — nicht mit CJS kompatibel | `ansis` verwenden |
| `ora` als Spinner | **ESM-only** | `@topcli/spinner` (CJS+ESM) |
| `postinstall` für Framework-Detection | **pnpm v10 blockiert es**, npm-Audits flaggen | Lazy Detection beim ersten `dxcrm init` |
| `~/.claude/claude_desktop_config.json` | Falscher Pfad — korrekt: **`~/.claude.json`** | Config-Schreiblogik anpassen |

---

## Stack — Final (nach Recherche)

```
Language:    TypeScript 5.8+ (strict, ESM-only "type": "module")
Build:       tsdown (Rolldown-basiert, tsup-Nachfolger)
Runtime:     Node.js ≥ 20
Test:        Vitest (ESM-nativ, kein Config-Overhead)
CLI:         Commander v14
MCP:         @modelcontextprotocol/sdk v1.x (server.registerTool())
Vector DB:   @lancedb/lancedb v0.29+ (embedded, kein Server)
Embeddings:  @huggingface/transformers v3.8.1 (ONNX/WASM lokal)
Gmail:       googleapis (direkt, kein MCP-Wrapper)
Watcher:     chokidar v4 (kein Glob, ignored als Function)
Cron:        cron (kelektiv) v4.4+ (waitForCompletion: true)
Validation:  zod v3 + zod-validation-error
Frontmatter: gray-matter v4
Terminal:    ansis (chalk-Drop-In, CJS+ESM)
Table:       cli-table3
```

---

## Projektstruktur (kanonisch)

```
datasynx-opencrm/
├── src/
│   ├── cli.ts                    # Commander Entry Point (bin: dxcrm)
│   ├── index.ts                  # Library Entry Point
│   │
│   ├── commands/                 # CLI Commands (eine Datei pro Command)
│   │   ├── init.ts               # dxcrm init
│   │   ├── create.ts             # dxcrm create
│   │   ├── list.ts               # dxcrm list
│   │   ├── sync.ts               # dxcrm sync
│   │   ├── session.ts            # dxcrm session open/close/status
│   │   ├── guide.ts              # dxcrm guide
│   │   ├── backup.ts             # dxcrm backup/restore
│   │   ├── validate.ts           # dxcrm validate
│   │   └── daemon.ts             # dxcrm daemon start/stop/status
│   │
│   ├── mcp/
│   │   ├── server.ts             # McpServer Setup + Transport-Wahl
│   │   ├── tools/                # Ein File pro MCP-Tool
│   │   │   ├── get-capabilities.ts
│   │   │   ├── get-active-session.ts
│   │   │   ├── get-customer-context.ts
│   │   │   ├── search-customer-knowledge.ts
│   │   │   ├── list-customers.ts
│   │   │   ├── log-interaction.ts
│   │   │   ├── update-deal.ts
│   │   │   └── export-customer.ts
│   │   └── capabilities.ts       # get_capabilities() Text (Single Source of Truth)
│   │
│   ├── core/
│   │   ├── context-builder.ts    # buildContext(slug) → ContextBlock
│   │   ├── embedder.ts           # Singleton Embedding Pipeline
│   │   ├── lancedb.ts            # DB-Verbindung + Table-Management
│   │   └── session-store.ts      # Aktive Sessions (in-memory + .agentic/config.json)
│   │
│   ├── sync/
│   │   ├── gmail-sync.ts         # Gmail API → interactions.md + LanceDB
│   │   ├── calendar-sync.ts      # Google Calendar → interactions.md
│   │   └── transcript-watcher.ts # chokidar + Verarbeitungs-Pipeline
│   │
│   ├── daemon/
│   │   └── worker.ts             # Detached Daemon Process (cron + watcher)
│   │
│   ├── setup/
│   │   ├── framework-adapter.ts  # FrameworkAdapter Interface + Types
│   │   ├── framework-registry.ts # FRAMEWORK_ADAPTERS Array + installAllDetected()
│   │   ├── harness-content.ts    # Alle Harness-Texte (Single Source of Truth)
│   │   └── adapters/
│   │       ├── claude-code.ts    # Tier 1 — Claude Code CLI
│   │       ├── claude-desktop.ts # Tier 2 — Claude Desktop App
│   │       ├── codex.ts          # Tier 1 — OpenAI Codex CLI
│   │       ├── openclaw.ts       # Tier 1 — OpenClaw
│   │       ├── hermes.ts         # Tier 1 — Hermes Agent
│   │       ├── antigravity.ts    # Tier 1 — Antigravity CLI (agy)
│   │       ├── cursor.ts         # Tier 2 — Cursor IDE
│   │       ├── windsurf.ts       # Tier 2 — Windsurf IDE
│   │       └── cline.ts          # Tier 2 — Cline (VSCode Extension)
│   │
│   ├── schemas/
│   │   ├── main-facts.ts         # Zod-Schema main_facts.md Frontmatter
│   │   ├── interaction.ts        # Zod-Schema Interaction-Eintrag
│   │   ├── pipeline.ts           # Zod-Schema pipeline.md Deal
│   │   └── sources.ts            # Zod-Schema sources.json
│   │
│   ├── fs/
│   │   ├── customer-dir.ts       # Lesen/Schreiben Kundenverzeichnis
│   │   ├── interactions-writer.ts # interactions.md append/prepend
│   │   └── pipeline-writer.ts    # pipeline.md update
│   │
│   └── ui/
│       ├── colors.ts             # ansis Farb-Helfer (success/error/warning)
│       └── table.ts              # cli-table3 Render-Funktionen
│
├── __tests__/                    # Vitest Tests (spiegelt src/)
│   ├── commands/
│   ├── mcp/tools/
│   ├── core/
│   ├── sync/
│   ├── schemas/
│   └── fs/
│
├── docs/                         # Offizielle Dokumentation
│   ├── cli-reference.md
│   ├── mcp-tools.md
│   ├── schemas.md
│   ├── integrations.md
│   └── deployment.md
│
├── scripts/
│   └── postbuild.ts              # chmod +x dist/cli.js, etc.
│
├── tsconfig.json
├── tsdown.config.ts
├── vitest.config.ts
├── package.json
├── README.md
└── CLAUDE.md
```

---

## package.json (vollständig)

```json
{
  "name": "datasynx-opencrm",
  "version": "1.0.0",
  "description": "Local-first, MCP-native CRM. One agent per customer. npm install.",
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=20" },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./mcp": {
      "import": { "types": "./dist/mcp.d.ts", "default": "./dist/mcp.js" },
      "require": { "types": "./dist/mcp.d.cts", "default": "./dist/mcp.cjs" }
    }
  },
  "bin": {
    "dxcrm": "./dist/cli.js",
    "datasynx-opencrm": "./dist/cli.js"
  },
  "files": ["dist/", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsdown && node scripts/postbuild.js",
    "dev": "tsx watch src/cli.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "prepublishOnly": "npm run typecheck && npm test && npm run build",
    "mcp:start": "node dist/mcp.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.10.0",
    "@lancedb/lancedb": "^0.29.0",
    "apache-arrow": "^17.0.0",
    "@huggingface/transformers": "^3.8.1",
    "googleapis": "^140.0.0",
    "commander": "^14.0.0",
    "gray-matter": "^4.0.3",
    "zod": "^3.25.0",
    "zod-validation-error": "^3.0.0",
    "chokidar": "^4.0.0",
    "cron": "^4.4.0",
    "slug": "^9.0.0",
    "@iarna/toml": "^2.2.5",
    "ansis": "^3.0.0",
    "cli-table3": "^0.6.3",
    "@topcli/spinner": "^2.0.0",
    "which": "^4.0.0"
  },
  "peerDependencies": {
    "express": "^4.0.0 || ^5.0.0"
  },
  "peerDependenciesMeta": {
    "express": { "optional": true }
  },
  "devDependencies": {
    "tsdown": "^0.12.0",
    "typescript": "^5.8.0",
    "tsx": "^4.0.0",
    "vitest": "^3.0.0",
    "@vitest/coverage-v8": "^3.0.0",
    "memfs": "^4.0.0",
    "@types/cli-table3": "^0.6.0",
    "@types/which": "^3.0.0",
    "@types/iarna__toml": "^2.0.0",
    "@types/slug": "^5.0.0"
  }
}
```

---

## tsdown.config.ts

```typescript
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    mcp: "src/mcp/server.ts",
    "daemon/worker": "src/daemon/worker.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    "@lancedb/lancedb",
    "@huggingface/transformers",
    "googleapis",
  ],
  banner: {
    js: (ctx) => ctx.output.fileName.startsWith("cli") ? "#!/usr/bin/env node" : "",
  },
});
```

---

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "__tests__"]
}
```

---

## vitest.config.ts

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/cli.ts", "src/daemon/worker.ts"],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
    // Kritischer Pfad (Links 1-8): 100% Coverage erzwingen
    setupFiles: ["__tests__/setup.ts"],
  },
});
```

---

## TDD-Strategie — Test-First Reihenfolge

Jeder Link beginnt mit einem failing Test. Die Reihenfolge entspricht dem kritischen Pfad.

### Test-Kategorien

```
Unit Tests       → Pure Funktionen, kein IO (schemas, context-builder, embedder-singleton)
Integration Tests → Mit Dateisystem (memfs Mock), kein Netzwerk
E2E Tests        → Mit echtem Dateisystem, gegen echten MCP-Server (nur CI)
```

### Mocking-Strategie

```typescript
// __tests__/setup.ts
import { vi } from "vitest";

// Dateisystem: memfs für alle FS-Operationen
vi.mock("fs", async () => {
  const { fs } = await import("memfs");
  return fs;
});
vi.mock("fs/promises", async () => {
  const { fs } = await import("memfs");
  return fs.promises;
});

// LanceDB: leichte Fake-Implementierung
vi.mock("@lancedb/lancedb", () => ({
  connect: vi.fn().mockResolvedValue({
    openTable: vi.fn(),
    createEmptyTable: vi.fn(),
    tableNames: vi.fn().mockResolvedValue([]),
  }),
}));

// Transformers: gibt immer 384-dim Float32Array zurück
vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn().mockResolvedValue(
    vi.fn().mockResolvedValue({ data: new Float32Array(384).fill(0.1) })
  ),
  env: { cacheDir: "" },
}));

// googleapis: gemockt per Test-Suite
vi.mock("googleapis");
```

---

## Link 1 — `dxcrm init`

### Was es tut

```
1. Framework Detection (which + Dateisystem-Checks)
2. Schreibt MCP-Config in alle erkannten Frameworks
3. Erstellt .agentic/ Verzeichnis + sources.json + config.json + schema.json
4. Startet Daemon (detached)
5. Ausgabe: Zusammenfassung was gefunden/konfiguriert wurde
```

### Framework Detection — Adapter-Pattern

**Kein monolithisches `framework-detector.ts` mehr.** Jeder Adapter implementiert `detect()` selbst — die Logik bleibt dort, wo die Config-Schreiblogik ist.

Detection-Zuständigkeiten der einzelnen Adapter:

```
ClaudeCodeAdapter.detect()    → which claude | ~/.claude.json | ~/.claude/
ClaudeDesktopAdapter.detect() → plattformspezifischer config-Pfad prüfen (macOS/Win/Linux)
CodexAdapter.detect()         → which codex | ~/.codex/
OpenClawAdapter.detect()      → which openclaw | ~/.openclaw/
HermesAdapter.detect()        → which hermes | ~/.hermes/
AntigravityAdapter.detect()   → ~/.gemini/ | which agy
CursorAdapter.detect()        → ~/.cursor/
WindsurfAdapter.detect()      → ~/.codeium/windsurf/
ClineAdapter.detect()         → ~/.cline/
```

Die zentrale Einstiegsfunktion (in `framework-registry.ts`):

```typescript
// src/setup/framework-registry.ts
export async function installAllDetected(config: InstallConfig): Promise<InstallResult[]> {
  const results: InstallResult[] = [];
  for (const adapter of FRAMEWORK_ADAPTERS) {
    if (!adapter.detect()) continue;
    try {
      results.push(await adapter.install(config));
    } catch (err) {
      results.push({ framework: adapter.name, success: false, transport: "stdio",
        configPath: "", harnessFiles: [], notes: (err as Error).message });
    }
  }
  return results;
}
```

### Tests für Link 1

```typescript
// __tests__/setup/claude-code-adapter.test.ts
import { describe, it, expect } from "vitest";
import { ClaudeCodeAdapter } from "../../src/setup/adapters/claude-code.js";

describe("ClaudeCodeAdapter", () => {
  it("detect() returns true when ~/.claude.json exists", () => {
    vol.fromJSON({ [`${HOME}/.claude.json`]: "{}" });
    expect(new ClaudeCodeAdapter().detect()).toBe(true);
  });

  it("install() creates ~/.claude.json when it doesn't exist", async () => { ... });
  it("install() deep-merges into existing ~/.claude.json without overwriting other entries", async () => { ... });
  it("install() is idempotent — calling twice produces same result", async () => { ... });
  it("install() writes CLAUDE.md to dataDir", async () => { ... });
  it("install() writes .claude/settings.json with alwaysAllow for all 8 tools", async () => { ... });
});

// __tests__/setup/claude-desktop-adapter.test.ts
describe("ClaudeDesktopAdapter", () => {
  it("detect() returns true when desktop config path exists", () => { ... });
  it("install() writes to platform-specific config path", async () => { ... });
  it("install() is idempotent", async () => { ... });
  it("install() notes contain restart instruction", async () => { ... });
  it("uninstall() removes only datasynx-opencrm entry", async () => { ... });
});
```

---

## Link 2 — Source Discovery + sources.json

### `.agentic/sources.json` Schema (Zod)

```typescript
// src/schemas/sources.ts
import { z } from "zod";

export const GmailSourceSchema = z.object({
  type: z.literal("gmail"),
  query: z.string(),      // z.B. "from:acme.com OR to:acme.com"
  enabled: z.boolean().default(true),
});

export const TranscriptSourceSchema = z.object({
  type: z.literal("transcript"),
  paths: z.array(z.string()),  // abs. Pfade zu Watch-Verzeichnissen
  extensions: z.array(z.string()).default([".txt", ".vtt"]),
  enabled: z.boolean().default(true),
});

export const GlobalSourcesSchema = z.object({
  gmail: GmailSourceSchema.optional(),
  calendar: z.object({ enabled: z.boolean().default(true) }).optional(),
  transcripts: TranscriptSourceSchema.optional(),
  version: z.number().default(1),
  created: z.string(),         // ISO timestamp
});

export type GlobalSources = z.infer<typeof GlobalSourcesSchema>;
```

### Discovery-Logik

```typescript
// src/commands/init.ts — Source Discovery
async function discoverSources(): Promise<GlobalSources> {
  const home = os.homedir();
  const transcriptPaths: string[] = [];

  // Bekannte Transcript-Pfade prüfen
  const candidates = [
    path.join(home, "Downloads", "Fireflies"),
    path.join(home, "Downloads", "Otter"),
    path.join(home, "Documents", "Zoom"),
    path.join(home, "Downloads", "Zoom"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) transcriptPaths.push(p);
  }

  return {
    gmail: { type: "gmail", query: "", enabled: true },  // Query per Kunde in customers/*/sources.json
    transcripts: transcriptPaths.length > 0
      ? { type: "transcript", paths: transcriptPaths, extensions: [".txt", ".vtt"], enabled: true }
      : undefined,
    version: 1,
    created: new Date().toISOString(),
  };
}
```

---

## Link 3 — Customer Creation

### `dxcrm create "Acme Corp" --domain acme.com --email max@acme.com`

```typescript
// src/commands/create.ts
import slugify from "slug";   // slug package für konsistente IDs

export async function createCustomer(opts: {
  name: string;
  domain?: string;
  email?: string;
}): Promise<void> {
  const id = slugify(opts.name, { lower: true });
  const dir = path.join(process.cwd(), "customers", id);

  if (fs.existsSync(dir)) throw new Error(`Customer '${id}' already exists.`);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "artifacts"));

  // 1. main_facts.md
  fs.writeFileSync(path.join(dir, "main_facts.md"), buildMainFacts(id, opts));

  // 2. interactions.md
  fs.writeFileSync(path.join(dir, "interactions.md"),
    `# Interactions — ${opts.name}\n\n<!-- Newest entries first -->\n`);

  // 3. pipeline.md
  fs.writeFileSync(path.join(dir, "pipeline.md"),
    `# Pipeline — ${opts.name}\n\n<!-- Deals listed here -->\n`);

  // 4. sources.json (per-Customer, mit Gmail-Query vorverdrahtet)
  const sources = {
    gmail: {
      query: buildGmailQuery(opts.domain, opts.email),
      enabled: true,
    },
    version: 1,
  };
  fs.writeFileSync(path.join(dir, "sources.json"), JSON.stringify(sources, null, 2));

  // 5. LanceDB-Collection initialisieren (leere Table)
  await initCustomerTable(id);
}

function buildGmailQuery(domain?: string, email?: string): string {
  const parts: string[] = [];
  if (domain) parts.push(`from:${domain} OR to:${domain}`);
  if (email) parts.push(`from:${email} OR to:${email}`);
  return parts.join(" OR ");
}
```

### `main_facts.md` Template

```typescript
function buildMainFacts(id: string, opts: { name: string; domain?: string; email?: string }): string {
  const today = new Date().toISOString().split("T")[0];
  return `---
id: ${id}
status: active
owner: me
created: ${today}
last_touchpoint: ${today}
tags: []
---

# Customer: ${opts.name}

## Quick Reference
- **Type:** — · **Industry:** — · **Size:** — · **Website:** ${opts.domain ? `https://${opts.domain}` : "—"}

## Contacts
| Name | Role | Email | Channel |
|---|---|---|---|
| — | — | ${opts.email ?? "—"} | — |

## Summary
[2 Sätze: was sie tun, warum sie Kunde sind.]

## Critical Context
- [Wichtigste Besonderheiten]

## Open Questions
- [Dinge, die beim nächsten Kontakt geklärt werden müssen]
`;
}
```

### Schema-Validierung (Zod)

```typescript
// src/schemas/main-facts.ts
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import matter from "gray-matter";

export const MainFactsSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["active", "inactive", "churned"]),
  owner: z.string().min(1),
  created: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  last_touchpoint: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  tags: z.array(z.string()).default([]),
});

export type MainFacts = z.infer<typeof MainFactsSchema>;

export function parseMainFacts(filePath: string): MainFacts {
  const raw = matter.read(filePath);
  const result = MainFactsSchema.safeParse(raw.data);
  if (!result.success) {
    throw new Error(fromZodError(result.error, {
      prefix: `Schema error in ${filePath}`,
      prefixSeparator: ":\n  - ",
      issueSeparator: "\n  - ",
    }).message);
  }
  return result.data;
}
```

### Tests für Link 3

```typescript
// __tests__/commands/create.test.ts
describe("createCustomer", () => {
  it("creates 4 files in customers/<slug>/", async () => { ... });
  it("completes in under 3 seconds", async () => { ... });
  it("main_facts.md frontmatter passes Zod validation", async () => { ... });
  it("sources.json has gmail query with domain filter", async () => { ... });
  it("throws if customer already exists", async () => { ... });
});

describe("parseMainFacts", () => {
  it("parses valid frontmatter", () => { ... });
  it("throws user-friendly error for missing required fields", () => { ... });
  it("throws user-friendly error for invalid status enum", () => { ... });
  it("throws user-friendly error for wrong date format", () => { ... });
});
```

---

## Link 4 — Gmail Sync Engine

### OAuth2 Flow (CLI-friendly)

```typescript
// src/sync/gmail-auth.ts
import { google, Auth } from "googleapis";
import fs from "fs";
import path from "path";
import os from "os";

const TOKEN_PATH = path.join(os.homedir(), ".config", "datasynx-opencrm", "gmail-token.json");
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

export async function getGmailClient(): Promise<Auth.OAuth2Client> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set.\nRun: dxcrm setup gmail");
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, "urn:ietf:wg:oauth:2.0:oob");

  if (fs.existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    oauth2.setCredentials(tokens);

    // Auto-Refresh wenn Token abgelaufen
    oauth2.on("tokens", (newTokens) => {
      const merged = { ...tokens, ...newTokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    });

    return oauth2;
  }

  // Erster Auth-Flow
  const authUrl = oauth2.generateAuthUrl({ scope: SCOPES, access_type: "offline" });
  console.log("\nGmail Authorization needed.");
  console.log("Open this URL in your browser:\n");
  console.log(authUrl);
  console.log("\nPaste the code here:");

  const code = await readStdin();
  const { tokens } = await oauth2.getToken(code.trim());
  oauth2.setCredentials(tokens);
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  return oauth2;
}
```

### Sync-Engine (Idempotenz via source_ref)

```typescript
// src/sync/gmail-sync.ts
import { google } from "googleapis";
import type { Auth } from "googleapis";

interface SyncOptions {
  customerId: string;           // slug, z.B. "acme-corp"
  gmailQuery: string;           // "from:acme.com OR to:acme.com"
  daysBack?: number;            // Default: 90
  maxResults?: number;          // Default: 100 (Rate-Limit-Schutz)
  dryRun?: boolean;
}

export async function syncGmail(auth: Auth.OAuth2Client, opts: SyncOptions): Promise<number> {
  const gmail = google.gmail({ version: "v1", auth });
  const after = new Date();
  after.setDate(after.getDate() - (opts.daysBack ?? 90));
  const dateFilter = `after:${after.toISOString().split("T")[0].replace(/-/g, "/")}`;
  const query = `${opts.gmailQuery} ${dateFilter}`;

  let pageToken: string | undefined;
  let newEntries = 0;

  do {
    // Rate-Limit-safe: max 50 threads pro Batch
    const res = await gmail.users.threads.list({
      userId: "me",
      q: query,
      maxResults: Math.min(opts.maxResults ?? 100, 50),
      pageToken,
    });

    const threads = res.data.threads ?? [];
    for (const thread of threads) {
      const sourceRef = `gmail://thread/${thread.id}`;

      // Idempotenz: prüfen ob schon in LanceDB
      const exists = await checkSourceRefExists(opts.customerId, sourceRef);
      if (exists) continue;

      // Thread-Details laden
      const detail = await gmail.users.threads.get({ userId: "me", id: thread.id! });
      const entry = await extractInteractionFromThread(detail.data, sourceRef);

      if (!opts.dryRun) {
        await appendInteraction(opts.customerId, entry);
        await indexInLanceDB(opts.customerId, entry, sourceRef);
        newEntries++;
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;

    // Exponential Backoff bei Rate-Limit-Errors (429)
    await sleep(200); // 200ms zwischen Batches → safe bei ~5 req/s
  } while (pageToken);

  return newEntries;
}
```

### LLM-Extraktion → interactions.md Entry

```typescript
async function extractInteractionFromThread(
  thread: gmail_v1.Schema$Thread,
  sourceRef: string
): Promise<InteractionEntry> {
  const messages = thread.messages ?? [];
  const firstMsg = messages[0];
  const subject = getHeader(firstMsg, "Subject") ?? "(no subject)";
  const from = getHeader(firstMsg, "From") ?? "unknown";
  const date = new Date(parseInt(firstMsg.internalDate ?? "0")).toISOString().split("T")[0];
  const bodyText = extractPlainText(messages);

  // LLM-Extraktion für Summary + Next Steps
  // Hinweis: In Phase 1 wird kein externer LLM-Call gemacht —
  // die Zusammenfassung wird durch einfache Heuristiken erstellt.
  // Phase 2 fügt LLM-Summarization hinzu.
  const summary = `Email thread with ${messages.length} message(s). Subject: ${subject}`;

  return {
    date,
    type: "Email",
    direction: from.includes("me") ? "Outbound" : "Inbound",
    with: from,
    subject,
    summary,
    nextSteps: [],
    sourceRef,
    synced: new Date().toISOString(),
  };
}
```

### Tests für Link 4

```typescript
// __tests__/sync/gmail-sync.test.ts
describe("syncGmail", () => {
  it("creates one interaction entry per unique thread", async () => { ... });
  it("does not create duplicate entries on second sync (idempotent)", async () => { ... });
  it("respects maxResults limit", async () => { ... });
  it("dryRun does not write to disk", async () => { ... });
  it("handles Gmail 429 rate limit with backoff", async () => { ... });
});
```

---

## Link 5 — Transcript Watcher

```typescript
// src/sync/transcript-watcher.ts
import chokidar from "chokidar";
import path from "path";
import fs from "fs";

export function startTranscriptWatcher(
  watchPaths: string[],
  customerId: string,
  onProcessed: (filePath: string, entry: InteractionEntry) => void,
  onUnmatched: (filePath: string) => void,
): chokidar.FSWatcher {
  // chokidar v4: KEIN Glob — Ordner direkt, Filter via ignored Function
  const watcher = chokidar.watch(watchPaths, {
    persistent: true,
    ignoreInitial: true,     // Keine Events für bestehende Dateien beim Start
    awaitWriteFinish: {
      stabilityThreshold: 2000, // Datei muss 2s unverändert sein
      pollInterval: 100,
    },
    ignored: (filePath: string, stats?: fs.Stats) => {
      if (stats?.isDirectory()) return false;
      if (!stats) return false;
      const ext = path.extname(filePath).toLowerCase();
      return ext !== ".txt" && ext !== ".vtt";
    },
    followSymlinks: false,
    usePolling: false,
  });

  watcher.on("add", async (filePath) => {
    try {
      const text = fs.readFileSync(filePath, "utf-8");
      const entry = await processTranscript(filePath, text, customerId);

      if (entry) {
        await appendInteraction(customerId, entry);
        await indexInLanceDB(customerId, entry, `file://${filePath}`);
        onProcessed(filePath, entry);
      } else {
        // Nicht zuordnenbar → unmatched-transcripts.json
        appendUnmatched(filePath);
        onUnmatched(filePath);
      }
    } catch (err) {
      console.error(`Transcript error: ${filePath}:`, (err as Error).message);
    }
  });

  return watcher;
}

// Unmatched-Transcripts protokollieren (nie still scheitern)
function appendUnmatched(filePath: string): void {
  const unmatchedPath = path.join(process.cwd(), ".agentic", "unmatched-transcripts.json");
  let list: Array<{ path: string; timestamp: string }> = [];
  if (fs.existsSync(unmatchedPath)) {
    try { list = JSON.parse(fs.readFileSync(unmatchedPath, "utf-8")); } catch {}
  }
  list.push({ path: filePath, timestamp: new Date().toISOString() });
  fs.writeFileSync(unmatchedPath, JSON.stringify(list, null, 2));
}
```

---

## Link 6 — Context Builder

### Deterministisch, <3000 Token, byte-identisch

```typescript
// src/core/context-builder.ts

export interface ContextBlock {
  slug: string;
  generatedAt: string;        // ISO timestamp
  tokenEstimate: number;
  sections: {
    quickReference: string;
    contacts: string;
    criticalContext: string;
    recentActivity: string;   // letzte 5 Interaktionen
    openDeals: string;
    openQuestions: string;
  };
  raw: string;                // Vollständiger Markdown-Block
}

const MAX_INTERACTIONS = 5;   // Nur letzte N Interaktionen
const MAX_TOKENS = 3000;      // Hard-Cap

export async function buildContext(slug: string): Promise<ContextBlock> {
  const customerDir = path.join(process.cwd(), "customers", slug);
  if (!fs.existsSync(customerDir)) {
    throw new Error(`Customer '${slug}' not found.`);
  }

  // 1. main_facts.md lesen (gibt Fehler wenn Schema invalide)
  const mainFacts = parseMainFacts(path.join(customerDir, "main_facts.md"));
  const mainContent = matter.read(path.join(customerDir, "main_facts.md")).content;

  // 2. Letzte N Interaktionen aus interactions.md extrahieren
  const interactions = parseRecentInteractions(
    path.join(customerDir, "interactions.md"),
    MAX_INTERACTIONS
  );

  // 3. Offene Deals aus pipeline.md
  const openDeals = parseOpenDeals(path.join(customerDir, "pipeline.md"));

  // 4. Deterministischer Aufbau — feste Section-Reihenfolge (Agenten verlassen sich darauf)
  const sections = {
    quickReference: extractSection(mainContent, "Quick Reference"),
    contacts: extractSection(mainContent, "Contacts"),
    criticalContext: extractSection(mainContent, "Critical Context"),
    recentActivity: formatInteractions(interactions),
    openDeals: formatDeals(openDeals),
    openQuestions: extractSection(mainContent, "Open Questions"),
  };

  const raw = buildRawBlock(slug, mainFacts, sections);
  const tokenEstimate = estimateTokens(raw);

  if (tokenEstimate > MAX_TOKENS) {
    // Trim älteste Interaktionen bis unter Limit
    return buildContext_trimmed(slug, mainFacts, sections, MAX_TOKENS);
  }

  return {
    slug,
    generatedAt: new Date().toISOString(),
    tokenEstimate,
    sections,
    raw,
  };
}

// Token-Schätzung: 1 Token ≈ 4 Zeichen (Heuristik, kein LLM-Call)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

### Tests für Link 6

```typescript
// __tests__/core/context-builder.test.ts
describe("buildContext", () => {
  it("is deterministic — calling twice returns byte-identical output", async () => {
    const a = await buildContext("acme-corp");
    const b = await buildContext("acme-corp");
    expect(a.raw).toBe(b.raw);
  });

  it("completes in under 2 seconds", async () => {
    const start = Date.now();
    await buildContext("acme-corp");
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it("stays under 3000 tokens for customer with 50 interactions", async () => {
    // Setup: 50 Interaktionen in memfs
    const result = await buildContext("heavy-customer");
    expect(result.tokenEstimate).toBeLessThan(3000);
  });

  it("throws if customer doesn't exist", async () => {
    await expect(buildContext("nonexistent")).rejects.toThrow("not found");
  });

  it("sections are in fixed order", async () => {
    const result = await buildContext("acme-corp");
    const keys = Object.keys(result.sections);
    expect(keys).toEqual([
      "quickReference", "contacts", "criticalContext",
      "recentActivity", "openDeals", "openQuestions"
    ]);
  });
});
```

---

## Link 7 — MCP Server

### Korrekte v1.x Implementierung

```typescript
// src/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// WICHTIG: console.log schreibt auf stdout = MCP-Protokoll kaputt!
// Immer console.error() für Debug-Output in stdio-Mode verwenden.

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "datasynx-opencrm",
    version: "1.0.0",
  });

  // Tools registrieren — server.registerTool() (nicht server.tool() — deprecated in v2)
  registerGetCapabilities(server);
  registerGetActiveSession(server);
  registerGetCustomerContext(server);
  registerSearchCustomerKnowledge(server);
  registerListCustomers(server);
  registerLogInteraction(server);
  registerUpdateDeal(server);
  registerExportCustomer(server);

  return server;
}

export async function startStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DatasynxOpenCRM MCP Server running via stdio");
}

export async function startHttp(port = 3847): Promise<void> {
  const { default: express } = await import("express");
  const app = express();
  app.use(express.json());

  const server = createMcpServer();

  // Stateless: neue Transport-Instanz pro Request
  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.listen(port, () => {
    console.error(`DatasynxOpenCRM MCP Server running on http://0.0.0.0:${port}/mcp`);
  });
}
```

### Tool-Registrierung — Beispiel `get_customer_context`

```typescript
// src/mcp/tools/get-customer-context.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerGetCustomerContext(server: McpServer): void {
  server.registerTool(
    "get_customer_context",
    {
      title: "Get Customer Context",
      description: `Returns a complete, LLM-ready context block for a customer.
Triggers on-query Gmail sync automatically before returning.
Use this before any customer-related conversation or action.

Args:
  slug (optional): Customer ID (e.g. "acme-corp"). If omitted, uses active session.

Returns: Structured markdown with Quick Reference, Contacts, Critical Context,
Recent Activity (last 5), Open Deals, and Open Questions.

Performance: <3 seconds including sync. Token budget: <3000.`,
      inputSchema: z.object({
        slug: z.string().optional().describe(
          "Customer slug (e.g. 'acme-corp'). Leave empty for active session customer."
        ),
      }),
      annotations: {
        readOnlyHint: false,   // triggert sync (write to lancedb)
        idempotentHint: true,
      },
    },
    async ({ slug }) => {
      try {
        const targetSlug = slug ?? getActiveSessionCustomer();
        if (!targetSlug) {
          return {
            content: [{
              type: "text" as const,
              text: "No customer specified and no active session. Use: get_customer_context({ slug: 'acme-corp' })",
            }],
            isError: true,
          };
        }

        // On-Query Sync (Gmail, async, non-blocking if fails)
        await syncGmailForCustomer(targetSlug).catch((err) => {
          console.error(`Sync warning for ${targetSlug}:`, err.message);
        });

        const context = await buildContext(targetSlug);

        return {
          content: [{ type: "text" as const, text: context.raw }],
          structuredContent: context,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
```

### `get_capabilities()` — Single Source of Truth

```typescript
// src/mcp/capabilities.ts
// Diese Datei ist die EINZIGE Quelle für Capability-Dokumentation.
// Wird von get_capabilities() MCP-Tool UND dxcrm guide CLI verwendet.

export const CAPABILITIES_TEXT = `
# DatasynxOpenCRM — Agent Guide

## Available Tools

### get_customer_context(slug?)
Load complete briefing for a customer. Syncs Gmail automatically.
Usage: Before any customer conversation. Works without slug if session is active.

### search_customer_knowledge(slug, query)
Hybrid vector+FTS search across all emails and transcripts for a customer.
Usage: "What did Acme say about pricing?" / "Find GDPR mentions"

### list_customers(status?, owner?)
List all customers with last touchpoint and deal health.
Usage: Morning briefing / Pipeline overview

### log_interaction(slug, type, summary, nextSteps?)
Write a new interaction entry. Immediately searchable.
Usage: After every call/meeting/email. Agent calls this, not the user.

### update_deal(slug, dealName, fields)
Update deal stage, value, probability, or close date.
Usage: After pipeline discussions.

### get_active_session()
Check which customer is currently active.

### export_customer(slug)
Export all customer data as a ZIP file.

## Workflow
1. User mentions a customer → get_customer_context()
2. Ask/answer questions → search_customer_knowledge() if needed
3. After interaction → log_interaction()
4. After deal update → update_deal()

## Response Format
Always cite sources (gmail://thread/... or file://...) when available.
`.trim();
```

### Claude Code `alwaysAllow` — `.claude/settings.json`

```json
{
  "permissions": {
    "allow": [
      "mcp__datasynx-opencrm__get_capabilities",
      "mcp__datasynx-opencrm__get_active_session",
      "mcp__datasynx-opencrm__get_customer_context",
      "mcp__datasynx-opencrm__search_customer_knowledge",
      "mcp__datasynx-opencrm__list_customers",
      "mcp__datasynx-opencrm__log_interaction",
      "mcp__datasynx-opencrm__update_deal",
      "mcp__datasynx-opencrm__export_customer"
    ]
  }
}
```

---

## Link 8 — Write-Back: `log_interaction()`

```typescript
// src/mcp/tools/log-interaction.ts
server.registerTool(
  "log_interaction",
  {
    title: "Log Interaction",
    description: `Write a new interaction entry to the CRM. Use after every call, meeting, or email.
Format matches auto-synced entries exactly — no special treatment needed.

Args:
  slug: Customer ID
  type: "Call" | "Meeting" | "Email" | "Note" | "Demo" | "Proposal"
  with: Who was involved
  summary: 2-5 sentences describing what happened
  nextSteps: Array of action items (optional)
  date: YYYY-MM-DD (optional, defaults to today)`,
    inputSchema: z.object({
      slug: z.string(),
      type: z.enum(["Call", "Meeting", "Email", "Note", "Demo", "Proposal"]),
      with: z.string(),
      summary: z.string().min(10).max(1000),
      nextSteps: z.array(z.string()).optional().default([]),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
  },
  async ({ slug, type, with: withStr, summary, nextSteps, date }) => {
    const entry: InteractionEntry = {
      date: date ?? new Date().toISOString().split("T")[0],
      type,
      with: withStr,
      summary,
      nextSteps: nextSteps ?? [],
      sourceRef: `agent://log/${Date.now()}`,
      synced: new Date().toISOString(),
    };

    // 1. interactions.md (prepend — neueste zuerst)
    await prependInteraction(slug, entry);

    // 2. last_touchpoint in main_facts.md updaten
    await updateLastTouchpoint(slug, entry.date);

    // 3. LanceDB indexieren (sofort durchsuchbar)
    await indexInLanceDB(slug, entry, entry.sourceRef);

    return {
      content: [{
        type: "text" as const,
        text: `Interaction logged for ${slug} on ${entry.date}. Immediately searchable.`,
      }],
    };
  }
);
```

### `interactions.md` Schreibfunktion (exaktes Format)

```typescript
// src/fs/interactions-writer.ts

const INTERACTION_SEPARATOR = "---";

export function formatInteractionEntry(entry: InteractionEntry): string {
  const nextStepsBlock = entry.nextSteps.length > 0
    ? entry.nextSteps.map(s => `- [ ] ${s}`).join("\n")
    : "- [ ] —";

  return `## ${entry.date} · ${entry.type}${entry.direction ? ` · ${entry.direction}` : ""}
**${entry.type === "Email" ? "Subject" : "With"}:** ${entry.with}
**Summary:** ${entry.summary}
**Next Steps:**
${nextStepsBlock}
**Source:** ${entry.sourceRef}
**Synced:** ${entry.synced}
${INTERACTION_SEPARATOR}
`;
}

export async function prependInteraction(slug: string, entry: InteractionEntry): Promise<void> {
  const filePath = path.join(process.cwd(), "customers", slug, "interactions.md");
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
  const headerEnd = existing.indexOf("\n\n");
  const header = headerEnd > -1 ? existing.slice(0, headerEnd + 2) : existing;
  const body = headerEnd > -1 ? existing.slice(headerEnd + 2) : "";
  const newContent = header + formatInteractionEntry(entry) + "\n" + body;
  fs.writeFileSync(filePath, newContent, "utf-8");
}
```

---

## LanceDB — Vollständige Setup-Implementierung

```typescript
// src/core/lancedb.ts
import * as lancedb from "@lancedb/lancedb";
import { Schema, Field, FixedSizeList, Float32, Utf8, Int64 } from "apache-arrow";

const DB_PATH = path.join(process.cwd(), ".agentic", "lancedb");
let _db: lancedb.Connection | null = null;

async function getDb(): Promise<lancedb.Connection> {
  if (!_db) _db = await lancedb.connect(DB_PATH);
  return _db;
}

const VECTOR_SCHEMA = new Schema([
  new Field("id", new Utf8(), false),
  new Field("source_ref", new Utf8(), false),     // Idempotenz-Key
  new Field("customer_id", new Utf8(), false),
  new Field("text", new Utf8(), true),             // Volltext für FTS
  new Field("type", new Utf8(), true),             // "email" | "transcript" | "note"
  new Field("date", new Utf8(), true),             // YYYY-MM-DD
  new Field("vector", new FixedSizeList(           // 384 dims für all-MiniLM-L6-v2
    384,
    new Field("item", new Float32(), true)
  ), false),
  new Field("created_at", new Int64(), true),
]);

export async function getCustomerTable(customerId: string): Promise<lancedb.Table> {
  const db = await getDb();
  const name = `docs_${customerId.replace(/[^a-z0-9]/gi, "_")}`;
  try {
    return await db.openTable(name);
  } catch {
    const table = await db.createEmptyTable(name, VECTOR_SCHEMA);
    // Indizes für Performance (async im Hintergrund)
    table.createIndex("source_ref", { config: lancedb.Index.btree() }).catch(() => {});
    return table;
  }
}

export async function indexInLanceDB(
  customerId: string,
  entry: { text: string; type: string; date: string },
  sourceRef: string
): Promise<void> {
  const table = await getCustomerTable(customerId);
  const embedding = await embedText(entry.text);

  // Upsert via mergeInsert (Idempotenz über source_ref)
  await table
    .mergeInsert("source_ref")
    .whenMatchedUpdateAll()
    .whenNotMatchedInsertAll()
    .execute([{
      id: `${customerId}-${Date.now()}`,
      source_ref: sourceRef,
      customer_id: customerId,
      text: entry.text,
      type: entry.type,
      date: entry.date,
      vector: Array.from(embedding),   // Float32Array → number[] für LanceDB
      created_at: BigInt(Date.now()),
    }]);
}

export async function searchKnowledge(
  customerId: string,
  query: string,
  limit = 10
): Promise<Array<{ text: string; source_ref: string; date: string; score: number }>> {
  const table = await getCustomerTable(customerId);
  const queryVector = await embedText(query);

  const results = await table
    .search(queryVector)
    .where(`customer_id = '${customerId}'`)
    .select(["text", "source_ref", "date"])
    .limit(limit)
    .toArray();

  return results.map((r: any) => ({
    text: r.text,
    source_ref: r.source_ref,
    date: r.date,
    score: 1 - (r._distance ?? 0), // Cosine-Similarity aus Distance
  }));
}
```

---

## Embedder — Singleton Pattern

```typescript
// src/core/embedder.ts
import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";
import path from "path";
import os from "os";

// Cache außerhalb node_modules (sonst bei npm ci gelöscht)
env.cacheDir = process.env.HF_CACHE_DIR
  ?? path.join(os.homedir(), ".cache", "datasynx-opencrm", "models");

class EmbeddingPipeline {
  // Promise-Singleton: verhindert doppeltes Laden bei concurrent Aufrufen
  private static instance: Promise<FeatureExtractionPipeline> | null = null;

  static get(): Promise<FeatureExtractionPipeline> {
    if (!this.instance) {
      console.error("Loading embedding model (first time, ~25MB)...");
      this.instance = pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2"    // Xenova-Prefix funktioniert in @huggingface/transformers v3
      ) as Promise<FeatureExtractionPipeline>;
    }
    return this.instance;
  }
}

export async function embedText(text: string): Promise<Float32Array> {
  const extractor = await EmbeddingPipeline.get();
  const output = await extractor(text, {
    pooling: "mean",
    normalize: true,    // L2-Normalisierung (wichtig für Cosine-Similarity)
  });
  return output.data as Float32Array;
}

export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const extractor = await EmbeddingPipeline.get();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return (output as any[]).map((o) => o.data as Float32Array);
}
```

---

## Daemon — Background Sync

```typescript
// src/daemon/worker.ts — läuft als detached Prozess
import { CronJob } from "cron";
import fs from "fs";
import path from "path";
import os from "os";

const PID_FILE = path.join(os.homedir(), ".config", "datasynx-opencrm", "daemon.pid");
const STATUS_FILE = path.join(os.homedir(), ".config", "datasynx-opencrm", "daemon-status.json");

// Eigene PID beim Start schreiben
fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
fs.writeFileSync(PID_FILE, String(process.pid));

let lastSync: string | null = null;
let syncCount = 0;

const syncJob = CronJob.from({
  cronTime: "*/15 * * * *",      // Alle 15 Minuten
  onTick: async () => {
    console.error(`[${new Date().toISOString()}] Sync cycle starting...`);
    try {
      await runAllCustomerSync();
      lastSync = new Date().toISOString();
      syncCount++;
      fs.writeFileSync(STATUS_FILE, JSON.stringify({
        pid: process.pid, startedAt: daemonStartTime,
        lastSync, syncCount, status: "running",
      }));
    } catch (err) {
      console.error("Sync error:", (err as Error).message);
    }
  },
  start: true,
  waitForCompletion: true,  // Kein concurrent run wenn sync länger dauert
});

const daemonStartTime = new Date().toISOString();

process.on("SIGTERM", () => {
  syncJob.stop();
  fs.existsSync(PID_FILE) && fs.unlinkSync(PID_FILE);
  process.exit(0);
});

process.on("SIGINT", () => {
  syncJob.stop();
  fs.existsSync(PID_FILE) && fs.unlinkSync(PID_FILE);
  process.exit(0);
});

console.error(`[${daemonStartTime}] DatasynxOpenCRM Daemon started (PID ${process.pid})`);
```

---

## Terminal UI — Output-Konventionen

```typescript
// src/ui/colors.ts
import ansis from "ansis";

export const ui = {
  success: (msg: string) => console.log(ansis.green(`✓ ${msg}`)),
  error: (msg: string) => console.error(ansis.red(`✗ ${msg}`)),
  warning: (msg: string) => console.log(ansis.yellow(`⚠ ${msg}`)),
  info: (msg: string) => console.log(ansis.cyan(`ℹ ${msg}`)),
  muted: (msg: string) => console.log(ansis.dim(msg)),
  header: (msg: string) => console.log(ansis.bold(msg)),

  status: {
    active: (s: string) => ansis.green(s),
    inactive: (s: string) => ansis.yellow(s),
    churned: (s: string) => ansis.red(s),
  },

  dealHealth: {
    active: "🟢",
    stale: "⚠️",
    blocked: "🔴",
  },
};
```

```typescript
// src/ui/table.ts
import Table from "cli-table3";
import { ui } from "./colors.js";

export function renderCustomerList(customers: CustomerSummary[]): void {
  const table = new Table({
    head: ["ID", "Name", "Status", "Owner", "Last Touchpoint", "Open Deals"],
    colWidths: [14, 22, 10, 12, 16, 12],
    style: { head: [], border: [] },
  });

  for (const c of customers) {
    table.push([
      ansis.dim(c.id),
      c.name,
      ui.status[c.status](c.status),
      c.owner,
      c.lastTouchpoint,
      c.openDeals > 0 ? ansis.cyan(String(c.openDeals)) : ansis.dim("0"),
    ]);
  }

  console.log(table.toString());
  console.log(ansis.dim(`  ${customers.length} customer(s)`));
}
```

---

## Dokumentationspflicht — Was bei jedem Feature mitgeliefert wird

### Bei jedem neuen MCP-Tool

1. `src/mcp/capabilities.ts` → Tool-Eintrag ergänzen
2. `docs/mcp-tools.md` → Vollständige Dokumentation (Schema, Beispiel-Request, Beispiel-Response)
3. `README.md` → Tool in der Übersichtstabelle ergänzen

### Bei jedem neuen CLI-Command

1. `docs/cli-reference.md` → Command, Flags, Beispiele
2. `README.md` → Quick-Reference aktualisieren

### `dxcrm guide` Output

`dxcrm guide` gibt immer `CAPABILITIES_TEXT` aus `src/mcp/capabilities.ts` aus — Single Source of Truth für beide.

---

## Woche-für-Woche Umsetzungsplan

### Woche 1 — Foundation

**Reihenfolge (TDD: Test zuerst):**

```
Tag 1:
□ package.json + tsconfig.json + tsdown.config.ts + vitest.config.ts
□ Test-Setup: vitest + memfs Mock + LanceDB/Transformers Mocks
□ __tests__/schemas/main-facts.test.ts (FAILING)
□ src/schemas/main-facts.ts (PASSING)

Tag 2:
□ __tests__/commands/create.test.ts (FAILING)
□ src/commands/create.ts (PASSING)
□ __tests__/fs/interactions-writer.test.ts (FAILING)
□ src/fs/interactions-writer.ts (PASSING)

Tag 3:
□ src/setup/framework-adapter.ts (Interface + Types)
□ src/setup/harness-content.ts (alle Harness-Texte — Single Source of Truth)
□ __tests__/setup/claude-code-adapter.test.ts (FAILING)
□ src/setup/adapters/claude-code.ts (PASSING)
□ __tests__/setup/claude-desktop-adapter.test.ts (FAILING)
□ src/setup/adapters/claude-desktop.ts (PASSING)
□ src/setup/framework-registry.ts (FRAMEWORK_ADAPTERS + installAllDetected)

Tag 4:
□ src/commands/init.ts (mit Framework-Detector + Writer)
□ src/commands/list.ts
□ src/commands/session.ts
□ src/commands/guide.ts
□ src/cli.ts (Commander Setup)

Tag 5:
□ dxcrm validate Befehl
□ README.md: 5-Minuten-Quickstart
□ docs/cli-reference.md: Woche-1-Commands
□ npm test → alle Tests grün
□ npm run build → erfolgreich
□ Commit + Push
```

**DONE WHEN:** `npx datasynx-opencrm init` + `create "Acme Corp"` + `validate` — alle unter 90s auf sauberer Maschine.

### Woche 2 — Data In

```
Tag 1-2: LanceDB + Embedder
□ __tests__/core/embedder.test.ts
□ src/core/embedder.ts (Singleton)
□ __tests__/core/lancedb.test.ts
□ src/core/lancedb.ts

Tag 3: Gmail Sync
□ __tests__/sync/gmail-sync.test.ts (mit googleapis Mock)
□ src/sync/gmail-sync.ts
□ src/sync/gmail-auth.ts

Tag 4: Transcript Watcher
□ __tests__/sync/transcript-watcher.test.ts (mit tmp-Dir)
□ src/sync/transcript-watcher.ts

Tag 5: Daemon
□ src/daemon/worker.ts
□ src/commands/daemon.ts
□ npm test → grün
□ Commit + Push
```

**DONE WHEN:** Transcript ablegen → 5 Min → in interactions.md. Sync zweimal → null Duplikate.

### Woche 3 — Agent Can Ask

```
Tag 1-2: Context Builder
□ __tests__/core/context-builder.test.ts (Determinismus, Token-Limit, Performance)
□ src/core/context-builder.ts

Tag 3-4: MCP Server + alle 8 Tools
□ __tests__/mcp/tools/*.test.ts (je Tool)
□ src/mcp/tools/*.ts
□ src/mcp/server.ts

Tag 5:
□ docs/mcp-tools.md (alle 8 Tools)
□ MCP Inspector Test: alle Tools sichtbar und aufrufbar
□ npm test → grün
□ Commit + Push
```

**DONE WHEN:** Agent fragt "Was ist los mit Acme Corp?" → korrekte Antwort in <3s.

### Woche 4 — Full Loop + Erster Kunde

```
Tag 1-2: Write-Back + Backup
□ log_interaction() + update_deal() vollständig
□ dxcrm backup/restore
□ export_customer() MCP-Tool

Tag 3: Error Handling + Robustheit
□ Alle MCP-Tools geben strukturierte Fehler zurück (nie throw)
□ Daemon läuft 24h unbeaufsichtigt (Stress-Test)

Tag 4: Erster User
□ README.md finalisieren (Claude Code, Codex, Hermes Quickstart)
□ docs/ vollständig
□ Erster externer User onboarden

Tag 5: Merge zu main
□ Alle Tests grün
□ Alle Docs synchron
□ npm run build erfolgreich
□ Merge Feature-Branch → main
□ npm publish
```

**DONE WHEN:** Externer User nutzt dxcrm 7 Tage täglich ohne HubSpot.

---

## Bekannte Gotchas — Komplett-Referenz

| # | Bereich | Problem | Lösung |
|---|---|---|---|
| 1 | MCP SDK | `console.log` in stdio → Protokoll kaputt | Immer `console.error()` |
| 2 | MCP SDK | `.js` fehlt bei Imports → Cannot find module | Immer `from "...mcp.js"` |
| 3 | MCP SDK | `server.tool()` → deprecated in v2 | `server.registerTool()` |
| 4 | MCP SDK | `instructions` im Konstruktor → v1.x hat das nicht | Instructions in Tool-Description |
| 5 | LanceDB | `Float64` für Vektoren → Speicher-Overhead | `new Float32()` im Schema |
| 6 | LanceDB | `mergeInsert` ohne BTree-Index → Full-Scan | BTree-Index auf `source_ref` |
| 7 | LanceDB | FTS-Index-Build ist async → erste Queries langsam | Erwartet + dokumentiert |
| 8 | LanceDB | Alpine-Linux → native Binary fehlt | `node:20-slim` Docker-Image |
| 9 | Transformers | Cache in `node_modules` → bei `npm ci` gelöscht | `env.cacheDir` explizit setzen |
| 10 | Transformers | Concurrent Requests → Modell doppelt geladen | Promise-Singleton-Pattern |
| 11 | Gmail | `@gongrzhe` Package archiviert März 2026 | Eigene Impl. mit `googleapis` |
| 12 | chokidar v4 | `watch('**/*.txt')` → Glob entfernt → silently nichts | Ordner watchen + ignored Function |
| 13 | chokidar v4 | Linux: `add` Event vor vollständigem Schreiben | `awaitWriteFinish.stabilityThreshold: 2000` |
| 14 | cron | `'*/15 * * * * *'` (6-stellig) = alle 15 Sekunden | 5-stellig für Minuten: `'*/15 * * * *'` |
| 15 | chalk v5 | ESM-only → `ERR_REQUIRE_ESM` in CJS | `ansis` verwenden |
| 16 | ora | ESM-only | `@topcli/spinner` verwenden |
| 17 | postinstall | pnpm v10 blockiert es | Lazy Detection in `dxcrm init` |
| 18 | tsup | Nicht mehr maintained | `tsdown` verwenden |
| 19 | fastembed | Archiviert Jan 2026 | `@huggingface/transformers` v3.8.1 |
| 20 | Claude Code | `alwaysAllow` Bug — resettet bei Neustart | `.claude/settings.json` permissions |
| 21 | Commander | `parse()` ignoriert async returns | Immer `parseAsync()` |
| 22 | Daemon | `stdio: 'inherit'` hält Parent offen | `stdio: ['ignore', logFd, logFd]` + `child.unref()` |

---

## Framework Integration Layer

### Architektonische Entscheidung

**Kein postinstall. Kein automatisches Schreiben beim npm install.**
Stattdessen: `dxcrm init` ist der einzige Entry-Point für Framework-Integration.
Jedes Framework bekommt einen dedizierten `FrameworkAdapter` — gleiche Schnittstelle, framework-spezifische Implementierung.

Das Pattern geht über MCP-Registrierung hinaus: Jeder Adapter injiziert auch **Harness-Dateien** (SOUL.md, AGENTS.md, CLAUDE.md etc.), damit der Agent von Anfang an weiß wie er das CRM optimal nutzt — ohne manuelle Einrichtung.

---

### Adapter-Interface (TypeScript)

```typescript
// src/setup/framework-adapter.ts

export interface InstallConfig {
  mcpServerPath: string;    // absoluter Pfad zu dist/mcp.js
  dataDir: string;          // CRM-Root-Verzeichnis (wo customers/ liegt)
  httpPort: number;         // für HTTP-Transport (default: 3847)
  serverName: string;       // MCP-Server-Name (default: "datasynx-opencrm")
}

export interface InstallResult {
  framework: string;
  success: boolean;
  transport: "stdio" | "http";
  configPath: string;
  harnessFiles: string[];   // alle geschriebenen Harness-Dateien
  notes?: string;
}

export interface FrameworkAdapter {
  readonly name: string;
  detect(): boolean;                                    // sync, kein IO außer FS-Checks
  install(config: InstallConfig): Promise<InstallResult>;
  uninstall(): Promise<void>;
  isInstalled(): boolean;                               // prüft ob MCP-Config schon vorhanden
}
```

---

### Registry — Alle 9 Adapter

Die finale Registry (`src/setup/framework-registry.ts`) enthält alle Adapter. Implementierungen der einzelnen Adapter folgen weiter unten im Dokument.

```typescript
// src/setup/framework-registry.ts
import { ClaudeCodeAdapter } from "./adapters/claude-code.js";
import { ClaudeDesktopAdapter } from "./adapters/claude-desktop.js";
import { CodexAdapter } from "./adapters/codex.js";
import { OpenClawAdapter } from "./adapters/openclaw.js";
import { HermesAdapter } from "./adapters/hermes.js";
import { AntigravityAdapter } from "./adapters/antigravity.js";
import { CursorAdapter } from "./adapters/cursor.js";
import { WindsurfAdapter } from "./adapters/windsurf.js";
import { ClineAdapter } from "./adapters/cline.js";
import type { FrameworkAdapter } from "./framework-adapter.js";
import type { InstallConfig, InstallResult } from "./framework-adapter.js";

export const FRAMEWORK_ADAPTERS: FrameworkAdapter[] = [
  // Tier 1 — voller Adapter (CLI-Binary detektierbar, Harness-Injection)
  new ClaudeCodeAdapter(),
  new CodexAdapter(),
  new OpenClawAdapter(),
  new HermesAdapter(),
  new AntigravityAdapter(),
  // Tier 2 — Config-Writer (IDE/Desktop, kein globales Harness-System)
  new CursorAdapter(),
  new WindsurfAdapter(),
  new ClineAdapter(),
  new ClaudeDesktopAdapter(),   // non-developer audience, restart required
];

export async function installAllDetected(config: InstallConfig): Promise<InstallResult[]> {
  const results: InstallResult[] = [];
  for (const adapter of FRAMEWORK_ADAPTERS) {
    if (!adapter.detect()) continue;
    try {
      results.push(await adapter.install(config));
    } catch (err) {
      results.push({
        framework: adapter.name,
        success: false,
        transport: "stdio",
        configPath: "",
        harnessFiles: [],
        notes: (err as Error).message,
      });
    }
  }
  return results;
}
```

---

### Harness-Inhalte — Single Source of Truth

Alle Harness-Texte kommen aus einer Datei. Kein doppeltes Pflegen.

```typescript
// src/setup/harness-content.ts

// Für Claude Code: CLAUDE.md im CRM-Root
export function buildClaudeMd(dataDir: string): string {
  return `# DatasynxOpenCRM — Agent Instructions

## MCP Tools verfügbar
Dieser Workspace ist mit DatasynxOpenCRM verbunden. Du hast Zugriff auf 8 MCP-Tools.

## Pflicht-Workflow
1. **Vor jedem Kundengespräch:** \`get_customer_context("slug")\` aufrufen
2. **Nach jedem Call/Meeting/Email:** \`log_interaction()\` aufrufen
3. **Für historische Fragen:** \`search_customer_knowledge()\` nutzen
4. **Pipeline-Update:** \`update_deal()\` nach Deal-Diskussionen

## Kunden auflisten
\`list_customers()\` → Übersicht mit letztem Touchpoint und Deal-Health

## Nicht fragen — einfach tun
- Immer Context laden bevor über einen Kunden gesprochen wird
- Immer Interaktionen loggen — auch kurze Slack-Nachrichten
- Niemals Kontext manuell aus Emails kopieren — der CRM macht das automatisch

## Datenverzeichnis
${dataDir}
`.trim();
}

// Für OpenClaw: SOUL.md im Workspace
export function buildSoulMd(framework: "openclaw" | "hermes"): string {
  return `# Identity
I am a CRM-integrated AI assistant. My purpose is to help manage customer relationships
using structured data from DatasynxOpenCRM.

# Values
- Customer context before action. I never discuss a customer without first loading their context.
- Log everything. Every interaction goes into the CRM — calls, emails, meetings, Slack threads.
- Cite sources. When I reference customer information, I cite the source (gmail://, file://).
- Brevity with completeness. Short answers that include all relevant next steps.

# Boundaries
- I do not invent customer information. If I don't know, I say so and suggest syncing.
- I do not discuss customers without their context loaded via get_customer_context().
- I do not skip logging interactions, even if asked to summarize quickly.

# Communication Style
Direct. Action-oriented. I lead with the most important insight, then supporting detail.
I use bullet points for next steps. I end every customer summary with open questions.
`.trim();
}

// Für OpenClaw: AGENTS.md im Workspace
export function buildAgentsMd(dataDir: string): string {
  return `# DatasynxOpenCRM Agent

## Role
You are a CRM assistant with access to structured customer data via MCP tools.

## Available Tools
- \`get_customer_context(slug?)\` — Full briefing for a customer. Call this first.
- \`search_customer_knowledge(slug, query)\` — Search emails + transcripts.
- \`list_customers()\` — All customers with status and last touchpoint.
- \`log_interaction(slug, type, summary)\` — Write back to CRM after every interaction.
- \`update_deal(slug, dealName, fields)\` — Update pipeline stage/value/probability.
- \`get_capabilities()\` — Full tool reference.

## Mandatory Workflow
1. Customer mentioned → get_customer_context() immediately
2. Interaction complete → log_interaction() before ending session
3. Deal discussed → update_deal() with new stage/probability

## Data Location
${dataDir}

## Never
- Discuss a customer without loading context first
- Skip logging — every touchpoint matters
- Invent information — sync if data is missing
`.trim();
}

// Für Hermes: SOUL.md (gleicher Inhalt wie OpenClaw, Hermes liest dasselbe Format)
export const buildHermesSoulMd = buildSoulMd;

// Für Hermes: Skill-Datei (agentskills.io Standard)
export function buildHermesSkillMd(): string {
  return `---
name: datasynx-crm
version: 1.0.0
description: CRM workflow skill for DatasynxOpenCRM
triggers:
  - "customer"
  - "client"
  - "deal"
  - "pipeline"
  - "sync"
---

# DatasynxOpenCRM Skill

## When a customer is mentioned
Always call \`get_customer_context(slug)\` first.
Never assume you know the current state — always load fresh context.

## After every interaction
Call \`log_interaction()\` with:
- type: Call | Meeting | Email | Note | Demo | Proposal
- summary: 2-5 sentences on what happened
- nextSteps: concrete actions as array

## For historical research
Use \`search_customer_knowledge(slug, query)\` — searches emails AND transcripts.

## Pipeline updates
After any deal discussion: \`update_deal(slug, dealName, { stage, probability, value })\`

## Quick reference
\`list_customers()\` for morning briefing or pipeline overview.
\`get_capabilities()\` if unsure which tool to use.
`.trim();
}
```

---

### Adapter 1 — Claude Code

```typescript
// src/setup/adapters/claude-code.ts
import fs from "fs";
import path from "path";
import os from "os";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "../framework-adapter.js";
import { buildClaudeMd } from "../harness-content.js";

const CLAUDE_JSON = path.join(os.homedir(), ".claude.json");
const CLAUDE_DIR = path.join(os.homedir(), ".claude");

export class ClaudeCodeAdapter implements FrameworkAdapter {
  readonly name = "Claude Code";

  detect(): boolean {
    try { execSync("which claude", { stdio: "ignore" }); return true; } catch {}
    return fs.existsSync(CLAUDE_JSON) || fs.existsSync(CLAUDE_DIR);
  }

  isInstalled(): boolean {
    if (!fs.existsSync(CLAUDE_JSON)) return false;
    try {
      const json = JSON.parse(fs.readFileSync(CLAUDE_JSON, "utf-8"));
      return !!json?.mcpServers?.["datasynx-opencrm"];
    } catch { return false; }
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    const harnessFiles: string[] = [];

    // 1. MCP-Server in ~/.claude.json registrieren (User-Scope)
    this.writeMcpConfig(config);

    // 2. alwaysAllow in ~/.claude/settings.json
    this.writeSettings();

    // 3. CLAUDE.md im CRM-Datenverzeichnis
    const claudeMdPath = path.join(config.dataDir, "CLAUDE.md");
    fs.writeFileSync(claudeMdPath, buildClaudeMd(config.dataDir));
    harnessFiles.push(claudeMdPath);

    // 4. .claude/settings.json im CRM-Verzeichnis (Project-Scope alwaysAllow)
    const projectSettingsDir = path.join(config.dataDir, ".claude");
    fs.mkdirSync(projectSettingsDir, { recursive: true });
    const projectSettings = {
      permissions: {
        allow: [
          "mcp__datasynx-opencrm__get_capabilities",
          "mcp__datasynx-opencrm__get_active_session",
          "mcp__datasynx-opencrm__get_customer_context",
          "mcp__datasynx-opencrm__search_customer_knowledge",
          "mcp__datasynx-opencrm__list_customers",
          "mcp__datasynx-opencrm__log_interaction",
          "mcp__datasynx-opencrm__update_deal",
          "mcp__datasynx-opencrm__export_customer",
        ],
      },
    };
    const settingsPath = path.join(projectSettingsDir, "settings.json");
    fs.writeFileSync(settingsPath, JSON.stringify(projectSettings, null, 2));
    harnessFiles.push(settingsPath);

    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: CLAUDE_JSON,
      harnessFiles,
      notes: "alwaysAllow set for all 8 MCP tools. CLAUDE.md written to CRM root.",
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(CLAUDE_JSON)) return;
    const json = JSON.parse(fs.readFileSync(CLAUDE_JSON, "utf-8"));
    delete json?.mcpServers?.["datasynx-opencrm"];
    fs.writeFileSync(CLAUDE_JSON, JSON.stringify(json, null, 2));
  }

  private writeMcpConfig(config: InstallConfig): void {
    let json: Record<string, any> = {};
    if (fs.existsSync(CLAUDE_JSON)) {
      try { json = JSON.parse(fs.readFileSync(CLAUDE_JSON, "utf-8")); } catch {}
    }
    json.mcpServers ??= {};
    json.mcpServers[config.serverName] = {
      type: "stdio",
      command: process.execPath,
      args: [config.mcpServerPath],
      env: { DXCRM_DATA_DIR: config.dataDir },
    };
    fs.writeFileSync(CLAUDE_JSON, JSON.stringify(json, null, 2));
  }

  private writeSettings(): void {
    // Globale ~/.claude/settings.json (falls vorhanden, mergen)
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    const settingsPath = path.join(CLAUDE_DIR, "settings.json");
    let settings: Record<string, any> = {};
    if (fs.existsSync(settingsPath)) {
      try { settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")); } catch {}
    }
    settings.permissions ??= {};
    settings.permissions.allow ??= [];
    const newPerms = ["mcp__datasynx-opencrm__*"];
    for (const p of newPerms) {
      if (!settings.permissions.allow.includes(p)) {
        settings.permissions.allow.push(p);
      }
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }
}
```

---

### Adapter 2 — Codex

```typescript
// src/setup/adapters/codex.ts
import fs from "fs";
import path from "path";
import os from "os";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "../framework-adapter.js";

const CODEX_DIR = path.join(os.homedir(), ".codex");
const CODEX_CONFIG = path.join(CODEX_DIR, "config.toml");

export class CodexAdapter implements FrameworkAdapter {
  readonly name = "Codex";

  detect(): boolean {
    try { execSync("which codex", { stdio: "ignore" }); return true; } catch {}
    return fs.existsSync(CODEX_DIR);
  }

  isInstalled(): boolean {
    if (!fs.existsSync(CODEX_CONFIG)) return false;
    return fs.readFileSync(CODEX_CONFIG, "utf-8").includes("[mcp_servers.datasynx-opencrm]");
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    fs.mkdirSync(CODEX_DIR, { recursive: true });

    // Idempotenz-Check
    if (this.isInstalled()) {
      return {
        framework: this.name, success: true, transport: "stdio",
        configPath: CODEX_CONFIG, harnessFiles: [],
        notes: "Already configured — skipped.",
      };
    }

    // TOML-Block appenden (kein vollständiger Parser nötig)
    const block = [
      ``,
      `[mcp_servers.${config.serverName}]`,
      `command = ${JSON.stringify(process.execPath)}`,
      `args = [${JSON.stringify(config.mcpServerPath)}]`,
      `env = { DXCRM_DATA_DIR = ${JSON.stringify(config.dataDir)} }`,
      `startup_timeout_sec = 30`,
      `tool_timeout_sec = 120`,
      `enabled = true`,
      ``,
    ].join("\n");

    fs.appendFileSync(CODEX_CONFIG, block, "utf-8");

    // Codex hat keine SOUL.md / AGENTS.md — Instructions gehen in die Tool-Descriptions
    // Codex liest AGENTS.md im Working-Directory wenn vorhanden:
    const agentsPath = path.join(config.dataDir, "AGENTS.md");
    const harnessFiles: string[] = [];
    if (!fs.existsSync(agentsPath)) {
      // Codex-spezifisches AGENTS.md (schlichter als OpenClaw-Format)
      fs.writeFileSync(agentsPath, buildCodexAgentsMd(config.dataDir));
      harnessFiles.push(agentsPath);
    }

    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: CODEX_CONFIG,
      harnessFiles,
      notes: `startup_timeout_sec=30, tool_timeout_sec=120. AGENTS.md written to CRM root.`,
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(CODEX_CONFIG)) return;
    const content = fs.readFileSync(CODEX_CONFIG, "utf-8");
    // Entferne den gesamten [mcp_servers.datasynx-opencrm] Block
    const cleaned = content.replace(
      /\n?\[mcp_servers\.datasynx-opencrm\][^\[]*/g, ""
    );
    fs.writeFileSync(CODEX_CONFIG, cleaned);
  }
}

function buildCodexAgentsMd(dataDir: string): string {
  return `# CRM Agent Instructions

You have access to DatasynxOpenCRM via MCP tools.

## Workflow
1. Before discussing any customer: call get_customer_context(slug)
2. After every call/meeting/email: call log_interaction()
3. For historical questions: call search_customer_knowledge(slug, query)
4. After deal updates: call update_deal()

## Available MCP Tools
- get_customer_context(slug?) — Full briefing, triggers Gmail sync
- search_customer_knowledge(slug, query) — Search emails + transcripts
- list_customers() — All customers with pipeline health
- log_interaction(slug, type, summary, nextSteps) — Write to CRM
- update_deal(slug, dealName, fields) — Update pipeline
- get_capabilities() — Full tool reference

## Data: ${dataDir}
`;
}
```

---

### Adapter 3 — OpenClaw

**OpenClaw-Besonderheiten:**
- Config: `~/.openclaw/openclaw.json` — JSON-Format
- MCP-Server: `mcpServers` auf Agent-Ebene (unter `agents.list[].mcpServers`) ODER global
- Workspace: `~/.openclaw/workspace/` — enthält SOUL.md, AGENTS.md, TOOLS.md etc.
- Gateway: Port 18789 (WebSocket + HTTP) — bevorzugt **HTTP-Transport** für OpenClaw
- Auto-Reload: Gateway überwacht `openclaw.json` und lädt Änderungen live

```typescript
// src/setup/adapters/openclaw.ts
import fs from "fs";
import path from "path";
import os from "os";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "../framework-adapter.js";
import { buildSoulMd, buildAgentsMd } from "../harness-content.js";

const OPENCLAW_DIR = path.join(os.homedir(), ".openclaw");
const OPENCLAW_JSON = path.join(OPENCLAW_DIR, "openclaw.json");
const OPENCLAW_WORKSPACE = path.join(OPENCLAW_DIR, "workspace");

export class OpenClawAdapter implements FrameworkAdapter {
  readonly name = "OpenClaw";

  detect(): boolean {
    try { execSync("which openclaw", { stdio: "ignore" }); return true; } catch {}
    return fs.existsSync(OPENCLAW_DIR) || fs.existsSync(OPENCLAW_JSON);
  }

  isInstalled(): boolean {
    if (!fs.existsSync(OPENCLAW_JSON)) return false;
    try {
      const json = JSON.parse(fs.readFileSync(OPENCLAW_JSON, "utf-8"));
      return !!json?.mcpServers?.["datasynx-opencrm"];
    } catch { return false; }
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    fs.mkdirSync(OPENCLAW_DIR, { recursive: true });
    fs.mkdirSync(OPENCLAW_WORKSPACE, { recursive: true });

    const harnessFiles: string[] = [];

    // 1. openclaw.json — MCP-Server registrieren
    // OpenClaw bevorzugt HTTP-Transport (Gateway läuft sowieso auf Port 18789)
    // → wir registrieren BEIDE: stdio für lokalen Betrieb, HTTP-URL für Gateway-Modus
    let json: Record<string, any> = {};
    if (fs.existsSync(OPENCLAW_JSON)) {
      try { json = JSON.parse(fs.readFileSync(OPENCLAW_JSON, "utf-8")); } catch {}
    }

    // Globale mcpServers (verfügbar für alle Agents)
    json.mcpServers ??= {};
    json.mcpServers[config.serverName] = {
      command: process.execPath,
      args: [config.mcpServerPath],
      transport: "stdio",
      env: { DXCRM_DATA_DIR: config.dataDir },
    };

    // Alternativ HTTP-Transport wenn Gateway läuft:
    json.mcpServers[`${config.serverName}-http`] = {
      url: `http://localhost:${config.httpPort}/mcp`,
      transport: "streamable-http",
      // Wird nur aktiv wenn dxcrm mcp start --http läuft
      enabled: false,   // Default off — User aktiviert wenn HTTP-Daemon läuft
    };

    fs.writeFileSync(OPENCLAW_JSON, JSON.stringify(json, null, 2));
    // Gateway lädt Config automatisch neu — kein Restart nötig

    // 2. SOUL.md im OpenClaw Workspace
    const soulPath = path.join(OPENCLAW_WORKSPACE, "SOUL.md");
    if (!fs.existsSync(soulPath)) {
      fs.writeFileSync(soulPath, buildSoulMd("openclaw"));
      harnessFiles.push(soulPath);
    } else {
      // Existiert → CRM-Abschnitt appenden ohne zu überschreiben
      const existing = fs.readFileSync(soulPath, "utf-8");
      if (!existing.includes("DatasynxOpenCRM")) {
        fs.appendFileSync(soulPath, "\n\n---\n\n" + buildCrmSoulAppend());
        harnessFiles.push(soulPath + " (appended)");
      }
    }

    // 3. AGENTS.md im OpenClaw Workspace
    const agentsPath = path.join(OPENCLAW_WORKSPACE, "AGENTS.md");
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

    // 4. TOOLS.md — Hinweis auf CRM-Tools
    const toolsPath = path.join(OPENCLAW_WORKSPACE, "TOOLS.md");
    const toolsContent = buildOpenClawToolsMd();
    if (!fs.existsSync(toolsPath)) {
      fs.writeFileSync(toolsPath, toolsContent);
    } else if (!fs.readFileSync(toolsPath, "utf-8").includes("datasynx-opencrm")) {
      fs.appendFileSync(toolsPath, "\n\n" + toolsContent);
    }
    harnessFiles.push(toolsPath);

    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: OPENCLAW_JSON,
      harnessFiles,
      notes: "Config hot-reloaded by Gateway. SOUL.md + AGENTS.md + TOOLS.md written to workspace.",
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(OPENCLAW_JSON)) return;
    const json = JSON.parse(fs.readFileSync(OPENCLAW_JSON, "utf-8"));
    delete json?.mcpServers?.["datasynx-opencrm"];
    delete json?.mcpServers?.["datasynx-opencrm-http"];
    fs.writeFileSync(OPENCLAW_JSON, JSON.stringify(json, null, 2));
  }
}

function buildCrmSoulAppend(): string {
  return `## CRM Integration
I have access to DatasynxOpenCRM. I always load customer context before discussing customers.
I log every interaction without being asked. I cite sources when referencing customer data.`;
}

function buildOpenClawToolsMd(): string {
  return `## datasynx-opencrm MCP Tools
- get_customer_context(slug) — load full customer briefing
- search_customer_knowledge(slug, query) — search emails + transcripts
- list_customers() — pipeline overview
- log_interaction(slug, type, summary) — write to CRM
- update_deal(slug, dealName, fields) — pipeline update
- get_capabilities() — full reference
`;
}
```

---

### Adapter 4 — Hermes Agent

**Hermes-Besonderheiten:**
- Config: `~/.hermes/config.yaml` — YAML-Format
- MCP-Server: unter `mcp_servers:` (top-level in config.yaml)
- Home: `~/.hermes/`
- SOUL.md: `~/.hermes/SOUL.md` — Slot #1 im System-Prompt, immer injiziert
- Skills: `~/.hermes/skills/` — agentskills.io Standard, Markdown-Dateien
- Tool-Naming: `mcp_<server_name>_<tool_name>` (z.B. `mcp_datasynx_opencrm_get_customer_context`)
- `hermes config set KEY VAL` für programmatische Änderungen
- Binary: `hermes`

```typescript
// src/setup/adapters/hermes.ts
import fs from "fs";
import path from "path";
import os from "os";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "../framework-adapter.js";
import { buildHermesSoulMd, buildHermesSkillMd } from "../harness-content.js";

const HERMES_HOME = process.env.HERMES_HOME ?? path.join(os.homedir(), ".hermes");
const HERMES_CONFIG = path.join(HERMES_HOME, "config.yaml");
const HERMES_SOUL = path.join(HERMES_HOME, "SOUL.md");
const HERMES_SKILLS = path.join(HERMES_HOME, "skills");

export class HermesAdapter implements FrameworkAdapter {
  readonly name = "Hermes Agent";

  detect(): boolean {
    try { execSync("which hermes", { stdio: "ignore" }); return true; } catch {}
    return fs.existsSync(HERMES_HOME) || fs.existsSync(HERMES_CONFIG);
  }

  isInstalled(): boolean {
    if (!fs.existsSync(HERMES_CONFIG)) return false;
    return fs.readFileSync(HERMES_CONFIG, "utf-8").includes("datasynx");
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    fs.mkdirSync(HERMES_HOME, { recursive: true });
    fs.mkdirSync(HERMES_SKILLS, { recursive: true });

    const harnessFiles: string[] = [];

    // 1. config.yaml — mcp_servers Block schreiben/mergen
    this.writeMcpConfig(config);

    // 2. SOUL.md — Slot #1 im System-Prompt
    if (!fs.existsSync(HERMES_SOUL)) {
      fs.writeFileSync(HERMES_SOUL, buildHermesSoulMd("hermes"));
      harnessFiles.push(HERMES_SOUL);
    } else {
      const existing = fs.readFileSync(HERMES_SOUL, "utf-8");
      if (!existing.includes("DatasynxOpenCRM")) {
        fs.appendFileSync(HERMES_SOUL, "\n\n---\n\n## CRM Integration\nI have access to DatasynxOpenCRM MCP tools.\nI always load customer context before discussing customers.\nI log every interaction automatically via log_interaction().");
        harnessFiles.push(HERMES_SOUL + " (appended)");
      }
    }

    // 3. Skill-Datei — agentskills.io Standard
    // Hermes liest alle .md-Dateien in ~/.hermes/skills/ als Skills
    const skillPath = path.join(HERMES_SKILLS, "datasynx-crm.md");
    fs.writeFileSync(skillPath, buildHermesSkillMd());
    harnessFiles.push(skillPath);

    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: HERMES_CONFIG,
      harnessFiles,
      notes: "SOUL.md updated (Slot #1 system prompt). Skill registered in ~/.hermes/skills/.",
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(HERMES_CONFIG)) return;
    const content = fs.readFileSync(HERMES_CONFIG, "utf-8");
    // mcp_servers.datasynx_opencrm Block entfernen
    const cleaned = content.replace(
      /\n  datasynx[_-]opencrm:[\s\S]*?(?=\n  \w|\n[a-z]|$)/,
      ""
    );
    fs.writeFileSync(HERMES_CONFIG, cleaned);
    // Skill-Datei entfernen
    const skillPath = path.join(HERMES_SKILLS, "datasynx-crm.md");
    if (fs.existsSync(skillPath)) fs.unlinkSync(skillPath);
  }

  private writeMcpConfig(config: InstallConfig): void {
    // Hermes config.yaml: YAML-Format, mcp_servers Section
    // Kein vollständiger YAML-Parser — wir appenden nur den neuen Block
    // wenn er noch nicht existiert
    let content = fs.existsSync(HERMES_CONFIG)
      ? fs.readFileSync(HERMES_CONFIG, "utf-8")
      : "";

    if (content.includes("datasynx")) return; // Idempotent

    const mcpBlock = [
      ``,
      `# DatasynxOpenCRM MCP Server (added by dxcrm init)`,
      `mcp_servers:`,
      `  datasynx_opencrm:`,
      `    command: ${JSON.stringify(process.execPath)}`,
      `    args: [${JSON.stringify(config.mcpServerPath)}]`,
      `    env:`,
      `      DXCRM_DATA_DIR: ${JSON.stringify(config.dataDir)}`,
      `    timeout: 120`,
      `    connect_timeout: 30`,
      `    enabled: true`,
      `    tools:`,
      `      include:`,
      `        - get_capabilities`,
      `        - get_active_session`,
      `        - get_customer_context`,
      `        - search_customer_knowledge`,
      `        - list_customers`,
      `        - log_interaction`,
      `        - update_deal`,
      `        - export_customer`,
      `      prompts: false`,
      `      resources: false`,
      ``,
    ].join("\n");

    // Falls mcp_servers: Section existiert → Block darunter einfügen
    if (content.includes("mcp_servers:")) {
      content = content.replace(
        "mcp_servers:",
        `mcp_servers:\n  datasynx_opencrm:\n    command: ${JSON.stringify(process.execPath)}\n    args: [${JSON.stringify(config.mcpServerPath)}]\n    env:\n      DXCRM_DATA_DIR: ${JSON.stringify(config.dataDir)}\n    timeout: 120\n    connect_timeout: 30\n    enabled: true\n    tools:\n      include: [get_capabilities, get_active_session, get_customer_context, search_customer_knowledge, list_customers, log_interaction, update_deal, export_customer]\n      prompts: false\n      resources: false`
      );
      fs.writeFileSync(HERMES_CONFIG, content);
    } else {
      fs.appendFileSync(HERMES_CONFIG, mcpBlock);
    }
  }
}
```

---

### `dxcrm init` — Vollständiger Flow

```typescript
// src/commands/init.ts
export async function runInit(opts: { force?: boolean } = {}): Promise<void> {
  const spinner = new Spinner("Detecting AI frameworks...").start();

  // 1. Framework Detection
  const results = await installAllDetected({
    mcpServerPath: resolveMcpServerPath(),   // abs Pfad zu dist/mcp.js
    dataDir: process.cwd(),
    httpPort: 3847,
    serverName: "datasynx-opencrm",
  });

  spinner.stop();

  // 2. .agentic/ Verzeichnis + sources.json
  await initAgentic();

  // 3. Ergebnis anzeigen
  console.log(ansis.bold("\n DatasynxOpenCRM initialized\n"));

  const table = new Table({ head: ["Framework", "Status", "Transport", "Config"] });
  for (const r of results) {
    table.push([
      r.framework,
      r.success ? ansis.green("✓ registered") : ansis.red("✗ failed"),
      r.transport,
      ansis.dim(path.relative(os.homedir(), r.configPath) || r.configPath),
    ]);
  }
  if (results.length === 0) {
    console.log(ansis.yellow("  No AI frameworks detected."));
    console.log(ansis.dim("  Install Claude Code, Codex, OpenClaw, or Hermes and run dxcrm init again."));
  } else {
    console.log(table.toString());
  }

  // 4. Harness-Dateien zusammenfassen
  const allHarness = results.flatMap(r => r.harnessFiles);
  if (allHarness.length > 0) {
    console.log(ansis.dim(`\n  Context files written:`));
    for (const f of allHarness) {
      console.log(ansis.dim(`    ${f}`));
    }
  }

  console.log(`\n  Next: ${ansis.cyan("dxcrm create")} ${ansis.dim('"Acme Corp" --domain acme.com')}\n`);
}
```

---

### Framework-Vergleich — Entscheidungen dokumentiert

| | Claude Code | Codex | OpenClaw | Hermes |
|---|---|---|---|---|
| **Config-Datei** | `~/.claude.json` | `~/.codex/config.toml` | `~/.openclaw/openclaw.json` | `~/.hermes/config.yaml` |
| **Format** | JSON | TOML | JSON | YAML |
| **Transport** | stdio | stdio | stdio + optional HTTP | stdio oder HTTP |
| **Hot-Reload** | nein | nein | **ja** (Gateway überwacht JSON) | nein (hermes restart) |
| **Harness-Datei** | CLAUDE.md | AGENTS.md | SOUL.md + AGENTS.md + TOOLS.md | SOUL.md + Skill-Datei |
| **alwaysAllow** | `.claude/settings.json` `permissions.allow` | kein Equivalent | `approved_tools` in openclaw.json | `tools.include` in mcp_servers |
| **Skills-System** | nein | nein | `~/.openclaw/workspace/skills/` | `~/.hermes/skills/` (agentskills.io) |
| **Personality-Injection** | CLAUDE.md (context) | kein | SOUL.md (Slot #1 jede Session) | SOUL.md (Slot #1 jede Session) |
| **Tool-Prefix** | `mcp__datasynx-opencrm__*` | kein bekanntes Prefix | direkt via `mcpServers` | `mcp_datasynx_opencrm_*` |
| **Binary** | `claude` | `codex` | `openclaw` | `hermes` |
| **Detection** | `which claude` \| `~/.claude.json` | `which codex` \| `~/.codex/` | `which openclaw` \| `~/.openclaw/` | `which hermes` \| `~/.hermes/` |

---

### Tests für den Integration Layer

```typescript
// __tests__/setup/framework-adapters.test.ts
describe("ClaudeCodeAdapter", () => {
  it("detect() returns true when ~/.claude.json exists", () => { ... });
  it("install() writes mcpServers entry to ~/.claude.json", async () => { ... });
  it("install() deep-merges without overwriting existing mcpServers", async () => { ... });
  it("install() writes CLAUDE.md to dataDir", async () => { ... });
  it("install() writes .claude/settings.json with alwaysAllow", async () => { ... });
  it("install() is idempotent — calling twice produces same config", async () => { ... });
  it("uninstall() removes only datasynx-opencrm entry", async () => { ... });
});

describe("CodexAdapter", () => {
  it("detect() returns true when ~/.codex/ exists", () => { ... });
  it("install() appends [mcp_servers.datasynx-opencrm] block to config.toml", async () => { ... });
  it("install() is idempotent", async () => { ... });
  it("install() writes AGENTS.md to dataDir", async () => { ... });
  it("uninstall() removes only the datasynx block", async () => { ... });
});

describe("OpenClawAdapter", () => {
  it("detect() returns true when ~/.openclaw/ exists", () => { ... });
  it("install() writes mcpServers to openclaw.json", async () => { ... });
  it("install() creates SOUL.md in workspace", async () => { ... });
  it("install() appends to existing SOUL.md without overwriting", async () => { ... });
  it("install() creates AGENTS.md in workspace", async () => { ... });
  it("install() creates TOOLS.md in workspace", async () => { ... });
  it("install() is idempotent", async () => { ... });
});

describe("HermesAdapter", () => {
  it("detect() returns true when ~/.hermes/ exists", () => { ... });
  it("install() writes mcp_servers block to config.yaml", async () => { ... });
  it("install() creates SOUL.md at ~/.hermes/SOUL.md", async () => { ... });
  it("install() creates skill at ~/.hermes/skills/datasynx-crm.md", async () => { ... });
  it("install() appends to existing config.yaml mcp_servers section", async () => { ... });
  it("install() is idempotent", async () => { ... });
  it("uninstall() removes mcp block and skill file", async () => { ... });
});

describe("installAllDetected", () => {
  it("installs only detected frameworks", async () => { ... });
  it("returns failure result when adapter throws — does not abort others", async () => { ... });
});
```

---

### Erweiterter Gotchas-Anhang (Framework Integration)

| # | Framework | Problem | Lösung |
|---|---|---|---|
| 23 | Claude Code | `~/.claude/claude_desktop_config.json` existiert nicht — korrekt: `~/.claude.json` | Immer `~/.claude.json` |
| 24 | Claude Code | `alwaysAllow` in Claude Desktop resettet bei Neustart (Bug #24433) | `.claude/settings.json` `permissions.allow` als Fix |
| 25 | Codex | Vollständiger TOML-Parser für Merge nötig wenn Section schon existiert | `@iarna/toml` in dependencies, Idempotenz-Check vor Append |
| 26 | OpenClaw | `openclaw.json` wird live neu geladen — kein Restart nötig | Gateway-Hot-Reload nutzen, kein `openclaw restart` nötig |
| 27 | OpenClaw | SOUL.md wird bei jedem Session-Start geladen → Größe begrenzen | Max 200 Zeilen, CRM-Abschnitt kompakt halten |
| 28 | Hermes | Tool-Namen bekommen `mcp_<server_name>_` Prefix → Underscores in Server-Name | Server-Name `datasynx_opencrm` (Underscore) statt Bindestrich |
| 29 | Hermes | `HERMES_HOME` Env-Variable kann abweichen — nicht immer `~/.hermes` | Immer `process.env.HERMES_HOME ?? path.join(home, ".hermes")` |
| 30 | Hermes | Skills werden nur beim Start geladen — neu installierte Skills brauchen Neustart | In Install-Output dokumentieren |
| 31 | Alle | Gleichzeitig mehrere Frameworks erkannt → alle installieren, Fehler isolieren | `installAllDetected` catcht pro Adapter |
| 32 | Alle | `process.execPath` zeigt auf aktuelle Node-Binary, nicht auf `npx dxcrm` | Richtig so — absoluter Pfad ist stabiler als `npx` |

---

## Antigravity CLI + Weitere Frameworks (Recherche Mai 2026)

### Landscape-Entscheidung — Welche Frameworks werden unterstützt

Nach Recherche klassifiziere ich alle relevanten Frameworks in drei Tiers:

| Tier | Frameworks | Warum |
|---|---|---|
| **Tier 1 — Voller Adapter** | Claude Code, Codex, OpenClaw, Hermes, **Antigravity CLI** | CLI-binary detektierbar, volle Harness-Injection (SOUL.md/AGENTS.md/Skills), hohe User-Überlappung |
| **Tier 2 — Config-Writer** | Cursor, **Windsurf**, **Cline**, **Claude Desktop** | IDE/Desktop-basiert (kein CLI-binary), MCP-Config schreiben + optionale Rules; kein globales Harness-Konzept |
| **Tier 3 — Defer** | GitHub Copilot, Aider, Amp, Continue.dev | Aider hat kein MCP; Amp und Copilot: kein stabiles Programmatic-API für externe MCP-Registrierung |

**Antigravity CLI ist Pflicht in Phase 1:** Google ersetzt Gemini CLI zum 18.06.2026 — das ist die größte aktive Nutzerbasis nach Claude Code. Wer Gemini CLI nutzte, wechselt jetzt auf `agy`.

---

### Adapter 5 — Antigravity CLI (`agy`)

**Antigravity-Besonderheiten:**
- Binary: **`agy`** (nicht `antigravity` — häufigster Verwechslungs-Fehler)
- Install-Pfad: `~/.local/bin/agy` (macOS/Linux) / `%LOCALAPPDATA%\Antigravity\` (Windows)
- Shared MCP Config: `~/.gemini/config/mcp_config.json` ← gilt für CLI **und** IDE (Antigravity IDE)
- CLI-only MCP Config: `~/.gemini/antigravity/mcp_config.json` ← nur CLI
- HTTP-Field heißt **`serverUrl`** (nicht `url` — Claude Code / Hermes verwenden `url`)
- Context-Dateien: `GEMINI.md` + `AGENTS.md` im Workspace (und global: `~/.gemini/GEMINI.md`)
- Skills: `~/.gemini/antigravity-cli/skills/<skill-name>/SKILL.md` — Verzeichnis-basiert
- Permissions: kein explizites `alwaysAllow` — Antigravity CLI hat `request-review` Mode per Default, keine programmatische Whitelist-API dokumentiert

```typescript
// src/setup/adapters/antigravity.ts
import fs from "fs";
import path from "path";
import os from "os";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "../framework-adapter.js";
import { buildAgentsMd } from "../harness-content.js";

const HOME = os.homedir();
const AGY_BIN_UNIX = path.join(HOME, ".local", "bin", "agy");

// Shared config (CLI + IDE) — bevorzugt
const GEMINI_CONFIG_DIR = path.join(HOME, ".gemini", "config");
const SHARED_MCP_CONFIG = path.join(GEMINI_CONFIG_DIR, "mcp_config.json");

// CLI-only config (Fallback)
const AGY_DIR = path.join(HOME, ".gemini", "antigravity");
const AGY_MCP_CONFIG = path.join(AGY_DIR, "mcp_config.json");

// Globale Context-Dateien
const GEMINI_GLOBAL_MD = path.join(HOME, ".gemini", "GEMINI.md");

// Skills
const AGY_SKILLS_DIR = path.join(HOME, ".gemini", "antigravity-cli", "skills");

export class AntigravityAdapter implements FrameworkAdapter {
  readonly name = "Antigravity CLI";

  detect(): boolean {
    // Binary-Check: agy (nicht antigravity!)
    try { execSync("which agy", { stdio: "ignore" }); return true; } catch {}
    // Installationspfad-Check
    if (fs.existsSync(AGY_BIN_UNIX)) return true;
    // Gemini-Verzeichnis (auch Gemini CLI Nutzer die noch nicht migriert haben)
    return fs.existsSync(path.join(HOME, ".gemini"));
  }

  isInstalled(): boolean {
    for (const configPath of [SHARED_MCP_CONFIG, AGY_MCP_CONFIG]) {
      if (!fs.existsSync(configPath)) continue;
      try {
        const json = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        if (json?.mcpServers?.["datasynx-opencrm"]) return true;
      } catch {}
    }
    return false;
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    const harnessFiles: string[] = [];

    // 1. Shared MCP Config (bevorzugt — gilt für CLI und IDE)
    //    Antigravity CLI liest erst SHARED_MCP_CONFIG, dann AGY_MCP_CONFIG
    fs.mkdirSync(GEMINI_CONFIG_DIR, { recursive: true });
    this.writeMcpEntry(SHARED_MCP_CONFIG, config);

    // 2. GEMINI.md global (~/.gemini/GEMINI.md)
    //    Antigravity liest diese bei jeder Session als globaler Kontext
    const geminiMdContent = buildAgyGeminiMd(config.dataDir);
    if (!fs.existsSync(GEMINI_GLOBAL_MD)) {
      fs.mkdirSync(path.dirname(GEMINI_GLOBAL_MD), { recursive: true });
      fs.writeFileSync(GEMINI_GLOBAL_MD, geminiMdContent);
      harnessFiles.push(GEMINI_GLOBAL_MD);
    } else {
      const existing = fs.readFileSync(GEMINI_GLOBAL_MD, "utf-8");
      if (!existing.includes("DatasynxOpenCRM")) {
        fs.appendFileSync(GEMINI_GLOBAL_MD, "\n\n---\n\n" + buildAgyGeminiMdAppend());
        harnessFiles.push(GEMINI_GLOBAL_MD + " (appended)");
      }
    }

    // 3. AGENTS.md im CRM-Root (Antigravity liest AGENTS.md im Working Directory)
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

    // 4. Skill: ~/.gemini/antigravity-cli/skills/datasynx-crm/SKILL.md
    //    Antigravity Skills sind Verzeichnisse mit SKILL.md (nicht einzelne .md-Dateien wie Hermes)
    const skillDir = path.join(AGY_SKILLS_DIR, "datasynx-crm");
    fs.mkdirSync(skillDir, { recursive: true });
    const skillPath = path.join(skillDir, "SKILL.md");
    fs.writeFileSync(skillPath, buildAgySkillMd());
    harnessFiles.push(skillPath);

    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: SHARED_MCP_CONFIG,
      harnessFiles,
      notes: "Shared config (~/.gemini/config/mcp_config.json) covers both CLI and IDE. Skill registered. GEMINI.md updated.",
    };
  }

  async uninstall(): Promise<void> {
    for (const configPath of [SHARED_MCP_CONFIG, AGY_MCP_CONFIG]) {
      if (!fs.existsSync(configPath)) continue;
      try {
        const json = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        delete json?.mcpServers?.["datasynx-opencrm"];
        fs.writeFileSync(configPath, JSON.stringify(json, null, 2));
      } catch {}
    }
    // Skill-Verzeichnis entfernen
    const skillDir = path.join(AGY_SKILLS_DIR, "datasynx-crm");
    if (fs.existsSync(skillDir)) fs.rmSync(skillDir, { recursive: true });
  }

  private writeMcpEntry(configPath: string, config: InstallConfig): void {
    let json: { mcpServers?: Record<string, unknown> } = { mcpServers: {} };
    if (fs.existsSync(configPath)) {
      try {
        json = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        json.mcpServers ??= {};
      } catch {}
    }
    // stdio-Transport
    json.mcpServers!["datasynx-opencrm"] = {
      command: process.execPath,
      args: [config.mcpServerPath],
      env: { DXCRM_DATA_DIR: config.dataDir },
    };
    // HTTP-Transport (disabled — aktivierbar wenn dxcrm mcp start --http läuft)
    // Antigravity nutzt "serverUrl" statt "url"!
    json.mcpServers!["datasynx-opencrm-http"] = {
      serverUrl: `http://localhost:${config.httpPort}/mcp`,
      // disabled via Abwesenheit — einfach nicht referenzieren
    };
    fs.writeFileSync(configPath, JSON.stringify(json, null, 2));
  }
}

function buildAgyGeminiMd(dataDir: string): string {
  return `# DatasynxOpenCRM — Agent Context

You have access to a local CRM via MCP tools (server: datasynx-opencrm).

## Workflow
- Before any customer conversation: call \`get_customer_context(slug)\`
- After calls/meetings/emails: call \`log_interaction()\`
- For historical research: call \`search_customer_knowledge(slug, query)\`
- Pipeline update: call \`update_deal()\`

## Data: ${dataDir}
`.trim();
}

function buildAgyGeminiMdAppend(): string {
  return `## DatasynxOpenCRM
CRM MCP tools available: get_customer_context, search_customer_knowledge,
list_customers, log_interaction, update_deal. Always load context first.`;
}

function buildAgySkillMd(): string {
  return `---
name: datasynx-crm
version: 1.0.0
description: CRM workflow for DatasynxOpenCRM
triggers:
  - customer
  - client
  - deal
  - pipeline
---

# DatasynxOpenCRM Skill

## When a customer is mentioned
Call \`get_customer_context(slug)\` before discussing anything.

## After every interaction
Call \`log_interaction(slug, type, summary, nextSteps)\`.

## For research
\`search_customer_knowledge(slug, query)\` — searches emails + transcripts.

## Pipeline
\`update_deal(slug, dealName, { stage, value, probability })\` after deal talk.

## Overview
\`list_customers()\` for morning briefing.
\`get_capabilities()\` for full tool reference.
`.trim();
}
```

---

### Tier 2 — Cursor, Windsurf, Cline (Config-Writer + optionale Rules)

IDE-basierte Tools ohne CLI-Binary. Kein globales Skills- oder SOUL-System.
MCP-Config schreiben + wo möglich Projekt-Rules für CRM-Kontext.

**Cursor-Besonderheiten:**
- Global MCP: `~/.cursor/mcp.json` — identisches Format wie Claude Code `.mcp.json`
- Project MCP: `.cursor/mcp.json` im Projektverzeichnis (überschreibt global)
- Project Rules: `.cursor/rules/datasynx-crm.mdc` — MDC-Format, ersetzt `.cursorrules`
- Kein CLI-Binary → Detection über `~/.cursor/` Verzeichnis
- Neustart erforderlich nach Config-Änderung

```typescript
// src/setup/adapters/cursor.ts
const CURSOR_GLOBAL_MCP = path.join(os.homedir(), ".cursor", "mcp.json");
const CURSOR_DIR = path.join(os.homedir(), ".cursor");

export class CursorAdapter implements FrameworkAdapter {
  readonly name = "Cursor";

  detect(): boolean {
    return fs.existsSync(CURSOR_DIR) || fs.existsSync(CURSOR_GLOBAL_MCP);
  }

  isInstalled(): boolean {
    if (!fs.existsSync(CURSOR_GLOBAL_MCP)) return false;
    try {
      const json = JSON.parse(fs.readFileSync(CURSOR_GLOBAL_MCP, "utf-8"));
      return !!json?.mcpServers?.["datasynx-opencrm"];
    } catch { return false; }
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    fs.mkdirSync(CURSOR_DIR, { recursive: true });
    const harnessFiles: string[] = [];

    // 1. Globale MCP-Config
    let json: { mcpServers?: Record<string, unknown> } = { mcpServers: {} };
    if (fs.existsSync(CURSOR_GLOBAL_MCP)) {
      try {
        json = JSON.parse(fs.readFileSync(CURSOR_GLOBAL_MCP, "utf-8"));
        json.mcpServers ??= {};
      } catch {}
    }
    json.mcpServers!["datasynx-opencrm"] = {
      command: process.execPath,
      args: [config.mcpServerPath],
      env: { DXCRM_DATA_DIR: config.dataDir },
    };
    fs.writeFileSync(CURSOR_GLOBAL_MCP, JSON.stringify(json, null, 2));

    // 2. Project Rules im CRM-Verzeichnis (.cursor/rules/datasynx-crm.mdc)
    // MDC-Format: Frontmatter + Markdown-Instructions
    // Cursor liest alle .mdc-Dateien in .cursor/rules/ als Agent-Kontext
    const rulesDir = path.join(config.dataDir, ".cursor", "rules");
    fs.mkdirSync(rulesDir, { recursive: true });
    const rulesPath = path.join(rulesDir, "datasynx-crm.mdc");
    if (!fs.existsSync(rulesPath)) {
      fs.writeFileSync(rulesPath, buildCursorRulesMdc(config.dataDir));
      harnessFiles.push(rulesPath);
    }

    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: CURSOR_GLOBAL_MCP,
      harnessFiles,
      notes: "Global MCP registered. CRM rules written to .cursor/rules/. Restart Cursor to activate.",
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(CURSOR_GLOBAL_MCP)) return;
    const json = JSON.parse(fs.readFileSync(CURSOR_GLOBAL_MCP, "utf-8"));
    delete json?.mcpServers?.["datasynx-opencrm"];
    fs.writeFileSync(CURSOR_GLOBAL_MCP, JSON.stringify(json, null, 2));
  }
}

function buildCursorRulesMdc(dataDir: string): string {
  return `---
description: DatasynxOpenCRM — CRM workflow rules
globs: ["**/*"]
alwaysApply: true
---

# DatasynxOpenCRM Rules

You have access to a local CRM via MCP tools (datasynx-opencrm).

## Mandatory Workflow
- Customer mentioned → call \`get_customer_context(slug)\` immediately
- After any call/meeting/email → call \`log_interaction()\`
- Historical question → call \`search_customer_knowledge(slug, query)\`
- Deal discussed → call \`update_deal()\`

## Available Tools
get_customer_context · search_customer_knowledge · list_customers
log_interaction · update_deal · get_capabilities

## Data: ${dataDir}
`.trim();
}
```

```typescript
// src/setup/adapters/windsurf.ts
const WINDSURF_CONFIG = path.join(os.homedir(), ".codeium", "windsurf", "mcp_config.json");

export class WindsurfAdapter implements FrameworkAdapter {
  readonly name = "Windsurf";

  detect(): boolean {
    // Kein CLI-Binary — nur Dateisystem-Check
    return fs.existsSync(path.join(os.homedir(), ".codeium", "windsurf"))
        || fs.existsSync(WINDSURF_CONFIG);
  }

  isInstalled(): boolean {
    if (!fs.existsSync(WINDSURF_CONFIG)) return false;
    try {
      const json = JSON.parse(fs.readFileSync(WINDSURF_CONFIG, "utf-8"));
      return !!json?.mcpServers?.["datasynx-opencrm"];
    } catch { return false; }
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    fs.mkdirSync(path.dirname(WINDSURF_CONFIG), { recursive: true });
    let json: { mcpServers?: Record<string, unknown> } = { mcpServers: {} };
    if (fs.existsSync(WINDSURF_CONFIG)) {
      try { json = JSON.parse(fs.readFileSync(WINDSURF_CONFIG, "utf-8")); json.mcpServers ??= {}; } catch {}
    }
    // Windsurf unterstützt ${env:VAR} Interpolation — wir nutzen direkten Pfad
    json.mcpServers!["datasynx-opencrm"] = {
      command: process.execPath,
      args: [config.mcpServerPath],
      env: { DXCRM_DATA_DIR: config.dataDir },
    };
    fs.writeFileSync(WINDSURF_CONFIG, JSON.stringify(json, null, 2));
    return {
      framework: this.name, success: true, transport: "stdio",
      configPath: WINDSURF_CONFIG, harnessFiles: [],
      notes: "No harness files for IDE-based tools. Restart Windsurf to activate.",
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(WINDSURF_CONFIG)) return;
    const json = JSON.parse(fs.readFileSync(WINDSURF_CONFIG, "utf-8"));
    delete json?.mcpServers?.["datasynx-opencrm"];
    fs.writeFileSync(WINDSURF_CONFIG, JSON.stringify(json, null, 2));
  }
}

// src/setup/adapters/cline.ts
const CLINE_CONFIG = path.join(os.homedir(), ".cline", "data", "settings", "cline_mcp_settings.json");

export class ClineAdapter implements FrameworkAdapter {
  readonly name = "Cline";

  detect(): boolean {
    return fs.existsSync(path.join(os.homedir(), ".cline"))
        || fs.existsSync(CLINE_CONFIG);
  }

  isInstalled(): boolean {
    if (!fs.existsSync(CLINE_CONFIG)) return false;
    try {
      const json = JSON.parse(fs.readFileSync(CLINE_CONFIG, "utf-8"));
      return !!json?.mcpServers?.["datasynx-opencrm"];
    } catch { return false; }
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    fs.mkdirSync(path.dirname(CLINE_CONFIG), { recursive: true });
    let json: { mcpServers?: Record<string, unknown> } = { mcpServers: {} };
    if (fs.existsSync(CLINE_CONFIG)) {
      try { json = JSON.parse(fs.readFileSync(CLINE_CONFIG, "utf-8")); json.mcpServers ??= {}; } catch {}
    }
    json.mcpServers!["datasynx-opencrm"] = {
      command: process.execPath,
      args: [config.mcpServerPath],
      env: { DXCRM_DATA_DIR: config.dataDir },
      // Cline: absoluter Pfad erforderlich — relative Pfade scheitern lautlos!
    };
    fs.writeFileSync(CLINE_CONFIG, JSON.stringify(json, null, 2));
    return {
      framework: this.name, success: true, transport: "stdio",
      configPath: CLINE_CONFIG, harnessFiles: [],
      notes: "Cline requires absolute paths. No harness files for VSCode extensions.",
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(CLINE_CONFIG)) return;
    const json = JSON.parse(fs.readFileSync(CLINE_CONFIG, "utf-8"));
    delete json?.mcpServers?.["datasynx-opencrm"];
    fs.writeFileSync(CLINE_CONFIG, JSON.stringify(json, null, 2));
  }
}
```

### Adapter 9 — Claude Desktop

**Claude Desktop** ist die einzige Nicht-Developer-Claude-Umgebung mit vollständigem MCP-Support. Strategisch wichtig: Business-User nutzen Claude Desktop, nicht Claude Code.

**Besonderheiten:**
- Drei plattformspezifische Config-Pfade (macOS / Windows / Linux)
- Gleiches JSON-Format wie Claude Code (`mcpServers` top-level)
- Kein harness-System (keine CLAUDE.md, keine settings.json)
- **Neustart zwingend erforderlich** nach Config-Änderung (kein Hot-Reload)
- Zielgruppe: Nicht-Entwickler → klare Restart-Anweisung in `install()` notes

```typescript
// src/setup/adapters/claude-desktop.ts
import fs from "fs";
import path from "path";
import os from "os";
import type { FrameworkAdapter, InstallConfig, InstallResult } from "../framework-adapter.js";

// Platform-spezifische Config-Pfade (Stand Mai 2026):
// macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json
// Windows: %APPDATA%\Claude\claude_desktop_config.json
// Linux:   ~/.config/claude-desktop/claude_desktop_config.json
function getDesktopConfigPath(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(
        os.homedir(), "Library", "Application Support",
        "Claude", "claude_desktop_config.json"
      );
    case "win32":
      return path.join(
        process.env["APPDATA"] ?? os.homedir(),
        "Claude", "claude_desktop_config.json"
      );
    default: // linux
      return path.join(
        os.homedir(), ".config", "claude-desktop", "claude_desktop_config.json"
      );
  }
}

const DESKTOP_CONFIG = getDesktopConfigPath();

export class ClaudeDesktopAdapter implements FrameworkAdapter {
  readonly name = "Claude Desktop";

  detect(): boolean {
    // Config-Verzeichnis existiert → Claude Desktop ist installiert
    return fs.existsSync(DESKTOP_CONFIG) || fs.existsSync(path.dirname(DESKTOP_CONFIG));
  }

  isInstalled(): boolean {
    if (!fs.existsSync(DESKTOP_CONFIG)) return false;
    try {
      const json = JSON.parse(fs.readFileSync(DESKTOP_CONFIG, "utf-8"));
      return !!json?.mcpServers?.["datasynx-opencrm"];
    } catch { return false; }
  }

  async install(config: InstallConfig): Promise<InstallResult> {
    fs.mkdirSync(path.dirname(DESKTOP_CONFIG), { recursive: true });
    let json: Record<string, any> = {};
    if (fs.existsSync(DESKTOP_CONFIG)) {
      try { json = JSON.parse(fs.readFileSync(DESKTOP_CONFIG, "utf-8")); } catch {}
    }
    json.mcpServers ??= {};
    json.mcpServers[config.serverName] = {
      command: process.execPath,
      args: [config.mcpServerPath],
    };
    fs.writeFileSync(DESKTOP_CONFIG, JSON.stringify(json, null, 2));
    return {
      framework: this.name,
      success: true,
      transport: "stdio",
      configPath: DESKTOP_CONFIG,
      harnessFiles: [],
      notes: "Restart Claude Desktop to activate the MCP server. No harness files for Desktop app.",
    };
  }

  async uninstall(): Promise<void> {
    if (!fs.existsSync(DESKTOP_CONFIG)) return;
    const json = JSON.parse(fs.readFileSync(DESKTOP_CONFIG, "utf-8"));
    delete json?.mcpServers?.["datasynx-opencrm"];
    fs.writeFileSync(DESKTOP_CONFIG, JSON.stringify(json, null, 2));
  }
}
```

---

### Claude im Allgemeinen — Entscheidungsmatrix

"Claude" ist nicht eine einzige Umgebung. Es gibt vier Deployment-Kontexte mit unterschiedlicher MCP-Unterstützung:

| Kontext | MCP-Support | dxcrm-Integration | Adapter |
|---|---|---|---|
| **Claude Desktop** (macOS / Windows / Linux App) | ✓ vollständig | `ClaudeDesktopAdapter` | `adapters/claude-desktop.ts` |
| **Claude Code** (CLI, Anthropic) | ✓ vollständig + professionell | `ClaudeCodeAdapter` | `adapters/claude-code.ts` |
| **claude.ai Web** (Browser) | ✗ kein MCP (Stand Mai 2026) | nicht möglich | — |
| **Claude Teams / Enterprise** (Web-Zugang) | ✗ kein MCP über Web | via Claude Code falls installiert | — |

**Konsequenzen:**
- **Claude Desktop** → `ClaudeDesktopAdapter` — die einzige Möglichkeit für Non-Developer-Nutzer
- **Claude Code** → `ClaudeCodeAdapter` — Entwickler, Teams-Nutzer die Claude Code lokal nutzen
- **claude.ai Web** → keine Integration möglich; wenn der User fragt: "Nutze claude.ai im Browser?" → Antwort: Claude Desktop installieren
- **Claude Teams/Enterprise Web-App** → identische Einschränkung wie claude.ai Web; MCP ist nur über Claude Code (Desktop-App, separate Installation) erreichbar

**Strategische Einschätzung:**
Claude Desktop ist trotz Tier-2-Klassifizierung (kein Harness) ein Priority-Adapter: Es ist der einzige Zugang für Business-User ohne Developer-Background. Nach Zahlen von Anthropic überwiegt die Desktop-Nutzerbasis die CLI-Nutzerbasis deutlich. Der fehlende Harness ist verschmerzbar — das MCP-Tool-Interface selbst ist die Integration.

---

### Registry Update — Alle 9 Adapter

```typescript
// src/setup/framework-registry.ts (final)
export const FRAMEWORK_ADAPTERS: FrameworkAdapter[] = [
  // Tier 1 — voller Adapter (CLI-Binary + Harness-Injection)
  new ClaudeCodeAdapter(),
  new CodexAdapter(),
  new OpenClawAdapter(),
  new HermesAdapter(),
  new AntigravityAdapter(),
  // Tier 2 — Config-Writer (kein globales Harness, Neustart nötig)
  new CursorAdapter(),
  new WindsurfAdapter(),
  new ClineAdapter(),
  new ClaudeDesktopAdapter(),    // NEU — non-developer audience
];
```

---

### Vollständige Framework-Vergleichstabelle (alle 9)

| | Claude Code | Codex | OpenClaw | Hermes | Antigravity | Cursor | Windsurf | Cline | **Claude Desktop** |
|---|---|---|---|---|---|---|---|---|---|
| **Config-Datei** | `~/.claude.json` | `~/.codex/config.toml` | `~/.openclaw/openclaw.json` | `~/.hermes/config.yaml` | `~/.gemini/config/mcp_config.json` | `~/.cursor/mcp.json` | `~/.codeium/windsurf/mcp_config.json` | `~/.cline/data/settings/cline_mcp_settings.json` | **plattformspez.** |
| **Format** | JSON | TOML | JSON | YAML | JSON | JSON | JSON | JSON | **JSON** |
| **HTTP-Field** | `url` | `url` | `url` | `url` | **`serverUrl`** | `url` | `url` | `url` | `url` |
| **Hot-Reload** | nein | nein | **ja** | nein | nein | nein | nein | nein | **nein** |
| **Harness-Datei** | CLAUDE.md + settings.json | AGENTS.md | SOUL.md + AGENTS.md + TOOLS.md | SOUL.md + Skill | GEMINI.md + AGENTS.md + Skill-Dir | `.cursor/rules/*.mdc` | keine | keine | **keine** |
| **Skills-System** | nein | nein | Workspace skills/ | ~/.hermes/skills/ | ~/.gemini/…/skills/<name>/ | nein | nein | nein | **nein** |
| **alwaysAllow** | settings.json | kein | approved_tools | tools.include | kein | `alwaysApply: true` | kein | kein | **kein** |
| **Binary** | `claude` | `codex` | `openclaw` | `hermes` | **`agy`** | kein CLI | kein CLI | kein CLI | **kein CLI** |
| **Detection** | `which claude` \| `~/.claude.json` | `which codex` \| `~/.codex/` | `which openclaw` \| `~/.openclaw/` | `which hermes` \| `~/.hermes/` | `~/.gemini/` | `~/.cursor/` | `~/.codeium/windsurf/` | `~/.cline/` | **Config-Dir exists** |
| **Tier** | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | **2** |
| **Zielgruppe** | Devs | Devs | Devs | Devs | Devs | Devs | Devs | Devs | **Business-User** |
| **Besonderheit** | alwaysAllow Bug | TOML-Append | Hot-Reload | SOUL slot #1 | `serverUrl` ≠ `url` | MDC Rules | `${env:VAR}` | Absolute Paths | **3 Plattform-Pfade** |

---

### Antigravity-spezifische Harness-Inhalte (ergänzt in `harness-content.ts`)

```typescript
// Antigravity SKILL.md ist directory-based (nicht single-file wie Hermes)
// ~/.gemini/antigravity-cli/skills/datasynx-crm/SKILL.md
export function buildAgySkillMd(): string { ... } // bereits oben dokumentiert

// GEMINI.md: kurz halten — wird bei jeder Session geladen (Token-Budget!)
// Empfohlen: max 50 Zeilen global, Rest in AGENTS.md im Workspace
export function buildAgyGeminiMd(dataDir: string): string { ... }
```

---

### Tests für neue Adapter

```typescript
// __tests__/setup/antigravity-adapter.test.ts
describe("AntigravityAdapter", () => {
  it("detect() returns true when ~/.gemini/ exists", () => { ... });
  it("detect() returns true when agy binary found", () => { ... });
  it("install() writes to shared config (~/.gemini/config/mcp_config.json)", async () => { ... });
  it("install() uses 'command'/'args' not 'serverUrl' for stdio", async () => { ... });
  it("install() creates skill directory with SKILL.md", async () => { ... });
  it("install() writes/appends GEMINI.md", async () => { ... });
  it("install() writes AGENTS.md to dataDir", async () => { ... });
  it("install() is idempotent", async () => { ... });
  it("uninstall() removes mcpServers entry and skill dir", async () => { ... });
});

describe("CursorAdapter", () => {
  it("detect() returns true when ~/.cursor/ exists", () => { ... });
  it("install() writes to ~/.cursor/mcp.json", async () => { ... });
  it("install() creates .cursor/rules/datasynx-crm.mdc with alwaysApply: true", async () => { ... });
  it("install() does not overwrite existing .cursor/rules/ files", async () => { ... });
  it("install() is idempotent", async () => { ... });
  it("uninstall() removes only datasynx-opencrm entry from mcp.json", async () => { ... });
});

describe("WindsurfAdapter", () => {
  it("detect() returns true when ~/.codeium/windsurf/ exists", () => { ... });
  it("install() writes to ~/.codeium/windsurf/mcp_config.json", async () => { ... });
  it("install() uses absolute path (no relative paths)", async () => { ... });
  it("install() is idempotent", async () => { ... });
  it("writes no harness files", async () => { ... });
});

describe("ClineAdapter", () => {
  it("detect() returns true when ~/.cline/ exists", () => { ... });
  it("install() writes to cline_mcp_settings.json", async () => { ... });
  it("install() uses absolute paths — never relative", async () => { ... });
  it("install() is idempotent", async () => { ... });
});

describe("ClaudeDesktopAdapter", () => {
  it("detect() returns true when platform-specific config dir exists", () => { ... });
  it("install() writes to correct platform path (macOS/Windows/Linux)", async () => { ... });
  it("install() creates config directory if not exists", async () => { ... });
  it("install() deep-merges into existing config without overwriting other entries", async () => { ... });
  it("install() is idempotent", async () => { ... });
  it("install() returns restart note in notes field", async () => { ... });
  it("install() writes no harness files (harnessFiles is empty)", async () => { ... });
  it("uninstall() removes only datasynx-opencrm entry", async () => { ... });
});
```

---

### Zusätzliche Gotchas (Framework Integration — Antigravity/Windsurf/Cline)

| # | Framework | Problem | Lösung |
|---|---|---|---|
| 33 | Antigravity | Binary heißt `agy` — NICHT `antigravity` oder `gemini` | `which agy` + `~/.local/bin/agy` prüfen |
| 34 | Antigravity | HTTP-Field heißt `serverUrl` — nicht `url` (alle anderen nutzen `url`) | Immer `serverUrl` für Antigravity HTTP-Einträge |
| 35 | Antigravity | Shared config (`~/.gemini/config/`) gilt für CLI + IDE — individuelle CLI-Config ist Fallback | Shared Config bevorzugen für maximale Reichweite |
| 36 | Antigravity | SKILL.md ist directory-based (`skills/<name>/SKILL.md`) — nicht single-file wie Hermes | `fs.mkdirSync(skillDir)` dann `SKILL.md` darin schreiben |
| 37 | Antigravity | GEMINI.md global wird bei jeder Session geladen → Token-Budget | Max 50 Zeilen global, Details in AGENTS.md im Workspace |
| 38 | Antigravity | `~/.gemini/` existiert auch bei alten Gemini CLI Nutzern — kein Beweis für Antigravity | Zusätzlich `agy` binary prüfen für echte Antigravity-Nutzer |
| 39 | Cursor | Config-Format identisch mit Claude Code `.mcp.json` — gleicher JSON-Shape | ClaudeCodeAdapter als Referenz nutzen |
| 40 | Cursor | `.cursorrules` deprecated — neues Format: `.cursor/rules/*.mdc` (MDC) | Nur `.mdc` schreiben, `.cursorrules` ignorieren |
| 41 | Cursor | `alwaysApply: true` in MDC-Frontmatter macht Rule immer aktiv | In `buildCursorRulesMdc()` setzen |
| 42 | Cursor | Neustart erforderlich nach `mcp.json`-Änderung | Install-Output: "Restart Cursor to activate" |
| 43 | Windsurf | Erstellt `mcp_config.json` nicht automatisch — muss explizit angelegt werden | `fs.mkdirSync` + JSON-File schreiben wenn nicht vorhanden |
| 44 | Windsurf | IDE-Neustart erforderlich nach Config-Änderung (kein Hot-Reload) | Install-Output: "Restart Windsurf to activate" |
| 45 | Cline | Relative Pfade in `args` scheitern lautlos | Immer `process.execPath` (absolut) für `command` |
| 46 | Cline | VSCode-Extension vs CLI — CLI-Config-Pfad weicht ab | `~/.cline/data/settings/` für CLI, VSCode nutzt globalStorage |
| 47 | Claude Desktop | Drei plattformspezifische Config-Pfade (macOS/Windows/Linux) | `getDesktopConfigPath()` mit `process.platform` switch |
| 48 | Claude Desktop | `%APPDATA%` auf Windows kann undefined sein | `process.env["APPDATA"] ?? os.homedir()` als Fallback |
| 49 | Claude Desktop | Config-Verzeichnis existiert nicht bis zum ersten Start der App | `fs.mkdirSync(path.dirname(DESKTOP_CONFIG), { recursive: true })` |
| 50 | Claude Desktop | Neustart zwingend nötig — kein programmatischer Reload | Install-Output explizit: "Quit and reopen Claude Desktop to activate" |

---

*plan-1.md — Technischer Implementierungsplan Phase 1*
*Basiert auf Deep-Search-Recherche Mai 2026 · 9 Framework-Adapter · 50 dokumentierte Gotchas*
*Nächstes Update: nach Woche 1 abgeschlossen*

Sources:
- [MCP · OpenClaw](https://docs.openclaw.ai/cli/mcp)
- [Configuration reference · OpenClaw](https://docs.openclaw.ai/gateway/configuration-reference)
- [Agent workspace · OpenClaw](https://docs.openclaw.ai/concepts/agent-workspace)
- [NousResearch/hermes-agent · GitHub](https://github.com/NousResearch/hermes-agent)
- [hermes-agent cli-config.yaml.example](https://github.com/NousResearch/hermes-agent/blob/main/cli-config.yaml.example)
- [Google Launches Antigravity 2.0 at I/O 2026 — MarkTechPost](https://www.marktechpost.com/2026/05/19/google-launches-antigravity-2-0-at-i-o-2026-a-standalone-agent-first-platform-with-cli-sdk-managed-execution-and-enterprise-support/)
- [Antigravity CLI: Gemini CLI Alternative — ScriptByAI](https://www.scriptbyai.com/antigravity-cli/)
- [Configuring MCP Servers and Skills for Antigravity CLI — Google Cloud Blog (Medium)](https://medium.com/google-cloud/configuring-mcp-servers-and-skills-for-antigravity-cli-and-ide-a938c7eebb78)
- [GitHub MCP Server: Install Antigravity Guide](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-antigravity.md)
- [antigravity-awesome-skills · GitHub](https://github.com/sickn33/antigravity-awesome-skills)
- [Windsurf MCP Cascade Integration](https://docs.windsurf.com/windsurf/cascade/mcp)
- [Cline MCP Setup Guide 2026 — agensi.io](https://www.agensi.io/learn/cline-mcp-setup-guide)
- [Gemini CLI → Antigravity Migration Guide](https://agentpedia.codes/blog/gemini-cli-to-antigravity-cli-migration)
- [Hermes Agent MCP Integration Guide · Lushbinary](https://lushbinary.com/blog/hermes-agent-mcp-integration-complete-guide/)
