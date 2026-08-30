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

const roleLabels: Record<UserRole, string> = {
    super_admin: "سوپر ادمین",
    customer_admin: "مدیر مشتری",
    agent: "پشتیبان",
};

export default function DashboardPage() {
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

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
        return conversations.slice(0, 6);
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

            setConversations(data.conversations || []);
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

    return (
        <AppShell
            title="داشبورد"
            kicker="Customer Panel"
            description="نمای عملیاتی گفتگوها، پیام‌های جدید و مسیرهای اصلی مدیریت پشتیبانی"
            actions={
                <button className="btn secondary" onClick={loadDashboardData} disabled={loading}>
                    {loading ? "در حال بروزرسانی..." : "بروزرسانی"}
                </button>
            }
        >
            <div className="dashboard-page-shell">
                <CustomerAnnouncementsWidget />

                {error && <div className="error">{error}</div>}

                <section className="dashboard-command-card">
                    <div className="dashboard-command-copy">
                        <span className="dashboard-eyebrow">Support Workspace</span>

                        <h2>تمرکز امروز: پیام‌های جدید، گفتگوهای فعال و پیگیری‌های باز</h2>

                        <p>
                            این صفحه برای تصمیم سریع طراحی شده است: اول وضعیت کلی را ببین،
                            بعد وارد گفتگوهای مهم شو یا مسیرهای مدیریتی را باز کن.
                        </p>

                        <div className="dashboard-command-actions">
                            <Link className="btn" href="/conversations">
                                ورود به Inbox
                            </Link>

                            {user.role === "customer_admin" && (
                                <Link className="btn secondary" href="/ai-center">
                                    مرکز AI
                                </Link>
                            )}

                            <Link className="btn secondary" href="/announcements">
                                اعلان‌ها
                            </Link>
                        </div>
                    </div>

                    <div className="dashboard-focus-card">
                        <div className="dashboard-focus-head">
                            <span><i /> اولویت پاسخ‌گویی</span>
                            <b>{roleLabels[user.role]}</b>
                        </div>

                        <div className="dashboard-focus-body">
                            <div className={stats.unreadConversations > 0 ? "dashboard-focus-orbit has-work" : "dashboard-focus-orbit"}>
                                <strong>{loading ? "..." : stats.unreadConversations}</strong>
                                <span>گفتگو با پیام جدید</span>
                            </div>

                            <div className="dashboard-focus-metrics">
                                <span><b>{loading ? "..." : stats.unreadMessages}</b> پیام تازه</span>
                                <span><b>{loading ? "..." : stats.followUp}</b> نیازمند پیگیری</span>
                                <span><b>{loading ? "..." : stats.active}</b> گفتگوی فعال</span>
                            </div>
                        </div>

                        <Link className="dashboard-focus-link" href="/conversations">
                            شروع رسیدگی به پیام‌ها
                            <DashboardIcon name="arrow" />
                        </Link>
                    </div>
                </section>

                <section className="dashboard-kpi-strip">
                    <DashboardKpiCard
                        icon="messages"
                        label="کل گفتگوها"
                        value={loading ? "..." : stats.total}
                        hint="همه گفتگوهای قابل دسترسی"
                    />
                    <DashboardKpiCard
                        icon="activity"
                        label="فعال"
                        value={loading ? "..." : stats.active}
                        hint="باز، جدید، در حال انجام یا pending"
                        tone="primary"
                    />
                    <DashboardKpiCard
                        icon="unread"
                        label="پیام جدید"
                        value={loading ? "..." : stats.unreadMessages}
                        hint="مجموع پیام‌های خوانده‌نشده"
                        tone={stats.unreadMessages > 0 ? "danger" : "default"}
                    />
                    <DashboardKpiCard
                        icon="follow"
                        label="نیاز به پیگیری"
                        value={loading ? "..." : stats.followUp}
                        hint="گفتگوهای follow_up"
                        tone={stats.followUp > 0 ? "warning" : "default"}
                    />
                    <DashboardKpiCard
                        icon="check"
                        label="بسته‌شده"
                        value={loading ? "..." : stats.closed}
                        hint="گفتگوهای تکمیل‌شده"
                        tone="success"
                    />
                </section>

                <div className="dashboard-main-grid">
                    <section className="dashboard-panel dashboard-inbox-panel">
                        <div className="dashboard-panel-head">
                            <div>
                                <span className="dashboard-section-kicker">Inbox</span>
                                <h2>آخرین گفتگوها</h2>
                                <p className="muted">۶ گفتگوی آخر برای شروع سریع کار روزانه.</p>
                            </div>

                            <Link className="btn secondary" href="/conversations">
                                مشاهده همه
                            </Link>
                        </div>

                        {loading ? (
                            <div className="dashboard-loading-list">
                                {[1, 2, 3].map((item) => (
                                    <div key={item} className="dashboard-skeleton-row" />
                                ))}
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
                                        <div className="dashboard-inbox-avatar" aria-hidden="true">
                                            <DashboardIcon name="messages" />
                                        </div>

                                        <div className="dashboard-inbox-main">
                                            <div className="dashboard-inbox-title-row">
                                                <strong>گفتگو #{conversation.id}</strong>
                                                <StatusPill status={conversation.status} />
                                            </div>

                                            <p>
                                                {truncateText(
                                                    conversation.last_message || "بدون پیام",
                                                    110
                                                )}
                                            </p>

                                            <span>
                                                آخرین پیام: {formatDateTime(conversation.last_message_at)}
                                            </span>
                                        </div>

                                        <div className="dashboard-inbox-meta">
                                            {conversation.has_unread ? (
                                                <b>{conversation.unread_count}</b>
                                            ) : (
                                                <span>بدون پیام جدید</span>
                                            )}
                                            <DashboardIcon name="arrow" />
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </section>

                    <aside className="dashboard-side-stack">
                        <section className="dashboard-panel">
                            <div className="dashboard-panel-head compact">
                                <div>
                                    <span className="dashboard-section-kicker">Shortcuts</span>
                                    <h2>دسترسی سریع</h2>
                                </div>
                            </div>

                            <div className="dashboard-shortcut-list-pro">
                                <DashboardShortcut icon="messages" href="/conversations" label="مدیریت گفتگوها" meta="Inbox و پاسخ‌گویی" />
                                <DashboardShortcut icon="bell" href="/announcements" label="اعلان‌ها" meta="پیام‌های سیستم" />

                                {user.role === "customer_admin" && (
                                    <>
                                        <DashboardShortcut icon="spark" href="/ai-center" label="مرکز AI" meta="دانش، خزش و تست" />
                                        <DashboardShortcut icon="widget" href="/widget-settings" label="تنظیمات ویجت" meta="ظاهر و رفتار ویجت" />
                                        <DashboardShortcut icon="quick" href="/quick-replies" label="پاسخ‌های آماده" meta="متن‌های پرتکرار" />
                                        <DashboardShortcut icon="users" href="/team" label="تیم پشتیبانی" meta="کاربران و دسترسی‌ها" />
                                    </>
                                )}
                            </div>
                        </section>

                        <section className="dashboard-panel">
                            <div className="dashboard-panel-head compact">
                                <div>
                                    <span className="dashboard-section-kicker">Workload</span>
                                    <h2>بار کاری گفتگوها</h2>
                                </div>
                            </div>

                            <div className="dashboard-workload-list">
                                {workloadRows.map((row) => (
                                    <DashboardWorkloadRow
                                        key={row.label}
                                        label={row.label}
                                        value={loading ? "..." : row.value}
                                        tone={row.tone}
                                    />
                                ))}
                            </div>

                            <div className="dashboard-note-card">
                                <strong>پیشنهاد عملیاتی</strong>
                                <p>
                                    اول پیام‌های خوانده‌نشده و گفتگوهای follow_up را بررسی کن،
                                    سپس گفتگوهای بدون پاسخ را ببند یا به پشتیبان مناسب بسپار.
                                </p>
                            </div>
                        </section>
                    </aside>
                </div>
            </div>
        </AppShell>
    );
}

function DashboardKpiCard({
                              icon,
                              value,
                              label,
                              hint,
                              tone = "default",
                          }: {
    icon: DashboardIconName;
    value: string | number;
    label: string;
    hint: string;
    tone?: "default" | "primary" | "success" | "warning" | "danger";
}) {
    return (
        <article className={`dashboard-kpi-card tone-${tone}`}>
            <div className="dashboard-kpi-topline">
                <span><DashboardIcon name={icon} /></span>
                <div className="dashboard-kpi-value">{value}</div>
            </div>
            <div className="dashboard-kpi-label">{label}</div>
            <p>{hint}</p>
        </article>
    );
}

function DashboardShortcut({
                               icon,
                               href,
                               label,
                               meta,
                           }: {
    icon: DashboardIconName;
    href: string;
    label: string;
    meta: string;
}) {
    return (
        <Link className="dashboard-shortcut-pro" href={href}>
            <span className="dashboard-shortcut-icon"><DashboardIcon name={icon} /></span>
            <div>
                <strong>{label}</strong>
                <span>{meta}</span>
            </div>
            <b><DashboardIcon name="arrow" /></b>
        </Link>
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
    | "bell"
    | "check"
    | "follow"
    | "messages"
    | "quick"
    | "spark"
    | "unread"
    | "users"
    | "widget";

function DashboardIcon({ name }: { name: DashboardIconName }) {
    const paths: Record<DashboardIconName, ReactNode> = {
        activity: <><path d="M4 13h4l2.2-6 3.2 11 2.1-5H20"/><path d="M4 4v16h16"/></>,
        arrow: <><path d="M19 12H5"/><path d="m11 18-6-6 6-6"/></>,
        bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
        check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
        follow: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8"/><path d="M4 4v4h4"/><path d="M12 8v5l3 2"/></>,
        messages: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></>,
        quick: <><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></>,
        spark: <><path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></>,
        unread: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/><circle cx="18" cy="6" r="3"/></>,
        users: <><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 6"/></>,
        widget: <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12"/></>,
    };

    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {paths[name]}
        </svg>
    );
}
