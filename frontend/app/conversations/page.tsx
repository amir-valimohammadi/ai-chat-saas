"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiDownload, apiRequest, getAuthUser } from "@/lib/api";
import { useMessageNotifications } from "@/hooks/useMessageNotifications";
import { useApiEventStream } from "@/hooks/useApiEventStream";

type StatusFilter = "" | "new" | "open" | "in_progress" | "waiting_customer" | "follow_up" | "pending" | "closed";
type Priority = "" | "low" | "normal" | "high" | "urgent";
type QuickView = "all" | "unread" | "unassigned" | "urgent";

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
    const [canUseInbox, setCanUseInbox] = useState(false);
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
    const listRequestIdRef = useRef(0);
    const bulkActionPendingRef = useRef(false);

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
        if (!canUseInbox) return;

        const requestId = ++listRequestIdRef.current;
        const query = buildQuery(activeFilters, activePage);
        const isCurrentRequest = () => requestId === listRequestIdRef.current && query === buildQuery();

        try {
            setError("");
            silent ? setRefreshing(true) : setLoading(true);
            const data = await apiRequest(`/agent/conversations-list.php?${query}`);
            if (!isCurrentRequest()) return;

            const loaded: Conversation[] = data.conversations || [];
            const nextPagination = data.pagination || { page: activePage, pages: 1, total: loaded.length, limit: 50 };
            const lastPage = Math.max(1, Number(nextPagination.pages) || 1);

            if (activePage > lastPage) {
                // آرشیو آخرین ردیف ممکن است تعداد صفحات را کم کند؛ effect صفحه صحیح را دوباره می‌خواند.
                pageRef.current = lastPage;
                setPage(lastPage);
                setLoading(true);
                return;
            }

            setConversations(loaded);
            setPagination({ ...nextPagination, pages: lastPage });
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
            if (isCurrentRequest()) {
                setError(err instanceof Error ? err.message : "خطا در دریافت گفتگوها");
            }
        } finally {
            if (isCurrentRequest()) {
                setLoading(false);
                setRefreshing(false);
            }
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
        if (!canUseInbox) return;

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
        const authUser = getAuthUser();

        if (!authUser) {
            router.replace("/login");
            return;
        }

        if (authUser.role === "super_admin") {
            router.replace("/super-admin/dashboard");
            return;
        }

        if (authUser.role !== "customer_admin" && authUser.role !== "agent") {
            router.replace("/login");
            return;
        }

        setCanUseInbox(true);
        loadOptions();
        loadPresence();

        return () => {
            listRequestIdRef.current += 1;
        };
    }, [router]);

    useEffect(() => {
        filtersRef.current = filters;
        pageRef.current = page;
        if (!canUseInbox) return;

        const timer = window.setTimeout(() => loadConversations(false, filters, page), filters.q ? 350 : 0);
        return () => window.clearTimeout(timer);
    }, [canUseInbox, filters, page]);

    useApiEventStream({
        path: "/agent/inbox-stream.php",
        enabled: canUseInbox,
        fallbackIntervalMs: 6000,
        onEvent: (message) => {
            if (message.event === "inbox.updated") {
                void loadConversations(true);
            }
        },
        onFallbackTick: () => void loadConversations(true),
    });

    function changeFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
        setPage(1);
        setFilters((current) => ({ ...current, [key]: value }));
    }

    function changeSiteFilter(siteId: string) {
        setPage(1);
        setFilters((current) => {
            const departmentMatchesSite = !current.department_id || !siteId || options.departments.some(
                (department) => department.id === Number(current.department_id) && department.site_id === Number(siteId)
            );

            return {
                ...current,
                site_id: siteId,
                department_id: departmentMatchesSite ? current.department_id : "",
            };
        });
    }

    function applyQuickView(view: QuickView) {
        const next: Filters = { ...initialFilters };
        if (view === "unread") next.unread = true;
        if (view === "unassigned") next.unassigned = true;
        if (view === "urgent") next.priority = "urgent";
        setPage(1);
        setShowAdvanced(false);
        setFilters(next);
    }

    async function updateManagement(conversationId: number, payload: Record<string, unknown>) {
        if (!canUseInbox || bulkActionPendingRef.current) return;

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
        if (!canUseInbox || bulkActionPendingRef.current || !selectedIds.length) return;
        if (action === "department" && !bulkDepartments.some((department) => department.id === Number(value))) {
            setError("برای انتقال دپارتمان، گفتگوهای یک سایت و دپارتمان همان سایت را انتخاب کنید.");
            return;
        }

        const conversationIds = [...selectedIds];
        bulkActionPendingRef.current = true;
        try {
            setBulkLoading(true);
            setError("");
            const data = await apiRequest("/agent/conversations-bulk-action.php", {
                method: "POST",
                body: JSON.stringify({ conversation_ids: conversationIds, action, value }),
            });
            setNotice(`${data.selected_count || conversationIds.length} گفتگو بروزرسانی شد.`);
            setSelectedIds([]);
            await loadConversations(true);
            window.setTimeout(() => setNotice(""), 3500);
        } catch (err) {
            setError(err instanceof Error ? err.message : "عملیات گروهی ناموفق بود");
        } finally {
            bulkActionPendingRef.current = false;
            setBulkLoading(false);
        }
    }

    async function exportCsv() {
        if (!canUseInbox) return;

        try {
            setError("");
            await apiDownload(`/agent/conversations-export.php?${buildQuery(filters, 1)}`, "conversations.csv");
        } catch (err) {
            setError(err instanceof Error ? err.message : "خروجی CSV ناموفق بود");
        }
    }

    const activeFilterCount = useMemo(() => {
        return Object.entries(filters).reduce((count, [key, value]) => {
            if (key === "archived") return count + (value === "0" ? 0 : 1);
            if (typeof value === "boolean") return count + (value ? 1 : 0);
            return count + (value ? 1 : 0);
        }, 0);
    }, [filters]);

    const activeQuickView: QuickView | "custom" = useMemo(() => {
        const matches = (candidate: Filters) => (Object.keys(initialFilters) as (keyof Filters)[]).every(
            (key) => filters[key] === candidate[key]
        );
        if (matches(initialFilters)) return "all";
        if (matches({ ...initialFilters, unread: true })) return "unread";
        if (matches({ ...initialFilters, unassigned: true })) return "unassigned";
        if (matches({ ...initialFilters, priority: "urgent" })) return "urgent";
        return "custom";
    }, [filters]);

    const bulkDepartmentSiteId = useMemo(() => {
        const selectedConversations = conversations.filter((conversation) => selectedIds.includes(conversation.id));
        if (!selectedIds.length || selectedConversations.length !== selectedIds.length) return null;

        const siteIds = new Set(selectedConversations.map((conversation) => conversation.site.id));
        return siteIds.size === 1 ? selectedConversations[0].site.id : null;
    }, [conversations, selectedIds]);
    const bulkDepartments = useMemo(() => options.departments.filter(
        (department) => department.site_id === bulkDepartmentSiteId
    ), [bulkDepartmentSiteId, options.departments]);
    const bulkDepartmentHint = bulkDepartmentSiteId === null
        ? "برای انتقال دپارتمان، گفتگوهای یک سایت را انتخاب کنید."
        : bulkDepartments.length === 0
            ? "دپارتمان فعالی برای سایت انتخاب‌شده وجود ندارد."
            : "";

    const allSelected = conversations.length > 0 && conversations.every((item) => selectedIds.includes(item.id));

    return (
        <AppShell
            title="گفتگوها"
            actions={
                <div className="conversations-header-actions">
                    <button
                        className={`btn secondary conversations-icon-action ${notifications.preferences.sound_enabled ? "active" : ""}`}
                        onClick={() => notifications.toggleSound()}
                        type="button"
                        aria-pressed={notifications.preferences.sound_enabled}
                        aria-label={notifications.preferences.sound_enabled ? "خاموش‌کردن صدای اعلان" : "روشن‌کردن صدای اعلان"}
                        title={notifications.preferences.sound_enabled ? "صدای اعلان روشن است" : "صدای اعلان خاموش است"}
                    >
                        <ConversationIcon name={notifications.preferences.sound_enabled ? "bell" : "bellOff"} />
                        <span className="conversations-action-label">صدای اعلان</span>
                    </button>

                    <label className={`presence-control ${availabilityStatus}`}>
                        <span className="presence-dot" />
                        <span className="presence-label">وضعیت من</span>
                        <select
                            className="presence-select"
                            value={availabilityStatus}
                            onChange={(event) => updatePresence(event.target.value as "online" | "offline")}
                            disabled={!canUseInbox || presenceLoading}
                            aria-label="وضعیت حضور"
                        >
                            <option value="online">آنلاین</option>
                            <option value="offline">آفلاین</option>
                        </select>
                    </label>

                    <button
                        className="btn secondary conversations-icon-action"
                        onClick={exportCsv}
                        type="button"
                        disabled={!canUseInbox}
                        aria-label="دریافت خروجی CSV"
                        title="دریافت خروجی CSV"
                    >
                        <ConversationIcon name="download" />
                        <span className="conversations-action-label">خروجی</span>
                    </button>

                    <button
                        className="btn secondary conversations-icon-action"
                        onClick={() => loadConversations(true)}
                        disabled={!canUseInbox || loading || refreshing}
                        type="button"
                        aria-label="بروزرسانی فهرست گفتگوها"
                    >
                        <ConversationIcon name="refresh" className={refreshing ? "is-spinning" : ""} />
                        <span className="conversations-action-label">{refreshing ? "در حال بروزرسانی" : "بروزرسانی"}</span>
                    </button>
                </div>
            }
        >
            <div className="conversations-page-shell">
                <section
                    className="conversations-inbox-card"
                    aria-labelledby="conversations-inbox-title"
                    aria-busy={loading || refreshing}
                >
                    <div className="conversations-filter-header">
                        <div>
                            <span className="conversations-section-kicker">صندوق اولویت‌دار</span>
                            <h2 id="conversations-inbox-title">گفتگوها</h2>
                            <p>سنجاق‌شده‌ها، موارد فوری و تازه‌ترین پیام‌ها در ابتدای فهرست قرار می‌گیرند.</p>
                        </div>
                        <div className="conversations-filter-summary">
                            <strong>{pagination.total}</strong>
                            <span>نتیجه</span>
                            <small>صفحه {pagination.page} از {pagination.pages}</small>
                            {activeFilterCount > 0 && <b>{activeFilterCount} فیلتر فعال</b>}
                        </div>
                    </div>

                    <div className="conversations-smart-queues" aria-label="صف‌های هوشمند گفتگو">
                        <span className="conversations-smart-label">نمای سریع</span>
                        <button type="button" className={activeQuickView === "all" ? "active" : ""} aria-pressed={activeQuickView === "all"} onClick={() => applyQuickView("all")}>
                            <ConversationIcon name="inbox" /> همه فعال‌ها
                        </button>
                        <button type="button" className={activeQuickView === "unread" ? "active" : ""} aria-pressed={activeQuickView === "unread"} onClick={() => applyQuickView("unread")}>
                            <ConversationIcon name="unread" /> خوانده‌نشده
                        </button>
                        <button type="button" className={activeQuickView === "unassigned" ? "active" : ""} aria-pressed={activeQuickView === "unassigned"} onClick={() => applyQuickView("unassigned")}>
                            <ConversationIcon name="userMinus" /> بدون مسئول
                        </button>
                        <button type="button" className={activeQuickView === "urgent" ? "active" : ""} aria-pressed={activeQuickView === "urgent"} onClick={() => applyQuickView("urgent")}>
                            <ConversationIcon name="urgent" /> فوری
                        </button>
                    </div>

                    <div className="phase4-search-row">
                        <label className="conversations-search-wrap">
                            <span>جست‌وجوی سراسری</span>
                            <div className="conversations-search-field">
                                <ConversationIcon name="search" />
                                <input
                                    className="input"
                                    value={filters.q}
                                    onChange={(event) => changeFilter("q", event.target.value)}
                                    placeholder="نام، پیام، فایل، ایمیل، تلفن یا شناسه گفتگو"
                                />
                                {filters.q && (
                                    <button type="button" onClick={() => changeFilter("q", "")} aria-label="پاک‌کردن جست‌وجو">
                                        <ConversationIcon name="close" />
                                    </button>
                                )}
                            </div>
                        </label>

                        <label className="conversations-compact-filter">
                            <span>وضعیت</span>
                            <select className="input" value={filters.status} onChange={(event) => changeFilter("status", event.target.value as StatusFilter)}>
                                {statusFilters.map((item) => <option key={item.value || "all"} value={item.value}>{item.label}</option>)}
                            </select>
                        </label>

                        <label className="conversations-compact-filter">
                            <span>نمایش</span>
                            <select className="input" value={filters.archived} onChange={(event) => changeFilter("archived", event.target.value as Filters["archived"])}>
                                <option value="0">گفتگوهای فعال</option>
                                <option value="1">آرشیوشده‌ها</option>
                                <option value="all">همه گفتگوها</option>
                            </select>
                        </label>

                        <button
                            className={`btn secondary conversations-filter-toggle ${showAdvanced ? "active" : ""}`}
                            type="button"
                            onClick={() => setShowAdvanced((value) => !value)}
                            aria-expanded={showAdvanced}
                            aria-controls="conversations-advanced-filters"
                        >
                            <ConversationIcon name="filter" />
                            <span>{showAdvanced ? "بستن فیلترها" : "فیلترهای بیشتر"}</span>
                            {activeFilterCount > 0 && <b>{activeFilterCount}</b>}
                        </button>

                        <button
                            className="btn secondary conversations-clear-btn"
                            type="button"
                            onClick={() => { setFilters(initialFilters); setPage(1); }}
                            disabled={activeFilterCount === 0}
                        >
                            <ConversationIcon name="eraser" />
                            پاک‌کردن
                        </button>
                    </div>

                    {notice && (
                        <div className="success conversations-notice" role="status" aria-live="polite">
                            {notice}
                        </div>
                    )}
                    {error && (
                        <div className="error conversations-notice" role="alert">
                            <span>{error}</span>
                            <button type="button" className="btn secondary" onClick={() => loadConversations(false)}>
                                تلاش دوباره
                            </button>
                        </div>
                    )}

                    {showAdvanced && (
                        <div className="phase4-advanced-filters" id="conversations-advanced-filters">
                            <label><span>اولویت</span><select className="input" value={filters.priority} onChange={(event) => changeFilter("priority", event.target.value as Priority)}><option value="">همه</option><option value="urgent">فوری</option><option value="high">بالا</option><option value="normal">عادی</option><option value="low">کم</option></select></label>
                            <label><span>پشتیبان</span><select className="input" value={filters.assigned_agent_id} onChange={(event) => changeFilter("assigned_agent_id", event.target.value)}><option value="">همه</option>{options.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
                            <label><span>دپارتمان</span><select className="input" value={filters.department_id} onChange={(event) => changeFilter("department_id", event.target.value)}><option value="">همه</option>{options.departments.filter((department) => !filters.site_id || department.site_id === Number(filters.site_id)).map((department) => <option key={department.id} value={department.id}>{department.name} · {department.site_name}</option>)}</select></label>
                            <label><span>سایت</span><select className="input" value={filters.site_id} onChange={(event) => changeSiteFilter(event.target.value)}><option value="">همه</option>{options.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
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
                        </div>
                    )}

                    {selectedIds.length > 0 && (
                        <div className="phase4-bulk-bar" aria-busy={bulkLoading}>
                            <div className="phase4-bulk-title">
                                <ConversationIcon name="checkSquare" />
                                <strong>{selectedIds.length} گفتگو انتخاب شده</strong>
                            </div>
                            <button type="button" className="btn secondary" disabled={bulkLoading} onClick={() => runBulkAction(filters.archived === "1" ? "unarchive" : "archive")}>
                                <ConversationIcon name="archive" />
                                {filters.archived === "1" ? "بازگردانی" : "آرشیو"}
                            </button>
                            <button type="button" className="btn secondary" disabled={bulkLoading} onClick={() => runBulkAction("pin")}>
                                <ConversationIcon name="pin" />
                                سنجاق
                            </button>
                            <select className="input" defaultValue="" disabled={bulkLoading} aria-label="تغییر اولویت گفتگوهای انتخاب‌شده" onChange={(event) => { if (event.target.value) void runBulkAction("priority", event.target.value); event.currentTarget.value = ""; }}><option value="">تغییر اولویت...</option><option value="urgent">فوری</option><option value="high">بالا</option><option value="normal">عادی</option><option value="low">کم</option></select>
                            <select className="input" defaultValue="" disabled={bulkLoading} aria-label="مسئول گفتگوهای انتخاب‌شده" onChange={(event) => { if (event.target.value) void runBulkAction("assign", event.target.value); event.currentTarget.value = ""; }}><option value="">اختصاص به...</option><option value="0">بدون مسئول</option>{options.agents.filter((agent) => agent.is_active).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
                            <select className="input" defaultValue="" disabled={bulkLoading || bulkDepartments.length === 0} aria-label="انتقال گفتگوهای انتخاب‌شده به دپارتمان" aria-describedby={bulkDepartmentHint ? "conversations-bulk-department-hint" : undefined} onChange={(event) => { if (event.target.value) void runBulkAction("department", event.target.value); event.currentTarget.value = ""; }}><option value="">انتقال دپارتمان...</option>{bulkDepartments.map((department) => <option key={department.id} value={department.id}>{department.name} · {department.site_name}</option>)}</select>
                            <button type="button" className="btn secondary phase4-bulk-cancel" disabled={bulkLoading} onClick={() => setSelectedIds([])}>
                                <ConversationIcon name="close" />
                                لغو انتخاب
                            </button>
                            {bulkDepartmentHint && (
                                <p className="phase4-bulk-help" id="conversations-bulk-department-hint">{bulkDepartmentHint}</p>
                            )}
                        </div>
                    )}

                    {loading ? (
                        <div className="conversations-skeleton-list">
                            {[1, 2, 3, 4].map((item) => <div key={item} className="conversations-skeleton-row" />)}
                        </div>
                    ) : error && conversations.length === 0 ? null : conversations.length === 0 ? (
                        <div className="conversations-empty-state">
                            <div className="conversations-empty-icon"><ConversationIcon name="search" /></div>
                            <h3>گفتگویی پیدا نشد</h3>
                            <p className="muted">عبارت جست‌وجو یا فیلترهای انتخاب‌شده را تغییر دهید.</p>
                            {activeFilterCount > 0 && (
                                <button className="btn secondary" type="button" onClick={() => { setFilters(initialFilters); setPage(1); }}>
                                    پاک‌کردن همه فیلترها
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="conversations-table">
                            <div className="conversations-table-head phase4-table-head">
                                <span><input type="checkbox" checked={allSelected} disabled={bulkLoading} onChange={(event) => setSelectedIds(event.target.checked ? conversations.map((item) => item.id) : [])} aria-label="انتخاب همه گفتگوهای این صفحه" /></span>
                                <span>مخاطب و پیام</span>
                                <span>وضعیت</span>
                                <span>مسئول</span>
                                <span>آخرین فعالیت</span>
                            </div>

                            {conversations.map((conversation) => {
                                const visitorName = conversation.visitor.name || "کاربر بدون نام";
                                return (
                                    <article
                                        key={conversation.id}
                                        className={[
                                            "conversations-row",
                                            "phase4-conversation-row",
                                            conversation.has_unread ? "unread" : "",
                                            conversation.has_unread_mention ? "mentioned" : "",
                                            conversation.is_pinned ? "pinned" : "",
                                            `priority-${conversation.priority}`,
                                        ].filter(Boolean).join(" ")}
                                    >
                                        <div className="phase4-select-cell">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(conversation.id)}
                                                disabled={bulkLoading}
                                                onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, conversation.id] : current.filter((id) => id !== conversation.id))}
                                                aria-label={`انتخاب گفتگوی ${visitorName}`}
                                            />
                                        </div>

                                        <Link
                                            className="conversation-cell-main conversation-row-link"
                                            href={`/conversations/${conversation.id}`}
                                            prefetch={false}
                                            aria-label={`باز کردن گفتگوی ${visitorName} با شناسه ${conversation.id}`}
                                        >
                                            <div className="conversation-avatar-wrap">
                                                <div className="conversation-list-avatar">{getInitials(visitorName)}</div>
                                                <span className={conversation.visitor.is_online ? "conversation-presence online" : "conversation-presence"} />
                                            </div>
                                            <div className="conversation-main-content">
                                                <div className="conversation-title-row">
                                                    <strong>{visitorName}</strong>
                                                    <span className="conversation-id"><bdi>#{conversation.id}</bdi></span>
                                                    {conversation.is_pinned && <b className="phase4-pin-badge"><ConversationIcon name="pin" /></b>}
                                                    {conversation.has_unread && <b className="conversation-unread-badge">{conversation.unread_count} جدید</b>}
                                                    {conversation.has_unread_mention && <b className="mention-badge">منشن شما</b>}
                                                </div>
                                                <p>{truncateText(conversation.last_message || "هنوز پیامی ثبت نشده است.", 130)}</p>
                                                <div className="conversation-message-meta">
                                                    <span>{conversation.site.name}</span>
                                                    {(conversation.visitor.phone || conversation.visitor.email) && (
                                                        <span className="conversation-contact-value" dir="ltr">
                                                            {conversation.visitor.phone || conversation.visitor.email}
                                                        </span>
                                                    )}
                                                    {conversation.queue_status === "waiting" && <b className="phase5-queue-badge">صف {conversation.queue_position || "-"}</b>}
                                                    {conversation.message_count > 0 && <span><ConversationIcon name="messages" /> {conversation.message_count}</span>}
                                                    {conversation.attachment_count > 0 && <span><ConversationIcon name="paperclip" /> {conversation.attachment_count}</span>}
                                                    {conversation.has_voice && <span>صوت</span>}
                                                    {conversation.has_internal_note && <span>یادداشت</span>}
                                                </div>
                                            </div>
                                        </Link>

                                        <div className="conversation-cell-status">
                                            <StatusBadge status={conversation.status} />
                                            <PriorityBadge priority={conversation.priority} />
                                        </div>

                                        <div className="conversation-cell-agent">
                                            {conversation.assigned_agent ? (
                                                <>
                                                    <strong>{conversation.assigned_agent.name}</strong>
                                                    <span>{conversation.assigned_agent.email}</span>
                                                </>
                                            ) : (
                                                <span className="conversation-unassigned"><ConversationIcon name="userMinus" /> بدون مسئول</span>
                                            )}
                                            {conversation.department && (
                                                <b className="phase5-department-badge" style={{ borderColor: conversation.department.color, color: conversation.department.color }}>
                                                    {conversation.department.name}
                                                </b>
                                            )}
                                        </div>

                                        <div className="conversation-cell-activity">
                                            <time dateTime={conversation.last_message_at || undefined} dir="ltr">
                                                {formatDateTime(conversation.last_message_at)}
                                            </time>
                                            <div className="conversation-cell-action phase4-row-actions">
                                                <button
                                                    type="button"
                                                    className={`phase4-icon-btn ${conversation.is_pinned ? "active" : ""}`}
                                                    title={conversation.is_pinned ? "برداشتن سنجاق" : "سنجاق‌کردن"}
                                                    aria-label={conversation.is_pinned ? "برداشتن سنجاق" : "سنجاق‌کردن"}
                                                    disabled={bulkLoading}
                                                    onClick={() => updateManagement(conversation.id, { is_pinned: !conversation.is_pinned })}
                                                >
                                                    <ConversationIcon name="pin" />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="phase4-icon-btn"
                                                    title={conversation.is_archived ? "بازگردانی" : "آرشیو"}
                                                    aria-label={conversation.is_archived ? "بازگردانی" : "آرشیو"}
                                                    disabled={bulkLoading}
                                                    onClick={() => updateManagement(conversation.id, { is_archived: !conversation.is_archived })}
                                                >
                                                    <ConversationIcon name={conversation.is_archived ? "restore" : "archive"} />
                                                </button>
                                            </div>
                                            <span className="conversation-open-indicator" aria-hidden="true">
                                                <ConversationIcon name="arrowLeft" />
                                            </span>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}

                    {pagination.pages > 1 && (
                        <div className="phase4-pagination">
                            <button type="button" className="btn secondary" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                                <ConversationIcon name="arrowRight" />
                                قبلی
                            </button>
                            <span>صفحه {pagination.page} از {pagination.pages} · {pagination.total} نتیجه</span>
                            <button type="button" className="btn secondary" disabled={loading || page >= pagination.pages} onClick={() => setPage((value) => Math.min(pagination.pages, value + 1))}>
                                بعدی
                                <ConversationIcon name="arrowLeft" />
                            </button>
                        </div>
                    )}
                </section>
            </div>
        </AppShell>
    );
}

type ConversationIconName =
    | "archive"
    | "arrowLeft"
    | "arrowRight"
    | "bell"
    | "bellOff"
    | "checkSquare"
    | "close"
    | "download"
    | "eraser"
    | "filter"
    | "inbox"
    | "messages"
    | "paperclip"
    | "pin"
    | "refresh"
    | "restore"
    | "search"
    | "unread"
    | "urgent"
    | "userMinus";

function ConversationIcon({ name, className = "" }: { name: ConversationIconName; className?: string }) {
    const paths: Record<ConversationIconName, ReactNode> = {
        archive: <><path d="M4 7h16"/><path d="M5 7l1 13h12l1-13"/><path d="M9 11h6"/><path d="M4 4h16v3H4z"/></>,
        arrowLeft: <><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></>,
        arrowRight: <><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></>,
        bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
        bellOff: <><path d="m2 2 20 20"/><path d="M6.3 6.3A6 6 0 0 0 6 8c0 7-3 7-3 9h14"/><path d="M18 13.7V8a6 6 0 0 0-8.5-5.5"/><path d="M10 21h4"/></>,
        checkSquare: <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/></>,
        close: <><path d="m6 6 12 12"/><path d="m18 6-12 12"/></>,
        download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
        eraser: <><path d="m7 21-4-4L15 5l4 4L7 21Z"/><path d="m11 9 4 4"/><path d="M7 21h12"/></>,
        filter: <><path d="M4 5h16"/><path d="M7 12h10"/><path d="M10 19h4"/></>,
        inbox: <><path d="M4 4h16v16H4z"/><path d="M4 14h4l2 3h4l2-3h4"/></>,
        messages: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8"/><path d="M8 13h5"/></>,
        paperclip: <path d="m20 11.5-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>,
        pin: <><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 15v6"/></>,
        refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9"/><path d="M5.5 15A7 7 0 0 0 18 17.5l2-2.5"/></>,
        restore: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></>,
        search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
        unread: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/><circle cx="18" cy="6" r="3"/></>,
        urgent: <><path d="M12 3 2.5 20h19z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
        userMinus: <><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M17 11h5"/></>,
    };

    return (
        <svg className={`conversation-ui-icon ${className}`.trim()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {paths[name]}
        </svg>
    );
}

function StatusBadge({ status }: { status: string }) {
    return <span className={`conversation-status-badge status-${status}`}>{statusLabels[status] || status}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
    return <span className={`phase4-priority-badge priority-${priority}`}>{priorityLabels[priority] || priority}</span>;
}

function FilterCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
    return (
        <label className={`phase4-filter-check ${checked ? "active" : ""}`}>
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
            <span>{label}</span>
        </label>
    );
}

function getInitials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "؟";
    return parts.slice(0, 2).map((part) => part.charAt(0)).join("");
}

function formatDateTime(value: string | null) {
    if (!value) return "زمان ثبت نشده";
    const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function truncateText(text: string, maxLength: number) {
    return text.length <= maxLength ? text : `${text.slice(0, maxLength).trim()}...`;
}
