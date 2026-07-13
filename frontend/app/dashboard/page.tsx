// مسیر فایل: ai-chat-saas/frontend/app/dashboard/page.tsx
// هدف: داشبورد عملیاتی، فشرده و قابل اسکن برای customer_admin و agent

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

                    <div className="dashboard-health-card">
                        <div className="dashboard-health-header">
                            <span className="dashboard-live-dot" />
                            <strong>وضعیت کاری</strong>
                        </div>

                        <DashboardHealthRow label="حساب" value={roleLabels[user.role]} />
                        <DashboardHealthRow
                            label="گفتگوهای فعال"
                            value={loading ? "..." : stats.active}
                        />
                        <DashboardHealthRow
                            label="گفتگوهای دارای پیام جدید"
                            value={loading ? "..." : stats.unreadConversations}
                        />
                        <DashboardHealthRow
                            label="پیام‌های خوانده‌نشده"
                            value={loading ? "..." : stats.unreadMessages}
                            highlight={stats.unreadMessages > 0}
                        />
                    </div>
                </section>

                <section className="dashboard-kpi-strip">
                    <DashboardKpiCard
                        label="کل گفتگوها"
                        value={loading ? "..." : stats.total}
                        hint="همه گفتگوهای قابل دسترسی"
                    />
                    <DashboardKpiCard
                        label="فعال"
                        value={loading ? "..." : stats.active}
                        hint="باز، جدید، در حال انجام یا pending"
                        tone="primary"
                    />
                    <DashboardKpiCard
                        label="پیام جدید"
                        value={loading ? "..." : stats.unreadMessages}
                        hint="مجموع پیام‌های خوانده‌نشده"
                        tone={stats.unreadMessages > 0 ? "danger" : "default"}
                    />
                    <DashboardKpiCard
                        label="نیاز به پیگیری"
                        value={loading ? "..." : stats.followUp}
                        hint="گفتگوهای follow_up"
                        tone={stats.followUp > 0 ? "warning" : "default"}
                    />
                    <DashboardKpiCard
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
                                                آخرین پیام: {conversation.last_message_at || "ثبت نشده"}
                                            </span>
                                        </div>

                                        <div className="dashboard-inbox-meta">
                                            {conversation.has_unread ? (
                                                <b>{conversation.unread_count}</b>
                                            ) : (
                                                <span>بدون پیام جدید</span>
                                            )}
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
                                <DashboardShortcut href="/conversations" label="مدیریت گفتگوها" meta="Inbox و پاسخ‌گویی" />
                                <DashboardShortcut href="/announcements" label="اعلان‌ها" meta="پیام‌های سیستم" />

                                {user.role === "customer_admin" && (
                                    <>
                                        <DashboardShortcut href="/ai-center" label="مرکز AI" meta="دانش، خزش و تست" />
                                        <DashboardShortcut href="/widget-settings" label="تنظیمات ویجت" meta="ظاهر و رفتار ویجت" />
                                        <DashboardShortcut href="/quick-replies" label="پاسخ‌های آماده" meta="متن‌های پرتکرار" />
                                        <DashboardShortcut href="/team" label="تیم پشتیبانی" meta="کاربران و دسترسی‌ها" />
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
                              value,
                              label,
                              hint,
                              tone = "default",
                          }: {
    value: string | number;
    label: string;
    hint: string;
    tone?: "default" | "primary" | "success" | "warning" | "danger";
}) {
    return (
        <article className={`dashboard-kpi-card tone-${tone}`}>
            <div className="dashboard-kpi-value">{value}</div>
            <div className="dashboard-kpi-label">{label}</div>
            <p>{hint}</p>
        </article>
    );
}

function DashboardHealthRow({
                                label,
                                value,
                                highlight = false,
                            }: {
    label: string;
    value: string | number;
    highlight?: boolean;
}) {
    return (
        <div className={`dashboard-health-row ${highlight ? "highlight" : ""}`}>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function DashboardShortcut({
                               href,
                               label,
                               meta,
                           }: {
    href: string;
    label: string;
    meta: string;
}) {
    return (
        <Link className="dashboard-shortcut-pro" href={href}>
            <div>
                <strong>{label}</strong>
                <span>{meta}</span>
            </div>
            <b>‹</b>
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
