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
  const QUICK_EMOJIS = ["😀", "😂", "😍", "🙏", "👍", "❤️", "🎉", "🔥", "✅", "🤝"];
  const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
  const MAX_UPLOAD_SIZE = 3 * 1024 * 1024;
  const MAX_AUDIO_UPLOAD_SIZE = 10 * 1024 * 1024;
  const ALLOWED_UPLOAD_TYPES = new Set([
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
  ]);

  let siteConfig = null;
  let visitor = readStorageJson(STORAGE_KEYS.visitor);
  let conversation = readStorageJson(STORAGE_KEYS.conversation);
  let lastMessageId = 0;
  let pollingTimer = null;
  let isOpen = false;
  let isSending = false;
  let unreadAgentMessageCount = 0;
  let agentTypingText = "پشتیبان در حال نوشتن...";
  let previewShowTimer = null;
  let previewHideTimer = null;
  let lastMessageSyncAt = "";
  let replyingToMessage = null;
  let editingMessage = null;
  let mediaRecorder = null;
  let recordingStream = null;
  let recordingChunks = [];
  let recordingTimer = null;
  let recordingSeconds = 0;
  const messageCache = new Map();

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
      .ai-chat-file-button:focus-visible,
      .ai-chat-record-button:focus-visible,
      .ai-chat-message-action:focus-visible {
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

      .ai-chat-routing-status {
        display: none;
        margin: 0 0 10px;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid #fed7aa;
        background: #fff7ed;
        color: #9a3412;
        font-size: 12px;
        line-height: 1.7;
      }
      .ai-chat-routing-status.show { display: flex; align-items: center; gap: 8px; }
      .ai-chat-routing-status.assigned { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
      .ai-chat-routing-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex: 0 0 auto; }

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

      .ai-chat-message.deleted {
        opacity: 0.7;
        font-style: italic;
        box-shadow: none;
      }

      .ai-chat-reply-preview {
        display: grid;
        gap: 1px;
        margin-bottom: 6px;
        padding: 6px 7px;
        border-right: 3px solid currentColor;
        border-radius: 9px;
        background: rgba(255, 255, 255, 0.14);
        opacity: 0.9;
      }

      .ai-chat-message.agent .ai-chat-reply-preview,
      .ai-chat-message.ai .ai-chat-reply-preview,
      .ai-chat-message.system .ai-chat-reply-preview {
        border-right-color: var(--ai-chat-primary);
        background: var(--ai-chat-surface-soft);
      }

      .ai-chat-reply-preview strong {
        font-size: 9.5px;
      }

      .ai-chat-reply-preview span {
        overflow: hidden;
        font-size: 10px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .ai-chat-message-meta-row {
        margin-top: 4px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .ai-chat-message-actions {
        display: flex;
        gap: 3px;
        flex-wrap: wrap;
      }

      .ai-chat-message-action {
        padding: 2px 5px;
        border: 1px solid rgba(255, 255, 255, 0.24);
        border-radius: 6px;
        color: inherit;
        background: rgba(255, 255, 255, 0.1);
        font-size: 8.5px;
        font-weight: 750;
        cursor: pointer;
      }

      .ai-chat-message.agent .ai-chat-message-action,
      .ai-chat-message.ai .ai-chat-message-action,
      .ai-chat-message.system .ai-chat-message-action {
        border-color: var(--ai-chat-border);
        color: var(--ai-chat-muted);
        background: var(--ai-chat-surface-soft);
      }

      .ai-chat-audio {
        width: min(245px, 62vw);
        height: 36px;
        margin-top: 7px;
        display: block;
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

      .ai-chat-composer-context {
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
        padding: 7px 8px;
        border: 1px solid color-mix(in srgb, var(--ai-chat-primary) 25%, var(--ai-chat-border));
        border-radius: 11px;
        color: var(--ai-chat-text-soft);
        background: var(--ai-chat-primary-soft);
      }

      .ai-chat-composer-context.show {
        display: flex;
      }

      .ai-chat-composer-context > div {
        min-width: 0;
        display: grid;
        gap: 1px;
      }

      .ai-chat-composer-context strong {
        color: var(--ai-chat-primary);
        font-size: 9.5px;
      }

      .ai-chat-composer-context span {
        overflow: hidden;
        font-size: 10px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .ai-chat-composer-context button {
        width: 26px;
        height: 26px;
        flex: 0 0 26px;
        border: 0;
        border-radius: 8px;
        color: var(--ai-chat-primary);
        background: #ffffff;
        cursor: pointer;
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
      .ai-chat-file-button,
      .ai-chat-record-button {
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

      .ai-chat-file-button,
      .ai-chat-record-button {
        border: 1px solid var(--ai-chat-border);
        color: var(--ai-chat-primary);
        background: #ffffff;
      }

      .ai-chat-record-button.recording {
        color: #dc2626;
        border-color: #fecaca;
        background: #fef2f2;
        animation: aiChatRecordPulse 1.1s infinite;
      }

      .ai-chat-send-button:hover {
        background: var(--ai-chat-primary-dark);
        transform: translateY(-1px);
      }

      .ai-chat-file-button:hover,
      .ai-chat-record-button:hover {
        background: var(--ai-chat-primary-soft);
        transform: translateY(-1px);
      }

      .ai-chat-send-button:disabled,
      .ai-chat-file-button:disabled,
      .ai-chat-record-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      .ai-chat-send-button svg,
      .ai-chat-file-button svg,
      .ai-chat-record-button svg {
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

      @keyframes aiChatRecordPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.16); }
        50% { box-shadow: 0 0 0 5px rgba(220, 38, 38, 0.05); }
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

      .ai-chat-emoji-wrap {
        position: relative;
        flex: 0 0 auto;
      }

      .ai-chat-emoji-button {
        width: 36px;
        height: 36px;
        flex: 0 0 36px;
        border: 0;
        border-radius: 11px;
        color: var(--ai-chat-text-soft);
        background: transparent;
        cursor: pointer;
        font-size: 18px;
      }

      .ai-chat-emoji-button:hover {
        color: var(--ai-chat-primary);
        background: var(--ai-chat-primary-soft);
      }

      .ai-chat-emoji-picker {
        position: absolute;
        z-index: 40;
        right: 0;
        bottom: calc(100% + 10px);
        width: 205px;
        display: none;
        grid-template-columns: repeat(5, 1fr);
        gap: 5px;
        padding: 9px;
        border: 1px solid var(--ai-chat-border);
        border-radius: 14px;
        background: #fff;
        box-shadow: 0 16px 38px rgba(15, 23, 42, .18);
      }

      .ai-chat-emoji-picker.show {
        display: grid;
      }

      .ai-chat-emoji-picker button {
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 9px;
        background: var(--ai-chat-surface-soft);
        cursor: pointer;
        font-size: 18px;
      }

      .ai-chat-reactions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 7px;
      }

      .ai-chat-reaction-chip,
      .ai-chat-reaction-option {
        min-width: 27px;
        height: 27px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        border: 1px solid var(--ai-chat-border);
        border-radius: 999px;
        background: rgba(255,255,255,.86);
        cursor: pointer;
        font-size: 13px;
      }

      .ai-chat-reaction-chip.mine {
        border-color: var(--ai-chat-primary);
        background: var(--ai-chat-primary-soft);
      }

      .ai-chat-reaction-chip span {
        font-size: 9px;
        font-weight: 800;
      }

      .ai-chat-reaction-options {
        display: inline-flex;
        gap: 2px;
        opacity: 0;
        max-width: 0;
        overflow: hidden;
        transition: opacity 160ms ease, max-width 180ms ease;
      }

      .ai-chat-message:hover .ai-chat-reaction-options,
      .ai-chat-reaction-options:focus-within {
        opacity: 1;
        max-width: 190px;
      }

      @media (max-width: 640px) {
        .ai-chat-reaction-options {
          opacity: 1;
          max-width: 190px;
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
          <div class="ai-chat-composer-context" data-composer-context>
            <div>
              <strong data-composer-context-title>پاسخ به پیام</strong>
              <span data-composer-context-text></span>
            </div>
            <button type="button" data-composer-context-cancel aria-label="لغو">×</button>
          </div>

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
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,audio/webm,audio/ogg,audio/mpeg,audio/mp4,audio/wav"
              hidden
            />


            <button
              class="ai-chat-record-button"
              type="button"
              data-record-button
              aria-label="ضبط پیام صوتی"
              title="پیام صوتی"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="1.8" />
                <path d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V21M9 21h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </button>

            <div class="ai-chat-emoji-wrap">
              <button class="ai-chat-emoji-button" type="button" data-emoji-button aria-label="انتخاب ایموجی" title="ایموجی">😊</button>
              <div class="ai-chat-emoji-picker" data-emoji-picker></div>
            </div>

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
            <span class="ai-chat-upload-hint">فایل ۳ مگابایت · صوت ۱۰ مگابایت</span>
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
    recordButton: shadow.querySelector("[data-record-button]"),
    emojiButton: shadow.querySelector("[data-emoji-button]"),
    emojiPicker: shadow.querySelector("[data-emoji-picker]"),
    composerContext: shadow.querySelector("[data-composer-context]"),
    composerContextTitle: shadow.querySelector("[data-composer-context-title]"),
    composerContextText: shadow.querySelector("[data-composer-context-text]"),
    composerContextCancel: shadow.querySelector("[data-composer-context-cancel]"),
  };

  elements.emojiPicker.innerHTML = QUICK_EMOJIS.map(function (emoji) {
    return `<button type="button" data-compose-emoji="${emoji}">${emoji}</button>`;
  }).join("");

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
    elements.recordButton.addEventListener("click", toggleVoiceRecording);
    elements.emojiButton.addEventListener("click", function () {
      elements.emojiPicker.classList.toggle("show");
    });
    elements.emojiPicker.addEventListener("click", function (event) {
      const button = event.target.closest?.("[data-compose-emoji]");
      if (!button) return;
      insertEmojiAtCursor(button.dataset.composeEmoji || "");
      elements.emojiPicker.classList.remove("show");
    });
    elements.composerContextCancel.addEventListener("click", clearComposerContext);
    elements.body.addEventListener("click", handleMessageActionClick);

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

    window.addEventListener("beforeunload", function () {
      stopPolling();
      cleanupVoiceRecording();
    });
  }

  function insertEmojiAtCursor(emoji) {
    if (!emoji) return;
    const input = elements.messageInput;
    const start = typeof input.selectionStart === "number" ? input.selectionStart : input.value.length;
    const end = typeof input.selectionEnd === "number" ? input.selectionEnd : input.value.length;
    input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
    input.selectionStart = input.selectionEnd = start + emoji.length;
    autoResizeTextarea(input);
    input.focus();
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

    unreadAgentMessageCount = 0;
    updateUnreadState();
    scrollToBottom();
    if (visitor && conversation) {
      loadMessages().catch(function (error) {
        console.warn("AI Chat Widget read receipt failed:", error);
      });
    }

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

    const departments = Array.isArray(siteConfig?.departments) ? siteConfig.departments : [];
    const showDepartmentSelect = Boolean(siteConfig?.department_selection_enabled) && departments.length > 1;
    const defaultDepartmentId = Number(siteConfig?.default_department_id || departments.find((item) => item.is_default)?.id || departments[0]?.id || 0);
    const departmentField = showDepartmentSelect ? `
          <label class="ai-chat-field">
            <span class="ai-chat-label">موضوع گفتگو</span>
            <select class="ai-chat-input" data-department-input name="department_id">
              ${departments.map((department) => `<option value="${Number(department.id)}" ${Number(department.id) === defaultDepartmentId ? "selected" : ""}>${escapeHtml(department.name)}</option>`).join("")}
            </select>
          </label>
        ` : `<input type="hidden" data-department-input value="${defaultDepartmentId || ""}" />`;

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

          ${departmentField}

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
    const departmentInput = shadow.querySelector("[data-department-input]");
    const startButton = shadow.querySelector("[data-start-button]");
    const startButtonText = shadow.querySelector("[data-start-button-text]");

    const name = nameInput?.value.trim() || "";
    const phone = phoneInput?.value.trim() || "";
    const email = emailInput?.value.trim() || "";
    const firstMessage = firstMessageInput?.value.trim() || "";
    const departmentId = Number(departmentInput?.value || 0);

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

      conversation = await startConversation(visitor.id, departmentId);
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

  async function startConversation(visitorId, departmentId = 0) {
    const data = await fetchJson(`${apiBase}/widget/conversation-start.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        site_key: siteKey,
        visitor_id: visitorId,
        department_id: departmentId || null,
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
      <div class="ai-chat-routing-status" data-routing-status role="status"></div>
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
    renderRoutingStatus(conversation);
    autoResizeTextarea(elements.messageInput);
    scrollToBottom();
  }

  function renderRoutingStatus(currentConversation) {
    const box = shadow.querySelector("[data-routing-status]");
    if (!box || !currentConversation) return;
    const departmentName = currentConversation.department?.name || "پشتیبانی";
    if (currentConversation.queue_status === "waiting") {
      const position = currentConversation.queue_position ? `شماره ${currentConversation.queue_position}` : "در انتظار";
      box.className = "ai-chat-routing-status show";
      box.innerHTML = `<span class="ai-chat-routing-dot"></span><span>${escapeHtml(currentConversation.queue_message || `گفتگوی شما در صف ${departmentName} قرار گرفت.`)} <strong>${escapeHtml(position)}</strong></span>`;
      return;
    }
    if (currentConversation.assigned_agent) {
      box.className = "ai-chat-routing-status show assigned";
      box.innerHTML = `<span class="ai-chat-routing-dot"></span><span>گفتگو به ${escapeHtml(currentConversation.assigned_agent.name || "پشتیبان")} در دپارتمان ${escapeHtml(departmentName)} اختصاص داده شد.</span>`;
      return;
    }
    box.className = "ai-chat-routing-status";
    box.innerHTML = "";
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

      if (editingMessage) {
        await updateVisitorMessage(editingMessage.id, content);
        clearComposerContext();
      } else {
        await sendVisitorMessage(content);
        clearComposerContext();
      }
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

    const normalizedFileType = String(file.type || "").split(";", 1)[0].toLowerCase();
    const isAudio = normalizedFileType.startsWith("audio/") || normalizedFileType === "video/webm";
    const maxSize = isAudio ? MAX_AUDIO_UPLOAD_SIZE : MAX_UPLOAD_SIZE;

    if (file.size > maxSize) {
      renderInlineError(isAudio ? "حجم پیام صوتی باید کمتر از ۱۰ مگابایت باشد." : "حجم فایل باید کمتر از ۳ مگابایت باشد.");
      event.target.value = "";
      return;
    }

    if (!ALLOWED_UPLOAD_TYPES.has(normalizedFileType) && normalizedFileType !== "video/webm") {
      renderInlineError("فقط تصویر، PDF یا فایل صوتی با فرمت مجاز قابل ارسال است.");
      event.target.value = "";
      return;
    }

    const currentText = elements.messageInput.value.trim();

    try {
      setSendingState(true);
      clearInlineError();

      await sendVisitorAttachment(file, currentText, isAudio ? "voice" : "file");

      elements.messageInput.value = "";
      elements.fileInput.value = "";
      autoResizeTextarea(elements.messageInput);
      clearComposerContext();
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
    const mimeType = String(attachment?.mime_type || "");
    const isImage = mimeType.startsWith("image/");
    const isAudio = mimeType.startsWith("audio/");

    if (isAudio) {
      const audio = document.createElement("audio");
      audio.className = "ai-chat-audio";
      audio.controls = true;
      audio.preload = "metadata";
      audio.src = fileUrl;
      wrapper.appendChild(audio);
      return wrapper;
    }

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

  async function sendVisitorAttachment(file, content, messageType = "file") {
    const formData = new FormData();

    formData.append("site_key", siteKey);
    formData.append("visitor_id", String(visitor.id));
    formData.append("conversation_id", String(conversation.id));
    formData.append("reply_to_message_id", String(replyingToMessage?.id || 0));
    formData.append("message_type", messageType);
    formData.append("content", content || (messageType === "voice" ? "پیام صوتی" : "فایل ارسال شد."));
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
        reply_to_message_id: replyingToMessage?.id || null,
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
        `&after_id=${encodeURIComponent(lastMessageId)}` +
        `&changed_after=${encodeURIComponent(lastMessageSyncAt)}` +
        `&mark_read=${isOpen && !document.hidden ? "1" : "0"}`;

    const data = await fetchJson(url);

    if (!data.success) {
      throw new Error(data.message || "Failed to load messages");
    }

    if (data.conversation) {
      conversation = { ...conversation, ...data.conversation };
      writeStorageJson(STORAGE_KEYS.conversation, conversation);
      renderRoutingStatus(conversation);
    }

    if (Array.isArray(data.messages) && data.messages.length > 0) {
      appendMessages(data.messages);
    }

    if (data.server_time) {
      lastMessageSyncAt = data.server_time;
    }
  }

  function appendMessages(messages) {
    const messagesContainer = shadow.querySelector("[data-messages]");

    if (!messagesContainer) {
      return;
    }

    let newUnreadInBatch = 0;

    for (const message of messages) {
      const messageId = Number(message?.id || 0);

      if (!messageId) {
        continue;
      }

      const existing = messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
      const senderType = normalizeSenderType(message?.sender_type);
      const isAgentSide = ["agent", "ai", "system"].includes(senderType);

      if (!existing && isAgentSide && !isOpen) {
        unreadAgentMessageCount += 1;
        newUnreadInBatch += 1;
      }

      messageCache.set(messageId, message);
      const row = buildMessageRow(message);

      if (existing) {
        existing.replaceWith(row);
      } else {
        messagesContainer.appendChild(row);
      }

      lastMessageId = Math.max(lastMessageId, messageId);
    }

    if (newUnreadInBatch > 0) {
      playIncomingMessageSound();
    }

    updateUnreadState();
    hideTyping();
    if (isOpen) {
      scrollToBottom();
    }
  }

  function buildMessageRow(message) {
    const messageId = Number(message?.id || 0);
    const senderType = normalizeSenderType(message?.sender_type);
    const row = document.createElement("div");
    row.className = `ai-chat-message-row ${senderType}`;
    row.dataset.messageId = String(messageId);

    if (senderType === "agent" || senderType === "ai") {
      row.appendChild(createMiniAvatar());
    }

    const messageElement = document.createElement("div");
    messageElement.className = `ai-chat-message ${senderType}${message?.is_deleted ? " deleted" : ""}`;

    if (message?.reply_to) {
      const preview = document.createElement("div");
      preview.className = "ai-chat-reply-preview";
      const previewTitle = document.createElement("strong");
      previewTitle.textContent = String(message.reply_to.sender_name || "پیام قبلی");
      const previewText = document.createElement("span");
      previewText.textContent = String(message.reply_to.content || "");
      preview.append(previewTitle, previewText);
      messageElement.appendChild(preview);
    }

    const text = document.createElement("div");
    text.textContent = String(message?.content || "");
    messageElement.appendChild(text);

    if (!message?.is_deleted && Array.isArray(message?.attachments)) {
      for (const attachment of message.attachments) {
        messageElement.appendChild(renderWidgetAttachment(attachment));
      }
    }

    if (!message?.is_deleted) {
      const reactions = document.createElement("div");
      reactions.className = "ai-chat-reactions";

      if (Array.isArray(message?.reactions)) {
        for (const reaction of message.reactions) {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = `ai-chat-reaction-chip${reaction?.mine ? " mine" : ""}`;
          chip.dataset.messageReaction = String(reaction?.emoji || "");
          chip.dataset.messageId = String(messageId);
          chip.innerHTML = `${escapeHtml(String(reaction?.emoji || ""))}<span>${Number(reaction?.count || 0)}</span>`;
          reactions.appendChild(chip);
        }
      }

      const options = document.createElement("div");
      options.className = "ai-chat-reaction-options";
      for (const emoji of REACTION_EMOJIS) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "ai-chat-reaction-option";
        option.dataset.messageReaction = emoji;
        option.dataset.messageId = String(messageId);
        option.textContent = emoji;
        options.appendChild(option);
      }
      reactions.appendChild(options);
      messageElement.appendChild(reactions);
    }

    const meta = document.createElement("div");
    meta.className = "ai-chat-message-meta-row";

    const actions = document.createElement("div");
    actions.className = "ai-chat-message-actions";

    if (!message?.is_deleted) {
      actions.appendChild(createMessageAction("reply", messageId, "پاسخ"));
    }
    if (message?.can_edit) {
      actions.appendChild(createMessageAction("edit", messageId, "ویرایش"));
    }
    if (message?.can_delete) {
      actions.appendChild(createMessageAction("delete", messageId, "حذف"));
    }

    const time = document.createElement("div");
    time.className = "ai-chat-message-time";
    const receiptLabel = senderType === "visitor" && !message?.is_deleted
        ? message?.delivery_status === "read"
            ? " · خوانده شد ✓✓"
            : message?.delivery_status === "delivered"
                ? " · تحویل شد ✓✓"
                : " · ارسال شد ✓"
        : "";
    time.textContent = `${formatMessageTime(message?.created_at)}${message?.is_edited && !message?.is_deleted ? " · ویرایش‌شده" : ""}${message?.is_deleted ? " · حذف‌شده" : ""}${receiptLabel}`;

    meta.append(actions, time);
    messageElement.appendChild(meta);
    row.appendChild(messageElement);
    return row;
  }

  function createMessageAction(action, messageId, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ai-chat-message-action";
    button.dataset.messageAction = action;
    button.dataset.messageId = String(messageId);
    button.textContent = label;
    return button;
  }

  function handleMessageActionClick(event) {
    const reactionButton = event.target.closest?.("[data-message-reaction]");
    if (reactionButton) {
      const messageId = Number(reactionButton.dataset.messageId || 0);
      const emoji = reactionButton.dataset.messageReaction || "";
      toggleVisitorReaction(messageId, emoji);
      return;
    }

    const button = event.target.closest?.("[data-message-action]");

    if (!button) {
      return;
    }

    const messageId = Number(button.dataset.messageId || 0);
    const action = button.dataset.messageAction;
    const message = messageCache.get(messageId);

    if (!message) {
      return;
    }

    if (action === "reply") {
      editingMessage = null;
      replyingToMessage = message;
      elements.fileButton.disabled = isSending || !visitor || !conversation;
      elements.recordButton.disabled = isSending || !visitor || !conversation;
      elements.messageInput.value = "";
      showComposerContext("پاسخ به پیام", message.content);
      elements.messageInput.focus();
      return;
    }

    if (action === "edit" && message.can_edit) {
      replyingToMessage = null;
      editingMessage = message;
      elements.fileButton.disabled = true;
      elements.recordButton.disabled = true;
      elements.messageInput.value = String(message.content || "");
      autoResizeTextarea(elements.messageInput);
      showComposerContext("ویرایش پیام", message.content);
      elements.messageInput.focus();
      return;
    }

    if (action === "delete" && message.can_delete) {
      deleteVisitorMessage(messageId);
    }
  }

  function showComposerContext(title, text) {
    elements.composerContextTitle.textContent = title;
    elements.composerContextText.textContent = String(text || "").slice(0, 180);
    elements.composerContext.classList.add("show");
  }

  function clearComposerContext() {
    replyingToMessage = null;
    editingMessage = null;
    elements.composerContext.classList.remove("show");
    elements.composerContextText.textContent = "";
    elements.messageInput.value = "";
    autoResizeTextarea(elements.messageInput);
    const canCompose = Boolean(visitor && conversation);
    elements.fileButton.disabled = isSending || !canCompose;
    elements.recordButton.disabled = isSending || !canCompose;
  }

  async function toggleVisitorReaction(messageId, emoji) {
    if (!visitor || !conversation || !messageId || !emoji) return;

    try {
      const data = await fetchJson(`${apiBase}/widget/message-reaction-toggle.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_key: siteKey,
          visitor_id: visitor.id,
          conversation_id: conversation.id,
          message_id: messageId,
          emoji: emoji,
        }),
      });

      if (!data.success) throw new Error(data.message || "Failed to update reaction");
      const cached = messageCache.get(messageId);
      if (cached) {
        appendMessages([{ ...cached, reactions: data.reactions || [] }]);
      }
    } catch (error) {
      console.error("AI Chat Widget reaction failed:", error);
      renderInlineError("ثبت واکنش انجام نشد.");
    }
  }

  async function updateVisitorMessage(messageId, content) {
    const data = await fetchJson(`${apiBase}/widget/message-update.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_key: siteKey,
        visitor_id: visitor.id,
        conversation_id: conversation.id,
        message_id: messageId,
        content,
      }),
    });

    if (!data.success) {
      throw new Error(data.message || "Failed to update message");
    }

    const cached = messageCache.get(messageId);
    if (cached) {
      appendMessages([{ ...cached, content, is_edited: true, edited_at: data.data?.edited_at || new Date().toISOString() }]);
    }
  }

  async function deleteVisitorMessage(messageId) {
    if (!window.confirm("این پیام حذف شود؟")) {
      return;
    }

    try {
      setSendingState(true);
      clearInlineError();
      const data = await fetchJson(`${apiBase}/widget/message-delete.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_key: siteKey,
          visitor_id: visitor.id,
          conversation_id: conversation.id,
          message_id: messageId,
        }),
      });

      if (!data.success) {
        throw new Error(data.message || "Failed to delete message");
      }

      const cached = messageCache.get(messageId);
      if (cached) {
        appendMessages([{
          ...cached,
          content: "این پیام حذف شده است.",
          is_deleted: true,
          deleted_at: data.data?.deleted_at || new Date().toISOString(),
          can_edit: false,
          can_delete: false,
          attachments: [],
        }]);
      }

      if (editingMessage?.id === messageId || replyingToMessage?.id === messageId) {
        clearComposerContext();
      }
    } catch (error) {
      renderInlineError("حذف پیام با خطا مواجه شد.");
      console.error("AI Chat Widget delete message failed:", error);
    } finally {
      setSendingState(false);
    }
  }

  async function toggleVoiceRecording() {
    if (mediaRecorder?.state === "recording") {
      mediaRecorder.stop();
      return;
    }

    if (editingMessage) {
      renderInlineError("هنگام ویرایش پیام امکان ضبط صدا وجود ندارد.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      renderInlineError("مرورگر شما ضبط پیام صوتی را پشتیبانی نمی‌کند.");
      return;
    }

    try {
      clearInlineError();
      recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
      mediaRecorder = mimeType ? new MediaRecorder(recordingStream, { mimeType }) : new MediaRecorder(recordingStream);
      recordingChunks = [];
      recordingSeconds = 0;

      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          recordingChunks.push(event.data);
        }
      });

      mediaRecorder.addEventListener("stop", async () => {
        const type = mediaRecorder?.mimeType || "audio/webm";
        const extension = type.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(recordingChunks, { type });
        cleanupVoiceRecording();

        if (!blob.size) {
          renderInlineError("صدایی ضبط نشد.");
          return;
        }

        if (blob.size > MAX_AUDIO_UPLOAD_SIZE) {
          renderInlineError("حجم پیام صوتی باید کمتر از ۱۰ مگابایت باشد.");
          return;
        }

        try {
          setSendingState(true);
          const file = new File([blob], `voice-${Date.now()}.${extension}`, { type });
          await sendVisitorAttachment(file, elements.messageInput.value.trim(), "voice");
          elements.messageInput.value = "";
          clearComposerContext();
          await loadMessages();
        } catch (error) {
          renderInlineError("ارسال پیام صوتی با خطا مواجه شد.");
          console.error("AI Chat Widget voice upload failed:", error);
        } finally {
          setSendingState(false);
        }
      });

      mediaRecorder.start(500);
      elements.recordButton.classList.add("recording");
      elements.recordButton.title = "توقف ضبط";
      recordingTimer = window.setInterval(() => {
        recordingSeconds += 1;
        elements.recordButton.setAttribute("aria-label", `توقف ضبط، ${recordingSeconds} ثانیه`);
        if (recordingSeconds >= 120 && mediaRecorder?.state === "recording") {
          mediaRecorder.stop();
        }
      }, 1000);
    } catch (error) {
      cleanupVoiceRecording();
      renderInlineError("دسترسی به میکروفن داده نشد.");
      console.error("AI Chat Widget microphone failed:", error);
    }
  }

  function cleanupVoiceRecording() {
    if (recordingTimer) {
      window.clearInterval(recordingTimer);
      recordingTimer = null;
    }
    recordingStream?.getTracks().forEach((track) => track.stop());
    recordingStream = null;
    mediaRecorder = null;
    recordingChunks = [];
    recordingSeconds = 0;
    elements.recordButton?.classList.remove("recording");
    elements.recordButton?.setAttribute("aria-label", "ضبط پیام صوتی");
    if (elements.recordButton) {
      elements.recordButton.title = "پیام صوتی";
    }
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
    lastMessageSyncAt = "";
    unreadAgentMessageCount = 0;
    messageCache.clear();
    clearComposerContext();
    cleanupVoiceRecording();
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
    elements.fileButton.disabled = !active || isSending || Boolean(editingMessage);
    elements.recordButton.disabled = !active || isSending || Boolean(editingMessage);
    elements.emojiButton.disabled = !active || isSending;
    if (!active) {
      elements.emojiPicker.classList.remove("show");
    }
    elements.sendButton.disabled = !active || isSending;
    elements.messageInput.disabled = !active || isSending;
  }

  function setSendingState(active) {
    isSending = active;
    elements.sendButton.disabled = active;
    elements.fileButton.disabled = active || Boolean(editingMessage);
    elements.recordButton.disabled = active || Boolean(editingMessage);
    elements.emojiButton.disabled = active;
    if (active) {
      elements.emojiPicker.classList.remove("show");
    }
    elements.messageInput.disabled = active;
  }

  function setStartButtonLoading(button, textElement, active) {
    if (!button || !textElement) {
      return;
    }

    button.disabled = active;
    textElement.textContent = active ? "در حال شروع گفتگو..." : "شروع گفتگو";
  }


  function playIncomingMessageSound() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(720, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(960, context.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
      oscillator.addEventListener("ended", function () { context.close().catch(function () {}); });
    } catch (_) {
      // Browser autoplay rules may block sound until the visitor interacts with the page.
    }
  }

  function updateUnreadState() {
    const hasUnread = unreadAgentMessageCount > 0;
    elements.unread.textContent = String(Math.min(unreadAgentMessageCount, 99));
    elements.unread.classList.toggle("show", hasUnread);
    elements.button.classList.toggle("has-unread", hasUnread);
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
