// مسیر فایل: ai-chat-saas/frontend/app/ai-center/page.tsx
// هدف: مدیریت خزش، تنظیمات، منابع و تست پاسخ‌دهی AI

"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
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
    resolved_url: string | null;
    is_scope_valid: boolean;
    label: string | null;
    category_hint: string | null;
    is_active: boolean;
    last_crawled_at: string | null;
    created_at: string;
    pages_count: number;
    active_chunks_count: number;
    active_questions_count: number;
};

type CrawlRun = {
    id: number;
    site_id: number;
    status: "queued" | "running" | "completed" | "failed" | "cancelled";
    current_stage: string;
    current_message: string | null;
    current_url: string | null;
    progress_percent: number;
    page_limit: number;
    max_depth: number;
    total_urls: number;
    queued_urls: number;
    processed_urls: number;
    fetched_pages: number;
    failed_pages: number;
    created_chunks: number;
    created_terms: number;
    created_questions: number;
    unchanged_pages: number;
    preserved_questions: number;
    archived_questions: number;
    error_message: string | null;
    started_at: string | null;
    finished_at: string | null;
    last_activity_at: string | null;
};

type AiOverview = {
    counts: {
        pages: number;
        chunks: number;
        terms: number;
        questions: number;
        unanswered: number;
        unanswered_occurrences: number;
        answer_logs: number;
        test_logs: number;
    };
    recent_runs: Array<{
        id: number;
        status: string;
        current_stage?: string;
        current_message?: string | null;
        current_url?: string | null;
        progress_percent?: number;
        total_urls: number;
        queued_urls?: number;
        processed_urls?: number;
        fetched_pages: number;
        failed_pages: number;
        created_chunks: number;
        created_terms: number;
        created_questions: number;
        unchanged_pages?: number;
        preserved_questions?: number;
        archived_questions?: number;
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

type SearchScoreBreakdown = {
    question_match?: number;
    answer_match?: number;
    intent_boost?: number;
    term_boost?: number;
    source_boost?: number;
};

type SearchSource = {
    type: string;
    score: number;
    title: string | null;
    url: string | null;
    category: string | null;
    intent: string | null;
    matched_terms: string[];
    score_breakdown: SearchScoreBreakdown;
};

type SearchCandidate = {
    type: string;
    score: number;
    title: string | null;
    url: string | null;
    matched_question: string | null;
    category: string | null;
    intent: string | null;
    matched_terms: string[];
    preview: string;
    score_breakdown: SearchScoreBreakdown;
};

type SearchDebug = {
    engine_version: string;
    normalized_question: string;
    tokens: string[];
    expanded_tokens: string[];
    detected: {
        category: string | null;
        intent: string | null;
    };
    matched_type: string | null;
    confidence_label: string;
    candidate_count: number;
    score_gap: number;
    matched_terms: string[];
    processing_time_ms: number;
    best_candidates: SearchCandidate[];
};

type SearchResult = {
    answered: boolean;
    reply_mode: string;
    confidence_score: number;
    min_suggestion_score: number;
    answer: string;
    request_source?: string;
    failure_reason?: string | null;
    sources?: SearchSource[];
    debug?: SearchDebug;
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
    is_user_edited: boolean;
    source_chunk_hash: string | null;
    last_seen_crawl_run_id: number | null;
    preserved_at: string | null;
    score: number;
    status: string;
    created_at: string;
    updated_at: string | null;
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
    normalized_question: string;
    occurrence_count: number;
    first_seen_at: string;
    last_seen_at: string;
    failure_reason: string | null;
    detected_category: string | null;
    detected_intent: string | null;
    best_match_score: number;
    status: string;
    created_at: string;
};

type AiCenterTab =
    "overview" | "settings" | "crawl" | "test" | "knowledge" | "unanswered";

const failureReasonLabels: Record<string, string> = {
    no_candidate: "هیچ دانش مرتبطی پیدا نشد",
    low_confidence: "امتیاز پاسخ کمتر از حد لازم بود",
    question_too_short: "سؤال برای جست‌وجو خیلی کوتاه بود",
    unknown: "علت نامشخص",
};

const confidenceLabels: Record<string, string> = {
    very_high: "اطمینان بسیار بالا",
    high: "اطمینان بالا",
    medium: "اطمینان متوسط",
    low: "اطمینان پایین",
};

const searchSourceLabels: Record<string, string> = {
    knowledge_source: "دانش تأییدشده دستی",
    generated_question: "سؤال و پاسخ استخراج‌شده",
    content_chunk: "قطعه محتوای خزیده‌شده",
};

const intentLabels: Record<string, string> = {
    pricing: "قیمت و تعرفه",
    shipping: "ارسال و تحویل",
    returns: "مرجوعی و بازگشت",
    warranty: "ضمانت",
    installment: "خرید اقساطی",
    payment: "پرداخت",
    support_hours: "ساعات پشتیبانی",
    contact: "تماس و مراجعه",
    availability: "موجودی",
    appointment: "نوبت‌دهی",
    product_info: "اطلاعات محصول",
    service_info: "اطلاعات خدمات",
    general_info: "اطلاعات عمومی",
};

const searchTestExamples = [
    "ارسال رایگان برای چه سفارش‌هایی است؟",
    "شرایط خرید اقساطی چیست؟",
    "کالای آسیب‌دیده را تا چه زمانی باید گزارش کنیم؟",
    "پشتیبانی پنجشنبه‌ها تا چه ساعتی فعال است؟",
];

const crawlStageLabels: Record<string, string> = {
    queued: "در صف",
    preparing: "آماده‌سازی منابع",
    discovering: "کشف لینک‌های داخلی",
    fetching: "دریافت صفحه",
    extracting: "استخراج متن و لینک‌ها",
    storing: "ساخت دانش و سؤال‌ها",
    finalizing: "نهایی‌سازی",
    completed: "تکمیل‌شده",
    failed: "ناموفق",
    cancelled: "لغوشده",
};

const crawlStages = [
    "preparing",
    "discovering",
    "fetching",
    "extracting",
    "storing",
    "finalizing",
];

function sleep(milliseconds: number) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function isActiveCrawl(run: CrawlRun | null) {
    return !!run && (run.status === "queued" || run.status === "running");
}

const defaultSettings: AiSettings = {
    assistant_enabled: true,
    auto_reply_enabled: false,
    crawl_enabled: true,
    min_auto_reply_score: 40,
    min_suggestion_score: 40,
    max_pages_per_crawl: 30,
    max_depth: 1,
    fallback_message:
        "برای این سوال پاسخ دقیقی در اطلاعات سایت پیدا نکردم. پیام شما برای پشتیبان ثبت شد.",
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
        source_value: "/",
        label: "",
        category_hint: "services",
        is_active: true,
    });

    const [testQuestion, setTestQuestion] = useState("شرایط مرجوعی کالا چیه؟");
    const [testResult, setTestResult] = useState<SearchResult | null>(null);
    const [generatedQuestions, setGeneratedQuestions] = useState<
        GeneratedQuestion[]
    >([]);
    const [unansweredQuestions, setUnansweredQuestions] = useState<
        UnansweredQuestion[]
    >([]);
    const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>(
        [],
    );
    const [editingKnowledgeSource, setEditingKnowledgeSource] =
        useState<KnowledgeSource | null>(null);
    const [savingKnowledgeSource, setSavingKnowledgeSource] = useState(false);
    const [newKnowledgeSource, setNewKnowledgeSource] =
        useState<KnowledgeSourceForm>(emptyKnowledgeSourceForm);
    const [creatingKnowledgeSource, setCreatingKnowledgeSource] = useState(false);
    const [knowledgeForm, setKnowledgeForm] = useState<{
        id: number;
        question: string;
        answer: string;
    } | null>(null);

    const [addingKnowledge, setAddingKnowledge] = useState(false);

    const [editingGeneratedQuestion, setEditingGeneratedQuestion] =
        useState<GeneratedQuestion | null>(null);
    const [savingGeneratedQuestion, setSavingGeneratedQuestion] = useState(false);

    const [loading, setLoading] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);
    const [creatingSource, setCreatingSource] = useState(false);
    const [crawling, setCrawling] = useState(false);
    const [crawlRun, setCrawlRun] = useState<CrawlRun | null>(null);
    const crawlLoopRunIdRef = useRef<number | null>(null);
    const crawlPollTimerRef = useRef<ReturnType<
        typeof window.setInterval
    > | null>(null);
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

    useEffect(() => {
        return () => {
            crawlLoopRunIdRef.current = null;

            if (crawlPollTimerRef.current !== null) {
                window.clearInterval(crawlPollTimerRef.current);
            }
        };
    }, []);

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
                crawlStatusData,
            ] = await Promise.all([
                apiRequest(`/customer/ai-settings.php?site_id=${siteId}`),
                apiRequest(`/customer/ai-crawl-sources-list.php?site_id=${siteId}`),
                apiRequest(`/customer/ai-overview.php?site_id=${siteId}`),
                apiRequest(
                    `/customer/ai-generated-questions-list.php?site_id=${siteId}&limit=20`,
                ),
                apiRequest(
                    `/customer/ai-unanswered-list.php?site_id=${siteId}&status=new&limit=20`,
                ),
                apiRequest(
                    `/customer/ai-knowledge-sources-list.php?site_id=${siteId}&limit=80`,
                ),
                apiRequest(`/customer/ai-crawl-status.php?site_id=${siteId}`),
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

            const currentRun =
                crawlStatusData.active_run || crawlStatusData.latest_run || null;
            setCrawlRun(currentRun);

            if (currentRun && isActiveCrawl(currentRun)) {
                window.setTimeout(() => {
                    void processCrawlRun(currentRun.id, siteId);
                }, 0);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت اطلاعات AI");
        }
    }

    async function handleSiteChange(siteId: number) {
        crawlLoopRunIdRef.current = null;

        if (crawlPollTimerRef.current !== null) {
            window.clearInterval(crawlPollTimerRef.current);
            crawlPollTimerRef.current = null;
        }

        setCrawling(false);
        setCrawlRun(null);
        setSelectedSiteId(siteId);
        setTestResult(null);
        await loadAiData(siteId);
    }

    function updateSetting<K extends keyof AiSettings>(
        key: K,
        value: AiSettings[K],
    ) {
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

        const internalPath = sourceForm.source_value.trim();

        if (!internalPath) {
            setError("مسیر داخلی خزش را وارد کنید.");
            return;
        }

        if (/^https?:\/\//i.test(internalPath) || internalPath.startsWith("//")) {
            setError(
                "دامنه وارد نکنید؛ فقط مسیر داخلی همان سایت، مثل /services، مجاز است.",
            );
            return;
        }

        if (!internalPath.startsWith("/")) {
            setError("مسیر داخلی باید با / شروع شود.");
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
                source_value: "/",
                label: "",
            }));

            await loadAiData(selectedSiteId);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ثبت منبع خزش ناموفق بود");
        } finally {
            setCreatingSource(false);
        }
    }

    async function handleSourceStatus(source: CrawlSource, isActive: boolean) {
        const confirmed = window.confirm(
            isActive
                ? "این منبع دوباره فعال شود؟ محتوای آن بعد از اجرای خزش بعدی وارد پاسخ‌دهی می‌شود."
                : "این منبع غیرفعال شود؟ دانش خودکار آن آرشیو می‌شود، اما سؤال‌ها و پاسخ‌های ویرایش‌شده دستی حفظ خواهند شد.",
        );

        if (!confirmed) return;

        try {
            setError("");
            setSuccess("");

            const result = await apiRequest("/customer/ai-crawl-source-status.php", {
                method: "POST",
                body: JSON.stringify({
                    id: source.id,
                    is_active: isActive,
                }),
            });

            if (isActive) {
                setSuccess(
                    "منبع فعال شد. برای بروزرسانی دانش آن، خزش سایت را اجرا کنید.",
                );
            } else {
                setSuccess(
                    `منبع غیرفعال شد. صفحات: ${result.result?.affected_pages || 0}، بخش‌های آرشیوشده: ${result.result?.archived_chunks || 0}، ویرایش‌های حفظ‌شده: ${result.result?.preserved_questions || 0}`,
                );
            }

            if (selectedSiteId) {
                await loadAiData(selectedSiteId);
            }
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "تغییر وضعیت منبع ناموفق بود",
            );
        }
    }

    function stopCrawlStatusPolling() {
        if (crawlPollTimerRef.current !== null) {
            window.clearInterval(crawlPollTimerRef.current);
            crawlPollTimerRef.current = null;
        }
    }

    async function refreshCrawlRunStatus(runId: number) {
        try {
            const statusData = await apiRequest(
                `/customer/ai-crawl-status.php?run_id=${runId}`,
            );
            const nextRun = statusData.run as CrawlRun;
            setCrawlRun(nextRun);

            if (!isActiveCrawl(nextRun)) {
                stopCrawlStatusPolling();
            }
        } catch {
            // خطای موقت polling نباید فرآیند اصلی خزش را متوقف کند.
        }
    }

    function startCrawlStatusPolling(runId: number) {
        stopCrawlStatusPolling();
        void refreshCrawlRunStatus(runId);

        crawlPollTimerRef.current = window.setInterval(() => {
            void refreshCrawlRunStatus(runId);
        }, 650);
    }

    async function processCrawlRun(runId: number, siteId: number) {
        if (crawlLoopRunIdRef.current === runId) {
            return;
        }

        crawlLoopRunIdRef.current = runId;
        setCrawling(true);
        startCrawlStatusPolling(runId);

        try {
            while (crawlLoopRunIdRef.current === runId) {
                const result = await apiRequest("/customer/ai-crawl-process.php", {
                    method: "POST",
                    body: JSON.stringify({ run_id: runId }),
                });

                const nextRun = result.run as CrawlRun;
                setCrawlRun(nextRun);

                if (!isActiveCrawl(nextRun)) {
                    if (nextRun.status === "completed") {
                        setSuccess(
                            `خزش کامل شد. صفحات موفق: ${nextRun.fetched_pages}، ناموفق/نادیده: ${nextRun.failed_pages}، بدون تغییر: ${nextRun.unchanged_pages}، بخش‌های جدید: ${nextRun.created_chunks}، سؤال‌های حفظ‌شده: ${nextRun.preserved_questions}`,
                        );
                    } else if (nextRun.status === "failed") {
                        setError(nextRun.error_message || "خزش ناموفق بود.");
                    }

                    break;
                }

                await sleep(120);
            }
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "ادامه خزش سایت ناموفق بود",
            );
            await refreshCrawlRunStatus(runId);
        } finally {
            if (crawlLoopRunIdRef.current === runId) {
                crawlLoopRunIdRef.current = null;
            }

            stopCrawlStatusPolling();
            setCrawling(false);
            await loadAiData(siteId);
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
            setActiveTab("crawl");

            const result = await apiRequest("/customer/ai-crawl-start.php", {
                method: "POST",
                body: JSON.stringify({
                    site_id: selectedSiteId,
                }),
            });

            const run = result.run as CrawlRun;
            setCrawlRun(run);
            await processCrawlRun(run.id, selectedSiteId);
        } catch (err) {
            setError(err instanceof Error ? err.message : "شروع خزش سایت ناموفق بود");
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
            setError(
                err instanceof Error ? err.message : "بروزرسانی وضعیت سوال ناموفق بود",
            );
        }
    }
    function handleOpenKnowledgeForm(item: UnansweredQuestion) {
        setKnowledgeForm({
            id: item.id,
            question: item.question,
            answer: "",
        });
    }

    async function handleAddUnansweredToKnowledge(
        event: FormEvent<HTMLFormElement>,
    ) {
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
            setError(
                err instanceof Error ? err.message : "افزودن به دانش AI ناموفق بود",
            );
        } finally {
            setAddingKnowledge(false);
        }
    }
    function handleOpenGeneratedQuestionEdit(item: GeneratedQuestion) {
        setEditingGeneratedQuestion(item);
    }

    async function handleSaveGeneratedQuestion(
        event: FormEvent<HTMLFormElement>,
    ) {
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
                    detected_intent:
                        editingGeneratedQuestion.detected_intent || "manual_answer",
                    status: editingGeneratedQuestion.status || "active",
                }),
            });

            setSuccess("سوال دانش AI بروزرسانی شد.");
            setEditingGeneratedQuestion(null);

            if (selectedSiteId) {
                await loadAiData(selectedSiteId);
            }
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "ویرایش سوال دانش ناموفق بود",
            );
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

        if (
            !editingKnowledgeSource.title?.trim() &&
            !editingKnowledgeSource.question?.trim()
        ) {
            setError("عنوان یا سوال الزامی است.");
            return;
        }

        if (
            !editingKnowledgeSource.answer?.trim() &&
            !editingKnowledgeSource.content?.trim()
        ) {
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
            setError(
                err instanceof Error ? err.message : "ویرایش دانش دستی ناموفق بود",
            );
        } finally {
            setSavingKnowledgeSource(false);
        }
    }

    async function handleKnowledgeSourceStatus(
        item: KnowledgeSource,
        status: "draft" | "approved" | "archived",
    ) {
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
            setError(
                err instanceof Error ? err.message : "تغییر وضعیت دانش دستی ناموفق بود",
            );
        }
    }
    async function handleCreateKnowledgeSource(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        if (!selectedSiteId) {
            setError("ابتدا سایت را انتخاب کنید.");
            return;
        }

        if (
            !newKnowledgeSource.title.trim() &&
            !newKnowledgeSource.question.trim()
        ) {
            setError("عنوان یا سوال الزامی است.");
            return;
        }

        if (
            !newKnowledgeSource.answer.trim() &&
            !newKnowledgeSource.content.trim()
        ) {
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
    async function handleGeneratedQuestionStatus(
        item: GeneratedQuestion,
        status: "active" | "ignored" | "archived",
    ) {
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
            setError(
                err instanceof Error ? err.message : "تغییر وضعیت سوال ناموفق بود",
            );
        }
    }
    const selectedSite = sites.find((site) => site.id === selectedSiteId);
    const activeSourceCount = sources.filter(
        (source) => source.is_active && source.is_scope_valid,
    ).length;
    const currentCrawlStageIndex = crawlRun
        ? crawlStages.indexOf(crawlRun.current_stage)
        : -1;
    const crawlIsActive = isActiveCrawl(crawlRun);

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
            description:
                "رسیدگی به سوالاتی که AI برای آن‌ها پاسخ دقیق پیدا نکرده است",
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
                    <button
                        className="btn secondary"
                        type="button"
                        onClick={() => loadAiData()}
                    >
                        بروزرسانی
                    </button>

                    <button
                        className="btn"
                        type="button"
                        onClick={handleStartCrawl}
                        disabled={crawling || crawlIsActive || activeSourceCount === 0}
                    >
                        {crawling || crawlIsActive ? "در حال خزش…" : "شروع خزش سایت"}
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
                                    ابتدا سایت را انتخاب کن تا تنظیمات، منابع و دانش همان سایت
                                    مدیریت شود.
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
                                onChange={(event) =>
                                    handleSiteChange(Number(event.target.value))
                                }
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
                            <span>سوالات بی‌پاسخ یکتا</span>
                            <small>
                                {overview?.counts.unanswered_occurrences || 0} بار تکرار
                            </small>
                        </div>

                        <div className="ai-center-metric">
                            <strong>{overview?.counts.answer_logs || 0}</strong>
                            <span>لاگ واقعی پاسخ‌ها</span>
                            <small>{overview?.counts.test_logs || 0} تست جداشده</small>
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
                                                        <h3 className="ai-center-item-title">
                                                            Run #{run.id}
                                                        </h3>
                                                        <div className="ai-center-item-meta">
                                                            صفحات موفق: {run.fetched_pages} · خطا:{" "}
                                                            {run.failed_pages} · chunks: {run.created_chunks}{" "}
                                                            · questions: {run.created_questions}
                                                        </div>
                                                    </div>

                                                    <span className="soft-chip primary">
                            {run.status}
                          </span>
                                                </div>

                                                {run.error_message && (
                                                    <p
                                                        className="ai-center-item-text"
                                                        style={{ color: "var(--danger)" }}
                                                    >
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
                                        <h2 className="ai-center-section-title">
                                            آخرین صفحات خوانده‌شده
                                        </h2>
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
                                                            {page.main_heading ||
                                                                page.title ||
                                                                `Page #${page.id}`}
                                                        </h3>
                                                        <div className="ai-center-item-meta">
                                                            {page.url}
                                                        </div>
                                                    </div>

                                                    <span className="soft-chip primary">
                            {page.crawl_status}
                          </span>
                                                </div>

                                                <div className="ai-center-item-meta">
                                                    دسته: {page.category || "-"} · intent:{" "}
                                                    {page.detected_intent || "-"} · تعداد کلمه:{" "}
                                                    {page.word_count}
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
                                        این تنظیمات مشخص می‌کند AI چه زمانی فعال باشد، چه زمانی پاسخ
                                        خودکار بدهد و حداقل امتیاز پاسخ چقدر باشد.
                                    </p>
                                </div>
                            </div>

                            <form className="ai-center-form" onSubmit={handleSaveSettings}>
                                <label
                                    style={{ display: "flex", gap: 10, alignItems: "center" }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={settings.assistant_enabled}
                                        onChange={(event) =>
                                            updateSetting("assistant_enabled", event.target.checked)
                                        }
                                    />
                                    <span>فعال بودن دستیار AI</span>
                                </label>

                                <label
                                    style={{ display: "flex", gap: 10, alignItems: "center" }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={settings.auto_reply_enabled}
                                        onChange={(event) =>
                                            updateSetting("auto_reply_enabled", event.target.checked)
                                        }
                                    />
                                    <span>پاسخ خودکار وقتی پشتیبان آنلاین نیست</span>
                                </label>

                                <label
                                    style={{ display: "flex", gap: 10, alignItems: "center" }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={settings.crawl_enabled}
                                        onChange={(event) =>
                                            updateSetting("crawl_enabled", event.target.checked)
                                        }
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
                                            onChange={(event) =>
                                                updateSetting(
                                                    "min_auto_reply_score",
                                                    Number(event.target.value),
                                                )
                                            }
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
                                            onChange={(event) =>
                                                updateSetting(
                                                    "min_suggestion_score",
                                                    Number(event.target.value),
                                                )
                                            }
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
                                            onChange={(event) =>
                                                updateSetting(
                                                    "max_pages_per_crawl",
                                                    Number(event.target.value),
                                                )
                                            }
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
                                            onChange={(event) =>
                                                updateSetting("max_depth", Number(event.target.value))
                                            }
                                        />
                                    </label>
                                </div>

                                <label className="grid">
                                    <span>پیام جایگزین وقتی پاسخ دقیق پیدا نشد</span>
                                    <textarea
                                        className="textarea"
                                        value={settings.fallback_message}
                                        onChange={(event) =>
                                            updateSetting("fallback_message", event.target.value)
                                        }
                                    />
                                </label>

                                <div className="ai-center-actions">
                                    <button
                                        className="btn"
                                        type="submit"
                                        disabled={savingSettings}
                                    >
                                        {savingSettings ? "در حال ذخیره..." : "ذخیره تنظیمات AI"}
                                    </button>
                                </div>
                            </form>
                        </section>
                    )}

                    {activeTab === "crawl" && (
                        <div className="ai-center-main">
                            {crawlRun && (
                                <section
                                    className={`ai-center-section ai-crawl-progress-card ${crawlRun.status}`}
                                >
                                    <div className="ai-center-section-header">
                                        <div>
                                            <h2 className="ai-center-section-title">
                                                پیشرفت خزش سایت
                                            </h2>
                                            <p className="ai-center-section-subtitle">
                                                درصد و مرحله نمایش‌داده‌شده از وضعیت واقعی Job در سرور
                                                خوانده می‌شود.
                                            </p>
                                        </div>

                                        <span
                                            className={`soft-chip ${crawlRun.status === "completed" ? "success" : crawlRun.status === "failed" ? "danger" : "primary"}`}
                                        >
                      {crawlStageLabels[crawlRun.current_stage] ||
                          crawlRun.current_stage}
                    </span>
                                    </div>

                                    <div className="ai-crawl-progress-heading">
                                        <strong>{crawlRun.progress_percent}%</strong>
                                        <span>
                      {crawlRun.current_message || "در انتظار شروع مرحله بعد…"}
                    </span>
                                    </div>

                                    <div
                                        className="ai-crawl-progress-track"
                                        role="progressbar"
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={crawlRun.progress_percent}
                                    >
                    <span
                        style={{
                            width: `${Math.max(0, Math.min(100, crawlRun.progress_percent))}%`,
                        }}
                    />
                                    </div>

                                    {crawlRun.current_url && (
                                        <div
                                            className="ai-crawl-current-url"
                                            title={crawlRun.current_url}
                                        >
                                            <span>آدرس در حال پردازش</span>
                                            <code>{crawlRun.current_url}</code>
                                        </div>
                                    )}

                                    <div className="ai-crawl-stage-list">
                                        {crawlStages.map((stage, index) => {
                                            const stageCompleted =
                                                crawlRun.status === "completed" ||
                                                index < currentCrawlStageIndex;
                                            const stageActive =
                                                stage === crawlRun.current_stage && crawlIsActive;

                                            return (
                                                <div
                                                    key={stage}
                                                    className={`ai-crawl-stage ${stageCompleted ? "completed" : ""} ${stageActive ? "active" : ""}`}
                                                >
                                                    <span>{stageCompleted ? "✓" : index + 1}</span>
                                                    <small>{crawlStageLabels[stage]}</small>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="ai-crawl-stat-grid">
                                        <div>
                                            <strong>{crawlRun.processed_urls}</strong>
                                            <span>پردازش‌شده</span>
                                        </div>
                                        <div>
                                            <strong>{crawlRun.queued_urls}</strong>
                                            <span>در صف</span>
                                        </div>
                                        <div>
                                            <strong>{crawlRun.fetched_pages}</strong>
                                            <span>صفحه موفق</span>
                                        </div>
                                        <div>
                                            <strong>{crawlRun.failed_pages}</strong>
                                            <span>ناموفق/نادیده</span>
                                        </div>
                                        <div>
                                            <strong>{crawlRun.created_chunks}</strong>
                                            <span>بخش دانش جدید</span>
                                        </div>
                                        <div>
                                            <strong>{crawlRun.created_questions}</strong>
                                            <span>سؤال جدید</span>
                                        </div>
                                        <div>
                                            <strong>{crawlRun.unchanged_pages}</strong>
                                            <span>بدون تغییر</span>
                                        </div>
                                        <div>
                                            <strong>{crawlRun.preserved_questions}</strong>
                                            <span>ویرایش حفظ‌شده</span>
                                        </div>
                                    </div>

                                    {crawlRun.status === "failed" && crawlRun.error_message && (
                                        <div className="error">{crawlRun.error_message}</div>
                                    )}
                                </section>
                            )}

                            <section className="ai-center-section ai-crawl-explainer">
                                <div className="ai-center-section-header">
                                    <div>
                                        <h2 className="ai-center-section-title">
                                            خزش چه کاری انجام می‌دهد؟
                                        </h2>
                                        <p className="ai-center-section-subtitle">
                                            سیستم فقط در محدوده دامنه و مسیر پایه سایت انتخاب‌شده حرکت
                                            می‌کند.
                                        </p>
                                    </div>
                                </div>

                                <div className="ai-crawl-flow-grid">
                                    <div>
                                        <strong>۱</strong>
                                        <span>منابع داخلی فعال بررسی و وارد صف می‌شوند.</span>
                                    </div>
                                    <div>
                                        <strong>۲</strong>
                                        <span>
                      صفحه یا Sitemap دریافت و Redirect نهایی کنترل می‌شود.
                    </span>
                                    </div>
                                    <div>
                                        <strong>۳</strong>
                                        <span>فقط لینک‌های داخلی همان سایت کشف می‌شوند.</span>
                                    </div>
                                    <div>
                                        <strong>۴</strong>
                                        <span>
                      متن خوانا استخراج و به بخش‌های کوچک دانش تبدیل می‌شود.
                    </span>
                                    </div>
                                    <div>
                                        <strong>۵</strong>
                                        <span>
                      کلیدواژه و سؤال پیشنهادی ساخته یا بروزرسانی می‌شود.
                    </span>
                                    </div>
                                    <div>
                                        <strong>۶</strong>
                                        <span>دانش ویرایش‌شده حفظ و نتیجه نهایی ثبت می‌شود.</span>
                                    </div>
                                </div>
                            </section>

                            <div className="ai-center-grid">
                                <section className="ai-center-section">
                                    <div className="ai-center-section-header">
                                        <div>
                                            <h2 className="ai-center-section-title">
                                                ثبت منبع داخلی خزش
                                            </h2>
                                            <p className="ai-center-section-subtitle">
                                                دامنه سایت ثابت است؛ فقط مسیر داخلی آن را وارد کن. ثبت
                                                URL خارجی در فرانت‌اند و بک‌اند مسدود شده است.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="ai-internal-scope-note">
                                        <span>محدوده مجاز</span>
                                        <strong>{selectedSite?.domain || "-"}</strong>
                                    </div>

                                    <form
                                        className="ai-center-form"
                                        onSubmit={handleCreateSource}
                                    >
                                        <label className="grid">
                                            <span>نوع منبع</span>
                                            <select
                                                className="input"
                                                value={sourceForm.source_type}
                                                onChange={(event) =>
                                                    setSourceForm((prev) => ({
                                                        ...prev,
                                                        source_type: event.target.value as
                                                            "url" | "path_prefix" | "sitemap",
                                                        source_value:
                                                            event.target.value === "sitemap"
                                                                ? "/sitemap.xml"
                                                                : "/",
                                                    }))
                                                }
                                            >
                                                <option value="url">یک صفحه داخلی</option>
                                                <option value="path_prefix">
                                                    یک مسیر و صفحات زیرمجموعه
                                                </option>
                                                <option value="sitemap">نقشه سایت داخلی</option>
                                            </select>
                                        </label>

                                        <label className="grid">
                                            <span>مسیر داخلی</span>
                                            <div className="ai-internal-path-field">
                                                <span>{selectedSite?.domain || "سایت"}</span>
                                                <input
                                                    className="input"
                                                    value={sourceForm.source_value}
                                                    onChange={(event) =>
                                                        setSourceForm((prev) => ({
                                                            ...prev,
                                                            source_value: event.target.value,
                                                        }))
                                                    }
                                                    placeholder={
                                                        sourceForm.source_type === "sitemap"
                                                            ? "/sitemap.xml"
                                                            : "/services"
                                                    }
                                                    dir="ltr"
                                                />
                                            </div>
                                            <small className="muted">
                                                نمونه مجاز: / ، /services ، /blog یا /sitemap.xml
                                            </small>
                                        </label>

                                        <label className="grid">
                                            <span>عنوان نمایشی</span>
                                            <input
                                                className="input"
                                                value={sourceForm.label}
                                                onChange={(event) =>
                                                    setSourceForm((prev) => ({
                                                        ...prev,
                                                        label: event.target.value,
                                                    }))
                                                }
                                                placeholder="مثلاً صفحات خدمات"
                                            />
                                        </label>

                                        <label className="grid">
                                            <span>دسته پیشنهادی</span>
                                            <select
                                                className="input"
                                                value={sourceForm.category_hint}
                                                onChange={(event) =>
                                                    setSourceForm((prev) => ({
                                                        ...prev,
                                                        category_hint: event.target.value,
                                                    }))
                                                }
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
                                            <button
                                                className="btn"
                                                type="submit"
                                                disabled={creatingSource || crawlIsActive}
                                            >
                                                {creatingSource ? "در حال ثبت…" : "ثبت منبع داخلی"}
                                            </button>
                                        </div>
                                    </form>
                                </section>

                                <section className="ai-center-section">
                                    <div className="ai-center-section-header">
                                        <div>
                                            <h2 className="ai-center-section-title">منابع خزش</h2>
                                            <p className="ai-center-section-subtitle">
                                                غیرفعال‌سازی، دانش خودکار را از پاسخ‌دهی خارج می‌کند؛
                                                ویرایش‌های دستی باقی می‌مانند.
                                            </p>
                                        </div>

                                        <span className="soft-chip primary">
                      {activeSourceCount} فعال
                    </span>
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
                                                            <div className="ai-center-item-meta" dir="ltr">
                                                                {source.resolved_url || source.source_value}
                                                            </div>
                                                            {!source.is_scope_valid && (
                                                                <div className="ai-source-scope-warning">
                                                                    این منبع قدیمی خارج از محدوده سایت است و تا زمان
                                                                    غیرفعال‌سازی یا ثبت مجدد، وارد صف خزش نمی‌شود.
                                                                </div>
                                                            )}
                                                            <div className="ai-center-item-meta">
                                                                نوع:{" "}
                                                                {source.source_type === "url"
                                                                    ? "صفحه داخلی"
                                                                    : source.source_type === "path_prefix"
                                                                        ? "مسیر داخلی"
                                                                        : "Sitemap داخلی"}{" "}
                                                                · دسته: {source.category_hint || "تشخیص خودکار"}
                                                            </div>
                                                            <div className="ai-source-counts">
                                                                <span>{source.pages_count} صفحه</span>
                                                                <span>
                                  {source.active_chunks_count} بخش فعال
                                </span>
                                                                <span>
                                  {source.active_questions_count} سؤال فعال
                                </span>
                                                            </div>
                                                        </div>

                                                        <span
                                                            className={`soft-chip ${
                                                                !source.is_scope_valid
                                                                    ? "danger"
                                                                    : source.is_active
                                                                        ? "success"
                                                                        : "danger"
                                                            }`}
                                                        >
                              {!source.is_scope_valid
                                  ? "نامعتبر"
                                  : source.is_active
                                      ? "فعال"
                                      : "غیرفعال"}
                            </span>
                                                    </div>

                                                    <div className="ai-center-actions">
                                                        {source.is_active ? (
                                                            <button
                                                                className="btn secondary"
                                                                type="button"
                                                                disabled={crawlIsActive}
                                                                onClick={() =>
                                                                    handleSourceStatus(source, false)
                                                                }
                                                            >
                                                                غیرفعال و آرشیو دانش خودکار
                                                            </button>
                                                        ) : (
                                                            <button
                                                                className="btn"
                                                                type="button"
                                                                disabled={crawlIsActive}
                                                                onClick={() => handleSourceStatus(source, true)}
                                                            >
                                                                فعال‌سازی دوباره
                                                            </button>
                                                        )}
                                                    </div>
                                                </article>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            </div>
                        </div>
                    )}

                    {activeTab === "test" && (
                        <section className="ai-center-section ai-search-lab">
                            <div className="ai-center-section-header ai-search-lab-header">
                                <div>
                  <span className="ai-search-lab-kicker">
                    موتور داخلی بدون API خارجی
                  </span>
                                    <h2 className="ai-center-section-title">
                                        آزمایشگاه موتور پاسخ هوشمند فارسی
                                    </h2>
                                    <p className="ai-center-section-subtitle">
                                        مسیر کامل سؤال تا پاسخ را ببین: نرمال‌سازی فارسی، تشخیص نیت،
                                        بازیابی چندمنبعی، رتبه‌بندی و انتخاب پاسخ همراه با منبع.
                                    </p>
                                </div>
                                <span className="soft-chip primary">Persian Hybrid Search</span>
                            </div>

                            <div className="ai-search-pipeline" aria-label="مراحل موتور پاسخ">
                                {[
                                    ["۱", "نرمال‌سازی فارسی", "یکسان‌سازی حروف، اعداد و فاصله‌ها"],
                                    ["۲", "تشخیص نیت", "قیمت، ارسال، مرجوعی، ضمانت و ..."],
                                    ["۳", "بازیابی دانش", "دانش دستی، سؤال‌های ساخته‌شده و صفحات"],
                                    ["۴", "رتبه‌بندی", "پوشش واژه، عبارت، مترادف و اهمیت منبع"],
                                    ["۵", "پاسخ مستند", "امتیاز اطمینان و منبع قابل مشاهده"],
                                ].map(([number, title, description]) => (
                                    <article className="ai-search-pipeline-step" key={number}>
                                        <span>{number}</span>
                                        <strong>{title}</strong>
                                        <small>{description}</small>
                                    </article>
                                ))}
                            </div>

                            <form className="ai-center-form ai-search-test-form" onSubmit={handleTestQuestion}>
                                <label className="grid">
                                    <span>سؤال تست</span>
                                    <div className="ai-search-input-row">
                                        <input
                                            className="input"
                                            value={testQuestion}
                                            onChange={(event) => setTestQuestion(event.target.value)}
                                            placeholder="مثلاً شرایط مرجوعی کالا چیه؟"
                                        />
                                        <button className="btn" type="submit" disabled={testing}>
                                            {testing ? "در حال تحلیل..." : "تحلیل و پاسخ"}
                                        </button>
                                    </div>
                                </label>

                                <div className="ai-search-examples">
                                    <span>سناریوهای آماده ارائه:</span>
                                    {searchTestExamples.map((example) => (
                                        <button
                                            type="button"
                                            key={example}
                                            onClick={() => setTestQuestion(example)}
                                        >
                                            {example}
                                        </button>
                                    ))}
                                </div>
                            </form>

                            {testResult && (
                                <div className="ai-search-result-shell">
                                    <div className="ai-search-result-hero">
                                        <div className="ai-search-confidence-card">
                                            <strong>{Math.round(testResult.confidence_score)}٪</strong>
                                            <span>
                        {confidenceLabels[testResult.debug?.confidence_label || "low"] ||
                            "امتیاز اطمینان"}
                      </span>
                                            <div className="ai-search-confidence-track">
                                                <i
                                                    style={{
                                                        width: `${Math.min(100, Math.max(0, testResult.confidence_score))}%`,
                                                    }}
                                                />
                                            </div>
                                            <small>
                                                حداقل پذیرش: {testResult.min_suggestion_score}٪
                                            </small>
                                        </div>

                                        <div className="ai-search-answer-card">
                                            <div className="ai-search-answer-top">
                        <span
                            className={`soft-chip ${
                                testResult.answered ? "success" : "danger"
                            }`}
                        >
                          {testResult.answered ? "پاسخ معتبر پیدا شد" : "پاسخ قطعی پیدا نشد"}
                        </span>
                                                <span className="soft-chip">
                          {searchSourceLabels[testResult.debug?.matched_type || ""] ||
                              testResult.debug?.matched_type ||
                              "بدون منبع"}
                        </span>
                                            </div>
                                            <h3>پاسخ نهایی موتور</h3>
                                            <p>{testResult.answer}</p>
                                            {testResult.failure_reason && (
                                                <div className="ai-search-warning">
                                                    {failureReasonLabels[testResult.failure_reason] ||
                                                        testResult.failure_reason}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {testResult.debug && (
                                        <>
                                            <div className="ai-search-diagnostics">
                                                <article>
                                                    <span>نسخه موتور</span>
                                                    <strong>{testResult.debug.engine_version}</strong>
                                                </article>
                                                <article>
                                                    <span>نیت تشخیص‌داده‌شده</span>
                                                    <strong>
                                                        {intentLabels[testResult.debug.detected?.intent || ""] ||
                                                            testResult.debug.detected?.intent ||
                                                            "نامشخص"}
                                                    </strong>
                                                </article>
                                                <article>
                                                    <span>نامزدهای بررسی‌شده</span>
                                                    <strong>{testResult.debug.candidate_count}</strong>
                                                </article>
                                                <article>
                                                    <span>فاصله رتبه اول و دوم</span>
                                                    <strong>{testResult.debug.score_gap}</strong>
                                                </article>
                                                <article>
                                                    <span>زمان پردازش</span>
                                                    <strong>{testResult.debug.processing_time_ms} ms</strong>
                                                </article>
                                            </div>

                                            <div className="ai-search-explain-grid">
                                                <section className="ai-search-explain-card">
                                                    <h3>تحلیل سؤال فارسی</h3>
                                                    <dl>
                                                        <div>
                                                            <dt>متن نرمال‌شده</dt>
                                                            <dd>{testResult.debug.normalized_question || "—"}</dd>
                                                        </div>
                                                        <div>
                                                            <dt>دسته تشخیص‌داده‌شده</dt>
                                                            <dd>{testResult.debug.detected?.category || "عمومی"}</dd>
                                                        </div>
                                                    </dl>

                                                    <div className="ai-search-token-group">
                                                        <span>واژه‌های اصلی</span>
                                                        <div>
                                                            {testResult.debug.tokens.map((token) => (
                                                                <i key={token}>{token}</i>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="ai-search-token-group matched">
                                                        <span>واژه‌های مؤثر در پاسخ</span>
                                                        <div>
                                                            {testResult.debug.matched_terms.length > 0 ? (
                                                                testResult.debug.matched_terms.map((token) => (
                                                                    <i key={token}>{token}</i>
                                                                ))
                                                            ) : (
                                                                <em>تطبیق قابل اتکایی ثبت نشد</em>
                                                            )}
                                                        </div>
                                                    </div>
                                                </section>

                                                <section className="ai-search-explain-card">
                                                    <h3>چرا این پاسخ انتخاب شد؟</h3>
                                                    <ul className="ai-search-reasons">
                                                        <li>
                                                            موتور هم‌زمان سه لایه دانش را جست‌وجو کرده است:
                                                            دانش دستی، سؤال‌های استخراج‌شده و قطعه‌های محتوایی.
                                                        </li>
                                                        <li>
                                                            پوشش واژه‌های اصلی و مترادف‌های فارسی در امتیاز نهایی
                                                            محاسبه شده است.
                                                        </li>
                                                        <li>
                                                            تطابق نیت سؤال و اعتبار منبع، رتبه پاسخ را افزایش داده
                                                            است.
                                                        </li>
                                                        <li>
                                                            اختلاف امتیاز رتبه اول و دوم برای کالیبره‌کردن اطمینان
                                                            استفاده شده است.
                                                        </li>
                                                    </ul>
                                                </section>
                                            </div>
                                        </>
                                    )}

                                    {!!testResult.sources?.length && (
                                        <section className="ai-search-sources-section">
                                            <div className="ai-center-section-header">
                                                <div>
                                                    <h3 className="ai-center-section-title">منابع پاسخ</h3>
                                                    <p className="ai-center-section-subtitle">
                                                        منابع برتر به‌ترتیب امتیاز رتبه‌بندی شده‌اند.
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="ai-search-source-grid">
                                                {testResult.sources.map((source, index) => (
                                                    <article
                                                        className="ai-search-source-card"
                                                        key={`${source.type}-${source.url || index}`}
                                                    >
                                                        <div className="ai-search-source-rank">#{index + 1}</div>
                                                        <div>
                              <span>
                                {searchSourceLabels[source.type] || source.type}
                              </span>
                                                            <strong>{source.title || "منبع بدون عنوان"}</strong>
                                                            <small>
                                                                امتیاز {source.score} · {source.category || "دسته عمومی"}
                                                            </small>
                                                        </div>
                                                        {source.url && (
                                                            <a href={source.url} target="_blank" rel="noreferrer">
                                                                مشاهده صفحه منبع
                                                            </a>
                                                        )}
                                                    </article>
                                                ))}
                                            </div>
                                        </section>
                                    )}

                                    {!!testResult.debug?.best_candidates?.length && (
                                        <section className="ai-search-ranking-section">
                                            <div className="ai-center-section-header">
                                                <div>
                                                    <h3 className="ai-center-section-title">
                                                        مقایسه نامزدهای برتر
                                                    </h3>
                                                    <p className="ai-center-section-subtitle">
                                                        این جدول برای ارائه نشان می‌دهد موتور چگونه بهترین پاسخ را
                                                        از بین گزینه‌ها انتخاب می‌کند.
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="ai-search-ranking-list">
                                                {testResult.debug.best_candidates.map((candidate, index) => (
                                                    <article
                                                        className={`ai-search-ranking-card ${
                                                            index === 0 ? "winner" : ""
                                                        }`}
                                                        key={`${candidate.type}-${index}-${candidate.score}`}
                                                    >
                                                        <div className="ai-search-ranking-number">
                                                            {index + 1}
                                                        </div>
                                                        <div className="ai-search-ranking-main">
                                                            <div>
                                <span>
                                  {searchSourceLabels[candidate.type] || candidate.type}
                                </span>
                                                                <strong>
                                                                    {candidate.matched_question ||
                                                                        candidate.title ||
                                                                        "نامزد پاسخ"}
                                                                </strong>
                                                            </div>
                                                            <p>{candidate.preview || "بدون پیش‌نمایش"}</p>
                                                            <div className="ai-search-ranking-breakdown">
                                <span>
                                  تطابق سؤال: {candidate.score_breakdown?.question_match || 0}
                                </span>
                                                                <span>
                                  تطابق پاسخ: {candidate.score_breakdown?.answer_match || 0}
                                </span>
                                                                <span>
                                  تقویت نیت: {candidate.score_breakdown?.intent_boost || 0}
                                </span>
                                                                <span>
                                  تقویت منبع: {candidate.score_breakdown?.source_boost || 0}
                                </span>
                                                            </div>
                                                        </div>
                                                        <strong className="ai-search-ranking-score">
                                                            {candidate.score}
                                                        </strong>
                                                    </article>
                                                ))}
                                            </div>
                                        </section>
                                    )}
                                </div>
                            )}
                        </section>
                    )}

                    {activeTab === "knowledge" && (
                        <div className="ai-center-grid">
                            <section className="ai-center-section">
                                <div className="ai-center-section-header">
                                    <div>
                                        <h2 className="ai-center-section-title">
                                            سوالات تولیدشده از محتوای سایت
                                        </h2>
                                        <p className="ai-center-section-subtitle">
                                            سوال و پاسخ‌هایی که از محتوای خزش‌شده ساخته شده‌اند.
                                        </p>
                                    </div>

                                    <span className="soft-chip primary">
                    {generatedQuestions.length} مورد
                  </span>
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
                                                        <h3 className="ai-center-item-title">
                                                            {item.question}
                                                        </h3>
                                                        <div className="ai-center-item-meta">
                                                            دسته: {item.category || "-"} · intent:{" "}
                                                            {item.detected_intent || "-"} · نوع:{" "}
                                                            {item.source_type === "edited"
                                                                ? "ویرایش‌شده"
                                                                : item.source_type === "manual"
                                                                    ? "دستی"
                                                                    : "خودکار"}{" "}
                                                            · وضعیت: {item.status}
                                                        </div>
                                                    </div>

                                                    <div className="ai-center-question-badges">
                                                        {item.is_user_edited && (
                                                            <span className="soft-chip ai-center-preserved-chip">
                                ویرایش کاربر · محفوظ در خزش مجدد
                              </span>
                                                        )}
                                                        <span className="soft-chip primary">
                              score: {item.score}
                            </span>
                                                    </div>
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
                                                        onClick={() =>
                                                            handleOpenGeneratedQuestionEdit(item)
                                                        }
                                                    >
                                                        ویرایش
                                                    </button>

                                                    {item.status === "active" ? (
                                                        <button
                                                            className="btn secondary"
                                                            type="button"
                                                            onClick={() =>
                                                                handleGeneratedQuestionStatus(item, "ignored")
                                                            }
                                                        >
                                                            نادیده گرفتن
                                                        </button>
                                                    ) : (
                                                        <button
                                                            className="btn secondary"
                                                            type="button"
                                                            onClick={() =>
                                                                handleGeneratedQuestionStatus(item, "active")
                                                            }
                                                        >
                                                            فعال کردن
                                                        </button>
                                                    )}
                                                </div>

                                                {editingGeneratedQuestion?.id === item.id && (
                                                    <form
                                                        className="ai-center-edit-box"
                                                        onSubmit={handleSaveGeneratedQuestion}
                                                    >
                                                        <label className="grid">
                                                            <span>سوال</span>
                                                            <input
                                                                className="input"
                                                                value={editingGeneratedQuestion.question}
                                                                onChange={(event) =>
                                                                    setEditingGeneratedQuestion((prev) =>
                                                                        prev
                                                                            ? {
                                                                                ...prev,
                                                                                question: event.target.value,
                                                                            }
                                                                            : prev,
                                                                    )
                                                                }
                                                            />
                                                        </label>

                                                        <label className="grid">
                                                            <span>پاسخ</span>
                                                            <textarea
                                                                className="textarea"
                                                                value={
                                                                    editingGeneratedQuestion.answer_text || ""
                                                                }
                                                                onChange={(event) =>
                                                                    setEditingGeneratedQuestion((prev) =>
                                                                        prev
                                                                            ? {
                                                                                ...prev,
                                                                                answer_text: event.target.value,
                                                                            }
                                                                            : prev,
                                                                    )
                                                                }
                                                            />
                                                        </label>

                                                        <div className="ai-center-three-col">
                                                            <label className="grid">
                                                                <span>دسته</span>
                                                                <input
                                                                    className="input"
                                                                    value={
                                                                        editingGeneratedQuestion.category || ""
                                                                    }
                                                                    onChange={(event) =>
                                                                        setEditingGeneratedQuestion((prev) =>
                                                                            prev
                                                                                ? {
                                                                                    ...prev,
                                                                                    category: event.target.value,
                                                                                }
                                                                                : prev,
                                                                        )
                                                                    }
                                                                />
                                                            </label>

                                                            <label className="grid">
                                                                <span>Intent</span>
                                                                <input
                                                                    className="input"
                                                                    value={
                                                                        editingGeneratedQuestion.detected_intent ||
                                                                        ""
                                                                    }
                                                                    onChange={(event) =>
                                                                        setEditingGeneratedQuestion((prev) =>
                                                                            prev
                                                                                ? {
                                                                                    ...prev,
                                                                                    detected_intent: event.target.value,
                                                                                }
                                                                                : prev,
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
                                                                            prev
                                                                                ? {
                                                                                    ...prev,
                                                                                    status: event.target.value,
                                                                                }
                                                                                : prev,
                                                                        )
                                                                    }
                                                                >
                                                                    <option value="active">فعال</option>
                                                                    <option value="ignored">
                                                                        نادیده‌گرفته‌شده
                                                                    </option>
                                                                    <option value="archived">بایگانی‌شده</option>
                                                                </select>
                                                            </label>
                                                        </div>

                                                        <div className="ai-center-actions">
                                                            <button
                                                                className="btn"
                                                                type="submit"
                                                                disabled={savingGeneratedQuestion}
                                                            >
                                                                {savingGeneratedQuestion
                                                                    ? "در حال ذخیره..."
                                                                    : "ذخیره تغییرات"}
                                                            </button>

                                                            <button
                                                                className="btn secondary"
                                                                type="button"
                                                                onClick={() =>
                                                                    setEditingGeneratedQuestion(null)
                                                                }
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
                                            این بخش از جدول knowledge_sources خوانده می‌شود و به‌عنوان
                                            دانش رسمی سایت در پاسخ‌های AI استفاده می‌شود.
                                        </p>
                                    </div>

                                    <span className="soft-chip primary">
                    {knowledgeSources.length} مورد
                  </span>
                                </div>

                                <form
                                    className="ai-center-form"
                                    onSubmit={handleCreateKnowledgeSource}
                                >
                                    <div className="ai-center-two-col">
                                        <label className="grid">
                                            <span>نوع</span>
                                            <input
                                                className="input"
                                                value={newKnowledgeSource.type}
                                                onChange={(event) =>
                                                    setNewKnowledgeSource((prev) => ({
                                                        ...prev,
                                                        type: event.target.value,
                                                    }))
                                                }
                                                placeholder="faq"
                                            />
                                        </label>

                                        <label className="grid">
                                            <span>وضعیت</span>
                                            <select
                                                className="input"
                                                value={newKnowledgeSource.status}
                                                onChange={(event) =>
                                                    setNewKnowledgeSource((prev) => ({
                                                        ...prev,
                                                        status: event.target.value,
                                                    }))
                                                }
                                            >
                                                <option value="approved">تأییدشده و فعال</option>
                                                <option value="draft">پیش‌نویس</option>
                                                <option value="archived">بایگانی‌شده</option>
                                            </select>
                                        </label>
                                    </div>

                                    <label className="grid">
                                        <span>عنوان</span>
                                        <input
                                            className="input"
                                            value={newKnowledgeSource.title}
                                            onChange={(event) =>
                                                setNewKnowledgeSource((prev) => ({
                                                    ...prev,
                                                    title: event.target.value,
                                                }))
                                            }
                                            placeholder="مثلاً: شرایط ارسال فوری"
                                        />
                                    </label>

                                    <label className="grid">
                                        <span>سوال</span>
                                        <input
                                            className="input"
                                            value={newKnowledgeSource.question}
                                            onChange={(event) =>
                                                setNewKnowledgeSource((prev) => ({
                                                    ...prev,
                                                    question: event.target.value,
                                                }))
                                            }
                                            placeholder="مثلاً: آیا ارسال فوری دارید؟"
                                        />
                                    </label>

                                    <label className="grid">
                                        <span>پاسخ</span>
                                        <textarea
                                            className="textarea"
                                            value={newKnowledgeSource.answer}
                                            onChange={(event) =>
                                                setNewKnowledgeSource((prev) => ({
                                                    ...prev,
                                                    answer: event.target.value,
                                                }))
                                            }
                                            placeholder="پاسخ رسمی که AI باید استفاده کند..."
                                        />
                                    </label>

                                    <label className="grid">
                                        <span>محتوا / توضیح تکمیلی</span>
                                        <textarea
                                            className="textarea"
                                            value={newKnowledgeSource.content}
                                            onChange={(event) =>
                                                setNewKnowledgeSource((prev) => ({
                                                    ...prev,
                                                    content: event.target.value,
                                                }))
                                            }
                                            placeholder="اختیاری؛ برای توضیحات بیشتر"
                                        />
                                    </label>

                                    <label className="grid">
                                        <span>URL منبع</span>
                                        <input
                                            className="input"
                                            value={newKnowledgeSource.url}
                                            onChange={(event) =>
                                                setNewKnowledgeSource((prev) => ({
                                                    ...prev,
                                                    url: event.target.value,
                                                }))
                                            }
                                            placeholder="https://example.com/page"
                                        />
                                    </label>

                                    <div className="ai-center-actions">
                                        <button
                                            className="btn"
                                            type="submit"
                                            disabled={creatingKnowledgeSource}
                                        >
                                            {creatingKnowledgeSource
                                                ? "در حال ثبت..."
                                                : "افزودن دانش دستی"}
                                        </button>

                                        <button
                                            className="btn secondary"
                                            type="button"
                                            onClick={() =>
                                                setNewKnowledgeSource(emptyKnowledgeSourceForm)
                                            }
                                        >
                                            پاک کردن فرم
                                        </button>
                                    </div>
                                </form>

                                {knowledgeSources.length === 0 ? (
                                    <div className="empty-soft">
                                        <strong>هنوز دانش دستی ثبت نشده است</strong>
                                        <p className="muted" style={{ marginBottom: 0 }}>
                                            رکوردهای knowledge_sources بعد از ثبت، اینجا نمایش داده
                                            می‌شوند.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="ai-center-list">
                                        {knowledgeSources.map((item) => {
                                            const mainTitle =
                                                item.title ||
                                                item.question ||
                                                `Knowledge Source #${item.id}`;
                                            const mainText =
                                                item.answer ||
                                                item.content ||
                                                "متنی برای این رکورد ثبت نشده است.";

                                            return (
                                                <article key={item.id} className="ai-center-item">
                                                    <div className="ai-center-item-top">
                                                        <div>
                                                            <h3 className="ai-center-item-title">
                                                                {mainTitle}
                                                            </h3>
                                                            <div className="ai-center-item-meta">
                                                                شناسه: {item.id} · نوع: {item.type || "نامشخص"}{" "}
                                                                · وضعیت: {item.status}
                                                            </div>
                                                        </div>

                                                        <span className="soft-chip">{item.status}</span>
                                                    </div>

                                                    {item.question && (
                                                        <p
                                                            className="ai-center-item-text"
                                                            style={{ fontWeight: 800 }}
                                                        >
                                                            سوال: {item.question}
                                                        </p>
                                                    )}

                                                    <p className="ai-center-item-text">{mainText}</p>

                                                    <div className="ai-center-actions">
                                                        <button
                                                            className="btn secondary"
                                                            type="button"
                                                            onClick={() =>
                                                                handleOpenKnowledgeSourceEdit(item)
                                                            }
                                                        >
                                                            ویرایش
                                                        </button>

                                                        {item.status === "approved" ? (
                                                            <button
                                                                className="btn secondary"
                                                                type="button"
                                                                onClick={() =>
                                                                    handleKnowledgeSourceStatus(item, "draft")
                                                                }
                                                            >
                                                                تبدیل به پیش‌نویس
                                                            </button>
                                                        ) : (
                                                            <button
                                                                className="btn secondary"
                                                                type="button"
                                                                onClick={() =>
                                                                    handleKnowledgeSourceStatus(item, "approved")
                                                                }
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
                                                        <form
                                                            className="ai-center-edit-box"
                                                            onSubmit={handleSaveKnowledgeSource}
                                                        >
                                                            <div className="ai-center-two-col">
                                                                <label className="grid">
                                                                    <span>نوع</span>
                                                                    <input
                                                                        className="input"
                                                                        value={editingKnowledgeSource.type || ""}
                                                                        onChange={(event) =>
                                                                            setEditingKnowledgeSource((prev) =>
                                                                                prev
                                                                                    ? {
                                                                                        ...prev,
                                                                                        type: event.target.value,
                                                                                    }
                                                                                    : prev,
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
                                                                                prev
                                                                                    ? {
                                                                                        ...prev,
                                                                                        status: event.target.value,
                                                                                    }
                                                                                    : prev,
                                                                            )
                                                                        }
                                                                    >
                                                                        <option value="approved">
                                                                            تأییدشده و فعال
                                                                        </option>
                                                                        <option value="draft">پیش‌نویس</option>
                                                                        <option value="archived">
                                                                            بایگانی‌شده
                                                                        </option>
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
                                                                            prev
                                                                                ? { ...prev, title: event.target.value }
                                                                                : prev,
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
                                                                            prev
                                                                                ? {
                                                                                    ...prev,
                                                                                    question: event.target.value,
                                                                                }
                                                                                : prev,
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
                                                                            prev
                                                                                ? {
                                                                                    ...prev,
                                                                                    answer: event.target.value,
                                                                                }
                                                                                : prev,
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
                                                                            prev
                                                                                ? {
                                                                                    ...prev,
                                                                                    content: event.target.value,
                                                                                }
                                                                                : prev,
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
                                                                            prev
                                                                                ? { ...prev, url: event.target.value }
                                                                                : prev,
                                                                        )
                                                                    }
                                                                    placeholder="https://example.com/page"
                                                                />
                                                            </label>

                                                            <div className="ai-center-actions">
                                                                <button
                                                                    className="btn"
                                                                    type="submit"
                                                                    disabled={savingKnowledgeSource}
                                                                >
                                                                    {savingKnowledgeSource
                                                                        ? "در حال ذخیره..."
                                                                        : "ذخیره تغییرات"}
                                                                </button>

                                                                <button
                                                                    className="btn secondary"
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setEditingKnowledgeSource(null)
                                                                    }
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
                                        این سوالات برای تکمیل دانش AI مهم هستند. هر سوال را می‌توانی
                                        مستقیم به دانش اضافه کنی.
                                    </p>
                                </div>

                                <div className="ai-center-actions">
                  <span className="soft-chip primary">
                    {unansweredQuestions.length} سؤال یکتا
                  </span>
                                    <span className="soft-chip">
                    {unansweredQuestions.reduce(
                        (sum, item) => sum + item.occurrence_count,
                        0,
                    )}{" "}
                                        بار تکرار
                  </span>
                                </div>
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
                                                    <h3 className="ai-center-item-title">
                                                        {item.question}
                                                    </h3>
                                                    <div className="ai-center-item-meta">
                                                        دسته: {item.detected_category || "-"} · intent:{" "}
                                                        {item.detected_intent || "-"} · وضعیت: {item.status}
                                                    </div>
                                                    <div className="ai-center-item-meta">
                                                        علت:{" "}
                                                        {item.failure_reason
                                                            ? failureReasonLabels[item.failure_reason] ||
                                                            item.failure_reason
                                                            : "-"}
                                                    </div>
                                                    <div className="ai-center-item-meta">
                                                        اولین مشاهده: {item.first_seen_at} · آخرین مشاهده:{" "}
                                                        {item.last_seen_at}
                                                    </div>
                                                </div>

                                                <div className="ai-center-actions">
                          <span className="soft-chip danger">
                            score: {item.best_match_score}
                          </span>
                                                    <span className="soft-chip primary">
                            {item.occurrence_count} بار
                          </span>
                                                </div>
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
                                                    onClick={() =>
                                                        handleUpdateUnansweredStatus(item.id, "reviewed")
                                                    }
                                                >
                                                    بررسی شد
                                                </button>

                                                <button
                                                    className="btn secondary"
                                                    type="button"
                                                    onClick={() =>
                                                        handleUpdateUnansweredStatus(item.id, "ignored")
                                                    }
                                                >
                                                    نادیده گرفتن
                                                </button>
                                            </div>

                                            {knowledgeForm?.id === item.id && (
                                                <form
                                                    className="ai-center-edit-box"
                                                    onSubmit={handleAddUnansweredToKnowledge}
                                                >
                                                    <label className="grid">
                                                        <span>سوال قابل ذخیره در دانش</span>
                                                        <input
                                                            className="input"
                                                            value={knowledgeForm.question}
                                                            onChange={(event) =>
                                                                setKnowledgeForm((prev) =>
                                                                    prev
                                                                        ? { ...prev, question: event.target.value }
                                                                        : prev,
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
                                                                    prev
                                                                        ? { ...prev, answer: event.target.value }
                                                                        : prev,
                                                                )
                                                            }
                                                            placeholder="مثلاً: در حال حاضر خرید اقساطی فعال نیست، اما می‌توانید برای شرایط پرداخت با پشتیبانی تماس بگیرید."
                                                        />
                                                    </label>

                                                    <div className="ai-center-actions">
                                                        <button
                                                            className="btn"
                                                            type="submit"
                                                            disabled={addingKnowledge}
                                                        >
                                                            {addingKnowledge
                                                                ? "در حال افزودن..."
                                                                : "ذخیره در دانش AI"}
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
