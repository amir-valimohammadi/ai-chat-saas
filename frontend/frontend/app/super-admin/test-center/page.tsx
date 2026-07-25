"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiDownload, apiRequest, getAuthUser } from "@/lib/api";

type Profile = "quick" | "full" | "security" | "security_deep" | "operational" | "browser";
type TargetType = "system" | "tenant" | "site";
type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

type TestRun = {
    id: number;
    run_key: string;
    profile: Profile;
    target_type: TargetType;
    target_id: number | null;
    target_label: string | null;
    status: RunStatus;
    total_count: number;
    passed_count: number;
    warning_count: number;
    failed_count: number;
    skipped_count: number;
    score_percent: number | null;
    duration_ms: number | null;
    triggered_by_name: string | null;
    started_at: string | null;
    finished_at: string | null;
    created_at: string;
};

type OverviewResponse = {
    success: true;
    summary: {
        total_runs: number;
        runs_24h: number;
        healthy_runs: number;
        unhealthy_runs: number;
        last_run_at: string | null;
    };
    latest_run: {
        id: number;
        score_percent: number | null;
        passed_count: number;
        warning_count: number;
        failed_count: number;
        finished_at: string | null;
    } | null;
    category_health: Array<{ category: string; failed: number; warnings: number; passed: number }>;
    recent_runs: TestRun[];
    catalog: {
        total: number;
        categories: Record<string, number>;
        profiles: Record<Profile, number>;
    };
    targets: {
        tenants: Array<{ id: number; name: string; status: string }>;
        sites: Array<{ id: number; tenant_id: number; name: string; domain: string; is_active: number; tenant_name: string }>;
    };
    permissions: {
        can_view: boolean;
        can_run_safe: boolean;
        can_run_full: boolean;
        can_run_security: boolean;
        can_run_security_deep: boolean;
        can_view_security_evidence: boolean;
        can_run_operational: boolean;
        can_run_browser: boolean;
        can_view_artifacts: boolean;
        can_cancel_runs: boolean;
        can_export_findings: boolean;
        can_manage_findings: boolean;
    };
    findings_summary: { open_total: number; critical: number; high: number; warnings: number; failed: number };
    top_findings: Array<{ id:number; case_key:string; category:string; title:string; target_label:string|null; test_status:string; severity:string; message:string|null; root_cause:string|null; impact:string|null; remediation:string|null; occurrence_count:number; last_seen_at:string; last_run_id:number }>;
    generated_at: string;
};

const profileMeta: Record<Profile, { title: string; description: string; icon: string; permission: keyof OverviewResponse["permissions"] }> = {
    quick: {
        title: "تست سریع",
        description: "بررسی فوری دیتابیس، Runtime، فضای ذخیره‌سازی، Widget، Secretها و خطاهای بحرانی.",
        icon: "⚡",
        permission: "can_run_safe",
    },
    full: {
        title: "تست کامل",
        description: "بررسی ایمن همه بخش‌های Backend، پیام‌رسان، Visitors، Crawl، Widget و یکپارچگی داده‌ها.",
        icon: "✓",
        permission: "can_run_full",
    },
    operational: {
        title: "تست عملیاتی",
        description: "اجرای واقعی چرخه‌های پیام‌رسان، دپارتمان، Session، فایل و دیتابیس با داده مصنوعی و Rollback کامل.",
        icon: "🧪",
        permission: "can_run_operational",
    },
    security: {
        title: "تست امنیتی",
        description: "کنترل Tenant Isolation، نقش‌ها، نشست‌ها، کلیدها، Upload، ورود موقت و Permissionها.",
        icon: "🛡",
        permission: "can_run_security",
    },
    security_deep: {
        title: "تست امنیت عمیق",
        description: "۴۲ بررسی دفاعی عمیق با Risk Score، OWASP/CWE، تست JWT و Session، جداسازی دو Tenant، Upload و Source Scan.",
        icon: "🔒",
        permission: "can_run_security_deep",
    },
    browser: {
        title: "تست مرورگری و ویجت",
        description: "اجرای Playwright روی صفحات عمومی، پنل مدیر، پنل مشتری، موبایل و ویجت همراه Screenshot، Console، Network و Trace.",
        icon: "🌐",
        permission: "can_run_browser",
    },
};

const categoryLabels: Record<string, string> = {
    runtime: "محیط اجرا",
    database: "دیتابیس",
    storage: "فضا و فایل",
    security: "امنیت",
    api: "API",
    widget: "ویجت",
    messaging: "پیام‌رسان",
    visitors: "بازدیدکنندگان",
    crawl: "خزش",
    operations: "عملیات",
    browser: "مرورگر",
    public: "صفحات عمومی",
    auth: "احراز هویت",
    super_admin: "پنل سوپرادمین",
    customer: "پنل مشتری",
    responsive: "ریسپانسیو",
    ai: "هوش مصنوعی",
};

export default function TestCenterPage() {
    const router = useRouter();
    const [data, setData] = useState<OverviewResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [profile, setProfile] = useState<Profile>("quick");
    const [targetType, setTargetType] = useState<TargetType>("system");
    const [targetId, setTargetId] = useState("");
    const [reason, setReason] = useState("");
    const [password, setPassword] = useState("");
    const [running, setRunning] = useState(false);

    const load = useCallback(async (silent = false) => {
        try {
            setError("");
            silent ? setRefreshing(true) : setLoading(true);
            const response = (await apiRequest("/super-admin/qa-overview.php")) as OverviewResponse;
            setData(response);
        } catch (err) {
            setError(err instanceof Error ? err.message : "دریافت اطلاعات مرکز تست ناموفق بود.");
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
        load();
    }, [load, router]);

    const targetOptions = useMemo(() => {
        if (!data) return [];
        if (targetType === "tenant") {
            return data.targets.tenants.map((item) => ({ value: String(item.id), label: `${item.name} — ${item.status}` }));
        }
        if (targetType === "site") {
            return data.targets.sites.map((item) => ({ value: String(item.id), label: `${item.tenant_name} / ${item.name}${item.domain ? ` — ${item.domain}` : ""}` }));
        }
        return [];
    }, [data, targetType]);

    useEffect(() => {
        setTargetId("");
    }, [targetType]);

    useEffect(() => {
        if (["operational", "browser", "security_deep"].includes(profile)) {
            setTargetType("system");
            setTargetId("");
        }
    }, [profile]);

    async function runTests() {
        if (!data) return;
        if (targetType !== "system" && !targetId) {
            setError("مشتری یا سایت هدف را انتخاب کن.");
            return;
        }
        if (["security", "security_deep", "operational"].includes(profile) && reason.trim().length < 5) {
            setError(`برای ${profileMeta[profile].title}، دلیل اجرا را وارد کن.`);
            return;
        }
        if (["security", "security_deep", "operational"].includes(profile) && !password) {
            setError(`برای ${profileMeta[profile].title}، رمز فعلی مدیر لازم است.`);
            return;
        }

        const confirmed = window.confirm(
            profile === "security_deep"
                ? "تست امنیت عمیق اجرا شود؟ تست‌ها دفاعی، کنترل‌شده و روی داده مصنوعی هستند و نتیجه با Risk Score و OWASP ثبت می‌شود."
                : profile === "security"
                ? "تست امنیتی ایمن اجرا شود؟ این عملیات داده واقعی را تغییر نمی‌دهد اما در Audit Log ثبت می‌شود."
                : profile === "operational"
                    ? "تست عملیاتی با داده مصنوعی و Rollback اجرا شود؟ همه عملیات در Audit Log ثبت می‌شوند."
                    : profile === "browser"
                        ? "تست مرورگری Playwright اجرا شود؟ یک Tenant مصنوعی موقت ساخته و بعد از تست پاک می‌شود."
                : `${profileMeta[profile].title} روی ${targetType === "system" ? "کل سامانه" : "هدف انتخاب‌شده"} اجرا شود؟`
        );
        if (!confirmed) return;

        try {
            setRunning(true);
            setError("");
            const response = await apiRequest("/super-admin/qa-run-create.php", {
                method: "POST",
                body: JSON.stringify({
                    profile,
                    target_type: targetType,
                    target_id: targetType === "system" ? null : Number(targetId),
                    reason: reason.trim() || null,
                    current_password: ["security", "security_deep", "operational"].includes(profile) ? password : undefined,
                }),
            });
            router.push(`/super-admin/test-center/runs/${response.run_id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "اجرای تست ناموفق بود.");
        } finally {
            setRunning(false);
            setPassword("");
        }
    }

    if (loading) {
        return (
            <AppShell title="مرکز جامع تست">
                <div className="qa-loading-card">در حال آماده‌سازی مرکز تست…</div>
            </AppShell>
        );
    }

    return (
        <AppShell title="مرکز جامع تست">
            <main className="qa-center-page">
                <header className="qa-hero">
                    <div>
                        <span className="qa-kicker">ADMIN QA CENTER</span>
                        <h1>تست سلامت، امنیت و یکپارچگی سامانه</h1>
                        <p>تست‌های ایمن را روی کل پلتفرم، یک مشتری یا یک سایت اجرا کن و نتیجه هر مورد را همراه با راهکار رفع خطا ببین.</p>
                    </div>
                    <div className="qa-hero-actions">
                        {data?.permissions.can_view_security_evidence && <button className="qa-secondary-button" onClick={() => router.push("/super-admin/test-center/security")}>داشبورد امنیت عمیق</button>}
                        <button className="qa-secondary-button" disabled={refreshing} onClick={() => load(true)}>
                            {refreshing ? "در حال بروزرسانی…" : "بروزرسانی"}
                        </button>
                    </div>
                </header>

                {error && <div className="qa-alert qa-alert-error">{error}</div>}

                <section className="qa-summary-grid">
                    <article><span>امتیاز آخرین تست</span><strong>{data?.latest_run?.score_percent ?? "—"}{data?.latest_run?.score_percent != null ? "%" : ""}</strong><small>{data?.latest_run?.finished_at ? formatDate(data.latest_run.finished_at) : "هنوز تستی اجرا نشده"}</small></article>
                    <article><span>تست‌های ۲۴ ساعت</span><strong>{formatNumber(data?.summary.runs_24h ?? 0)}</strong><small>از مجموع {formatNumber(data?.summary.total_runs ?? 0)} اجرا</small></article>
                    <article><span>اجرای سالم</span><strong className="qa-text-success">{formatNumber(data?.summary.healthy_runs ?? 0)}</strong><small>بدون مورد ناموفق</small></article>
                    <article><span>نیازمند بررسی</span><strong className="qa-text-danger">{formatNumber(data?.summary.unhealthy_runs ?? 0)}</strong><small>دارای Fail یا Error</small></article>
                </section>

                <section className="qa-findings-overview">
                    <div className="qa-findings-copy">
                        <span className="qa-kicker">ISSUES & WARNINGS</span>
                        <h2>خروجی ایرادات و هشدارها</h2>
                        <p>تمام مشکلات همراه با دلیل احتمالی، اثر، مقدار فعلی، شواهد فنی و راهکار رفع نگهداری می‌شوند.</p>
                        <div className="qa-findings-actions">
                            <button className="qa-primary-button" onClick={() => router.push("/super-admin/test-center/findings")}>مشاهده و مدیریت ایرادات</button>
                            <button className="qa-secondary-button" disabled={!data?.permissions.can_export_findings} onClick={() => apiDownload("/super-admin/qa-findings-export.php?scope=open&format=csv", "qa-open-findings.csv").catch((err) => setError(err instanceof Error ? err.message : "دانلود خروجی ناموفق بود."))}>خروجی CSV</button>
                            <button className="qa-secondary-button" disabled={!data?.permissions.can_export_findings} onClick={() => apiDownload("/super-admin/qa-findings-export.php?scope=open&format=json", "qa-open-findings.json").catch((err) => setError(err instanceof Error ? err.message : "دانلود خروجی ناموفق بود."))}>خروجی JSON</button>
                        </div>
                    </div>
                    <div className="qa-findings-stats">
                        <article><span>باز</span><strong>{formatNumber(data?.findings_summary.open_total ?? 0)}</strong></article>
                        <article><span>بحرانی</span><strong className="qa-text-danger">{formatNumber(data?.findings_summary.critical ?? 0)}</strong></article>
                        <article><span>شدت بالا</span><strong className="qa-text-danger">{formatNumber(data?.findings_summary.high ?? 0)}</strong></article>
                        <article><span>هشدار</span><strong className="qa-text-warning">{formatNumber(data?.findings_summary.warnings ?? 0)}</strong></article>
                    </div>
                    {(data?.top_findings ?? []).length > 0 && <div className="qa-findings-preview">
                        {(data?.top_findings ?? []).slice(0,4).map((finding) => <button key={finding.id} onClick={() => router.push(`/super-admin/test-center/findings?focus=${finding.id}`)}>
                            <span className={`qa-finding-severity is-${finding.severity}`}>{finding.severity}</span>
                            <div><strong>{finding.title}</strong><small>{finding.target_label || "کل سامانه"} · {formatNumber(finding.occurrence_count)} بار</small></div>
                        </button>)}
                    </div>}
                </section>

                <section className="qa-run-panel">
                    <div className="qa-section-heading">
                        <div><h2>اجرای تست جدید</h2><p>پروفایل و محدوده تست را انتخاب کن.</p></div>
                        <span>{formatNumber(data?.catalog.total ?? 0)} تست ایمن در کاتالوگ</span>
                    </div>

                    <div className="qa-profile-grid">
                        {(Object.keys(profileMeta) as Profile[]).map((key) => {
                            const meta = profileMeta[key];
                            const allowed = Boolean(data?.permissions[meta.permission]);
                            return (
                                <button key={key} type="button" disabled={!allowed} className={`qa-profile-card ${profile === key ? "is-selected" : ""}`} onClick={() => setProfile(key)}>
                                    <span className="qa-profile-icon">{meta.icon}</span>
                                    <strong>{meta.title}</strong>
                                    <p>{meta.description}</p>
                                    <small>{formatNumber(data?.catalog.profiles[key] ?? 0)} مورد</small>
                                    {!allowed && <em>بدون مجوز اجرا</em>}
                                </button>
                            );
                        })}
                    </div>

                    <div className="qa-run-form">
                        <label>
                            <span>محدوده تست</span>
                            <select value={targetType} disabled={profile === "operational"} onChange={(event) => setTargetType(event.target.value as TargetType)}>
                                <option value="system">کل سامانه</option>
                                <option value="tenant">یک مشتری مشخص</option>
                                <option value="site">یک سایت مشخص</option>
                            </select>
                            {profile === "operational" && <small>تست عملیاتی فعلاً فقط روی هسته کل سامانه و داده مصنوعی اجرا می‌شود.</small>}
                        </label>

                        {targetType !== "system" && (
                            <label className="qa-form-wide">
                                <span>{targetType === "tenant" ? "انتخاب مشتری" : "انتخاب سایت"}</span>
                                <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                                    <option value="">انتخاب کن…</option>
                                    {targetOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                                </select>
                            </label>
                        )}

                        {["security", "operational"].includes(profile) && (
                            <>
                                <label className="qa-form-wide">
                                    <span>دلیل اجرای تست حساس</span>
                                    <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="مثلاً بررسی عملیاتی قبل از انتشار نسخه" />
                                </label>
                                <label>
                                    <span>رمز فعلی مدیر</span>
                                    <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
                                </label>
                            </>
                        )}

                        <button className="qa-primary-button" disabled={running} onClick={runTests}>
                            {running ? "در حال اجرای تست‌ها…" : `اجرای ${profileMeta[profile].title}`}
                        </button>
                    </div>
                </section>

                <section className="qa-two-column">
                    <article className="qa-card">
                        <div className="qa-section-heading"><div><h2>پوشش تست‌ها</h2><p>تعداد Test Case در هر دسته</p></div></div>
                        <div className="qa-category-list">
                            {Object.entries(data?.catalog.categories ?? {}).map(([category, count]) => (
                                <div key={category}><span>{categoryLabels[category] ?? category}</span><strong>{formatNumber(Number(count))}</strong></div>
                            ))}
                        </div>
                    </article>
                    <article className="qa-card">
                        <div className="qa-section-heading"><div><h2>وضعیت دسته‌ها</h2><p>بر اساس آخرین اجرای کامل‌شده</p></div></div>
                        <div className="qa-category-list">
                            {(data?.category_health ?? []).length === 0 && <div className="qa-empty-inline">هنوز نتیجه‌ای برای نمایش وجود ندارد.</div>}
                            {(data?.category_health ?? []).map((item) => (
                                <div key={item.category}>
                                    <span>{categoryLabels[item.category] ?? item.category}</span>
                                    <div className="qa-category-counts"><b className="qa-text-success">{formatNumber(item.passed)}</b><b className="qa-text-warning">{formatNumber(item.warnings)}</b><b className="qa-text-danger">{formatNumber(item.failed)}</b></div>
                                </div>
                            ))}
                        </div>
                    </article>
                </section>

                <section className="qa-card">
                    <div className="qa-section-heading">
                        <div><h2>آخرین اجراها</h2><p>تاریخچه تست‌های سامانه</p></div>
                        <button className="qa-link-button" onClick={() => router.push("/super-admin/test-center/runs")}>تاریخچه کامل</button>
                    </div>
                    <div className="qa-table-wrap">
                        <table className="qa-table">
                            <thead><tr><th>اجرا</th><th>پروفایل</th><th>هدف</th><th>نتیجه</th><th>امتیاز</th><th>زمان</th><th></th></tr></thead>
                            <tbody>
                                {(data?.recent_runs ?? []).map((run) => (
                                    <tr key={run.id}>
                                        <td><strong>#{run.id}</strong><small>{run.triggered_by_name || "—"}</small></td>
                                        <td>{profileMeta[run.profile].title}</td>
                                        <td>{run.target_label || "کل سامانه"}</td>
                                        <td><span className={`qa-status qa-status-${runStatusTone(run)}`}>{runStatusLabel(run)}</span><small>{formatNumber(run.passed_count)} موفق، {formatNumber(run.warning_count)} هشدار، {formatNumber(run.failed_count)} ناموفق</small></td>
                                        <td><strong>{run.score_percent ?? "—"}{run.score_percent != null ? "%" : ""}</strong></td>
                                        <td>{formatDate(run.created_at)}<small>{run.duration_ms != null ? `${formatNumber(run.duration_ms)} ms` : "—"}</small></td>
                                        <td><button className="qa-link-button" onClick={() => router.push(`/super-admin/test-center/runs/${run.id}`)}>جزئیات</button></td>
                                    </tr>
                                ))}
                                {(data?.recent_runs ?? []).length === 0 && <tr><td colSpan={7}><div className="qa-empty-table">هنوز تستی اجرا نشده است.</div></td></tr>}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>
        </AppShell>
    );
}

function formatNumber(value: number) { return new Intl.NumberFormat("fa-IR").format(value); }
function formatDate(value: string) { try { return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value.replace(" ", "T"))); } catch { return value; } }
function runStatusTone(run: TestRun) { if (run.status !== "completed") return run.status; if (run.failed_count > 0) return "failed"; if (run.warning_count > 0) return "warning"; return "passed"; }
function runStatusLabel(run: TestRun) { const tone = runStatusTone(run); return ({ passed: "سالم", warning: "دارای هشدار", failed: "ناموفق", queued: "در صف", running: "در حال اجرا", cancelled: "لغوشده" } as Record<string, string>)[tone] ?? tone; }
