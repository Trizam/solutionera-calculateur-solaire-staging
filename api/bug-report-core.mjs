/** Shared L1 bug-report: validate payload, build issue, POST to GitHub. No token in the browser. */
import {
  SESSION_HEADER,
  SESSION_TTL_MS,
  NONCE_COOKIE,
  AUTH_START_PATH,
  AUTH_CALLBACK_PATH,
  AUTH_CONFIG_PATH,
  githubAuthConfig,
  openSession,
  sealSession,
  safeReturnTo,
  buildAuthorizeRedirect,
  openState,
  exchangeCodeForUser,
  callbackPage,
  errorPage
} from "./github-auth.mjs";

export const BUG_REPO = "Trizam/solutionera-calculateur-solaire-staging";
export const BUG_MIN_LEN = 10;
export const NAME_MAX = 80;
export const MIN_FORM_MS = 2000;
export const ISSUES_LIST_URL =
  "https://github.com/Trizam/solutionera-calculateur-solaire-staging/issues?q=label%3Auser-report";

const TITLE_PREFIX = "[user-report] ";
const TITLE_BUG_CHARS = 72;
const FIELD_MAX = 4000;
const CALC_JSON_MAX = 8000;

export function clipText(s, max) {
  const t = String(s == null ? "" : s).replace(/\0/g, "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

export function allowedOrigin(origin) {
  if (!origin) return "";
  if (origin === "https://trizam.github.io") return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return "";
}

export function corsHeaders(origin) {
  const allow = allowedOrigin(origin) || "https://trizam.github.io";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, " + SESSION_HEADER,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

export function validateBugPayload(payload, nowMs) {
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  const data = payload && typeof payload === "object" ? payload : {};
  if (String(data.hp || data.honeypot || "").trim() !== "") {
    return { ok: false, reason: "honeypot" };
  }
  const bug = clipText(data.bug, FIELD_MAX);
  const name = clipText(data.name, NAME_MAX);
  if (bug.length < BUG_MIN_LEN) {
    return { ok: false, reason: "bug-min" };
  }
  const openedAt = Number(data.openedAt);
  if (!isFinite(openedAt) || now - openedAt < MIN_FORM_MS) {
    return { ok: false, reason: "too-fast" };
  }
  if (now - openedAt > 24 * 60 * 60 * 1000) {
    return { ok: false, reason: "stale" };
  }
  return { ok: true, bug: bug, name: name };
}

function titleFromBug(bug) {
  const oneLine = String(bug).replace(/\s+/g, " ").trim();
  const slice = oneLine.slice(0, TITLE_BUG_CHARS);
  return TITLE_PREFIX + slice;
}

function contextBlock(ctx) {
  const c = ctx && typeof ctx === "object" ? ctx : {};
  const url = clipText(c.url, 500);
  const mode = clipText(c.mode || "full", 40);
  const version = clipText(c.version, 80);
  const ua = clipText(c.userAgent || c.ua, 180);
  const ts = clipText(c.timestamp || c.ts, 40);
  let calcJson = "";
  try {
    calcJson = JSON.stringify(c.calc != null ? c.calc : {}, null, 2);
  } catch (_) {
    calcJson = "{}";
  }
  if (calcJson.length > CALC_JSON_MAX) {
    calcJson = calcJson.slice(0, CALC_JSON_MAX) + "\n…";
  }
  return [
    "- **URL :** " + (url || "—"),
    "- **mode :** `" + (mode || "full") + "`",
    "- **Version :** " + (version || "—"),
    "- **User-Agent :** " + (ua || "—"),
    "- **Horodatage :** " + (ts || "—"),
    "",
    "```json",
    calcJson,
    "```"
  ].join("\n");
}

export function buildBugIssue(payload, extras) {
  const checked = extras && extras.bug ? extras : validateBugPayload(payload);
  if (!checked.ok) return null;
  const ctx = payload && payload.context ? payload.context : {};
  return {
    title: titleFromBug(checked.bug),
    labels: ["user-report", "bug"],
    body: [
      "## Bug",
      "",
      checked.bug,
      "",
      "## Nom",
      "",
      checked.name || "—",
      "",
      "## Contexte",
      "",
      contextBlock(ctx)
    ].join("\n")
  };
}

export async function createGithubIssue(token, issue, repo, fetchImpl) {
  const target = repo || BUG_REPO;
  const doFetch = fetchImpl || fetch;
  const res = await doFetch("https://api.github.com/repos/" + target + "/issues", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "solutionera-calculateur-bug-report"
    },
    body: JSON.stringify(issue)
  });
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok) {
    const err = new Error("github-" + res.status);
    err.status = res.status;
    err.detail = data && data.message ? data.message : "";
    throw err;
  }
  return data;
}

/**
 * GitHub drops `labels` on issues.create when the author lacks push access,
 * so a visitor-authored issue gets its labels from the bot afterwards.
 */
export async function addIssueLabels(token, number, labels, repo, fetchImpl) {
  const target = repo || BUG_REPO;
  const doFetch = fetchImpl || fetch;
  const res = await doFetch("https://api.github.com/repos/" + target + "/issues/" + number + "/labels", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "solutionera-calculateur-bug-report"
    },
    body: JSON.stringify({ labels })
  });
  return res.ok;
}

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

function htmlResponse(html, status) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function requestPath(request) {
  try {
    return new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  } catch (_) {
    return "/";
  }
}

/** GET /auth/config — lets the page know whether the GitHub link is offered. */
function handleAuthConfig(env, headers) {
  const cfg = githubAuthConfig(env);
  return jsonResponse({ ok: true, github: cfg.enabled }, 200, headers);
}

/** GET /auth/github/start?return_to=…&mode=popup|redirect → 302 to GitHub. */
async function handleAuthStart(request, env) {
  const cfg = githubAuthConfig(env);
  if (!cfg.enabled) {
    return htmlResponse(errorPage("Connexion GitHub non configurée"), 503);
  }
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("return_to"), allowedOrigin);
  if (!returnTo) {
    return htmlResponse(errorPage("Adresse de retour refusée"), 400);
  }
  const mode = url.searchParams.get("mode") === "redirect" ? "redirect" : "popup";
  const redirect = await buildAuthorizeRedirect(cfg, request.url, returnTo, mode);
  return new Response(null, {
    status: 302,
    headers: {
      Location: redirect.location,
      "Set-Cookie": redirect.cookie,
      "Cache-Control": "no-store"
    }
  });
}

/** GET /auth/github/callback?code=…&state=… → seal session, hand it back to the page. */
async function handleAuthCallback(request, env, fetchImpl) {
  const cfg = githubAuthConfig(env);
  if (!cfg.enabled) {
    return htmlResponse(errorPage("Connexion GitHub non configurée"), 503);
  }
  const url = new URL(request.url);
  const state = await openState(cfg, url.searchParams.get("state") || "", request.headers.get("Cookie") || "");
  if (!state || !safeReturnTo(state.returnTo, allowedOrigin)) {
    return htmlResponse(errorPage("Lien expiré", "Recommence la connexion GitHub depuis le calculateur."), 400);
  }
  if (url.searchParams.get("error")) {
    return htmlResponse(errorPage("Connexion GitHub annulée"), 200);
  }
  const code = url.searchParams.get("code") || "";
  if (!code) {
    return htmlResponse(errorPage("Lien incomplet"), 400);
  }
  let user;
  try {
    user = await exchangeCodeForUser(cfg, code, request.url, fetchImpl);
  } catch (_) {
    return htmlResponse(errorPage("GitHub n’a pas accepté la connexion", "Réessaie dans un instant."), 502);
  }
  const now = Date.now();
  const session = await sealSession(cfg.sessionSecret, user, now);
  const page = callbackPage({
    session,
    login: user.login,
    avatar: user.avatar,
    exp: now + SESSION_TTL_MS,
    returnTo: state.returnTo
  });
  const res = htmlResponse(page, 200);
  res.headers.append("Set-Cookie", NONCE_COOKIE + "=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax");
  return res;
}

export async function handleBugReportRequest(request, env, fetchImpl) {
  const origin = request.headers.get("Origin") || "";
  const headers = corsHeaders(origin);
  headers["Content-Type"] = "application/json; charset=utf-8";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const path = requestPath(request);
  if (request.method === "GET") {
    if (path === AUTH_CONFIG_PATH) return handleAuthConfig(env, headers);
    if (path === AUTH_START_PATH) return handleAuthStart(request, env);
    if (path === AUTH_CALLBACK_PATH) return handleAuthCallback(request, env, fetchImpl);
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method" }), {
      status: 405,
      headers
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    return new Response(JSON.stringify({ ok: false, error: "json" }), {
      status: 400,
      headers
    });
  }

  const checked = validateBugPayload(payload);
  if (!checked.ok && checked.reason === "honeypot") {
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      status: 200,
      headers
    });
  }
  if (!checked.ok) {
    return new Response(JSON.stringify({ ok: false, error: checked.reason }), {
      status: 400,
      headers
    });
  }

  const botToken = (env && (env.BUG_REPORT_GITHUB_TOKEN || env.GITHUB_TOKEN)) || "";
  const cfg = githubAuthConfig(env);
  const session = cfg.enabled
    ? await openSession(cfg.sessionSecret, request.headers.get(SESSION_HEADER) || "")
    : null;
  if (!botToken && !session) {
    return new Response(JSON.stringify({ ok: false, error: "not-configured" }), {
      status: 503,
      headers
    });
  }

  const issue = buildBugIssue(payload, checked);
  const doFetch = fetchImpl || fetch;
  let sessionRejected = false;
  if (session) {
    try {
      const created = await createGithubIssue(session.token, issue, BUG_REPO, doFetch);
      if (botToken && created && created.number) {
        await addIssueLabels(botToken, created.number, issue.labels, BUG_REPO, doFetch).catch(function () {
          return false;
        });
      }
      return jsonResponse(
        {
          ok: true,
          as: "user",
          login: session.login,
          html_url: created.html_url || "",
          number: created.number || null
        },
        201,
        headers
      );
    } catch (err) {
      // Revoked / expired grant: drop the visitor identity, still deliver the report.
      const status = err && err.status;
      if (!botToken || (status !== 401 && status !== 403 && status !== 404)) {
        return jsonResponse({ ok: false, error: "github" }, 502, headers);
      }
      sessionRejected = true;
    }
  }

  try {
    const created = await createGithubIssue(botToken, issue, BUG_REPO, doFetch);
    const body = {
      ok: true,
      as: "bot",
      html_url: created.html_url || "",
      number: created.number || null
    };
    if (sessionRejected) body.session = "expired";
    return jsonResponse(body, 201, headers);
  } catch (err) {
    return jsonResponse({ ok: false, error: "github" }, 502, headers);
  }
}
