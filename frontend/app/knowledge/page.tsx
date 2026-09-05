// مسیر فایل: ai-chat-saas/frontend/app/knowledge/page.tsx
// هدف: مدیریت ساده و متمرکز منابع پاسخ‌گویی AI

"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type Site = {
    id: number;
    name: string;
    domain: string;
};

type KnowledgeType =
    | "faq"
    | "manual_text"
    | "policy"
    | "product"
    | "service"
    | "web_page";

type KnowledgeStatus = "approved" | "draft";

type KnowledgeItem = {
    id: number;
    site_id: number;
    site_name: string;
    type: KnowledgeType;
    title: string | null;
    question: string | null;
    answer: string | null;
    content: string | null;
    url: string | null;
    status: KnowledgeStatus;
    created_at: string;
    updated_at?: string;
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

type KnowledgeForm = {
    type: KnowledgeType;
    title: string;
    question: string;
    answer: string;
    content: string;
    url: string;
    status: KnowledgeStatus;
};

const emptyForm: KnowledgeForm = {
    type: "faq",
    title: "",
    question: "",
    answer: "",
    content: "",
    url: "",
    status: "approved",
};

const knowledgeTypeMeta: Record<
    KnowledgeType,
    { label: string; shortLabel: string; description: string; icon: KnowledgeIconName }
> = {
    faq: {
        label: "سؤال پرتکرار",
        shortLabel: "FAQ",
        description: "یک سؤال واقعی کاربر و پاسخ دقیق آن را ثبت کنید.",
        icon: "question",
    },
    manual_text: {
        label: "متن راهنما",
        shortLabel: "راهنما",
        description: "توضیح عمومی یا اطلاعاتی که در دسته دیگری قرار نمی‌گیرد.",
        icon: "document",
    },
    policy: {
        label: "قوانین و شرایط",
        shortLabel: "قوانین",
        description: "قوانین ارسال، بازگشت، حریم خصوصی یا شرایط استفاده.",
        icon: "shield",
    },
    product: {
        label: "اطلاعات محصول",
        shortLabel: "محصول",
        description: "ویژگی‌ها، محدودیت‌ها و نکات مهم یک محصول.",
        icon: "box",
    },
    service: {
        label: "اطلاعات خدمت",
        shortLabel: "خدمت",
        description: "نحوه ارائه، زمان‌بندی یا جزئیات یک خدمت.",
        icon: "spark",
    },
    web_page: {
        label: "صفحه وب",
        shortLabel: "وب",
        description: "خلاصه یک صفحه مشخص به همراه نشانی منبع آن.",
        icon: "globe",
    },
};

export default function KnowledgePage() {
    const router = useRouter();
    const knowledgeRequestRef = useRef(0);

    const [sites, setSites] = useState<Site[]>([]);
    const [items, setItems] = useState<KnowledgeItem[]>([]);
    const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
    const [form, setForm] = useState<KnowledgeForm>(emptyForm);
    const [query, setQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<"all" | KnowledgeType>("all");
    const [statusFilter, setStatusFilter] = useState<"all" | KnowledgeStatus>("all");
    const [loading, setLoading] = useState(true);
    const [knowledgeLoading, setKnowledgeLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
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

        void loadInitialData();
        void loadPlanUsage();
    }, [router]);

    async function loadInitialData() {
        try {
            setLoading(true);
            setError("");

            const sitesData = await apiRequest("/customer/sites-list.php");
            const loadedSites: Site[] = sitesData.sites || [];
            const firstSiteId = loadedSites[0]?.id || null;

            setSites(loadedSites);
            setSelectedSiteId(firstSiteId);

            if (firstSiteId) {
                await loadKnowledge(firstSiteId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در بارگذاری پایگاه دانش");
        } finally {
            setLoading(false);
        }
    }

    async function loadKnowledge(siteId = selectedSiteId) {
        if (!siteId) return;

        const requestId = ++knowledgeRequestRef.current;

        try {
            setKnowledgeLoading(true);
            setError("");

            const data = await apiRequest(`/customer/knowledge-list.php?site_id=${siteId}`);

            if (requestId === knowledgeRequestRef.current) {
                setItems(data.items || []);
            }
        } catch (err) {
            if (requestId === knowledgeRequestRef.current) {
                setError(err instanceof Error ? err.message : "خطا در دریافت آیتم‌های دانش");
            }
        } finally {
            if (requestId === knowledgeRequestRef.current) {
                setKnowledgeLoading(false);
            }
        }
    }

    async function loadPlanUsage() {
        try {
            const data = await apiRequest("/customer/plan-usage.php");
            setPlanUsage(data);
        } catch {
            // اگر اطلاعات پلن لود نشد، صفحه دانش نباید از کار بیفتد.
        }
    }

    function updateField<Field extends keyof KnowledgeForm>(
        field: Field,
        value: KnowledgeForm[Field],
    ) {
        setForm((current) => ({ ...current, [field]: value }));
        setSuccess("");
    }

    function handleTypeChange(type: KnowledgeType) {
        setForm((current) => ({
            ...current,
            type,
            question: type === "faq" ? current.question : "",
            answer: type === "faq" ? current.answer : "",
            content: type === "faq" ? "" : current.content,
        }));
        setSuccess("");
    }

    async function handleSiteChange(siteId: number) {
        setSelectedSiteId(siteId);
        setQuery("");
        setTypeFilter("all");
        setStatusFilter("all");
        setSuccess("");
        await loadKnowledge(siteId);
    }

    const isKnowledgeBaseEnabled =
        planUsage?.plan.features.knowledge_base_enabled !== false;

    const selectedSite = useMemo(
        () => sites.find((site) => site.id === selectedSiteId) || null,
        [selectedSiteId, sites],
    );

    const approvedCount = useMemo(
        () => items.filter((item) => item.status === "approved").length,
        [items],
    );

    const draftCount = items.length - approvedCount;
    const readinessRate = items.length > 0 ? Math.round((approvedCount / items.length) * 100) : 0;

    const filteredItems = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase("fa");

        return items.filter((item) => {
            if (typeFilter !== "all" && item.type !== typeFilter) return false;
            if (statusFilter !== "all" && item.status !== statusFilter) return false;
            if (!normalizedQuery) return true;

            return [item.title, item.question, item.answer, item.content, item.url]
                .filter(Boolean)
                .some((value) => value?.toLocaleLowerCase("fa").includes(normalizedQuery));
        });
    }, [items, query, statusFilter, typeFilter]);

    const isFaq = form.type === "faq";
    const hasRequiredContent = isFaq
        ? Boolean(form.question.trim() && form.answer.trim())
        : Boolean(form.title.trim() && form.content.trim());
    const canSubmit = Boolean(selectedSiteId && isKnowledgeBaseEnabled && hasRequiredContent);

    async function handleCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!selectedSiteId) {
            setError("ابتدا یک سایت انتخاب کنید.");
            return;
        }

        if (!isKnowledgeBaseEnabled) {
            setError("پایگاه دانش در پلن فعلی شما فعال نیست.");
            return;
        }

        if (!canSubmit) {
            setError(
                isFaq
                    ? "سؤال و پاسخ را کامل کنید."
                    : "عنوان و متن اصلی را کامل کنید.",
            );
            return;
        }

        setCreating(true);
        setError("");
        setSuccess("");

        try {
            await apiRequest("/customer/knowledge-create.php", {
                method: "POST",
                body: JSON.stringify({ site_id: selectedSiteId, ...form }),
            });

            setSuccess(
                form.status === "approved"
                    ? "دانش جدید ثبت و برای پاسخ‌گویی AI فعال شد."
                    : "دانش جدید به‌صورت پیش‌نویس ذخیره شد.",
            );
            setForm(emptyForm);
            await Promise.all([loadKnowledge(selectedSiteId), loadPlanUsage()]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ثبت دانش ناموفق بود");
        } finally {
            setCreating(false);
        }
    }

    async function handleDelete(id: number) {
        const confirmed = window.confirm(
            "این مورد از پایگاه دانش آرشیو شود؟ امکان نمایش آن در این صفحه وجود نخواهد داشت.",
        );

        if (!confirmed) return;

        try {
            setDeletingId(id);
            setError("");
            setSuccess("");

            await apiRequest("/customer/knowledge-delete.php", {
                method: "POST",
                body: JSON.stringify({ id }),
            });

            setSuccess("آیتم انتخاب‌شده آرشیو شد.");
            await Promise.all([loadKnowledge(selectedSiteId), loadPlanUsage()]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "آرشیو آیتم ناموفق بود");
        } finally {
            setDeletingId(null);
        }
    }

    return (
        <AppShell
            title="دانش AI"
            kicker="مرکز محتوای هوشمند"
            description="منابعی که پاسخ‌های پیشنهادی و خودکار بر اساس آن‌ها ساخته می‌شوند"
            actions={
                <button
                    className={`knowledge-header-action ${knowledgeLoading ? "is-loading" : ""}`}
                    type="button"
                    disabled={!selectedSiteId || knowledgeLoading}
                    onClick={() => loadKnowledge()}
                >
                    <KnowledgeIcon name="refresh" />
                    <span>{knowledgeLoading ? "در حال دریافت" : "به‌روزرسانی"}</span>
                </button>
            }
        >
            <div className="knowledge-shell">
                {error && (
                    <div className="knowledge-alert is-error" role="alert">
                        <span><KnowledgeIcon name="warning" /></span>
                        <div><strong>عملیات کامل نشد</strong><p>{error}</p></div>
                        <button type="button" onClick={() => setError("")} aria-label="بستن پیام">×</button>
                    </div>
                )}

                {success && (
                    <div className="knowledge-alert is-success" role="status">
                        <span><KnowledgeIcon name="check" /></span>
                        <div><strong>انجام شد</strong><p>{success}</p></div>
                        <button type="button" onClick={() => setSuccess("")} aria-label="بستن پیام">×</button>
                    </div>
                )}

                {loading ? (
                    <KnowledgeLoading />
                ) : sites.length === 0 ? (
                    <KnowledgeNoSite />
                ) : (
                    <>
                        <section className="knowledge-overview" aria-labelledby="knowledge-overview-title">
                            <div className="knowledge-overview-copy">
                                <span className="knowledge-eyebrow"><i /> پایگاه دانش این سایت</span>
                                <h2 id="knowledge-overview-title">
                                    پاسخ دقیق، از اطلاعاتی شروع می‌شود که خودتان تأیید کرده‌اید.
                                </h2>
                                <p>
                                    محتوای کوتاه، روشن و به‌روز ثبت کنید تا AI در گفتگوها پاسخ‌های مطمئن‌تری پیشنهاد دهد.
                                </p>

                                <label className="knowledge-site-select">
                                    <span><KnowledgeIcon name="globe" /> سایت فعال</span>
                                    <div>
                                        <select
                                            value={selectedSiteId || ""}
                                            disabled={knowledgeLoading}
                                            onChange={(event) => handleSiteChange(Number(event.target.value))}
                                        >
                                            {sites.map((site) => (
                                                <option key={site.id} value={site.id}>
                                                    {site.name} — {site.domain}
                                                </option>
                                            ))}
                                        </select>
                                        <KnowledgeIcon name="chevron" />
                                    </div>
                                </label>
                            </div>

                            <div className="knowledge-overview-stats" aria-label="وضعیت پایگاه دانش">
                                <KnowledgeStat icon="library" label="کل محتوای سایت" value={formatNumber(items.length)} tone="indigo" />
                                <KnowledgeStat icon="check" label="فعال برای AI" value={formatNumber(approvedCount)} tone="mint" />
                                <KnowledgeStat icon="draft" label="پیش‌نویس" value={formatNumber(draftCount)} tone="amber" />

                                <div className="knowledge-readiness">
                                    <div>
                                        <span>آمادگی محتوا</span>
                                        <strong>{formatNumber(readinessRate)}٪</strong>
                                    </div>
                                    <div className="knowledge-progress" aria-hidden="true">
                                        <i style={{ width: `${readinessRate}%` }} />
                                    </div>
                                    <small>
                                        {items.length === 0
                                            ? "با ثبت اولین پاسخ شروع کنید."
                                            : draftCount > 0
                                                ? `${formatNumber(draftCount)} پیش‌نویس هنوز برای AI فعال نیست.`
                                                : "تمام محتوای این سایت فعال است."}
                                    </small>
                                </div>
                            </div>
                        </section>

                        {!isKnowledgeBaseEnabled && (
                            <section className="knowledge-plan-notice">
                                <span><KnowledgeIcon name="lock" /></span>
                                <div>
                                    <strong>پایگاه دانش در پلن فعلی غیرفعال است</strong>
                                    <p>محتوای فعلی قابل مشاهده است؛ برای ثبت محتوای جدید باید این قابلیت در پلن فعال شود.</p>
                                </div>
                                <Link href="/subscription">بررسی پلن</Link>
                            </section>
                        )}

                        <div className="knowledge-workspace">
                            <section className="knowledge-composer" aria-labelledby="knowledge-composer-title">
                                <KnowledgeCardHead
                                    icon="plus"
                                    eyebrow="افزودن منبع"
                                    title="ثبت دانش جدید"
                                    description="یک موضوع مشخص را با زبان ساده توضیح دهید."
                                    id="knowledge-composer-title"
                                />

                                <form onSubmit={handleCreate} className="knowledge-form">
                                    <label className="knowledge-field">
                                        <span>نوع محتوا</span>
                                        <div className="knowledge-select-control">
                                            <KnowledgeIcon name={knowledgeTypeMeta[form.type].icon} />
                                            <select
                                                value={form.type}
                                                onChange={(event) => handleTypeChange(event.target.value as KnowledgeType)}
                                            >
                                                {Object.entries(knowledgeTypeMeta).map(([value, meta]) => (
                                                    <option key={value} value={value}>{meta.label}</option>
                                                ))}
                                            </select>
                                            <KnowledgeIcon name="chevron" />
                                        </div>
                                        <small>{knowledgeTypeMeta[form.type].description}</small>
                                    </label>

                                    <div className="knowledge-field">
                                        <span>وضعیت انتشار</span>
                                        <div className="knowledge-status-toggle" role="group" aria-label="وضعیت انتشار">
                                            <button
                                                type="button"
                                                className={form.status === "approved" ? "is-active" : ""}
                                                aria-pressed={form.status === "approved"}
                                                onClick={() => updateField("status", "approved")}
                                            >
                                                <KnowledgeIcon name="check" /> فعال
                                            </button>
                                            <button
                                                type="button"
                                                className={form.status === "draft" ? "is-active" : ""}
                                                aria-pressed={form.status === "draft"}
                                                onClick={() => updateField("status", "draft")}
                                            >
                                                <KnowledgeIcon name="draft" /> پیش‌نویس
                                            </button>
                                        </div>
                                    </div>

                                    <label className="knowledge-field">
                                        <span>{isFaq ? "عنوان کوتاه (اختیاری)" : "عنوان"}</span>
                                        <input
                                            value={form.title}
                                            onChange={(event) => updateField("title", event.target.value)}
                                            placeholder={isFaq ? "مثلاً زمان ارسال سفارش" : "یک عنوان مشخص بنویسید"}
                                        />
                                    </label>

                                    {isFaq ? (
                                        <>
                                            <label className="knowledge-field">
                                                <span>سؤال کاربر</span>
                                                <input
                                                    value={form.question}
                                                    onChange={(event) => updateField("question", event.target.value)}
                                                    placeholder="مثلاً ارسال به شهرستان چقدر طول می‌کشد؟"
                                                    required
                                                />
                                            </label>

                                            <label className="knowledge-field">
                                                <span>پاسخ تأییدشده</span>
                                                <textarea
                                                    value={form.answer}
                                                    onChange={(event) => updateField("answer", event.target.value)}
                                                    placeholder="پاسخی کوتاه، دقیق و قابل استفاده برای مشتری بنویسید."
                                                    rows={5}
                                                    required
                                                />
                                            </label>
                                        </>
                                    ) : (
                                        <label className="knowledge-field">
                                            <span>متن اصلی</span>
                                            <textarea
                                                value={form.content}
                                                onChange={(event) => updateField("content", event.target.value)}
                                                placeholder="اطلاعاتی را بنویسید که AI باید در پاسخ‌هایش از آن استفاده کند."
                                                rows={7}
                                                required
                                            />
                                        </label>
                                    )}

                                    {form.type === "web_page" ? (
                                        <label className="knowledge-field">
                                            <span>نشانی صفحه</span>
                                            <input
                                                dir="ltr"
                                                value={form.url}
                                                onChange={(event) => updateField("url", event.target.value)}
                                                placeholder="https://example.com/help"
                                                type="url"
                                            />
                                        </label>
                                    ) : (
                                        <details className="knowledge-optional">
                                            <summary><KnowledgeIcon name="link" /> افزودن لینک منبع</summary>
                                            <label className="knowledge-field">
                                                <span>نشانی مرتبط (اختیاری)</span>
                                                <input
                                                    dir="ltr"
                                                    value={form.url}
                                                    onChange={(event) => updateField("url", event.target.value)}
                                                    placeholder="https://example.com/help"
                                                    type="url"
                                                />
                                            </label>
                                        </details>
                                    )}

                                    <div className="knowledge-form-footer">
                                        <div>
                                            <KnowledgeIcon name={form.status === "approved" ? "spark" : "draft"} />
                                            <span>
                                                {form.status === "approved"
                                                    ? "پس از ثبت، AI می‌تواند از این محتوا استفاده کند."
                                                    : "پیش‌نویس در پاسخ‌های AI استفاده نمی‌شود."}
                                            </span>
                                        </div>
                                        <button type="submit" disabled={creating || !canSubmit}>
                                            {creating ? <span className="knowledge-spinner" /> : <KnowledgeIcon name="plus" />}
                                            {creating ? "در حال ثبت" : "ثبت در پایگاه دانش"}
                                        </button>
                                    </div>
                                </form>
                            </section>

                            <section className="knowledge-library" aria-labelledby="knowledge-library-title">
                                <KnowledgeCardHead
                                    icon="library"
                                    eyebrow="کتابخانه"
                                    title="محتوای ثبت‌شده"
                                    description={`دانش اختصاصی ${selectedSite?.name || "سایت انتخاب‌شده"}`}
                                    id="knowledge-library-title"
                                    meta={`${formatNumber(filteredItems.length)} از ${formatNumber(items.length)} مورد`}
                                />

                                <div className="knowledge-toolbar">
                                    <label className="knowledge-search">
                                        <KnowledgeIcon name="search" />
                                        <input
                                            value={query}
                                            onChange={(event) => setQuery(event.target.value)}
                                            placeholder="جست‌وجو در عنوان، سؤال یا متن..."
                                            aria-label="جست‌وجو در پایگاه دانش"
                                        />
                                        {query && (
                                            <button type="button" onClick={() => setQuery("")} aria-label="پاک کردن جست‌وجو">×</button>
                                        )}
                                    </label>

                                    <div className="knowledge-filter-row">
                                        <label>
                                            <span>نوع</span>
                                            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | KnowledgeType)}>
                                                <option value="all">همه محتوا</option>
                                                {Object.entries(knowledgeTypeMeta).map(([value, meta]) => (
                                                    <option key={value} value={value}>{meta.label}</option>
                                                ))}
                                            </select>
                                        </label>

                                        <div className="knowledge-filter-tabs" aria-label="فیلتر وضعیت">
                                            {([
                                                ["all", "همه"],
                                                ["approved", "فعال"],
                                                ["draft", "پیش‌نویس"],
                                            ] as const).map(([value, label]) => (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    className={statusFilter === value ? "is-active" : ""}
                                                    aria-pressed={statusFilter === value}
                                                    onClick={() => setStatusFilter(value)}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {knowledgeLoading ? (
                                    <KnowledgeListLoading />
                                ) : filteredItems.length === 0 ? (
                                    <KnowledgeEmpty
                                        filtered={items.length > 0}
                                        onReset={() => {
                                            setQuery("");
                                            setTypeFilter("all");
                                            setStatusFilter("all");
                                        }}
                                    />
                                ) : (
                                    <div className="knowledge-list">
                                        {filteredItems.map((item) => (
                                            <KnowledgeItemCard
                                                key={item.id}
                                                item={item}
                                                deleting={deletingId === item.id}
                                                onArchive={() => handleDelete(item.id)}
                                            />
                                        ))}
                                    </div>
                                )}

                                <div className="knowledge-library-footer">
                                    <span>
                                        {planUsage
                                            ? `${formatNumber(planUsage.usage.knowledge_items.used)} مورد در کل حساب ثبت شده است.`
                                            : "محتوا به تفکیک سایت نگهداری می‌شود."}
                                    </span>
                                    <Link href="/ai-center">مدیریت پیشرفته در مرکز AI <KnowledgeIcon name="arrow" /></Link>
                                </div>
                            </section>
                        </div>
                    </>
                )}
            </div>
        </AppShell>
    );
}

function KnowledgeStat({
    icon,
    label,
    value,
    tone,
}: {
    icon: KnowledgeIconName;
    label: string;
    value: string;
    tone: "indigo" | "mint" | "amber";
}) {
    return (
        <div className={`knowledge-stat tone-${tone}`}>
            <span><KnowledgeIcon name={icon} /></span>
            <div><strong>{value}</strong><small>{label}</small></div>
        </div>
    );
}

function KnowledgeCardHead({
    icon,
    eyebrow,
    title,
    description,
    id,
    meta,
}: {
    icon: KnowledgeIconName;
    eyebrow: string;
    title: string;
    description: string;
    id: string;
    meta?: string;
}) {
    return (
        <header className="knowledge-card-head">
            <div className="knowledge-card-title">
                <span><KnowledgeIcon name={icon} /></span>
                <div>
                    <small>{eyebrow}</small>
                    <h2 id={id}>{title}</h2>
                    <p>{description}</p>
                </div>
            </div>
            {meta && <b>{meta}</b>}
        </header>
    );
}

function KnowledgeItemCard({
    item,
    deleting,
    onArchive,
}: {
    item: KnowledgeItem;
    deleting: boolean;
    onArchive: () => void;
}) {
    const meta = knowledgeTypeMeta[item.type] || knowledgeTypeMeta.manual_text;
    const title = item.title || item.question || `آیتم ${formatNumber(item.id)}`;
    const preview = item.answer || item.content || item.question || "بدون متن توضیحی";
    const safeUrl = getSafeHttpUrl(item.url);

    return (
        <details className="knowledge-item">
            <summary>
                <span className={`knowledge-item-icon type-${item.type}`}><KnowledgeIcon name={meta.icon} /></span>
                <div className="knowledge-item-summary">
                    <div>
                        <strong>{title}</strong>
                        <span className={`knowledge-status status-${item.status}`}>
                            <i /> {item.status === "approved" ? "فعال" : "پیش‌نویس"}
                        </span>
                    </div>
                    <p>{preview}</p>
                    <div className="knowledge-item-meta">
                        <span>{meta.label}</span>
                        <span>ثبت {formatDate(item.created_at)}</span>
                        <span>#{formatNumber(item.id)}</span>
                    </div>
                </div>
                <span className="knowledge-item-chevron"><KnowledgeIcon name="chevron" /></span>
            </summary>

            <div className="knowledge-item-details">
                {item.question && (
                    <div><span>سؤال</span><p>{item.question}</p></div>
                )}
                {item.answer && (
                    <div><span>پاسخ</span><p>{item.answer}</p></div>
                )}
                {item.content && (
                    <div><span>متن اصلی</span><p>{item.content}</p></div>
                )}
                {safeUrl && (
                    <a href={safeUrl} target="_blank" rel="noreferrer">
                        <KnowledgeIcon name="link" /> مشاهده منبع
                    </a>
                )}

                <footer>
                    <span>این محتوا برای سایت «{item.site_name}» ثبت شده است.</span>
                    <button type="button" disabled={deleting} onClick={onArchive}>
                        <KnowledgeIcon name="archive" />
                        {deleting ? "در حال آرشیو" : "آرشیو محتوا"}
                    </button>
                </footer>
            </div>
        </details>
    );
}

function KnowledgeEmpty({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
    return (
        <div className="knowledge-empty">
            <span><KnowledgeIcon name={filtered ? "search" : "library"} /></span>
            <strong>{filtered ? "نتیجه‌ای با این فیلتر پیدا نشد" : "هنوز محتوایی ثبت نشده است"}</strong>
            <p>
                {filtered
                    ? "عبارت جست‌وجو یا فیلترها را تغییر دهید."
                    : "از فرم کنار صفحه، اولین سؤال یا راهنمای خود را اضافه کنید."}
            </p>
            {filtered && <button type="button" onClick={onReset}>پاک کردن فیلترها</button>}
        </div>
    );
}

function KnowledgeLoading() {
    return (
        <div className="knowledge-page-loading" aria-label="در حال بارگذاری پایگاه دانش">
            <span />
            <div><span /><span /></div>
        </div>
    );
}

function KnowledgeListLoading() {
    return (
        <div className="knowledge-list-loading" aria-label="در حال دریافت محتوا">
            <span /><span /><span />
        </div>
    );
}

function KnowledgeNoSite() {
    return (
        <section className="knowledge-no-site">
            <span><KnowledgeIcon name="globe" /></span>
            <h2>برای ساخت پایگاه دانش، ابتدا یک سایت اضافه کنید</h2>
            <p>هر محتوای دانش به یک سایت متصل می‌شود تا پاسخ‌های AI میان کسب‌وکارها جابه‌جا نشوند.</p>
            <Link href="/sites">رفتن به مدیریت سایت‌ها <KnowledgeIcon name="arrow" /></Link>
        </section>
    );
}

type KnowledgeIconName =
    | "archive"
    | "arrow"
    | "box"
    | "check"
    | "chevron"
    | "document"
    | "draft"
    | "globe"
    | "library"
    | "link"
    | "lock"
    | "plus"
    | "question"
    | "refresh"
    | "search"
    | "shield"
    | "spark"
    | "warning";

const knowledgeIconPaths: Record<KnowledgeIconName, string[]> = {
    archive: ["M4 7h16", "M6 7l1 13h10l1-13", "M9 11v5", "M15 11v5", "M8 4h8l1 3H7z"],
    arrow: ["M5 12h14", "m14 0-5-5", "m5 5-5 5"],
    box: ["m12 3 8 4-8 4-8-4z", "m4 7 8 4 8-4", "M4 7v10l8 4 8-4V7", "M12 11v10"],
    check: ["M20 6 9 17l-5-5"],
    chevron: ["m9 10 3 3 3-3"],
    document: ["M6 3h9l3 3v15H6z", "M14 3v4h4", "M9 12h6", "M9 16h6"],
    draft: ["M5 4h14v16H5z", "M8 9h8", "M8 13h5"],
    globe: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18", "M3 12h18", "M12 3c3 3 3 15 0 18", "M12 3c-3 3-3 15 0 18"],
    library: ["M4 5a4 4 0 0 1 4-2h4v17H8a4 4 0 0 0-4 2z", "M20 5a4 4 0 0 0-4-2h-4v17h4a4 4 0 0 1 4 2z"],
    link: ["M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1", "M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"],
    lock: ["M6 10h12v10H6z", "M8 10V7a4 4 0 0 1 8 0v3", "M12 14v2"],
    plus: ["M12 5v14", "M5 12h14"],
    question: ["M9.2 9a3 3 0 1 1 4.3 2.7c-1 .5-1.5 1.1-1.5 2.3", "M12 18h.01", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20"],
    refresh: ["M20 11a8 8 0 1 0-2.3 5.7", "M20 4v7h-7"],
    search: ["M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14", "m16 16 4 4"],
    shield: ["M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z", "M9 12h6"],
    spark: ["m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8z", "M5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8z"],
    warning: ["m12 3 10 18H2z", "M12 9v5", "M12 18h.01"],
};

function KnowledgeIcon({ name }: { name: KnowledgeIconName }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {knowledgeIconPaths[name].map((path, index) => <path d={path} key={`${name}-${index}`} />)}
        </svg>
    );
}

function formatNumber(value: number) {
    return new Intl.NumberFormat("fa-IR").format(value);
}

function formatDate(value: string) {
    if (!value) return "—";

    const normalized = value.includes("T") ? value : value.replace(" ", "T");
    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(date);
}

function getSafeHttpUrl(value: string | null) {
    if (!value) return null;

    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
        return null;
    }
}
