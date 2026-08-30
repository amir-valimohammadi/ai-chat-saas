"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import { useApiEventStream } from "@/hooks/useApiEventStream";

type SupportPageConfig = {
    page: {
        slug: string;
        public_url: string;
        title: string;
        subtitle?: string | null;
        description?: string | null;
        primary_color: string;
        contact_phone?: string | null;
        whatsapp_phone?: string | null;
        timezone: string;
        require_name: boolean;
        require_phone: boolean;
        show_business_hours: boolean;
        show_faq: boolean;
    };
    site: {
        name: string;
        site_key: string;
        brand_name: string;
        brand_color?: string | null;
        logo_url?: string | null;
        welcome_message: string;
        ai_mode: string;
    };
    status: {
        support_online: boolean;
        agent_online: boolean;
        is_within_business_hours: boolean;
        status_text: string;
        chat_available: boolean;
        ai_available: boolean;
        next_opening?: { human_text?: string } | null;
        offline: {
            offline_behavior: "accept_messages" | "ai_only" | "closed";
            offline_message?: string | null;
            ai_after_hours_enabled: boolean;
        };
    };
    business_hours: Array<{
        day_of_week: number;
        day_label: string;
        is_open: boolean;
        open_time?: string | null;
        close_time?: string | null;
    }>;
    faqs: Array<{ id: number; question: string; answer: string }>;
};

type ChatMessage = {
    id: number;
    sender_type: "visitor" | "agent" | "ai" | "system";
    content: string;
    created_at: string;
};

const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost/ai-chat-saas/backend/api";

export default function HostedSupportPage() {
    const params = useParams<{ slug: string }>();
    const slug = String(params?.slug || "");

    const [config, setConfig] = useState<SupportPageConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [fatalError, setFatalError] = useState("");
    const [formError, setFormError] = useState("");
    const [starting, setStarting] = useState(false);
    const [sending, setSending] = useState(false);
    const [started, setStarted] = useState(false);
    const [visitorId, setVisitorId] = useState(0);
    const [conversationId, setConversationId] = useState(0);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [agentTypingText, setAgentTypingText] = useState("");
    const [draft, setDraft] = useState("");
    const [openFaq, setOpenFaq] = useState<number | null>(null);
    const [prechat, setPrechat] = useState({
        name: "",
        phone: "",
        subject: "",
    });

    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const storageKey = useMemo(() => `hosted-support:${slug}`, [slug]);
    const realtimePath = useMemo(() => {
        const siteKey = config?.site.site_key;
        if (!started || !siteKey || !visitorId || !conversationId) return null;
        const query = new URLSearchParams({
            site_key: siteKey,
            visitor_id: String(visitorId),
            conversation_id: String(conversationId),
        });
        return `/widget/conversation-stream.php?${query.toString()}`;
    }, [config?.site.site_key, conversationId, started, visitorId]);

    useEffect(() => {
        if (!slug) return;
        void loadConfig();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug]);

    useEffect(() => {
        if (!started || !visitorId || !conversationId || !config) return;

        void loadMessages();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [started, visitorId, conversationId, config?.site.site_key]);

    useApiEventStream({
        path: realtimePath,
        enabled: Boolean(realtimePath),
        auth: false,
        fallbackIntervalMs: 3000,
        onFallbackTick: () => void loadMessages(),
        onEvent: (message) => {
            if (message.event === "conversation.updated") {
                void loadMessages();
                return;
            }

            if (message.event === "typing.updated") {
                const typing = message.data as { is_typing?: unknown; text?: unknown } | null;
                setAgentTypingText(
                    typing?.is_typing
                        ? String(typing.text || "پشتیبان در حال نوشتن...")
                        : "",
                );
                return;
            }

            if (message.event === "conversation.removed") {
                resetConversation();
            }
        },
    });

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    async function publicRequest(path: string, options: RequestInit = {}) {
        const headers = new Headers(options.headers);
        if (!headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
        }

        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers,
        });
        const data = await response.json().catch(() => null);

        if (!response.ok || !data || data.success === false) {
            throw new Error(data?.message || "ارتباط با سرور ممکن نیست.");
        }

        return data;
    }

    async function loadConfig() {
        try {
            setLoading(true);
            setFatalError("");
            const data = await publicRequest(
                `/public/hosted-support-show.php?slug=${encodeURIComponent(slug)}`,
                { method: "GET" },
            );
            setConfig(data as SupportPageConfig);

            const saved = window.localStorage.getItem(storageKey);
            if (saved) {
                try {
                    const session = JSON.parse(saved);
                    if (Number(session.visitor_id) > 0 && Number(session.conversation_id) > 0) {
                        setVisitorId(Number(session.visitor_id));
                        setConversationId(Number(session.conversation_id));
                        setStarted(true);
                    }
                } catch {
                    window.localStorage.removeItem(storageKey);
                }
            }
        } catch (error) {
            setFatalError(error instanceof Error ? error.message : "صفحه پشتیبانی در دسترس نیست.");
        } finally {
            setLoading(false);
        }
    }

    function getBrowserId() {
        const key = `hosted-browser:${slug}`;
        let id = window.localStorage.getItem(key);
        if (!id) {
            id = `hosted_${Date.now()}_${Math.random().toString(16).slice(2)}`;
            window.localStorage.setItem(key, id);
        }
        return id;
    }

    async function startConversation(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!config || starting) return;

        if (config.page.require_name && !prechat.name.trim()) {
            setFormError("نام خود را وارد کنید.");
            return;
        }
        if (config.page.require_phone && !prechat.phone.trim()) {
            setFormError("شماره تماس را وارد کنید.");
            return;
        }
        if (!config.status.chat_available) {
            setFormError(config.status.offline.offline_message || "پشتیبانی در حال حاضر در دسترس نیست.");
            return;
        }

        try {
            setStarting(true);
            setFormError("");

            const visitorData = await publicRequest("/widget/visitor-start.php", {
                method: "POST",
                body: JSON.stringify({
                    site_key: config.site.site_key,
                    browser_id: getBrowserId(),
                    name: prechat.name.trim(),
                    phone: prechat.phone.trim(),
                    email: "",
                }),
            });

            const newVisitorId = Number(visitorData.visitor.id);
            const conversationData = await publicRequest("/widget/conversation-start.php", {
                method: "POST",
                body: JSON.stringify({
                    site_key: config.site.site_key,
                    visitor_id: newVisitorId,
                    source_page_url: window.location.href,
                    source_page_title: config.page.title,
                }),
            });

            const newConversationId = Number(conversationData.conversation.id);
            setVisitorId(newVisitorId);
            setConversationId(newConversationId);
            setStarted(true);
            window.localStorage.setItem(
                storageKey,
                JSON.stringify({
                    visitor_id: newVisitorId,
                    conversation_id: newConversationId,
                }),
            );

            if (prechat.subject.trim()) {
                await sendRawMessage(
                    prechat.subject.trim(),
                    newVisitorId,
                    newConversationId,
                );
            }
        } catch (error) {
            setFormError(error instanceof Error ? error.message : "شروع گفتگو ممکن نیست.");
        } finally {
            setStarting(false);
        }
    }

    async function loadMessages() {
        if (!config || !visitorId || !conversationId) return;

        try {
            const data = await publicRequest(
                `/widget/messages-list.php?site_key=${encodeURIComponent(config.site.site_key)}&visitor_id=${visitorId}&conversation_id=${conversationId}&after_id=0`,
                { method: "GET" },
            );
            setMessages(Array.isArray(data.messages) ? data.messages : []);
        } catch (error) {
            const message = error instanceof Error ? error.message : "";
            if (message.includes("not found") || message.includes("پیدا")) {
                window.localStorage.removeItem(storageKey);
                setStarted(false);
                setVisitorId(0);
                setConversationId(0);
            }
        }
    }

    async function sendRawMessage(
        content: string,
        currentVisitorId = visitorId,
        currentConversationId = conversationId,
    ) {
        if (!config) return;

        const data = await publicRequest("/widget/message-send.php", {
            method: "POST",
            body: JSON.stringify({
                site_key: config.site.site_key,
                visitor_id: currentVisitorId,
                conversation_id: currentConversationId,
                content,
            }),
        });

        const messageId = Number(data.data?.id || 0);
        if (messageId > 0 && config.status.ai_available) {
            try {
                await publicRequest("/widget/ai-reply.php", {
                    method: "POST",
                    body: JSON.stringify({
                        site_key: config.site.site_key,
                        visitor_id: currentVisitorId,
                        conversation_id: currentConversationId,
                        message_id: messageId,
                    }),
                });
            } catch {
                // پاسخ AI اختیاری است و خطای آن نباید ارسال پیام را متوقف کند.
            }
        }
    }

    async function sendMessage(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const text = draft.trim();
        if (!text || sending) return;

        try {
            setSending(true);
            setFormError("");
            setDraft("");
            await sendRawMessage(text);
            await loadMessages();
        } catch (error) {
            setDraft(text);
            setFormError(error instanceof Error ? error.message : "ارسال پیام ممکن نیست.");
        } finally {
            setSending(false);
        }
    }

    function resetConversation() {
        window.localStorage.removeItem(storageKey);
        setStarted(false);
        setVisitorId(0);
        setConversationId(0);
        setMessages([]);
        setAgentTypingText("");
        setDraft("");
        setFormError("");
    }

    if (loading) {
        return (
            <main className="hosted-support-state">
                <div className="hosted-support-loader" />
                <strong>در حال آماده‌سازی مرکز پشتیبانی...</strong>
            </main>
        );
    }

    if (fatalError || !config) {
        return (
            <main className="hosted-support-state">
                <div className="hosted-support-state-card">
                    <span>!</span>
                    <h1>صفحه در دسترس نیست</h1>
                    <p>{fatalError || "این صفحه پشتیبانی فعال نیست."}</p>
                </div>
            </main>
        );
    }

    const color = config.page.primary_color || "#0f766e";
    const whatsapp = normalizePhone(config.page.whatsapp_phone || "");

    return (
        <main
            className="hosted-support-page"
            style={{ "--hosted-primary": color } as CSSProperties}
        >
            <div className="hosted-support-backdrop" aria-hidden="true" />

            <header className="hosted-support-header">
                <div className="hosted-support-brand">
                    <BrandAvatar
                        logoUrl={config.site.logo_url}
                        name={config.site.brand_name}
                    />
                    <div>
                        <strong>{config.site.brand_name}</strong>
                        <span>{config.page.subtitle || "مرکز پشتیبانی آنلاین"}</span>
                    </div>
                </div>

                <div className={`hosted-support-status ${config.status.support_online ? "online" : "offline"}`}>
                    <i />
                    <div>
                        <strong>{config.status.status_text}</strong>
                        {!config.status.support_online && config.status.next_opening?.human_text && (
                            <span>شروع پاسخ‌گویی: {config.status.next_opening.human_text}</span>
                        )}
                    </div>
                </div>
            </header>

            <section className="hosted-support-shell">
                <aside className="hosted-support-intro">
                    <div className="hosted-support-eyebrow">Support Center</div>
                    <h1>{config.page.title}</h1>
                    <p>{config.page.description || config.site.welcome_message}</p>

                    <div className="hosted-support-benefits">
                        <Benefit title="گفتگوی مستقیم" text="پیام شما در صندوق تیم پشتیبانی ثبت می‌شود." />
                        <Benefit title="پاسخ هوشمند" text="در زمان آفلاین، موتور دانش می‌تواند پاسخ اولیه ارائه کند." />
                        <Benefit title="تاریخچه محفوظ" text="با همین مرورگر می‌توانید گفتگوی قبلی را ادامه دهید." />
                    </div>

                    {(config.page.contact_phone || whatsapp) && (
                        <div className="hosted-support-contact-row">
                            {config.page.contact_phone && (
                                <a href={`tel:${config.page.contact_phone}`}>تماس تلفنی</a>
                            )}
                            {whatsapp && (
                                <a
                                    href={`https://wa.me/${whatsapp}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    واتساپ
                                </a>
                            )}
                        </div>
                    )}
                </aside>

                <section className="hosted-chat-card">
                    <div className="hosted-chat-head">
                        <div>
                            <span className="hosted-chat-kicker">گفتگو با پشتیبانی</span>
                            <strong>{config.site.brand_name}</strong>
                        </div>
                        {started && (
                            <button type="button" onClick={resetConversation}>
                                گفتگوی جدید
                            </button>
                        )}
                    </div>

                    {!started ? (
                        <form className="hosted-prechat-form" onSubmit={startConversation}>
                            <div className="hosted-welcome-bubble">
                                {config.status.support_online
                                    ? config.site.welcome_message
                                    : config.status.offline.offline_message || config.site.welcome_message}
                            </div>

                            {!config.status.chat_available && (
                                <div className="hosted-closed-notice">
                                    دریافت پیام در حال حاضر غیرفعال است.
                                </div>
                            )}

                            <label>
                                <span>نام و نام خانوادگی {config.page.require_name ? "*" : ""}</span>
                                <input
                                    value={prechat.name}
                                    onChange={(event) => setPrechat((current) => ({ ...current, name: event.target.value }))}
                                    placeholder="نام شما"
                                    required={config.page.require_name}
                                    disabled={!config.status.chat_available}
                                />
                            </label>

                            <label>
                                <span>شماره تماس {config.page.require_phone ? "*" : ""}</span>
                                <input
                                    value={prechat.phone}
                                    onChange={(event) => setPrechat((current) => ({ ...current, phone: event.target.value }))}
                                    placeholder="09120000000"
                                    inputMode="tel"
                                    required={config.page.require_phone}
                                    disabled={!config.status.chat_available}
                                />
                            </label>

                            <label>
                                <span>موضوع درخواست</span>
                                <textarea
                                    value={prechat.subject}
                                    onChange={(event) => setPrechat((current) => ({ ...current, subject: event.target.value }))}
                                    placeholder="به‌صورت کوتاه بنویسید برای چه موضوعی نیاز به راهنمایی دارید."
                                    rows={3}
                                    disabled={!config.status.chat_available}
                                />
                            </label>

                            {formError && <div className="hosted-form-error">{formError}</div>}

                            <button
                                className="hosted-primary-button"
                                type="submit"
                                disabled={starting || !config.status.chat_available}
                            >
                                {starting ? "در حال شروع گفتگو..." : "شروع گفتگو"}
                            </button>

                            <small>اطلاعات شما فقط برای پیگیری همین درخواست استفاده می‌شود.</small>
                        </form>
                    ) : (
                        <div className="hosted-conversation">
                            <div className="hosted-messages" aria-live="polite">
                                {messages.length === 0 && (
                                    <div className="hosted-empty-chat">
                                        <BrandAvatar logoUrl={config.site.logo_url} name={config.site.brand_name} small />
                                        <strong>{config.site.welcome_message}</strong>
                                        <span>پیام خود را بنویسید تا گفتگو آغاز شود.</span>
                                    </div>
                                )}

                                {messages.map((message) => (
                                    <div
                                        className={`hosted-message hosted-message--${message.sender_type}`}
                                        key={message.id}
                                    >
                                        <div>{message.content}</div>
                                        <small>{formatMessageTime(message.created_at)}</small>
                                    </div>
                                ))}
                                {agentTypingText && (
                                    <div className="hosted-agent-typing" role="status">
                                        <span>{agentTypingText}</span>
                                        <i /><i /><i />
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {formError && <div className="hosted-form-error hosted-form-error--chat">{formError}</div>}

                            <form className="hosted-message-form" onSubmit={sendMessage}>
                                <textarea
                                    value={draft}
                                    onChange={(event) => setDraft(event.target.value)}
                                    placeholder="پیام خود را بنویسید..."
                                    rows={2}
                                    maxLength={5000}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" && !event.shiftKey) {
                                            event.preventDefault();
                                            event.currentTarget.form?.requestSubmit();
                                        }
                                    }}
                                />
                                <button type="submit" disabled={sending || !draft.trim()}>
                                    {sending ? "..." : "ارسال"}
                                </button>
                            </form>
                        </div>
                    )}
                </section>
            </section>

            {(config.page.show_business_hours || (config.page.show_faq && config.faqs.length > 0)) && (
                <section className="hosted-support-details">
                    {config.page.show_business_hours && (
                        <div className="hosted-hours-card">
                            <div className="hosted-section-heading">
                                <span>زمان‌بندی</span>
                                <h2>ساعات پاسخ‌گویی</h2>
                            </div>
                            <div className="hosted-hours-list">
                                {config.business_hours.map((row) => (
                                    <div key={row.day_of_week}>
                                        <strong>{row.day_label}</strong>
                                        <span>
                                            {row.is_open && row.open_time && row.close_time
                                                ? `${row.open_time} تا ${row.close_time}`
                                                : "تعطیل"}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {config.page.show_faq && config.faqs.length > 0 && (
                        <div className="hosted-faq-card">
                            <div className="hosted-section-heading">
                                <span>پاسخ‌های سریع</span>
                                <h2>سؤالات متداول</h2>
                            </div>
                            <div className="hosted-faq-list">
                                {config.faqs.map((faq) => (
                                    <button
                                        type="button"
                                        key={faq.id}
                                        className={openFaq === faq.id ? "open" : ""}
                                        onClick={() => setOpenFaq((current) => current === faq.id ? null : faq.id)}
                                    >
                                        <span>{faq.question}</span>
                                        <b>{openFaq === faq.id ? "−" : "+"}</b>
                                        {openFaq === faq.id && <p>{faq.answer}</p>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            )}

            <footer className="hosted-support-footer">
                <span>مرکز پشتیبانی اختصاصی {config.site.brand_name}</span>
                <small>Powered by AI Chat SaaS</small>
            </footer>
        </main>
    );
}

function BrandAvatar({
    logoUrl,
    name,
    small = false,
}: {
    logoUrl?: string | null;
    name: string;
    small?: boolean;
}) {
    return (
        <span className={`hosted-brand-avatar ${small ? "small" : ""}`}>
            {logoUrl ? <img src={logoUrl} alt="" /> : name.slice(0, 1)}
        </span>
    );
}

function Benefit({ title, text }: { title: string; text: string }) {
    return (
        <div className="hosted-benefit">
            <span>✓</span>
            <div>
                <strong>{title}</strong>
                <p>{text}</p>
            </div>
        </div>
    );
}

function normalizePhone(value: string) {
    const digits = value.replace(/\D+/g, "");
    if (digits.startsWith("0")) return `98${digits.slice(1)}`;
    return digits;
}

function formatMessageTime(value: string) {
    const date = new Date(value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("fa-IR", {
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}
