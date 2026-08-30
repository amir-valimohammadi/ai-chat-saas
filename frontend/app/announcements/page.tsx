"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type Announcement = {
    id: number;
    title: string;
    body: string;
    type: "info" | "warning" | "discount" | "update" | "danger";
    priority: "low" | "medium" | "high" | "critical";
    cta_label: string | null;
    cta_url: string | null;
    is_dismissible: boolean;
    is_read: boolean;
    is_dismissed: boolean;
    created_at: string;
};

const typeLabels: Record<Announcement["type"], string> = {
    info: "اطلاع‌رسانی",
    warning: "هشدار",
    discount: "پیشنهاد ویژه",
    update: "بروزرسانی",
    danger: "مهم",
};

const priorityLabels: Record<Announcement["priority"], string> = {
    low: "عادی",
    medium: "متوسط",
    high: "مهم",
    critical: "فوری",
};

function formatAnnouncementDate(value: string) {
    const date = new Date(value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat("fa-IR", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

function BellIcon({ compact = false }: { compact?: boolean }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={compact ? "is-compact" : undefined}>
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M10 21h4" />
        </svg>
    );
}

export default function CustomerAnnouncementsPage() {
    const [items, setItems] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");

    const summary = useMemo(() => ({
        total: items.length,
        unread: items.filter((item) => !item.is_read && !item.is_dismissed).length,
        important: items.filter((item) => ["high", "critical"].includes(item.priority)).length,
    }), [items]);

    useEffect(() => {
        const user = getAuthUser();

        if (!user) {
            window.location.href = "/login";
            return;
        }

        if (!["customer_admin", "agent"].includes(user.role)) {
            window.location.href = "/dashboard";
            return;
        }

        loadAnnouncements();
    }, []);

    async function loadAnnouncements() {
        try {
            setLoading(true);
            setMessage("");

            const data = await apiRequest(
                "/customer/announcements-list.php?include_dismissed=1"
            );

            setItems(data.announcements || []);
        } catch (error: unknown) {
            setMessage(error instanceof Error ? error.message : "خطا در دریافت اعلان‌ها");
        } finally {
            setLoading(false);
        }
    }

    async function markAsRead(id: number) {
        try {
            await apiRequest("/customer/announcement-read.php", {
                method: "POST",
                body: JSON.stringify({ announcement_id: id }),
            });

            setItems((current) =>
                current.map((item) =>
                    item.id === id ? { ...item, is_read: true } : item
                )
            );
        } catch (error: unknown) {
            setMessage(error instanceof Error ? error.message : "خطا در ثبت خوانده‌شدن");
        }
    }

    async function dismiss(id: number) {
        try {
            await apiRequest("/customer/announcement-dismiss.php", {
                method: "POST",
                body: JSON.stringify({ announcement_id: id }),
            });

            setItems((current) =>
                current.map((item) =>
                    item.id === id
                        ? { ...item, is_read: true, is_dismissed: true }
                        : item
                )
            );
        } catch (error: unknown) {
            setMessage(error instanceof Error ? error.message : "خطا در بستن اعلان");
        }
    }

    return (
        <AppShell
            title="اعلان‌ها"
            kicker="مرکز پیام‌های پنل"
            description="خبرها، هشدارها و بروزرسانی‌های مهم حساب شما در یک نمای مرتب"
            actions={
                <button className="button button-secondary" onClick={loadAnnouncements} disabled={loading}>
                    {loading ? "در حال بروزرسانی…" : "بروزرسانی اعلان‌ها"}
                </button>
            }
        >
            <div className="announcements-page">
                <section className="announcements-overview" aria-label="خلاصه اعلان‌ها">
                    <div className="announcements-overview-copy">
                        <span className="announcements-overview-icon"><BellIcon /></span>
                        <div>
                            <span className="announcements-live-label"><i /> مرکز اطلاع‌رسانی</span>
                            <h2>هیچ پیام مهمی را از دست ندهید</h2>
                            <p>اعلان‌های خوانده‌نشده و پیام‌های مهم همیشه در ابتدای این صفحه در دسترس شما هستند.</p>
                        </div>
                    </div>

                    <div className="announcements-summary">
                        <div><span>همه پیام‌ها</span><strong>{summary.total}</strong></div>
                        <div><span>خوانده‌نشده</span><strong>{summary.unread}</strong></div>
                        <div><span>مهم و فوری</span><strong>{summary.important}</strong></div>
                    </div>
                </section>

                {message && <div className="announcements-message" role="alert">{message}</div>}

                {loading ? (
                    <section className="announcements-list" aria-label="در حال بارگذاری اعلان‌ها">
                        {[0, 1, 2].map((item) => <div className="announcement-skeleton" key={item} />)}
                    </section>
                ) : items.length === 0 ? (
                    <section className="announcements-empty">
                        <span className="announcements-empty-icon"><BellIcon /></span>
                        <div>
                            <span className="announcements-empty-kicker">همه‌چیز مرتب است</span>
                            <h2>اعلان جدیدی ندارید</h2>
                            <p>به‌محض انتشار خبر، هشدار یا بروزرسانی تازه، آن را همین‌جا مشاهده خواهید کرد.</p>
                        </div>
                        <div className="announcements-empty-actions">
                            <button className="button button-primary" onClick={loadAnnouncements}>بررسی دوباره</button>
                            <Link className="button button-secondary" href="/dashboard">رفتن به داشبورد</Link>
                        </div>
                    </section>
                ) : (
                    <section className="announcements-archive">
                        <header className="announcements-section-head">
                            <div>
                                <span>آرشیو پیام‌ها</span>
                                <h2>آخرین اعلان‌ها</h2>
                            </div>
                            <b>{items.length} پیام</b>
                        </header>

                        <div className="announcements-list">
                            {items.map((item) => (
                                <article
                                    key={item.id}
                                    className={`announcement-card type-${item.type} ${
                                        !item.is_read ? "is-unread" : ""
                                    } ${item.is_dismissed ? "is-dismissed" : ""}`}
                                >
                                    <span className="announcement-card-icon"><BellIcon compact /></span>
                                    <div className="announcement-card-content">
                                        <div className="announcement-card-meta">
                                            <span className="announcement-type">{typeLabels[item.type]}</span>
                                            <span>{priorityLabels[item.priority]}</span>
                                            <time>{formatAnnouncementDate(item.created_at)}</time>
                                        </div>
                                        <h3>{item.title}</h3>
                                        <p>{item.body}</p>
                                    </div>

                                    <div className="announcement-card-side">
                                        {!item.is_read && <b className="announcement-new-badge">جدید</b>}
                                        {item.is_dismissed && <b className="announcement-closed-badge">بسته‌شده</b>}
                                        <div className="announcement-card-actions">
                                            {item.cta_label && item.cta_url && (
                                                <Link className="button button-primary button-sm" href={item.cta_url}>{item.cta_label}</Link>
                                            )}
                                            {!item.is_read && (
                                                <button className="button button-secondary button-sm" onClick={() => markAsRead(item.id)}>خواندم</button>
                                            )}
                                            {item.is_dismissible && !item.is_dismissed && (
                                                <button className="announcement-dismiss-button" onClick={() => dismiss(item.id)}>بستن</button>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </AppShell>
    );
}
