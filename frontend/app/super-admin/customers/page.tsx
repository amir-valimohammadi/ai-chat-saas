// مسیر فایل: ai-chat-saas/frontend/app/super-admin/customers/page.tsx
// هدف: CRM حرفه‌ای مشتری‌ها برای Super Admin

"use client";

import Link from "next/link";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type TenantStatus = "active" | "inactive" | "suspended";
type StatusFilter = "all" | TenantStatus;
type SortOption =
    | "newest"
    | "oldest"
    | "name_asc"
    | "name_desc"
    | "usage_desc"
    | "activity_desc";

type Tenant = {
    id: number;
    name: string;
    owner_name: string | null;
    owner_email: string | null;
    owner_phone: string | null;
    status: TenantStatus;
    plan_id: number | null;
    plan_name: string | null;
    plan_is_active: boolean | null;
    max_monthly_conversations: number | null;
    sites_count: number;
    active_sites_count: number;
    users_count: number;
    agents_count: number;
    total_conversations: number;
    monthly_conversations: number;
    monthly_messages: number;
    usage_percent: number;
    last_activity_at: string | null;
    created_at: string;
    updated_at: string | null;
};

type Summary = {
    total: number;
    active: number;
    inactive: number;
    suspended: number;
    sites: number;
    users: number;
    agents: number;
};

type Pagination = {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
    from: number;
    to: number;
};

type PlanOption = {
    id: number;
    name: string;
    max_monthly_conversations: number;
    is_active: boolean;
};

type CustomersResponse = {
    generated_at: string;
    tenants: Tenant[];
    summary: Summary;
    pagination: Pagination;
    filters: {
        plans: PlanOption[];
    };
};

type IconName =
    | "users"
    | "building"
    | "site"
    | "agent"
    | "search"
    | "filter"
    | "sort"
    | "refresh"
    | "plus"
    | "settings"
    | "arrow"
    | "activity"
    | "message"
    | "close"
    | "check"
    | "warning";

const statusLabels: Record<TenantStatus, string> = {
    active: "فعال",
    inactive: "غیرفعال",
    suspended: "تعلیق‌شده",
};

const sortLabels: Record<SortOption, string> = {
    newest: "جدیدترین مشتری‌ها",
    oldest: "قدیمی‌ترین مشتری‌ها",
    name_asc: "نام؛ الف تا ی",
    name_desc: "نام؛ ی تا الف",
    usage_desc: "بیشترین مصرف پلن",
    activity_desc: "آخرین فعالیت",
};

const numberFormatter = new Intl.NumberFormat("fa-IR");
const percentFormatter = new Intl.NumberFormat("fa-IR", {
    maximumFractionDigits: 1,
});

const emptySummary: Summary = {
    total: 0,
    active: 0,
    inactive: 0,
    suspended: 0,
    sites: 0,
    users: 0,
    agents: 0,
};

const emptyPagination: Pagination = {
    page: 1,
    per_page: 12,
    total: 0,
    total_pages: 1,
    from: 0,
    to: 0,
};

export default function SuperAdminCustomersPage() {
    const router = useRouter();
    const requestSequence = useRef(0);

    const [authorized, setAuthorized] = useState(false);
    const [data, setData] = useState<CustomersResponse | null>(null);
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<StatusFilter>("all");
    const [planId, setPlanId] = useState("all");
    const [sort, setSort] = useState<SortOption>("newest");
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(12);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const [managedTenant, setManagedTenant] = useState<Tenant | null>(null);
    const [draftStatus, setDraftStatus] = useState<TenantStatus>("active");
    const [draftPlanId, setDraftPlanId] = useState("");
    const [savingManagement, setSavingManagement] = useState(false);
    const [managementError, setManagementError] = useState("");

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

        setAuthorized(true);
    }, [router]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            const nextSearch = searchInput.trim();
            setSearch((current) => {
                if (current !== nextSearch) {
                    setPage(1);
                }

                return nextSearch;
            });
        }, 350);

        return () => window.clearTimeout(timer);
    }, [searchInput]);

    const loadCustomers = useCallback(
        async (silent = false) => {
            if (!authorized) {
                return;
            }

            const requestId = ++requestSequence.current;

            try {
                setError("");

                if (silent) {
                    setRefreshing(true);
                } else {
                    setLoading(true);
                }

                const params = new URLSearchParams({
                    status,
                    sort,
                    page: String(page),
                    per_page: String(perPage),
                });

                if (search) {
                    params.set("search", search);
                }

                if (planId !== "all") {
                    params.set("plan_id", planId);
                }

                const response = (await apiRequest(
                    `/super-admin/tenants-list.php?${params.toString()}`
                )) as CustomersResponse;

                if (requestId !== requestSequence.current) {
                    return;
                }

                setData(response);

                if (response.pagination.page !== page) {
                    setPage(response.pagination.page);
                }
            } catch (err) {
                if (requestId !== requestSequence.current) {
                    return;
                }

                setError(
                    err instanceof Error
                        ? err.message
                        : "دریافت فهرست مشتری‌ها با خطا مواجه شد."
                );
            } finally {
                if (requestId === requestSequence.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        }, [authorized, page, perPage, planId, search, sort, status]
    );

    useEffect(() => {
        loadCustomers();
    }, [loadCustomers]);

    useEffect(() => {
        if (!managedTenant) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !savingManagement) {
                setManagedTenant(null);
            }
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [managedTenant, savingManagement]);

    const summary = data?.summary || emptySummary;
    const pagination = data?.pagination || emptyPagination;
    const plans = data?.filters.plans || [];
    const tenants = data?.tenants || [];

    const activePlans = useMemo(
        () => plans.filter((plan) => plan.is_active),
        [plans]
    );

    const hasActiveFilters =
        searchInput.trim() !== "" ||
        status !== "all" ||
        planId !== "all" ||
        sort !== "newest";

    const managementChanged = Boolean(
        managedTenant &&
        (draftStatus !== managedTenant.status ||
            Number(draftPlanId || 0) !== Number(managedTenant.plan_id || 0))
    );

    function resetFilters() {
        setSearchInput("");
        setSearch("");
        setStatus("all");
        setPlanId("all");
        setSort("newest");
        setPage(1);
    }

    function openManagement(tenant: Tenant) {
        setManagedTenant(tenant);
        setDraftStatus(tenant.status);
        setDraftPlanId(
            tenant.plan_id
                ? String(tenant.plan_id)
                : activePlans[0]
                    ? String(activePlans[0].id)
                    : ""
        );
        setManagementError("");
    }

    async function saveManagement() {
        if (!managedTenant || !managementChanged) {
            return;
        }

        if (!draftPlanId) {
            setManagementError("برای مشتری یک پلن فعال انتخاب کن.");
            return;
        }

        try {
            setSavingManagement(true);
            setManagementError("");
            setNotice("");

            if (draftStatus !== managedTenant.status) {
                await apiRequest("/super-admin/customer-status-update.php", {
                    method: "POST",
                    body: JSON.stringify({
                        tenant_id: managedTenant.id,
                        status: draftStatus,
                    }),
                });
            }

            if (Number(draftPlanId) !== Number(managedTenant.plan_id || 0)) {
                await apiRequest("/super-admin/customer-plan-update.php", {
                    method: "POST",
                    body: JSON.stringify({
                        tenant_id: managedTenant.id,
                        plan_id: Number(draftPlanId),
                    }),
                });
            }

            setManagedTenant(null);
            setNotice(`تنظیمات «${managedTenant.name}» با موفقیت بروزرسانی شد.`);
            await loadCustomers(true);
        } catch (err) {
            setManagementError(
                err instanceof Error
                    ? err.message
                    : "بروزرسانی مشتری با خطا مواجه شد."
            );
        } finally {
            setSavingManagement(false);
        }
    }

    const pageNumbers = buildPageNumbers(
        pagination.page,
        pagination.total_pages
    );

    return (
        <AppShell
            title="مشتری‌ها"
            kicker="Customer management"
            description="مدیریت حساب‌ها، پلن‌ها، مصرف، سایت‌ها و فعالیت مشتریان پلتفرم"
            actions={
                <div className="sa-customers-header-actions">
                    <button
                        className="btn secondary"
                        type="button"
                        onClick={() => loadCustomers(true)}
                        disabled={loading || refreshing}
                    >
                        <Icon name="refresh" />
                        {refreshing ? "در حال بروزرسانی" : "بروزرسانی"}
                    </button>

                    <Link className="btn" href="/super-admin/customers/create">
                        <Icon name="plus" />
                        ایجاد مشتری
                    </Link>
                </div>
            }
        >
            <main className="sa-customers">
                {notice && (
                    <div className="sa-customers-notice" role="status">
                        <Icon name="check" />
                        <span>{notice}</span>
                        <button type="button" onClick={() => setNotice("")}>
                            <Icon name="close" />
                        </button>
                    </div>
                )}

                {error && (
                    <div className="sa-customers-error" role="alert">
                        <div>
                            <strong>فهرست مشتری‌ها بارگذاری نشد</strong>
                            <span>{error}</span>
                        </div>
                        <button type="button" onClick={() => loadCustomers()}>
                            تلاش دوباره
                        </button>
                    </div>
                )}

                <section className="sa-customers-metrics" aria-label="خلاصه مشتریان">
                    <MetricCard
                        icon="building"
                        label="کل مشتری‌ها"
                        value={summary.total}
                        hint="حساب ثبت‌شده"
                        tone="primary"
                    />
                    <MetricCard
                        icon="users"
                        label="مشتری فعال"
                        value={summary.active}
                        hint={`${numberFormatter.format(summary.inactive + summary.suspended)} حساب غیرفعال یا تعلیق`}
                        tone="success"
                    />
                    <MetricCard
                        icon="site"
                        label="سایت‌های متصل"
                        value={summary.sites}
                        hint="در تمام مشتری‌ها"
                        tone="violet"
                    />
                    <MetricCard
                        icon="agent"
                        label="کاربران و پشتیبان‌ها"
                        value={summary.users}
                        hint={`${numberFormatter.format(summary.agents)} پشتیبان`}
                        tone="amber"
                    />
                </section>

                <section className="sa-customers-workspace">
                    <div className="sa-customers-toolbar">
                        <div className="sa-customers-search">
                            <Icon name="search" />
                            <input
                                value={searchInput}
                                onChange={(event) => setSearchInput(event.target.value)}
                                placeholder="نام مشتری، مالک، ایمیل، تلفن، پلن یا شناسه..."
                                aria-label="جست‌وجوی مشتری‌ها"
                            />
                            {searchInput && (
                                <button
                                    type="button"
                                    onClick={() => setSearchInput("")}
                                    aria-label="پاک کردن جست‌وجو"
                                >
                                    <Icon name="close" />
                                </button>
                            )}
                        </div>

                        <div className="sa-customers-toolbar-selects">
                            <label>
                                <Icon name="filter" />
                                <select
                                    value={planId}
                                    onChange={(event) => {
                                        setPlanId(event.target.value);
                                        setPage(1);
                                    }}
                                    aria-label="فیلتر پلن"
                                >
                                    <option value="all">همه پلن‌ها</option>
                                    {plans.map((plan) => (
                                        <option key={plan.id} value={plan.id}>
                                            {plan.name}
                                            {plan.is_active ? "" : " (غیرفعال)"}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label>
                                <Icon name="sort" />
                                <select
                                    value={sort}
                                    onChange={(event) => {
                                        setSort(event.target.value as SortOption);
                                        setPage(1);
                                    }}
                                    aria-label="مرتب‌سازی مشتری‌ها"
                                >
                                    {(Object.keys(sortLabels) as SortOption[]).map(
                                        (option) => (
                                            <option key={option} value={option}>
                                                {sortLabels[option]}
                                            </option>
                                        )
                                    )}
                                </select>
                            </label>
                        </div>
                    </div>

                    <div className="sa-customers-status-tabs" role="tablist">
                        {(
                            [
                                ["all", "همه", summary.total],
                                ["active", "فعال", summary.active],
                                ["inactive", "غیرفعال", summary.inactive],
                                ["suspended", "تعلیق", summary.suspended],
                            ] as [StatusFilter, string, number][]
                        ).map(([value, label, count]) => (
                            <button
                                key={value}
                                type="button"
                                className={status === value ? "active" : ""}
                                onClick={() => {
                                    setStatus(value);
                                    setPage(1);
                                }}
                                role="tab"
                                aria-selected={status === value}
                            >
                                <span>{label}</span>
                                <b>{numberFormatter.format(count)}</b>
                            </button>
                        ))}

                        {hasActiveFilters && (
                            <button
                                className="sa-customers-reset"
                                type="button"
                                onClick={resetFilters}
                            >
                                پاک‌کردن فیلترها
                            </button>
                        )}
                    </div>

                    <div className="sa-customers-results-head">
                        <div>
                            <strong>
                                {numberFormatter.format(pagination.total)} مشتری
                            </strong>
                            <span>
                                نمایش {numberFormatter.format(pagination.from)} تا {" "}
                                {numberFormatter.format(pagination.to)}
                            </span>
                        </div>

                        {data?.generated_at && (
                            <span>
                                آخرین بروزرسانی: {formatDateTime(data.generated_at)}
                            </span>
                        )}
                    </div>

                    {loading && !data ? (
                        <CustomersSkeleton />
                    ) : tenants.length === 0 ? (
                        <EmptyState
                            filtered={hasActiveFilters}
                            onReset={resetFilters}
                        />
                    ) : (
                        <div className="sa-customers-list">
                            {tenants.map((tenant) => (
                                <CustomerCard
                                    key={tenant.id}
                                    tenant={tenant}
                                    onManage={() => openManagement(tenant)}
                                />
                            ))}
                        </div>
                    )}

                    {!loading && pagination.total > 0 && (
                        <div className="sa-customers-pagination">
                            <div className="sa-customers-per-page">
                                <span>تعداد در صفحه</span>
                                <select
                                    value={perPage}
                                    onChange={(event) => {
                                        setPerPage(Number(event.target.value));
                                        setPage(1);
                                    }}
                                >
                                    {[8, 12, 24, 48].map((value) => (
                                        <option key={value} value={value}>
                                            {numberFormatter.format(value)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="sa-customers-page-buttons">
                                <button
                                    type="button"
                                    disabled={pagination.page <= 1}
                                    onClick={() => setPage((current) => current - 1)}
                                >
                                    قبلی
                                </button>

                                {pageNumbers.map((pageNumber, index) =>
                                    pageNumber === "ellipsis" ? (
                                        <span key={`ellipsis-${index}`}>…</span>
                                    ) : (
                                        <button
                                            key={pageNumber}
                                            type="button"
                                            className={
                                                pagination.page === pageNumber
                                                    ? "active"
                                                    : ""
                                            }
                                            onClick={() => setPage(pageNumber)}
                                        >
                                            {numberFormatter.format(pageNumber)}
                                        </button>
                                    )
                                )}

                                <button
                                    type="button"
                                    disabled={
                                        pagination.page >= pagination.total_pages
                                    }
                                    onClick={() => setPage((current) => current + 1)}
                                >
                                    بعدی
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </main>

            {managedTenant && (
                <ManagementModal
                    tenant={managedTenant}
                    plans={activePlans}
                    status={draftStatus}
                    planId={draftPlanId}
                    saving={savingManagement}
                    changed={managementChanged}
                    error={managementError}
                    onStatusChange={setDraftStatus}
                    onPlanChange={setDraftPlanId}
                    onClose={() => {
                        if (!savingManagement) {
                            setManagedTenant(null);
                        }
                    }}
                    onSave={saveManagement}
                />
            )}
        </AppShell>
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
    tone: "primary" | "success" | "violet" | "amber";
}) {
    return (
        <article className={`sa-customers-metric ${tone}`}>
            <div className="sa-customers-metric-icon">
                <Icon name={icon} />
            </div>
            <div>
                <span>{label}</span>
                <strong>{numberFormatter.format(value)}</strong>
                <small>{hint}</small>
            </div>
        </article>
    );
}

function CustomerCard({
                          tenant,
                          onManage,
                      }: {
    tenant: Tenant;
    onManage: () => void;
}) {
    const safeUsage = Math.min(100, Math.max(0, tenant.usage_percent));
    const contact = tenant.owner_phone || tenant.owner_email || "ثبت نشده";
    const usageTone =
        tenant.usage_percent >= 100
            ? "critical"
            : tenant.usage_percent >= 85
                ? "danger"
                : tenant.usage_percent >= 65
                    ? "warning"
                    : "normal";

    return (
        <article
            className={`sa-customers-card status-${tenant.status}`}
            aria-label={`مشتری ${tenant.name}`}
        >
            <div className="sa-customers-card-head">
                <div className="sa-customers-identity">
                    <div className="sa-customers-avatar">
                        {getInitials(tenant.name)}
                    </div>
                    <div>
                        <div className="sa-customers-title-row">
                            <h2>{tenant.name}</h2>
                            <span className={`sa-customers-status ${tenant.status}`}>
                                {statusLabels[tenant.status]}
                            </span>
                        </div>
                        <p>
                            شناسه #{numberFormatter.format(tenant.id)} · عضویت {" "}
                            {formatDate(tenant.created_at)}
                        </p>
                    </div>
                </div>

                <div className="sa-customers-card-actions">
                    <button type="button" onClick={onManage}>
                        <Icon name="settings" />
                        مدیریت سریع
                    </button>
                    <Link href={`/super-admin/customers/${tenant.id}`}>
                        جزئیات کامل
                        <Icon name="arrow" />
                    </Link>
                </div>
            </div>

            <div className="sa-customers-card-grid">
                <InfoItem
                    label="مالک حساب"
                    value={tenant.owner_name || "ثبت نشده"}
                />
                <InfoItem label="راه ارتباطی" value={contact} ltr />
                <InfoItem
                    label="سایت‌ها"
                    value={`${numberFormatter.format(tenant.active_sites_count)} فعال از ${numberFormatter.format(tenant.sites_count)}`}
                />
                <InfoItem
                    label="کاربران پنل"
                    value={`${numberFormatter.format(tenant.users_count)} کاربر · ${numberFormatter.format(tenant.agents_count)} پشتیبان`}
                />
                <InfoItem
                    label="گفتگوهای این ماه"
                    value={numberFormatter.format(tenant.monthly_conversations)}
                />
                <InfoItem
                    label="پیام‌های این ماه"
                    value={numberFormatter.format(tenant.monthly_messages)}
                />
            </div>

            <div className="sa-customers-card-bottom">
                <div className="sa-customers-plan">
                    <div className="sa-customers-plan-head">
                        <div>
                            <span>پلن فعلی</span>
                            <strong>{tenant.plan_name || "بدون پلن"}</strong>
                        </div>
                        <b className={usageTone}>
                            {percentFormatter.format(tenant.usage_percent)}٪ مصرف
                        </b>
                    </div>

                    <div className="sa-customers-progress" aria-hidden="true">
                        <span
                            className={usageTone}
                            style={{ width: `${safeUsage}%` }}
                        />
                    </div>

                    <small>
                        {numberFormatter.format(tenant.monthly_conversations)} از {" "}
                        {tenant.max_monthly_conversations
                            ? numberFormatter.format(
                                tenant.max_monthly_conversations
                            )
                            : "بدون سقف مشخص"}
                        {tenant.max_monthly_conversations ? " گفتگو" : ""}
                    </small>
                </div>

                <div className="sa-customers-activity">
                    <Icon name="activity" />
                    <div>
                        <span>آخرین فعالیت</span>
                        <strong>{formatDateTime(tenant.last_activity_at)}</strong>
                    </div>
                </div>
            </div>
        </article>
    );
}

function InfoItem({
                      label,
                      value,
                      ltr = false,
                  }: {
    label: string;
    value: string;
    ltr?: boolean;
}) {
    return (
        <div className="sa-customers-info-item">
            <span>{label}</span>
            <strong className={ltr ? "ltr" : ""}>{value}</strong>
        </div>
    );
}

function EmptyState({
                        filtered,
                        onReset,
                    }: {
    filtered: boolean;
    onReset: () => void;
}) {
    return (
        <div className="sa-customers-empty">
            <div>
                <Icon name="users" />
            </div>
            <h2>{filtered ? "مشتری مطابق فیلتر پیدا نشد" : "هنوز مشتری ثبت نشده"}</h2>
            <p>
                {filtered
                    ? "عبارت جست‌وجو یا فیلترها را تغییر بده."
                    : "اولین مشتری پلتفرم را ایجاد کن تا در این بخش نمایش داده شود."}
            </p>
            {filtered ? (
                <button type="button" onClick={onReset}>
                    پاک‌کردن فیلترها
                </button>
            ) : (
                <Link href="/super-admin/customers/create">ایجاد مشتری جدید</Link>
            )}
        </div>
    );
}

function CustomersSkeleton() {
    return (
        <div className="sa-customers-list" aria-label="در حال بارگذاری">
            {[1, 2, 3].map((item) => (
                <div className="sa-customers-skeleton" key={item}>
                    <div className="sa-customers-skeleton-head">
                        <span />
                        <div>
                            <b />
                            <i />
                        </div>
                    </div>
                    <div className="sa-customers-skeleton-grid">
                        {[1, 2, 3, 4, 5, 6].map((tile) => (
                            <span key={tile} />
                        ))}
                    </div>
                    <em />
                </div>
            ))}
        </div>
    );
}

function ManagementModal({
                             tenant,
                             plans,
                             status,
                             planId,
                             saving,
                             changed,
                             error,
                             onStatusChange,
                             onPlanChange,
                             onClose,
                             onSave,
                         }: {
    tenant: Tenant;
    plans: PlanOption[];
    status: TenantStatus;
    planId: string;
    saving: boolean;
    changed: boolean;
    error: string;
    onStatusChange: (status: TenantStatus) => void;
    onPlanChange: (planId: string) => void;
    onClose: () => void;
    onSave: () => void;
}) {
    return (
        <div className="sa-customers-modal-backdrop" onMouseDown={onClose}>
            <section
                className="sa-customers-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="customer-management-title"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header>
                    <div>
                        <span>مدیریت سریع مشتری</span>
                        <h2 id="customer-management-title">{tenant.name}</h2>
                        <p>وضعیت حساب و پلن فعال مشتری را مدیریت کن.</p>
                    </div>
                    <button type="button" onClick={onClose} disabled={saving}>
                        <Icon name="close" />
                    </button>
                </header>

                {error && <div className="sa-customers-modal-error">{error}</div>}

                <div className="sa-customers-modal-section">
                    <label>وضعیت حساب</label>
                    <div className="sa-customers-modal-statuses">
                        {(
                            ["active", "inactive", "suspended"] as TenantStatus[]
                        ).map((option) => (
                            <button
                                key={option}
                                type="button"
                                className={status === option ? "active" : ""}
                                onClick={() => onStatusChange(option)}
                            >
                                <span className={`dot ${option}`} />
                                {statusLabels[option]}
                            </button>
                        ))}
                    </div>

                    {status !== "active" && (
                        <div className="sa-customers-modal-warning">
                            <Icon name="warning" />
                            <p>
                                با غیرفعال یا تعلیق‌کردن حساب، کاربران مشتری به پنل و
                                ویجت فعال دسترسی نخواهند داشت؛ اطلاعات حذف نمی‌شود.
                            </p>
                        </div>
                    )}
                </div>

                <div className="sa-customers-modal-section">
                    <label htmlFor="customer-plan-select">پلن مشتری</label>
                    <select
                        id="customer-plan-select"
                        value={planId}
                        onChange={(event) => onPlanChange(event.target.value)}
                    >
                        <option value="" disabled>
                            انتخاب پلن
                        </option>
                        {plans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                                {plan.name} · سقف {" "}
                                {numberFormatter.format(
                                    plan.max_monthly_conversations
                                )} گفتگو
                            </option>
                        ))}
                    </select>
                    {plans.length === 0 && (
                        <small>هیچ پلن فعالی برای تخصیص وجود ندارد.</small>
                    )}
                </div>

                <footer>
                    <button
                        className="secondary"
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                    >
                        انصراف
                    </button>
                    <button
                        className="primary"
                        type="button"
                        onClick={onSave}
                        disabled={saving || !changed || !planId}
                    >
                        {saving ? "در حال ذخیره..." : "اعمال تغییرات"}
                    </button>
                </footer>
            </section>
        </div>
    );
}

function buildPageNumbers(
    current: number,
    total: number
): Array<number | "ellipsis"> {
    if (total <= 7) {
        return Array.from({ length: total }, (_, index) => index + 1);
    }

    const pages: Array<number | "ellipsis"> = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    if (start > 2) {
        pages.push("ellipsis");
    }

    for (let value = start; value <= end; value += 1) {
        pages.push(value);
    }

    if (end < total - 1) {
        pages.push("ellipsis");
    }

    pages.push(total);
    return pages;
}

function getInitials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
        return "م";
    }

    return parts
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join("");
}

function parseDate(value: string | null) {
    if (!value) {
        return null;
    }

    const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string | null) {
    const date = parseDate(value);

    if (!date) {
        return "ثبت نشده";
    }

    return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(date);
}

function formatDateTime(value: string | null) {
    const date = parseDate(value);

    if (!date) {
        return "فعالیتی ثبت نشده";
    }

    return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function Icon({ name }: { name: IconName }) {
    const common = {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        "aria-hidden": true,
    };

    const paths: Record<IconName, React.ReactNode> = {
        users: (
            <>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </>
        ),
        building: (
            <>
                <path d="M3 21h18" />
                <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
                <path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01" />
            </>
        ),
        site: (
            <>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
            </>
        ),
        agent: (
            <>
                <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
                <path d="M18 19c0 1.1-.9 2-2 2h-3" />
                <path d="M4 13a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2v-2ZM20 13a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2v-2Z" />
            </>
        ),
        search: (
            <>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
            </>
        ),
        filter: <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" />,
        sort: (
            <>
                <path d="M8 7h12M8 12h9M8 17h6" />
                <path d="m3 8 2-2 2 2M5 6v12" />
            </>
        ),
        refresh: (
            <>
                <path d="M20 11a8 8 0 1 0 2 5" />
                <path d="M20 4v7h-7" />
            </>
        ),
        plus: <path d="M12 5v14M5 12h14" />,
        settings: (
            <>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1v.1h-4v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4h-.1v-4H3a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1v-.1h4V3a1.7 1.7 0 0 0 1.1 1.6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.18.36.4.7.6 1 .2.3.3.65.3 1v1c0 .35-.1.7-.3 1-.2.3-.42.64-.6 1Z" />
            </>
        ),
        arrow: <path d="m9 18 6-6-6-6" />,
        activity: (
            <>
                <path d="M3 12h4l2-5 4 10 2-5h6" />
            </>
        ),
        message: (
            <>
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-5A7 7 0 0 1 3 12a7 7 0 0 1 7-7h7a4 4 0 0 1 4 4v6Z" />
            </>
        ),
        close: <path d="m7 7 10 10M17 7 7 17" />,
        check: <path d="m5 12 4 4L19 6" />,
        warning: (
            <>
                <path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
                <path d="M12 9v4M12 17h.01" />
            </>
        ),
    };

    return <svg {...common}>{paths[name]}</svg>;
}
