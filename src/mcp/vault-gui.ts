import { verifyVaultSession } from "../core/vault-session.js";
import { listSecretKeys, setSecret, getSecret, removeSecret } from "../core/vault.js";

/**
 * Server-side logic for the local credential-vault GUI (issue #21).
 *
 * The whole point of the GUI is that an operator enters API keys / portal
 * passwords *directly in their browser* — the values are POSTed to the local
 * HTTP server, encrypted with AES-256-GCM into `.agentic/vault.enc`, and never
 * pass through the LLM / chat. The MCP tool only ever hands out a link.
 *
 * These handlers are kept pure and framework-free (they return a status + a
 * JSON-able body) so they can be unit-tested with memfs and wired into Express
 * with a thin adapter in mcp/server.ts.
 */
export interface VaultGuiResult {
  status: number;
  body: unknown;
}

/** Tokens are base64url; reject anything else before trusting/embedding it. */
const SAFE_TOKEN = /^[A-Za-z0-9_-]+$/;

/**
 * Whether a remote address is a loopback (localhost) address. The vault GUI is
 * a credential manager, so even though the HTTP MCP server binds 0.0.0.0 for
 * team use, the /vault routes are restricted to localhost by default — a leaked
 * link can't be used from another machine. Handles IPv4, IPv6 (::1) and
 * IPv4-mapped IPv6 (::ffff:127.0.0.1).
 */
export function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const a = addr.startsWith("::ffff:") ? addr.slice("::ffff:".length) : addr;
  if (a === "::1") return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a);
}

/** Opt out of the localhost-only restriction (e.g. a trusted reverse proxy). */
export function vaultRemoteAllowed(): boolean {
  const v = (process.env["DXCRM_VAULT_GUI_ALLOW_REMOTE"] ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function gate(
  dataDir: string,
  masterKey: string | undefined,
  token: string
): VaultGuiResult | null {
  if (!token || !verifyVaultSession(dataDir, token)) {
    return { status: 401, body: { error: "invalid_or_expired_session" } };
  }
  if (!masterKey) {
    return {
      status: 503,
      body: {
        error: "vault_locked",
        message:
          "The vault master key is not configured on the server. Start the server with DXCRM_VAULT_KEY set.",
      },
    };
  }
  return null;
}

/** Wrap a vault op so a wrong master key (or corrupt vault) becomes a clean 500. */
function guarded(fn: () => VaultGuiResult): VaultGuiResult {
  try {
    return fn();
  } catch (e) {
    return { status: 500, body: { error: "vault_error", message: (e as Error).message } };
  }
}

/** List secret names only — values stay encrypted and are never returned here. */
export function handleVaultList(
  dataDir: string,
  masterKey: string | undefined,
  token: string
): VaultGuiResult {
  const blocked = gate(dataDir, masterKey, token);
  if (blocked) return blocked;
  return guarded(() => ({
    status: 200,
    body: { names: listSecretKeys(dataDir, masterKey as string).sort() },
  }));
}

/** Store (or overwrite) a secret entered in the browser. */
export function handleVaultSet(
  dataDir: string,
  masterKey: string | undefined,
  token: string,
  name: string,
  value: string
): VaultGuiResult {
  const blocked = gate(dataDir, masterKey, token);
  if (blocked) return blocked;
  if (!name || !name.trim()) {
    return { status: 400, body: { error: "missing_name", message: "Secret name is required." } };
  }
  if (typeof value !== "string") {
    return { status: 400, body: { error: "missing_value", message: "Secret value is required." } };
  }
  return guarded(() => {
    setSecret(dataDir, masterKey as string, name.trim(), value);
    return { status: 200, body: { ok: true, name: name.trim() } };
  });
}

/** Reveal a single secret's value — an explicit, human-initiated action. */
export function handleVaultReveal(
  dataDir: string,
  masterKey: string | undefined,
  token: string,
  name: string
): VaultGuiResult {
  const blocked = gate(dataDir, masterKey, token);
  if (blocked) return blocked;
  return guarded(() => {
    const value = getSecret(dataDir, masterKey as string, name);
    if (value === undefined) {
      return { status: 404, body: { error: "not_found", name } };
    }
    return { status: 200, body: { name, value } };
  });
}

/** Remove a secret. */
export function handleVaultDelete(
  dataDir: string,
  masterKey: string | undefined,
  token: string,
  name: string
): VaultGuiResult {
  const blocked = gate(dataDir, masterKey, token);
  if (blocked) return blocked;
  return guarded(() => {
    const removed = removeSecret(dataDir, masterKey as string, name);
    return removed
      ? { status: 200, body: { ok: true, name } }
      : { status: 404, body: { error: "not_found", name } };
  });
}

/**
 * The single-page credential manager served at `GET /vault?t=<token>`.
 *
 * Pure static HTML + vanilla JS — no build step, no external assets. The page
 * reads the session token (embedded below, only if it is a safe base64url
 * string) and talks to the `/vault/api/*` endpoints. Secret names are rendered
 * with `textContent`, never `innerHTML`, so a malicious name can't inject HTML.
 */
export function renderVaultGuiPage(opts: { token: string }): string {
  const token = SAFE_TOKEN.test(opts.token) ? opts.token : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Credential Vault — DatasynxOpenCRM</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.5; }
  h1 { font-size: 1.5em; margin-bottom: .2em; }
  .sub { color: #888; margin-top: 0; font-size: .9em; }
  .card { border: 1px solid #8884; border-radius: 10px; padding: 18px; margin: 18px 0; }
  label { display: block; font-size: .85em; color: #888; margin-bottom: 4px; }
  input { width: 100%; padding: 10px; font-size: 1em; border: 1px solid #8886; border-radius: 6px; box-sizing: border-box; background: transparent; color: inherit; }
  button { padding: 9px 18px; font-size: .95em; border: none; border-radius: 6px; cursor: pointer; background: #1a1a2e; color: #fff; }
  button.ghost { background: transparent; color: #4178e6; border: 1px solid #4178e6; padding: 5px 12px; font-size: .85em; }
  button.danger { background: transparent; color: #d33; border: 1px solid #d33; padding: 5px 12px; font-size: .85em; }
  ul { list-style: none; padding: 0; }
  li { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #8882; }
  li .name { font-family: ui-monospace, monospace; flex: 1; word-break: break-all; }
  li .val { font-family: ui-monospace, monospace; color: #2a8; word-break: break-all; }
  .row { display: flex; gap: 10px; align-items: flex-end; }
  .row > div { flex: 1; }
  #msg { min-height: 1.4em; font-size: .9em; }
  .ok { color: #2a8; } .err { color: #d33; }
  .empty { color: #888; font-style: italic; }
  footer { color: #aaa; font-size: .8em; margin-top: 30px; text-align: center; }
</style>
</head>
<body>
<h1>🔐 Credential Vault</h1>
<p class="sub">Secrets are encrypted (AES-256-GCM) and stored locally. They never pass through the AI / chat.</p>

<div class="card">
  <div class="row">
    <div><label for="k">Name (e.g. <code>stripe_api_key</code>)</label><input id="k" autocomplete="off" spellcheck="false"></div>
    <div><label for="v">Value</label><input id="v" type="password" autocomplete="off" spellcheck="false"></div>
    <button id="save">Save</button>
  </div>
  <p id="msg"></p>
</div>

<div class="card">
  <strong>Stored secrets</strong>
  <ul id="list"></ul>
</div>

<footer>Powered by DatasynxOpenCRM · this link expires automatically</footer>

<script>
const TOKEN = ${JSON.stringify(token)};
const $ = (id) => document.getElementById(id);
const msg = (t, cls) => { const m = $("msg"); m.textContent = t; m.className = cls || ""; };

async function api(path, opts) {
  const res = await fetch(path, opts);
  let body = {};
  try { body = await res.json(); } catch (e) { /* ignore */ }
  return { status: res.status, body };
}

async function refresh() {
  const { status, body } = await api("/vault/api/secrets?token=" + encodeURIComponent(TOKEN));
  const ul = $("list");
  ul.textContent = "";
  if (status !== 200) { msg(body.message || "Session expired — request a new link.", "err"); return; }
  const names = body.names || [];
  if (names.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No secrets yet.";
    ul.appendChild(li);
    return;
  }
  for (const name of names) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "name";
    span.textContent = name;
    const reveal = document.createElement("button");
    reveal.className = "ghost"; reveal.textContent = "Reveal";
    reveal.onclick = async () => {
      const r = await api("/vault/api/secrets/reveal", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: TOKEN, name }),
      });
      if (r.status === 200) {
        const val = document.createElement("span");
        val.className = "val"; val.textContent = r.body.value;
        li.replaceChild(val, span);
        reveal.remove();
      } else { msg(r.body.message || "Could not reveal.", "err"); }
    };
    const del = document.createElement("button");
    del.className = "danger"; del.textContent = "Delete";
    del.onclick = async () => {
      if (!confirm("Delete '" + name + "'?")) return;
      const r = await api("/vault/api/secrets/delete", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: TOKEN, name }),
      });
      if (r.status === 200) { msg("Deleted '" + name + "'.", "ok"); refresh(); }
      else { msg(r.body.message || "Could not delete.", "err"); }
    };
    li.appendChild(span);
    li.appendChild(reveal);
    li.appendChild(del);
    ul.appendChild(li);
  }
}

$("save").onclick = async () => {
  const name = $("k").value.trim();
  const value = $("v").value;
  if (!name) { msg("Enter a name.", "err"); return; }
  const r = await api("/vault/api/secrets", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: TOKEN, name, value }),
  });
  if (r.status === 200) { msg("Saved '" + name + "'.", "ok"); $("k").value = ""; $("v").value = ""; refresh(); }
  else { msg(r.body.message || "Could not save.", "err"); }
};

refresh();
</script>
</body>
</html>`;
}
