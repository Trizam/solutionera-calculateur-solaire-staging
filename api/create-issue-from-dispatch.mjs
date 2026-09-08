#!/usr/bin/env node
/** Optional helper: build payload from dispatch JSON or BUG/NAME/CONTEXT_JSON. */
import {
  validateBugPayload,
  buildBugIssue,
  createGithubIssue,
  BUG_REPO
} from "./bug-report-core.mjs";

function payloadFromEnv() {
  if (process.env.CLIENT_PAYLOAD && process.env.CLIENT_PAYLOAD !== "{}") {
    return JSON.parse(process.env.CLIENT_PAYLOAD);
  }
  let ctx = {};
  try {
    ctx = JSON.parse(process.env.CONTEXT_JSON || "{}");
  } catch (_) {
    ctx = {};
  }
  return {
    bug: process.env.BUG || "",
    name: process.env.NAME || "",
    honeypot: "",
    openedAt: Date.now() - 3000,
    context: ctx
  };
}

let payload;
try {
  payload = payloadFromEnv();
} catch (_) {
  console.error("invalid payload JSON");
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
