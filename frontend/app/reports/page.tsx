// مسیر فایل: ai-chat-saas/frontend/app/reports/page.tsx
// هدف: داشبورد گزارش‌های مدیریتی برای customer_admin

"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
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
    const reportRequestRef = useRef(0);

    const [data, setData] = useState<ReportData | null>(null);
    const [days, setDays] = useState("7");
    const [siteId, setSiteId] = useState("0");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    async function loadReports(nextDays = days, nextSiteId = siteId) {
        const requestId = ++reportRequestRef.current;

        try {
            setLoading(true);
            setError("");

            const query = new URLSearchParams({
                days: nextDays,
                site_id: nextSiteId,
            });

            const response = await apiRequest(`/customer/reports-summary.php?${query}`);

            if (requestId === reportRequestRef.current) {
                setData(response);
            }
        } catch (err) {
            if (requestId === reportRequestRef.current) {
                setError(err instanceof Error ? err.message : "خطا در دریافت گزارش‌ها");
            }
        } finally {
            if (requestId === reportRequestRef.current) {
                setLoading(false);
            }
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

    const activeRate = useMemo(() => {
        if (!data || data.metrics.total_conversations === 0) {
            return 0;
        }

        return Math.round(
            (data.metrics.active_conversations / data.metrics.total_conversations) * 100
        );
    }, [data]);

    const messagesPerConversation = useMemo(() => {
        if (!data || data.metrics.total_conversations === 0) {
            return 0;
        }

        return Math.round(
            (data.metrics.total_messages / data.metrics.total_conversations) * 10
        ) / 10;
    }, [data]);

    const rangeLabel = data
        ? `${formatDate(data.range.start_date)} تا ${formatDate(data.range.end_date)}`
        : "در حال آماده‌سازی بازه";

    const performanceMessage = !data || data.metrics.total_conversations === 0
        ? "با شروع گفتگوها، تصویر عملکرد تیم در این بخش شکل می‌گیرد."
        : closeRate >= 75
            ? "بخش بزرگی از گفتگوهای این بازه با موفقیت به نتیجه رسیده‌اند."
            : closeRate >= 45
                ? "روند رسیدگی متعادل است؛ گفتگوهای فعال را برای تکمیل بررسی کنید."
                : "تعداد گفتگوهای در جریان بالاست و بهتر است صف فعال مرور شود.";

    return (
        <AppShell title="گزارش‌ها">
            <div className="reports-shell">
                {error && (
                    <div className="reports-alert" role="alert">
                        <span className="reports-alert-icon" aria-hidden="true">
                            <ReportsIcon name="warning" />
                        </span>
                        <div>
                            <strong>گزارش تازه دریافت نشد</strong>
                            <p>{error}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => loadReports(days, siteId)}
                            disabled={loading}
                        >
                            تلاش دوباره
                        </button>
                    </div>
                )}

                <section
                    className="reports-overview-card"
                    aria-labelledby="reports-overview-title"
                    aria-busy={loading}
                >
                    <div className="reports-overview-copy">
                        <span className="reports-eyebrow">
                            <i aria-hidden="true" />
                            تحلیل عملکرد پشتیبانی
                        </span>
                        <h2 id="reports-overview-title">
                            از وضعیت گفتگوها، یک تصویر روشن و قابل تصمیم بسازید
                        </h2>
                        <p>
                            مهم‌ترین شاخص‌های پشتیبانی، روند گفتگوها و نقاط نیازمند توجه
                            در یک نمای ساده و مدیریتی کنار هم قرار گرفته‌اند.
                        </p>

                        <div className="reports-overview-scope" aria-label="محدوده گزارش">
                            <span>
                                <ReportsIcon name="calendar" />
                                {rangeLabel}
                            </span>
                            <span>
                                <ReportsIcon name="site" />
                                {selectedSiteName}
                            </span>
                        </div>
                    </div>

                    <div className="reports-health-card">
                        <div
                            className="reports-rate-ring"
                            style={{
                                "--reports-rate": String(closeRate * 3.6) + "deg",
                            } as CSSProperties}
                            aria-label={"نرخ بسته‌شدن " + formatNumber(closeRate) + " درصد"}
                        >
                            <div>
                                <strong>{formatNumber(closeRate)}٪</strong>
                                <span>نرخ تکمیل</span>
                            </div>
                        </div>

                        <div className="reports-health-copy">
                            <span>سلامت رسیدگی</span>
                            <strong>
                                {data
                                    ? formatNumber(data.metrics.closed_conversations) +
                                      " گفتگوی بسته‌شده"
                                    : "در حال محاسبه"}
                            </strong>
                            <p>{performanceMessage}</p>
                        </div>
                    </div>
                </section>

                <section className="reports-filter-bar" aria-label="فیلترهای گزارش">
                    <div className="reports-range-filter">
                        <span>بازه گزارش</span>
                        <div className="reports-range-tabs" role="group" aria-label="انتخاب بازه زمانی">
                            {[
                                { value: "7", label: "۷ روز" },
                                { value: "30", label: "۳۰ روز" },
                                { value: "90", label: "۹۰ روز" },
                            ].map((item) => (
                                <button
                                    key={item.value}
                                    className={days === item.value ? "active" : ""}
                                    type="button"
                                    aria-pressed={days === item.value}
                                    onClick={() => handleDaysChange(item.value)}
                                    disabled={loading && days === item.value}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <label className="reports-site-filter">
                        <span>سایت</span>
                        <div>
                            <ReportsIcon name="site" />
                            <select
                                value={siteId}
                                onChange={(event) => handleSiteChange(event.target.value)}
                                disabled={!data || loading}
                            >
                                <option value="0">همه سایت‌ها</option>
                                {data?.sites.map((site) => (
                                    <option key={site.id} value={site.id}>
                                        {site.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </label>

                    <div className="reports-filter-status" aria-live="polite">
                        <span className={loading ? "is-loading" : ""} aria-hidden="true" />
                        <div>
                            <small>{loading ? "در حال دریافت اطلاعات" : "گزارش به‌روز است"}</small>
                            <strong>{selectedSiteName}</strong>
                        </div>
                    </div>

                    <button
                        className={"reports-refresh-button" + (loading ? " is-loading" : "")}
                        type="button"
                        onClick={() => loadReports(days, siteId)}
                        disabled={loading}
                        aria-label="بروزرسانی گزارش"
                    >
                        <ReportsIcon name="refresh" />
                        <span>{loading ? "در حال بروزرسانی" : "بروزرسانی"}</span>
                    </button>
                </section>

                {loading && !data ? (
                    <ReportsLoading />
                ) : data ? (
                    <>
                        <section className="reports-kpi-grid" aria-label="شاخص‌های اصلی گزارش">
                            <ReportKpiCard
                                icon="conversation"
                                label="کل گفتگوها"
                                value={formatNumber(data.metrics.total_conversations)}
                                hint={
                                    formatNumber(data.metrics.today_conversations) +
                                    " گفتگوی تازه در امروز"
                                }
                                tone="indigo"
                            />
                            <ReportKpiCard
                                icon="pulse"
                                label="گفتگوهای فعال"
                                value={formatNumber(data.metrics.active_conversations)}
                                hint={formatNumber(activeRate) + "٪ از کل گفتگوهای بازه"}
                                tone="mint"
                            />
                            <ReportKpiCard
                                icon="clock"
                                label="میانگین پاسخ اول"
                                value={formatDuration(data.metrics.avg_first_response_minutes)}
                                hint="از اولین پیام مشتری تا پاسخ پشتیبان"
                                tone="amber"
                            />
                            <ReportKpiCard
                                icon="message"
                                label="پیام‌های مبادله‌شده"
                                value={formatNumber(data.metrics.total_messages)}
                                hint={
                                    formatNumber(messagesPerConversation) +
                                    " پیام برای هر گفتگو · " +
                                    formatNumber(data.metrics.total_attachments) +
                                    " فایل"
                                }
                                tone="sky"
                            />
                        </section>

                        <section className="reports-main-grid">
                            <article className="reports-card reports-trend-card">
                                <ReportsCardHead
                                    kicker="روند زمانی"
                                    title="جریان گفتگوها"
                                    description="تغییر تعداد گفتگوهای ایجادشده در بازه انتخابی"
                                    meta={formatNumber(data.range.days) + " روز"}
                                    icon="chart"
                                />
                                <TrendChart
                                    points={data.daily}
                                    max={maxDaily}
                                    total={totalDailyConversations}
                                    average={averageDailyConversations}
                                />
                            </article>

                            <article className="reports-card reports-status-card">
                                <ReportsCardHead
                                    kicker="ترکیب وضعیت"
                                    title="وضعیت رسیدگی"
                                    description="سهم هر وضعیت از کل گفتگوها"
                                    meta={formatNumber(data.status_counts.length) + " وضعیت"}
                                    icon="status"
                                />

                                {data.status_counts.length === 0 ? (
                                    <EmptyMini text="هنوز داده‌ای برای وضعیت گفتگوها وجود ندارد." />
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
                            <article className="reports-card reports-sites-card">
                                <ReportsCardHead
                                    kicker="کانال‌های ورودی"
                                    title="عملکرد سایت‌ها"
                                    description="مقایسه حجم گفتگو میان سایت‌های متصل"
                                    meta={formatNumber(data.site_counts.length) + " سایت"}
                                    icon="site"
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
                                    kicker="فعالیت اخیر"
                                    title="آخرین گفتگوها"
                                    description="آخرین مواردی که در محدوده فعلی تغییر کرده‌اند"
                                    meta={formatNumber(data.recent_conversations.length) + " گفتگو"}
                                    icon="recent"
                                />

                                {data.recent_conversations.length === 0 ? (
                                    <EmptyMini text="هنوز گفتگویی در این بازه ثبت نشده است." />
                                ) : (
                                    <div className="reports-recent-list">
                                        {data.recent_conversations.map((item) => (
                                            <RecentConversationRow
                                                key={item.id}
                                                item={item}
                                                onOpen={() =>
                                                    router.push("/conversations/" + item.id)
                                                }
                                            />
                                        ))}
                                    </div>
                                )}
                            </article>
                        </section>
                    </>
                ) : (
                    <EmptyMini text="اطلاعات گزارش در دسترس نیست." />
                )}
            </div>
        </AppShell>
    );
}

function ReportKpiCard({
                           icon,
                           label,
                           value,
                           hint,
                           tone,
                       }: {
    icon: ReportIconName;
    label: string;
    value: string;
    hint: string;
    tone: "indigo" | "mint" | "amber" | "sky";
}) {
    return (
        <article className={`reports-kpi-card tone-${tone}`}>
            <div className="reports-kpi-top">
                <span className="reports-kpi-icon" aria-hidden="true">
                    <ReportsIcon name={icon} />
                </span>
                <span className="reports-kpi-label">{label}</span>
            </div>
            <strong className="reports-kpi-value">{value}</strong>
            <p>{hint}</p>
        </article>
    );
}

function ReportsCardHead({
                             kicker,
                             title,
                             description,
                             meta,
                             icon,
                         }: {
    kicker: string;
    title: string;
    description: string;
    meta: string;
    icon: ReportIconName;
}) {
    return (
        <div className="reports-card-head">
            <div className="reports-card-title-group">
                <span className="reports-card-icon" aria-hidden="true">
                    <ReportsIcon name={icon} />
                </span>
                <div>
                    <span className="reports-section-kicker">{kicker}</span>
                    <h2>{title}</h2>
                    <p>{description}</p>
                </div>
            </div>
            <span className="reports-card-meta">{meta}</span>
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
    const labelStep = Math.max(1, Math.ceil(points.length / 7));

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
                    <strong>{formatNumber(total)}</strong>
                    <span>مجموع گفتگوها</span>
                </div>

                <div>
                    <strong>{formatNumber(average)}</strong>
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

                    {coordinates.map((point, index) => {
                        const showLabel =
                            index === 0 ||
                            index === coordinates.length - 1 ||
                            index % labelStep === 0;
                        const showValue = points.length <= 14 && point.total > 0;

                        return (
                            <g key={point.date}>
                                {showLabel && (
                                    <circle
                                        cx={point.x}
                                        cy={point.y}
                                        r="5"
                                        fill="#ffffff"
                                        stroke="#5266e8"
                                        strokeWidth="3"
                                    />
                                )}

                                {showValue && (
                                    <text
                                        x={point.x}
                                        y={point.y - 13}
                                        textAnchor="middle"
                                        fontSize="12"
                                        fontWeight="850"
                                        fill="#475569"
                                    >
                                        {formatNumber(point.total)}
                                    </text>
                                )}

                                {showLabel && (
                                    <text
                                        x={point.x}
                                        y={height - 5}
                                        textAnchor="middle"
                                        fontSize="11"
                                        fill="#98a2b3"
                                    >
                                        {formatNumber(point.label)}
                                    </text>
                                )}
                            </g>
                        );
                    })}
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

                <b>{formatNumber(item.total)}</b>
            </div>

            <div className="reports-progress">
                <div style={{ width: `${percent}%`, background: color }} />
            </div>

            <small>{formatNumber(percent)}٪ از کل گفتگوها</small>
        </div>
    );
}

function SitePerformanceRow({ site, total }: { site: SiteCount; total: number }) {
    const percent = total > 0 ? Math.round((site.total / total) * 100) : 0;

    return (
        <div className="reports-site-row">
            <div className="reports-site-top">
                <strong>{site.name}</strong>
                <span>{formatNumber(site.total)}</span>
            </div>

            <div className="reports-progress">
                <div style={{ width: `${percent}%` }} />
            </div>

            <small>{formatNumber(percent)}٪ از گفتگوهای سایت‌ها</small>
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
        <button className="reports-recent-row" type="button" onClick={onOpen}>
            <div className="reports-recent-main">
                <div className="reports-recent-title">
                    <strong>{item.visitor_name || "کاربر بدون نام"}</strong>
                    <span>#{formatNumber(item.id)}</span>
                </div>

                <p>{truncateText(item.last_message || "بدون پیام", 120)}</p>

                <div className="reports-recent-meta">
                    <span>{item.site_name}</span>
                    <span>{contact}</span>
                    <span>{formatDateTime(item.last_message_at || item.created_at)}</span>
                </div>
            </div>

            <div className="reports-recent-side">
                <span className={`reports-status-chip status-${item.status}`}>
                    {statusLabels[item.status] || item.status}
                </span>
                <span className="reports-row-arrow" aria-hidden="true">
                    <ReportsIcon name="arrow" />
                </span>
            </div>
        </button>
    );
}

function EmptyMini({ text }: { text: string }) {
    return (
        <div className="reports-empty-mini">
            <span aria-hidden="true">
                <ReportsIcon name="empty" />
            </span>
            <strong>داده‌ای برای نمایش نیست</strong>
            <p>{text}</p>
        </div>
    );
}

function ReportsLoading() {
    return (
        <div className="reports-loading" aria-label="در حال بارگذاری گزارش‌ها">
            <div className="reports-loading-kpis">
                {[0, 1, 2, 3].map((item) => (
                    <span key={item} />
                ))}
            </div>
            <div className="reports-loading-panels">
                <span />
                <span />
            </div>
        </div>
    );
}

type ReportIconName =
    | "warning"
    | "calendar"
    | "site"
    | "refresh"
    | "conversation"
    | "pulse"
    | "clock"
    | "message"
    | "chart"
    | "status"
    | "recent"
    | "arrow"
    | "empty";

function ReportsIcon({ name }: { name: ReportIconName }) {
    const commonProps = {
        viewBox: "0 0 24 24",
        fill: "none",
        "aria-hidden": true,
    };

    if (name === "warning") {
        return (
            <svg {...commonProps}>
                <path d="M12 8v4m0 4h.01M10.25 4.7 2.8 17.6A1.6 1.6 0 0 0 4.18 20h15.64a1.6 1.6 0 0 0 1.38-2.4L13.75 4.7a2.02 2.02 0 0 0-3.5 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }

    if (name === "calendar") {
        return (
            <svg {...commonProps}>
                <rect x="3.5" y="5.5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
                <path d="M7.5 3.5v4M16.5 3.5v4M3.5 10h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
        );
    }

    if (name === "site") {
        return (
            <svg {...commonProps}>
                <rect x="3" y="4" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" />
                <path d="M8 21h8M12 18v3M7 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
        );
    }

    if (name === "refresh") {
        return (
            <svg {...commonProps}>
                <path d="M19.5 7.5A8 8 0 1 0 20 15M19.5 3.5v4h-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }

    if (name === "conversation") {
        return (
            <svg {...commonProps}>
                <path d="M5.5 18.2 3.7 20a.7.7 0 0 1-1.18-.6l.38-3.24A8 8 0 0 1 2 12.5C2 7.8 6.48 4 12 4s10 3.8 10 8.5S17.52 21 12 21a11.7 11.7 0 0 1-6.5-2.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M7.5 11h9M7.5 14h5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
        );
    }

    if (name === "pulse") {
        return (
            <svg {...commonProps}>
                <path d="M3 12h4l2.2-5 4.1 10 2.1-5H21" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }

    if (name === "clock" || name === "recent") {
        return (
            <svg {...commonProps}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 7v5l3.3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                {name === "recent" && <path d="M5.4 5.8H2.8V3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
            </svg>
        );
    }

    if (name === "message") {
        return (
            <svg {...commonProps}>
                <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.3 3.4A.7.7 0 0 1 4.55 19L5 15.5A2.5 2.5 0 0 1 4 13.5v-8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M8 8.5h8M8 11.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
        );
    }

    if (name === "chart") {
        return (
            <svg {...commonProps}>
                <path d="M4 19V5M4 19h16M7.5 15l3-3 3 1.5 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="18.5" cy="7.5" r="1.3" fill="currentColor" />
            </svg>
        );
    }

    if (name === "status") {
        return (
            <svg {...commonProps}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 3v9h9M12 12l-6.4 6.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }

    if (name === "arrow") {
        return (
            <svg {...commonProps}>
                <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }

    return (
        <svg {...commonProps}>
            <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12v8.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
    );
}

function formatNumber(value: number | string) {
    return String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

function formatDuration(value: number | null) {
    if (value === null) {
        return "—";
    }

    if (value < 60) {
        return formatNumber(value) + " دقیقه";
    }

    const hours = Math.floor(value / 60);
    const minutes = Math.round(value % 60);
    return minutes > 0
        ? formatNumber(hours) + " ساعت و " + formatNumber(minutes) + " دقیقه"
        : formatNumber(hours) + " ساعت";
}

function formatDate(value: string) {
    const date = value.split(" ")[0]?.replaceAll("-", "/") || value;
    return formatNumber(date);
}

function formatDateTime(value: string) {
    const [date, time] = value.split(" ");
    const safeDate = formatNumber((date || value).replaceAll("-", "/"));
    const safeTime = time ? formatNumber(time.slice(0, 5)) : "";
    return safeTime ? safeDate + " · " + safeTime : safeDate;
}

function truncateText(text: string, maxLength: number) {
    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength).trim()}...`;
}
