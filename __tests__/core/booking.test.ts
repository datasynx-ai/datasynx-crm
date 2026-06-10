import { describe, it, expect, beforeEach, vi } from "vitest";
import { vol } from "memfs";

const mockEmitEvent = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/webhooks.js", () => ({ emitEvent: mockEmitEvent }));

const DATA_DIR = "/data";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  mockEmitEvent.mockResolvedValue(undefined);
  vol.mkdirSync(`${DATA_DIR}/.agentic`, { recursive: true });
});

// A fixed "now" anchored to a UTC Monday midnight so slot math is deterministic.
const MON = Date.UTC(2026, 5, 15, 0, 0, 0); // 2026-06-15 is a Monday

describe("booking page store (#53)", () => {
  it("creates, validates id, reads back, lists", async () => {
    const { createBookingPage, getBookingPage, listBookingPages } =
      await import("../../src/core/booking.js");
    const page = createBookingPage(DATA_DIR, {
      id: "team-sales",
      title: "Book a sales call",
      reps: ["alice", "bob"],
      durationMin: 30,
    });
    expect(page.rrIndex).toBe(0);
    expect(getBookingPage(DATA_DIR, "team-sales")?.title).toBe("Book a sales call");
    expect(listBookingPages(DATA_DIR).map((p) => p.id)).toEqual(["team-sales"]);
    expect(() => createBookingPage(DATA_DIR, { id: "Bad Id", title: "x", reps: ["a"] })).toThrow();
  });
});

describe("booking token (#53)", () => {
  it("round-trips, rejects tamper/expiry", async () => {
    const { signBookingToken, verifyBookingToken } = await import("../../src/core/booking.js");
    const t = signBookingToken({ p: "team-sales", exp: Date.now() + 60_000 });
    expect(verifyBookingToken(t)).toMatchObject({ p: "team-sales" });
    expect(verifyBookingToken(t.slice(0, -2) + "00")).toBeNull();
    expect(verifyBookingToken(signBookingToken({ p: "x", exp: Date.now() - 1 }))).toBeNull();
  });
});

describe("availableSlots (#53)", () => {
  it("honors working hours, duration, past, and busy intervals", async () => {
    const { availableSlots } = await import("../../src/core/booking.js");
    const page = {
      id: "p",
      title: "t",
      reps: ["alice"],
      durationMin: 60,
      bufferMin: 0,
      days: 1,
      startHour: 9,
      endHour: 12,
      slotStepMin: 60,
      createdAt: "x",
      rrIndex: 0,
    };
    // now = Monday 00:00 UTC → all of 9,10,11 are in the future.
    const slots = availableSlots(page, { alice: [] }, MON);
    // 09:00, 10:00, 11:00 (11→12 fits; 12 would exceed endHour)
    expect(slots.map((s) => new Date(s.start).getUTCHours())).toEqual([9, 10, 11]);
    expect(slots.every((s) => s.reps.includes("alice"))).toBe(true);

    // A busy block 10:00–11:00 removes the 10:00 slot (no free rep).
    const busy = [{ start: MON + 10 * 3600_000, end: MON + 11 * 3600_000 }];
    const slots2 = availableSlots(page, { alice: busy }, MON);
    expect(slots2.map((s) => new Date(s.start).getUTCHours())).toEqual([9, 11]);

    // "now" at 09:30 drops the 09:00 slot as past.
    const slots3 = availableSlots(page, { alice: [] }, MON + 9.5 * 3600_000);
    expect(slots3.map((s) => new Date(s.start).getUTCHours())).toEqual([10, 11]);
  });

  it("buffer keeps a gap around busy blocks", async () => {
    const { availableSlots } = await import("../../src/core/booking.js");
    const page = {
      id: "p",
      title: "t",
      reps: ["alice"],
      durationMin: 60,
      bufferMin: 30,
      days: 1,
      startHour: 9,
      endHour: 12,
      slotStepMin: 60,
      createdAt: "x",
      rrIndex: 0,
    };
    // busy 11:00–11:30: with 30m buffer, the 10:00–11:00 slot now conflicts too.
    const busy = [{ start: MON + 11 * 3600_000, end: MON + 11.5 * 3600_000 }];
    const slots = availableSlots(page, { alice: busy }, MON);
    expect(slots.map((s) => new Date(s.start).getUTCHours())).toEqual([9]);
  });

  it("a slot is offered if ANY rep is free", async () => {
    const { availableSlots } = await import("../../src/core/booking.js");
    const page = {
      id: "p",
      title: "t",
      reps: ["alice", "bob"],
      durationMin: 60,
      bufferMin: 0,
      days: 1,
      startHour: 9,
      endHour: 11,
      slotStepMin: 60,
      createdAt: "x",
      rrIndex: 0,
    };
    const busy = { alice: [{ start: MON + 9 * 3600_000, end: MON + 10 * 3600_000 }], bob: [] };
    const slots = availableSlots(page, busy, MON);
    const nine = slots.find((s) => new Date(s.start).getUTCHours() === 9)!;
    expect(nine.reps).toEqual(["bob"]); // alice busy, bob free
  });
});

describe("pickRep round-robin (#53)", () => {
  it("alternates across free reps and advances the cursor", async () => {
    const { pickRep } = await import("../../src/core/booking.js");
    const page = { reps: ["alice", "bob"], rrIndex: 0 } as never;
    const free = ["alice", "bob"];
    const a = pickRep(page, free);
    expect(a.rep).toBe("alice");
    const b = pickRep({ reps: ["alice", "bob"], rrIndex: a.rrIndex } as never, free);
    expect(b.rep).toBe("bob");
    const c = pickRep({ reps: ["alice", "bob"], rrIndex: b.rrIndex } as never, free);
    expect(c.rep).toBe("alice");
  });

  it("skips busy reps", async () => {
    const { pickRep } = await import("../../src/core/booking.js");
    const page = { reps: ["alice", "bob", "carol"], rrIndex: 0 } as never;
    // only bob + carol free → cursor at 0 (alice) skips to bob
    expect(pickRep(page, ["bob", "carol"]).rep).toBe("bob");
  });
});

describe("createBooking (#53)", () => {
  it("books a slot, logs a Meeting interaction, emits meeting.booked", async () => {
    const { createBookingPage, createBooking } = await import("../../src/core/booking.js");
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Acme", domain: "acme.com", dataDir: DATA_DIR });

    const page = createBookingPage(DATA_DIR, {
      id: "sales",
      title: "Sales",
      reps: ["alice", "bob"],
      durationMin: 60,
      startHour: 9,
      endHour: 17,
      days: 2,
      slug: "acme",
    });

    const slotStart = MON + 10 * 3600_000;
    const res = await createBooking(
      DATA_DIR,
      page,
      { start: slotStart, name: "Jane", email: "jane@acme.com" },
      { now: MON, getBusy: async () => ({ alice: [], bob: [] }), createEvent: async () => null }
    );
    expect(res).not.toBeNull();
    expect(res!.rep).toBe("alice");
    expect(res!.bookingId).toMatch(/^B-/);

    const fs = (await import("fs")).default;
    const md = fs.readFileSync(`${DATA_DIR}/customers/acme/interactions.md`, "utf-8") as string;
    expect(md).toContain("booking:" + res!.bookingId);
    expect(md).toContain("Jane");
    expect(mockEmitEvent).toHaveBeenCalledWith(
      DATA_DIR,
      "meeting.booked",
      expect.objectContaining({ slug: "acme", rep: "alice", bookingId: res!.bookingId })
    );
  });

  it("resolves the customer by email domain when the page has no slug", async () => {
    const { createBookingPage, createBooking } = await import("../../src/core/booking.js");
    const { createCustomer } = await import("../../src/commands/create.js");
    await createCustomer({ name: "Globex", domain: "globex.io", dataDir: DATA_DIR });

    const page = createBookingPage(DATA_DIR, {
      id: "team",
      title: "Team",
      reps: ["alice"],
      durationMin: 60,
      startHour: 9,
      endHour: 17,
      days: 2,
    });
    const res = await createBooking(
      DATA_DIR,
      page,
      { start: MON + 9 * 3600_000, name: "Bob", email: "bob@globex.io" },
      { now: MON, getBusy: async () => ({ alice: [] }), createEvent: async () => null }
    );
    expect(res).not.toBeNull();
    const fs = (await import("fs")).default;
    const md = fs.readFileSync(`${DATA_DIR}/customers/globex/interactions.md`, "utf-8") as string;
    expect(md).toContain("booking:" + res!.bookingId);
  });

  it("rejects a slot that is not actually available", async () => {
    const { createBookingPage, createBooking } = await import("../../src/core/booking.js");
    const page = createBookingPage(DATA_DIR, {
      id: "x",
      title: "X",
      reps: ["alice"],
      durationMin: 60,
      startHour: 9,
      endHour: 17,
      days: 2,
    });
    // requested slot collides with a busy block → no booking
    const res = await createBooking(
      DATA_DIR,
      page,
      { start: MON + 10 * 3600_000, name: "Z", email: "z@x.com" },
      {
        now: MON,
        getBusy: async () => ({
          alice: [{ start: MON + 10 * 3600_000, end: MON + 11 * 3600_000 }],
        }),
        createEvent: async () => null,
      }
    );
    expect(res).toBeNull();
  });
});

describe("renderBookingHtml (#53)", () => {
  it("lists slots and escapes the title (XSS-safe)", async () => {
    const { renderBookingHtml } = await import("../../src/core/booking.js");
    const page = {
      id: "p",
      title: "<script>alert(1)</script>",
      reps: ["alice"],
      durationMin: 60,
      bufferMin: 0,
      days: 1,
      startHour: 9,
      endHour: 11,
      slotStepMin: 60,
      createdAt: "x",
      rrIndex: 0,
    };
    const slots = [{ start: MON + 9 * 3600_000, end: MON + 10 * 3600_000, reps: ["alice"] }];
    const html = renderBookingHtml(page, slots, {});
    expect(html).toContain('action="/book/p"');
    expect(html).toContain(String(MON + 9 * 3600_000));
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
