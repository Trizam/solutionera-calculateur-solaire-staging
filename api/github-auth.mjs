/**
 * Optional GitHub identity for bug reports.
 *
 * A visitor may link their GitHub account once (OAuth popup). The proxy then
 * hands back an opaque, encrypted session blob that the browser stores and
 * sends with later reports, so the issue is authored by the visitor instead
 * of the site's bot account. Nothing here is required: without a session the
 * report goes through the bot token exactly as before.
 *
 * Secrets stay on the server: the user token lives only inside the AES-GCM
 * blob, keyed from BUG_REPORT_SESSION_SECRET (or the OAuth client secret).
 */
export const SESSION_HEADER = "X-Bug-Report-Session";
export const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const STATE_TTL_MS = 10 * 60 * 1000;
export const NONCE_COOKIE = "bug_oauth_nonce";
export const DEFAULT_OAUTH_SCOPE = "public_repo";
export const AUTH_START_PATH = "/auth/github/start";
export const AUTH_CALLBACK_PATH = "/auth/github/callback";
export const AUTH_CONFIG_PATH = "/auth/config";
export const POST_MESSAGE_TYPE = "bug-report-github-session";
export const HASH_PARAM = "bug-report-session";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function githubAuthConfig(env) {
  const e = env || {};
  const clientId = String(e.GITHUB_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(e.GITHUB_OAUTH_CLIENT_SECRET || "").trim();
  const sessionSecret = String(e.BUG_REPORT_SESSION_SECRET || clientSecret).trim();
  const scope = e.GITHUB_OAUTH_SCOPE != null ? String(e.GITHUB_OAUTH_SCOPE).trim() : DEFAULT_OAUTH_SCOPE;
  return {
    enabled: !!(clientId && clientSecret && sessionSecret),
    clientId,
    clientSecret,
    sessionSecret,
    scope
  };
}

export function base64UrlEncode(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(text) {
  const norm = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 === 0 ? "" : "=".repeat(4 - (norm.length % 4));
  const bin = atob(norm + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const keyCache = new Map();

async function aesKey(secret) {
  const cached = keyCache.get(secret);
  if (cached) return cached;
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  keyCache.set(secret, key);
  return key;
}

/** Authenticated encryption of a JSON value → opaque base64url string. */
export async function sealJson(secret, value) {
  const key = await aesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = encoder.encode(JSON.stringify(value));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return base64UrlEncode(out);
}

/** Inverse of sealJson. Returns null on any tampering or malformed input. */
export async function openJson(secret, blob) {
  try {
    const bytes = base64UrlDecode(blob);
    if (bytes.length < 13) return null;
    const key = await aesKey(secret);
    const iv = bytes.slice(0, 12);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, bytes.slice(12));
    return JSON.parse(decoder.decode(plain));
  } catch (_) {
    return null;
  }
}

export async function sealSession(secret, user, nowMs) {
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  return sealJson(secret, {
    v: 1,
    tok: user.token,
    login: user.login,
    avatar: user.avatar || "",
    exp: now + SESSION_TTL_MS
  });
}

/** Decrypt a session blob; null when absent, invalid or expired. */
export async function openSession(secret, blob, nowMs) {
  if (!blob || !secret) return null;
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  const data = await openJson(secret, blob);
  if (!data || data.v !== 1 || typeof data.tok !== "string" || !data.tok) return null;
  if (typeof data.exp !== "number" || data.exp <= now) return null;
  return { token: data.tok, login: String(data.login || ""), avatar: String(data.avatar || ""), exp: data.exp };
}

function randomNonce() {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

export function parseCookie(header, name) {
  const parts = String(header || "").split(";");
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (p.indexOf(name + "=") === 0) return decodeURIComponent(p.slice(name.length + 1));
  }
  return "";
}

/** Only allow returning to a page on an allowed origin (no open redirect). */
export function safeReturnTo(raw, allowedOrigin) {
  try {
    const u = new URL(String(raw || ""));
    if (!allowedOrigin(u.origin)) return "";
    return u.origin + u.pathname + u.search;
  } catch (_) {
    return "";
  }
}

export async function buildAuthorizeRedirect(cfg, requestUrl, returnTo, mode, nowMs) {
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  const nonce = randomNonce();
  const state = await sealJson(cfg.sessionSecret, {
    v: 1,
    rt: returnTo,
    mode: mode === "redirect" ? "redirect" : "popup",
    nonce,
    exp: now + STATE_TTL_MS
  });
  const callback = new URL(AUTH_CALLBACK_PATH, requestUrl).toString();
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", cfg.clientId);
  authorize.searchParams.set("redirect_uri", callback);
  authorize.searchParams.set("state", state);
  if (cfg.scope) authorize.searchParams.set("scope", cfg.scope);
  const cookie =
    NONCE_COOKIE + "=" + encodeURIComponent(nonce) +
    "; Max-Age=" + Math.floor(STATE_TTL_MS / 1000) +
    "; Path=/; Secure; HttpOnly; SameSite=Lax";
  return { location: authorize.toString(), cookie };
}

export async function openState(cfg, stateBlob, cookieHeader, nowMs) {
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  const data = await openJson(cfg.sessionSecret, stateBlob);
  if (!data || data.v !== 1 || typeof data.exp !== "number" || data.exp <= now) return null;
  const nonce = parseCookie(cookieHeader, NONCE_COOKIE);
  if (!nonce || nonce !== data.nonce) return null;
  return { returnTo: String(data.rt || ""), mode: data.mode === "redirect" ? "redirect" : "popup" };
}

export async function exchangeCodeForUser(cfg, code, requestUrl, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const tokenRes = await doFetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "solutionera-calculateur-bug-report"
    },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: new URL(AUTH_CALLBACK_PATH, requestUrl).toString()
    })
  });
  const tokenData = await tokenRes.json().catch(function () { return {}; });
  const token = tokenData && typeof tokenData.access_token === "string" ? tokenData.access_token : "";
  if (!tokenRes.ok || !token) {
    const err = new Error("oauth-token");
    err.detail = tokenData && tokenData.error ? String(tokenData.error) : "";
    throw err;
  }
  const userRes = await doFetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "solutionera-calculateur-bug-report"
    }
  });
  const user = await userRes.json().catch(function () { return {}; });
  if (!userRes.ok || !user || typeof user.login !== "string") {
    throw new Error("oauth-user");
  }
  return { token, login: user.login, avatar: typeof user.avatar_url === "string" ? user.avatar_url : "" };
}

function jsonForInlineScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

/**
 * Tiny page served after GitHub redirects back. In a popup it hands the
 * session to the opener via postMessage and closes; otherwise it sends the
 * visitor back to the calculator with the session in the URL fragment.
 */
export function callbackPage(result) {
  const payload = jsonForInlineScript({
    type: POST_MESSAGE_TYPE,
    session: result.session,
    login: result.login,
    avatar: result.avatar,
    exp: result.exp
  });
  const targetOrigin = jsonForInlineScript(new URL(result.returnTo).origin);
  const returnTo = jsonForInlineScript(result.returnTo);
  const hashParam = jsonForInlineScript(HASH_PARAM);
  return [
    "<!doctype html>",
    '<html lang="fr"><head><meta charset="utf-8"><title>Compte GitHub lié</title>',
    '<meta name="robots" content="noindex">',
    "<style>body{font:16px/1.5 system-ui,sans-serif;margin:3rem auto;max-width:28rem;padding:0 1rem;color:#1b4332}</style>",
    "</head><body>",
    "<p>Compte GitHub <strong>@" + escapeHtml(result.login) + "</strong> lié. Tu peux fermer cette fenêtre.</p>",
    "<script>",
    "(function(){",
    "var msg=" + payload + ";",
    "var origin=" + targetOrigin + ";",
    "var back=" + returnTo + ";",
    "var key=" + hashParam + ";",
    "var opener=null;try{opener=window.opener;}catch(e){}",
    "if(opener&&!opener.closed){",
    "try{opener.postMessage(msg,origin);}catch(e){}",
    "setTimeout(function(){try{window.close();}catch(e){}},150);",
    "return;}",
    "var enc=encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(msg)))));",
    "location.replace(back+'#'+key+'='+enc);",
    "})();",
    "</script></body></html>"
  ].join("");
}

export function errorPage(title, detail) {
  return [
    "<!doctype html>",
    '<html lang="fr"><head><meta charset="utf-8"><title>' + escapeHtml(title) + "</title>",
    '<meta name="robots" content="noindex">',
    "<style>body{font:16px/1.5 system-ui,sans-serif;margin:3rem auto;max-width:28rem;padding:0 1rem;color:#1b4332}</style>",
    "</head><body><p><strong>" + escapeHtml(title) + "</strong></p>",
    detail ? "<p>" + escapeHtml(detail) + "</p>" : "",
    "<p>Tu peux fermer cette fenêtre et renvoyer ton signalement sans compte.</p>",
    "</body></html>"
  ].join("");
}
