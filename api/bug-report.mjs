/** Netlify function source for POST /api/bug-report — create-only (issues.create). */
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
  res.headers.forEach(function (value, key) {
    outHeaders[key] = value;
  });
  return { statusCode: res.status, headers: outHeaders, body };
}
