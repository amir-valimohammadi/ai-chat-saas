"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiDownload, apiRequest, getAuthUser } from "@/lib/api";
import { useMessageNotifications } from "@/hooks/useMessageNotifications";

type StatusFilter = "" | "new" | "open" | "in_progress" | "waiting_customer" | "follow_up" | "pending" | "closed";
type Priority = "" | "low" | "normal" | "high" | "urgent";

type Conversation = {
    id: number;
    status: string;
    priority: Exclude<Priority, "">;
    is_pinned: boolean;
    pinned_at: string | null;
    is_archived: boolean;
    archived_at: string | null;
    assigned_agent: { id: number; name: string; email: string } | null;
    department: { id: number; name: string; color: string } | null;
    queue_status: "none" | "waiting" | "assigned";
    queue_position: number | null;
    queued_at: string | null;
    assigned_at: string | null;
    assignment_method: string | null;
    site: { id: number; name: string };
    visitor: {
        id: number;
        name: string | null;
        email: string | null;
        phone: string | null;
        last_seen_at: string | null;
        is_online: boolean;
    };
    source_page_url: string | null;
    source_page_title: string | null;
    last_message: string | null;
    last_message_at: string | null;
    created_at: string;
    unread_count: number;
    has_unread: boolean;
    unread_mention_count: number;
    has_unread_mention: boolean;
    message_count: number;
    attachment_count: number;
    has_file: boolean;
    has_voice: boolean;
    has_internal_note: boolean;
};

type InboxOptions = {
    sites: { id: number; name: string }[];
    agents: { id: number; name: string; email: string; role: string; is_active: boolean }[];
    departments: { id: number; name: string; site_id: number; site_name: string; color: string }[];
};

type Filters = {
    q: string;
    status: StatusFilter;
    priority: Priority;
    archived: "0" | "1" | "all";
    assigned_agent_id: string;
    department_id: string;
    site_id: string;
    date_from: string;
    date_to: string;
    unread: boolean;
    unassigned: boolean;
    pinned: boolean;
    queued: boolean;
    has_file: boolean;
    has_voice: boolean;
    has_internal_note: boolean;
    has_mention: boolean;
};

const initialFilters: Filters = {
    q: "",
    status: "",
    priority: "",
    archived: "0",
    assigned_agent_id: "",
    department_id: "",
    site_id: "",
    date_from: "",
    date_to: "",
    unread: false,
    unassigned: false,
    pinned: false,
    queued: false,
    has_file: false,
    has_voice: false,
    has_internal_note: false,
    has_mention: false,
};

const statusLabels: Record<string, string> = {
    new: "جدید",
    open: "باز",
    in_progress: "در حال انجام",
    waiting_customer: "در انتظار مشتری",
    follow_up: "نیاز به پیگیری",
    pending: "در انتظار",
    closed: "بسته‌شده",
};

const priorityLabels: Record<string, string> = {
    low: "کم",
    normal: "عادی",
    high: "بالا",
    urgent: "فوری",
};

const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: "", label: "همه وضعیت‌ها" },
    { value: "new", label: "جدید" },
    { value: "open", label: "باز" },
    { value: "in_progress", label: "در حال انجام" },
    { value: "waiting_customer", label: "در انتظار مشتری" },
    { value: "follow_up", label: "نیاز به پیگیری" },
    { value: "pending", label: "در انتظار" },
    { value: "closed", label: "بسته‌شده" },
];

export default function ConversationsPage() {
    const router = useRouter();
    const notifications = useMessageNotifications("AI Chat SaaS Panel");
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [options, setOptions] = useState<InboxOptions>({ sites: [], agents: [], departments: [] });
    const [filters, setFilters] = useState<Filters>(initialFilters);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 50 });
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [availabilityStatus, setAvailabilityStatus] = useState<"online" | "offline">("online");
    const [presenceLoading, setPresenceLoading] = useState(false);
    const knownLastMessageMap = useRef<Record<number, string | null>>({});
    const filtersRef = useRef(filters);
    const pageRef = useRef(page);

    function buildQuery(activeFilters = filtersRef.current, activePage = pageRef.current) {
        const params = new URLSearchParams();
        params.set("page", String(activePage));
        params.set("limit", "50");
        Object.entries(activeFilters).forEach(([key, value]) => {
            if (typeof value === "boolean") {
                if (value) params.set(key, "1");
            } else if (value !== "") {
                params.set(key, String(value));
            }
        });
        return params.toString();
    }

    async function loadConversations(silent = false, activeFilters = filtersRef.current, activePage = pageRef.current) {
        try {
            setError("");
            silent ? setRefreshing(true) : setLoading(true);
            const data = await apiRequest(`/agent/conversations-list.php?${buildQuery(activeFilters, activePage)}`);
            const loaded: Conversation[] = data.conversations || [];
            setConversations(loaded);
            setPagination(data.pagination || { page: activePage, pages: 1, total: loaded.length, limit: 50 });
            setSelectedIds((current) => current.filter((id) => loaded.some((item) => item.id === id)));

            const totalUnread = loaded.reduce((sum, item) => sum + (item.unread_count || 0), 0);
            notifications.setUnreadTitle(totalUnread);
            let newest: Conversation | null = null;
            for (const conversation of loaded) {
                const old = knownLastMessageMap.current[conversation.id];
                if (old && conversation.last_message_at && old !== conversation.last_message_at && conversation.has_unread) {
                    newest ||= conversation;
                }
                knownLastMessageMap.current[conversation.id] = conversation.last_message_at;
            }
            if (newest) {
                notifications.notify({
                    title: `پیام جدید از ${newest.visitor.name || "کاربر سایت"}`,
                    body: newest.last_message || "پیام جدید دریافت شد.",
                    tag: `conversation-${newest.id}`,
                    unreadCount: totalUnread,
                });
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت گفتگوها");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    async function loadOptions() {
        try {
            const data = await apiRequest("/agent/inbox-options.php");
            setOptions({ sites: data.sites || [], agents: data.agents || [], departments: data.departments || [] });
        } catch {
            // فیلترهای اصلی بدون این گزینه‌ها هم کار می‌کنند.
        }
    }

    async function loadPresence() {
        try {
            const data = await apiRequest("/agent/presence-status.php");
            setAvailabilityStatus(data.availability_status === "offline" ? "offline" : "online");
        } catch {}
    }

    async function updatePresence(next: "online" | "offline") {
        try {
            setPresenceLoading(true);
            const data = await apiRequest("/agent/presence-status.php", {
                method: "POST",
                body: JSON.stringify({ availability_status: next }),
            });
            setAvailabilityStatus(data.availability_status === "offline" ? "offline" : "online");
        } catch (err) {
            setError(err instanceof Error ? err.message : "تغییر وضعیت ناموفق بود");
        } finally {
            setPresenceLoading(false);
        }
    }

    useEffect(() => {
        if (!getAuthUser()) {
            router.push("/login");
            return;
        }
        loadOptions();
        loadPresence();
    }, [router]);

    useEffect(() => {
        filtersRef.current = filters;
        pageRef.current = page;
        const timer = window.setTimeout(() => loadConversations(false, filters, page), filters.q ? 350 : 0);
        return () => window.clearTimeout(timer);
    }, [filters, page]);

    useEffect(() => {
        const timer = window.setInterval(() => loadConversations(true), 6000);
        return () => window.clearInterval(timer);
    }, []);

    function changeFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
        setPage(1);
        setFilters((current) => ({ ...current, [key]: value }));
    }

    async function updateManagement(conversationId: number, payload: Record<string, unknown>) {
        try {
            setError("");
            await apiRequest("/agent/conversation-management-update.php", {
                method: "POST",
                body: JSON.stringify({ conversation_id: conversationId, ...payload }),
            });
            await loadConversations(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "عملیات ناموفق بود");
        }
    }

    async function runBulkAction(action: string, value: unknown = null) {
        if (!selectedIds.length) return;
        try {
            setBulkLoading(true);
            setError("");
            const data = await apiRequest("/agent/conversations-bulk-action.php", {
                method: "POST",
                body: JSON.stringify({ conversation_ids: selectedIds, action, value }),
            });
            setNotice(`${data.selected_count || selectedIds.length} گفتگو بروزرسانی شد.`);
            setSelectedIds([]);
            await loadConversations(true);
            window.setTimeout(() => setNotice(""), 3500);
        } catch (err) {
            setError(err instanceof Error ? err.message : "عملیات گروهی ناموفق بود");
        } finally {
            setBulkLoading(false);
        }
    }

    async function exportCsv() {
        try {
            setError("");
            await apiDownload(`/agent/conversations-export.php?${buildQuery(filters, 1)}`, "conversations.csv");
        } catch (err) {
            setError(err instanceof Error ? err.message : "خروجی CSV ناموفق بود");
        }
    }

    const stats = useMemo(() => ({
        total: pagination.total,
        unread: conversations.reduce((sum, item) => sum + item.unread_count, 0),
        urgent: conversations.filter((item) => item.priority === "urgent").length,
        unassigned: conversations.filter((item) => !item.assigned_agent).length,
        pinned: conversations.filter((item) => item.is_pinned).length,
        files: conversations.reduce((sum, item) => sum + item.attachment_count, 0),
    }), [conversations, pagination.total]);

    const allSelected = conversations.length > 0 && conversations.every((item) => selectedIds.includes(item.id));

    return (
        <AppShell
            title="گفتگوها"
            kicker="Advanced Inbox"
            description="جست‌وجو، فیلتر، اولویت‌بندی، آرشیو و مدیریت گروهی مکالمات"
            actions={<div className="conversations-header-actions">
                <button className="btn secondary" onClick={() => notifications.toggleSound()}>{notifications.preferences.sound_enabled ? "🔔 صدا روشن" : "🔕 صدا خاموش"}</button>
                <div className={`presence-control ${availabilityStatus}`}><span className="presence-dot" /><select className="presence-select" value={availabilityStatus} onChange={(event) => updatePresence(event.target.value as "online" | "offline")} disabled={presenceLoading}><option value="online">Online</option><option value="offline">Offline</option></select></div>
                <button className="btn secondary" onClick={exportCsv}>خروجی CSV</button>
                <button className="btn secondary" onClick={() => loadConversations(true)} disabled={refreshing}>{refreshing ? "در حال بروزرسانی..." : "بروزرسانی"}</button>
            </div>}
        >
            <div className="conversations-page-shell">
                <section className="conversations-command-card">
                    <div><span className="conversations-eyebrow">Search & Operations</span><h2>هر گفتگو را در چند ثانیه پیدا کن</h2><p>جست‌وجو در متن پیام‌ها، فایل‌ها و مشخصات مخاطب روی سرور انجام می‌شود و به ۱۰۰ گفتگوی آخر محدود نیست.</p></div>
                    <div className="conversations-command-status"><span>نتیجه فیلتر</span><strong>{pagination.total}</strong><small>صفحه {pagination.page} از {pagination.pages}</small></div>
                </section>

                <section className="conversations-kpi-strip">
                    <InboxKpi label="کل نتایج" value={stats.total} />
                    <InboxKpi label="خوانده‌نشده این صفحه" value={stats.unread} tone={stats.unread ? "danger" : "default"} />
                    <InboxKpi label="فوری" value={stats.urgent} tone={stats.urgent ? "danger" : "default"} />
                    <InboxKpi label="بدون مسئول" value={stats.unassigned} tone={stats.unassigned ? "warning" : "default"} />
                    <InboxKpi label="سنجاق‌شده" value={stats.pinned} tone="primary" />
                    <InboxKpi label="فایل‌ها" value={stats.files} />
                </section>

                {notice && <div className="success">{notice}</div>}
                {error && <div className="error">{error}</div>}

                <section className="conversations-inbox-card">
                    <div className="phase4-search-row">
                        <div className="conversations-search-wrap"><span>جست‌وجوی سراسری</span><input className="input" value={filters.q} onChange={(event) => changeFilter("q", event.target.value)} placeholder="متن پیام، نام فایل، نام، ایمیل، تلفن، سایت یا شناسه..." /></div>
                        <select className="input" value={filters.status} onChange={(event) => changeFilter("status", event.target.value as StatusFilter)}>{statusFilters.map((item) => <option key={item.value || "all"} value={item.value}>{item.label}</option>)}</select>
                        <select className="input" value={filters.archived} onChange={(event) => changeFilter("archived", event.target.value as Filters["archived"])}><option value="0">Inbox فعال</option><option value="1">آرشیو</option><option value="all">فعال و آرشیو</option></select>
                        <button className="btn secondary" type="button" onClick={() => setShowAdvanced((value) => !value)}>{showAdvanced ? "بستن فیلترها" : "فیلتر پیشرفته"}</button>
                        <button className="btn secondary" type="button" onClick={() => { setFilters(initialFilters); setPage(1); }}>پاک‌کردن</button>
                    </div>

                    {showAdvanced && <div className="phase4-advanced-filters">
                        <label><span>اولویت</span><select className="input" value={filters.priority} onChange={(event) => changeFilter("priority", event.target.value as Priority)}><option value="">همه</option><option value="urgent">فوری</option><option value="high">بالا</option><option value="normal">عادی</option><option value="low">کم</option></select></label>
                        <label><span>پشتیبان</span><select className="input" value={filters.assigned_agent_id} onChange={(event) => changeFilter("assigned_agent_id", event.target.value)}><option value="">همه</option>{options.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
                        <label><span>دپارتمان</span><select className="input" value={filters.department_id} onChange={(event) => changeFilter("department_id", event.target.value)}><option value="">همه</option>{options.departments.filter((department) => !filters.site_id || department.site_id === Number(filters.site_id)).map((department) => <option key={department.id} value={department.id}>{department.name} · {department.site_name}</option>)}</select></label>
                        <label><span>سایت</span><select className="input" value={filters.site_id} onChange={(event) => changeFilter("site_id", event.target.value)}><option value="">همه</option>{options.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
                        <label><span>از تاریخ</span><input className="input" type="date" value={filters.date_from} onChange={(event) => changeFilter("date_from", event.target.value)} /></label>
                        <label><span>تا تاریخ</span><input className="input" type="date" value={filters.date_to} onChange={(event) => changeFilter("date_to", event.target.value)} /></label>
                        <div className="phase4-check-filters">
                            <FilterCheck label="خوانده‌نشده" checked={filters.unread} onChange={(value) => changeFilter("unread", value)} />
                            <FilterCheck label="بدون مسئول" checked={filters.unassigned} onChange={(value) => changeFilter("unassigned", value)} />
                            <FilterCheck label="سنجاق‌شده" checked={filters.pinned} onChange={(value) => changeFilter("pinned", value)} />
                            <FilterCheck label="در صف انتظار" checked={filters.queued} onChange={(value) => changeFilter("queued", value)} />
                            <FilterCheck label="دارای فایل" checked={filters.has_file} onChange={(value) => changeFilter("has_file", value)} />
                            <FilterCheck label="دارای صوت" checked={filters.has_voice} onChange={(value) => changeFilter("has_voice", value)} />
                            <FilterCheck label="یادداشت داخلی" checked={filters.has_internal_note} onChange={(value) => changeFilter("has_internal_note", value)} />
                            <FilterCheck label="منشن من" checked={filters.has_mention} onChange={(value) => changeFilter("has_mention", value)} />
                        </div>
                    </div>}

                    {selectedIds.length > 0 && <div className="phase4-bulk-bar">
                        <strong>{selectedIds.length} گفتگو انتخاب شده</strong>
                        <button className="btn secondary" disabled={bulkLoading} onClick={() => runBulkAction(filters.archived === "1" ? "unarchive" : "archive")}>{filters.archived === "1" ? "بازگردانی" : "آرشیو"}</button>
                        <button className="btn secondary" disabled={bulkLoading} onClick={() => runBulkAction("pin")}>سنجاق</button>
                        <select className="input" defaultValue="" onChange={(event) => { if (event.target.value) runBulkAction("priority", event.target.value); event.currentTarget.value = ""; }}><option value="">تغییر اولویت...</option><option value="urgent">فوری</option><option value="high">بالا</option><option value="normal">عادی</option><option value="low">کم</option></select>
                        <select className="input" defaultValue="" onChange={(event) => { if (event.target.value) runBulkAction("assign", event.target.value); event.currentTarget.value = ""; }}><option value="">اختصاص به...</option><option value="0">بدون مسئول</option>{options.agents.filter((agent) => agent.is_active).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
                        <select className="input" defaultValue="" onChange={(event) => { if (event.target.value) runBulkAction("department", event.target.value); event.currentTarget.value = ""; }}><option value="">انتقال دپارتمان...</option>{options.departments.map((department) => <option key={department.id} value={department.id}>{department.name} · {department.site_name}</option>)}</select>
                        <button className="btn secondary" onClick={() => setSelectedIds([])}>لغو انتخاب</button>
                    </div>}

                    {loading ? <div className="conversations-skeleton-list">{[1,2,3,4].map((item) => <div key={item} className="conversations-skeleton-row" />)}</div> : conversations.length === 0 ? <div className="conversations-empty-state"><div>🔎</div><h3>گفتگویی پیدا نشد</h3><p className="muted">فیلترها یا عبارت جست‌وجو را تغییر بده.</p></div> : <div className="conversations-table">
                        <div className="conversations-table-head phase4-table-head"><span><input type="checkbox" checked={allSelected} onChange={(event) => setSelectedIds(event.target.checked ? conversations.map((item) => item.id) : [])} /></span><span>کاربر و پیام</span><span>وضعیت</span><span>مسئول</span><span>اطلاعات</span><span>عملیات</span></div>
                        {conversations.map((conversation) => <article key={conversation.id} className={["conversations-row","phase4-conversation-row",conversation.has_unread ? "unread" : "",conversation.is_pinned ? "pinned" : "",`priority-${conversation.priority}`].filter(Boolean).join(" ")} onClick={() => router.push(`/conversations/${conversation.id}`)}>
                            <div className="phase4-select-cell" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(conversation.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, conversation.id] : current.filter((id) => id !== conversation.id))} /></div>
                            <div className="conversation-cell-main"><div className="conversation-title-row"><strong>{conversation.visitor.name || "کاربر بدون نام"}</strong><span>#{conversation.id}</span><PriorityBadge priority={conversation.priority} />{conversation.department && <b className="phase5-department-badge" style={{ borderColor: conversation.department.color, color: conversation.department.color }}>{conversation.department.name}</b>}{conversation.queue_status === "waiting" && <b className="phase5-queue-badge">صف #{conversation.queue_position || "-"}</b>}{conversation.is_pinned && <b className="phase4-pin-badge">📌</b>}{conversation.has_unread && <b>{conversation.unread_count} جدید</b>}</div><p>{truncateText(conversation.last_message || "بدون پیام", 115)}</p><small>{conversation.last_message_at || "ثبت نشده"}</small></div>
                            <div className="conversation-cell-status"><StatusBadge status={conversation.status} /></div>
                            <div className="conversation-cell-agent">{conversation.assigned_agent ? <><strong>{conversation.assigned_agent.name}</strong><span>{conversation.assigned_agent.email}</span></> : <span className="conversation-unassigned">بدون مسئول</span>}</div>
                            <div className="conversation-cell-contact"><strong>{conversation.site.name}</strong><span>{conversation.visitor.phone || conversation.visitor.email || "بدون تماس"}</span><small>{conversation.message_count} پیام · {conversation.attachment_count} فایل {conversation.has_voice ? "· صوت" : ""} {conversation.has_internal_note ? "· یادداشت" : ""}</small></div>
                            <div className="conversation-cell-action phase4-row-actions" onClick={(event) => event.stopPropagation()}><button className="phase4-icon-btn" title={conversation.is_pinned ? "برداشتن سنجاق" : "سنجاق"} onClick={() => updateManagement(conversation.id, { is_pinned: !conversation.is_pinned })}>{conversation.is_pinned ? "📍" : "📌"}</button><button className="phase4-icon-btn" title={conversation.is_archived ? "بازگردانی" : "آرشیو"} onClick={() => updateManagement(conversation.id, { is_archived: !conversation.is_archived })}>{conversation.is_archived ? "↩️" : "🗄️"}</button><button className="btn secondary" onClick={() => router.push(`/conversations/${conversation.id}`)}>باز کردن</button></div>
                        </article>)}
                    </div>}

                    {pagination.pages > 1 && <div className="phase4-pagination"><button className="btn secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>قبلی</button><span>صفحه {pagination.page} از {pagination.pages} · {pagination.total} نتیجه</span><button className="btn secondary" disabled={page >= pagination.pages} onClick={() => setPage((value) => Math.min(pagination.pages, value + 1))}>بعدی</button></div>}
                </section>
            </div>
        </AppShell>
    );
}

function InboxKpi({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "primary" | "success" | "warning" | "danger" }) { return <article className={`conversations-kpi tone-${tone}`}><strong>{value}</strong><span>{label}</span></article>; }
function StatusBadge({ status }: { status: string }) { return <span className={`conversation-status-badge status-${status}`}>{statusLabels[status] || status}</span>; }
function PriorityBadge({ priority }: { priority: string }) { return <span className={`phase4-priority-badge priority-${priority}`}>{priorityLabels[priority] || priority}</span>; }
function FilterCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="phase4-filter-check"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>; }
function truncateText(text: string, maxLength: number) { return text.length <= maxLength ? text : `${text.slice(0, maxLength).trim()}...`; }
