// مسیر فایل: ai-chat-saas/frontend/app/knowledge/page.tsx
// هدف: مدیریت Knowledge Base برای پاسخ‌های AI

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

type KnowledgeItem = {
    id: number;
    site_id: number;
    site_name: string;
    type: string;
    title: string | null;
    question: string | null;
    answer: string | null;
    content: string | null;
    url: string | null;
    status: string;
    created_at: string;
};
type PlanUsageData = {
    plan: {
        name: string | null;
        features: {
            knowledge_base_enabled: boolean;
            ai_suggestions_enabled: boolean;
            ai_auto_reply_enabled: boolean;
        };
    };
    usage: {
        knowledge_items: {
            used: number;
        };
    };
};

export default function KnowledgePage() {
    const router = useRouter();

    const [sites, setSites] = useState<Site[]>([]);
    const [items, setItems] = useState<KnowledgeItem[]>([]);
    const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);

    const [form, setForm] = useState({
        type: "faq",
        title: "",
        question: "",
        answer: "",
        content: "",
        url: "",
        status: "approved",
    });

    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [planUsage, setPlanUsage] = useState<PlanUsageData | null>(null);

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
        loadPlanUsage();
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
                await loadKnowledge(firstSiteId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در بارگذاری دانش AI");
        } finally {
            setLoading(false);
        }
    }

    async function loadKnowledge(siteId = selectedSiteId) {
        if (!siteId) return;

        try {
            setError("");

            const data = await apiRequest(`/customer/knowledge-list.php?site_id=${siteId}`);
            setItems(data.items || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت آیتم‌های دانش");
        }
    }
    async function loadPlanUsage() {
        try {
            const data = await apiRequest("/customer/plan-usage.php");
            setPlanUsage(data);
        } catch {
            // اگر اطلاعات پلن لود نشد، صفحه دانش نباید خراب شود.
        }
    }

    function updateField(field: string, value: string) {
        setForm((prev) => ({
            ...prev,
            [field]: value,
        }));
    }

    async function handleSiteChange(siteId: number) {
        setSelectedSiteId(siteId);
        await loadKnowledge(siteId);
    }

    const isKnowledgeBaseEnabled =
        planUsage?.plan.features.knowledge_base_enabled !== false;
    async function handleCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!selectedSiteId) {
            setError("ابتدا یک سایت انتخاب کنید.");
            return;
        }
        if (!isKnowledgeBaseEnabled) {
            setError("Knowledge Base در پلن فعلی شما فعال نیست.");
            return;
        }
        setCreating(true);
        setError("");
        setSuccess("");

        try {
            await apiRequest("/customer/knowledge-create.php", {
                method: "POST",
                body: JSON.stringify({
                    site_id: selectedSiteId,
                    ...form,
                }),
            });

            setSuccess("آیتم دانش با موفقیت ثبت شد.");

            setForm({
                type: "faq",
                title: "",
                question: "",
                answer: "",
                content: "",
                url: "",
                status: "approved",
            });

            await loadKnowledge(selectedSiteId);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ثبت دانش ناموفق بود");
        } finally {
            setCreating(false);
        }
    }

    async function handleDelete(id: number) {
        const confirmed = window.confirm("این آیتم آرشیو شود؟");

        if (!confirmed) return;

        try {
            await apiRequest("/customer/knowledge-delete.php", {
                method: "POST",
                body: JSON.stringify({ id }),
            });

            setSuccess("آیتم دانش آرشیو شد.");
            await loadKnowledge(selectedSiteId);
        } catch (err) {
            setError(err instanceof Error ? err.message : "حذف آیتم ناموفق بود");
        }
    }

    return (
        <AppShell
            title="دانش AI"
            kicker="Knowledge Base"
            description="اطلاعاتی که AI بر اساس آن‌ها پاسخ پیشنهادی تولید می‌کند"
            actions={
                <button className="btn secondary" onClick={() => loadKnowledge()}>
                    بروزرسانی
                </button>
            }
        >
            {error && <div className="error">{error}</div>}
            {success && <div className="success">{success}</div>}
            {planUsage && !isKnowledgeBaseEnabled && (
                <div className="plan-limit-card danger">
                    <div>
                        <div className="plan-limit-title">Knowledge Base در پلن شما فعال نیست</div>
                        <p className="plan-limit-text">
                            برای ثبت دانش AI و استفاده از پیشنهاد پاسخ، باید پلن شما شامل Knowledge Base باشد.
                        </p>
                    </div>

                    <span className="soft-chip danger">غیرفعال</span>
                </div>
            )}

            {planUsage && isKnowledgeBaseEnabled && (
                <div className="plan-limit-card success">
                    <div>
                        <div className="plan-limit-title">Knowledge Base فعال است</div>
                        <p className="plan-limit-text">
                            تاکنون {planUsage.usage.knowledge_items.used} آیتم دانش برای این حساب ثبت شده است.
                        </p>
                    </div>

                    <span className="soft-chip success">فعال</span>
                </div>
            )}
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
                        <h2 style={{ marginTop: 0 }}>ثبت دانش جدید</h2>

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
                            <div
                                className="grid"
                                style={{
                                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                                }}
                            >
                                <label className="grid">
                                    <span>نوع دانش</span>
                                    <select
                                        className="input"
                                        value={form.type}
                                        onChange={(event) => updateField("type", event.target.value)}
                                    >
                                        <option value="faq">سوال پرتکرار</option>
                                        <option value="manual_text">متن دستی</option>
                                        <option value="policy">قوانین</option>
                                        <option value="product">محصول</option>
                                        <option value="service">خدمت</option>
                                        <option value="web_page">صفحه سایت</option>
                                    </select>
                                </label>

                                <label className="grid">
                                    <span>وضعیت</span>
                                    <select
                                        className="input"
                                        value={form.status}
                                        onChange={(event) => updateField("status", event.target.value)}
                                    >
                                        <option value="approved">فعال</option>
                                        <option value="draft">پیش‌نویس</option>
                                    </select>
                                </label>
                            </div>

                            <label className="grid">
                                <span>عنوان</span>
                                <input
                                    className="input"
                                    value={form.title}
                                    onChange={(event) => updateField("title", event.target.value)}
                                    placeholder="مثلاً شرایط ارسال"
                                />
                            </label>

                            <label className="grid">
                                <span>سوال، برای FAQ</span>
                                <input
                                    className="input"
                                    value={form.question}
                                    onChange={(event) => updateField("question", event.target.value)}
                                    placeholder="مثلاً ارسال به شهرستان چقدر طول می‌کشد؟"
                                />
                            </label>

                            <label className="grid">
                                <span>پاسخ</span>
                                <textarea
                                    className="textarea"
                                    value={form.answer}
                                    onChange={(event) => updateField("answer", event.target.value)}
                                    placeholder="مثلاً ارسال به شهرستان بین ۳ تا ۵ روز کاری زمان می‌برد."
                                />
                            </label>

                            <label className="grid">
                                <span>متن تکمیلی</span>
                                <textarea
                                    className="textarea"
                                    value={form.content}
                                    onChange={(event) => updateField("content", event.target.value)}
                                    placeholder="برای توضیحات بیشتر، قوانین، معرفی خدمت یا اطلاعات محصول"
                                />
                            </label>

                            <label className="grid">
                                <span>URL، اختیاری</span>
                                <input
                                    className="input"
                                    value={form.url}
                                    onChange={(event) => updateField("url", event.target.value)}
                                    placeholder="https://example.com/faq"
                                />
                            </label>

                            <button
                                className="btn"
                                type="submit"
                                disabled={creating || !isKnowledgeBaseEnabled}
                            >
                                {creating ? "در حال ثبت..." : "ثبت دانش"}
                            </button>
                        </form>
                    </section>

                    <section className="card-solid" style={{ padding: 20 }}>
                        <h2 style={{ marginTop: 0 }}>آیتم‌های ثبت‌شده</h2>

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
                                <div style={{ fontSize: 40, marginBottom: 8 }}>AI</div>
                                <h3 style={{ margin: 0 }}>هنوز دانشی ثبت نشده</h3>
                                <p className="muted">
                                    چند سوال پرتکرار ثبت کن تا پیشنهاد پاسخ AI فعال شود.
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
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <div>
                                                <strong>{item.title || item.question || `آیتم #${item.id}`}</strong>
                                                <div className="muted">
                                                    {item.site_name} · {item.type}
                                                </div>
                                            </div>

                                            <span className="badge">{item.status}</span>
                                        </div>

                                        {item.question && (
                                            <div>
                                                <strong>سوال:</strong>
                                                <p className="muted" style={{ margin: "4px 0 0" }}>
                                                    {item.question}
                                                </p>
                                            </div>
                                        )}

                                        {item.answer && (
                                            <div>
                                                <strong>پاسخ:</strong>
                                                <p className="muted" style={{ margin: "4px 0 0" }}>
                                                    {item.answer}
                                                </p>
                                            </div>
                                        )}

                                        {item.content && (
                                            <div>
                                                <strong>متن:</strong>
                                                <p className="muted" style={{ margin: "4px 0 0" }}>
                                                    {item.content}
                                                </p>
                                            </div>
                                        )}

                                        <button
                                            className="btn secondary"
                                            type="button"
                                            onClick={() => handleDelete(item.id)}
                                        >
                                            آرشیو
                                        </button>
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