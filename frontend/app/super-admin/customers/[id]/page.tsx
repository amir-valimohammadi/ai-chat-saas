// مسیر فایل: ai-chat-saas/frontend/app/super-admin/customers/[id]/page.tsx
// هدف: صفحه جزئیات مشتری، تغییر وضعیت، تغییر پلن و مدیریت سایت توسط Super Admin

"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type Tenant = {
    id: number;
    name: string;
    owner_name: string | null;
    owner_email: string | null;
    owner_phone: string | null;
    status: string;
    plan_id: number | null;
    plan_name: string | null;
    created_at: string;
};

type Metrics = {
    sites_count: number;
    users_count: number;
    conversations_count: number;
    messages_count: number;
    attachments_count: number;
    active_conversations: number;
    closed_conversations: number;
};

type Site = {
    id: number;
    name: string;
    domain: string;
    site_key: string;
    brand_name: string | null;
    brand_color: string | null;
    logo_url: string | null;
    welcome_message: string | null;
    ai_mode: string;
    is_active: boolean;
    conversations_count: number;
    created_at: string;
};

type UserItem = {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    is_active: boolean;
    last_login_at: string | null;
    last_seen_at: string | null;
    availability_status: string;
    created_at: string;
};

type Plan = {
    id: number;
    name: string;
    price_monthly: number;
    is_active: boolean;
};

type CustomerData = {
    tenant: Tenant;
    metrics: Metrics;
    sites: Site[];
    users: UserItem[];
    plans: Plan[];
};

const statusLabels: Record<string, string> = {
    active: "فعال",
    inactive: "غیرفعال",
    suspended: "تعلیق‌شده",
};

export default function SuperAdminCustomerDetailPage() {
    const router = useRouter();
    const params = useParams();
    const tenantId = Number(params.id);

    const [data, setData] = useState<CustomerData | null>(null);
    const [selectedStatus, setSelectedStatus] = useState("active");
    const [selectedPlanId, setSelectedPlanId] = useState("");

    const [editingSiteId, setEditingSiteId] = useState<number | null>(null);
    const [siteForm, setSiteForm] = useState({
        name: "",
        domain: "",
        brand_name: "",
        brand_color: "#2563eb",
        logo_url: "",
        welcome_message: "",
        ai_mode: "assistant",
    });

    const [loading, setLoading] = useState(true);
    const [savingStatus, setSavingStatus] = useState(false);
    const [savingPlan, setSavingPlan] = useState(false);
    const [savingSite, setSavingSite] = useState(false);
    const [updatingSiteId, setUpdatingSiteId] = useState<number | null>(null);

    const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
    const [passwordUserId, setPasswordUserId] = useState<number | null>(null);
    const [newPassword, setNewPassword] = useState("");
    const [savingPassword, setSavingPassword] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    async function loadCustomer() {
        try {
            setLoading(true);
            setError("");

            const response = await apiRequest(
                `/super-admin/customer-show.php?tenant_id=${tenantId}`
            );

            setData(response);
            setSelectedStatus(response.tenant.status || "active");
            setSelectedPlanId(
                response.tenant.plan_id ? String(response.tenant.plan_id) : ""
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت مشتری");
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

        if (user.role !== "super_admin") {
            router.push("/dashboard");
            return;
        }

        if (!tenantId) {
            router.push("/super-admin/customers");
            return;
        }

        loadCustomer();
    }, [router, tenantId]);

    async function updateStatus() {
        if (!data) return;

        try {
            setSavingStatus(true);
            setError("");
            setSuccess("");

            await apiRequest("/super-admin/customer-status-update.php", {
                method: "POST",
                body: JSON.stringify({
                    tenant_id: data.tenant.id,
                    status: selectedStatus,
                }),
            });

            setSuccess("وضعیت مشتری با موفقیت تغییر کرد.");
            await loadCustomer();
        } catch (err) {
            setError(err instanceof Error ? err.message : "تغییر وضعیت ناموفق بود");
        } finally {
            setSavingStatus(false);
        }
    }

    async function updatePlan() {
        if (!data || !selectedPlanId) return;

        try {
            setSavingPlan(true);
            setError("");
            setSuccess("");

            await apiRequest("/super-admin/customer-plan-update.php", {
                method: "POST",
                body: JSON.stringify({
                    tenant_id: data.tenant.id,
                    plan_id: Number(selectedPlanId),
                }),
            });

            setSuccess("پلن مشتری با موفقیت تغییر کرد.");
            await loadCustomer();
        } catch (err) {
            setError(err instanceof Error ? err.message : "تغییر پلن ناموفق بود");
        } finally {
            setSavingPlan(false);
        }
    }

    async function toggleSiteStatus(site: Site) {
        try {
            setUpdatingSiteId(site.id);
            setError("");
            setSuccess("");

            await apiRequest("/super-admin/site-status-update.php", {
                method: "POST",
                body: JSON.stringify({
                    site_id: site.id,
                    is_active: !site.is_active,
                }),
            });

            setSuccess(
                !site.is_active
                    ? "سایت با موفقیت فعال شد."
                    : "سایت با موفقیت غیرفعال شد."
            );

            await loadCustomer();
        } catch (err) {
            setError(err instanceof Error ? err.message : "تغییر وضعیت سایت ناموفق بود");
        } finally {
            setUpdatingSiteId(null);
        }
    }

    function openSiteEdit(site: Site) {
        setEditingSiteId(site.id);
        setSiteForm({
            name: site.name || "",
            domain: site.domain || "",
            brand_name: site.brand_name || "",
            brand_color: site.brand_color || "#2563eb",
            logo_url: site.logo_url || "",
            welcome_message: site.welcome_message || "",
            ai_mode: site.ai_mode || "assistant",
        });
    }

    function updateSiteForm(field: string, value: string) {
        setSiteForm((prev) => ({
            ...prev,
            [field]: value,
        }));
    }

    async function saveSiteSettings(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!editingSiteId) return;

        try {
            setSavingSite(true);
            setError("");
            setSuccess("");

            await apiRequest("/super-admin/site-settings-update.php", {
                method: "POST",
                body: JSON.stringify({
                    site_id: editingSiteId,
                    ...siteForm,
                }),
            });

            setSuccess("تنظیمات سایت با موفقیت ذخیره شد.");
            setEditingSiteId(null);
            await loadCustomer();
        } catch (err) {
            setError(err instanceof Error ? err.message : "ذخیره تنظیمات سایت ناموفق بود");
        } finally {
            setSavingSite(false);
        }
    }
    async function toggleUserStatus(user: UserItem) {
        try {
            setUpdatingUserId(user.id);
            setError("");
            setSuccess("");

            await apiRequest("/super-admin/user-status-update.php", {
                method: "POST",
                body: JSON.stringify({
                    user_id: user.id,
                    is_active: !user.is_active,
                }),
            });

            setSuccess(
                !user.is_active
                    ? "کاربر با موفقیت فعال شد."
                    : "کاربر با موفقیت غیرفعال شد."
            );

            await loadCustomer();
        } catch (err) {
            setError(err instanceof Error ? err.message : "تغییر وضعیت کاربر ناموفق بود");
        } finally {
            setUpdatingUserId(null);
        }
    }

    async function resetUserPassword(userId: number) {
        if (newPassword.trim().length < 8) {
            setError("رمز جدید باید حداقل ۸ کاراکتر باشد.");
            return;
        }

        try {
            setSavingPassword(true);
            setError("");
            setSuccess("");

            await apiRequest("/super-admin/user-password-reset.php", {
                method: "POST",
                body: JSON.stringify({
                    user_id: userId,
                    password: newPassword,
                }),
            });

            setSuccess("رمز عبور کاربر با موفقیت تغییر کرد.");
            setPasswordUserId(null);
            setNewPassword("");

            await loadCustomer();
        } catch (err) {
            setError(err instanceof Error ? err.message : "تغییر رمز عبور ناموفق بود");
        } finally {
            setSavingPassword(false);
        }
    }

    const tenant = data?.tenant;

    return (
        <AppShell
            title={tenant ? tenant.name : "جزئیات مشتری"}
            kicker="Customer Detail"
            description="مدیریت وضعیت، پلن، سایت‌ها و کاربران مشتری"
            actions={
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                        className="btn secondary"
                        type="button"
                        onClick={loadCustomer}
                        disabled={loading}
                    >
                        بروزرسانی
                    </button>

                    <Link className="btn secondary" href="/super-admin/customers">
                        بازگشت
                    </Link>
                </div>
            }
        >
            {error && <div className="error">{error}</div>}
            {success && <div className="success">{success}</div>}

            {loading || !data ? (
                <section className="customer-detail-section">
                    <p className="muted">در حال بارگذاری مشتری...</p>
                </section>
            ) : (
                <div className="customer-detail-layout">
                    <main className="customer-detail-main">
                        <section className="customer-profile-card">
                            <div className="customer-profile-top">
                                <div>
                                    <h2 className="customer-profile-title">{data.tenant.name}</h2>
                                    <div className="customer-profile-subtitle">
                                        شناسه مشتری #{data.tenant.id} · ایجاد شده در{" "}
                                        {data.tenant.created_at}
                                    </div>
                                </div>

                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span
                      className={`soft-chip ${
                          data.tenant.status === "active" ? "success" : "danger"
                      }`}
                  >
                    {statusLabels[data.tenant.status] || data.tenant.status}
                  </span>

                                    <span className="soft-chip primary">
                    {data.tenant.plan_name || "بدون پلن"}
                  </span>
                                </div>
                            </div>

                            <div className="customer-mini-grid">
                                <MiniTile label="مالک" value={data.tenant.owner_name || "-"} />
                                <MiniTile label="ایمیل" value={data.tenant.owner_email || "-"} />
                                <MiniTile label="موبایل" value={data.tenant.owner_phone || "-"} />
                                <MiniTile label="سایت‌ها" value={data.metrics.sites_count} />
                                <MiniTile label="کاربران پنل" value={data.metrics.users_count} />
                                <MiniTile
                                    label="کل گفتگوها"
                                    value={data.metrics.conversations_count}
                                />
                                <MiniTile label="کل پیام‌ها" value={data.metrics.messages_count} />
                                <MiniTile label="فایل‌ها" value={data.metrics.attachments_count} />
                            </div>
                        </section>

                        <section className="customer-detail-section">
                            <div className="customer-detail-section-header">
                                <div>
                                    <h2>سایت‌های مشتری</h2>
                                    <p className="muted" style={{ margin: "5px 0 0" }}>
                                        وضعیت سایت‌ها و تنظیمات اصلی ویجت را از همین بخش مدیریت کن.
                                    </p>
                                </div>

                                <span className="soft-chip primary">{data.sites.length}</span>
                            </div>

                            {data.sites.length === 0 ? (
                                <EmptyMini text="هنوز سایتی برای این مشتری ثبت نشده است." />
                            ) : (
                                <div className="customer-clean-list">
                                    {data.sites.map((site) => (
                                        <div key={site.id} className="customer-clean-row">
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        gap: 12,
                                                        flexWrap: "wrap",
                                                    }}
                                                >
                                                    <div>
                                                        <strong>{site.name}</strong>
                                                        <div className="muted">
                                                            {site.domain} · گفتگوها: {site.conversations_count}
                                                        </div>
                                                        <div className="muted">site_key: {site.site_key}</div>
                                                    </div>

                                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span
                                className={`soft-chip ${
                                    site.is_active ? "success" : "danger"
                                }`}
                            >
                              {site.is_active ? "فعال" : "غیرفعال"}
                            </span>

                                                        <span className="soft-chip primary">
                              AI: {site.ai_mode}
                            </span>
                                                    </div>
                                                </div>

                                                {editingSiteId === site.id && (
                                                    <form
                                                        onSubmit={saveSiteSettings}
                                                        className="grid"
                                                        style={{
                                                            marginTop: 16,
                                                            padding: 14,
                                                            borderRadius: 18,
                                                            background: "#fff",
                                                            border: "1px solid var(--border)",
                                                        }}
                                                    >
                                                        <div className="admin-two-col">
                                                            <label className="grid">
                                                                <span>نام سایت</span>
                                                                <input
                                                                    className="input"
                                                                    value={siteForm.name}
                                                                    onChange={(event) =>
                                                                        updateSiteForm("name", event.target.value)
                                                                    }
                                                                />
                                                            </label>

                                                            <label className="grid">
                                                                <span>دامنه</span>
                                                                <input
                                                                    className="input"
                                                                    value={siteForm.domain}
                                                                    onChange={(event) =>
                                                                        updateSiteForm("domain", event.target.value)
                                                                    }
                                                                />
                                                            </label>

                                                            <label className="grid">
                                                                <span>نام برند</span>
                                                                <input
                                                                    className="input"
                                                                    value={siteForm.brand_name}
                                                                    onChange={(event) =>
                                                                        updateSiteForm("brand_name", event.target.value)
                                                                    }
                                                                />
                                                            </label>

                                                            <label className="grid">
                                                                <span>رنگ برند</span>
                                                                <input
                                                                    className="input"
                                                                    value={siteForm.brand_color}
                                                                    onChange={(event) =>
                                                                        updateSiteForm("brand_color", event.target.value)
                                                                    }
                                                                    placeholder="#2563eb"
                                                                />
                                                            </label>

                                                            <label className="grid">
                                                                <span>لوگو URL</span>
                                                                <input
                                                                    className="input"
                                                                    value={siteForm.logo_url}
                                                                    onChange={(event) =>
                                                                        updateSiteForm("logo_url", event.target.value)
                                                                    }
                                                                    placeholder="https://example.com/logo.png"
                                                                />
                                                            </label>

                                                            <label className="grid">
                                                                <span>حالت AI</span>
                                                                <select
                                                                    className="input"
                                                                    value={siteForm.ai_mode}
                                                                    onChange={(event) =>
                                                                        updateSiteForm("ai_mode", event.target.value)
                                                                    }
                                                                >
                                                                    <option value="off">خاموش</option>
                                                                    <option value="assistant">کمک‌یار پشتیبان</option>
                                                                    <option value="semi_auto">نیمه‌خودکار</option>
                                                                </select>
                                                            </label>
                                                        </div>

                                                        <label className="grid">
                                                            <span>پیام خوش‌آمدگویی</span>
                                                            <textarea
                                                                className="textarea"
                                                                value={siteForm.welcome_message}
                                                                onChange={(event) =>
                                                                    updateSiteForm(
                                                                        "welcome_message",
                                                                        event.target.value
                                                                    )
                                                                }
                                                            />
                                                        </label>

                                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                                            <button
                                                                className="btn"
                                                                type="submit"
                                                                disabled={savingSite}
                                                            >
                                                                {savingSite ? "در حال ذخیره..." : "ذخیره تنظیمات"}
                                                            </button>

                                                            <button
                                                                className="btn secondary"
                                                                type="button"
                                                                onClick={() => setEditingSiteId(null)}
                                                            >
                                                                انصراف
                                                            </button>
                                                        </div>
                                                    </form>
                                                )}
                                            </div>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    gap: 8,
                                                    flexWrap: "wrap",
                                                    alignItems: "center",
                                                }}
                                            >
                                                <button
                                                    className="btn secondary"
                                                    type="button"
                                                    onClick={() => openSiteEdit(site)}
                                                >
                                                    ویرایش
                                                </button>

                                                <button
                                                    className={site.is_active ? "btn danger" : "btn"}
                                                    type="button"
                                                    onClick={() => toggleSiteStatus(site)}
                                                    disabled={updatingSiteId === site.id}
                                                >
                                                    {updatingSiteId === site.id
                                                        ? "در حال تغییر..."
                                                        : site.is_active
                                                            ? "غیرفعال"
                                                            : "فعال"}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="customer-detail-section">
                            <div className="customer-detail-section-header">
                                <div>
                                    <h2>کاربران پنل</h2>
                                    <p className="muted" style={{ margin: "5px 0 0" }}>
                                        مدیران و پشتیبان‌های این مشتری.
                                    </p>
                                </div>

                                <span className="soft-chip primary">{data.users.length}</span>
                            </div>

                            {data.users.length === 0 ? (
                                <EmptyMini text="کاربری برای این مشتری ثبت نشده است." />
                            ) : (
                                <div className="customer-clean-list">
                                    {data.users.map((user) => (
                                        <div key={user.id} className="customer-clean-row">
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        gap: 12,
                                                        flexWrap: "wrap",
                                                    }}
                                                >
                                                    <div>
                                                        <strong>{user.name}</strong>

                                                        <div className="muted">
                                                            {user.email} · {user.phone || "بدون شماره"}
                                                        </div>

                                                        <div className="muted">
                                                            آخرین فعالیت: {user.last_seen_at || "-"}
                                                        </div>
                                                    </div>

                                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                                        <span className="soft-chip">{user.role}</span>

                                                        <span
                                                            className={`soft-chip ${
                                                                user.is_active ? "success" : "danger"
                                                            }`}
                                                        >
            {user.is_active ? "فعال" : "غیرفعال"}
          </span>

                                                        <span className="soft-chip">
            {user.availability_status === "offline" ? "Offline" : "Online"}
          </span>
                                                    </div>
                                                </div>

                                                {passwordUserId === user.id && (
                                                    <div
                                                        className="grid"
                                                        style={{
                                                            marginTop: 14,
                                                            padding: 14,
                                                            borderRadius: 18,
                                                            background: "#fff",
                                                            border: "1px solid var(--border)",
                                                        }}
                                                    >
                                                        <label className="grid">
                                                            <span>رمز جدید</span>
                                                            <input
                                                                className="input"
                                                                type="password"
                                                                value={newPassword}
                                                                onChange={(event) => setNewPassword(event.target.value)}
                                                                placeholder="حداقل ۸ کاراکتر"
                                                            />
                                                        </label>

                                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                                            <button
                                                                className="btn"
                                                                type="button"
                                                                onClick={() => resetUserPassword(user.id)}
                                                                disabled={savingPassword}
                                                            >
                                                                {savingPassword ? "در حال ذخیره..." : "ذخیره رمز جدید"}
                                                            </button>

                                                            <button
                                                                className="btn secondary"
                                                                type="button"
                                                                onClick={() => {
                                                                    setPasswordUserId(null);
                                                                    setNewPassword("");
                                                                }}
                                                            >
                                                                انصراف
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    gap: 8,
                                                    flexWrap: "wrap",
                                                    alignItems: "center",
                                                }}
                                            >
                                                <button
                                                    className="btn secondary"
                                                    type="button"
                                                    onClick={() => {
                                                        setPasswordUserId(user.id);
                                                        setNewPassword("");
                                                    }}
                                                >
                                                    تغییر رمز
                                                </button>

                                                <button
                                                    className={user.is_active ? "btn danger" : "btn"}
                                                    type="button"
                                                    onClick={() => toggleUserStatus(user)}
                                                    disabled={updatingUserId === user.id}
                                                >
                                                    {updatingUserId === user.id
                                                        ? "در حال تغییر..."
                                                        : user.is_active
                                                            ? "غیرفعال"
                                                            : "فعال"}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </main>

                    <aside className="customer-detail-side">
                        <section className="customer-side-card">
                            <h3 style={{ marginTop: 0 }}>تغییر وضعیت مشتری</h3>

                            <div className="grid">
                                <select
                                    className="input"
                                    value={selectedStatus}
                                    onChange={(event) => setSelectedStatus(event.target.value)}
                                >
                                    <option value="active">فعال</option>
                                    <option value="inactive">غیرفعال</option>
                                    <option value="suspended">تعلیق‌شده</option>
                                </select>

                                <button
                                    className="btn"
                                    type="button"
                                    onClick={updateStatus}
                                    disabled={savingStatus}
                                >
                                    {savingStatus ? "در حال ذخیره..." : "ذخیره وضعیت"}
                                </button>

                                <p className="muted" style={{ margin: 0, lineHeight: 1.8 }}>
                                    اگر مشتری غیرفعال یا تعلیق شود، ویجت سایت‌های او دیگر نباید
                                    برای کاربران نهایی در دسترس باشد.
                                </p>
                            </div>
                        </section>

                        <section className="customer-side-card">
                            <h3 style={{ marginTop: 0 }}>تغییر پلن</h3>

                            <div className="grid">
                                <select
                                    className="input"
                                    value={selectedPlanId}
                                    onChange={(event) => setSelectedPlanId(event.target.value)}
                                >
                                    <option value="">انتخاب پلن</option>
                                    {data.plans.map((plan) => (
                                        <option key={plan.id} value={plan.id}>
                                            {plan.name} -{" "}
                                            {Number(plan.price_monthly).toLocaleString("fa-IR")}
                                        </option>
                                    ))}
                                </select>

                                <button
                                    className="btn"
                                    type="button"
                                    onClick={updatePlan}
                                    disabled={savingPlan || !selectedPlanId}
                                >
                                    {savingPlan ? "در حال ذخیره..." : "ذخیره پلن"}
                                </button>
                            </div>
                        </section>

                        <section className="customer-side-card">
                            <h3 style={{ marginTop: 0 }}>وضعیت گفتگوها</h3>

                            <div className="grid">
                                <SideRow label="فعال" value={data.metrics.active_conversations} />
                                <SideRow
                                    label="بسته‌شده"
                                    value={data.metrics.closed_conversations}
                                />
                                <SideRow label="کل گفتگوها" value={data.metrics.conversations_count} />
                            </div>
                        </section>
                    </aside>
                </div>
            )}
        </AppShell>
    );
}

function MiniTile({
                      label,
                      value,
                  }: {
    label: string;
    value: string | number;
}) {
    return (
        <div className="customer-mini-tile">
            <div className="customer-mini-label">{label}</div>
            <div className="customer-mini-value">{value}</div>
        </div>
    );
}

function SideRow({
                     label,
                     value,
                 }: {
    label: string;
    value: string | number;
}) {
    return (
        <div className="admin-side-row">
            <span className="muted">{label}</span>
            <span className="soft-chip primary">{value}</span>
        </div>
    );
}

function EmptyMini({ text }: { text: string }) {
    return (
        <div
            style={{
                padding: 24,
                borderRadius: 18,
                background: "var(--surface-soft)",
                border: "1px dashed var(--border)",
                textAlign: "center",
            }}
        >
            <p className="muted" style={{ margin: 0 }}>
                {text}
            </p>
        </div>
    );
}