"use client";

import { suggestedSubscriptionPrice } from "@/lib/plan-money";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type SubscriptionStatus =
    | "trial"
    | "active"
    | "past_due"
    | "expired"
    | "cancelled"
    | "suspended";

type BillingCycle = "monthly" | "quarterly" | "yearly" | "manual";

type SubscriptionItem = {
    id: number;
    tenant_id: number;
    tenant_name: string;
    owner_email: string;
    plan_id: number;
    plan_name: string;
    status: SubscriptionStatus;
    billing_cycle: BillingCycle;
    starts_at: string;
    ends_at: string;
    days_remaining: number;
    price: number;
    currency: string;
    last_paid_at: string | null;
};

type TenantOption = {
    id: number;
    name: string;
    email: string | null;
    status: string;
    plan_name: string | null;
};

type PlanOption = {
    id: number;
    name: string;
    description: string | null;
    price_monthly: number;
    is_active: boolean;
};

type CreateForm = {
    tenant_id: string;
    plan_id: string;
    status: "trial" | "active" | "past_due" | "suspended";
    billing_cycle: BillingCycle;
    starts_at: string;
    ends_at: string;
    trial_ends_at: string;
    auto_renew: boolean;
    price: string;
    currency: string;
};

const statusLabels: Record<SubscriptionStatus, string> = {
    trial: "آزمایشی",
    active: "فعال",
    past_due: "سررسید گذشته",
    expired: "منقضی",
    cancelled: "لغوشده",
    suspended: "تعلیق‌شده",
};

const statusDescriptions: Record<SubscriptionStatus, string> = {
    trial: "دوره آزمایشی در حال استفاده",
    active: "اشتراک معتبر و قابل استفاده",
    past_due: "نیازمند پیگیری پرداخت",
    expired: "تاریخ اعتبار به پایان رسیده",
    cancelled: "اشتراک توسط مدیر لغو شده",
    suspended: "دسترسی‌های جدید موقتاً متوقف است",
};

const cycleLabels: Record<BillingCycle, string> = {
    monthly: "ماهانه",
    quarterly: "سه‌ماهه",
    yearly: "سالانه",
    manual: "دستی",
};

const summaryOrder: SubscriptionStatus[] = [
    "active",
    "trial",
    "past_due",
    "expired",
    "suspended",
    "cancelled",
];

function toLocalDateTime(date: Date) {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function addCycle(startValue: string, cycle: BillingCycle) {
    const start = startValue ? new Date(startValue) : new Date();
    if (Number.isNaN(start.getTime())) return "";

    const end = new Date(start);
    if (cycle === "monthly") end.setMonth(end.getMonth() + 1);
    if (cycle === "quarterly") end.setMonth(end.getMonth() + 3);
    if (cycle === "yearly") end.setFullYear(end.getFullYear() + 1);
    if (cycle === "manual") end.setMonth(end.getMonth() + 1);
    return toLocalDateTime(end);
}

function emptyCreateForm(): CreateForm {
    const startsAt = toLocalDateTime(new Date());
    return {
        tenant_id: "",
        plan_id: "",
        status: "active",
        billing_cycle: "monthly",
        starts_at: startsAt,
        ends_at: addCycle(startsAt, "monthly"),
        trial_ends_at: "",
        auto_renew: false,
        price: "0",
        currency: "IRR",
    };
}

export default function SubscriptionsPage() {
    const router = useRouter();
    const [items, setItems] = useState<SubscriptionItem[]>([]);
    const [summary, setSummary] = useState<Partial<Record<SubscriptionStatus, number>>>({});
    const [tenants, setTenants] = useState<TenantOption[]>([]);
    const [plans, setPlans] = useState<PlanOption[]>([]);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<"" | SubscriptionStatus>("");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [form, setForm] = useState<CreateForm>(emptyCreateForm);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    async function loadSubscriptions(
        silent = false,
        overrides?: { search?: string; status?: "" | SubscriptionStatus }
    ) {
        silent ? setRefreshing(true) : setLoading(true);
        setError("");
        try {
            const query = new URLSearchParams();
            const effectiveSearch = overrides?.search ?? search;
            const effectiveStatus = overrides?.status ?? status;
            if (effectiveSearch.trim()) query.set("search", effectiveSearch.trim());
            if (effectiveStatus) query.set("status", effectiveStatus);
            const response = await apiRequest(
                `/super-admin/subscriptions-list.php${query.toString() ? `?${query}` : ""}`
            );
            setItems(response.subscriptions || []);
            setSummary(response.summary || {});
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت اشتراک‌ها");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    async function loadOptions() {
        try {
            const [tenantResponse, planResponse] = await Promise.all([
                apiRequest("/super-admin/tenants-options.php"),
                apiRequest("/super-admin/plans-list.php"),
            ]);
            setTenants(tenantResponse.tenants || []);
            setPlans((planResponse.plans || []).filter((plan: PlanOption) => plan.is_active));
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت اطلاعات فرم");
        }
    }

    useEffect(() => {
        const user = getAuthUser();
        if (!user || user.role !== "super_admin") {
            router.push("/dashboard");
            return;
        }
        loadSubscriptions();
        loadOptions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    const selectedPlan = useMemo(
        () => plans.find((plan) => plan.id === Number(form.plan_id)) || null,
        [plans, form.plan_id]
    );

    const selectedTenant = useMemo(
        () => tenants.find((tenant) => tenant.id === Number(form.tenant_id)) || null,
        [tenants, form.tenant_id]
    );

    const previousSubscription = useMemo(
        () => items.find((item) => item.tenant_id === Number(form.tenant_id)) || null,
        [items, form.tenant_id]
    );

    function openCreateDrawer() {
        setForm(emptyCreateForm());
        setError("");
        setSuccess("");
        setDrawerOpen(true);
    }

    function updateForm<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
        setForm((current) => ({ ...current, [key]: value }));
    }

    function handlePlanChange(value: string) {
        const plan = plans.find((item) => item.id === Number(value));
        setForm((current) => ({
            ...current,
            plan_id: value,
            price: plan ? suggestedSubscriptionPrice(plan.price_monthly, current.billing_cycle, current.currency) : "",
        }));
    }

    function handleCycleChange(value: BillingCycle) {
        setForm((current) => ({
            ...current,
            billing_cycle: value,
            ends_at: addCycle(current.starts_at, value),
            price: selectedPlan
                ? suggestedSubscriptionPrice(selectedPlan.price_monthly, value, current.currency)
                : current.price,
        }));
    }

    function handleStartChange(value: string) {
        setForm((current) => ({
            ...current,
            starts_at: value,
            ends_at: addCycle(value, current.billing_cycle),
        }));
    }

    async function handleCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setSuccess("");

        if (!form.tenant_id) return setError("انتخاب مشتری الزامی است.");
        if (!form.plan_id) return setError("انتخاب پلن الزامی است.");
        if (!form.starts_at || !form.ends_at) return setError("تاریخ شروع و پایان را وارد کنید.");
        if (new Date(form.ends_at) <= new Date(form.starts_at)) {
            return setError("تاریخ پایان باید بعد از تاریخ شروع باشد.");
        }
        if (Number(form.price) < 0) return setError("مبلغ اشتراک نمی‌تواند منفی باشد.");
        if (!/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())) {
            return setError("کد ارز باید سه حرف انگلیسی مانند IRR باشد.");
        }

        setSaving(true);
        try {
            const response = await apiRequest("/super-admin/subscription-create.php", {
                method: "POST",
                body: JSON.stringify({
                    tenant_id: Number(form.tenant_id),
                    plan_id: Number(form.plan_id),
                    status: form.status,
                    billing_cycle: form.billing_cycle,
                    starts_at: form.starts_at,
                    ends_at: form.ends_at,
                    trial_ends_at: form.status === "trial" ? form.trial_ends_at || form.ends_at : null,
                    auto_renew: form.auto_renew,
                    price: Number(form.price || 0),
                    currency: form.currency.trim().toUpperCase(),
                }),
            });
            setSuccess(`اشتراک ${selectedTenant?.name || "مشتری"} با موفقیت ساخته شد.`);
            setDrawerOpen(false);
            await loadSubscriptions(true);
            if (response.subscription_id) {
                router.push(`/super-admin/subscriptions/${response.subscription_id}`);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در ساخت اشتراک");
        } finally {
            setSaving(false);
        }
    }

    function clearFilters() {
        setSearch("");
        setStatus("");
        loadSubscriptions(true, { search: "", status: "" });
    }

    return (
        <AppShell
            title="مدیریت اشتراک‌ها"
            kicker="Subscriptions"
            description="ساخت، تمدید، پیگیری انقضا و ثبت پرداخت اشتراک مشتریان"
            actions={
                <div className="sa-subscription-page-actions">
                    <button
                        className="btn secondary"
                        type="button"
                        onClick={() => loadSubscriptions(true)}
                        disabled={refreshing}
                    >
                        {refreshing ? "در حال بروزرسانی..." : "بروزرسانی"}
                    </button>
                    <button className="btn primary" type="button" onClick={openCreateDrawer}>
                        <span aria-hidden="true">＋</span>
                        اشتراک جدید
                    </button>
                </div>
            }
        >
            <div className="sa-subscriptions">
                {error && !drawerOpen && <div className="error">{error}</div>}
                {success && <div className="success">{success}</div>}

                <section className="subscription-summary" aria-label="خلاصه وضعیت اشتراک‌ها">
                    {summaryOrder.map((key) => (
                        <article className={`subscription-stat is-${key}`} key={key}>
                            <div className="subscription-stat-copy">
                                <span>{statusLabels[key]}</span>
                                <small>{statusDescriptions[key]}</small>
                            </div>
                            <strong>{Number(summary[key] || 0).toLocaleString("fa-IR")}</strong>
                        </article>
                    ))}
                </section>

                <section className="subscription-catalog-card">
                    <header className="subscription-catalog-header">
                        <div>
                            <span className="subscription-eyebrow">فهرست قراردادها</span>
                            <h2>اشتراک مشتریان</h2>
                            <p>اشتراک‌های نزدیک به انقضا در ابتدای فهرست نمایش داده می‌شوند.</p>
                        </div>
                        <span className="subscription-result-count">
                            {items.length.toLocaleString("fa-IR")} مورد
                        </span>
                    </header>

                    <form
                        className="subscription-toolbar"
                        onSubmit={(event) => {
                            event.preventDefault();
                            loadSubscriptions(true);
                        }}
                    >
                        <label className="subscription-search-field">
                            <span aria-hidden="true">⌕</span>
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="جست‌وجوی نام یا ایمیل مشتری"
                            />
                        </label>
                        <select
                            value={status}
                            onChange={(event) => setStatus(event.target.value as "" | SubscriptionStatus)}
                            aria-label="فیلتر وضعیت اشتراک"
                        >
                            <option value="">همه وضعیت‌ها</option>
                            {summaryOrder.map((key) => (
                                <option key={key} value={key}>
                                    {statusLabels[key]}
                                </option>
                            ))}
                        </select>
                        <button className="btn primary" type="submit">
                            اعمال فیلتر
                        </button>
                        {(search || status) && (
                            <button className="btn secondary" type="button" onClick={clearFilters}>
                                پاک‌کردن
                            </button>
                        )}
                    </form>

                    {loading ? (
                        <div className="subscription-loading-list" aria-label="در حال بارگذاری">
                            {Array.from({ length: 5 }).map((_, index) => (
                                <span key={index} />
                            ))}
                        </div>
                    ) : items.length === 0 ? (
                        <div className="subscription-empty-state">
                            <div aria-hidden="true">◷</div>
                            <h3>اشتراکی پیدا نشد</h3>
                            <p>فیلترها را تغییر بده یا اولین اشتراک را برای یک مشتری بساز.</p>
                            <button className="btn primary" type="button" onClick={openCreateDrawer}>
                                ساخت اشتراک
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="subscription-table-wrap">
                                <table className="subscription-table">
                                    <thead>
                                    <tr>
                                        <th>مشتری</th>
                                        <th>پلن و دوره</th>
                                        <th>وضعیت</th>
                                        <th>پایان اعتبار</th>
                                        <th>باقی‌مانده</th>
                                        <th>مبلغ</th>
                                        <th>آخرین پرداخت</th>
                                        <th aria-label="عملیات" />
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {items.map((item) => (
                                        <tr key={item.id}>
                                            <td>
                                                <div className="subscription-customer-cell">
                                                        <span className="subscription-avatar">
                                                            {item.tenant_name.trim().slice(0, 1) || "م"}
                                                        </span>
                                                    <div>
                                                        <strong>{item.tenant_name}</strong>
                                                        <small>{item.owner_email || `شناسه مشتری ${item.tenant_id}`}</small>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <strong className="subscription-plan-name">{item.plan_name}</strong>
                                                <small>{cycleLabels[item.billing_cycle] || item.billing_cycle}</small>
                                            </td>
                                            <td>
                                                    <span className={`subscription-badge is-${item.status}`}>
                                                        {statusLabels[item.status] || item.status}
                                                    </span>
                                            </td>
                                            <td>
                                                <time>{formatDate(item.ends_at)}</time>
                                            </td>
                                            <td>{remainingLabel(item)}</td>
                                            <td>{formatMoney(item.price, item.currency)}</td>
                                            <td>{item.last_paid_at ? formatDate(item.last_paid_at) : "ثبت نشده"}</td>
                                            <td>
                                                <Link
                                                    className="subscription-row-action"
                                                    href={`/super-admin/subscriptions/${item.id}`}
                                                    aria-label={`مشاهده اشتراک ${item.tenant_name}`}
                                                >
                                                    جزئیات
                                                    <span aria-hidden="true">←</span>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="subscription-mobile-list">
                                {items.map((item) => (
                                    <article className="subscription-mobile-card" key={item.id}>
                                        <header>
                                            <div className="subscription-customer-cell">
                                                <span className="subscription-avatar">
                                                    {item.tenant_name.trim().slice(0, 1) || "م"}
                                                </span>
                                                <div>
                                                    <strong>{item.tenant_name}</strong>
                                                    <small>{item.owner_email}</small>
                                                </div>
                                            </div>
                                            <span className={`subscription-badge is-${item.status}`}>
                                                {statusLabels[item.status]}
                                            </span>
                                        </header>
                                        <div className="subscription-mobile-meta">
                                            <div><span>پلن</span><strong>{item.plan_name}</strong></div>
                                            <div><span>پایان</span><strong>{formatDate(item.ends_at)}</strong></div>
                                            <div><span>باقی‌مانده</span><strong>{remainingLabel(item)}</strong></div>
                                            <div><span>مبلغ</span><strong>{formatMoney(item.price, item.currency)}</strong></div>
                                        </div>
                                        <Link className="btn secondary" href={`/super-admin/subscriptions/${item.id}`}>
                                            مدیریت اشتراک
                                        </Link>
                                    </article>
                                ))}
                            </div>
                        </>
                    )}
                </section>
            </div>

            {drawerOpen && (
                <div
                    className="subscription-drawer-backdrop"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (event.currentTarget === event.target && !saving) setDrawerOpen(false);
                    }}
                >
                    <aside className="subscription-drawer" role="dialog" aria-modal="true" aria-labelledby="new-subscription-title">
                        <header className="subscription-drawer-head">
                            <div>
                                <span className="subscription-eyebrow">New subscription</span>
                                <h2 id="new-subscription-title">ساخت اشتراک جدید</h2>
                                <p>قرارداد فعال قبلی مشتری هنگام ثبت اشتراک جدید، به‌صورت خودکار لغو می‌شود.</p>
                            </div>
                            <button
                                className="subscription-drawer-close"
                                type="button"
                                onClick={() => setDrawerOpen(false)}
                                disabled={saving}
                                aria-label="بستن فرم"
                            >
                                ×
                            </button>
                        </header>

                        <form className="subscription-create-form" onSubmit={handleCreate}>
                            {error && <div className="error">{error}</div>}

                            <div className="subscription-form-grid two-columns">
                                <label className="subscription-field">
                                    <span>مشتری</span>
                                    <select
                                        value={form.tenant_id}
                                        onChange={(event) => updateForm("tenant_id", event.target.value)}
                                        required
                                    >
                                        <option value="">انتخاب مشتری</option>
                                        {tenants.map((tenant) => (
                                            <option key={tenant.id} value={tenant.id}>
                                                {tenant.name}{tenant.status !== "active" ? " — حساب غیرفعال" : ""}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="subscription-field">
                                    <span>پلن</span>
                                    <select value={form.plan_id} onChange={(event) => handlePlanChange(event.target.value)} required>
                                        <option value="">انتخاب پلن فعال</option>
                                        {plans.map((plan) => (
                                            <option key={plan.id} value={plan.id}>
                                                {plan.name} — {formatMoney(plan.price_monthly, "IRR")}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            {previousSubscription && (
                                <div className="subscription-form-notice is-warning">
                                    <strong>این مشتری قبلاً اشتراک دارد.</strong>
                                    <span>
                                        اشتراک «{previousSubscription.plan_name}» با وضعیت {statusLabels[previousSubscription.status]} پس از ثبت قرارداد جدید لغو می‌شود.
                                    </span>
                                </div>
                            )}

                            {selectedPlan && (
                                <div className="subscription-selected-plan">
                                    <div>
                                        <span>پلن انتخاب‌شده</span>
                                        <strong>{selectedPlan.name}</strong>
                                    </div>
                                    <p>{selectedPlan.description || "برای این پلن توضیحی ثبت نشده است."}</p>
                                </div>
                            )}

                            <div className="subscription-form-grid two-columns">
                                <label className="subscription-field">
                                    <span>وضعیت اولیه</span>
                                    <select
                                        value={form.status}
                                        onChange={(event) => updateForm("status", event.target.value as CreateForm["status"])}
                                    >
                                        <option value="active">فعال</option>
                                        <option value="trial">آزمایشی</option>
                                        <option value="past_due">سررسید گذشته</option>
                                        <option value="suspended">تعلیق‌شده</option>
                                    </select>
                                </label>
                                <label className="subscription-field">
                                    <span>دوره پرداخت</span>
                                    <select
                                        value={form.billing_cycle}
                                        onChange={(event) => handleCycleChange(event.target.value as BillingCycle)}
                                    >
                                        {Object.entries(cycleLabels).map(([key, label]) => (
                                            <option key={key} value={key}>{label}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            <div className="subscription-form-grid two-columns">
                                <label className="subscription-field">
                                    <span>تاریخ شروع</span>
                                    <input
                                        type="datetime-local"
                                        value={form.starts_at}
                                        onChange={(event) => handleStartChange(event.target.value)}
                                        required
                                    />
                                </label>
                                <label className="subscription-field">
                                    <span>تاریخ پایان</span>
                                    <input
                                        type="datetime-local"
                                        value={form.ends_at}
                                        min={form.starts_at}
                                        onChange={(event) => updateForm("ends_at", event.target.value)}
                                        required
                                    />
                                </label>
                            </div>

                            {form.status === "trial" && (
                                <label className="subscription-field">
                                    <span>پایان دوره آزمایشی</span>
                                    <input
                                        type="datetime-local"
                                        value={form.trial_ends_at}
                                        min={form.starts_at}
                                        max={form.ends_at}
                                        onChange={(event) => updateForm("trial_ends_at", event.target.value)}
                                    />
                                    <small>در صورت خالی‌بودن، تاریخ پایان اشتراک در نظر گرفته می‌شود.</small>
                                </label>
                            )}

                            <div className="subscription-form-grid money-grid">
                                <label className="subscription-field">
                                    <span>مبلغ کل قرارداد ({form.currency || "کد ارز را انتخاب کنید"})</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={form.price}
                                        onChange={(event) => updateForm("price", event.target.value)}
                                        required
                                    />
                                </label>
                                <label className="subscription-field">
                                    <span>کد ارز</span>
                                    <input
                                        dir="ltr"
                                        maxLength={3}
                                        value={form.currency}
                                        onChange={(event) => {
                                            const currency = event.target.value.toUpperCase();
                                            setForm((current) => ({ ...current, currency,
                                                price: selectedPlan ? suggestedSubscriptionPrice(selectedPlan.price_monthly, current.billing_cycle, currency) : "" }));
                                        }}
                                        required
                                    />
                                </label>
                            </div>

                            <label className="subscription-switch-row">
                                <input
                                    type="checkbox"
                                    checked={form.auto_renew}
                                    onChange={(event) => updateForm("auto_renew", event.target.checked)}
                                />
                                <span className="subscription-switch" aria-hidden="true" />
                                <span>
                                    <strong>تمدید خودکار</strong>
                                    <small>این گزینه فعلاً فقط در قرارداد ثبت می‌شود و پرداخت خودکار انجام نمی‌دهد.</small>
                                </span>
                            </label>

                            <footer className="subscription-drawer-actions">
                                <button className="btn secondary" type="button" onClick={() => setDrawerOpen(false)} disabled={saving}>
                                    انصراف
                                </button>
                                <button className="btn primary" type="submit" disabled={saving}>
                                    {saving ? "در حال ثبت..." : "ساخت اشتراک"}
                                </button>
                            </footer>
                        </form>
                    </aside>
                </div>
            )}
        </AppShell>
    );
}

function formatDate(value: string) {
    const parsed = new Date(value.replace(" ", "T"));
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(parsed);
}

function formatMoney(value: number, currency: string) {
    const amount = Number(value || 0).toLocaleString("fa-IR", { maximumFractionDigits: 2 });
    const labels: Record<string, string> = { IRR: "ریال", IRT: "تومان", USD: "دلار", EUR: "یورو" };
    return `${amount} ${labels[currency] || currency}`;
}

function remainingLabel(item: SubscriptionItem) {
    if (item.status === "expired") return "پایان‌یافته";
    if (item.status === "cancelled") return "لغوشده";
    if (item.days_remaining <= 0) return "امروز";
    if (item.days_remaining <= 7) return `${item.days_remaining.toLocaleString("fa-IR")} روز — فوری`;
    return `${item.days_remaining.toLocaleString("fa-IR")} روز`;
}
