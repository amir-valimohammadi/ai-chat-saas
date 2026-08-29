import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
}

const runId = Number(arg("run-id"));
const token = process.env.QA_BROWSER_WORKER_TOKEN || arg("token");
const apiBase = (process.env.QA_BROWSER_API_URL || "http://localhost/ai-chat-saas/backend/api").replace(/\/$/, "");
const configuredChannel = (process.env.QA_BROWSER_CHANNEL || "auto").trim().toLowerCase();
const configuredExecutablePath = (process.env.QA_BROWSER_EXECUTABLE_PATH || "").trim();
if (!runId || !token) throw new Error("run-id and token are required");

async function post(endpoint, payload) {
  const response = await fetch(`${apiBase}/internal/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId, token, ...payload }),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`${endpoint}: invalid JSON (${response.status}) ${text.slice(0, 500)}`); }
  if (!response.ok || data.success === false) throw new Error(data.message || `${endpoint} failed`);
  return data;
}

const contextData = (await post("qa-browser-context.php", {})).context;
const artifactDir = contextData.artifact_dir;
const artifactRoot = path.dirname(artifactDir);
await fs.mkdir(artifactDir, { recursive: true });
const totalCases = 17;
let browser;
let finished = false;

function rel(file) { return path.relative(artifactRoot, file).replaceAll("\\", "/"); }
function safeName(value) { return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100); }
function mimeFor(type) {
  return ({ screenshot: "image/png", trace: "application/zip", console: "application/json", network: "application/json", html: "text/html", json: "application/json", log: "text/plain" })[type] || "application/octet-stream";
}

async function artifact(type, file, displayName, metadata = {}) {
  return { type, path: rel(file), name: displayName, mime_type: mimeFor(type), metadata };
}

async function writeJson(name, value) {
  const file = path.join(artifactDir, name);
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
  return file;
}

async function shouldCancel() {
  const state = await post("qa-browser-status.php", {});
  return Boolean(state.cancel_requested);
}

async function createAuthContext(auth, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({
    viewport,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    ignoreHTTPSErrors: false,
  });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_user", JSON.stringify(user));
  }, auth);
  return context;
}

async function collectPage(page) {
  const consoleEvents = [];
  const pageErrors = [];
  const failedRequests = [];
  const badResponses = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleEvents.push({ type: message.type(), text: message.text(), location: message.location() });
    }
  });
  page.on("pageerror", (error) => pageErrors.push({ name: error.name, message: error.message, stack: error.stack }));
  page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), method: request.method(), failure: request.failure() }));
  page.on("response", (response) => {
    if (response.status() >= 400) badResponses.push({ url: response.url(), status: response.status(), method: response.request().method() });
  });
  return { consoleEvents, pageErrors, failedRequests, badResponses };
}

async function runCase(definition) {
  if (await shouldCancel()) throw new Error("QA_RUN_CANCELLED");
  const started = Date.now();
  let status = "passed";
  let severity = "info";
  let message = definition.successMessage || "تست مرورگری با موفقیت انجام شد.";
  let rootCause = null;
  let impact = null;
  let remediation = null;
  let actual = null;
  const artifacts = [];
  let page;
  let telemetry = null;
  try {
    page = await definition.context.newPage();
    telemetry = await collectPage(page);
    await definition.run(page);
    await page.waitForTimeout(300);
    const url = page.url();
    const title = await page.title().catch(() => "");
    const bodyText = await page.locator("body").innerText().catch(() => "");
    actual = { url, title, body_length: bodyText.length };
    const serverErrors = telemetry.badResponses.filter((item) => item.status >= 500);
    if (telemetry.pageErrors.length || serverErrors.length) {
      status = "failed";
      severity = "high";
      message = "صفحه باز شد اما خطای JavaScript یا پاسخ 5xx ثبت شد.";
      rootCause = "خطای Runtime فرانت‌اند یا شکست یکی از APIهای صفحه.";
      impact = "کاربر ممکن است صفحه ناقص، سفید یا غیرقابل استفاده ببیند.";
      remediation = "Console، Network و Screenshot این تست را بررسی کن و endpoint دارای 5xx را رفع کن.";
    } else if (telemetry.consoleEvents.some((item) => item.type === "error") || telemetry.failedRequests.length || telemetry.badResponses.length) {
      status = "warning";
      severity = "medium";
      message = "صفحه بارگذاری شد اما خطای Console یا Network مشاهده شد.";
      rootCause = "یک Asset، API یا کد Client با هشدار یا خطای غیرکشنده روبه‌رو شده است.";
      impact = "ممکن است بخشی از صفحه در برخی شرایط درست عمل نکند.";
      remediation = "فایل‌های Console و Network را بررسی و خطاهای 4xx یا requestfailed را اصلاح کن.";
    }
  } catch (error) {
    status = "failed";
    severity = "high";
    message = error instanceof Error ? error.message : String(error);
    rootCause = "صفحه یا عنصر مورد انتظار در زمان مشخص در دسترس نبود.";
    impact = "سناریوی کاربری اصلی قابل انجام نیست یا Redirect اشتباه رخ داده است.";
    remediation = "Screenshot، HTML و Trace را بررسی کن؛ سپس Route، API و Selector مربوط را اصلاح کن.";
    if (page) {
      const base = safeName(definition.key);
      const shot = path.join(artifactDir, `${base}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      try { artifacts.push(await artifact("screenshot", shot, `${definition.title}.png`)); } catch {}
      const htmlFile = path.join(artifactDir, `${base}.html`);
      await fs.writeFile(htmlFile, await page.content().catch(() => ""), "utf8").catch(() => {});
      try { artifacts.push(await artifact("html", htmlFile, `${definition.title}.html`)); } catch {}
    }
  }

  if (telemetry) {
    if (telemetry.consoleEvents.length || telemetry.pageErrors.length) {
      const file = await writeJson(`${safeName(definition.key)}-console.json`, { console: telemetry.consoleEvents, page_errors: telemetry.pageErrors });
      artifacts.push(await artifact("console", file, `${definition.title} - console.json`));
    }
    if (telemetry.failedRequests.length || telemetry.badResponses.length) {
      const file = await writeJson(`${safeName(definition.key)}-network.json`, { failed_requests: telemetry.failedRequests, bad_responses: telemetry.badResponses });
      artifacts.push(await artifact("network", file, `${definition.title} - network.json`));
    }
  }
  await page?.close().catch(() => {});

  await post("qa-browser-item.php", {
    case_key: definition.key,
    category: definition.category,
    title: definition.title,
    description: definition.description,
    status,
    severity,
    duration_ms: Date.now() - started,
    message,
    root_cause: rootCause,
    impact,
    expected_value: definition.expected || "صفحه بدون خطای Console/Network و بدون Redirect اشتباه بارگذاری شود.",
    actual_value: actual,
    remediation,
    evidence: telemetry,
    artifacts,
    total_cases: totalCases,
  });
}

function routeCase(key, title, context, route, expectedPath, category = "browser") {
  return {
    key, title, context, category,
    description: `بارگذاری مسیر ${route} و کنترل Redirect، صفحه سفید، Console و Network.`,
    run: async (page) => {
      const response = await page.goto(`${contextData.frontend_url}${route}`, { waitUntil: "domcontentloaded", timeout: contextData.timeout_ms });
      if (!response || response.status() >= 500) throw new Error(`HTTP ${response?.status() ?? "NO_RESPONSE"}`);
      await page.waitForLoadState("networkidle", { timeout: 7000 }).catch(() => {});
      if (!new URL(page.url()).pathname.startsWith(expectedPath)) throw new Error(`Redirect ناخواسته به ${page.url()}`);
      const text = await page.locator("body").innerText();
      if (text.trim().length < 20) throw new Error("محتوای صفحه بیش از حد کم یا صفحه سفید است.");
    },
  };
}

async function launchQaBrowser() {
  const baseOptions = { headless: contextData.headless };

  if (configuredExecutablePath) {
    try {
      return await chromium.launch({ ...baseOptions, executablePath: configuredExecutablePath });
    } catch (error) {
      throw new Error(`مرورگر تنظیم‌شده در QA_BROWSER_EXECUTABLE_PATH اجرا نشد: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const channels = configuredChannel === "auto"
    ? ["chrome", "msedge", "bundled"]
    : [configuredChannel];
  const failures = [];

  for (const channel of channels) {
    try {
      if (channel === "bundled" || channel === "chromium") {
        return await chromium.launch(baseOptions);
      }
      return await chromium.launch({ ...baseOptions, channel });
    } catch (error) {
      failures.push(`${channel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    "هیچ مرورگر قابل استفاده‌ای پیدا نشد. Chrome یا Edge را نصب کن، یا QA_BROWSER_CHANNEL=chrome/msedge و در صورت نیاز QA_BROWSER_EXECUTABLE_PATH را تنظیم کن. جزئیات: "
      + failures.join(" | ")
  );
}

try {
  browser = await launchQaBrowser();
  const publicContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "fa-IR" });
  const adminContext = await createAuthContext(contextData.admin);
  const customerContext = await createAuthContext(contextData.customer);
  const mobileCustomerContext = await createAuthContext(contextData.customer, { width: 390, height: 844 });
  await adminContext.tracing.start({ screenshots: true, snapshots: true, sources: true });
  await customerContext.tracing.start({ screenshots: true, snapshots: true, sources: true });

  const cases = [
    routeCase("browser.public_home", "صفحه اصلی عمومی", publicContext, "/", "/", "public"),
    routeCase("browser.login", "صفحه ورود", publicContext, "/login", "/login", "auth"),
    routeCase("browser.admin_dashboard", "داشبورد Super Admin", adminContext, "/super-admin/dashboard", "/super-admin/dashboard", "super_admin"),
    routeCase("browser.admin_test_center", "مرکز جامع تست", adminContext, "/super-admin/test-center", "/super-admin/test-center", "super_admin"),
    routeCase("browser.admin_system_health", "سلامت سیستم", adminContext, "/super-admin/system-health", "/super-admin/system-health", "super_admin"),
    routeCase("browser.admin_customers", "فهرست مشتریان", adminContext, "/super-admin/customers", "/super-admin/customers", "super_admin"),
    routeCase("browser.admin_security", "مرکز امنیت", adminContext, "/super-admin/security-center", "/super-admin/security-center", "security"),
    routeCase("browser.customer_dashboard", "داشبورد مشتری", customerContext, "/dashboard", "/dashboard", "customer"),
    routeCase("browser.customer_conversations", "گفتگوهای مشتری", customerContext, "/conversations", "/conversations", "messaging"),
    routeCase("browser.customer_visitors", "بازدیدکنندگان مشتری", customerContext, "/visitors", "/visitors", "visitors"),
    routeCase("browser.customer_departments", "دپارتمان‌های مشتری", customerContext, "/departments", "/departments", "messaging"),
    routeCase("browser.customer_ai", "مرکز هوش مصنوعی مشتری", customerContext, "/ai-center", "/ai-center", "ai"),
    routeCase("browser.customer_security", "امنیت حساب مشتری", customerContext, "/security", "/security", "security"),
    routeCase("browser.mobile_dashboard", "داشبورد مشتری در موبایل", mobileCustomerContext, "/dashboard", "/dashboard", "responsive"),
    {
      key: "browser.widget_load", category: "widget", title: "بارگذاری فایل و دکمه ویجت", context: publicContext,
      description: "ویجت روی میزبان ایزوله بارگذاری و Shadow DOM و دکمه آغاز چت بررسی می‌شود.",
      run: async (page) => {
        const url = new URL(`${contextData.widget_host_url}`);
        url.searchParams.set("site_key", contextData.site.site_key);
        url.searchParams.set("api_base", contextData.api_url);
        url.searchParams.set("widget_script", contextData.widget_script_url);
        await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: contextData.timeout_ms });
        await page.waitForSelector("#ai-chat-widget-root", { state: "attached", timeout: contextData.timeout_ms });
        const state = await page.locator("#ai-chat-widget-root").evaluate((host) => {
          const root = host.shadowRoot;
          return { hasShadow: Boolean(root), hasToggle: Boolean(root?.querySelector("[data-toggle]")), hasWindow: Boolean(root?.querySelector("[data-window]")) };
        });
        if (!state.hasShadow || !state.hasToggle || !state.hasWindow) throw new Error("ساختار Shadow DOM ویجت ناقص است.");
      },
    },
    {
      key: "browser.widget_open", category: "widget", title: "باز و بسته‌شدن ویجت", context: publicContext,
      description: "دکمه ویجت کلیک و بازشدن پنجره چت بررسی می‌شود.",
      run: async (page) => {
        const url = new URL(`${contextData.widget_host_url}`);
        url.searchParams.set("site_key", contextData.site.site_key);
        url.searchParams.set("api_base", contextData.api_url);
        url.searchParams.set("widget_script", contextData.widget_script_url);
        await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: contextData.timeout_ms });
        await page.waitForSelector("#ai-chat-widget-root", { state: "attached", timeout: contextData.timeout_ms });
        await page.locator("#ai-chat-widget-root").evaluate((host) => host.shadowRoot?.querySelector("[data-toggle]")?.click());
        await page.waitForTimeout(800);
        const opened = await page.locator("#ai-chat-widget-root").evaluate((host) => host.shadowRoot?.querySelector("[data-window]")?.classList.contains("open"));
        if (!opened) throw new Error("پنجره ویجت بعد از کلیک باز نشد.");
      },
    },
    {
      key: "browser.widget_api", category: "widget", title: "API تنظیمات و Presence ویجت", context: publicContext,
      description: "تنظیمات سایت و ساخت Visitor آزمایشی از API واقعی ویجت بررسی می‌شود.",
      run: async (page) => {
        await page.goto(contextData.widget_host_url, { waitUntil: "domcontentloaded", timeout: contextData.timeout_ms });
        const result = await page.evaluate(async ({ api, siteKey }) => {
          const configResponse = await fetch(`${api}/widget/config.php?site_key=${encodeURIComponent(siteKey)}`);
          const config = await configResponse.json();
          const visitorResponse = await fetch(`${api}/widget/visitor-start.php`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site_key: siteKey, browser_id: `qa-${Date.now()}`, session_key: `qa-session-${Date.now()}`, current_page_url: location.href, current_page_title: document.title, device_type: "desktop" }) });
          const visitor = await visitorResponse.json();
          return { configStatus: configResponse.status, config, visitorStatus: visitorResponse.status, visitor };
        }, { api: contextData.api_url, siteKey: contextData.site.site_key });
        if (result.configStatus >= 400 || result.config.success === false) throw new Error(`Widget config failed: ${JSON.stringify(result.config)}`);
        if (result.visitorStatus >= 400 || result.visitor.success === false) throw new Error(`Visitor start failed: ${JSON.stringify(result.visitor)}`);
      },
    },
  ];

  for (const definition of cases) await runCase(definition);

  const adminTrace = path.join(artifactDir, "admin-trace.zip");
  const customerTrace = path.join(artifactDir, "customer-trace.zip");
  await adminContext.tracing.stop({ path: adminTrace });
  await customerContext.tracing.stop({ path: customerTrace });
  await post("qa-browser-item.php", {
    case_key: "browser.trace_collection", category: "browser", title: "Trace کامل مرورگر", description: "Trace صفحات مدیریتی و مشتری برای تحلیل دقیق ذخیره می‌شود.", status: "passed", severity: "info", duration_ms: 0,
    message: "Trace مرورگر با موفقیت ذخیره شد.", expected_value: "دو فایل Trace", actual_value: "دو فایل Trace",
    artifacts: [await artifact("trace", adminTrace, "admin-trace.zip"), await artifact("trace", customerTrace, "customer-trace.zip")], total_cases: totalCases,
  });

  await Promise.all([publicContext.close(), adminContext.close(), customerContext.close(), mobileCustomerContext.close()]);
  await browser.close();
  await post("qa-browser-finish.php", { status: "completed" });
  finished = true;
  console.log(`Browser QA run ${runId} completed.`);
} catch (error) {
  const cancelled = error instanceof Error && error.message === "QA_RUN_CANCELLED";
  if (browser) await browser.close().catch(() => {});
  if (!finished) {
    await post("qa-browser-finish.php", { status: cancelled ? "cancelled" : "failed", error: error instanceof Error ? error.message : String(error) }).catch(() => {});
  }
  if (!cancelled) throw error;
  console.log(`Browser QA run ${runId} cancelled.`);
}
