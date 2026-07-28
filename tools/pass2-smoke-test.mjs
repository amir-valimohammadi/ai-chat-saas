#!/usr/bin/env node

/**
 * Dependency-free API smoke test for AI Chat SaaS.
 *
 * Usage (PowerShell):
 *   $env:PASS2_API_BASE='http://localhost/ai-chat-saas/backend/api'
 *   $env:PASS2_EMAIL='user@example.com'
 *   $env:PASS2_PASSWORD='secret'
 *   node tools/pass2-smoke-test.mjs
 */

import { writeFile } from "node:fs/promises";
import process from "node:process";

const baseUrl = (process.env.PASS2_API_BASE || "http://localhost/ai-chat-saas/backend/api").replace(/\/$/, "");
const origin = process.env.PASS2_ORIGIN || "http://localhost:3000";
const timeoutMs = Math.max(1000, Number(process.env.PASS2_TIMEOUT_MS || 15000));
const reportPath = process.env.PASS2_REPORT_PATH || "pass2-smoke-report.json";
const email = process.env.PASS2_EMAIL || "";
const password = process.env.PASS2_PASSWORD || "";
const requestedConversationId = Number(process.env.PASS2_CONVERSATION_ID || 0);
const results = [];
let token = "";
let currentUser = null;

function nowIso() {
  return new Date().toISOString();
}

function accepted(status, expected) {
  if (!expected || expected.length === 0) return status >= 200 && status < 500;
  return expected.includes(status);
}

async function request(name, path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  headers.set("Origin", origin);
  if (token && options.auth !== false) headers.set("Authorization", `Bearer ${token}`);

  let body = options.body;
  if (body !== undefined && typeof body !== "string") {
    body = JSON.stringify(body);
  }
  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const started = performance.now();
  let response;
  let raw = "";
  let parsed = null;
  let transportError = null;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body,
      signal: controller.signal,
    });
    raw = await response.text();
    if (raw !== "") parsed = JSON.parse(raw);
  } catch (error) {
    transportError = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timer);
  }

  const elapsedMs = Math.round((performance.now() - started) * 10) / 10;
  const status = response?.status ?? 0;
  const contentType = response?.headers.get("content-type") || "";
  const requestId = response?.headers.get("x-request-id") || parsed?.request_id || null;
  const isJson = parsed !== null && typeof parsed === "object";
  const noHtmlPrefix = !/^\s*</.test(raw);
  const statusOk = accepted(status, options.expectedStatus);
  const ok = !transportError && isJson && noHtmlPrefix && statusOk;

  const result = {
    name,
    path,
    method: options.method || "GET",
    ok,
    status,
    expected_status: options.expectedStatus || null,
    content_type: contentType,
    request_id: requestId,
    elapsed_ms: elapsedMs,
    transport_error: transportError,
    response_success: parsed?.success ?? null,
    response_message: typeof parsed?.message === "string" ? parsed.message : null,
    raw_preview: ok ? null : raw.slice(0, 500),
  };
  results.push(result);
  console.log(`${ok ? "PASS" : "FAIL"} ${result.method} ${path} -> ${status || transportError} (${elapsedMs}ms)`);
  return { result, data: parsed, response };
}

await request("Public plans", "/public/plans-list.php", { auth: false, expectedStatus: [200] });
await request("Maintenance status", "/system/maintenance-status.php", { auth: false, expectedStatus: [200] });
await request("Unauthenticated session", "/auth/me.php", { auth: false, expectedStatus: [401] });
await request("Malformed JSON", "/auth/login.php", {
  auth: false,
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{",
  expectedStatus: [400],
});
await request("Top-level array rejection", "/auth/login.php", {
  auth: false,
  method: "POST",
  body: [],
  expectedStatus: [400],
});

if (email && password) {
  const login = await request("Login", "/auth/login.php", {
    auth: false,
    method: "POST",
    body: { email, password },
    expectedStatus: [200],
  });

  if (login.data?.requires_2fa) {
    console.log("SKIP authenticated tests: account requires 2FA. Use a non-2FA test account for automated smoke tests.");
  } else if (login.data?.token && login.data?.user) {
    token = String(login.data.token);
    currentUser = login.data.user;

    await request("Current user", "/auth/me.php", { expectedStatus: [200] });

    if (["customer_admin", "agent"].includes(currentUser.role)) {
      const conversations = await request("Conversation list", "/agent/conversations-list.php?page=1&limit=10", { expectedStatus: [200] });
      await request("Inbox options", "/agent/inbox-options.php", { expectedStatus: [200] });
      await request("Presence status", "/agent/presence-status.php", { expectedStatus: [200] });
      await request("Notification preferences", "/agent/notification-preferences.php", { expectedStatus: [200] });
      await request("Sites list", "/customer/sites-list.php", { expectedStatus: [200] });

      const firstId = Number(conversations.data?.conversations?.[0]?.id || 0);
      const conversationId = requestedConversationId || firstId;
      if (conversationId > 0) {
        await request("Conversation details", `/agent/conversation-show.php?conversation_id=${conversationId}`, { expectedStatus: [200] });
        await request("Conversation attachments", `/agent/conversation-attachments-list.php?conversation_id=${conversationId}`, { expectedStatus: [200] });
        await request("Assignable agents", `/agent/assignable-agents-list.php?conversation_id=${conversationId}`, { expectedStatus: [200] });
        await request("AI suggestions", `/agent/ai-suggestions-list.php?conversation_id=${conversationId}`, { expectedStatus: [200] });
      } else {
        console.log("SKIP conversation detail tests: no conversation ID was available.");
      }
    }

    if (currentUser.role === "super_admin") {
      await request("Tenants list", "/super-admin/tenants-list.php?page=1&per_page=12", { expectedStatus: [200] });
      await request("Operations health", "/super-admin/operations-health.php", { expectedStatus: [200] });
      await request("Security overview", "/super-admin/security-overview.php", { expectedStatus: [200] });
    }
  }
} else {
  console.log("SKIP authenticated tests: PASS2_EMAIL and PASS2_PASSWORD were not provided.");
}

const failed = results.filter((item) => !item.ok);
const report = {
  generated_at: nowIso(),
  api_base: baseUrl,
  origin,
  node: process.version,
  authenticated_role: currentUser?.role || null,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
};

await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(`\nReport: ${reportPath}`);
console.log(`Result: ${report.passed}/${report.total} passed`);
process.exitCode = failed.length === 0 ? 0 : 1;
