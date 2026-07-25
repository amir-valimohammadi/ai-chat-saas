// مسیر فایل: ai-chat-saas/frontend/app/super-admin/sites/page.tsx
// هدف: مرکز مدیریت حرفه‌ای سایت‌ها برای Super Admin

"use client";

import Link from "next/link";
import {
    CSSProperties,
    FormEvent,
    ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type HealthStatus = "healthy" | "attention" | "inactive";
type SiteStatusFilter = "all" | "active" | "inactive";
type AiModeFilter = "all" | "off" | "assistant" | "semi_auto";
type HealthFilter = "all" | HealthStatus;
type SortOption =
    | "newest"
    | "oldest"
    | "name_asc"
    | "conversations_desc"
    | "activity_desc"
    | "knowledge_desc";

type Site = {
    id: number;
    tenant_id: number;
    tenant_name: string;
    tenant_status: string;
    name: string;
    domain: string;
    site_key: string;
    brand_name: string | null;
    brand_color: string | null;
    logo_url: string | null;
    welcome_message: string | null;
    ai_mode: "off" | "assistant" | "semi_auto";
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
    conversations_count: number;
    monthly_conversations_count: number;
    widget_events_count: number;
    widget_seen: boolean;
    manual_knowledge_count: number;
    crawled_pages_count: number;
    knowledge_items_count: number;
    active_crawl_sources_count: number;
    ai_requests_month: number;
    ai_success_rate: number | null;
    last_conversation_at: string | null;
    last_widget_event_at: string | null;
    last_activity_at: string | null;
    last_crawl_status: string | null;
    last_crawl_at: string | null;
    health_status: HealthStatus;
    health_text: string;
    install_code: string;
};

type Summary = {
    total: number;
    active: number;
    inactive: number;
    ai_enabled: number;
    conversations: number;
    monthly_conversations: number;
    healthy: number;
    attention: number;
};

type Pagination = {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
    from: number;
    to: number;
};

type TenantOption = {
    id: number;
    name: string;
    status: string;
    sites_count: number;
};

type SitesResponse = {
    sites: Site[];
    summary: Summary;
    pagination: Pagination;
    filters: {
        tenants: TenantOption[];
    };
};

type SiteForm = {
    name: string;
    domain: string;
    brand_name: string;
    brand_color: string;
    logo_url: string;
    welcome_message: string;
    ai_mode: "off" | "assistant" | "semi_auto";
};

const emptySummary: Summary = {
    total: 0,
    active: 0,
    inactive: 0,
    ai_enabled: 0,
    conversations: 0,
    monthly_conversations: 0,
    healthy: 0,
    attention: 0,
};

const emptyPagination: Pagination = {
    page: 1,
    per_page: 12,
    total: 0,
    total_pages: 0,
    from: 0,
    to: 0,
};

const aiModeLabels: Record<string, string> = {
    off: "خاموش",
    assistant: "کمک‌یار",
    semi_auto: "نیمه‌خودکار",
};

const crawlStatusLabels: Record<string, string> = {
    queued: "در صف",
    running: "در حال اجرا",
    completed: "تکمیل‌شده",
    failed: "ناموفق",
    cancelled: "لغوشده",
};

export default function SuperAdminSitesPage() {
    const router = useRouter();

    const [authorized, setAuthorized] = useState(false);
    const [sites, setSites] = useState<Site[]>([]);
    const [summary, setSummary] = useState<Summary>(emptySummary);
    const [pagination, setPagination] = useState<Pagination>(emptyPagination);
    const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);

    const [searchInput, setSearchInput] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [tenantId, setTenantId] = useState("all");
    const [status, setStatus] = useState<SiteStatusFilter>("all");
    const [aiMode, setAiMode] = useState<AiModeFilter>("all");
    const [health, setHealth] = useState<HealthFilter>("all");
    const [sort, setSort] = useState<SortOption>("newest");
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(12);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [expandedSiteId, setExpandedSiteId] = useState<number | null>(null);
    const [updatingSiteId, setUpdatingSiteId] = useState<number | null>(null);

    const [editingSite, setEditingSite] = useState<Site | null>(null);
    const [siteForm, setSiteForm] = useState<SiteForm>({
        name: "",
        domain: "",
        brand_name: "",
        brand_color: "#2563eb",
        logo_url: "",
        welcome_message: "",
        ai_mode: "assistant",
    });
    const [savingSite, setSavingSite] = useState(false);

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

        setAuthorized(true);
    }, [router]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedSearch(searchInput.trim());
            setPage(1);
        }, 350);

        return () => window.clearTimeout(timer);
    }, [searchInput]);

    const buildRequestPath = useCallback(() => {
        const params = new URLSearchParams({
            search: debouncedSearch,
            tenant_id: tenantId === "all" ? "0" : tenantId,
            status,
            ai_mode: aiMode,
            health,
            sort,
            page: String(page),
            per_page: String(perPage),
        });

        return `/super-admin/sites-list.php?${params.toString()}`;
    }, [aiMode, debouncedSearch, health, page, perPage, sort, status, tenantId]);

    const loadSites = useCallback(
        async (silent = false) => {
            if (!authorized) return;

            try {
                setError("");

                if (silent) {
                    setRefreshing(true);
                } else {
                    setLoading(true);
                }

                const data = (await apiRequest(buildRequestPath())) as SitesResponse;

                setSites(data.sites || []);
                setSummary(data.summary || emptySummary);
                setPagination(data.pagination || emptyPagination);
                setTenantOptions(data.filters?.tenants || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : "خطا در دریافت سایت‌ها");
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [authorized, buildRequestPath]
    );

    useEffect(() => {
        loadSites();
    }, [loadSites]);

    useEffect(() => {
        if (pagination.total_pages > 0 && page > pagination.total_pages) {
            setPage(pagination.total_pages);
        }
    }, [page, pagination.total_pages]);

    function clearMessages() {
        setError("");
        setSuccess("");
    }

    function resetFilters() {
        setSearchInput("");
        setDebouncedSearch("");
        setTenantId("all");
        setStatus("all");
        setAiMode("all");
        setHealth("all");
        setSort("newest");
        setPage(1);
        setPerPage(12);
    }

    async function copyText(text: string, key: string) {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            window.setTimeout(() => setCopiedKey(null), 1700);
        } catch {
            setError("مرورگر اجازه کپی خودکار نداد. متن را به‌صورت دستی انتخاب کن.");
        }
    }

    async function toggleSiteStatus(site: Site) {
        const nextState = !site.is_active;
        const confirmed = window.confirm(
            nextState
                ? `سایت «${site.name}» فعال شود؟`
                : `سایت «${site.name}» غیرفعال شود؟ ویجت آن دیگر در دسترس نخواهد بود.`
        );

        if (!confirmed) return;

        try {
            clearMessages();
            setUpdatingSiteId(site.id);

            await apiRequest("/super-admin/site-status-update.php", {
                method: "POST",
                body: JSON.stringify({
                    site_id: site.id,
                    is_active: nextState,
                }),
            });

            setSuccess(nextState ? "سایت با موفقیت فعال شد." : "سایت غیرفعال شد.");
            await loadSites(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "تغییر وضعیت سایت ناموفق بود");
        } finally {
            setUpdatingSiteId(null);
        }
    }

    function openSiteEditor(site: Site) {
        clearMessages();
        setEditingSite(site);
        setSiteForm({
            name: site.name || "",
            domain: site.domain || "",
            brand_name: site.brand_name || "",
            brand_color: normalizeColor(site.brand_color),
            logo_url: site.logo_url || "",
            welcome_message: site.welcome_message || "",
            ai_mode: site.ai_mode || "assistant",
        });
    }

    function updateSiteField<K extends keyof SiteForm>(field: K, value: SiteForm[K]) {
        setSiteForm((current) => ({ ...current, [field]: value }));
    }

    async function saveSiteSettings(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!editingSite) return;

        if (!siteForm.name.trim()) {
            setError("نام سایت را وارد کن.");
            return;
        }

        if (!siteForm.domain.trim()) {
            setError("دامنه سایت را وارد کن.");
            return;
        }

        if (!/^#[0-9a-fA-F]{6}$/.test(siteForm.brand_color)) {
            setError("رنگ برند باید مانند #2563eb باشد.");
            return;
        }

        if (siteForm.logo_url.trim() && !isHttpUrl(siteForm.logo_url.trim())) {
            setError("آدرس لوگو باید یک URL معتبر با http یا https باشد.");
            return;
        }

        try {
            clearMessages();
            setSavingSite(true);

            await apiRequest("/super-admin/site-settings-update.php", {
                method: "POST",
                body: JSON.stringify({
                    site_id: editingSite.id,
                    ...siteForm,
                }),
            });

            setEditingSite(null);
            setSuccess("تنظیمات سایت با موفقیت ذخیره شد.");
            await loadSites(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ذخیره تنظیمات سایت ناموفق بود");
        } finally {
            setSavingSite(false);
        }
    }

    const hasActiveFilters = useMemo(
        () =>
            Boolean(
                searchInput ||
                tenantId !== "all" ||
                status !== "all" ||
                aiMode !== "all" ||
                health !== "all" ||
                sort !== "newest" ||
                perPage !== 12
            ),
        [aiMode, health, perPage, searchInput, sort, status, tenantId]
    );

    return (
        <AppShell
            title="سایت‌ها"
            kicker="Website Operations"
            description="نظارت بر نصب ویجت، فعالیت، منابع دانش و تنظیمات سایت‌های پلتفرم"
            actions={
                <div className="sa-sites-header-actions">
                    <button
                        className="btn secondary"
                        type="button"
                        onClick={() => loadSites(true)}
                        disabled={refreshing}
                    >
                        <Icon name="refresh" />
                        {refreshing ? "در حال بروزرسانی..." : "بروزرسانی"}
                    </button>

                    <Link className="btn" href="/super-admin/customers/create">
                        <Icon name="plus" />
                        ایجاد مشتری جدید
                    </Link>
                </div>
            }
        >
            <div className="sa-sites-page">
                {error && <div className="error">{error}</div>}
                {success && <div className="success">{success}</div>}

                <section className="sa-sites-summary-grid" aria-label="خلاصه وضعیت سایت‌ها">
                    <SummaryCard
                        icon="globe"
                        label="کل سایت‌ها"
                        value={summary.total}
                        hint={`${summary.active.toLocaleString("fa-IR")} سایت فعال`}
                    />
                    <SummaryCard
                        icon="pulse"
                        label="وضعیت سالم"
                        value={summary.healthy}
                        hint={`${summary.attention.toLocaleString("fa-IR")} مورد نیازمند بررسی`}
                        tone="success"
                    />
                    <SummaryCard
                        icon="chat"
                        label="گفتگوهای این ماه"
                        value={summary.monthly_conversations}
                        hint={`${summary.conversations.toLocaleString("fa-IR")} گفتگوی کل`}
                    />
                    <SummaryCard
                        icon="spark"
                        label="AI فعال"
                        value={summary.ai_enabled}
                        hint={`${summary.inactive.toLocaleString("fa-IR")} سایت غیرفعال`}
                        tone="primary"
                    />
                </section>

                <section className="sa-sites-filter-card">
                    <div className="sa-sites-filter-head">
                        <div>
                            <span className="sa-sites-kicker">Filters</span>
                            <h2>جست‌وجو و کنترل سایت‌ها</h2>
                            <p>فهرست را بر اساس مشتری، وضعیت، AI و سلامت عملیاتی محدود کن.</p>
                        </div>

                        <div className="sa-sites-filter-head-meta">
                            <span>
                                {pagination.total.toLocaleString("fa-IR")} نتیجه
                            </span>
                            {hasActiveFilters && (
                                <button type="button" onClick={resetFilters}>
                                    پاک‌کردن فیلترها
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="sa-sites-filter-grid">
                        <label className="sa-sites-search-field">
                            <Icon name="search" />
                            <input
                                value={searchInput}
                                onChange={(event) => setSearchInput(event.target.value)}
                                placeholder="نام سایت، دامنه، مشتری یا site_key..."
                            />
                        </label>

                        <FilterSelect
                            label="مشتری"
                            value={tenantId}
                            onChange={(value) => {
                                setTenantId(value);
                                setPage(1);
                            }}
                        >
                            <option value="all">همه مشتری‌ها</option>
                            {tenantOptions.map((tenant) => (
                                <option key={tenant.id} value={tenant.id}>
                                    {tenant.name} ({tenant.sites_count})
                                </option>
                            ))}
                        </FilterSelect>

                        <FilterSelect
                            label="وضعیت سایت"
                            value={status}
                            onChange={(value) => {
                                setStatus(value as SiteStatusFilter);
                                setPage(1);
                            }}
                        >
                            <option value="all">همه وضعیت‌ها</option>
                            <option value="active">فعال</option>
                            <option value="inactive">غیرفعال</option>
                        </FilterSelect>

                        <FilterSelect
                            label="حالت AI"
                            value={aiMode}
                            onChange={(value) => {
                                setAiMode(value as AiModeFilter);
                                setPage(1);
                            }}
                        >
                            <option value="all">همه حالت‌ها</option>
                            <option value="off">خاموش</option>
                            <option value="assistant">کمک‌یار</option>
                            <option value="semi_auto">نیمه‌خودکار</option>
                        </FilterSelect>

                        <FilterSelect
                            label="سلامت عملیاتی"
                            value={health}
                            onChange={(value) => {
                                setHealth(value as HealthFilter);
                                setPage(1);
                            }}
                        >
                            <option value="all">همه وضعیت‌ها</option>
                            <option value="healthy">سالم</option>
                            <option value="attention">نیازمند بررسی</option>
                            <option value="inactive">غیرفعال</option>
                        </FilterSelect>

                        <FilterSelect
                            label="مرتب‌سازی"
                            value={sort}
                            onChange={(value) => {
                                setSort(value as SortOption);
                                setPage(1);
                            }}
                        >
                            <option value="newest">جدیدترین</option>
                            <option value="oldest">قدیمی‌ترین</option>
                            <option value="name_asc">نام سایت</option>
                            <option value="conversations_desc">بیشترین گفتگو</option>
                            <option value="activity_desc">آخرین فعالیت</option>
                            <option value="knowledge_desc">بیشترین دانش</option>
                        </FilterSelect>
                    </div>
                </section>

                {loading ? (
                    <SitesSkeleton />
                ) : sites.length === 0 ? (
                    <EmptyState hasFilters={hasActiveFilters} onReset={resetFilters} />
                ) : (
                    <section className="sa-sites-grid" aria-label="فهرست سایت‌ها">
                        {sites.map((site) => (
                            <SiteCard
                                key={site.id}
                                site={site}
                                expanded={expandedSiteId === site.id}
                                copiedKey={copiedKey}
                                updating={updatingSiteId === site.id}
                                onToggleExpanded={() =>
                                    setExpandedSiteId((current) =>
                                        current === site.id ? null : site.id
                                    )
                                }
                                onCopy={copyText}
                                onEdit={() => openSiteEditor(site)}
                                onToggleStatus={() => toggleSiteStatus(site)}
                            />
                        ))}
                    </section>
                )}

                {!loading && pagination.total > 0 && (
                    <PaginationControls
                        pagination={pagination}
                        page={page}
                        perPage={perPage}
                        onPageChange={setPage}
                        onPerPageChange={(value) => {
                            setPerPage(value);
                            setPage(1);
                        }}
                    />
                )}
            </div>

            {editingSite && (
                <SiteEditorModal
                    site={editingSite}
                    form={siteForm}
                    saving={savingSite}
                    onChange={updateSiteField}
                    onClose={() => setEditingSite(null)}
                    onSubmit={saveSiteSettings}
                />
            )}
        </AppShell>
    );
}

function SummaryCard({
                         icon,
                         label,
                         value,
                         hint,
                         tone = "default",
                     }: {
    icon: IconName;
    label: string;
    value: number;
    hint: string;
    tone?: "default" | "primary" | "success";
}) {
    return (
        <article className={`sa-sites-summary-card is-${tone}`}>
            <div className="sa-sites-summary-icon">
                <Icon name={icon} />
            </div>
            <div>
                <span>{label}</span>
                <strong>{value.toLocaleString("fa-IR")}</strong>
                <small>{hint}</small>
            </div>
        </article>
    );
}

function FilterSelect({
                          label,
                          value,
                          onChange,
                          children,
                      }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    children: ReactNode;
}) {
    return (
        <label className="sa-sites-select-field">
            <span>{label}</span>
            <select value={value} onChange={(event) => onChange(event.target.value)}>
                {children}
            </select>
        </label>
    );
}

function SiteCard({
                      site,
                      expanded,
                      copiedKey,
                      updating,
                      onToggleExpanded,
                      onCopy,
                      onEdit,
                      onToggleStatus,
                  }: {
    site: Site;
    expanded: boolean;
    copiedKey: string | null;
    updating: boolean;
    onToggleExpanded: () => void;
    onCopy: (text: string, key: string) => void;
    onEdit: () => void;
    onToggleStatus: () => void;
}) {
    const brandColor = normalizeColor(site.brand_color);
    const brandStyle = { "--sa-site-brand": brandColor } as CSSProperties;
    const healthLabel =
        site.health_status === "healthy"
            ? "سالم"
            : site.health_status === "attention"
                ? "نیازمند بررسی"
                : "غیرفعال";

    return (
        <article className={`sa-sites-card health-${site.health_status}`} style={brandStyle}>
            <header className="sa-sites-card-header">
                <div className="sa-sites-brand-block">
                    <div className="sa-sites-brand-avatar">
                        {site.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={site.logo_url} alt="" />
                        ) : (
                            <span>{getInitial(site.brand_name || site.name)}</span>
                        )}
                    </div>

                    <div className="sa-sites-brand-copy">
                        <div className="sa-sites-title-row">
                            <h3>{site.name}</h3>
                            <span className={`sa-sites-health-badge is-${site.health_status}`}>
                                <i />
                                {healthLabel}
                            </span>
                        </div>

                        <a
                            href={normalizeDomainUrl(site.domain)}
                            target="_blank"
                            rel="noreferrer"
                            className="sa-sites-domain"
                        >
                            {site.domain}
                            <Icon name="external" />
                        </a>

                        <Link
                            href={`/super-admin/customers/${site.tenant_id}`}
                            className="sa-sites-tenant-link"
                        >
                            <Icon name="building" />
                            {site.tenant_name}
                            {site.tenant_status !== "active" && <b>حساب غیرفعال</b>}
                        </Link>
                    </div>
                </div>

                <div className="sa-sites-card-badges">
                    <span className={`sa-sites-state-badge ${site.is_active ? "active" : "inactive"}`}>
                        {site.is_active ? "فعال" : "غیرفعال"}
                    </span>
                    <span className="sa-sites-ai-badge">
                        <Icon name="spark" />
                        {aiModeLabels[site.ai_mode] || site.ai_mode}
                    </span>
                </div>
            </header>

            <div className="sa-sites-health-note">
                <Icon
                    name={
                        site.health_status === "healthy"
                            ? "check"
                            : site.health_status === "attention"
                                ? "alert"
                                : "pause"
                    }
                />
                <span>{site.health_text}</span>
            </div>

            <div className="sa-sites-metric-grid">
                <SiteMetric
                    icon="chat"
                    label="گفتگوها"
                    value={site.conversations_count}
                    hint={`${site.monthly_conversations_count.toLocaleString("fa-IR")} این ماه`}
                />
                <SiteMetric
                    icon="book"
                    label="منابع دانش"
                    value={site.knowledge_items_count}
                    hint={`${site.crawled_pages_count.toLocaleString("fa-IR")} صفحه Crawl`}
                />
                <SiteMetric
                    icon="spark"
                    label="درخواست AI"
                    value={site.ai_requests_month}
                    hint={
                        site.ai_success_rate === null
                            ? "بدون داده"
                            : `${site.ai_success_rate.toLocaleString("fa-IR")}٪ پاسخ قابل استفاده`
                    }
                />
                <SiteMetric
                    icon="clock"
                    label="آخرین فعالیت"
                    value={formatRelativeActivity(site.last_activity_at)}
                    hint={formatDate(site.last_activity_at)}
                    compact
                />
            </div>

            <div className="sa-sites-readiness-row">
                <ReadinessItem ready={site.widget_seen} label="فعالیت ویجت" />
                <ReadinessItem
                    ready={site.ai_mode === "off" || site.knowledge_items_count > 0}
                    label="دانش AI"
                />
                <ReadinessItem
                    ready={Boolean(site.brand_name && site.brand_color && site.welcome_message)}
                    label="هویت برند"
                />
                <ReadinessItem ready={site.is_active && site.tenant_status === "active"} label="دسترسی" />
            </div>

            {site.last_crawl_status && (
                <div className="sa-sites-crawl-row">
                    <span>
                        آخرین Crawl: {crawlStatusLabels[site.last_crawl_status] || site.last_crawl_status}
                    </span>
                    <small>{formatDate(site.last_crawl_at)}</small>
                </div>
            )}

            <footer className="sa-sites-card-actions">
                <div>
                    <button type="button" className="sa-sites-button subtle" onClick={onToggleExpanded}>
                        <Icon name="code" />
                        {expanded ? "بستن اطلاعات نصب" : "اطلاعات نصب"}
                    </button>

                    <button type="button" className="sa-sites-button subtle" onClick={onEdit}>
                        <Icon name="edit" />
                        ویرایش
                    </button>
                </div>

                <button
                    type="button"
                    className={`sa-sites-button ${site.is_active ? "danger" : "primary"}`}
                    onClick={onToggleStatus}
                    disabled={updating}
                >
                    <Icon name={site.is_active ? "pause" : "play"} />
                    {updating ? "در حال تغییر..." : site.is_active ? "غیرفعال‌کردن" : "فعال‌کردن"}
                </button>
            </footer>

            {expanded && (
                <div className="sa-sites-install-panel">
                    <div className="sa-sites-install-head">
                        <div>
                            <span>Installation</span>
                            <strong>کلید و کد نصب ویجت</strong>
                        </div>
                        <span className="sa-sites-id-chip">Site #{site.id}</span>
                    </div>

                    <CopyField
                        label="site_key"
                        value={site.site_key}
                        copied={copiedKey === `key-${site.id}`}
                        onCopy={() => onCopy(site.site_key, `key-${site.id}`)}
                    />

                    <CopyField
                        label="کد نصب"
                        value={site.install_code}
                        multiline
                        copied={copiedKey === `install-${site.id}`}
                        onCopy={() => onCopy(site.install_code, `install-${site.id}`)}
                    />
                </div>
            )}
        </article>
    );
}

function SiteMetric({
                        icon,
                        label,
                        value,
                        hint,
                        compact = false,
                    }: {
    icon: IconName;
    label: string;
    value: number | string;
    hint: string;
    compact?: boolean;
}) {
    return (
        <div className={`sa-sites-metric ${compact ? "is-compact" : ""}`}>
            <Icon name={icon} />
            <div>
                <span>{label}</span>
                <strong>{typeof value === "number" ? value.toLocaleString("fa-IR") : value}</strong>
                <small>{hint}</small>
            </div>
        </div>
    );
}

function ReadinessItem({ ready, label }: { ready: boolean; label: string }) {
    return (
        <span className={ready ? "ready" : "not-ready"}>
            <Icon name={ready ? "check" : "minus"} />
            {label}
        </span>
    );
}

function CopyField({
                       label,
                       value,
                       multiline = false,
                       copied,
                       onCopy,
                   }: {
    label: string;
    value: string;
    multiline?: boolean;
    copied: boolean;
    onCopy: () => void;
}) {
    return (
        <div className="sa-sites-copy-field">
            <div className="sa-sites-copy-label">
                <span>{label}</span>
                <button type="button" onClick={onCopy}>
                    <Icon name={copied ? "check" : "copy"} />
                    {copied ? "کپی شد" : "کپی"}
                </button>
            </div>

            {multiline ? (
                <textarea readOnly value={value} onFocus={(event) => event.currentTarget.select()} />
            ) : (
                <input readOnly value={value} onFocus={(event) => event.currentTarget.select()} />
            )}
        </div>
    );
}

function PaginationControls({
                                pagination,
                                page,
                                perPage,
                                onPageChange,
                                onPerPageChange,
                            }: {
    pagination: Pagination;
    page: number;
    perPage: number;
    onPageChange: (page: number) => void;
    onPerPageChange: (perPage: number) => void;
}) {
    const pages = getVisiblePages(page, pagination.total_pages);

    return (
        <section className="sa-sites-pagination">
            <div className="sa-sites-pagination-info">
                نمایش {pagination.from.toLocaleString("fa-IR")} تا{" "}
                {pagination.to.toLocaleString("fa-IR")} از{" "}
                {pagination.total.toLocaleString("fa-IR")} سایت
            </div>

            <div className="sa-sites-pagination-pages">
                <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                    aria-label="صفحه قبل"
                >
                    <Icon name="chevronRight" />
                </button>

                {pages.map((item, index) =>
                    item === "ellipsis" ? (
                        <span key={`ellipsis-${index}`}>…</span>
                    ) : (
                        <button
                            type="button"
                            key={item}
                            className={item === page ? "active" : ""}
                            onClick={() => onPageChange(item)}
                        >
                            {item.toLocaleString("fa-IR")}
                        </button>
                    )
                )}

                <button
                    type="button"
                    disabled={page >= pagination.total_pages}
                    onClick={() => onPageChange(page + 1)}
                    aria-label="صفحه بعد"
                >
                    <Icon name="chevronLeft" />
                </button>
            </div>

            <label className="sa-sites-per-page">
                <span>در هر صفحه</span>
                <select
                    value={perPage}
                    onChange={(event) => onPerPageChange(Number(event.target.value))}
                >
                    <option value={8}>۸</option>
                    <option value={12}>۱۲</option>
                    <option value={24}>۲۴</option>
                    <option value={48}>۴۸</option>
                </select>
            </label>
        </section>
    );
}

function SitesSkeleton() {
    return (
        <section className="sa-sites-grid" aria-label="در حال بارگذاری">
            {[1, 2, 3, 4].map((item) => (
                <article key={item} className="sa-sites-card sa-sites-skeleton-card">
                    <div className="sa-sites-skeleton-line wide" />
                    <div className="sa-sites-skeleton-line medium" />
                    <div className="sa-sites-skeleton-block" />
                    <div className="sa-sites-skeleton-grid">
                        <span />
                        <span />
                        <span />
                        <span />
                    </div>
                </article>
            ))}
        </section>
    );
}

function EmptyState({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) {
    return (
        <section className="sa-sites-empty-state">
            <div className="sa-sites-empty-icon">
                <Icon name="globe" />
            </div>
            <h2>{hasFilters ? "سایتی با این فیلترها پیدا نشد" : "هنوز سایتی ثبت نشده است"}</h2>
            <p>
                {hasFilters
                    ? "عبارت جست‌وجو یا فیلترها را تغییر بده."
                    : "با ساخت مشتری جدید، سایت اولیه او در این بخش نمایش داده می‌شود."}
            </p>
            {hasFilters ? (
                <button type="button" className="btn" onClick={onReset}>
                    پاک‌کردن فیلترها
                </button>
            ) : (
                <Link className="btn" href="/super-admin/customers/create">
                    ایجاد مشتری جدید
                </Link>
            )}
        </section>
    );
}

function SiteEditorModal({
                             site,
                             form,
                             saving,
                             onChange,
                             onClose,
                             onSubmit,
                         }: {
    site: Site;
    form: SiteForm;
    saving: boolean;
    onChange: <K extends keyof SiteForm>(field: K, value: SiteForm[K]) => void;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
    return (
        <div className="sa-sites-modal-backdrop" role="presentation" onMouseDown={onClose}>
            <section
                className="sa-sites-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="sa-sites-editor-title"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header className="sa-sites-modal-header">
                    <div>
                        <span>Site Settings</span>
                        <h2 id="sa-sites-editor-title">ویرایش {site.name}</h2>
                        <p>اطلاعات دامنه، برند و رفتار AI این سایت را مدیریت کن.</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="بستن">
                        <Icon name="close" />
                    </button>
                </header>

                <form onSubmit={onSubmit} className="sa-sites-editor-form">
                    <div className="sa-sites-editor-grid">
                        <FormField label="نام سایت">
                            <input
                                value={form.name}
                                onChange={(event) => onChange("name", event.target.value)}
                                maxLength={255}
                            />
                        </FormField>

                        <FormField label="دامنه">
                            <input
                                value={form.domain}
                                onChange={(event) => onChange("domain", event.target.value)}
                                maxLength={255}
                                dir="ltr"
                                placeholder="example.com"
                            />
                        </FormField>

                        <FormField label="نام برند">
                            <input
                                value={form.brand_name}
                                onChange={(event) => onChange("brand_name", event.target.value)}
                                maxLength={255}
                            />
                        </FormField>

                        <FormField label="رنگ برند">
                            <div className="sa-sites-color-control">
                                <input
                                    type="color"
                                    value={normalizeColor(form.brand_color)}
                                    onChange={(event) => onChange("brand_color", event.target.value)}
                                />
                                <input
                                    value={form.brand_color}
                                    onChange={(event) => onChange("brand_color", event.target.value)}
                                    maxLength={7}
                                    dir="ltr"
                                />
                            </div>
                        </FormField>

                        <FormField label="آدرس لوگو">
                            <input
                                value={form.logo_url}
                                onChange={(event) => onChange("logo_url", event.target.value)}
                                dir="ltr"
                                placeholder="https://example.com/logo.png"
                            />
                        </FormField>

                        <FormField label="حالت AI">
                            <select
                                value={form.ai_mode}
                                onChange={(event) =>
                                    onChange(
                                        "ai_mode",
                                        event.target.value as SiteForm["ai_mode"]
                                    )
                                }
                            >
                                <option value="off">خاموش</option>
                                <option value="assistant">کمک‌یار پشتیبان</option>
                                <option value="semi_auto">نیمه‌خودکار</option>
                            </select>
                        </FormField>
                    </div>

                    <FormField label="پیام خوش‌آمدگویی" hint={`${form.welcome_message.length}/300`}>
                        <textarea
                            value={form.welcome_message}
                            onChange={(event) => onChange("welcome_message", event.target.value)}
                            maxLength={300}
                            rows={4}
                        />
                    </FormField>

                    <div className="sa-sites-editor-preview">
                        <div
                            className="sa-sites-editor-preview-swatch"
                            style={{ background: normalizeColor(form.brand_color) }}
                        >
                            {form.logo_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={form.logo_url} alt="" />
                            ) : (
                                <span>{getInitial(form.brand_name || form.name)}</span>
                            )}
                        </div>
                        <div>
                            <span>پیش‌نمایش هویت ویجت</span>
                            <strong>{form.brand_name || form.name || "پشتیبانی آنلاین"}</strong>
                            <p>{form.welcome_message || "سلام، چطور می‌تونیم کمکتون کنیم؟"}</p>
                        </div>
                    </div>

                    <footer className="sa-sites-modal-actions">
                        <button className="btn" type="submit" disabled={saving}>
                            {saving ? "در حال ذخیره..." : "ذخیره تغییرات"}
                        </button>
                        <button className="btn secondary" type="button" onClick={onClose}>
                            انصراف
                        </button>
                    </footer>
                </form>
            </section>
        </div>
    );
}

function FormField({
                       label,
                       hint,
                       children,
                   }: {
    label: string;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <label className="sa-sites-form-field">
            <span>
                <b>{label}</b>
                {hint && <small>{hint}</small>}
            </span>
            {children}
        </label>
    );
}

type IconName =
    | "refresh"
    | "plus"
    | "globe"
    | "pulse"
    | "chat"
    | "spark"
    | "search"
    | "external"
    | "building"
    | "check"
    | "alert"
    | "pause"
    | "book"
    | "clock"
    | "minus"
    | "code"
    | "edit"
    | "play"
    | "copy"
    | "chevronRight"
    | "chevronLeft"
    | "close";

function Icon({ name }: { name: IconName }) {
    const paths: Record<IconName, ReactNode> = {
        refresh: <path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" />,
        plus: <path d="M12 5v14M5 12h14" />,
        globe: (
            <>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
            </>
        ),
        pulse: <path d="M3 12h4l2-5 4 10 2-5h6" />,
        chat: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />,
        spark: <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z" />,
        search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
        external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
        building: <><path d="M4 21V7l8-4 8 4v14" /><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M9 21v-3h6v3" /></>,
        check: <path d="m5 12 4 4L19 6" />,
        alert: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.8 2.6 17.1A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.9L13.7 3.8a2 2 0 0 0-3.4 0Z" /></>,
        pause: <path d="M9 5v14M15 5v14" />,
        book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>,
        clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
        minus: <path d="M5 12h14" />,
        code: <path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" />,
        edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
        play: <path d="m8 5 11 7-11 7Z" />,
        copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
        chevronRight: <path d="m15 18-6-6 6-6" />,
        chevronLeft: <path d="m9 18 6-6-6-6" />,
        close: <path d="M6 6l12 12M18 6 6 18" />,
    };

    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {paths[name]}
        </svg>
    );
}

function getVisiblePages(current: number, total: number): Array<number | "ellipsis"> {
    if (total <= 7) {
        return Array.from({ length: total }, (_, index) => index + 1);
    }

    const pages: Array<number | "ellipsis"> = [1];

    if (current > 4) pages.push("ellipsis");

    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    for (let item = start; item <= end; item += 1) {
        pages.push(item);
    }

    if (current < total - 3) pages.push("ellipsis");
    pages.push(total);

    return pages;
}

function normalizeColor(color: string | null | undefined) {
    return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#2563eb";
}

function normalizeDomainUrl(domain: string) {
    const trimmed = domain.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isHttpUrl(value: string) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

function getInitial(value: string) {
    return value.trim().charAt(0).toUpperCase() || "AI";
}

function formatDate(value: string | null) {
    if (!value || value.startsWith("1970-01-01")) return "بدون فعالیت";

    const date = new Date(value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function formatRelativeActivity(value: string | null) {
    if (!value || value.startsWith("1970-01-01")) return "ثبت نشده";

    const date = new Date(value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return "نامشخص";

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

    if (diffMinutes < 1) return "همین حالا";
    if (diffMinutes < 60) return `${diffMinutes.toLocaleString("fa-IR")} دقیقه پیش`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours.toLocaleString("fa-IR")} ساعت پیش`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays.toLocaleString("fa-IR")} روز پیش`;

    return formatDate(value);
}
