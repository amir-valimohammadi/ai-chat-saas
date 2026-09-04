// مسیر فایل: ai-chat-saas/frontend/app/sites/page.tsx
// هدف: مدیریت سایت‌های مشتری، نمایش مصرف max_sites و ساخت سایت جدید

"use client";

import Link from "next/link";
import {
    FormEvent,
    ReactNode,
    useEffect,
    useMemo,
    useState,
} from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type AiMode = "off" | "assistant" | "semi_auto";

type Site = {
    id: number;
    tenant_id: number;
    name: string;
    domain: string;
    site_key: string;
    brand_name: string | null;
    brand_color: string | null;
    logo_url: string | null;
    welcome_message: string | null;
    ai_mode: AiMode | string;
    is_active: boolean;
    install_code: string;
    created_at: string;
};

type UsageItem = {
    used: number;
    limit: number;
    remaining: number;
    percent: number;
    near_limit: boolean;
    reached: boolean;
    over_limit: boolean;
    over_by: number;
    status:
        | "normal"
        | "warning"
        | "reached"
        | "exceeded"
        | "unavailable";
};

type PlanUsageResponse = {
    customer: {
        id: number;
        name: string;
        status: string;
    };
    plan: {
        id: number | null;
        name: string | null;
        is_active: boolean;
        assigned: boolean;
    };
    usage: {
        sites: UsageItem;
    };
};

type CreateSiteForm = {
    name: string;
    domain: string;
    brand_name: string;
    brand_color: string;
    welcome_message: string;
    ai_mode: AiMode;
};

type FormErrors = Partial<Record<keyof CreateSiteForm, string>>;

const DEFAULT_FORM: CreateSiteForm = {
    name: "",
    domain: "",
    brand_name: "",
    brand_color: "#0f766e",
    welcome_message: "سلام، چطور می‌تونیم کمکتون کنیم؟",
    ai_mode: "assistant",
};

const AI_MODE_LABELS: Record<AiMode, string> = {
    off: "خاموش",
    assistant: "کمک‌یار پشتیبان",
    semi_auto: "نیمه‌خودکار",
};

export default function CustomerSitesPage() {
    const router = useRouter();

    const [sites, setSites] = useState<Site[]>([]);
    const [planUsage, setPlanUsage] =
        useState<PlanUsageResponse | null>(null);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createModalOpen, setCreateModalOpen] = useState(false);

    const [form, setForm] = useState<CreateSiteForm>(DEFAULT_FORM);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [expandedSiteId, setExpandedSiteId] =
        useState<number | null>(null);

    const formErrors = useMemo(() => validateForm(form), [form]);
    const siteUsage = planUsage?.usage.sites ?? null;

    const canCreateSite = Boolean(
        planUsage?.plan.assigned
        && planUsage?.plan.is_active
        && siteUsage
        && !siteUsage.reached
        && siteUsage.limit > 0
    );

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

        void loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    async function loadData(options: { silent?: boolean } = {}) {
        try {
            setError("");

            if (options.silent) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            const [sitesResponse, usageResponse] = await Promise.all([
                apiRequest("/customer/sites-list.php"),
                apiRequest("/customer/plan-usage.php"),
            ]);

            setSites(
                Array.isArray(sitesResponse.sites)
                    ? (sitesResponse.sites as Site[])
                    : []
            );

            setPlanUsage(usageResponse as PlanUsageResponse);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "دریافت اطلاعات سایت‌ها ناموفق بود."
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    function openCreateModal() {
        setError("");
        setSuccess("");

        if (!canCreateSite) {
            setError(
                siteUsage?.reached
                    ? "ظرفیت سایت‌های پلن شما تکمیل شده است."
                    : "پلن فعلی اجازه ساخت سایت جدید را نمی‌دهد."
            );
            return;
        }

        setForm(DEFAULT_FORM);
        setCreateModalOpen(true);
    }

    function closeCreateModal() {
        if (creating) {
            return;
        }

        setCreateModalOpen(false);
        setForm(DEFAULT_FORM);
    }

    function updateField<K extends keyof CreateSiteForm>(
        field: K,
        value: CreateSiteForm[K]
    ) {
        setForm((previous) => ({
            ...previous,
            [field]: value,
        }));
        setError("");
    }

    async function handleCreateSite(
        event: FormEvent<HTMLFormElement>
    ) {
        event.preventDefault();

        const errors = validateForm(form);

        if (Object.keys(errors).length > 0 || creating) {
            setError("لطفاً خطاهای فرم را برطرف کنید.");
            return;
        }

        try {
            setCreating(true);
            setError("");
            setSuccess("");

            const response = await apiRequest(
                "/customer/site-create.php",
                {
                    method: "POST",
                    body: JSON.stringify({
                        name: form.name.trim(),
                        domain: normalizeDomain(form.domain),
                        brand_name:
                            form.brand_name.trim()
                            || form.name.trim(),
                        brand_color:
                            form.brand_color.trim().toLowerCase(),
                        welcome_message:
                            form.welcome_message.trim(),
                        ai_mode: form.ai_mode,
                    }),
                }
            );

            setCreateModalOpen(false);
            setForm(DEFAULT_FORM);
            setSuccess(
                `سایت «${response.site?.name || form.name}» با موفقیت ساخته شد.`
            );

            await loadData({ silent: true });

            if (response.site?.id) {
                setExpandedSiteId(Number(response.site.id));
            }
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "ساخت سایت ناموفق بود."
            );
        } finally {
            setCreating(false);
        }
    }

    async function copyValue(
        key: string,
        value: string,
        successMessage: string
    ) {
        try {
            await copyText(value);
            setCopiedKey(key);
            setSuccess(successMessage);
            setError("");

            window.setTimeout(() => {
                setCopiedKey((current) =>
                    current === key ? null : current
                );
            }, 1800);
        } catch {
            setError("کپی‌کردن ممکن نشد. متن را دستی انتخاب کنید.");
        }
    }

    return (
        <AppShell
            title="سایت‌ها"
            kicker="مدیریت کانال‌ها"
            description="دامنه‌ها، وضعیت ویجت و ظرفیت سایت‌های متصل را از یک نما مدیریت کنید."
            actions={
                <div className="customer-sites-header-actions">
                    <button
                        className="btn secondary customer-sites-refresh-button"
                        type="button"
                        onClick={() => void loadData({ silent: true })}
                        disabled={loading || refreshing || creating}
                    >
                        {refreshing
                            ? "در حال بروزرسانی..."
                            : "بروزرسانی"}
                    </button>

                    <button
                        className="btn customer-sites-create-button"
                        type="button"
                        onClick={openCreateModal}
                        disabled={!canCreateSite || loading}
                    >
                        افزودن سایت
                    </button>
                </div>
            }
        >
            <div className="customer-sites-page">
                <div
                    className="customer-sites-alert-stack"
                    aria-live="polite"
                >
                    {error && (
                        <div className="customer-sites-alert error" role="alert">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="customer-sites-alert success" role="status">
                            {success}
                        </div>
                    )}
                </div>

                {loading ? (
                    <SitesSkeleton />
                ) : (
                    <>
                        <PlanCapacityCard
                            usage={siteUsage}
                            planName={planUsage?.plan.name || "بدون پلن"}
                        />

                        <section className="customer-sites-list-panel">
                            <div className="customer-sites-section-head">
                                <div>
                                    <span>فضاهای متصل</span>
                                    <h2>سایت‌های ثبت‌شده</h2>
                                    <p>
                                        هر سایت کلید و کد نصب مستقل دارد.
                                    </p>
                                </div>

                                <strong>
                                    {sites.length.toLocaleString("fa-IR")}
                                </strong>
                            </div>

                            {sites.length === 0 ? (
                                <EmptySitesState
                                    canCreate={canCreateSite}
                                    onCreate={openCreateModal}
                                />
                            ) : (
                                <div className="customer-sites-grid">
                                    {sites.map((site) => (
                                        <SiteCard
                                            key={site.id}
                                            site={site}
                                            expanded={
                                                expandedSiteId === site.id
                                            }
                                            copiedKey={copiedKey}
                                            onToggle={() =>
                                                setExpandedSiteId(
                                                    expandedSiteId === site.id
                                                        ? null
                                                        : site.id
                                                )
                                            }
                                            onCopy={copyValue}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>

            {createModalOpen && (
                <CreateSiteModal
                    form={form}
                    errors={formErrors}
                    creating={creating}
                    onClose={closeCreateModal}
                    onSubmit={handleCreateSite}
                    onUpdate={updateField}
                />
            )}
        </AppShell>
    );
}

function PlanCapacityCard({
    usage,
    planName,
}: {
    usage: UsageItem | null;
    planName: string;
}) {
    const percent = usage
        ? Math.min(Math.max(usage.percent, 0), 100)
        : 0;

    return (
        <section className="customer-sites-capacity-card">
            <div className="customer-sites-capacity-main">
                <div className="customer-sites-capacity-icon">
                    <GlobeIcon />
                </div>

                <div>
                    <span>ظرفیت سایت‌های پلن</span>
                    <h2>{planName}</h2>
                    <p>
                        سایت‌های فعال و غیرفعال هر دو در ظرفیت پلن
                        محاسبه می‌شوند.
                    </p>
                </div>
            </div>

            <div className="customer-sites-capacity-meter">
                <div className="customer-sites-capacity-numbers">
                    <strong>
                        {(usage?.used || 0).toLocaleString("fa-IR")}
                    </strong>
                    <span>
                        از {(usage?.limit || 0).toLocaleString("fa-IR")} سایت
                    </span>
                </div>

                <div className="customer-sites-progress">
                    <span style={{ width: `${percent}%` }} />
                </div>

                <div className="customer-sites-capacity-foot">
                    <span>
                        {usage
                            ? usageStatusLabel(usage.status)
                            : "نامشخص"}
                    </span>

                    <span>
                        {(usage?.remaining || 0).toLocaleString("fa-IR")}
                        {" "}ظرفیت باقی‌مانده
                    </span>
                </div>
            </div>

        </section>
    );
}

function SiteCard({
    site,
    expanded,
    copiedKey,
    onToggle,
    onCopy,
}: {
    site: Site;
    expanded: boolean;
    copiedKey: string | null;
    onToggle: () => void;
    onCopy: (
        key: string,
        value: string,
        successMessage: string
    ) => void;
}) {
    const color = normalizeColor(
        site.brand_color || "#0f766e"
    );

    const siteKeyCopyId = `site-key-${site.id}`;
    const installCopyId = `install-${site.id}`;

    return (
        <article
            className={`customer-sites-card ${
                expanded ? "is-expanded" : ""
            }`}
        >
            <div className="customer-sites-card-head">
                <div
                    className="customer-sites-brand-mark"
                    style={{ background: color }}
                >
                    {getInitial(site.brand_name || site.name)}
                </div>

                <div className="customer-sites-card-title">
                    <div>
                        <h3>{site.name}</h3>
                        <span
                            className={
                                site.is_active
                                    ? "is-active"
                                    : "is-inactive"
                            }
                        >
                            {site.is_active ? "فعال" : "غیرفعال"}
                        </span>
                    </div>

                    <a
                        href={normalizeDomainHref(site.domain)}
                        target="_blank"
                        rel="noreferrer"
                        dir="ltr"
                    >
                        {site.domain}
                    </a>
                </div>
            </div>

            <div className="customer-sites-card-meta">
                <MetaItem
                    label="حالت AI"
                    value={aiModeLabel(site.ai_mode)}
                />
                <MetaItem
                    label="تاریخ ثبت"
                    value={formatDate(site.created_at)}
                />
            </div>

            <div className="customer-sites-card-actions">
                <Link
                    className="customer-sites-action-link primary"
                    href={`/widget-settings?site_id=${site.id}`}
                >
                    تنظیمات ویجت
                </Link>

                <button
                    className="customer-sites-action-link"
                    type="button"
                    onClick={onToggle}
                >
                    {expanded ? "بستن جزئیات" : "کلید و کد نصب"}
                </button>
            </div>

            {expanded && (
                <div className="customer-sites-install-area">
                    <div className="customer-sites-key-row">
                        <div>
                            <span>Site Key</span>
                            <code dir="ltr">
                                {maskSiteKey(site.site_key)}
                            </code>
                        </div>

                        <button
                            className="btn secondary"
                            type="button"
                            onClick={() =>
                                void onCopy(
                                    siteKeyCopyId,
                                    site.site_key,
                                    "کلید سایت کپی شد."
                                )
                            }
                        >
                            {copiedKey === siteKeyCopyId
                                ? "کپی شد"
                                : "کپی کلید"}
                        </button>
                    </div>

                    <div className="customer-sites-code">
                        <div>
                            <span>کد نصب ویجت</span>

                            <button
                                type="button"
                                onClick={() =>
                                    void onCopy(
                                        installCopyId,
                                        site.install_code,
                                        "کد نصب ویجت کپی شد."
                                    )
                                }
                            >
                                {copiedKey === installCopyId
                                    ? "کپی شد"
                                    : "کپی کد"}
                            </button>
                        </div>

                        <textarea
                            value={site.install_code}
                            readOnly
                            dir="ltr"
                            spellCheck={false}
                            onFocus={(event) =>
                                event.currentTarget.select()
                            }
                        />
                    </div>
                </div>
            )}
        </article>
    );
}

function MetaItem({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="customer-sites-meta-item">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function CreateSiteModal({
    form,
    errors,
    creating,
    onClose,
    onSubmit,
    onUpdate,
}: {
    form: CreateSiteForm;
    errors: FormErrors;
    creating: boolean;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onUpdate: <K extends keyof CreateSiteForm>(
        field: K,
        value: CreateSiteForm[K]
    ) => void;
}) {
    return (
        <div
            className="customer-sites-modal-backdrop"
            onMouseDown={onClose}
        >
            <section
                className="customer-sites-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-site-title"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header className="customer-sites-modal-head">
                    <div>
                        <span>سایت جدید</span>
                        <h2 id="create-site-title">
                            افزودن سایت جدید
                        </h2>
                        <p>
                            دامنه، ظاهر اولیه و حالت AI سایت را مشخص کن.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        disabled={creating}
                        aria-label="بستن"
                    >
                        ×
                    </button>
                </header>

                <form
                    className="customer-sites-form"
                    onSubmit={onSubmit}
                    noValidate
                >
                    <div className="customer-sites-form-grid">
                        <Field
                            label="نام سایت"
                            error={errors.name}
                        >
                            <input
                                value={form.name}
                                onChange={(event) =>
                                    onUpdate(
                                        "name",
                                        event.target.value
                                    )
                                }
                                placeholder="مثلاً فروشگاه اصلی"
                                maxLength={255}
                            />
                        </Field>

                        <Field
                            label="دامنه"
                            error={errors.domain}
                            hint="بدون مسیر اضافه؛ مانند example.com"
                        >
                            <input
                                value={form.domain}
                                onChange={(event) =>
                                    onUpdate(
                                        "domain",
                                        event.target.value
                                    )
                                }
                                placeholder="example.com"
                                dir="ltr"
                                spellCheck={false}
                            />
                        </Field>

                        <Field
                            label="نام برند"
                            error={errors.brand_name}
                            hint="در صورت خالی‌بودن، نام سایت استفاده می‌شود."
                        >
                            <input
                                value={form.brand_name}
                                onChange={(event) =>
                                    onUpdate(
                                        "brand_name",
                                        event.target.value
                                    )
                                }
                                placeholder="نام نمایشی برند"
                                maxLength={255}
                            />
                        </Field>

                        <Field
                            label="رنگ برند"
                            error={errors.brand_color}
                        >
                            <div className="customer-sites-color-field">
                                <input
                                    type="color"
                                    value={normalizeColor(
                                        form.brand_color
                                    )}
                                    onChange={(event) =>
                                        onUpdate(
                                            "brand_color",
                                            event.target.value
                                        )
                                    }
                                    aria-label="انتخاب رنگ برند"
                                />

                                <input
                                    value={form.brand_color}
                                    onChange={(event) =>
                                        onUpdate(
                                            "brand_color",
                                            event.target.value
                                        )
                                    }
                                    dir="ltr"
                                    spellCheck={false}
                                />
                            </div>
                        </Field>
                    </div>

                    <Field
                        label="پیام خوش‌آمدگویی"
                        error={errors.welcome_message}
                    >
                        <textarea
                            value={form.welcome_message}
                            onChange={(event) =>
                                onUpdate(
                                    "welcome_message",
                                    event.target.value
                                )
                            }
                            maxLength={300}
                        />
                    </Field>

                    <Field label="حالت هوش مصنوعی">
                        <select
                            value={form.ai_mode}
                            onChange={(event) =>
                                onUpdate(
                                    "ai_mode",
                                    event.target.value as AiMode
                                )
                            }
                        >
                            <option value="off">خاموش</option>
                            <option value="assistant">
                                کمک‌یار پشتیبان
                            </option>
                            <option value="semi_auto">
                                نیمه‌خودکار
                            </option>
                        </select>
                    </Field>

                    <div className="customer-sites-form-actions">
                        <button
                            className="btn secondary"
                            type="button"
                            onClick={onClose}
                            disabled={creating}
                        >
                            انصراف
                        </button>

                        <button
                            className="btn"
                            type="submit"
                            disabled={
                                creating
                                || Object.keys(errors).length > 0
                            }
                        >
                            {creating
                                ? "در حال ساخت..."
                                : "ساخت سایت"}
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
}

function Field({
    label,
    error,
    hint,
    children,
}: {
    label: string;
    error?: string;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <label
            className={`customer-sites-field ${
                error ? "has-error" : ""
            }`}
        >
            <span>{label}</span>
            {children}

            {error ? (
                <small>{error}</small>
            ) : hint ? (
                <small>{hint}</small>
            ) : null}
        </label>
    );
}

function EmptySitesState({
    canCreate,
    onCreate,
}: {
    canCreate: boolean;
    onCreate: () => void;
}) {
    return (
        <div className="customer-sites-empty">
            <div>
                <GlobeIcon />
            </div>
            <h3>هنوز سایتی ثبت نشده است</h3>
            <p>
                اولین سایت را بساز تا کد نصب ویجت و تنظیمات مستقل آن
                ایجاد شود.
            </p>

            <button
                className="btn"
                type="button"
                onClick={onCreate}
                disabled={!canCreate}
            >
                افزودن اولین سایت
            </button>
        </div>
    );
}

function SitesSkeleton() {
    return (
        <div className="customer-sites-skeleton">
            <div />
            <section>
                <div />
                <div />
                <div />
            </section>
        </div>
    );
}

function validateForm(form: CreateSiteForm): FormErrors {
    const errors: FormErrors = {};

    if (!form.name.trim()) {
        errors.name = "نام سایت الزامی است.";
    } else if (form.name.trim().length > 255) {
        errors.name = "نام سایت بیش از حد طولانی است.";
    }

    const domain = normalizeDomain(form.domain);

    if (!domain) {
        errors.domain = "دامنه الزامی است.";
    } else if (
        domain.length > 255
        || /\s/.test(domain)
        || domain.includes("/")
    ) {
        errors.domain = "دامنه معتبر نیست.";
    } else if (!isValidHostname(domain)) {
        errors.domain = "ساختار دامنه معتبر نیست.";
    }

    if (form.brand_name.trim().length > 255) {
        errors.brand_name = "نام برند بیش از حد طولانی است.";
    }

    if (!/^#[0-9a-fA-F]{6}$/.test(form.brand_color.trim())) {
        errors.brand_color =
            "رنگ باید مانند #2563eb و شش‌رقمی باشد.";
    }

    if (!form.welcome_message.trim()) {
        errors.welcome_message =
            "پیام خوش‌آمدگویی نمی‌تواند خالی باشد.";
    } else if (form.welcome_message.trim().length > 300) {
        errors.welcome_message =
            "پیام خوش‌آمدگویی حداکثر ۳۰۰ کاراکتر است.";
    }

    return errors;
}

function normalizeDomain(value: string) {
    return value
        .trim()
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .replace(/\/+$/, "");
}

function isValidHostname(value: string) {
    if (value === "localhost") {
        return true;
    }

    return /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(
        value
    );
}

function normalizeDomainHref(domain: string) {
    return /^https?:\/\//i.test(domain)
        ? domain
        : `https://${domain}`;
}

function normalizeColor(value: string) {
    return /^#[0-9a-fA-F]{6}$/.test(value)
        ? value
        : "#0f766e";
}

function getInitial(value: string) {
    const clean = value.trim();

    return clean ? clean.slice(0, 1).toUpperCase() : "س";
}

function aiModeLabel(value: string) {
    if (
        value === "off"
        || value === "assistant"
        || value === "semi_auto"
    ) {
        return AI_MODE_LABELS[value];
    }

    return AI_MODE_LABELS.assistant;
}

function usageStatusLabel(status: UsageItem["status"]) {
    const labels: Record<UsageItem["status"], string> = {
        normal: "ظرفیت عادی",
        warning: "نزدیک سقف",
        reached: "ظرفیت تکمیل",
        exceeded: "عبور از سقف",
        unavailable: "غیرفعال",
    };

    return labels[status];
}

function maskSiteKey(value: string) {
    if (value.length <= 18) {
        return value;
    }

    return `${value.slice(0, 8)}••••••${value.slice(-8)}`;
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
    }).format(date);
}

async function copyText(value: string) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const copied = document.execCommand("copy");
    textarea.remove();

    if (!copied) {
        throw new Error("Copy failed");
    }
}

function GlobeIcon() {
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
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3a15 15 0 0 1 0 18" />
            <path d="M12 3a15 15 0 0 0 0 18" />
        </svg>
    );
}
