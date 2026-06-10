# SOP — Nächste Session (DatasynxOpenCRM)

> Handoff-Dokument für den Start einer neuen Claude-Code-Session. Lies dies
> **zuerst**, dann `CLAUDE.md`. Stand: **M1 abgeschlossen** (#61–#64) **+ M3 weitgehend
> abgeschlossen** (#65 Routen-Tests, #66 Unmatched-Workflow, #67 Outbound-Robustheit).
> Mittelfristige Meilenstein-Sicht: [`roadmap.md`](./roadmap.md).

---

## 0. Aktueller Stand (Snapshot)

- **Phase:** Härtung & erster externer User · **M1 ✅ abgeschlossen** (2026-06-10).
- **Nordstern / Kill-Condition:** Erster externer User nutzt `dxcrm` **7 Tage täglich ohne HubSpot**.
- **Tooling:** 82 MCP-Tools · 69 CLI-Commands (Top-Level) · ~3630 Tests grün · npm 1.37.0+ (semantic-release publisht bei jedem feat/fix-Merge nach `main`).
- **Offene Issues:** nur **#20** (Embedding-Eval) — blockiert durch fehlenden HF-Modell-Zugriff in der Sandbox.
- **Zuletzt geliefert (M1):**
  - #61 Rate-Limit + Honeypot für `/chat` & `/webhooks/whatsapp` (`src/core/http-guard.ts`, Routen extrahiert nach `src/mcp/routes/conversation-routes.ts` → erste echte Routen-Integrationstests).
  - #62 Web-Chat-Rückkanal: `GET /chat/poll` + Widget-Polling (`pollMessages` in conversations.ts) — Web-Chat ist jetzt two-way ohne Credentials.
  - #63 Echte Subscription-Anlage: `dxcrm transcripts subscribe teams|meet` (`src/sync/subscription-create.ts`), Provider `google-workspace`, Renewal pro Provider. **3 Bugfixes:** Renewal-Cross-Talk (Provider-Filter), Renewal-Skip ohne Gmail, `runCli` schluckte `process.exitCode`.
  - #64 `dxcrm doctor --integrations [--live]` — Readiness je Provider mit Live-Probes; Checkliste in `docs/integrations.md`.

---

## 1. Session-Start-Checkliste

```
□ CLAUDE.md + dieses SOP + docs/roadmap.md lesen
□ git fetch origin main && git status   (main läuft durch semantic-release vor!)
□ npm ci  (Container ist ephemer)
□ npm test → Baseline grün?   npm run typecheck && npm run lint && npm run build
□ Offene Issues prüfen (mcp__github__list_issues, state OPEN)
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

## 3. Strategie — Was als nächstes wichtig ist (priorisiert)

### 🥇 P0 — M2: Der 7-Tage-HubSpot-frei-Härtetest (jetzt der Engpass)

M1 hat alle Live-Pfade aktivierbar gemacht. Jetzt entscheidet sich die Kill-Condition:

- **Operator-Aktion nötig:** echten/Test-Tenant aufsetzen, `dxcrm doctor --integrations --live`
  muss für die genutzten Provider grün sein — das ist der Einstiegspunkt.
- Täglicher Betrieb: Morgens-Briefing, Forecast, Öffnungs-/Antwort-Signale, Task-Queue,
  Online-Angebotsannahme, Inbox (Web-Chat/WhatsApp).
- Jede Reibung → **neues, eng geschnittenes Issue** mit Repro (Muster: #41).
- Aus der Sandbox heraus ist M2 **nicht** durchführbar — wenn kein User-Feedback vorliegt,
  direkt zu P1/P2 unten greifen.

### 🥈 P1 — M3-Restarbeiten (sandbox-tauglich)

M3 ist weitgehend erledigt (#65 Routen-Tests forms/booking/webhooks, #66 Unmatched-Workflow,
#67 Outbound-Robustheit). Verbleibend:

- **Zweite Routen-Test-Tranche:** `/q/:token` (Quote accept/decline), `/portal(+ticket/reply)`,
  `/survey/respond`, `/dashboard`, `/webhooks/stripe`, Tracking-Pixel `/t/o`/`/t/c` —
  jeweils erst in `register<X>Routes`-Module extrahieren (Muster: `src/mcp/routes/`).
- **Unmatched Conversations:** das #66-Muster (Event + Digest + resolve) auf unzugeordnete
  Conversations übertragen, sobald der Härtetest zeigt, dass es gebraucht wird.

### 🥉 P2 — #20 Embedding-Eval abschließen

- Nur in einer Umgebung **mit** HF-Zugriff: `dxcrm eval-embeddings eval/embedding-fixtures.json --k 5`
  für Default + `bge-small`/`bge-base`. Kein blind swap.

### Dauerläufer

- **Dependabot:** 1 kritische Meldung auf `main`
  (https://github.com/datasynx/datasynx-crm/security/dependabot/1) — `npm audit` lokal sauber,
  Details nur über die GitHub-UI einsehbar. Vor M2-Abschluss klären.

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
