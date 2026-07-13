// مسیر فایل: ai-chat-saas/frontend/app/super-admin/customers/page.tsx
// هدف: صفحه مشتری‌های Super Admin با طراحی مینیمال‌تر و حرفه‌ای‌تر

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type Tenant = {
    id: number;
    name: string;
    owner_name: string | null;
    owner_email: string | null;
    owner_phone: string | null;
    status: string;
    plan_name: string | null;
    sites_count: number;
    users_count: number;
    created_at: string;
};

type StatusFilter = "all" | "active" | "inactive" | "suspended";

const statusLabels: Record<string, string> = {
    active: "فعال",
    inactive: "غیرفعال",
    suspended: "تعلیق‌شده",
};

export default function SuperAdminCustomersPage() {
    const router = useRouter();

    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

    async function loadTenants(silent = false) {
        try {
            setError("");

            if (silent) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            const data = await apiRequest("/super-admin/tenants-list.php");
            setTenants(data.tenants || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت مشتری‌ها");
        } finally {
            setLoading(false);
            setRefreshing(false);
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

        loadTenants();
    }, [router]);

    const filteredTenants = useMemo(() => {
        const q = search.trim().toLowerCase();

        return tenants.filter((tenant) => {
            const matchesSearch =
                !q ||
                [
                    tenant.name,
                    tenant.owner_name,
                    tenant.owner_email,
                    tenant.owner_phone,
                    tenant.plan_name,
                    tenant.status,
                    tenant.id,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase()
                    .includes(q);

            const matchesStatus =
                statusFilter === "all" || tenant.status === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [tenants, search, statusFilter]);

    const stats = useMemo(() => {
        const totalSites = tenants.reduce(
            (sum, tenant) => sum + Number(tenant.sites_count || 0),
            0
        );

        const totalUsers = tenants.reduce(
            (sum, tenant) => sum + Number(tenant.users_count || 0),
            0
        );

        const active = tenants.filter((tenant) => tenant.status === "active").length;
        const inactive = tenants.filter(
            (tenant) => tenant.status !== "active"
        ).length;

        return {
            total: tenants.length,
            active,
            inactive,
            totalSites,
            totalUsers,
        };
    }, [tenants]);

    const planSummary = useMemo(() => {
        const map = new Map<string, number>();

        for (const tenant of tenants) {
            const planName = tenant.plan_name || "بدون پلن";
            map.set(planName, (map.get(planName) || 0) + 1);
        }

        return Array.from(map.entries()).map(([name, count]) => ({
            name,
            count,
        }));
    }, [tenants]);

    return (
        <AppShell
            title="مشتری‌ها"
            kicker="Customers"
            description="مدیریت کسب‌وکارهایی که از پلتفرم چت استفاده می‌کنند"
            actions={
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                        className="btn secondary"
                        onClick={() => loadTenants(true)}
                        disabled={refreshing}
                    >
                        {refreshing ? "در حال بروزرسانی..." : "بروزرسانی"}
                    </button>

                    <Link className="btn" href="/super-admin/customers/create">
                        ایجاد مشتری جدید
                    </Link>
                </div>
            }
        >
            <div className="metric-compact-grid">
                <MetricCard label="کل مشتری‌ها" value={stats.total} />
                <MetricCard label="مشتری‌های فعال" value={stats.active} />
                <MetricCard label="غیرفعال / تعلیق‌شده" value={stats.inactive} />
                <MetricCard label="کل سایت‌ها" value={stats.totalSites} />
                <MetricCard label="کاربران پنل" value={stats.totalUsers} />
            </div>

            <section className="admin-side-card" style={{ marginTop: 18 }}>
                <div className="admin-customers-toolbar">
                    <div className="admin-customers-filters">
                        <input
                            className="input admin-search-box"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="جستجو در نام مشتری، مالک، ایمیل، شماره، پلن یا شناسه..."
                        />

                        <div className="admin-status-tabs">
                            <button
                                type="button"
                                className={`admin-status-tab ${
                                    statusFilter === "all" ? "active" : ""
                                }`}
                                onClick={() => setStatusFilter("all")}
                            >
                                همه
                            </button>

                            <button
                                type="button"
                                className={`admin-status-tab ${
                                    statusFilter === "active" ? "active" : ""
                                }`}
                                onClick={() => setStatusFilter("active")}
                            >
                                فعال
                            </button>

                            <button
                                type="button"
                                className={`admin-status-tab ${
                                    statusFilter === "inactive" ? "active" : ""
                                }`}
                                onClick={() => setStatusFilter("inactive")}
                            >
                                غیرفعال
                            </button>

                            <button
                                type="button"
                                className={`admin-status-tab ${
                                    statusFilter === "suspended" ? "active" : ""
                                }`}
                                onClick={() => setStatusFilter("suspended")}
                            >
                                تعلیق
                            </button>
                        </div>
                    </div>

                    <span className="soft-chip primary">
            {filteredTenants.length} نتیجه
          </span>
                </div>

                {error && <div className="error">{error}</div>}

                {loading ? (
                    <div className="admin-customer-list">
                        {[1, 2, 3].map((item) => (
                            <div
                                key={item}
                                className="admin-customer-card"
                                style={{
                                    minHeight: 145,
                                    background:
                                        "linear-gradient(90deg, #f8fafc, #eef2ff, #f8fafc)",
                                }}
                            >
                                <p className="muted">در حال بارگذاری مشتری‌ها...</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="admin-customer-layout">
                        <div>
                            {filteredTenants.length === 0 ? (
                                <div className="admin-empty-state">
                                    <div style={{ fontSize: 42, marginBottom: 10 }}>👥</div>
                                    <h3 style={{ margin: 0 }}>مشتری‌ای پیدا نشد</h3>
                                    <p className="muted">
                                        عبارت جستجو یا فیلتر وضعیت را تغییر بده، یا مشتری جدید بساز.
                                    </p>

                                    <Link
                                        className="btn"
                                        href="/super-admin/customers/create"
                                        style={{ display: "inline-flex", marginTop: 12 }}
                                    >
                                        ایجاد مشتری جدید
                                    </Link>
                                </div>
                            ) : (
                                <div className="admin-customer-list">
                                    {filteredTenants.map((tenant) => (
                                        <CustomerCard key={tenant.id} tenant={tenant} />
                                    ))}
                                </div>
                            )}
                        </div>

                        <aside className="admin-customer-side">
                            <section className="admin-side-card">
                                <h3 className="admin-side-title">خلاصه وضعیت</h3>

                                <div className="admin-side-list">
                                    <SideRow label="فعال" value={stats.active} tone="success" />
                                    <SideRow label="غیرفعال / تعلیق" value={stats.inactive} />
                                    <SideRow label="کل سایت‌ها" value={stats.totalSites} />
                                    <SideRow label="کل کاربران" value={stats.totalUsers} />
                                </div>
                            </section>

                            <section className="admin-side-card">
                                <h3 className="admin-side-title">پلن‌ها</h3>

                                {planSummary.length === 0 ? (
                                    <p className="muted">هنوز پلنی برای مشتری‌ها ثبت نشده است.</p>
                                ) : (
                                    <div className="admin-side-list">
                                        {planSummary.map((plan) => (
                                            <SideRow
                                                key={plan.name}
                                                label={plan.name}
                                                value={plan.count}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="admin-mini-panel">
                                <h3 className="admin-side-title">قدم بعدی</h3>
                                <p className="muted" style={{ lineHeight: 1.9 }}>
                                    در مرحله ویژگی‌ها، برای هر مشتری صفحه جزئیات، تغییر وضعیت،
                                    تغییر پلن و مدیریت سایت‌ها را اضافه می‌کنیم.
                                </p>
                            </section>
                        </aside>
                    </div>
                )}
            </section>
        </AppShell>
    );
}

function CustomerCard({ tenant }: { tenant: Tenant }) {
    const isActive = tenant.status === "active";

    const contact =
        tenant.owner_phone || tenant.owner_email || "اطلاعات تماس ثبت نشده";

    return (
        <article
            className={`admin-customer-card ${isActive ? "" : "is-inactive"}`}
        >
            <div className="admin-customer-top">
                <div>
                    <h3 className="admin-customer-name">{tenant.name}</h3>

                    <div className="admin-customer-subtitle">
                        شناسه مشتری #{tenant.id} · ایجاد شده در {tenant.created_at}
                    </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className={`soft-chip ${isActive ? "success" : "danger"}`}>
            {statusLabels[tenant.status] || tenant.status}
          </span>

                    <span className="soft-chip primary">
            {tenant.plan_name || "بدون پلن"}
          </span>
                </div>
            </div>

            <div className="admin-customer-meta">
                <MetaTile label="مالک" value={tenant.owner_name || "ثبت نشده"} />
                <MetaTile label="تماس" value={contact} />
                <MetaTile label="سایت‌ها" value={String(tenant.sites_count)} />
                <MetaTile label="کاربران پنل" value={String(tenant.users_count)} />
            </div>

            <div className="admin-customer-footer">
                <div className="muted">
                    {tenant.owner_email || "ایمیل مالک ثبت نشده"}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Link className="btn secondary" href="/super-admin/sites">
                        سایت‌ها
                    </Link>

                    <Link className="btn" href={`/super-admin/customers/${tenant.id}`}>
                        جزئیات
                    </Link>
                </div>
            </div>
        </article>
    );
}

function MetricCard({
                        label,
                        value,
                    }: {
    label: string;
    value: string | number;
}) {
    return (
        <section className="metric-compact">
            <div className="metric-compact-value">{value}</div>
            <div className="metric-compact-label">{label}</div>
        </section>
    );
}

function MetaTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="admin-meta-tile">
            <div className="admin-meta-label">{label}</div>
            <div className="admin-meta-value">{value}</div>
        </div>
    );
}

function SideRow({
                     label,
                     value,
                     tone,
                 }: {
    label: string;
    value: string | number;
    tone?: "success";
}) {
    return (
        <div className="admin-side-row">
            <span className="muted">{label}</span>
            <span className={`soft-chip ${tone === "success" ? "success" : ""}`}>
        {value}
      </span>
        </div>
    );
}