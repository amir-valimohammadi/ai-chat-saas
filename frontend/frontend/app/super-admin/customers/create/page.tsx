// مسیر فایل: ai-chat-saas/frontend/app/super-admin/customers/create/page.tsx
// هدف: ایجاد مشتری با انتخاب ویجت، صفحه پشتیبانی اختصاصی یا هر دو

"use client";

import { FormEvent, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type AccessMode = "widget" | "hosted" | "both";

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
    site?: {
        site_id?: number;
        site_name?: string;
        domain?: string;
        site_key?: string;
        install_code?: string | null;
        access_mode?: AccessMode;
        hosted_support_url?: string | null;
        hosted_support_slug?: string | null;
    };
    hosted_support?: {
        url: string;
        slug: string;
        active: boolean;
    } | null;
    site_key?: string;
    install_code?: string | null;
};

type FormState = {
    tenant_name: string;
    owner_name: string;
    owner_email: string;
    owner_phone: string;
    owner_password: string;
    site_name: string;
    site_domain: string;
    plan_id: string;
    access_mode: AccessMode;
    hosted_slug: string;
    hosted_page_title: string;
    hosted_page_subtitle: string;
};

const initialForm: FormState = {
    tenant_name: "",
    owner_name: "",
    owner_email: "",
    owner_phone: "",
    owner_password: "",
    site_name: "",
    site_domain: "",
    plan_id: "",
    access_mode: "widget",
    hosted_slug: "",
    hosted_page_title: "",
    hosted_page_subtitle: "پشتیبانی و ارتباط مستقیم",
};

export default function SuperAdminCreateCustomerPage() {
    const router = useRouter();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [requestId, setRequestId] = useState<number | null>(null);
    const [sourceRequest, setSourceRequest] = useState<SourceRequest | null>(null);
    const [form, setForm] = useState<FormState>(initialForm);
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

        void loadPlans();
        const sourceId = Number(new URLSearchParams(window.location.search).get("request_id") || 0);
        if (sourceId > 0) {
            setRequestId(sourceId);
            void loadSourceRequest(sourceId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    async function loadPlans() {
        try {
            setLoadingPlans(true);
            const data = await apiRequest("/super-admin/plans-list.php");
            const loadedPlans = Array.isArray(data.plans) ? data.plans : [];
            setPlans(loadedPlans);
            if (loadedPlans.length > 0) {
                setForm((current) => ({
                    ...current,
                    plan_id: current.plan_id || String(loadedPlans[0].id),
                }));
            }
        } catch {
            // فرم بدون لیست پلن هم نمایش داده می‌شود.
        } finally {
            setLoadingPlans(false);
        }
    }

    async function loadSourceRequest(id: number) {
        try {
            const data = await apiRequest(`/super-admin/contact-request-show.php?id=${id}`);
            const source = data.request as SourceRequest;
            setSourceRequest(source);

            if (source.status === "converted") {
                setError("این درخواست قبلاً به مشتری تبدیل شده است.");
                return;
            }

            const hasWebsite = Boolean(source.website_url?.trim());
            const businessName = source.business_name || source.full_name || "";

            setForm((current) => ({
                ...current,
                tenant_name: businessName || current.tenant_name,
                owner_name: source.full_name || current.owner_name,
                owner_email: source.email || current.owner_email,
                owner_phone: source.phone || current.owner_phone,
                site_name: businessName || current.site_name,
                site_domain: source.website_url || current.site_domain,
                plan_id: source.desired_plan_id ? String(source.desired_plan_id) : current.plan_id,
                access_mode: hasWebsite ? "both" : "hosted",
                hosted_page_title: businessName ? `${businessName} | پشتیبانی آنلاین` : current.hosted_page_title,
                hosted_slug: normalizeSlug(businessName),
            }));
        } catch (err) {
            setError(err instanceof Error ? err.message : "دریافت اطلاعات درخواست ناموفق بود.");
        }
    }

    function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
        setForm((current) => ({ ...current, [field]: value }));
        setError("");
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (creating) return;

        setCreating(true);
        setError("");
        setResult(null);

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
        if (form.access_mode !== "hosted" && !form.site_domain.trim()) {
            setError("برای نصب ویجت، دامنه سایت را وارد کن.");
            setCreating(false);
            return;
        }

        const body = {
            tenant_name: form.tenant_name.trim(),
            owner_name: form.owner_name.trim(),
            owner_email: form.owner_email.trim(),
            owner_phone: form.owner_phone.trim(),
            admin_name: form.owner_name.trim(),
            admin_email: form.owner_email.trim(),
            admin_password: form.owner_password,
            site_name: form.site_name.trim() || form.tenant_name.trim(),
            domain: form.site_domain.trim(),
            plan_id: Number(form.plan_id),
            request_id: requestId,
            access_mode: form.access_mode,
            hosted_slug: form.hosted_slug.trim(),
            hosted_page_title: form.hosted_page_title.trim(),
            hosted_page_subtitle: form.hosted_page_subtitle.trim(),
        };

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
                ...initialForm,
                plan_id: plans[0]?.id ? String(plans[0].id) : "",
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "ایجاد مشتری ناموفق بود.");
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
    const installCode = result?.site?.install_code || result?.install_code || "";
    const hostedUrl = result?.hosted_support?.url || result?.site?.hosted_support_url || "";
    const createsHosted = form.access_mode === "hosted" || form.access_mode === "both";
    const usesWidget = form.access_mode === "widget" || form.access_mode === "both";

    return (
        <AppShell
            title="ایجاد مشتری جدید"
            kicker="New Customer"
            description="ساخت حساب، فضای گفتگو و روش دسترسی مشتریان"
            actions={
                <Link
                    className="btn secondary"
                    href={sourceRequest ? `/super-admin/contact-requests/${sourceRequest.id}` : "/super-admin/customers"}
                >
                    بازگشت
                </Link>
            }
        >
            {sourceRequest && (
                <div className="customer-source-request-banner">
                    <div>
                        <small>ایجاد مشتری از درخواست {sourceRequest.tracking_code}</small>
                        <strong>{sourceRequest.full_name}{sourceRequest.business_name ? ` · ${sourceRequest.business_name}` : ""}</strong>
                        <span>{sourceRequest.request_type_label || "درخواست مشتری"}؛ اطلاعات موجود به فرم منتقل شده‌اند.</span>
                    </div>
                    <Link href={`/super-admin/contact-requests/${sourceRequest.id}`}>مشاهده درخواست</Link>
                </div>
            )}

            {error && <div className="error">{error}</div>}

            {result && (
                <div className="admin-result-box customer-create-result">
                    <div>
                        <strong>مشتری با موفقیت ساخته شد.</strong>
                        <p className="muted">اطلاعات دسترسی متناسب با روش انتخاب‌شده آماده است.</p>
                    </div>

                    {hostedUrl && (
                        <CopyResult
                            title="لینک صفحه پشتیبانی اختصاصی"
                            value={hostedUrl}
                            copied={copied === "hosted_url"}
                            onCopy={() => copyText(hostedUrl, "hosted_url")}
                        />
                    )}

                    {installCode && (
                        <CopyResult
                            title="کد نصب ویجت"
                            value={installCode}
                            copied={copied === "install_code"}
                            onCopy={() => copyText(installCode, "install_code")}
                            multiline
                        />
                    )}

                    {siteKey && (
                        <CopyResult
                            title="site_key"
                            value={siteKey}
                            copied={copied === "site_key"}
                            onCopy={() => copyText(siteKey, "site_key")}
                        />
                    )}
                </div>
            )}

            <div className="admin-form-layout">
                <section className="admin-form-card">
                    <form onSubmit={handleSubmit}>
                        <FormSection
                            title="اطلاعات مشتری"
                            description="نام کسب‌وکار و پلن اولیه را مشخص کن."
                        >
                            <div className="admin-two-col">
                                <Field label="نام مشتری / کسب‌وکار">
                                    <input
                                        className="input"
                                        value={form.tenant_name}
                                        onChange={(event) => updateField("tenant_name", event.target.value)}
                                        placeholder="مثلاً فروشگاه نمونه"
                                        required
                                    />
                                </Field>
                                <Field label="پلن">
                                    <select
                                        className="input"
                                        value={form.plan_id}
                                        onChange={(event) => updateField("plan_id", event.target.value)}
                                        disabled={loadingPlans}
                                    >
                                        {plans.length === 0 ? (
                                            <option value="">پلنی پیدا نشد</option>
                                        ) : plans.map((plan) => (
                                            <option key={plan.id} value={plan.id}>{plan.name}</option>
                                        ))}
                                    </select>
                                </Field>
                            </div>
                        </FormSection>

                        <FormSection
                            title="مدیر مشتری"
                            description="این حساب برای ورود به پنل و مدیریت تیم ساخته می‌شود."
                        >
                            <div className="admin-two-col">
                                <Field label="نام مدیر">
                                    <input className="input" value={form.owner_name} onChange={(event) => updateField("owner_name", event.target.value)} placeholder="مثلاً علی رضایی" />
                                </Field>
                                <Field label="ایمیل ورود">
                                    <input className="input" type="email" value={form.owner_email} onChange={(event) => updateField("owner_email", event.target.value)} placeholder="owner@example.com" required />
                                </Field>
                                <Field label="شماره تماس">
                                    <input className="input" value={form.owner_phone} onChange={(event) => updateField("owner_phone", event.target.value)} placeholder="09120000000" />
                                </Field>
                                <Field label="رمز عبور">
                                    <input className="input" type="password" value={form.owner_password} onChange={(event) => updateField("owner_password", event.target.value)} placeholder="حداقل ۸ کاراکتر" minLength={8} required />
                                </Field>
                            </div>
                        </FormSection>

                        <FormSection
                            title="روش ارائه پشتیبانی"
                            description="مشتری می‌تواند ویجت را روی سایت نصب کند، لینک مستقل بگیرد یا هر دو را داشته باشد."
                        >
                            <div className="customer-access-mode-grid">
                                <AccessModeCard
                                    active={form.access_mode === "widget"}
                                    title="ویجت روی سایت"
                                    text="برای مشتری دارای وب‌سایت؛ کد نصب ویجت تحویل داده می‌شود."
                                    badge="Website"
                                    onClick={() => updateField("access_mode", "widget")}
                                />
                                <AccessModeCard
                                    active={form.access_mode === "hosted"}
                                    title="صفحه اختصاصی"
                                    text="برای مشتری بدون وب‌سایت؛ لینک عمومی پشتیبانی ساخته می‌شود."
                                    badge="No Website"
                                    onClick={() => updateField("access_mode", "hosted")}
                                />
                                <AccessModeCard
                                    active={form.access_mode === "both"}
                                    title="هر دو روش"
                                    text="هم کد ویجت و هم صفحه پشتیبانی مستقل در اختیار مشتری قرار می‌گیرد."
                                    badge="Complete"
                                    onClick={() => updateField("access_mode", "both")}
                                />
                            </div>
                        </FormSection>

                        <FormSection
                            title="فضای اولیه گفتگو"
                            description="برای هر روش، یک فضای سایت منطقی و site_key ساخته می‌شود."
                        >
                            <div className="admin-two-col">
                                <Field label="نام فضای پشتیبانی">
                                    <input
                                        className="input"
                                        value={form.site_name}
                                        onChange={(event) => updateField("site_name", event.target.value)}
                                        placeholder="مثلاً پشتیبانی فروشگاه"
                                    />
                                </Field>

                                {usesWidget && (
                                    <Field label="دامنه وب‌سایت">
                                        <input
                                            className="input"
                                            value={form.site_domain}
                                            onChange={(event) => updateField("site_domain", event.target.value)}
                                            placeholder="example.com"
                                            required
                                        />
                                    </Field>
                                )}
                            </div>

                            {createsHosted && (
                                <div className="customer-hosted-create-fields">
                                    <Field label="شناسه لینک اختصاصی" hint="خالی بماند، از نام کسب‌وکار ساخته می‌شود.">
                                        <div className="hosted-slug-input">
                                            <b>/support/</b>
                                            <input
                                                value={form.hosted_slug}
                                                onChange={(event) => updateField("hosted_slug", normalizeSlug(event.target.value))}
                                                placeholder="brand-name"
                                                dir="ltr"
                                            />
                                        </div>
                                    </Field>
                                    <Field label="عنوان صفحه">
                                        <input
                                            className="input"
                                            value={form.hosted_page_title}
                                            onChange={(event) => updateField("hosted_page_title", event.target.value)}
                                            placeholder={`${form.tenant_name || "نام کسب‌وکار"} | پشتیبانی آنلاین`}
                                        />
                                    </Field>
                                    <Field label="زیرعنوان صفحه">
                                        <input
                                            className="input"
                                            value={form.hosted_page_subtitle}
                                            onChange={(event) => updateField("hosted_page_subtitle", event.target.value)}
                                            placeholder="پشتیبانی و ارتباط مستقیم"
                                        />
                                    </Field>
                                </div>
                            )}
                        </FormSection>

                        <button className="btn customer-create-submit" type="submit" disabled={creating}>
                            {creating ? "در حال ساخت..." : "ساخت مشتری و آماده‌سازی دسترسی"}
                        </button>
                    </form>
                </section>

                <aside className="admin-info-stack">
                    <section className="admin-clean-card">
                        <h3 style={{ marginTop: 0 }}>خروجی این مرحله</h3>
                        <div className="grid">
                            <HintItem number="1" title="حساب مشتری" text="Tenant و حساب مدیر مشتری ساخته می‌شود." />
                            <HintItem number="2" title="فضای گفتگو" text="site_key و صندوق گفتگو به مشتری متصل می‌شود." />
                            <HintItem
                                number="3"
                                title={form.access_mode === "widget" ? "کد ویجت" : form.access_mode === "hosted" ? "لینک مستقل" : "کد و لینک"}
                                text={form.access_mode === "widget"
                                    ? "کد نصب برای دامنه مشتری تولید می‌شود."
                                    : form.access_mode === "hosted"
                                        ? "صفحه پشتیبانی بدون نیاز به سایت ساخته می‌شود."
                                        : "مشتری از هر دو کانال استفاده می‌کند."}
                            />
                        </div>
                    </section>

                    <section className="admin-mini-panel">
                        <h3 style={{ marginTop: 0 }}>نکته مهم</h3>
                        <p className="muted" style={{ lineHeight: 1.9 }}>
                            صفحه اختصاصی بعداً از پنل مشتری قابل شخصی‌سازی است؛ ساعت کاری، پیام آفلاین، رنگ، شماره تماس و واتساپ در بخش «صفحه پشتیبانی» تنظیم می‌شوند.
                        </p>
                    </section>
                </aside>
            </div>
        </AppShell>
    );
}

function FormSection({
                         title,
                         description,
                         children,
                     }: {
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <div className="admin-form-section">
            <div>
                <h2 className="admin-form-section-title">{title}</h2>
                <p className="admin-form-section-text">{description}</p>
            </div>
            {children}
        </div>
    );
}

function Field({
                   label,
                   hint,
                   children,
               }: {
    label: string;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <label className="grid">
            <span>{label}</span>
            {children}
            {hint && <small className="muted">{hint}</small>}
        </label>
    );
}

function AccessModeCard({
                            active,
                            title,
                            text,
                            badge,
                            onClick,
                        }: {
    active: boolean;
    title: string;
    text: string;
    badge: string;
    onClick: () => void;
}) {
    return (
        <button type="button" className={active ? "active" : ""} onClick={onClick}>
            <i>{active ? "✓" : ""}</i>
            <small>{badge}</small>
            <strong>{title}</strong>
            <span>{text}</span>
        </button>
    );
}

function CopyResult({
                        title,
                        value,
                        copied,
                        onCopy,
                        multiline = false,
                    }: {
    title: string;
    value: string;
    copied: boolean;
    onCopy: () => void;
    multiline?: boolean;
}) {
    return (
        <div className="admin-copy-box">
            <span className="muted">{title}</span>
            {multiline ? (
                <textarea className="textarea" readOnly value={value} onFocus={(event) => event.currentTarget.select()} />
            ) : (
                <input className="input" readOnly value={value} onFocus={(event) => event.currentTarget.select()} />
            )}
            <button className="btn secondary" type="button" onClick={onCopy}>
                {copied ? "کپی شد" : "کپی"}
            </button>
        </div>
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
                <p className="muted" style={{ margin: "4px 0 0" }}>{text}</p>
            </div>
        </div>
    );
}

function normalizeSlug(value: string) {
    return value
        .toLowerCase()
        .replace(/[_\s]+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}
