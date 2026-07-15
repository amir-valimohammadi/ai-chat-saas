// مسیر فایل: ai-chat-saas/frontend/app/super-admin/dashboard/page.tsx
// هدف: داشبورد داده‌محور و حرفه‌ای برای Super Admin

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type Summary = {
    tenants_total: number;
    tenants_active: number;
    tenants_inactive: number;
    tenants_suspended: number;
    sites_total: number;
    sites_active: number;
    users_total: number;
    agents_total: number;
    conversations_today: number;
    messages_today: number;
    ai_requests_today: number;
    ai_no_answer_today: number;
    ai_success_rate: number;
};

type Health = {
    database_status: "online" | "offline";
    active_plans: number;
    inactive_sites: number;
    online_support_users: number;
};

type TrendItem = {
    date: string;
    conversations: number;
    messages: number;
    ai_requests: number;
};

type Tenant = {
    id: number;
    name: string;
    owner_name: string | null;
    owner_email: string | null;
    status: "active" | "inactive" | "suspended";
    plan_name: string | null;
    sites_count: number;
    users_count: number;
    created_at: string;
};

type PlanAlert = {
    id: number;
    name: string;
    plan_name: string;
    monthly_conversations: number;
    limit: number;
    usage_percent: number;
    level: "warning" | "danger" | "critical";
};

type DashboardData = {
    generated_at: string;
    summary: Summary;
    health: Health;
    trend: TrendItem[];
    latest_tenants: Tenant[];
    plan_alerts: PlanAlert[];
};

type IconName =
    | "users"
    | "sites"
    | "messages"
    | "activity"
    | "spark"
    | "agents"
    | "plus"
    | "refresh"
    | "arrow"
    | "plans"
    | "bell"
    | "database"
    | "check";

const numberFormatter = new Intl.NumberFormat("fa-IR");
const percentFormatter = new Intl.NumberFormat("fa-IR", {
    maximumFractionDigits: 1,
});

export default function SuperAdminDashboardPage() {
    const router = useRouter();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

    const loadDashboard = useCallback(async (silent = false) => {
        try {
            setError("");

            if (silent) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            const response = await apiRequest("/super-admin/dashboard-stats.php");
            setData(response as DashboardData);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "دریافت اطلاعات داشبورد با خطا مواجه شد."
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        const user = getAuthUser() as { role?: string } | null;

        if (!user) {
            router.push("/login");
            return;
        }

        if (user.role !== "super_admin") {
            router.push("/dashboard");
            return;
        }

        loadDashboard();
    }, [loadDashboard, router]);

    return (
        <AppShell
            title="داشبورد سوپر ادمین"
            kicker="Platform overview"
            description="نمای زنده از مشتری‌ها، سایت‌ها، گفتگوها و عملکرد هوش مصنوعی"
            actions={
                <div className="sa-dashboard-header-actions">
                    <button
                        className="btn secondary"
                        type="button"
                        onClick={() => loadDashboard(true)}
                        disabled={loading || refreshing}
                    >
                        <Icon name="refresh" />
                        {refreshing ? "در حال بروزرسانی" : "بروزرسانی آمار"}
                    </button>

                    <Link className="btn" href="/super-admin/customers/create">
                        <Icon name="plus" />
                        ایجاد مشتری
                    </Link>
                </div>
            }
        >
            <main className="sa-dashboard">
                {error && (
                    <div className="sa-dashboard-alert" role="alert">
                        <div>
                            <strong>بارگذاری داشبورد انجام نشد</strong>
                            <span>{error}</span>
                        </div>

                        <button type="button" onClick={() => loadDashboard()}>
                            تلاش دوباره
                        </button>
                    </div>
                )}

                {loading && !data ? (
                    <DashboardSkeleton />
                ) : data ? (
                    <DashboardContent data={data} />
                ) : null}
            </main>
        </AppShell>
    );
}

function DashboardContent({ data }: { data: DashboardData }) {
    const maxActivity = useMemo(() => {
        return Math.max(
            1,
            ...data.trend.map((item) =>
                Math.max(item.conversations, item.messages, item.ai_requests)
            )
        );
    }, [data.trend]);

    const activeTenantPercent = data.summary.tenants_total
        ? Math.round(
            (data.summary.tenants_active / data.summary.tenants_total) * 100
        )
        : 0;

    return (
        <>
            <section className="sa-dashboard-overview">
                <div className="sa-dashboard-overview-copy">
                    <div className="sa-dashboard-overview-kicker">
                        <span className="sa-dashboard-live-dot" />
                        اطلاعات زنده پلتفرم
                    </div>

                    <h2>وضعیت کسب‌وکار و عملیات پلتفرم در یک نگاه</h2>
                    <p>
                        داده‌های این صفحه مستقیماً از مشتری‌ها، سایت‌ها، گفتگوها، پیام‌ها
                        و گزارش‌های AI دریافت می‌شوند.
                    </p>

                    <div className="sa-dashboard-overview-links">
                        <Link href="/super-admin/customers">
                            مدیریت مشتری‌ها
                            <Icon name="arrow" />
                        </Link>
                        <Link href="/super-admin/sites">
                            بررسی سایت‌ها
                            <Icon name="arrow" />
                        </Link>
                    </div>
                </div>

                <div className="sa-dashboard-overview-score">
                    <div
                        className="sa-dashboard-score-ring"
                        style={{
                            background: `radial-gradient(circle at center, #111827 57%, transparent 58%), conic-gradient(#22c55e 0 ${activeTenantPercent}%, rgba(255, 255, 255, 0.12) ${activeTenantPercent}% 100%)`,
                        }}
                    >
                        <strong>{numberFormatter.format(activeTenantPercent)}٪</strong>
                        <span>مشتری فعال</span>
                    </div>

                    <div className="sa-dashboard-score-meta">
                        <span>آخرین بروزرسانی</span>
                        <strong>{formatDateTime(data.generated_at)}</strong>
                    </div>
                </div>
            </section>

            <section className="sa-dashboard-metrics" aria-label="آمار اصلی پلتفرم">
                <MetricCard
                    icon="users"
                    label="کل مشتری‌ها"
                    value={data.summary.tenants_total}
                    hint={`${numberFormatter.format(data.summary.tenants_active)} حساب فعال`}
                    tone="primary"
                />
                <MetricCard
                    icon="sites"
                    label="سایت‌های ثبت‌شده"
                    value={data.summary.sites_total}
                    hint={`${numberFormatter.format(data.summary.sites_active)} سایت فعال`}
                    tone="violet"
                />
                <MetricCard
                    icon="messages"
                    label="گفتگوهای امروز"
                    value={data.summary.conversations_today}
                    hint={`${numberFormatter.format(data.summary.messages_today)} پیام امروز`}
                    tone="cyan"
                />
                <MetricCard
                    icon="spark"
                    label="درخواست‌های AI امروز"
                    value={data.summary.ai_requests_today}
                    hint={`${percentFormatter.format(data.summary.ai_success_rate)}٪ پاسخ قابل استفاده`}
                    tone="amber"
                />
                <MetricCard
                    icon="agents"
                    label="پشتیبان‌های فعال"
                    value={data.summary.agents_total}
                    hint={`${numberFormatter.format(data.health.online_support_users)} نفر آنلاین`}
                    tone="green"
                />
                <MetricCard
                    icon="activity"
                    label="پاسخ بدون نتیجه"
                    value={data.summary.ai_no_answer_today}
                    hint="نیازمند تکمیل پایگاه دانش"
                    tone="rose"
                />
            </section>

            <div className="sa-dashboard-primary-grid">
                <section className="sa-dashboard-panel sa-dashboard-activity-panel">
                    <PanelHeader
                        eyebrow="روند هفت روزه"
                        title="فعالیت پلتفرم"
                        description="مقایسه گفتگوها، پیام‌ها و درخواست‌های AI در هفت روز اخیر"
                        action={
                            <Link href="/super-admin/customers">
                                مشاهده مشتری‌ها
                                <Icon name="arrow" />
                            </Link>
                        }
                    />

                    <div className="sa-dashboard-chart-legend" aria-hidden="true">
                        <span className="is-conversation">گفتگو</span>
                        <span className="is-message">پیام</span>
                        <span className="is-ai">درخواست AI</span>
                    </div>

                    <div
                        className="sa-dashboard-chart"
                        role="img"
                        aria-label="نمودار فعالیت هفت روز اخیر پلتفرم"
                    >
                        {data.trend.map((item) => (
                            <div className="sa-dashboard-chart-column" key={item.date}>
                                <div className="sa-dashboard-chart-values">
                                    <span
                                        className="is-conversation"
                                        style={{
                                            height: chartHeight(item.conversations, maxActivity),
                                        }}
                                        title={`${numberFormatter.format(item.conversations)} گفتگو`}
                                    />
                                    <span
                                        className="is-message"
                                        style={{ height: chartHeight(item.messages, maxActivity) }}
                                        title={`${numberFormatter.format(item.messages)} پیام`}
                                    />
                                    <span
                                        className="is-ai"
                                        style={{
                                            height: chartHeight(item.ai_requests, maxActivity),
                                        }}
                                        title={`${numberFormatter.format(item.ai_requests)} درخواست AI`}
                                    />
                                </div>
                                <small>{formatDayLabel(item.date)}</small>
                            </div>
                        ))}
                    </div>
                </section>

                <aside className="sa-dashboard-panel sa-dashboard-health-panel">
                    <PanelHeader
                        eyebrow="سلامت سیستم"
                        title="وضعیت عملیاتی"
                        description="شاخص‌های مهم برای پایش سریع سرویس"
                    />

                    <div className="sa-dashboard-health-list">
                        <HealthRow
                            icon="database"
                            label="اتصال دیتابیس"
                            value={data.health.database_status === "online" ? "متصل" : "قطع"}
                            status={
                                data.health.database_status === "online"
                                    ? "success"
                                    : "danger"
                            }
                        />
                        <HealthRow
                            icon="plans"
                            label="پلن‌های فعال"
                            value={numberFormatter.format(data.health.active_plans)}
                            status="neutral"
                        />
                        <HealthRow
                            icon="agents"
                            label="پشتیبان آنلاین"
                            value={numberFormatter.format(
                                data.health.online_support_users
                            )}
                            status="success"
                        />
                        <HealthRow
                            icon="sites"
                            label="سایت غیرفعال"
                            value={numberFormatter.format(data.health.inactive_sites)}
                            status={
                                data.health.inactive_sites > 0 ? "warning" : "success"
                            }
                        />
                    </div>

                    <div className="sa-dashboard-health-summary">
                        <Icon name="check" />
                        <div>
                            <strong>دسترسی مدیریتی آماده است</strong>
                            <span>
                                API آمار و دیتابیس پاسخ‌گو هستند و اطلاعات با موفقیت
                                دریافت شده است.
                            </span>
                        </div>
                    </div>
                </aside>
            </div>

            <div className="sa-dashboard-secondary-grid">
                <section className="sa-dashboard-panel">
                    <PanelHeader
                        eyebrow="مشتری‌های جدید"
                        title="آخرین حساب‌های ثبت‌شده"
                        description="نمای سریع از مشتری، پلن و منابع اختصاص‌یافته"
                        action={
                            <Link href="/super-admin/customers">
                                مشاهده همه
                                <Icon name="arrow" />
                            </Link>
                        }
                    />

                    {data.latest_tenants.length > 0 ? (
                        <div className="sa-dashboard-tenant-list">
                            {data.latest_tenants.map((tenant) => (
                                <TenantRow tenant={tenant} key={tenant.id} />
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            title="هنوز مشتری‌ای ثبت نشده است"
                            description="اولین مشتری را ایجاد کن تا اطلاعات آن در این بخش نمایش داده شود."
                            href="/super-admin/customers/create"
                            action="ایجاد مشتری"
                        />
                    )}
                </section>

                <section className="sa-dashboard-panel">
                    <PanelHeader
                        eyebrow="هشدار مصرف"
                        title="نزدیک محدودیت پلن"
                        description="حساب‌هایی که مصرف ماهانه آن‌ها از ۷۰ درصد عبور کرده است"
                        action={
                            <Link href="/super-admin/plans">
                                مدیریت پلن‌ها
                                <Icon name="arrow" />
                            </Link>
                        }
                    />

                    {data.plan_alerts.length > 0 ? (
                        <div className="sa-dashboard-plan-alerts">
                            {data.plan_alerts.map((alert) => (
                                <PlanUsageRow alert={alert} key={alert.id} />
                            ))}
                        </div>
                    ) : (
                        <div className="sa-dashboard-safe-state">
                            <Icon name="check" />
                            <div>
                                <strong>مصرف همه حساب‌ها در محدوده امن است</strong>
                                <span>
                                    هیچ مشتری فعالی بیشتر از ۷۰ درصد سقف ماهانه خود مصرف
                                    نکرده است.
                                </span>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            <section className="sa-dashboard-quick-section">
                <div className="sa-dashboard-quick-heading">
                    <div>
                        <span>دسترسی سریع</span>
                        <h2>عملیات پرتکرار مدیریت پلتفرم</h2>
                    </div>
                    <p>مسیرهای اصلی بدون جست‌وجو و تنها با یک کلیک در دسترس هستند.</p>
                </div>

                <div className="sa-dashboard-quick-grid">
                    <QuickAction
                        href="/super-admin/customers/create"
                        icon="plus"
                        title="ایجاد مشتری"
                        description="ساخت حساب، مدیر و سایت اولیه"
                    />
                    <QuickAction
                        href="/super-admin/customers"
                        icon="users"
                        title="مدیریت مشتری‌ها"
                        description="وضعیت، پلن و جزئیات حساب‌ها"
                    />
                    <QuickAction
                        href="/super-admin/sites"
                        icon="sites"
                        title="مدیریت سایت‌ها"
                        description="دامنه، ویجت و وضعیت اتصال"
                    />
                    <QuickAction
                        href="/super-admin/plans"
                        icon="plans"
                        title="پلن‌ها"
                        description="محدودیت‌ها و قابلیت‌های سرویس"
                    />
                    <QuickAction
                        href="/super-admin/announcements"
                        icon="bell"
                        title="اعلان‌ها"
                        description="ارسال پیام به مشتریان پلتفرم"
                    />
                </div>
            </section>
        </>
    );
}

function MetricCard({
                        icon,
                        label,
                        value,
                        hint,
                        tone,
                    }: {
    icon: IconName;
    label: string;
    value: number;
    hint: string;
    tone: "primary" | "violet" | "cyan" | "amber" | "green" | "rose";
}) {
    return (
        <article className={`sa-dashboard-metric is-${tone}`}>
            <div className="sa-dashboard-metric-top">
                <div className="sa-dashboard-metric-icon">
                    <Icon name={icon} />
                </div>
                <span>{label}</span>
            </div>
            <strong>{numberFormatter.format(value)}</strong>
            <small>{hint}</small>
        </article>
    );
}

function PanelHeader({
                         eyebrow,
                         title,
                         description,
                         action,
                     }: {
    eyebrow: string;
    title: string;
    description: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="sa-dashboard-panel-head">
            <div>
                <span>{eyebrow}</span>
                <h2>{title}</h2>
                <p>{description}</p>
            </div>
            {action && <div className="sa-dashboard-panel-action">{action}</div>}
        </div>
    );
}

function HealthRow({
                       icon,
                       label,
                       value,
                       status,
                   }: {
    icon: IconName;
    label: string;
    value: string;
    status: "success" | "warning" | "danger" | "neutral";
}) {
    return (
        <div className="sa-dashboard-health-row">
            <div>
                <span className={`sa-dashboard-health-icon is-${status}`}>
                    <Icon name={icon} />
                </span>
                <strong>{label}</strong>
            </div>
            <b className={`is-${status}`}>{value}</b>
        </div>
    );
}

function TenantRow({ tenant }: { tenant: Tenant }) {
    return (
        <Link
            className="sa-dashboard-tenant-row"
            href={`/super-admin/customers/${tenant.id}`}
        >
            <div className="sa-dashboard-tenant-avatar">
                {getInitials(tenant.name)}
            </div>

            <div className="sa-dashboard-tenant-main">
                <strong>{tenant.name}</strong>
                <span>{tenant.owner_name || tenant.owner_email || "بدون مالک ثبت‌شده"}</span>
            </div>

            <div className="sa-dashboard-tenant-meta">
                <span>{tenant.plan_name || "بدون پلن"}</span>
                <small>
                    {numberFormatter.format(tenant.sites_count)} سایت ·{" "}
                    {numberFormatter.format(tenant.users_count)} کاربر
                </small>
            </div>

            <StatusBadge status={tenant.status} />
            <Icon name="arrow" />
        </Link>
    );
}

function StatusBadge({ status }: { status: Tenant["status"] }) {
    const labels: Record<Tenant["status"], string> = {
        active: "فعال",
        inactive: "غیرفعال",
        suspended: "تعلیق‌شده",
    };

    return (
        <span className={`sa-dashboard-status is-${status}`}>{labels[status]}</span>
    );
}

function PlanUsageRow({ alert }: { alert: PlanAlert }) {
    const cappedPercent = Math.min(alert.usage_percent, 100);

    return (
        <Link
            className={`sa-dashboard-plan-row is-${alert.level}`}
            href={`/super-admin/customers/${alert.id}`}
        >
            <div className="sa-dashboard-plan-row-top">
                <div>
                    <strong>{alert.name}</strong>
                    <span>{alert.plan_name}</span>
                </div>
                <b>{percentFormatter.format(alert.usage_percent)}٪</b>
            </div>

            <div className="sa-dashboard-progress" aria-hidden="true">
                <span style={{ width: `${cappedPercent}%` }} />
            </div>

            <small>
                {numberFormatter.format(alert.monthly_conversations)} از{" "}
                {numberFormatter.format(alert.limit)} گفتگو
            </small>
        </Link>
    );
}

function QuickAction({
                         href,
                         icon,
                         title,
                         description,
                     }: {
    href: string;
    icon: IconName;
    title: string;
    description: string;
}) {
    return (
        <Link className="sa-dashboard-quick-card" href={href}>
            <span>
                <Icon name={icon} />
            </span>
            <div>
                <strong>{title}</strong>
                <small>{description}</small>
            </div>
            <Icon name="arrow" />
        </Link>
    );
}

function EmptyState({
                        title,
                        description,
                        href,
                        action,
                    }: {
    title: string;
    description: string;
    href: string;
    action: string;
}) {
    return (
        <div className="sa-dashboard-empty">
            <span>
                <Icon name="users" />
            </span>
            <strong>{title}</strong>
            <p>{description}</p>
            <Link href={href}>{action}</Link>
        </div>
    );
}

function DashboardSkeleton() {
    return (
        <div className="sa-dashboard-skeleton" aria-label="در حال بارگذاری داشبورد">
            <div className="sa-dashboard-skeleton-hero" />
            <div className="sa-dashboard-skeleton-metrics">
                {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} />
                ))}
            </div>
            <div className="sa-dashboard-skeleton-panels">
                <div />
                <div />
            </div>
        </div>
    );
}

function Icon({ name }: { name: IconName }) {
    const paths: Record<IconName, React.ReactNode> = {
        users: (
            <>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </>
        ),
        sites: (
            <>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
            </>
        ),
        messages: (
            <>
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                <path d="M8 9h8M8 13h5" />
            </>
        ),
        activity: (
            <path d="M3 12h4l2.5-7 5 14 2.5-7H21" />
        ),
        spark: (
            <>
                <path d="m12 3 1.45 4.05L17.5 8.5l-4.05 1.45L12 14l-1.45-4.05L6.5 8.5l4.05-1.45L12 3Z" />
                <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
            </>
        ),
        agents: (
            <>
                <circle cx="12" cy="8" r="4" />
                <path d="M5 21a7 7 0 0 1 14 0M19 9h2v5h-2M5 9H3v5h2" />
            </>
        ),
        plus: <path d="M12 5v14M5 12h14" />,
        refresh: (
            <>
                <path d="M20 11a8 8 0 1 0 2 5" />
                <path d="M20 4v7h-7" />
            </>
        ),
        arrow: <path d="m14 7-5 5 5 5" />,
        plans: (
            <>
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="M7 9h10M7 13h6" />
            </>
        ),
        bell: (
            <>
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M10 21h4" />
            </>
        ),
        database: (
            <>
                <ellipse cx="12" cy="5" rx="8" ry="3" />
                <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
            </>
        ),
        check: <path d="m5 12 4 4L19 6" />,
    };

    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {paths[name]}
        </svg>
    );
}

function chartHeight(value: number, max: number) {
    if (value <= 0) {
        return "4px";
    }

    return `${Math.max(8, Math.round((value / max) * 100))}%`;
}

function formatDayLabel(value: string) {
    try {
        return new Intl.DateTimeFormat("fa-IR", { weekday: "short" }).format(
            new Date(`${value}T12:00:00`)
        );
    } catch {
        return value;
    }
}

function formatDateTime(value: string) {
    try {
        return new Intl.DateTimeFormat("fa-IR", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(value.replace(" ", "T")));
    } catch {
        return value;
    }
}

function getInitials(value: string) {
    const words = value.trim().split(/\s+/).filter(Boolean);

    return words
        .slice(0, 2)
        .map((word) => word.charAt(0))
        .join("")
        .toUpperCase();
}
