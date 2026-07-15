"use client";

// مسیر فایل: ai-chat-saas/frontend/app/super-admin/announcements/page.tsx
// هدف: مدیریت اعلان‌ها توسط Super Admin همراه با آپلود تصویر اعلان

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, getAuthUser } from "@/lib/api";

type Tenant = {
    id: number;
    name: string;
    email?: string | null;
    status?: string | null;
    plan_name?: string | null;
};

type Announcement = {
    id: number;
    title: string;
    body: string;
    image_url: string | null;
    type: "info" | "warning" | "discount" | "update" | "danger";
    priority: "low" | "medium" | "high" | "critical";
    target_type: "all" | "selected";
    target_tenants: Tenant[];
    cta_label: string | null;
    cta_url: string | null;
    starts_at: string | null;
    ends_at: string | null;
    is_active: boolean;
    is_dismissible: boolean;
    target_count: number;
    read_count: number;
    dismissed_count: number;
    created_at: string;
};

type FormState = {
    id: number | null;
    title: string;
    body: string;
    image_url: string;
    type: Announcement["type"];
    priority: Announcement["priority"];
    target_type: Announcement["target_type"];
    tenant_ids: number[];
    cta_label: string;
    cta_url: string;
    starts_at: string;
    ends_at: string;
    is_active: boolean;
    is_dismissible: boolean;
};

const emptyForm: FormState = {
    id: null,
    title: "",
    body: "",
    image_url: "",
    type: "info",
    priority: "medium",
    target_type: "all",
    tenant_ids: [],
    cta_label: "",
    cta_url: "",
    starts_at: "",
    ends_at: "",
    is_active: true,
    is_dismissible: true,
};

const typeLabels: Record<string, string> = {
    info: "اطلاع‌رسانی",
    warning: "هشدار",
    discount: "تخفیف",
    update: "بروزرسانی",
    danger: "مهم",
};

const priorityLabels: Record<string, string> = {
    low: "کم",
    medium: "متوسط",
    high: "زیاد",
    critical: "خیلی مهم",
};

function toApiDateTime(value: string) {
    if (!value) {
        return "";
    }

    return value.replace("T", " ") + (value.length === 16 ? ":00" : "");
}

function fromApiDateTime(value: string | null) {
    if (!value) {
        return "";
    }

    return value.slice(0, 16).replace(" ", "T");
}

export default function SuperAdminAnnouncementsPage() {
    const [user, setUser] = useState<any>(null);
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");

    const filteredAnnouncements = useMemo(() => {
        return announcements.filter((item) => {
            if (filter === "active") return item.is_active;
            if (filter === "inactive") return !item.is_active;
            return true;
        });
    }, [announcements, filter]);

    useEffect(() => {
        const authUser = getAuthUser();

        if (!authUser) {
            window.location.href = "/login";
            return;
        }

        if (authUser.role !== "super_admin") {
            window.location.href = "/dashboard";
            return;
        }

        setUser(authUser);
        loadData();
    }, []);

    async function loadData() {
        try {
            setLoading(true);
            setMessage("");

            const [announcementsData, tenantsData] = await Promise.all([
                apiRequest("/super-admin/announcements-list.php"),
                apiRequest("/super-admin/tenants-options.php"),
            ]);

            setAnnouncements(announcementsData.announcements || []);
            setTenants(tenantsData.tenants || []);
        } catch (error: any) {
            setMessage(error.message || "خطا در دریافت اطلاعات");
        } finally {
            setLoading(false);
        }
    }

    function toggleTenant(tenantId: number) {
        setForm((current) => {
            const exists = current.tenant_ids.includes(tenantId);

            return {
                ...current,
                tenant_ids: exists
                    ? current.tenant_ids.filter((id) => id !== tenantId)
                    : [...current.tenant_ids, tenantId],
            };
        });
    }

    function editAnnouncement(item: Announcement) {
        setForm({
            id: item.id,
            title: item.title,
            body: item.body,
            image_url: item.image_url || "",
            type: item.type,
            priority: item.priority,
            target_type: item.target_type,
            tenant_ids: item.target_tenants?.map((tenant) => tenant.id) || [],
            cta_label: item.cta_label || "",
            cta_url: item.cta_url || "",
            starts_at: fromApiDateTime(item.starts_at),
            ends_at: fromApiDateTime(item.ends_at),
            is_active: item.is_active,
            is_dismissible: item.is_dismissible,
        });

        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function uploadAnnouncementImage(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        const formData = new FormData();
        formData.append("image", file);

        try {
            setSaving(true);
            setMessage("");

            const data = await apiRequest("/super-admin/announcement-image-upload.php", {
                method: "POST",
                body: formData,
            });

            setForm((current) => ({
                ...current,
                image_url: data.image_url,
            }));

            setMessage("تصویر اعلان با موفقیت آپلود شد.");
        } catch (error: any) {
            setMessage(error.message || "خطا در آپلود تصویر اعلان");
        } finally {
            setSaving(false);
            event.target.value = "";
        }
    }

    async function submitForm(event: FormEvent) {
        event.preventDefault();

        if (!form.title.trim() || !form.body.trim()) {
            setMessage("عنوان و متن اعلان الزامی است.");
            return;
        }

        if (form.target_type === "selected" && form.tenant_ids.length === 0) {
            setMessage("برای اعلان خصوصی حداقل یک مشتری انتخاب کن.");
            return;
        }

        try {
            setSaving(true);
            setMessage("");

            const payload = {
                id: form.id,
                title: form.title.trim(),
                body: form.body.trim(),
                image_url: form.image_url,
                type: form.type,
                priority: form.priority,
                target_type: form.target_type,
                tenant_ids: form.target_type === "selected" ? form.tenant_ids : [],
                cta_label: form.cta_label.trim(),
                cta_url: form.cta_url.trim(),
                starts_at: toApiDateTime(form.starts_at),
                ends_at: toApiDateTime(form.ends_at),
                is_active: form.is_active,
                is_dismissible: form.is_dismissible,
            };

            await apiRequest(
                form.id
                    ? "/super-admin/announcement-update.php"
                    : "/super-admin/announcement-create.php",
                {
                    method: "POST",
                    body: JSON.stringify(payload),
                }
            );

            setForm(emptyForm);
            setMessage(form.id ? "اعلان با موفقیت ویرایش شد." : "اعلان با موفقیت ساخته شد.");
            await loadData();
        } catch (error: any) {
            setMessage(error.message || "خطا در ذخیره اعلان");
        } finally {
            setSaving(false);
        }
    }

    async function disableAnnouncement(id: number) {
        if (!confirm("این اعلان غیرفعال شود؟")) {
            return;
        }

        try {
            await apiRequest("/super-admin/announcement-delete.php", {
                method: "POST",
                body: JSON.stringify({ id }),
            });

            setMessage("اعلان غیرفعال شد.");
            await loadData();
        } catch (error: any) {
            setMessage(error.message || "خطا در غیرفعال‌سازی اعلان");
        }
    }

    if (!user) {
        return null;
    }

    return (
        <main className="ann-admin-page">
            <header className="ann-admin-hero">
                <div>
                    <span className="ann-eyebrow">Super Admin</span>
                    <h1>مرکز مدیریت اعلان‌ها</h1>
                    <p>
                        برای همه مشتری‌ها یا مشتری‌های انتخاب‌شده اعلان، هشدار، تخفیف و خبرهای
                        مهم ارسال کن.
                    </p>
                </div>

                <Link href="/super-admin/dashboard" className="ann-back-link">
                    بازگشت به داشبورد
                </Link>
            </header>

            {message && <div className="ann-message">{message}</div>}

            <section className="ann-admin-grid">
                <form className="ann-form-card" onSubmit={submitForm}>
                    <div className="ann-card-head">
                        <div>
                            <span className="ann-eyebrow">Announcement</span>
                            <h2>{form.id ? "ویرایش اعلان" : "ساخت اعلان جدید"}</h2>
                        </div>

                        {form.id && (
                            <button
                                type="button"
                                className="ann-mini-btn"
                                onClick={() => setForm(emptyForm)}
                            >
                                لغو ویرایش
                            </button>
                        )}
                    </div>

                    <label>
                        عنوان اعلان
                        <input
                            value={form.title}
                            onChange={(event) =>
                                setForm({ ...form, title: event.target.value })
                            }
                            placeholder="مثلاً بروزرسانی جدید پنل"
                        />
                    </label>

                    <label>
                        متن اعلان
                        <textarea
                            value={form.body}
                            onChange={(event) =>
                                setForm({ ...form, body: event.target.value })
                            }
                            placeholder="متن کامل اعلان را بنویس..."
                            rows={6}
                        />
                    </label>

                    <label>
                        تصویر اعلان اختیاری
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            onChange={uploadAnnouncementImage}
                        />
                    </label>

                    {form.image_url && (
                        <div className="ann-image-preview-box">
                            <img src={form.image_url} alt="تصویر اعلان" />
                            <div>
                                <strong>تصویر اعلان آپلود شده است</strong>
                                <button
                                    type="button"
                                    onClick={() => setForm({ ...form, image_url: "" })}
                                >
                                    حذف تصویر
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="ann-two-cols">
                        <label>
                            نوع اعلان
                            <select
                                value={form.type}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        type: event.target.value as Announcement["type"],
                                    })
                                }
                            >
                                <option value="info">اطلاع‌رسانی</option>
                                <option value="warning">هشدار</option>
                                <option value="discount">تخفیف</option>
                                <option value="update">بروزرسانی</option>
                                <option value="danger">مهم</option>
                            </select>
                        </label>

                        <label>
                            اهمیت
                            <select
                                value={form.priority}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        priority: event.target.value as Announcement["priority"],
                                    })
                                }
                            >
                                <option value="low">کم</option>
                                <option value="medium">متوسط</option>
                                <option value="high">زیاد</option>
                                <option value="critical">خیلی مهم</option>
                            </select>
                        </label>
                    </div>

                    <div className="ann-two-cols">
                        <label>
                            متن دکمه اختیاری
                            <input
                                value={form.cta_label}
                                onChange={(event) =>
                                    setForm({ ...form, cta_label: event.target.value })
                                }
                                placeholder="مثلاً مشاهده پلن"
                            />
                        </label>

                        <label>
                            لینک دکمه اختیاری
                            <input
                                value={form.cta_url}
                                onChange={(event) =>
                                    setForm({ ...form, cta_url: event.target.value })
                                }
                                placeholder="/billing یا https://..."
                                dir="ltr"
                            />
                        </label>
                    </div>

                    <div className="ann-two-cols">
                        <label>
                            شروع نمایش
                            <input
                                type="datetime-local"
                                value={form.starts_at}
                                onChange={(event) =>
                                    setForm({ ...form, starts_at: event.target.value })
                                }
                            />
                        </label>

                        <label>
                            پایان نمایش
                            <input
                                type="datetime-local"
                                value={form.ends_at}
                                onChange={(event) =>
                                    setForm({ ...form, ends_at: event.target.value })
                                }
                            />
                        </label>
                    </div>

                    <div className="ann-target-box">
                        <strong>مخاطب اعلان</strong>

                        <div className="ann-segment">
                            <button
                                type="button"
                                className={form.target_type === "all" ? "active" : ""}
                                onClick={() =>
                                    setForm({ ...form, target_type: "all", tenant_ids: [] })
                                }
                            >
                                همه مشتری‌ها
                            </button>

                            <button
                                type="button"
                                className={form.target_type === "selected" ? "active" : ""}
                                onClick={() => setForm({ ...form, target_type: "selected" })}
                            >
                                مشتری‌های انتخابی
                            </button>
                        </div>

                        {form.target_type === "selected" && (
                            <div className="ann-tenants-list">
                                {tenants.map((tenant) => (
                                    <button
                                        type="button"
                                        key={tenant.id}
                                        className={
                                            form.tenant_ids.includes(tenant.id) ? "selected" : ""
                                        }
                                        onClick={() => toggleTenant(tenant.id)}
                                    >
                                        <span>{tenant.name}</span>
                                        <small>{tenant.status || "customer"}</small>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="ann-check-row">
                        <label>
                            <input
                                type="checkbox"
                                checked={form.is_active}
                                onChange={(event) =>
                                    setForm({ ...form, is_active: event.target.checked })
                                }
                            />
                            فعال باشد
                        </label>

                        <label>
                            <input
                                type="checkbox"
                                checked={form.is_dismissible}
                                onChange={(event) =>
                                    setForm({ ...form, is_dismissible: event.target.checked })
                                }
                            />
                            مشتری بتواند ببندد
                        </label>
                    </div>

                    <button className="ann-primary-btn" disabled={saving}>
                        {saving ? "در حال ذخیره..." : form.id ? "ذخیره تغییرات" : "ساخت اعلان"}
                    </button>
                </form>

                <section className="ann-list-card">
                    <div className="ann-card-head">
                        <div>
                            <span className="ann-eyebrow">History</span>
                            <h2>اعلان‌های ساخته‌شده</h2>
                        </div>

                        <div className="ann-filter">
                            <button
                                type="button"
                                className={filter === "all" ? "active" : ""}
                                onClick={() => setFilter("all")}
                            >
                                همه
                            </button>

                            <button
                                type="button"
                                className={filter === "active" ? "active" : ""}
                                onClick={() => setFilter("active")}
                            >
                                فعال
                            </button>

                            <button
                                type="button"
                                className={filter === "inactive" ? "active" : ""}
                                onClick={() => setFilter("inactive")}
                            >
                                غیرفعال
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="ann-empty">در حال دریافت اعلان‌ها...</div>
                    ) : filteredAnnouncements.length === 0 ? (
                        <div className="ann-empty">هنوز اعلانی وجود ندارد.</div>
                    ) : (
                        <div className="ann-admin-list">
                            {filteredAnnouncements.map((item) => (
                                <article
                                    key={item.id}
                                    className={`ann-admin-item type-${item.type} ${
                                        !item.is_active ? "inactive" : ""
                                    }`}
                                >
                                    {item.image_url && (
                                        <div className="ann-image-preview-box">
                                            <img src={item.image_url} alt={item.title} />
                                            <div>
                                                <strong>تصویر اعلان</strong>
                                                <span className="muted">
                                                    این تصویر برای مشتری به‌صورت کوچک و کامل نمایش داده می‌شود.
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="ann-admin-item-top">
                                        <div>
                                            <span>{typeLabels[item.type]}</span>
                                            <h3>{item.title}</h3>
                                        </div>

                                        <b>{priorityLabels[item.priority]}</b>
                                    </div>

                                    <p>{item.body}</p>

                                    <div className="ann-stats-row">
                                        <span>
                                            مخاطب:{" "}
                                            {item.target_type === "all"
                                                ? "همه مشتری‌ها"
                                                : `${item.target_count} مشتری`}
                                        </span>

                                        <span>خوانده‌شده: {item.read_count}</span>
                                        <span>بسته‌شده: {item.dismissed_count}</span>
                                    </div>

                                    {item.target_tenants?.length > 0 && (
                                        <div className="ann-target-chips">
                                            {item.target_tenants.slice(0, 5).map((tenant) => (
                                                <span key={tenant.id}>{tenant.name}</span>
                                            ))}

                                            {item.target_tenants.length > 5 && (
                                                <span>+{item.target_tenants.length - 5}</span>
                                            )}
                                        </div>
                                    )}

                                    <div className="ann-admin-actions">
                                        <button
                                            type="button"
                                            onClick={() => editAnnouncement(item)}
                                        >
                                            ویرایش
                                        </button>

                                        {item.is_active && (
                                            <button
                                                type="button"
                                                onClick={() => disableAnnouncement(item.id)}
                                            >
                                                غیرفعال‌سازی
                                            </button>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </section>
        </main>
    );
}