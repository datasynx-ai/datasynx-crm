# SOP — Nächste Session (DatasynxOpenCRM)

> Handoff-Dokument für den Start einer neuen Claude-Code-Session. Lies dies
> **zuerst**, dann `CLAUDE.md`. Stand: nach Abschluss von #58, #53, #56, #57, #41.
> Mittelfristige Meilenstein-Sicht: [`roadmap.md`](./roadmap.md).

---

## 0. Aktueller Stand (Snapshot)

- **Phase:** 1–5 abgeschlossen · *Härtung & erster externer User*.
- **Nordstern / Kill-Condition:** Erster externer User nutzt `dxcrm` **7 Tage täglich ohne HubSpot**.
- **Tooling:** 82 MCP-Tools · 69 CLI-Commands · lokale Markdown-/NDJSON-Stores · Vitest (~3543 Tests grün) · semantic-release auf `main` (npm publish bei jedem Merge).
- **Offene Issues:** nur **#20** (Embedding-Eval) — bewusst offen, blockiert durch fehlenden HF-Modell-Zugriff in der Sandbox.
- **Zuletzt geliefert:** Self-Service-Portal (#58), nativer Scheduler (#53), Teams/Meet-Transcript-Auto-Discovery (#56), Omnichannel-Inbox Web-Chat + WhatsApp (#57), Rollen-Erkennung aus Gesprächstext (#41 A5) + komplettes A/B-Feedback-Mapping.

> ⚠️ **Wichtigste Wahrheit für die Strategie:** Viele neu gebaute Live-Pfade sind **credential-gated No-ops**. Kern-Logik + Routing sind getestet, aber „echte" externe Integrationen (Teams/Meet-Subscriptions, WhatsApp-Versand, Kalender-Free/Busy, Stripe) laufen offline nicht. Für einen echten externen User ist das **Aktivieren & Härten dieser Pfade**, nicht weitere Feature-Breite, der Engpass.

---

## 1. Session-Start-Checkliste

```
□ CLAUDE.md + dieses SOP lesen
□ git fetch origin main && git status   (main kann durch semantic-release vorgelaufen sein)
□ npm ci  (falls node_modules fehlen — Container ist ephemer)
□ npm test → Baseline grün?   npm run typecheck && npm run lint && npm run build
□ Offene Issues prüfen (mcp__github__list_issues, state OPEN)
□ Entwicklungsbranch anlegen/auschecken; Merge nach main ist autorisiert (semantic-release publisht!)
```

---

## 2. Arbeitsweise (unverändert, nicht verhandelbar)

Pro Issue **immer** diese 5 Schritte (jeweils im Issue als Kommentar dokumentieren):

1. **Research** als Kommentar im Issue.
2. **Implementierungsplan** als Kommentar im Issue.
3. **Test-driven** implementieren (Test zuerst, dann Code).
4. **Ende-zu-Ende-Test** gegen den echten Server + optimieren.
5. **Doku + Merge nach `main`** (README/`docs/`/`capabilities.ts`/Harness synchron), Issue mit Mapping schließen.

**Commit-Gate (selbst durchführen):** `npm test` grün · `typecheck` · `lint` · `build` · Doku synchron · `TOOL_COUNT` gepflegt.

---

## 3. Strategie — Was als nächstes wichtig ist (priorisiert)

Leitfrage für jede Priorisierung: *Bringt das den ersten externen User näher an „7 Tage ohne HubSpot"?*

### 🥇 P0 — Live-Integrationen aktivieren & härten (der eigentliche Engpass)
Die Features existieren; jetzt müssen die externen Pfade real funktionieren.
- **Credential-/Setup-Doku & Smoke-Tests** für jeden Live-Pfad: Gmail/Graph-Mailbox, Teams/Meet-Subscriptions (#56), WhatsApp Cloud API (#57: `WHATSAPP_TOKEN/PHONE_ID/APP_SECRET/VERIFY_TOKEN`), Kalender-Free/Busy + Event-Create (#53), Stripe (#49).
- **Echte Subscription-Anlage** (Graph `POST /subscriptions`, Workspace-Events) — heute nur Renewal/Empfang implementiert, das *Anlegen* fehlt. → eigenes Issue.
- **Konkrete Lücke aus #57:** Web-Chat hat **keinen Rückkanal** — der Agent kann antworten, aber das Widget pollt/empfängt nichts. Ohne Delivery (SSE/Polling-Endpoint `GET /chat/poll?sessionId=…`) ist die Web-Chat-Schleife einseitig. **Hohe Priorität**, da direkt sichtbar für Endkunden.
- **Konkrete Lücke aus #57:** `/chat` und `/webhooks/whatsapp` haben **kein Rate-Limit/Honeypot** wie `/forms`. Public-Endpoints härten (Spam/DoS).

### 🥈 P1 — Der 7-Tage-HubSpot-frei-Härtetest (das Akzeptanzkriterium selbst)
- Den in #41 beschriebenen Härtetest **tatsächlich fahren** (oder einen Test-Tenant aufsetzen): Morgens-Briefing, Forecast, Öffnungs-/Antwort-Signale, Task-Queue, Online-Angebotsannahme.
- Jede Reibung → **neues, eng geschnittenes Issue** mit Repro (so wie #41 entstanden ist).
- Fokus auf den **kritischen Pfad (Link 1–8)** der aktuellen Phase — 100 % Coverage halten.

### 🥉 P2 — #20 Embedding-Eval abschließen
- In einer Umgebung **mit** HF-Zugriff (oder vorab gecachten Modellen): `dxcrm eval-embeddings eval/embedding-fixtures.json --k 5` für Default + `bge-small`/`bge-base`.
- Nur bei klarem Gewinn (recall@k/MRR, vollständig lokal) Default wechseln + Reindex-Migration dokumentieren. **Kein blind swap.**

### P3 — Robustheit & Beobachtbarkeit der neuen Flächen
- **Routen-Integrationstests** für die neuen HTTP-Endpoints (`/chat`, `/webhooks/whatsapp`, `/book/:id`, `/webhooks/google`, `/portal`) — bisher v. a. via Kern-Unit-Tests + manuelle E2E abgedeckt, keine dauerhaften Supertest-artigen Tests.
- **Fehler-/Retry-Verhalten** der credential-gated `fetch`-Aufrufe (Graph/Meet/WhatsApp) prüfen; strukturiertes Logging/Metriken für die neuen Events (`conversation.*`, `meeting.transcribed`, `meeting.booked`).
- **Unmatched-Queues** (Transcripts + perspektivisch Conversations) brauchen einen Bearbeitungs-Workflow/Reminder.

---

## 4. Konkretes Backlog (Issue-Kandidaten, ready to pick)

| Prio | Titel | Warum |
|---|---|---|
| P0 | Web-Chat-Rückkanal (`GET /chat/poll` oder SSE) + Widget-Polling | Web-Chat ist sonst einseitig (#57-Folgelücke) |
| P0 | Rate-Limit + Honeypot für `/chat` & `/webhooks/whatsapp` | Public-Endpoint-Härtung |
| P0 | Graph/Workspace-**Subscription-Anlage** + `dxcrm transcripts subscribe` | #56 schließt erst damit den Live-Loop |
| P0 | Integrations-Setup-Guide + `dxcrm doctor`-Checks je Provider | Voraussetzung für externen User |
| P1 | 7-Tage-Härtetest durchführen, Friction-Issues anlegen | Direktes Akzeptanzkriterium |
| P2 | #20 Embedding-Eval ausführen (Umgebung mit Modell-Zugriff) | Letztes offenes Issue |
| P3 | HTTP-Routen-Integrationstests (supertest-Stil) | Regressionsschutz neuer Flächen |

---

## 5. Technische Fallstricke (Lessons Learned — Zeit sparen!)

- **semantic-release-Drift:** Nach jedem Merge nach `main` läuft semantic-release und bumpt `package.json` `version`. Beim nächsten Rebase **immer** Konflikt in `package.json` → Remote-`version` behalten, eigene `description` (Tool-Count) behalten.
- **`dxcrm init` niemals im Repo-Cwd ausführen** — überschreibt die echte `CLAUDE.md`. Immer isoliertes `DXCRM_DATA_DIR`/tmp-Verzeichnis.
- **HF-Modell-Download ist in der Sandbox blockiert** (`Forbidden access`) → Embedding-/LLM-abhängige E2E nicht hier ausführbar.
- **Credential-gated = offline No-op:** neue Integrationen geben offline `[]`/`null`/„skipped" zurück. E2E mit **injizierten Deps** (so wie `getBusy`/`fetchAttendees`/`send`/`createEvent` in den Cores) bzw. gestubbtem globalem `fetch` testen.
- **Tool-Bookkeeping bei neuem MCP-Tool:** `ALL_TOOLS` + `TOOL_COUNT` in `src/setup/harness-content.ts`, `registerX` in `createMcpServer()`, RBAC-Gruppe in `src/core/rbac.ts`, `capabilities.ts` (Tabelle **+** Detailsektion), dann `npm run docs:generate`, und `__tests__/setup/harness-content.test.ts` Pin aktualisieren. `docs-coverage.test.ts` erzwingt Vollständigkeit.
- **Zähl-Strings in README/Doc-Headern** (`docs/mcp-tools.md`, `docs/cli-reference.md`, README) sind teils **außerhalb** der AUTOGEN-Blöcke → manuell mitziehen.
- **commitlint-Scopes** sind enum-beschränkt (`cli, mcp, core, sync, backup, ticket, survey, kb, rbac, daemon, build, ci, docs, deps, security, e2e, types`). Nicht-Enum-Scopes sind nur Warnung, aber sauber bleiben.
- **ESM:** kein `require()` — `import`/`await import()`. Type-only Imports für zirkuläre Typen (`import type`).
- **Wiederverwendbare Muster:** HMAC-Token (sign/verify, base64url + `.sig`), Config-Store `.agentic/<feature>/<id>.json`, Event-Bus `emitEvent(dataDir, event, payload)`, Routing `buildRoutingTable`+`routeMessage`, Eskalation `handleCreateTicket`, Timeline `appendInteraction`.

---

## 6. Definition of Done (pro Issue)

```
□ 5-Schritte-Workflow im Issue dokumentiert
□ Tests zuerst, alle grün; kritischer Pfad abgedeckt
□ typecheck · lint · build sauber
□ Reale E2E ausgeführt (echter Server / injizierte Deps)
□ README + docs/ + capabilities + Harness synchron (TOOL_COUNT gepflegt)
□ Nach main gemerged (package.json-Version-Konflikt sauber gelöst), gepusht
□ Issue mit Mapping-Kommentar als completed geschlossen
```
