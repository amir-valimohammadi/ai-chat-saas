"use client";

// مسیر فایل: ai-chat-saas/frontend/app/announcements/page.tsx
// هدف: صفحه آرشیو اعلان‌های پنل مشتری

import { useEffect, useState } from "react";
import Link from "next/link";
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

const typeLabels: Record<string, string> = {
    info: "اطلاع‌رسانی",
    warning: "هشدار",
    discount: "تخفیف",
    update: "بروزرسانی",
    danger: "مهم",
};

export default function CustomerAnnouncementsPage() {
    const [items, setItems] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");

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

            const data = await apiRequest(
                "/customer/announcements-list.php?include_dismissed=1"
            );

            setItems(data.announcements || []);
        } catch (error: any) {
            setMessage(error.message || "خطا در دریافت اعلان‌ها");
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
        } catch (error: any) {
            setMessage(error.message || "خطا در ثبت خوانده‌شدن");
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
        } catch (error: any) {
            setMessage(error.message || "خطا در بستن اعلان");
        }
    }

    return (
        <main className="customer-ann-page">
            <header className="customer-ann-page-head">
                <div>
                    <span className="ann-eyebrow">Notifications</span>
                    <h1>اعلان‌های پنل</h1>
                    <p>اطلاعیه‌ها، هشدارها، تخفیف‌ها و خبرهای مهم مربوط به پنل شما.</p>
                </div>

                <Link href="/dashboard">بازگشت به داشبورد</Link>
            </header>

            {message && <div className="ann-message">{message}</div>}

            {loading ? (
                <div className="ann-empty">در حال دریافت اعلان‌ها...</div>
            ) : items.length === 0 ? (
                <div className="ann-empty">اعلانی برای نمایش وجود ندارد.</div>
            ) : (
                <section className="customer-ann-archive">
                    {items.map((item) => (
                        <article
                            key={item.id}
                            className={`customer-ann-archive-card type-${item.type} ${
                                !item.is_read ? "unread" : ""
                            } ${item.is_dismissed ? "dismissed" : ""}`}
                        >
                            <div className="customer-ann-archive-top">
                                <div>
                                    <span>{typeLabels[item.type]}</span>
                                    <h2>{item.title}</h2>
                                </div>

                                {!item.is_read && <b>جدید</b>}
                                {item.is_dismissed && <b>بسته‌شده</b>}
                            </div>

                            <p>{item.body}</p>

                            <div className="customer-ann-archive-actions">
                                {item.cta_label && item.cta_url && (
                                    <Link href={item.cta_url}>{item.cta_label}</Link>
                                )}

                                {!item.is_read && (
                                    <button onClick={() => markAsRead(item.id)}>خواندم</button>
                                )}

                                {item.is_dismissible && !item.is_dismissed && (
                                    <button onClick={() => dismiss(item.id)}>بستن</button>
                                )}
                            </div>
                        </article>
                    ))}
                </section>
            )}
        </main>
    );
}