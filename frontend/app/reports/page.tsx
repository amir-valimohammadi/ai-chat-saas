// مسیر فایل: ai-chat-saas/frontend/app/reports/page.tsx
// هدف: داشبورد گزارش‌های مدیریتی برای customer_admin

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type ReportSite = {
    id: number;
    name: string;
    domain: string;
};

type DailyPoint = {
    date: string;
    label: string;
    total: number;
};

type StatusCount = {
    status: string;
    label: string;
    total: number;
};

type SiteCount = {
    id: number;
    name: string;
    total: number;
};

type RecentConversation = {
    id: number;
    status: string;
    site_name: string;
    visitor_name: string | null;
    visitor_phone: string | null;
    visitor_email: string | null;
    last_message: string | null;
    last_message_at: string | null;
    created_at: string;
};

type ReportData = {
    range: {
        days: number;
        start_date: string;
        end_date: string;
    };
    sites: ReportSite[];
    metrics: {
        total_conversations: number;
        today_conversations: number;
        active_conversations: number;
        closed_conversations: number;
        total_messages: number;
        total_attachments: number;
        avg_first_response_minutes: number | null;
    };
    daily: DailyPoint[];
    status_counts: StatusCount[];
    site_counts: SiteCount[];
    recent_conversations: RecentConversation[];
};

const statusLabels: Record<string, string> = {
    new: "جدید",
    open: "باز",
    in_progress: "در حال انجام",
    waiting_customer: "در انتظار مشتری",
    follow_up: "نیاز به پیگیری",
    pending: "در انتظار",
    closed: "بسته‌شده",
};

const statusColors: Record<string, string> = {
    new: "#4f46e5",
    open: "#16a34a",
    in_progress: "#2563eb",
    waiting_customer: "#d97706",
    follow_up: "#dc2626",
    pending: "#d97706",
    closed: "#64748b",
};

export default function ReportsPage() {
    const router = useRouter();

    const [data, setData] = useState<ReportData | null>(null);
    const [days, setDays] = useState("7");
    const [siteId, setSiteId] = useState("0");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    async function loadReports(nextDays = days, nextSiteId = siteId) {
        try {
            setLoading(true);
            setError("");

            const query = new URLSearchParams({
                days: nextDays,
                site_id: nextSiteId,
            });

            const response = await apiRequest(`/customer/reports-summary.php?${query}`);

            setData(response);
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت گزارش‌ها");
        } finally {
            setLoading(false);
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

        loadReports();
    }, [router]);

    function handleDaysChange(value: string) {
        setDays(value);
        loadReports(value, siteId);
    }

    function handleSiteChange(value: string) {
        setSiteId(value);
        loadReports(days, value);
    }

    const maxDaily = useMemo(() => {
        if (!data || data.daily.length === 0) {
            return 1;
        }

        return Math.max(...data.daily.map((item) => item.total), 1);
    }, [data]);

    const totalDailyConversations = useMemo(() => {
        if (!data) {
            return 0;
        }

        return data.daily.reduce((sum, item) => sum + item.total, 0);
    }, [data]);

    const averageDailyConversations = useMemo(() => {
        if (!data || data.daily.length === 0) {
            return 0;
        }

        return Math.round((totalDailyConversations / data.daily.length) * 10) / 10;
    }, [data, totalDailyConversations]);

    const totalSiteConversations = useMemo(() => {
        if (!data) {
            return 0;
        }

        return data.site_counts.reduce((sum, item) => sum + item.total, 0);
    }, [data]);

    const selectedSiteName = useMemo(() => {
        if (!data || siteId === "0") {
            return "همه سایت‌ها";
        }

        return data.sites.find((site) => String(site.id) === siteId)?.name || "سایت انتخاب‌شده";
    }, [data, siteId]);

    const closeRate = useMemo(() => {
        if (!data || data.metrics.total_conversations === 0) {
            return 0;
        }

        return Math.round(
            (data.metrics.closed_conversations / data.metrics.total_conversations) * 100
        );
    }, [data]);

    return (
        <AppShell
            title="گزارش‌ها"
            kicker="Reports"
            description="نمای مدیریتی از عملکرد چت، گفتگوها، پیام‌ها و فعالیت پشتیبانی"
            actions={
                <button
                    className="btn secondary"
                    type="button"
                    onClick={() => loadReports(days, siteId)}
                    disabled={loading}
                >
                    {loading ? "در حال بروزرسانی..." : "بروزرسانی"}
                </button>
            }
        >
            <div className="reports-shell">
                {error && <div className="error">{error}</div>}

                <section className="reports-hero-card">
                    <div className="reports-hero-copy">
                        <span className="reports-eyebrow">Analytics Overview</span>

                        <h2>عملکرد پشتیبانی را سریع و مدیریتی ببین</h2>

                        <p>
                            این صفحه برای فهم وضعیت کلی گفتگوها طراحی شده است: حجم گفتگو،
                            پیام‌ها، سرعت پاسخ‌گویی، وضعیت‌ها، عملکرد سایت‌ها و گفتگوهای اخیر.
                        </p>
                    </div>

                    <div className="reports-filter-card">
                        <div className="reports-filter-title">
                            <span>فیلتر گزارش</span>
                            {data && <strong>{data.range.days} روز اخیر</strong>}
                        </div>

                        <label>
                            <span>بازه زمانی</span>
                            <select
                                className="input"
                                value={days}
                                onChange={(event) => handleDaysChange(event.target.value)}
                            >
                                <option value="7">۷ روز اخیر</option>
                                <option value="30">۳۰ روز اخیر</option>
                                <option value="90">۹۰ روز اخیر</option>
                            </select>
                        </label>

                        <label>
                            <span>سایت</span>
                            <select
                                className="input"
                                value={siteId}
                                onChange={(event) => handleSiteChange(event.target.value)}
                                disabled={!data}
                            >
                                <option value="0">همه سایت‌ها</option>

                                {data?.sites.map((site) => (
                                    <option key={site.id} value={site.id}>
                                        {site.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <div className="reports-selected-scope">
                            <span>محدوده فعلی</span>
                            <strong>{selectedSiteName}</strong>
                        </div>
                    </div>
                </section>

                {loading && !data ? (
                    <section className="reports-loading-card">
                        <div className="reports-skeleton-row" />
                        <div className="reports-skeleton-row small" />
                    </section>
                ) : data ? (
                    <>
                        <section className="reports-kpi-grid">
                            <ReportKpiCard
                                label="کل گفتگوها"
                                value={data.metrics.total_conversations}
                                hint="مجموع گفتگوهای بازه انتخاب‌شده"
                                tone="primary"
                            />

                            <ReportKpiCard
                                label="گفتگوهای امروز"
                                value={data.metrics.today_conversations}
                                hint="گفتگوهایی که امروز ایجاد شده‌اند"
                            />

                            <ReportKpiCard
                                label="گفتگوهای فعال"
                                value={data.metrics.active_conversations}
                                hint="گفتگوهایی که هنوز در جریان هستند"
                                tone="warning"
                            />

                            <ReportKpiCard
                                label="بسته‌شده"
                                value={data.metrics.closed_conversations}
                                hint={`نرخ بسته‌شدن: ${closeRate}٪`}
                                tone="success"
                            />

                            <ReportKpiCard
                                label="کل پیام‌ها"
                                value={data.metrics.total_messages}
                                hint="پیام‌های ثبت‌شده در گفتگوها"
                            />

                            <ReportKpiCard
                                label="فایل‌ها"
                                value={data.metrics.total_attachments}
                                hint="فایل‌های ارسال‌شده در گفتگوها"
                            />

                            <ReportKpiCard
                                label="میانگین پاسخ اول"
                                value={
                                    data.metrics.avg_first_response_minutes === null
                                        ? "-"
                                        : `${data.metrics.avg_first_response_minutes} دقیقه`
                                }
                                hint="زمان تقریبی اولین پاسخ پشتیبان"
                                tone="primary"
                            />
                        </section>

                        <section className="reports-main-grid">
                            <article className="reports-card reports-trend-card">
                                <ReportsCardHead
                                    kicker="Trend"
                                    title="روند گفتگوها"
                                    description="تعداد گفتگوهای ایجادشده در بازه انتخاب‌شده"
                                />

                                <TrendChart
                                    points={data.daily}
                                    max={maxDaily}
                                    total={totalDailyConversations}
                                    average={averageDailyConversations}
                                />
                            </article>

                            <article className="reports-card">
                                <ReportsCardHead
                                    kicker="Status"
                                    title="وضعیت گفتگوها"
                                    description="تقسیم‌بندی گفتگوها بر اساس وضعیت"
                                />

                                {data.status_counts.length === 0 ? (
                                    <EmptyMini text="هنوز داده‌ای برای وضعیت‌ها وجود ندارد." />
                                ) : (
                                    <div className="reports-status-list">
                                        {data.status_counts.map((item) => (
                                            <StatusRow
                                                key={item.status}
                                                item={item}
                                                total={data.metrics.total_conversations}
                                            />
                                        ))}
                                    </div>
                                )}
                            </article>
                        </section>

                        <section className="reports-bottom-grid">
                            <article className="reports-card">
                                <ReportsCardHead
                                    kicker="Sites"
                                    title="عملکرد سایت‌ها"
                                    description="تعداد گفتگوها به تفکیک سایت"
                                />

                                {data.site_counts.length === 0 ? (
                                    <EmptyMini text="هنوز سایتی برای گزارش وجود ندارد." />
                                ) : (
                                    <div className="reports-site-list">
                                        {data.site_counts.map((site) => (
                                            <SitePerformanceRow
                                                key={site.id}
                                                site={site}
                                                total={totalSiteConversations}
                                            />
                                        ))}
                                    </div>
                                )}
                            </article>

                            <article className="reports-card reports-recent-card">
                                <ReportsCardHead
                                    kicker="Recent"
                                    title="آخرین گفتگوها"
                                    description="گفتگوهای اخیر در بازه انتخاب‌شده"
                                />

                                {data.recent_conversations.length === 0 ? (
                                    <EmptyMini text="هنوز گفتگویی ثبت نشده است." />
                                ) : (
                                    <div className="reports-recent-list">
                                        {data.recent_conversations.map((item) => (
                                            <RecentConversationRow
                                                key={item.id}
                                                item={item}
                                                onOpen={() =>
                                                    router.push(`/conversations/${item.id}`)
                                                }
                                            />
                                        ))}
                                    </div>
                                )}
                            </article>
                        </section>
                    </>
                ) : null}
            </div>
        </AppShell>
    );
}

function ReportKpiCard({
                           label,
                           value,
                           hint,
                           tone = "default",
                       }: {
    label: string;
    value: string | number;
    hint: string;
    tone?: "default" | "primary" | "success" | "warning";
}) {
    return (
        <article className={`reports-kpi-card tone-${tone}`}>
            <strong>{value}</strong>
            <span>{label}</span>
            <p>{hint}</p>
        </article>
    );
}

function ReportsCardHead({
                             kicker,
                             title,
                             description,
                         }: {
    kicker: string;
    title: string;
    description: string;
}) {
    return (
        <div className="reports-card-head">
            <div>
                <span className="reports-section-kicker">{kicker}</span>
                <h2>{title}</h2>
                <p>{description}</p>
            </div>
        </div>
    );
}

function TrendChart({
                        points,
                        max,
                        total,
                        average,
                    }: {
    points: DailyPoint[];
    max: number;
    total: number;
    average: number;
}) {
    const width = 760;
    const height = 250;
    const paddingX = 34;
    const paddingY = 30;
    const chartWidth = width - paddingX * 2;
    const chartHeight = height - paddingY * 2;
    const safeMax = Math.max(max, 1);

    const coordinates = points.map((point, index) => {
        const x =
            points.length === 1
                ? width / 2
                : paddingX + (index / (points.length - 1)) * chartWidth;

        const y = paddingY + chartHeight - (point.total / safeMax) * chartHeight;

        return {
            ...point,
            x,
            y,
        };
    });

    const linePath =
        coordinates.length > 0
            ? coordinates
                .map((point, index) =>
                    index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
                )
                .join(" ")
            : "";

    const areaPath =
        coordinates.length > 0
            ? `${linePath} L ${
                coordinates[coordinates.length - 1].x
            } ${height - paddingY} L ${coordinates[0].x} ${height - paddingY} Z`
            : "";

    if (points.length === 0) {
        return <EmptyMini text="هنوز داده‌ای برای نمودار روند وجود ندارد." />;
    }

    return (
        <div className="reports-chart-shell">
            <div className="reports-chart-summary">
                <div>
                    <strong>{total}</strong>
                    <span>مجموع گفتگوها</span>
                </div>

                <div>
                    <strong>{average}</strong>
                    <span>میانگین روزانه</span>
                </div>
            </div>

            <div className="reports-chart-box">
                <svg
                    viewBox={`0 0 ${width} ${height}`}
                    className="reports-trend-svg"
                    role="img"
                    aria-label="نمودار روند گفتگوها"
                >
                    <defs>
                        <linearGradient id="reportsTrendLine" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#0ea5e9" />
                            <stop offset="55%" stopColor="#4f46e5" />
                            <stop offset="100%" stopColor="#7c3aed" />
                        </linearGradient>

                        <linearGradient id="reportsTrendArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.24" />
                            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    {[0, 1, 2, 3].map((line) => {
                        const y = paddingY + (line / 3) * chartHeight;

                        return (
                            <line
                                key={line}
                                x1={paddingX}
                                x2={width - paddingX}
                                y1={y}
                                y2={y}
                                stroke="#e5e7eb"
                                strokeWidth="1"
                                strokeDasharray="5 7"
                            />
                        );
                    })}

                    {areaPath && <path d={areaPath} fill="url(#reportsTrendArea)" />}

                    {linePath && (
                        <path
                            d={linePath}
                            fill="none"
                            stroke="url(#reportsTrendLine)"
                            strokeWidth="5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    )}

                    {coordinates.map((point) => (
                        <g key={point.date}>
                            <circle
                                cx={point.x}
                                cy={point.y}
                                r="7"
                                fill="#ffffff"
                                stroke="#4f46e5"
                                strokeWidth="4"
                            />

                            {point.total > 0 && (
                                <text
                                    x={point.x}
                                    y={point.y - 15}
                                    textAnchor="middle"
                                    fontSize="13"
                                    fontWeight="850"
                                    fill="#475569"
                                >
                                    {point.total}
                                </text>
                            )}

                            <text
                                x={point.x}
                                y={height - 5}
                                textAnchor="middle"
                                fontSize="12"
                                fill="#94a3b8"
                            >
                                {point.label}
                            </text>
                        </g>
                    ))}
                </svg>
            </div>
        </div>
    );
}

function StatusRow({ item, total }: { item: StatusCount; total: number }) {
    const percent = total > 0 ? Math.round((item.total / total) * 100) : 0;
    const color = statusColors[item.status] || "#64748b";

    return (
        <div className="reports-status-row">
            <div className="reports-status-top">
                <div>
                    <span style={{ background: color }} />
                    <strong>{item.label || statusLabels[item.status] || item.status}</strong>
                </div>

                <b>{item.total}</b>
            </div>

            <div className="reports-progress">
                <div style={{ width: `${percent}%`, background: color }} />
            </div>

            <small>{percent}٪ از کل گفتگوها</small>
        </div>
    );
}

function SitePerformanceRow({ site, total }: { site: SiteCount; total: number }) {
    const percent = total > 0 ? Math.round((site.total / total) * 100) : 0;

    return (
        <div className="reports-site-row">
            <div className="reports-site-top">
                <strong>{site.name}</strong>
                <span>{site.total}</span>
            </div>

            <div className="reports-progress">
                <div style={{ width: `${percent}%` }} />
            </div>

            <small>{percent}٪ از گفتگوهای سایت‌ها</small>
        </div>
    );
}

function RecentConversationRow({
                                   item,
                                   onOpen,
                               }: {
    item: RecentConversation;
    onOpen: () => void;
}) {
    const contact = item.visitor_phone || item.visitor_email || "بدون تماس";

    return (
        <article className="reports-recent-row" onClick={onOpen}>
            <div className="reports-recent-main">
                <div className="reports-recent-title">
                    <strong>{item.visitor_name || "کاربر بدون نام"}</strong>
                    <span>#{item.id}</span>
                </div>

                <p>{truncateText(item.last_message || "بدون پیام", 120)}</p>

                <div className="reports-recent-meta">
                    <span>{item.site_name}</span>
                    <span>{contact}</span>
                    <span>{item.last_message_at || item.created_at}</span>
                </div>
            </div>

            <span className={`reports-status-chip status-${item.status}`}>
                {statusLabels[item.status] || item.status}
            </span>
        </article>
    );
}

function EmptyMini({ text }: { text: string }) {
    return (
        <div className="reports-empty-mini">
            <p>{text}</p>
        </div>
    );
}

function truncateText(text: string, maxLength: number) {
    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength).trim()}...`;
}