# Roadmap — DatasynxOpenCRM

> Stand: 2026-06-11 · npm `datasynx-opencrm` 1.38.0+ · Phase: **Härtung & erster externer User**
>
> Dieses Dokument ist die **mittelfristige Steuerungssicht** (Meilensteine, Reihenfolge,
> Exit-Kriterien). Operatives Session-Handoff (Checklisten, Fallstricke, Arbeitsweise)
> steht im [SOP](./next-session-sop.md); die öffentliche Kurzfassung in der
> [README](../README.md#roadmap). **Offene Arbeit im Detail = GitHub-Issues.**

---

## Nordstern

**Kill-Condition:** Der erste externe User nutzt `dxcrm` **7 Tage täglich ohne HubSpot**.

Jede Priorisierung wird an genau einer Frage gemessen: *Bringt das den ersten externen
User näher an „7 Tage ohne HubSpot"?*

## Wo wir stehen

- **Phasen 1–5 + M1 + M3-Sandbox-Anteil abgeschlossen.** 82 MCP-Tools · 69 CLI-Commands ·
  lokale Markdown-/NDJSON-Stores · ~3736 Tests grün · Coverage-Gate (80 % Branches) grün.
  Details der Auslieferung: Git-History und geschlossene Issues (#61–#69, #71, #72).
- **Engpass:** Viele Live-Pfade sind credential-gated No-ops. Kern-Logik und Routing sind
  getestet, aber Teams/Meet-Subscriptions, WhatsApp-Versand, Kalender-Free/Busy und Stripe
  laufen offline nicht. Der Weg zur Kill-Condition führt über **Aktivieren & Härten**, nicht
  über weitere Feature-Breite.

---

## Meilensteine

### M1 — Live-ready *(P0)* — ✅ abgeschlossen 2026-06-10
Jede Kernintegration real aktivierbar, kein Live-Pfad mehr ein Offline-No-op, öffentliche
Endpoints gehärtet (#61–#64). Einstiegspunkt für M2: `dxcrm doctor --integrations --live`.

### M2 — Der 7-Tage-Härtetest *(P1, der Engpass)* — ⏳ **#73**
Das Akzeptanzkriterium selbst fahren (echter/Test-Tenant). Täglicher Betrieb über den
kritischen Pfad (Link 1–8); jede Reibung → neues eng geschnittenes Issue (Muster: #41).
**Exit-Kriterium:** 7 aufeinanderfolgende Tage ohne HubSpot, alle dabei entstandenen
P0/P1-Friction-Issues geschlossen. **→ Kill-Condition erfüllt.** *Operator-/Dogfooding-Task.*

### M3 — Qualität & Robustheit *(P2/P3, teils parallel)*
Sandbox-Anteil abgeschlossen (Routen-Integrationstests, Outbound-Robustheit, Unmatched-
Transcript-Queue, Coverage-Gate; #65–#69). **Offen:**
- **#74** — verbleibende Coverage-Randlücken (`sync/calendly.ts`, `core/llm.ts`-Provider,
  `sync/calendar-availability.ts`). Sandbox-fähig.
- **#75** — Unmatched **Conversations** (das #66-Muster auf Conversations übertragen).
- **#20** — Embedding-Eval abschließen; braucht Umgebung mit HF-Modell-Zugriff. Kein blind swap.

### M4 — Nach der Kill-Condition *(bewusst nicht begonnen, gegated durch M2)*
- **#76** Slack als first-class Notification-Channel · **#77** Read-only Web-Dashboard ·
  **#78** weitere LLM-Provider für On-Device-Summarization · **#79** Community-Plugin-Marketplace.

### Querschnitt
- **#80** English-only Policy über die Codebase erzwingen (sandbox-fähig).
- **#70** Dependabot-Alert-Triage (wartet auf Operator-Input).

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
