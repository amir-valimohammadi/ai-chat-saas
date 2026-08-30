// مسیر فایل: ai-chat-saas/frontend/app/conversations/[id]/page.tsx
// هدف: صفحه گفتگو با طراحی مدرن‌تر، تمرکز روی چت، پنل AI و مدیریت گفتگو

"use client";

import {
    type ReactElement,
    FormEvent,
    Fragment,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest } from "@/lib/api";
import { useMessageNotifications } from "@/hooks/useMessageNotifications";
import { useApiEventStream } from "@/hooks/useApiEventStream";

type Attachment = {
    id: number;
    message_id: number;
    original_name: string;
    file_url: string;
    mime_type: string;
    file_size: number;
    created_at: string;
};

type AttachmentLibraryItem = Attachment & {
    category: "image" | "audio" | "document" | "other";
    sender_type: string;
    sender_name: string;
    message_content: string;
};

type MessageSearchResult = {
    id: number;
    conversation_id: number;
    sender_type: string;
    sender_name: string;
    message_type: string;
    content: string;
    snippet: string;
    created_at: string;
    attachment_count: number;
};

type ReplyPreview = {
    id: number;
    sender_type: "visitor" | "agent" | "ai" | "system";
    sender_name: string | null;
    content: string;
    is_deleted: boolean;
};

type MessageReaction = {
    emoji: string;
    count: number;
    mine: boolean;
};

type MentionedUser = {
    id: number;
    name: string;
};

type Message = {
    id: number;
    conversation_id: number;
    sender_type: "visitor" | "agent" | "ai" | "system";
    message_type: "text" | "file" | "voice" | "system" | "internal_note";
    is_internal: boolean;
    sender_id: number | null;
    sender_name: string | null;
    reply_to_message_id: number | null;
    reply_to: ReplyPreview | null;
    content: string;
    is_read: boolean;
    delivered_at: string | null;
    read_at: string | null;
    delivery_status: "sent" | "delivered" | "read";
    is_edited: boolean;
    edited_at: string | null;
    is_deleted: boolean;
    deleted_at: string | null;
    can_edit: boolean;
    can_delete: boolean;
    has_history: boolean;
    attachments?: Attachment[];
    reactions: MessageReaction[];
    mentioned_users: MentionedUser[];
    mentioned_me: boolean;
    created_at: string;
};

type MessageRevision = {
    id: number;
    message_id: number;
    editor_type: "visitor" | "agent" | "system";
    editor_id: number | null;
    editor_name: string | null;
    action: "edit" | "delete";
    previous_content: string | null;
    new_content: string | null;
    created_at: string;
};

type ConversationDetail = {
    id: number;
    status: string;
    priority: "low" | "normal" | "high" | "urgent";
    is_pinned: boolean;
    pinned_at: string | null;
    is_archived: boolean;
    archived_at: string | null;
    assigned_agent: {
        id: number;
        name: string;
        email: string;
    } | null;
    department: { id: number; name: string; color: string; routing_strategy: string } | null;
    queue_status: "none" | "waiting" | "assigned";
    queue_position: number | null;
    queued_at: string | null;
    assigned_at: string | null;
    assignment_method: string | null;
    queue_message: string | null;
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
        user_agent: string | null;
        last_seen_at: string | null;
        is_online: boolean;
    };
    assignment_history: {
        id: number; action: string; assignment_method: string | null; department_name: string | null;
        from_agent_name: string | null; to_agent_name: string | null; actor_name: string | null;
        note: string | null; created_at: string;
    }[];
    tags: { id: number; name: string; color: string }[];
    sla: {
        policy_id: number; policy_name: string; state: "tracking" | "warning" | "breached" | "met" | "resolved";
        first_response_due_at: string; resolution_due_at: string; first_response_at: string | null;
        warning_sent_at: string | null; first_response_breached_at: string | null;
        resolution_breached_at: string | null; last_checked_at: string | null;
    } | null;
    automation_history: {
        id: number; rule_id: number | null; rule_name: string; trigger_type: string;
        status: "success" | "failed" | "skipped"; duration_ms: number;
        error_message: string | null; created_at: string;
    }[];
    messages: Message[];
    first_unread_message_id: number | null;
    pagination: {
        limit: number;
        oldest_message_id: number | null;
        has_more: boolean;
    };
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
    active_conversation_count: number;
    max_active_conversations: number | null;
    routing_weight: number | null;
};

type DepartmentOption = { id: number; name: string; description: string | null; color: string; routing_strategy: string; queue_enabled: boolean; member_count: number; waiting_count: number };

const statusLabels: Record<string, string> = {
    new: "جدید",
    open: "باز",
    in_progress: "در حال انجام",
    waiting_customer: "در انتظار مشتری",
    follow_up: "نیاز به پیگیری",
    pending: "در انتظار",
    closed: "بسته‌شده",
};

const slaStatusLabels: Record<string, string> = {
    tracking: "در حال پایش",
    warning: "نزدیک سررسید",
    breached: "نقض‌شده",
    met: "رعایت‌شده",
    resolved: "پایان‌یافته",
};

const quickEmojis = ["😀", "😂", "😍", "🙏", "👍", "❤️", "🎉", "🔥", "✅", "🤝"];
const reactionEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const conversationStatuses = [
    { value: "new", label: "جدید" },
    { value: "open", label: "باز" },
    { value: "in_progress", label: "در حال انجام" },
    { value: "waiting_customer", label: "در انتظار مشتری" },
    { value: "follow_up", label: "نیاز به پیگیری" },
    { value: "pending", label: "در انتظار" },
    { value: "closed", label: "بسته‌شده" },
];

type ChatIconName =
    | "arrow-right"
    | "close"
    | "sound"
    | "notification"
    | "search"
    | "refresh"
    | "sparkles"
    | "message"
    | "note"
    | "smile"
    | "paperclip"
    | "microphone"
    | "send"
    | "quick"
    | "manage"
    | "files"
    | "info"
    | "lock"
    | "file"
    | "audio"
    | "external"
    | "panel"
    | "reply"
    | "edit"
    | "trash"
    | "history";

export default function ConversationShowPage() {
    const router = useRouter();
    const params = useParams();
    const conversationId = Number(params.id);
    const messageNotifications = useMessageNotifications("گفتگو • AI Chat SaaS");

    const [conversation, setConversation] = useState<ConversationDetail | null>(
        null
    );
    const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
    const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
    const [assignableAgents, setAssignableAgents] = useState<AssignableAgent[]>(
        []
    );
    const [departments, setDepartments] = useState<DepartmentOption[]>([]);
    const [loadingDepartments, setLoadingDepartments] = useState(false);
    const [transferringDepartment, setTransferringDepartment] = useState(false);

    const [reply, setReply] = useState("");
    const [composerMode, setComposerMode] = useState<"public" | "internal">("public");
    const [selectedMentionIds, setSelectedMentionIds] = useState<number[]>([]);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [editingMessage, setEditingMessage] = useState<Message | null>(null);
    const [messageHistory, setMessageHistory] = useState<MessageRevision[] | null>(null);
    const [historyMessageId, setHistoryMessageId] = useState<number | null>(null);
    const [quickReplySearch, setQuickReplySearch] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [selectedMessageType, setSelectedMessageType] = useState<"file" | "voice">("file");
    const [recording, setRecording] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [activePanel, setActivePanel] = useState<
        "quick" | "ai" | "manage" | "files" | "info"
    >("quick");
    const [isInspectorOpen, setIsInspectorOpen] = useState(false);

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
    const [mutatingMessage, setMutatingMessage] = useState(false);
    const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(false);
    const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<number | null>(null);
    const [showJumpToBottom, setShowJumpToBottom] = useState(false);
    const [showMessageSearch, setShowMessageSearch] = useState(false);
    const [messageSearchQuery, setMessageSearchQuery] = useState("");
    const [messageSearchResults, setMessageSearchResults] = useState<MessageSearchResult[]>([]);
    const [searchingMessages, setSearchingMessages] = useState(false);
    const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
    const [attachmentItems, setAttachmentItems] = useState<AttachmentLibraryItem[]>([]);
    const [attachmentSummary, setAttachmentSummary] = useState({ total_files: 0, total_bytes: 0, image_count: 0, audio_count: 0, document_count: 0, other_count: 0 });
    const [attachmentType, setAttachmentType] = useState<"" | "image" | "audio" | "document" | "other">("");
    const [attachmentSearch, setAttachmentSearch] = useState("");
    const [loadingAttachments, setLoadingAttachments] = useState(false);
    const [managementLoading, setManagementLoading] = useState(false);

    const messagesRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTypingSentAtRef = useRef(0);
    const isCurrentlyTypingRef = useRef(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingChunksRef = useRef<Blob[]>([]);
    const recordingStreamRef = useRef<MediaStream | null>(null);
    const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const latestVisitorMessageIdRef = useRef(0);
    const initialConversationLoadedRef = useRef(false);
    const shouldAutoScrollRef = useRef(true);

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

            const stage = messagesRef.current;
            const isNearBottom = !stage || stage.scrollHeight - stage.scrollTop - stage.clientHeight < 140;
            shouldAutoScrollRef.current = !silent || isNearBottom;

            const data = await apiRequest(
                `/agent/conversation-show.php?conversation_id=${conversationId}&limit=100&mark_read=${document.hidden ? "0" : "1"}`
            );
            const incoming: ConversationDetail = data.conversation;
            const incomingVisitorMessages = incoming.messages.filter(
                (message) => message.sender_type === "visitor" && !message.is_internal
            );
            const newestVisitorMessage = incomingVisitorMessages.at(-1) || null;
            const newestVisitorMessageId = newestVisitorMessage?.id || 0;

            if (
                initialConversationLoadedRef.current &&
                newestVisitorMessage &&
                newestVisitorMessageId > latestVisitorMessageIdRef.current
            ) {
                messageNotifications.notify({
                    title: `پیام جدید از ${incoming.visitor.name || "کاربر سایت"}`,
                    body: newestVisitorMessage.content || "پیام جدید دریافت شد.",
                    tag: `conversation-${incoming.id}`,
                    unreadCount: 1,
                });

                if (!isNearBottom) {
                    setShowJumpToBottom(true);
                }
            }

            latestVisitorMessageIdRef.current = Math.max(
                latestVisitorMessageIdRef.current,
                newestVisitorMessageId
            );
            initialConversationLoadedRef.current = true;

            if (!silent && incoming.first_unread_message_id) {
                setFirstUnreadMessageId(incoming.first_unread_message_id);
            }

            if (!silent) {
                setHasMoreMessages(Boolean(incoming.pagination?.has_more));
            }

            setConversation((previous) => {
                if (!previous) return incoming;

                const merged = new Map<number, Message>();
                for (const message of previous.messages) merged.set(message.id, message);
                for (const message of incoming.messages) merged.set(message.id, message);

                return {
                    ...incoming,
                    messages: Array.from(merged.values()).sort((a, b) => a.id - b.id),
                };
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت گفتگو");
        } finally {
            setLoading(false);
        }
    }

    async function loadOlderMessages() {
        if (!conversation || loadingOlderMessages || !hasMoreMessages) return;

        const oldestMessageId = conversation.messages[0]?.id;
        if (!oldestMessageId) return;

        const stage = messagesRef.current;
        const previousScrollHeight = stage?.scrollHeight || 0;
        const previousScrollTop = stage?.scrollTop || 0;
        shouldAutoScrollRef.current = false;

        try {
            setLoadingOlderMessages(true);
            const data = await apiRequest(
                `/agent/conversation-show.php?conversation_id=${conversationId}&before_id=${oldestMessageId}&limit=50`
            );
            const olderConversation: ConversationDetail = data.conversation;

            setConversation((current) => {
                if (!current) return olderConversation;
                const merged = new Map<number, Message>();
                for (const message of olderConversation.messages) merged.set(message.id, message);
                for (const message of current.messages) merged.set(message.id, message);
                return {
                    ...current,
                    messages: Array.from(merged.values()).sort((a, b) => a.id - b.id),
                };
            });
            setHasMoreMessages(Boolean(olderConversation.pagination?.has_more));

            window.setTimeout(() => {
                if (!messagesRef.current) return;
                const addedHeight = messagesRef.current.scrollHeight - previousScrollHeight;
                messagesRef.current.scrollTop = previousScrollTop + addedHeight;
            }, 0);
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت پیام‌های قدیمی");
        } finally {
            setLoadingOlderMessages(false);
        }
    }

    function scrollMessagesToBottom() {
        if (!messagesRef.current) return;
        shouldAutoScrollRef.current = true;
        messagesRef.current.scrollTo({
            top: messagesRef.current.scrollHeight,
            behavior: "smooth",
        });
        setShowJumpToBottom(false);
    }

    function handleMessagesScroll() {
        const stage = messagesRef.current;
        if (!stage) return;
        const isNearBottom = stage.scrollHeight - stage.scrollTop - stage.clientHeight < 140;
        setShowJumpToBottom(!isNearBottom);
        if (isNearBottom) {
            setFirstUnreadMessageId(null);
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

    async function loadDepartments() {
        try {
            setLoadingDepartments(true);
            const data = await apiRequest(`/agent/departments-list.php?conversation_id=${conversationId}`);
            setDepartments(data.departments || []);
        } catch {
            // مدیریت گفتگو بدون این لیست هم قابل استفاده است.
        } finally {
            setLoadingDepartments(false);
        }
    }

    async function searchMessages() {
        const query = messageSearchQuery.trim();
        if (query.length < 2) {
            setMessageSearchResults([]);
            return;
        }

        try {
            setSearchingMessages(true);
            setError("");
            const data = await apiRequest(
                `/agent/messages-search.php?conversation_id=${conversationId}&q=${encodeURIComponent(query)}&limit=60`
            );
            setMessageSearchResults(data.results || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "جست‌وجوی پیام ناموفق بود");
        } finally {
            setSearchingMessages(false);
        }
    }

    async function focusMessageById(messageId: number) {
        try {
            setError("");
            if (!conversation?.messages.some((message) => message.id === messageId)) {
                const data = await apiRequest(
                    `/agent/conversation-show.php?conversation_id=${conversationId}&around_id=${messageId}&limit=100&mark_read=0`
                );
                const context: ConversationDetail = data.conversation;
                setConversation((current) => {
                    if (!current) return context;
                    const merged = new Map<number, Message>();
                    for (const message of current.messages) merged.set(message.id, message);
                    for (const message of context.messages) merged.set(message.id, message);
                    return { ...current, messages: Array.from(merged.values()).sort((a, b) => a.id - b.id) };
                });
            }

            setHighlightedMessageId(messageId);
            window.setTimeout(() => {
                document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
            window.setTimeout(() => setHighlightedMessageId(null), 2600);
        } catch (err) {
            setError(err instanceof Error ? err.message : "بازکردن پیام ناموفق بود");
        }
    }

    async function focusSearchResult(result: MessageSearchResult) {
        await focusMessageById(result.id);
    }

    async function loadAttachments() {
        if (!conversationId) return;
        try {
            setLoadingAttachments(true);
            const params = new URLSearchParams({ conversation_id: String(conversationId), limit: "100" });
            if (attachmentType) params.set("type", attachmentType);
            if (attachmentSearch.trim()) params.set("q", attachmentSearch.trim());
            const data = await apiRequest(`/agent/conversation-attachments-list.php?${params.toString()}`);
            setAttachmentItems(data.items || []);
            setAttachmentSummary(data.summary || attachmentSummary);
        } catch (err) {
            setError(err instanceof Error ? err.message : "دریافت فایل‌های گفتگو ناموفق بود");
        } finally {
            setLoadingAttachments(false);
        }
    }

    async function updateConversationManagement(payload: Record<string, unknown>) {
        try {
            setManagementLoading(true);
            setError("");
            await apiRequest("/agent/conversation-management-update.php", {
                method: "POST",
                body: JSON.stringify({ conversation_id: conversationId, ...payload }),
            });
            await loadConversation(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "بروزرسانی مدیریت گفتگو ناموفق بود");
        } finally {
            setManagementLoading(false);
        }
    }

    useEffect(() => {
        const media = window.matchMedia("(min-width: 1181px)");

        function syncInspector(event?: MediaQueryListEvent) {
            setIsInspectorOpen(event ? event.matches : media.matches);
        }

        syncInspector();
        media.addEventListener("change", syncInspector);

        return () => media.removeEventListener("change", syncInspector);
    }, []);

    useEffect(() => {
        if (!showMessageSearch) return;
        const timer = window.setTimeout(() => {
            if (messageSearchQuery.trim().length >= 2) searchMessages();
            else setMessageSearchResults([]);
        }, 350);
        return () => window.clearTimeout(timer);
    }, [messageSearchQuery, showMessageSearch]);

    useEffect(() => {
        if (activePanel !== "files") return;
        const timer = window.setTimeout(loadAttachments, attachmentSearch ? 300 : 0);
        return () => window.clearTimeout(timer);
    }, [activePanel, attachmentType, attachmentSearch, conversationId]);

    useEffect(() => {
        if (!conversationId) {
            router.push("/conversations");
            return;
        }

        loadConversation(false);
        loadSuggestions();
        loadQuickReplies();
        loadAssignableAgents();
        loadDepartments();
    }, [conversationId]);

    useApiEventStream({
        path: conversationId
            ? `/agent/conversation-stream.php?conversation_id=${encodeURIComponent(conversationId)}`
            : null,
        fallbackIntervalMs: 3500,
        onEvent: (message) => {
            if (message.event === "conversation.updated") {
                void loadConversation(true);
            } else if (message.event === "conversation.removed") {
                setError("این گفتگو دیگر در دسترس نیست.");
            }
        },
        onFallbackTick: () => void loadConversation(true),
    });

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                messageNotifications.setUnreadTitle(0);
                loadConversation(true);
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, [conversationId]);

    useEffect(() => {
        return () => {
            if (typingStopTimerRef.current) {
                clearTimeout(typingStopTimerRef.current);
            }

            updateTypingStatus(false);
            if (mediaRecorderRef.current?.state === "recording") {
                mediaRecorderRef.current.stop();
            } else {
                cleanupRecorder();
            }
        };
    }, [updateTypingStatus]);

    useEffect(() => {
        window.setTimeout(() => {
            if (messagesRef.current && shouldAutoScrollRef.current) {
                messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
                setShowJumpToBottom(false);
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
            shouldAutoScrollRef.current = true;
            setSending(true);
            setError("");

            if (editingMessage) {
                await apiRequest("/agent/message-update.php", {
                    method: "POST",
                    body: JSON.stringify({
                        message_id: editingMessage.id,
                        content,
                        mentioned_user_ids: composerMode === "internal" ? selectedMentionIds : [],
                    }),
                });
            } else {
                await apiRequest("/agent/message-send.php", {
                    method: "POST",
                    body: JSON.stringify({
                        conversation_id: conversationId,
                        reply_to_message_id: replyingTo?.id || null,
                        message_type: composerMode === "internal" ? "internal_note" : "text",
                        mentioned_user_ids: composerMode === "internal" ? selectedMentionIds : [],
                        content,
                    }),
                });
            }

            stopAgentTyping();
            await updateTypingStatus(false);

            setReply("");
            setEditingMessage(null);
            setReplyingTo(null);
            setComposerMode("public");
            setSelectedMentionIds([]);
            setShowEmojiPicker(false);
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

        const isAudio = selectedFile.type.startsWith("audio/") || selectedMessageType === "voice";
        const maxSize = isAudio ? 10 * 1024 * 1024 : 3 * 1024 * 1024;

        if (selectedFile.size > maxSize) {
            setError(isAudio ? "حجم پیام صوتی باید کمتر از ۱۰ مگابایت باشد." : "حجم فایل باید کمتر از ۳ مگابایت باشد.");
            return;
        }

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "application/pdf",
            "audio/webm",
            "audio/ogg",
            "audio/mpeg",
            "audio/mp4",
            "audio/x-m4a",
            "audio/wav",
            "audio/x-wav",
        ];

        const normalizedFileType = selectedFile.type.split(";", 1)[0].toLowerCase();

        if (!allowedTypes.includes(normalizedFileType)) {
            setError("فرمت فایل مجاز نیست.");
            return;
        }

        try {
            setSendingFile(true);
            setError("");

            const formData = new FormData();
            formData.append("conversation_id", String(conversationId));
            formData.append("reply_to_message_id", String(replyingTo?.id || 0));
            formData.append("message_type", selectedMessageType);
            formData.append(
                "content",
                reply.trim() || (selectedMessageType === "voice" ? "پیام صوتی" : "فایل ارسال شد.")
            );
            formData.append("file", selectedFile);

            await apiRequest("/agent/attachment-send.php", {
                method: "POST",
                body: formData,
            });

            stopAgentTyping();
            await updateTypingStatus(false);

            setReply("");
            setReplyingTo(null);
            setSelectedFile(null);
            setSelectedMessageType("file");

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

    function startReplyToMessage(message: Message) {
        setEditingMessage(null);
        setComposerMode(message.is_internal ? "internal" : "public");
        setSelectedMentionIds([]);
        setReplyingTo(message);
        setReply("");
        window.setTimeout(() => document.querySelector<HTMLTextAreaElement>(".conversation-composer-input")?.focus(), 0);
    }

    function startEditMessage(message: Message) {
        setReplyingTo(null);
        setEditingMessage(message);
        setComposerMode(message.is_internal ? "internal" : "public");
        setSelectedMentionIds(message.mentioned_users?.map((item) => item.id) || []);
        setSelectedFile(null);
        setReply(message.content);
        window.setTimeout(() => document.querySelector<HTMLTextAreaElement>(".conversation-composer-input")?.focus(), 0);
    }

    function changeComposerMode(nextMode: "public" | "internal") {
        if (composerMode === nextMode || editingMessage) {
            return;
        }

        stopAgentTyping();
        setComposerMode(nextMode);
        setSelectedFile(null);
        setSelectedMentionIds([]);
        setReply("");
        setShowEmojiPicker(false);

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }

    function cancelComposerMode() {
        setReplyingTo(null);
        setEditingMessage(null);
        setComposerMode("public");
        setSelectedMentionIds([]);
        setShowEmojiPicker(false);
        setReply("");
        stopAgentTyping();
    }

    async function handleDeleteMessage(message: Message) {
        if (!message.can_delete || mutatingMessage) {
            return;
        }

        if (!window.confirm("این پیام حذف شود؟ متن قبلی فقط در تاریخچه مدیریتی باقی می‌ماند.")) {
            return;
        }

        try {
            setMutatingMessage(true);
            setError("");
            await apiRequest("/agent/message-delete.php", {
                method: "POST",
                body: JSON.stringify({ message_id: message.id }),
            });
            if (editingMessage?.id === message.id || replyingTo?.id === message.id) {
                cancelComposerMode();
            }
            await loadConversation(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "حذف پیام ناموفق بود");
        } finally {
            setMutatingMessage(false);
        }
    }

    async function handleShowMessageHistory(message: Message) {
        try {
            setHistoryMessageId(message.id);
            setMessageHistory(null);
            const data = await apiRequest(`/agent/message-history.php?message_id=${message.id}`);
            setMessageHistory(data.revisions || []);
        } catch (err) {
            setHistoryMessageId(null);
            setMessageHistory(null);
            setError(err instanceof Error ? err.message : "دریافت تاریخچه پیام ناموفق بود");
        }
    }

    function cleanupRecorder() {
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        setRecording(false);
        setRecordingSeconds(0);
    }

    async function startVoiceRecording() {
        if (recording || isClosed || editingMessage) {
            return;
        }

        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
            setError("مرورگر شما ضبط پیام صوتی را پشتیبانی نمی‌کند.");
            return;
        }

        try {
            setError("");
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
            const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

            recordingChunksRef.current = [];
            recordingStreamRef.current = stream;
            mediaRecorderRef.current = recorder;

            recorder.addEventListener("dataavailable", (event) => {
                if (event.data.size > 0) {
                    recordingChunksRef.current.push(event.data);
                }
            });

            recorder.addEventListener("stop", () => {
                const type = recorder.mimeType || "audio/webm";
                const extension = type.includes("ogg") ? "ogg" : "webm";
                const blob = new Blob(recordingChunksRef.current, { type });

                if (blob.size > 0) {
                    setSelectedFile(new File([blob], `voice-${Date.now()}.${extension}`, { type }));
                    setSelectedMessageType("voice");
                }

                cleanupRecorder();
            });

            recorder.start(500);
            setRecording(true);
            setRecordingSeconds(0);
            recordingTimerRef.current = setInterval(() => {
                setRecordingSeconds((value) => {
                    if (value >= 119 && mediaRecorderRef.current?.state === "recording") {
                        mediaRecorderRef.current.stop();
                    }
                    return value + 1;
                });
            }, 1000);
        } catch {
            cleanupRecorder();
            setError("دسترسی به میکروفن داده نشد یا ضبط صدا شروع نشد.");
        }
    }

    function stopVoiceRecording() {
        if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
        }
    }

    function insertComposerEmoji(emoji: string) {
        setReply((value) => `${value}${emoji}`);
        setShowEmojiPicker(false);
        window.setTimeout(() => document.querySelector<HTMLTextAreaElement>(".conversation-composer-input")?.focus(), 0);
    }

    function toggleMention(agent: AssignableAgent) {
        const isSelected = selectedMentionIds.includes(agent.id);
        setSelectedMentionIds((current) =>
            isSelected
                ? current.filter((id) => id !== agent.id)
                : [...current, agent.id]
        );

        if (isSelected) {
            setReply((value) => value.replaceAll(`@${agent.name}`, "").replace(/\s{2,}/g, " ").trimStart());
        } else if (!reply.includes(`@${agent.name}`)) {
            setReply((value) => `${value}${value && !value.endsWith(" ") ? " " : ""}@${agent.name} `);
        }
    }

    async function handleToggleReaction(message: Message, emoji: string) {
        try {
            const data = await apiRequest("/agent/message-reaction-toggle.php", {
                method: "POST",
                body: JSON.stringify({ message_id: message.id, emoji }),
            });

            setConversation((current) => current ? {
                ...current,
                messages: current.messages.map((item) =>
                    item.id === message.id ? { ...item, reactions: data.reactions || [] } : item
                ),
            } : current);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ثبت واکنش ناموفق بود");
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

    async function handleTransferDepartment(departmentId: string) {
        if (!departmentId || Number(departmentId) === conversation?.department?.id) return;
        try {
            setTransferringDepartment(true);
            setError("");
            await apiRequest("/agent/conversation-department-update.php", {
                method: "POST",
                body: JSON.stringify({ conversation_id: conversationId, department_id: Number(departmentId) }),
            });
            await Promise.all([loadConversation(true), loadAssignableAgents(), loadDepartments()]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "انتقال دپارتمان ناموفق بود");
        } finally {
            setTransferringDepartment(false);
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
        if (composerMode === "public") {
            notifyAgentTyping(suggestion.suggested_reply);
        } else {
            stopAgentTyping();
        }

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
        if (composerMode === "public") {
            notifyAgentTyping(item.content);
        } else {
            stopAgentTyping();
        }
    }

    function handleAppendQuickReply(item: QuickReply) {
        setReply((prev) => {
            const current = prev.trim();
            const nextValue = current ? `${current}\n\n${item.content}` : item.content;

            if (composerMode === "public") {
                notifyAgentTyping(nextValue);
            } else {
                stopAgentTyping();
            }

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
            kicker="مرکز گفتگو"
            description={
                conversation
                    ? `${conversation.site.name} · ${statusLabel}`
                    : "در حال بارگذاری گفتگو"
            }
            variant="workspace"
        >
            <div className="conversation-detail-shell">
            {error && <div className="error conversation-page-error">{error}</div>}

            {loading || !conversation ? (
                <section className="conversation-loading-card">
                    <span className="conversation-loading-spinner" aria-hidden="true" />
                    <div>
                        <strong>در حال آماده‌سازی گفتگو</strong>
                        <span>پیام‌ها و اطلاعات مشتری در حال دریافت است.</span>
                    </div>
                </section>
            ) : (
                <div className={`conversation-workspace-pro ${isInspectorOpen ? "inspector-open" : "inspector-closed"}`}>
                    <section className="conversation-chat-pro">
                        <header className="conversation-chat-head-pro">
                            <div className="conversation-head-primary-row">
                                <div className="conversation-person-block">
                                    <button
                                        className="conversation-back-btn"
                                        type="button"
                                        onClick={() => router.push("/conversations")}
                                        title="بازگشت به فهرست گفتگوها"
                                    >
                                        <ChatIcon name="arrow-right" />
                                    </button>
                                    <div className="conversation-person-avatar-wrap">
                                        <ConversationAvatar
                                            name={conversation.visitor.name || "کاربر"}
                                            tone="visitor"
                                        />
                                        <span className={conversation.visitor.is_online ? "conversation-presence-dot online" : "conversation-presence-dot"} />
                                    </div>

                                    <div className="conversation-person-copy">
                                        <div className="conversation-person-title-row">
                                            <h2>{conversation.visitor.name || "کاربر بدون نام"}</h2>
                                            <StatusChip status={conversation.status} />
                                        </div>

                                        <div className="conversation-person-meta">
                                            <span>{visitorContact}</span>
                                            <span>{conversation.site.name}</span>
                                            <span className={conversation.visitor.is_online ? "visitor-online" : "visitor-offline"}>
                                                {conversation.visitor.is_online
                                                    ? "آنلاین"
                                                    : `آخرین فعالیت: ${conversation.visitor.last_seen_at || "نامشخص"}`}
                                            </span>
                                            <span>شناسه {conversation.id}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="conversation-head-priority-actions">
                                    <button
                                        className={`conversation-tool-btn conversation-inspector-toggle ${isInspectorOpen ? "is-active" : ""}`}
                                        type="button"
                                        onClick={() => setIsInspectorOpen((value) => !value)}
                                        title="پنل اطلاعات گفتگو"
                                    >
                                        <ChatIcon name="panel" />
                                        <span>جزئیات</span>
                                    </button>

                                    <button
                                        className="conversation-tool-btn is-primary"
                                        type="button"
                                        onClick={handleGenerateAiSuggestion}
                                        disabled={generatingAi || isClosed}
                                    >
                                        <ChatIcon name="sparkles" />
                                        <span>{generatingAi ? "در حال تولید" : "پیشنهاد هوشمند"}</span>
                                    </button>

                                    {!isClosed && (
                                        <button
                                            className="conversation-tool-btn is-danger"
                                            type="button"
                                            onClick={() => handleUpdateStatus("closed")}
                                            disabled={changingStatus}
                                        >
                                            <ChatIcon name="close" />
                                            <span>{changingStatus ? "در حال بستن" : "بستن گفتگو"}</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="conversation-head-toolbar">
                                <span className="conversation-toolbar-label">ابزارهای گفتگو</span>
                                <div className="conversation-head-actions">
                                    <button
                                        className={`conversation-tool-btn ${messageNotifications.preferences.sound_enabled ? "is-active" : ""}`}
                                        type="button"
                                        onClick={() => messageNotifications.toggleSound()}
                                        title="صدای پیام جدید"
                                    >
                                        <ChatIcon name="sound" />
                                        <span>صدا</span>
                                    </button>
                                    <button
                                        className={`conversation-tool-btn ${messageNotifications.preferences.browser_notifications_enabled ? "is-active" : ""}`}
                                        type="button"
                                        onClick={() => messageNotifications.enableBrowserNotifications()}
                                        title="اعلان مرورگر"
                                    >
                                        <ChatIcon name="notification" />
                                        <span>اعلان</span>
                                    </button>
                                    <button
                                        className={`conversation-tool-btn ${showMessageSearch ? "is-active" : ""}`}
                                        type="button"
                                        onClick={() => setShowMessageSearch((value) => !value)}
                                    >
                                        <ChatIcon name="search" />
                                        <span>{showMessageSearch ? "بستن جست‌وجو" : "جست‌وجو"}</span>
                                    </button>

                                    <button
                                        className="conversation-tool-btn"
                                        type="button"
                                        onClick={() => loadConversation(true)}
                                    >
                                        <ChatIcon name="refresh" />
                                        <span>بروزرسانی</span>
                                    </button>
                                </div>
                            </div>
                        </header>

                        <div className="conversation-context-strip">
                            <InfoPill label="مسئول گفتگو" value={conversation.assigned_agent ? conversation.assigned_agent.name : "بدون مسئول"} />
                            <InfoPill label="دپارتمان" value={conversation.department?.name || "بدون دپارتمان"} />
                            <InfoPill label="اولویت" value={priorityLabel(conversation.priority)} />
                            <InfoPill label="پیام‌ها" value={conversation.messages.length} />
                        </div>

                        {showMessageSearch && (
                            <section className="conversation-message-search-pro">
                                <div className="conversation-message-search-input">
                                    <input
                                        className="input"
                                        value={messageSearchQuery}
                                        onChange={(event) => setMessageSearchQuery(event.target.value)}
                                        placeholder="جست‌وجو در تمام پیام‌ها و نام فایل‌های این گفتگو..."
                                        autoFocus
                                    />
                                    <span>{searchingMessages ? "در حال جست‌وجو..." : `${messageSearchResults.length} نتیجه`}</span>
                                </div>
                                {messageSearchResults.length > 0 && (
                                    <div className="conversation-message-search-results">
                                        {messageSearchResults.map((result) => (
                                            <button key={result.id} type="button" onClick={() => focusSearchResult(result)}>
                                                <strong>{result.sender_name}</strong>
                                                <span>{result.snippet || result.content}</span>
                                                <small>#{result.id} · {result.created_at}{result.attachment_count ? ` · ${result.attachment_count} فایل` : ""}</small>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}

                        <div className="conversation-message-stage-pro" ref={messagesRef} onScroll={handleMessagesScroll}>
                            {hasMoreMessages && (
                                <div className="conversation-load-older-wrap">
                                    <button
                                        className="btn secondary"
                                        type="button"
                                        onClick={loadOlderMessages}
                                        disabled={loadingOlderMessages}
                                    >
                                        {loadingOlderMessages ? "در حال دریافت..." : "نمایش پیام‌های قدیمی‌تر"}
                                    </button>
                                </div>
                            )}

                            {conversation.messages.length === 0 ? (
                                <div className="conversation-empty-chat">
                                    <div className="conversation-empty-chat-icon"><ChatIcon name="message" /></div>
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
                                        <Fragment key={message.id}>
                                            {message.id === firstUnreadMessageId && (
                                                <div className="conversation-new-messages-divider">
                                                    <span>پیام‌های جدید</span>
                                                </div>
                                            )}
                                            <MessageBubble
                                                message={message}
                                                onReply={startReplyToMessage}
                                                onEdit={startEditMessage}
                                                onDelete={handleDeleteMessage}
                                                onHistory={handleShowMessageHistory}
                                                onReact={handleToggleReaction}
                                                disabled={mutatingMessage}
                                                highlighted={highlightedMessageId === message.id}
                                            />
                                        </Fragment>
                                    ))}
                                </>
                            )}
                        </div>

                        {showJumpToBottom && (
                            <button
                                className="conversation-jump-bottom"
                                type="button"
                                onClick={scrollMessagesToBottom}
                            >
                                ↓ رفتن به آخرین پیام
                            </button>
                        )}

                        <form onSubmit={handleSendReply} className={`conversation-composer-pro ${composerMode === "internal" ? "internal-mode" : ""}`}>
                            <div className="conversation-composer-shell">
                                <div className="conversation-composer-heading">
                                    <div className="conversation-composer-mode-group">
                                        <div className="conversation-composer-tabs" role="tablist" aria-label="نوع پیام">
                                            <button
                                                type="button"
                                                className={composerMode === "public" ? "active" : ""}
                                                onClick={() => changeComposerMode("public")}
                                                disabled={isClosed || Boolean(editingMessage)}
                                            >
                                                <ChatIcon name="message" />
                                                <span>پاسخ به مشتری</span>
                                            </button>
                                            <button
                                                type="button"
                                                className={composerMode === "internal" ? "active internal" : ""}
                                                onClick={() => changeComposerMode("internal")}
                                                disabled={isClosed || Boolean(editingMessage)}
                                            >
                                                <ChatIcon name="lock" />
                                                <span>یادداشت داخلی</span>
                                            </button>
                                        </div>
                                        <div className={`conversation-composer-state-chip ${composerMode === "internal" ? "internal" : "public"}`}>
                                            {isClosed
                                                ? "گفتگو بسته است"
                                                : composerMode === "internal"
                                                    ? "فقط اعضای تیم این یادداشت را می‌بینند"
                                                    : "پیام برای مشتری ارسال می‌شود"}
                                        </div>
                                    </div>
                                </div>

                                {(replyingTo || editingMessage) && (
                                    <div className="composer-context-banner">
                                        <div>
                                            <strong>{editingMessage ? "ویرایش پیام" : "پاسخ به پیام"}{composerMode === "internal" ? " · یادداشت داخلی" : ""}</strong>
                                            <span>{editingMessage ? editingMessage.content : replyingTo?.content}</span>
                                        </div>
                                        <button type="button" onClick={cancelComposerMode}>انصراف</button>
                                    </div>
                                )}

                                {selectedFile && (
                                    <div className="composer-file-preview">
                                        <span>{selectedMessageType === "voice" ? "پیام صوتی آماده ارسال" : `فایل انتخاب‌شده: ${selectedFile.name}`}</span>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedFile(null);
                                                setSelectedMessageType("file");

                                                if (fileInputRef.current) {
                                                    fileInputRef.current.value = "";
                                                }
                                            }}
                                        >
                                            حذف
                                        </button>
                                    </div>
                                )}

                                <div className="conversation-composer-editor-wrap">
                                    <div className="conversation-composer-editor">
                                        <textarea
                                            className="conversation-composer-input"
                                            value={reply}
                                            onChange={(event) => {
                                                const nextValue = event.target.value;

                                                setReply(nextValue);
                                                if (composerMode === "public") {
                                                    notifyAgentTyping(nextValue);
                                                } else {
                                                    stopAgentTyping();
                                                }
                                            }}
                                            placeholder={
                                                isClosed
                                                    ? "این گفتگو بسته شده است."
                                                    : editingMessage
                                                        ? "متن ویرایش‌شده را بنویسید..."
                                                        : composerMode === "internal"
                                                            ? "یادداشت داخلی برای تیم بنویسید؛ برای منشن از @ استفاده کنید..."
                                                            : "پاسخ خود را برای کاربر بنویسید..."
                                            }
                                            disabled={isClosed}
                                        />
                                    </div>

                                    <div className="conversation-composer-bottom">
                                        <div className="conversation-composer-tools">
                                            <div className="composer-emoji-wrap">
                                                <button
                                                    className={`composer-tool-btn ${showEmojiPicker ? "active" : ""}`}
                                                    type="button"
                                                    onClick={() => setShowEmojiPicker((value) => !value)}
                                                    disabled={isClosed}
                                                >
                                                    <ChatIcon name="smile" />
                                                    <span>ایموجی</span>
                                                </button>
                                                {showEmojiPicker && (
                                                    <div className="composer-emoji-picker">
                                                        <div className="composer-emoji-picker-head">
                                                            <strong>ایموجی‌های سریع</strong>
                                                            <button type="button" onClick={() => setShowEmojiPicker(false)}>بستن</button>
                                                        </div>
                                                        <div className="composer-emoji-picker-grid">
                                                            {quickEmojis.map((emoji) => (
                                                                <button key={emoji} type="button" onClick={() => insertComposerEmoji(emoji)}>{emoji}</button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,audio/webm,audio/ogg,audio/mpeg,audio/mp4,audio/wav"
                                                onChange={(event) => {
                                                    setSelectedFile(event.target.files?.[0] || null);
                                                    setSelectedMessageType(event.target.files?.[0]?.type.startsWith("audio/") ? "voice" : "file");
                                                }}
                                                style={{ display: "none" }}
                                            />

                                            <button
                                                className="composer-tool-btn"
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={isClosed || Boolean(editingMessage) || composerMode === "internal"}
                                            >
                                                <ChatIcon name="paperclip" />
                                                <span>فایل</span>
                                            </button>

                                            <button
                                                className={`composer-tool-btn ${recording ? "recording" : ""}`}
                                                type="button"
                                                onClick={recording ? stopVoiceRecording : startVoiceRecording}
                                                disabled={isClosed || Boolean(editingMessage) || composerMode === "internal"}
                                            >
                                                <ChatIcon name="microphone" />
                                                <span>{recording ? `توقف ضبط ${recordingSeconds}s` : "صوت"}</span>
                                            </button>

                                            <button
                                                className="composer-tool-btn is-ai"
                                                type="button"
                                                onClick={handleGenerateAiSuggestion}
                                                disabled={generatingAi || isClosed}
                                            >
                                                <ChatIcon name="sparkles" />
                                                <span>{generatingAi ? "در حال تولید" : "کمک هوشمند"}</span>
                                            </button>
                                        </div>

                                        <div className="conversation-composer-submit">
                                            <span>{reply.trim().length} کاراکتر</span>

                                            <button
                                                className="btn secondary conversation-attachment-send"
                                                type="button"
                                                onClick={handleSendAttachment}
                                                disabled={sendingFile || isClosed || !selectedFile || Boolean(editingMessage) || composerMode === "internal"}
                                            >
                                                <ChatIcon name="paperclip" />
                                                <span>{sendingFile ? "در حال ارسال" : "ارسال فایل"}</span>
                                            </button>

                                            <button
                                                className="btn conversation-send-btn"
                                                type="submit"
                                                disabled={sending || isClosed || reply.trim().length === 0}
                                            >
                                                <ChatIcon name="send" />
                                                <span>{sending ? "در حال ذخیره..." : editingMessage ? "ذخیره ویرایش" : composerMode === "internal" ? "ثبت یادداشت" : "ارسال پاسخ"}</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {composerMode === "internal" && assignableAgents.length > 0 && (
                                    <div className="composer-mentions">
                                        <span>منشن همکار:</span>
                                        {assignableAgents.map((agent) => (
                                            <button
                                                key={agent.id}
                                                type="button"
                                                className={selectedMentionIds.includes(agent.id) ? "selected" : ""}
                                                onClick={() => toggleMention(agent)}
                                            >
                                                @{agent.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </form>
                    </section>

                    <aside className={`conversation-side-pro ${isInspectorOpen ? "is-open" : ""}`}>
                        <header className="conversation-inspector-head">
                            <div>
                                <strong>جزئیات گفتگو</strong>
                                <span>اطلاعات مشتری و ابزارهای پشتیبانی</span>
                            </div>
                            <button type="button" onClick={() => setIsInspectorOpen(false)} title="بستن پنل">
                                <ChatIcon name="close" />
                            </button>
                        </header>
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
                                <ChatIcon name="quick" />
                                <span>آماده</span>
                            </button>

                            <button
                                type="button"
                                className={activePanel === "ai" ? "active" : ""}
                                onClick={() => setActivePanel("ai")}
                            >
                                <ChatIcon name="sparkles" />
                                <span>هوشمند</span>
                            </button>

                            <button
                                type="button"
                                className={activePanel === "manage" ? "active" : ""}
                                onClick={() => setActivePanel("manage")}
                            >
                                <ChatIcon name="manage" />
                                <span>مدیریت</span>
                            </button>

                            <button
                                type="button"
                                className={activePanel === "files" ? "active" : ""}
                                onClick={() => setActivePanel("files")}
                            >
                                <ChatIcon name="files" />
                                <span>فایل‌ها</span>
                            </button>

                            <button
                                type="button"
                                className={activePanel === "info" ? "active" : ""}
                                onClick={() => setActivePanel("info")}
                            >
                                <ChatIcon name="info" />
                                <span>اطلاعات</span>
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

                                <div className="manage-card-pro phase5-routing-card">
                                    <label>
                                        <span>دپارتمان گفتگو</span>
                                        <select
                                            className="input"
                                            value={conversation.department ? String(conversation.department.id) : ""}
                                            onChange={(event) => handleTransferDepartment(event.target.value)}
                                            disabled={transferringDepartment || loadingDepartments || conversation.status === "closed"}
                                        >
                                            <option value="">بدون دپارتمان</option>
                                            {departments.map((department) => (
                                                <option key={department.id} value={department.id}>
                                                    {department.name} · {department.waiting_count} در صف
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <div className="phase5-routing-summary">
                                        <span>{conversation.queue_status === "waiting" ? `در صف شماره ${conversation.queue_position || "-"}` : conversation.assigned_agent ? "اختصاص داده‌شده" : "بدون مسئول"}</span>
                                        <small>{conversation.department?.routing_strategy || "manual"}</small>
                                    </div>
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
                                                    {agent.name} {agent.is_online ? "• Online" : "• Offline"} {agent.max_active_conversations ? `(${agent.active_conversation_count}/${agent.max_active_conversations})` : ""}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>

                                {conversation.assignment_history?.length > 0 && (
                                    <div className="manage-card-pro phase5-assignment-history">
                                        <strong>تاریخچه مسیریابی</strong>
                                        <div>
                                            {conversation.assignment_history.slice(0, 6).map((item) => (
                                                <article key={item.id}>
                                                    <span>{assignmentActionLabel(item.action)}</span>
                                                    <p>{item.department_name || "بدون دپارتمان"}{item.to_agent_name ? ` · ${item.to_agent_name}` : ""}</p>
                                                    <small>{item.actor_name ? `توسط ${item.actor_name} · ` : ""}{item.created_at}</small>
                                                </article>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="manage-card-pro">
                                    <label>
                                        <span>اولویت گفتگو</span>
                                        <select
                                            className="input"
                                            value={conversation.priority}
                                            onChange={(event) => updateConversationManagement({ priority: event.target.value })}
                                            disabled={managementLoading}
                                        >
                                            <option value="urgent">فوری</option>
                                            <option value="high">بالا</option>
                                            <option value="normal">عادی</option>
                                            <option value="low">کم</option>
                                        </select>
                                    </label>
                                </div>

                                <div className="conversation-management-actions-pro">
                                    <button
                                        className="btn secondary"
                                        type="button"
                                        disabled={managementLoading}
                                        onClick={() => updateConversationManagement({ is_pinned: !conversation.is_pinned })}
                                    >
                                        {conversation.is_pinned ? "برداشتن سنجاق" : "📌 سنجاق گفتگو"}
                                    </button>
                                    <button
                                        className="btn secondary"
                                        type="button"
                                        disabled={managementLoading}
                                        onClick={() => updateConversationManagement({ is_archived: !conversation.is_archived })}
                                    >
                                        {conversation.is_archived ? "بازگردانی از آرشیو" : "🗄️ انتقال به آرشیو"}
                                    </button>
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

                        {activePanel === "files" && (
                            <section className="conversation-side-section-pro conversation-files-panel-pro">
                                <SectionHead
                                    title="فایل‌های گفتگو"
                                    subtitle="تصاویر، صداها و اسناد ارسال‌شده"
                                    badge={attachmentSummary.total_files}
                                />

                                <div className="conversation-file-summary-pro">
                                    <InfoPill label="حجم کل" value={formatFileSize(attachmentSummary.total_bytes)} />
                                    <InfoPill label="تصویر" value={attachmentSummary.image_count} />
                                    <InfoPill label="صوت" value={attachmentSummary.audio_count} />
                                    <InfoPill label="سند" value={attachmentSummary.document_count} />
                                </div>

                                <input
                                    className="input"
                                    value={attachmentSearch}
                                    onChange={(event) => setAttachmentSearch(event.target.value)}
                                    placeholder="جست‌وجوی نام فایل یا متن پیام..."
                                />

                                <div className="conversation-file-filter-pro">
                                    {[
                                        ["", "همه"],
                                        ["image", "تصویر"],
                                        ["audio", "صوت"],
                                        ["document", "سند"],
                                        ["other", "سایر"],
                                    ].map(([value, label]) => (
                                        <button
                                            key={value || "all"}
                                            type="button"
                                            className={attachmentType === value ? "active" : ""}
                                            onClick={() => setAttachmentType(value as typeof attachmentType)}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                {loadingAttachments ? (
                                    <p className="muted">در حال دریافت فایل‌ها...</p>
                                ) : attachmentItems.length === 0 ? (
                                    <EmptyPanel title="فایلی پیدا نشد" text="برای این فیلتر فایل ثبت‌شده‌ای وجود ندارد." />
                                ) : (
                                    <div className="conversation-file-library-pro">
                                        {attachmentItems.map((attachment) => (
                                            <article key={attachment.id}>
                                                <AttachmentLibraryPreview attachment={attachment} />
                                                <div>
                                                    <strong>{attachment.original_name}</strong>
                                                    <span>{attachment.sender_name} · {attachment.created_at}</span>
                                                    <small>پیام #{attachment.message_id} · {formatFileSize(attachment.file_size)}</small>
                                                </div>
                                                <button type="button" onClick={() => focusMessageById(attachment.message_id)}>رفتن به پیام</button>
                                            </article>
                                        ))}
                                    </div>
                                )}
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

                                <div className="conversation-automation-insight">
                                    <div className="conversation-automation-title">
                                        <div><span>Automation</span><strong>اتوماسیون و SLA</strong></div>
                                        {conversation.sla && <b className={`sla-${conversation.sla.state}`}>{slaStatusLabels[conversation.sla.state] || conversation.sla.state}</b>}
                                    </div>

                                    {conversation.tags.length > 0 && <div className="conversation-tag-list">
                                        {conversation.tags.map((tag) => <span key={tag.id} style={{ borderColor: tag.color, color: tag.color }}><i style={{ backgroundColor: tag.color }} />{tag.name}</span>)}
                                    </div>}

                                    {conversation.sla ? <div className="conversation-sla-summary">
                                        <strong>{conversation.sla.policy_name}</strong>
                                        <div><span>پاسخ اولیه<small>{conversation.sla.first_response_at ? `ثبت‌شده در ${formatConversationDate(conversation.sla.first_response_at)}` : formatConversationDate(conversation.sla.first_response_due_at)}</small></span><span>حل گفتگو<small>{formatConversationDate(conversation.sla.resolution_due_at)}</small></span></div>
                                    </div> : <p className="conversation-automation-empty">برای این گفتگو سیاست SLA فعالی ثبت نشده است.</p>}

                                    {conversation.automation_history.length > 0 && <div className="conversation-automation-history">
                                        <strong>آخرین اجراها</strong>
                                        {conversation.automation_history.slice(0, 5).map((item) => <article key={item.id}>
                                            <i className={`status-${item.status}`} />
                                            <div><b>{item.rule_name}</b><small>{formatConversationDate(item.created_at)} · {item.duration_ms} ms</small>{item.error_message && <em>{item.error_message}</em>}</div>
                                        </article>)}
                                    </div>}
                                </div>

                                {conversation.source_page_url && (
                                    <a
                                        className="btn secondary conversation-full-btn"
                                        href={conversation.source_page_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <ChatIcon name="external" />
                                        <span>باز کردن صفحه کاربر</span>
                                    </a>
                                )}
                            </section>
                        )}
                    </aside>
                    {isInspectorOpen && (
                        <button
                            type="button"
                            className="conversation-inspector-backdrop"
                            onClick={() => setIsInspectorOpen(false)}
                            aria-label="بستن پنل اطلاعات"
                        />
                    )}
                </div>
            )}

            {historyMessageId !== null && (
                <div className="message-history-overlay" onClick={() => setHistoryMessageId(null)}>
                    <section className="message-history-modal" onClick={(event) => event.stopPropagation()}>
                        <header>
                            <div>
                                <strong>تاریخچه پیام #{historyMessageId}</strong>
                                <span>ویرایش‌ها و حذف‌های ثبت‌شده</span>
                            </div>
                            <button type="button" onClick={() => setHistoryMessageId(null)}>×</button>
                        </header>

                        <div className="message-history-list">
                            {messageHistory === null ? (
                                <p>در حال دریافت تاریخچه...</p>
                            ) : messageHistory.length === 0 ? (
                                <p>تغییری برای این پیام ثبت نشده است.</p>
                            ) : (
                                messageHistory.map((revision) => (
                                    <article key={revision.id}>
                                        <div>
                                            <strong>{revision.action === "delete" ? "حذف پیام" : "ویرایش پیام"}</strong>
                                            <span>{revision.editor_name || (revision.editor_type === "visitor" ? "کاربر" : "سیستم")} · {revision.created_at}</span>
                                        </div>
                                        {revision.previous_content && <p><b>قبل:</b> {revision.previous_content}</p>}
                                        {revision.new_content && <p><b>بعد:</b> {revision.new_content}</p>}
                                    </article>
                                ))
                            )}
                        </div>
                    </section>
                </div>
            )}
            </div>
        </AppShell>
    );
}

function MessageBubble({
    message,
    onReply,
    onEdit,
    onDelete,
    onHistory,
    onReact,
    disabled,
    highlighted,
}: {
    message: Message;
    onReply: (message: Message) => void;
    onEdit: (message: Message) => void;
    onDelete: (message: Message) => void;
    onHistory: (message: Message) => void;
    onReact: (message: Message, emoji: string) => void;
    disabled: boolean;
    highlighted: boolean;
}) {
    const sender = getSenderMeta(message);
    const sideClass = message.is_internal
        ? "from-internal"
        : message.sender_type === "visitor"
            ? "from-visitor"
            : message.sender_type === "system"
                ? "from-system"
                : "from-agent";

    return (
        <article
            className={`message-row-pro ${sideClass} ${highlighted ? "message-search-highlight-pro" : ""}`}
            id={`message-${message.id}`}
        >
            {!message.is_internal && message.sender_type !== "system" && (
                <ConversationAvatar name={sender.label} tone={sender.tone} small />
            )}

            <div className="message-stack-pro">
                {!message.is_internal && message.sender_type !== "system" && (
                    <div className="message-author-pro">
                        <strong>{sender.label}</strong>
                        <span>{message.created_at}</span>
                    </div>
                )}

                <div className={`message-bubble-pro ${sender.tone} ${message.is_internal ? "internal-note" : ""} ${message.mentioned_me ? "mentioned-me" : ""} ${message.is_deleted ? "deleted" : ""}`}>
                    {message.is_internal && (
                        <div className="message-internal-label">
                            <ChatIcon name="lock" />
                            <span>یادداشت داخلی{message.mentioned_me ? " · شما منشن شده‌اید" : ""}</span>
                            <time>{message.created_at}</time>
                        </div>
                    )}

                    {message.sender_type === "system" && !message.is_internal && (
                        <div className="message-system-label">رویداد سیستم · {message.created_at}</div>
                    )}

                    {message.reply_to && (
                        <div className="message-reply-preview-pro">
                            <strong>{message.reply_to.sender_name || "پیام قبلی"}</strong>
                            <span>{message.reply_to.content}</span>
                        </div>
                    )}

                    {message.mentioned_users?.length > 0 && (
                        <div className="message-mentions-pro">
                            {message.mentioned_users.map((user) => <span key={user.id}>@{user.name}</span>)}
                        </div>
                    )}

                    <div className="message-body-pro">{message.content}</div>

                    {!message.is_deleted && message.attachments && message.attachments.length > 0 && (
                        <div className="attachment-grid-pro">
                            {message.attachments.map((attachment) => (
                                <AttachmentPreview key={attachment.id} attachment={attachment} />
                            ))}
                        </div>
                    )}

                    <div className="message-bubble-footer-pro">
                        <div className="message-state-pro">
                            {message.is_edited && !message.is_deleted && <span>ویرایش‌شده</span>}
                            {message.is_deleted && <span>حذف‌شده</span>}
                            {message.sender_type === "agent" && !message.is_internal && !message.is_deleted && (
                                <span>{formatDeliveryStatus(message.delivery_status)}</span>
                            )}
                        </div>

                        <div className="message-actions-pro">
                            {!message.is_deleted && (
                                <button type="button" onClick={() => onReply(message)} disabled={disabled} title="پاسخ">
                                    <ChatIcon name="reply" />
                                </button>
                            )}
                            {message.can_edit && (
                                <button type="button" onClick={() => onEdit(message)} disabled={disabled} title="ویرایش">
                                    <ChatIcon name="edit" />
                                </button>
                            )}
                            {message.can_delete && (
                                <button type="button" onClick={() => onDelete(message)} disabled={disabled} title="حذف">
                                    <ChatIcon name="trash" />
                                </button>
                            )}
                            {message.has_history && (
                                <button type="button" onClick={() => onHistory(message)} disabled={disabled} title="تاریخچه">
                                    <ChatIcon name="history" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {!message.is_deleted && (
                    <div className="message-reactions-pro">
                        {message.reactions?.map((reaction) => (
                            <button
                                key={reaction.emoji}
                                type="button"
                                className={reaction.mine ? "mine" : ""}
                                onClick={() => onReact(message, reaction.emoji)}
                                disabled={disabled}
                            >
                                {reaction.emoji} <span>{reaction.count}</span>
                            </button>
                        ))}
                        <div className="message-reaction-picker-pro">
                            {reactionEmojis.map((emoji) => (
                                <button key={emoji} type="button" onClick={() => onReact(message, emoji)} disabled={disabled}>{emoji}</button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </article>
    );
}

function AttachmentLibraryPreview({ attachment }: { attachment: AttachmentLibraryItem }) {
    if (attachment.category === "image") {
        return (
            <a href={attachment.file_url} target="_blank" rel="noopener noreferrer" className="conversation-file-thumb-pro">
                <img src={attachment.file_url} alt={attachment.original_name} />
            </a>
        );
    }

    const iconName: ChatIconName = attachment.category === "audio" ? "audio" : attachment.category === "document" ? "file" : "paperclip";
    return (
        <a href={attachment.file_url} target="_blank" rel="noopener noreferrer" className="conversation-file-icon-pro" title={attachment.original_name}>
            <ChatIcon name={iconName} />
        </a>
    );
}

function AttachmentPreview({ attachment }: { attachment: Attachment }) {
    const isImage = attachment.mime_type.startsWith("image/");
    const isAudio = attachment.mime_type.startsWith("audio/");

    if (isAudio) {
        return (
            <div className="attachment-audio-pro">
                <audio controls preload="metadata" src={attachment.file_url} />
                <span>{attachment.original_name} · {formatFileSize(attachment.file_size)}</span>
            </div>
        );
    }

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
                    <span><ChatIcon name="file" /></span>
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

function ChatIcon({ name }: { name: ChatIconName }) {
    const paths: Record<ChatIconName, ReactElement> = {
        "arrow-right": <><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></>,
        close: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
        sound: <><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></>,
        notification: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>,
        search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
        refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></>,
        sparkles: <><path d="m12 3-1.4 3.6L7 8l3.6 1.4L12 13l1.4-3.6L17 8l-3.6-1.4z"/><path d="m5 14-.9 2.1L2 17l2.1.9L5 20l.9-2.1L8 17l-2.1-.9z"/><path d="m19 14-.7 1.8-1.8.7 1.8.7L19 19l.7-1.8 1.8-.7-1.8-.7z"/></>,
        message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 8h8"/><path d="M8 12h5"/></>,
        note: <><path d="M4 4h16v16H4z"/><path d="M8 8h8"/><path d="M8 12h6"/><path d="M8 16h4"/></>,
        smile: <><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/></>,
        paperclip: <path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.6 9.6a2 2 0 1 1-2.8-2.8l8.9-8.9"/>,
        microphone: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v5"/></>,
        send: <><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></>,
        quick: <><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></>,
        manage: <><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.1v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
        files: <><path d="M14 2H6a2 2 0 0 0-2 2v16h14V6z"/><path d="M14 2v4h4"/><path d="M8 13h6"/><path d="M8 17h6"/></>,
        info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></>,
        lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
        file: <><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8z"/><path d="M14 2v6h6"/></>,
        audio: <><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></>,
        external: <><path d="M14 3h7v7"/><path d="m10 14 11-11"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></>,
        panel: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/><path d="M7 9h4"/><path d="M7 13h4"/></>,
        reply: <><path d="m9 17-5-5 5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></>,
        edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></>,
        trash: <><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></>,
        history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></>,
    };

    return (
        <svg className="chat-ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {paths[name]}
        </svg>
    );
}

function getSenderMeta(message: Message): {
    label: string;
    tone: "visitor" | "agent" | "ai" | "system";
} {
    if (message.is_internal) {
        return { label: message.sender_name ? `یادداشت ${message.sender_name}` : "یادداشت داخلی", tone: "system" };
    }

    if (message.sender_type === "visitor") {
        return {
            label: "کاربر",
            tone: "visitor",
        };
    }

    if (message.sender_type === "ai") {
        return {
            label: "دستیار هوشمند",
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


function priorityLabel(priority: ConversationDetail["priority"]) {
    const labels: Record<ConversationDetail["priority"], string> = {
        low: "کم",
        normal: "عادی",
        high: "بالا",
        urgent: "فوری",
    };
    return labels[priority] || priority;
}

function assignmentActionLabel(action: string) {
    const labels: Record<string, string> = {
        queued: "ورود به صف", auto_assigned: "اختصاص خودکار", manual_assigned: "اختصاص دستی",
        unassigned: "حذف مسئول", department_transfer: "انتقال دپارتمان", queue_reassigned: "خروج از صف",
    };
    return labels[action] || action;
}

function formatDeliveryStatus(status: "sent" | "delivered" | "read") {
    if (status === "read") return "خوانده شد ✓✓";
    if (status === "delivered") return "تحویل شد ✓✓";
    return "ارسال شد ✓";
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

function formatConversationDate(value: string) {
    try {
        return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value.replace(" ", "T")));
    } catch {
        return value;
    }
}
