#!/usr/bin/env node
/** GitHub Action helper: repository_dispatch type calculateur-bug → Issue. */
import {
  validateBugPayload,
  buildBugIssue,
  createGithubIssue,
  BUG_REPO
} from "./bug-report-core.mjs";

const raw = process.env.CLIENT_PAYLOAD || "{}";
let payload;
try {
  payload = JSON.parse(raw);
} catch (_) {
  console.error("invalid CLIENT_PAYLOAD");
  process.exit(1);
}

const checked = validateBugPayload(payload);
if (!checked.ok) {
  if (checked.reason === "honeypot") {
    console.log("ignored honeypot");
    process.exit(0);
  }
  console.error("invalid payload:", checked.reason);
  process.exit(1);
}

const token = process.env.BUG_REPORT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  console.error("missing token");
  process.exit(1);
}

const issue = buildBugIssue(payload, checked);
const created = await createGithubIssue(token, issue, process.env.GITHUB_REPOSITORY || BUG_REPO);
console.log("created", created.html_url || created.number);
