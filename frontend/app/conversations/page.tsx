// مسیر فایل: ai-chat-saas/frontend/app/conversations/page.tsx
// هدف: Inbox حرفه‌ای، فشرده و قابل اسکن برای مدیریت گفتگوها

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";
import { useMessageNotifications } from "@/hooks/useMessageNotifications";

type StatusFilter =
    | ""
    | "new"
    | "open"
    | "in_progress"
    | "waiting_customer"
    | "follow_up"
    | "pending"
    | "closed";

type Conversation = {
    id: number;
    status: string;
    assigned_agent: {
        id: number;
        name: string;
        email: string;
    } | null;
    site: {
        id: number;
        name: string;
    };
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

const activeStatuses = [
    "open",
    "in_progress",
    "waiting_customer",
    "follow_up",
    "pending",
];

export default function ConversationsPage() {
    const router = useRouter();
    const messageNotifications = useMessageNotifications("AI Chat SaaS Panel");

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [status, setStatus] = useState<StatusFilter>("");
    const [search, setSearch] = useState("");

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

    const [newMessageNotice, setNewMessageNotice] = useState("");
    const [knownLastMessageMap, setKnownLastMessageMap] = useState<
        Record<number, string | null>
    >({});

    const [availabilityStatus, setAvailabilityStatus] = useState<
        "online" | "offline"
    >("online");
    const [presenceLoading, setPresenceLoading] = useState(false);

    const statusRef = useRef<StatusFilter>("");

    async function loadConversations(
        selectedStatus: StatusFilter = statusRef.current,
        silent = false
    ) {
        try {
            setError("");

            if (silent) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            const query = selectedStatus ? `?status=${selectedStatus}` : "";
            const data = await apiRequest(`/agent/conversations-list.php${query}`);

            const loadedConversations: Conversation[] = data.conversations || [];

            setConversations(loadedConversations);

            const totalUnread = loadedConversations.reduce(
                (sum, item) => sum + (item.unread_count || 0),
                0
            );
            messageNotifications.setUnreadTitle(totalUnread);

            setKnownLastMessageMap((prev) => {
                const next = { ...prev };
                let newestUnreadConversation: Conversation | null = null;

                for (const conversation of loadedConversations) {
                    const oldValue = prev[conversation.id];
                    const newValue = conversation.last_message_at;

                    if (
                        oldValue &&
                        newValue &&
                        oldValue !== newValue &&
                        conversation.has_unread
                    ) {
                        newestUnreadConversation = newestUnreadConversation || conversation;
                    }

                    next[conversation.id] = newValue;
                }

                if (newestUnreadConversation) {
                    const visitorName = newestUnreadConversation.visitor.name || "کاربر سایت";
                    const body = newestUnreadConversation.last_message || "پیام جدید دریافت شد.";
                    setNewMessageNotice(`پیام جدید از ${visitorName}`);
                    messageNotifications.notify({
                        title: `پیام جدید از ${visitorName}`,
                        body,
                        tag: `conversation-${newestUnreadConversation.id}`,
                        unreadCount: totalUnread,
                    });

                    window.setTimeout(() => setNewMessageNotice(""), 5000);
                }

                return next;
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت گفتگوها");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    async function loadPresenceStatus() {
        try {
            const data = await apiRequest("/agent/presence-status.php");

            setAvailabilityStatus(
                data.availability_status === "offline" ? "offline" : "online"
            );
        } catch {
            // خطای وضعیت آنلاین نباید لیست گفتگوها را خراب کند.
        }
    }

    async function updatePresenceStatus(nextStatus: "online" | "offline") {
        try {
            setPresenceLoading(true);
            setError("");

            const data = await apiRequest("/agent/presence-status.php", {
                method: "POST",
                body: JSON.stringify({
                    availability_status: nextStatus,
                }),
            });

            setAvailabilityStatus(
                data.availability_status === "offline" ? "offline" : "online"
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "تغییر وضعیت ناموفق بود");
        } finally {
            setPresenceLoading(false);
        }
    }

    useEffect(() => {
        const authUser = getAuthUser();

        if (!authUser) {
            router.push("/login");
            return;
        }

        loadConversations("", false);
        loadPresenceStatus();

        const timer = window.setInterval(() => {
            loadConversations(statusRef.current, true);
        }, 5000);

        return () => window.clearInterval(timer);
    }, [router]);

    async function handleStatusChange(nextStatus: StatusFilter) {
        statusRef.current = nextStatus;
        setStatus(nextStatus);

        await loadConversations(nextStatus, false);
    }

    const filteredConversations = useMemo(() => {
        const q = search.trim().toLowerCase();

        if (!q) {
            return conversations;
        }

        return conversations.filter((conversation) => {
            const values = [
                conversation.id,
                conversation.status,
                statusLabels[conversation.status],
                conversation.site.name,
                conversation.visitor.name,
                conversation.visitor.email,
                conversation.visitor.phone,
                conversation.last_message,
                conversation.source_page_title,
                conversation.assigned_agent?.name,
                conversation.assigned_agent?.email,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return values.includes(q);
        });
    }, [conversations, search]);

    const stats = useMemo(() => {
        return {
            total: conversations.length,
            newCount: conversations.filter((item) => item.status === "new").length,
            activeCount: conversations.filter((item) =>
                activeStatuses.includes(item.status)
            ).length,
            closedCount: conversations.filter((item) => item.status === "closed")
                .length,
            unassignedCount: conversations.filter((item) => !item.assigned_agent)
                .length,
            unreadCount: conversations.reduce((sum, item) => sum + (item.unread_count || 0), 0),
            unreadConversations: conversations.filter((item) => item.has_unread).length,
            unreadMentionCount: conversations.reduce(
                (sum, item) => sum + (item.unread_mention_count || 0),
                0
            ),
            mentionConversations: conversations.filter((item) => item.has_unread_mention).length,
            followUpCount: conversations.filter((item) => item.status === "follow_up").length,
        };
    }, [conversations]);

    const selectedStatusLabel =
        statusFilters.find((item) => item.value === status)?.label || "همه وضعیت‌ها";

    return (
        <AppShell
            title="گفتگوها"
            kicker="Inbox"
            description="مدیریت پیام‌های کاربران سایت، پاسخ‌گویی، پیگیری و ارجاع گفتگوها"
            actions={
                <div className="conversations-header-actions">
                    <button
                        className="btn secondary"
                        type="button"
                        onClick={() => messageNotifications.toggleSound()}
                        disabled={messageNotifications.loading}
                        title="روشن یا خاموش کردن صدای پیام جدید"
                    >
                        {messageNotifications.preferences.sound_enabled ? "🔔 صدا روشن" : "🔕 صدا خاموش"}
                    </button>

                    <button
                        className="btn secondary"
                        type="button"
                        onClick={() => messageNotifications.enableBrowserNotifications()}
                        disabled={messageNotifications.loading}
                        title="فعال‌کردن اعلان مرورگر"
                    >
                        {messageNotifications.preferences.browser_notifications_enabled ? "اعلان مرورگر فعال" : "فعال‌سازی اعلان"}
                    </button>

                    <div className={`presence-control ${availabilityStatus}`}>
                        <span className="presence-dot" />

                        <select
                            className="presence-select"
                            value={availabilityStatus}
                            onChange={(event) =>
                                updatePresenceStatus(
                                    event.target.value as "online" | "offline"
                                )
                            }
                            disabled={presenceLoading}
                        >
                            <option value="online">Online</option>
                            <option value="offline">Offline</option>
                        </select>
                    </div>

                    <button
                        className="btn secondary"
                        onClick={() => loadConversations(status, true)}
                        disabled={refreshing}
                    >
                        {refreshing ? "در حال بروزرسانی..." : "بروزرسانی"}
                    </button>
                </div>
            }
        >
            <div className="conversations-page-shell">
                <section className="conversations-command-card">
                    <div>
                        <span className="conversations-eyebrow">Conversation Inbox</span>
                        <h2>اولویت امروز را سریع پیدا کن</h2>
                        <p>
                            گفتگوهای دارای پیام جدید، بدون مسئول یا نیازمند پیگیری در همین
                            صفحه قابل تشخیص‌اند. از فیلتر وضعیت و جستجو برای کاهش شلوغی استفاده کن.
                        </p>
                    </div>

                    <div className="conversations-command-status">
                        <span>فیلتر فعال</span>
                        <strong>{selectedStatusLabel}</strong>
                        <small>
                            {filteredConversations.length} مورد از {conversations.length} گفتگو
                        </small>
                    </div>
                </section>

                <section className="conversations-kpi-strip">
                    <InboxKpi label="کل" value={stats.total} />
                    <InboxKpi label="جدید" value={stats.newCount} tone="primary" />
                    <InboxKpi label="فعال" value={stats.activeCount} tone="primary" />
                    <InboxKpi
                        label="پیام جدید"
                        value={stats.unreadCount}
                        tone={stats.unreadCount > 0 ? "danger" : "default"}
                    />
                    <InboxKpi
                        label="منشن من"
                        value={stats.unreadMentionCount}
                        tone={stats.unreadMentionCount > 0 ? "warning" : "default"}
                    />
                    <InboxKpi
                        label="بدون مسئول"
                        value={stats.unassignedCount}
                        tone={stats.unassignedCount > 0 ? "warning" : "default"}
                    />
                    <InboxKpi label="بسته‌شده" value={stats.closedCount} tone="success" />
                </section>

                {newMessageNotice && (
                    <div className="success conversations-notice">
                        <span>{newMessageNotice}</span>

                        <button
                            className="btn secondary"
                            type="button"
                            onClick={() => {
                                setNewMessageNotice("");

                                messageNotifications.setUnreadTitle(
                                    conversations.reduce((sum, item) => sum + (item.unread_count || 0), 0)
                                );
                            }}
                        >
                            بستن
                        </button>
                    </div>
                )}

                {error && <div className="error">{error}</div>}

                <section className="conversations-inbox-card">
                    <div className="conversations-filter-bar">
                        <div className="conversations-search-wrap">
                            <span>جستجو</span>
                            <input
                                className="input"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="نام، شماره، ایمیل، پیام، سایت یا پشتیبان..."
                            />
                        </div>

                        <div className="conversations-status-wrap">
                            <span>وضعیت</span>
                            <select
                                className="input"
                                value={status}
                                onChange={(event) =>
                                    handleStatusChange(event.target.value as StatusFilter)
                                }
                            >
                                {statusFilters.map((item) => (
                                    <option key={item.value || "all"} value={item.value}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="conversations-status-tabs">
                        {statusFilters.map((item) => (
                            <button
                                key={item.value || "all"}
                                type="button"
                                className={status === item.value ? "active" : ""}
                                onClick={() => handleStatusChange(item.value)}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className="conversations-skeleton-list">
                            {[1, 2, 3, 4].map((item) => (
                                <div key={item} className="conversations-skeleton-row" />
                            ))}
                        </div>
                    ) : filteredConversations.length === 0 ? (
                        <div className="conversations-empty-state">
                            <div>💬</div>
                            <h3>گفتگویی پیدا نشد</h3>
                            <p className="muted">
                                فیلتر یا عبارت جستجو را تغییر بده؛ یا از ویجت یک پیام تست ارسال کن.
                            </p>
                        </div>
                    ) : (
                        <div className="conversations-table">
                            <div className="conversations-table-head">
                                <span>کاربر و پیام</span>
                                <span>وضعیت</span>
                                <span>مسئول</span>
                                <span>سایت / تماس</span>
                                <span>عملیات</span>
                            </div>

                            {filteredConversations.map((conversation) => {
                                const contact =
                                    conversation.visitor.phone ||
                                    conversation.visitor.email ||
                                    "اطلاعات تماس ثبت نشده";

                                return (
                                    <article
                                        key={conversation.id}
                                        className={[
                                            "conversations-row",
                                            conversation.has_unread ? "unread" : "",
                                            conversation.has_unread_mention ? "mentioned" : "",
                                        ]
                                            .filter(Boolean)
                                            .join(" ")}
                                        onClick={() => router.push(`/conversations/${conversation.id}`)}
                                    >
                                        <div className="conversation-cell-main">
                                            <div className="conversation-title-row">
                                                <strong>
                                                    {conversation.visitor.name || "کاربر بدون نام"}
                                                </strong>

                                                <span>#{conversation.id}</span>

                                                <span className={conversation.visitor.is_online ? "conversation-visitor-online" : "conversation-visitor-offline"}>
                                                    {conversation.visitor.is_online ? "● آنلاین" : "آفلاین"}
                                                </span>

                                                {conversation.has_unread && (
                                                    <b>{conversation.unread_count} جدید</b>
                                                )}

                                                {conversation.has_unread_mention && (
                                                    <b className="mention-badge">
                                                        @ {conversation.unread_mention_count} منشن
                                                    </b>
                                                )}
                                            </div>

                                            <p>
                                                {truncateText(
                                                    conversation.last_message || "بدون پیام",
                                                    120
                                                )}
                                            </p>

                                            <small>
                                                آخرین پیام: {conversation.last_message_at || "ثبت نشده"}
                                            </small>
                                        </div>

                                        <div className="conversation-cell-status">
                                            <StatusBadge status={conversation.status} />
                                        </div>

                                        <div className="conversation-cell-agent">
                                            {conversation.assigned_agent ? (
                                                <>
                                                    <strong>{conversation.assigned_agent.name}</strong>
                                                    <span>{conversation.assigned_agent.email}</span>
                                                </>
                                            ) : (
                                                <span className="conversation-unassigned">بدون مسئول</span>
                                            )}
                                        </div>

                                        <div className="conversation-cell-contact">
                                            <strong>{conversation.site.name}</strong>
                                            <span>{contact}</span>
                                            {conversation.source_page_title && (
                                                <small>{conversation.source_page_title}</small>
                                            )}
                                        </div>

                                        <div className="conversation-cell-action">
                                            <button
                                                className="btn secondary"
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    router.push(`/conversations/${conversation.id}`);
                                                }}
                                            >
                                                باز کردن
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </AppShell>
    );
}

function InboxKpi({
                      label,
                      value,
                      tone = "default",
                  }: {
    label: string;
    value: string | number;
    tone?: "default" | "primary" | "success" | "warning" | "danger";
}) {
    return (
        <article className={`conversations-kpi tone-${tone}`}>
            <strong>{value}</strong>
            <span>{label}</span>
        </article>
    );
}

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`conversation-status-badge status-${status}`}>
            {statusLabels[status] || status}
        </span>
    );
}

function truncateText(text: string, maxLength: number) {
    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength).trim()}...`;
}
