# Roadmap — DatasynxOpenCRM

> Stand: 2026-06-10 · npm `datasynx-opencrm` 1.33.0 · Phase: **Härtung & erster externer User**
>
> Dieses Dokument ist die **mittelfristige Steuerungssicht** (Meilensteine, Reihenfolge,
> Exit-Kriterien). Das operative Session-Handoff (Checklisten, Fallstricke, Arbeitsweise)
> steht in [`next-session-sop.md`](./next-session-sop.md). Die öffentliche Kurzfassung
> steht in der [README](../README.md#roadmap).

---

## Nordstern

**Kill-Condition:** Der erste externe User nutzt `dxcrm` **7 Tage täglich ohne HubSpot**.

Jede Priorisierung wird an genau einer Frage gemessen: *Bringt das den ersten externen
User näher an „7 Tage ohne HubSpot"?*

## Wo wir stehen

- Phasen 1–5 abgeschlossen: 82 MCP-Tools · 69 CLI-Commands · lokale Markdown-/NDJSON-Stores · ~3543 Tests grün.
- Zuletzt geliefert: Self-Service-Portal (#58), nativer Scheduler (#53), Teams/Meet-Transcript-Auto-Discovery (#56), Omnichannel-Inbox Web-Chat + WhatsApp (#57), Rollen-Erkennung (#41 A5).
- Einziges offenes Issue: **#20** (Embedding-Eval, blockiert durch fehlenden Modell-Zugriff in der Sandbox).
- **Engpass:** Viele Live-Pfade sind credential-gated No-ops. Kern-Logik und Routing sind
  getestet, aber Teams/Meet-Subscriptions, WhatsApp-Versand, Kalender-Free/Busy und Stripe
  laufen offline nicht. Der Weg zur Kill-Condition führt über **Aktivieren & Härten**, nicht
  über weitere Feature-Breite.

---

## Meilensteine

### M1 — Live-ready *(P0)* — ✅ abgeschlossen 2026-06-10

**Ziel:** Ein externer User kann jede Kernintegration real aktivieren — kein Live-Pfad ist
mehr ein Offline-No-op, kein öffentlicher Endpoint ungehärtet.

| # | Item | Status |
|---|---|---|
| 1 | **Integrations-Setup-Guide + `dxcrm doctor --integrations [--live]`** je Provider | ✅ #64 — Checkliste in `docs/integrations.md`, Live-Probes für Graph/Google/WhatsApp/Stripe/Telegram |
| 2 | **Web-Chat-Rückkanal** (`GET /chat/poll`) + Widget-Polling | ✅ #62 — E2E verifiziert gegen echten Server |
| 3 | **Rate-Limit + Honeypot** für `/chat` & `/webhooks/whatsapp` | ✅ #61 — plus erste echte Routen-Integrationstests |
| 4 | **Echte Subscription-Anlage** + `dxcrm transcripts subscribe` | ✅ #63 — Graph + Workspace Events, inkl. 3 Bugfixes (Renewal-Cross-Talk, übersprungene Renewals, CLI-Exit-Codes) |

**Verifikation durch den externen User:** `dxcrm doctor --integrations --live` muss
für die von ihm genutzten Provider grün sein — das ist der Einstiegspunkt für M2.

### M2 — Der 7-Tage-Härtetest *(P1, direkt nach M1)*

**Ziel:** Das Akzeptanzkriterium selbst fahren — mit echtem oder Test-Tenant.

- Täglicher Betrieb: Morgens-Briefing, Forecast, Öffnungs-/Antwort-Signale, Task-Queue, Online-Angebotsannahme.
- Jede Reibung → **neues, eng geschnittenes Issue** mit Repro (Muster: #41).
- Kritischer Pfad (Link 1–8) bleibt zu 100 % abgedeckt.

**Exit-Kriterium:** 7 aufeinanderfolgende Tage ohne HubSpot; alle dabei entstandenen
P0/P1-Friction-Issues geschlossen. **→ Kill-Condition erfüllt.**

### M3 — Qualität, Robustheit & #20 *(P2/P3, teils parallel zu M1/M2)*

| Item | Status |
|---|---|
| **#20 Embedding-Eval abschließen** | ⏳ blockiert — braucht Umgebung mit HF-Modell-Zugriff; Fixtures + Leitfaden liegen bereit. **Kein blind swap** |
| HTTP-Routen-Integrationstests | ✅ #61/#65 — `/chat(+poll)`, `/webhooks/whatsapp|gmail|microsoft|google|slack`, `/forms`, `/book` (Express auf Port 0 + fetch); fanden 2 echte Bugs (Slack-Signatur, Offline-Double-Booking). Offen: `/q/:token`, `/portal`, `/survey`, `/dashboard`, `/webhooks/stripe` |
| Fehler-/Retry-Verhalten der credential-gated `fetch`-Pfade | ✅ #67 — WhatsApp-Versand failt auf non-ok + Retry nur bei transienten Fehlern; CLI `inbox reply` liefert jetzt auch aus; Attendee-Lookups loggen Ursachen |
| Unmatched-Queue-Workflow/Reminder | ✅ #66 — `transcript.unmatched`-Event, täglicher `queue.unmatched_digest`, `dxcrm transcripts resolve <ref>` |

### M4 — Nach der Kill-Condition *(bewusst nicht begonnen)*

Erst wenn M2 bestanden ist:

- Weitere Notification-Channels (Slack)
- Optionales Read-only-Web-Dashboard
- Zusätzliche LLM-Provider für On-Device-Summarization
- Community-Plugin-Marketplace

---

## Sequenzierung & Abhängigkeiten

```
M1 (Live-ready) ──→ M2 (7-Tage-Härtetest) ──→ M4 (Wachstum)
        │
M3 läuft teilweise parallel; #20 ist umgebungsabhängig (HF-Zugriff)
```

- M2 setzt M1 voraus: ohne Rückkanal, Subscription-Anlage und Setup-Doku ist ein ehrlicher Härtetest nicht möglich.
- M3-Items sind einzeln pickbar und blockieren nichts; #20 wird gezogen, sobald eine Umgebung mit Modell-Zugriff verfügbar ist.
- M4 ist hart durch M2 gegated — keine neue Feature-Breite vor bestandener Kill-Condition.

## Nicht-Ziele (bewusst)

- Keine neuen Feature-Flächen vor M2 (der Engpass ist Aktivierung, nicht Breite).
- Kein Embedding-Default-Wechsel ohne Messung (#20-Regel).
- Kein eigenes Web-UI über Portal + Chat-Widget hinaus vor M4.
- Keine Änderung an strategischer Richtung, Kill-Conditions oder externen Verträgen ohne Rückfrage (siehe `CLAUDE.md`).

## Pflege

Diese Roadmap wird bei jedem Meilenstein-Abschluss (und bei neuen Erkenntnissen aus dem
Härtetest) aktualisiert. Operative Details und Lessons Learned gehören ins
[SOP](./next-session-sop.md), nicht hierher.
