// مسیر فایل: ai-chat-saas/frontend/app/dashboard/page.tsx
// هدف: داشبورد عملیاتی، فشرده و قابل اسکن برای customer_admin و agent

"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";
import CustomerAnnouncementsWidget from "@/components/CustomerAnnouncementsWidget";

type Conversation = {
    id: number;
    status: string;
    last_message: string | null;
    last_message_at: string | null;
    created_at: string;
    unread_count: number;
    has_unread: boolean;
};

type UserRole = "super_admin" | "customer_admin" | "agent";

type User = {
    name: string;
    email: string;
    role: UserRole;
};

const activeStatuses = [
    "new",
    "open",
    "in_progress",
    "waiting_customer",
    "follow_up",
    "pending",
];

const statusLabels: Record<string, string> = {
    new: "جدید",
    open: "باز",
    in_progress: "در حال انجام",
    waiting_customer: "در انتظار مشتری",
    follow_up: "نیاز به پیگیری",
    pending: "در انتظار",
    closed: "بسته‌شده",
};

export default function DashboardPage() {
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [totalAvailable, setTotalAvailable] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [hasLoadedData, setHasLoadedData] = useState(false);

    const stats = useMemo(() => {
        const total = conversations.length;

        const unreadMessages = conversations.reduce((sum, item) => {
            return sum + (item.unread_count || 0);
        }, 0);

        const unreadConversations = conversations.filter((item) => item.has_unread).length;

        const active = conversations.filter((item) =>
            activeStatuses.includes(item.status)
        ).length;

        const closed = conversations.filter((item) => item.status === "closed").length;

        const followUp = conversations.filter((item) => item.status === "follow_up").length;

        return {
            total,
            unreadMessages,
            unreadConversations,
            active,
            closed,
            followUp,
        };
    }, [conversations]);

    const recentConversations = useMemo(() => {
        return conversations.slice(0, 5);
    }, [conversations]);

    const workloadRows = useMemo(() => {
        return [
            {
                label: "جدید",
                value: conversations.filter((item) => item.status === "new").length,
                tone: "primary" as const,
            },
            {
                label: "در حال انجام",
                value: conversations.filter((item) => item.status === "in_progress").length,
                tone: "primary" as const,
            },
            {
                label: "در انتظار مشتری",
                value: conversations.filter((item) => item.status === "waiting_customer").length,
                tone: "warning" as const,
            },
            {
                label: "نیاز به پیگیری",
                value: conversations.filter((item) => item.status === "follow_up").length,
                tone: "danger" as const,
            },
        ];
    }, [conversations]);

    useEffect(() => {
        const authUser = getAuthUser();

        if (!authUser) {
            router.push("/login");
            return;
        }

        if (authUser.role === "super_admin") {
            router.push("/super-admin/dashboard");
            return;
        }

        setUser(authUser as User);
        loadDashboardData();
    }, [router]);

    async function loadDashboardData() {
        try {
            setLoading(true);
            setError("");

            const data = await apiRequest("/agent/conversations-list.php");
            const loadedConversations = Array.isArray(data.conversations)
                ? data.conversations
                : [];
            const paginationTotal = Number(data.pagination?.total);

            setConversations(loadedConversations);
            setTotalAvailable(
                Number.isFinite(paginationTotal)
                    ? Math.max(loadedConversations.length, paginationTotal)
                    : loadedConversations.length
            );
            setHasLoadedData(true);
        } catch (error: any) {
            setError(error.message || "خطا در دریافت اطلاعات داشبورد");
        } finally {
            setLoading(false);
        }
    }

    if (!user) {
        return (
            <main className="shell-loader">
                <div className="shell-loader-card">در حال بارگذاری...</div>
            </main>
        );
    }

    const normalizedName = typeof user.name === "string" ? user.name.trim() : "";
    const firstName = normalizedName.split(/\s+/)[0] || "همکار";
    const isInitialLoading = loading && !hasLoadedData;
    const dataUnavailable = Boolean(error) && !hasLoadedData;
    const showingStaleData = Boolean(error) && hasLoadedData;
    const displayStat = (value: number) => dataUnavailable ? "—" : isInitialLoading ? "..." : value;
    let priorityTitle = "در نمای فعلی پیام تازه‌ای باقی نمانده است";
    let priorityDescription = "در این نما پیام خوانده‌نشده‌ای باقی نمانده؛ می‌توانید گفتگوهای فعال را ادامه دهید.";

    if (dataUnavailable) {
        priorityTitle = "اطلاعات نمای امروز در دسترس نیست";
        priorityDescription = "دریافت اطلاعات ناموفق بود؛ از گزینه تلاش دوباره استفاده کنید.";
    } else if (showingStaleData) {
        priorityTitle = stats.unreadConversations > 0
            ? `${stats.unreadConversations} گفتگوی خوانده‌نشده در آخرین نمای دریافت‌شده دارید`
            : "آخرین نمای دریافت‌شده پیام تازه‌ای ندارد";
        priorityDescription = "آخرین اطلاعات سالم نمایش داده می‌شود؛ برای دریافت وضعیت تازه دوباره تلاش کنید.";
    } else if (isInitialLoading) {
        priorityTitle = "در حال آماده‌سازی نمای امروز";
        priorityDescription = "اطلاعات گفتگوها در حال دریافت است.";
    } else if (loading) {
        priorityTitle = "در حال بروزرسانی اطلاعات";
        priorityDescription = "تا پایان بروزرسانی، آخرین اطلاعات دریافت‌شده نمایش داده می‌شود.";
    } else if (stats.unreadConversations > 0) {
        priorityTitle = `${stats.unreadConversations} گفتگوی خوانده‌نشده در نمای فعلی دارید`;
        priorityDescription = `در همین نما ${stats.unreadMessages} پیام تازه دارید؛ ابتدا موارد خوانده‌نشده و پیگیری‌ها را بررسی کنید.`;
    }

    return (
        <AppShell title="داشبورد">
            <div className="dashboard-page-shell">
                {error && (
                    <div className="error dashboard-error" role="alert">
                        <span>{error}</span>
                        <button
                            className="btn secondary"
                            type="button"
                            onClick={loadDashboardData}
                            disabled={loading}
                        >
                            تلاش دوباره
                        </button>
                    </div>
                )}

                <section
                    className="dashboard-summary-card"
                    aria-labelledby="dashboard-today-title"
                    aria-busy={loading}
                >
                    <div className="dashboard-summary-copy" aria-live="polite">
                        <span className="dashboard-eyebrow"><i /> وضعیت امروز</span>
                        <h2 id="dashboard-today-title">سلام {firstName}، {priorityTitle}</h2>
                        <p>{priorityDescription}</p>
                        <small>
                            {dataUnavailable
                                ? "اطلاعات نمای فعلی دریافت نشد"
                                : loading
                                    ? "در حال بروزرسانی"
                                    : totalAvailable > stats.total
                                        ? `${stats.total} گفتگو در نمای فعلی از ${totalAvailable} گفتگو`
                                        : `${stats.total} گفتگو در نمای فعلی`}
                        </small>
                    </div>

                    <div className="dashboard-summary-actions">
                        <Link className="dashboard-summary-action" href="/conversations">
                            <span>صندوق گفتگوها</span>
                            <DashboardIcon name="arrow" />
                        </Link>

                        <button
                            className={`dashboard-summary-refresh ${loading ? "is-loading" : ""}`}
                            type="button"
                            onClick={loadDashboardData}
                            disabled={loading}
                            aria-busy={loading}
                            aria-label="بروزرسانی داشبورد"
                            title="بروزرسانی داشبورد"
                        >
                            <DashboardIcon name="refresh" />
                            <span>بروزرسانی</span>
                        </button>
                    </div>

                    <div
                        className="dashboard-summary-metrics"
                        role="list"
                        aria-label="خلاصه وضعیت گفتگوهای نمای فعلی"
                    >
                        <DashboardSummaryMetric
                            icon="unread"
                            label="گفتگوی خوانده‌نشده"
                            value={displayStat(stats.unreadConversations)}
                            meta={isInitialLoading || dataUnavailable ? "" : `${stats.unreadMessages} پیام تازه`}
                            tone={!dataUnavailable && stats.unreadConversations > 0 ? "attention" : "default"}
                        />
                        <DashboardSummaryMetric
                            icon="activity"
                            label="گفتگوی فعال"
                            value={displayStat(stats.active)}
                        />
                        <DashboardSummaryMetric
                            icon="follow"
                            label="نیاز به پیگیری"
                            value={displayStat(stats.followUp)}
                            tone={!dataUnavailable && stats.followUp > 0 ? "warning" : "default"}
                        />
                        <DashboardSummaryMetric
                            icon="check"
                            label="بسته‌شده"
                            value={displayStat(stats.closed)}
                            tone={dataUnavailable ? "default" : "success"}
                        />
                    </div>
                </section>

                <CustomerAnnouncementsWidget />

                <div className="dashboard-main-grid">
                    <section
                        className="dashboard-panel dashboard-inbox-panel"
                        aria-labelledby="dashboard-conversations-title"
                        aria-busy={loading}
                    >
                        <div className="dashboard-panel-head">
                            <div>
                                <span className="dashboard-section-kicker">صندوق کار</span>
                                <h2 id="dashboard-conversations-title">گفتگوهای اولویت‌دار و اخیر</h2>
                                <p className="muted">موارد مهم برای ادامه سریع کار روزانه</p>
                            </div>

                            <Link className="btn secondary" href="/conversations">
                                مشاهده همه
                            </Link>
                        </div>

                        {isInitialLoading ? (
                            <div className="dashboard-loading-list">
                                {[1, 2, 3].map((item) => (
                                    <div key={item} className="dashboard-skeleton-row" />
                                ))}
                            </div>
                        ) : dataUnavailable ? (
                            <div className="empty-soft">
                                فهرست گفتگوها در حال حاضر در دسترس نیست.
                            </div>
                        ) : recentConversations.length === 0 ? (
                            <div className="empty-soft">
                                هنوز گفتگویی برای نمایش وجود ندارد.
                            </div>
                        ) : (
                            <div className="dashboard-inbox-list">
                                {recentConversations.map((conversation) => (
                                    <Link
                                        key={conversation.id}
                                        href={`/conversations/${conversation.id}`}
                                        className={`dashboard-inbox-item ${
                                            conversation.has_unread ? "unread" : ""
                                        }`}
                                    >
                                        <div className="dashboard-inbox-main">
                                            <div className="dashboard-inbox-title-row">
                                                <strong>
                                                    گفتگو <bdi>#{conversation.id}</bdi>
                                                </strong>
                                                <StatusPill status={conversation.status} />
                                            </div>

                                            <p>
                                                {truncateText(
                                                    conversation.last_message || "بدون پیام",
                                                    110
                                                )}
                                            </p>

                                            <span>
                                                {formatDateTime(conversation.last_message_at)}
                                            </span>
                                        </div>

                                        <div className="dashboard-inbox-meta">
                                            {conversation.has_unread ? (
                                                <b>{conversation.unread_count}</b>
                                            ) : null}
                                            <DashboardIcon name="arrow" />
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </section>

                    <aside
                        className="dashboard-panel dashboard-work-center"
                        aria-labelledby="dashboard-queue-title"
                        aria-busy={loading}
                    >
                        <div className="dashboard-panel-head compact">
                            <div>
                                <span className="dashboard-section-kicker">نمای کاری</span>
                                <h2 id="dashboard-queue-title">وضعیت همین نما</h2>
                            </div>
                            <Link className="dashboard-text-link" href="/conversations">جزئیات</Link>
                        </div>

                        <div className="dashboard-workload-list">
                            {workloadRows.map((row) => (
                                <DashboardWorkloadRow
                                    key={row.label}
                                    label={row.label}
                                    value={displayStat(row.value)}
                                    tone={row.tone}
                                />
                            ))}
                        </div>

                    </aside>
                </div>
            </div>
        </AppShell>
    );
}

function DashboardSummaryMetric({
                                    icon,
                                    value,
                                    label,
                                    meta,
                                    tone = "default",
                                }: {
    icon: DashboardIconName;
    value: string | number;
    label: string;
    meta?: string;
    tone?: "default" | "attention" | "success" | "warning";
}) {
    return (
        <article className={`dashboard-summary-metric tone-${tone}`} role="listitem">
            <span><DashboardIcon name={icon} /></span>
            <div>
                <strong>{value}</strong>
                <p>{label}</p>
                {meta && <small>{meta}</small>}
            </div>
        </article>
    );
}

function DashboardWorkloadRow({
                                  label,
                                  value,
                                  tone,
                              }: {
    label: string;
    value: string | number;
    tone: "primary" | "warning" | "danger";
}) {
    return (
        <div className={`dashboard-workload-row tone-${tone}`}>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function StatusPill({ status }: { status: string }) {
    return (
        <span className={`dashboard-status-pill status-${status}`}>
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

function formatDateTime(value: string | null) {
    if (!value) return "ثبت نشده";
    const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("fa-IR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

type DashboardIconName =
    | "activity"
    | "arrow"
    | "check"
    | "follow"
    | "refresh"
    | "unread";

function DashboardIcon({ name }: { name: DashboardIconName }) {
    const paths: Record<DashboardIconName, ReactNode> = {
        activity: <><path d="M4 13h4l2.2-6 3.2 11 2.1-5H20"/><path d="M4 4v16h16"/></>,
        arrow: <><path d="M19 12H5"/><path d="m11 18-6-6 6-6"/></>,
        check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
        follow: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8"/><path d="M4 4v4h4"/><path d="M12 8v5l3 2"/></>,
        refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></>,
        unread: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/><circle cx="18" cy="6" r="3"/></>,
    };

    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {paths[name]}
        </svg>
    );
}
