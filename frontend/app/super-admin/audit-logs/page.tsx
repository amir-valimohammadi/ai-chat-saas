// مسیر فایل: ai-chat-saas/frontend/app/super-admin/audit-logs/page.tsx
// هدف: مشاهده و فیلتر گزارش فعالیت‌های حساس مدیریتی

"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type JsonValue = Record<string, unknown> | null;

type AuditLog = {
    id: number;
    actor: { id: number | null; name: string | null; email: string | null; role: string | null };
    action: string;
    entity_type: string;
    entity_id: number | null;
    tenant_id: number | null;
    tenant_name: string | null;
    site_id: number | null;
    target_user_id: number | null;
    plan_id: number | null;
    description: string;
    old_values: JsonValue;
    new_values: JsonValue;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
};

type AuditResponse = {
    success: boolean;
    logs: AuditLog[];
    summary: {
        total: number;
        today: number;
        status_changes: number;
        password_resets: number;
        plan_changes: number;
    };
    pagination: { page: number; per_page: number; total: number; total_pages: number };
    filters: { actions: string[]; tenants: Array<{ id: number; name: string }> };
};

const actionLabels: Record<string, string> = {
    "customer.status_changed": "تغییر وضعیت مشتری",
    "customer.plan_changed": "تغییر پلن مشتری",
    "site.status_changed": "تغییر وضعیت سایت",
    "site.settings_updated": "ویرایش تنظیمات سایت",
    "user.status_changed": "تغییر وضعیت کاربر",
    "user.password_reset": "تغییر رمز کاربر",
    "plan.created": "ساخت پلن",
    "plan.updated": "ویرایش پلن",
    "plan.status_changed": "تغییر وضعیت پلن",
};

const entityLabels: Record<string, string> = {
    tenant: "مشتری",
    site: "سایت",
    user: "کاربر",
    plan: "پلن",
};

export default function SuperAdminAuditLogsPage() {
    const router = useRouter();
    const [data, setData] = useState<AuditResponse | null>(null);
    const [draftSearch, setDraftSearch] = useState("");
    const [search, setSearch] = useState("");
    const [action, setAction] = useState("");
    const [entityType, setEntityType] = useState("");
    const [tenantId, setTenantId] = useState(0);
    const [days, setDays] = useState(30);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

    const loadLogs = useCallback(async (silent = false) => {
        try {
            setError("");
            silent ? setRefreshing(true) : setLoading(true);

            const params = new URLSearchParams({
                page: String(page),
                per_page: String(perPage),
                days: String(days),
            });
            if (search) params.set("search", search);
            if (action) params.set("action", action);
            if (entityType) params.set("entity_type", entityType);
            if (tenantId > 0) params.set("tenant_id", String(tenantId));

            const response = await apiRequest(
                `/super-admin/audit-logs-list.php?${params.toString()}`
            );
            setData(response);
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت گزارش فعالیت‌ها");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [page, perPage, days, search, action, entityType, tenantId]);

    useEffect(() => {
        const user = getAuthUser();
        if (!user) {
            router.push("/login");
            return;
        }
        if (user.role !== "super_admin") {
            router.push("/dashboard");
            return;
        }
        loadLogs();
    }, [router, loadLogs]);

    function applySearch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPage(1);
        setSearch(draftSearch.trim());
    }

    function resetFilters() {
        setDraftSearch("");
        setSearch("");
        setAction("");
        setEntityType("");
        setTenantId(0);
        setDays(30);
        setPage(1);
        setPerPage(20);
    }

    const summary = data?.summary;

    return (
        <AppShell
            title="گزارش فعالیت‌ها"
            kicker="Audit Log"
            description="ردیابی تغییرات حساس سوپر ادمین بدون ذخیره رمز یا اطلاعات محرمانه"
            actions={
                <button className="btn secondary" type="button" onClick={() => loadLogs(true)} disabled={refreshing}>
                    {refreshing ? "در حال بروزرسانی..." : "بروزرسانی"}
                </button>
            }
        >
            <div className="sa-audit-page">
                <section className="sa-audit-summary-grid">
                    <SummaryCard label="رویدادهای فیلترشده" value={summary?.total || 0} />
                    <SummaryCard label="فعالیت امروز" value={summary?.today || 0} />
                    <SummaryCard label="تغییر وضعیت‌ها" value={summary?.status_changes || 0} />
                    <SummaryCard label="تغییرات پلن" value={summary?.plan_changes || 0} />
                    <SummaryCard
                        label="تغییر رمز"
                        value={summary?.password_resets || 0}
                        tone={(summary?.password_resets || 0) > 0 ? "warning" : "default"}
                    />
                </section>

                <section className="sa-audit-filter-card">
                    <form className="sa-audit-search" onSubmit={applySearch}>
                        <input
                            value={draftSearch}
                            onChange={(event) => setDraftSearch(event.target.value)}
                            placeholder="جست‌وجو در شرح، نام مدیر، ایمیل یا شناسه..."
                        />
                        <button className="btn" type="submit">جست‌وجو</button>
                    </form>

                    <div className="sa-audit-filters">
                        <select className="input" value={days} onChange={(event) => { setPage(1); setDays(Number(event.target.value)); }}>
                            <option value={7}>۷ روز اخیر</option>
                            <option value={30}>۳۰ روز اخیر</option>
                            <option value={90}>۹۰ روز اخیر</option>
                            <option value={365}>یک سال اخیر</option>
                            <option value={0}>همه زمان‌ها</option>
                        </select>
                        <select className="input" value={action} onChange={(event) => { setPage(1); setAction(event.target.value); }}>
                            <option value="">همه عملیات‌ها</option>
                            {(data?.filters.actions || []).map((item) => (
                                <option key={item} value={item}>{actionLabels[item] || item}</option>
                            ))}
                        </select>
                        <select className="input" value={entityType} onChange={(event) => { setPage(1); setEntityType(event.target.value); }}>
                            <option value="">همه موجودیت‌ها</option>
                            <option value="tenant">مشتری</option>
                            <option value="site">سایت</option>
                            <option value="user">کاربر</option>
                            <option value="plan">پلن</option>
                        </select>
                        <select className="input" value={tenantId} onChange={(event) => { setPage(1); setTenantId(Number(event.target.value)); }}>
                            <option value={0}>همه مشتری‌ها</option>
                            {(data?.filters.tenants || []).map((tenant) => (
                                <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                            ))}
                        </select>
                        <select className="input" value={perPage} onChange={(event) => { setPage(1); setPerPage(Number(event.target.value)); }}>
                            <option value={20}>۲۰ ردیف</option>
                            <option value={40}>۴۰ ردیف</option>
                            <option value={80}>۸۰ ردیف</option>
                        </select>
                        <button className="btn secondary" type="button" onClick={resetFilters}>پاک‌کردن فیلترها</button>
                    </div>
                </section>

                {error && <div className="error">{error}</div>}

                <section className="sa-audit-list-card">
                    <div className="sa-audit-list-head">
                        <div>
                            <h2>تاریخچه رویدادها</h2>
                            <p>{formatNumber(data?.pagination.total || 0)} رویداد پیدا شد.</p>
                        </div>
                    </div>

                    {loading ? (
                        <div className="sa-audit-skeleton-list">
                            {[1, 2, 3, 4, 5].map((item) => <div className="sa-audit-skeleton" key={item} />)}
                        </div>
                    ) : !data?.logs.length ? (
                        <div className="sa-audit-empty">گزارشی با فیلترهای انتخاب‌شده وجود ندارد.</div>
                    ) : (
                        <div className="sa-audit-table-wrap">
                            <div className="sa-audit-table-head">
                                <span>زمان</span><span>مدیر</span><span>عملیات</span><span>هدف</span><span>شرح تغییر</span><span>IP</span><span />
                            </div>
                            {data.logs.map((log) => (
                                <article className="sa-audit-row" key={log.id}>
                                    <time>{formatDateTime(log.created_at)}</time>
                                    <div className="sa-audit-actor">
                                        <strong>{log.actor.name || "مدیر حذف‌شده"}</strong>
                                        <small>{log.actor.email || "بدون ایمیل"}</small>
                                    </div>
                                    <span className={`sa-audit-action action-${log.entity_type}`}>
                                        {actionLabels[log.action] || log.action}
                                    </span>
                                    <div className="sa-audit-target">
                                        <strong>{entityLabels[log.entity_type] || log.entity_type} {log.entity_id ? `#${log.entity_id}` : ""}</strong>
                                        {log.tenant_id && (
                                            <Link href={`/super-admin/customers/${log.tenant_id}`}>
                                                {log.tenant_name || `مشتری #${log.tenant_id}`}
                                            </Link>
                                        )}
                                    </div>
                                    <p>{log.description}</p>
                                    <code>{log.ip_address || "-"}</code>
                                    <button className="btn secondary" type="button" onClick={() => setSelectedLog(log)}>جزئیات</button>
                                </article>
                            ))}
                        </div>
                    )}

                    <div className="sa-audit-pagination">
                        <button className="btn secondary" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>صفحه قبل</button>
                        <span>صفحه {formatNumber(page)} از {formatNumber(data?.pagination.total_pages || 1)}</span>
                        <button className="btn secondary" type="button" disabled={page >= (data?.pagination.total_pages || 0)} onClick={() => setPage((current) => current + 1)}>صفحه بعد</button>
                    </div>
                </section>
            </div>

            {selectedLog && (
                <div className="sa-audit-modal-backdrop" onMouseDown={() => setSelectedLog(null)}>
                    <section className="sa-audit-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="sa-audit-modal-head">
                            <div>
                                <span>Audit #{selectedLog.id}</span>
                                <h2>{actionLabels[selectedLog.action] || selectedLog.action}</h2>
                                <p>{selectedLog.description}</p>
                            </div>
                            <button className="sa-audit-close" type="button" onClick={() => setSelectedLog(null)}>×</button>
                        </div>
                        <div className="sa-audit-detail-grid">
                            <DetailItem label="مدیر" value={`${selectedLog.actor.name || "-"} — ${selectedLog.actor.email || "-"}`} />
                            <DetailItem label="زمان" value={formatDateTime(selectedLog.created_at)} />
                            <DetailItem label="IP" value={selectedLog.ip_address || "-"} />
                            <DetailItem label="موجودیت" value={`${entityLabels[selectedLog.entity_type] || selectedLog.entity_type} #${selectedLog.entity_id || "-"}`} />
                        </div>
                        <div className="sa-audit-changes-grid">
                            <JsonPanel title="مقدار قبلی" value={selectedLog.old_values} />
                            <JsonPanel title="مقدار جدید" value={selectedLog.new_values} />
                        </div>
                        <div className="sa-audit-user-agent">
                            <strong>User Agent</strong>
                            <code>{selectedLog.user_agent || "-"}</code>
                        </div>
                    </section>
                </div>
            )}
        </AppShell>
    );
}

function SummaryCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warning" }) {
    return <article className={`sa-audit-summary-card tone-${tone}`}><span>{label}</span><strong>{formatNumber(value)}</strong></article>;
}

function DetailItem({ label, value }: { label: string; value: string }) {
    return <div className="sa-audit-detail-item"><span>{label}</span><strong>{value}</strong></div>;
}

function JsonPanel({ title, value }: { title: string; value: JsonValue }) {
    return <section className="sa-audit-json-panel"><h3>{title}</h3><pre>{value ? JSON.stringify(value, null, 2) : "تغییری ثبت نشده است."}</pre></section>;
}

function formatNumber(value: number) {
    return Number(value || 0).toLocaleString("fa-IR");
}

function formatDateTime(value: string) {
    const date = new Date(value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(date);
}
