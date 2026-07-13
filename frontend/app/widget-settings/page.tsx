// مسیر فایل: ai-chat-saas/frontend/app/widget-settings/page.tsx
// هدف: مدیریت حرفه‌ای تنظیمات ویجت با پیش‌نمایش هماهنگ با نسخه واقعی ویجت

"use client";

import {
    CSSProperties,
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
type PreviewDevice = "desktop" | "mobile";
type PreviewState = "open" | "closed";

type Site = {
    id: number;
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
};

type WidgetForm = {
    brand_name: string;
    brand_color: string;
    logo_url: string;
    welcome_message: string;
    ai_mode: AiMode;
};

type FormErrors = Partial<Record<keyof WidgetForm, string>>;

const DEFAULT_COLOR = "#2563eb";
const DEFAULT_WELCOME_MESSAGE = "سلام، چطور می‌تونیم کمکتون کنیم؟";
const MAX_BRAND_NAME_LENGTH = 80;
const MAX_WELCOME_MESSAGE_LENGTH = 300;

const AI_MODE_LABELS: Record<AiMode, string> = {
    off: "خاموش",
    assistant: "کمک‌یار پشتیبان",
    semi_auto: "نیمه‌خودکار",
};

const AI_MODE_DESCRIPTIONS: Record<AiMode, string> = {
    off: "پاسخ‌گویی فقط توسط تیم پشتیبانی انجام می‌شود.",
    assistant: "هوش مصنوعی پاسخ پیشنهادی برای پشتیبان آماده می‌کند.",
    semi_auto: "پاسخ‌های مطمئن به‌صورت خودکار و سایر موارد برای پشتیبان ارسال می‌شوند.",
};

const BRAND_COLOR_PRESETS = [
    "#2563eb",
    "#4f46e5",
    "#7c3aed",
    "#0f766e",
    "#059669",
    "#dc2626",
    "#c2410c",
    "#111827",
];

const EMPTY_FORM: WidgetForm = {
    brand_name: "",
    brand_color: DEFAULT_COLOR,
    logo_url: "",
    welcome_message: DEFAULT_WELCOME_MESSAGE,
    ai_mode: "assistant",
};

export default function WidgetSettingsPage() {
    const router = useRouter();

    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
    const [form, setForm] = useState<WidgetForm>(EMPTY_FORM);
    const [savedForm, setSavedForm] = useState<WidgetForm>(EMPTY_FORM);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [previewDevice, setPreviewDevice] =
        useState<PreviewDevice>("desktop");
    const [previewState, setPreviewState] =
        useState<PreviewState>("open");

    const selectedSite = useMemo(
        () => sites.find((site) => site.id === selectedSiteId) ?? null,
        [sites, selectedSiteId],
    );

    const formErrors = useMemo(() => validateForm(form), [form]);
    const hasErrors = Object.keys(formErrors).length > 0;
    const isDirty = useMemo(
        () => !areFormsEqual(form, savedForm),
        [form, savedForm],
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

        void loadSites();
        // loadSites عمداً فقط یک‌بار پس از احراز هویت اجرا می‌شود.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    useEffect(() => {
        function warnBeforeLeave(event: BeforeUnloadEvent) {
            if (!isDirty) {
                return;
            }

            event.preventDefault();
            event.returnValue = "";
        }

        window.addEventListener("beforeunload", warnBeforeLeave);
        return () => window.removeEventListener("beforeunload", warnBeforeLeave);
    }, [isDirty]);

    async function loadSites(
        preferredSiteId?: number | null,
        options: { silent?: boolean } = {},
    ) {
        const silent = Boolean(options.silent);

        try {
            setError("");
            setSuccess("");

            if (silent) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            const data = await apiRequest("/customer/sites-list.php");
            const loadedSites = Array.isArray(data.sites)
                ? (data.sites as Site[])
                : [];

            setSites(loadedSites);

            if (loadedSites.length === 0) {
                setSelectedSiteId(null);
                setForm(EMPTY_FORM);
                setSavedForm(EMPTY_FORM);
                return;
            }

            const targetId = preferredSiteId ?? selectedSiteId;
            const nextSite =
                loadedSites.find((site) => site.id === targetId) ??
                loadedSites[0];

            applySite(nextSite);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "خطا در دریافت سایت‌ها",
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    function applySite(site: Site) {
        const nextForm = formFromSite(site);

        setSelectedSiteId(site.id);
        setForm(nextForm);
        setSavedForm(nextForm);
        setCopied(false);
        setError("");
        setSuccess("");
    }

    function handleSelectSite(site: Site) {
        if (
            isDirty &&
            !window.confirm(
                "تغییرات این سایت هنوز ذخیره نشده است. بدون ذخیره به سایت دیگری برویم؟",
            )
        ) {
            return;
        }

        applySite(site);
    }

    function updateField<K extends keyof WidgetForm>(
        field: K,
        value: WidgetForm[K],
    ) {
        setForm((previous) => ({ ...previous, [field]: value }));
        setSuccess("");
    }

    async function handleRefresh() {
        if (
            isDirty &&
            !window.confirm(
                "با بروزرسانی، تغییرات ذخیره‌نشده از بین می‌رود. ادامه می‌دهید؟",
            )
        ) {
            return;
        }

        await loadSites(selectedSiteId, { silent: true });
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!selectedSiteId || saving) {
            return;
        }

        const errors = validateForm(form);

        if (Object.keys(errors).length > 0) {
            setError("لطفاً خطاهای فرم را برطرف کنید.");
            setSuccess("");
            return;
        }

        const normalizedForm = normalizeForm(form);

        try {
            setSaving(true);
            setError("");
            setSuccess("");

            await apiRequest("/customer/widget-settings-update.php", {
                method: "POST",
                body: JSON.stringify({
                    site_id: selectedSiteId,
                    ...normalizedForm,
                }),
            });

            setForm(normalizedForm);
            setSavedForm(normalizedForm);
            setSites((previous) =>
                previous.map((site) =>
                    site.id === selectedSiteId
                        ? {
                            ...site,
                            brand_name: normalizedForm.brand_name || null,
                            brand_color: normalizedForm.brand_color,
                            logo_url: normalizedForm.logo_url || null,
                            welcome_message: normalizedForm.welcome_message,
                            ai_mode: normalizedForm.ai_mode,
                        }
                        : site,
                ),
            );
            setSuccess("تنظیمات ویجت با موفقیت ذخیره شد.");
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "ذخیره تنظیمات ناموفق بود",
            );
        } finally {
            setSaving(false);
        }
    }

    function resetForm() {
        setForm(savedForm);
        setError("");
        setSuccess("");
    }

    async function copyInstallCode() {
        if (!selectedSite?.install_code) {
            return;
        }

        try {
            await copyText(selectedSite.install_code);
            setCopied(true);
            setError("");
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            setError("کپی‌کردن کد نصب ممکن نشد. کد را به‌صورت دستی انتخاب کنید.");
        }
    }

    return (
        <AppShell
            title="تنظیمات ویجت"
            kicker="Widget Customization"
            description="ظاهر و رفتار ویجت گفت‌وگو را برای هر سایت مدیریت کن"
            actions={
                <button
                    className="btn secondary widget-refresh-button"
                    type="button"
                    onClick={() => void handleRefresh()}
                    disabled={loading || refreshing || saving}
                >
                    <RefreshIcon />
                    {refreshing ? "در حال بروزرسانی..." : "بروزرسانی اطلاعات"}
                </button>
            }
        >
            <div className="widget-settings-shell">
                <div className="widget-alert-stack" aria-live="polite">
                    {error && <div className="widget-alert error">{error}</div>}
                    {success && (
                        <div className="widget-alert success">{success}</div>
                    )}
                </div>

                {loading ? (
                    <WidgetSettingsSkeleton />
                ) : sites.length === 0 ? (
                    <EmptySitesState />
                ) : selectedSite ? (
                    <>
                        <SelectedSiteSummary
                            site={selectedSite}
                            form={form}
                            isDirty={isDirty}
                        />

                        <div className="widget-workspace">
                            <SiteSelector
                                sites={sites}
                                selectedSiteId={selectedSiteId}
                                onSelect={handleSelectSite}
                            />

                            <main className="widget-editor-column">
                                <section className="widget-panel widget-editor-card">
                                    <PanelHeading
                                        eyebrow="Appearance & behavior"
                                        title="ظاهر و رفتار ویجت"
                                        description="تغییرات فرم به‌صورت زنده در پیش‌نمایش نمایش داده می‌شوند و بعد از ذخیره روی سایت اعمال خواهند شد."
                                        aside={
                                            <span
                                                className={`widget-save-state ${
                                                    isDirty ? "dirty" : "saved"
                                                }`}
                                            >
                                                <span />
                                                {isDirty
                                                    ? "تغییرات ذخیره‌نشده"
                                                    : "همه تغییرات ذخیره شده"}
                                            </span>
                                        }
                                    />

                                    <form
                                        className="widget-form"
                                        onSubmit={handleSubmit}
                                        noValidate
                                    >
                                        <div className="widget-form-grid two-columns">
                                            <FormField
                                                label="نام برند در ویجت"
                                                htmlFor="widget-brand-name"
                                                hint={`حداکثر ${MAX_BRAND_NAME_LENGTH} کاراکتر`}
                                                error={formErrors.brand_name}
                                            >
                                                <input
                                                    id="widget-brand-name"
                                                    className="widget-input"
                                                    value={form.brand_name}
                                                    maxLength={MAX_BRAND_NAME_LENGTH}
                                                    onChange={(event) =>
                                                        updateField(
                                                            "brand_name",
                                                            event.target.value,
                                                        )
                                                    }
                                                    placeholder={selectedSite.name}
                                                    autoComplete="organization"
                                                />
                                            </FormField>

                                            <FormField
                                                label="حالت هوش مصنوعی"
                                                htmlFor="widget-ai-mode"
                                                hint={
                                                    AI_MODE_DESCRIPTIONS[
                                                        form.ai_mode
                                                        ]
                                                }
                                            >
                                                <select
                                                    id="widget-ai-mode"
                                                    className="widget-select"
                                                    value={form.ai_mode}
                                                    onChange={(event) =>
                                                        updateField(
                                                            "ai_mode",
                                                            event.target
                                                                .value as AiMode,
                                                        )
                                                    }
                                                >
                                                    <option value="off">
                                                        خاموش
                                                    </option>
                                                    <option value="assistant">
                                                        کمک‌یار پشتیبان
                                                    </option>
                                                    <option value="semi_auto">
                                                        نیمه‌خودکار
                                                    </option>
                                                </select>
                                            </FormField>
                                        </div>

                                        <FormField
                                            label="رنگ برند"
                                            htmlFor="widget-brand-color-text"
                                            hint="رنگ اصلی دکمه، هدر و پیام‌های کاربر"
                                            error={formErrors.brand_color}
                                        >
                                            <div className="widget-color-control">
                                                <label
                                                    className="widget-color-picker"
                                                    title="انتخاب رنگ"
                                                >
                                                    <input
                                                        type="color"
                                                        aria-label="انتخاب رنگ برند"
                                                        value={normalizeColor(
                                                            form.brand_color,
                                                        )}
                                                        onChange={(event) =>
                                                            updateField(
                                                                "brand_color",
                                                                event.target.value,
                                                            )
                                                        }
                                                    />
                                                    <span
                                                        style={{
                                                            background:
                                                                normalizeColor(
                                                                    form.brand_color,
                                                                ),
                                                        }}
                                                    />
                                                </label>

                                                <input
                                                    id="widget-brand-color-text"
                                                    className="widget-input widget-color-text"
                                                    value={form.brand_color}
                                                    onChange={(event) =>
                                                        updateField(
                                                            "brand_color",
                                                            event.target.value,
                                                        )
                                                    }
                                                    placeholder={DEFAULT_COLOR}
                                                    dir="ltr"
                                                    spellCheck={false}
                                                />

                                                <div
                                                    className="widget-color-presets"
                                                    aria-label="رنگ‌های پیشنهادی"
                                                >
                                                    {BRAND_COLOR_PRESETS.map(
                                                        (color) => (
                                                            <button
                                                                key={color}
                                                                type="button"
                                                                className={
                                                                    normalizeColor(
                                                                        form.brand_color,
                                                                    ).toLowerCase() ===
                                                                    color.toLowerCase()
                                                                        ? "active"
                                                                        : ""
                                                                }
                                                                style={{
                                                                    background:
                                                                    color,
                                                                }}
                                                                title={color}
                                                                aria-label={`انتخاب رنگ ${color}`}
                                                                onClick={() =>
                                                                    updateField(
                                                                        "brand_color",
                                                                        color,
                                                                    )
                                                                }
                                                            />
                                                        ),
                                                    )}
                                                </div>
                                            </div>
                                        </FormField>

                                        <FormField
                                            label="آدرس لوگو"
                                            htmlFor="widget-logo-url"
                                            hint="لینک مستقیم تصویر با پروتکل http یا https؛ در صورت خالی بودن، حرف اول برند نمایش داده می‌شود."
                                            error={formErrors.logo_url}
                                        >
                                            <div className="widget-url-input-wrap">
                                                <LinkIcon />
                                                <input
                                                    id="widget-logo-url"
                                                    className="widget-input"
                                                    value={form.logo_url}
                                                    onChange={(event) =>
                                                        updateField(
                                                            "logo_url",
                                                            event.target.value,
                                                        )
                                                    }
                                                    placeholder="https://example.com/logo.png"
                                                    inputMode="url"
                                                    autoComplete="url"
                                                    dir="ltr"
                                                />
                                            </div>
                                        </FormField>

                                        <FormField
                                            label="پیام خوش‌آمدگویی"
                                            htmlFor="widget-welcome-message"
                                            hint="اولین متنی که بازدیدکننده هنگام بازکردن ویجت می‌بیند."
                                            error={formErrors.welcome_message}
                                            trailing={
                                                <span
                                                    className={`widget-character-count ${
                                                        form.welcome_message.length >
                                                        MAX_WELCOME_MESSAGE_LENGTH
                                                            ? "over-limit"
                                                            : ""
                                                    }`}
                                                >
                                                    {form.welcome_message.length}/
                                                    {MAX_WELCOME_MESSAGE_LENGTH}
                                                </span>
                                            }
                                        >
                                            <textarea
                                                id="widget-welcome-message"
                                                className="widget-textarea"
                                                value={form.welcome_message}
                                                maxLength={
                                                    MAX_WELCOME_MESSAGE_LENGTH + 30
                                                }
                                                onChange={(event) =>
                                                    updateField(
                                                        "welcome_message",
                                                        event.target.value,
                                                    )
                                                }
                                                placeholder={
                                                    DEFAULT_WELCOME_MESSAGE
                                                }
                                            />
                                        </FormField>

                                        <div className="widget-form-footer">
                                            <div className="widget-form-note">
                                                <InfoIcon />
                                                <span>
                                                    ذخیره تنظیمات، گفت‌وگوهای قبلی و
                                                    اطلاعات بازدیدکنندگان را تغییر نمی‌دهد.
                                                </span>
                                            </div>

                                            <div className="widget-form-actions">
                                                <button
                                                    className="widget-button secondary"
                                                    type="button"
                                                    onClick={resetForm}
                                                    disabled={!isDirty || saving}
                                                >
                                                    <UndoIcon />
                                                    بازگردانی
                                                </button>
                                                <button
                                                    className="widget-button primary"
                                                    type="submit"
                                                    disabled={
                                                        !isDirty ||
                                                        hasErrors ||
                                                        saving
                                                    }
                                                >
                                                    <SaveIcon />
                                                    {saving
                                                        ? "در حال ذخیره..."
                                                        : "ذخیره تغییرات"}
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                </section>

                                <InstallSection
                                    site={selectedSite}
                                    copied={copied}
                                    onCopy={() => void copyInstallCode()}
                                />
                            </main>

                            <WidgetPreview
                                color={form.brand_color}
                                title={
                                    form.brand_name.trim() || selectedSite.name
                                }
                                message={form.welcome_message}
                                logoUrl={form.logo_url}
                                aiMode={form.ai_mode}
                                device={previewDevice}
                                state={previewState}
                                onDeviceChange={setPreviewDevice}
                                onStateChange={setPreviewState}
                            />
                        </div>
                    </>
                ) : null}
            </div>
        </AppShell>
    );
}

function SelectedSiteSummary({
                                 site,
                                 form,
                                 isDirty,
                             }: {
    site: Site;
    form: WidgetForm;
    isDirty: boolean;
}) {
    const color = normalizeColor(form.brand_color);

    return (
        <section className="widget-summary-card">
            <div className="widget-summary-main">
                <span
                    className="widget-summary-color"
                    style={{ background: color }}
                    aria-hidden="true"
                />
                <div>
                    <span className="widget-summary-label">سایت انتخاب‌شده</span>
                    <strong>{site.name}</strong>
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

            <div className="widget-summary-meta">
                <SummaryItem
                    label="وضعیت سایت"
                    value={site.is_active ? "فعال" : "غیرفعال"}
                    tone={site.is_active ? "success" : "danger"}
                />
                <SummaryItem
                    label="حالت AI"
                    value={AI_MODE_LABELS[form.ai_mode]}
                    tone="primary"
                />
                <SummaryItem
                    label="وضعیت ویرایش"
                    value={isDirty ? "ذخیره‌نشده" : "ذخیره‌شده"}
                    tone={isDirty ? "warning" : "neutral"}
                />
            </div>
        </section>
    );
}

function SummaryItem({
                         label,
                         value,
                         tone,
                     }: {
    label: string;
    value: string;
    tone: "success" | "danger" | "primary" | "warning" | "neutral";
}) {
    return (
        <div className="widget-summary-item">
            <span>{label}</span>
            <b className={`tone-${tone}`}>{value}</b>
        </div>
    );
}

function SiteSelector({
                          sites,
                          selectedSiteId,
                          onSelect,
                      }: {
    sites: Site[];
    selectedSiteId: number | null;
    onSelect: (site: Site) => void;
}) {
    return (
        <aside className="widget-panel widget-sites-panel">
            <PanelHeading
                eyebrow="Sites"
                title="سایت‌های شما"
                description="برای هر سایت تنظیمات مستقل ذخیره می‌شود."
                aside={<span className="widget-count-badge">{sites.length}</span>}
            />

            <div className="widget-site-list">
                {sites.map((site) => {
                    const active = site.id === selectedSiteId;
                    const color = normalizeColor(
                        site.brand_color || DEFAULT_COLOR,
                    );

                    return (
                        <button
                            key={site.id}
                            type="button"
                            className={`widget-site-item ${
                                active ? "active" : ""
                            }`}
                            onClick={() => onSelect(site)}
                            aria-pressed={active}
                        >
                            <span
                                className="widget-site-color"
                                style={{ background: color }}
                                aria-hidden="true"
                            />

                            <span className="widget-site-copy">
                                <strong>{site.name}</strong>
                                <span dir="ltr">{site.domain}</span>
                            </span>

                            <span className="widget-site-statuses">
                                <span
                                    className={
                                        site.is_active ? "online" : "offline"
                                    }
                                >
                                    {site.is_active ? "فعال" : "غیرفعال"}
                                </span>
                                <span>{getAiModeLabel(site.ai_mode)}</span>
                            </span>

                            <ChevronLeftIcon />
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}

function PanelHeading({
                          eyebrow,
                          title,
                          description,
                          aside,
                      }: {
    eyebrow: string;
    title: string;
    description?: string;
    aside?: ReactNode;
}) {
    return (
        <header className="widget-panel-heading">
            <div>
                <span className="widget-eyebrow">{eyebrow}</span>
                <h2>{title}</h2>
                {description && <p>{description}</p>}
            </div>
            {aside && <div className="widget-panel-aside">{aside}</div>}
        </header>
    );
}

function FormField({
                       label,
                       htmlFor,
                       hint,
                       error,
                       trailing,
                       children,
                   }: {
    label: string;
    htmlFor: string;
    hint?: string;
    error?: string;
    trailing?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className={`widget-field ${error ? "has-error" : ""}`}>
            <div className="widget-field-label-row">
                <label htmlFor={htmlFor}>{label}</label>
                {trailing}
            </div>
            {children}
            {error ? (
                <span className="widget-field-error">{error}</span>
            ) : hint ? (
                <span className="widget-field-hint">{hint}</span>
            ) : null}
        </div>
    );
}

function InstallSection({
                            site,
                            copied,
                            onCopy,
                        }: {
    site: Site;
    copied: boolean;
    onCopy: () => void;
}) {
    const hasPlaceholderUrl = site.install_code.includes("yourdomain.com");

    return (
        <section className="widget-panel widget-install-card">
            <PanelHeading
                eyebrow="Installation"
                title="کد نصب ویجت"
                description="این قطعه کد را قبل از بسته‌شدن تگ body در سایت قرار بده."
                aside={
                    <button
                        className="widget-button secondary compact"
                        type="button"
                        onClick={onCopy}
                    >
                        {copied ? <CheckIcon /> : <CopyIcon />}
                        {copied ? "کپی شد" : "کپی کد"}
                    </button>
                }
            />

            {hasPlaceholderUrl && (
                <div className="widget-install-warning">
                    <WarningIcon />
                    <span>
                        آدرس فایل ویجت هنوز نمونه است. در مرحله بعد آدرس واقعی را از
                        تنظیمات بک‌اند تولید می‌کنیم.
                    </span>
                </div>
            )}

            <div className="widget-code-block">
                <div className="widget-code-toolbar">
                    <span>HTML</span>
                    <span>قبل از &lt;/body&gt;</span>
                </div>
                <textarea
                    readOnly
                    value={site.install_code}
                    onFocus={(event) => event.currentTarget.select()}
                    aria-label="کد نصب ویجت"
                    dir="ltr"
                    spellCheck={false}
                />
            </div>

            <div className="widget-install-details">
                <div>
                    <span>دامنه مجاز</span>
                    <strong dir="ltr">{site.domain}</strong>
                </div>
                <div>
                    <span>کلید سایت</span>
                    <strong dir="ltr" title={site.site_key}>
                        {maskSiteKey(site.site_key)}
                    </strong>
                </div>
            </div>
        </section>
    );
}

function WidgetPreview({
                           color,
                           title,
                           message,
                           logoUrl,
                           aiMode,
                           device,
                           state,
                           onDeviceChange,
                           onStateChange,
                       }: {
    color: string;
    title: string;
    message: string;
    logoUrl: string;
    aiMode: AiMode;
    device: PreviewDevice;
    state: PreviewState;
    onDeviceChange: (device: PreviewDevice) => void;
    onStateChange: (state: PreviewState) => void;
}) {
    const safeColor = normalizeColor(color);
    const previewStyle = {
        "--widget-preview-primary": safeColor,
        "--widget-preview-primary-dark": darkenColor(safeColor, 18),
        "--widget-preview-primary-soft": hexToRgba(safeColor, 0.1),
    } as CSSProperties;

    return (
        <aside className="widget-panel widget-preview-panel">
            <PanelHeading
                eyebrow="Live preview"
                title="پیش‌نمایش زنده"
                description="این پیش‌نمایش بدون تماس با API و فقط بر اساس فرم به‌روزرسانی می‌شود."
            />

            <div className="widget-preview-controls">
                <SegmentedControl
                    label="نوع دستگاه"
                    options={[
                        {
                            value: "desktop",
                            label: "دسکتاپ",
                            icon: <DesktopIcon />,
                        },
                        {
                            value: "mobile",
                            label: "موبایل",
                            icon: <MobileIcon />,
                        },
                    ]}
                    value={device}
                    onChange={(value) =>
                        onDeviceChange(value as PreviewDevice)
                    }
                />

                <SegmentedControl
                    label="وضعیت ویجت"
                    options={[
                        { value: "open", label: "باز" },
                        { value: "closed", label: "بسته" },
                    ]}
                    value={state}
                    onChange={(value) =>
                        onStateChange(value as PreviewState)
                    }
                />
            </div>

            <div
                className={`widget-preview-stage device-${device}`}
                style={previewStyle}
            >
                <div className="widget-preview-device">
                    <div className="widget-preview-browser-bar">
                        <div>
                            <span />
                            <span />
                            <span />
                        </div>
                        <span className="widget-preview-address" dir="ltr">
                            your-website.com
                        </span>
                    </div>

                    <div className="widget-preview-page">
                        <div className="widget-preview-page-content">
                            <span className="line line-title" />
                            <span className="line line-medium" />
                            <span className="line line-short" />
                            <div className="widget-preview-page-grid">
                                <span />
                                <span />
                            </div>
                        </div>

                        {state === "open" && (
                            <div className="widget-preview-window">
                                <div className="widget-preview-window-header">
                                    <PreviewBrand
                                        logoUrl={logoUrl}
                                        title={title}
                                    />

                                    <button
                                        type="button"
                                        aria-label="بستن پیش‌نمایش ویجت"
                                        onClick={() => onStateChange("closed")}
                                    >
                                        <CloseIcon />
                                    </button>

                                    <div className="widget-preview-new-chat">
                                        شروع گفتگوی جدید
                                    </div>
                                </div>

                                <div className="widget-preview-chat-body">
                                    <div className="widget-preview-welcome-card">
                                        <strong>سلام 👋</strong>
                                        <p>
                                            {message.trim() ||
                                                DEFAULT_WELCOME_MESSAGE}
                                        </p>
                                    </div>

                                    <div className="widget-preview-form-card">
                                        <strong>شروع گفتگو</strong>
                                        <span className="preview-field" />
                                        <span className="preview-field" />
                                        <span className="preview-field message" />
                                        <span className="preview-submit">
                                            شروع گفتگو
                                        </span>
                                    </div>
                                </div>

                                <div className="widget-preview-footer">
                                    <span>Powered by AI Chat SaaS</span>
                                </div>
                            </div>
                        )}

                        {state === "closed" && (
                            <div className="widget-preview-bubble">
                                {message.trim() ||
                                    "سوالی داری؟ ما همین‌جا هستیم."}
                            </div>
                        )}

                        <button
                            className={`widget-preview-launcher ${
                                state === "open" ? "open" : ""
                            }`}
                            type="button"
                            aria-label={
                                state === "open"
                                    ? "بستن پیش‌نمایش"
                                    : "بازکردن پیش‌نمایش"
                            }
                            onClick={() =>
                                onStateChange(
                                    state === "open" ? "closed" : "open",
                                )
                            }
                        >
                            {state === "open" ? <CloseIcon /> : <ChatIcon />}
                        </button>
                    </div>
                </div>
            </div>

            <div className="widget-preview-footnote">
                <span
                    className={`widget-preview-ai-dot mode-${aiMode}`}
                    aria-hidden="true"
                />
                حالت AI: <strong>{AI_MODE_LABELS[aiMode]}</strong>
            </div>
        </aside>
    );
}

function PreviewBrand({
                          logoUrl,
                          title,
                      }: {
    logoUrl: string;
    title: string;
}) {
    const [imageFailed, setImageFailed] = useState(false);

    useEffect(() => {
        setImageFailed(false);
    }, [logoUrl]);

    const showImage = Boolean(logoUrl.trim()) && !imageFailed;

    return (
        <div className="widget-preview-brand">
            <div className="widget-preview-avatar">
                {showImage ? (
                    <img
                        src={logoUrl}
                        alt=""
                        onError={() => setImageFailed(true)}
                    />
                ) : (
                    getInitial(title)
                )}
            </div>
            <div>
                <strong>{title || "پشتیبانی آنلاین"}</strong>
                <span>
                    <i /> پشتیبانی آنلاین است
                </span>
            </div>
        </div>
    );
}

function SegmentedControl({
                              label,
                              options,
                              value,
                              onChange,
                          }: {
    label: string;
    options: Array<{ value: string; label: string; icon?: ReactNode }>;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <div className="widget-segmented" aria-label={label}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    className={value === option.value ? "active" : ""}
                    aria-pressed={value === option.value}
                    onClick={() => onChange(option.value)}
                >
                    {option.icon}
                    {option.label}
                </button>
            ))}
        </div>
    );
}

function WidgetSettingsSkeleton() {
    return (
        <div className="widget-settings-skeleton" aria-label="در حال بارگذاری">
            <div className="skeleton-summary" />
            <div className="skeleton-grid">
                <div />
                <div />
                <div />
            </div>
        </div>
    );
}

function EmptySitesState() {
    return (
        <section className="widget-panel widget-empty-state">
            <div className="widget-empty-icon">
                <GlobeIcon />
            </div>
            <h2>هنوز سایتی برای این حساب ثبت نشده است</h2>
            <p>
                پس از ثبت سایت، تنظیمات برند، پیام خوش‌آمدگویی و کد نصب ویجت در
                همین صفحه نمایش داده می‌شود.
            </p>
        </section>
    );
}

function formFromSite(site: Site): WidgetForm {
    return {
        brand_name: site.brand_name || site.name || "",
        brand_color: normalizeColor(site.brand_color || DEFAULT_COLOR),
        logo_url: site.logo_url || "",
        welcome_message:
            site.welcome_message || DEFAULT_WELCOME_MESSAGE,
        ai_mode: normalizeAiMode(site.ai_mode),
    };
}

function normalizeForm(form: WidgetForm): WidgetForm {
    return {
        brand_name: form.brand_name.trim(),
        brand_color: normalizeColor(form.brand_color),
        logo_url: form.logo_url.trim(),
        welcome_message: form.welcome_message.trim(),
        ai_mode: normalizeAiMode(form.ai_mode),
    };
}

function validateForm(form: WidgetForm): FormErrors {
    const errors: FormErrors = {};

    if (form.brand_name.trim().length > MAX_BRAND_NAME_LENGTH) {
        errors.brand_name = `نام برند نباید بیشتر از ${MAX_BRAND_NAME_LENGTH} کاراکتر باشد.`;
    }

    if (!isValidHexColor(form.brand_color.trim())) {
        errors.brand_color = "رنگ باید با فرمت شش‌رقمی مانند #2563eb وارد شود.";
    }

    if (form.logo_url.trim() && !isValidHttpUrl(form.logo_url.trim())) {
        errors.logo_url = "آدرس لوگو باید یک لینک معتبر http یا https باشد.";
    }

    if (!form.welcome_message.trim()) {
        errors.welcome_message = "پیام خوش‌آمدگویی نمی‌تواند خالی باشد.";
    } else if (
        form.welcome_message.trim().length > MAX_WELCOME_MESSAGE_LENGTH
    ) {
        errors.welcome_message = `پیام خوش‌آمدگویی نباید بیشتر از ${MAX_WELCOME_MESSAGE_LENGTH} کاراکتر باشد.`;
    }

    return errors;
}

function areFormsEqual(first: WidgetForm, second: WidgetForm) {
    return JSON.stringify(normalizeForm(first)) === JSON.stringify(normalizeForm(second));
}

function normalizeAiMode(value: string): AiMode {
    if (value === "off" || value === "semi_auto") {
        return value;
    }

    return "assistant";
}

function getAiModeLabel(value: string) {
    return AI_MODE_LABELS[normalizeAiMode(value)];
}

function normalizeColor(color: string) {
    const trimmed = color.trim();
    return isValidHexColor(trimmed) ? trimmed : DEFAULT_COLOR;
}

function isValidHexColor(color: string) {
    return /^#[0-9a-fA-F]{6}$/.test(color);
}

function isValidHttpUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function normalizeDomainHref(domain: string) {
    const trimmed = domain.trim();

    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }

    return `https://${trimmed}`;
}

function maskSiteKey(siteKey: string) {
    if (siteKey.length <= 12) {
        return siteKey;
    }

    return `${siteKey.slice(0, 6)}••••••${siteKey.slice(-6)}`;
}

function getInitial(text: string) {
    const clean = text.trim();

    if (!clean) {
        return "پ";
    }

    if (/^[A-Za-z]/.test(clean)) {
        return clean.slice(0, 1).toUpperCase();
    }

    return clean.slice(0, 1);
}

function darkenColor(hex: string, amount: number) {
    const safeHex = normalizeColor(hex).replace("#", "");
    const numeric = Number.parseInt(safeHex, 16);
    const red = Math.max(0, (numeric >> 16) - amount);
    const green = Math.max(0, ((numeric >> 8) & 0x00ff) - amount);
    const blue = Math.max(0, (numeric & 0x0000ff) - amount);

    return `#${[red, green, blue]
        .map((channel) => channel.toString(16).padStart(2, "0"))
        .join("")}`;
}

function hexToRgba(hex: string, alpha: number) {
    const safeHex = normalizeColor(hex).replace("#", "");
    const numeric = Number.parseInt(safeHex, 16);
    const red = numeric >> 16;
    const green = (numeric >> 8) & 0x00ff;
    const blue = numeric & 0x0000ff;

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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

function IconBase({ children }: { children: ReactNode }) {
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
            {children}
        </svg>
    );
}

function RefreshIcon() {
    return (
        <IconBase>
            <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5" />
            <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5" />
        </IconBase>
    );
}

function LinkIcon() {
    return (
        <IconBase>
            <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
            <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
        </IconBase>
    );
}

function InfoIcon() {
    return (
        <IconBase>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" />
            <path d="M12 8h.01" />
        </IconBase>
    );
}

function UndoIcon() {
    return (
        <IconBase>
            <path d="M9 7 4 12l5 5" />
            <path d="M20 17a8 8 0 0 0-8-8H4" />
        </IconBase>
    );
}

function SaveIcon() {
    return (
        <IconBase>
            <path d="M5 4h12l2 2v14H5z" />
            <path d="M8 4v6h8V4" />
            <path d="M8 20v-6h8v6" />
        </IconBase>
    );
}

function CopyIcon() {
    return (
        <IconBase>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
        </IconBase>
    );
}

function CheckIcon() {
    return (
        <IconBase>
            <path d="m5 12 4 4L19 6" />
        </IconBase>
    );
}

function WarningIcon() {
    return (
        <IconBase>
            <path d="M10.3 4.4 2.8 17.5A1.8 1.8 0 0 0 4.4 20h15.2a1.8 1.8 0 0 0 1.6-2.5L13.7 4.4a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4" />
            <path d="M12 16h.01" />
        </IconBase>
    );
}

function DesktopIcon() {
    return (
        <IconBase>
            <rect x="3" y="4" width="18" height="13" rx="2" />
            <path d="M8 21h8M12 17v4" />
        </IconBase>
    );
}

function MobileIcon() {
    return (
        <IconBase>
            <rect x="7" y="2" width="10" height="20" rx="2" />
            <path d="M11 18h2" />
        </IconBase>
    );
}

function CloseIcon() {
    return (
        <IconBase>
            <path d="m7 7 10 10M17 7 7 17" />
        </IconBase>
    );
}

function ChatIcon() {
    return (
        <IconBase>
            <path d="M21 12a8 8 0 0 1-8 8 8.8 8.8 0 0 1-3.8-.9L3 21l1.9-5.3A8 8 0 1 1 21 12Z" />
            <path d="M8 11h8M8 14h5" />
        </IconBase>
    );
}

function GlobeIcon() {
    return (
        <IconBase>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
        </IconBase>
    );
}

function ChevronLeftIcon() {
    return (
        <IconBase>
            <path d="m14 7-5 5 5 5" />
        </IconBase>
    );
}
