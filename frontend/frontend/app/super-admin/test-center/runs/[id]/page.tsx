"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiDownload, apiRequest, getAuthUser } from "@/lib/api";

type ItemStatus = "passed" | "warning" | "failed" | "skipped" | "error";
type Run = {
    id: number; profile: "quick" | "full" | "security" | "security_deep" | "operational" | "browser"; target_label: string | null; status: string;
    total_count: number; passed_count: number; warning_count: number; failed_count: number; skipped_count: number;
    score_percent: number | null; duration_ms: number | null; progress_percent: number; current_case_key: string | null; heartbeat_at: string | null; cancel_requested_at: string | null; error_message?: string | null; environment: string | null; reason: string | null;
    triggered_by_name: string | null; started_at: string | null; finished_at: string | null; created_at: string;
};
type Artifact = {
    id: number; run_id: number; run_item_id: number | null; artifact_type: "screenshot" | "trace" | "console" | "network" | "video" | "html" | "json" | "log";
    display_name: string; mime_type: string | null; size_bytes: number; metadata: unknown; created_at: string;
};

type Item = {
    id: number; case_key: string; category: string; title: string; description: string | null; status: ItemStatus;
    severity: "info" | "low" | "medium" | "high" | "critical"; duration_ms: number; message: string | null; root_cause: string | null; impact: string | null;
    expected_value: string | null; actual_value: string | null; remediation: string | null; details: unknown; evidence: unknown;
    risk_score: number | null; confidence: "low" | "medium" | "high" | "confirmed" | null; owasp_category: string | null; cwe_id: string | null;
    affected_component: string | null; verification_mode: "static" | "runtime" | "database" | "configuration" | "hybrid" | null;
};

const categoryLabels: Record<string, string> = { runtime:"محیط اجرا",database:"دیتابیس",storage:"فضا و فایل",security:"امنیت",api:"API",widget:"ویجت",messaging:"پیام‌رسان",visitors:"بازدیدکنندگان",crawl:"خزش",operations:"عملیات",browser:"مرورگر",public:"صفحات عمومی",auth:"احراز هویت",super_admin:"پنل سوپرادمین",customer:"پنل مشتری",responsive:"ریسپانسیو",ai:"هوش مصنوعی" };
const statusLabels: Record<ItemStatus, string> = { passed:"موفق",warning:"هشدار",failed:"ناموفق",skipped:"اجرانشده",error:"خطای اجرا" };

export default function TestRunDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const runId = Number(params.id);
    const [run, setRun] = useState<Run | null>(null);
    const [items, setItems] = useState<Item[]>([]);
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | ItemStatus>("all");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [rerunning, setRerunning] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [startingWorker, setStartingWorker] = useState(false);

    const load = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            setError("");
            const response = await apiRequest(`/super-admin/qa-run-show.php?id=${runId}`);
            setRun(response.run); setItems(response.items ?? []); setArtifacts(response.artifacts ?? []);
        } catch (err) { setError(err instanceof Error ? err.message : "دریافت نتیجه تست ناموفق بود."); }
        finally { if (!silent) setLoading(false); }
    }, [runId]);

    useEffect(() => {
        const user = getAuthUser() as { role?: string } | null;
        if (!user) { router.push("/login"); return; }
        if (user.role !== "super_admin") { router.push("/dashboard"); return; }
        if (!Number.isFinite(runId) || runId < 1) { router.push("/super-admin/test-center"); return; }
        load();
    }, [load, router, runId]);

    useEffect(() => {
        if (!run || !["queued", "running"].includes(run.status)) return;
        const timer = window.setInterval(() => load(true), 2000);
        return () => window.clearInterval(timer);
    }, [load, run?.status]);

    const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category))).sort(), [items]);
    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return items.filter((item) => {
            if (statusFilter !== "all" && item.status !== statusFilter) return false;
            if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
            if (query && !`${item.title} ${item.case_key} ${item.message ?? ""}`.toLowerCase().includes(query)) return false;
            return true;
        });
    }, [items, statusFilter, categoryFilter, search]);

    async function startWorker() {
        if (!run || run.profile !== "browser" || run.status !== "queued") return;
        try {
            setStartingWorker(true); setError("");
            await apiRequest("/super-admin/qa-browser-run-start.php", { method: "POST", body: JSON.stringify({ run_id: run.id }) });
            await load(true);
        } catch (err) { setError(err instanceof Error ? err.message : "شروع Worker ناموفق بود."); }
        finally { setStartingWorker(false); }
    }

    async function cancelRun() {
        if (!run || !["queued", "running"].includes(run.status)) return;
        if (!window.confirm("اجرای تست مرورگری متوقف شود؟")) return;
        try {
            setCancelling(true); setError("");
            await apiRequest("/super-admin/qa-browser-run-cancel.php", { method: "POST", body: JSON.stringify({ run_id: run.id }) });
            await load(true);
        } catch (err) { setError(err instanceof Error ? err.message : "ثبت درخواست لغو ناموفق بود."); }
        finally { setCancelling(false); }
    }

    async function rerunFailed() {
        if (!run) return;
        let currentPassword: string | undefined;
        if (["security", "security_deep", "operational"].includes(run.profile)) {
            currentPassword = window.prompt("برای اجرای مجدد تست حساس، رمز فعلی مدیر را وارد کن:") || undefined;
            if (!currentPassword) return;
        }
        try {
            setRerunning(true); setError("");
            const response = await apiRequest("/super-admin/qa-run-rerun-failed.php", { method:"POST", body:JSON.stringify({ source_run_id:run.id, current_password:currentPassword }) });
            router.push(`/super-admin/test-center/runs/${response.run_id}`);
        } catch (err) { setError(err instanceof Error ? err.message : "اجرای مجدد ناموفق بود."); }
        finally { setRerunning(false); }
    }

    if (loading) return <AppShell title="نتیجه تست"><div className="qa-loading-card">در حال دریافت گزارش تست…</div></AppShell>;

    return (
        <AppShell title={`نتیجه تست #${runId}`}>
            <main className="qa-run-detail-page">
                <div className="qa-detail-actions">
                    <button className="qa-secondary-button" onClick={() => router.push("/super-admin/test-center")}>بازگشت به مرکز تست</button>
                    <div className="qa-detail-export-actions">
                        <button className="qa-secondary-button" disabled={!run || (run.failed_count === 0 && run.warning_count === 0)} onClick={() => apiDownload(`/super-admin/qa-findings-export.php?scope=run&run_id=${runId}&format=csv`, `qa-run-${runId}-issues.csv`).catch((err) => setError(err instanceof Error ? err.message : "دانلود خروجی ناموفق بود."))}>خروجی ایرادات CSV</button>
                        <button className="qa-secondary-button" disabled={!run || (run.failed_count === 0 && run.warning_count === 0)} onClick={() => apiDownload(`/super-admin/qa-findings-export.php?scope=run&run_id=${runId}&format=json`, `qa-run-${runId}-issues.json`).catch((err) => setError(err instanceof Error ? err.message : "دانلود خروجی ناموفق بود."))}>خروجی JSON</button>
                        <button className="qa-primary-button" disabled={rerunning || !run || ["queued","running"].includes(run.status) || (run.failed_count === 0 && run.warning_count === 0)} onClick={rerunFailed}>{rerunning ? "در حال اجرا…" : "اجرای مجدد خطاها و هشدارها"}</button>{run?.profile === "browser" && run.status === "queued" && <button className="qa-secondary-button" disabled={startingWorker} onClick={startWorker}>{startingWorker ? "در حال شروع…" : "شروع مجدد Worker"}</button>}{run?.profile === "browser" && ["queued","running"].includes(run.status) && <button className="qa-danger-button" disabled={cancelling || Boolean(run.cancel_requested_at)} onClick={cancelRun}>{run.cancel_requested_at ? "درخواست لغو ثبت شد" : cancelling ? "در حال ثبت…" : "لغو تست مرورگری"}</button>}
                    </div>
                </div>
                {error && <div className="qa-alert qa-alert-error">{error}</div>}
                {run && (
                    <>
                        <section className="qa-run-hero">
                            <div className={`qa-score-ring ${run.failed_count > 0 ? "is-danger" : run.warning_count > 0 ? "is-warning" : "is-success"}`}><strong>{run.score_percent ?? 0}%</strong><span>امتیاز سلامت</span></div>
                            <div><span className="qa-kicker">TEST RUN #{run.id}</span><h1>{profileLabel(run.profile)} — {run.target_label || "کل سامانه"}</h1><p>{run.reason || "اجرای تست ایمن و بدون تغییر داده‌های واقعی"}</p><div className="qa-run-meta"><span>اجراکننده: {run.triggered_by_name || "—"}</span><span>محیط: {run.environment || "—"}</span><span>مدت: {formatNumber(run.duration_ms ?? 0)} ms</span><span>{formatDate(run.created_at)}</span></div></div>
                        </section>
                        {run.profile === "browser" && ["queued", "running"].includes(run.status) && <section className="qa-browser-progress-card">
                            <div><strong>{run.status === "queued" ? "در صف اجرای Playwright" : "تست مرورگری در حال اجراست"}</strong><span>{run.current_case_key || "آماده‌سازی محیط مصنوعی و مرورگر"}</span></div>
                            <div className="qa-browser-progress-track"><i style={{ width: `${Math.max(2, Number(run.progress_percent || 0))}%` }} /></div>
                            <b>{Math.round(Number(run.progress_percent || 0))}%</b>
                        </section>}
                        <section className="qa-summary-grid qa-detail-summary">
                            <article><span>کل تست‌ها</span><strong>{formatNumber(run.total_count)}</strong></article>
                            <article><span>موفق</span><strong className="qa-text-success">{formatNumber(run.passed_count)}</strong></article>
                            <article><span>هشدار</span><strong className="qa-text-warning">{formatNumber(run.warning_count)}</strong></article>
                            <article><span>ناموفق</span><strong className="qa-text-danger">{formatNumber(run.failed_count)}</strong></article>
                            <article><span>اجرانشده</span><strong>{formatNumber(run.skipped_count)}</strong></article>
                        </section>
                    </>
                )}
                <section className="qa-card">
                    <div className="qa-filter-bar">
                        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جست‌وجو در عنوان، کلید یا پیام تست…" />
                        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">همه وضعیت‌ها</option>{Object.entries(statusLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>
                        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">همه دسته‌ها</option>{categories.map((category) => <option key={category} value={category}>{categoryLabels[category] ?? category}</option>)}</select>
                        <span>{formatNumber(filtered.length)} نتیجه</span>
                    </div>
                </section>
                <section className="qa-result-list">
                    {filtered.map((item) => (
                        <article key={item.id} className={`qa-result-card qa-result-${item.status}`}>
                            <div className="qa-result-status"><span>{statusIcon(item.status)}</span><strong>{statusLabels[item.status]}</strong><small>{item.severity}</small></div>
                            <div className="qa-result-content">
                                <div className="qa-result-title"><div><span>{categoryLabels[item.category] ?? item.category}</span><h2>{item.title}</h2><code>{item.case_key}</code></div><small>{formatNumber(item.duration_ms)} ms</small></div>
                                {item.description && <p className="qa-result-description">{item.description}</p>}
                                {item.message && <div className="qa-result-message">{item.message}</div>}
                                {(item.risk_score != null || item.owasp_category || item.cwe_id || item.affected_component || item.verification_mode) && <div className="qa-security-meta-row">
                                    {item.risk_score != null && <span className={`qa-risk-badge ${item.risk_score >= 8 ? "is-critical" : item.risk_score >= 5 ? "is-high" : "is-medium"}`}>ریسک {item.risk_score}/10</span>}
                                    {item.confidence && <span>اطمینان: {securityConfidenceLabel(item.confidence)}</span>}
                                    {item.owasp_category && <span>{item.owasp_category}</span>}
                                    {item.cwe_id && <span>{item.cwe_id}</span>}
                                    {item.affected_component && <span>بخش: {item.affected_component}</span>}
                                    {item.verification_mode && <span>روش: {securityModeLabel(item.verification_mode)}</span>}
                                </div>}
                                {(item.root_cause || item.impact) && <div className="qa-diagnosis-grid">
                                    <div><strong>دلیل احتمالی</strong><p>{item.root_cause || "برای این مورد دلیل اختصاصی ثبت نشده است."}</p></div>
                                    <div><strong>اثر و ریسک</strong><p>{item.impact || "اثر مستقیم ثبت نشده است."}</p></div>
                                </div>}
                                {(item.expected_value || item.actual_value) && <div className="qa-value-grid"><div><span>انتظار</span><pre>{item.expected_value || "—"}</pre></div><div><span>مقدار فعلی</span><pre>{item.actual_value || "—"}</pre></div></div>}
                                {item.remediation && <div className="qa-remediation"><strong>راهکار پیشنهادی</strong><p>{item.remediation}</p></div>}
                                {(item.evidence != null || item.details != null) && <details className="qa-details-json"><summary>شواهد و جزئیات فنی</summary><pre>{JSON.stringify(item.evidence ?? item.details, null, 2)}</pre></details>}
                            </div>
                        </article>
                    ))}
                    {filtered.length === 0 && <div className="qa-empty-table">نتیجه‌ای با فیلتر فعلی پیدا نشد.</div>}
                </section>
                {artifacts.length > 0 && <section className="qa-card qa-artifacts-card">
                    <div className="qa-section-heading"><div><span className="qa-kicker">BROWSER ARTIFACTS</span><h2>خروجی‌های مرورگر</h2><p>Screenshot، Trace، Console و Network برای تحلیل خطاها.</p></div><strong>{formatNumber(artifacts.length)} فایل</strong></div>
                    <div className="qa-artifact-grid">{artifacts.map((artifact) => <article key={artifact.id}><span className={`qa-artifact-type is-${artifact.artifact_type}`}>{artifact.artifact_type}</span><div><strong>{artifact.display_name}</strong><small>{formatBytes(artifact.size_bytes)} · {formatDate(artifact.created_at)}</small></div><button className="qa-link-button" onClick={() => apiDownload(`/super-admin/qa-artifact-download.php?id=${artifact.id}`, artifact.display_name).catch((err) => setError(err instanceof Error ? err.message : "دانلود فایل ناموفق بود."))}>دانلود</button></article>)}</div>
                </section>}
            </main>
        </AppShell>
    );
}

function formatNumber(value:number){return new Intl.NumberFormat("fa-IR").format(value)}
function formatDate(value:string){try{return new Intl.DateTimeFormat("fa-IR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value.replace(" ","T")))}catch{return value}}
function profileLabel(profile:Run["profile"]){return profile==="quick"?"تست سریع":profile==="full"?"تست کامل":profile==="security_deep"?"تست امنیت عمیق":profile==="operational"?"تست عملیاتی":profile==="browser"?"تست مرورگری و ویجت":"تست امنیتی"}
function statusIcon(status:ItemStatus){return ({passed:"✓",warning:"!",failed:"×",error:"⚠",skipped:"—"} as Record<ItemStatus,string>)[status]}
function formatBytes(value:number){if(!value)return "۰ بایت";const units=["بایت","KB","MB","GB"];const index=Math.min(units.length-1,Math.floor(Math.log(value)/Math.log(1024)));return `${new Intl.NumberFormat("fa-IR",{maximumFractionDigits:1}).format(value/Math.pow(1024,index))} ${units[index]}`;}

function securityConfidenceLabel(value:NonNullable<Item["confidence"]>){return ({low:"کم",medium:"متوسط",high:"زیاد",confirmed:"قطعی"} as const)[value]}
function securityModeLabel(value:NonNullable<Item["verification_mode"]>){return ({static:"اسکن کد",runtime:"اجرای واقعی",database:"دیتابیس",configuration:"تنظیمات",hybrid:"ترکیبی"} as const)[value]}
