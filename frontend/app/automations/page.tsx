"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type Dictionary = Record<string, string>;
type Site = { id: number; name: string; domain: string };
type Department = { id: number; site_id: number; name: string; color: string };
type Agent = { id: number; name: string; email: string; role: string };
type Conversation = { id: number; status: string; priority: string; visitor_name: string | null; site_name: string };
type Condition = { field: string; operator: string; value: string };
type SlaPauseStatus = "waiting_customer";
type AutomationAction = {
    type: string;
    value?: string;
    message?: string;
    title?: string;
    severity?: string;
    recipient_mode?: string;
    color?: string;
};
type Rule = {
    id: number; site_id: number | null; site_name: string | null; name: string; description: string | null;
    trigger_type: string; match_type: "all" | "any"; conditions: Condition[]; actions: AutomationAction[];
    is_active: boolean; priority: number; cooldown_seconds: number; stop_processing: boolean;
    run_count: number; success_count: number; failure_count: number; last_run_at: string | null;
};
type SlaPolicy = {
    id: number; site_id: number | null; site_name: string | null; name: string;
    first_response_minutes: number; resolution_minutes: number; warning_before_minutes: number;
    breach_priority: string; breach_department_id: number | null; breach_department_name: string | null;
    use_business_hours: boolean; pause_statuses: SlaPauseStatus[];
    is_default: boolean; is_active: boolean; tracked_count: number; warning_count: number; breached_count: number;
};
type ExecutionLog = {
    id: number; rule_id: number | null; site_id: number | null; conversation_id: number | null;
    rule_name: string; trigger_type: string; status: "success" | "failed" | "skipped";
    duration_ms: number; error_message: string | null; created_at: string;
};
type AutomationAlert = {
    id: number; conversation_id: number | null; severity: string; title: string; message: string;
    is_read: boolean; site_name: string | null; created_at: string;
};
type AutomationWorker = {
    status: "healthy" | "stale" | "down" | "never";
    last_seen_at: string | null;
    seconds_ago: number | null;
    message: string | null;
    stale_after_seconds: number;
};
type OverviewData = {
    catalogs: { triggers: Dictionary; conditions: Dictionary; operators: Dictionary; actions: Dictionary };
    stats: { active_rules: number; executions_7d: number; successes_7d: number; failures_7d: number; average_duration_ms: number; open_alerts: number; sla_at_risk: number; sla_breached: number };
    rules: Rule[]; sla_policies: SlaPolicy[]; logs: ExecutionLog[]; alerts: AutomationAlert[];
    worker: AutomationWorker;
    sites: Site[]; departments: Department[]; agents: Agent[]; conversations: Conversation[];
};
type Tab = "overview" | "rules" | "sla" | "history";

const defaultCatalogs: OverviewData["catalogs"] = {
    triggers: {}, conditions: {}, operators: {}, actions: {},
};
const emptyRule = {
    rule_id: 0, site_id: "", name: "", description: "", trigger_type: "visitor_message",
    match_type: "all" as "all" | "any", conditions: [] as Condition[],
    actions: [{ type: "set_priority", value: "high" }] as AutomationAction[],
    is_active: true, priority: 100, cooldown_seconds: 0, stop_processing: false,
};
const emptySla = {
    policy_id: 0, site_id: "", name: "پاسخ‌گویی استاندارد", first_response_minutes: 15,
    resolution_minutes: 1440, warning_before_minutes: 5, breach_priority: "urgent",
    breach_department_id: "", use_business_hours: true,
    pause_statuses: ["waiting_customer"] as SlaPauseStatus[], is_default: true, is_active: true,
};

const statusLabels: Dictionary = {
    new: "جدید", open: "باز", in_progress: "در حال انجام", waiting_customer: "منتظر مشتری",
    follow_up: "پیگیری", pending: "در انتظار", closed: "بسته",
};
const priorityLabels: Dictionary = { low: "کم", normal: "عادی", high: "زیاد", urgent: "فوری" };
const queueLabels: Dictionary = { none: "بدون صف", waiting: "در صف", assigned: "تخصیص‌یافته" };
const slaLabels: Dictionary = { tracking: "در حال پایش", warning: "در آستانه نقض", breached: "نقض‌شده", met: "رعایت‌شده", resolved: "حل‌شده" };
const slaPauseStatusOptions: Array<{ value: SlaPauseStatus; label: string; description: string }> = [
    { value: "waiting_customer", label: "منتظر مشتری", description: "تا زمان پاسخ دوباره مشتری، ساعت SLA متوقف می‌ماند." },
];

export default function AutomationsPage() {
    const router = useRouter();
    const [data, setData] = useState<OverviewData | null>(null);
    const [tab, setTab] = useState<Tab>("overview");
    const [siteFilter, setSiteFilter] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
    const [slaEditorOpen, setSlaEditorOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [runningNow, setRunningNow] = useState(false);
    const [ruleForm, setRuleForm] = useState(emptyRule);
    const [slaForm, setSlaForm] = useState(emptySla);
    const [testConversationId, setTestConversationId] = useState("");
    const [testResult, setTestResult] = useState<{ matched: boolean; conditions: Array<{ field: string; matched: boolean }> } | null>(null);

    const loadData = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            setError("");
            const query = siteFilter ? `?site_id=${encodeURIComponent(siteFilter)}` : "";
            const result = await apiRequest(`/customer/automation-overview.php${query}`, { cache: "no-store" });
            setData(result as OverviewData);
        } catch (err) {
            setError(err instanceof Error ? err.message : "دریافت اطلاعات مرکز اتوماسیون ناموفق بود.");
        } finally {
            setLoading(false);
        }
    }, [siteFilter]);

    useEffect(() => {
        const user = getAuthUser();
        if (!user) { router.push("/login"); return; }
        if (user.role !== "customer_admin") { router.push("/dashboard"); return; }
        loadData();
    }, [loadData, router]);

    useEffect(() => {
        if (!helpOpen && !ruleEditorOpen && !slaEditorOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            setHelpOpen(false);
            setRuleEditorOpen(false);
            setSlaEditorOpen(false);
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [helpOpen, ruleEditorOpen, slaEditorOpen]);

    const catalogs = data?.catalogs || defaultCatalogs;
    const activeRules = useMemo(() => data?.rules.filter((rule) => rule.is_active) || [], [data]);
    const successRate = data?.stats.executions_7d
        ? Math.round((data.stats.successes_7d / data.stats.executions_7d) * 100)
        : 100;

    function notify(message: string) {
        setSuccess(message);
        window.setTimeout(() => setSuccess(""), 3500);
    }

    function openNewRule(template?: "urgent" | "offline" | "idle") {
        let next = { ...emptyRule, conditions: [] as Condition[], actions: [{ type: "set_priority", value: "high" }] as AutomationAction[] };
        if (template === "urgent") next = {
            ...next, name: "تشخیص پیام فوری", description: "گفتگوهای دارای عبارت فوری را برجسته و به مدیر اطلاع می‌دهد.",
            trigger_type: "visitor_message", cooldown_seconds: 900,
            conditions: [{ field: "event.message_text", operator: "contains", value: "فوری" }],
            actions: [
                { type: "set_priority", value: "urgent" },
                { type: "create_alert", title: "پیام فوری مشتری", message: "یک پیام فوری نیازمند بررسی است.", severity: "high", recipient_mode: "admins" },
            ],
        };
        if (template === "offline") next = {
            ...next, name: "پیام خارج از ساعت کاری", description: "در شروع گفتگو، زمان بازگشت تیم را شفاف اعلام می‌کند.",
            trigger_type: "conversation_created", cooldown_seconds: 0,
            conditions: [{ field: "schedule.outside_business_hours", operator: "equals", value: "true" }],
            actions: [{ type: "send_message", message: "پیام شما ثبت شد. تیم پشتیبانی در اولین بازه کاری پاسخ خواهد داد." }],
        };
        if (template === "idle") next = {
            ...next, name: "پیگیری گفتگوی بدون پاسخ", description: "گفتگوهای بدون فعالیت را وارد مرحله پیگیری می‌کند.",
            trigger_type: "scheduled_check", cooldown_seconds: 3600,
            conditions: [
                { field: "metrics.idle_minutes", operator: "greater_than", value: "30" },
                { field: "conversation.status", operator: "not_equals", value: "closed" },
            ],
            actions: [
                { type: "set_status", value: "follow_up" },
                { type: "add_tag", value: "نیازمند پیگیری", color: "#f59e0b" },
            ],
        };
        setRuleForm(next);
        setTestResult(null);
        setRuleEditorOpen(true);
    }

    function editRule(rule: Rule) {
        setRuleForm({
            rule_id: rule.id, site_id: rule.site_id ? String(rule.site_id) : "", name: rule.name,
            description: rule.description || "", trigger_type: rule.trigger_type, match_type: rule.match_type,
            conditions: rule.conditions.map((item) => ({ ...item, value: String(item.value ?? "") })),
            actions: rule.actions.map((item) => ({ ...item })), is_active: rule.is_active,
            priority: rule.priority, cooldown_seconds: rule.cooldown_seconds, stop_processing: rule.stop_processing,
        });
        setTestResult(null);
        setRuleEditorOpen(true);
    }

    async function saveRule(event: FormEvent) {
        event.preventDefault();
        if (!ruleForm.name.trim()) { setError("نام قانون را وارد کنید."); return; }
        try {
            setBusy(true); setError("");
            await apiRequest("/customer/automation-rule-save.php", {
                method: "POST",
                body: JSON.stringify({ ...ruleForm, site_id: ruleForm.site_id ? Number(ruleForm.site_id) : null }),
            });
            setRuleEditorOpen(false); notify("قانون اتوماسیون ذخیره شد."); await loadData(true); setTab("rules");
        } catch (err) { setError(err instanceof Error ? err.message : "ذخیره قانون ناموفق بود."); }
        finally { setBusy(false); }
    }

    async function toggleRule(rule: Rule) {
        try {
            setBusy(true); setError("");
            await apiRequest("/customer/automation-rule-toggle.php", { method: "POST", body: JSON.stringify({ rule_id: rule.id, is_active: !rule.is_active }) });
            await loadData(true); notify(rule.is_active ? "قانون متوقف شد." : "قانون فعال شد.");
        } catch (err) { setError(err instanceof Error ? err.message : "تغییر وضعیت قانون ناموفق بود."); }
        finally { setBusy(false); }
    }

    async function deleteRule(rule: Rule) {
        if (!window.confirm(`قانون «${rule.name}» حذف شود؟ تاریخچه اجرا باقی می‌ماند.`)) return;
        try {
            setBusy(true); setError("");
            await apiRequest("/customer/automation-rule-delete.php", { method: "POST", body: JSON.stringify({ rule_id: rule.id }) });
            await loadData(true); notify("قانون حذف شد.");
        } catch (err) { setError(err instanceof Error ? err.message : "حذف قانون ناموفق بود."); }
        finally { setBusy(false); }
    }

    async function testRule() {
        if (!testConversationId) { setError("یک گفتگو برای شبیه‌سازی انتخاب کنید."); return; }
        try {
            setBusy(true); setError(""); setTestResult(null);
            const result = await apiRequest("/customer/automation-rule-test.php", {
                method: "POST",
                body: JSON.stringify({ ...ruleForm, conversation_id: Number(testConversationId) }),
            });
            setTestResult(result.preview);
        } catch (err) { setError(err instanceof Error ? err.message : "شبیه‌سازی ناموفق بود."); }
        finally { setBusy(false); }
    }

    function openNewSla() {
        setError("");
        setSlaForm({ ...emptySla });
        setSlaEditorOpen(true);
    }

    function editSla(policy: SlaPolicy) {
        setError("");
        setSlaForm({
            policy_id: policy.id, site_id: policy.site_id ? String(policy.site_id) : "", name: policy.name,
            first_response_minutes: policy.first_response_minutes, resolution_minutes: policy.resolution_minutes,
            warning_before_minutes: policy.warning_before_minutes, breach_priority: policy.breach_priority,
            breach_department_id: policy.breach_department_id ? String(policy.breach_department_id) : "",
            use_business_hours: policy.use_business_hours ?? false,
            pause_statuses: Array.isArray(policy.pause_statuses) ? policy.pause_statuses : [],
            is_default: policy.is_default, is_active: policy.is_active,
        });
        setSlaEditorOpen(true);
    }

    async function saveSla(event: FormEvent) {
        event.preventDefault();
        if (slaForm.resolution_minutes < slaForm.first_response_minutes) {
            setError("زمان حل گفتگو نمی‌تواند کمتر از زمان پاسخ اولیه باشد.");
            return;
        }
        if (slaForm.warning_before_minutes >= slaForm.first_response_minutes) {
            setError("زمان هشدار باید کمتر از حد پاسخ اولیه باشد.");
            return;
        }
        try {
            setBusy(true); setError("");
            await apiRequest("/customer/automation-sla-save.php", {
                method: "POST",
                body: JSON.stringify({ ...slaForm, site_id: slaForm.site_id ? Number(slaForm.site_id) : null, breach_department_id: slaForm.breach_department_id ? Number(slaForm.breach_department_id) : null }),
            });
            setSlaEditorOpen(false); await loadData(true); notify("سیاست SLA ذخیره شد."); setTab("sla");
        } catch (err) { setError(err instanceof Error ? err.message : "ذخیره سیاست ناموفق بود."); }
        finally { setBusy(false); }
    }

    async function deleteSla(policy: SlaPolicy) {
        if (!window.confirm(`سیاست «${policy.name}» حذف شود؟`)) return;
        try {
            setBusy(true); setError("");
            const result = await apiRequest("/customer/automation-sla-delete.php", { method: "POST", body: JSON.stringify({ policy_id: policy.id }) });
            await loadData(true); notify(result.message || "سیاست SLA حذف شد.");
        } catch (err) { setError(err instanceof Error ? err.message : "حذف سیاست ناموفق بود."); }
        finally { setBusy(false); }
    }

    async function readAlerts(alertId = 0) {
        try {
            await apiRequest("/customer/automation-alert-read.php", { method: "POST", body: JSON.stringify({ alert_id: alertId || null }) });
            await loadData(true);
        } catch (err) { setError(err instanceof Error ? err.message : "به‌روزرسانی هشدار ناموفق بود."); }
    }

    async function runScheduledNow() {
        try {
            setRunningNow(true);
            setError("");
            const response = await apiRequest("/customer/automation-run.php", { method: "POST", body: "{}" }) as {
                result?: { executed?: number; sla_attached?: number };
            };
            await loadData(true);
            const result = response.result || {};
            notify(`بررسی انجام شد؛ ${result.executed || 0} اقدام اجرا و ${result.sla_attached || 0} گفتگوی جدید وارد پایش SLA شد.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "اجرای بررسی اتوماسیون ناموفق بود.");
        } finally {
            setRunningNow(false);
        }
    }

    function updateCondition(index: number, patch: Partial<Condition>) {
        setRuleForm((current) => ({ ...current, conditions: current.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
    }
    function updateAction(index: number, patch: Partial<AutomationAction>) {
        setRuleForm((current) => ({ ...current, actions: current.actions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
    }

    const headerActions = (
        <div className="automation-header-actions">
            <button className="btn secondary automation-help-button" onClick={() => setHelpOpen(true)}><span>؟</span> راهنمای استفاده</button>
            <select className="input" aria-label="فیلتر سایت" value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)}>
                <option value="">همه سایت‌ها</option>
                {data?.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
            <button className="btn primary" onClick={() => openNewRule()}>+ قانون جدید</button>
        </div>
    );

    return (
        <AppShell title="مرکز اتوماسیون" kicker="Automation Center" description="قوانین هوشمند، کنترل SLA و اجرای خودکار گردش‌کارهای پشتیبانی" actions={headerActions}>
            <div className="automation-shell">
                {error && <div className="error automation-notice"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
                {success && <div className="success automation-notice"><span>{success}</span></div>}

                <nav className="automation-tabs" aria-label="بخش‌های مرکز اتوماسیون">
                    <TabButton value="overview" current={tab} onClick={setTab} label="نمای کلی" count={data?.stats.open_alerts || 0} />
                    <TabButton value="rules" current={tab} onClick={setTab} label="قوانین" count={data?.rules.length || 0} />
                    <TabButton value="sla" current={tab} onClick={setTab} label="SLA" count={data?.sla_policies.length || 0} />
                    <TabButton value="history" current={tab} onClick={setTab} label="تاریخچه اجرا" count={data?.logs.length || 0} />
                </nav>

                {loading ? <AutomationSkeleton /> : !data ? null : (
                    <>
                        {tab === "overview" && <section className="automation-overview">
                            <div className="automation-stat-grid">
                                <StatCard label="قانون فعال" value={data.stats.active_rules} hint={`${data.rules.length} قانون ساخته‌شده`} tone="indigo" />
                                <StatCard label="اجرای ۷ روز اخیر" value={data.stats.executions_7d} hint={`میانگین ${data.stats.average_duration_ms} میلی‌ثانیه`} tone="blue" />
                                <StatCard label="نرخ موفقیت" value={`${successRate}٪`} hint={`${data.stats.failures_7d} اجرای ناموفق`} tone="green" />
                                <StatCard label="SLA در معرض خطر" value={data.stats.sla_at_risk + data.stats.sla_breached} hint={`${data.stats.sla_breached} مورد نقض‌شده`} tone="amber" />
                            </div>

                            <article className={`automation-worker-health status-${data.worker.status}`}>
                                <span className="automation-worker-pulse" />
                                <div>
                                    <small>Automation Worker</small>
                                    <strong>{data.worker.status === "healthy" ? "پردازش زمان‌بندی‌شده فعال است" : data.worker.status === "down" ? "آخرین اجرای Worker ناموفق بوده" : data.worker.status === "stale" ? "Worker مدتی اجرا نشده است" : "Worker هنوز اجرا نشده است"}</strong>
                                    <p>{data.worker.last_seen_at ? `آخرین اجرای زمان‌بندی‌شده: ${formatDate(data.worker.last_seen_at)}` : "برای اجرای قوانین دوره‌ای و SLA باید Worker هر دقیقه اجرا شود."}</p>
                                </div>
                                <button className="btn secondary" type="button" disabled={runningNow} onClick={runScheduledNow}>{runningNow ? "در حال بررسی..." : "اجرای بررسی اکنون"}</button>
                            </article>

                            <div className="automation-dashboard-grid">
                                <article className="automation-panel automation-flow-panel">
                                    <header><div><span>Flow Health</span><h2>گردش‌کارهای فعال</h2></div><button className="btn secondary" onClick={() => setTab("rules")}>مشاهده همه</button></header>
                                    {activeRules.length === 0 ? <EmptyState title="هنوز قانون فعالی ندارید" text="با یک الگوی آماده شروع کنید یا قانون اختصاصی بسازید." action={<button className="btn primary" onClick={() => openNewRule()}>ساخت اولین قانون</button>} /> :
                                        <div className="automation-mini-rule-list">{activeRules.slice(0, 5).map((rule) => <button key={rule.id} onClick={() => editRule(rule)}>
                                            <span className="automation-rule-orb">{rule.conditions.length}</span>
                                            <span><strong>{rule.name}</strong><small>{catalogs.triggers[rule.trigger_type] || rule.trigger_type} · {rule.actions.length} اقدام</small></span>
                                            <b>{rule.run_count}</b>
                                        </button>)}</div>}
                                </article>

                                <article className="automation-panel automation-alert-panel">
                                    <header><div><span>Alerts</span><h2>هشدارهای عملیاتی</h2></div>{data.stats.open_alerts > 0 && <button className="automation-text-button" onClick={() => readAlerts()}>خواندن همه</button>}</header>
                                    {data.alerts.length === 0 ? <EmptyState title="همه‌چیز آرام است" text="هشدار تازه‌ای از اتوماسیون یا SLA وجود ندارد." /> :
                                        <div className="automation-alert-list">{data.alerts.slice(0, 6).map((alert) => <article key={alert.id} className={`severity-${alert.severity} ${alert.is_read ? "is-read" : ""}`}>
                                            <span className="automation-alert-dot" /><div><strong>{alert.title}</strong><p>{alert.message}</p><small>{alert.site_name || "همه سایت‌ها"} · {formatDate(alert.created_at)}</small></div>
                                            {!alert.is_read && <button aria-label="خوانده شد" onClick={() => readAlerts(alert.id)}>✓</button>}
                                        </article>)}</div>}
                                </article>
                            </div>

                            <article className="automation-panel automation-template-panel">
                                <header><div><span>Quick Start</span><h2>شروع سریع با الگوهای کاربردی</h2><p>الگو را انتخاب کنید، جزئیاتش را تغییر دهید و فعالش کنید.</p></div></header>
                                <div className="automation-template-grid">
                                    <TemplateCard icon="⚡" title="پیام فوری" text="تشخیص واژه‌های حساس، افزایش اولویت و هشدار به مدیر" tone="violet" onClick={() => openNewRule("urgent")} />
                                    <TemplateCard icon="☾" title="خارج از ساعت کاری" text="ثبت درخواست و اعلام شفاف زمان پاسخ‌گویی به مشتری" tone="blue" onClick={() => openNewRule("offline")} />
                                    <TemplateCard icon="↻" title="پیگیری خودکار" text="یافتن گفتگوهای راکد، برچسب‌گذاری و ورود به پیگیری" tone="amber" onClick={() => openNewRule("idle")} />
                                </div>
                            </article>
                        </section>}

                        {tab === "rules" && <section className="automation-section">
                            <div className="automation-section-head"><div><span>Rules Engine</span><h2>قوانین اتوماسیون</h2><p>هر قانون از یک رویداد، چند شرط و یک یا چند اقدام ساخته می‌شود.</p></div><button className="btn primary" onClick={() => openNewRule()}>+ ساخت قانون</button></div>
                            {data.rules.length === 0 ? <EmptyState title="قانونی ساخته نشده" text="برای کاهش کارهای تکراری، اولین قانون را بسازید." action={<button className="btn primary" onClick={() => openNewRule()}>قانون جدید</button>} /> :
                                <div className="automation-rule-grid">{data.rules.map((rule) => <article className={`automation-rule-card ${rule.is_active ? "is-active" : "is-paused"}`} key={rule.id}>
                                    <div className="automation-rule-card-top"><div className="automation-rule-state"><span /><b>{rule.is_active ? "فعال" : "متوقف"}</b></div><div className="automation-rule-menu"><button disabled={busy} onClick={() => editRule(rule)}>ویرایش</button><button className="danger-link" disabled={busy} onClick={() => deleteRule(rule)}>حذف</button></div></div>
                                    <div className="automation-rule-title"><span className="automation-rule-orb">{rule.actions.length}</span><div><h3>{rule.name}</h3><p>{rule.description || "بدون توضیح"}</p></div></div>
                                    <div className="automation-flow-line"><span>{catalogs.triggers[rule.trigger_type] || rule.trigger_type}</span><i>←</i><span>{rule.conditions.length ? `${rule.conditions.length} شرط ${rule.match_type === "all" ? "هم‌زمان" : "انتخابی"}` : "بدون شرط"}</span><i>←</i><span>{rule.actions.length} اقدام</span></div>
                                    <div className="automation-rule-meta"><span>{rule.site_name || "همه سایت‌ها"}</span><span>{rule.cooldown_seconds ? `وقفه ${formatDuration(rule.cooldown_seconds)}` : "بدون وقفه"}</span><span>اولویت {rule.priority}</span></div>
                                    <div className="automation-rule-performance"><div><strong>{rule.run_count}</strong><small>اجرا</small></div><div><strong>{rule.success_count}</strong><small>موفق</small></div><div><strong className={rule.failure_count ? "has-error" : ""}>{rule.failure_count}</strong><small>ناموفق</small></div><div><strong>{rule.last_run_at ? formatDate(rule.last_run_at) : "—"}</strong><small>آخرین اجرا</small></div></div>
                                    <button className={`automation-toggle ${rule.is_active ? "on" : ""}`} aria-label={rule.is_active ? "توقف قانون" : "فعال‌سازی قانون"} disabled={busy} onClick={() => toggleRule(rule)}><span /></button>
                                </article>)}</div>}
                        </section>}

                        {tab === "sla" && <section className="automation-section">
                            <div className="automation-section-head"><div><span>Service Level</span><h2>سیاست‌های SLA</h2><p>زمان پاسخ اولیه و حل گفتگو را اندازه‌گیری و پیش از نقض هشدار دریافت کنید.</p></div><button className="btn primary" onClick={openNewSla}>+ سیاست جدید</button></div>
                            {data.sla_policies.length === 0 ? <div className="automation-sla-empty"><div><span>◎</span><h3>هنوز SLA تعریف نشده است</h3><p>با تعریف سیاست، زمان پاسخ و حل هر گفتگوی جدید به‌صورت خودکار پایش می‌شود.</p><button className="btn primary" onClick={openNewSla}>تعریف SLA</button></div><ul><li>هشدار پیش از سررسید</li><li>افزایش خودکار اولویت</li><li>انتقال به دپارتمان تشدید</li><li>تاریخچه دقیق نقض‌ها</li></ul></div> :
                                <div className="automation-sla-grid">{data.sla_policies.map((policy) => <article className={`automation-sla-card ${policy.is_active ? "" : "is-disabled"}`} key={policy.id}>
                                    <header><div><span className="automation-sla-icon">◎</span><div><h3>{policy.name}</h3><p>{policy.site_name || "سیاست سراسری"}</p></div></div><div>{policy.is_default && <b>پیش‌فرض</b>}{!policy.is_active && <b className="disabled">غیرفعال</b>}</div></header>
                                    <div className="automation-sla-times"><div><strong>{formatMinutes(policy.first_response_minutes)}</strong><span>پاسخ اولیه</span></div><i /><div><strong>{formatMinutes(policy.resolution_minutes)}</strong><span>حل گفتگو</span></div></div>
                                    <div className="automation-sla-policy-meta">
                                        <span className={policy.use_business_hours ? "is-smart" : ""}>{policy.use_business_hours ? "◷ تقویم کاری سایت" : "۲۴/۷"}</span>
                                        {policy.use_business_hours && <span>تعطیلات لحاظ می‌شود</span>}
                                        {policy.pause_statuses.includes("waiting_customer") && <span>توقف در انتظار مشتری</span>}
                                    </div>
                                    <div className="automation-sla-health"><span><i className="tracking" />{policy.tracked_count} در حال پایش</span><span><i className="warning" />{policy.warning_count} نزدیک سررسید</span><span><i className="breached" />{policy.breached_count} نقض‌شده</span></div>
                                    <p className="automation-sla-escalation">هشدار {policy.warning_before_minutes} دقیقه قبل · تشدید با اولویت {priorityLabels[policy.breach_priority]}{policy.breach_department_name ? ` · ${policy.breach_department_name}` : ""}</p>
                                    <footer><button className="btn secondary" onClick={() => editSla(policy)}>ویرایش</button><button className="btn danger" onClick={() => deleteSla(policy)}>حذف</button></footer>
                                </article>)}</div>}
                        </section>}

                        {tab === "history" && <section className="automation-section">
                            <div className="automation-section-head"><div><span>Execution Log</span><h2>تاریخچه اجرا</h2><p>ردیابی نتیجه، زمان اجرا و خطاهای هر قانون برای عیب‌یابی دقیق.</p></div><button className="btn secondary" onClick={() => loadData()}>به‌روزرسانی</button></div>
                            <div className="automation-history-card">{data.logs.length === 0 ? <EmptyState title="اجرایی ثبت نشده" text="پس از فعال‌شدن قوانین، نتیجه هر اجرا اینجا دیده می‌شود." /> : <div className="automation-table-wrap"><table><thead><tr><th>نتیجه</th><th>قانون</th><th>رویداد</th><th>گفتگو</th><th>زمان اجرا</th><th>تاریخ</th></tr></thead><tbody>{data.logs.map((log) => <tr key={log.id}><td><span className={`automation-log-status ${log.status}`}>{log.status === "success" ? "موفق" : log.status === "failed" ? "ناموفق" : "ردشده"}</span></td><td><strong>{log.rule_name}</strong>{log.error_message && <small className="automation-log-error">{log.error_message}</small>}</td><td>{catalogs.triggers[log.trigger_type] || log.trigger_type}</td><td>{log.conversation_id ? <Link href={`/conversations/${log.conversation_id}`}>#{log.conversation_id}</Link> : "—"}</td><td>{log.duration_ms} ms</td><td>{formatDate(log.created_at)}</td></tr>)}</tbody></table></div>}</div>
                        </section>}
                    </>
                )}
            </div>

            {helpOpen && <div className="automation-modal-backdrop automation-help-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setHelpOpen(false); }}>
                <section className="automation-help-modal" role="dialog" aria-modal="true" aria-labelledby="automation-help-title">
                    <header>
                        <div><span className="automation-help-badge">راهنمای ساده</span><h2 id="automation-help-title">اتوماسیون چطور کار می‌کند؟</h2><p>اتوماسیون کارهای تکراری پشتیبانی را براساس قانون‌هایی که می‌سازید، خودش انجام می‌دهد.</p></div>
                        <button className="automation-close" onClick={() => setHelpOpen(false)} aria-label="بستن راهنما">×</button>
                    </header>
                    <div className="automation-help-scroll">
                        <div className="automation-help-formula"><span><b>۱</b> وقتی اتفاقی افتاد</span><i>←</i><span><b>۲</b> اگر شرایط درست بود</span><i>←</i><span><b>۳</b> این کار را انجام بده</span></div>

                        <section className="automation-help-section">
                            <h3>سه بخش هر قانون</h3>
                            <div className="automation-help-concepts">
                                <article><span className="tone-purple">رویداد</span><strong>قانون چه زمانی بررسی شود؟</strong><p>مثلاً وقتی مشتری پیام می‌فرستد یا وضعیت گفتگو تغییر می‌کند.</p></article>
                                <article><span className="tone-blue">شرط</span><strong>کدام گفتگوها شامل قانون شوند؟</strong><p>مثلاً متن پیام شامل «فوری» باشد یا گفتگو بیشتر از ۳۰ دقیقه بدون پاسخ مانده باشد.</p></article>
                                <article><span className="tone-green">اقدام</span><strong>سیستم چه کاری انجام دهد؟</strong><p>مثلاً اولویت را تغییر دهد، هشدار بسازد یا گفتگو را به یک دپارتمان منتقل کند.</p></article>
                            </div>
                        </section>

                        <section className="automation-help-section">
                            <h3>چند مثال ساده</h3>
                            <div className="automation-help-examples">
                                <article><span>⚡</span><div><strong>پیام فوری</strong><p>وقتی پیام مشتری شامل «فوری» بود، اولویت گفتگو فوری شود و مدیر هشدار بگیرد.</p></div></article>
                                <article><span>↩</span><div><strong>مشتری دوباره پاسخ داد</strong><p>اگر گفتگو منتظر مشتری بود و مشتری پیام فرستاد، وضعیت به «در حال انجام» برگردد.</p></div></article>
                                <article><span>↻</span><div><strong>گفتگوی راکد</strong><p>اگر بیشتر از ۳۰ دقیقه فعالیتی نبود، گفتگو وارد پیگیری شود و برچسب بگیرد.</p></div></article>
                            </div>
                        </section>

                        <section className="automation-help-section automation-help-tips">
                            <h3>نکته‌های مهم</h3>
                            <ul>
                                <li><b>آزمایش شرط‌ها</b> هیچ تغییری در گفتگو ایجاد نمی‌کند و فقط نتیجه احتمالی را نشان می‌دهد.</li>
                                <li><b>وقفه اجرای مجدد</b> مانع می‌شود یک قانون در فاصله کوتاه چند بار روی یک گفتگو اجرا شود.</li>
                                <li><b>اولویت پردازش</b> مشخص می‌کند کدام قانون زودتر اجرا شود؛ عدد کمتر یعنی اجرای زودتر.</li>
                                <li>اگر قانون را غیرفعال کنید، تنظیماتش باقی می‌ماند اما دیگر اجرا نمی‌شود.</li>
                            </ul>
                        </section>

                        <section className="automation-help-section automation-help-sla">
                            <div><span>◎</span><div><h3>SLA یعنی چه؟</h3><p>SLA مدت زمانی است که تیم برای پاسخ اولیه یا حل گفتگو در نظر می‌گیرد. با «تقویم کاری» فقط ساعت‌های باز سایت شمرده می‌شوند، تعطیلات نادیده گرفته می‌شوند و در وضعیت «منتظر مشتری» زمان حل گفتگو متوقف می‌ماند. مثال: اگر ۳۰ دقیقه از SLA مانده باشد و گفتگو منتظر پاسخ مشتری شود، پس از پاسخ او همان ۳۰ دقیقه ادامه پیدا می‌کند.</p></div></div>
                        </section>
                    </div>
                    <footer><button className="btn primary" onClick={() => setHelpOpen(false)}>متوجه شدم</button></footer>
                </section>
            </div>}

            {ruleEditorOpen && data && <div className="automation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setRuleEditorOpen(false); }}>
                <section className="automation-editor" role="dialog" aria-modal="true" aria-labelledby="automation-rule-title">
                    <header><div><span>Rule Builder</span><h2 id="automation-rule-title">{ruleForm.rule_id ? "ویرایش قانون" : "ساخت قانون جدید"}</h2><p>رویداد شروع را تعیین کنید، شرط‌ها را بسازید و خروجی را انتخاب کنید.</p></div><button className="automation-close" onClick={() => setRuleEditorOpen(false)} aria-label="بستن">×</button></header>
                    <form onSubmit={saveRule}>
                        <div className="automation-editor-scroll">
                            <section className="automation-editor-block"><div className="automation-step-number">۱</div><div className="automation-editor-content"><h3>مشخصات و رویداد شروع</h3><div className="automation-form-grid"><label><span>نام قانون</span><input className="input" required value={ruleForm.name} onChange={(event) => setRuleForm({ ...ruleForm, name: event.target.value })} placeholder="مثلاً تشدید پیام‌های فوری" /></label><label><span>محدوده اجرا</span><select className="input" value={ruleForm.site_id} onChange={(event) => setRuleForm({ ...ruleForm, site_id: event.target.value })}><option value="">همه سایت‌ها</option>{data.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label><label className="automation-span-2"><span>توضیح کوتاه</span><input className="input" value={ruleForm.description} onChange={(event) => setRuleForm({ ...ruleForm, description: event.target.value })} placeholder="این قانون چه کاری انجام می‌دهد؟" /></label><label className="automation-span-2"><span>وقتی این رویداد رخ داد</span><select className="input" value={ruleForm.trigger_type} onChange={(event) => setRuleForm({ ...ruleForm, trigger_type: event.target.value })}>{Object.entries(catalogs.triggers).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></div></section>

                            <section className="automation-editor-block"><div className="automation-step-number">۲</div><div className="automation-editor-content"><div className="automation-editor-title-row"><div><h3>شرط‌ها</h3><p>خالی‌بودن این بخش یعنی قانون برای همه گفتگوها اجرا شود.</p></div><select className="input automation-match-select" value={ruleForm.match_type} onChange={(event) => setRuleForm({ ...ruleForm, match_type: event.target.value as "all" | "any" })}><option value="all">همه شرط‌ها</option><option value="any">حداقل یک شرط</option></select></div><div className="automation-builder-list">{ruleForm.conditions.map((condition, index) => <div className="automation-builder-row" key={`condition-${index}`}><b>اگر</b><select className="input" value={condition.field} onChange={(event) => updateCondition(index, { field: event.target.value })}>{Object.entries(catalogs.conditions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select className="input" value={condition.operator} onChange={(event) => updateCondition(index, { operator: event.target.value })}>{Object.entries(catalogs.operators).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{!['is_empty', 'not_empty'].includes(condition.operator) && <ConditionValue condition={condition} data={data} onChange={(value) => updateCondition(index, { value })} />}<button className="automation-remove" type="button" onClick={() => setRuleForm((current) => ({ ...current, conditions: current.conditions.filter((_, itemIndex) => itemIndex !== index) }))}>×</button></div>)}</div><button className="automation-add-row" type="button" onClick={() => setRuleForm((current) => ({ ...current, conditions: [...current.conditions, { field: "conversation.status", operator: "equals", value: "open" }] }))}>+ افزودن شرط</button></div></section>

                            <section className="automation-editor-block"><div className="automation-step-number">۳</div><div className="automation-editor-content"><h3>اقدام‌ها</h3><p>اقدام‌ها به ترتیب از بالا به پایین اجرا می‌شوند.</p><div className="automation-builder-list">{ruleForm.actions.map((action, index) => <div className="automation-action-row" key={`action-${index}`}><div className="automation-action-head"><b>{index + 1}</b><select className="input" value={action.type} onChange={(event) => updateAction(index, defaultAction(event.target.value))}>{Object.entries(catalogs.actions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="automation-remove" type="button" disabled={ruleForm.actions.length === 1} onClick={() => setRuleForm((current) => ({ ...current, actions: current.actions.filter((_, itemIndex) => itemIndex !== index) }))}>×</button></div><ActionFields action={action} data={data} selectedSiteId={ruleForm.site_id} onChange={(patch) => updateAction(index, patch)} /></div>)}</div><button className="automation-add-row" type="button" onClick={() => setRuleForm((current) => ({ ...current, actions: [...current.actions, { type: "add_internal_note", message: "" }] }))}>+ افزودن اقدام</button></div></section>

                            <section className="automation-editor-block"><div className="automation-step-number">۴</div><div className="automation-editor-content"><h3>کنترل اجرا و آزمایش</h3><div className="automation-form-grid compact"><label><span>اولویت پردازش</span><input className="input" type="number" min={1} max={1000} value={ruleForm.priority} onChange={(event) => setRuleForm({ ...ruleForm, priority: Number(event.target.value) })} /></label><label><span>وقفه اجرای مجدد (ثانیه)</span><input className="input" type="number" min={0} value={ruleForm.cooldown_seconds} onChange={(event) => setRuleForm({ ...ruleForm, cooldown_seconds: Number(event.target.value) })} /></label></div><div className="automation-check-row"><label><input type="checkbox" checked={ruleForm.is_active} onChange={(event) => setRuleForm({ ...ruleForm, is_active: event.target.checked })} /><span><strong>فعال‌سازی پس از ذخیره</strong><small>رویدادهای جدید را پردازش کند.</small></span></label><label><input type="checkbox" checked={ruleForm.stop_processing} onChange={(event) => setRuleForm({ ...ruleForm, stop_processing: event.target.checked })} /><span><strong>توقف قوانین بعدی</strong><small>بعد از موفقیت این قانون ادامه ندهد.</small></span></label></div><div className="automation-test-box"><div><strong>شبیه‌سازی امن</strong><small>فقط شرط‌ها بررسی می‌شوند؛ هیچ اقدامی اجرا نمی‌شود.</small></div><select className="input" value={testConversationId} onChange={(event) => setTestConversationId(event.target.value)}><option value="">انتخاب گفتگوی نمونه</option>{data.conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>#{conversation.id} · {conversation.visitor_name || "کاربر"} · {conversation.site_name}</option>)}</select><button className="btn secondary" type="button" disabled={busy} onClick={testRule}>آزمایش شرط‌ها</button></div>{testResult && <div className={`automation-test-result ${testResult.matched ? "matched" : "not-matched"}`}><strong>{testResult.matched ? "قانون با این گفتگو تطبیق دارد" : "قانون با این گفتگو تطبیق ندارد"}</strong><span>{testResult.conditions.filter((item) => item.matched).length} از {testResult.conditions.length} شرط برقرار است.</span></div>}</div></section>
                        </div>
                        <footer><button className="btn secondary" type="button" onClick={() => setRuleEditorOpen(false)}>انصراف</button><button className="btn primary" disabled={busy}>{busy ? "در حال ذخیره..." : "ذخیره قانون"}</button></footer>
                    </form>
                </section>
            </div>}

            {slaEditorOpen && data && <SmartSlaEditor data={data} form={slaForm} setForm={setSlaForm} busy={busy} error={error} onClose={() => { setSlaEditorOpen(false); setError(""); }} onSubmit={saveSla} />}
        </AppShell>
    );
}

function SmartSlaEditor({
    data,
    form,
    setForm,
    busy,
    error,
    onClose,
    onSubmit,
}: {
    data: OverviewData;
    form: typeof emptySla;
    setForm: React.Dispatch<React.SetStateAction<typeof emptySla>>;
    busy: boolean;
    error: string;
    onClose: () => void;
    onSubmit: (event: FormEvent) => void;
}) {
    const togglePauseStatus = (status: SlaPauseStatus, checked: boolean) => {
        setForm((current) => ({
            ...current,
            pause_statuses: checked
                ? Array.from(new Set([...current.pause_statuses, status]))
                : current.pause_statuses.filter((item) => item !== status),
        }));
    };

    return <div className="automation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
        <section className="automation-editor automation-sla-editor" role="dialog" aria-modal="true" aria-labelledby="automation-sla-title">
            <header>
                <div><span>SLA Policy</span><h2 id="automation-sla-title">{form.policy_id ? "ویرایش سیاست SLA" : "سیاست SLA جدید"}</h2><p>تعهد زمانی تیم، تقویم محاسبه و رفتار ساعت SLA را مشخص کنید.</p></div>
                <button className="automation-close" onClick={onClose} aria-label="بستن">×</button>
            </header>
            <form onSubmit={onSubmit}>
                <div className="automation-editor-scroll">
                    {error && <div className="error automation-editor-error" role="alert">{error}</div>}
                    <div className="automation-form-grid">
                        <label className="automation-span-2"><span>نام سیاست</span><input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
                        <label><span>محدوده سایت</span><select className="input" value={form.site_id} onChange={(event) => setForm({ ...form, site_id: event.target.value, breach_department_id: "" })}><option value="">همه سایت‌ها</option>{data.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
                        <label><span>دپارتمان تشدید</span><select className="input" value={form.breach_department_id} onChange={(event) => setForm({ ...form, breach_department_id: event.target.value })}><option value="">بدون انتقال</option>{data.departments.filter((department) => !form.site_id || department.site_id === Number(form.site_id)).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
                        <label><span>حد پاسخ اولیه (دقیقه)</span><input className="input" type="number" min={1} required value={form.first_response_minutes} onChange={(event) => setForm({ ...form, first_response_minutes: Number(event.target.value) })} /></label>
                        <label><span>حد حل گفتگو (دقیقه)</span><input className="input" type="number" min={form.first_response_minutes} required value={form.resolution_minutes} onChange={(event) => setForm({ ...form, resolution_minutes: Number(event.target.value) })} /></label>
                        <label><span>هشدار چند دقیقه قبل</span><input className="input" type="number" min={0} max={Math.max(0, form.first_response_minutes - 1)} value={form.warning_before_minutes} onChange={(event) => setForm({ ...form, warning_before_minutes: Number(event.target.value) })} /></label>
                        <label><span>اولویت پس از نقض</span><select className="input" value={form.breach_priority} onChange={(event) => setForm({ ...form, breach_priority: event.target.value })}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                    </div>

                    <section className="automation-sla-calculation">
                        <div className="automation-sla-calculation-head"><div><span>محاسبه هوشمند زمان</span><h3>ساعت SLA چه زمانی جلو برود؟</h3></div><Link href="/hosted-support">تنظیم ساعت کاری و تعطیلات ←</Link></div>
                        <label className={`automation-sla-option ${form.use_business_hours ? "is-selected" : ""}`}>
                            <input type="checkbox" checked={form.use_business_hours} onChange={(event) => setForm({ ...form, use_business_hours: event.target.checked })} />
                            <span className="automation-sla-option-icon">◷</span>
                            <span><strong>فقط در ساعت کاری سایت</strong><small>شب‌ها، روزهای بسته و تعطیلات ثبت‌شده از زمان SLA کم نمی‌شوند.</small></span>
                            <b>{form.use_business_hours ? "فعال" : "۲۴/۷"}</b>
                        </label>
                        <p className="automation-schedule-source">{form.site_id ? "تقویم همان سایت برای گفتگوهای جدید استفاده می‌شود." : "در سیاست سراسری، هر گفتگو از تقویم سایت خودش استفاده می‌کند."}</p>
                        <div className="automation-sla-pause-statuses">
                            <div><strong>توقف زمان حل گفتگو</strong><small>پاسخ اولیه متوقف نمی‌شود؛ فقط زمان حل در وضعیت انتخاب‌شده ثابت می‌ماند.</small></div>
                            {slaPauseStatusOptions.map((option) => <label className={form.pause_statuses.includes(option.value) ? "is-selected" : ""} key={option.value}>
                                <input type="checkbox" checked={form.pause_statuses.includes(option.value)} onChange={(event) => togglePauseStatus(option.value, event.target.checked)} />
                                <span><strong>{option.label}</strong><small>{option.description}</small></span>
                            </label>)}
                        </div>
                    </section>

                    <div className="automation-check-row">
                        <label><input type="checkbox" checked={form.is_default} onChange={(event) => setForm({ ...form, is_default: event.target.checked })} /><span><strong>سیاست پیش‌فرض</strong><small>برای گفتگوهای جدید این محدوده</small></span></label>
                        <label><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /><span><strong>فعال</strong><small>پایش گفتگوها انجام شود</small></span></label>
                    </div>
                </div>
                <footer><button className="btn secondary" type="button" onClick={onClose}>انصراف</button><button className="btn primary" disabled={busy}>{busy ? "در حال ذخیره..." : "ذخیره سیاست"}</button></footer>
            </form>
        </section>
    </div>;
}

function TabButton({ value, current, onClick, label, count }: { value: Tab; current: Tab; onClick: (value: Tab) => void; label: string; count: number }) {
    return <button className={current === value ? "active" : ""} onClick={() => onClick(value)}><span>{label}</span>{count > 0 && <b>{count}</b>}</button>;
}
function StatCard({ label, value, hint, tone }: { label: string; value: number | string; hint: string; tone: string }) {
    return <article className={`automation-stat tone-${tone}`}><span className="automation-stat-icon" /><div><small>{label}</small><strong>{value}</strong><p>{hint}</p></div></article>;
}
function TemplateCard({ icon, title, text, tone, onClick }: { icon: string; title: string; text: string; tone: string; onClick: () => void }) {
    return <button className={`automation-template tone-${tone}`} onClick={onClick}><span>{icon}</span><div><strong>{title}</strong><p>{text}</p></div><b>←</b></button>;
}
function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
    return <div className="automation-empty"><span>⌁</span><h3>{title}</h3><p>{text}</p>{action}</div>;
}
function AutomationSkeleton() {
    return <div className="automation-skeleton"><div /><div /><div /><div /><section /><section /></div>;
}

function ConditionValue({ condition, data, onChange }: { condition: Condition; data: OverviewData; onChange: (value: string) => void }) {
    const options = conditionOptions(condition.field, data);
    if (options) return <select className="input" value={condition.value} onChange={(event) => onChange(event.target.value)}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>;
    return <input className="input" type={condition.field.startsWith("metrics.") ? "number" : "text"} value={condition.value} onChange={(event) => onChange(event.target.value)} placeholder="مقدار" />;
}

function ActionFields({ action, data, selectedSiteId, onChange }: { action: AutomationAction; data: OverviewData; selectedSiteId: string; onChange: (patch: Partial<AutomationAction>) => void }) {
    if (action.type === "set_priority") return <label><span>اولویت جدید</span><select className="input" value={action.value || "high"} onChange={(event) => onChange({ value: event.target.value })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>;
    if (action.type === "set_status") return <label><span>وضعیت جدید</span><select className="input" value={action.value || "in_progress"} onChange={(event) => onChange({ value: event.target.value })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>;
    if (action.type === "assign_department") return <label><span>دپارتمان مقصد</span><select className="input" value={action.value || ""} onChange={(event) => onChange({ value: event.target.value })}><option value="">انتخاب دپارتمان</option>{data.departments.filter((item) => !selectedSiteId || item.site_id === Number(selectedSiteId)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;
    if (action.type === "assign_agent") return <label><span>پشتیبان مقصد</span><select className="input" value={action.value || ""} onChange={(event) => onChange({ value: event.target.value })}><option value="">انتخاب پشتیبان</option>{data.agents.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</select></label>;
    if (action.type === "add_tag") return <div className="automation-inline-fields"><label><span>نام برچسب</span><input className="input" value={action.value || ""} onChange={(event) => onChange({ value: event.target.value })} /></label><label><span>رنگ</span><input className="input automation-color-input" type="color" value={action.color || "#64748b"} onChange={(event) => onChange({ color: event.target.value })} /></label></div>;
    if (action.type === "create_alert") return <div className="automation-action-fields"><div className="automation-inline-fields"><label><span>عنوان هشدار</span><input className="input" value={action.title || ""} onChange={(event) => onChange({ title: event.target.value })} /></label><label><span>شدت</span><select className="input" value={action.severity || "warning"} onChange={(event) => onChange({ severity: event.target.value })}><option value="info">اطلاع‌رسانی</option><option value="warning">هشدار</option><option value="high">مهم</option><option value="critical">بحرانی</option></select></label><label><span>دریافت‌کننده</span><select className="input" value={action.recipient_mode || "admins"} onChange={(event) => onChange({ recipient_mode: event.target.value })}><option value="admins">مدیران</option><option value="assigned_agent">پشتیبان مسئول</option></select></label></div><label><span>متن هشدار</span><textarea className="input" rows={2} value={action.message || ""} onChange={(event) => onChange({ message: event.target.value })} /></label></div>;
    return <label><span>{action.type === "send_message" ? "پیام برای مشتری" : "متن یادداشت داخلی"}</span><textarea className="input" rows={3} value={action.message || ""} onChange={(event) => onChange({ message: event.target.value })} placeholder="متن را بنویسید..." /></label>;
}

function defaultAction(type: string): AutomationAction {
    if (type === "set_priority") return { type, value: "high" };
    if (type === "set_status") return { type, value: "in_progress" };
    if (type === "add_tag") return { type, value: "", color: "#64748b" };
    if (type === "create_alert") return { type, title: "هشدار اتوماسیون", message: "", severity: "warning", recipient_mode: "admins" };
    if (type === "assign_department" || type === "assign_agent") return { type, value: "" };
    return { type, message: "" };
}

function conditionOptions(field: string, data: OverviewData): Array<[string, string]> | null {
    if (field === "conversation.status" || field === "event.previous_status") return Object.entries(statusLabels);
    if (field === "conversation.priority") return Object.entries(priorityLabels);
    if (field === "conversation.queue_status") return Object.entries(queueLabels);
    if (field === "conversation.department_id") return data.departments.map((item) => [String(item.id), item.name]);
    if (field === "conversation.assigned_agent_id") return data.agents.map((item) => [String(item.id), item.name]);
    if (field === "conversation.site_id") return data.sites.map((item) => [String(item.id), item.name]);
    if (field === "visitor.device_type") return [["desktop", "دسکتاپ"], ["mobile", "موبایل"], ["tablet", "تبلت"], ["bot", "ربات"]];
    if (field === "sla.state") return Object.entries(slaLabels);
    if (field === "schedule.outside_business_hours") return [["true", "بله"], ["false", "خیر"]];
    return null;
}

function formatDate(value: string) {
    try { return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value.replace(" ", "T"))); }
    catch { return value; }
}
function formatMinutes(minutes: number) {
    if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440} روز`;
    if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} ساعت`;
    return `${minutes} دقیقه`;
}
function formatDuration(seconds: number) {
    if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} ساعت`;
    if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} دقیقه`;
    return `${seconds} ثانیه`;
}
