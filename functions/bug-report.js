/** Cloudflare Worker — set secret BUG_REPORT_GITHUB_TOKEN, then wrangler deploy. */
import { handleBugReportRequest } from "../api/bug-report-core.mjs";

export default {
  async fetch(request, env) {
    return handleBugReportRequest(request, env);
  }
};
