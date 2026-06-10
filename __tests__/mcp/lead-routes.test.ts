import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vol } from "memfs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const mockEmitEvent = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/webhooks.js", () => ({ emitEvent: mockEmitEvent }));

const DATA_DIR = "/data";

let server: Server;
let base: string;

beforeEach(async () => {
  vol.reset();
  vi.clearAllMocks();
  mockEmitEvent.mockResolvedValue(undefined);
  vol.mkdirSync(`${DATA_DIR}/.agentic`, { recursive: true });

  const { resetRateLimiter } = await import("../../src/core/forms.js");
  resetRateLimiter();

  const { registerLeadRoutes } = await import("../../src/mcp/routes/lead-routes.js");
  const { default: express } = await import("express");
  const app = express();
  app.use(express.json());
  registerLeadRoutes(app, DATA_DIR);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function postForm(
  formId: string,
  fields: Record<string, string>,
  ip = "203.0.113.20"
): Promise<Response> {
  return fetch(`${base}/forms/${formId}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-for": ip,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("POST /forms/:id (#65)", () => {
  it("returns 400 for an unknown form", async () => {
    const res = await postForm("nope", { email: "a@b.com" });
    expect(res.status).toBe(400);
  });

  it("creates a lead and thanks the visitor", async () => {
    const { createForm } = await import("../../src/core/forms.js");
    createForm(DATA_DIR, {
      id: "contact",
      name: "Contact",
      fields: { email: "email", name: "name" },
    });

    const res = await postForm("contact", { email: "jane@acme.com", name: "Jane" });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Thank you");
  });

  it("redirects when the form has a redirectUrl", async () => {
    const { createForm } = await import("../../src/core/forms.js");
    createForm(DATA_DIR, {
      id: "redir",
      name: "R",
      fields: { email: "email" },
      redirectUrl: "https://example.com/thanks",
    });

    const res = await fetch(`${base}/forms/redir`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": "203.0.113.21",
      },
      body: new URLSearchParams({ email: "j@a.com" }).toString(),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/thanks");
  });

  it("fakes success for honeypot submissions", async () => {
    const { createForm } = await import("../../src/core/forms.js");
    createForm(DATA_DIR, { id: "hp", name: "HP", fields: { email: "email" } });

    const res = await postForm("hp", { email: "bot@spam.com", _hp: "filled" }, "203.0.113.22");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Thank you");
  });

  it("rate-limits the 6th submission from one IP with 429", async () => {
    const { createForm } = await import("../../src/core/forms.js");
    createForm(DATA_DIR, { id: "rl", name: "RL", fields: { email: "email" } });

    for (let i = 0; i < 5; i++) {
      const res = await postForm("rl", { email: `v${i}@x.com` }, "198.51.100.77");
      expect(res.status).toBe(200);
    }
    const blocked = await postForm("rl", { email: "v6@x.com" }, "198.51.100.77");
    expect(blocked.status).toBe(429);
  });
});

describe("GET /forms/:id/confirm (#65)", () => {
  it("rejects an invalid token", async () => {
    const res = await fetch(`${base}/forms/any/confirm?token=garbage`);
    expect(res.status).toBe(400);
  });

  it("creates the lead from a valid double-opt-in token", async () => {
    const { createForm, signConfirmToken } = await import("../../src/core/forms.js");
    createForm(DATA_DIR, { id: "doi", name: "DOI", fields: { email: "email" } });
    const token = signConfirmToken({
      f: "doi",
      d: { email: "opt@in.com", name: "Opt In" },
      exp: Date.now() + 86_400_000,
    });

    const res = await fetch(`${base}/forms/doi/confirm?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Confirmed");
  });
});

describe("GET/POST /book/:id (#65)", () => {
  it("404s for an unknown booking page", async () => {
    const res = await fetch(`${base}/book/nope`);
    expect(res.status).toBe(404);
  });

  it("renders the page with offered slots", async () => {
    const { createBookingPage } = await import("../../src/core/booking.js");
    createBookingPage(DATA_DIR, { id: "intro", title: "Intro Call", reps: ["alice"] });

    const res = await fetch(`${base}/book/intro`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain("Intro Call");
  });

  it("rejects a submit without slot/name/email", async () => {
    const { createBookingPage } = await import("../../src/core/booking.js");
    createBookingPage(DATA_DIR, { id: "b1", title: "B1", reps: ["alice"] });

    const res = await fetch(`${base}/book/b1`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ name: "Jane" }).toString(),
    });
    expect(res.status).toBe(400);
  });

  it("books a free slot and rejects the same slot a second time", async () => {
    const { createBookingPage, availableSlots, getBookingPage } =
      await import("../../src/core/booking.js");
    createBookingPage(DATA_DIR, { id: "b2", title: "B2", reps: ["alice"] });
    const page = getBookingPage(DATA_DIR, "b2")!;
    const slot = availableSlots(page, {}, Date.now())[0]!;

    const ok = await fetch(`${base}/book/b2`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        start: String(slot.start),
        name: "Jane",
        email: "jane@acme.com",
      }).toString(),
    });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("B2");

    const taken = await fetch(`${base}/book/b2`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        start: String(slot.start),
        name: "Bob",
        email: "bob@x.com",
      }).toString(),
    });
    expect(taken.status).toBe(409);
    expect(await taken.text()).toContain("no longer available");
  });
});
