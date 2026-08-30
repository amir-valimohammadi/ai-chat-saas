"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useApiEventStream } from "@/hooks/useApiEventStream";

type AutomationAlert = {
    id: number;
    conversation_id: number | null;
    severity: "info" | "warning" | "high" | "critical";
    title: string;
    message: string;
    is_read: boolean;
    site_name?: string | null;
    created_at: string;
};

type AlertPayload = { alerts?: AutomationAlert[]; unread_count?: number };

export default function AutomationAlertCenter() {
    const router = useRouter();
    const [alerts, setAlerts] = useState<AutomationAlert[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [toasts, setToasts] = useState<AutomationAlert[]>([]);
    const [open, setOpen] = useState(false);
    const initializedRef = useRef(false);
    const knownIdsRef = useRef<Set<number>>(new Set());

    const applyPayload = useCallback((payload: AlertPayload) => {
        const incoming = Array.isArray(payload.alerts) ? payload.alerts : [];
        const fresh = initializedRef.current
            ? incoming.filter((alert) => !alert.is_read && !knownIdsRef.current.has(alert.id))
            : [];

        incoming.forEach((alert) => knownIdsRef.current.add(alert.id));
        initializedRef.current = true;
        setAlerts(incoming);
        setUnreadCount(Math.max(0, Number(payload.unread_count || 0)));

        if (fresh.length > 0) {
            setToasts((current) => [...fresh, ...current].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 3));
            fresh.forEach((alert) => {
                window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== alert.id)), 9000);
            });
        }
    }, []);

    const loadAlerts = useCallback(async () => {
        try {
            const data = await apiRequest("/agent/automation-alerts.php", { cache: "no-store" }) as AlertPayload;
            applyPayload(data);
        } catch {
            // اعلان‌ها نباید نمایش سایر بخش‌های پنل را مختل کنند.
        }
    }, [applyPayload]);

    useEffect(() => {
        void loadAlerts();
    }, [loadAlerts]);

    useEffect(() => {
        if (!open) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [open]);

    useApiEventStream({
        path: "/agent/automation-alert-stream.php",
        enabled: true,
        fallbackIntervalMs: 7000,
        onEvent: (event) => {
            if (event.event === "automation.alerts") applyPayload((event.data || {}) as AlertPayload);
        },
        onFallbackTick: loadAlerts,
    });

    const markRead = useCallback(async (alertId = 0) => {
        if (alertId > 0) {
            const target = alerts.find((alert) => alert.id === alertId);
            if (target && !target.is_read) setUnreadCount((current) => Math.max(0, current - 1));
            setAlerts((current) => current.map((alert) => alert.id === alertId ? { ...alert, is_read: true } : alert));
            setToasts((current) => current.filter((alert) => alert.id !== alertId));
        } else {
            setUnreadCount(0);
            setAlerts((current) => current.map((alert) => ({ ...alert, is_read: true })));
            setToasts([]);
        }

        try {
            await apiRequest("/agent/automation-alert-read.php", {
                method: "POST",
                body: JSON.stringify({ alert_id: alertId || null }),
            });
        } catch {
            void loadAlerts();
        }
    }, [alerts, loadAlerts]);

    async function openAlert(alert: AutomationAlert) {
        await markRead(alert.id);
        setOpen(false);
        router.push(alert.conversation_id ? `/conversations/${alert.conversation_id}` : "/automations");
    }

    return <>
        <aside className={`automation-global-center ${open ? "is-open" : ""}`}>
            <button className="automation-global-trigger" type="button" onClick={() => setOpen((current) => !current)} aria-label={`${unreadCount} اعلان خوانده‌نشده`} aria-expanded={open}>
                <AlertBellIcon />
                {unreadCount > 0 && <b>{unreadCount > 99 ? "99+" : unreadCount.toLocaleString("fa-IR")}</b>}
            </button>

            {open && <section className="automation-global-popover" aria-label="اعلان‌های اتوماسیون">
                <header><div><span>Automation Alerts</span><strong>اعلان‌های هوشمند</strong></div>{unreadCount > 0 && <button type="button" onClick={() => markRead()}>خواندن همه</button>}</header>
                <div className="automation-global-list">
                    {alerts.length === 0 ? <div className="automation-global-empty"><span>✓</span><strong>اعلان تازه‌ای ندارید</strong><p>هشدارهای قوانین و SLA اینجا نمایش داده می‌شوند.</p></div> : alerts.map((alert) => <button type="button" key={alert.id} className={`severity-${alert.severity} ${alert.is_read ? "is-read" : ""}`} onClick={() => openAlert(alert)}>
                        <i /><div><strong>{alert.title}</strong><p>{alert.message}</p><small>{alert.site_name ? `${alert.site_name} · ` : ""}{formatAlertDate(alert.created_at)}</small></div>
                    </button>)}
                </div>
                <footer><button type="button" onClick={() => { setOpen(false); router.push("/automations"); }}>مشاهده مرکز اتوماسیون</button></footer>
            </section>}
        </aside>

        {toasts.length > 0 && <div className="automation-toast-stack" aria-live="polite">
            {toasts.map((alert) => <article key={alert.id} className={`severity-${alert.severity}`}>
                <button className="automation-toast-close" type="button" aria-label="بستن اعلان" onClick={() => markRead(alert.id)}>×</button>
                <span><AlertBellIcon /></span>
                <button className="automation-toast-content" type="button" onClick={() => openAlert(alert)}><strong>{alert.title}</strong><p>{alert.message}</p><small>{alert.conversation_id ? `رفتن به گفتگوی #${alert.conversation_id}` : "مشاهده جزئیات"}</small></button>
            </article>)}
        </div>}
    </>;
}

function AlertBellIcon() {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 14V9a7 7 0 0 1 14 0v5l2 3H3z" /><path d="M9 20h6" /></svg>;
}

function formatAlertDate(value: string) {
    try {
        return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value.replace(" ", "T")));
    } catch {
        return value;
    }
}
