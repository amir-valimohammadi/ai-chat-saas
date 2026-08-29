"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, saveAuth } from "@/lib/api";
import styles from "@/styles/login-two-factor.module.css";

function EyeIcon({ visible }: { visible: boolean }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {visible ? <><path d="M3 3l18 18"/><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7"/><path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c6.3 0 9 8 9 8a15.6 15.6 0 0 1-2 3.5M6.6 6.6C4.1 8.3 3 12 3 12s2.7 8 9 8a9.7 9.7 0 0 0 5.4-1.6"/></> : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>}
        </svg>
    );
}

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [challengeToken, setChallengeToken] = useState("");
    const [twoFactorCode, setTwoFactorCode] = useState("");

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setLoading(true);

        try {
            const data = challengeToken
                ? await apiRequest("/auth/verify-2fa.php", {
                    method: "POST",
                    auth: false,
                    body: JSON.stringify({
                        challenge_token: challengeToken,
                        code: twoFactorCode.trim(),
                    }),
                })
                : await apiRequest("/auth/login.php", {
                    method: "POST",
                    auth: false,
                    body: JSON.stringify({ email: email.trim(), password }),
                });

            if (data.requires_2fa) {
                setChallengeToken(data.challenge_token);
                setTwoFactorCode("");
                return;
            }

            saveAuth(data.user, data.csrf_token);
            if (data.user.must_change_password) {
                router.push("/security?required=1");
                return;
            }
            router.push(data.user.role === "super_admin" ? "/super-admin/dashboard" : "/dashboard");
        } catch (err) {
            setError(err instanceof Error ? err.message : "ورود ناموفق بود. اطلاعات را دوباره بررسی کنید.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="login-v2-page">
            <div className="login-v2-grid" aria-hidden="true" />
            <div className="login-v2-glow login-v2-glow--one" aria-hidden="true" />
            <div className="login-v2-glow login-v2-glow--two" aria-hidden="true" />

            <Link href="/" className="login-v2-back">
                <span>←</span>
                بازگشت به معرفی محصول
            </Link>

            <div className="login-v2-shell">
                <section className="login-v2-showcase">
                    <div className="login-v2-brand">
                        <span>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l1.2 4.1L17 9l-3.8 1.9L12 15l-1.2-4.1L7 9l3.8-1.9L12 3Z"/><path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/></svg>
                        </span>
                        <div><strong>AI Chat</strong><small>SaaS Platform</small></div>
                    </div>

                    <div className="login-v2-copy">
                        <span className="login-v2-badge"><i/> دسترسی امن به فضای کاری</span>
                        <h1>همه گفت‌وگوها، دانش سایت و تیم پشتیبانی در یک پنل</h1>
                        <p>وارد فضای کاری خود شوید و ویجت‌ها، مکالمات، پایگاه دانش، خزش سایت و گزارش‌های محصول را مدیریت کنید.</p>
                    </div>

                    <div className="login-v2-product-preview">
                        <div className="login-v2-preview-head"><span><i/><i/><i/></span><b>Workspace Overview</b><small>Online</small></div>
                        <div className="login-v2-preview-body">
                            <aside><span/><span className="active"/><span/><span/><span/></aside>
                            <div className="login-v2-preview-main">
                                <div className="login-v2-preview-title"><span><small>گفت‌وگوهای امروز</small><strong>مرکز پشتیبانی</strong></span><b>+۱۲ پیام</b></div>
                                <div className="login-v2-preview-stats"><span><b>۲۴</b><small>گفت‌وگوی فعال</small></span><span><b>۹۲٪</b><small>اطمینان پاسخ</small></span><span><b>۵</b><small>سایت متصل</small></span></div>
                                <div className="login-v2-preview-row"><i>م</i><span><strong>مریم احمدی</strong><small>پاسخ از دانش سایت پیدا شد</small></span><b>اکنون</b></div>
                                <div className="login-v2-preview-row"><i>ع</i><span><strong>علی رضایی</strong><small>اختصاص داده شده به پشتیبان</small></span><b>۲ دقیقه</b></div>
                            </div>
                        </div>
                    </div>

                    <div className="login-v2-trust">
                        <span><b>✓</b> تفکیک کامل مشتری‌ها</span>
                        <span><b>✓</b> کنترل دسترسی نقش‌ها</span>
                        <span><b>✓</b> ثبت رخدادهای مدیریتی</span>
                    </div>
                </section>

                <section className="login-v2-form-panel">
                    <div className="login-v2-form-wrap">
                        <div className="login-v2-mobile-brand">
                            <span>AI</span><strong>AI Chat SaaS</strong>
                        </div>

                        <header>
                            <span className="login-v2-form-eyebrow">WELCOME BACK</span>
                            <h2>ورود به پنل</h2>
                            <p>اطلاعات حساب کاربری خود را وارد کنید.</p>
                        </header>

                        {error && (
                            <div className="login-v2-error" role="alert">
                                <span>!</span>
                                <p>{error}</p>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="login-v2-form">
                            {challengeToken ? (
                                <div className={styles.challengeBox}>
                                    <div className={styles.challengeIcon}>2FA</div>
                                    <div>
                                        <strong>تأیید ورود دومرحله‌ای</strong>
                                        <p>کد ۶ رقمی Authenticator یا یکی از کدهای بازیابی را وارد کنید.</p>
                                    </div>
                                </div>
                            ) : null}

                            {!challengeToken ? <>
                            <label>
                                <span>ایمیل</span>
                                <div className="login-v2-input-wrap">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        placeholder="name@company.com"
                                        autoComplete="email"
                                        required
                                        dir="ltr"
                                    />
                                </div>
                            </label>

                            <label>
                                <span>رمز عبور</span>
                                <div className="login-v2-input-wrap">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        placeholder="رمز عبور"
                                        autoComplete="current-password"
                                        required
                                    />
                                    <button type="button" className="login-v2-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "مخفی کردن رمز" : "نمایش رمز"}>
                                        <EyeIcon visible={showPassword}/>
                                    </button>
                                </div>
                            </label>

                            <div className="login-v2-form-meta">
                                <label className="login-v2-checkbox"><input type="checkbox"/><span/> مرا به خاطر بسپار</label>
                                <small>بازیابی رمز توسط مدیر سیستم</small>
                            </div>
                            </> : (
                                <label>
                                    <span>کد امنیتی</span>
                                    <div className="login-v2-input-wrap">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 5 6v5c0 4.7 2.8 8.2 7 10 4.2-1.8 7-5.3 7-10V6l-7-3Z"/><path d="m9.5 12 1.6 1.6 3.4-3.5"/></svg>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            value={twoFactorCode}
                                            onChange={(event) => setTwoFactorCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                                            placeholder="123456"
                                            required
                                            autoFocus
                                            dir="ltr"
                                            className={styles.codeInput}
                                        />
                                    </div>
                                    <button type="button" className={styles.backButton} onClick={() => { setChallengeToken(""); setTwoFactorCode(""); setError(""); }}>
                                        بازگشت و ورود با حساب دیگر
                                    </button>
                                </label>
                            )}

                            <button className="login-v2-submit" type="submit" disabled={loading}>
                                {loading ? <><i className="login-v2-spinner"/> در حال بررسی اطلاعات...</> : challengeToken ? <>تأیید و ورود <span>←</span></> : <>ورود به فضای کاری <span>←</span></>}
                            </button>
                        </form>

                        <div className="login-v2-role-box">
                            <span>دسترسی متناسب با نقش شما</span>
                            <div><b>سوپرادمین</b><b>مدیر مشتری</b><b>پشتیبان</b></div>
                        </div>

                        <footer>
                            <span className="login-v2-status-dot"/> سرویس ورود فعال است
                            <i/>
                            <span>نسخه امن پنل</span>
                        </footer>
                    </div>
                </section>
            </div>
        </main>
    );
}
