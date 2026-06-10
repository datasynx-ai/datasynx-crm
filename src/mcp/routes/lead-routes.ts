import express, { type Express } from "express";

/**
 * Public lead-capture & scheduling routes (#60 forms, #53 booking), extracted
 * from `startHttp()` for route-level integration testing (#65). Pure move —
 * behavior is unchanged; spam protection lives in `core/forms.ts`
 * (honeypot + per-IP limiter) and booking re-validates the slot on submit.
 */
export function registerLeadRoutes(app: Express, dataDir: string): void {
  // Native meeting scheduler (#53): public booking page with real free slots.
  app.get("/book/:id", async (req, res) => {
    const { getBookingPage, availableSlots, renderBookingHtml } =
      await import("../../core/booking.js");
    const { getBusyIntervals } = await import("../../sync/calendar-availability.js");
    const id = (req.params as Record<string, string>)["id"] ?? "";
    const page = getBookingPage(dataDir, id);
    if (!page) {
      res.status(404).send("<h2>Booking page not found.</h2>");
      return;
    }
    const now = Date.now();
    const busy = await getBusyIntervals(dataDir, page.reps, {
      start: now,
      end: now + page.days * 86_400_000,
    });
    const slots = availableSlots(page, busy, now);
    res.setHeader("content-type", "text/html");
    res.setHeader("cache-control", "no-store");
    res.send(renderBookingHtml(page, slots, {}));
  });

  app.post("/book/:id", express.urlencoded({ extended: false }), async (req, res) => {
    const {
      getBookingPage,
      createBooking,
      availableSlots,
      renderBookingHtml,
      renderConfirmedHtml,
    } = await import("../../core/booking.js");
    const { getBusyIntervals } = await import("../../sync/calendar-availability.js");
    const id = (req.params as Record<string, string>)["id"] ?? "";
    const page = getBookingPage(dataDir, id);
    if (!page) {
      res.status(404).send("<h2>Booking page not found.</h2>");
      return;
    }
    const b = req.body as Record<string, string | undefined>;
    const start = Number(b["start"]);
    if (!Number.isFinite(start) || !b["name"] || !b["email"]) {
      res.status(400).send("<h2>Please pick a slot and provide your name and email.</h2>");
      return;
    }
    const result = await createBooking(dataDir, page, {
      start,
      name: b["name"]!.slice(0, 120),
      email: b["email"]!.slice(0, 200),
      ...(b["notes"] ? { notes: b["notes"].slice(0, 1000) } : {}),
    });
    res.setHeader("content-type", "text/html");
    if (!result) {
      // Slot was taken between render and submit — re-render with fresh slots.
      const now = Date.now();
      const busy = await getBusyIntervals(dataDir, page.reps, {
        start: now,
        end: now + page.days * 86_400_000,
      });
      res.status(409).send(
        renderBookingHtml(page, availableSlots(page, busy, now), {
          flash: "That slot is no longer available — please pick another.",
        })
      );
      return;
    }
    res.send(renderConfirmedHtml(page, result));
  });

  // Inbound lead capture (#60): embeddable forms POST straight into the CRM.
  app.post("/forms/:id", express.urlencoded({ extended: false }), async (req, res) => {
    const { processFormSubmission, getForm } = await import("../../core/forms.js");
    const { clientIp } = await import("../../core/http-guard.js");
    const formId = (req.params as Record<string, string>)["id"] ?? "";
    const ip = clientIp(req);
    const result = await processFormSubmission(
      dataDir,
      formId,
      (req.body ?? {}) as Record<string, unknown>,
      { ip }
    );
    if (result.status === "rate_limited") {
      res.status(429).send("Too many submissions — try again later.");
      return;
    }
    if (result.status === "invalid") {
      res.status(400).send(result.error ?? "Invalid submission.");
      return;
    }
    // spam_ignored intentionally looks like success to the bot.
    const form = getForm(dataDir, formId);
    if (result.status === "created" && form?.redirectUrl) {
      res.redirect(302, form.redirectUrl);
      return;
    }
    res.setHeader("content-type", "text/html");
    res.send(
      result.status === "pending_confirmation"
        ? "<h2>Almost there — please confirm via the link we sent you.</h2>"
        : "<h2>Thank you! We will be in touch shortly.</h2>"
    );
  });

  // GDPR double-opt-in confirmation (#60): the lead is only created here.
  app.get("/forms/:id/confirm", async (req, res) => {
    const { verifyConfirmToken, createLead } = await import("../../core/forms.js");
    const token = (req.query as Record<string, string | undefined>)["token"] ?? "";
    const payload = verifyConfirmToken(token);
    const formId = (req.params as Record<string, string>)["id"] ?? "";
    if (!payload || payload.f !== formId) {
      res.status(400).send("<h2>Invalid or expired confirmation link.</h2>");
      return;
    }
    await createLead(dataDir, payload.f, payload.d);
    res.setHeader("content-type", "text/html");
    res.send("<h2>Confirmed — thank you!</h2>");
  });
}
