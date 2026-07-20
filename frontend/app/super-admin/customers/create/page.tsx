// مسیر فایل: ai-chat-saas/frontend/app/super-admin/customers/create/page.tsx
// هدف: صفحه ایجاد مشتری با ظاهر مینیمال و حرفه‌ای برای Super Admin

"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type Plan = {
    id: number;
    name: string;
    price_monthly?: number;
    max_sites?: number;
    max_agents?: number;
    is_active?: boolean;
};

type SourceRequest = {
    id: number;
    tracking_code: string;
    full_name: string;
    phone: string;
    business_name?: string | null;
    email?: string | null;
    website_url?: string | null;
    desired_plan_id?: number | null;
    request_type_label?: string;
    status?: string;
};

type CreateResult = {
    tenant?: {
        id?: number;
        name?: string;
    };
    site?: {
        id?: number;
        name?: string;
        domain?: string;
        site_key?: string;
        install_code?: string;
    };
    user?: {
        id?: number;
        name?: string;
        email?: string;
    };
    site_key?: string;
    install_code?: string;
};

export default function SuperAdminCreateCustomerPage() {
    const router = useRouter();

    const [plans, setPlans] = useState<Plan[]>([]);
    const [requestId, setRequestId] = useState<number | null>(null);
    const [sourceRequest, setSourceRequest] = useState<SourceRequest | null>(null);
    const [form, setForm] = useState({
        tenant_name: "",
        owner_name: "",
        owner_email: "",
        owner_phone: "",
        owner_password: "",
        site_name: "",
        site_domain: "",
        plan_id: "",
    });

    const [result, setResult] = useState<CreateResult | null>(null);
    const [loadingPlans, setLoadingPlans] = useState(true);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState("");

    useEffect(() => {
        const user = getAuthUser();

        if (!user) {
            router.push("/login");
            return;
        }

        if (user.role !== "super_admin") {
            router.push("/dashboard");
            return;
        }

        loadPlans();

        const sourceId = Number(new URLSearchParams(window.location.search).get("request_id") || 0);
        if (sourceId > 0) {
            setRequestId(sourceId);
            loadSourceRequest(sourceId);
        }
    }, [router]);

    async function loadPlans() {
        try {
            setLoadingPlans(true);

            const data = await apiRequest("/super-admin/plans-list.php");
            const loadedPlans = data.plans || [];

            setPlans(loadedPlans);

            if (loadedPlans.length > 0) {
                setForm((prev) => ({
                    ...prev,
                    plan_id: prev.plan_id || String(loadedPlans[0].id),
                }));
            }
        } catch {
            // اگر پلن‌ها لود نشوند، فرم همچنان قابل نمایش است.
        } finally {
            setLoadingPlans(false);
        }
    }

    async function loadSourceRequest(id: number) {
        try {
            const data = await apiRequest(`/super-admin/contact-request-show.php?id=${id}`);
            const source = data.request as SourceRequest;

            if (source.status === "converted") {
                setError("این درخواست قبلاً به مشتری تبدیل شده است.");
                setSourceRequest(source);
                return;
            }

            setSourceRequest(source);
            setForm((prev) => ({
                ...prev,
                tenant_name: source.business_name || source.full_name || prev.tenant_name,
                owner_name: source.full_name || prev.owner_name,
                owner_email: source.email || prev.owner_email,
                owner_phone: source.phone || prev.owner_phone,
                site_name: source.business_name || prev.site_name,
                site_domain: source.website_url || prev.site_domain,
                plan_id: source.desired_plan_id ? String(source.desired_plan_id) : prev.plan_id,
            }));
        } catch (err) {
            setError(err instanceof Error ? err.message : "دریافت اطلاعات درخواست ناموفق بود.");
        }
    }

    function updateField(field: string, value: string) {
        setForm((prev) => ({
            ...prev,
            [field]: value,
        }));
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setCreating(true);
        setError("");
        setResult(null);

        const body = {
            ...form,
            name: form.tenant_name,
            tenant_name: form.tenant_name,
            customer_name: form.tenant_name,
            owner_name: form.owner_name,
            admin_name: form.owner_name,
            owner_email: form.owner_email,
            admin_email: form.owner_email,
            owner_phone: form.owner_phone,
            admin_phone: form.owner_phone,
            owner_password: form.owner_password,
            admin_password: form.owner_password,
            password: form.owner_password,
            site_name: form.site_name,
            domain: form.site_domain,
            site_domain: form.site_domain,
            plan_id: form.plan_id ? Number(form.plan_id) : null,
            request_id: requestId,
        };

        if (!form.tenant_name.trim()) {
            setError("نام مشتری یا کسب‌وکار را وارد کن.");
            setCreating(false);
            return;
        }

        if (!form.plan_id) {
            setError("یک پلن فعال انتخاب کن.");
            setCreating(false);
            return;
        }

        if (!form.owner_email.trim()) {
            setError("ایمیل مدیر مشتری را وارد کن.");
            setCreating(false);
            return;
        }

        if (form.owner_password.length < 8) {
            setError("رمز عبور مدیر باید حداقل ۸ کاراکتر باشد.");
            setCreating(false);
            return;
        }

        if (!form.site_domain.trim()) {
            setError("دامنه سایت را وارد کن؛ مثلاً example.com");
            setCreating(false);
            return;
        }

        try {
            const data = await apiRequest("/super-admin/customer-create.php", {
                method: "POST",
                body: JSON.stringify(body),
            });

            setResult(data);
            if (sourceRequest) {
                setSourceRequest((current) => current ? { ...current, status: "converted" } : current);
            }

            setForm({
                tenant_name: "",
                owner_name: "",
                owner_email: "",
                owner_phone: "",
                owner_password: "",
                site_name: "",
                site_domain: "",
                plan_id: plans[0]?.id ? String(plans[0].id) : "",
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "ایجاد مشتری ناموفق بود");
        } finally {
            setCreating(false);
        }
    }

    async function copyText(value: string, key: string) {
        await navigator.clipboard.writeText(value);
        setCopied(key);

        window.setTimeout(() => setCopied(""), 1600);
    }

    const siteKey = result?.site?.site_key || result?.site_key || "";
    const installCode =
        result?.site?.install_code ||
        result?.install_code ||
        (siteKey
            ? `<script src="http://localhost/ai-chat-saas/widget/dist/widget.js" data-site-key="${siteKey}"></script>`
            : "");

    return (
        <AppShell
            title="ایجاد مشتری جدید"
            kicker="New Customer"
            description="ساخت حساب مشتری، سایت اولیه و کد نصب ویجت"
            actions={
                sourceRequest ? (
                    <Link className="btn secondary" href={`/super-admin/contact-requests/${sourceRequest.id}`}>
                        بازگشت به درخواست
                    </Link>
                ) : (
                    <Link className="btn secondary" href="/super-admin/customers">
                        بازگشت به مشتری‌ها
                    </Link>
                )
            }
        >
            {sourceRequest && (
                <div className="customer-source-request-banner">
                    <div>
                        <small>ایجاد مشتری از درخواست {sourceRequest.tracking_code}</small>
                        <strong>{sourceRequest.full_name}{sourceRequest.business_name ? ` · ${sourceRequest.business_name}` : ""}</strong>
                        <span>{sourceRequest.request_type_label || "درخواست مشتری"}؛ اطلاعات قابل انتقال به فرم وارد شده‌اند.</span>
                    </div>
                    <Link href={`/super-admin/contact-requests/${sourceRequest.id}`}>مشاهده جزئیات درخواست</Link>
                </div>
            )}

            {error && <div className="error">{error}</div>}

            {result && (
                <div className="admin-result-box" style={{ marginBottom: 18 }}>
                    <div>
                        <strong>مشتری با موفقیت ساخته شد.</strong>
                        <p className="muted" style={{ margin: "6px 0 0" }}>
                            حالا می‌توانی site_key و کد نصب ویجت را برای مشتری ارسال کنی.
                        </p>
                    </div>

                    {siteKey && (
                        <div className="admin-copy-box">
                            <span className="muted">site_key</span>
                            <input
                                className="input"
                                readOnly
                                value={siteKey}
                                onFocus={(event) => event.currentTarget.select()}
                            />
                            <button
                                className="btn secondary"
                                type="button"
                                onClick={() => copyText(siteKey, "site_key")}
                            >
                                {copied === "site_key" ? "کپی شد" : "کپی site_key"}
                            </button>
                        </div>
                    )}

                    {installCode && (
                        <div className="admin-copy-box">
                            <span className="muted">کد نصب ویجت</span>
                            <textarea
                                className="textarea"
                                readOnly
                                value={installCode}
                                onFocus={(event) => event.currentTarget.select()}
                            />
                            <button
                                className="btn secondary"
                                type="button"
                                onClick={() => copyText(installCode, "install_code")}
                            >
                                {copied === "install_code" ? "کپی شد" : "کپی کد نصب"}
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="admin-form-layout">
                <section className="admin-form-card">
                    <form onSubmit={handleSubmit}>
                        <div className="admin-form-section">
                            <div>
                                <h2 className="admin-form-section-title">اطلاعات مشتری</h2>
                                <p className="admin-form-section-text">
                                    نام کسب‌وکار و پلن اولیه مشتری را مشخص کن.
                                </p>
                            </div>

                            <div className="admin-two-col">
                                <label className="grid">
                                    <span>نام مشتری / کسب‌وکار</span>
                                    <input
                                        className="input"
                                        value={form.tenant_name}
                                        onChange={(event) =>
                                            updateField("tenant_name", event.target.value)
                                        }
                                        placeholder="مثلاً فروشگاه نمونه"
                                        required
                                    />
                                </label>

                                <label className="grid">
                                    <span>پلن</span>
                                    <select
                                        className="input"
                                        value={form.plan_id}
                                        onChange={(event) =>
                                            updateField("plan_id", event.target.value)
                                        }
                                        disabled={loadingPlans}
                                    >
                                        {plans.length === 0 ? (
                                            <option value="">پلنی پیدا نشد</option>
                                        ) : (
                                            plans.map((plan) => (
                                                <option key={plan.id} value={plan.id}>
                                                    {plan.name}
                                                </option>
                                            ))
                                        )}
                                    </select>
                                </label>
                            </div>
                        </div>

                        <div className="admin-form-section">
                            <div>
                                <h2 className="admin-form-section-title">مدیر مشتری</h2>
                                <p className="admin-form-section-text">
                                    این کاربر بعداً وارد پنل مشتری می‌شود و تیم و ویجت را مدیریت می‌کند.
                                </p>
                            </div>

                            <div className="admin-two-col">
                                <label className="grid">
                                    <span>نام مدیر</span>
                                    <input
                                        className="input"
                                        value={form.owner_name}
                                        onChange={(event) =>
                                            updateField("owner_name", event.target.value)
                                        }
                                        placeholder="مثلاً علی رضایی"
                                    />
                                </label>

                                <label className="grid">
                                    <span>ایمیل ورود</span>
                                    <input
                                        className="input"
                                        type="email"
                                        value={form.owner_email}
                                        onChange={(event) =>
                                            updateField("owner_email", event.target.value)
                                        }
                                        placeholder="owner@example.com"
                                        required
                                    />
                                </label>

                                <label className="grid">
                                    <span>شماره تماس</span>
                                    <input
                                        className="input"
                                        value={form.owner_phone}
                                        onChange={(event) =>
                                            updateField("owner_phone", event.target.value)
                                        }
                                        placeholder="09120000000"
                                    />
                                </label>

                                <label className="grid">
                                    <span>رمز عبور</span>
                                    <input
                                        className="input"
                                        type="password"
                                        value={form.owner_password}
                                        onChange={(event) =>
                                            updateField("owner_password", event.target.value)
                                        }
                                        placeholder="حداقل ۸ کاراکتر"
                                        minLength={8}
                                        required
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="admin-form-section">
                            <div>
                                <h2 className="admin-form-section-title">سایت اولیه</h2>
                                <p className="admin-form-section-text">
                                    برای مشتری یک سایت اولیه ساخته می‌شود و site_key دریافت می‌کند.
                                </p>
                            </div>

                            <div className="admin-two-col">
                                <label className="grid">
                                    <span>نام سایت</span>
                                    <input
                                        className="input"
                                        value={form.site_name}
                                        onChange={(event) =>
                                            updateField("site_name", event.target.value)
                                        }
                                        placeholder="مثلاً سایت فروشگاه"
                                    />
                                </label>

                                <label className="grid">
                                    <span>دامنه سایت</span>
                                    <input
                                        className="input"
                                        value={form.site_domain}
                                        onChange={(event) =>
                                            updateField("site_domain", event.target.value)
                                        }
                                        placeholder="example.com"
                                        required
                                    />
                                </label>
                            </div>
                        </div>

                        <button className="btn" type="submit" disabled={creating}>
                            {creating ? "در حال ساخت..." : "ساخت مشتری و دریافت کد ویجت"}
                        </button>
                    </form>
                </section>

                <aside className="admin-info-stack">
                    <section className="admin-clean-card">
                        <h3 style={{ marginTop: 0 }}>مراحل ساخت</h3>

                        <div className="grid">
                            <HintItem
                                number="1"
                                title="ساخت مشتری"
                                text="یک tenant برای کسب‌وکار جدید ایجاد می‌شود."
                            />

                            <HintItem
                                number="2"
                                title="ساخت مدیر"
                                text="حساب customer_admin برای ورود مشتری ساخته می‌شود."
                            />

                            <HintItem
                                number="3"
                                title="ساخت سایت"
                                text="سایت اولیه ساخته و site_key تولید می‌شود."
                            />
                        </div>
                    </section>

                    <section className="admin-mini-panel">
                        <h3 style={{ marginTop: 0 }}>نکته</h3>
                        <p className="muted" style={{ lineHeight: 1.9 }}>
                            بعد از ساخت مشتری، بهتر است کد نصب ویجت را در اختیار او قرار بدهی
                            یا خودت روی سایتش نصب کنی.
                        </p>
                    </section>
                </aside>
            </div>
        </AppShell>
    );
}

function HintItem({
                      number,
                      title,
                      text,
                  }: {
    number: string;
    title: string;
    text: string;
}) {
    return (
        <div className="admin-hint-item">
            <span className="admin-hint-number">{number}</span>
            <div>
                <strong>{title}</strong>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                    {text}
                </p>
            </div>
        </div>
    );
}