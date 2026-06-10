import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import {
  signDashboardToken,
  verifyDashboardToken,
  buildDashboardData,
  renderDashboardHtml,
} from "../../src/core/dashboard.js";

const DATA_DIR = "/data";
const TODAY = new Date().toISOString().slice(0, 10);

beforeEach(() => vol.reset());

function pipelineMd(rows: string): string {
  return `# Pipeline\n\n| Deal | Stage | Value | Currency | Probability | Close Date | Updated |\n|---|---|---|---|---|---|---|\n${rows}\n`;
}

describe("dashboard token", () => {
  it("round-trips, rejects tamper and expiry", () => {
    const t = signDashboardToken({ a: "mona", exp: Date.now() + 60_000 });
    expect(verifyDashboardToken(t)?.a).toBe("mona");
    expect(verifyDashboardToken(t.slice(0, -2) + "00")).toBeNull();
    const expired = signDashboardToken({ a: "mona", exp: Date.now() - 1 });
    expect(verifyDashboardToken(expired)).toBeNull();
  });
});

describe("buildDashboardData (RBAC)", () => {
  beforeEach(() => {
    vol.fromJSON({
      [`${DATA_DIR}/.agentic/rbac.json`]: JSON.stringify({
        actors: { carol: "rep", mona: "manager" },
        owned_customers: { carol: ["acme"] },
      }),
      [`${DATA_DIR}/customers/acme/pipeline.md`]: pipelineMd(
        `| A | proposal | 10000 | EUR | 50 |  | ${TODAY} |`
      ),
      [`${DATA_DIR}/customers/beta/pipeline.md`]: pipelineMd(
        `| B | qualified | 8000 | EUR | 50 |  | ${TODAY} |`
      ),
    });
  });

  it("manager sees the full forecast + global tiles", async () => {
    const data = await buildDashboardData(DATA_DIR, "mona");
    expect(data.role).toBe("manager");
    expect(data.forecast.dealCount).toBe(2);
    expect(data.forecast.weightedTotal).toBe(9000);
    expect(data.funnel).toBeDefined();
    expect(data.velocity).toBeDefined();
    expect(data.goals).toBeDefined();
  });

  it("rep sees only own customers' forecast and no global tiles", async () => {
    const data = await buildDashboardData(DATA_DIR, "carol");
    expect(data.role).toBe("rep");
    expect(data.forecast.dealCount).toBe(1);
    expect(data.forecast.weightedTotal).toBe(5000);
    expect(data.customersVisible).toBe(1);
    expect(data.funnel).toBeUndefined();
    expect(data.velocity).toBeUndefined();
    expect(data.goals).toBeUndefined();
  });
});

describe("renderDashboardHtml", () => {
  it("renders KPIs and escapes content", async () => {
    vol.fromJSON({
      [`${DATA_DIR}/customers/acme/pipeline.md`]: pipelineMd(
        `| <script>x</script> | proposal | 10000 | EUR | 50 |  | ${TODAY} |`
      ),
    });
    const data = await buildDashboardData(DATA_DIR, "system");
    const html = renderDashboardHtml(data);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("Forecast (rolling 90d)");
    expect(html).toMatch(/€10[.,\u202f]?000/); // weighted total (locale-tolerant)
    expect(html).not.toContain("<script>x</script>");
  });
});

describe("renderDashboardHtml — manager tiles (#69)", () => {
  it("renders funnel/velocity/goals tiles incl. stalled deals and progress bars", async () => {
    const html = renderDashboardHtml({
      actor: "mona",
      role: "manager",
      generatedAt: "2026-06-10T12:00:00.000Z",
      forecast: {
        weightedTotal: 9000,
        p50: 8000,
        p90: 12000,
        dealCount: 2,
        byPipeline: { proposal: 5000, qualified: 4000 },
        topRisks: ["Deal A & co <stale>"],
      },
      customersVisible: 2,
      funnel: { stages: [{ stage: "lead", reached: 10 }], winRatePct: null },
      velocity: {
        avgSalesCycleDays: 21,
        stalledDeals: [{ slug: "acme", name: "A<b>", stage: "proposal", daysInStage: 45 }],
      },
      goals: [
        {
          description: "Q2 <em>revenue</em>",
          target: 100,
          progress: 250,
          deadline: "2026-06-30",
          status: "active",
        },
        {
          description: "Zero target",
          target: 0,
          progress: 5,
          deadline: "2026-07-01",
          status: "active",
        },
      ],
    });
    expect(html).toContain("Win rate: n/a");
    expect(html).toContain("⚠ acme/A&lt;b&gt; — 45d in proposal");
    // progress is capped at 100% and a zero target never divides
    expect(html).toContain("250 / 100 (100%)");
    expect(html).toContain("5 / 0 (0%)");
    expect(html).toContain("Q2 &lt;em&gt;revenue&lt;/em&gt;");
    expect(html).toContain("Deal A &amp; co &lt;stale&gt;");
  });

  it("renders the empty-state variants", async () => {
    const html = renderDashboardHtml({
      actor: "mona",
      role: "manager",
      generatedAt: "2026-06-10T12:00:00.000Z",
      forecast: { weightedTotal: 0, p50: 0, p90: 0, dealCount: 0, byPipeline: {}, topRisks: [] },
      customersVisible: 0,
      funnel: { stages: [], winRatePct: 40 },
      velocity: { avgSalesCycleDays: null, stalledDeals: [] },
      goals: [],
    });
    expect(html).toContain("No open deals.");
    expect(html).toContain("No stalled deals 🎉");
    expect(html).toContain("No active goals.");
    expect(html).toContain("Avg sales cycle: n/a days");
    expect(html).toContain("Win rate: 40%");
  });
});
