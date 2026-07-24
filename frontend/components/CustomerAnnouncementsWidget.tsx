"use client";

// مسیر فایل: ai-chat-saas/frontend/components/CustomerAnnouncementsWidget.tsx
// هدف: نمایش بنر، زنگ اعلان و تصویر کامل اعلان برای پنل مشتری

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, getAuthUser, isMaintenanceModeError } from "@/lib/api";

type Announcement = {
    id: number;
    title: string;
    body: string;
    image_url: string | null;
    type: "info" | "warning" | "discount" | "update" | "danger";
    priority: "low" | "medium" | "high" | "critical";
    cta_label: string | null;
    cta_url: string | null;
    is_dismissible: boolean;
    is_read: boolean;
    is_dismissed: boolean;
    created_at: string;
};

const typeIcons: Record<string, string> = {
    info: "i",
    warning: "!",
    discount: "%",
    update: "↗",
    danger: "!",
};

export default function CustomerAnnouncementsWidget() {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState("");
    const [selectedAnnouncement, setSelectedAnnouncement] =
        useState<Announcement | null>(null);

    const topAnnouncement = useMemo(() => {
        return announcements.find((item) => !item.is_dismissed) || null;
    }, [announcements]);

    useEffect(() => {
        const user = getAuthUser();

        if (!user) {
            setLoaded(true);
            return;
        }

        if (!["customer_admin", "agent"].includes(user.role)) {
            setLoaded(true);
            return;
        }

        loadAnnouncements();
    }, []);

    async function loadAnnouncements() {
        try {
            setError("");

            const data = await apiRequest("/customer/announcements-list.php");

            setAnnouncements(data.announcements || []);
            setUnreadCount(data.unread_count || 0);
        } catch (error: any) {
            if (isMaintenanceModeError(error)) {
                setError("");
                return;
            }

            console.error("Customer announcements error:", error);
            setError(error.message || "خطا در دریافت اعلان‌ها");
        } finally {
            setLoaded(true);
        }
    }

    async function markAsRead(id: number) {
        try {
            await apiRequest("/customer/announcement-read.php", {
                method: "POST",
                body: JSON.stringify({ announcement_id: id }),
            });

            setAnnouncements((items) =>
                items.map((item) =>
                    item.id === id ? { ...item, is_read: true } : item
                )
            );

            setUnreadCount((count) => Math.max(count - 1, 0));
        } catch (error) {
            if (!isMaintenanceModeError(error)) {
                console.error("Announcement read error:", error);
            }
        }
    }

    async function dismiss(id: number) {
        try {
            await apiRequest("/customer/announcement-dismiss.php", {
                method: "POST",
                body: JSON.stringify({ announcement_id: id }),
            });

            setAnnouncements((items) =>
                items.map((item) =>
                    item.id === id
                        ? { ...item, is_read: true, is_dismissed: true }
                        : item
                )
            );

            setUnreadCount((count) => Math.max(count - 1, 0));
        } catch (error) {
            if (!isMaintenanceModeError(error)) {
                console.error("Announcement dismiss error:", error);
            }
        }
    }

    function openAnnouncement(item: Announcement) {
        setSelectedAnnouncement(item);

        if (!item.is_read) {
            markAsRead(item.id);
        }
    }

    if (!loaded) {
        return null;
    }

    if (error) {
        return (
            <div className="customer-ann-shell">
                <div className="ann-message">خطا در بارگذاری اعلان‌ها: {error}</div>
            </div>
        );
    }

    if (announcements.length === 0) {
        return null;
    }

    return (
        <div className="customer-ann-shell">
            {topAnnouncement && (
                <div className={`customer-ann-banner type-${topAnnouncement.type}`}>
                    <button
                        type="button"
                        className={`customer-ann-thumb ${
                            topAnnouncement.image_url ? "" : "empty"
                        }`}
                        onClick={() => openAnnouncement(topAnnouncement)}
                    >
                        {topAnnouncement.image_url ? (
                            <img src={topAnnouncement.image_url} alt={topAnnouncement.title} />
                        ) : (
                            <span>{typeIcons[topAnnouncement.type] || "i"}</span>
                        )}
                    </button>

                    <div className="customer-ann-content">
                        <div>
                            <strong>{topAnnouncement.title}</strong>
                            {!topAnnouncement.is_read && <span>جدید</span>}
                        </div>

                        <p>{topAnnouncement.body}</p>
                    </div>

                    <div className="customer-ann-actions">
                        <button onClick={() => openAnnouncement(topAnnouncement)}>
                            مشاهده اعلان
                        </button>

                        {topAnnouncement.cta_label && topAnnouncement.cta_url && (
                            <Link
                                href={topAnnouncement.cta_url}
                                onClick={() => markAsRead(topAnnouncement.id)}
                            >
                                {topAnnouncement.cta_label}
                            </Link>
                        )}

                        {topAnnouncement.is_dismissible && (
                            <button onClick={() => dismiss(topAnnouncement.id)}>بستن</button>
                        )}
                    </div>
                </div>
            )}

            <div className="customer-ann-bell-wrap">
                <button
                    className="customer-ann-bell"
                    onClick={() => setOpen((value) => !value)}
                    title="اعلان‌ها"
                >
                    <span>🔔</span>
                    {unreadCount > 0 && <b>{unreadCount}</b>}
                </button>

                {open && (
                    <div className="customer-ann-dropdown">
                        <div className="customer-ann-dropdown-head">
                            <strong>اعلان‌ها</strong>
                            <Link href="/announcements">مشاهده همه</Link>
                        </div>

                        <div className="customer-ann-dropdown-list">
                            {announcements.slice(0, 6).map((item) => (
                                <article
                                    key={item.id}
                                    className={`customer-ann-mini type-${item.type} ${
                                        !item.is_read ? "unread" : ""
                                    }`}
                                >
                                    <button
                                        type="button"
                                        className="customer-ann-mini-thumb"
                                        onClick={() => openAnnouncement(item)}
                                    >
                                        {item.image_url ? (
                                            <img src={item.image_url} alt={item.title} />
                                        ) : (
                                            <span>{typeIcons[item.type] || "i"}</span>
                                        )}
                                    </button>

                                    <button onClick={() => openAnnouncement(item)}>
                                        <strong>{item.title}</strong>
                                        <p>{item.body}</p>
                                    </button>
                                </article>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {selectedAnnouncement && (
                <div
                    className="customer-ann-modal-backdrop"
                    onClick={() => setSelectedAnnouncement(null)}
                >
                    <article
                        className={`customer-ann-modal type-${selectedAnnouncement.type}`}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            className="customer-ann-modal-close"
                            onClick={() => setSelectedAnnouncement(null)}
                        >
                            ×
                        </button>

                        {selectedAnnouncement.image_url && (
                            <div className="customer-ann-modal-image">
                                <img
                                    src={selectedAnnouncement.image_url}
                                    alt={selectedAnnouncement.title}
                                />
                            </div>
                        )}

                        <div className="customer-ann-modal-content">
                            <span>{selectedAnnouncement.priority}</span>
                            <h2>{selectedAnnouncement.title}</h2>
                            <p>{selectedAnnouncement.body}</p>

                            <div className="customer-ann-modal-actions">
                                {selectedAnnouncement.cta_label &&
                                    selectedAnnouncement.cta_url && (
                                        <Link href={selectedAnnouncement.cta_url}>
                                            {selectedAnnouncement.cta_label}
                                        </Link>
                                    )}

                                {selectedAnnouncement.is_dismissible && (
                                    <button
                                        onClick={() => {
                                            dismiss(selectedAnnouncement.id);
                                            setSelectedAnnouncement(null);
                                        }}
                                    >
                                        بستن اعلان
                                    </button>
                                )}
                            </div>
                        </div>
                    </article>
                </div>
            )}
        </div>
    );
}