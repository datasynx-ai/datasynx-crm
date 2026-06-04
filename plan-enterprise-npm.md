# plan-enterprise-npm.md — DatasynxOpenCRM Enterprise npm Roadmap

> Gap-Analysis gegen den Enterprise npm Package Guide 2025/26.
> Priorität: P0 (Blocker), P1 (Critical), P2 (Important), P3 (Nice-to-have)

---

## Status-Übersicht (Ist vs. Soll)

| Bereich                  | Ist                              | Soll                              | Prio |
|--------------------------|----------------------------------|-----------------------------------|------|
| Package-Scope            | `datasynx-opencrm` (kein Scope)  | `@datasynx/agentic-crm`               | P0   |
| publishConfig + Provenance | fehlt komplett                 | `provenance: true` in CI          | P0   |
| CI/CD Pipeline           | **keine** GitHub Actions         | 4-Stage-Pipeline (lint→test→build→release) | P0 |
| Semantic Release          | manuelle Version (0.1.0)         | `semantic-release` oder Changesets | P1  |
| ESLint                   | fehlt                            | Flat Config + @typescript-eslint  | P1   |
| Dual ESM/CJS (Library)   | ESM-only (`tsdown`)              | ESM + CJS für Library-Exports     | P1   |
| publint + attw           | fehlt in `prepublishOnly`        | Pflicht vor jedem Publish         | P1   |
| `sideEffects: false`     | fehlt in package.json            | Tree-Shaking für Consumer         | P1   |
| npm audit in CI          | fehlt                            | `--audit-level=high` → Build fail | P1   |
| `@types/adm-zip` in deps | **Bug**: in `dependencies`       | muss in `devDependencies`         | P1   |
| commitlint + husky       | fehlt                            | Conventional Commits erzwingen    | P2   |
| Prettier                 | fehlt                            | Formatting-Checks in CI           | P2   |
| Lizenz-Audit             | fehlt                            | GPL-Blocking in CI                | P2   |
| SBOM                     | fehlt                            | CycloneDX bei jedem Release       | P2   |
| `.npmrc`                 | fehlt                            | Registry + Provenance-Config      | P2   |
| CHANGELOG.md             | fehlt                            | Auto-generiert via semantic-release| P2  |
| Coverage-Thresholds in CI| fehlt (lokal konfiguriert?)      | ≥90% Lines/Functions enforced     | P2   |
| Token-Rotation           | unbekannt                        | Granulare Tokens, Quartal-Rotation| P3   |
| Private Registry (Proxy) | direkt npmjs.org                 | Verdaccio oder GitHub Packages    | P3   |
| Type Tests (tsd/expect-type)| fehlt                        | API-Type-Regressions in CI        | P3   |

---

## P0 — Blocker (sofort, vor nächstem Publish)

### P0-A: Package-Scope setzen

**Problem:** `datasynx-opencrm` ohne Scope ist anfällig für Dependency-Confusion-Attacks. Ein Angreifer kann ein gleichnamiges öffentliches Package veröffentlichen.

**Aktion:**
```json
// package.json
{
  "name": "@datasynx/agentic-crm",
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

```bash
# npmjs.org Scope registrieren (einmalig):
npm org create datasynx
# oder: github.com/orgs/datasynx bereits vorhanden → GitHub Packages nutzbar
```

**Impact:** Verhindert Supply-Chain-Angriff der wichtigsten Art.

---

### P0-B: `publishConfig` + `provenance: true`

**Problem:** Kein kryptographischer Beweis, welche Pipeline das Package gebaut hat.

**Aktion in package.json:**
```json
"publishConfig": {
  "access": "public",
  "provenance": true
}
```

**Aktion in GitHub Actions Release-Job:**
```yaml
permissions:
  contents: write
  id-token: write   # Erforderlich für npm Provenance
steps:
  - run: npm publish --provenance --access public
    env:
      NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

### P0-C: CI/CD Pipeline aufbauen

**Problem:** Es existieren null GitHub Actions Workflows. Kein Gate vor Publish, kein automatisiertes Testing in CI, kein Security-Check.

**Ziel-Pipeline (4 Jobs):**
```
quality (lint + typecheck)
  └── test (Node 20/22 Matrix + Coverage)
        └── build-validate (build + publint + attw + consumer-test)
              └── release (semantic-release, nur main)
```

**Datei anlegen:** `.github/workflows/ci.yml` (siehe P0-C-Implementierung unten)

---

## P1 — Critical (diese Sprint-Woche)

### P1-A: Bug — `@types/adm-zip` in `dependencies`

**Problem:** `@types/adm-zip` ist ein Typ-Package und gehört in `devDependencies`. In `dependencies` wird es bei jedem Consumer-Install mitgezogen — unnötig ~500KB.

```json
// VORHER (falsch):
"dependencies": {
  "@types/adm-zip": "^0.5.8",
  ...
}

// NACHHER (korrekt):
"devDependencies": {
  "@types/adm-zip": "^0.5.8",
  ...
}
```

**Fix:** `npm uninstall @types/adm-zip && npm install -D @types/adm-zip`

---

### P1-B: Dual ESM/CJS für Library-Exports

**Problem:** `tsdown` erzeugt nur ESM (`format: ["esm"]`). Der CLI-Einsatz ist fine, aber die Library-Exports (`index.ts`, `mcp.ts`) brechen bei CJS-Consumern (ältere Tools, Jest-basierte Test-Setups).

**Lösung:** `tsdown.config.ts` erweitern:
```typescript
export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    mcp: "src/mcp/server.ts",
    "daemon/worker": "src/daemon/worker.ts",
  },
  format: ["esm", "cjs"],   // ← CJS hinzufügen
  dts: true,
  clean: true,
  sourcemap: true,
  // ...
});
```

**package.json exports aktualisieren:**
```json
"exports": {
  ".": {
    "import": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "require": {
      "types": "./dist/index.d.cts",
      "default": "./dist/index.cjs"
    }
  },
  "./mcp": {
    "import": {
      "types": "./dist/mcp.d.ts",
      "default": "./dist/mcp.js"
    },
    "require": {
      "types": "./dist/mcp.d.cts",
      "default": "./dist/mcp.cjs"
    }
  }
}
```

**Hinweis:** CLI-Binary (`dist/cli.js`) bleibt ESM-only — korrekt, da Binaries keine CJS-Kompatibilität brauchen.

---

### P1-C: `sideEffects: false` in package.json

**Problem:** Ohne dieses Flag kann kein Bundler Dead-Code aus dem Library-Export eliminieren.

```json
// package.json
{
  "sideEffects": false
}
```

**Ausnahme:** Wenn CSS-Imports oder globale Registrierungen vorkommen, explizit listen: `"sideEffects": ["./dist/register.js"]`

---

### P1-D: `publint` + `attw` in `prepublishOnly`

**Problem:** Der aktuelle `prepublishOnly`-Hook (`typecheck + test + build`) validiert nicht, ob das gebaute Package für Consumer korrekt importierbar ist.

```json
// package.json
"scripts": {
  "prepublishOnly": "npm run typecheck && npm test && npm run build && npx publint && npx attw ."
}
```

**Erklärung:**
- `publint`: Prüft `exports`-Field auf Korrektheit (falsche Pfade, fehlende Conditions)
- `attw` (are-the-types-wrong): Prüft ob TypeScript-Declarations für ESM und CJS korrekt auflösen

---

### P1-E: ESLint einrichten

**Problem:** Keine statische Analyse. TypeScript-Lücken (unbehandelte Promise-Rejections, `any`-Escape-Hatches) werden nicht automatisch gefunden.

**Installation:**
```bash
npm install -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

**`eslint.config.js` (Flat Config):**
```javascript
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tsParser },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['dist/**', '__tests__/**', 'node_modules/**'],
  },
];
```

**In package.json:**
```json
"lint": "eslint src --max-warnings 0"
```

**CI:** `pnpm lint` als erster Job-Step (schnellstes Feedback).

---

### P1-F: npm audit in CI

**Problem:** Bekannte CVEs in Dependencies werden nicht automatisch erkannt.

**GitHub Actions Step:**
```yaml
- name: Security Audit
  run: npm audit --audit-level=high
```

Bei `critical` oder `high` CVE → Build bricht ab. `moderate` und `low` → Warning, kein Fail (Policy-Entscheidung).

---

## P2 — Important (nächste 2 Wochen)

### P2-A: Semantic Release (automatisches Versioning)

**Problem:** Manuelle Versioning (aktuell 0.1.0) ist fehleranfällig und blockiert schnelle Release-Zyklen.

**Installation:**
```bash
npm install -D semantic-release @semantic-release/changelog @semantic-release/git @semantic-release/github
```

**`.releaserc.json`:**
```json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["@semantic-release/changelog", { "changelogFile": "CHANGELOG.md" }],
    "@semantic-release/npm",
    ["@semantic-release/github", { "assets": ["dist/**"] }],
    ["@semantic-release/git", { "assets": ["CHANGELOG.md", "package.json"] }]
  ]
}
```

**Commit-Typen → Version:**
- `fix:` → PATCH (1.0.x)
- `feat:` → MINOR (1.x.0)
- `BREAKING CHANGE:` Footer → MAJOR (x.0.0)

**Wichtig:** semantic-release braucht Push-Rechte auf `main`. GitHub App Token oder PAT mit `repo`-Scope als Secret `RELEASE_TOKEN` anlegen.

---

### P2-B: commitlint + husky

**Problem:** Conventional Commits werden nicht erzwungen — semantic-release funktioniert nur zuverlässig mit konsistenten Commit-Messages.

```bash
npm install -D husky @commitlint/cli @commitlint/config-conventional
npx husky init
echo "npx commitlint --edit \$1" > .husky/commit-msg
```

**`.commitlintrc.json`:**
```json
{
  "extends": ["@commitlint/config-conventional"],
  "rules": {
    "subject-max-length": [2, "always", 72],
    "scope-enum": [1, "always", [
      "cli", "mcp", "core", "sync", "backup", "ticket",
      "survey", "kb", "rbac", "daemon", "build", "ci", "docs"
    ]]
  }
}
```

---

### P2-C: Prettier

```bash
npm install -D prettier
```

**`.prettierrc.json`:**
```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

**In package.json:**
```json
"format": "prettier --write src __tests__",
"format:check": "prettier --check src __tests__"
```

**CI:** `prettier --check` in `quality`-Job.

---

### P2-D: Coverage-Thresholds erzwingen

**Problem:** `vitest.config.ts` hat aktuell keine `thresholds` konfiguriert — Coverage wird gemessen aber nicht erzwungen.

```typescript
// vitest.config.ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov', 'html'],
  thresholds: {
    lines: 90,
    functions: 90,
    branches: 80,
    statements: 90,
  },
  exclude: [
    'src/types/**',
    '**/index.ts',
    'src/cli.ts',        // CLI-Einstiegspunkt ist via E2E abgedeckt
  ]
}
```

---

### P2-E: `.npmrc` anlegen

```ini
# .npmrc
# Exakte Lockfile-Versionen bei Install erzwingen
save-exact=true

# CI: Audit bei Install nicht überspringen
audit=true

# Provenance für alle Publishes (redundant zu publishConfig, aber explizit)
provenance=true
```

**`.npmrc` in CI:**
```ini
//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}
```

---

### P2-F: SBOM generieren

```yaml
# In Release-Job:
- name: Generate SBOM
  run: npm sbom --sbom-format cyclonedx > sbom-cyclonedx.json

- name: Upload SBOM
  uses: actions/upload-artifact@v4
  with:
    name: sbom
    path: sbom-cyclonedx.json
```

---

### P2-G: Lizenz-Audit

```yaml
- name: License Check
  run: npx license-checker --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD;Python-2.0;Unlicense"
```

**Warum kritisch für dxcrm:** `googleapis` und `@anthropic-ai/sdk` sind Apache-2.0. LanceDB-Dependencies müssen geprüft werden — Apache License 2.0 mit Business-Source-License-Ausnahmen in älteren Versionen dokumentiert.

---

## P3 — Nice-to-have (mittelfristig)

### P3-A: Type Tests mit `expect-type`

```bash
npm install -D expect-type
```

```typescript
// __tests__/types/mcp-tools.type-test.ts
import { expectTypeOf } from 'expect-type';
import type { CustomerSummary } from '../../src/mcp/tools/list-customers';

expectTypeOf<CustomerSummary['slug']>().toBeString();
expectTypeOf<CustomerSummary['dealValue']>().toEqualTypeOf<number | undefined>();
```

Schützt die Public API vor stillen Type-Regressions beim Refactoring.

---

### P3-B: Consumer Integration Tests

```javascript
// __tests__/e2e/consumer-esm.mjs
import { createCrmContext } from '../../dist/index.js';
const ctx = createCrmContext('/tmp/test-crm');
console.assert(typeof ctx === 'object', 'ESM import failed');
console.log('✅ ESM Consumer Test passed');
```

```javascript
// __tests__/e2e/consumer-cjs.cjs
const { createCrmContext } = require('../../dist/index.cjs');
console.log('✅ CJS Consumer Test passed');
```

---

### P3-C: Private Registry / GitHub Packages

Für Team-interne Nutzung: GitHub Packages als npm-Proxy konfigurieren.

```ini
# .npmrc (team-setup)
@datasynx:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Verhindert, dass CI direkt von npmjs.org abhängt — Ausfallschutz + gecachte, geprüfte Versionen.

---

## Vollständige CI/CD Implementierung

### `.github/workflows/ci.yml`

```yaml
name: CI / Release

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Lint & Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint          # P1-E: nach ESLint-Setup
      - run: npm run format:check  # P2-C: nach Prettier-Setup

  test:
    name: Test (Node ${{ matrix.node }})
    needs: quality
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: ['20', '22']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'
      - run: npm ci
      - run: npm run test:coverage
      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        if: matrix.node == '20'
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

  security:
    name: Security & Licenses
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm audit --audit-level=high
      - run: npx license-checker --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD;Unlicense"

  build-validate:
    name: Build & Validate Package
    needs: [test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npx publint                      # Exports-Field validieren
      - run: npx attw .                       # Type Declarations prüfen
      - run: node --input-type=module < __tests__/e2e/consumer-esm.mjs  # Consumer ESM
      # - run: node __tests__/e2e/consumer-cjs.cjs  # nach P1-B (CJS-Output)

  release:
    name: Semantic Release
    needs: [build-validate, security]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write
      id-token: write   # npm Provenance Attestation
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.RELEASE_TOKEN }}
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - name: Generate SBOM
        run: npm sbom --sbom-format cyclonedx > sbom.json
      - name: Semantic Release
        run: npx semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.RELEASE_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## Prioritäts-Reihenfolge (Umsetzungsplan)

```
Woche 1 (P0):
  □ P0-A: Package in @datasynx/agentic-crm umbenennen
  □ P0-B: publishConfig + provenance in package.json
  □ P0-C: .github/workflows/ci.yml anlegen (Grundgerüst)

Woche 2 (P1):
  □ P1-A: @types/adm-zip → devDependencies verschieben
  □ P1-B: tsdown CJS-Output aktivieren, package.json exports prüfen
  □ P1-C: sideEffects: false in package.json
  □ P1-D: publint + attw in prepublishOnly
  □ P1-E: ESLint einrichten (eslint.config.js)
  □ P1-F: npm audit --audit-level=high in CI

Woche 3 (P2):
  □ P2-A: semantic-release + .releaserc.json
  □ P2-B: commitlint + husky + .commitlintrc.json
  □ P2-C: Prettier + format:check in CI
  □ P2-D: vitest.config.ts Coverage-Thresholds setzen
  □ P2-E: .npmrc anlegen
  □ P2-F: SBOM in Release-Job
  □ P2-G: License-Checker in Security-Job

Mittelfristig (P3):
  □ P3-A: expect-type Type Tests für Public API
  □ P3-B: Consumer Integration Tests (ESM + CJS)
  □ P3-C: GitHub Packages als Registry-Proxy
```

---

## Spezifische dxcrm-Risiken

### Große Runtime Dependencies
`@lancedb/lancedb`, `@huggingface/transformers`, `googleapis`, `@anthropic-ai/sdk` — alle sehr groß. Für das CLI-Binary unkritisch, aber für Library-Consumer problematisch.

**Empfehlung:** Schwere Deps (`lancedb`, `huggingface`) als optionale `peerDependencies` deklarieren oder in ein separates `@datasynx/agentic-crm-ai` Package auslagern (wenn Monorepo-Strategie gewählt).

### `js-yaml` fehlt in dependencies
`@types/js-yaml` ist in devDependencies, aber `js-yaml` selbst taucht nicht in `dependencies` auf — vermutlich als transitive Dep von einer anderen Library. **Explizit deklarieren** (niemals auf transitive Deps verlassen, die sich ändern können).

### `adm-zip` als Produktions-Dep
`adm-zip` wird für Backup-Funktionalität genutzt. Kein Security-Problem, aber große Binary. Prüfen ob Node.js native `zlib` + `tar`/`zip` via `child_process execSync` ausreicht (aktuell im Code `execSync('zip ...')` verwendet — `adm-zip` evtl. redundant).

### Lifecycle-Script-Risiko
Bei `npm install` führt Node keine `postinstall`-Scripts aus, wenn keiner existiert. Aber alle transitiven Deps (z.B. ältere LanceDB-Versionen) können Scripts ausführen. In CI sicherstellen:
```bash
npm ci --ignore-scripts  # für reine Build-Stages ohne Native-Compilation
```
**Ausnahme:** LanceDB braucht Native-Compilation → `--ignore-scripts` nur für reine Lint/Test-Stages.
