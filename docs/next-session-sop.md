# SOP — Nächste Session (DatasynxOpenCRM)

> Handoff-Dokument für den Start einer neuen Claude-Code-Session. Lies dies
> **zuerst**, dann `CLAUDE.md`. Stand: **2026-06-11** · M1 ✅ + M3 (Sandbox-Anteil) ✅.
> Mittelfristige Meilenstein-Sicht: [`roadmap.md`](./roadmap.md).
>
> **Single Source of Truth für offene Arbeit = GitHub-Issues** (siehe Abschnitt 0).
> Erledigtes steht in der Git-History, nicht hier.

---

## 0. Aktueller Stand (Snapshot)

- **Phase:** Härtung & erster externer User. **M1 ✅**, **M3-Sandbox-Anteil ✅** (beide 2026-06-10).
- **Nordstern / Kill-Condition:** Erster externer User nutzt `dxcrm` **7 Tage täglich ohne HubSpot**.
- **Tooling:** 82 MCP-Tools · 69 CLI-Commands (Top-Level) · ~3736 Tests grün · Coverage-Gate (80 % Branches) grün · npm 1.38.0+ (semantic-release publisht bei jedem feat/fix-Merge nach `main`).

### Offene Issues (priorisiert)

| Issue | Thema | sandbox-fähig |
|---|---|---|
| **#73** | M2 — 7-Tage-HubSpot-frei-Härtetest (Kill-Condition, Engpass) | nein (Operator/Dogfooding) |
| **#74** | Coverage-Randlücken: `sync/calendly.ts`, `core/llm.ts`, `sync/calendar-availability.ts` | ✅ ja |
| **#75** | Unmatched Conversations: Event + Digest + `resolve` (spiegelt #66) | ✅ ja |
| **#80** | English-only Policy über die Codebase erzwingen | ✅ ja |
| **#20** | Embedding-Eval abschließen (kein Blind-Swap) | nein (HF-Zugriff nötig) |
| **#70** | Dependabot-Alert-Triage | nein (Operator-Input) |
| **#76–#79** | M4 (Slack-Channel, Web-Dashboard, weitere LLM-Provider, Plugin-Marketplace) | gegated durch M2 |

> Issue-Anlage aus dieser Sandbox ist nicht möglich (kein `gh`/Token; GitHub-API nur
> lesend). Neue Befunde als fertigen Issue-Body formulieren und dem Operator übergeben.

---

## 1. Session-Start-Checkliste

```
□ CLAUDE.md + dieses SOP + docs/roadmap.md lesen
□ git fetch origin main && git status   (main läuft durch semantic-release vor!)
□ npm ci  (Container ist ephemer — vitest/tsx fehlen sonst)
□ npm test → Baseline grün?   npm run typecheck && npm run lint && npm run build
□ Offene Issues prüfen (GitHub-API lesend / Operator)
□ Entwicklungsbranch anlegen/auschecken; Merge nach main ist autorisiert
```

---

## 2. Arbeitsweise (unverändert, nicht verhandelbar)

Pro Issue **immer** diese 5 Schritte (jeweils im Issue als Kommentar dokumentieren):

1. **Research** als Kommentar im Issue.
2. **Implementierungsplan** als Kommentar im Issue.
3. **Test-driven** implementieren (Test zuerst, dann Code).
4. **Ende-zu-Ende-Test** gegen den echten Server/Binary + optimieren.
5. **Doku + Merge nach `main`** (README/`docs/`/`capabilities.ts`/Harness synchron), Issue mit Mapping schließen.

**Commit-Gate:** `npm test` grün · `typecheck` · `lint` · `build` · Doku synchron · `TOOL_COUNT` gepflegt.

---

## 3. Strategie — Was als nächstes wichtig ist

- **🥇 P0 — M2 (#73):** der Engpass. Operator setzt echten/Test-Tenant auf, `dxcrm doctor
  --integrations --live` muss für die genutzten Provider grün sein (Einstiegspunkt).
  Aus der Sandbox **nicht** durchführbar — ohne User-Feedback direkt zu P1 greifen.
  Jede Reibung → **neues, eng geschnittenes Issue** mit Repro (Muster: #41).
- **🥈 P1 — sandbox-tauglich:** #74 (Coverage), #75 (Unmatched Conversations, sobald der
  Härtetest zeigt, dass es gebraucht wird), #80 (English-only).
- **🥉 P2 — #20:** nur mit HF-Zugriff (`dxcrm eval-embeddings …`). Kein blind swap.
- **Gegated (M4, #76–#79):** keine neue Feature-Breite vor bestandener Kill-Condition.

---

## 4. Technische Fallstricke (Lessons Learned — Zeit sparen!)

- **semantic-release-Drift:** Nach jedem feat/fix-Merge nach `main` bumpt semantic-release
  `package.json`. Vor jedem Merge: `git pull origin main` → bei Divergenz `git rebase main`,
  Remote-`version` behalten, dann `--force-with-lease` auf den Feature-Branch.
- **`dxcrm init` niemals im Repo-Cwd ausführen** — überschreibt die echte `CLAUDE.md`.
  Immer `DXCRM_DATA_DIR=/tmp/...`.
- **HF-Modell-Download in der Sandbox blockiert** → Embedding-/LLM-E2E nicht hier.
- **Credential-gated = offline No-op:** mit injizierten Deps bzw. gestubbtem `fetch` testen
  (Muster: `subscription-create.ts`, `doctor-integrations.ts`, `transcript-discovery.ts`).
- **Datum/Zeitzonen:** `today`/`close_date` werden als **UTC-Mitternacht** geparst. Datums-
  Grenzen daher mit `Date.UTC`/`getUTC*` rechnen, **nie** mit dem lokalen `new Date(y,m,d)`
  (sonst Off-by-one in TZ ahead-of-UTC). Die Suite läuft gepinnt unter `TZ=Asia/Tokyo`
  (`vitest.config.ts`), damit solche Bugs nicht erst in non-UTC-Umgebungen auffliegen.
- **Routen testen:** Express-App auf Port 0 + echtes `fetch` (`conversation-routes.test.ts`).
  Neue HTTP-Routen als `register<X>Routes(app, dataDir)`-Modul anlegen, nicht inline in
  `startHttp()` — sonst nicht testbar.
- **Rate-Limiter sind modul-global:** in Routen-Tests `reset<X>Guards()` im `beforeEach`.
- **CLI-Fehlerpfade:** `process.exitCode = 1` setzen (nicht `process.exit()`); `runCli`
  honoriert das seit #63 — Regressionstest in `__tests__/cli.test.ts`.
- **Renewal ist provider-gefiltert:** `renewExpiringSubscriptions(dataDir, fn, h, { provider })`
  — Filter nie weglassen, sonst frisst ein Renewer fremde Subs (#63-Bug).
- **Tool-Bookkeeping bei neuem MCP-Tool:** `ALL_TOOLS` + `TOOL_COUNT` in
  `src/setup/harness-content.ts`, `registerX` in `createMcpServer()`, RBAC-Gruppe,
  `capabilities.ts` (Tabelle + Detail), `npm run docs:generate`, Pin-Test aktualisieren.
  CLI-**Subcommands** zählen dagegen nicht in die 69 (nur Top-Level via registry).
- **Zähl-Strings in README/Doc-Headern** sind teils außerhalb der AUTOGEN-Blöcke → manuell.
- **Doku-Links:** `npm run docs:check` prüft alle relativen Links/Anker in README+docs
  (läuft in der CI-Quality-Stage); externe URLs sind bewusst außen vor.
- **Quote-State-Machine:** `paid` ist terminal — `acceptQuote`/`declineQuote` geben die
  Quote dann unverändert zurück (kein Event). Nicht "vereinfachen" (#68-Bug).
- **commitlint:** Subject ≤ 72 Zeichen; Scopes enum-beschränkt (`cli, mcp, core, sync, …`).
- **ESM:** kein `require()`; Type-only Imports für zirkuläre Typen.
- **Wiederverwendbare Muster:** HMAC-Token, Config-Store `.agentic/<feature>/<id>.json`,
  Event-Bus `emitEvent`, Routing `buildRoutingTable`+`routeMessage`, Timeline
  `appendInteraction`, Rate-Limit `createRateLimiter` + `clientIp` (`core/http-guard.ts`).

---

## 5. Definition of Done (pro Issue)

```
□ 5-Schritte-Workflow im Issue dokumentiert
□ Tests zuerst, alle grün; kritischer Pfad abgedeckt
□ typecheck · lint · build sauber
□ Reale E2E ausgeführt (echter Server/Binary / injizierte Deps)
□ README + docs/ + capabilities + Harness synchron (TOOL_COUNT gepflegt)
□ Nach main gemerged (Rebase über Release-Commits!), gepusht
□ Issue mit Mapping-Kommentar als completed geschlossen
□ roadmap.md + dieses SOP aktualisiert, wenn sich der Meilenstein-Stand ändert
```
