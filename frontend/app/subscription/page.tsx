// مسیر فایل: ai-chat-saas/frontend/app/subscription/page.tsx
// هدف: نمایش پلن فعلی مشتری و مصرف محدودیت‌ها

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type UsageItem = {
    used: number;
    limit: number;
    remaining: number;
    percent: number;
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
        knowledge_items: {
            used: number;
        };
        ai_suggestions_this_month: {
            used: number;
        };
    };
    period: {
        month_start: string;
        now: string;
    };
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
            setError(err instanceof Error ? err.message : "خطا در دریافت اطلاعات پلن");
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
            description="مشاهده پلن فعلی، قابلیت‌های فعال و میزان مصرف سهمیه"
            actions={
                <button
                    className="btn secondary"
                    onClick={() => loadPlanUsage(true)}
                    disabled={refreshing}
                >
                    {refreshing ? "در حال بروزرسانی..." : "بروزرسانی"}
                </button>
            }
        >
            {error && <div className="error">{error}</div>}

            {loading || !data ? (
                <section className="subscription-card">
                    <p className="muted">در حال بارگذاری اطلاعات پلن...</p>
                </section>
            ) : (
                <>
                    <section className="subscription-hero">
                        <div className="subscription-hero-top">
                            <div>
                                <span className="soft-chip primary">پلن فعلی</span>

                                <h2 className="subscription-plan-name">
                                    {data.plan.name || "بدون پلن"}
                                </h2>

                                <p className="subscription-plan-description">
                                    {data.plan.description ||
                                        "برای این پلن توضیحی ثبت نشده است. محدودیت‌ها و قابلیت‌های فعال در پایین نمایش داده شده‌اند."}
                                </p>
                            </div>

                            <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                <span
                    className={`soft-chip ${
                        data.plan.is_active ? "success" : "danger"
                    }`}
                >
                  {data.plan.is_active ? "پلن فعال" : "پلن غیرفعال"}
                </span>

                                <strong style={{ fontSize: 26 }}>
                                    {Number(data.plan.price_monthly || 0).toLocaleString("fa-IR")}
                                </strong>

                                <span className="muted">هزینه ماهانه</span>
                            </div>
                        </div>
                    </section>

                    <div className="subscription-grid">
                        <section className="subscription-card">
                            <div className="subscription-card-header">
                                <div>
                                    <h2>مصرف سهمیه</h2>
                                    <p className="muted" style={{ margin: "5px 0 0" }}>
                                        محاسبه بر اساس محدودیت‌های پلن فعلی
                                    </p>
                                </div>

                                <span className="soft-chip">ماه جاری</span>
                            </div>

                            <div className="usage-list">
                                <UsageRow
                                    title="سایت‌ها"
                                    description="تعداد سایت‌هایی که برای این مشتری ساخته شده‌اند"
                                    usage={data.usage.sites}
                                />

                                <UsageRow
                                    title="پشتیبان‌ها"
                                    description="تعداد agentهای فعال این مشتری"
                                    usage={data.usage.agents}
                                />

                                <UsageRow
                                    title="گفتگوهای ماهانه"
                                    description="تعداد گفتگوهای ساخته‌شده در ماه جاری"
                                    usage={data.usage.monthly_conversations}
                                />
                            </div>
                        </section>

                        <section className="subscription-card">
                            <div className="subscription-card-header">
                                <div>
                                    <h2>قابلیت‌های پلن</h2>
                                    <p className="muted" style={{ margin: "5px 0 0" }}>
                                        ویژگی‌هایی که برای حساب شما فعال هستند
                                    </p>
                                </div>
                            </div>

                            <div className="feature-grid">
                                <FeatureCard
                                    title="Knowledge Base"
                                    description={`آیتم‌های ثبت‌شده: ${data.usage.knowledge_items.used}`}
                                    enabled={data.plan.features.knowledge_base_enabled}
                                />

                                <FeatureCard
                                    title="AI Suggestion"
                                    description={`پیشنهادهای ساخته‌شده این ماه: ${data.usage.ai_suggestions_this_month.used}`}
                                    enabled={data.plan.features.ai_suggestions_enabled}
                                />

                                <FeatureCard
                                    title="AI Auto Reply"
                                    description="پاسخ خودکار کامل؛ فعلاً برای نسخه‌های بعدی آماده می‌شود"
                                    enabled={data.plan.features.ai_auto_reply_enabled}
                                />
                            </div>
                        </section>
                    </div>

                    <section className="subscription-card" style={{ marginTop: 18 }}>
                        <div className="subscription-card-header">
                            <div>
                                <h2>اطلاعات حساب</h2>
                                <p className="muted" style={{ margin: "5px 0 0" }}>
                                    وضعیت کلی مشتری و بازه محاسبه مصرف
                                </p>
                            </div>
                        </div>

                        <div className="customer-mini-grid">
                            <MiniTile label="نام مشتری" value={data.customer.name} />
                            <MiniTile label="وضعیت حساب" value={data.customer.status} />
                            <MiniTile label="شروع بازه مصرف" value={data.period.month_start} />
                            <MiniTile label="آخرین بروزرسانی" value={data.period.now} />
                        </div>
                    </section>
                </>
            )}
        </AppShell>
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
    const isNearLimit = usage.percent >= 80;
    const isFull = usage.percent >= 100;

    return (
        <div className="usage-item">
            <div className="usage-item-top">
                <div>
                    <strong>{title}</strong>
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                        {description}
                    </p>
                </div>

                <span className={`soft-chip ${isFull ? "danger" : isNearLimit ? "" : "success"}`}>
          {usage.used} / {usage.limit}
        </span>
            </div>

            <div className="usage-progress">
                <div
                    className="usage-progress-fill"
                    style={{
                        width: `${usage.percent}%`,
                        background: isFull
                            ? "linear-gradient(135deg, #ef4444, #f97316)"
                            : isNearLimit
                                ? "linear-gradient(135deg, #f59e0b, #f97316)"
                                : undefined,
                    }}
                />
            </div>

            <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
                باقی‌مانده: {usage.remaining}
            </p>
        </div>
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
        <div className="feature-card">
            <div>
                <strong>{title}</strong>
                <p>{description}</p>
            </div>

            <span className={`soft-chip ${enabled ? "success" : "danger"}`}>
        {enabled ? "فعال" : "غیرفعال"}
      </span>
        </div>
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
        <div className="customer-mini-tile">
            <div className="customer-mini-label">{label}</div>
            <div className="customer-mini-value">{value}</div>
        </div>
    );
}