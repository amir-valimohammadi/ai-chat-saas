// مسیر فایل: ai-chat-saas/widget/src/widget.js
// خروجی قابل انتشار: ai-chat-saas/widget/dist/widget.js
// هدف: ویجت چت مدرن، واکنش‌گرا، قابل شخصی‌سازی و مستقل از CSS سایت میزبان

(function () {
    "use strict";

    const currentScript =
        document.currentScript ||
        document.querySelector('script[data-site-key][src*="widget"]');

    const siteKey = currentScript?.getAttribute("data-site-key")?.trim();
    const apiBase = (
        currentScript?.getAttribute("data-api-base") ||
        "http://localhost/ai-chat-saas/backend/api"
    ).replace(/\/+$/, "");

    if (!siteKey) {
        console.error("AI Chat Widget: data-site-key is required.");
        return;
    }

    const STORAGE_PREFIX = `ai_chat_${siteKey}`;
    const STORAGE_KEYS = {
        browserId: `${STORAGE_PREFIX}_browser_id`,
        visitor: `${STORAGE_PREFIX}_visitor`,
        conversation: `${STORAGE_PREFIX}_conversation`,
    };

    const POLLING_INTERVAL = 2500;
    const MAX_UPLOAD_SIZE = 3 * 1024 * 1024;
    const ALLOWED_UPLOAD_TYPES = new Set([
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
    ]);

    let siteConfig = null;
    let visitor = readStorageJson(STORAGE_KEYS.visitor);
    let conversation = readStorageJson(STORAGE_KEYS.conversation);
    let lastMessageId = 0;
    let pollingTimer = null;
    let isOpen = false;
    let isSending = false;
    let hasUnreadAgentMessage = false;
    let agentTypingText = "پشتیبان در حال نوشتن...";
    let previewShowTimer = null;
    let previewHideTimer = null;

    const browserId = getOrCreateBrowserId();

    const host = document.createElement("div");
    host.id = "ai-chat-widget-root";
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });

    shadow.innerHTML = `
    <style>
      :host {
        all: initial;
      }

      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }

      .ai-chat-root {
        --ai-chat-primary: #2563eb;
        --ai-chat-primary-dark: #1d4ed8;
        --ai-chat-primary-soft: rgba(37, 99, 235, 0.1);
        --ai-chat-primary-ring: rgba(37, 99, 235, 0.2);
        --ai-chat-text: #111827;
        --ai-chat-text-soft: #475569;
        --ai-chat-muted: #64748b;
        --ai-chat-border: #e2e8f0;
        --ai-chat-surface: #ffffff;
        --ai-chat-surface-soft: #f8fafc;
        --ai-chat-page: #f3f6fa;
        --ai-chat-danger: #b91c1c;
        --ai-chat-danger-soft: #fef2f2;
        --ai-chat-warning: #b45309;
        --ai-chat-warning-soft: #fff7ed;
        --ai-chat-success: #16a34a;
        --ai-chat-shadow-window: 0 24px 70px rgba(15, 23, 42, 0.2);
        --ai-chat-shadow-launcher: 0 16px 34px rgba(15, 23, 42, 0.22);

        direction: rtl;
        color: var(--ai-chat-text);
        font-family: "Vazirmatn", "IRANSans", "Segoe UI", Tahoma, Arial, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
      }

      .ai-chat-root button,
      .ai-chat-root input,
      .ai-chat-root textarea {
        font: inherit;
      }

      .ai-chat-root button {
        -webkit-tap-highlight-color: transparent;
      }

      .ai-chat-root [hidden] {
        display: none !important;
      }

      .ai-chat-launcher-wrap {
        position: fixed;
        right: max(20px, env(safe-area-inset-right));
        bottom: max(20px, env(safe-area-inset-bottom));
        z-index: 2147483000;
        display: flex;
        align-items: center;
        gap: 10px;
        direction: ltr;
      }

      .ai-chat-preview {
        direction: rtl;
        width: min(250px, calc(100vw - 110px));
        padding: 11px 13px;
        border: 1px solid var(--ai-chat-border);
        border-radius: 14px;
        color: var(--ai-chat-text-soft);
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 14px 38px rgba(15, 23, 42, 0.14);
        font-size: 12.5px;
        line-height: 1.75;
        opacity: 0;
        visibility: hidden;
        transform: translateY(8px);
        transition: opacity 180ms ease, transform 180ms ease, visibility 180ms ease;
      }

      .ai-chat-preview.show {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }

      .ai-chat-button {
        position: relative;
        width: 60px;
        height: 60px;
        flex: 0 0 60px;
        display: grid;
        place-items: center;
        overflow: visible;
        isolation: isolate;
        padding: 0;
        border: 0;
        border-radius: 19px;
        color: #ffffff;
        background: linear-gradient(145deg, var(--ai-chat-primary), var(--ai-chat-primary-dark));
        box-shadow: var(--ai-chat-shadow-launcher);
        cursor: pointer;
        transition: transform 180ms ease, box-shadow 180ms ease;
      }

      .ai-chat-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 20px 42px rgba(15, 23, 42, 0.26);
      }

      .ai-chat-button:active {
        transform: translateY(0) scale(0.98);
      }

      .ai-chat-button:focus-visible,
      .ai-chat-icon-button:focus-visible,
      .ai-chat-reset:focus-visible,
      .ai-chat-primary:focus-visible,
      .ai-chat-send-button:focus-visible,
      .ai-chat-file-button:focus-visible {
        outline: 3px solid var(--ai-chat-primary-ring);
        outline-offset: 3px;
      }

      .ai-chat-button-pulse {
        position: absolute;
        inset: -6px;
        z-index: -1;
        border: 2px solid var(--ai-chat-primary-ring);
        border-radius: 23px;
        opacity: 0;
        pointer-events: none;
      }

      .ai-chat-button.has-unread .ai-chat-button-pulse {
        animation: aiChatPulse 1.8s ease-out infinite;
      }

      .ai-chat-launcher-icon,
      .ai-chat-launcher-close {
        grid-area: 1 / 1;
        display: grid;
        place-items: center;
        transition: opacity 180ms ease, transform 180ms ease;
      }

      .ai-chat-launcher-icon svg,
      .ai-chat-launcher-close svg {
        width: 29px;
        height: 29px;
        display: block;
      }

      .ai-chat-launcher-close {
        opacity: 0;
        transform: scale(0.72) rotate(-28deg);
      }

      .ai-chat-button.open .ai-chat-launcher-icon {
        opacity: 0;
        transform: scale(0.72) rotate(28deg);
      }

      .ai-chat-button.open .ai-chat-launcher-close {
        opacity: 1;
        transform: scale(1) rotate(0deg);
      }

      .ai-chat-unread {
        position: absolute;
        top: -4px;
        left: -4px;
        z-index: 3;
        min-width: 20px;
        height: 20px;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 0 5px;
        border: 3px solid #ffffff;
        border-radius: 999px;
        color: #ffffff;
        background: #ef4444;
        box-shadow: 0 7px 16px rgba(239, 68, 68, 0.3);
        font-size: 9px;
        font-weight: 900;
      }

      .ai-chat-unread.show {
        display: inline-flex;
      }

      .ai-chat-window {
        position: fixed;
        right: max(20px, env(safe-area-inset-right));
        bottom: calc(max(20px, env(safe-area-inset-bottom)) + 74px);
        z-index: 2147482999;
        width: 392px;
        max-width: calc(100vw - 32px);
        height: 620px;
        max-height: calc(100dvh - 118px);
        display: none;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid rgba(226, 232, 240, 0.96);
        border-radius: 24px;
        background: var(--ai-chat-surface);
        box-shadow: var(--ai-chat-shadow-window);
        transform-origin: bottom right;
      }

      .ai-chat-window.open {
        display: flex;
        animation: aiChatOpen 210ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }

      .ai-chat-header {
        position: relative;
        flex: 0 0 auto;
        padding: 15px 15px 12px;
        color: #ffffff;
        background: linear-gradient(140deg, var(--ai-chat-primary), var(--ai-chat-primary-dark));
      }

      .ai-chat-header::after {
        content: "";
        position: absolute;
        inset: auto -44px -76px auto;
        width: 150px;
        height: 150px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        pointer-events: none;
      }

      .ai-chat-header-row {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .ai-chat-brand {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .ai-chat-avatar {
        width: 42px;
        height: 42px;
        flex: 0 0 42px;
        display: grid;
        place-items: center;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.28);
        border-radius: 13px;
        color: #ffffff;
        background: rgba(255, 255, 255, 0.16);
        font-size: 13px;
        font-weight: 900;
      }

      .ai-chat-avatar img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
      }

      .ai-chat-title-wrap {
        min-width: 0;
      }

      .ai-chat-title {
        overflow: hidden;
        color: #ffffff;
        font-size: 14px;
        font-weight: 900;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .ai-chat-status {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 7px;
        margin-top: 3px;
        color: rgba(255, 255, 255, 0.86);
        font-size: 11px;
      }

      .ai-chat-status-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .ai-chat-status-dot {
        width: 7px;
        height: 7px;
        flex: 0 0 7px;
        border-radius: 999px;
        background: #4ade80;
        box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.17);
      }

      .ai-chat-status-dot.offline {
        background: #fbbf24;
        box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.17);
      }

      .ai-chat-icon-button {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 11px;
        color: #ffffff;
        background: rgba(255, 255, 255, 0.12);
        cursor: pointer;
        transition: background 160ms ease, transform 160ms ease;
      }

      .ai-chat-icon-button:hover {
        background: rgba(255, 255, 255, 0.2);
        transform: translateY(-1px);
      }

      .ai-chat-icon-button svg {
        width: 18px;
        height: 18px;
      }

      .ai-chat-header-subrow {
        position: relative;
        z-index: 1;
        display: flex;
        justify-content: flex-start;
        margin-top: 10px;
      }

      .ai-chat-reset {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 8px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 999px;
        color: rgba(255, 255, 255, 0.92);
        background: rgba(255, 255, 255, 0.1);
        font-size: 10.5px;
        font-weight: 750;
        cursor: pointer;
        transition: background 160ms ease;
      }

      .ai-chat-reset:hover {
        background: rgba(255, 255, 255, 0.17);
      }

      .ai-chat-reset svg {
        width: 14px;
        height: 14px;
      }

      .ai-chat-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 14px;
        background: var(--ai-chat-page);
        scroll-behavior: smooth;
      }

      .ai-chat-body::-webkit-scrollbar {
        width: 6px;
      }

      .ai-chat-body::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: #cbd5e1;
      }

      .ai-chat-loading-card,
      .ai-chat-error,
      .ai-chat-intro,
      .ai-chat-form-card,
      .ai-chat-offline-note {
        border: 1px solid var(--ai-chat-border);
        border-radius: 17px;
        background: var(--ai-chat-surface);
      }

      .ai-chat-loading-card {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 15px;
        color: var(--ai-chat-muted);
        font-size: 12.5px;
      }

      .ai-chat-spinner {
        width: 18px;
        height: 18px;
        flex: 0 0 18px;
        border: 2px solid #dbe4ef;
        border-top-color: var(--ai-chat-primary);
        border-radius: 999px;
        animation: aiChatSpin 700ms linear infinite;
      }

      .ai-chat-error {
        margin-bottom: 10px;
        padding: 11px 12px;
        border-color: #fecaca;
        color: var(--ai-chat-danger);
        background: var(--ai-chat-danger-soft);
        font-size: 12px;
        line-height: 1.75;
      }

      .ai-chat-intro {
        padding: 15px;
      }

      .ai-chat-intro-top {
        display: flex;
        align-items: flex-start;
        gap: 10px;
      }

      .ai-chat-intro-icon {
        width: 36px;
        height: 36px;
        flex: 0 0 36px;
        display: grid;
        place-items: center;
        border-radius: 12px;
        color: var(--ai-chat-primary);
        background: var(--ai-chat-primary-soft);
      }

      .ai-chat-intro-icon svg {
        width: 20px;
        height: 20px;
      }

      .ai-chat-welcome-title {
        margin: 0;
        color: var(--ai-chat-text);
        font-size: 14px;
        font-weight: 900;
      }

      .ai-chat-welcome-text {
        margin-top: 5px;
        color: var(--ai-chat-text-soft);
        font-size: 12.5px;
        line-height: 1.85;
      }

      .ai-chat-offline-note {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-top: 10px;
        padding: 10px 11px;
        border-color: #fed7aa;
        color: var(--ai-chat-warning);
        background: var(--ai-chat-warning-soft);
        font-size: 11.5px;
        line-height: 1.75;
      }

      .ai-chat-offline-note svg {
        width: 17px;
        height: 17px;
        flex: 0 0 17px;
        margin-top: 2px;
      }

      .ai-chat-form-card {
        margin-top: 10px;
        padding: 14px;
      }

      .ai-chat-form-title {
        margin-bottom: 11px;
        color: var(--ai-chat-text);
        font-size: 13px;
        font-weight: 900;
      }

      .ai-chat-form {
        display: grid;
        gap: 10px;
      }

      .ai-chat-field {
        display: grid;
        gap: 5px;
      }

      .ai-chat-label {
        color: var(--ai-chat-text-soft);
        font-size: 11.5px;
        font-weight: 750;
      }

      .ai-chat-label em {
        color: var(--ai-chat-muted);
        font-style: normal;
        font-weight: 500;
      }

      .ai-chat-input,
      .ai-chat-textarea {
        width: 100%;
        min-width: 0;
        border: 1px solid #d8e1ec;
        border-radius: 12px;
        outline: none;
        color: var(--ai-chat-text);
        background: #ffffff;
        font-size: 12.5px;
        transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
      }

      .ai-chat-input {
        height: 42px;
        padding: 0 11px;
      }

      .ai-chat-textarea {
        min-height: 74px;
        max-height: 124px;
        padding: 10px 11px;
        resize: none;
        line-height: 1.75;
      }

      .ai-chat-input::placeholder,
      .ai-chat-textarea::placeholder {
        color: #9aa8ba;
      }

      .ai-chat-input:focus,
      .ai-chat-textarea:focus {
        border-color: var(--ai-chat-primary);
        box-shadow: 0 0 0 3px var(--ai-chat-primary-soft);
      }

      .ai-chat-primary {
        min-height: 43px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 10px 14px;
        border: 0;
        border-radius: 12px;
        color: #ffffff;
        background: var(--ai-chat-primary);
        box-shadow: 0 10px 20px var(--ai-chat-primary-soft);
        font-size: 12.5px;
        font-weight: 900;
        cursor: pointer;
        transition: background 160ms ease, transform 160ms ease, opacity 160ms ease;
      }

      .ai-chat-primary:hover {
        background: var(--ai-chat-primary-dark);
        transform: translateY(-1px);
      }

      .ai-chat-primary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
      }

      .ai-chat-primary svg {
        width: 17px;
        height: 17px;
      }

      .ai-chat-messages {
        display: flex;
        flex-direction: column;
        gap: 9px;
      }

      .ai-chat-day-chip {
        align-self: center;
        margin: 1px 0 3px;
        padding: 4px 8px;
        border: 1px solid var(--ai-chat-border);
        border-radius: 999px;
        color: var(--ai-chat-muted);
        background: rgba(255, 255, 255, 0.9);
        font-size: 10px;
        font-weight: 750;
      }

      .ai-chat-message-row {
        width: 100%;
        display: flex;
        align-items: flex-end;
        gap: 7px;
        direction: ltr;
      }

      .ai-chat-message-row.visitor {
        justify-content: flex-end;
      }

      .ai-chat-message-row.agent,
      .ai-chat-message-row.ai {
        justify-content: flex-start;
      }

      .ai-chat-message-row.system {
        justify-content: center;
      }

      .ai-chat-mini-avatar {
        width: 27px;
        height: 27px;
        flex: 0 0 27px;
        display: grid;
        place-items: center;
        overflow: hidden;
        border: 1px solid var(--ai-chat-border);
        border-radius: 9px;
        color: var(--ai-chat-primary);
        background: #ffffff;
        font-size: 10px;
        font-weight: 900;
      }

      .ai-chat-mini-avatar img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
      }

      .ai-chat-message {
        max-width: 80%;
        padding: 9px 11px 7px;
        border-radius: 15px;
        direction: rtl;
        text-align: right;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
        font-size: 12.5px;
        line-height: 1.75;
      }

      .ai-chat-message.visitor {
        border-bottom-right-radius: 5px;
        color: #ffffff;
        background: var(--ai-chat-primary);
        box-shadow: 0 8px 20px var(--ai-chat-primary-soft);
      }

      .ai-chat-message.agent,
      .ai-chat-message.ai {
        border: 1px solid var(--ai-chat-border);
        border-bottom-left-radius: 5px;
        color: var(--ai-chat-text);
        background: #ffffff;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
      }

      .ai-chat-message.ai {
        border-color: color-mix(in srgb, var(--ai-chat-primary) 22%, #e2e8f0);
      }

      .ai-chat-message.system {
        max-width: 88%;
        padding: 7px 10px;
        border: 1px dashed #cbd5e1;
        border-radius: 11px;
        color: var(--ai-chat-muted);
        background: rgba(255, 255, 255, 0.72);
        text-align: center;
        font-size: 11px;
      }

      .ai-chat-message-time {
        margin-top: 4px;
        direction: rtl;
        font-size: 9px;
        opacity: 0.64;
      }

      .ai-chat-attachment {
        margin-top: 7px;
        overflow: hidden;
        border: 1px solid rgba(226, 232, 240, 0.92);
        border-radius: 11px;
        background: rgba(255, 255, 255, 0.9);
      }

      .ai-chat-message.visitor .ai-chat-attachment {
        border-color: rgba(255, 255, 255, 0.26);
        background: rgba(255, 255, 255, 0.12);
      }

      .ai-chat-attachment img {
        width: 100%;
        max-height: 180px;
        display: block;
        object-fit: cover;
      }

      .ai-chat-attachment-link {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 9px;
        color: var(--ai-chat-primary);
        text-decoration: none;
        direction: rtl;
        font-size: 11.5px;
        overflow-wrap: anywhere;
      }

      .ai-chat-message.visitor .ai-chat-attachment-link {
        color: #ffffff;
      }

      .ai-chat-attachment-link svg {
        width: 17px;
        height: 17px;
        flex: 0 0 17px;
      }

      .ai-chat-typing {
        width: fit-content;
        display: none;
        align-items: center;
        gap: 6px;
        margin-top: 9px;
        padding: 7px 9px;
        border: 1px solid var(--ai-chat-border);
        border-radius: 13px;
        color: var(--ai-chat-muted);
        background: #ffffff;
        direction: rtl;
        font-size: 10.5px;
      }

      .ai-chat-typing.show {
        display: flex;
      }

      .ai-chat-typing-dots {
        display: inline-flex;
        gap: 3px;
        direction: ltr;
      }

      .ai-chat-dot {
        width: 5px;
        height: 5px;
        border-radius: 999px;
        background: #94a3b8;
        animation: aiChatTyping 900ms infinite ease-in-out;
      }

      .ai-chat-dot:nth-child(2) {
        animation-delay: 120ms;
      }

      .ai-chat-dot:nth-child(3) {
        animation-delay: 240ms;
      }

      .ai-chat-footer {
        flex: 0 0 auto;
        padding: 9px 10px calc(9px + env(safe-area-inset-bottom));
        border-top: 1px solid var(--ai-chat-border);
        background: rgba(255, 255, 255, 0.98);
      }

      .ai-chat-send-row {
        display: none;
        align-items: flex-end;
        gap: 6px;
        padding: 6px;
        border: 1px solid var(--ai-chat-border);
        border-radius: 15px;
        background: var(--ai-chat-surface-soft);
        transition: border-color 160ms ease, box-shadow 160ms ease;
      }

      .ai-chat-send-row:focus-within {
        border-color: var(--ai-chat-primary);
        box-shadow: 0 0 0 3px var(--ai-chat-primary-soft);
      }

      .ai-chat-send-row.active {
        display: flex;
      }

      .ai-chat-send-row .ai-chat-textarea {
        flex: 1 1 auto;
        min-height: 38px;
        max-height: 104px;
        padding: 8px 7px;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
      }

      .ai-chat-send-row .ai-chat-textarea:focus {
        box-shadow: none;
      }

      .ai-chat-send-button,
      .ai-chat-file-button {
        width: 39px;
        height: 39px;
        flex: 0 0 39px;
        display: grid;
        place-items: center;
        padding: 0;
        border-radius: 12px;
        cursor: pointer;
        transition: background 160ms ease, color 160ms ease, transform 160ms ease, opacity 160ms ease;
      }

      .ai-chat-send-button {
        border: 0;
        color: #ffffff;
        background: var(--ai-chat-primary);
      }

      .ai-chat-file-button {
        border: 1px solid var(--ai-chat-border);
        color: var(--ai-chat-primary);
        background: #ffffff;
      }

      .ai-chat-send-button:hover {
        background: var(--ai-chat-primary-dark);
        transform: translateY(-1px);
      }

      .ai-chat-file-button:hover {
        background: var(--ai-chat-primary-soft);
        transform: translateY(-1px);
      }

      .ai-chat-send-button:disabled,
      .ai-chat-file-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      .ai-chat-send-button svg,
      .ai-chat-file-button svg {
        width: 18px;
        height: 18px;
      }

      .ai-chat-footer-meta {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 6px;
        color: #94a3b8;
        font-size: 9.5px;
      }

      .ai-chat-upload-hint {
        display: none;
      }

      .ai-chat-footer.chat-active .ai-chat-upload-hint {
        display: inline;
      }

      @keyframes aiChatOpen {
        from {
          opacity: 0;
          transform: translateY(12px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes aiChatPulse {
        0% {
          opacity: 0.8;
          transform: scale(0.96);
        }
        75%,
        100% {
          opacity: 0;
          transform: scale(1.18);
        }
      }

      @keyframes aiChatSpin {
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes aiChatTyping {
        0%,
        80%,
        100% {
          opacity: 0.4;
          transform: translateY(0);
        }
        40% {
          opacity: 1;
          transform: translateY(-3px);
        }
      }

      @media (max-width: 520px) {
        .ai-chat-window {
          inset: 0;
          width: 100vw;
          max-width: none;
          height: 100dvh;
          max-height: none;
          border: 0;
          border-radius: 0;
          transform-origin: center bottom;
        }

        .ai-chat-root.chat-open .ai-chat-launcher-wrap {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }

        .ai-chat-header {
          padding-top: calc(14px + env(safe-area-inset-top));
        }

        .ai-chat-preview {
          display: none !important;
        }

        .ai-chat-launcher-wrap {
          right: max(14px, env(safe-area-inset-right));
          bottom: max(14px, env(safe-area-inset-bottom));
        }

        .ai-chat-button {
          width: 56px;
          height: 56px;
          flex-basis: 56px;
          border-radius: 18px;
        }

        .ai-chat-body {
          padding: 12px;
        }

        .ai-chat-message {
          max-width: 85%;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          scroll-behavior: auto !important;
          animation-duration: 0.001ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.001ms !important;
        }
      }
    </style>

    <div class="ai-chat-root" data-root>
      <section
        class="ai-chat-window"
        data-window
        role="dialog"
        aria-modal="false"
        aria-label="گفتگوی پشتیبانی"
      >
        <header class="ai-chat-header">
          <div class="ai-chat-header-row">
            <div class="ai-chat-brand">
              <div class="ai-chat-avatar" data-avatar aria-hidden="true">AI</div>

              <div class="ai-chat-title-wrap">
                <div class="ai-chat-title" data-title>پشتیبانی آنلاین</div>
                <div class="ai-chat-status">
                  <span class="ai-chat-status-dot" data-status-dot></span>
                  <span class="ai-chat-status-text" data-status-text>
                    در حال بررسی وضعیت پشتیبانی...
                  </span>
                </div>
              </div>
            </div>

            <button
              class="ai-chat-icon-button"
              type="button"
              data-close
              aria-label="بستن پنجره گفتگو"
              title="بستن"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 7L17 17M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </div>

          <div class="ai-chat-header-subrow">
            <button class="ai-chat-reset" type="button" data-reset>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M4 4v4.68h4.68" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              گفتگوی جدید
            </button>
          </div>
        </header>

        <main class="ai-chat-body" data-body aria-live="polite">
          <div class="ai-chat-loading-card">
            <span class="ai-chat-spinner" aria-hidden="true"></span>
            <span>در حال آماده‌سازی چت...</span>
          </div>
        </main>

        <footer class="ai-chat-footer" data-footer>
          <form class="ai-chat-send-row" data-send-form>
            <button
              class="ai-chat-file-button"
              type="button"
              data-file-button
              aria-label="ارسال فایل"
              title="ارسال فایل"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M8.5 12.5l5.25-5.25a3 3 0 1 1 4.24 4.24l-7.07 7.07a5 5 0 0 1-7.07-7.07l7.08-7.08" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>

            <input
              type="file"
              data-file-input
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
              hidden
            />

            <textarea
              class="ai-chat-textarea"
              data-message-input
              rows="1"
              maxlength="4000"
              placeholder="پیام خود را بنویسید..."
              aria-label="متن پیام"
            ></textarea>

            <button
              class="ai-chat-send-button"
              type="submit"
              data-send-button
              aria-label="ارسال پیام"
              title="ارسال پیام"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4.7 5.4l14.2 6.1a.55.55 0 0 1 0 1L4.7 18.6a.55.55 0 0 1-.75-.62l1.05-4.1 7-1.88-7-1.88-1.05-4.1a.55.55 0 0 1 .75-.62Z" fill="currentColor" />
              </svg>
            </button>
          </form>

          <div class="ai-chat-footer-meta">
            <span class="ai-chat-upload-hint">حداکثر حجم فایل: ۳ مگابایت</span>
            <span>Powered by AI Chat SaaS</span>
          </div>
        </footer>
      </section>

      <div class="ai-chat-launcher-wrap">
        <div class="ai-chat-preview" data-preview role="status">
          سوالی داری؟ ما همین‌جا هستیم تا راهنمایی‌ات کنیم.
        </div>

        <button
          class="ai-chat-button"
          type="button"
          data-toggle
          aria-label="باز کردن چت"
          aria-expanded="false"
        >
          <span class="ai-chat-button-pulse" aria-hidden="true"></span>
          <span class="ai-chat-unread" data-unread aria-label="پیام خوانده‌نشده">1</span>

          <span class="ai-chat-launcher-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M5.6 18.35 3.8 20a.7.7 0 0 1-1.17-.6l.35-3.23A8.23 8.23 0 0 1 2 12.3C2 7.72 6.48 4 12 4s10 3.72 10 8.3-4.48 8.3-10 8.3a11.8 11.8 0 0 1-6.4-2.25Z" fill="currentColor" />
              <path d="M7.5 11.2h9M7.5 14.3h5.7" stroke="var(--ai-chat-primary)" stroke-width="1.7" stroke-linecap="round" />
            </svg>
          </span>

          <span class="ai-chat-launcher-close" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M7 7L17 17M17 7L7 17" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" />
            </svg>
          </span>
        </button>
      </div>
    </div>
  `;

    const elements = {
        root: shadow.querySelector("[data-root]"),
        button: shadow.querySelector("[data-toggle]"),
        window: shadow.querySelector("[data-window]"),
        close: shadow.querySelector("[data-close]"),
        reset: shadow.querySelector("[data-reset]"),
        unread: shadow.querySelector("[data-unread]"),
        preview: shadow.querySelector("[data-preview]"),
        title: shadow.querySelector("[data-title]"),
        avatar: shadow.querySelector("[data-avatar]"),
        statusText: shadow.querySelector("[data-status-text]"),
        statusDot: shadow.querySelector("[data-status-dot]"),
        body: shadow.querySelector("[data-body]"),
        footer: shadow.querySelector("[data-footer]"),
        sendForm: shadow.querySelector("[data-send-form]"),
        messageInput: shadow.querySelector("[data-message-input]"),
        sendButton: shadow.querySelector("[data-send-button]"),
        fileButton: shadow.querySelector("[data-file-button]"),
        fileInput: shadow.querySelector("[data-file-input]"),
    };

    bindEvents();
    schedulePreview();
    init();

    function bindEvents() {
        elements.button.addEventListener("click", toggleChat);
        elements.close.addEventListener("click", closeChat);
        elements.reset.addEventListener("click", resetConversation);
        elements.sendForm.addEventListener("submit", handleSendMessage);

        elements.fileButton.addEventListener("click", function () {
            if (!visitor || !conversation || isSending) {
                return;
            }

            elements.fileInput.click();
        });

        elements.fileInput.addEventListener("change", handleWidgetFileChange);

        elements.messageInput.addEventListener("input", function () {
            autoResizeTextarea(elements.messageInput);
        });

        elements.messageInput.addEventListener("keydown", function (event) {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();

                if (typeof elements.sendForm.requestSubmit === "function") {
                    elements.sendForm.requestSubmit();
                } else {
                    elements.sendButton.click();
                }
            }
        });

        document.addEventListener("visibilitychange", function () {
            if (document.hidden) {
                stopPolling();
            } else if (visitor && conversation) {
                loadMessages().catch(function (error) {
                    console.warn("AI Chat Widget message refresh failed:", error);
                });
                startPolling();
            }
        });

        window.addEventListener("beforeunload", stopPolling);
    }

    function schedulePreview() {
        previewShowTimer = window.setTimeout(function () {
            if (!isOpen && !visitor) {
                elements.preview.classList.add("show");
            }
        }, 1800);

        previewHideTimer = window.setTimeout(function () {
            elements.preview.classList.remove("show");
        }, 8000);
    }

    async function init() {
        try {
            siteConfig = await fetchWidgetConfig();
            applySiteConfig();

            if (visitor && conversation) {
                renderChat();
                await loadMessages();
                startPolling();
            } else {
                renderStartForm();
            }
        } catch (error) {
            renderError("خطا در بارگذاری چت. لطفاً بعداً دوباره تلاش کنید.");
            console.error("AI Chat Widget initialization failed:", error);
        }
    }

    async function fetchWidgetConfig() {
        const url = `${apiBase}/widget/config.php?site_key=${encodeURIComponent(siteKey)}`;
        const data = await fetchJson(url);

        if (!data.success) {
            throw new Error(data.message || "Failed to load widget config");
        }

        return data.site;
    }

    function applySiteConfig() {
        const color = normalizeHex(siteConfig?.brand_color) || "#2563eb";
        const brandName =
            String(siteConfig?.brand_name || siteConfig?.name || "پشتیبانی آنلاین").trim() ||
            "پشتیبانی آنلاین";

        elements.root.style.setProperty("--ai-chat-primary", color);
        elements.root.style.setProperty("--ai-chat-primary-dark", darkenColor(color, 24));
        elements.root.style.setProperty("--ai-chat-primary-soft", hexToRgba(color, 0.1));
        elements.root.style.setProperty("--ai-chat-primary-ring", hexToRgba(color, 0.2));

        elements.title.textContent = brandName;
        renderBrandAvatar(elements.avatar, brandName, siteConfig?.logo_url);

        const supportOnline = Boolean(siteConfig?.support_online);
        const fallbackStatus = supportOnline
            ? "پشتیبانی آنلاین است"
            : "پاسخ‌گویی ممکن است کمی زمان ببرد";

        elements.statusText.textContent =
            String(siteConfig?.support_status_text || fallbackStatus).trim() || fallbackStatus;
        elements.statusDot.classList.toggle("offline", !supportOnline);

        elements.preview.textContent =
            String(
                siteConfig?.welcome_message ||
                "سوالی داری؟ ما همین‌جا هستیم تا راهنمایی‌ات کنیم."
            ).trim();
    }

    function toggleChat() {
        if (isOpen) {
            closeChat();
        } else {
            openChat();
        }
    }

    function openChat() {
        isOpen = true;
        elements.window.classList.add("open");
        elements.button.classList.add("open");
        elements.root.classList.add("chat-open");
        elements.button.setAttribute("aria-label", "بستن چت");
        elements.button.setAttribute("aria-expanded", "true");
        elements.preview.classList.remove("show");

        if (previewShowTimer) {
            window.clearTimeout(previewShowTimer);
        }

        if (previewHideTimer) {
            window.clearTimeout(previewHideTimer);
        }

        hasUnreadAgentMessage = false;
        updateUnreadState();
        scrollToBottom();

        window.setTimeout(function () {
            const focusTarget = visitor && conversation
                ? elements.messageInput
                : shadow.querySelector("[data-name-input]");

            focusTarget?.focus();
        }, 80);
    }

    function closeChat() {
        isOpen = false;
        elements.window.classList.remove("open");
        elements.button.classList.remove("open");
        elements.root.classList.remove("chat-open");
        elements.button.setAttribute("aria-label", "باز کردن چت");
        elements.button.setAttribute("aria-expanded", "false");
        elements.button.focus({ preventScroll: true });
    }

    function renderStartForm() {
        const welcomeMessage =
            String(siteConfig?.welcome_message || "سلام، چطور می‌تونیم کمکتون کنیم؟").trim();
        const offlineNote = siteConfig?.support_online
            ? ""
            : `
        <div class="ai-chat-offline-note" role="status">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 8v4m0 4h.01M10.3 4.5 2.7 17.7A1.55 1.55 0 0 0 4.04 20h15.92a1.55 1.55 0 0 0 1.34-2.3L13.7 4.5a1.96 1.96 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>پیام شما ثبت می‌شود؛ ممکن است پاسخ کمی دیرتر ارسال شود.</span>
        </div>
      `;

        elements.body.innerHTML = `
      <section class="ai-chat-intro">
        <div class="ai-chat-intro-top">
          <div class="ai-chat-intro-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 5.8A2.8 2.8 0 0 1 6.8 3h10.4A2.8 2.8 0 0 1 20 5.8v7.4a2.8 2.8 0 0 1-2.8 2.8H10l-4.2 3.3c-.75.58-1.8.05-1.8-.9V5.8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
              <path d="M8 8.5h8M8 11.5h5.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
            </svg>
          </div>

          <div>
            <h2 class="ai-chat-welcome-title">سلام، خوش اومدی</h2>
            <div class="ai-chat-welcome-text">${escapeHtml(welcomeMessage)}</div>
          </div>
        </div>

        ${offlineNote}
      </section>

      <section class="ai-chat-form-card">
        <div class="ai-chat-form-title">برای شروع، مشخصات زیر را وارد کن</div>

        <form class="ai-chat-form" data-start-form novalidate>
          <label class="ai-chat-field">
            <span class="ai-chat-label">نام شما</span>
            <input
              class="ai-chat-input"
              type="text"
              data-name-input
              name="name"
              autocomplete="name"
              maxlength="100"
              placeholder="مثلاً علی رضایی"
            />
          </label>

          <label class="ai-chat-field">
            <span class="ai-chat-label">شماره تماس</span>
            <input
              class="ai-chat-input"
              type="tel"
              data-phone-input
              name="phone"
              autocomplete="tel"
              inputmode="tel"
              maxlength="30"
              placeholder="مثلاً 09120000000"
              dir="ltr"
            />
          </label>

          <label class="ai-chat-field">
            <span class="ai-chat-label">ایمیل <em>اختیاری</em></span>
            <input
              class="ai-chat-input"
              type="email"
              data-email-input
              name="email"
              autocomplete="email"
              maxlength="190"
              placeholder="name@example.com"
              dir="ltr"
            />
          </label>

          <label class="ai-chat-field">
            <span class="ai-chat-label">پیام شما</span>
            <textarea
              class="ai-chat-textarea"
              data-first-message-input
              name="message"
              maxlength="4000"
              placeholder="چطور می‌تونیم کمکتون کنیم؟"
            ></textarea>
          </label>

          <button class="ai-chat-primary" type="submit" data-start-button>
            <span data-start-button-text>شروع گفتگو</span>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </form>
      </section>
    `;

        setChatComposerActive(false);

        const startForm = shadow.querySelector("[data-start-form]");
        const firstMessageInput = shadow.querySelector("[data-first-message-input]");

        startForm?.addEventListener("submit", handleStartConversation);
        firstMessageInput?.addEventListener("input", function () {
            autoResizeTextarea(firstMessageInput);
        });
    }

    async function handleStartConversation(event) {
        event.preventDefault();

        const nameInput = shadow.querySelector("[data-name-input]");
        const phoneInput = shadow.querySelector("[data-phone-input]");
        const emailInput = shadow.querySelector("[data-email-input]");
        const firstMessageInput = shadow.querySelector("[data-first-message-input]");
        const startButton = shadow.querySelector("[data-start-button]");
        const startButtonText = shadow.querySelector("[data-start-button-text]");

        const name = nameInput?.value.trim() || "";
        const phone = phoneInput?.value.trim() || "";
        const email = emailInput?.value.trim() || "";
        const firstMessage = firstMessageInput?.value.trim() || "";

        clearInlineError();

        if (!name) {
            renderInlineError("لطفاً نام خود را وارد کنید.");
            nameInput?.focus();
            return;
        }

        if (!phone && !email) {
            renderInlineError("لطفاً شماره تماس یا ایمیل را وارد کنید.");
            phoneInput?.focus();
            return;
        }

        if (email && !isValidEmail(email)) {
            renderInlineError("لطفاً یک ایمیل معتبر وارد کنید.");
            emailInput?.focus();
            return;
        }

        if (!firstMessage) {
            renderInlineError("لطفاً پیام خود را بنویسید.");
            firstMessageInput?.focus();
            return;
        }

        try {
            setStartButtonLoading(startButton, startButtonText, true);

            visitor = await startVisitor({ name, phone, email });
            writeStorageJson(STORAGE_KEYS.visitor, visitor);

            conversation = await startConversation(visitor.id);
            writeStorageJson(STORAGE_KEYS.conversation, conversation);

            renderChat();
            await sendVisitorMessage(firstMessage);
            await loadMessages();
            startPolling();
        } catch (error) {
            renderInlineError("شروع گفتگو با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
            console.error("AI Chat Widget start conversation failed:", error);
            setStartButtonLoading(startButton, startButtonText, false);
        }
    }

    async function startVisitor({ name, phone, email }) {
        const data = await fetchJson(`${apiBase}/widget/visitor-start.php`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                site_key: siteKey,
                browser_id: browserId,
                name,
                phone,
                email,
            }),
        });

        if (!data.success) {
            throw new Error(data.message || "Failed to start visitor");
        }

        return data.visitor;
    }

    async function startConversation(visitorId) {
        const data = await fetchJson(`${apiBase}/widget/conversation-start.php`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                site_key: siteKey,
                visitor_id: visitorId,
                source_page_url: window.location.href,
                source_page_title: document.title,
            }),
        });

        if (!data.success) {
            throw new Error(data.message || "Failed to start conversation");
        }

        return data.conversation;
    }

    function renderChat() {
        elements.body.innerHTML = `
      <div class="ai-chat-messages" data-messages>
        <div class="ai-chat-day-chip">امروز</div>
      </div>

      <div class="ai-chat-typing" data-typing aria-live="polite">
        <span data-typing-text>پشتیبان در حال نوشتن...</span>
        <span class="ai-chat-typing-dots" aria-hidden="true">
          <span class="ai-chat-dot"></span>
          <span class="ai-chat-dot"></span>
          <span class="ai-chat-dot"></span>
        </span>
      </div>
    `;

        setChatComposerActive(true);
        autoResizeTextarea(elements.messageInput);
        scrollToBottom();
    }

    async function handleSendMessage(event) {
        event.preventDefault();

        const content = elements.messageInput.value.trim();

        if (!content || isSending || !visitor || !conversation) {
            return;
        }

        try {
            setSendingState(true);
            clearInlineError();
            elements.messageInput.value = "";
            autoResizeTextarea(elements.messageInput);

            await sendVisitorMessage(content);
            await loadMessages();
        } catch (error) {
            elements.messageInput.value = content;
            autoResizeTextarea(elements.messageInput);
            renderInlineError("ارسال پیام با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
            console.error("AI Chat Widget send message failed:", error);
        } finally {
            setSendingState(false);
            elements.messageInput.focus();
        }
    }

    async function handleWidgetFileChange(event) {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        if (!visitor || !conversation) {
            renderInlineError("ابتدا گفتگو را شروع کنید.");
            event.target.value = "";
            return;
        }

        if (file.size > MAX_UPLOAD_SIZE) {
            renderInlineError("حجم فایل باید کمتر از ۳ مگابایت باشد.");
            event.target.value = "";
            return;
        }

        if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
            renderInlineError("فقط تصویر با فرمت JPG، PNG، GIF، WEBP یا فایل PDF مجاز است.");
            event.target.value = "";
            return;
        }

        const currentText = elements.messageInput.value.trim();

        try {
            setSendingState(true);
            clearInlineError();

            await sendVisitorAttachment(file, currentText);

            elements.messageInput.value = "";
            elements.fileInput.value = "";
            autoResizeTextarea(elements.messageInput);
            await loadMessages();
        } catch (error) {
            renderInlineError("ارسال فایل با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
            console.error("AI Chat Widget send attachment failed:", error);
        } finally {
            setSendingState(false);
            elements.fileInput.value = "";
        }
    }

    function renderWidgetAttachment(attachment) {
        const wrapper = document.createElement("div");
        wrapper.className = "ai-chat-attachment";

        const fileUrl = String(attachment?.file_url || "");
        const originalName = String(attachment?.original_name || "فایل پیوست");
        const isImage = String(attachment?.mime_type || "").startsWith("image/");

        if (isImage) {
            const link = document.createElement("a");
            link.href = fileUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.setAttribute("aria-label", `مشاهده ${originalName}`);

            const image = document.createElement("img");
            image.src = fileUrl;
            image.alt = originalName;
            image.loading = "lazy";

            link.appendChild(image);
            wrapper.appendChild(link);
            return wrapper;
        }

        const link = document.createElement("a");
        link.className = "ai-chat-attachment-link";
        link.href = fileUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        link.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8.5 12.5l5.25-5.25a3 3 0 1 1 4.24 4.24l-7.07 7.07a5 5 0 0 1-7.07-7.07l7.08-7.08" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span></span>
    `;
        link.querySelector("span").textContent = originalName;

        wrapper.appendChild(link);
        return wrapper;
    }

    async function sendVisitorAttachment(file, content) {
        const formData = new FormData();

        formData.append("site_key", siteKey);
        formData.append("visitor_id", String(visitor.id));
        formData.append("conversation_id", String(conversation.id));
        formData.append("content", content || "فایل ارسال شد.");
        formData.append("file", file);

        const data = await fetchJson(`${apiBase}/widget/attachment-send.php`, {
            method: "POST",
            body: formData,
        });

        if (!data.success) {
            throw new Error(data.message || "Failed to send attachment");
        }

        return data.data;
    }

    async function maybeRequestAiReply(visitorMessageId) {
        if (!visitor || !conversation || !visitorMessageId) {
            return null;
        }

        // تصمیم نهایی پاسخ‌گویی فقط در بک‌اند گرفته می‌شود؛
        // چون وضعیت آنلاین و تنظیمات ممکن است پس از بارگذاری ویجت تغییر کرده باشند.
        try {
            const data = await fetchJson(`${apiBase}/widget/ai-reply.php`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    site_key: siteKey,
                    visitor_id: visitor.id,
                    conversation_id: conversation.id,
                    message_id: visitorMessageId,
                }),
            });

            if (!data.success) {
                console.warn("AI Chat Widget AI reply failed:", data);
                return null;
            }

            if (data.skipped) {
                console.info("AI Chat Widget AI reply skipped:", data.reason, data);
                return data;
            }

            console.info("AI Chat Widget AI reply created:", data.reply_mode, data);
            return data;
        } catch (error) {
            console.warn("AI Chat Widget AI reply request failed:", error);
            return null;
        }
    }

    async function sendVisitorMessage(content) {
        const data = await fetchJson(`${apiBase}/widget/message-send.php`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                site_key: siteKey,
                visitor_id: visitor.id,
                conversation_id: conversation.id,
                content,
            }),
        });

        if (!data.success) {
            throw new Error(data.message || "Failed to send message");
        }

        const sentMessage = data.data;
        await maybeRequestAiReply(sentMessage.id);
        return sentMessage;
    }

    async function loadMessages() {
        if (!visitor || !conversation) {
            return;
        }

        const url =
            `${apiBase}/widget/messages-list.php` +
            `?site_key=${encodeURIComponent(siteKey)}` +
            `&visitor_id=${encodeURIComponent(visitor.id)}` +
            `&conversation_id=${encodeURIComponent(conversation.id)}` +
            `&after_id=${encodeURIComponent(lastMessageId)}`;

        const data = await fetchJson(url);

        if (!data.success) {
            throw new Error(data.message || "Failed to load messages");
        }

        if (Array.isArray(data.messages) && data.messages.length > 0) {
            appendMessages(data.messages);
        }
    }

    function appendMessages(messages) {
        const messagesContainer = shadow.querySelector("[data-messages]");

        if (!messagesContainer) {
            return;
        }

        for (const message of messages) {
            const messageId = Number(message?.id || 0);

            if (!messageId || messageId <= lastMessageId) {
                continue;
            }

            const senderType = normalizeSenderType(message?.sender_type);
            const isAgentSide = ["agent", "ai", "system"].includes(senderType);

            if (isAgentSide && !isOpen) {
                hasUnreadAgentMessage = true;
            }

            const row = document.createElement("div");
            row.className = `ai-chat-message-row ${senderType}`;

            if (senderType === "agent" || senderType === "ai") {
                row.appendChild(createMiniAvatar());
            }

            const messageElement = document.createElement("div");
            messageElement.className = `ai-chat-message ${senderType}`;

            const text = document.createElement("div");
            text.textContent = String(message?.content || "");
            messageElement.appendChild(text);

            if (Array.isArray(message?.attachments)) {
                for (const attachment of message.attachments) {
                    messageElement.appendChild(renderWidgetAttachment(attachment));
                }
            }

            const time = document.createElement("div");
            time.className = "ai-chat-message-time";
            time.textContent = formatMessageTime(message?.created_at);
            messageElement.appendChild(time);

            row.appendChild(messageElement);
            messagesContainer.appendChild(row);
            lastMessageId = Math.max(lastMessageId, messageId);
        }

        updateUnreadState();
        hideTyping();
        scrollToBottom();
    }

    function createMiniAvatar() {
        const avatar = document.createElement("div");
        avatar.className = "ai-chat-mini-avatar";

        const brandName =
            String(siteConfig?.brand_name || siteConfig?.name || "پشتیبانی").trim() ||
            "پشتیبانی";

        renderBrandAvatar(avatar, brandName, siteConfig?.logo_url);
        return avatar;
    }

    async function loadTypingStatus() {
        if (!visitor || !conversation) {
            return;
        }

        const url =
            `${apiBase}/widget/typing-status.php` +
            `?site_key=${encodeURIComponent(siteKey)}` +
            `&visitor_id=${encodeURIComponent(visitor.id)}` +
            `&conversation_id=${encodeURIComponent(conversation.id)}`;

        let data;

        try {
            data = await fetchJson(url);
        } catch (error) {
            return;
        }

        if (!data.success) {
            return;
        }

        const typing = data.typing;

        if (typing?.is_typing) {
            agentTypingText = String(typing.text || "پشتیبان در حال نوشتن...");
            showAgentTyping();
        } else {
            hideTyping();
        }
    }

    function startPolling() {
        stopPolling();

        if (document.hidden || !visitor || !conversation) {
            return;
        }

        pollingTimer = window.setInterval(async function () {
            try {
                await Promise.all([loadMessages(), loadTypingStatus()]);
            } catch (error) {
                console.warn("AI Chat Widget polling failed:", error);
            }
        }, POLLING_INTERVAL);
    }

    function stopPolling() {
        if (pollingTimer) {
            window.clearInterval(pollingTimer);
            pollingTimer = null;
        }
    }

    function showAgentTyping() {
        const typing = shadow.querySelector("[data-typing]");
        const typingText = shadow.querySelector("[data-typing-text]");

        if (!typing) {
            return;
        }

        if (typingText) {
            typingText.textContent = agentTypingText;
        }

        typing.classList.add("show");
        scrollToBottom();
    }

    function hideTyping() {
        const typing = shadow.querySelector("[data-typing]");
        typing?.classList.remove("show");
    }

    function resetConversation() {
        localStorage.removeItem(STORAGE_KEYS.visitor);
        localStorage.removeItem(STORAGE_KEYS.conversation);

        visitor = null;
        conversation = null;
        lastMessageId = 0;
        hasUnreadAgentMessage = false;
        agentTypingText = "پشتیبان در حال نوشتن...";

        stopPolling();
        updateUnreadState();
        clearInlineError();
        renderStartForm();

        window.setTimeout(function () {
            shadow.querySelector("[data-name-input]")?.focus();
        }, 50);
    }

    function renderError(message) {
        elements.body.innerHTML = `
      <div class="ai-chat-error" role="alert">${escapeHtml(message)}</div>
    `;
        setChatComposerActive(false);
    }

    function renderInlineError(message) {
        clearInlineError();

        const error = document.createElement("div");
        error.className = "ai-chat-error";
        error.setAttribute("data-inline-error", "true");
        error.setAttribute("role", "alert");
        error.textContent = message;

        elements.body.prepend(error);
        elements.body.scrollTop = 0;
    }

    function clearInlineError() {
        shadow.querySelector("[data-inline-error]")?.remove();
    }

    function setChatComposerActive(active) {
        elements.sendForm.classList.toggle("active", active);
        elements.footer.classList.toggle("chat-active", active);
        elements.fileButton.disabled = !active || isSending;
        elements.sendButton.disabled = !active || isSending;
        elements.messageInput.disabled = !active || isSending;
    }

    function setSendingState(active) {
        isSending = active;
        elements.sendButton.disabled = active;
        elements.fileButton.disabled = active;
        elements.messageInput.disabled = active;
    }

    function setStartButtonLoading(button, textElement, active) {
        if (!button || !textElement) {
            return;
        }

        button.disabled = active;
        textElement.textContent = active ? "در حال شروع گفتگو..." : "شروع گفتگو";
    }

    function updateUnreadState() {
        elements.unread.classList.toggle("show", hasUnreadAgentMessage);
        elements.button.classList.toggle("has-unread", hasUnreadAgentMessage);
    }

    function scrollToBottom() {
        window.requestAnimationFrame(function () {
            elements.body.scrollTop = elements.body.scrollHeight;
        });
    }

    function autoResizeTextarea(textarea) {
        if (!textarea) {
            return;
        }

        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 104)}px`;
    }

    function renderBrandAvatar(container, brandName, logoUrl) {
        container.replaceChildren();

        if (logoUrl) {
            const image = document.createElement("img");
            image.src = String(logoUrl);
            image.alt = brandName;
            image.loading = "lazy";
            image.addEventListener("error", function () {
                container.replaceChildren(document.createTextNode(getInitials(brandName)));
            }, { once: true });
            container.appendChild(image);
            return;
        }

        container.textContent = getInitials(brandName);
    }

    function getOrCreateBrowserId() {
        try {
            let id = localStorage.getItem(STORAGE_KEYS.browserId);

            if (!id) {
                id =
                    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                        ? `browser_${crypto.randomUUID()}`
                        : `browser_${Date.now()}_${Math.random().toString(16).slice(2)}`;
                localStorage.setItem(STORAGE_KEYS.browserId, id);
            }

            return id;
        } catch (error) {
            return `browser_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        }
    }

    function readStorageJson(key) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            return null;
        }
    }

    function writeStorageJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.warn("AI Chat Widget storage write failed:", error);
        }
    }

    async function fetchJson(url, options) {
        const response = await fetch(url, options);
        const contentType = response.headers.get("content-type") || "";
        let data;

        if (contentType.includes("application/json")) {
            data = await response.json();
        } else {
            const rawText = await response.text();
            throw new Error(rawText || `HTTP ${response.status}`);
        }

        if (!response.ok) {
            throw new Error(data?.message || `HTTP ${response.status}`);
        }

        return data;
    }

    function normalizeSenderType(value) {
        const type = String(value || "system").toLowerCase();
        return ["visitor", "agent", "ai", "system"].includes(type) ? type : "system";
    }

    function getInitials(value) {
        const clean = String(value || "AI").trim();

        if (!clean) {
            return "AI";
        }

        const parts = clean.split(/\s+/).filter(Boolean);

        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }

        return clean.slice(0, 2).toUpperCase();
    }

    function formatMessageTime(value) {
        if (!value) {
            return "";
        }

        const date = new Date(String(value).replace(" ", "T"));

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return date.toLocaleTimeString("fa-IR", {
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function darkenColor(hex, amount) {
        const normalized = normalizeHex(hex) || "#2563eb";
        const number = parseInt(normalized.slice(1), 16);
        const red = Math.max(0, (number >> 16) - amount);
        const green = Math.max(0, ((number >> 8) & 0xff) - amount);
        const blue = Math.max(0, (number & 0xff) - amount);

        return `#${((1 << 24) + (red << 16) + (green << 8) + blue)
            .toString(16)
            .slice(1)}`;
    }

    function hexToRgba(hex, alpha) {
        const normalized = normalizeHex(hex) || "#2563eb";
        const number = parseInt(normalized.slice(1), 16);
        const red = number >> 16;
        const green = (number >> 8) & 0xff;
        const blue = number & 0xff;

        return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    }

    function normalizeHex(hex) {
        if (!hex) {
            return null;
        }

        let value = String(hex).trim();

        if (!value.startsWith("#")) {
            value = `#${value}`;
        }

        if (/^#[0-9a-fA-F]{3}$/.test(value)) {
            value = `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
        }

        return /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
    }
})();
