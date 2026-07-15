// مسیر فایل: ai-chat-saas/frontend/app/login/page.tsx
// هدف: صفحه ورود مدرن برای پنل

"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, saveAuth } from "@/lib/api";

export default function LoginPage() {
    const router = useRouter();

    const [email, setEmail] = useState("admin-test@example.com");
    const [password, setPassword] = useState("12345678");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setError("");
        setLoading(true);

        try {
            const data = await apiRequest("/auth/login.php", {
                method: "POST",
                auth: false,
                body: JSON.stringify({
                    email,
                    password,
                }),
            });

            saveAuth(data.token, data.user);

            if (data.user.role === "super_admin") {
                router.push("/super-admin/dashboard");
            } else {
                router.push("/dashboard");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "ورود ناموفق بود");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="auth-page">
            <div className="auth-shell">
                <section className="card auth-hero">
                    <div>
                        <div className="auth-logo">AI</div>

                        <h1 className="auth-title">
                            پنل هوشمند مدیریت چت، پشتیبانی و ارتباط با مشتری
                        </h1>

                        <p className="muted" style={{ maxWidth: 560 }}>
                            گفتگوهای سایت را مدیریت کن، پاسخ‌ها را سریع‌تر بده و در ادامه
                            با کمک هوش مصنوعی پشتیبانی را حرفه‌ای‌تر کن.
                        </p>

                        <div style={{ marginTop: 24 }}>
                            <span className="feature-pill">چت آنلاین</span>
                            <span className="feature-pill">پنل پشتیبان</span>
                            <span className="feature-pill">مدیریت مشتری‌ها</span>
                            <span className="feature-pill">آماده برای AI</span>
                        </div>
                    </div>

                    <div className="card-solid" style={{ padding: 18, maxWidth: 520 }}>
                        <strong>وضعیت MVP</strong>
                        <p className="muted" style={{ marginBottom: 0 }}>
                            ویجت، گفتگوها، پاسخ پشتیبان، سوپر ادمین و ساخت مشتری فعال شده‌اند.
                        </p>
                    </div>
                </section>

                <section className="card auth-form">
                    <h2 style={{ marginTop: 0, fontSize: 28 }}>ورود به پنل</h2>

                    <p className="muted">
                        با حساب سوپر ادمین، مدیر مشتری یا پشتیبان وارد شوید.
                    </p>

                    {error && <div className="error">{error}</div>}

                    <form onSubmit={handleSubmit} className="grid" style={{ marginTop: 22 }}>
                        <label className="grid">
                            <span>ایمیل</span>
                            <input
                                className="input"
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="email@example.com"
                            />
                        </label>

                        <label className="grid">
                            <span>رمز عبور</span>
                            <input
                                className="input"
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="********"
                            />
                        </label>

                        <button className="btn" type="submit" disabled={loading}>
                            {loading ? "در حال ورود..." : "ورود به پنل"}
                        </button>
                    </form>

                    <div
                        className="muted"
                        style={{
                            marginTop: 22,
                            paddingTop: 18,
                            borderTop: "1px solid var(--border)",
                        }}
                    >
                        برای تست می‌توانی از حساب‌هایی که قبلاً ساختی استفاده کنی.
                    </div>
                </section>
            </div>
        </main>
    );
}