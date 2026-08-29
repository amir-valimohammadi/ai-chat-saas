// مسیر فایل: frontend/app/super-admin/system-health/page.tsx
// هدف: مرکز عملیات، سلامت سیستم، Jobها، خطاها و Maintenance Mode

"use client";

import { type CSSProperties, type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type HealthStatus = "healthy" | "warning" | "critical" | "degraded" | "down" | "idle" | "unknown";
type TabKey = "overview" | "jobs" | "errors" | "requests";

type WarningItem = {
    code: string;
    severity: "warning" | "critical";
    title: string;
    message: string;
};

type ComponentHealth = {
    status: HealthStatus;
    message: string;
    latency_ms: number | null;
    status_code?: number | null;
    driver?: string;
    server_version?: string;
};

type ServiceHealth = {
    key: string;
    label: string;
    status: HealthStatus;
    message: string | null;
    last_seen_at: string | null;
    seconds_since_seen: number | null;
    metadata: Record<string, unknown> | null;
};

type CrawlJob = {
    id: number;
    tenant_id: number;
    site_id: number;
    tenant_name: string;
    site_name: string;
    site_domain: string;
    status: "queued" | "running" | "completed" | "failed" | "cancelled";
    current_stage: string;
    current_message: string | null;
    progress_percent: number;
    total_urls: number;
    processed_urls: number;
    failed_pages: number;
    error_message: string | null;
    started_at: string | null;
    finished_at: string | null;
    last_activity_at: string | null;
    created_at: string;
    is_stale: boolean;
    can_retry: boolean;
};

type ErrorLog = {
    id: number;
    fingerprint: string;
    level: "warning" | "error" | "critical";
    source: string;
    message: string;
    exception_class: string | null;
    file_path: string | null;
    line_number: number | null;
    request_method: string | null;
    request_uri: string | null;
    status_code: number | null;
    occurrences: number;
    first_seen_at: string;
    last_seen_at: string;
    resolved_at: string | null;
};

type SlowRequest = {
    id: number;
    request_method: string;
    request_uri: string;
    status_code: number;
    duration_ms: number;
    peak_memory_bytes: number;
    occurred_at: string;
};

type HealthData = {
    generated_at: string;
    overall_status: "healthy" | "warning" | "critical";
    warnings: WarningItem[];
    summary: {
        unresolved_errors: number;
        critical_errors: number;
        error_occurrences_24h: number;
        failed_jobs_24h: number;
        stale_jobs: number;
        slow_requests: number;
        disk_usage_percent: number | null;
    };
    components: {
        backend: ComponentHealth;
        database: ComponentHealth;
        frontend: ComponentHealth;
    };
    storage: {
        project_root: string;
        uploads_path: string;
        disk_total_bytes: number | null;
        disk_free_bytes: number | null;
        disk_used_bytes: number | null;
        disk_usage_percent: number | null;
        uploads_bytes: number;
        uploads_files: number;
        uploads_scan_truncated: boolean;
        uploads_exists: boolean;
        uploads_writable: boolean;
    };
    runtime: {
        php_version: string;
        sapi: string;
        app_env: string;
        debug_enabled: boolean;
        timezone: string;
        server_time: string;
        memory_limit: string;
        max_execution_time: number;
        extensions: Record<string, boolean>;
    };
    maintenance: {
        enabled: boolean;
        message: string;
        until: string | null;
    };
    services: ServiceHealth[];
    crawl: {
        queued_runs: number;
        running_runs: number;
        stale_runs: number;
        failed_24h: number;
        completed_24h: number;
        queued_items: number;
        processing_items: number;
        failed_items: number;
        stuck_items: number;
    };
    recent_jobs: CrawlJob[];
    errors: ErrorLog[];
    slow_requests: SlowRequest[];
};

const numberFormatter = new Intl.NumberFormat("fa-IR");
const oneDecimalFormatter = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });

export default function SystemHealthPage() {
    const router = useRouter();
    const [data, setData] = useState<HealthData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState<TabKey>("overview");
    const [actionId, setActionId] = useState<string | null>(null);
    const [maintenanceOpen, setMaintenanceOpen] = useState(false);
    const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
    const [maintenanceMessage, setMaintenanceMessage] = useState("");
    const [maintenanceUntil, setMaintenanceUntil] = useState("");

    const loadHealth = useCallback(async (silent = false) => {
        try {
            setError("");
            silent ? setRefreshing(true) : setLoading(true);
            const response = (await apiRequest("/super-admin/operations-health.php")) as HealthData;
            setData(response);
            if (!silent) {
                setMaintenanceEnabled(response.maintenance.enabled);
                setMaintenanceMessage(response.maintenance.message || "");
                setMaintenanceUntil(toDateTimeLocal(response.maintenance.until));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "دریافت سلامت سیستم ناموفق بود.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        const user = getAuthUser() as { role?: string } | null;
        if (!user) {
            router.push("/login");
            return;
        }
        if (user.role !== "super_admin") {
            router.push("/dashboard");
            return;
        }

        loadHealth();
        const timer = window.setInterval(() => loadHealth(true), 30000);
        return () => window.clearInterval(timer);
    }, [loadHealth, router]);

    const unresolvedErrors = useMemo(
        () => data?.errors.filter((item) => !item.resolved_at) ?? [],
        [data?.errors]
    );

    async function saveMaintenance() {
        const confirmed = window.confirm(
            maintenanceEnabled
                ? "با فعال‌سازی Maintenance Mode، APIهای مشتری و ویجت موقتاً متوقف می‌شوند. ادامه می‌دهید؟"
                : "Maintenance Mode غیرفعال شود؟"
        );
        if (!confirmed) return;
        const currentPassword = window.prompt("برای تغییر Maintenance Mode، رمز فعلی مدیر را وارد کنید:") || "";
        if (!currentPassword) return;

        try {
            setActionId("maintenance");
            await apiRequest("/super-admin/operations-maintenance-update.php", {
                method: "POST",
                body: JSON.stringify({
                    enabled: maintenanceEnabled,
                    message: maintenanceMessage,
                    until: maintenanceUntil || null,
                    current_password: currentPassword,
                }),
            });
            setMaintenanceOpen(false);
            await loadHealth(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "بروزرسانی حالت نگهداری ناموفق بود.");
        } finally {
            setActionId(null);
        }
    }

    async function retryJob(job: CrawlJob) {
        if (!window.confirm(`خزش سایت «${job.site_name}» دوباره در صف قرار بگیرد؟`)) return;

        try {
            setActionId(`job-${job.id}`);
            await apiRequest("/super-admin/operations-crawl-retry.php", {
                method: "POST",
                body: JSON.stringify({ run_id: job.id }),
            });
            await loadHealth(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Retry خزش ناموفق بود.");
        } finally {
            setActionId(null);
        }
    }

    async function toggleError(errorItem: ErrorLog) {
        const resolved = !errorItem.resolved_at;
        try {
            setActionId(`error-${errorItem.id}`);
            await apiRequest("/super-admin/operations-error-resolve.php", {
                method: "POST",
                body: JSON.stringify({ error_id: errorItem.id, resolved }),
            });
            await loadHealth(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "بروزرسانی خطا ناموفق بود.");
        } finally {
            setActionId(null);
        }
    }

    return (
        <AppShell
            title="سلامت سیستم"
            kicker="Operations center"
            description="مانیتور سرویس‌ها، فضای ذخیره‌سازی، خزش‌ها، خطاها و درخواست‌های کند"
            actions={
                <div className="ops-header-actions">
                    <button
                        className="btn secondary"
                        type="button"
                        onClick={() => setMaintenanceOpen((value) => !value)}
                    >
                        {data?.maintenance.enabled ? "نگهداری فعال" : "Maintenance Mode"}
                    </button>
                    <button
                        className="btn"
                        type="button"
                        onClick={() => loadHealth(true)}
                        disabled={refreshing || loading}
                    >
                        {refreshing ? "در حال بروزرسانی…" : "بروزرسانی وضعیت"}
                    </button>
                </div>
            }
        >
            <main className="ops-page">
                {error && (
                    <div className="ops-error-banner" role="alert">
                        <div><strong>عملیات کامل نشد</strong><span>{error}</span></div>
                        <button type="button" onClick={() => setError("")}>بستن</button>
                    </div>
                )}

                {maintenanceOpen && (
                    <section className="ops-maintenance-panel">
                        <div className="ops-section-heading">
                            <div>
                                <span>کنترل دسترسی سرویس</span>
                                <h2>Maintenance Mode</h2>
                                <p>مسیرهای Super Admin و ورود باز می‌مانند؛ API مشتری و ویجت پاسخ 503 دریافت می‌کنند.</p>
                            </div>
                            <StatusPill status={maintenanceEnabled ? "warning" : "healthy"} label={maintenanceEnabled ? "در حال فعال‌سازی" : "غیرفعال"} />
                        </div>
                        <div className="ops-maintenance-grid">
                            <label className="ops-switch-field">
                                <input
                                    type="checkbox"
                                    checked={maintenanceEnabled}
                                    onChange={(event: ChangeEvent<HTMLInputElement>) => setMaintenanceEnabled(event.target.checked)}
                                />
                                <span><strong>فعال‌کردن حالت نگهداری</strong><small>برای بروزرسانی یا رفع مشکل موقت</small></span>
                            </label>
                            <label>
                                <span>زمان پایان اختیاری</span>
                                <input
                                    type="datetime-local"
                                    value={maintenanceUntil}
                                    onChange={(event: ChangeEvent<HTMLInputElement>) => setMaintenanceUntil(event.target.value)}
                                />
                            </label>
                            <label className="ops-maintenance-message">
                                <span>پیام نمایش‌داده‌شده به مشتری</span>
                                <textarea
                                    rows={3}
                                    maxLength={500}
                                    value={maintenanceMessage}
                                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setMaintenanceMessage(event.target.value)}
                                />
                            </label>
                        </div>
                        <div className="ops-maintenance-actions">
                            <button className="btn secondary" type="button" onClick={() => setMaintenanceOpen(false)}>انصراف</button>
                            <button className="btn" type="button" onClick={saveMaintenance} disabled={actionId === "maintenance"}>
                                {actionId === "maintenance" ? "در حال ذخیره…" : "ثبت تنظیمات نگهداری"}
                            </button>
                        </div>
                    </section>
                )}

                {loading && !data ? (
                    <OperationsSkeleton />
                ) : data ? (
                    <>
                        <OperationsHero data={data} />
                        <nav className="ops-tabs" aria-label="بخش‌های مرکز عملیات">
                            <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")} label="نمای کلی" count={data.warnings.length} />
                            <TabButton active={activeTab === "jobs"} onClick={() => setActiveTab("jobs")} label="Jobهای خزش" count={data.recent_jobs.length} />
                            <TabButton active={activeTab === "errors"} onClick={() => setActiveTab("errors")} label="خطاها" count={unresolvedErrors.length} />
                            <TabButton active={activeTab === "requests"} onClick={() => setActiveTab("requests")} label="درخواست‌های کند" count={data.slow_requests.length} />
                        </nav>

                        {activeTab === "overview" && <OverviewTab data={data} />}
                        {activeTab === "jobs" && <JobsTab jobs={data.recent_jobs} actionId={actionId} onRetry={retryJob} />}
                        {activeTab === "errors" && <ErrorsTab errors={data.errors} actionId={actionId} onToggle={toggleError} />}
                        {activeTab === "requests" && <RequestsTab requests={data.slow_requests} />}
                    </>
                ) : null}
            </main>
        </AppShell>
    );
}

function OperationsHero({ data }: { data: HealthData }) {
    const labels = { healthy: "همه سرویس‌های اصلی پایدارند", warning: "سیستم نیازمند بررسی است", critical: "اقدام فوری مدیریتی لازم است" };
    return (
        <section className={`ops-hero is-${data.overall_status}`}>
            <div className="ops-hero-main">
                <div className="ops-pulse"><span /></div>
                <div>
                    <span className="ops-eyebrow">وضعیت لحظه‌ای پلتفرم</span>
                    <h2>{labels[data.overall_status]}</h2>
                    <p>{data.warnings.length ? `${numberFormatter.format(data.warnings.length)} هشدار فعال ثبت شده است.` : "در حال حاضر هشدار عملیاتی فعالی وجود ندارد."}</p>
                </div>
            </div>
            <div className="ops-hero-meta">
                <span>آخرین بررسی</span>
                <strong>{formatDateTime(data.generated_at)}</strong>
                <small>بروزرسانی خودکار هر ۳۰ ثانیه</small>
            </div>
        </section>
    );
}

function OverviewTab({ data }: { data: HealthData }) {
    return (
        <div className="ops-tab-content">
            <section className="ops-metrics">
                <MetricCard label="خطاهای حل‌نشده" value={data.summary.unresolved_errors} hint={`${numberFormatter.format(data.summary.critical_errors)} بحرانی`} tone={data.summary.critical_errors ? "danger" : data.summary.unresolved_errors ? "warning" : "success"} />
                <MetricCard label="خزش ناموفق ۲۴ ساعت" value={data.summary.failed_jobs_24h} hint={`${numberFormatter.format(data.summary.stale_jobs)} اجرای متوقف`} tone={data.summary.stale_jobs ? "danger" : data.summary.failed_jobs_24h ? "warning" : "success"} />
                <MetricCard label="درخواست‌های کند" value={data.summary.slow_requests} hint="در هفت روز اخیر" tone={data.summary.slow_requests ? "warning" : "neutral"} />
                <MetricCard label="مصرف دیسک" value={data.summary.disk_usage_percent ?? 0} suffix="٪" hint={`${formatBytes(data.storage.disk_free_bytes)} فضای آزاد`} tone={(data.summary.disk_usage_percent ?? 0) >= 90 ? "danger" : (data.summary.disk_usage_percent ?? 0) >= 80 ? "warning" : "success"} />
            </section>

            {data.warnings.length > 0 && (
                <section className="ops-panel">
                    <SectionHeading eyebrow="هشدارهای فعال" title="موارد نیازمند توجه" description="هشدارها از وضعیت واقعی دیتابیس، دیسک، خطاها و صف خزش تولید می‌شوند." />
                    <div className="ops-warning-list">
                        {data.warnings.map((warning) => (
                            <article className={`ops-warning is-${warning.severity}`} key={warning.code}>
                                <span className="ops-warning-icon">{warning.severity === "critical" ? "!" : "⚠"}</span>
                                <div><strong>{warning.title}</strong><p>{warning.message}</p></div>
                            </article>
                        ))}
                    </div>
                </section>
            )}

            <div className="ops-two-column">
                <section className="ops-panel">
                    <SectionHeading eyebrow="اجزای اصلی" title="سلامت سرویس‌ها" description="Backend، Database، Frontend و سرویس‌های زمان‌بندی‌شده" />
                    <div className="ops-service-list">
                        <ComponentRow label="Backend API" item={data.components.backend} />
                        <ComponentRow label="MySQL Database" item={data.components.database} />
                        <ComponentRow label="Next.js Frontend" item={data.components.frontend} />
                        {data.services.map((service) => <ServiceRow service={service} key={service.key} />)}
                    </div>
                </section>

                <section className="ops-panel">
                    <SectionHeading eyebrow="فضای ذخیره‌سازی" title="دیسک و Uploadها" description="مصرف کلی دیسک و حجم فایل‌های بارگذاری‌شده" />
                    <div className="ops-storage-ring-wrap">
                        <div className="ops-storage-ring" style={{ "--usage": `${data.storage.disk_usage_percent ?? 0}%` } as CSSProperties}>
                            <strong>{oneDecimalFormatter.format(data.storage.disk_usage_percent ?? 0)}٪</strong><span>مصرف دیسک</span>
                        </div>
                        <div className="ops-storage-stats">
                            <InfoRow label="کل دیسک" value={formatBytes(data.storage.disk_total_bytes)} />
                            <InfoRow label="فضای آزاد" value={formatBytes(data.storage.disk_free_bytes)} />
                            <InfoRow label="حجم Upload" value={formatBytes(data.storage.uploads_bytes)} />
                            <InfoRow label="تعداد فایل" value={numberFormatter.format(data.storage.uploads_files)} />
                            <InfoRow label="قابل نوشتن" value={data.storage.uploads_writable ? "بله" : "خیر"} danger={!data.storage.uploads_writable} />
                        </div>
                    </div>
                </section>
            </div>

            <div className="ops-two-column">
                <section className="ops-panel">
                    <SectionHeading eyebrow="Crawler queue" title="وضعیت صف خزش" description="اجرای فعال، موفق، ناموفق و آیتم‌های صف" />
                    <div className="ops-crawl-grid">
                        <MiniStat label="اجرای در صف" value={data.crawl.queued_runs} />
                        <MiniStat label="در حال اجرا" value={data.crawl.running_runs} />
                        <MiniStat label="موفق ۲۴ ساعت" value={data.crawl.completed_24h} />
                        <MiniStat label="ناموفق ۲۴ ساعت" value={data.crawl.failed_24h} danger={data.crawl.failed_24h > 0} />
                        <MiniStat label="آیتم در انتظار" value={data.crawl.queued_items} />
                        <MiniStat label="آیتم متوقف" value={data.crawl.stuck_items} danger={data.crawl.stuck_items > 0} />
                    </div>
                </section>

                <section className="ops-panel">
                    <SectionHeading eyebrow="Runtime" title="محیط اجرا" description="نسخه PHP، محیط، Timezone و افزونه‌های ضروری" />
                    <div className="ops-runtime-list">
                        <InfoRow label="PHP" value={data.runtime.php_version} />
                        <InfoRow label="Environment" value={data.runtime.app_env} />
                        <InfoRow label="Debug" value={data.runtime.debug_enabled ? "فعال" : "غیرفعال"} danger={data.runtime.app_env === "production" && data.runtime.debug_enabled} />
                        <InfoRow label="Timezone" value={data.runtime.timezone} />
                        <InfoRow label="Memory Limit" value={data.runtime.memory_limit} />
                    </div>
                    <div className="ops-extension-list">
                        {Object.entries(data.runtime.extensions).map(([name, enabled]) => (
                            <span className={enabled ? "is-enabled" : "is-disabled"} key={name}>{name}</span>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}

function JobsTab({ jobs, actionId, onRetry }: { jobs: CrawlJob[]; actionId: string | null; onRetry: (job: CrawlJob) => void }) {
    return (
        <section className="ops-panel ops-table-panel">
            <SectionHeading eyebrow="Crawl jobs" title="آخرین اجراهای خزش" description="Retry برای اجراهای ناموفق یا لغوشده بدون ساخت Job تکراری فعال است." />
            {jobs.length ? (
                <div className="ops-table-scroll">
                    <table className="ops-table">
                        <thead><tr><th>شناسه</th><th>مشتری / سایت</th><th>وضعیت</th><th>پیشرفت</th><th>آخرین فعالیت</th><th>خطا</th><th>عملیات</th></tr></thead>
                        <tbody>{jobs.map((job) => (
                            <tr className={job.is_stale ? "is-stale" : ""} key={job.id}>
                                <td><code>#{numberFormatter.format(job.id)}</code></td>
                                <td><strong>{job.tenant_name}</strong><span>{job.site_name} · {job.site_domain}</span></td>
                                <td><StatusPill status={job.is_stale ? "degraded" : job.status === "completed" ? "healthy" : job.status === "failed" ? "critical" : job.status === "cancelled" ? "warning" : job.status === "running" ? "healthy" : "idle"} label={crawlStatusLabel(job.status, job.is_stale)} /></td>
                                <td><div className="ops-progress"><span style={{ width: `${Math.max(0, Math.min(100, job.progress_percent))}%` }} /></div><small>{numberFormatter.format(job.processed_urls)} از {numberFormatter.format(job.total_urls || 0)}</small></td>
                                <td>{formatRelative(job.last_activity_at || job.created_at)}</td>
                                <td><span className="ops-table-message">{job.error_message || job.current_message || "—"}</span></td>
                                <td>{job.can_retry ? <button className="ops-action-button" type="button" onClick={() => onRetry(job)} disabled={actionId === `job-${job.id}`}>{actionId === `job-${job.id}` ? "در حال Retry…" : "Retry"}</button> : <span className="ops-muted-dash">—</span>}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            ) : <EmptyState title="هیچ اجرای خزشی ثبت نشده است" description="پس از شروع خزش سایت‌ها، وضعیت Jobها اینجا نمایش داده می‌شود." />}
        </section>
    );
}

function ErrorsTab({ errors, actionId, onToggle }: { errors: ErrorLog[]; actionId: string | null; onToggle: (item: ErrorLog) => void }) {
    return (
        <section className="ops-panel ops-table-panel">
            <SectionHeading eyebrow="Error registry" title="خطاهای تجمیع‌شده PHP و API" description="خطاهای مشابه با Fingerprint یکسان ادغام و تعداد تکرارشان ثبت می‌شود." />
            {errors.length ? <div className="ops-error-list">{errors.map((item) => (
                <article className={`ops-error-card is-${item.level} ${item.resolved_at ? "is-resolved" : ""}`} key={item.id}>
                    <div className="ops-error-card-head">
                        <div><StatusPill status={item.resolved_at ? "healthy" : item.level === "critical" ? "critical" : item.level === "warning" ? "warning" : "degraded"} label={item.resolved_at ? "حل‌شده" : errorLevelLabel(item.level)} /><code>{item.request_method || "PHP"} {item.status_code || ""}</code></div>
                        <span>{numberFormatter.format(item.occurrences)} بار · آخرین: {formatDateTime(item.last_seen_at)}</span>
                    </div>
                    <h3>{item.message}</h3>
                    <p>{item.exception_class || item.source}{item.file_path ? ` · ${shortPath(item.file_path)}${item.line_number ? `:${item.line_number}` : ""}` : ""}</p>
                    {item.request_uri && <code className="ops-error-uri">{item.request_uri}</code>}
                    <div className="ops-error-card-actions">
                        <span>اولین رخداد: {formatDateTime(item.first_seen_at)}</span>
                        <button type="button" onClick={() => onToggle(item)} disabled={actionId === `error-${item.id}`}>
                            {actionId === `error-${item.id}` ? "در حال ثبت…" : item.resolved_at ? "بازکردن مجدد" : "علامت‌گذاری حل‌شده"}
                        </button>
                    </div>
                </article>
            ))}</div> : <EmptyState title="خطایی ثبت نشده است" description="خطاهای Runtime پس از اجرای Migration به‌صورت خودکار در این بخش ثبت می‌شوند." />}
        </section>
    );
}

function RequestsTab({ requests }: { requests: SlowRequest[] }) {
    return (
        <section className="ops-panel ops-table-panel">
            <SectionHeading eyebrow="Performance" title="کندترین درخواست‌های هفت روز اخیر" description="فقط درخواست‌های بالاتر از آستانه REQUEST_LOG_SLOW_MS یا پاسخ‌های 5xx ذخیره می‌شوند." />
            {requests.length ? <div className="ops-table-scroll"><table className="ops-table"><thead><tr><th>زمان</th><th>Method</th><th>مسیر API</th><th>Status</th><th>مدت پاسخ</th><th>Peak Memory</th></tr></thead><tbody>{requests.map((request) => (
                <tr key={request.id}><td>{formatDateTime(request.occurred_at)}</td><td><code>{request.request_method}</code></td><td><code className="ops-request-uri">{request.request_uri}</code></td><td><StatusPill status={request.status_code >= 500 ? "critical" : request.status_code >= 400 ? "warning" : "idle"} label={String(request.status_code)} /></td><td><strong>{oneDecimalFormatter.format(request.duration_ms)} ms</strong></td><td>{formatBytes(request.peak_memory_bytes)}</td></tr>
            ))}</tbody></table></div> : <EmptyState title="درخواست کندی ثبت نشده است" description="این نتیجه خوب است؛ یا هنوز ترافیک کافی برای ارزیابی وجود ندارد." />}
        </section>
    );
}

function MetricCard({ label, value, suffix, hint, tone }: { label: string; value: number; suffix?: string; hint: string; tone: "success" | "warning" | "danger" | "neutral" }) {
    return <article className={`ops-metric is-${tone}`}><span>{label}</span><strong>{oneDecimalFormatter.format(value)}{suffix}</strong><small>{hint}</small></article>;
}
function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
    return <div className="ops-section-heading"><div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div></div>;
}
function ComponentRow({ label, item }: { label: string; item: ComponentHealth }) {
    return <div className="ops-service-row"><span className={`ops-service-dot is-${item.status}`} /><div><strong>{label}</strong><small>{item.message}</small></div><div><StatusPill status={item.status} label={statusLabel(item.status)} />{item.latency_ms !== null && <small>{oneDecimalFormatter.format(item.latency_ms)} ms</small>}</div></div>;
}
function ServiceRow({ service }: { service: ServiceHealth }) {
    return <div className="ops-service-row"><span className={`ops-service-dot is-${service.status}`} /><div><strong>{service.label}</strong><small>{service.message || "بدون پیام"}</small></div><div><StatusPill status={service.status} label={statusLabel(service.status)} />{service.last_seen_at && <small>{formatRelative(service.last_seen_at)}</small>}</div></div>;
}
function InfoRow({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
    return <div className="ops-info-row"><span>{label}</span><strong className={danger ? "is-danger" : ""}>{value}</strong></div>;
}
function MiniStat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
    return <div className={`ops-mini-stat ${danger ? "is-danger" : ""}`}><strong>{numberFormatter.format(value)}</strong><span>{label}</span></div>;
}
function StatusPill({ status, label }: { status: HealthStatus; label: string }) {
    return <span className={`ops-status-pill is-${status}`}>{label}</span>;
}
function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
    return <button className={active ? "is-active" : ""} type="button" onClick={onClick}><span>{label}</span><b>{numberFormatter.format(count)}</b></button>;
}
function EmptyState({ title, description }: { title: string; description: string }) {
    return <div className="ops-empty"><span>✓</span><strong>{title}</strong><p>{description}</p></div>;
}
function OperationsSkeleton() {
    return <div className="ops-skeleton"><div /><section>{Array.from({ length: 4 }).map((_, index) => <span key={index} />)}</section><div /><div /></div>;
}

function statusLabel(status: HealthStatus) {
    const labels: Record<HealthStatus, string> = { healthy: "سالم", warning: "هشدار", critical: "بحرانی", degraded: "ناپایدار", down: "قطع", idle: "آماده", unknown: "نامشخص" };
    return labels[status];
}
function crawlStatusLabel(status: CrawlJob["status"], stale: boolean) {
    if (stale) return "متوقف";
    return { queued: "در صف", running: "در حال اجرا", completed: "موفق", failed: "ناموفق", cancelled: "لغوشده" }[status];
}
function errorLevelLabel(level: ErrorLog["level"]) {
    return { warning: "هشدار", error: "خطا", critical: "بحرانی" }[level];
}
function formatBytes(value: number | null) {
    if (value === null || !Number.isFinite(value)) return "نامشخص";
    if (value < 1024) return `${numberFormatter.format(value)} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let size = value / 1024;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) { size /= 1024; index++; }
    return `${oneDecimalFormatter.format(size)} ${units[index]}`;
}
function parseDate(value: string | null) {
    if (!value) return null;
    const normalized = value.includes("T") ? value : value.replace(" ", "T");
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
}
function formatDateTime(value: string | null) {
    const date = parseDate(value);
    return date ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(date) : "—";
}
function formatRelative(value: string | null) {
    const date = parseDate(value);
    if (!date) return "—";
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return `${numberFormatter.format(seconds)} ثانیه پیش`;
    if (seconds < 3600) return `${numberFormatter.format(Math.floor(seconds / 60))} دقیقه پیش`;
    if (seconds < 86400) return `${numberFormatter.format(Math.floor(seconds / 3600))} ساعت پیش`;
    return formatDateTime(value);
}
function toDateTimeLocal(value: string | null) {
    const date = parseDate(value);
    if (!date) return "";
    const pad = (number: number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function shortPath(value: string) {
    const normalized = value.replace(/\\/g, "/");
    const parts = normalized.split("/");
    return parts.slice(-3).join("/");
}
