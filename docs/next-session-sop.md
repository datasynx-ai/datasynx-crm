# SOP — Nächste Session (DatasynxOpenCRM)

> Handoff-Dokument für den Start einer neuen Claude-Code-Session. Lies dies
> **zuerst**, dann `CLAUDE.md`. Stand: **M1 ✅ + M3 (Sandbox-Anteil) ✅ abgeschlossen**
> (#61–#69). Einziger Sandbox-Blocker: #20; #70 wartet auf Operator-Input.
> Mittelfristige Meilenstein-Sicht: [`roadmap.md`](./roadmap.md).

---

## 0. Aktueller Stand (Snapshot)

- **Phase:** Härtung & erster externer User · **M1 ✅** (2026-06-10) · **M3 Sandbox-Anteil ✅** (2026-06-10).
- **Nordstern / Kill-Condition:** Erster externer User nutzt `dxcrm` **7 Tage täglich ohne HubSpot**.
- **Tooling:** 82 MCP-Tools · 69 CLI-Commands (Top-Level) · ~3726 Tests grün · Coverage-Gate (80 % Branches) wieder grün · npm 1.37.2+ (semantic-release publisht bei jedem feat/fix-Merge nach `main`).
- **Offene Issues:** **#20** (Embedding-Eval, HF-Zugriff fehlt in der Sandbox) · **#70** (Dependabot-Alert-Triage — wartet auf Operator: Alert öffnen, Paket+Version+GHSA posten).
- **Zuletzt geliefert (Session 2026-06-10, zweiter Teil):**
  - #68 Zweite Routen-Test-Tranche: `/q/:token` (+accept/decline), `/webhooks/stripe`, `/portal` (+ticket/reply), `/survey/respond`, `/t/o`/`/t/c`, `/dashboard` → `src/mcp/routes/{quote,portal,engagement}-routes.ts` + 43 Routen-Tests. **Bugfix:** Accept/Decline konnten eine **bezahlte** Quote überschreiben (`paid` ist jetzt terminal); Accept/Decline prüfen Token-Slug ↔ Quote wie der GET-Pfad. Stripe-Signatur lief bereits korrekt über `rawBody` (per Test gepinnt).
  - #69 Coverage-Lücken: Branches 77,7 % → **80,1 %** (50 Tests: transcript-discovery-Attendee-Lookups, subscription-renew-Fehlerpfade, quote-link/portal-Links, webhooks-Failure-Queue, Dashboard-Tiles, 0 %-MCP-Tools product/form/workflow/send_quote/get_logs, Stripe-Payment-Link-Fehlerpfade).
  - #71 Doku-Hygiene: `npm run docs:check` (relativer Link-/Anker-Check über README+docs, offline) + CI-Hook in der Quality-Stage.

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

M3 ist im Sandbox-Umfang **abgeschlossen** (#65/#68 Routen-Tests aller öffentlichen
Flächen, #66 Unmatched-Workflow, #67 Outbound-Robustheit, #69 Coverage-Gate). Verbleibend:

- **Unmatched Conversations:** das #66-Muster (Event + Digest + resolve) auf unzugeordnete
  Conversations übertragen, sobald der Härtetest zeigt, dass es gebraucht wird.
- **Coverage-Randlücken** (bewusst zurückgestellt, siehe #69-Abschluss): `sync/calendly.ts`
  (0 %, raw `https.request`, Legacy-Pfad), `core/llm.ts`-Provider-Branches,
  `sync/calendar-availability`-Provider-Branches (credential-gated).

### 🥉 P2 — #20 Embedding-Eval abschließen

- Nur in einer Umgebung **mit** HF-Zugriff: `dxcrm eval-embeddings eval/embedding-fixtures.json --k 5`
  für Default + `bge-small`/`bge-base`. Kein blind swap.

### Dauerläufer

- **Dependabot:** 1 kritische Meldung auf `main`
  (https://github.com/datasynx/datasynx-crm/security/dependabot/1) — Triage in **#70**:
  `npm audit` sauber, Lockfile gegen die bekannten 2025/26-Criticals geprüft (kein Treffer),
  vermutlich staler Alert. **Wartet auf Operator** (Alert öffnen → Paket+Version+GHSA in #70
  posten), dann Update/Override oder Dismiss.

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
