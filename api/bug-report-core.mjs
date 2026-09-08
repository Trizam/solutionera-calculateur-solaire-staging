/** Shared L1 bug-report: validate payload, build issue, POST to GitHub. No token in the browser. */
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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
      "## Contexte (auto)",
      "",
      contextBlock(ctx)
    ].join("\n")
  };
}

export async function createGithubIssue(token, issue, repo) {
  const target = repo || BUG_REPO;
  const res = await fetch("https://api.github.com/repos/" + target + "/issues", {
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

export async function handleBugReportRequest(request, env) {
  const origin = request.headers.get("Origin") || "";
  const headers = corsHeaders(origin);
  headers["Content-Type"] = "application/json; charset=utf-8";

  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers });
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

  const token = (env && (env.BUG_REPORT_GITHUB_TOKEN || env.GITHUB_TOKEN)) || "";
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: "not-configured" }), {
      status: 503,
      headers
    });
  }

  const issue = buildBugIssue(payload, checked);
  try {
    const created = await createGithubIssue(token, issue, BUG_REPO);
    return new Response(
      JSON.stringify({
        ok: true,
        html_url: created.html_url || "",
        number: created.number || null
      }),
      { status: 201, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: "github" }),
      { status: 502, headers }
    );
  }
}
