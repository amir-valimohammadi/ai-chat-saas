// مسیر فایل: ai-chat-saas/frontend/app/subscription/page.tsx
// هدف: نمایش حرفه‌ای وضعیت پلن و مصرف واقعی محدودیت‌ها

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type UsageStatus =
    | "normal"
    | "warning"
    | "reached"
    | "exceeded"
    | "unavailable";

type UsageItem = {
    used: number;
    limit: number;
    remaining: number;
    percent: number;
    near_limit: boolean;
    reached: boolean;
    over_limit: boolean;
    over_by: number;
    status: UsageStatus;
    active?: number;
};

type PlanUsageData = {
    customer: {
        id: number;
        name: string;
        status: string;
    };
    plan: {
        id: number | null;
        name: string | null;
        description: string | null;
        price_monthly: number;
        is_active: boolean;
        assigned: boolean;
        limits: {
            max_sites: number;
            max_agents: number;
            max_monthly_conversations: number;
        };
        features: {
            knowledge_base_enabled: boolean;
            ai_suggestions_enabled: boolean;
            ai_auto_reply_enabled: boolean;
        };
    };
    usage: {
        sites: UsageItem;
        agents: UsageItem;
        monthly_conversations: UsageItem;
        knowledge_items: { used: number };
        ai_suggestions_this_month: { used: number };
        ai_auto_replies_this_month: { used: number };
    };
    period: {
        month_start: string;
        now: string;
    };
};

const usageStatusLabels: Record<UsageStatus, string> = {
    normal: "عادی",
    warning: "نزدیک سقف",
    reached: "ظرفیت تکمیل",
    exceeded: "عبور از سقف",
    unavailable: "غیرفعال",
};

export default function SubscriptionPage() {
    const router = useRouter();

    const [data, setData] = useState<PlanUsageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

    async function loadPlanUsage(silent = false) {
        try {
            setError("");

            if (silent) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            const response = await apiRequest("/customer/plan-usage.php");
            setData(response);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "خطا در دریافت اطلاعات پلن"
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    useEffect(() => {
        const user = getAuthUser();

        if (!user) {
            router.push("/login");
            return;
        }

        if (user.role !== "customer_admin") {
            router.push("/dashboard");
            return;
        }

        loadPlanUsage();
    }, [router]);

    return (
        <AppShell
            title="پلن و مصرف"
            kicker="Subscription"
            description="مشاهده پلن فعلی، قابلیت‌های فعال و میزان مصرف واقعی سهمیه"
            actions={
                <button
                    className="btn secondary"
                    type="button"
                    onClick={() => loadPlanUsage(true)}
                    disabled={refreshing}
                >
                    {refreshing ? "در حال بروزرسانی..." : "بروزرسانی"}
                </button>
            }
        >
            <div className="subscription-page">
                {error && <div className="error">{error}</div>}
                <SubscriptionLifecycle />

                {loading || !data ? (
                    <section className="subscription-card">
                        <p className="muted">در حال بارگذاری اطلاعات پلن...</p>
                    </section>
                ) : (
                    <>
                        <section className="subscription-hero">
                            <div>
                                <span className="subscription-chip is-primary">
                                    پلن فعلی
                                </span>
                                <h2>{data.plan.name || "بدون پلن"}</h2>
                                <p>
                                    {data.plan.description ||
                                        "برای این پلن توضیحی ثبت نشده است."}
                                </p>
                            </div>

                            <div className="subscription-price">
                                <span
                                    className={`subscription-chip ${
                                        data.plan.is_active
                                            ? "is-success"
                                            : "is-danger"
                                    }`}
                                >
                                    {data.plan.is_active
                                        ? "پلن فعال"
                                        : "پلن غیرفعال"}
                                </span>
                                <strong>
                                    {data.plan.price_monthly === 0
                                        ? "رایگان"
                                        : `${Number(
                                            data.plan.price_monthly
                                        ).toLocaleString("fa-IR")} تومان`}
                                </strong>
                                <small>هزینه ماهانه</small>
                            </div>
                        </section>

                        <div className="subscription-grid">
                            <section className="subscription-card">
                                <Header
                                    title="مصرف سهمیه"
                                    description="مقدار واقعی مصرف‌شده در برابر محدودیت پلن"
                                    badge="ماه جاری"
                                />

                                <div className="subscription-usage-list">
                                    <UsageRow
                                        title="سایت‌ها"
                                        description="تمام سایت‌های فعال و غیرفعال حساب"
                                        usage={data.usage.sites}
                                    />
                                    <UsageRow
                                        title="پشتیبان‌ها"
                                        description={`تمام Agentها؛ ${Number(
                                            data.usage.agents.active || 0
                                        ).toLocaleString("fa-IR")} حساب فعال`}
                                        usage={data.usage.agents}
                                    />
                                    <UsageRow
                                        title="گفتگوهای ماهانه"
                                        description="گفتگوهای جدید ایجادشده در ماه جاری"
                                        usage={data.usage.monthly_conversations}
                                    />
                                </div>
                            </section>

                            <section className="subscription-card">
                                <Header
                                    title="قابلیت‌های پلن"
                                    description="امکاناتی که بک‌اند واقعاً اجازه اجرای آن‌ها را می‌دهد"
                                />

                                <div className="subscription-feature-grid">
                                    <FeatureCard
                                        title="پایگاه دانش"
                                        description={`آیتم‌های ثبت‌شده: ${Number(
                                            data.usage.knowledge_items.used
                                        ).toLocaleString("fa-IR")}`}
                                        enabled={
                                            data.plan.features
                                                .knowledge_base_enabled
                                        }
                                    />
                                    <FeatureCard
                                        title="پیشنهاد هوشمند"
                                        description={`پیشنهادهای ماه: ${Number(
                                            data.usage.ai_suggestions_this_month
                                                .used
                                        ).toLocaleString("fa-IR")}`}
                                        enabled={
                                            data.plan.features
                                                .ai_suggestions_enabled
                                        }
                                    />
                                    <FeatureCard
                                        title="پاسخ خودکار AI"
                                        description={`پاسخ‌های خودکار ماه: ${Number(
                                            data.usage.ai_auto_replies_this_month
                                                .used
                                        ).toLocaleString("fa-IR")}`}
                                        enabled={
                                            data.plan.features
                                                .ai_auto_reply_enabled
                                        }
                                    />
                                </div>
                            </section>
                        </div>

                        <section className="subscription-card">
                            <Header
                                title="اطلاعات حساب"
                                description="وضعیت مشتری و بازه محاسبه مصرف"
                            />

                            <div className="subscription-mini-grid">
                                <MiniTile
                                    label="نام مشتری"
                                    value={data.customer.name}
                                />
                                <MiniTile
                                    label="وضعیت حساب"
                                    value={customerStatusLabel(data.customer.status)}
                                />
                                <MiniTile
                                    label="شروع بازه"
                                    value={formatDate(data.period.month_start)}
                                />
                                <MiniTile
                                    label="آخرین بروزرسانی"
                                    value={formatDate(data.period.now)}
                                />
                            </div>
                        </section>
                    </>
                )}
            </div>
        </AppShell>
    );
}

function Header({
                    title,
                    description,
                    badge,
                }: {
    title: string;
    description: string;
    badge?: string;
}) {
    return (
        <div className="subscription-card-header">
            <div>
                <h2>{title}</h2>
                <p>{description}</p>
            </div>
            {badge && <span className="subscription-chip">{badge}</span>}
        </div>
    );
}

function UsageRow({
                      title,
                      description,
                      usage,
                  }: {
    title: string;
    description: string;
    usage: UsageItem;
}) {
    const visualPercent = Math.min(Math.max(usage.percent, 0), 100);

    return (
        <article
            className={`subscription-usage-item status-${usage.status}`}
        >
            <div className="subscription-usage-top">
                <div>
                    <strong>{title}</strong>
                    <p>{description}</p>
                </div>
                <span className="subscription-usage-count">
                    {usage.used.toLocaleString("fa-IR")} /{" "}
                    {usage.limit.toLocaleString("fa-IR")}
                </span>
            </div>

            <div className="subscription-progress">
                <span style={{ width: `${visualPercent}%` }} />
            </div>

            <div className="subscription-usage-foot">
                <span>{usageStatusLabels[usage.status]}</span>
                <span>
                    {usage.over_limit
                        ? `${usage.over_by.toLocaleString(
                            "fa-IR"
                        )} بیشتر از سقف`
                        : `${usage.remaining.toLocaleString(
                            "fa-IR"
                        )} باقی‌مانده`}
                </span>
                <strong>
                    {usage.percent.toLocaleString("fa-IR", {
                        maximumFractionDigits: 1,
                    })}
                    ٪
                </strong>
            </div>
        </article>
    );
}

function FeatureCard({
                         title,
                         description,
                         enabled,
                     }: {
    title: string;
    description: string;
    enabled: boolean;
}) {
    return (
        <article
            className={`subscription-feature-card ${
                enabled ? "is-enabled" : "is-disabled"
            }`}
        >
            <div>
                <strong>{title}</strong>
                <p>{description}</p>
            </div>
            <span>{enabled ? "فعال" : "غیرفعال"}</span>
        </article>
    );
}

function MiniTile({
                      label,
                      value,
                  }: {
    label: string;
    value: string | number;
}) {
    return (
        <div className="subscription-mini-tile">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function formatDate(value: string) {
    const date = new Date(value.replace(" ", "T"));

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

type SubscriptionOverviewData = {
    subscription: null | {
        status: string;
        plan_name: string;
        starts_at: string;
        ends_at: string;
        trial_ends_at: string | null;
        days_remaining: number;
        billing_cycle: string;
        price: number;
        currency: string;
        auto_renew: boolean;
    };
    payments: Array<{
        id: number; amount: string | number; currency: string; status: string;
        payment_method: string; reference_number: string | null; paid_at: string | null; created_at: string;
    }>;
    history: Array<{id:number;plan_name:string;status:string;starts_at:string;ends_at:string}>;
};

function SubscriptionLifecycle() {
    const [overview, setOverview] = useState<SubscriptionOverviewData | null>(null);
    useEffect(() => {
        apiRequest("/customer/subscription-overview.php")
            .then(setOverview)
            .catch(() => setOverview({ subscription: null, payments: [], history: [] }));
    }, []);
    if (!overview) return <section className="subscription-card"><p className="muted">در حال دریافت وضعیت اشتراک...</p></section>;
    if (!overview.subscription) return <section className="subscription-card subscription-alert is-danger"><h2>اشتراک ثبت نشده است</h2><p>برای انجام عملیات جدید با مدیر سیستم تماس بگیرید. اطلاعات قبلی شما محفوظ است.</p></section>;
    const s=overview.subscription; const warning=s.days_remaining<=30;
    return <>
        {warning && <section className="subscription-card subscription-alert is-warning"><strong>{s.days_remaining===0?"اشتراک شما منقضی شده است.":`تنها ${s.days_remaining.toLocaleString("fa-IR")} روز تا پایان اشتراک باقی مانده است.`}</strong><p>برای جلوگیری از توقف عملیات جدید، تمدید را با مدیر سیستم هماهنگ کنید.</p></section>}
        <section className="subscription-card"><Header title="وضعیت اشتراک" description="بازه اعتبار و مشخصات قرارداد فعلی" badge={subscriptionStatusLabel(s.status)}/><div className="subscription-mini-grid"><MiniTile label="تاریخ شروع" value={formatDate(s.starts_at)}/><MiniTile label="تاریخ پایان" value={formatDate(s.ends_at)}/><MiniTile label="روزهای باقی‌مانده" value={s.days_remaining.toLocaleString("fa-IR")}/><MiniTile label="دوره پرداخت" value={billingCycleLabel(s.billing_cycle)}/><MiniTile label="مبلغ" value={formatMoney(Number(s.price), s.currency)}/><MiniTile label="تمدید خودکار" value={s.auto_renew?"فعال":"غیرفعال"}/></div></section>
        <section className="subscription-card"><Header title="آخرین پرداخت‌ها" description="سوابق پرداخت دستی ثبت‌شده"/><div className="subscription-payment-list">{overview.payments.length===0?<p className="muted">پرداختی ثبت نشده است.</p>:overview.payments.slice(0,8).map(p=><div className="subscription-payment-row" key={p.id}><strong>{Number(p.amount).toLocaleString("fa-IR")} {p.currency}</strong><span className={`subscription-record-status is-${p.status}`}>{paymentStatusLabel(p.status)}</span><span>{p.reference_number||"بدون شماره پیگیری"}</span><time>{formatDate(p.paid_at||p.created_at)}</time></div>)}</div></section>
        <section className="subscription-card"><Header title="تاریخچه تمدید و پلن" description="نسخه‌های قبلی و فعلی اشتراک"/><div className="subscription-payment-list">{overview.history.map(h=><div className="subscription-payment-row" key={h.id}><strong>{h.plan_name}</strong><span className={`subscription-record-status is-${h.status}`}>{subscriptionStatusLabel(h.status)}</span><span>{formatDate(h.starts_at)}</span><time>{formatDate(h.ends_at)}</time></div>)}</div></section>
    </>;
}

function subscriptionStatusLabel(value: string) {
    const labels: Record<string, string> = {
        trial: "آزمایشی", active: "فعال", past_due: "سررسید گذشته",
        expired: "منقضی", cancelled: "لغوشده", suspended: "تعلیق‌شده",
    };
    return labels[value] || value;
}

function paymentStatusLabel(value: string) {
    const labels: Record<string, string> = {
        pending: "در انتظار", paid: "پرداخت‌شده", failed: "ناموفق",
        refunded: "بازپرداخت‌شده", cancelled: "لغوشده",
    };
    return labels[value] || value;
}

function billingCycleLabel(value: string) {
    const labels: Record<string, string> = { monthly: "ماهانه", quarterly: "سه‌ماهه", yearly: "سالانه", manual: "دستی" };
    return labels[value] || value;
}

function customerStatusLabel(value: string) {
    const labels: Record<string, string> = { active: "فعال", inactive: "غیرفعال", suspended: "تعلیق‌شده" };
    return labels[value] || value;
}

function formatMoney(value: number, currency: string) {
    const labels: Record<string, string> = { IRR: "ریال", IRT: "تومان", USD: "دلار", EUR: "یورو" };
    return `${Number(value || 0).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} ${labels[currency] || currency}`;
}
