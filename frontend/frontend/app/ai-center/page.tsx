// مسیر فایل: ai-chat-saas/frontend/app/ai-center/page.tsx
// هدف: مدیریت خزش، تنظیمات، منابع و تست پاسخ‌دهی AI

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

type AiSettings = {
    assistant_enabled: boolean;
    auto_reply_enabled: boolean;
    crawl_enabled: boolean;
    min_auto_reply_score: number;
    min_suggestion_score: number;
    max_pages_per_crawl: number;
    max_depth: number;
    fallback_message: string;
};

type CrawlSource = {
    id: number;
    source_type: "url" | "path_prefix" | "sitemap";
    source_value: string;
    label: string | null;
    category_hint: string | null;
    is_active: boolean;
    last_crawled_at: string | null;
    created_at: string;
};

type AiOverview = {
    counts: {
        pages: number;
        chunks: number;
        terms: number;
        questions: number;
        unanswered: number;
        answer_logs: number;
    };
    recent_runs: Array<{
        id: number;
        status: string;
        total_urls: number;
        fetched_pages: number;
        failed_pages: number;
        created_chunks: number;
        created_terms: number;
        created_questions: number;
        error_message: string | null;
        started_at: string | null;
        finished_at: string | null;
        created_at: string;
    }>;
    recent_pages: Array<{
        id: number;
        url: string;
        title: string | null;
        main_heading: string | null;
        category: string | null;
        detected_intent: string | null;
        crawl_status: string;
        word_count: number;
        last_crawled_at: string | null;
    }>;
};

type SearchResult = {
    answered: boolean;
    reply_mode: string;
    confidence_score: number;
    min_suggestion_score: number;
    answer: string;
    sources?: unknown[];
    debug?: unknown;
};
type GeneratedQuestion = {
    id: number;
    page_id: number | null;
    chunk_id: number | null;
    question: string;
    answer_text: string | null;
    category: string | null;
    detected_intent: string | null;
    source_type: string;
    score: number;
    status: string;
    created_at: string;
    page: {
        url: string | null;
        title: string | null;
        main_heading: string | null;
    };
};
type KnowledgeSource = {
    id: number;
    site_id: number;
    type: string | null;
    title: string | null;
    question: string | null;
    answer: string | null;
    content: string | null;
    url: string | null;
    status: string;
    created_at: string;
    updated_at: string | null;
};
type KnowledgeSourceForm = {
    type: string;
    title: string;
    question: string;
    answer: string;
    content: string;
    url: string;
    status: string;
};
type UnansweredQuestion = {
    id: number;
    conversation_id: number | null;
    message_id: number | null;
    question: string;
    detected_category: string | null;
    detected_intent: string | null;
    best_match_score: number;
    status: string;
    created_at: string;
};

type AiCenterTab =
    | "overview"
    | "settings"
    | "crawl"
    | "test"
    | "knowledge"
    | "unanswered";
const defaultSettings: AiSettings = {
    assistant_enabled: true,
    auto_reply_enabled: false,
    crawl_enabled: true,
    min_auto_reply_score: 40,
    min_suggestion_score: 40,
    max_pages_per_crawl: 30,
    max_depth: 1,
    fallback_message: "برای این سوال پاسخ دقیقی در اطلاعات سایت پیدا نکردم. پیام شما برای پشتیبان ثبت شد.",
};
const emptyKnowledgeSourceForm: KnowledgeSourceForm = {
    type: "faq",
    title: "",
    question: "",
    answer: "",
    content: "",
    url: "",
    status: "approved",
};
export default function AiCenterPage() {
    const router = useRouter();

    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);

    const [settings, setSettings] = useState<AiSettings>(defaultSettings);
    const [sources, setSources] = useState<CrawlSource[]>([]);
    const [overview, setOverview] = useState<AiOverview | null>(null);

    const [sourceForm, setSourceForm] = useState({
        source_type: "url" as "url" | "path_prefix" | "sitemap",
        source_value: "",
        label: "",
        category_hint: "services",
        is_active: true,
    });

    const [testQuestion, setTestQuestion] = useState("شرایط مرجوعی کالا چیه؟");
    const [testResult, setTestResult] = useState<SearchResult | null>(null);
    const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
    const [unansweredQuestions, setUnansweredQuestions] = useState<UnansweredQuestion[]>([]);
    const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>([]);
    const [editingKnowledgeSource, setEditingKnowledgeSource] = useState<KnowledgeSource | null>(null);
    const [savingKnowledgeSource, setSavingKnowledgeSource] = useState(false);
    const [newKnowledgeSource, setNewKnowledgeSource] = useState<KnowledgeSourceForm>(
        emptyKnowledgeSourceForm
    );
    const [creatingKnowledgeSource, setCreatingKnowledgeSource] = useState(false);
    const [knowledgeForm, setKnowledgeForm] = useState<{
        id: number;
        question: string;
        answer: string;
    } | null>(null);

    const [addingKnowledge, setAddingKnowledge] = useState(false);

    const [editingGeneratedQuestion, setEditingGeneratedQuestion] = useState<GeneratedQuestion | null>(null);
    const [savingGeneratedQuestion, setSavingGeneratedQuestion] = useState(false);

    const [loading, setLoading] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);
    const [creatingSource, setCreatingSource] = useState(false);
    const [crawling, setCrawling] = useState(false);
    const [testing, setTesting] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [activeTab, setActiveTab] = useState<AiCenterTab>("overview");

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
                await loadAiData(firstSiteId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در بارگذاری مرکز AI");
        } finally {
            setLoading(false);
        }
    }

    async function loadAiData(siteId = selectedSiteId) {
        if (!siteId) return;

        try {
            setError("");

            const [
                settingsData,
                sourcesData,
                overviewData,
                generatedQuestionsData,
                unansweredQuestionsData,
                knowledgeSourcesData,
            ] = await Promise.all([
                apiRequest(`/customer/ai-settings.php?site_id=${siteId}`),
                apiRequest(`/customer/ai-crawl-sources-list.php?site_id=${siteId}`),
                apiRequest(`/customer/ai-overview.php?site_id=${siteId}`),
                apiRequest(`/customer/ai-generated-questions-list.php?site_id=${siteId}&limit=20`),
                apiRequest(`/customer/ai-unanswered-list.php?site_id=${siteId}&status=new&limit=20`),
                apiRequest(`/customer/ai-knowledge-sources-list.php?site_id=${siteId}&limit=80`),
            ]);

            setSettings({
                ...defaultSettings,
                ...settingsData.settings,
            });

            setSources(sourcesData.items || []);
            setOverview(overviewData);
            setGeneratedQuestions(generatedQuestionsData.items || []);
            setUnansweredQuestions(unansweredQuestionsData.items || []);
            setKnowledgeSources(knowledgeSourcesData.items || []);

        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت اطلاعات AI");
        }
    }

    async function handleSiteChange(siteId: number) {
        setSelectedSiteId(siteId);
        setTestResult(null);
        await loadAiData(siteId);
    }

    function updateSetting<K extends keyof AiSettings>(key: K, value: AiSettings[K]) {
        setSettings((prev) => ({
            ...prev,
            [key]: value,
        }));
    }

    async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!selectedSiteId) {
            setError("ابتدا یک سایت انتخاب کنید.");
            return;
        }

        try {
            setSavingSettings(true);
            setError("");
            setSuccess("");

            await apiRequest("/customer/ai-settings.php", {
                method: "POST",
                body: JSON.stringify({
                    site_id: selectedSiteId,
                    ...settings,
                }),
            });

            setSuccess("تنظیمات AI ذخیره شد.");
            await loadAiData(selectedSiteId);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ذخیره تنظیمات ناموفق بود");
        } finally {
            setSavingSettings(false);
        }
    }

    async function handleCreateSource(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!selectedSiteId) {
            setError("ابتدا یک سایت انتخاب کنید.");
            return;
        }

        if (!sourceForm.source_value.trim()) {
            setError("آدرس یا مسیر خزش را وارد کنید.");
            return;
        }

        try {
            setCreatingSource(true);
            setError("");
            setSuccess("");

            await apiRequest("/customer/ai-crawl-source-create.php", {
                method: "POST",
                body: JSON.stringify({
                    site_id: selectedSiteId,
                    ...sourceForm,
                }),
            });

            setSuccess("منبع خزش ثبت شد.");

            setSourceForm((prev) => ({
                ...prev,
                source_value: "",
                label: "",
            }));

            await loadAiData(selectedSiteId);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ثبت منبع خزش ناموفق بود");
        } finally {
            setCreatingSource(false);
        }
    }

    async function handleDisableSource(id: number) {
        const confirmed = window.confirm("این منبع خزش غیرفعال شود؟");

        if (!confirmed) return;

        try {
            setError("");
            setSuccess("");

            await apiRequest("/customer/ai-crawl-source-delete.php", {
                method: "POST",
                body: JSON.stringify({ id }),
            });

            setSuccess("منبع خزش غیرفعال شد.");

            if (selectedSiteId) {
                await loadAiData(selectedSiteId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "غیرفعال کردن منبع ناموفق بود");
        }
    }

    async function handleStartCrawl() {
        if (!selectedSiteId) {
            setError("ابتدا یک سایت انتخاب کنید.");
            return;
        }

        try {
            setCrawling(true);
            setError("");
            setSuccess("");

            const result = await apiRequest("/customer/ai-crawl-start.php", {
                method: "POST",
                body: JSON.stringify({
                    site_id: selectedSiteId,
                }),
            });

            setSuccess(
                `خزش کامل شد. صفحات موفق: ${result.summary?.fetched_pages || 0}، بخش‌های ساخته‌شده: ${result.summary?.created_chunks || 0}`
            );

            await loadAiData(selectedSiteId);
        } catch (err) {
            setError(err instanceof Error ? err.message : "خزش سایت ناموفق بود");
        } finally {
            setCrawling(false);
        }
    }

    async function handleTestQuestion(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!selectedSiteId) {
            setError("ابتدا یک سایت انتخاب کنید.");
            return;
        }

        if (!testQuestion.trim()) {
            setError("سوال تست را وارد کنید.");
            return;
        }

        try {
            setTesting(true);
            setError("");
            setSuccess("");
            setTestResult(null);

            const result = await apiRequest("/customer/ai-search-test.php", {
                method: "POST",
                body: JSON.stringify({
                    site_id: selectedSiteId,
                    question: testQuestion,
                }),
            });

            setTestResult(result);

// بعد از تست، آمار، سوالات تولیدشده و سوالات بی‌پاسخ را دوباره بروزرسانی می‌کنیم
            await loadAiData(selectedSiteId);
        } catch (err) {
            setError(err instanceof Error ? err.message : "تست پاسخ AI ناموفق بود");
        } finally {
            setTesting(false);
        }
    }
    async function handleUpdateUnansweredStatus(id: number, status: string) {
        try {
            setError("");
            setSuccess("");

            await apiRequest("/customer/ai-unanswered-update-status.php", {
                method: "POST",
                body: JSON.stringify({
                    id,
                    status,
                }),
            });

            setSuccess("وضعیت سوال بی‌پاسخ بروزرسانی شد.");

            if (selectedSiteId) {
                await loadAiData(selectedSiteId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "بروزرسانی وضعیت سوال ناموفق بود");
        }
    }
    function handleOpenKnowledgeForm(item: UnansweredQuestion) {
        setKnowledgeForm({
            id: item.id,
            question: item.question,
            answer: "",
        });
    }

    async function handleAddUnansweredToKnowledge(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!knowledgeForm) {
            return;
        }

        if (!knowledgeForm.question.trim()) {
            setError("متن سوال الزامی است.");
            return;
        }

        if (!knowledgeForm.answer.trim()) {
            setError("متن پاسخ الزامی است.");
            return;
        }

        try {
            setAddingKnowledge(true);
            setError("");
            setSuccess("");

            await apiRequest("/customer/ai-unanswered-add-to-knowledge.php", {
                method: "POST",
                body: JSON.stringify({
                    id: knowledgeForm.id,
                    question: knowledgeForm.question,
                    answer: knowledgeForm.answer,
                }),
            });

            setSuccess("سوال و پاسخ به دانش AI اضافه شد.");
            setKnowledgeForm(null);

            if (selectedSiteId) {
                await loadAiData(selectedSiteId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "افزودن به دانش AI ناموفق بود");
        } finally {
            setAddingKnowledge(false);
        }
    }
    function handleOpenGeneratedQuestionEdit(item: GeneratedQuestion) {
        setEditingGeneratedQuestion(item);
    }

    async function handleSaveGeneratedQuestion(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!editingGeneratedQuestion) {
            return;
        }

        if (!editingGeneratedQuestion.question.trim()) {
            setError("متن سوال الزامی است.");
            return;
        }

        if (!editingGeneratedQuestion.answer_text?.trim()) {
            setError("متن پاسخ الزامی است.");
            return;
        }

        try {
            setSavingGeneratedQuestion(true);
            setError("");
            setSuccess("");

            await apiRequest("/customer/ai-generated-question-update.php", {
                method: "POST",
                body: JSON.stringify({
                    id: editingGeneratedQuestion.id,
                    question: editingGeneratedQuestion.question,
                    answer_text: editingGeneratedQuestion.answer_text,
                    category: editingGeneratedQuestion.category || "دانش دستی",
                    detected_intent: editingGeneratedQuestion.detected_intent || "manual_answer",
                    status: editingGeneratedQuestion.status || "active",
                }),
            });

            setSuccess("سوال دانش AI بروزرسانی شد.");
            setEditingGeneratedQuestion(null);

            if (selectedSiteId) {
                await loadAiData(selectedSiteId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "ویرایش سوال دانش ناموفق بود");
        } finally {
            setSavingGeneratedQuestion(false);
        }
    }
    function handleOpenKnowledgeSourceEdit(item: KnowledgeSource) {
        setEditingKnowledgeSource(item);
    }

    async function handleSaveKnowledgeSource(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!editingKnowledgeSource) {
            return;
        }

        if (!editingKnowledgeSource.title?.trim() && !editingKnowledgeSource.question?.trim()) {
            setError("عنوان یا سوال الزامی است.");
            return;
        }

        if (!editingKnowledgeSource.answer?.trim() && !editingKnowledgeSource.content?.trim()) {
            setError("پاسخ یا محتوا الزامی است.");
            return;
        }

        try {
            setSavingKnowledgeSource(true);
            setError("");
            setSuccess("");

            await apiRequest("/customer/ai-knowledge-source-update.php", {
                method: "POST",
                body: JSON.stringify({
                    id: editingKnowledgeSource.id,
                    type: editingKnowledgeSource.type || "faq",
                    title: editingKnowledgeSource.title || "",
                    question: editingKnowledgeSource.question || "",
                    answer: editingKnowledgeSource.answer || "",
                    content: editingKnowledgeSource.content || "",
                    url: editingKnowledgeSource.url || "",
                    status: editingKnowledgeSource.status || "approved",
                }),
            });

            setSuccess("دانش دستی سایت بروزرسانی شد.");
            setEditingKnowledgeSource(null);

            if (selectedSiteId) {
                await loadAiData(selectedSiteId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "ویرایش دانش دستی ناموفق بود");
        } finally {
            setSavingKnowledgeSource(false);
        }
    }

    async function handleKnowledgeSourceStatus(item: KnowledgeSource, status: "approved" | "active" | "inactive" | "archived") {
        try {
            setError("");
            setSuccess("");

            await apiRequest("/customer/ai-knowledge-source-update.php", {
                method: "POST",
                body: JSON.stringify({
                    id: item.id,
                    type: item.type || "faq",
                    title: item.title || "",
                    question: item.question || "",
                    answer: item.answer || "",
                    content: item.content || "",
                    url: item.url || "",
                    status,
                }),
            });

            setSuccess("وضعیت دانش دستی سایت بروزرسانی شد.");

            if (selectedSiteId) {
                await loadAiData(selectedSiteId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "تغییر وضعیت دانش دستی ناموفق بود");
        }
    }
    async function handleCreateKnowledgeSource(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!selectedSiteId) {
            setError("ابتدا سایت را انتخاب کنید.");
            return;
        }

        if (!newKnowledgeSource.title.trim() && !newKnowledgeSource.question.trim()) {
            setError("عنوان یا سوال الزامی است.");
            return;
        }

        if (!newKnowledgeSource.answer.trim() && !newKnowledgeSource.content.trim()) {
            setError("پاسخ یا محتوا الزامی است.");
            return;
        }

        try {
            setCreatingKnowledgeSource(true);
            setError("");
            setSuccess("");

            await apiRequest("/customer/ai-knowledge-source-create.php", {
                method: "POST",
                body: JSON.stringify({
                    site_id: selectedSiteId,
                    type: newKnowledgeSource.type || "faq",
                    title: newKnowledgeSource.title,
                    question: newKnowledgeSource.question,
                    answer: newKnowledgeSource.answer,
                    content: newKnowledgeSource.content,
                    url: newKnowledgeSource.url,
                    status: newKnowledgeSource.status || "approved",
                }),
            });

            setSuccess("دانش دستی جدید با موفقیت ثبت شد.");
            setNewKnowledgeSource(emptyKnowledgeSourceForm);

            await loadAiData(selectedSiteId);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ثبت دانش دستی ناموفق بود");
        } finally {
            setCreatingKnowledgeSource(false);
        }
    }
    async function handleGeneratedQuestionStatus(item: GeneratedQuestion, status: "active" | "inactive" | "archived") {
        try {
            setError("");
            setSuccess("");

            await apiRequest("/customer/ai-generated-question-update.php", {
                method: "POST",
                body: JSON.stringify({
                    id: item.id,
                    question: item.question,
                    answer_text: item.answer_text || "",
                    category: item.category || "دانش AI",
                    detected_intent: item.detected_intent || "general_info",
                    status,
                }),
            });

            setSuccess("وضعیت سوال دانش AI بروزرسانی شد.");

            if (selectedSiteId) {
                await loadAiData(selectedSiteId);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "تغییر وضعیت سوال ناموفق بود");
        }
    }
    const selectedSite = sites.find((site) => site.id === selectedSiteId);
    const activeSourceCount = sources.filter((source) => source.is_active).length;

    const aiCenterTabs: Array<{
        key: AiCenterTab;
        label: string;
        description: string;
    }> = [
        {
            key: "overview",
            label: "نمای کلی",
            description: "آمار کلی، آخرین خزش‌ها و صفحات خوانده‌شده",
        },
        {
            key: "settings",
            label: "تنظیمات",
            description: "کنترل رفتار دستیار، پاسخ خودکار و امتیاز اطمینان",
        },
        {
            key: "crawl",
            label: "خزش سایت",
            description: "ثبت منابع مجاز، مدیریت URLها و اجرای خزش",
        },
        {
            key: "test",
            label: "تست پاسخ",
            description: "آزمایش موتور پاسخ‌دهی با دانش فعلی سایت",
        },
        {
            key: "knowledge",
            label: "دانش AI",
            description: "مدیریت دانش دستی، سوالات تولیدشده و پاسخ‌های رسمی",
        },
        {
            key: "unanswered",
            label: "بی‌پاسخ‌ها",
            description: "رسیدگی به سوالاتی که AI برای آن‌ها پاسخ دقیق پیدا نکرده است",
        },
    ];

    const activeTabInfo = aiCenterTabs.find((tab) => tab.key === activeTab);

    return (
        <AppShell
            title="مرکز AI"
            kicker="AI Knowledge Center"
            description="مدیریت دانش، خزش سایت، تست پاسخ‌دهی و کنترل رفتار دستیار هوشمند"
            actions={
                <div className="ai-center-toolbar">
                    <button className="btn secondary" type="button" onClick={() => loadAiData()}>
                        بروزرسانی
                    </button>

                    <button
                        className="btn"
                        type="button"
                        onClick={handleStartCrawl}
                        disabled={crawling || activeSourceCount === 0}
                    >
                        {crawling ? "در حال خزش..." : "شروع خزش سایت"}
                    </button>
                </div>
            }
        >
            {error && <div className="error">{error}</div>}
            {success && <div className="success">{success}</div>}

            {loading ? (
                <section className="ai-center-section">در حال بارگذاری...</section>
            ) : sites.length === 0 ? (
                <section className="ai-center-section">
                    <p className="muted">هیچ سایتی برای این مشتری ثبت نشده است.</p>
                </section>
            ) : (
                <div className="ai-center-shell">
                    <section className="ai-center-section">
                        <div className="ai-center-section-header">
                            <div>
                                <h2 className="ai-center-section-title">سایت فعال</h2>
                                <p className="ai-center-section-subtitle">
                                    ابتدا سایت را انتخاب کن تا تنظیمات، منابع و دانش همان سایت مدیریت شود.
                                </p>
                            </div>

                            {selectedSite && (
                                <span className="soft-chip primary">
                                    {selectedSite.name} / {selectedSite.domain}
                                </span>
                            )}
                        </div>

                        <label className="grid">
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
                    </section>

                    <section className="ai-center-metric-grid">
                        <div className="ai-center-metric">
                            <strong>{overview?.counts.pages || 0}</strong>
                            <span>صفحات خوانده‌شده</span>
                        </div>

                        <div className="ai-center-metric">
                            <strong>{overview?.counts.chunks || 0}</strong>
                            <span>بخش‌های دانش</span>
                        </div>

                        <div className="ai-center-metric">
                            <strong>{overview?.counts.terms || 0}</strong>
                            <span>کلمات امتیازدار</span>
                        </div>

                        <div className="ai-center-metric">
                            <strong>{overview?.counts.questions || 0}</strong>
                            <span>سوالات ساخته‌شده</span>
                        </div>

                        <div className="ai-center-metric">
                            <strong>{overview?.counts.unanswered || 0}</strong>
                            <span>سوالات بی‌پاسخ</span>
                        </div>

                        <div className="ai-center-metric">
                            <strong>{overview?.counts.answer_logs || 0}</strong>
                            <span>لاگ پاسخ‌ها</span>
                        </div>
                    </section>

                    <section className="ai-center-section">
                        <div className="ai-center-section-header">
                            <div>
                                <h2 className="ai-center-section-title">
                                    {activeTabInfo?.label || "مرکز AI"}
                                </h2>
                                <p className="ai-center-section-subtitle">
                                    {activeTabInfo?.description || "مدیریت دانش و پاسخ‌دهی AI"}
                                </p>
                            </div>
                        </div>

                        <div className="ai-center-tabs">
                            {aiCenterTabs.map((tab) => (
                                <button
                                    key={tab.key}
                                    type="button"
                                    className={`ai-center-tab ${activeTab === tab.key ? "active" : ""}`}
                                    onClick={() => setActiveTab(tab.key)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </section>

                    {activeTab === "overview" && (
                        <div className="ai-center-grid">
                            <section className="ai-center-section">
                                <div className="ai-center-section-header">
                                    <div>
                                        <h2 className="ai-center-section-title">آخرین خزش‌ها</h2>
                                        <p className="ai-center-section-subtitle">
                                            وضعیت اجرای خزش و خروجی‌های ساخته‌شده در آخرین اجراها.
                                        </p>
                                    </div>
                                </div>

                                {!overview?.recent_runs.length ? (
                                    <div className="empty-soft">
                                        <strong>هنوز خزش انجام نشده است</strong>
                                        <p className="muted" style={{ marginBottom: 0 }}>
                                            بعد از ثبت منبع خزش، از دکمه شروع خزش سایت استفاده کن.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="ai-center-list">
                                        {overview.recent_runs.map((run) => (
                                            <article key={run.id} className="ai-center-item">
                                                <div className="ai-center-item-top">
                                                    <div>
                                                        <h3 className="ai-center-item-title">Run #{run.id}</h3>
                                                        <div className="ai-center-item-meta">
                                                            صفحات موفق: {run.fetched_pages} · خطا: {run.failed_pages} · chunks: {run.created_chunks} · questions: {run.created_questions}
                                                        </div>
                                                    </div>

                                                    <span className="soft-chip primary">{run.status}</span>
                                                </div>

                                                {run.error_message && (
                                                    <p className="ai-center-item-text" style={{ color: "var(--danger)" }}>
                                                        {run.error_message}
                                                    </p>
                                                )}
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="ai-center-section">
                                <div className="ai-center-section-header">
                                    <div>
                                        <h2 className="ai-center-section-title">آخرین صفحات خوانده‌شده</h2>
                                        <p className="ai-center-section-subtitle">
                                            صفحه‌هایی که در خزش‌های اخیر وارد پایگاه دانش شده‌اند.
                                        </p>
                                    </div>
                                </div>

                                {!overview?.recent_pages.length ? (
                                    <div className="empty-soft">
                                        <strong>هنوز صفحه‌ای خوانده نشده است</strong>
                                    </div>
                                ) : (
                                    <div className="ai-center-list">
                                        {overview.recent_pages.map((page) => (
                                            <article key={page.id} className="ai-center-item">
                                                <div className="ai-center-item-top">
                                                    <div>
                                                        <h3 className="ai-center-item-title">
                                                            {page.main_heading || page.title || `Page #${page.id}`}
                                                        </h3>
                                                        <div className="ai-center-item-meta">{page.url}</div>
                                                    </div>

                                                    <span className="soft-chip primary">{page.crawl_status}</span>
                                                </div>

                                                <div className="ai-center-item-meta">
                                                    دسته: {page.category || "-"} · intent: {page.detected_intent || "-"} · تعداد کلمه: {page.word_count}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    )}

                    {activeTab === "settings" && (
                        <section className="ai-center-section">
                            <div className="ai-center-section-header">
                                <div>
                                    <h2 className="ai-center-section-title">تنظیمات AI</h2>
                                    <p className="ai-center-section-subtitle">
                                        این تنظیمات مشخص می‌کند AI چه زمانی فعال باشد، چه زمانی پاسخ خودکار بدهد و حداقل امتیاز پاسخ چقدر باشد.
                                    </p>
                                </div>
                            </div>

                            <form className="ai-center-form" onSubmit={handleSaveSettings}>
                                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                    <input
                                        type="checkbox"
                                        checked={settings.assistant_enabled}
                                        onChange={(event) => updateSetting("assistant_enabled", event.target.checked)}
                                    />
                                    <span>فعال بودن دستیار AI</span>
                                </label>

                                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                    <input
                                        type="checkbox"
                                        checked={settings.auto_reply_enabled}
                                        onChange={(event) => updateSetting("auto_reply_enabled", event.target.checked)}
                                    />
                                    <span>پاسخ خودکار وقتی پشتیبان آنلاین نیست</span>
                                </label>

                                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                    <input
                                        type="checkbox"
                                        checked={settings.crawl_enabled}
                                        onChange={(event) => updateSetting("crawl_enabled", event.target.checked)}
                                    />
                                    <span>اجازه خزش سایت</span>
                                </label>

                                <div className="ai-center-two-col">
                                    <label className="grid">
                                        <span>حداقل امتیاز پاسخ خودکار</span>
                                        <input
                                            className="input"
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={settings.min_auto_reply_score}
                                            onChange={(event) => updateSetting("min_auto_reply_score", Number(event.target.value))}
                                        />
                                    </label>

                                    <label className="grid">
                                        <span>حداقل امتیاز پیشنهاد</span>
                                        <input
                                            className="input"
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={settings.min_suggestion_score}
                                            onChange={(event) => updateSetting("min_suggestion_score", Number(event.target.value))}
                                        />
                                    </label>

                                    <label className="grid">
                                        <span>حداکثر صفحه در هر خزش</span>
                                        <input
                                            className="input"
                                            type="number"
                                            min={1}
                                            max={100}
                                            value={settings.max_pages_per_crawl}
                                            onChange={(event) => updateSetting("max_pages_per_crawl", Number(event.target.value))}
                                        />
                                    </label>

                                    <label className="grid">
                                        <span>عمق خزش</span>
                                        <input
                                            className="input"
                                            type="number"
                                            min={0}
                                            max={3}
                                            value={settings.max_depth}
                                            onChange={(event) => updateSetting("max_depth", Number(event.target.value))}
                                        />
                                    </label>
                                </div>

                                <label className="grid">
                                    <span>پیام جایگزین وقتی پاسخ دقیق پیدا نشد</span>
                                    <textarea
                                        className="textarea"
                                        value={settings.fallback_message}
                                        onChange={(event) => updateSetting("fallback_message", event.target.value)}
                                    />
                                </label>

                                <div className="ai-center-actions">
                                    <button className="btn" type="submit" disabled={savingSettings}>
                                        {savingSettings ? "در حال ذخیره..." : "ذخیره تنظیمات AI"}
                                    </button>
                                </div>
                            </form>
                        </section>
                    )}

                    {activeTab === "crawl" && (
                        <div className="ai-center-grid">
                            <section className="ai-center-section">
                                <div className="ai-center-section-header">
                                    <div>
                                        <h2 className="ai-center-section-title">ثبت منبع خزش</h2>
                                        <p className="ai-center-section-subtitle">
                                            URL، مسیر داخلی یا sitemap را ثبت کن تا محتوای آن وارد دانش AI شود.
                                        </p>
                                    </div>
                                </div>

                                <form className="ai-center-form" onSubmit={handleCreateSource}>
                                    <label className="grid">
                                        <span>نوع منبع</span>
                                        <select
                                            className="input"
                                            value={sourceForm.source_type}
                                            onChange={(event) =>
                                                setSourceForm((prev) => ({
                                                    ...prev,
                                                    source_type: event.target.value as "url" | "path_prefix" | "sitemap",
                                                }))
                                            }
                                        >
                                            <option value="url">URL کامل</option>
                                            <option value="path_prefix">مسیر داخلی، مثل /services</option>
                                            <option value="sitemap">Sitemap</option>
                                        </select>
                                    </label>

                                    <label className="grid">
                                        <span>آدرس یا مسیر</span>
                                        <input
                                            className="input"
                                            value={sourceForm.source_value}
                                            onChange={(event) => setSourceForm((prev) => ({ ...prev, source_value: event.target.value }))}
                                            placeholder="مثلاً https://example.com/services یا /services"
                                        />
                                    </label>

                                    <label className="grid">
                                        <span>عنوان نمایشی</span>
                                        <input
                                            className="input"
                                            value={sourceForm.label}
                                            onChange={(event) => setSourceForm((prev) => ({ ...prev, label: event.target.value }))}
                                            placeholder="مثلاً صفحات خدمات"
                                        />
                                    </label>

                                    <label className="grid">
                                        <span>دسته پیشنهادی</span>
                                        <select
                                            className="input"
                                            value={sourceForm.category_hint}
                                            onChange={(event) => setSourceForm((prev) => ({ ...prev, category_hint: event.target.value }))}
                                        >
                                            <option value="">تشخیص خودکار</option>
                                            <option value="services">خدمات</option>
                                            <option value="pricing">قیمت / تعرفه</option>
                                            <option value="contact">تماس و مراجعه</option>
                                            <option value="appointment">نوبت‌دهی</option>
                                            <option value="faq">سوالات متداول</option>
                                            <option value="shipping">ارسال و تحویل</option>
                                            <option value="blog">مقالات آموزشی</option>
                                        </select>
                                    </label>

                                    <div className="ai-center-actions">
                                        <button className="btn" type="submit" disabled={creatingSource}>
                                            {creatingSource ? "در حال ثبت..." : "ثبت منبع خزش"}
                                        </button>
                                    </div>
                                </form>
                            </section>

                            <section className="ai-center-section">
                                <div className="ai-center-section-header">
                                    <div>
                                        <h2 className="ai-center-section-title">منابع خزش</h2>
                                        <p className="ai-center-section-subtitle">
                                            منابع فعال در اجرای خزش بعدی استفاده می‌شوند.
                                        </p>
                                    </div>

                                    <span className="soft-chip primary">{activeSourceCount} فعال</span>
                                </div>

                                {sources.length === 0 ? (
                                    <div className="empty-soft">
                                        <strong>هنوز هیچ منبعی ثبت نشده است</strong>
                                    </div>
                                ) : (
                                    <div className="ai-center-list">
                                        {sources.map((source) => (
                                            <article key={source.id} className="ai-center-item">
                                                <div className="ai-center-item-top">
                                                    <div>
                                                        <h3 className="ai-center-item-title">
                                                            {source.label || source.source_value}
                                                        </h3>
                                                        <div className="ai-center-item-meta">
                                                            {source.source_type} · {source.source_value}
                                                        </div>
                                                        <div className="ai-center-item-meta">
                                                            دسته پیشنهادی: {source.category_hint || "تشخیص خودکار"}
                                                        </div>
                                                    </div>

                                                    <span className={`soft-chip ${source.is_active ? "success" : "danger"}`}>
                                                        {source.is_active ? "فعال" : "غیرفعال"}
                                                    </span>
                                                </div>

                                                {source.is_active && (
                                                    <div className="ai-center-actions">
                                                        <button
                                                            className="btn secondary"
                                                            type="button"
                                                            onClick={() => handleDisableSource(source.id)}
                                                        >
                                                            غیرفعال کردن
                                                        </button>
                                                    </div>
                                                )}
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    )}

                    {activeTab === "test" && (
                        <section className="ai-center-section">
                            <div className="ai-center-section-header">
                                <div>
                                    <h2 className="ai-center-section-title">تست پاسخ AI</h2>
                                    <p className="ai-center-section-subtitle">
                                        یک سوال بپرس تا ببینی موتور پاسخ‌دهی از کدام دانش استفاده می‌کند و با چه امتیازی پاسخ می‌دهد.
                                    </p>
                                </div>
                            </div>

                            <form className="ai-center-form" onSubmit={handleTestQuestion}>
                                <label className="grid">
                                    <span>سوال تست</span>
                                    <input
                                        className="input"
                                        value={testQuestion}
                                        onChange={(event) => setTestQuestion(event.target.value)}
                                        placeholder="مثلاً شرایط مرجوعی کالا چیه؟"
                                    />
                                </label>

                                <div className="ai-center-actions">
                                    <button className="btn" type="submit" disabled={testing}>
                                        {testing ? "در حال تست..." : "تست پاسخ"}
                                    </button>
                                </div>
                            </form>

                            {testResult && (
                                <div className="ai-center-edit-box">
                                    <div className="ai-center-actions">
                                        <span className="soft-chip">
                                            answered: {testResult.answered ? "true" : "false"}
                                        </span>
                                        <span className="soft-chip">
                                            confidence: {testResult.confidence_score}
                                        </span>
                                        <span className="soft-chip">
                                            mode: {testResult.reply_mode}
                                        </span>
                                    </div>

                                    <p className="ai-center-item-text" style={{ marginBottom: 0 }}>
                                        {testResult.answer}
                                    </p>
                                </div>
                            )}
                        </section>
                    )}

                    {activeTab === "knowledge" && (
                        <div className="ai-center-grid">
                            <section className="ai-center-section">
                                <div className="ai-center-section-header">
                                    <div>
                                        <h2 className="ai-center-section-title">سوالات تولیدشده از محتوای سایت</h2>
                                        <p className="ai-center-section-subtitle">
                                            سوال و پاسخ‌هایی که از محتوای خزش‌شده ساخته شده‌اند.
                                        </p>
                                    </div>

                                    <span className="soft-chip primary">{generatedQuestions.length} مورد</span>
                                </div>

                                {generatedQuestions.length === 0 ? (
                                    <div className="empty-soft">
                                        <strong>هنوز سوالی از محتوای سایت ساخته نشده است</strong>
                                    </div>
                                ) : (
                                    <div className="ai-center-list">
                                        {generatedQuestions.map((item) => (
                                            <article key={item.id} className="ai-center-item">
                                                <div className="ai-center-item-top">
                                                    <div>
                                                        <h3 className="ai-center-item-title">{item.question}</h3>
                                                        <div className="ai-center-item-meta">
                                                            دسته: {item.category || "-"} · intent: {item.detected_intent || "-"} · نوع: {item.source_type} · وضعیت: {item.status}
                                                        </div>
                                                    </div>

                                                    <span className="soft-chip primary">score: {item.score}</span>
                                                </div>

                                                {item.answer_text && (
                                                    <p className="ai-center-item-text">
                                                        {item.answer_text.length > 180
                                                            ? item.answer_text.slice(0, 180) + "..."
                                                            : item.answer_text}
                                                    </p>
                                                )}

                                                <div className="ai-center-actions">
                                                    <button
                                                        className="btn secondary"
                                                        type="button"
                                                        onClick={() => handleOpenGeneratedQuestionEdit(item)}
                                                    >
                                                        ویرایش
                                                    </button>

                                                    {item.status === "active" ? (
                                                        <button
                                                            className="btn secondary"
                                                            type="button"
                                                            onClick={() => handleGeneratedQuestionStatus(item, "inactive")}
                                                        >
                                                            غیرفعال کردن
                                                        </button>
                                                    ) : (
                                                        <button
                                                            className="btn secondary"
                                                            type="button"
                                                            onClick={() => handleGeneratedQuestionStatus(item, "active")}
                                                        >
                                                            فعال کردن
                                                        </button>
                                                    )}
                                                </div>

                                                {editingGeneratedQuestion?.id === item.id && (
                                                    <form className="ai-center-edit-box" onSubmit={handleSaveGeneratedQuestion}>
                                                        <label className="grid">
                                                            <span>سوال</span>
                                                            <input
                                                                className="input"
                                                                value={editingGeneratedQuestion.question}
                                                                onChange={(event) =>
                                                                    setEditingGeneratedQuestion((prev) =>
                                                                        prev ? { ...prev, question: event.target.value } : prev
                                                                    )
                                                                }
                                                            />
                                                        </label>

                                                        <label className="grid">
                                                            <span>پاسخ</span>
                                                            <textarea
                                                                className="textarea"
                                                                value={editingGeneratedQuestion.answer_text || ""}
                                                                onChange={(event) =>
                                                                    setEditingGeneratedQuestion((prev) =>
                                                                        prev ? { ...prev, answer_text: event.target.value } : prev
                                                                    )
                                                                }
                                                            />
                                                        </label>

                                                        <div className="ai-center-three-col">
                                                            <label className="grid">
                                                                <span>دسته</span>
                                                                <input
                                                                    className="input"
                                                                    value={editingGeneratedQuestion.category || ""}
                                                                    onChange={(event) =>
                                                                        setEditingGeneratedQuestion((prev) =>
                                                                            prev ? { ...prev, category: event.target.value } : prev
                                                                        )
                                                                    }
                                                                />
                                                            </label>

                                                            <label className="grid">
                                                                <span>Intent</span>
                                                                <input
                                                                    className="input"
                                                                    value={editingGeneratedQuestion.detected_intent || ""}
                                                                    onChange={(event) =>
                                                                        setEditingGeneratedQuestion((prev) =>
                                                                            prev ? { ...prev, detected_intent: event.target.value } : prev
                                                                        )
                                                                    }
                                                                />
                                                            </label>

                                                            <label className="grid">
                                                                <span>وضعیت</span>
                                                                <select
                                                                    className="input"
                                                                    value={editingGeneratedQuestion.status}
                                                                    onChange={(event) =>
                                                                        setEditingGeneratedQuestion((prev) =>
                                                                            prev ? { ...prev, status: event.target.value } : prev
                                                                        )
                                                                    }
                                                                >
                                                                    <option value="active">active</option>
                                                                    <option value="inactive">inactive</option>
                                                                    <option value="archived">archived</option>
                                                                </select>
                                                            </label>
                                                        </div>

                                                        <div className="ai-center-actions">
                                                            <button className="btn" type="submit" disabled={savingGeneratedQuestion}>
                                                                {savingGeneratedQuestion ? "در حال ذخیره..." : "ذخیره تغییرات"}
                                                            </button>

                                                            <button
                                                                className="btn secondary"
                                                                type="button"
                                                                onClick={() => setEditingGeneratedQuestion(null)}
                                                            >
                                                                انصراف
                                                            </button>
                                                        </div>
                                                    </form>
                                                )}
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="ai-center-section">
                                <div className="ai-center-section-header">
                                    <div>
                                        <h2 className="ai-center-section-title">دانش دستی سایت</h2>
                                        <p className="ai-center-section-subtitle">
                                            این بخش از جدول knowledge_sources خوانده می‌شود و به‌عنوان دانش رسمی سایت در پاسخ‌های AI استفاده می‌شود.
                                        </p>
                                    </div>

                                    <span className="soft-chip primary">{knowledgeSources.length} مورد</span>
                                </div>

                                <form className="ai-center-form" onSubmit={handleCreateKnowledgeSource}>
                                    <div className="ai-center-two-col">
                                        <label className="grid">
                                            <span>نوع</span>
                                            <input
                                                className="input"
                                                value={newKnowledgeSource.type}
                                                onChange={(event) => setNewKnowledgeSource((prev) => ({ ...prev, type: event.target.value }))}
                                                placeholder="faq"
                                            />
                                        </label>

                                        <label className="grid">
                                            <span>وضعیت</span>
                                            <select
                                                className="input"
                                                value={newKnowledgeSource.status}
                                                onChange={(event) => setNewKnowledgeSource((prev) => ({ ...prev, status: event.target.value }))}
                                            >
                                                <option value="approved">approved</option>
                                                <option value="active">active</option>
                                                <option value="inactive">inactive</option>
                                                <option value="archived">archived</option>
                                            </select>
                                        </label>
                                    </div>

                                    <label className="grid">
                                        <span>عنوان</span>
                                        <input
                                            className="input"
                                            value={newKnowledgeSource.title}
                                            onChange={(event) => setNewKnowledgeSource((prev) => ({ ...prev, title: event.target.value }))}
                                            placeholder="مثلاً: شرایط ارسال فوری"
                                        />
                                    </label>

                                    <label className="grid">
                                        <span>سوال</span>
                                        <input
                                            className="input"
                                            value={newKnowledgeSource.question}
                                            onChange={(event) => setNewKnowledgeSource((prev) => ({ ...prev, question: event.target.value }))}
                                            placeholder="مثلاً: آیا ارسال فوری دارید؟"
                                        />
                                    </label>

                                    <label className="grid">
                                        <span>پاسخ</span>
                                        <textarea
                                            className="textarea"
                                            value={newKnowledgeSource.answer}
                                            onChange={(event) => setNewKnowledgeSource((prev) => ({ ...prev, answer: event.target.value }))}
                                            placeholder="پاسخ رسمی که AI باید استفاده کند..."
                                        />
                                    </label>

                                    <label className="grid">
                                        <span>محتوا / توضیح تکمیلی</span>
                                        <textarea
                                            className="textarea"
                                            value={newKnowledgeSource.content}
                                            onChange={(event) => setNewKnowledgeSource((prev) => ({ ...prev, content: event.target.value }))}
                                            placeholder="اختیاری؛ برای توضیحات بیشتر"
                                        />
                                    </label>

                                    <label className="grid">
                                        <span>URL منبع</span>
                                        <input
                                            className="input"
                                            value={newKnowledgeSource.url}
                                            onChange={(event) => setNewKnowledgeSource((prev) => ({ ...prev, url: event.target.value }))}
                                            placeholder="https://example.com/page"
                                        />
                                    </label>

                                    <div className="ai-center-actions">
                                        <button className="btn" type="submit" disabled={creatingKnowledgeSource}>
                                            {creatingKnowledgeSource ? "در حال ثبت..." : "افزودن دانش دستی"}
                                        </button>

                                        <button
                                            className="btn secondary"
                                            type="button"
                                            onClick={() => setNewKnowledgeSource(emptyKnowledgeSourceForm)}
                                        >
                                            پاک کردن فرم
                                        </button>
                                    </div>
                                </form>

                                {knowledgeSources.length === 0 ? (
                                    <div className="empty-soft">
                                        <strong>هنوز دانش دستی ثبت نشده است</strong>
                                        <p className="muted" style={{ marginBottom: 0 }}>
                                            رکوردهای knowledge_sources بعد از ثبت، اینجا نمایش داده می‌شوند.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="ai-center-list">
                                        {knowledgeSources.map((item) => {
                                            const mainTitle = item.title || item.question || `Knowledge Source #${item.id}`;
                                            const mainText = item.answer || item.content || "متنی برای این رکورد ثبت نشده است.";

                                            return (
                                                <article key={item.id} className="ai-center-item">
                                                    <div className="ai-center-item-top">
                                                        <div>
                                                            <h3 className="ai-center-item-title">{mainTitle}</h3>
                                                            <div className="ai-center-item-meta">
                                                                شناسه: {item.id} · نوع: {item.type || "نامشخص"} · وضعیت: {item.status}
                                                            </div>
                                                        </div>

                                                        <span className="soft-chip">{item.status}</span>
                                                    </div>

                                                    {item.question && (
                                                        <p className="ai-center-item-text" style={{ fontWeight: 800 }}>
                                                            سوال: {item.question}
                                                        </p>
                                                    )}

                                                    <p className="ai-center-item-text">{mainText}</p>

                                                    <div className="ai-center-actions">
                                                        <button
                                                            className="btn secondary"
                                                            type="button"
                                                            onClick={() => handleOpenKnowledgeSourceEdit(item)}
                                                        >
                                                            ویرایش
                                                        </button>

                                                        {item.status === "approved" || item.status === "active" ? (
                                                            <button
                                                                className="btn secondary"
                                                                type="button"
                                                                onClick={() => handleKnowledgeSourceStatus(item, "inactive")}
                                                            >
                                                                غیرفعال کردن
                                                            </button>
                                                        ) : (
                                                            <button
                                                                className="btn secondary"
                                                                type="button"
                                                                onClick={() => handleKnowledgeSourceStatus(item, "approved")}
                                                            >
                                                                فعال کردن
                                                            </button>
                                                        )}

                                                        {item.url && (
                                                            <a
                                                                className="btn secondary"
                                                                href={item.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                باز کردن لینک منبع
                                                            </a>
                                                        )}
                                                    </div>

                                                    {editingKnowledgeSource?.id === item.id && (
                                                        <form className="ai-center-edit-box" onSubmit={handleSaveKnowledgeSource}>
                                                            <div className="ai-center-two-col">
                                                                <label className="grid">
                                                                    <span>نوع</span>
                                                                    <input
                                                                        className="input"
                                                                        value={editingKnowledgeSource.type || ""}
                                                                        onChange={(event) =>
                                                                            setEditingKnowledgeSource((prev) =>
                                                                                prev ? { ...prev, type: event.target.value } : prev
                                                                            )
                                                                        }
                                                                        placeholder="faq"
                                                                    />
                                                                </label>

                                                                <label className="grid">
                                                                    <span>وضعیت</span>
                                                                    <select
                                                                        className="input"
                                                                        value={editingKnowledgeSource.status}
                                                                        onChange={(event) =>
                                                                            setEditingKnowledgeSource((prev) =>
                                                                                prev ? { ...prev, status: event.target.value } : prev
                                                                            )
                                                                        }
                                                                    >
                                                                        <option value="approved">approved</option>
                                                                        <option value="active">active</option>
                                                                        <option value="inactive">inactive</option>
                                                                        <option value="archived">archived</option>
                                                                    </select>
                                                                </label>
                                                            </div>

                                                            <label className="grid">
                                                                <span>عنوان</span>
                                                                <input
                                                                    className="input"
                                                                    value={editingKnowledgeSource.title || ""}
                                                                    onChange={(event) =>
                                                                        setEditingKnowledgeSource((prev) =>
                                                                            prev ? { ...prev, title: event.target.value } : prev
                                                                        )
                                                                    }
                                                                />
                                                            </label>

                                                            <label className="grid">
                                                                <span>سوال</span>
                                                                <input
                                                                    className="input"
                                                                    value={editingKnowledgeSource.question || ""}
                                                                    onChange={(event) =>
                                                                        setEditingKnowledgeSource((prev) =>
                                                                            prev ? { ...prev, question: event.target.value } : prev
                                                                        )
                                                                    }
                                                                />
                                                            </label>

                                                            <label className="grid">
                                                                <span>پاسخ</span>
                                                                <textarea
                                                                    className="textarea"
                                                                    value={editingKnowledgeSource.answer || ""}
                                                                    onChange={(event) =>
                                                                        setEditingKnowledgeSource((prev) =>
                                                                            prev ? { ...prev, answer: event.target.value } : prev
                                                                        )
                                                                    }
                                                                />
                                                            </label>

                                                            <label className="grid">
                                                                <span>محتوا / توضیح تکمیلی</span>
                                                                <textarea
                                                                    className="textarea"
                                                                    value={editingKnowledgeSource.content || ""}
                                                                    onChange={(event) =>
                                                                        setEditingKnowledgeSource((prev) =>
                                                                            prev ? { ...prev, content: event.target.value } : prev
                                                                        )
                                                                    }
                                                                />
                                                            </label>

                                                            <label className="grid">
                                                                <span>URL منبع</span>
                                                                <input
                                                                    className="input"
                                                                    value={editingKnowledgeSource.url || ""}
                                                                    onChange={(event) =>
                                                                        setEditingKnowledgeSource((prev) =>
                                                                            prev ? { ...prev, url: event.target.value } : prev
                                                                        )
                                                                    }
                                                                    placeholder="https://example.com/page"
                                                                />
                                                            </label>

                                                            <div className="ai-center-actions">
                                                                <button className="btn" type="submit" disabled={savingKnowledgeSource}>
                                                                    {savingKnowledgeSource ? "در حال ذخیره..." : "ذخیره تغییرات"}
                                                                </button>

                                                                <button
                                                                    className="btn secondary"
                                                                    type="button"
                                                                    onClick={() => setEditingKnowledgeSource(null)}
                                                                >
                                                                    انصراف
                                                                </button>
                                                            </div>
                                                        </form>
                                                    )}
                                                </article>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        </div>
                    )}

                    {activeTab === "unanswered" && (
                        <section className="ai-center-section">
                            <div className="ai-center-section-header">
                                <div>
                                    <h2 className="ai-center-section-title">سوالات بی‌پاسخ</h2>
                                    <p className="ai-center-section-subtitle">
                                        این سوالات برای تکمیل دانش AI مهم هستند. هر سوال را می‌توانی مستقیم به دانش اضافه کنی.
                                    </p>
                                </div>

                                <span className="soft-chip primary">{unansweredQuestions.length} مورد جدید</span>
                            </div>

                            {unansweredQuestions.length === 0 ? (
                                <div className="empty-soft">
                                    <strong>فعلاً سوال بی‌پاسخ جدیدی وجود ندارد</strong>
                                </div>
                            ) : (
                                <div className="ai-center-list">
                                    {unansweredQuestions.map((item) => (
                                        <article key={item.id} className="ai-center-item">
                                            <div className="ai-center-item-top">
                                                <div>
                                                    <h3 className="ai-center-item-title">{item.question}</h3>
                                                    <div className="ai-center-item-meta">
                                                        دسته تشخیص‌داده‌شده: {item.detected_category || "-"} · intent: {item.detected_intent || "-"} · وضعیت: {item.status}
                                                    </div>
                                                    <div className="ai-center-item-meta">ثبت‌شده در: {item.created_at}</div>
                                                </div>

                                                <span className="soft-chip danger">score: {item.best_match_score}</span>
                                            </div>

                                            <div className="ai-center-actions">
                                                <button
                                                    className="btn secondary"
                                                    type="button"
                                                    onClick={() => handleOpenKnowledgeForm(item)}
                                                >
                                                    افزودن به دانش
                                                </button>

                                                <button
                                                    className="btn secondary"
                                                    type="button"
                                                    onClick={() => handleUpdateUnansweredStatus(item.id, "reviewed")}
                                                >
                                                    بررسی شد
                                                </button>

                                                <button
                                                    className="btn secondary"
                                                    type="button"
                                                    onClick={() => handleUpdateUnansweredStatus(item.id, "ignored")}
                                                >
                                                    نادیده گرفتن
                                                </button>
                                            </div>

                                            {knowledgeForm?.id === item.id && (
                                                <form className="ai-center-edit-box" onSubmit={handleAddUnansweredToKnowledge}>
                                                    <label className="grid">
                                                        <span>سوال قابل ذخیره در دانش</span>
                                                        <input
                                                            className="input"
                                                            value={knowledgeForm.question}
                                                            onChange={(event) =>
                                                                setKnowledgeForm((prev) =>
                                                                    prev ? { ...prev, question: event.target.value } : prev
                                                                )
                                                            }
                                                        />
                                                    </label>

                                                    <label className="grid">
                                                        <span>پاسخ رسمی</span>
                                                        <textarea
                                                            className="textarea"
                                                            value={knowledgeForm.answer}
                                                            onChange={(event) =>
                                                                setKnowledgeForm((prev) =>
                                                                    prev ? { ...prev, answer: event.target.value } : prev
                                                                )
                                                            }
                                                            placeholder="مثلاً: در حال حاضر خرید اقساطی فعال نیست، اما می‌توانید برای شرایط پرداخت با پشتیبانی تماس بگیرید."
                                                        />
                                                    </label>

                                                    <div className="ai-center-actions">
                                                        <button className="btn" type="submit" disabled={addingKnowledge}>
                                                            {addingKnowledge ? "در حال افزودن..." : "ذخیره در دانش AI"}
                                                        </button>

                                                        <button
                                                            className="btn secondary"
                                                            type="button"
                                                            onClick={() => setKnowledgeForm(null)}
                                                        >
                                                            انصراف
                                                        </button>
                                                    </div>
                                                </form>
                                            )}
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}
                </div>
            )}
        </AppShell>
    );
}
