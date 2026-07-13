// مسیر فایل: ai-chat-saas/frontend/app/quick-replies/page.tsx
// هدف: مدیریت پاسخ‌های آماده مشتری

"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type Site = {
    id: number;
    name: string;
    domain: string;
};

type QuickReply = {ط
    id: number;
    site_id: number;
    site_name: string;
    title: string;
    content: string;
    category: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
};

export default function QuickRepliesPage() {
    const router = useRouter();

    const [sites, setSites] = useState<Site[]>([]);
    const [items, setItems] = useState<QuickReply[]>([]);
    const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);

    const [form, setForm] = useState({
        title: "",
        content: "",
        category: "",
    });

    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        const user = getAuthUser();

        if (!user) {
            router.push("/login");
            return;
        }

        if (user.role !== "customer_admin") {
            router.push("/dashboard");
            return;
        }

        loadInitialData();
    }, [router]);

    async function loadInitialData() {
        try {
            setLoading(true);
            setError("");

            const sitesData = await apiRequest("/customer/sites-list.php");
            const loadedSites = sitesData.sites || [];

            setSites(loadedSites);

            const firstSiteId = loadedSites[0]?.id || null;
            setSelectedSiteId(firstSiteId);

            if (firstSiteId) {
                await loadQuickReplies(firstSiteId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در بارگذاری پاسخ‌ها");
        } finally {
            setLoading(false);
        }
    }

    async function loadQuickReplies(siteId = selectedSiteId) {
        if (!siteId) return;

        try {
            setError("");

            const data = await apiRequest(
                `/customer/quick-replies-list.php?site_id=${siteId}`
            );

            setItems(data.items || []);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "خطا در دریافت پاسخ‌های آماده"
            );
        }
    }

    async function handleSiteChange(siteId: number) {
        setSelectedSiteId(siteId);
        await loadQuickReplies(siteId);
    }

    function updateField(field: string, value: string) {
        setForm((prev) => ({
            ...prev,
            [field]: value,
        }));
    }

    async function handleCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!selectedSiteId) {
            setError("ابتدا یک سایت انتخاب کنید.");
            return;
        }

        setCreating(true);
        setError("");
        setSuccess("");

        try {
            await apiRequest("/customer/quick-replies-create.php", {
                method: "POST",
                body: JSON.stringify({
                    site_id: selectedSiteId,
                    title: form.title,
                    content: form.content,
                    category: form.category,
                }),
            });

            setSuccess("پاسخ آماده با موفقیت ساخته شد.");

            setForm({
                title: "",
                content: "",
                category: "",
            });

            await loadQuickReplies(selectedSiteId);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ساخت پاسخ آماده ناموفق بود");
        } finally {
            setCreating(false);
        }
    }

    async function handleDelete(id: number) {
        const confirmed = window.confirm("این پاسخ آماده غیرفعال شود؟");

        if (!confirmed) return;

        try {
            setError("");
            setSuccess("");

            await apiRequest("/customer/quick-replies-delete.php", {
                method: "POST",
                body: JSON.stringify({ id }),
            });

            setSuccess("پاسخ آماده غیرفعال شد.");
            await loadQuickReplies(selectedSiteId);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "غیرفعال‌سازی پاسخ آماده ناموفق بود"
            );
        }
    }

    return (
        <AppShell
            title="پاسخ‌های آماده"
            kicker="Quick Replies"
            description="پاسخ‌هایی که پشتیبان‌ها می‌توانند با یک کلیک در گفتگو استفاده کنند"
            actions={
                <button className="btn secondary" onClick={() => loadQuickReplies()}>
                    بروزرسانی
                </button>
            }
        >
            {error && <div className="error">{error}</div>}
            {success && <div className="success">{success}</div>}

            {loading ? (
                <section className="card-solid" style={{ padding: 24 }}>
                    در حال بارگذاری...
                </section>
            ) : sites.length === 0 ? (
                <section className="card-solid" style={{ padding: 24 }}>
                    <p className="muted">هیچ سایتی برای این مشتری ثبت نشده است.</p>
                </section>
            ) : (
                <div className="chat-layout">
                    <section className="card-solid" style={{ padding: 20 }}>
                        <h2 style={{ marginTop: 0 }}>ساخت پاسخ آماده</h2>

                        <label className="grid" style={{ marginBottom: 16 }}>
                            <span>سایت</span>
                            <select
                                className="input"
                                value={selectedSiteId || ""}
                                onChange={(event) => handleSiteChange(Number(event.target.value))}
                            >
                                {sites.map((site) => (
                                    <option key={site.id} value={site.id}>
                                        {site.name} - {site.domain}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <form onSubmit={handleCreate} className="grid">
                            <label className="grid">
                                <span>عنوان کوتاه</span>
                                <input
                                    className="input"
                                    value={form.title}
                                    onChange={(event) => updateField("title", event.target.value)}
                                    placeholder="مثلاً زمان ارسال"
                                />
                            </label>

                            <label className="grid">
                                <span>دسته‌بندی</span>
                                <input
                                    className="input"
                                    value={form.category}
                                    onChange={(event) =>
                                        updateField("category", event.target.value)
                                    }
                                    placeholder="مثلاً ارسال، مرجوعی، پرداخت"
                                />
                            </label>

                            <label className="grid">
                                <span>متن پاسخ</span>
                                <textarea
                                    className="textarea"
                                    value={form.content}
                                    onChange={(event) => updateField("content", event.target.value)}
                                    placeholder="متن پاسخ آماده را وارد کنید..."
                                />
                            </label>

                            <button className="btn" type="submit" disabled={creating}>
                                {creating ? "در حال ساخت..." : "ساخت پاسخ آماده"}
                            </button>
                        </form>
                    </section>

                    <section className="card-solid" style={{ padding: 20 }}>
                        <h2 style={{ marginTop: 0 }}>پاسخ‌های آماده ثبت‌شده</h2>

                        {items.length === 0 ? (
                            <div
                                style={{
                                    padding: 34,
                                    textAlign: "center",
                                    border: "1px dashed var(--border)",
                                    borderRadius: 22,
                                    background: "var(--surface-soft)",
                                }}
                            >
                                <div style={{ fontSize: 40, marginBottom: 8 }}>✎</div>
                                <h3 style={{ margin: 0 }}>هنوز پاسخی ثبت نشده</h3>
                                <p className="muted">
                                    چند پاسخ آماده بساز تا پشتیبان‌ها سریع‌تر جواب بدهند.
                                </p>
                            </div>
                        ) : (
                            <div className="table-list">
                                {items.map((item) => (
                                    <article key={item.id} className="list-item">
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                gap: 12,
                                                alignItems: "center",
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <div>
                                                <strong>{item.title}</strong>
                                                <div className="muted">
                                                    {item.site_name} · {item.category || "بدون دسته"}
                                                </div>
                                            </div>

                                            <span className="badge">
                        {item.is_active ? "active" : "inactive"}
                      </span>
                                        </div>

                                        <p
                                            className="muted"
                                            style={{
                                                margin: 0,
                                                whiteSpace: "pre-wrap",
                                            }}
                                        >
                                            {item.content}
                                        </p>

                                        {item.is_active && (
                                            <button
                                                className="btn secondary"
                                                type="button"
                                                onClick={() => handleDelete(item.id)}
                                            >
                                                غیرفعال کردن
                                            </button>
                                        )}
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            )}
        </AppShell>
    );
}