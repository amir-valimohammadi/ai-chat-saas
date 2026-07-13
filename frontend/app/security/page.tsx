// مسیر فایل: ai-chat-saas/frontend/app/security/page.tsx
// هدف: صفحه تنظیمات امنیتی کاربر شامل تغییر رمز و خروج از همه دستگاه‌ها

"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import {
    changePassword,
    getAuthUser,
    logoutAllDevices,
} from "@/lib/api";

export default function SecurityPage() {
    const router = useRouter();

    const [user, setUser] = useState<any>(null);

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");

    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);

    useEffect(() => {
        const authUser = getAuthUser();

        if (!authUser) {
            router.push("/login");
            return;
        }

        setUser(authUser);
    }, [router]);

    async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setMessage("");
        setError("");

        if (!currentPassword || !newPassword || !newPasswordConfirmation) {
            setError("لطفاً همه فیلدها را کامل وارد کنید.");
            return;
        }

        if (newPassword.length < 8) {
            setError("رمز جدید باید حداقل ۸ کاراکتر باشد.");
            return;
        }

        if (newPassword !== newPasswordConfirmation) {
            setError("تکرار رمز جدید با رمز جدید یکسان نیست.");
            return;
        }

        try {
            setIsChangingPassword(true);

            await changePassword({
                current_password: currentPassword,
                new_password: newPassword,
                new_password_confirmation: newPasswordConfirmation,
            });

            setMessage("رمز عبور با موفقیت تغییر کرد. لطفاً دوباره وارد شوید.");

            window.setTimeout(() => {
                router.push("/login");
            }, 900);
        } catch (err: any) {
            setError(err?.message || "تغییر رمز عبور ناموفق بود.");
        } finally {
            setIsChangingPassword(false);
        }
    }

    async function handleLogoutAllDevices() {
        setMessage("");
        setError("");

        const confirmed = window.confirm(
            "آیا مطمئن هستید؟ با این کار از همه دستگاه‌ها خارج می‌شوید و باید دوباره وارد شوید."
        );

        if (!confirmed) {
            return;
        }

        try {
            setIsLoggingOutAll(true);

            await logoutAllDevices();

            setMessage("همه نشست‌ها با موفقیت باطل شدند. لطفاً دوباره وارد شوید.");

            window.setTimeout(() => {
                router.push("/login");
            }, 900);
        } catch (err: any) {
            setError(err?.message || "خروج از همه دستگاه‌ها ناموفق بود.");
        } finally {
            setIsLoggingOutAll(false);
        }
    }

    if (!user) {
        return (
            <main className="page">
                <div className="container">در حال بارگذاری...</div>
            </main>
        );
    }

    return (
        <AppShell
            title="تنظیمات امنیتی"
            kicker="Security"
            description="مدیریت رمز عبور، نشست‌ها و امنیت حساب کاربری"
        >
            <div className="security-layout">
                <section className="security-main-card">
                    <div className="security-card-head">
                        <div>
                            <span className="security-eyebrow">Password</span>
                            <h2>تغییر رمز عبور</h2>
                            <p>
                                برای افزایش امنیت حساب، رمز عبور قوی انتخاب کنید. بعد از تغییر
                                رمز، همه توکن‌های قبلی باطل می‌شوند و باید دوباره وارد شوید.
                            </p>
                        </div>

                        <div className="security-lock-icon">🔐</div>
                    </div>

                    {message && <div className="success">{message}</div>}
                    {error && <div className="error">{error}</div>}

                    <form className="security-form" onSubmit={handleChangePassword}>
                        <label>
                            <span>رمز عبور فعلی</span>
                            <input
                                className="input"
                                type="password"
                                autoComplete="current-password"
                                value={currentPassword}
                                onChange={(event) => setCurrentPassword(event.target.value)}
                                placeholder="رمز فعلی را وارد کنید"
                            />
                        </label>

                        <label>
                            <span>رمز عبور جدید</span>
                            <input
                                className="input"
                                type="password"
                                autoComplete="new-password"
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                placeholder="حداقل ۸ کاراکتر، شامل حرف و عدد"
                            />
                        </label>

                        <label>
                            <span>تکرار رمز عبور جدید</span>
                            <input
                                className="input"
                                type="password"
                                autoComplete="new-password"
                                value={newPasswordConfirmation}
                                onChange={(event) =>
                                    setNewPasswordConfirmation(event.target.value)
                                }
                                placeholder="رمز جدید را دوباره وارد کنید"
                            />
                        </label>

                        <button
                            className="btn"
                            type="submit"
                            disabled={isChangingPassword}
                        >
                            {isChangingPassword ? "در حال تغییر رمز..." : "تغییر رمز عبور"}
                        </button>
                    </form>
                </section>

                <aside className="security-side">
                    <section className="security-side-card danger-zone">
                        <span className="security-eyebrow danger">Sessions</span>
                        <h3>خروج از همه دستگاه‌ها</h3>
                        <p>
                            اگر فکر می‌کنید کسی به حساب شما دسترسی دارد، با این گزینه همه
                            نشست‌های فعال باطل می‌شوند.
                        </p>

                        <button
                            className="btn danger"
                            type="button"
                            disabled={isLoggingOutAll}
                            onClick={handleLogoutAllDevices}
                        >
                            {isLoggingOutAll
                                ? "در حال خروج..."
                                : "خروج از همه دستگاه‌ها"}
                        </button>
                    </section>

                    <section className="security-side-card">
                        <span className="security-eyebrow">Account</span>
                        <h3>اطلاعات حساب</h3>

                        <div className="security-info-list">
                            <div>
                                <span>نام</span>
                                <strong>{user.name || "—"}</strong>
                            </div>

                            <div>
                                <span>ایمیل</span>
                                <strong>{user.email || "—"}</strong>
                            </div>

                            <div>
                                <span>نقش</span>
                                <strong>{user.role || "—"}</strong>
                            </div>
                        </div>
                    </section>

                    <section className="security-side-card soft">
                        <h3>پیشنهاد امنیتی</h3>
                        <p>
                            رمز عبور را در مرورگرهای عمومی ذخیره نکنید، از رمز تکراری استفاده
                            نکنید و بعد از کار روی سیستم‌های مشترک حتماً خارج شوید.
                        </p>
                    </section>
                </aside>
            </div>
        </AppShell>
    );
}