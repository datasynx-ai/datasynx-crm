# D14 — Revenue Simulation Engine: Implementierungsplan

> Basis: plan-next-dxc.md · D14 · Stand: 2026-05-27
> TDD-First. Kein Produktionscode ohne vorherigen Test.
> Baut auf D11 (graph.ts), D12 (relationship-health.ts), D13 (deal-agent.ts), deal-health.ts auf.

---

## Was D14 liefert

Die erste **probabilistische Umsatz-Prognose** — keine Punkt-Forecast mehr, sondern ein
**Monte Carlo** über das gesamte Deal-Portfolio mit expliziten Konfidenz-Intervallen.

Drei neue Konzepte:
- **P10/P50/P90**: Best Case, Realfall, Worst Case als Zahlen-Tripel
- **Sensitivity Map**: Welcher Deal hat den größten Einfluss auf den Forecast
- **Adjusted Probability**: Wahrscheinlichkeit wird durch Health-Score + Champion-Presence korrigiert

**User-sichtbare Änderungen:**
- Neues MCP-Tool `simulate_revenue` — Monte Carlo Pipeline-Forecast mit P10/P50/P90
- Kein Breaking Change zu bestehenden Tools
- `externalSignals` Interface vorbreitet für D18 (jetzt: leere Liste)

**Was D14 NICHT tut (v1-Grenzen):**
- Keine externen Signale (Funding, News) — das kommt in D18
- Kein cron/Daemon-Trigger — das kommt in D20
- Kein Playbook-Match — das kommt in D15

---

## Neue Dateien

```
src/core/revenue-simulation.ts              ← Core: Monte Carlo + pure Hilfsfunktionen
src/mcp/tools/simulate-revenue.ts           ← MCP-Tool: simulate_revenue

__tests__/core/revenue-simulation.test.ts
__tests__/mcp/tools/simulate-revenue.test.ts
```

## Geänderte Dateien

```
src/mcp/server.ts        ← registerSimulateRevenue() (19 tools)
src/mcp/capabilities.ts  ← simulate_revenue in CAPABILITIES_TEXT
README.md
docs/mcp-tools.md
docs/index.html
```

---

## Technische Recherche & Designentscheidungen

### Warum Monte Carlo statt Weighted Sum?

`get_pipeline_forecast` (v1) berechnet `sum(value * probability / 100)` — ein deterministischer
Punkt-Forecast. Das ist mathematisch korrekt für den **Erwartungswert**, sagt aber nichts über
die **Verteilung** der möglichen Outcomes aus.

Monte Carlo simuliert N unabhängige Zufallsversuche. Bei 10.000 Iterationen:
- Jeder Deal wird nach seiner (adjustierten) Wahrscheinlichkeit "gewonnen" oder "verloren"
- Gewonnene Deals bekommen einen kleinen Wert-Jitter (+/-15% Variance)
- Das Ergebnis: ein Array von 10.000 möglichen Quartals-Revenues
- P10/P50/P90 = 10./50./90. Perzentile dieser Verteilung

Der P50 sollte nahe am Weighted-Sum-Forecast liegen. Die Differenz P90-P10 ist die
**Forecast-Unsicherheit** — die v1 komplett verschweigt.

### Probability Adjustment (der kritische Unterschied zu v1)

v1 nimmt `deal.probability` as-is. D14 **adjustiert** diese Wahrscheinlichkeit:

```typescript
function adjustProbability(deal: DealSnapshot, signals: ExternalSignal[]): number {
  let prob = deal.probability / 100;

  // Health adjustment: health 60 = neutral, < 60 = malus, > 60 = bonus
  // Range: -0.12 (health=0) to +0.08 (health=100)
  const healthAdj = (deal.healthScore - 60) / 100 * 0.2;
  prob += healthAdj;

  // Champion bonus: +5% wenn identifiziert
  if (deal.championPresent) prob += 0.05;

  // External signal adjustment (D18-ready)
  for (const signal of signals) {
    if (signal.slug === deal.slug) {
      if (signal.impact === "positive") prob += 0.05 * signal.magnitude;
      if (signal.impact === "negative") prob -= 0.10 * signal.magnitude;
    }
  }

  return Math.max(0.02, Math.min(0.98, prob));  // Clamp: nie 0% oder 100%
}
```

Effekte:
- Deal mit Prob 75% + Health 20 (Grade F) + kein Champion → adjustedProb ≈ 60%
- Deal mit Prob 50% + Health 85 (Grade A) + Champion → adjustedProb ≈ 64%
- Deterministisch aus vorhandenen D11/D12-Daten — kein API-Key nötig

### Seeded Random für Tests

`Math.random()` macht Tests nicht-deterministisch. Lösung: `randFn` als injizierbarer Parameter:

```typescript
export function runSimulation(
  input: SimulationInput,
  randFn: () => number = Math.random
): SimulationResult
```

In Tests: entweder deterministischer Mock (`() => 0.5` → immer 50% Chance), oder
statistische Property-Tests mit echter `Math.random` + 1000 Iterationen
(P10 < P50 < P90 gilt immer mit sehr hoher Wahrscheinlichkeit).

### Sensitivity Map (analytisch, nicht simulationsbasiert)

Statt für jeden Deal eine zweite Simulation zu laufen, berechnen wir die Sensitivity
analytisch: `sensitivity[deal.name] = deal.value * adjustedProbability(deal)`.

Das ist der erwartete Beitrag jedes Deals zum Forecast. Deals werden nach diesem
Wert sortiert — der erste Eintrag in `topRisks` ist der Deal mit dem höchsten
Forecast-Impact der im Risiko ist (Health < 60).

### byCloseMonth

Innerhalb der Simulation tracken wir pro Iteration welche Deals gewonnen wurden
und ihren Close-Monat (`deal.closeDate.slice(0, 7)` → "2026-06"). Am Ende:
Array von Monat-Outcomes → P10/P50/P90 pro Monat.

### buildSimulationInput (Daten-Aggregation)

Liest alle Kunden-Pipelines + Health + Graphen und baut `DealSnapshot[]`:

```typescript
export async function buildSimulationInput(
  dataDir: string,
  horizon: "quarter" | "year",
  today: string
): Promise<SimulationInput>
```

Filtert `won`/`lost` Deals heraus. Für `horizon: "quarter"` werden nur Deals mit
`closeDate` im aktuellen Quartal (oder kein closeDate) einbezogen.

---

## Datenmodell (exakt, TypeScript-ready)

### `src/core/revenue-simulation.ts`

```typescript
// External signals — vorbreitet für D18, jetzt immer []
export interface ExternalSignal {
  slug: string;
  type: "funding_round" | "leadership_change" | "news_positive" | "news_negative";
  impact: "positive" | "negative" | "neutral";
  magnitude: number; // 0.0–1.0
  summary: string;
}

export interface DealSnapshot {
  slug: string;
  name: string;
  stage: string;
  value: number;
  probability: number;       // 0–100, aus stage-config oder deal
  closeDate?: string;         // YYYY-MM-DD, optional
  healthScore: number;       // 0–100, aus D12 (HealthSnapshot.overallHealth oder contact avg)
  daysSinceContact: number;
  championPresent: boolean;  // aus D11 Graph
}

export interface SimulationInput {
  deals: DealSnapshot[];
  externalSignals: ExternalSignal[];
  iterations: number;         // default 10_000
  horizon: "quarter" | "year";
  today: string;              // YYYY-MM-DD, injiziert für Testbarkeit
}

export interface MonthForecast {
  p50: number;
  range: [number, number];  // [p10, p90]
}

export interface SimulationResult {
  p10: number;
  p50: number;
  p90: number;
  expected: number;
  stdDev: number;
  atRiskRevenue: number;
  byCloseMonth: Record<string, MonthForecast>;
  topRisks: string[];
  sensitivityMap: Record<string, number>;
}
```

### Beispiel-Output `simulate_revenue`

```json
{
  "forecast": {
    "p10": 145000,
    "p50": 287500,
    "p90": 412000,
    "expected": 289300,
    "stdDev": 82000,
    "atRiskRevenue": 75000,
    "byCloseMonth": {
      "2026-06": { "p50": 120000, "range": [80000, 165000] },
      "2026-07": { "p50": 167500, "range": [90000, 247000] }
    },
    "topRisks": [
      "acme-corp/Enterprise License: health 38 (grade D), champion silent — €75k at risk",
      "beta-gmbh/Renewal: cold contact, no close date — €50k uncertain"
    ],
    "sensitivityMap": {
      "Enterprise License": 56250,
      "Q3 Renewal": 37500
    }
  },
  "confidence": "P50 forecast: €287.5k with ±€133k uncertainty (P10–P90 range). 28% of pipeline is at risk.",
  "dealCount": 5,
  "horizon": "quarter",
  "simulatedAt": "2026-05-27T14:00:00.000Z"
}
```

---

## Datei 1: `src/core/revenue-simulation.ts` — vollständige API

### Imports

```typescript
import fs from "fs";
import path from "path";
import { readPipeline } from "../fs/pipeline-writer.js";
import { readHealth, computeCustomerHealth } from "./relationship-health.js";
import { readGraph, getStakeholders } from "./graph.js";
import { getPipelineStages } from "./pipeline-stages.js";
```

### Pure Hilfsfunktionen

```typescript
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx]!;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function stdDevFn(values: number[], m: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function adjustProbability(deal: DealSnapshot, signals: ExternalSignal[] = []): number {
  let prob = deal.probability / 100;

  const healthAdj = (deal.healthScore - 60) / 100 * 0.2;
  prob += healthAdj;

  if (deal.championPresent) prob += 0.05;

  for (const signal of signals) {
    if (signal.slug === deal.slug) {
      if (signal.impact === "positive") prob += 0.05 * signal.magnitude;
      if (signal.impact === "negative") prob -= 0.10 * signal.magnitude;
    }
  }

  return Math.max(0.02, Math.min(0.98, prob));
}

export function closeVarianceFn(deal: DealSnapshot, randFn: () => number): number {
  // Mehr Variance für weit entfernte Close Dates
  const daysToClose =
    deal.closeDate
      ? Math.max(0, Math.floor((new Date(deal.closeDate).getTime() - Date.now()) / 86_400_000))
      : 90;
  const variance = daysToClose < 30 ? 0.05 : 0.15;
  return 1 + (randFn() - 0.5) * 2 * variance;
}

export function buildSensitivityMap(
  deals: DealSnapshot[],
  signals: ExternalSignal[]
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const deal of deals) {
    map[deal.name] = Math.round(deal.value * adjustProbability(deal, signals));
  }
  return map;
}

export function buildTopRisks(
  deals: DealSnapshot[],
  signals: ExternalSignal[],
  sensitivityMap: Record<string, number>
): string[] {
  const atRisk = deals.filter(
    (d) => d.healthScore < 60 || d.daysSinceContact > 14
  );
  return atRisk
    .sort((a, b) => (sensitivityMap[b.name] ?? 0) - (sensitivityMap[a.name] ?? 0))
    .slice(0, 5)
    .map((d) => {
      const reasons: string[] = [];
      if (d.healthScore < 60) reasons.push(`health ${d.healthScore}`);
      if (d.daysSinceContact > 14) reasons.push(`${d.daysSinceContact}d no contact`);
      if (!d.championPresent) reasons.push("no champion");
      return `${d.slug}/${d.name}: ${reasons.join(", ")} — €${d.value} at risk`;
    });
}
```

### runSimulation (Kern-Funktion)

```typescript
export function runSimulation(
  input: SimulationInput,
  randFn: () => number = Math.random
): SimulationResult {
  const { deals, externalSignals, iterations } = input;

  if (deals.length === 0) {
    return {
      p10: 0, p50: 0, p90: 0, expected: 0, stdDev: 0,
      atRiskRevenue: 0,
      byCloseMonth: {},
      topRisks: [],
      sensitivityMap: {},
    };
  }

  const adjustedProbs = deals.map((d) => adjustProbability(d, externalSignals));
  const outcomes: number[] = [];
  const byMonthOutcomes: Record<string, number[]> = {};

  for (let i = 0; i < iterations; i++) {
    let total = 0;
    const monthTotals: Record<string, number> = {};

    for (let j = 0; j < deals.length; j++) {
      const deal = deals[j]!;
      const prob = adjustedProbs[j]!;
      if (randFn() < prob) {
        const closedValue = Math.round(deal.value * closeVarianceFn(deal, randFn));
        total += closedValue;

        if (deal.closeDate) {
          const month = deal.closeDate.slice(0, 7);
          monthTotals[month] = (monthTotals[month] ?? 0) + closedValue;
        }
      }
    }

    outcomes.push(total);

    for (const [month, val] of Object.entries(monthTotals)) {
      if (!byMonthOutcomes[month]) byMonthOutcomes[month] = [];
      byMonthOutcomes[month]!.push(val);
    }
  }

  outcomes.sort((a, b) => a - b);
  const exp = Math.round(mean(outcomes));
  const sd = Math.round(stdDevFn(outcomes, exp));

  const byCloseMonth: Record<string, MonthForecast> = {};
  for (const [month, vals] of Object.entries(byMonthOutcomes)) {
    const sorted = [...vals].sort((a, b) => a - b);
    byCloseMonth[month] = {
      p50: Math.round(percentile(sorted, 50)),
      range: [Math.round(percentile(sorted, 10)), Math.round(percentile(sorted, 90))],
    };
  }

  const sensitivityMap = buildSensitivityMap(deals, externalSignals);
  const topRisks = buildTopRisks(deals, externalSignals, sensitivityMap);

  const atRiskRevenue = deals
    .filter((d) => d.healthScore < 60)
    .reduce((s, d) => s + d.value, 0);

  return {
    p10: Math.round(percentile(outcomes, 10)),
    p50: Math.round(percentile(outcomes, 50)),
    p90: Math.round(percentile(outcomes, 90)),
    expected: exp,
    stdDev: sd,
    atRiskRevenue,
    byCloseMonth,
    topRisks,
    sensitivityMap,
  };
}
```

### buildSimulationInput (Daten-Aggregation)

```typescript
export async function buildSimulationInput(
  dataDir: string,
  horizon: "quarter" | "year",
  today: string,
  externalSignals: ExternalSignal[] = []
): Promise<SimulationInput> {
  const customersDir = path.join(dataDir, "customers");
  if (!fs.existsSync(customersDir)) {
    return { deals: [], externalSignals, iterations: 10_000, horizon, today };
  }

  const slugs = fs.readdirSync(customersDir).filter((d) =>
    fs.statSync(path.join(customersDir, d)).isDirectory()
  );

  const stages = getPipelineStages(dataDir);
  const stageProb: Record<string, number> = {};
  for (const s of stages) {
    stageProb[s.id] = s.probability ?? 50;
  }

  const deals: DealSnapshot[] = [];
  const todayDate = new Date(today);

  // Quarter boundary for horizon filter
  const quarterEnd = getQuarterEnd(todayDate);
  const yearEnd = new Date(todayDate.getFullYear(), 11, 31);
  const horizonEnd = horizon === "quarter" ? quarterEnd : yearEnd;

  for (const slug of slugs) {
    const pipelineDeals = await readPipeline(dataDir, slug).catch(() => []);

    // Health: prefer cached, fallback to compute
    const health = readHealth(dataDir, slug) ?? computeCustomerHealth(dataDir, slug, today);
    const healthScore = health.overallHealth;

    // Champion presence from graph
    const graph = readGraph(dataDir, slug);
    const stakeholders = getStakeholders(graph);
    const championPresent = stakeholders.champions.length > 0;

    // Days since last contact
    const lastContact = health.contacts
      .map((c) => c.lastContact)
      .filter(Boolean)
      .sort()
      .pop();
    const daysSinceContact = lastContact
      ? Math.floor((todayDate.getTime() - new Date(lastContact).getTime()) / 86_400_000)
      : 999;

    for (const deal of pipelineDeals) {
      if (deal.stage === "won" || deal.stage === "lost") continue;

      // Horizon filter: skip deals whose close date is beyond horizon
      if (deal.close_date && deal.close_date.trim() !== "") {
        const closeDate = new Date(deal.close_date);
        if (closeDate > horizonEnd) continue;
      }

      const probability = deal.probability ?? stageProb[deal.stage] ?? 50;
      const snapshot: DealSnapshot = {
        slug,
        name: deal.name,
        stage: deal.stage,
        value: deal.value ?? 0,
        probability,
        healthScore,
        daysSinceContact,
        championPresent,
      };
      if (deal.close_date && deal.close_date.trim() !== "") {
        snapshot.closeDate = deal.close_date;
      }
      deals.push(snapshot);
    }
  }

  return { deals, externalSignals, iterations: 10_000, horizon, today };
}

function getQuarterEnd(date: Date): Date {
  const month = date.getMonth(); // 0–11
  const quarterEndMonth = Math.floor(month / 3) * 3 + 2; // 2, 5, 8, 11
  return new Date(date.getFullYear(), quarterEndMonth + 1, 0); // last day of quarter-end month
}
```

### Confidence-Nachricht (optional, für MCP-Output)

```typescript
export function buildConfidenceMessage(result: SimulationResult, dealCount: number): string {
  const range = result.p90 - result.p10;
  const uncertainty = result.p50 > 0 ? Math.round(range / result.p50 * 100) : 0;
  const atRiskPct = result.expected > 0
    ? Math.round(result.atRiskRevenue / result.expected * 100)
    : 0;
  return `P50 forecast: €${(result.p50 / 1000).toFixed(1)}k with ±€${(range / 2 / 1000).toFixed(1)}k uncertainty (P10–P90 range). ${atRiskPct}% of pipeline is at risk. ${dealCount} deals simulated.`;
}
```

---

## Datei 2: `src/mcp/tools/simulate-revenue.ts`

```typescript
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  buildSimulationInput,
  runSimulation,
  buildConfidenceMessage,
} from "../../core/revenue-simulation.js";

const DATA_DIR = process.cwd();

export async function handleSimulateRevenue(
  input: { horizon?: "quarter" | "year"; iterations?: number },
  dataDir: string = DATA_DIR
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const horizon = input.horizon ?? "quarter";

    const simInput = await buildSimulationInput(dataDir, horizon, today);
    if (input.iterations !== undefined) simInput.iterations = input.iterations;

    const result = runSimulation(simInput);
    const confidence = buildConfidenceMessage(result, simInput.deals.length);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              forecast: result,
              confidence,
              dealCount: simInput.deals.length,
              horizon,
              simulatedAt: new Date().toISOString(),
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: false, error: (err as Error).message }, null, 2),
        },
      ],
    };
  }
}

export function registerSimulateRevenue(server: McpServer): void {
  server.registerTool(
    "simulate_revenue",
    {
      title: "Simulate Revenue",
      description: `Monte Carlo pipeline revenue simulation with P10/P50/P90 confidence intervals.

Adjusts deal win probabilities using relationship health scores (D12) and
champion presence (D11). Returns the range of possible quarterly/annual outcomes.

Use this instead of (or alongside) get_pipeline_forecast when you need:
- Uncertainty quantification (not just expected value)
- At-risk revenue identification
- Deal sensitivity analysis ("which deal matters most")
- Month-by-month close distribution

Args:
  horizon: "quarter" (default) | "year"
  iterations: simulation iterations (default: 10000)

Returns: { forecast: { p10, p50, p90, expected, stdDev, atRiskRevenue, byCloseMonth, topRisks, sensitivityMap }, confidence, dealCount, horizon }`,
      inputSchema: z.object({
        horizon: z.enum(["quarter", "year"]).optional().describe('Forecast horizon (default: "quarter")'),
        iterations: z.number().optional().describe("Monte Carlo iterations (default: 10000)"),
      }),
    },
    async ({ horizon, iterations }) => handleSimulateRevenue({ horizon, iterations })
  );
}
```

---

## TDD — Test-Spezifikationen

### `__tests__/core/revenue-simulation.test.ts`

**Muster:** Keine memfs nötig für pure-function-Tests. `buildSimulationInput`-Tests verwenden
`vol.fromJSON()` + `vi.resetModules()` (gleich wie D11–D13).

#### percentile

```
✓ returns 0 for empty array
✓ returns only element for single-element array
✓ p50 of [1,2,3,4,5] is 3
✓ p10 of sorted array is near the lower end
✓ p90 of sorted array is near the upper end
```

#### mean

```
✓ returns 0 for empty array
✓ returns value for single element
✓ correct for [10, 20, 30] → 20
```

#### stdDevFn

```
✓ returns 0 for single element
✓ returns 0 for two identical values
✓ returns correct value for [0, 2, 4] (approx 1.63)
```

#### adjustProbability

```
✓ returns probability/100 for neutral health (60) and no champion
✓ adds health bonus for high health (85) → prob increases
✓ adds health malus for low health (20) → prob decreases
✓ adds champion bonus (+5%) when championPresent=true
✓ clamps to 0.02 minimum (can never be 0)
✓ clamps to 0.98 maximum (can never be 1)
✓ positive external signal increases probability
✓ negative external signal decreases probability
✓ signal for different slug is ignored
```

#### closeVarianceFn

```
✓ returns value near 1.0 (between 0.7 and 1.3)
✓ deal with close date <30d has lower variance than >90d deal
✓ deterministic with fixed randFn () => 0.5 → returns exactly 1.0
```

#### buildSensitivityMap

```
✓ empty deals returns empty map
✓ map keys are deal names
✓ higher-value deals have higher sensitivity
✓ higher-probability deals have higher sensitivity
```

#### buildTopRisks

```
✓ returns empty array when no at-risk deals
✓ returns risks sorted by sensitivity (highest value at risk first)
✓ includes health score in risk description
✓ includes days since contact in risk description
✓ limits to 5 entries
```

#### runSimulation — empty input

```
✓ returns all zeros for empty deals array
✓ byCloseMonth is empty object
✓ topRisks is empty array
✓ sensitivityMap is empty object
```

#### runSimulation — statistical properties (10 tests)

```
✓ p10 ≤ p50 ≤ p90 (ordering invariant)
✓ expected is between p10 and p90
✓ stdDev > 0 when multiple deals exist
✓ with randFn always returning 0 (all deals lose): p10=p50=p90=0
✓ with randFn always returning 1 (all deals win): p10=p50=p90=sum of values (with variance)
✓ p50 is close to weighted sum (within 30% for 1000 iterations, 10 deals)
✓ atRiskRevenue = sum of values for deals with healthScore < 60
✓ byCloseMonth contains keys matching deal close dates
✓ sensitivityMap contains entry for each deal
✓ topRisks only contains deals with healthScore < 60 or daysSinceContact > 14
```

#### buildSimulationInput (integration, memfs)

```
✓ returns empty deals array when customers dir missing
✓ returns DealSnapshot for each active deal
✓ filters out won/lost deals
✓ uses stage probability when deal.probability is missing
✓ filters deals beyond quarter horizon
✓ includes closeDate in snapshot when set in pipeline.md
✓ championPresent=true when graph has champion
✓ healthScore from readHealth when fresh health.json exists
```

### `__tests__/mcp/tools/simulate-revenue.test.ts`

```
✓ returns forecast object with p10/p50/p90 keys
✓ defaults to horizon=quarter
✓ returns dealCount in response
✓ returns simulatedAt timestamp
✓ returns empty forecast (all zeros) when no customers dir
✓ accepts horizon=year
✓ registers tool with name simulate_revenue
```

---

## Implementierungsreihenfolge (8 Schritte)

```
Schritt 1: Tests schreiben
  → __tests__/core/revenue-simulation.test.ts       (alle rot)
  → __tests__/mcp/tools/simulate-revenue.test.ts    (alle rot)

Schritt 2: Typen + pure Hilfsfunktionen
  → src/core/revenue-simulation.ts
  → ExternalSignal, DealSnapshot, SimulationInput, SimulationResult, MonthForecast
  → percentile, mean, stdDevFn, adjustProbability, closeVarianceFn
  → npm test → pure-function-Tests grün

Schritt 3: buildSensitivityMap + buildTopRisks + buildConfidenceMessage
  → npm test → Sensitivity-Tests grün

Schritt 4: runSimulation (Monte Carlo Kern)
  → npm test → runSimulation-Tests grün

Schritt 5: buildSimulationInput (Daten-Aggregation, memfs)
  → getQuarterEnd Hilfsfunktion
  → npm test → buildSimulationInput-Tests grün

Schritt 6: MCP-Tool
  → src/mcp/tools/simulate-revenue.ts
  → handleSimulateRevenue + registerSimulateRevenue
  → npm test → MCP-Tests grün

Schritt 7: Integration
  → src/mcp/server.ts — registerSimulateRevenue (19 tools)
  → src/mcp/capabilities.ts — simulate_revenue Tabelle + Referenz

Schritt 8: Full-Suite + Docs + Commit
  → npm test → alle Tests grün
  → npm run build → kein Fehler
  → npm run typecheck → kein Fehler
  → README.md, docs/mcp-tools.md, docs/index.html
  → git commit + git push
```

---

## Wichtige Implementierungsdetails (Fallstricke)

### `exactOptionalPropertyTypes` in DealSnapshot

`closeDate` und `lastContact` sind optional. Nicht `undefined` zuweisen:

```typescript
// FALSCH
const snap: DealSnapshot = { closeDate: deal.close_date ?? undefined };

// RICHTIG
const snap: DealSnapshot = { ... };
if (deal.close_date && deal.close_date.trim() !== "") snap.closeDate = deal.close_date;
```

### Monte Carlo Variance mit `closeVarianceFn`

`closeVarianceFn` ruft `randFn()` zweimal auf (einmal für win/lose, einmal für variance).
Der Test `deterministic with fixed randFn () => 0.5 → returns exactly 1.0` stimmt:
`1 + (0.5 - 0.5) * 2 * variance = 1 + 0 = 1.0`. ✓

### `byCloseMonth` — leere Slots

Monate die in keiner Iteration vorkommen (alle Deals verloren) sind NICHT im `byCloseMonth`
Ergebnis. Tests dürfen nicht `expect(result.byCloseMonth["2026-06"]).toBeDefined()` prüfen
ohne sicherzustellen, dass mindestens ein Deal gewonnen wird.

Fix: `with randFn () => 0` (alle verlieren) → `byCloseMonth = {}`. Test entsprechend.

### `buildSimulationInput` — horizon filter

```typescript
// Quarter: 2026-05-27 → Q2 ends 2026-06-30
// Jahr: 2026-05-27 → endet 2026-12-31
// Deal ohne closeDate: immer einbeziehen (horizon-unabhängig)
// Deal mit closeDate > horizonEnd: überspringen
```

`getQuarterEnd`:
```typescript
function getQuarterEnd(date: Date): Date {
  const month = date.getMonth();              // 0-indexed: Mai = 4
  const quarterEndMonth = Math.floor(month / 3) * 3 + 2;  // 4 → 5, also Monat 5 (Juni)
  return new Date(date.getFullYear(), quarterEndMonth + 1, 0); // day 0 = letzter Tag des Vormonats
}
// getQuarterEnd(2026-05-27) = new Date(2026, 6, 0) = 2026-06-30 ✓
```

### MCP Tool: `iterations` Override

Der User kann `iterations` überschreiben für schnelle Tests:
```
simulate_revenue({ horizon: "quarter", iterations: 100 })
```
In Tests übergeben wir `iterations: 100` direkt an `buildSimulationInput.iterations`
(via `if (input.iterations !== undefined) simInput.iterations = input.iterations`).

### `exactOptionalPropertyTypes` in handleSimulateRevenue

```typescript
// FALSCH in MCP handler:
async ({ horizon, iterations }) => handleSimulateRevenue({ horizon, iterations })
// → horizon kann undefined sein → Type-Error

// RICHTIG:
async ({ horizon, iterations }) =>
  handleSimulateRevenue({
    ...(horizon !== undefined ? { horizon } : {}),
    ...(iterations !== undefined ? { iterations } : {}),
  })
```

### Keine `vi.mock()` nötig

`runSimulation` ist eine reine Funktion. Keine LLM-Calls, keine Filesystem-Zugriffe.
`buildSimulationInput` liest Filesystem → memfs + `vi.resetModules()` + dynamic import.

---

## Daten-Abhängigkeiten

```
pipeline.md      ─── readPipeline ─────────────────────────────▶  buildSimulationInput
health.json      ─── readHealth / computeCustomerHealth ────────▶  ↑
graph.json       ─── readGraph + getStakeholders ───────────────▶  ↑
pipeline-stages  ─── getPipelineStages ─────────────────────────▶  ↑ (stage probability fallback)
                                                                     ↓
                                              SimulationInput (DealSnapshot[])
                                                                     ↓
                                                           runSimulation (Monte Carlo)
                                                                     ↓
                                                    percentile / mean / stdDev
                                                                     ↓
                                                          SimulationResult
                                                                     ↓
                                              buildConfidenceMessage + MCP Response
```

---

## Test-Count Prognose

| Datei | Tests |
|---|---|
| `__tests__/core/revenue-simulation.test.ts` | ~42 |
| `__tests__/mcp/tools/simulate-revenue.test.ts` | ~7 |
| **Gesamt neue Tests** | **~49** |
| Gesamt nach D14 | **~1070** |
