# DatasynxOpenCRM — v0.1 Finish-Plan

> Basis: v0.1.0 ist vollständig implementiert (2180 Tests ✓, Build ✓, Lint ✓).
> Dieser Plan beschreibt was für eine **produktionsreife v0.1.x** noch fehlt.

---

## Priorität 1 — Funktionale Lücken (aus plan.md, noch offen)

### P1-A: `last_touchpoint` automatisch via `log_interaction()` updaten
- **Status:** `log_interaction.ts` hat Code dafür (Zeile 66-75), aber der Regex-Replacement-Pfad ist ungetestet
- **Problem:** Wenn `last_touchpoint` nicht im Frontmatter existiert, wird es nicht hinzugefügt
- **Fix:** Fallback-Pfad implementieren: wenn kein `last_touchpoint`-Key → Zeile nach `updated:` einfügen
- **Test:** Unit-Test der beide Pfade abdeckt (Key vorhanden / Key fehlt)
- **Datei:** `src/mcp/tools/log-interaction.ts`

### P1-B: `dxcrm backup schedule --every day --keep 7`
- **Status:** Command existiert (`src/commands/backup.ts` Zeile 558), aber `scheduleBackup()` schreibt nur Config — kein Daemon-Integration
- **Problem:** Der Proactive-Worker startet keine geplanten Backups
- **Fix:** In `proactive-worker.ts` prüfen ob `backupSchedule.every` fällig ist → `runBackup()` aufrufen
- **Test:** Mock-Test für Scheduler-Trigger
- **Dateien:** `src/daemon/proactive-worker.ts`, `src/commands/backup.ts`

### P1-C: On-Query-Sync in `get_customer_context()`
- **Status:** Tool gibt bestehende Daten zurück, triggert aber keinen Gmail/Calendar-Sync
- **Problem:** Nutzer sehen stale Daten wenn sie Kontext abrufen, ohne manuell zu syncen
- **Fix:** Wenn letzter Sync > 4h → `syncGmail()` im Hintergrund feuern (fire-and-forget, non-blocking)
- **Test:** Mock-Test: prüfen ob Sync-Trigger bei altem Timestamp aufgerufen wird
- **Datei:** `src/mcp/tools/get-customer-context.ts`

### P1-D: Transcript-Kundenerkennung verbessern
- **Status:** `transcript-watcher.ts` matched Transkripte dem ersten Kunden in `customers/` — keine LLM-Erkennung
- **Problem:** Bei mehreren Kunden landen alle Transkripte beim falschen Kunden
- **Fix:** Speaker-Namen + Dateiname gegen alle `main_facts.md` matchen (Fuzzy-String, kein LLM nötig)
- **Datei:** `src/sync/transcript-watcher.ts` (Zeilen 73-131 sind uncovered)

---

## Priorität 2 — Test-Coverage (0%-Dateien)

Diese Command-Dateien haben **0% Coverage** obwohl sie produktionsrelevant sind:

| Datei | Zeilen | Was fehlt |
|---|---|---|
| `src/commands/sync.ts` | 219 | `runSync()` Haupt-Orchestrierung — kein Test |
| `src/commands/list.ts` | 52 | `runList()` mit Filtern |
| `src/commands/ticket.ts` | 124 | `runTicket*()` CRUD |
| `src/commands/survey.ts` | 96 | `runSurvey*()` |
| `src/commands/template.ts` | 85 | `runTemplate*()` |
| `src/commands/sequence.ts` | 149 | `runSequence*()` |
| `src/commands/quote.ts` | 93 | `runQuote*()` |
| `src/commands/kb.ts` | 103 | `runKb*()` |
| `src/commands/security-report.ts` | 106 | `runSecurityReport()` |
| `src/commands/daemon.ts` | 77 | `runDaemon()` Start/Stop |

**Ziel:** Jede Datei mindestens 1 Happy-Path + 1 Error-Path. Kein vollständiger Branch-Test nötig.

### P2-A: backup.ts Coverage (aktuell 58%)
- `runBackup()` und `runRestore()` rufen `execSync` auf — schwer mit memfs testbar
- **Fix:** `execSync`-Aufruf extrahieren in injectable `ZipRunner`-Interface → mockbar
- Dann: 3 Tests (customers fehlt, zip erstellt, manifest korrekt)

### P2-B: import-hubspot.ts Branch Coverage (44%)
- Uncovered: Custom-Properties-Pfad, Owner-Mapping-Pfad, Engagement-Typen
- **Fix:** Gezielte Tests für jeden Branch mit Fixture-Daten

### P2-C: transcript-watcher.ts (46%)
- Uncovered: `watchTranscripts()` File-Watcher-Logik (Zeilen 73-131)
- **Fix:** `fs.watch()` mocken via `vi.stubGlobal`

---

## Priorität 3 — Code-Qualität & Optimierung

### P3-A: Plan-Dateien aufräumen
Root-Verzeichnis hat 15+ `plan*.md`-Dateien → verwirrend für Contributer.
```
Löschen: plan2.md, plan3.md, plan4.md, plan-1.md, plan-new1.md,
         d11plan.md, d12plan.md, d13plan.md, d14plan.md, d15plan.md,
         d16plan.md, d17plan.md, missing-plan.md, optimize-plan18-20.md,
         plan-enterprise-d11-d17.md, plan-next-dxc.md, plan-remaining.md,
         Final-Plan.md, PlanHubSpot.md
Behalten: plan.md (canonical), plan-enterprise.md, plan-enterprise-npm.md, v0-1-plan.md
```

### P3-B: CHANGELOG.md fehlt
- Semantic-Release erwartet und generiert ein CHANGELOG — existiert aber nicht
- **Fix:** Initial-CHANGELOG für v0.1.0 anlegen mit allen Features
- **Datei:** `CHANGELOG.md` (neu)

### P3-C: `src/commands/version.ts` (0 Zeilen, 0% Coverage)
- Datei existiert, hat aber keinen exportierten Code → totes Artifact
- **Fix:** Entweder befüllen (`dxcrm --version` Logic) oder löschen

### P3-D: `src/sync/gmail-auth.ts` (0% Coverage)
- OAuth2-Flow nicht testbar ohne echten Google-OAuth-Server
- **Fix:** Mindestens testen dass Export korrekt ist + Error-Pfad bei fehlendem Token

### P3-E: Copper-Connector Branch Coverage (50%)
- `fetchContacts` hat error-retry-Logik die nie getestet wird
- **Fix:** 2-3 Tests für Error-Pfade hinzufügen

---

## Priorität 4 — Release-Readiness

### P4-A: npm-Publish-Smoke-Test
```bash
npm pack --dry-run  # Checkt ob alle Exports korrekt sind
npx publint         # Bereits in CI, aber lokal verifizieren
npx attw --pack .   # Type-Declaration-Check
```
Sicherstellen dass `dist/` nach `npm run build` alle nötigen Dateien enthält.

### P4-B: Semantic-Release Config prüfen
- `.releaserc.json` existiert — prüfen ob `branches` Config korrekt ist
- `RELEASE_TOKEN` Secret muss in GitHub gesetzt sein für auto-publish

### P4-C: Erster externer User Onboarding
- **Was fehlt:** Kein "Getting Started in 5 Minutes"-Walkthrough für echten Gmail-Account
- **Fix:** `docs/quickstart-real.md` mit echten OAuth-Steps für Gmail + erstem Sync

---

## Coverageziel v0.1.x

| Metrik | Aktuell | Ziel v0.1 |
|---|---|---|
| Lines | 83.11% | ≥ 87% |
| Branches | 80.98% | ≥ 84% |
| Tests | 2180 | ≥ 2350 |
| 0%-Dateien (commands) | 10 | 0 |

---

## Geschätzter Aufwand

| Priorität | Items | Aufwand |
|---|---|---|
| P1 (Funktional) | 4 | ~4–6h |
| P2 (Coverage 0%-Dateien) | 10 + backup + hubspot | ~6–8h |
| P3 (Qualität) | 5 | ~2h |
| P4 (Release) | 3 | ~1h |
| **Gesamt** | | **~13–17h** |

---

## Implementierungsreihenfolge

```
1. P3-A  → Plan-Dateien aufräumen (5 min, kein Risiko)
2. P1-A  → last_touchpoint Fix (höchster User-Impact)
3. P2    → 0%-Coverage-Dateien (je 30–45 min pro Datei)
4. P1-B  → Backup-Scheduler-Integration
5. P1-C  → On-Query-Sync
6. P1-D  → Transcript-Erkennung
7. P3-B  → CHANGELOG anlegen
8. P4-A/B → Release-Checks
```
