"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/styles/qa-widget-host.module.css";

type HostParams = { siteKey: string; apiBase: string; widgetScript: string };

export default function QaWidgetHostPage() {
    const [params, setParams] = useState<HostParams>({ siteKey: "", apiBase: "", widgetScript: "" });
    const [status, setStatus] = useState("در حال آماده‌سازی میزبان تست…");
    const valid = useMemo(() => params.siteKey.length >= 16 && params.apiBase.startsWith("http") && params.widgetScript.startsWith("http"), [params]);

    useEffect(() => {
        const search = new URLSearchParams(window.location.search);
        setParams({
            siteKey: search.get("site_key") || "",
            apiBase: search.get("api_base") || "",
            widgetScript: search.get("widget_script") || "",
        });
    }, []);

    useEffect(() => {
        if (!params.siteKey && !params.apiBase && !params.widgetScript) return;
        if (!valid) {
            setStatus("پارامترهای تست ویجت ناقص هستند.");
            return;
        }
        const existing = document.querySelector<HTMLScriptElement>("script[data-qa-widget-host]");
        existing?.remove();
        document.getElementById("ai-chat-widget-root")?.remove();
        const script = document.createElement("script");
        script.src = params.widgetScript;
        script.defer = true;
        script.dataset.siteKey = params.siteKey;
        script.dataset.apiBase = params.apiBase;
        script.dataset.qaWidgetHost = "1";
        script.onload = () => setStatus("فایل ویجت بارگذاری شد.");
        script.onerror = () => setStatus("بارگذاری فایل ویجت ناموفق بود.");
        document.body.appendChild(script);
        return () => {
            script.remove();
            document.getElementById("ai-chat-widget-root")?.remove();
        };
    }, [params, valid]);

    return (
        <main className={styles.page}>
            <section className={styles.card}>
                <span className={styles.badge}>QA WIDGET HOST</span>
                <h1>میزبان ایزوله تست ویجت</h1>
                <p>این صفحه فقط برای اجرای خودکار تست مرورگری ویجت استفاده می‌شود و در موتورهای جست‌وجو ایندکس نمی‌شود.</p>
                <div className={styles.status} data-qa-widget-status>{status}</div>
            </section>
        </main>
    );
}
