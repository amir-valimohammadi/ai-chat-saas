"use client";

import { useEffect } from "react";
import styles from "@/styles/maintenance-overlay.module.css";

type MaintenanceOverlayProps = {
    message: string;
    until?: string | null;
    onLogout: () => void;
};

function formatMaintenanceUntil(value?: string | null) {
    if (!value) {
        return null;
    }

    const date = new Date(value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return new Intl.DateTimeFormat("fa-IR", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

export default function MaintenanceOverlay({
    message,
    until,
    onLogout,
}: MaintenanceOverlayProps) {
    const formattedUntil = formatMaintenanceUntil(until);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        document.body.setAttribute("data-maintenance-active", "true");

        return () => {
            document.body.style.overflow = previousOverflow;
            document.body.removeAttribute("data-maintenance-active");
        };
    }, []);

    return (
        <div
            className={styles.overlay}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="maintenance-title"
            aria-describedby="maintenance-message"
        >
            <div className={styles.ambientOne} aria-hidden="true" />
            <div className={styles.ambientTwo} aria-hidden="true" />

            <section className={styles.card}>
                <div className={styles.iconWrap} aria-hidden="true">
                    <span className={styles.icon}>!</span>
                </div>

                <div className={styles.eyebrow}>حالت نگهداری فعال است</div>

                <h1 id="maintenance-title" className={styles.title}>
                    پنل موقتاً در دسترس نیست
                </h1>

                <p id="maintenance-message" className={styles.message}>
                    {message ||
                        "سامانه برای انجام عملیات نگهداری موقتاً در دسترس نیست."}
                </p>

                {formattedUntil && (
                    <div className={styles.until}>
                        <span>زمان تقریبی پایان</span>
                        <strong>{formattedUntil}</strong>
                    </div>
                )}

                <button
                    type="button"
                    className={styles.logoutButton}
                    onClick={onLogout}
                    autoFocus
                >
                    خروج از حساب
                </button>
            </section>
        </div>
    );
}
