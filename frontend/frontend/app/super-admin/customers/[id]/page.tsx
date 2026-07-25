// مسیر فایل: ai-chat-saas/frontend/app/super-admin/customers/[id]/page.tsx
// هدف: نمای ۳۶۰ درجه مشتری برای Super Admin

"use client";

import Link from "next/link";
import {
    CSSProperties,
    FormEvent,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";
import Customer360Panel from "@/components/super-admin/Customer360Panel";

type TenantStatus = "active" | "inactive" | "suspended";
type AiMode = "off" | "assistant" | "semi_auto";
type DetailTab = "overview" | "customer360" | "sites" | "users" | "activity";

type Tenant = {
    id: number;
    name: string;
    owner_name: string | null;
    owner_email: string | null;
    owner_phone: string | null;
    status: TenantStatus;
    plan_id: number | null;
    plan_name: string | null;
    plan_description: string | null;
    plan_is_active: boolean | null;
    price_monthly: number | null;
    created_at: string;
    updated_at: string | null;
    last_activity_at: string | null;
};

type Summary = {
    sites_count: number;
    active_sites_count: number;
    users_count: number;
    active_users_count: number;
    agents_count: number;
    active_agents_count: number;
    online_agents_count: number;
    conversations_count: number;
    monthly_conversations: number;
    messages_count: number;
    monthly_messages: number;
    attachments_count: number;
    active_conversations: number;
    closed_conversations: number;
};

type UsageItem = {
    used: number;
    limit: number | null;
    percent: number;
    is_unlimited: boolean;
    is_near_limit: boolean;
    is_over_limit: boolean;
};

type Usage = {
    sites: UsageItem;
    agents: UsageItem;
    monthly_conversations: UsageItem;
};

type PlanFeatures = {
    ai_suggestions_enabled: boolean;
    ai_auto_reply_enabled: boolean;
    knowledge_base_enabled: boolean;
};

type AiSummary = {
    requests_total: number;
    requests_month: number;
    auto_replies_month: number;
    suggestions_month: number;
    fallbacks_month: number;
    no_answers_month: number;
    average_confidence_month: number;
    usable_rate_month: number;
    last_activity_at: string | null;
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
    ai_mode: AiMode;
    is_active: boolean;
    conversations_count: number;
    monthly_conversations: number;
    last_activity_at: string | null;
    created_at: string;
    updated_at: string | null;
};

type UserItem = {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    role: "customer_admin" | "agent";
    is_active: boolean;
    last_login_at: string | null;
    last_seen_at: string | null;
    availability_status: "online" | "offline";
    created_at: string;
    updated_at: string | null;
};

type RecentConversation = {
    id: number;
    site_id: number;
    site_name: string;
    visitor_name: string | null;
    visitor_email: string | null;
    visitor_phone: string | null;
    status: string;
    source_page_title: string | null;
    source_page_url: string | null;
    messages_count: number;
    last_message_at: string | null;
    created_at: string;
};

type Plan = {
    id: number;
    name: string;
    description: string | null;
    max_sites: number;
    max_agents: number;
    max_monthly_conversations: number;
    ai_suggestions_enabled: boolean;
    ai_auto_reply_enabled: boolean;
    knowledge_base_enabled: boolean;
    price_monthly: number;
    is_active: boolean;
};

type CustomerDetailResponse = {
    generated_at: string;
    tenant: Tenant;
    summary: Summary;
    usage: Usage;
    plan_features: PlanFeatures;
    ai_summary: AiSummary;
    sites: Site[];
    users: UserItem[];
    recent_conversations: RecentConversation[];
    plans: Plan[];
};

type SiteForm = {
    name: string;
    domain: string;
    brand_name: string;
    brand_color: string;
    logo_url: string;
    welcome_message: string;
    ai_mode: AiMode;
};

type IconName =
    | "arrow"
    | "refresh"
    | "building"
    | "site"
    | "users"
    | "agent"
    | "message"
    | "attachment"
    | "activity"
    | "spark"
    | "settings"
    | "edit"
    | "power"
    | "key"
    | "copy"
    | "close"
    | "check"
    | "warning"
    | "clock"
    | "mail"
    | "phone"
    | "globe"
    | "lock";

const statusLabels: Record<TenantStatus, string> = {
    active: "فعال",
    inactive: "غیرفعال",
    suspended: "تعلیق‌شده",
};

const conversationStatusLabels: Record<string, string> = {
    new: "جدید",
    open: "باز",
    in_progress: "در حال پیگیری",
    waiting_customer: "در انتظار مشتری",
    follow_up: "پیگیری",
    pending: "معلق",
    closed: "بسته‌شده",
};

const aiModeLabels: Record<AiMode, string> = {
    off: "خاموش",
    assistant: "کمک‌یار",
    semi_auto: "نیمه‌خودکار",
};

const roleLabels: Record<UserItem["role"], string> = {
    customer_admin: "مدیر مشتری",
    agent: "پشتیبان",
};

function readRequestedDetailTab(): DetailTab {
    if (typeof window === "undefined") return "overview";
    const requested = new URLSearchParams(window.location.search).get("tab");
    return ["overview", "customer360", "sites", "users", "activity"].includes(requested || "")
        ? (requested as DetailTab)
        : "overview";
}

const numberFormatter = new Intl.NumberFormat("fa-IR");
const currencyFormatter = new Intl.NumberFormat("fa-IR", {
    maximumFractionDigits: 0,
});

export default function SuperAdminCustomerDetailPage() {
    const router = useRouter();
    const params = useParams();
    const rawTenantId = Array.isArray(params.id) ? params.id[0] : params.id;
    const tenantId = Number(rawTenantId);

    const [authorized, setAuthorized] = useState(false);
    const [data, setData] = useState<CustomerDetailResponse | null>(null);
    const [activeTab, setActiveTab] = useState<DetailTab>("overview");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    useEffect(() => {
        setActiveTab(readRequestedDetailTab());
    }, []);

    const [selectedStatus, setSelectedStatus] = useState<TenantStatus>("active");
    const [selectedPlanId, setSelectedPlanId] = useState("");
    const [savingCustomerAction, setSavingCustomerAction] = useState<
        "status" | "plan" | null
    >(null);

    const [editingSite, setEditingSite] = useState<Site | null>(null);
    const [siteForm, setSiteForm] = useState<SiteForm>(createEmptySiteForm());
    const [savingSite, setSavingSite] = useState(false);
    const [updatingSiteId, setUpdatingSiteId] = useState<number | null>(null);
    const [copiedSiteId, setCopiedSiteId] = useState<number | null>(null);

    const [passwordUser, setPasswordUser] = useState<UserItem | null>(null);
    const [newPassword, setNewPassword] = useState("");
    const [savingPassword, setSavingPassword] = useState(false);
    const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);

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

        if (!Number.isInteger(tenantId) || tenantId <= 0) {
            router.push("/super-admin/customers");
            return;
        }

        setAuthorized(true);
    }, [router, tenantId]);

    const loadCustomer = useCallback(
        async (silent = false) => {
            if (!authorized || tenantId <= 0) {
                return;
            }

            try {
                setError("");

                if (silent) {
                    setRefreshing(true);
                } else {
                    setLoading(true);
                }

                const response = (await apiRequest(
                    `/super-admin/customer-show.php?tenant_id=${tenantId}`
                )) as CustomerDetailResponse;

                setData(response);
                setSelectedStatus(response.tenant.status);
                setSelectedPlanId(
                    response.tenant.plan_id ? String(response.tenant.plan_id) : ""
                );
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "خطا در دریافت اطلاعات مشتری"
                );
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [authorized, tenantId]
    );

    useEffect(() => {
        loadCustomer();
    }, [loadCustomer]);

    useEffect(() => {
        if (!notice) {
            return;
        }

        const timer = window.setTimeout(() => setNotice(""), 4200);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const customerInitial = useMemo(
        () => getInitial(data?.tenant.name || "م"),
        [data?.tenant.name]
    );

    async function updateCustomerStatus() {
        if (!data || selectedStatus === data.tenant.status) {
            return;
        }

        const accepted = window.confirm(
            selectedStatus === "active"
                ? "این مشتری دوباره فعال شود؟"
                : "با تغییر وضعیت، دسترسی کاربران و ویجت مشتری محدود می‌شود. ادامه می‌دهید؟"
        );

        if (!accepted) {
            return;
        }

        try {
            setSavingCustomerAction("status");
            setError("");

            await apiRequest("/super-admin/customer-status-update.php", {
                method: "POST",
                body: JSON.stringify({
                    tenant_id: data.tenant.id,
                    status: selectedStatus,
                }),
            });

            setNotice("وضعیت مشتری با موفقیت به‌روزرسانی شد.");
            await loadCustomer(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "تغییر وضعیت ناموفق بود");
        } finally {
            setSavingCustomerAction(null);
        }
    }

    async function updateCustomerPlan() {
        if (!data || !selectedPlanId || Number(selectedPlanId) === data.tenant.plan_id) {
            return;
        }

        const selectedPlan = data.plans.find(
            (plan) => plan.id === Number(selectedPlanId)
        );
        const accepted = window.confirm(
            `پلن مشتری به «${selectedPlan?.name || "پلن انتخاب‌شده"}» تغییر کند؟`
        );

        if (!accepted) {
            return;
        }

        try {
            setSavingCustomerAction("plan");
            setError("");

            await apiRequest("/super-admin/customer-plan-update.php", {
                method: "POST",
                body: JSON.stringify({
                    tenant_id: data.tenant.id,
                    plan_id: Number(selectedPlanId),
                }),
            });

            setNotice("پلن مشتری با موفقیت به‌روزرسانی شد.");
            await loadCustomer(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "تغییر پلن ناموفق بود");
        } finally {
            setSavingCustomerAction(null);
        }
    }

    async function toggleSiteStatus(site: Site) {
        const nextState = !site.is_active;
        const accepted = window.confirm(
            nextState
                ? `سایت «${site.name}» فعال شود؟`
                : `سایت «${site.name}» غیرفعال شود؟ ویجت آن دیگر در دسترس نخواهد بود.`
        );

        if (!accepted) {
            return;
        }

        try {
            setUpdatingSiteId(site.id);
            setError("");

            await apiRequest("/super-admin/site-status-update.php", {
                method: "POST",
                body: JSON.stringify({
                    site_id: site.id,
                    is_active: nextState,
                }),
            });

            setNotice(nextState ? "سایت فعال شد." : "سایت غیرفعال شد.");
            await loadCustomer(true);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "تغییر وضعیت سایت ناموفق بود"
            );
        } finally {
            setUpdatingSiteId(null);
        }
    }

    function openSiteEditor(site: Site) {
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

    async function saveSiteSettings(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!editingSite) {
            return;
        }

        if (!siteForm.name.trim() || !siteForm.domain.trim()) {
            setError("نام سایت و دامنه الزامی هستند.");
            return;
        }

        if (!/^#[0-9a-fA-F]{6}$/.test(siteForm.brand_color)) {
            setError("رنگ برند باید به‌صورت HEX مانند #2563eb باشد.");
            return;
        }

        try {
            setSavingSite(true);
            setError("");

            await apiRequest("/super-admin/site-settings-update.php", {
                method: "POST",
                body: JSON.stringify({
                    site_id: editingSite.id,
                    ...siteForm,
                }),
            });

            setEditingSite(null);
            setNotice("تنظیمات سایت با موفقیت ذخیره شد.");
            await loadCustomer(true);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "ذخیره تنظیمات سایت ناموفق بود"
            );
        } finally {
            setSavingSite(false);
        }
    }

    async function copySiteKey(site: Site) {
        try {
            await navigator.clipboard.writeText(site.site_key);
            setCopiedSiteId(site.id);
            window.setTimeout(() => setCopiedSiteId(null), 1800);
        } catch {
            setError("کپی‌کردن site_key امکان‌پذیر نبود.");
        }
    }

    async function toggleUserStatus(targetUser: UserItem) {
        const nextState = !targetUser.is_active;
        const accepted = window.confirm(
            nextState
                ? `کاربر «${targetUser.name}» فعال شود؟`
                : `کاربر «${targetUser.name}» غیرفعال شود؟ نشست‌های فعال او لغو خواهند شد.`
        );

        if (!accepted) {
            return;
        }

        try {
            setUpdatingUserId(targetUser.id);
            setError("");

            await apiRequest("/super-admin/user-status-update.php", {
                method: "POST",
                body: JSON.stringify({
                    user_id: targetUser.id,
                    is_active: nextState,
                }),
            });

            setNotice(nextState ? "کاربر فعال شد." : "کاربر غیرفعال شد.");
            await loadCustomer(true);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "تغییر وضعیت کاربر ناموفق بود"
            );
        } finally {
            setUpdatingUserId(null);
        }
    }

    async function resetUserPassword(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!passwordUser) {
            return;
        }

        if (newPassword.length < 8) {
            setError("رمز جدید باید حداقل ۸ کاراکتر باشد.");
            return;
        }

        try {
            setSavingPassword(true);
            setError("");

            await apiRequest("/super-admin/user-password-reset.php", {
                method: "POST",
                body: JSON.stringify({
                    user_id: passwordUser.id,
                    password: newPassword,
                }),
            });

            setPasswordUser(null);
            setNewPassword("");
            setNotice("رمز عبور تغییر کرد و نشست‌های قبلی کاربر لغو شدند.");
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "تغییر رمز عبور ناموفق بود"
            );
        } finally {
            setSavingPassword(false);
        }
    }

    return (
        <AppShell
            title={data?.tenant.name || "جزئیات مشتری"}
            kicker="Customer 360"
            description="نمای کامل حساب، مصرف پلن، سایت‌ها، کاربران، گفتگوها و عملکرد AI"
            actions={
                <div className="sa-customer-detail-header-actions">
                    <button
                        className="btn secondary"
                        type="button"
                        onClick={() => loadCustomer(true)}
                        disabled={refreshing || loading}
                    >
                        <Icon name="refresh" />
                        {refreshing ? "در حال بروزرسانی..." : "بروزرسانی"}
                    </button>

                    <Link className="btn secondary" href="/super-admin/customers">
                        <Icon name="arrow" />
                        بازگشت به مشتری‌ها
                    </Link>
                </div>
            }
        >
            <div className="sa-customer-detail-page">
                {error && (
                    <div className="sa-customer-detail-alert is-error" role="alert">
                        <Icon name="warning" />
                        <span>{error}</span>
                        <button type="button" onClick={() => setError("")}>
                            <Icon name="close" />
                        </button>
                    </div>
                )}

                {notice && (
                    <div className="sa-customer-detail-alert is-success" role="status">
                        <Icon name="check" />
                        <span>{notice}</span>
                    </div>
                )}

                {loading || !data ? (
                    <CustomerDetailSkeleton />
                ) : (
                    <>
                        <CustomerHero
                            tenant={data.tenant}
                            summary={data.summary}
                            initial={customerInitial}
                        />

                        <DetailTabs
                            activeTab={activeTab}
                            onChange={setActiveTab}
                            sitesCount={data.sites.length}
                            usersCount={data.users.length}
                            activityCount={data.recent_conversations.length}
                        />

                        <div className={`sa-customer-detail-layout ${activeTab === "customer360" ? "is-customer360" : ""}`}>
                            <main className="sa-customer-detail-main">
                                {activeTab === "overview" && (
                                    <OverviewTab
                                        data={data}
                                        onGoToTab={setActiveTab}
                                    />
                                )}

                                {activeTab === "customer360" && (
                                    <Customer360Panel tenantId={tenantId} />
                                )}

                                {activeTab === "sites" && (
                                    <SitesTab
                                        sites={data.sites}
                                        updatingSiteId={updatingSiteId}
                                        copiedSiteId={copiedSiteId}
                                        onEdit={openSiteEditor}
                                        onToggle={toggleSiteStatus}
                                        onCopyKey={copySiteKey}
                                    />
                                )}

                                {activeTab === "users" && (
                                    <UsersTab
                                        users={data.users}
                                        updatingUserId={updatingUserId}
                                        onToggle={toggleUserStatus}
                                        onPassword={(targetUser) => {
                                            setPasswordUser(targetUser);
                                            setNewPassword("");
                                        }}
                                    />
                                )}

                                {activeTab === "activity" && (
                                    <ActivityTab
                                        conversations={data.recent_conversations}
                                        aiSummary={data.ai_summary}
                                    />
                                )}
                            </main>

                            {activeTab !== "customer360" && (
                                <aside className="sa-customer-detail-sidebar">
                                    <ManagementCard
                                        data={data}
                                        selectedStatus={selectedStatus}
                                        selectedPlanId={selectedPlanId}
                                        savingAction={savingCustomerAction}
                                        onStatusChange={setSelectedStatus}
                                        onPlanChange={setSelectedPlanId}
                                        onSaveStatus={updateCustomerStatus}
                                        onSavePlan={updateCustomerPlan}
                                    />

                                    <AccountInfoCard tenant={data.tenant} />
                                </aside>
                            )}
                        </div>
                    </>
                )}
            </div>

            {editingSite && (
                <SiteEditorModal
                    site={editingSite}
                    form={siteForm}
                    saving={savingSite}
                    onChange={(field, value) =>
                        setSiteForm((current) => ({ ...current, [field]: value }))
                    }
                    onClose={() => setEditingSite(null)}
                    onSubmit={saveSiteSettings}
                />
            )}

            {passwordUser && (
                <PasswordModal
                    user={passwordUser}
                    password={newPassword}
                    saving={savingPassword}
                    onPasswordChange={setNewPassword}
                    onClose={() => {
                        setPasswordUser(null);
                        setNewPassword("");
                    }}
                    onSubmit={resetUserPassword}
                />
            )}
        </AppShell>
    );
}

function CustomerHero({
                          tenant,
                          summary,
                          initial,
                      }: {
    tenant: Tenant;
    summary: Summary;
    initial: string;
}) {
    return (
        <section className="sa-customer-detail-hero">
            <div className="sa-customer-detail-hero-main">
                <div className="sa-customer-detail-avatar">{initial}</div>

                <div className="sa-customer-detail-hero-copy">
                    <div className="sa-customer-detail-badges">
                        <StatusBadge status={tenant.status} />
                        <span className="sa-customer-detail-badge is-plan">
                            {tenant.plan_name || "بدون پلن"}
                        </span>
                        {tenant.plan_is_active === false && (
                            <span className="sa-customer-detail-badge is-warning">
                                پلن آرشیوشده
                            </span>
                        )}
                    </div>

                    <h2>{tenant.name}</h2>
                    <p>
                        شناسه مشتری #{numberFormatter.format(tenant.id)} · عضویت از {" "}
                        {formatDate(tenant.created_at)}
                    </p>

                    <div className="sa-customer-detail-contact-row">
                        <ContactItem
                            icon="users"
                            value={tenant.owner_name || "نام مالک ثبت نشده"}
                        />
                        <ContactItem
                            icon="mail"
                            value={tenant.owner_email || "ایمیل ثبت نشده"}
                            ltr
                        />
                        <ContactItem
                            icon="phone"
                            value={tenant.owner_phone || "شماره ثبت نشده"}
                            ltr
                        />
                    </div>
                </div>
            </div>

            <div className="sa-customer-detail-hero-stats">
                <HeroStat label="سایت فعال" value={summary.active_sites_count} />
                <HeroStat label="پشتیبان" value={summary.agents_count} />
                <HeroStat label="گفتگوی ماه" value={summary.monthly_conversations} />
                <HeroStat
                    label="آخرین فعالیت"
                    value={formatRelativeDate(tenant.last_activity_at)}
                    compact
                />
            </div>
        </section>
    );
}

function DetailTabs({
                        activeTab,
                        onChange,
                        sitesCount,
                        usersCount,
                        activityCount,
                    }: {
    activeTab: DetailTab;
    onChange: (tab: DetailTab) => void;
    sitesCount: number;
    usersCount: number;
    activityCount: number;
}) {
    const tabs: Array<{
        id: DetailTab;
        label: string;
        icon: IconName;
        count?: number;
    }> = [
        { id: "overview", label: "نمای کلی", icon: "building" },
        { id: "customer360", label: "پرونده ۳۶۰", icon: "settings" },
        { id: "sites", label: "سایت‌ها", icon: "site", count: sitesCount },
        { id: "users", label: "کاربران", icon: "users", count: usersCount },
        {
            id: "activity",
            label: "فعالیت و AI",
            icon: "activity",
            count: activityCount,
        },
    ];

    return (
        <nav className="sa-customer-detail-tabs" aria-label="بخش‌های مشتری">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    className={activeTab === tab.id ? "is-active" : ""}
                    onClick={() => onChange(tab.id)}
                >
                    <Icon name={tab.icon} />
                    <span>{tab.label}</span>
                    {typeof tab.count === "number" && <b>{tab.count}</b>}
                </button>
            ))}
        </nav>
    );
}

function OverviewTab({
                         data,
                         onGoToTab,
                     }: {
    data: CustomerDetailResponse;
    onGoToTab: (tab: DetailTab) => void;
}) {
    return (
        <div className="sa-customer-detail-stack">
            <section className="sa-customer-detail-metric-grid">
                <MetricCard
                    icon="site"
                    label="کل سایت‌ها"
                    value={data.summary.sites_count}
                    detail={`${numberFormatter.format(data.summary.active_sites_count)} فعال`}
                />
                <MetricCard
                    icon="users"
                    label="کاربران پنل"
                    value={data.summary.users_count}
                    detail={`${numberFormatter.format(data.summary.active_users_count)} فعال`}
                />
                <MetricCard
                    icon="message"
                    label="کل گفتگوها"
                    value={data.summary.conversations_count}
                    detail={`${numberFormatter.format(data.summary.active_conversations)} باز`}
                />
                <MetricCard
                    icon="activity"
                    label="پیام‌های ماه"
                    value={data.summary.monthly_messages}
                    detail={`${numberFormatter.format(data.summary.messages_count)} پیام کل`}
                />
                <MetricCard
                    icon="attachment"
                    label="فایل‌های ارسالی"
                    value={data.summary.attachments_count}
                    detail="در تمام گفتگوها"
                />
                <MetricCard
                    icon="spark"
                    label="درخواست AI ماه"
                    value={data.ai_summary.requests_month}
                    detail={`${formatPercent(data.ai_summary.usable_rate_month)} پاسخ قابل استفاده`}
                />
            </section>

            <section className="sa-customer-detail-panel">
                <SectionHeader
                    eyebrow="Plan usage"
                    title="مصرف و محدودیت‌های پلن"
                    description="مقایسه مصرف فعلی مشتری با سقف پلن اختصاص‌یافته"
                />

                <div className="sa-customer-detail-usage-grid">
                    <UsageCard
                        icon="site"
                        label="تعداد سایت"
                        usage={data.usage.sites}
                    />
                    <UsageCard
                        icon="agent"
                        label="تعداد پشتیبان"
                        usage={data.usage.agents}
                    />
                    <UsageCard
                        icon="message"
                        label="گفتگوی ماهانه"
                        usage={data.usage.monthly_conversations}
                    />
                </div>

                <div className="sa-customer-detail-feature-list">
                    <FeaturePill
                        label="پیشنهاد AI"
                        enabled={data.plan_features.ai_suggestions_enabled}
                    />
                    <FeaturePill
                        label="پاسخ خودکار AI"
                        enabled={data.plan_features.ai_auto_reply_enabled}
                    />
                    <FeaturePill
                        label="پایگاه دانش"
                        enabled={data.plan_features.knowledge_base_enabled}
                    />
                </div>
            </section>

            <div className="sa-customer-detail-two-column">
                <section className="sa-customer-detail-panel">
                    <SectionHeader
                        eyebrow="AI performance"
                        title="عملکرد AI در ماه جاری"
                        description="کیفیت و نوع پاسخ‌های تولیدشده برای این مشتری"
                        action={
                            <button
                                className="sa-customer-detail-text-button"
                                type="button"
                                onClick={() => onGoToTab("activity")}
                            >
                                جزئیات فعالیت
                                <Icon name="arrow" />
                            </button>
                        }
                    />

                    <AiPerformance summary={data.ai_summary} />
                </section>

                <section className="sa-customer-detail-panel">
                    <SectionHeader
                        eyebrow="Conversation status"
                        title="وضعیت گفتگوها"
                        description="نمای کلی گفتگوهای باز و بسته مشتری"
                    />

                    <div className="sa-customer-detail-status-grid">
                        <StatusMetric
                            label="باز و در حال پیگیری"
                            value={data.summary.active_conversations}
                            tone="primary"
                        />
                        <StatusMetric
                            label="بسته‌شده"
                            value={data.summary.closed_conversations}
                            tone="success"
                        />
                        <StatusMetric
                            label="گفتگوی ماه"
                            value={data.summary.monthly_conversations}
                            tone="neutral"
                        />
                    </div>
                </section>
            </div>

            <RecentConversationsPanel
                conversations={data.recent_conversations}
                onViewAll={() => onGoToTab("activity")}
            />
        </div>
    );
}

function SitesTab({
                      sites,
                      updatingSiteId,
                      copiedSiteId,
                      onEdit,
                      onToggle,
                      onCopyKey,
                  }: {
    sites: Site[];
    updatingSiteId: number | null;
    copiedSiteId: number | null;
    onEdit: (site: Site) => void;
    onToggle: (site: Site) => void;
    onCopyKey: (site: Site) => void;
}) {
    return (
        <section className="sa-customer-detail-panel">
            <SectionHeader
                eyebrow="Connected sites"
                title="سایت‌های مشتری"
                description="تنظیمات ویجت، حالت AI، وضعیت اتصال و مصرف هر سایت"
                action={
                    <Link className="btn secondary" href="/super-admin/sites">
                        مدیریت همه سایت‌ها
                    </Link>
                }
            />

            {sites.length === 0 ? (
                <EmptyState
                    icon="site"
                    title="سایتی ثبت نشده است"
                    description="این مشتری هنوز سایت یا ویجت فعالی در پلتفرم ندارد."
                />
            ) : (
                <div className="sa-customer-detail-site-grid">
                    {sites.map((site) => (
                        <article
                            key={site.id}
                            className={`sa-customer-detail-site-card ${
                                site.is_active ? "" : "is-inactive"
                            }`}
                        >
                            <div className="sa-customer-detail-site-head">
                                <div
                                    className="sa-customer-detail-site-logo"
                                    style={
                                        {
                                            "--sa-site-color": normalizeColor(
                                                site.brand_color
                                            ),
                                        } as CSSProperties
                                    }
                                >
                                    {site.logo_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={site.logo_url} alt={site.name} />
                                    ) : (
                                        getInitial(site.brand_name || site.name)
                                    )}
                                </div>

                                <div className="sa-customer-detail-site-title">
                                    <h3>{site.name}</h3>
                                    <a
                                        href={toWebsiteUrl(site.domain)}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        {site.domain}
                                        <Icon name="globe" />
                                    </a>
                                </div>

                                <span
                                    className={`sa-customer-detail-badge ${
                                        site.is_active ? "is-success" : "is-danger"
                                    }`}
                                >
                                    {site.is_active ? "فعال" : "غیرفعال"}
                                </span>
                            </div>

                            <div className="sa-customer-detail-site-metrics">
                                <MiniStat
                                    label="کل گفتگو"
                                    value={site.conversations_count}
                                />
                                <MiniStat
                                    label="گفتگوی ماه"
                                    value={site.monthly_conversations}
                                />
                                <MiniStat
                                    label="حالت AI"
                                    value={aiModeLabels[site.ai_mode]}
                                    text
                                />
                            </div>

                            <div className="sa-customer-detail-site-key">
                                <div>
                                    <span>site_key</span>
                                    <code>{maskKey(site.site_key)}</code>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onCopyKey(site)}
                                    title="کپی site_key"
                                >
                                    <Icon
                                        name={copiedSiteId === site.id ? "check" : "copy"}
                                    />
                                    {copiedSiteId === site.id ? "کپی شد" : "کپی"}
                                </button>
                            </div>

                            <div className="sa-customer-detail-site-meta">
                                <span>
                                    <Icon name="clock" />
                                    آخرین فعالیت: {formatRelativeDate(site.last_activity_at)}
                                </span>
                                <span>
                                    <Icon name="spark" />
                                    برند: {site.brand_name || site.name}
                                </span>
                            </div>

                            <div className="sa-customer-detail-card-actions">
                                <button
                                    className="btn secondary"
                                    type="button"
                                    onClick={() => onEdit(site)}
                                >
                                    <Icon name="edit" />
                                    ویرایش تنظیمات
                                </button>

                                <button
                                    className={site.is_active ? "btn danger" : "btn"}
                                    type="button"
                                    disabled={updatingSiteId === site.id}
                                    onClick={() => onToggle(site)}
                                >
                                    <Icon name="power" />
                                    {updatingSiteId === site.id
                                        ? "در حال تغییر..."
                                        : site.is_active
                                            ? "غیرفعال‌کردن"
                                            : "فعال‌کردن"}
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}

function UsersTab({
                      users,
                      updatingUserId,
                      onToggle,
                      onPassword,
                  }: {
    users: UserItem[];
    updatingUserId: number | null;
    onToggle: (user: UserItem) => void;
    onPassword: (user: UserItem) => void;
}) {
    return (
        <section className="sa-customer-detail-panel">
            <SectionHeader
                eyebrow="Team access"
                title="کاربران پنل مشتری"
                description="مدیران و پشتیبان‌ها، وضعیت دسترسی و آخرین حضور آن‌ها"
            />

            {users.length === 0 ? (
                <EmptyState
                    icon="users"
                    title="کاربری ثبت نشده است"
                    description="برای این مشتری هنوز مدیر یا پشتیبانی ایجاد نشده است."
                />
            ) : (
                <div className="sa-customer-detail-user-list">
                    {users.map((targetUser) => (
                        <article
                            key={targetUser.id}
                            className={`sa-customer-detail-user-card ${
                                targetUser.is_active ? "" : "is-inactive"
                            }`}
                        >
                            <div className="sa-customer-detail-user-avatar">
                                {getInitial(targetUser.name)}
                                <span
                                    className={
                                        targetUser.availability_status === "online"
                                            ? "is-online"
                                            : ""
                                    }
                                />
                            </div>

                            <div className="sa-customer-detail-user-main">
                                <div className="sa-customer-detail-user-title">
                                    <div>
                                        <h3>{targetUser.name}</h3>
                                        <span>{roleLabels[targetUser.role]}</span>
                                    </div>

                                    <span
                                        className={`sa-customer-detail-badge ${
                                            targetUser.is_active
                                                ? "is-success"
                                                : "is-danger"
                                        }`}
                                    >
                                        {targetUser.is_active ? "فعال" : "غیرفعال"}
                                    </span>
                                </div>

                                <div className="sa-customer-detail-user-contact">
                                    <span dir="ltr">
                                        <Icon name="mail" />
                                        {targetUser.email}
                                    </span>
                                    <span dir="ltr">
                                        <Icon name="phone" />
                                        {targetUser.phone || "بدون شماره"}
                                    </span>
                                </div>

                                <div className="sa-customer-detail-user-meta">
                                    <span>
                                        آخرین ورود: {formatDate(targetUser.last_login_at)}
                                    </span>
                                    <span>
                                        آخرین حضور: {formatRelativeDate(targetUser.last_seen_at)}
                                    </span>
                                </div>
                            </div>

                            <div className="sa-customer-detail-user-actions">
                                <button
                                    className="btn secondary"
                                    type="button"
                                    onClick={() => onPassword(targetUser)}
                                >
                                    <Icon name="key" />
                                    تغییر رمز
                                </button>

                                <button
                                    className={targetUser.is_active ? "btn danger" : "btn"}
                                    type="button"
                                    disabled={updatingUserId === targetUser.id}
                                    onClick={() => onToggle(targetUser)}
                                >
                                    <Icon name="power" />
                                    {updatingUserId === targetUser.id
                                        ? "در حال تغییر..."
                                        : targetUser.is_active
                                            ? "غیرفعال"
                                            : "فعال"}
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}

function ActivityTab({
                         conversations,
                         aiSummary,
                     }: {
    conversations: RecentConversation[];
    aiSummary: AiSummary;
}) {
    return (
        <div className="sa-customer-detail-stack">
            <section className="sa-customer-detail-panel">
                <SectionHeader
                    eyebrow="AI analytics"
                    title="جزئیات عملکرد AI"
                    description="آمار پاسخ‌های ماه جاری و کیفیت پاسخ‌گویی دانش‌محور"
                />
                <AiPerformance summary={aiSummary} expanded />
            </section>

            <RecentConversationsPanel conversations={conversations} />
        </div>
    );
}

function ManagementCard({
                            data,
                            selectedStatus,
                            selectedPlanId,
                            savingAction,
                            onStatusChange,
                            onPlanChange,
                            onSaveStatus,
                            onSavePlan,
                        }: {
    data: CustomerDetailResponse;
    selectedStatus: TenantStatus;
    selectedPlanId: string;
    savingAction: "status" | "plan" | null;
    onStatusChange: (status: TenantStatus) => void;
    onPlanChange: (planId: string) => void;
    onSaveStatus: () => void;
    onSavePlan: () => void;
}) {
    const statusChanged = selectedStatus !== data.tenant.status;
    const planChanged = Number(selectedPlanId) !== data.tenant.plan_id;

    return (
        <section className="sa-customer-detail-side-card">
            <div className="sa-customer-detail-side-title">
                <Icon name="settings" />
                <div>
                    <h3>مدیریت حساب</h3>
                    <p>تغییرات حساس مشتری</p>
                </div>
            </div>

            <div className="sa-customer-detail-control-group">
                <label htmlFor="customer-status">وضعیت حساب</label>
                <select
                    id="customer-status"
                    className="input"
                    value={selectedStatus}
                    onChange={(event) =>
                        onStatusChange(event.target.value as TenantStatus)
                    }
                >
                    <option value="active">فعال</option>
                    <option value="inactive">غیرفعال</option>
                    <option value="suspended">تعلیق‌شده</option>
                </select>
                <button
                    className={selectedStatus === "active" ? "btn" : "btn danger"}
                    type="button"
                    disabled={!statusChanged || savingAction !== null}
                    onClick={onSaveStatus}
                >
                    <Icon name="power" />
                    {savingAction === "status" ? "در حال ذخیره..." : "ذخیره وضعیت"}
                </button>
            </div>

            <div className="sa-customer-detail-control-divider" />

            <div className="sa-customer-detail-control-group">
                <label htmlFor="customer-plan">پلن مشتری</label>
                <select
                    id="customer-plan"
                    className="input"
                    value={selectedPlanId}
                    onChange={(event) => onPlanChange(event.target.value)}
                >
                    <option value="">انتخاب پلن</option>
                    {data.plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                            {plan.name} — {formatMoney(plan.price_monthly)}
                        </option>
                    ))}
                </select>
                <button
                    className="btn"
                    type="button"
                    disabled={!selectedPlanId || !planChanged || savingAction !== null}
                    onClick={onSavePlan}
                >
                    <Icon name="check" />
                    {savingAction === "plan" ? "در حال ذخیره..." : "اعمال پلن"}
                </button>
            </div>

            <div className="sa-customer-detail-sensitive-note">
                <Icon name="warning" />
                <p>
                    غیرفعال یا تعلیق‌کردن مشتری، دسترسی کاربران و پاسخ‌گویی ویجت را
                    محدود می‌کند؛ اطلاعات حذف نمی‌شوند.
                </p>
            </div>
        </section>
    );
}

function AccountInfoCard({ tenant }: { tenant: Tenant }) {
    return (
        <section className="sa-customer-detail-side-card">
            <div className="sa-customer-detail-side-title">
                <Icon name="building" />
                <div>
                    <h3>اطلاعات حساب</h3>
                    <p>خلاصه مشخصات و پلن</p>
                </div>
            </div>

            <div className="sa-customer-detail-info-list">
                <InfoRow label="شناسه" value={`#${tenant.id}`} />
                <InfoRow label="پلن" value={tenant.plan_name || "بدون پلن"} />
                <InfoRow
                    label="هزینه ماهانه"
                    value={
                        tenant.price_monthly === null
                            ? "—"
                            : formatMoney(tenant.price_monthly)
                    }
                />
                <InfoRow label="ایجاد حساب" value={formatDate(tenant.created_at)} />
                <InfoRow
                    label="آخرین تغییر"
                    value={formatDate(tenant.updated_at)}
                />
                <InfoRow
                    label="آخرین فعالیت"
                    value={formatRelativeDate(tenant.last_activity_at)}
                />
            </div>

            {tenant.plan_description && (
                <p className="sa-customer-detail-plan-description">
                    {tenant.plan_description}
                </p>
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
    onChange: (field: keyof SiteForm, value: string) => void;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
    return (
        <div className="sa-customer-detail-modal-backdrop" role="presentation">
            <div
                className="sa-customer-detail-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="site-editor-title"
            >
                <div className="sa-customer-detail-modal-head">
                    <div>
                        <span>Site settings</span>
                        <h2 id="site-editor-title">ویرایش {site.name}</h2>
                        <p>اطلاعات سایت و ظاهر پایه ویجت را مدیریت کن.</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="بستن">
                        <Icon name="close" />
                    </button>
                </div>

                <form className="sa-customer-detail-modal-form" onSubmit={onSubmit}>
                    <div className="sa-customer-detail-form-grid">
                        <FormField label="نام سایت">
                            <input
                                className="input"
                                value={form.name}
                                maxLength={255}
                                onChange={(event) => onChange("name", event.target.value)}
                            />
                        </FormField>

                        <FormField label="دامنه">
                            <input
                                className="input"
                                value={form.domain}
                                maxLength={255}
                                dir="ltr"
                                onChange={(event) => onChange("domain", event.target.value)}
                            />
                        </FormField>

                        <FormField label="نام برند">
                            <input
                                className="input"
                                value={form.brand_name}
                                maxLength={255}
                                onChange={(event) =>
                                    onChange("brand_name", event.target.value)
                                }
                            />
                        </FormField>

                        <FormField label="رنگ برند">
                            <div className="sa-customer-detail-color-field">
                                <input
                                    type="color"
                                    value={normalizeColor(form.brand_color)}
                                    onChange={(event) =>
                                        onChange("brand_color", event.target.value)
                                    }
                                />
                                <input
                                    className="input"
                                    value={form.brand_color}
                                    dir="ltr"
                                    maxLength={7}
                                    onChange={(event) =>
                                        onChange("brand_color", event.target.value)
                                    }
                                />
                            </div>
                        </FormField>

                        <FormField label="آدرس لوگو">
                            <input
                                className="input"
                                value={form.logo_url}
                                dir="ltr"
                                placeholder="https://example.com/logo.png"
                                onChange={(event) =>
                                    onChange("logo_url", event.target.value)
                                }
                            />
                        </FormField>

                        <FormField label="حالت AI">
                            <select
                                className="input"
                                value={form.ai_mode}
                                onChange={(event) =>
                                    onChange("ai_mode", event.target.value)
                                }
                            >
                                <option value="off">خاموش</option>
                                <option value="assistant">کمک‌یار پشتیبان</option>
                                <option value="semi_auto">نیمه‌خودکار</option>
                            </select>
                        </FormField>
                    </div>

                    <FormField
                        label="پیام خوش‌آمدگویی"
                        hint={`${numberFormatter.format(form.welcome_message.length)} / ۳۰۰`}
                    >
                        <textarea
                            className="textarea"
                            value={form.welcome_message}
                            maxLength={300}
                            onChange={(event) =>
                                onChange("welcome_message", event.target.value)
                            }
                        />
                    </FormField>

                    <div className="sa-customer-detail-modal-actions">
                        <button className="btn" type="submit" disabled={saving}>
                            <Icon name="check" />
                            {saving ? "در حال ذخیره..." : "ذخیره تنظیمات"}
                        </button>
                        <button
                            className="btn secondary"
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                        >
                            انصراف
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function PasswordModal({
                           user,
                           password,
                           saving,
                           onPasswordChange,
                           onClose,
                           onSubmit,
                       }: {
    user: UserItem;
    password: string;
    saving: boolean;
    onPasswordChange: (password: string) => void;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
    return (
        <div className="sa-customer-detail-modal-backdrop" role="presentation">
            <div
                className="sa-customer-detail-modal is-small"
                role="dialog"
                aria-modal="true"
                aria-labelledby="password-modal-title"
            >
                <div className="sa-customer-detail-modal-head">
                    <div>
                        <span>Security action</span>
                        <h2 id="password-modal-title">تغییر رمز {user.name}</h2>
                        <p>پس از تغییر رمز، تمام نشست‌های قبلی کاربر لغو می‌شوند.</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="بستن">
                        <Icon name="close" />
                    </button>
                </div>

                <form className="sa-customer-detail-modal-form" onSubmit={onSubmit}>
                    <FormField label="رمز عبور جدید" hint="حداقل ۸ کاراکتر">
                        <div className="sa-customer-detail-password-field">
                            <Icon name="lock" />
                            <input
                                className="input"
                                type="password"
                                value={password}
                                minLength={8}
                                maxLength={128}
                                autoComplete="new-password"
                                placeholder="رمز امن جدید"
                                onChange={(event) =>
                                    onPasswordChange(event.target.value)
                                }
                            />
                        </div>
                    </FormField>

                    <div className="sa-customer-detail-modal-actions">
                        <button className="btn" type="submit" disabled={saving}>
                            <Icon name="key" />
                            {saving ? "در حال ذخیره..." : "تغییر رمز و لغو نشست‌ها"}
                        </button>
                        <button
                            className="btn secondary"
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                        >
                            انصراف
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function RecentConversationsPanel({
                                      conversations,
                                      onViewAll,
                                  }: {
    conversations: RecentConversation[];
    onViewAll?: () => void;
}) {
    return (
        <section className="sa-customer-detail-panel">
            <SectionHeader
                eyebrow="Recent conversations"
                title="آخرین گفتگوها"
                description="آخرین فعالیت کاربران نهایی در سایت‌های این مشتری"
                action={
                    onViewAll ? (
                        <button
                            className="sa-customer-detail-text-button"
                            type="button"
                            onClick={onViewAll}
                        >
                            مشاهده همه این بخش
                            <Icon name="arrow" />
                        </button>
                    ) : undefined
                }
            />

            {conversations.length === 0 ? (
                <EmptyState
                    icon="message"
                    title="گفتگویی ثبت نشده است"
                    description="فعالیت گفتگوهای این مشتری پس از دریافت اولین پیام نمایش داده می‌شود."
                />
            ) : (
                <div className="sa-customer-detail-conversation-list">
                    {conversations.map((conversation) => (
                        <article
                            key={conversation.id}
                            className="sa-customer-detail-conversation-row"
                        >
                            <div className="sa-customer-detail-conversation-icon">
                                <Icon name="message" />
                            </div>

                            <div className="sa-customer-detail-conversation-main">
                                <div className="sa-customer-detail-conversation-title">
                                    <strong>
                                        {conversation.visitor_name || "بازدیدکننده ناشناس"}
                                    </strong>
                                    <span>
                                        #{numberFormatter.format(conversation.id)}
                                    </span>
                                </div>
                                <p>
                                    {conversation.source_page_title || "بدون عنوان صفحه"} · {" "}
                                    {conversation.site_name}
                                </p>
                                <div>
                                    <span>
                                        {numberFormatter.format(
                                            conversation.messages_count
                                        )} پیام
                                    </span>
                                    <span>
                                        {formatRelativeDate(
                                            conversation.last_message_at ||
                                            conversation.created_at
                                        )}
                                    </span>
                                </div>
                            </div>

                            <span
                                className={`sa-customer-detail-conversation-status is-${conversation.status}`}
                            >
                                {conversationStatusLabels[conversation.status] ||
                                    conversation.status}
                            </span>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}

function AiPerformance({
                           summary,
                           expanded = false,
                       }: {
    summary: AiSummary;
    expanded?: boolean;
}) {
    const items = [
        {
            label: "پیشنهاد پشتیبان",
            value: summary.suggestions_month,
            tone: "primary",
        },
        {
            label: "پاسخ خودکار",
            value: summary.auto_replies_month,
            tone: "success",
        },
        {
            label: "Fallback",
            value: summary.fallbacks_month,
            tone: "warning",
        },
        {
            label: "بدون پاسخ",
            value: summary.no_answers_month,
            tone: "danger",
        },
    ];

    return (
        <div className={`sa-customer-detail-ai ${expanded ? "is-expanded" : ""}`}>
            <div className="sa-customer-detail-ai-score">
                <div
                    className="sa-customer-detail-ai-ring"
                    style={
                        {
                            "--sa-ai-score": `${Math.min(
                                Math.max(summary.usable_rate_month, 0),
                                100
                            ) * 3.6}deg`,
                        } as CSSProperties
                    }
                >
                    <span>{formatPercent(summary.usable_rate_month)}</span>
                </div>
                <div>
                    <strong>نرخ پاسخ قابل استفاده</strong>
                    <p>
                        میانگین اطمینان: {formatPercent(summary.average_confidence_month)}
                    </p>
                </div>
            </div>

            <div className="sa-customer-detail-ai-grid">
                {items.map((item) => (
                    <div key={item.label} className={`is-${item.tone}`}>
                        <span>{item.label}</span>
                        <strong>{numberFormatter.format(item.value)}</strong>
                    </div>
                ))}
            </div>

            {expanded && (
                <div className="sa-customer-detail-ai-footer">
                    <InfoRow
                        label="کل درخواست‌های ثبت‌شده"
                        value={numberFormatter.format(summary.requests_total)}
                    />
                    <InfoRow
                        label="درخواست‌های ماه جاری"
                        value={numberFormatter.format(summary.requests_month)}
                    />
                    <InfoRow
                        label="آخرین فعالیت AI"
                        value={formatRelativeDate(summary.last_activity_at)}
                    />
                </div>
            )}
        </div>
    );
}

function UsageCard({
                       icon,
                       label,
                       usage,
                   }: {
    icon: IconName;
    label: string;
    usage: UsageItem;
}) {
    const tone = usage.is_over_limit
        ? "is-danger"
        : usage.is_near_limit
            ? "is-warning"
            : "is-normal";

    return (
        <article className={`sa-customer-detail-usage-card ${tone}`}>
            <div className="sa-customer-detail-usage-head">
                <span>
                    <Icon name={icon} />
                </span>
                <div>
                    <strong>{label}</strong>
                    <p>
                        {numberFormatter.format(usage.used)} از {" "}
                        {usage.is_unlimited || usage.limit === null
                            ? "نامحدود"
                            : numberFormatter.format(usage.limit)}
                    </p>
                </div>
            </div>

            <div className="sa-customer-detail-progress">
                <span
                    style={
                        {
                            "--sa-progress": `${Math.min(
                                Math.max(usage.percent, 0),
                                100
                            )}%`,
                        } as CSSProperties
                    }
                />
            </div>

            <div className="sa-customer-detail-usage-foot">
                <b>{usage.is_unlimited ? "نامحدود" : formatPercent(usage.percent)}</b>
                <span>
                    {usage.is_over_limit
                        ? "بیشتر از سقف پلن"
                        : usage.is_near_limit
                            ? "نزدیک سقف پلن"
                            : "وضعیت عادی"}
                </span>
            </div>
        </article>
    );
}

function MetricCard({
                        icon,
                        label,
                        value,
                        detail,
                    }: {
    icon: IconName;
    label: string;
    value: number;
    detail: string;
}) {
    return (
        <article className="sa-customer-detail-metric-card">
            <div className="sa-customer-detail-metric-icon">
                <Icon name={icon} />
            </div>
            <div>
                <span>{label}</span>
                <strong>{numberFormatter.format(value)}</strong>
                <p>{detail}</p>
            </div>
        </article>
    );
}

function SectionHeader({
                           eyebrow,
                           title,
                           description,
                           action,
                       }: {
    eyebrow: string;
    title: string;
    description: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="sa-customer-detail-section-head">
            <div>
                <span>{eyebrow}</span>
                <h2>{title}</h2>
                <p>{description}</p>
            </div>
            {action}
        </div>
    );
}

function FeaturePill({ label, enabled }: { label: string; enabled: boolean }) {
    return (
        <span className={enabled ? "is-enabled" : "is-disabled"}>
            <Icon name={enabled ? "check" : "close"} />
            {label}
        </span>
    );
}

function StatusMetric({
                          label,
                          value,
                          tone,
                      }: {
    label: string;
    value: number;
    tone: "primary" | "success" | "neutral";
}) {
    return (
        <div className={`is-${tone}`}>
            <span>{label}</span>
            <strong>{numberFormatter.format(value)}</strong>
        </div>
    );
}

function HeroStat({
                      label,
                      value,
                      compact = false,
                  }: {
    label: string;
    value: string | number;
    compact?: boolean;
}) {
    return (
        <div className={compact ? "is-compact" : ""}>
            <span>{label}</span>
            <strong>
                {typeof value === "number" ? numberFormatter.format(value) : value}
            </strong>
        </div>
    );
}

function MiniStat({
                      label,
                      value,
                      text = false,
                  }: {
    label: string;
    value: string | number;
    text?: boolean;
}) {
    return (
        <div>
            <span>{label}</span>
            <strong className={text ? "is-text" : ""}>
                {typeof value === "number" ? numberFormatter.format(value) : value}
            </strong>
        </div>
    );
}

function StatusBadge({ status }: { status: TenantStatus }) {
    return (
        <span
            className={`sa-customer-detail-badge ${
                status === "active"
                    ? "is-success"
                    : status === "suspended"
                        ? "is-warning"
                        : "is-danger"
            }`}
        >
            {statusLabels[status]}
        </span>
    );
}

function ContactItem({
                         icon,
                         value,
                         ltr = false,
                     }: {
    icon: IconName;
    value: string;
    ltr?: boolean;
}) {
    return (
        <span dir={ltr ? "ltr" : undefined}>
            <Icon name={icon} />
            {value}
        </span>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <span>{label}</span>
            <strong>{value}</strong>
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
    children: React.ReactNode;
}) {
    return (
        <label className="sa-customer-detail-form-field">
            <span>
                <b>{label}</b>
                {hint && <small>{hint}</small>}
            </span>
            {children}
        </label>
    );
}

function EmptyState({
                        icon,
                        title,
                        description,
                    }: {
    icon: IconName;
    title: string;
    description: string;
}) {
    return (
        <div className="sa-customer-detail-empty">
            <span>
                <Icon name={icon} />
            </span>
            <h3>{title}</h3>
            <p>{description}</p>
        </div>
    );
}

function CustomerDetailSkeleton() {
    return (
        <div className="sa-customer-detail-skeleton" aria-label="در حال بارگذاری">
            <div className="sa-customer-detail-skeleton-hero" />
            <div className="sa-customer-detail-skeleton-tabs" />
            <div className="sa-customer-detail-skeleton-layout">
                <div>
                    <div className="sa-customer-detail-skeleton-grid">
                        {[1, 2, 3, 4, 5, 6].map((item) => (
                            <span key={item} />
                        ))}
                    </div>
                    <div className="sa-customer-detail-skeleton-panel" />
                </div>
                <div className="sa-customer-detail-skeleton-side" />
            </div>
        </div>
    );
}

function Icon({ name }: { name: IconName }) {
    const paths: Record<IconName, React.ReactNode> = {
        arrow: <path d="M15 18l-6-6 6-6" />,
        refresh: (
            <>
                <path d="M20 11a8 8 0 10-2.34 5.66" />
                <path d="M20 4v7h-7" />
            </>
        ),
        building: (
            <>
                <path d="M4 21V7l8-4 8 4v14" />
                <path d="M9 21v-4h6v4M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01" />
            </>
        ),
        site: (
            <>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
            </>
        ),
        users: (
            <>
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </>
        ),
        agent: (
            <>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0116 0M18 8h3v5h-3M6 8H3v5h3" />
            </>
        ),
        message: (
            <>
                <path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z" />
                <path d="M8 9h8M8 13h5" />
            </>
        ),
        attachment: (
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
        ),
        activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
        spark: (
            <>
                <path d="M12 3l1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3z" />
                <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8zM5 14l.6 1.4L7 16l-1.4.6L5 18l-.6-1.4L3 16l1.4-.6z" />
            </>
        ),
        settings: (
            <>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06-2.83 2.83-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21h-4v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06-2.83-2.83.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3v-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06 2.83-2.83.06.06A1.65 1.65 0 008.92 4a1.65 1.65 0 001-1.51V2h4v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06 2.83 2.83-.06.06A1.65 1.65 0 0019.4 9c.12.61.65 1.06 1.27 1.09H21v4h-.09A1.65 1.65 0 0019.4 15z" />
            </>
        ),
        edit: (
            <>
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
            </>
        ),
        power: (
            <>
                <path d="M18.36 6.64a9 9 0 11-12.73 0" />
                <path d="M12 2v10" />
            </>
        ),
        key: (
            <>
                <circle cx="7.5" cy="15.5" r="4.5" />
                <path d="M11 12l9-9M15 8l3 3M17 6l3 3" />
            </>
        ),
        copy: (
            <>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </>
        ),
        close: <path d="M18 6L6 18M6 6l12 12" />,
        check: <path d="M20 6L9 17l-5-5" />,
        warning: (
            <>
                <path d="M10.3 3.7L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.7a2 2 0 00-3.4 0z" />
                <path d="M12 9v4M12 17h.01" />
            </>
        ),
        clock: (
            <>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
            </>
        ),
        mail: (
            <>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 7l9 6 9-6" />
            </>
        ),
        phone: <path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.8 19.8 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.69 2.8a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.28-1.28a2 2 0 012.11-.45c.9.33 1.84.56 2.8.69A2 2 0 0122 16.92z" />,
        globe: (
            <>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a15 15 0 010 18" />
            </>
        ),
        lock: (
            <>
                <rect x="4" y="10" width="16" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 018 0v3" />
            </>
        ),
    };

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
            {paths[name]}
        </svg>
    );
}

function createEmptySiteForm(): SiteForm {
    return {
        name: "",
        domain: "",
        brand_name: "",
        brand_color: "#2563eb",
        logo_url: "",
        welcome_message: "",
        ai_mode: "assistant",
    };
}

function normalizeColor(color?: string | null): string {
    return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#2563eb";
}

function getInitial(value: string): string {
    return value.trim().charAt(0).toUpperCase() || "م";
}

function maskKey(value: string): string {
    if (value.length <= 12) {
        return value;
    }

    return `${value.slice(0, 6)}••••••${value.slice(-5)}`;
}

function toWebsiteUrl(domain: string): string {
    return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

function formatMoney(value: number): string {
    return `${currencyFormatter.format(value)} تومان`;
}

function formatPercent(value: number): string {
    return `${new Intl.NumberFormat("fa-IR", {
        maximumFractionDigits: 1,
    }).format(value)}٪`;
}

function formatDate(value: string | null): string {
    if (!value) {
        return "—";
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

function formatRelativeDate(value: string | null): string {
    if (!value) {
        return "بدون فعالیت";
    }

    const date = new Date(value.replace(" ", "T"));

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000);
    const absoluteMinutes = Math.abs(diffMinutes);

    if (absoluteMinutes < 1) {
        return "همین حالا";
    }

    const formatter = new Intl.RelativeTimeFormat("fa-IR", { numeric: "auto" });

    if (absoluteMinutes < 60) {
        return formatter.format(diffMinutes, "minute");
    }

    const diffHours = Math.round(diffMinutes / 60);

    if (Math.abs(diffHours) < 24) {
        return formatter.format(diffHours, "hour");
    }

    const diffDays = Math.round(diffHours / 24);

    if (Math.abs(diffDays) < 30) {
        return formatter.format(diffDays, "day");
    }

    return formatDate(value);
}
