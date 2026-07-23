"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type SiteSummary = {
    id: number;
    name: string;
    domain: string;
    brand_name?: string | null;
    brand_color?: string | null;
    is_active: boolean;
    hosted_page?: {
        public_slug: string;
        public_url: string;
        is_active: boolean;
    } | null;
};

type BusinessHour = {
    day_of_week: number;
    day_label: string;
    is_open: boolean;
    open_time: string | null;
    close_time: string | null;
};

type ExceptionRow = {
    id?: number;
    exception_date: string;
    title: string | null;
    is_closed: boolean;
    open_time: string | null;
    close_time: string | null;
};

type SelectedSettings = {
    site: {
        id: number;
        name: string;
        domain: string;
        brand_name?: string | null;
        brand_color?: string | null;
        logo_url?: string | null;
        welcome_message?: string | null;
        is_active: boolean;
    };
    page: null | {
        id: number;
        public_slug: string;
        public_url: string;
        page_title: string;
        page_subtitle?: string | null;
        page_description?: string | null;
        primary_color: string;
        contact_phone?: string | null;
        whatsapp_phone?: string | null;
        timezone: string;
        require_name: boolean;
        require_phone: boolean;
        show_business_hours: boolean;
        show_faq: boolean;
        is_active: boolean;
    };
    business_hours: BusinessHour[];
    offline: {
        offline_behavior: "accept_messages" | "ai_only" | "closed";
        offline_message?: string | null;
        ai_after_hours_enabled: boolean;
        show_next_opening: boolean;
    };
    exceptions: ExceptionRow[];
    status: {
        support_online: boolean;
        is_within_business_hours: boolean;
        agent_online: boolean;
        status_text: string;
        next_opening?: { human_text?: string } | null;
    };
};

type FormState = {
    public_slug: string;
    page_title: string;
    page_subtitle: string;
    page_description: string;
    primary_color: string;
    contact_phone: string;
    whatsapp_phone: string;
    timezone: string;
    require_name: boolean;
    require_phone: boolean;
    show_business_hours: boolean;
    show_faq: boolean;
    is_active: boolean;
    offline_behavior: "accept_messages" | "ai_only" | "closed";
    offline_message: string;
    ai_after_hours_enabled: boolean;
    show_next_opening: boolean;
};

const emptyForm: FormState = {
    public_slug: "",
    page_title: "",
    page_subtitle: "پشتیبانی و ارتباط مستقیم",
    page_description: "برای دریافت راهنمایی، پیگیری یا مشاوره، گفتگو را آغاز کنید.",
    primary_color: "#0f766e",
    contact_phone: "",
    whatsapp_phone: "",
    timezone: "Asia/Tehran",
    require_name: true,
    require_phone: true,
    show_business_hours: true,
    show_faq: true,
    is_active: true,
    offline_behavior: "accept_messages",
    offline_message: "در حال حاضر خارج از ساعت پاسخ‌گویی هستیم. پیام شما ثبت می‌شود و در اولین فرصت پاسخ می‌دهیم.",
    ai_after_hours_enabled: true,
    show_next_opening: true,
};

export default function HostedSupportSettingsPage() {
    const router = useRouter();
    const [sites, setSites] = useState<SiteSummary[]>([]);
    const [selectedSiteId, setSelectedSiteId] = useState(0);
    const [selected, setSelected] = useState<SelectedSettings | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [hours, setHours] = useState<BusinessHour[]>([]);
    const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [copied, setCopied] = useState(false);

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
        void loadSettings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    const selectedSite = useMemo(
        () => sites.find((site) => site.id === selectedSiteId) || null,
        [sites, selectedSiteId],
    );

    async function loadSettings(siteId?: number, silent = false) {
        try {
            if (!silent) setLoading(true);
            setError("");
            const query = siteId ? `?site_id=${siteId}` : "";
            const data = await apiRequest(`/customer/hosted-support-settings.php${query}`);
            const loadedSites = Array.isArray(data.sites) ? data.sites : [];
            setSites(loadedSites);
            const loadedSelected = data.selected as SelectedSettings | null;
            setSelected(loadedSelected);

            if (loadedSelected) {
                setSelectedSiteId(loadedSelected.site.id);
                applySelected(loadedSelected);
            } else if (loadedSites.length > 0) {
                setSelectedSiteId(Number(loadedSites[0].id));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "دریافت تنظیمات ناموفق بود.");
        } finally {
            setLoading(false);
        }
    }

    function applySelected(value: SelectedSettings) {
        const page = value.page;
        setForm({
            public_slug: page?.public_slug || "",
            page_title: page?.page_title || `${value.site.brand_name || value.site.name} | پشتیبانی آنلاین`,
            page_subtitle: page?.page_subtitle || "پشتیبانی و ارتباط مستقیم",
            page_description: page?.page_description || emptyForm.page_description,
            primary_color: page?.primary_color || value.site.brand_color || "#0f766e",
            contact_phone: page?.contact_phone || "",
            whatsapp_phone: page?.whatsapp_phone || "",
            timezone: page?.timezone || "Asia/Tehran",
            require_name: page?.require_name ?? true,
            require_phone: page?.require_phone ?? true,
            show_business_hours: page?.show_business_hours ?? true,
            show_faq: page?.show_faq ?? true,
            is_active: page?.is_active ?? true,
            offline_behavior: value.offline.offline_behavior || "accept_messages",
            offline_message: value.offline.offline_message || emptyForm.offline_message,
            ai_after_hours_enabled: value.offline.ai_after_hours_enabled,
            show_next_opening: value.offline.show_next_opening,
        });
        setHours(value.business_hours || []);
        setExceptions(value.exceptions || []);
    }

    async function selectSite(id: number) {
        if (saving || id === selectedSiteId) return;
        setSelectedSiteId(id);
        setSuccess("");
        await loadSettings(id, true);
    }

    function updateForm<K extends keyof FormState>(field: K, value: FormState[K]) {
        setForm((current) => ({ ...current, [field]: value }));
        setSuccess("");
    }

    function updateHour(index: number, patch: Partial<BusinessHour>) {
        setHours((current) => current.map((row, rowIndex) => (
            rowIndex === index ? { ...row, ...patch } : row
        )));
    }

    function addException() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setExceptions((current) => [
            ...current,
            {
                exception_date: tomorrow.toISOString().slice(0, 10),
                title: "تعطیلی ویژه",
                is_closed: true,
                open_time: "09:00",
                close_time: "14:00",
            },
        ]);
    }

    function updateException(index: number, patch: Partial<ExceptionRow>) {
        setExceptions((current) => current.map((row, rowIndex) => (
            rowIndex === index ? { ...row, ...patch } : row
        )));
    }

    function removeException(index: number) {
        setExceptions((current) => current.filter((_, rowIndex) => rowIndex !== index));
    }

    async function saveSettings(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedSiteId || saving) return;

        if (!form.page_title.trim()) {
            setError("عنوان صفحه را وارد کنید.");
            return;
        }

        try {
            setSaving(true);
            setError("");
            setSuccess("");
            const data = await apiRequest("/customer/hosted-support-settings.php", {
                method: "POST",
                body: JSON.stringify({
                    site_id: selectedSiteId,
                    page: {
                        public_slug: form.public_slug.trim(),
                        page_title: form.page_title.trim(),
                        page_subtitle: form.page_subtitle.trim(),
                        page_description: form.page_description.trim(),
                        primary_color: form.primary_color,
                        contact_phone: form.contact_phone.trim(),
                        whatsapp_phone: form.whatsapp_phone.trim(),
                        timezone: form.timezone,
                        require_name: form.require_name,
                        require_phone: form.require_phone,
                        show_business_hours: form.show_business_hours,
                        show_faq: form.show_faq,
                        is_active: form.is_active,
                    },
                    business_hours: hours,
                    offline: {
                        offline_behavior: form.offline_behavior,
                        offline_message: form.offline_message.trim(),
                        ai_after_hours_enabled: form.ai_after_hours_enabled,
                        show_next_opening: form.show_next_opening,
                    },
                    exceptions,
                }),
            });

            const fresh = data.selected as SelectedSettings;
            setSelected(fresh);
            applySelected(fresh);
            setSuccess("تنظیمات صفحه پشتیبانی با موفقیت ذخیره شد.");
            await loadSettings(selectedSiteId, true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ذخیره تنظیمات ناموفق بود.");
        } finally {
            setSaving(false);
        }
    }

    async function copyPublicUrl() {
        if (!selected?.page?.public_url) return;
        await navigator.clipboard.writeText(selected.page.public_url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    }

    return (
        <AppShell
            title="صفحه پشتیبانی اختصاصی"
            kicker="Hosted Support"
            description="راه‌اندازی مرکز پشتیبانی با لینک مستقل، ساعت کاری و رفتار آفلاین"
            actions={selected?.page?.public_url ? (
                <div className="hosted-settings-actions">
                    <button className="btn secondary" type="button" onClick={copyPublicUrl}>
                        {copied ? "کپی شد" : "کپی لینک"}
                    </button>
                    <Link className="btn" href={selected.page.public_url} target="_blank">
                        مشاهده صفحه
                    </Link>
                </div>
            ) : null}
        >
            <div className="hosted-settings-page">
                {error && <div className="error">{error}</div>}
                {success && <div className="hosted-settings-success">{success}</div>}

                {loading ? (
                    <div className="hosted-settings-loading">در حال دریافت تنظیمات...</div>
                ) : sites.length === 0 ? (
                    <div className="hosted-settings-empty">
                        <h2>هنوز سایتی برای این مشتری ساخته نشده است</h2>
                        <p>ابتدا یک سایت منطقی بسازید؛ حتی برای استفاده بدون وب‌سایت، هر صفحه پشتیبانی به یک فضای سایت متصل می‌شود.</p>
                        <Link className="btn" href="/sites">مدیریت سایت‌ها</Link>
                    </div>
                ) : (
                    <>
                        <section className="hosted-site-switcher">
                            <div>
                                <span>فضای موردنظر</span>
                                <strong>صفحه پشتیبانی برای کدام سایت مدیریت شود؟</strong>
                            </div>
                            <div className="hosted-site-tabs">
                                {sites.map((site) => (
                                    <button
                                        type="button"
                                        key={site.id}
                                        className={site.id === selectedSiteId ? "active" : ""}
                                        onClick={() => void selectSite(site.id)}
                                    >
                                        <span>{site.name}</span>
                                        <small>{site.hosted_page ? "صفحه فعال" : "بدون صفحه"}</small>
                                    </button>
                                ))}
                            </div>
                        </section>

                        {selected && (
                            <form className="hosted-settings-form" onSubmit={saveSettings}>
                                <section className="hosted-settings-hero-card">
                                    <div>
                                        <span>Public Support Page</span>
                                        <h2>{selectedSite?.name || selected.site.name}</h2>
                                        <p>
                                            این لینک را می‌توان در اینستاگرام، واتساپ، پیامک یا QR Code در اختیار مشتریان قرار داد؛ نصب روی سایت ضروری نیست.
                                        </p>
                                    </div>
                                    <div className={`hosted-settings-live ${selected.status.support_online ? "online" : "offline"}`}>
                                        <i />
                                        <strong>{selected.status.status_text}</strong>
                                        {selected.status.next_opening?.human_text && (
                                            <span>شروع بعدی: {selected.status.next_opening.human_text}</span>
                                        )}
                                    </div>
                                </section>

                                <section className="hosted-settings-card">
                                    <div className="hosted-settings-card-head">
                                        <div>
                                            <span>01</span>
                                            <h2>هویت و لینک صفحه</h2>
                                            <p>عنوان، رنگ، راه‌های تماس و شناسه لینک عمومی را تنظیم کنید.</p>
                                        </div>
                                        <label className="hosted-toggle-row compact">
                                            <input
                                                type="checkbox"
                                                checked={form.is_active}
                                                onChange={(event) => updateForm("is_active", event.target.checked)}
                                            />
                                            <span>صفحه فعال باشد</span>
                                        </label>
                                    </div>

                                    <div className="hosted-form-grid two">
                                        <label>
                                            <span>شناسه لینک اختصاصی</span>
                                            <div className="hosted-slug-input">
                                                <b>/support/</b>
                                                <input
                                                    value={form.public_slug}
                                                    onChange={(event) => updateForm("public_slug", normalizeSlug(event.target.value))}
                                                    placeholder="brand-name"
                                                    dir="ltr"
                                                />
                                            </div>
                                            <small>فقط حروف انگلیسی، عدد و خط تیره؛ خالی بماند به‌صورت خودکار ساخته می‌شود.</small>
                                        </label>

                                        <label>
                                            <span>رنگ اصلی صفحه</span>
                                            <div className="hosted-color-input">
                                                <input
                                                    type="color"
                                                    value={form.primary_color}
                                                    onChange={(event) => updateForm("primary_color", event.target.value)}
                                                />
                                                <input
                                                    value={form.primary_color}
                                                    onChange={(event) => updateForm("primary_color", event.target.value)}
                                                    dir="ltr"
                                                />
                                            </div>
                                        </label>

                                        <label>
                                            <span>عنوان اصلی</span>
                                            <input
                                                value={form.page_title}
                                                onChange={(event) => updateForm("page_title", event.target.value)}
                                                maxLength={255}
                                            />
                                        </label>

                                        <label>
                                            <span>زیرعنوان</span>
                                            <input
                                                value={form.page_subtitle}
                                                onChange={(event) => updateForm("page_subtitle", event.target.value)}
                                                maxLength={255}
                                            />
                                        </label>

                                        <label className="full">
                                            <span>توضیح صفحه</span>
                                            <textarea
                                                value={form.page_description}
                                                onChange={(event) => updateForm("page_description", event.target.value)}
                                                rows={3}
                                                maxLength={2000}
                                            />
                                        </label>

                                        <label>
                                            <span>شماره تماس</span>
                                            <input
                                                value={form.contact_phone}
                                                onChange={(event) => updateForm("contact_phone", event.target.value)}
                                                inputMode="tel"
                                                placeholder="09120000000"
                                            />
                                        </label>

                                        <label>
                                            <span>شماره واتساپ</span>
                                            <input
                                                value={form.whatsapp_phone}
                                                onChange={(event) => updateForm("whatsapp_phone", event.target.value)}
                                                inputMode="tel"
                                                placeholder="09120000000"
                                            />
                                        </label>
                                    </div>

                                    <div className="hosted-toggle-grid">
                                        <Toggle label="دریافت نام اجباری باشد" checked={form.require_name} onChange={(value) => updateForm("require_name", value)} />
                                        <Toggle label="دریافت شماره تماس اجباری باشد" checked={form.require_phone} onChange={(value) => updateForm("require_phone", value)} />
                                        <Toggle label="ساعات کاری نمایش داده شود" checked={form.show_business_hours} onChange={(value) => updateForm("show_business_hours", value)} />
                                        <Toggle label="سؤالات متداول نمایش داده شود" checked={form.show_faq} onChange={(value) => updateForm("show_faq", value)} />
                                    </div>
                                </section>

                                <section className="hosted-settings-card">
                                    <div className="hosted-settings-card-head">
                                        <div>
                                            <span>02</span>
                                            <h2>ساعات پاسخ‌گویی هفتگی</h2>
                                            <p>وضعیت آنلاین صفحه از ترکیب این برنامه و حضور واقعی پشتیبان‌ها محاسبه می‌شود.</p>
                                        </div>
                                        <label className="hosted-timezone">
                                            <span>منطقه زمانی</span>
                                            <select value={form.timezone} onChange={(event) => updateForm("timezone", event.target.value)}>
                                                <option value="Asia/Tehran">Asia/Tehran</option>
                                                <option value="Asia/Dubai">Asia/Dubai</option>
                                                <option value="Europe/Istanbul">Europe/Istanbul</option>
                                                <option value="UTC">UTC</option>
                                            </select>
                                        </label>
                                    </div>

                                    <div className="hosted-hours-editor">
                                        {hours.map((row, index) => (
                                            <div className={row.is_open ? "open" : "closed"} key={row.day_of_week}>
                                                <label className="hosted-day-toggle">
                                                    <input
                                                        type="checkbox"
                                                        checked={row.is_open}
                                                        onChange={(event) => updateHour(index, { is_open: event.target.checked })}
                                                    />
                                                    <strong>{row.day_label}</strong>
                                                </label>
                                                {row.is_open ? (
                                                    <div className="hosted-hour-range">
                                                        <input
                                                            type="time"
                                                            value={row.open_time || "09:00"}
                                                            onChange={(event) => updateHour(index, { open_time: event.target.value })}
                                                        />
                                                        <span>تا</span>
                                                        <input
                                                            type="time"
                                                            value={row.close_time || "18:00"}
                                                            onChange={(event) => updateHour(index, { close_time: event.target.value })}
                                                        />
                                                    </div>
                                                ) : (
                                                    <span className="hosted-day-closed">تعطیل</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                <section className="hosted-settings-card">
                                    <div className="hosted-settings-card-head">
                                        <div>
                                            <span>03</span>
                                            <h2>رفتار خارج از ساعت کاری</h2>
                                            <p>مشخص کنید وقتی تیم حضور ندارد، مخاطب چه تجربه‌ای داشته باشد.</p>
                                        </div>
                                    </div>

                                    <div className="hosted-offline-options">
                                        <OfflineOption
                                            value="accept_messages"
                                            current={form.offline_behavior}
                                            title="دریافت پیام"
                                            text="مخاطب پیام می‌گذارد و تیم در اولین فرصت پاسخ می‌دهد."
                                            onSelect={() => updateForm("offline_behavior", "accept_messages")}
                                        />
                                        <OfflineOption
                                            value="ai_only"
                                            current={form.offline_behavior}
                                            title="پاسخ هوشمند"
                                            text="گفتگو باز می‌ماند و موتور AI پاسخ اولیه ارائه می‌کند."
                                            onSelect={() => updateForm("offline_behavior", "ai_only")}
                                        />
                                        <OfflineOption
                                            value="closed"
                                            current={form.offline_behavior}
                                            title="بسته"
                                            text="شروع گفتگوی جدید تا بازشدن ساعت کاری غیرفعال می‌شود."
                                            onSelect={() => updateForm("offline_behavior", "closed")}
                                        />
                                    </div>

                                    <label className="hosted-offline-message">
                                        <span>پیام آفلاین</span>
                                        <textarea
                                            value={form.offline_message}
                                            onChange={(event) => updateForm("offline_message", event.target.value)}
                                            rows={3}
                                            maxLength={1000}
                                        />
                                    </label>

                                    <div className="hosted-toggle-grid">
                                        <Toggle label="AI خارج از ساعت کاری فعال بماند" checked={form.ai_after_hours_enabled} onChange={(value) => updateForm("ai_after_hours_enabled", value)} />
                                        <Toggle label="زمان شروع بعدی نمایش داده شود" checked={form.show_next_opening} onChange={(value) => updateForm("show_next_opening", value)} />
                                    </div>
                                </section>

                                <section className="hosted-settings-card">
                                    <div className="hosted-settings-card-head">
                                        <div>
                                            <span>04</span>
                                            <h2>تعطیلی‌ها و برنامه‌های استثنایی</h2>
                                            <p>برای تعطیلات یا ساعت کاری متفاوت، تاریخ اختصاصی تعریف کنید.</p>
                                        </div>
                                        <button className="btn secondary" type="button" onClick={addException}>
                                            افزودن تاریخ
                                        </button>
                                    </div>

                                    {exceptions.length === 0 ? (
                                        <div className="hosted-exceptions-empty">برنامه استثنایی ثبت نشده است.</div>
                                    ) : (
                                        <div className="hosted-exceptions-list">
                                            {exceptions.map((row, index) => (
                                                <div key={`${row.exception_date}-${index}`}>
                                                    <input
                                                        type="date"
                                                        value={row.exception_date}
                                                        onChange={(event) => updateException(index, { exception_date: event.target.value })}
                                                    />
                                                    <input
                                                        value={row.title || ""}
                                                        onChange={(event) => updateException(index, { title: event.target.value })}
                                                        placeholder="عنوان؛ مثلاً تعطیلات رسمی"
                                                    />
                                                    <label>
                                                        <input
                                                            type="checkbox"
                                                            checked={row.is_closed}
                                                            onChange={(event) => updateException(index, { is_closed: event.target.checked })}
                                                        />
                                                        تعطیل
                                                    </label>
                                                    {!row.is_closed && (
                                                        <div className="hosted-exception-hours">
                                                            <input type="time" value={row.open_time || "09:00"} onChange={(event) => updateException(index, { open_time: event.target.value })} />
                                                            <span>تا</span>
                                                            <input type="time" value={row.close_time || "14:00"} onChange={(event) => updateException(index, { close_time: event.target.value })} />
                                                        </div>
                                                    )}
                                                    <button type="button" onClick={() => removeException(index)}>حذف</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>

                                <div className="hosted-settings-savebar">
                                    <div>
                                        <strong>آماده انتشار</strong>
                                        <span>بعد از ذخیره، تغییرات بلافاصله روی لینک عمومی اعمال می‌شوند.</span>
                                    </div>
                                    <button className="btn" type="submit" disabled={saving}>
                                        {saving ? "در حال ذخیره..." : "ذخیره و انتشار"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </>
                )}
            </div>
        </AppShell>
    );
}

function Toggle({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <label className="hosted-toggle-row">
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
            <span>{label}</span>
        </label>
    );
}

function OfflineOption({
    value,
    current,
    title,
    text,
    onSelect,
}: {
    value: string;
    current: string;
    title: string;
    text: string;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            className={current === value ? "active" : ""}
            onClick={onSelect}
        >
            <i>{current === value ? "✓" : ""}</i>
            <strong>{title}</strong>
            <span>{text}</span>
        </button>
    );
}

function normalizeSlug(value: string) {
    return value
        .toLowerCase()
        .replace(/[_\s]+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}
