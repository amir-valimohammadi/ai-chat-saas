"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";

export type MessageNotificationPreferences = {
    sound_enabled: boolean;
    browser_notifications_enabled: boolean;
    title_badge_enabled: boolean;
};

const defaultPreferences: MessageNotificationPreferences = {
    sound_enabled: true,
    browser_notifications_enabled: false,
    title_badge_enabled: true,
};

export function useMessageNotifications(baseTitle = "AI Chat SaaS Panel") {
    const [preferences, setPreferences] = useState(defaultPreferences);
    const [loading, setLoading] = useState(true);
    const baseTitleRef = useRef(baseTitle);
    const preferencesRef = useRef(defaultPreferences);

    useEffect(() => {
        baseTitleRef.current = baseTitle;
    }, [baseTitle]);

    useEffect(() => {
        preferencesRef.current = preferences;
    }, [preferences]);

    useEffect(() => {
        let cancelled = false;

        apiRequest("/agent/notification-preferences.php")
            .then((data) => {
                if (!cancelled && data.preferences) {
                    setPreferences({ ...defaultPreferences, ...data.preferences });
                }
            })
            .catch(() => {
                // Notification preferences must not break the inbox.
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
            if (typeof document !== "undefined") {
                document.title = baseTitleRef.current;
            }
        };
    }, []);

    const savePreferences = useCallback(async (next: MessageNotificationPreferences) => {
        setPreferences(next);
        try {
            const data = await apiRequest("/agent/notification-preferences.php", {
                method: "POST",
                body: JSON.stringify(next),
            });
            if (data.preferences) {
                setPreferences({ ...defaultPreferences, ...data.preferences });
            }
        } catch {
            // Keep optimistic preferences locally; the next load will reconcile them.
        }
    }, []);

    const toggleSound = useCallback(() => {
        return savePreferences({ ...preferences, sound_enabled: !preferences.sound_enabled });
    }, [preferences, savePreferences]);

    const enableBrowserNotifications = useCallback(async () => {
        if (typeof window === "undefined" || !("Notification" in window)) {
            return false;
        }

        let permission = Notification.permission;
        if (permission === "default") {
            permission = await Notification.requestPermission();
        }

        const enabled = permission === "granted";
        await savePreferences({
            ...preferences,
            browser_notifications_enabled: enabled,
        });
        return enabled;
    }, [preferences, savePreferences]);

    const toggleTitleBadge = useCallback(() => {
        return savePreferences({
            ...preferences,
            title_badge_enabled: !preferences.title_badge_enabled,
        });
    }, [preferences, savePreferences]);

    const playSound = useCallback(() => {
        if (!preferencesRef.current.sound_enabled || typeof window === "undefined") return;

        try {
            const AudioContextClass = window.AudioContext ||
                (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioContextClass) return;
            const context = new AudioContextClass();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(660, context.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(920, context.currentTime + 0.14);
            gain.gain.setValueAtTime(0.0001, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.09, context.currentTime + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.24);
            oscillator.addEventListener("ended", () => void context.close());
        } catch {
            // Autoplay restrictions can block sound before the first user interaction.
        }
    }, []);

    const setUnreadTitle = useCallback((unreadCount: number) => {
        if (typeof document === "undefined") return;
        document.title = preferencesRef.current.title_badge_enabled && unreadCount > 0
            ? `(${unreadCount}) ${baseTitleRef.current}`
            : baseTitleRef.current;
    }, []);

    const notify = useCallback((options: {
        title: string;
        body: string;
        tag?: string;
        unreadCount?: number;
    }) => {
        playSound();
        setUnreadTitle(options.unreadCount || 1);

        if (
            preferencesRef.current.browser_notifications_enabled &&
            typeof document !== "undefined" &&
            document.hidden &&
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
        ) {
            const notification = new Notification(options.title, {
                body: options.body,
                tag: options.tag,
            });
            window.setTimeout(() => notification.close(), 8000);
        }
    }, [playSound, setUnreadTitle]);

    return {
        preferences,
        loading,
        toggleSound,
        enableBrowserNotifications,
        toggleTitleBadge,
        setUnreadTitle,
        notify,
    };
}
