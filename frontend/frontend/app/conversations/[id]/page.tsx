// مسیر فایل: ai-chat-saas/frontend/app/conversations/[id]/page.tsx
// هدف: صفحه گفتگو با طراحی مدرن‌تر، تمرکز روی چت، پنل AI و مدیریت گفتگو

"use client";

import {
    FormEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest } from "@/lib/api";

type Attachment = {
    id: number;
    message_id: number;
    original_name: string;
    file_url: string;
    mime_type: string;
    file_size: number;
    created_at: string;
};

type Message = {
    id: number;
    conversation_id: number;
    sender_type: "visitor" | "agent" | "ai" | "system";
    sender_id: number | null;
    sender_name: string | null;
    content: string;
    is_read: boolean;
    attachments?: Attachment[];
    created_at: string;
};

type ConversationDetail = {
    id: number;
    status: string;
    assigned_agent: {
        id: number;
        name: string;
        email: string;
    } | null;
    source_page_url: string | null;
    source_page_title: string | null;
    ai_summary: string | null;
    ai_category: string | null;
    last_message_at: string | null;
    created_at: string;
    closed_at: string | null;
    site: {
        id: number;
        name: string;
        domain: string;
    };
    visitor: {
        id: number;
        name: string | null;
        email: string | null;
        phone: string | null;
        browser_id: string | null;
        ip_address: string | null;
    };
    messages: Message[];
};

type AiSuggestion = {
    id: number;
    conversation_id: number;
    message_id: number;
    suggested_reply: string;
    confidence: number;
    sources: {
        id: number;
        type: string;
        title: string | null;
        question: string | null;
        score: number;
    }[];
    status: string;
    created_at: string;
};

type QuickReply = {
    id: number;
    site_id: number;
    title: string;
    content: string;
    category: string | null;
    created_at: string;
};

type AssignableAgent = {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    last_seen_at: string | null;
    availability_status: string;
    is_online: boolean;
};

const statusLabels: Record<string, string> = {
    new: "جدید",
    open: "باز",
    in_progress: "در حال انجام",
    waiting_customer: "در انتظار مشتری",
    follow_up: "نیاز به پیگیری",
    pending: "در انتظار",
    closed: "بسته‌شده",
};

const conversationStatuses = [
    { value: "new", label: "جدید" },
    { value: "open", label: "باز" },
    { value: "in_progress", label: "در حال انجام" },
    { value: "waiting_customer", label: "در انتظار مشتری" },
    { value: "follow_up", label: "نیاز به پیگیری" },
    { value: "pending", label: "در انتظار" },
    { value: "closed", label: "بسته‌شده" },
];

export default function ConversationShowPage() {
    const router = useRouter();
    const params = useParams();
    const conversationId = Number(params.id);

    const [conversation, setConversation] = useState<ConversationDetail | null>(
        null
    );
    const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
    const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
    const [assignableAgents, setAssignableAgents] = useState<AssignableAgent[]>(
        []
    );

    const [reply, setReply] = useState("");
    const [quickReplySearch, setQuickReplySearch] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [activePanel, setActivePanel] = useState<
        "quick" | "ai" | "manage" | "info"
    >("quick");

    const [error, setError] = useState("");
    const [aiError, setAiError] = useState("");
    const [quickRepliesError, setQuickRepliesError] = useState("");

    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [sendingFile, setSendingFile] = useState(false);
    const [generatingAi, setGeneratingAi] = useState(false);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [loadingQuickReplies, setLoadingQuickReplies] = useState(false);
    const [loadingAgents, setLoadingAgents] = useState(false);
    const [changingStatus, setChangingStatus] = useState(false);
    const [assigningAgent, setAssigningAgent] = useState(false);

    const messagesRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTypingSentAtRef = useRef(0);
    const isCurrentlyTypingRef = useRef(false);

    const title = conversation
        ? conversation.visitor.name || "کاربر بدون نام"
        : "جزئیات گفتگو";

    const statusLabel = conversation
        ? statusLabels[conversation.status] || conversation.status
        : "";

    const isClosed = conversation?.status === "closed";

    const visitorContact = conversation
        ? conversation.visitor.phone ||
        conversation.visitor.email ||
        "اطلاعات تماس ثبت نشده"
        : "";

    const updateTypingStatus = useCallback(
        async (isTyping: boolean) => {
            if (!conversationId) {
                return;
            }

            try {
                await apiRequest("/agent/typing-update.php", {
                    method: "POST",
                    body: JSON.stringify({
                        conversation_id: conversationId,
                        is_typing: isTyping,
                    }),
                });

                isCurrentlyTypingRef.current = isTyping;
            } catch {
                // خطای typing نباید صفحه گفتگو، تایپ یا ارسال پیام را خراب کند.
            }
        },
        [conversationId]
    );

    function stopAgentTyping() {
        if (typingStopTimerRef.current) {
            clearTimeout(typingStopTimerRef.current);
            typingStopTimerRef.current = null;
        }

        if (isCurrentlyTypingRef.current) {
            updateTypingStatus(false);
        }
    }

    function notifyAgentTyping(nextValue: string) {
        if (isClosed || !nextValue.trim()) {
            stopAgentTyping();
            return;
        }

        const now = Date.now();

        if (!isCurrentlyTypingRef.current || now - lastTypingSentAtRef.current > 2500) {
            lastTypingSentAtRef.current = now;
            updateTypingStatus(true);
        }

        if (typingStopTimerRef.current) {
            clearTimeout(typingStopTimerRef.current);
        }

        typingStopTimerRef.current = setTimeout(() => {
            updateTypingStatus(false);
        }, 3000);
    }

    async function loadConversation(silent = false) {
        try {
            setError("");

            if (!silent) {
                setLoading(true);
            }

            const data = await apiRequest(
                `/agent/conversation-show.php?conversation_id=${conversationId}`
            );

            setConversation(data.conversation);
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت گفتگو");
        } finally {
            setLoading(false);
        }
    }

    async function loadSuggestions() {
        try {
            setAiError("");
            setLoadingSuggestions(true);

            const data = await apiRequest(
                `/agent/ai-suggestions-list.php?conversation_id=${conversationId}`
            );

            const latestSuggestions = (data.suggestions || [])
                .sort((a: AiSuggestion, b: AiSuggestion) => b.id - a.id)
                .slice(0, 1);

            setSuggestions(latestSuggestions);
        } catch (err) {
            setAiError(
                err instanceof Error ? err.message : "خطا در دریافت پیشنهادهای AI"
            );
        } finally {
            setLoadingSuggestions(false);
        }
    }

    async function loadQuickReplies() {
        try {
            setQuickRepliesError("");
            setLoadingQuickReplies(true);

            const data = await apiRequest(
                `/agent/quick-replies-list.php?conversation_id=${conversationId}`
            );

            setQuickReplies(data.items || []);
        } catch (err) {
            setQuickRepliesError(
                err instanceof Error ? err.message : "خطا در دریافت پاسخ‌های آماده"
            );
        } finally {
            setLoadingQuickReplies(false);
        }
    }

    async function loadAssignableAgents() {
        try {
            setLoadingAgents(true);

            const data = await apiRequest(
                `/agent/assignable-agents-list.php?conversation_id=${conversationId}`
            );

            setAssignableAgents(data.agents || []);
        } catch {
            // اگر دریافت پشتیبان‌ها خطا داشت، صفحه گفتگو نباید خراب شود.
        } finally {
            setLoadingAgents(false);
        }
    }

    useEffect(() => {
        if (!conversationId) {
            router.push("/conversations");
            return;
        }

        loadConversation(false);
        loadSuggestions();
        loadQuickReplies();
        loadAssignableAgents();

        const timer = window.setInterval(() => {
            loadConversation(true);
        }, 3500);

        return () => window.clearInterval(timer);
    }, [conversationId]);

    useEffect(() => {
        return () => {
            if (typingStopTimerRef.current) {
                clearTimeout(typingStopTimerRef.current);
            }

            updateTypingStatus(false);
        };
    }, [updateTypingStatus]);

    useEffect(() => {
        window.setTimeout(() => {
            if (messagesRef.current) {
                messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
            }
        }, 0);
    }, [conversation?.messages?.length]);

    async function handleSendReply(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const content = reply.trim();

        if (!content || sending) {
            return;
        }

        try {
            setSending(true);
            setError("");

            await apiRequest("/agent/message-send.php", {
                method: "POST",
                body: JSON.stringify({
                    conversation_id: conversationId,
                    content,
                }),
            });

            stopAgentTyping();
            await updateTypingStatus(false);

            setReply("");
            await loadConversation(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ارسال پاسخ ناموفق بود");
        } finally {
            setSending(false);
        }
    }

    async function handleSendAttachment() {
        if (!selectedFile || !conversation) {
            return;
        }

        const maxSize = 3 * 1024 * 1024;

        if (selectedFile.size > maxSize) {
            setError("حجم فایل باید کمتر از ۳ مگابایت باشد.");
            return;
        }

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "application/pdf",
        ];

        if (!allowedTypes.includes(selectedFile.type)) {
            setError("فرمت فایل مجاز نیست.");
            return;
        }

        try {
            setSendingFile(true);
            setError("");

            const token = localStorage.getItem("auth_token");

            const formData = new FormData();
            formData.append("conversation_id", String(conversationId));
            formData.append("content", reply.trim() || "فایل ارسال شد.");
            formData.append("file", selectedFile);

            const apiBase =
                process.env.NEXT_PUBLIC_API_BASE_URL ||
                "http://localhost/ai-chat-saas/backend/api";

            const response = await fetch(`${apiBase}/agent/attachment-send.php`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "ارسال فایل ناموفق بود");
            }

            stopAgentTyping();
            await updateTypingStatus(false);

            setReply("");
            setSelectedFile(null);

            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }

            await loadConversation(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ارسال فایل ناموفق بود");
        } finally {
            setSendingFile(false);
        }
    }

    async function handleUpdateStatus(nextStatus: string) {
        try {
            setChangingStatus(true);
            setError("");

            await apiRequest("/agent/conversation-status-update.php", {
                method: "POST",
                body: JSON.stringify({
                    conversation_id: conversationId,
                    status: nextStatus,
                }),
            });

            if (nextStatus === "closed") {
                stopAgentTyping();
                await updateTypingStatus(false);
            }

            await loadConversation(true);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "تغییر وضعیت گفتگو ناموفق بود"
            );
        } finally {
            setChangingStatus(false);
        }
    }

    async function handleAssignAgent(agentId: string) {
        try {
            setAssigningAgent(true);
            setError("");

            await apiRequest("/agent/conversation-assign.php", {
                method: "POST",
                body: JSON.stringify({
                    conversation_id: conversationId,
                    agent_id: agentId ? Number(agentId) : null,
                }),
            });

            await loadConversation(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "اختصاص گفتگو ناموفق بود");
        } finally {
            setAssigningAgent(false);
        }
    }

    async function handleGenerateAiSuggestion() {
        try {
            setGeneratingAi(true);
            setAiError("");
            setActivePanel("ai");

            await apiRequest("/agent/ai-suggestion-generate.php", {
                method: "POST",
                body: JSON.stringify({
                    conversation_id: conversationId,
                }),
            });

            await loadSuggestions();
        } catch (err) {
            setAiError(
                err instanceof Error ? err.message : "تولید پیشنهاد AI ناموفق بود"
            );
        } finally {
            setGeneratingAi(false);
        }
    }

    async function handleUseSuggestion(suggestion: AiSuggestion) {
        setReply(suggestion.suggested_reply);
        notifyAgentTyping(suggestion.suggested_reply);

        try {
            await apiRequest("/agent/ai-suggestion-mark-used.php", {
                method: "POST",
                body: JSON.stringify({
                    suggestion_id: suggestion.id,
                }),
            });

            setSuggestions((prev) =>
                prev.map((item) =>
                    item.id === suggestion.id
                        ? {
                            ...item,
                            status: "used",
                        }
                        : item
                )
            );
        } catch (err) {
            console.warn("Failed to mark AI suggestion as used:", err);
        }
    }

    function handleUseQuickReply(item: QuickReply) {
        setReply(item.content);
        notifyAgentTyping(item.content);
    }

    function handleAppendQuickReply(item: QuickReply) {
        setReply((prev) => {
            const current = prev.trim();
            const nextValue = current ? `${current}\n\n${item.content}` : item.content;

            notifyAgentTyping(nextValue);

            return nextValue;
        });
    }

    const filteredQuickReplies = useMemo(() => {
        const q = quickReplySearch.trim().toLowerCase();

        if (!q) {
            return quickReplies;
        }

        return quickReplies.filter((item) =>
            [item.title, item.content, item.category]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(q)
        );
    }, [quickReplies, quickReplySearch]);

    return (
        <AppShell
            title={`گفتگو با ${title}`}
            kicker="Conversation"
            description={
                conversation
                    ? `${conversation.site.name} · ${statusLabel}`
                    : "در حال بارگذاری گفتگو"
            }
            actions={
                <div className="conversation-page-actions">
                    <button
                        className="btn secondary"
                        onClick={() => router.push("/conversations")}
                    >
                        بازگشت به Inbox
                    </button>

                    {conversation && (
                        <button
                            className="btn danger"
                            onClick={() => handleUpdateStatus("closed")}
                            disabled={isClosed || changingStatus}
                        >
                            {changingStatus ? "در حال بستن..." : "بستن گفتگو"}
                        </button>
                    )}
                </div>
            }
        >
            {error && <div className="error">{error}</div>}

            {loading || !conversation ? (
                <section className="conversation-loading-card">
                    در حال بارگذاری گفتگو...
                </section>
            ) : (
                <div className="conversation-workspace-pro">
                    <section className="conversation-chat-pro">
                        <header className="conversation-chat-head-pro">
                            <div className="conversation-person-block">
                                <ConversationAvatar
                                    name={conversation.visitor.name || "کاربر"}
                                    tone="visitor"
                                />

                                <div>
                                    <div className="conversation-person-title-row">
                                        <h2>{conversation.visitor.name || "کاربر بدون نام"}</h2>
                                        <StatusChip status={conversation.status} />
                                    </div>

                                    <div className="conversation-person-meta">
                                        <span>{visitorContact}</span>
                                        <span>{conversation.site.name}</span>
                                        <span>#{conversation.id}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="conversation-head-actions">
                                <button
                                    className="btn secondary"
                                    type="button"
                                    onClick={() => loadConversation(true)}
                                >
                                    بروزرسانی
                                </button>

                                <button
                                    className="btn secondary"
                                    type="button"
                                    onClick={handleGenerateAiSuggestion}
                                    disabled={generatingAi || isClosed}
                                >
                                    {generatingAi ? "AI..." : "پیشنهاد AI"}
                                </button>
                            </div>
                        </header>

                        <div className="conversation-context-strip">
                            <InfoPill label="پیام‌ها" value={conversation.messages.length} />
                            <InfoPill
                                label="مسئول"
                                value={
                                    conversation.assigned_agent
                                        ? conversation.assigned_agent.name
                                        : "بدون مسئول"
                                }
                            />
                            <InfoPill
                                label="آخرین پیام"
                                value={conversation.last_message_at || "ثبت نشده"}
                            />
                            <InfoPill
                                label="صفحه ورود"
                                value={conversation.source_page_title || "نامشخص"}
                            />
                        </div>

                        <div className="conversation-message-stage-pro" ref={messagesRef}>
                            {conversation.messages.length === 0 ? (
                                <div className="conversation-empty-chat">
                                    <div>💬</div>
                                    <strong>هنوز پیامی وجود ندارد</strong>
                                    <p>
                                        وقتی کاربر از ویجت پیام بدهد، مکالمه اینجا نمایش داده می‌شود.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="conversation-day-divider">
                                        <span>شروع گفتگو</span>
                                    </div>

                                    {conversation.messages.map((message) => (
                                        <MessageBubble key={message.id} message={message} />
                                    ))}
                                </>
                            )}
                        </div>

                        <form onSubmit={handleSendReply} className="conversation-composer-pro">
                            {selectedFile && (
                                <div className="composer-file-preview">
                                    <span>فایل انتخاب‌شده: {selectedFile.name}</span>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedFile(null);

                                            if (fileInputRef.current) {
                                                fileInputRef.current.value = "";
                                            }
                                        }}
                                    >
                                        حذف
                                    </button>
                                </div>
                            )}

                            <textarea
                                className="conversation-composer-input"
                                value={reply}
                                onChange={(event) => {
                                    const nextValue = event.target.value;

                                    setReply(nextValue);
                                    notifyAgentTyping(nextValue);
                                }}
                                placeholder={
                                    isClosed
                                        ? "این گفتگو بسته شده است."
                                        : "پاسخ خود را برای کاربر بنویسید..."
                                }
                                disabled={isClosed}
                            />

                            <div className="conversation-composer-footer">
                                <div className="conversation-composer-tools">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                                        onChange={(event) =>
                                            setSelectedFile(event.target.files?.[0] || null)
                                        }
                                        style={{ display: "none" }}
                                    />

                                    <button
                                        className="btn secondary"
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isClosed}
                                    >
                                        پیوست
                                    </button>

                                    <button
                                        className="btn secondary"
                                        type="button"
                                        onClick={handleGenerateAiSuggestion}
                                        disabled={generatingAi || isClosed}
                                    >
                                        {generatingAi ? "در حال تولید..." : "کمک AI"}
                                    </button>
                                </div>

                                <div className="conversation-composer-submit">
                                    <span>{reply.trim().length} کاراکتر</span>

                                    <button
                                        className="btn secondary"
                                        type="button"
                                        onClick={handleSendAttachment}
                                        disabled={sendingFile || isClosed || !selectedFile}
                                    >
                                        {sendingFile ? "ارسال فایل..." : "ارسال فایل"}
                                    </button>

                                    <button
                                        className="btn"
                                        type="submit"
                                        disabled={sending || isClosed || reply.trim().length === 0}
                                    >
                                        {sending ? "در حال ارسال..." : "ارسال پاسخ"}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </section>

                    <aside className="conversation-side-pro">
                        <section className="conversation-user-card-pro">
                            <div className="conversation-user-top">
                                <ConversationAvatar
                                    name={conversation.visitor.name || "کاربر"}
                                    tone="visitor"
                                />

                                <div>
                                    <strong>{conversation.visitor.name || "کاربر بدون نام"}</strong>
                                    <span>{visitorContact}</span>
                                </div>
                            </div>

                            <div className="conversation-user-grid">
                                <InfoPill label="وضعیت" value={statusLabel} />
                                <InfoPill
                                    label="مسئول"
                                    value={
                                        conversation.assigned_agent
                                            ? conversation.assigned_agent.name
                                            : "بدون مسئول"
                                    }
                                />
                            </div>
                        </section>

                        <div className="conversation-panel-tabs-pro">
                            <button
                                type="button"
                                className={activePanel === "quick" ? "active" : ""}
                                onClick={() => setActivePanel("quick")}
                            >
                                آماده
                            </button>

                            <button
                                type="button"
                                className={activePanel === "ai" ? "active" : ""}
                                onClick={() => setActivePanel("ai")}
                            >
                                AI
                            </button>

                            <button
                                type="button"
                                className={activePanel === "manage" ? "active" : ""}
                                onClick={() => setActivePanel("manage")}
                            >
                                مدیریت
                            </button>

                            <button
                                type="button"
                                className={activePanel === "info" ? "active" : ""}
                                onClick={() => setActivePanel("info")}
                            >
                                اطلاعات
                            </button>
                        </div>

                        {activePanel === "quick" && (
                            <section className="conversation-side-section-pro">
                                <SectionHead
                                    title="پاسخ‌های آماده"
                                    subtitle="انتخاب سریع متن‌های پرتکرار"
                                    badge={quickReplies.length}
                                />

                                {quickRepliesError && <div className="error">{quickRepliesError}</div>}

                                <input
                                    className="input"
                                    value={quickReplySearch}
                                    onChange={(event) => setQuickReplySearch(event.target.value)}
                                    placeholder="جستجو در پاسخ‌ها..."
                                />

                                {loadingQuickReplies ? (
                                    <p className="muted">در حال دریافت...</p>
                                ) : filteredQuickReplies.length === 0 ? (
                                    <EmptyPanel
                                        title="پاسخی پیدا نشد"
                                        text="از صفحه پاسخ‌های آماده، متن جدید بساز."
                                    />
                                ) : (
                                    <div className="conversation-card-list-pro">
                                        {filteredQuickReplies.map((item) => (
                                            <article key={item.id} className="quick-reply-card-pro">
                                                <div className="conversation-card-title-row">
                                                    <strong>{item.title}</strong>
                                                    {item.category && (
                                                        <span>{item.category}</span>
                                                    )}
                                                </div>

                                                <p>{item.content}</p>

                                                <div className="conversation-card-actions">
                                                    <button
                                                        className="btn"
                                                        type="button"
                                                        onClick={() => handleUseQuickReply(item)}
                                                        disabled={isClosed}
                                                    >
                                                        استفاده
                                                    </button>

                                                    <button
                                                        className="btn secondary"
                                                        type="button"
                                                        onClick={() => handleAppendQuickReply(item)}
                                                        disabled={isClosed}
                                                    >
                                                        افزودن
                                                    </button>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}

                        {activePanel === "ai" && (
                            <section className="conversation-side-section-pro">
                                <SectionHead
                                    title="AI Assistant"
                                    subtitle="پیشنهاد پاسخ بر اساس دانش داخلی"
                                    badge="Local"
                                />

                                {aiError && <div className="error">{aiError}</div>}

                                <button
                                    className="btn conversation-full-btn"
                                    type="button"
                                    onClick={handleGenerateAiSuggestion}
                                    disabled={generatingAi || isClosed}
                                >
                                    {generatingAi ? "در حال تولید پیشنهاد..." : "تولید پیشنهاد AI"}
                                </button>

                                {loadingSuggestions ? (
                                    <p className="muted">در حال دریافت پیشنهادها...</p>
                                ) : suggestions.length === 0 ? (
                                    <EmptyPanel
                                        title="پیشنهادی وجود ندارد"
                                        text="بعد از ثبت دانش AI، پیشنهاد پاسخ اینجا نمایش داده می‌شود."
                                    />
                                ) : (
                                    <div className="conversation-card-list-pro">
                                        {suggestions.map((suggestion) => (
                                            <article key={suggestion.id} className="ai-card-pro">
                                                <div className="conversation-card-title-row">
                                                    <strong>پیشنهاد پاسخ</strong>
                                                    <span>{Math.round(suggestion.confidence * 100)}٪</span>
                                                </div>

                                                <p>{suggestion.suggested_reply}</p>

                                                <div className="ai-card-meta">
                                                    <span>وضعیت: {suggestion.status}</span>
                                                    <span>منابع: {suggestion.sources?.length || 0}</span>
                                                </div>

                                                <div className="conversation-card-actions">
                                                    <button
                                                        className="btn"
                                                        type="button"
                                                        onClick={() => handleUseSuggestion(suggestion)}
                                                        disabled={isClosed}
                                                    >
                                                        استفاده در پاسخ
                                                    </button>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}

                        {activePanel === "manage" && (
                            <section className="conversation-side-section-pro">
                                <SectionHead
                                    title="مدیریت گفتگو"
                                    subtitle="وضعیت، ارجاع و کنترل مکالمه"
                                />

                                <div className="manage-card-pro">
                                    <label>
                                        <span>وضعیت گفتگو</span>
                                        <select
                                            className="input"
                                            value={conversation.status}
                                            onChange={(event) => handleUpdateStatus(event.target.value)}
                                            disabled={changingStatus}
                                        >
                                            {conversationStatuses.map((item) => (
                                                <option key={item.value} value={item.value}>
                                                    {item.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>

                                <div className="manage-card-pro">
                                    <label>
                                        <span>پشتیبان مسئول</span>
                                        <select
                                            className="input"
                                            value={
                                                conversation.assigned_agent
                                                    ? String(conversation.assigned_agent.id)
                                                    : ""
                                            }
                                            onChange={(event) => handleAssignAgent(event.target.value)}
                                            disabled={
                                                assigningAgent ||
                                                loadingAgents ||
                                                conversation.status === "closed"
                                            }
                                        >
                                            <option value="">بدون مسئول</option>

                                            {assignableAgents.map((agent) => (
                                                <option key={agent.id} value={agent.id}>
                                                    {agent.name} {agent.is_online ? "• Online" : "• Offline"}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>

                                <div className="conversation-note-pro">
                                    <strong>راهنمای پیگیری</strong>
                                    <p>
                                        برای جلوگیری از گم شدن گفتگوها، مکالمه‌های باز را به پشتیبان
                                        مشخص assign کن و وضعیت را بعد از پاسخ‌گویی بروزرسانی کن.
                                    </p>
                                </div>
                            </section>
                        )}

                        {activePanel === "info" && (
                            <section className="conversation-side-section-pro">
                                <SectionHead
                                    title="اطلاعات گفتگو"
                                    subtitle="مشخصات کاربر، سایت و مسیر ورود"
                                />

                                <div className="conversation-info-grid-pro">
                                    <InfoItem label="نام" value={conversation.visitor.name || "ثبت نشده"} />
                                    <InfoItem label="شماره تماس" value={conversation.visitor.phone || "ثبت نشده"} />
                                    <InfoItem label="ایمیل" value={conversation.visitor.email || "ثبت نشده"} />
                                    <InfoItem label="IP" value={conversation.visitor.ip_address || "ثبت نشده"} />
                                    <InfoItem label="سایت" value={conversation.site.name} />
                                    <InfoItem label="دامنه" value={conversation.site.domain} />
                                    <InfoItem
                                        label="پشتیبان مسئول"
                                        value={
                                            conversation.assigned_agent
                                                ? conversation.assigned_agent.name
                                                : "بدون مسئول"
                                        }
                                    />
                                    <InfoItem
                                        label="صفحه ورود"
                                        value={conversation.source_page_title || "ثبت نشده"}
                                    />
                                </div>

                                {conversation.source_page_url && (
                                    <a
                                        className="btn secondary conversation-full-btn"
                                        href={conversation.source_page_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        باز کردن صفحه کاربر
                                    </a>
                                )}
                            </section>
                        )}
                    </aside>
                </div>
            )}
        </AppShell>
    );
}

function MessageBubble({ message }: { message: Message }) {
    const sender = getSenderMeta(message);
    const sideClass = message.sender_type === "visitor" ? "from-visitor" : "from-agent";

    return (
        <div className={`message-row-pro ${sideClass}`}>
            <ConversationAvatar name={sender.label} tone={sender.tone} small />

            <div className={`message-bubble-pro ${sender.tone}`}>
                <div className="message-body-pro">{message.content}</div>

                {message.attachments && message.attachments.length > 0 && (
                    <div className="attachment-grid-pro">
                        {message.attachments.map((attachment) => (
                            <AttachmentPreview key={attachment.id} attachment={attachment} />
                        ))}
                    </div>
                )}

                <div className="message-foot-pro">
                    <span>{sender.label}</span>
                    <span>{message.created_at}</span>
                </div>
            </div>
        </div>
    );
}

function AttachmentPreview({ attachment }: { attachment: Attachment }) {
    const isImage = attachment.mime_type.startsWith("image/");

    return (
        <a
            href={attachment.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="attachment-card-pro"
        >
            {isImage ? (
                <img src={attachment.file_url} alt={attachment.original_name} />
            ) : (
                <div className="attachment-file-pro">
                    <span>📎</span>
                    <strong>{attachment.original_name}</strong>
                </div>
            )}

            <div className="attachment-footer-pro">
                {attachment.original_name} · {formatFileSize(attachment.file_size)}
            </div>
        </a>
    );
}

function ConversationAvatar({
                                name,
                                tone,
                                small = false,
                            }: {
    name: string;
    tone: "visitor" | "agent" | "ai" | "system";
    small?: boolean;
}) {
    return (
        <div className={`conversation-avatar-pro ${tone} ${small ? "small" : ""}`}>
            {getInitials(name)}
        </div>
    );
}

function StatusChip({ status }: { status: string }) {
    return (
        <span className={`conversation-status-chip-pro status-${status}`}>
            {statusLabels[status] || status}
        </span>
    );
}

function InfoPill({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="conversation-info-pill-pro">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function SectionHead({
                         title,
                         subtitle,
                         badge,
                     }: {
    title: string;
    subtitle: string;
    badge?: string | number;
}) {
    return (
        <div className="conversation-section-head-pro">
            <div>
                <h3>{title}</h3>
                <p>{subtitle}</p>
            </div>

            {badge !== undefined && <span>{badge}</span>}
        </div>
    );
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
    return (
        <div className="conversation-empty-panel-pro">
            <strong>{title}</strong>
            <p>{text}</p>
        </div>
    );
}

function InfoItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="info-tile-pro">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function getSenderMeta(message: Message): {
    label: string;
    tone: "visitor" | "agent" | "ai" | "system";
} {
    if (message.sender_type === "visitor") {
        return {
            label: "کاربر",
            tone: "visitor",
        };
    }

    if (message.sender_type === "ai") {
        return {
            label: "AI Assistant",
            tone: "ai",
        };
    }

    if (message.sender_type === "system") {
        return {
            label: "سیستم",
            tone: "system",
        };
    }

    return {
        label: message.sender_name || "پشتیبان",
        tone: "agent",
    };
}

function getInitials(name: string) {
    const cleanName = name.trim();

    if (!cleanName) {
        return "U";
    }

    if (/^[A-Za-z]/.test(cleanName)) {
        return cleanName.slice(0, 2).toUpperCase();
    }

    return cleanName.slice(0, 1);
}

function formatFileSize(size: number) {
    if (size < 1024) {
        return `${size} B`;
    }

    if (size < 1024 * 1024) {
        return `${Math.round(size / 1024)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}