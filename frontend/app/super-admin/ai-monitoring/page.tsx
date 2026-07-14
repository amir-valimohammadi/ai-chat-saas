// مسیر فایل: ai-chat-saas/frontend/app/super-admin/ai-monitoring/page.tsx
// هدف: مرکز نظارت، مصرف و کیفیت پاسخ‌های AI برای Super Admin

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type ReplyMode = "all" | "suggestion" | "auto_reply" | "fallback" | "no_answer";
type RangeDays = 7 | 30 | 90;

type FilterTenant = {
    id: number;
    name: string;
    status: string;
};

type FilterSite = {
    id: number;
    tenant_id: number;
    name: string;
    domain: string;
    is_active: boolean;
};

type Summary = {
    total_requests: number;
    today_requests: number;
    suggestion_count: number;
    auto_reply_count: number;
    fallback_count: number;
    no_answer_count: number;
    useful_count: number;
    high_confidence_count: number;
    low_confidence_count: number;
    average_confidence: number;
    useful_rate: number;
    no_answer_rate: number;
};

type TrendItem = {
    date: string;
    label: string;
    total: number;
    suggestion: number;
    auto_reply: number;
    fallback: number;
    no_answer: number;
    average_confidence: number;
};

type ModeItem = {
    mode: string;
    label: string;
    total: number;
    percentage: number;
};

type TenantInsight = {
    tenant_id: number;
    tenant_name: string;
    tenant_status: string;
    total_requests: number;
    useful_count: number;
    no_answer_count: number;
    average_confidence: number;
    useful_rate: number;
    no_answer_rate: number;
};

type SiteInsight = {
    site_id: number;
    tenant_id: number;
    site_name: string;
    domain: string;
    tenant_name: string;
    is_active: boolean;
    assistant_enabled: boolean;
    auto_reply_enabled: boolean;
    min_suggestion_score: number;
    min_auto_reply_score: number;
    total_requests: number;
    useful_count: number;
    no_answer_count: number;
    fallback_count: number;
    average_confidence: number;
    useful_rate: number;
    no_answer_rate: number;
    last_request_at: string | null;
};

type UnansweredItem = {
    tenant_id: number;
    tenant_name: string;
    site_id: number;
    site_name: string;
    question: string;
    detected_category: string | null;
    detected_intent: string | null;
    occurrences: number;
    average_best_match_score: number;
    last_seen_at: string;
};

type RecentLog = {
    id: number;
    tenant_id: number;
    tenant_name: string;
    site_id: number;
    site_name: string;
    conversation_id: number | null;
    user_question: string;
    reply_text: string | null;
    reply_mode: string;
    confidence_score: number;
    sources_count: number;
    created_at: string;
};

type MonitoringResponse = {
    success: boolean;
    range: {
        days: number;
        start_date: string;
        end_date: string;
    };
    applied_filters: {
        tenant_id: number;
        site_id: number;
        reply_mode: string;
    };
    filters: {
        tenants: FilterTenant[];
        sites: FilterSite[];
    };
    summary: Summary;
    trend: TrendItem[];
    mode_distribution: ModeItem[];
    top_tenants: TenantInsight[];
    top_sites: SiteInsight[];
    low_quality_sites: SiteInsight[];
    unanswered_questions: UnansweredItem[];
    recent_logs: RecentLog[];
    generated_at: string;
};

const modeLabels: Record<string, string> = {
    suggestion: "پیشنهاد پاسخ",
    auto_reply: "پاسخ خودکار",
    fallback: "پیام جایگزین",
    no_answer: "بدون پاسخ",
};

export default function SuperAdminAiMonitoringPage() {
    const router = useRouter();

    const [data, setData] = useState<MonitoringResponse | null>(null);
    const [days, setDays] = useState<RangeDays>(30);
    const [tenantId, setTenantId] = useState(0);
    const [siteId, setSiteId] = useState(0);
    const [replyMode, setReplyMode] = useState<ReplyMode>("all");

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

    const loadData = useCallback(
        async (silent = false) => {
            try {
                setError("");

                if (silent) {
                    setRefreshing(true);
                } else {
                    setLoading(true);
                }

                const params = new URLSearchParams({
                    days: String(days),
                });

                if (tenantId > 0) {
                    params.set("tenant_id", String(tenantId));
                }

                if (siteId > 0) {
                    params.set("site_id", String(siteId));
                }

                if (replyMode !== "all") {
                    params.set("reply_mode", replyMode);
                }

                const response = await apiRequest(
                    `/super-admin/ai-monitoring-stats.php?${params.toString()}`
                );

                setData(response);
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "خطا در دریافت اطلاعات نظارت AI"
                );
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [days, tenantId, siteId, replyMode]
    );

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

        loadData();
    }, [router, loadData]);

    const availableSites = useMemo(() => {
        const sites = data?.filters.sites || [];

        if (!tenantId) {
            return sites;
        }

        return sites.filter((site) => site.tenant_id === tenantId);
    }, [data?.filters.sites, tenantId]);

    const trendMax = useMemo(() => {
        return Math.max(1, ...(data?.trend.map((item) => item.total) || [1]));
    }, [data?.trend]);

    function handleTenantChange(value: number) {
        setTenantId(value);

        if (
            siteId > 0 &&
            !(data?.filters.sites || []).some(
                (site) => site.id === siteId && (!value || site.tenant_id === value)
            )
        ) {
            setSiteId(0);
        }
    }

    const summary = data?.summary;

    return (
        <AppShell
            title="نظارت AI"
            kicker="AI Monitoring"
            description="تحلیل مصرف، کیفیت پاسخ‌ها، سایت‌های کم‌کیفیت و سؤال‌های بی‌پاسخ"
            actions={
                <button
                    className="btn secondary"
                    type="button"
                    onClick={() => loadData(true)}
                    disabled={refreshing}
                >
                    {refreshing ? "در حال بروزرسانی..." : "بروزرسانی آمار"}
                </button>
            }
        >
            <div className="sa-ai-monitoring-page">
                <section className="sa-ai-monitoring-filters">
                    <label>
                        <span>بازه گزارش</span>
                        <select
                            className="input"
                            value={days}
                            onChange={(event) =>
                                setDays(Number(event.target.value) as RangeDays)
                            }
                        >
                            <option value={7}>۷ روز اخیر</option>
                            <option value={30}>۳۰ روز اخیر</option>
                            <option value={90}>۹۰ روز اخیر</option>
                        </select>
                    </label>

                    <label>
                        <span>مشتری</span>
                        <select
                            className="input"
                            value={tenantId}
                            onChange={(event) =>
                                handleTenantChange(Number(event.target.value))
                            }
                        >
                            <option value={0}>همه مشتری‌ها</option>
                            {(data?.filters.tenants || []).map((tenant) => (
                                <option key={tenant.id} value={tenant.id}>
                                    {tenant.name}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label>
                        <span>سایت</span>
                        <select
                            className="input"
                            value={siteId}
                            onChange={(event) =>
                                setSiteId(Number(event.target.value))
                            }
                        >
                            <option value={0}>همه سایت‌ها</option>
                            {availableSites.map((site) => (
                                <option key={site.id} value={site.id}>
                                    {site.name} — {site.domain}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label>
                        <span>نوع پاسخ</span>
                        <select
                            className="input"
                            value={replyMode}
                            onChange={(event) =>
                                setReplyMode(event.target.value as ReplyMode)
                            }
                        >
                            <option value="all">همه حالت‌ها</option>
                            <option value="suggestion">پیشنهاد پاسخ</option>
                            <option value="auto_reply">پاسخ خودکار</option>
                            <option value="fallback">پیام جایگزین</option>
                            <option value="no_answer">بدون پاسخ</option>
                        </select>
                    </label>
                </section>

                {error && (
                    <div className="error sa-ai-monitoring-error">
                        <span>{error}</span>
                        <button
                            className="btn secondary"
                            type="button"
                            onClick={() => loadData()}
                        >
                            تلاش مجدد
                        </button>
                    </div>
                )}

                {loading || !data || !summary ? (
                    <MonitoringSkeleton />
                ) : (
                    <>
                        <section className="sa-ai-monitoring-summary-grid">
                            <SummaryCard
                                label="کل درخواست‌های AI"
                                value={formatNumber(summary.total_requests)}
                                detail={`${formatNumber(
                                    summary.today_requests
                                )} درخواست امروز`}
                                icon={<SparkIcon />}
                            />
                            <SummaryCard
                                label="نرخ پاسخ قابل‌استفاده"
                                value={formatPercent(summary.useful_rate)}
                                detail={`${formatNumber(
                                    summary.useful_count
                                )} پاسخ پیشنهاد یا خودکار`}
                                icon={<CheckIcon />}
                                tone={
                                    summary.useful_rate >= 70
                                        ? "success"
                                        : summary.useful_rate >= 45
                                          ? "warning"
                                          : "danger"
                                }
                            />
                            <SummaryCard
                                label="میانگین اطمینان"
                                value={formatPercent(summary.average_confidence)}
                                detail={`${formatNumber(
                                    summary.high_confidence_count
                                )} پاسخ با اطمینان کافی`}
                                icon={<GaugeIcon />}
                                tone={
                                    summary.average_confidence >= 65
                                        ? "success"
                                        : summary.average_confidence >= 45
                                          ? "warning"
                                          : "danger"
                                }
                            />
                            <SummaryCard
                                label="نرخ بدون پاسخ"
                                value={formatPercent(summary.no_answer_rate)}
                                detail={`${formatNumber(
                                    summary.no_answer_count
                                )} مورد بدون پاسخ دقیق`}
                                icon={<WarningIcon />}
                                tone={
                                    summary.no_answer_rate <= 10
                                        ? "success"
                                        : summary.no_answer_rate <= 30
                                          ? "warning"
                                          : "danger"
                                }
                            />
                        </section>

                        <section className="sa-ai-monitoring-main-grid">
                            <article className="sa-ai-monitoring-card sa-ai-monitoring-trend-card">
                                <SectionHead
                                    kicker="Trend"
                                    title={`روند ${formatNumber(days)} روز اخیر`}
                                    description="تعداد درخواست‌ها و سهم پاسخ‌های ناموفق در هر روز"
                                />

                                <div className="sa-ai-monitoring-chart">
                                    {data.trend.map((item) => {
                                        const totalHeight = Math.max(
                                            4,
                                            (item.total / trendMax) * 100
                                        );
                                        const failed =
                                            item.fallback + item.no_answer;
                                        const failedHeight =
                                            item.total > 0
                                                ? (failed / item.total) *
                                                  totalHeight
                                                : 0;

                                        return (
                                            <div
                                                className="sa-ai-monitoring-chart-item"
                                                key={item.date}
                                                title={`${item.date}: ${item.total} درخواست`}
                                            >
                                                <div className="sa-ai-monitoring-chart-value">
                                                    {item.total > 0
                                                        ? formatNumber(item.total)
                                                        : ""}
                                                </div>
                                                <div className="sa-ai-monitoring-chart-track">
                                                    <div
                                                        className="sa-ai-monitoring-chart-bar"
                                                        style={{
                                                            height: `${totalHeight}%`,
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                height: `${failedHeight}%`,
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                                <small>{item.label}</small>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="sa-ai-monitoring-chart-legend">
                                    <span>
                                        <i className="is-total" />
                                        کل درخواست
                                    </span>
                                    <span>
                                        <i className="is-failed" />
                                        Fallback و بدون پاسخ
                                    </span>
                                </div>
                            </article>

                            <article className="sa-ai-monitoring-card">
                                <SectionHead
                                    kicker="Modes"
                                    title="ترکیب حالت‌های پاسخ"
                                    description="سهم هر حالت از کل درخواست‌های فیلترشده"
                                />

                                <div className="sa-ai-monitoring-mode-list">
                                    {data.mode_distribution.map((item) => (
                                        <div
                                            className="sa-ai-monitoring-mode-row"
                                            key={item.mode}
                                        >
                                            <div>
                                                <strong>{item.label}</strong>
                                                <span>
                                                    {formatNumber(item.total)} درخواست
                                                </span>
                                            </div>
                                            <div className="sa-ai-monitoring-progress">
                                                <span
                                                    className={`mode-${item.mode}`}
                                                    style={{
                                                        width: `${Math.min(
                                                            100,
                                                            item.percentage
                                                        )}%`,
                                                    }}
                                                />
                                            </div>
                                            <b>
                                                {formatPercent(item.percentage)}
                                            </b>
                                        </div>
                                    ))}
                                </div>

                                <div className="sa-ai-monitoring-mode-totals">
                                    <MetricTile
                                        label="پیشنهاد"
                                        value={summary.suggestion_count}
                                    />
                                    <MetricTile
                                        label="خودکار"
                                        value={summary.auto_reply_count}
                                    />
                                    <MetricTile
                                        label="Fallback"
                                        value={summary.fallback_count}
                                    />
                                    <MetricTile
                                        label="بی‌پاسخ"
                                        value={summary.no_answer_count}
                                    />
                                </div>
                            </article>
                        </section>

                        <section className="sa-ai-monitoring-insights-grid">
                            <article className="sa-ai-monitoring-card">
                                <SectionHead
                                    kicker="Customers"
                                    title="مشتریان با بیشترین مصرف"
                                    description="رتبه‌بندی بر اساس تعداد درخواست AI"
                                />

                                <div className="sa-ai-monitoring-ranking-list">
                                    {data.top_tenants.length === 0 ? (
                                        <EmptyState text="در این بازه داده‌ای برای مشتری‌ها ثبت نشده است." />
                                    ) : (
                                        data.top_tenants.map((tenant, index) => (
                                            <div
                                                className="sa-ai-monitoring-ranking-row"
                                                key={tenant.tenant_id}
                                            >
                                                <span className="sa-ai-monitoring-rank">
                                                    {formatNumber(index + 1)}
                                                </span>
                                                <div>
                                                    <Link
                                                        href={`/super-admin/customers/${tenant.tenant_id}`}
                                                    >
                                                        {tenant.tenant_name}
                                                    </Link>
                                                    <small>
                                                        اطمینان{" "}
                                                        {formatPercent(
                                                            tenant.average_confidence
                                                        )}{" "}
                                                        · بی‌پاسخ{" "}
                                                        {formatPercent(
                                                            tenant.no_answer_rate
                                                        )}
                                                    </small>
                                                </div>
                                                <strong>
                                                    {formatNumber(
                                                        tenant.total_requests
                                                    )}
                                                </strong>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </article>

                            <article className="sa-ai-monitoring-card">
                                <SectionHead
                                    kicker="Sites"
                                    title="سایت‌های با بیشترین مصرف"
                                    description="درخواست‌ها، کیفیت پاسخ و آخرین فعالیت"
                                />

                                <div className="sa-ai-monitoring-ranking-list">
                                    {data.top_sites.length === 0 ? (
                                        <EmptyState text="در این بازه سایتی فعالیت AI نداشته است." />
                                    ) : (
                                        data.top_sites.map((site, index) => (
                                            <div
                                                className="sa-ai-monitoring-ranking-row"
                                                key={site.site_id}
                                            >
                                                <span className="sa-ai-monitoring-rank">
                                                    {formatNumber(index + 1)}
                                                </span>
                                                <div>
                                                    <Link
                                                        href={`/super-admin/customers/${site.tenant_id}`}
                                                    >
                                                        {site.site_name}
                                                    </Link>
                                                    <small>
                                                        {site.tenant_name} ·{" "}
                                                        {formatPercent(
                                                            site.useful_rate
                                                        )}{" "}
                                                        پاسخ قابل‌استفاده
                                                    </small>
                                                </div>
                                                <strong>
                                                    {formatNumber(
                                                        site.total_requests
                                                    )}
                                                </strong>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </article>
                        </section>

                        <section className="sa-ai-monitoring-card">
                            <SectionHead
                                kicker="Quality Alerts"
                                title="سایت‌های نیازمند بهبود"
                                description="سایت‌هایی با نرخ پاسخ پایین، Confidence ضعیف یا بی‌پاسخ‌های زیاد"
                            />

                            {data.low_quality_sites.length === 0 ? (
                                <div className="sa-ai-monitoring-good-state">
                                    <CheckIcon />
                                    <div>
                                        <strong>هشدار کیفی مهمی ثبت نشده است</strong>
                                        <span>
                                            سایت‌های دارای فعالیت، در محدوده قابل‌قبول
                                            قرار دارند.
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="sa-ai-monitoring-site-table">
                                    <div className="sa-ai-monitoring-site-table-head">
                                        <span>سایت</span>
                                        <span>درخواست</span>
                                        <span>اطمینان</span>
                                        <span>قابل‌استفاده</span>
                                        <span>بی‌پاسخ</span>
                                        <span>وضعیت AI</span>
                                    </div>

                                    {data.low_quality_sites.map((site) => (
                                        <div
                                            className="sa-ai-monitoring-site-table-row"
                                            key={site.site_id}
                                        >
                                            <div>
                                                <Link
                                                    href={`/super-admin/customers/${site.tenant_id}`}
                                                >
                                                    {site.site_name}
                                                </Link>
                                                <small>
                                                    {site.tenant_name} · {site.domain}
                                                </small>
                                            </div>
                                            <span>
                                                {formatNumber(
                                                    site.total_requests
                                                )}
                                            </span>
                                            <QualityBadge
                                                value={site.average_confidence}
                                                inverse={false}
                                            />
                                            <QualityBadge
                                                value={site.useful_rate}
                                                inverse={false}
                                            />
                                            <QualityBadge
                                                value={site.no_answer_rate}
                                                inverse
                                            />
                                            <span
                                                className={`sa-ai-monitoring-status ${
                                                    site.assistant_enabled
                                                        ? "is-active"
                                                        : "is-inactive"
                                                }`}
                                            >
                                                {site.assistant_enabled
                                                    ? site.auto_reply_enabled
                                                        ? "AI + Auto"
                                                        : "AI فعال"
                                                    : "AI خاموش"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="sa-ai-monitoring-two-col">
                            <article className="sa-ai-monitoring-card">
                                <SectionHead
                                    kicker="Unanswered"
                                    title="سؤال‌های پرتکرار بی‌پاسخ"
                                    description="موارد جدیدی که باید به پایگاه دانش اضافه شوند"
                                />

                                <div className="sa-ai-monitoring-question-list">
                                    {data.unanswered_questions.length === 0 ? (
                                        <EmptyState text="سؤال بی‌پاسخ جدیدی در این بازه ثبت نشده است." />
                                    ) : (
                                        data.unanswered_questions.map(
                                            (item, index) => (
                                                <div
                                                    className="sa-ai-monitoring-question-row"
                                                    key={`${item.site_id}-${item.question}-${index}`}
                                                >
                                                    <span>
                                                        {formatNumber(
                                                            item.occurrences
                                                        )}
                                                    </span>
                                                    <div>
                                                        <strong>
                                                            {item.question}
                                                        </strong>
                                                        <small>
                                                            {item.tenant_name} ·{" "}
                                                            {item.site_name}
                                                            {item.detected_category
                                                                ? ` · ${item.detected_category}`
                                                                : ""}
                                                        </small>
                                                    </div>
                                                    <b>
                                                        {formatPercent(
                                                            item.average_best_match_score
                                                        )}
                                                    </b>
                                                </div>
                                            )
                                        )
                                    )}
                                </div>
                            </article>

                            <article className="sa-ai-monitoring-card">
                                <SectionHead
                                    kicker="Recent Logs"
                                    title="آخرین درخواست‌ها"
                                    description="آخرین سؤال‌ها و حالت پاسخ ثبت‌شده"
                                />

                                <div className="sa-ai-monitoring-log-list">
                                    {data.recent_logs.length === 0 ? (
                                        <EmptyState text="لاگ جدیدی در این بازه وجود ندارد." />
                                    ) : (
                                        data.recent_logs.map((log) => (
                                            <div
                                                className="sa-ai-monitoring-log-row"
                                                key={log.id}
                                            >
                                                <div>
                                                    <strong>
                                                        {log.user_question}
                                                    </strong>
                                                    <small>
                                                        {log.tenant_name} ·{" "}
                                                        {log.site_name} ·{" "}
                                                        {formatDateTime(
                                                            log.created_at
                                                        )}
                                                    </small>
                                                </div>
                                                <span
                                                    className={`sa-ai-monitoring-mode mode-${log.reply_mode}`}
                                                >
                                                    {modeLabels[log.reply_mode] ||
                                                        log.reply_mode}
                                                </span>
                                                <b>
                                                    {formatPercent(
                                                        log.confidence_score
                                                    )}
                                                </b>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </article>
                        </section>

                        <footer className="sa-ai-monitoring-generated">
                            آخرین محاسبه: {formatDateTime(data.generated_at)}
                        </footer>
                    </>
                )}
            </div>
        </AppShell>
    );
}

function MonitoringSkeleton() {
    return (
        <div className="sa-ai-monitoring-skeleton-wrap">
            <div className="sa-ai-monitoring-summary-grid">
                {[1, 2, 3, 4].map((item) => (
                    <div
                        className="sa-ai-monitoring-skeleton-card"
                        key={item}
                    />
                ))}
            </div>
            <div className="sa-ai-monitoring-main-grid">
                <div className="sa-ai-monitoring-skeleton-panel" />
                <div className="sa-ai-monitoring-skeleton-panel" />
            </div>
        </div>
    );
}

function SummaryCard({
    label,
    value,
    detail,
    icon,
    tone = "default",
}: {
    label: string;
    value: string;
    detail: string;
    icon: React.ReactNode;
    tone?: "default" | "success" | "warning" | "danger";
}) {
    return (
        <article className={`sa-ai-monitoring-summary-card tone-${tone}`}>
            <div className="sa-ai-monitoring-summary-icon">{icon}</div>
            <div>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{detail}</small>
            </div>
        </article>
    );
}

function SectionHead({
    kicker,
    title,
    description,
}: {
    kicker: string;
    title: string;
    description: string;
}) {
    return (
        <div className="sa-ai-monitoring-section-head">
            <span>{kicker}</span>
            <h2>{title}</h2>
            <p>{description}</p>
        </div>
    );
}

function MetricTile({
    label,
    value,
}: {
    label: string;
    value: number;
}) {
    return (
        <div className="sa-ai-monitoring-metric-tile">
            <span>{label}</span>
            <strong>{formatNumber(value)}</strong>
        </div>
    );
}

function QualityBadge({
    value,
    inverse,
}: {
    value: number;
    inverse: boolean;
}) {
    const good = inverse ? value <= 10 : value >= 65;
    const warning = inverse
        ? value > 10 && value <= 30
        : value >= 45 && value < 65;

    return (
        <span
            className={`sa-ai-monitoring-quality ${
                good ? "is-good" : warning ? "is-warning" : "is-danger"
            }`}
        >
            {formatPercent(value)}
        </span>
    );
}

function EmptyState({ text }: { text: string }) {
    return <div className="sa-ai-monitoring-empty">{text}</div>;
}

function formatNumber(value: number) {
    return Number(value || 0).toLocaleString("fa-IR");
}

function formatPercent(value: number) {
    return `${Number(value || 0).toLocaleString("fa-IR", {
        maximumFractionDigits: 1,
    })}٪`;
}

function formatDateTime(value: string | null) {
    if (!value) {
        return "ثبت نشده";
    }

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

function SparkIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2Zm7 13 .9 2.6L22.5 19l-2.6.9L19 22.5l-.9-2.6-2.6-.9 2.6-.9L19 15Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="m5 12 4 4L19 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function GaugeIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M4 15a8 8 0 1 1 16 0M12 13l4-4m-9 9h10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </svg>
    );
}

function WarningIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M10.3 3.7 2.4 17.4A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.6L13.7 3.7a2 2 0 0 0-3.4 0ZM12 9v4m0 3h.01"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
