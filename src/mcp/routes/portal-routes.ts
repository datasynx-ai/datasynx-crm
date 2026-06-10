import express, { type Express } from "express";

/**
 * Customer self-service portal (#58): magic-link-secured, strictly scoped to
 * the slug + contact email signed into the token. Extracted from `startHttp()`
 * for route-level integration testing (#68, pattern #65).
 */
export function registerPortalRoutes(app: Express, dataDir: string): void {
  app.get("/portal", async (req, res) => {
    const { verifyPortalToken, renderPortalHtml } = await import("../../core/portal.js");
    const q = req.query as Record<string, string | undefined>;
    const payload = verifyPortalToken(q["token"] ?? "");
    if (!payload) {
      res.status(401).send("<h2>Invalid or expired portal link.</h2>");
      return;
    }
    res.setHeader("content-type", "text/html");
    res.setHeader("cache-control", "no-store");
    res.send(
      await renderPortalHtml(
        dataDir,
        { slug: payload.s, contactEmail: payload.c },
        q["token"]!,
        q["q"] ? { kbQuery: q["q"] } : {}
      )
    );
  });

  app.post("/portal/ticket", express.urlencoded({ extended: false }), async (req, res) => {
    const { verifyPortalToken, portalCreateTicket, renderPortalHtml } =
      await import("../../core/portal.js");
    const b = req.body as Record<string, string | undefined>;
    const payload = verifyPortalToken(b["token"] ?? "");
    if (!payload || !b["title"]) {
      res.status(401).send("<h2>Invalid request.</h2>");
      return;
    }
    const ticket = await portalCreateTicket(
      dataDir,
      { slug: payload.s, contactEmail: payload.c },
      { title: b["title"], ...(b["message"] ? { message: b["message"] } : {}) }
    );
    res.setHeader("content-type", "text/html");
    res.send(
      await renderPortalHtml(dataDir, { slug: payload.s, contactEmail: payload.c }, b["token"]!, {
        flash: `Ticket ${ticket.id} created.`,
      })
    );
  });

  app.post("/portal/reply", express.urlencoded({ extended: false }), async (req, res) => {
    const { verifyPortalToken, portalReply, renderPortalHtml } =
      await import("../../core/portal.js");
    const b = req.body as Record<string, string | undefined>;
    const payload = verifyPortalToken(b["token"] ?? "");
    if (!payload || !b["ticketId"] || !b["message"]) {
      res.status(401).send("<h2>Invalid request.</h2>");
      return;
    }
    const ok = await portalReply(
      dataDir,
      { slug: payload.s, contactEmail: payload.c },
      { ticketId: b["ticketId"], message: b["message"] }
    );
    if (!ok) {
      res.status(404).send("<h2>Ticket not found.</h2>");
      return;
    }
    res.setHeader("content-type", "text/html");
    res.send(
      await renderPortalHtml(dataDir, { slug: payload.s, contactEmail: payload.c }, b["token"]!, {
        flash: `Reply added to ${b["ticketId"]}.`,
      })
    );
  });
}
