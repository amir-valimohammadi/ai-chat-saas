"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";

type PublicPlan = {
    id: number;
    name: string;
    description?: string | null;
    max_sites?: number;
    max_agents?: number;
    max_monthly_conversations?: number;
    price_monthly?: number;
};

type ContactForm = {
    full_name: string;
    phone: string;
    business_name: string;
    email: string;
    website_url: string;
    request_type: string;
    business_field: string;
    sites_count: string;
    agents_count: string;
    monthly_conversations: string;
    desired_plan_id: string;
    website_technology: string;
    preferred_contact: "phone" | "whatsapp";
    preferred_contact_time: string;
    description: string;
    consent_contact: boolean;
    company_website: string;
};

const requestTypes = [
    { value: "purchase_plan", label: "خرید پلن", hint: "برای شروع استفاده از محصول" },
    { value: "pricing", label: "دریافت قیمت", hint: "برآورد متناسب با نیاز شما" },
    { value: "demo", label: "درخواست دمو", hint: "نمایش عملی محصول و پنل" },
    { value: "plan_consultation", label: "مشاوره انتخاب پلن", hint: "انتخاب ظرفیت و امکانات مناسب" },
    { value: "widget_setup", label: "راه‌اندازی ویجت", hint: "بررسی نصب و تنظیم اولیه" },
    { value: "ai_consultation", label: "مشاوره هوش مصنوعی", hint: "بررسی دانش، خزش و پاسخ‌گویی" },
    { value: "migration", label: "انتقال از سامانه دیگر", hint: "بررسی انتقال اطلاعات و فرآیند" },
    { value: "partnership", label: "همکاری تجاری", hint: "نمایندگی یا همکاری سازمانی" },
    { value: "other", label: "سایر موارد", hint: "درخواست یا سؤال متفاوت" },
];

const initialForm: ContactForm = {
    full_name: "",
    phone: "",
    business_name: "",
    email: "",
    website_url: "",
    request_type: "plan_consultation",
    business_field: "",
    sites_count: "1",
    agents_count: "1",
    monthly_conversations: "unknown",
    desired_plan_id: "",
    website_technology: "",
    preferred_contact: "phone",
    preferred_contact_time: "anytime",
    description: "",
    consent_contact: false,
    company_website: "",
};

function normalizePlanName(value: string) {
    return value.trim().toLowerCase().replace(/starter/g, "basic").replace(/scale/g, "pro");
}

export default function ContactRequestSection() {
    const [step, setStep] = useState(1);
    const [form, setForm] = useState<ContactForm>(initialForm);
    const [plans, setPlans] = useState<PublicPlan[]>([]);
    const [loadingPlans, setLoadingPlans] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [trackingCode, setTrackingCode] = useState("");
    const [successMethod, setSuccessMethod] = useState<"phone" | "whatsapp">("phone");
    const [pendingPlanName, setPendingPlanName] = useState("");

    useEffect(() => {
        let active = true;

        apiRequest("/public/plans-list.php", { auth: false })
            .then((data) => {
                if (!active) return;
                const loadedPlans = Array.isArray(data.plans) ? data.plans : [];
                setPlans(loadedPlans);
            })
            .catch(() => {
                if (active) setPlans([]);
            })
            .finally(() => {
                if (active) setLoadingPlans(false);
            });

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        function handlePlanSelect(event: Event) {
            const customEvent = event as CustomEvent<{ planName?: string }>;
            const planName = customEvent.detail?.planName || "";

            setPendingPlanName(planName);
            setForm((current) => ({
                ...current,
                request_type: "purchase_plan",
                desired_plan_id:
                    plans.find((plan) => normalizePlanName(plan.name) === normalizePlanName(planName))?.id.toString() ||
                    current.desired_plan_id,
            }));
            setTrackingCode("");
            setError("");
            setStep(1);

            window.setTimeout(() => {
                document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 20);
        }

        window.addEventListener("contact-plan-select", handlePlanSelect as EventListener);
        return () => window.removeEventListener("contact-plan-select", handlePlanSelect as EventListener);
    }, [plans]);

    useEffect(() => {
        if (!pendingPlanName || plans.length === 0) return;

        const matchingPlan = plans.find(
            (plan) => normalizePlanName(plan.name) === normalizePlanName(pendingPlanName),
        );

        if (matchingPlan) {
            setForm((current) => ({
                ...current,
                request_type: "purchase_plan",
                desired_plan_id: String(matchingPlan.id),
            }));
            setPendingPlanName("");
        }
    }, [pendingPlanName, plans]);

    const selectedType = useMemo(
        () => requestTypes.find((item) => item.value === form.request_type),
        [form.request_type],
    );

    function updateField<K extends keyof ContactForm>(field: K, value: ContactForm[K]) {
        setForm((current) => ({ ...current, [field]: value }));
        setError("");
    }

    function validateStep(currentStep: number) {
        if (currentStep === 1) {
            if (form.full_name.trim().length < 2) return "نام و نام خانوادگی را وارد کنید.";
            const phoneDigits = form.phone
                .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
                .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
                .replace(/\D/g, "");
            const iranMobile = /^(?:98|0098)?9\d{9}$/.test(phoneDigits) || /^09\d{9}$/.test(phoneDigits);
            const internationalPhone = phoneDigits.length >= 10 && phoneDigits.length <= 15 && !phoneDigits.startsWith("0");
            if (!iranMobile && !internationalPhone) return "شماره موبایل معتبر وارد کنید.";
            if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) return "ایمیل واردشده معتبر نیست.";
        }

        if (currentStep === 2 && !form.request_type) {
            return "هدف اصلی درخواست را انتخاب کنید.";
        }

        if (currentStep === 3 && !form.consent_contact) {
            return "اجازه تماس تیم محصول را تأیید کنید.";
        }

        return "";
    }

    function goNext() {
        const validationError = validateStep(step);
        if (validationError) {
            setError(validationError);
            return;
        }
        setStep((current) => Math.min(current + 1, 3));
        setError("");
    }

    function goBack() {
        setStep((current) => Math.max(current - 1, 1));
        setError("");
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (step < 3) {
            goNext();
            return;
        }

        const validationError = validateStep(3);
        if (validationError) {
            setError(validationError);
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            const data = await apiRequest("/public/contact-request-create.php", {
                method: "POST",
                auth: false,
                body: JSON.stringify({
                    ...form,
                    sites_count: form.sites_count ? Number(form.sites_count) : null,
                    agents_count: form.agents_count ? Number(form.agents_count) : null,
                    desired_plan_id: form.desired_plan_id ? Number(form.desired_plan_id) : null,
                    source_page: typeof window !== "undefined" ? window.location.href : "/",
                }),
            });

            setSuccessMethod(form.preferred_contact);
            setTrackingCode(data.tracking_code || "ثبت‌شده");
            setForm(initialForm);
            setStep(1);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ثبت درخواست انجام نشد. دوباره تلاش کنید.");
        } finally {
            setSubmitting(false);
        }
    }

    function startAnotherRequest() {
        setTrackingCode("");
        setError("");
        setStep(1);
        setForm(initialForm);
    }

    return (
        <section className="orbit-contact-section" id="contact">
            <div className="orbit-contact-layout" data-reveal>
                <div className="orbit-contact-copy">
                    <span className="orbit-kicker orbit-kicker--contact">06 · مشاوره، خرید و راه‌اندازی</span>
                    <h2>برای خرید، دمو یا راه‌اندازی، یک درخواست کوتاه ثبت کنید</h2>
                    <p>
                        این فرم بدون ثبت‌نام تکمیل می‌شود. اطلاعات شما مستقیماً برای سوپرادمین ارسال می‌شود تا نیازتان بررسی و ادامه هماهنگی از طریق تماس تلفنی یا واتساپ انجام شود.
                    </p>

                    <div className="orbit-contact-points">
                        <div><span>01</span><strong>بدون نیاز به ساخت حساب</strong><small>فرم مستقیماً از همین صفحه ثبت می‌شود.</small></div>
                        <div><span>02</span><strong>بررسی نیاز واقعی</strong><small>پلن، تعداد سایت و تیم پشتیبانی بررسی می‌شود.</small></div>
                        <div><span>03</span><strong>پیگیری انسانی</strong><small>ادامه هماهنگی با تماس تلفنی یا واتساپ انجام می‌شود.</small></div>
                    </div>

                    <div className="orbit-contact-trust">
                        <span>اطلاعات شما فقط برای پیگیری درخواست استفاده می‌شود.</span>
                        <span>هیچ رمز عبور یا اطلاعات بانکی در این فرم دریافت نمی‌شود.</span>
                    </div>
                </div>

                <div className="orbit-contact-card">
                    {trackingCode ? (
                        <div className="orbit-contact-success" role="status">
                            <div className="orbit-contact-success-icon">✓</div>
                            <span>درخواست با موفقیت ثبت شد</span>
                            <h3>تیم محصول پس از بررسی اطلاعات با شما تماس می‌گیرد.</h3>
                            <p>روش پیگیری انتخابی شما: {successMethod === "whatsapp" ? "واتساپ" : "تماس تلفنی"}</p>
                            <div className="orbit-tracking-code"><small>کد پیگیری</small><strong>{trackingCode}</strong></div>
                            <button type="button" onClick={startAnotherRequest}>ثبت درخواست جدید</button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <div className="orbit-contact-form-head">
                                <div>
                                    <small>مرحله {step} از 3</small>
                                    <strong>{step === 1 ? "اطلاعات ارتباطی" : step === 2 ? "نیاز کسب‌وکار" : "نحوه پیگیری"}</strong>
                                </div>
                                <span>{Math.round((step / 3) * 100)}٪</span>
                            </div>

                            <div className="orbit-contact-progress"><i style={{ width: `${(step / 3) * 100}%` }} /></div>

                            {error && <div className="orbit-contact-error" role="alert">{error}</div>}

                            <div className={`orbit-contact-step ${step === 1 ? "is-active" : ""}`} aria-hidden={step !== 1}>
                                <div className="orbit-contact-fields orbit-contact-fields--two">
                                    <label><span>نام و نام خانوادگی *</span><input value={form.full_name} onChange={(e) => updateField("full_name", e.target.value)} placeholder="مثلاً علی رضایی" autoComplete="name" /></label>
                                    <label><span>شماره موبایل *</span><input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="09120000000" inputMode="tel" dir="ltr" autoComplete="tel" /></label>
                                    <label><span>نام مجموعه</span><input value={form.business_name} onChange={(e) => updateField("business_name", e.target.value)} placeholder="نام کسب‌وکار یا مجموعه" /></label>
                                    <label><span>حوزه فعالیت</span><input value={form.business_field} onChange={(e) => updateField("business_field", e.target.value)} placeholder="فروشگاه، خدمات، آموزش و..." /></label>
                                    <label><span>آدرس وب‌سایت</span><input value={form.website_url} onChange={(e) => updateField("website_url", e.target.value)} placeholder="example.com" dir="ltr" /></label>
                                    <label><span>ایمیل اختیاری</span><input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="name@company.com" dir="ltr" autoComplete="email" /></label>
                                </div>
                            </div>

                            <div className={`orbit-contact-step ${step === 2 ? "is-active" : ""}`} aria-hidden={step !== 2}>
                                <div className="orbit-request-type-grid">
                                    {requestTypes.map((item) => (
                                        <button
                                            type="button"
                                            key={item.value}
                                            className={form.request_type === item.value ? "is-selected" : ""}
                                            onClick={() => updateField("request_type", item.value)}
                                        >
                                            <strong>{item.label}</strong>
                                            <small>{item.hint}</small>
                                        </button>
                                    ))}
                                </div>

                                <div className="orbit-contact-fields orbit-contact-fields--three">
                                    <label><span>تعداد سایت‌ها</span><input type="number" min="1" max="1000" value={form.sites_count} onChange={(e) => updateField("sites_count", e.target.value)} /></label>
                                    <label><span>تعداد پشتیبان‌ها</span><input type="number" min="1" max="10000" value={form.agents_count} onChange={(e) => updateField("agents_count", e.target.value)} /></label>
                                    <label><span>گفت‌وگوی ماهانه</span><select value={form.monthly_conversations} onChange={(e) => updateField("monthly_conversations", e.target.value)}><option value="unknown">اطلاع ندارم</option><option value="under_500">کمتر از 500</option><option value="500_3000">500 تا 3,000</option><option value="3000_10000">3,000 تا 10,000</option><option value="over_10000">بیشتر از 10,000</option></select></label>
                                </div>

                                <div className="orbit-contact-fields orbit-contact-fields--two">
                                    <label><span>پلن موردنظر</span><select value={form.desired_plan_id} onChange={(e) => updateField("desired_plan_id", e.target.value)} disabled={loadingPlans}><option value="">هنوز مطمئن نیستم</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
                                    {(form.request_type === "widget_setup" || form.request_type === "demo" || form.request_type === "migration") && (
                                        <label><span>فناوری سایت</span><select value={form.website_technology} onChange={(e) => updateField("website_technology", e.target.value)}><option value="">نامشخص</option><option value="wordpress">WordPress</option><option value="woocommerce">WooCommerce</option><option value="shopify">Shopify</option><option value="nextjs">Next.js / React</option><option value="custom">سایت اختصاصی</option><option value="other">سایر</option></select></label>
                                    )}
                                </div>

                                <div className="orbit-contact-selection-summary">
                                    <small>هدف انتخاب‌شده</small>
                                    <strong>{selectedType?.label}</strong>
                                    <span>{selectedType?.hint}</span>
                                </div>
                            </div>

                            <div className={`orbit-contact-step ${step === 3 ? "is-active" : ""}`} aria-hidden={step !== 3}>
                                <div className="orbit-contact-methods">
                                    <button type="button" className={form.preferred_contact === "phone" ? "is-selected" : ""} onClick={() => updateField("preferred_contact", "phone")}><span>☎</span><strong>تماس تلفنی</strong><small>تماس مستقیم سوپرادمین</small></button>
                                    <button type="button" className={form.preferred_contact === "whatsapp" ? "is-selected" : ""} onClick={() => updateField("preferred_contact", "whatsapp")}><span>WA</span><strong>واتساپ</strong><small>شروع هماهنگی در واتساپ</small></button>
                                </div>

                                <div className="orbit-contact-fields">
                                    <label><span>زمان مناسب تماس</span><select value={form.preferred_contact_time} onChange={(e) => updateField("preferred_contact_time", e.target.value)}><option value="anytime">در ساعات کاری فرقی ندارد</option><option value="morning">صبح، 9 تا 12</option><option value="afternoon">بعدازظهر، 12 تا 17</option><option value="evening">عصر، 17 تا 20</option></select></label>
                                    <label><span>توضیحات و نیازهای شما</span><textarea value={form.description} onChange={(e) => updateField("description", e.target.value)} placeholder="مثلاً تعداد سایت‌ها، نوع پشتیبانی، نیاز به دمو یا نکته‌ای که بهتر است پیش از تماس بدانیم..." rows={5} maxLength={3000} /></label>
                                </div>

                                <label className="orbit-contact-consent">
                                    <input type="checkbox" checked={form.consent_contact} onChange={(e) => updateField("consent_contact", e.target.checked)} />
                                    <span>اجازه می‌دهم تیم محصول برای بررسی این درخواست از طریق تلفن یا واتساپ با من تماس بگیرد.</span>
                                </label>

                                <label className="orbit-contact-honeypot" aria-hidden="true">
                                    Company website
                                    <input tabIndex={-1} autoComplete="off" value={form.company_website} onChange={(e) => updateField("company_website", e.target.value)} />
                                </label>
                            </div>

                            <div className="orbit-contact-actions">
                                {step > 1 ? <button type="button" className="secondary" onClick={goBack}>مرحله قبل</button> : <span />}
                                {step < 3 ? <button type="button" className="primary" onClick={goNext}>ادامه</button> : <button type="submit" className="primary" disabled={submitting}>{submitting ? "در حال ثبت درخواست..." : "ثبت درخواست و دریافت کد پیگیری"}</button>}
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </section>
    );
}
