import express, { type Express } from "express";

/**
 * Engagement & analytics surfaces (#45 tracking, #52 dashboard, NPS/CSAT
 * surveys): all public, token-secured, end-customer-visible. Extracted from
 * `startHttp()` for route-level integration testing (#68, pattern #65).
 *
 * Token semantics differ per surface and the tests pin them:
 * - Survey tokens are opaque lookups into `.agentic/survey-pending/` — an
 *   unknown token records nothing but still renders the thank-you page
 *   (no token enumeration via response differences).
 * - Tracking tokens are HMAC-signed; the pixel ALWAYS returns the GIF and
 *   only logs on a valid token, the click endpoint 400s on tampering (the
 *   destination is signed into the token — no open redirect).
 * - The dashboard token gates with a hard 401.
 */

export function surveyThankYouPage(score: number, comment?: string): string {
  const emoji = score >= 9 ? "🎉" : score >= 7 ? "🙂" : "🙏";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Thank you</title>
<style>body{font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;padding:0 20px}
h1{font-size:2.5em;margin-bottom:.3em}p{color:#555;font-size:1.1em}</style></head>
<body><h1>${emoji}</h1><h2>Thank you for your feedback!</h2>
<p>You rated us <strong>${score}/10</strong>.${comment ? `<br>Your comment: <em>"${String(comment).slice(0, 200).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}"</em>` : ""}</p>
<p style="margin-top:40px;color:#aaa;font-size:.85em">Powered by DatasynxOpenCRM</p>
</body></html>`;
}

export function registerEngagementRoutes(app: Express, dataDir: string): void {
  // NPS/CSAT survey response endpoint — linked from survey emails
  // GET  /survey/respond?token=<t>&score=<0-10>   → record score + thank-you page
  // GET  /survey/respond?token=<t>&comment=true   → show comment form
  // POST /survey/respond                           → record comment + thank-you page
  app.get("/survey/respond", async (req, res) => {
    const { token, score, comment } = req.query as Record<string, string | undefined>;
    if (!token) {
      res.status(400).send("<h2>Invalid survey link.</h2>");
      return;
    }

    if (comment === "true") {
      res.setHeader("content-type", "text/html");
      res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Survey Comment</title>
<style>body{font-family:sans-serif;max-width:520px;margin:60px auto;padding:0 20px}
textarea{width:100%;padding:10px;font-size:1em;border:1px solid #ccc;border-radius:4px}
input[type=number]{width:80px;padding:8px;font-size:1em}
button{margin-top:12px;padding:12px 28px;background:#1a1a2e;color:#fff;border:none;border-radius:4px;font-size:1em;cursor:pointer}</style></head>
<body><h2>Leave a comment</h2>
<form method="POST" action="/survey/respond">
<input type="hidden" name="token" value="${String(token).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}">
<label>Your score (0–10):<br><input type="number" name="score" min="0" max="10" required></label><br><br>
<label>Comment (optional):<br><textarea name="comment" rows="5" placeholder="What can we improve?"></textarea></label><br>
<button type="submit">Submit</button>
</form></body></html>`);
      return;
    }

    const numScore = score !== undefined ? parseInt(score, 10) : NaN;
    if (isNaN(numScore) || numScore < 0 || numScore > 10) {
      res.status(400).send("<h2>Invalid score. Please use the link from your email.</h2>");
      return;
    }

    const { recordSurveyResponse } = await import("../../core/survey-engine.js");
    await recordSurveyResponse(dataDir, token, numScore).catch(() => null);
    res.setHeader("content-type", "text/html");
    res.send(surveyThankYouPage(numScore));
  });

  app.post("/survey/respond", express.urlencoded({ extended: false }), async (req, res) => {
    const { token, score, comment: commentText } = req.body as Record<string, string | undefined>;
    if (!token) {
      res.status(400).send("<h2>Invalid survey link.</h2>");
      return;
    }
    const numScore = score !== undefined ? parseInt(score, 10) : NaN;
    if (isNaN(numScore) || numScore < 0 || numScore > 10) {
      res
        .status(400)
        .send("<h2>Invalid score. Please go back and enter a number between 0 and 10.</h2>");
      return;
    }
    const { recordSurveyResponse } = await import("../../core/survey-engine.js");
    await recordSurveyResponse(dataDir, token, numScore, commentText || undefined).catch(
      () => null
    );
    res.setHeader("content-type", "text/html");
    res.send(surveyThankYouPage(numScore, commentText));
  });

  // Email open-tracking pixel (#45). Always returns a 1x1 GIF; logs an `open`
  // event only when the HMAC token is valid (no tampering, no enumeration).
  app.get("/t/o/:token.gif", async (req, res) => {
    const { verifyToken, transparentGif } = await import("../../core/email-tracking.js");
    const { appendEmailEvent } = await import("../../fs/sent-store.js");
    const raw = (req.params as Record<string, string>)["token"] ?? "";
    const payload = verifyToken(raw);
    if (payload && payload.k === "open") {
      appendEmailEvent(dataDir, {
        type: "open",
        slug: payload.s,
        contactEmail: payload.c,
        messageId: payload.m,
        at: new Date().toISOString(),
      });
    }
    res.setHeader("content-type", "image/gif");
    res.setHeader("cache-control", "no-store, no-cache, must-revalidate, private");
    res.status(200).end(transparentGif());
  });

  // Email click-tracking (#45). The destination is signed INTO the token, so
  // an attacker cannot turn this into an open redirect: an invalid/tampered
  // token gets a 400, never a redirect.
  app.get("/t/c/:token", async (req, res) => {
    const { verifyToken } = await import("../../core/email-tracking.js");
    const { appendEmailEvent } = await import("../../fs/sent-store.js");
    const raw = (req.params as Record<string, string>)["token"] ?? "";
    const payload = verifyToken(raw);
    if (!payload || payload.k !== "click" || !payload.u) {
      res.status(400).send("Invalid or expired link.");
      return;
    }
    appendEmailEvent(dataDir, {
      type: "click",
      slug: payload.s,
      contactEmail: payload.c,
      messageId: payload.m,
      at: new Date().toISOString(),
      url: payload.u,
    });
    res.redirect(302, payload.u);
  });

  // Read-only dashboard (#52): token-secured, RBAC-aware, server-rendered.
  app.get("/dashboard", async (req, res) => {
    const { verifyDashboardToken, buildDashboardData, renderDashboardHtml } =
      await import("../../core/dashboard.js");
    const token = (req.query as Record<string, string | undefined>)["token"] ?? "";
    const payload = verifyDashboardToken(token);
    if (!payload) {
      res.status(401).send("<h2>Invalid or expired dashboard link.</h2>");
      return;
    }
    const data = await buildDashboardData(dataDir, payload.a);
    res.setHeader("content-type", "text/html");
    res.setHeader("cache-control", "no-store");
    res.send(renderDashboardHtml(data));
  });
}
