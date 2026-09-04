"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type Site = {
    id: number;
    name: string;
    domain: string;
};

type QuickReply = {
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

type ReplyStatus = "all" | "active" | "inactive";

const emptyForm = {
    title: "",
    content: "",
    category: "",
};

export default function QuickRepliesPage() {
    const router = useRouter();
    const listRequestRef = useRef(0);

    const [sites, setSites] = useState<Site[]>([]);
    const [items, setItems] = useState<QuickReply[]>([]);
    const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<ReplyStatus>("all");
    const [composerOpen, setComposerOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
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

        void loadInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    const selectedSite = useMemo(
        () => sites.find((site) => site.id === selectedSiteId) || null,
        [sites, selectedSiteId],
    );

    const metrics = useMemo(() => ({
        total: items.length,
        active: items.filter((item) => item.is_active).length,
        categories: new Set(items.map((item) => item.category?.trim()).filter(Boolean)).size,
    }), [items]);

    const filteredItems = useMemo(() => {
        const query = search.trim().toLocaleLowerCase("fa");

        return items.filter((item) => {
            const matchesStatus = status === "all"
                || (status === "active" && item.is_active)
                || (status === "inactive" && !item.is_active);
            const haystack = `${item.title} ${item.content} ${item.category || ""}`.toLocaleLowerCase("fa");
            return matchesStatus && (!query || haystack.includes(query));
        });
    }, [items, search, status]);

    async function loadInitialData() {
        try {
            setLoading(true);
            setError("");

            const sitesData = await apiRequest("/customer/sites-list.php");
            const loadedSites = Array.isArray(sitesData.sites) ? sitesData.sites : [];
            const firstSiteId = Number(loadedSites[0]?.id || 0) || null;

            setSites(loadedSites);
            setSelectedSiteId(firstSiteId);

            if (firstSiteId) {
                await loadQuickReplies(firstSiteId, false);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در بارگذاری پاسخ‌ها");
        } finally {
            setLoading(false);
        }
    }

    async function loadQuickReplies(siteId = selectedSiteId, showProgress = true) {
        if (!siteId) return;

        const requestId = ++listRequestRef.current;

        try {
            if (showProgress) setRefreshing(true);
            setError("");

            const data = await apiRequest(`/customer/quick-replies-list.php?site_id=${siteId}`);

            if (requestId === listRequestRef.current) {
                setItems(Array.isArray(data.items) ? data.items : []);
            }
        } catch (err) {
            if (requestId === listRequestRef.current) {
                setError(err instanceof Error ? err.message : "خطا در دریافت پاسخ‌های آماده");
            }
        } finally {
            if (requestId === listRequestRef.current) setRefreshing(false);
        }
    }

    async function handleSiteChange(siteId: number) {
        setSelectedSiteId(siteId);
        setSearch("");
        setStatus("all");
        setSuccess("");
        await loadQuickReplies(siteId);
    }

    function updateField(field: keyof typeof form, value: string) {
        setForm((current) => ({ ...current, [field]: value }));
        setSuccess("");
    }

    function openComposer() {
        setError("");
        setSuccess("");
        setComposerOpen(true);
    }

    function closeComposer() {
        if (creating) return;
        setComposerOpen(false);
        setForm(emptyForm);
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
                    title: form.title.trim(),
                    content: form.content.trim(),
                    category: form.category.trim(),
                }),
            });

            setSuccess("پاسخ آماده با موفقیت ساخته شد.");
            setForm(emptyForm);
            setComposerOpen(false);
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
            setError(err instanceof Error ? err.message : "غیرفعال‌سازی پاسخ آماده ناموفق بود");
        }
    }

    return (
        <AppShell
            title="پاسخ‌های آماده"
            kicker="ابزار پاسخ‌گویی"
            description="پاسخ‌های پرتکرار تیم را یک‌جا نگه دارید و سرعت گفتگوها را بیشتر کنید."
            actions={(
                <div className="quick-replies-header-actions">
                    <button
                        className={`quick-replies-refresh${refreshing ? " is-loading" : ""}`}
                        type="button"
                        onClick={() => void loadQuickReplies()}
                        disabled={refreshing || !selectedSiteId}
                    >
                        <QuickReplyIcon name="refresh" />
                        بروزرسانی
                    </button>
                    <button className="quick-replies-create" type="button" onClick={openComposer} disabled={!selectedSiteId}>
                        <QuickReplyIcon name="plus" />
                        پاسخ جدید
                    </button>
                </div>
            )}
        >
            <div className="quick-replies-shell">
                <div className="quick-replies-alerts" aria-live="polite">
                    {error && (
                        <div className="quick-replies-alert error">
                            <span>{error}</span>
                            <button type="button" onClick={() => setError("")} aria-label="بستن پیام">×</button>
                        </div>
                    )}
                    {success && (
                        <div className="quick-replies-alert success">
                            <span>{success}</span>
                            <button type="button" onClick={() => setSuccess("")} aria-label="بستن پیام">×</button>
                        </div>
                    )}
                </div>

                {loading ? (
                    <QuickRepliesLoading />
                ) : sites.length === 0 ? (
                    <section className="quick-replies-empty-page">
                        <div className="quick-replies-empty-icon"><QuickReplyIcon name="message" /></div>
                        <h2>ابتدا یک سایت بسازید</h2>
                        <p>پاسخ‌های آماده برای هر سایت جدا نگهداری می‌شوند و در گفتگوهای همان سایت در دسترس تیم قرار می‌گیرند.</p>
                    </section>
                ) : (
                    <>
                        <section className="quick-replies-overview">
                            <div className="quick-replies-overview-main">
                                <div className="quick-replies-overview-icon"><QuickReplyIcon name="bolt" /></div>
                                <div>
                                    <span>کتابخانه پاسخ‌گویی</span>
                                    <strong>{selectedSite?.name || "سایت انتخاب‌شده"}</strong>
                                    <small>{selectedSite?.domain}</small>
                                </div>
                            </div>
                            <div className="quick-replies-metrics">
                                <div><span>همه پاسخ‌ها</span><b>{toPersianNumber(metrics.total)}</b></div>
                                <div><span>پاسخ فعال</span><b>{toPersianNumber(metrics.active)}</b></div>
                                <div><span>دسته‌بندی</span><b>{toPersianNumber(metrics.categories)}</b></div>
                            </div>
                        </section>

                        <section className="quick-replies-panel">
                            <div className="quick-replies-toolbar">
                                <div className="quick-replies-toolbar-copy">
                                    <span>فهرست پاسخ‌ها</span>
                                    <strong>{toPersianNumber(filteredItems.length)} مورد قابل نمایش</strong>
                                </div>

                                <div className="quick-replies-controls">
                                    <label className="quick-replies-site-select">
                                        <span>سایت</span>
                                        <select value={selectedSiteId || ""} onChange={(event) => void handleSiteChange(Number(event.target.value))}>
                                            {sites.map((site) => (
                                                <option key={site.id} value={site.id}>{site.name}</option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className="quick-replies-search">
                                        <QuickReplyIcon name="search" />
                                        <input
                                            value={search}
                                            onChange={(event) => setSearch(event.target.value)}
                                            placeholder="جستجو در عنوان یا متن..."
                                        />
                                    </label>

                                    <div className="quick-replies-status-filter" aria-label="فیلتر وضعیت">
                                        {([
                                            ["all", "همه"],
                                            ["active", "فعال"],
                                            ["inactive", "غیرفعال"],
                                        ] as const).map(([value, label]) => (
                                            <button
                                                key={value}
                                                type="button"
                                                className={status === value ? "active" : ""}
                                                onClick={() => setStatus(value)}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className={`quick-replies-list-wrap${refreshing ? " is-loading" : ""}`}>
                                {filteredItems.length === 0 ? (
                                    <div className="quick-replies-empty-list">
                                        <div><QuickReplyIcon name={items.length === 0 ? "message" : "search"} /></div>
                                        <h3>{items.length === 0 ? "هنوز پاسخی ثبت نشده" : "نتیجه‌ای پیدا نشد"}</h3>
                                        <p>
                                            {items.length === 0
                                                ? "اولین پاسخ پرتکرار تیم را بسازید تا هنگام گفتگو در دسترس پشتیبان‌ها باشد."
                                                : "عبارت جستجو یا فیلتر وضعیت را تغییر دهید."}
                                        </p>
                                        {items.length === 0 && (
                                            <button type="button" onClick={openComposer}>
                                                <QuickReplyIcon name="plus" />
                                                ساخت اولین پاسخ
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="quick-replies-list">
                                        {filteredItems.map((item) => (
                                            <article key={item.id} className={`quick-reply-card${item.is_active ? "" : " is-inactive"}`}>
                                                <div className="quick-reply-card-head">
                                                    <div className="quick-reply-card-title">
                                                        <span className="quick-reply-card-icon"><QuickReplyIcon name="message" /></span>
                                                        <div>
                                                            <strong>{item.title}</strong>
                                                            <span>{item.category || "بدون دسته‌بندی"}</span>
                                                        </div>
                                                    </div>
                                                    <span className={`quick-reply-state ${item.is_active ? "active" : "inactive"}`}>
                                                        <i />
                                                        {item.is_active ? "فعال" : "غیرفعال"}
                                                    </span>
                                                </div>

                                                <p>{item.content}</p>

                                                <footer>
                                                    <span>
                                                        <QuickReplyIcon name="calendar" />
                                                        ساخته‌شده در {formatPersianDate(item.created_at)}
                                                    </span>
                                                    {item.is_active && (
                                                        <button type="button" onClick={() => void handleDelete(item.id)}>
                                                            <QuickReplyIcon name="archive" />
                                                            غیرفعال‌سازی
                                                        </button>
                                                    )}
                                                </footer>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>
                    </>
                )}
            </div>

            {composerOpen && (
                <div className="quick-reply-drawer-backdrop" onMouseDown={closeComposer}>
                    <aside
                        className="quick-reply-drawer"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="quick-reply-drawer-title"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <header>
                            <div>
                                <span>پاسخ تازه</span>
                                <h2 id="quick-reply-drawer-title">افزودن پاسخ آماده</h2>
                                <p>یک متن کوتاه و قابل استفاده برای تیم بسازید.</p>
                            </div>
                            <button type="button" onClick={closeComposer} aria-label="بستن پنل">×</button>
                        </header>

                        <div className="quick-reply-drawer-site">
                            <span><QuickReplyIcon name="globe" /></span>
                            <div>
                                <small>ذخیره برای سایت</small>
                                <strong>{selectedSite?.name}</strong>
                                <b>{selectedSite?.domain}</b>
                            </div>
                        </div>

                        <form onSubmit={handleCreate}>
                            <label>
                                <span>عنوان کوتاه <i>ضروری</i></span>
                                <input
                                    value={form.title}
                                    onChange={(event) => updateField("title", event.target.value)}
                                    placeholder="مثلاً زمان ارسال سفارش"
                                    maxLength={255}
                                    required
                                />
                                <small>{toPersianNumber(form.title.length)} از ۲۵۵ کاراکتر</small>
                            </label>

                            <label>
                                <span>دسته‌بندی <i>اختیاری</i></span>
                                <input
                                    value={form.category}
                                    onChange={(event) => updateField("category", event.target.value)}
                                    placeholder="مثلاً ارسال، پرداخت یا مرجوعی"
                                    maxLength={100}
                                />
                            </label>

                            <label className="quick-reply-content-field">
                                <span>متن پاسخ <i>ضروری</i></span>
                                <textarea
                                    value={form.content}
                                    onChange={(event) => updateField("content", event.target.value)}
                                    placeholder="متنی بنویسید که پشتیبان بتواند مستقیماً در گفتگو استفاده کند..."
                                    rows={8}
                                    maxLength={4000}
                                    required
                                />
                                <small>{toPersianNumber(form.content.length)} از ۴۰۰۰ کاراکتر</small>
                            </label>

                            <div className="quick-reply-form-hint">
                                <QuickReplyIcon name="info" />
                                <span>برای پاسخ‌های دقیق‌تر، هر موضوع را در یک پاسخ جداگانه نگه دارید.</span>
                            </div>

                            <footer>
                                <button type="button" onClick={closeComposer} disabled={creating}>انصراف</button>
                                <button type="submit" disabled={creating || !form.title.trim() || !form.content.trim()}>
                                    {creating ? "در حال ذخیره..." : "ذخیره پاسخ"}
                                </button>
                            </footer>
                        </form>
                    </aside>
                </div>
            )}
        </AppShell>
    );
}

function QuickRepliesLoading() {
    return (
        <div className="quick-replies-loading" aria-label="در حال بارگذاری">
            <div className="quick-replies-loading-overview" />
            <div className="quick-replies-loading-panel">
                <span />
                <span />
                <span />
            </div>
        </div>
    );
}

function QuickReplyIcon({ name }: { name: "archive" | "bolt" | "calendar" | "globe" | "info" | "message" | "plus" | "refresh" | "search" }) {
    const paths = {
        archive: ["M4 7h16", "M6 7v12h12V7", "M9 11h6", "M5 3h14v4H5z"],
        bolt: ["M13 2 5 14h7l-1 8 8-12h-7l1-8Z"],
        calendar: ["M6 3v3", "M18 3v3", "M4 8h16", "M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"],
        globe: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M2 12h20", "M12 2c2.5 2.7 3.8 6 3.8 10S14.5 19.3 12 22c-2.5-2.7-3.8-6-3.8-10S9.5 4.7 12 2Z"],
        info: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M12 11v6", "M12 7h.01"],
        message: ["M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z", "M8 9h8", "M8 13h5"],
        plus: ["M12 5v14", "M5 12h14"],
        refresh: ["M20 11a8 8 0 1 0-2.3 5.7", "M20 4v7h-7"],
        search: ["m21 21-4.35-4.35", "M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"],
    } as const;

    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            {paths[name].map((path) => <path key={path} d={path} />)}
        </svg>
    );
}

function formatPersianDate(value: string) {
    if (!value) return "—";
    const date = new Date(value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function toPersianNumber(value: number) {
    return new Intl.NumberFormat("fa-IR").format(value);
}
