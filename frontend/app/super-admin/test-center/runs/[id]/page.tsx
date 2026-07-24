"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiDownload, apiRequest, getAuthUser } from "@/lib/api";

type ItemStatus = "passed" | "warning" | "failed" | "skipped" | "error";
type Run = {
    id: number; profile: "quick" | "full" | "security" | "operational"; target_label: string | null; status: string;
    total_count: number; passed_count: number; warning_count: number; failed_count: number; skipped_count: number;
    score_percent: number | null; duration_ms: number | null; environment: string | null; reason: string | null;
    triggered_by_name: string | null; started_at: string | null; finished_at: string | null; created_at: string;
};
type Item = {
    id: number; case_key: string; category: string; title: string; description: string | null; status: ItemStatus;
    severity: "info" | "low" | "medium" | "high" | "critical"; duration_ms: number; message: string | null; root_cause: string | null; impact: string | null;
    expected_value: string | null; actual_value: string | null; remediation: string | null; details: unknown; evidence: unknown;
};

const categoryLabels: Record<string, string> = { runtime:"محیط اجرا",database:"دیتابیس",storage:"فضا و فایل",security:"امنیت",api:"API",widget:"ویجت",messaging:"پیام‌رسان",visitors:"بازدیدکنندگان",crawl:"خزش",operations:"عملیات" };
const statusLabels: Record<ItemStatus, string> = { passed:"موفق",warning:"هشدار",failed:"ناموفق",skipped:"اجرانشده",error:"خطای اجرا" };

export default function TestRunDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const runId = Number(params.id);
    const [run, setRun] = useState<Run | null>(null);
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | ItemStatus>("all");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [rerunning, setRerunning] = useState(false);

    const load = useCallback(async () => {
        try {
            setLoading(true); setError("");
            const response = await apiRequest(`/super-admin/qa-run-show.php?id=${runId}`);
            setRun(response.run); setItems(response.items ?? []);
        } catch (err) { setError(err instanceof Error ? err.message : "دریافت نتیجه تست ناموفق بود."); }
        finally { setLoading(false); }
    }, [runId]);

    useEffect(() => {
        const user = getAuthUser() as { role?: string } | null;
        if (!user) { router.push("/login"); return; }
        if (user.role !== "super_admin") { router.push("/dashboard"); return; }
        if (!Number.isFinite(runId) || runId < 1) { router.push("/super-admin/test-center"); return; }
        load();
    }, [load, router, runId]);

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

    async function rerunFailed() {
        if (!run) return;
        let currentPassword: string | undefined;
        if (["security", "operational"].includes(run.profile)) {
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
                        <button className="qa-primary-button" disabled={rerunning || !run || (run.failed_count === 0 && run.warning_count === 0)} onClick={rerunFailed}>{rerunning ? "در حال اجرا…" : "اجرای مجدد خطاها و هشدارها"}</button>
                    </div>
                </div>
                {error && <div className="qa-alert qa-alert-error">{error}</div>}
                {run && (
                    <>
                        <section className="qa-run-hero">
                            <div className={`qa-score-ring ${run.failed_count > 0 ? "is-danger" : run.warning_count > 0 ? "is-warning" : "is-success"}`}><strong>{run.score_percent ?? 0}%</strong><span>امتیاز سلامت</span></div>
                            <div><span className="qa-kicker">TEST RUN #{run.id}</span><h1>{profileLabel(run.profile)} — {run.target_label || "کل سامانه"}</h1><p>{run.reason || "اجرای تست ایمن و بدون تغییر داده‌های واقعی"}</p><div className="qa-run-meta"><span>اجراکننده: {run.triggered_by_name || "—"}</span><span>محیط: {run.environment || "—"}</span><span>مدت: {formatNumber(run.duration_ms ?? 0)} ms</span><span>{formatDate(run.created_at)}</span></div></div>
                        </section>
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
            </main>
        </AppShell>
    );
}

function formatNumber(value:number){return new Intl.NumberFormat("fa-IR").format(value)}
function formatDate(value:string){try{return new Intl.DateTimeFormat("fa-IR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value.replace(" ","T")))}catch{return value}}
function profileLabel(profile:Run["profile"]){return profile==="quick"?"تست سریع":profile==="full"?"تست کامل":profile==="operational"?"تست عملیاتی":"تست امنیتی"}
function statusIcon(status:ItemStatus){return ({passed:"✓",warning:"!",failed:"×",error:"⚠",skipped:"—"} as Record<ItemStatus,string>)[status]}
