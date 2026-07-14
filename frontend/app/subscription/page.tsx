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
                                        title="Knowledge Base"
                                        description={`آیتم‌های ثبت‌شده: ${Number(
                                            data.usage.knowledge_items.used
                                        ).toLocaleString("fa-IR")}`}
                                        enabled={
                                            data.plan.features
                                                .knowledge_base_enabled
                                        }
                                    />
                                    <FeatureCard
                                        title="AI Suggestion"
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
                                        title="AI Auto Reply"
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
                                    value={data.customer.status}
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
