/** Netlify function source for POST /api/bug-report (+ GET /auth/* for the optional GitHub link). */
import { handleBugReportRequest } from "./bug-report-core.mjs";

export async function handler(event) {
  const url = event.rawUrl || ("https://example.invalid" + (event.path || "/api/bug-report"));
  const headers = event.headers || {};
  const method = event.httpMethod || "GET";
  const req = new Request(url, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : event.body
  });
  const res = await handleBugReportRequest(req, process.env);
  const body = await res.text();
  const outHeaders = {};
  const multiValueHeaders = {};
  res.headers.forEach(function (value, key) {
    if (key.toLowerCase() === "set-cookie") return;
    outHeaders[key] = value;
  });
  const cookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (cookies.length) multiValueHeaders["Set-Cookie"] = cookies;
  return { statusCode: res.status, headers: outHeaders, multiValueHeaders, body };
}
