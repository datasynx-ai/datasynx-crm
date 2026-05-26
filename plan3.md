# DatasynxOpenCRM — Phase 3 Kickoff-Guide
**Titel:** Team-Modus · **Wochen 9–12**
**Erstellt:** 2026-05-26 · **Revidiert:** 2026-05-26 · **Basis:** Phase 2 vollständig abgeschlossen ✅

> Dieses Dokument ist kein Spec (das bleibt `plan.md`). Es ist der technische Wissenstransfer
> aus Phase 2 — was gelernt wurde, was uns überraschte, und was Phase 3 wirklich braucht.

---

## 1 — Phase 2 Status (Zusammenfassung)

### Was Phase 2 geliefert hat

| Metrik | Wert |
|---|---|
| Tests | 463 (alle grün) |
| Test-Dateien | 48 |
| CLI-Commands | 16+ (status, agent, import, server, audit, backup schedule, ...) |
| Framework-Adapter | 9 (Claude Code, Codex, Cursor, Cline, Windsurf, Hermes, Claude Desktop, OpenClaw, Antigravity) |
| `dxcrm import` | HubSpot CSV + Generic CSV, zwei Passes, LLM-Feld-Mapping |
| `dxcrm agent spawn` | Telegram-Integration, Wake-on-Email, Daemon-Integration |
| LLM-Integration | `summarizeEmail()` + `recognizeCustomer()` mit Anthropic Haiku + Prompt Caching |
| Daemon | 30-Min-Zyklus, Rate-Limit-Backoff, max 50 Kunden/Zyklus, sync-state Persistence |
| On-Query-Sync | Fire-and-forget in `get_customer_context` wenn Sync >30 Min alt |
| Audit Trail | `src/commands/audit.ts`, `.agentic/audit.log` |
| Server Command | `dxcrm server start --data /mnt/crm-data`, PID-Management |

### Was noch offen ist (bewusst verschoben)

| Feature | Verschoben weil |
|---|---|
| Calendar-Sync LLM-Summary | Nur Gmail hat Priorität gehabt — kommt Woche 9 |
| Anthropic API-Call in Agent | Telegram-Delivery priorisiert — Antwort-Entwurf kommt in Phase 3 |
| Cross-Customer Search | Kein User-Trigger — warten auf Feedback |
| Concurrent write safety | Phase 1-Design reicht für Einzelnutzer; Phase 3 (Multi-User) braucht Write-Queue |

---

## 2 — Phase 3 Ziel

```
Ein 3-Personen-Team teilt eine DatasynxOpenCRM-Instanz auf einer VM.
Drei Personen rufen get_customer_context auf und erhalten identische, aktuelle Daten.
```

Konkret messbar:
- Alice, Bob und Carol rufen gleichzeitig `get_customer_context("acme-corp")` auf
- Alle drei sehen dieselbe `interactions.md` — keine verlorenen Updates, keine Race Conditions
- `dxcrm audit` zeigt wer welche Aktion durchgeführt hat (Alice vs. Bob vs. Carol)
- `dxcrm server status` zeigt laufenden Server mit PID
- Session-Owner ist in `get_active_session` sichtbar: `owner: "alice"`

---

## 3 — Technische Architektur

### 3.1 Shared Volume

```
/mnt/crm-data/               ← NFS oder lokales Volume auf VM
  customers/
    acme-corp/
      main_facts.md
      interactions.md
      pipeline.md
  .agentic/
    server.pid               ← PID des HTTP MCP Servers
    audit.log                ← append-only, attributiert
    sessions/                ← aktive Sessions
    sync-state.json
```

Alle Team-Mitglieder schreiben in denselben Ordner. Der HTTP MCP Server ist der einzige Writer-Prozess (serialisiert Requests automatisch durch Node.js Event-Loop).

### 3.2 HTTP MCP Server (bereits implementiert)

```bash
# VM-Start (einmalig, als systemd-Service oder screen-Session)
dxcrm server start --port 3847 --data /mnt/crm-data

# Status prüfen
dxcrm server status
```

Outputs beim Start:
```
DatasynxOpenCRM server running on http://0.0.0.0:3847/mcp
Data dir: /mnt/crm-data
Add to your AI framework config: url: http://<hostname>:3847/mcp
```

### 3.3 Team-Mitglieder verbinden sich via URL

Jedes Team-Mitglied konfiguriert seinen AI-Client (Claude Code, Cursor, etc.) mit der VM-URL:

```json
// Claude Code settings.json
{
  "mcpServers": {
    "datasynx-opencrm": {
      "url": "http://vm-ip:3847/mcp"
    }
  }
}
```

Kein lokaler MCP-Server mehr. Alle Requests gehen an den zentralen HTTP-Server.

### 3.4 Session Ownership

```bash
# Alice öffnet eine Session mit ihrem Namen
DXCRM_ACTOR=alice dxcrm session open acme-corp

# Bob schaut wer die Session hat
dxcrm session status
# → Session: acme-corp | Owner: alice | Since: 14:32
```

`DXCRM_ACTOR` wird aufgelöst nach: Env-Var → Hostname → "system".

In `get_active_session` Response:
```json
{
  "slug": "acme-corp",
  "owner": "alice",
  "openedAt": "2026-05-26T14:32:00Z"
}
```

### 3.5 Audit Trail

Jede schreibende Aktion wird in `.agentic/audit.log` geloggt:

```
2026-05-26T14:32:00Z | alice | session:open | acme-corp
2026-05-26T14:33:15Z | bob   | log:interaction | acme-corp | "Call mit CEO"
2026-05-26T14:45:00Z | carol | deal:update | acme-corp | stage=closed_won
```

Format: `ISO-Timestamp | actor | action | slug | details`
Implementierung: `fs.appendFileSync` (atomic auf Linux für Zeilen <4096 Bytes).

```bash
# Audit-Log anzeigen
dxcrm audit
dxcrm audit --customer acme-corp
dxcrm audit --actor alice
dxcrm audit --since 2026-05-26
```

---

## 4 — Sprint-Plan (Wochen 9–12)

### Woche 9 — Audit Trail

**Ziel:** Jede Team-Aktion ist nachvollziehbar.

- [ ] `src/fs/audit-log.ts` — `appendAuditEntry(actor, action, slug, details?)` + `readAuditLog(filters?)`
- [ ] Audit-Entries in allen schreibenden MCP-Tools: `log_interaction`, `update_deal`, `open_session`, `close_session`
- [ ] Actor-Resolution: `getActor()` → `DXCRM_ACTOR` ?? `os.hostname()` ?? `"system"`
- [ ] `dxcrm audit` Command — Filter nach `--customer`, `--actor`, `--since`, `--limit`
- [ ] Tests: `__tests__/fs/audit-log.test.ts` + `__tests__/commands/audit.test.ts`

**Erledigt wenn:** `dxcrm audit --customer acme-corp` zeigt alle Aktionen für diesen Kunden mit Actor.

### Woche 10 — Session Ownership

**Ziel:** Sessions sind Personen zugeordnet, nicht Prozessen.

- [ ] `--owner` Flag zu `dxcrm session open` hinzufügen (Fallback: `getActor()`)
- [ ] `owner` Feld in `session.json` Schema: `{ slug, owner, openedAt, closedAt? }`
- [ ] `get_active_session` MCP-Tool gibt `owner` zurück
- [ ] `dxcrm session status` zeigt Owner
- [ ] Session-Konflikte: Warnung wenn anderer Owner die Session hat (kein Hard-Block in Phase 3)
- [ ] Tests: Owner-Feld in session.json, `get_active_session` Response

**Erledigt wenn:** Alice öffnet Session → Bob sieht `owner: "alice"` in `get_active_session`.

### Woche 11 — VM Deployment (Server Command bereits fertig)

**Ziel:** Deployment auf echter VM dokumentiert und getestet.

- [ ] `docs/deployment.md` — Schritt-für-Schritt VM-Setup (Ubuntu 22.04 LTS)
  - Node.js Installation (nvm)
  - `npm install -g datasynx-opencrm`
  - `dxcrm init --data /mnt/crm-data`
  - `dxcrm server start --port 3847 --data /mnt/crm-data`
  - systemd Service-File für Auto-Start
  - Firewall: Port 3847 nur im Team-Netzwerk
- [ ] `dxcrm server` Health-Check Endpoint verifizieren (`GET /health`)
- [ ] Framework-Adapter für HTTP-Modus: `dxcrm agent install --url http://vm-ip:3847/mcp`
- [ ] README: "Team-Modus" Sektion mit 5-Minuten-Quickstart

**Erledigt wenn:** Ein Team-Mitglied folgt `docs/deployment.md` und hat einen laufenden shared Server in <15 Minuten.

### Woche 12 — Polish, Team-Docs, erster Team-User

**Ziel:** Erstes Team nutzt dxcrm 7 Tage täglich gemeinsam.

- [ ] Concurrent-Write-Hardening: Write-Queue für `interactions.md` (Mutex über In-Memory-Lock — reicht für Phase 3)
- [ ] `dxcrm status` zeigt Team-Infos: aktive Sessions, letzter Actor, Server-Uptime
- [ ] `docs/team-setup.md` — Onboarding für neue Team-Mitglieder (ohne VM-Zugang)
- [ ] Erster externer Team-User ist ongeboardet
- [ ] Feedback-Loop: Was fehlt für 5-Personen-Team?

**Erledigt wenn:** 3 Personen nutzen `get_customer_context` auf derselben VM-Instanz für 7 Tage. Kein Datenverlust, kein Race Condition.

---

## 5 — Kritischer Pfad

```
[A] src/fs/audit-log.ts  ←── Voraussetzung für alles
     ↓
[B] Actor-Resolution (getActor())
     ↓
[C] Session Ownership (--owner flag, owner in get_active_session)
     ↓
[D] docs/deployment.md + VM-Test
     ↓
[E] Erster Team-User ongeboardet
     ↓
[F] 7 Tage stable → Phase 3 abgeschlossen
```

`[A]` und `[C]` sind größtenteils parallel — aber `getActor()` aus `[B]` wird von beiden gebraucht.
`[D]` ist unabhängig nach `dxcrm server` (bereits implementiert).

---

## 6 — Technische Gotchas

### 6.1 Concurrent Writes zu `interactions.md`

Node.js ist single-threaded pro Prozess. Mehrere HTTP-Connections können jedoch Writes interleaven, wenn async I/O zwischen `readFileSync` und `writeFileSync` stattfindet.

Sicheres Pattern für Phase 3 (In-Memory-Mutex):

```typescript
// src/fs/write-queue.ts
const locks = new Map<string, Promise<void>>();

export async function withFileLock<T>(filepath: string, fn: () => Promise<T>): Promise<T> {
  const existing = locks.get(filepath) ?? Promise.resolve();
  let resolve!: () => void;
  const next = new Promise<void>((r) => (resolve = r));
  locks.set(filepath, next);
  try {
    await existing;
    return await fn();
  } finally {
    resolve();
    if (locks.get(filepath) === next) locks.delete(filepath);
  }
}
```

Für Phase 4 (5+ User): echtes File-Locking via `proper-lockfile` oder SQLite.

### 6.2 LanceDB auf NFS

LanceDB schreibt Arrow-Dateien. Auf NFS können Latenz-Spitzen auftreten:
- `connect()` timeout erhöhen: `{ timeout: 30_000 }`
- Benchmark mit 3+ gleichzeitigen Readers vor erstem Team-Deploy
- Alternative für Phase 4: LanceDB auf lokalem SSD, Daten via Rsync repliziert

### 6.3 Audit Log — Append-Only Garantie

`fs.appendFileSync` ist auf Linux atomic für Schreiboperationen <4096 Bytes (POSIX-Garantie).
Jede Audit-Zeile muss <4096 Bytes bleiben — im Zweifel `details` kürzen.

```typescript
// KORREKT:
fs.appendFileSync(auditLogPath, entry + "\n", "utf-8");

// FALSCH — Race Condition möglich:
const existing = fs.readFileSync(auditLogPath, "utf-8");
fs.writeFileSync(auditLogPath, existing + entry + "\n", "utf-8");
```

### 6.4 Actor-Resolution — Priorität

```typescript
export function getActor(): string {
  return (
    process.env["DXCRM_ACTOR"] ??
    // Session owner (wenn Session aktiv)
    getActiveSessionOwner() ??
    // Hostname als Fallback
    os.hostname() ??
    "system"
  );
}
```

`DXCRM_ACTOR` hat immer Vorrang — erlaubt explizites `DXCRM_ACTOR=alice dxcrm session open`.

### 6.5 PID Files — Immer Prozess-Existenz prüfen

Eine PID-Datei allein bedeutet nicht, dass der Prozess läuft. Immer `process.kill(pid, 0)` verwenden:

```typescript
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0); // Signal 0 = nur Existenz prüfen, nicht killen
    return true;
  } catch {
    return false; // ESRCH = kein solcher Prozess
  }
}
```

Stale PID-Dateien (Prozess gecrasht) werden beim nächsten `dxcrm server status` automatisch gelöscht.

### 6.6 HTTP MCP Server — Security Considerations

Der HTTP MCP Server hört auf `0.0.0.0:3847`. Für Team-Deployment:
- Firewall-Regel: Port 3847 nur im Team-Netzwerk (VLAN/VPC)
- Kein TLS in Phase 3 — Team-Netzwerk als Trust-Boundary
- Phase 4: nginx Reverse-Proxy + Let's Encrypt wenn externe Zugriffe nötig

### 6.7 systemd Service — Restart-Verhalten

```ini
# /etc/systemd/system/dxcrm.service
[Unit]
Description=DatasynxOpenCRM HTTP MCP Server
After=network.target

[Service]
Type=forking
ExecStart=/usr/local/bin/dxcrm server start --port 3847 --data /mnt/crm-data
PIDFile=/mnt/crm-data/.agentic/server.pid
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Gotcha:** `dxcrm server start` spawnt mit `detached: true` und `child.unref()`. Der Parent-Prozess endet sofort. systemd muss `Type=forking` haben und die PID-Datei lesen.

---

## 7 — Nicht bauen in Phase 3 (Trigger fehlt)

| Feature | Trigger |
|---|---|
| TLS / HTTPS | "Ich muss von außerhalb des Firmennetzwerks zugreifen" |
| User-Auth / JWT | Mehr als 1 VM, oder Internet-Exposition |
| Role-Based Access | "Bob soll keine Deals sehen" |
| Cross-Customer Search | Kein User-Trigger bisher |
| File-Locking (proper-lockfile) | Race Condition tatsächlich aufgetreten |
| LanceDB-Replikation | Team >5 Personen oder NFS-Latenz-Probleme |
| Slack-Integration | "Wir nutzen kein Telegram" |
| WebUI / Dashboard | Nach 50+ Team-Installationen |

---

## 8 — Definitions of Done für Phase 3

```
ERLEDIGT WENN:
Ein 3-Personen-Team nutzt dxcrm auf einer gemeinsamen VM 7 Tage täglich.
Alle drei rufen get_customer_context auf — identische Daten, kein Datenverlust.
dxcrm audit zeigt lückenlosen Trail: wer hat wann was gemacht.
```

Konkret messbar:
- `dxcrm audit --customer acme-corp` zeigt Einträge von mindestens 2 verschiedenen Actors
- `get_active_session` gibt `owner` zurück
- `dxcrm server status` zeigt korrekten PID und Laufzeitstatus
- 0 verlorene Schreiboperationen über 7 Tage Concurrent-Use

---

*DatasynxOpenCRM Phase 3 — Das Team arbeitet gemeinsam.*
*Ein Server. Drei Personen. Identische Daten. Lückenloser Audit Trail.*
