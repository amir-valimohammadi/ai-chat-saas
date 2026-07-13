// مسیر فایل: ai-chat-saas/frontend/app/team/page.tsx
// هدف: صفحه حرفه‌ای مدیریت تیم پشتیبانی مشتری

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type Member = {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    is_active: boolean;
    last_login_at: string | null;
    created_at: string;
    site_ids: number[];
    site_names: string[];
};

type PlanUsageData = {
    plan: {
        name: string | null;
        limits: {
            max_agents: number;
        };
    };
    usage: {
        agents: {
            used: number;
            limit: number;
            remaining: number;
            percent: number;
        };
    };
};

type Site = {
    id: number;
    name: string;
    domain: string;
};

const roleLabels: Record<string, string> = {
    customer_admin: "مدیر مشتری",
    agent: "پشتیبان",
    super_admin: "سوپر ادمین",
};

export default function TeamPage() {
    const router = useRouter();

    const [members, setMembers] = useState<Member[]>([]);
    const [sites, setSites] = useState<Site[]>([]);

    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");

    const [form, setForm] = useState({
        name: "",
        email: "",
        phone: "",
        password: "",
        site_ids: [] as number[],
    });

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [planUsage, setPlanUsage] = useState<PlanUsageData | null>(null);

    const agentUsage = planUsage?.usage.agents;

    const isAgentLimitReached = agentUsage
        ? agentUsage.limit > 0 && agentUsage.used >= agentUsage.limit
        : false;

    const stats = useMemo(() => {
        return {
            total: members.length,
            agents: members.filter((member) => member.role === "agent").length,
            admins: members.filter((member) => member.role === "customer_admin").length,
            active: members.filter((member) => member.is_active).length,
            inactive: members.filter((member) => !member.is_active).length,
        };
    }, [members]);

    const filteredMembers = useMemo(() => {
        const q = search.trim().toLowerCase();

        return members.filter((member) => {
            const matchesSearch =
                !q ||
                [
                    member.name,
                    member.email,
                    member.phone,
                    member.role,
                    roleLabels[member.role],
                    member.is_active ? "active" : "inactive",
                    member.site_names.join(" "),
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase()
                    .includes(q);

            const matchesRole = roleFilter === "all" || member.role === roleFilter;

            const matchesStatus =
                statusFilter === "all" ||
                (statusFilter === "active" && member.is_active) ||
                (statusFilter === "inactive" && !member.is_active);

            return matchesSearch && matchesRole && matchesStatus;
        });
    }, [members, search, roleFilter, statusFilter]);

    const selectedSitesCount = form.site_ids.length;

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

        loadPageData();
    }, [router]);

    async function loadPageData(silent = false) {
        try {
            setError("");

            if (silent) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            await Promise.all([loadData(), loadPlanUsage()]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت اطلاعات تیم");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    async function loadData() {
        const [teamData, sitesData] = await Promise.all([
            apiRequest("/customer/team-list.php"),
            apiRequest("/customer/sites-list.php"),
        ]);

        setMembers(teamData.members || []);
        setSites(sitesData.sites || []);
    }

    async function loadPlanUsage() {
        try {
            const data = await apiRequest("/customer/plan-usage.php");
            setPlanUsage(data);
        } catch {
            // اگر پلن لود نشد، صفحه تیم نباید خراب شود.
        }
    }

    function updateField(field: string, value: string) {
        setForm((prev) => ({ ...prev, [field]: value }));
    }

    function toggleSite(siteId: number) {
        setForm((prev) => {
            const exists = prev.site_ids.includes(siteId);

            return {
                ...prev,
                site_ids: exists
                    ? prev.site_ids.filter((id) => id !== siteId)
                    : [...prev.site_ids, siteId],
            };
        });
    }

    function resetForm() {
        setForm({
            name: "",
            email: "",
            phone: "",
            password: "",
            site_ids: [],
        });
    }

    async function handleCreateAgent(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (isAgentLimitReached) {
            setError("تعداد پشتیبان‌های مجاز در پلن فعلی شما تکمیل شده است.");
            return;
        }

        if (!form.name.trim()) {
            setError("نام پشتیبان الزامی است.");
            return;
        }

        if (!form.email.trim()) {
            setError("ایمیل ورود الزامی است.");
            return;
        }

        if (form.password.trim().length < 8) {
            setError("رمز عبور باید حداقل ۸ کاراکتر باشد.");
            return;
        }

        setCreating(true);
        setError("");
        setSuccess("");

        try {
            await apiRequest("/customer/team-create.php", {
                method: "POST",
                body: JSON.stringify({
                    ...form,
                    name: form.name.trim(),
                    email: form.email.trim(),
                    phone: form.phone.trim(),
                    password: form.password,
                }),
            });

            setSuccess("پشتیبان جدید با موفقیت ساخته شد.");
            resetForm();

            await loadPageData(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ساخت پشتیبان ناموفق بود");
        } finally {
            setCreating(false);
        }
    }

    return (
        <AppShell
            title="تیم پشتیبانی"
            kicker="Support Team"
            description="مدیریت اعضای تیم، ظرفیت پلن، دسترسی سایت‌ها و ساخت حساب پشتیبان جدید"
            actions={
                <button
                    className="btn secondary"
                    type="button"
                    onClick={() => loadPageData(true)}
                    disabled={refreshing || loading}
                >
                    {refreshing ? "در حال بروزرسانی..." : "بروزرسانی"}
                </button>
            }
        >
            <div className="team-shell">
                {error && <div className="error">{error}</div>}
                {success && <div className="success">{success}</div>}

                <section className="team-hero-card">
                    <div className="team-hero-copy">
                        <span className="team-eyebrow">Team Operations</span>

                        <h2>تیم پشتیبانی را مثل یک سیستم عملیاتی مدیریت کن</h2>

                        <p>
                            اعضای تیم، نقش‌ها، وضعیت فعال بودن، دسترسی به سایت‌ها و ظرفیت
                            پشتیبان‌های مجاز در پلن را از همین صفحه کنترل کن.
                        </p>
                    </div>

                    <PlanUsageCard
                        planUsage={planUsage}
                        isAgentLimitReached={isAgentLimitReached}
                    />
                </section>

                <section className="team-stat-grid">
                    <TeamStatCard label="کل اعضا" value={stats.total} hint="همه اعضای ثبت‌شده" />
                    <TeamStatCard label="پشتیبان‌ها" value={stats.agents} hint="حساب‌های agent" tone="primary" />
                    <TeamStatCard label="مدیران مشتری" value={stats.admins} hint="دسترسی مدیریتی" />
                    <TeamStatCard label="فعال" value={stats.active} hint="اعضای قابل استفاده" tone="success" />
                    <TeamStatCard label="غیرفعال" value={stats.inactive} hint="اعضای غیرفعال" tone="warning" />
                </section>

                {loading ? (
                    <section className="team-loading-card">
                        در حال بارگذاری تیم...
                    </section>
                ) : (
                    <div className="team-layout">
                        <main className="team-members-panel">
                            <div className="team-panel-head">
                                <div>
                                    <span className="team-section-kicker">Members</span>
                                    <h2>اعضای تیم</h2>
                                    <p>
                                        {filteredMembers.length} عضو نمایش داده می‌شود از مجموع{" "}
                                        {members.length} عضو.
                                    </p>
                                </div>
                            </div>

                            <div className="team-toolbar">
                                <div className="team-search">
                                    <span>جستجو</span>
                                    <input
                                        className="input"
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder="نام، ایمیل، شماره، نقش یا سایت..."
                                    />
                                </div>

                                <div className="team-filter">
                                    <span>نقش</span>
                                    <select
                                        className="input"
                                        value={roleFilter}
                                        onChange={(event) => setRoleFilter(event.target.value)}
                                    >
                                        <option value="all">همه نقش‌ها</option>
                                        <option value="customer_admin">مدیر مشتری</option>
                                        <option value="agent">پشتیبان</option>
                                    </select>
                                </div>

                                <div className="team-filter">
                                    <span>وضعیت</span>
                                    <select
                                        className="input"
                                        value={statusFilter}
                                        onChange={(event) => setStatusFilter(event.target.value)}
                                    >
                                        <option value="all">همه وضعیت‌ها</option>
                                        <option value="active">فعال</option>
                                        <option value="inactive">غیرفعال</option>
                                    </select>
                                </div>
                            </div>

                            {members.length === 0 ? (
                                <TeamEmptyState
                                    title="هنوز عضوی ثبت نشده است"
                                    text="اولین پشتیبان را از فرم سمت چپ بساز."
                                />
                            ) : filteredMembers.length === 0 ? (
                                <TeamEmptyState
                                    title="عضوی پیدا نشد"
                                    text="عبارت جستجو یا فیلترها را تغییر بده."
                                />
                            ) : (
                                <div className="team-member-grid">
                                    {filteredMembers.map((member) => (
                                        <article key={member.id} className="team-member-card">
                                            <div className="team-member-top">
                                                <TeamAvatar name={member.name} />

                                                <div className="team-member-main">
                                                    <strong>{member.name}</strong>
                                                    <span>{member.email}</span>
                                                </div>

                                                <div className="team-member-badges">
                                                    <b>{roleLabels[member.role] || member.role}</b>
                                                    <b className={member.is_active ? "active" : "inactive"}>
                                                        {member.is_active ? "active" : "inactive"}
                                                    </b>
                                                </div>
                                            </div>

                                            <div className="team-member-meta">
                                                <InfoRow label="شماره" value={member.phone || "-"} />
                                                <InfoRow label="آخرین ورود" value={member.last_login_at || "-"} />
                                                <InfoRow label="تاریخ ساخت" value={member.created_at} />
                                            </div>

                                            <div className="team-sites-box">
                                                <span>دسترسی سایت‌ها</span>

                                                {member.site_names.length > 0 ? (
                                                    <div>
                                                        {member.site_names.map((siteName) => (
                                                            <b key={siteName}>{siteName}</b>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p>سایتی ثبت نشده است.</p>
                                                )}
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </main>

                        <aside className="team-create-panel">
                            <div className="team-panel-head">
                                <div>
                                    <span className="team-section-kicker">Create</span>
                                    <h2>ساخت پشتیبان جدید</h2>
                                    <p>
                                        پشتیبان جدید بساز و مشخص کن به کدام سایت‌ها دسترسی داشته باشد.
                                    </p>
                                </div>
                            </div>

                            {isAgentLimitReached && (
                                <div className="team-limit-warning">
                                    ظرفیت پشتیبان‌های مجاز در پلن فعلی تکمیل شده است.
                                </div>
                            )}

                            <form onSubmit={handleCreateAgent} className="team-create-form">
                                <label className="grid">
                                    <span>نام پشتیبان</span>
                                    <input
                                        className="input"
                                        value={form.name}
                                        onChange={(event) => updateField("name", event.target.value)}
                                        placeholder="مثلاً پشتیبان فروش"
                                    />
                                </label>

                                <label className="grid">
                                    <span>ایمیل ورود</span>
                                    <input
                                        className="input"
                                        type="email"
                                        value={form.email}
                                        onChange={(event) => updateField("email", event.target.value)}
                                        placeholder="support@example.com"
                                    />
                                </label>

                                <div className="team-form-two-col">
                                    <label className="grid">
                                        <span>شماره تماس</span>
                                        <input
                                            className="input"
                                            value={form.phone}
                                            onChange={(event) => updateField("phone", event.target.value)}
                                            placeholder="اختیاری"
                                        />
                                    </label>

                                    <label className="grid">
                                        <span>رمز عبور</span>
                                        <input
                                            className="input"
                                            type="password"
                                            value={form.password}
                                            onChange={(event) =>
                                                updateField("password", event.target.value)
                                            }
                                            placeholder="حداقل ۸ کاراکتر"
                                        />
                                    </label>
                                </div>

                                <div className="team-sites-select">
                                    <div className="team-sites-select-head">
                                        <strong>دسترسی به سایت‌ها</strong>
                                        <span>{selectedSitesCount} انتخاب‌شده</span>
                                    </div>

                                    {sites.length === 0 ? (
                                        <p className="muted">سایتی برای انتخاب وجود ندارد.</p>
                                    ) : (
                                        <div className="team-site-check-list">
                                            {sites.map((site) => {
                                                const checked = form.site_ids.includes(site.id);

                                                return (
                                                    <label
                                                        key={site.id}
                                                        className={checked ? "checked" : ""}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => toggleSite(site.id)}
                                                        />

                                                        <span>
                                                            <strong>{site.name}</strong>
                                                            <small>{site.domain}</small>
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <p className="team-help-text">
                                        اگر سایتی انتخاب نشود، سیستم به‌صورت پیش‌فرض همه سایت‌های
                                        فعال مشتری را به این پشتیبان اختصاص می‌دهد.
                                    </p>
                                </div>

                                <div className="team-form-actions">
                                    <button
                                        className="btn"
                                        type="submit"
                                        disabled={creating || isAgentLimitReached}
                                    >
                                        {creating ? "در حال ساخت..." : "ساخت پشتیبان"}
                                    </button>

                                    <button
                                        className="btn secondary"
                                        type="button"
                                        onClick={resetForm}
                                    >
                                        پاک کردن
                                    </button>
                                </div>
                            </form>
                        </aside>
                    </div>
                )}
            </div>
        </AppShell>
    );
}

function PlanUsageCard({
                           planUsage,
                           isAgentLimitReached,
                       }: {
    planUsage: PlanUsageData | null;
    isAgentLimitReached: boolean;
}) {
    const agentUsage = planUsage?.usage.agents;

    if (!agentUsage) {
        return (
            <div className="team-plan-card">
                <span>پلن فعلی</span>
                <strong>در حال دریافت...</strong>
                <p>اطلاعات مصرف پلن هنوز دریافت نشده است.</p>
            </div>
        );
    }

    const percent = Math.max(0, Math.min(agentUsage.percent, 100));

    return (
        <div className={`team-plan-card ${isAgentLimitReached ? "danger" : "success"}`}>
            <div className="team-plan-top">
                <div>
                    <span>مصرف پشتیبان‌ها در پلن</span>
                    <strong>{planUsage?.plan.name || "پلن فعلی"}</strong>
                </div>

                <b>{isAgentLimitReached ? "تکمیل شده" : `${agentUsage.remaining} باقی‌مانده`}</b>
            </div>

            <p>
                شما {agentUsage.used} پشتیبان از {formatLimit(agentUsage.limit)} پشتیبان
                مجاز را استفاده کرده‌اید.
            </p>

            <div className="team-usage-bar">
                <div style={{ width: `${percent}%` }} />
            </div>

            <div className="team-plan-foot">
                <span>ظرفیت استفاده‌شده</span>
                <strong>{agentUsage.percent}٪</strong>
            </div>
        </div>
    );
}

function TeamStatCard({
                          label,
                          value,
                          hint,
                          tone = "default",
                      }: {
    label: string;
    value: number;
    hint: string;
    tone?: "default" | "primary" | "success" | "warning";
}) {
    return (
        <article className={`team-stat-card tone-${tone}`}>
            <strong>{value}</strong>
            <span>{label}</span>
            <p>{hint}</p>
        </article>
    );
}

function TeamAvatar({ name }: { name: string }) {
    return <div className="team-avatar">{getInitials(name)}</div>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="team-info-row">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function TeamEmptyState({ title, text }: { title: string; text: string }) {
    return (
        <div className="team-empty-state">
            <div>👥</div>
            <h3>{title}</h3>
            <p>{text}</p>
        </div>
    );
}

function getInitials(name: string) {
    const cleanName = name.trim();

    if (!cleanName) {
        return "U";
    }

    if (/^[A-Za-z]/.test(cleanName)) {
        return cleanName.slice(0, 2).toUpperCase();
    }

    return cleanName.slice(0, 1);
}

function formatLimit(limit: number) {
    if (limit <= 0) {
        return "نامحدود";
    }

    return String(limit);
}