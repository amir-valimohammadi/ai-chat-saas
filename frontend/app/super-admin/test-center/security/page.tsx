"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiDownload, apiRequest, getAuthUser } from "@/lib/api";

type SecurityFinding = {
    id: number;
    case_key: string;
    title: string;
    severity: "info" | "low" | "medium" | "high" | "critical";
    message: string | null;
    root_cause: string | null;
    impact: string | null;
    remediation: string | null;
    risk_score: number | null;
    confidence: "low" | "medium" | "high" | "confirmed" | null;
    owasp_category: string | null;
    cwe_id: string | null;
    affected_component: string | null;
    verification_mode: "static" | "runtime" | "database" | "configuration" | "hybrid" | null;
    occurrence_count: number;
    last_seen_at: string;
    last_run_id: number;
    target_label: string | null;
};

type SecurityRun = {
    id: number;
    status: string;
    total_count: number;
    passed_count: number;
    warning_count: number;
    failed_count: number;
    score_percent: number | null;
    duration_ms: number | null;
    triggered_by_name: string | null;
    reason: string | null;
    created_at: string;
    finished_at: string | null;
};

type Response = {
    success: true;
    summary: {
        total: number;
        open_total: number;
        critical: number;
        high: number;
        high_risk: number;
        average_risk: number | null;
        last_seen_at: string | null;
        suite_cases: number;
    };
    owasp: Array<{ owasp_category: string; total: number; open_total: number; max_risk: number }>;
    top_findings: SecurityFinding[];
    recent_runs: SecurityRun[];
    permissions: { can_run: boolean; can_export: boolean; can_manage: boolean };
    generated_at: string;
};

const severityLabel = { info: "اطلاعاتی", low: "کم", medium: "متوسط", high: "زیاد", critical: "بحرانی" } as const;
const confidenceLabel = { low: "کم", medium: "متوسط", high: "زیاد", confirmed: "قطعی" } as const;
const modeLabel = { static: "اسکن کد", runtime: "اجرای واقعی", database: "دیتابیس", configuration: "تنظیمات", hybrid: "ترکیبی" } as const;

export default function DeepSecurityDashboardPage() {
    const router = useRouter();
    const [data, setData] = useState<Response | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [running, setRunning] = useState(false);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError("");
            const response = (await apiRequest("/super-admin/qa-security-overview.php")) as Response;
            setData(response);
        } catch (err) {
            setError(err instanceof Error ? err.message : "دریافت داشبورد امنیت ناموفق بود.");
        } finally {
            setLoading(false);
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

    const maxOwasp = useMemo(() => Math.max(1, ...(data?.owasp.map((item) => Number(item.open_total)) ?? [1])), [data]);

    async function runDeepSecurity() {
        if (!data?.permissions.can_run) return;
        const reason = window.prompt("دلیل اجرای تست امنیت عمیق را وارد کن:", "بازبینی دوره‌ای امنیت سامانه");
        if (!reason || reason.trim().length < 5) return;
        const password = window.prompt("رمز فعلی Super Admin را وارد کن:");
        if (!password) return;
        if (!window.confirm("۴۲ تست امنیتی دفاعی روی کل سامانه اجرا شود؟ داده واقعی تغییر نمی‌کند و عملیات Audit می‌شود.")) return;
        try {
            setRunning(true);
            setError("");
            const response = await apiRequest("/super-admin/qa-run-create.php", {
                method: "POST",
                body: JSON.stringify({
                    profile: "security_deep",
                    target_type: "system",
                    target_id: null,
                    reason: reason.trim(),
                    current_password: password,
                }),
            });
            router.push(`/super-admin/test-center/runs/${response.run_id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "اجرای تست امنیت عمیق ناموفق بود.");
        } finally {
            setRunning(false);
        }
    }

    if (loading) {
        return <AppShell title="امنیت عمیق"><div className="qa-loading-card">در حال آماده‌سازی داشبورد امنیت…</div></AppShell>;
    }

    return (
        <AppShell title="امنیت عمیق">
            <main className="qa-security-dashboard">
                <header className="qa-security-hero">
                    <div>
                        <span className="qa-kicker">DEEP SECURITY VERIFICATION</span>
                        <h1>تست امنیت، جداسازی Tenant و کنترل دسترسی</h1>
                        <p>نتیجه بررسی‌های دفاعی را براساس Risk Score، OWASP، CWE، سطح اطمینان و شواهد فنی تحلیل کن.</p>
                    </div>
                    <div className="qa-security-hero-actions">
                        <button className="qa-secondary-button" onClick={() => router.push("/super-admin/test-center")}>مرکز تست</button>
                        <button className="qa-secondary-button" onClick={load}>بروزرسانی</button>
                        <button className="qa-primary-button" disabled={!data?.permissions.can_run || running} onClick={runDeepSecurity}>{running ? "در حال اجرا…" : "اجرای امنیت عمیق"}</button>
                    </div>
                </header>

                {error && <div className="qa-alert qa-alert-error">{error}</div>}

                <section className="qa-security-summary-grid">
                    <article><span>تست‌های Suite</span><strong>{formatNumber(data?.summary.suite_cases ?? 0)}</strong></article>
                    <article><span>مشکلات امنیتی باز</span><strong>{formatNumber(data?.summary.open_total ?? 0)}</strong></article>
                    <article className="is-critical"><span>بحرانی</span><strong>{formatNumber(data?.summary.critical ?? 0)}</strong></article>
                    <article className="is-high"><span>شدت بالا</span><strong>{formatNumber(data?.summary.high ?? 0)}</strong></article>
                    <article><span>ریسک ۷ به بالا</span><strong>{formatNumber(data?.summary.high_risk ?? 0)}</strong></article>
                    <article><span>میانگین Risk</span><strong>{data?.summary.average_risk ?? "—"}<small>/10</small></strong></article>
                </section>

                <section className="qa-security-layout">
                    <article className="qa-card qa-security-owasp-card">
                        <div className="qa-section-heading"><div><span className="qa-kicker">OWASP COVERAGE</span><h2>مشکلات براساس OWASP</h2></div></div>
                        <div className="qa-owasp-list">
                            {(data?.owasp ?? []).map((item) => (
                                <div key={item.owasp_category} className="qa-owasp-row">
                                    <div><strong>{item.owasp_category}</strong><small>{formatNumber(item.open_total)} باز از {formatNumber(item.total)}</small></div>
                                    <div className="qa-owasp-track"><i style={{ width: `${Math.max(3, (Number(item.open_total) / maxOwasp) * 100)}%` }} /></div>
                                    <b>{item.max_risk}/10</b>
                                </div>
                            ))}
                            {(data?.owasp.length ?? 0) === 0 && <div className="qa-empty-table">هنوز نتیجه امنیت عمیق ثبت نشده است.</div>}
                        </div>
                    </article>

                    <article className="qa-card qa-security-actions-card">
                        <div className="qa-section-heading"><div><span className="qa-kicker">SECURITY OUTPUT</span><h2>خروجی و پیگیری</h2></div></div>
                        <button className="qa-secondary-button" onClick={() => router.push("/super-admin/test-center/findings")}>مشاهده رجیستری مشکلات</button>
                        <button className="qa-secondary-button" disabled={!data?.permissions.can_export} onClick={() => apiDownload("/super-admin/qa-findings-export.php?scope=open&security_only=1&format=csv", "security-findings.csv").catch((err) => setError(err instanceof Error ? err.message : "دانلود ناموفق بود."))}>خروجی CSV با OWASP/CWE</button>
                        <button className="qa-secondary-button" disabled={!data?.permissions.can_export} onClick={() => apiDownload("/super-admin/qa-findings-export.php?scope=all&security_only=1&format=json", "security-findings.json").catch((err) => setError(err instanceof Error ? err.message : "دانلود ناموفق بود."))}>خروجی JSON کامل</button>
                        <p>خروجی شامل دلیل، اثر، راهکار، شواهد، Risk Score، Confidence، OWASP و CWE است.</p>
                    </article>
                </section>

                <section className="qa-card">
                    <div className="qa-section-heading"><div><span className="qa-kicker">TOP SECURITY FINDINGS</span><h2>ریسک‌های باز مهم</h2><p>اولویت با Risk بالاتر و Confidence قطعی است.</p></div><strong>{formatNumber(data?.top_findings.length ?? 0)} مورد</strong></div>
                    <div className="qa-security-findings-list">
                        {(data?.top_findings ?? []).map((finding) => (
                            <article key={finding.id} className={`qa-security-finding is-${finding.severity}`}>
                                <div className="qa-security-finding-head">
                                    <div><span className={`qa-risk-badge ${Number(finding.risk_score) >= 8 ? "is-critical" : Number(finding.risk_score) >= 5 ? "is-high" : "is-medium"}`}>ریسک {finding.risk_score ?? 0}/10</span><span>{severityLabel[finding.severity]}</span></div>
                                    <button className="qa-link-button" onClick={() => router.push(`/super-admin/test-center/findings?focus=${finding.id}`)}>جزئیات</button>
                                </div>
                                <h3>{finding.title}</h3>
                                <code>{finding.case_key}</code>
                                <p>{finding.message || "شرح ثبت نشده است."}</p>
                                <div className="qa-security-tags">
                                    {finding.owasp_category && <span>{finding.owasp_category}</span>}
                                    {finding.cwe_id && <span>{finding.cwe_id}</span>}
                                    {finding.confidence && <span>اطمینان {confidenceLabel[finding.confidence]}</span>}
                                    {finding.verification_mode && <span>{modeLabel[finding.verification_mode]}</span>}
                                    {finding.affected_component && <span>{finding.affected_component}</span>}
                                </div>
                                {finding.remediation && <div className="qa-security-remediation"><strong>راهکار</strong><p>{finding.remediation}</p></div>}
                            </article>
                        ))}
                        {(data?.top_findings.length ?? 0) === 0 && <div className="qa-empty-table">مشکل امنیتی باز ثبت نشده است.</div>}
                    </div>
                </section>

                <section className="qa-card">
                    <div className="qa-section-heading"><div><span className="qa-kicker">SECURITY RUN HISTORY</span><h2>اجرای اخیر امنیت عمیق</h2></div></div>
                    <div className="qa-security-run-table">
                        {(data?.recent_runs ?? []).map((run) => (
                            <button key={run.id} onClick={() => router.push(`/super-admin/test-center/runs/${run.id}`)}>
                                <span>#{run.id}</span><strong>{run.score_percent ?? 0}%</strong><span>{formatNumber(run.failed_count)} خطا</span><span>{formatNumber(run.warning_count)} هشدار</span><span>{formatDate(run.created_at)}</span>
                            </button>
                        ))}
                        {(data?.recent_runs.length ?? 0) === 0 && <div className="qa-empty-table">هنوز تست امنیت عمیق اجرا نشده است.</div>}
                    </div>
                </section>
            </main>
        </AppShell>
    );
}

function formatNumber(value: number) { return new Intl.NumberFormat("fa-IR").format(value); }
function formatDate(value: string) { try { return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value.replace(" ", "T"))); } catch { return value; } }
