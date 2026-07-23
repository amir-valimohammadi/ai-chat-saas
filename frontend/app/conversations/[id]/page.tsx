// مسیر فایل: ai-chat-saas/frontend/app/conversations/[id]/page.tsx
// هدف: صفحه گفتگو با طراحی مدرن‌تر، تمرکز روی چت، پنل AI و مدیریت گفتگو

"use client";

import {
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

type Attachment = {
    id: number;
    message_id: number;
    original_name: string;
    file_url: string;
    mime_type: string;
    file_size: number;
    created_at: string;
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
        user_agent: string | null;
        last_seen_at: string | null;
        is_online: boolean;
    };
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
    const [mutatingMessage, setMutatingMessage] = useState(false);
    const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(false);
    const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<number | null>(null);
    const [showJumpToBottom, setShowJumpToBottom] = useState(false);

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

            const token = localStorage.getItem("auth_token");

            const formData = new FormData();
            formData.append("conversation_id", String(conversationId));
            formData.append("reply_to_message_id", String(replyingTo?.id || 0));
            formData.append("message_type", selectedMessageType);
            formData.append(
                "content",
                reply.trim() || (selectedMessageType === "voice" ? "پیام صوتی" : "فایل ارسال شد.")
            );
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
                                        <span className={conversation.visitor.is_online ? "visitor-online" : "visitor-offline"}>
                                            {conversation.visitor.is_online
                                                ? "● آنلاین"
                                                : `آخرین فعالیت: ${conversation.visitor.last_seen_at || "نامشخص"}`}
                                        </span>
                                        <span>#{conversation.id}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="conversation-head-actions">
                                <button
                                    className="btn secondary"
                                    type="button"
                                    onClick={() => messageNotifications.toggleSound()}
                                    title="صدای پیام جدید"
                                >
                                    {messageNotifications.preferences.sound_enabled ? "🔔" : "🔕"}
                                </button>
                                <button
                                    className="btn secondary"
                                    type="button"
                                    onClick={() => messageNotifications.enableBrowserNotifications()}
                                    title="اعلان مرورگر"
                                >
                                    {messageNotifications.preferences.browser_notifications_enabled ? "اعلان فعال" : "فعال‌سازی اعلان"}
                                </button>
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

                            <div className="conversation-composer-footer">
                                <div className="conversation-composer-tools">
                                    <button
                                        className={`btn secondary ${composerMode === "internal" ? "active" : ""}`}
                                        type="button"
                                        onClick={() => {
                                            stopAgentTyping();
                                            setComposerMode((mode) => mode === "public" ? "internal" : "public");
                                            setSelectedFile(null);
                                            setSelectedMentionIds([]);
                                            setReply("");
                                            setShowEmojiPicker(false);
                                        }}
                                        disabled={isClosed || Boolean(editingMessage)}
                                    >
                                        {composerMode === "internal" ? "یادداشت داخلی فعال" : "یادداشت داخلی"}
                                    </button>

                                    <div className="composer-emoji-wrap">
                                        <button
                                            className="btn secondary"
                                            type="button"
                                            onClick={() => setShowEmojiPicker((value) => !value)}
                                            disabled={isClosed}
                                        >
                                            Emoji
                                        </button>
                                        {showEmojiPicker && (
                                            <div className="composer-emoji-picker">
                                                {quickEmojis.map((emoji) => (
                                                    <button key={emoji} type="button" onClick={() => insertComposerEmoji(emoji)}>{emoji}</button>
                                                ))}
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
                                        className="btn secondary"
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isClosed || Boolean(editingMessage) || composerMode === "internal"}
                                    >
                                        پیوست
                                    </button>

                                    <button
                                        className={`btn secondary ${recording ? "recording" : ""}`}
                                        type="button"
                                        onClick={recording ? stopVoiceRecording : startVoiceRecording}
                                        disabled={isClosed || Boolean(editingMessage) || composerMode === "internal"}
                                    >
                                        {recording ? `توقف ضبط ${recordingSeconds}s` : "پیام صوتی"}
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
                                        disabled={sendingFile || isClosed || !selectedFile || Boolean(editingMessage) || composerMode === "internal"}
                                    >
                                        {sendingFile ? "ارسال فایل..." : "ارسال فایل"}
                                    </button>

                                    <button
                                        className="btn"
                                        type="submit"
                                        disabled={sending || isClosed || reply.trim().length === 0}
                                    >
                                        {sending ? "در حال ذخیره..." : editingMessage ? "ذخیره ویرایش" : composerMode === "internal" ? "ثبت یادداشت" : "ارسال پاسخ"}
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
}: {
    message: Message;
    onReply: (message: Message) => void;
    onEdit: (message: Message) => void;
    onDelete: (message: Message) => void;
    onHistory: (message: Message) => void;
    onReact: (message: Message, emoji: string) => void;
    disabled: boolean;
}) {
    const sender = getSenderMeta(message);
    const sideClass = message.is_internal ? "from-internal" : message.sender_type === "visitor" ? "from-visitor" : "from-agent";

    return (
        <div className={`message-row-pro ${sideClass}`} id={`message-${message.id}`}>
            <ConversationAvatar name={sender.label} tone={sender.tone} small />

            <div className={`message-bubble-pro ${sender.tone} ${message.is_internal ? "internal-note" : ""} ${message.mentioned_me ? "mentioned-me" : ""} ${message.is_deleted ? "deleted" : ""}`}>
                {message.is_internal && <div className="message-internal-label">🔒 فقط برای تیم پشتیبانی{message.mentioned_me ? " · شما منشن شده‌اید" : ""}</div>}
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

                <div className="message-foot-pro">
                    <span>{sender.label}</span>
                    <span>
                        {message.created_at}
                        {message.is_edited && !message.is_deleted ? " · ویرایش‌شده" : ""}
                        {message.is_deleted ? " · حذف‌شده" : ""}
                        {message.sender_type === "agent" && !message.is_internal && !message.is_deleted
                            ? ` · ${formatDeliveryStatus(message.delivery_status)}`
                            : ""}
                    </span>
                </div>

                <div className="message-actions-pro">
                    {!message.is_deleted && (
                        <button type="button" onClick={() => onReply(message)} disabled={disabled}>پاسخ</button>
                    )}
                    {message.can_edit && (
                        <button type="button" onClick={() => onEdit(message)} disabled={disabled}>ویرایش</button>
                    )}
                    {message.can_delete && (
                        <button type="button" onClick={() => onDelete(message)} disabled={disabled}>حذف</button>
                    )}
                    {message.has_history && (
                        <button type="button" onClick={() => onHistory(message)} disabled={disabled}>تاریخچه</button>
                    )}
                </div>
            </div>
        </div>
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