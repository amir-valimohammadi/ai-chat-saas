// مسیر فایل: ai-chat-saas/frontend/app/super-admin/sites/page.tsx
// هدف: صفحه سایت‌های Super Admin با طراحی مینیمال‌تر

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type Site = {
    id: number;
    tenant_id: number;
    tenant_name: string;
    name: string;
    domain: string;
    site_key: string;
    brand_name: string | null;
    brand_color: string | null;
    welcome_message: string | null;
    ai_mode: string;
    is_active: boolean;
    conversations_count: number;
    created_at: string;
};

export default function SuperAdminSitesPage() {
    const router = useRouter();

    const [sites, setSites] = useState<Site[]>([]);
    const [search, setSearch] = useState("");
    const [copiedId, setCopiedId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

    async function loadSites(silent = false) {
        try {
            setError("");

            if (silent) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            const data = await apiRequest("/super-admin/sites-list.php");
            setSites(data.sites || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت سایت‌ها");
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

        loadSites();
    }, [router]);

    const filteredSites = useMemo(() => {
        const q = search.trim().toLowerCase();

        if (!q) return sites;

        return sites.filter((site) =>
            [
                site.name,
                site.domain,
                site.tenant_name,
                site.site_key,
                site.ai_mode,
                site.brand_name,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(q)
        );
    }, [sites, search]);

    const stats = useMemo(() => {
        return {
            total: sites.length,
            active: sites.filter((site) => site.is_active).length,
            inactive: sites.filter((site) => !site.is_active).length,
            conversations: sites.reduce(
                (sum, site) => sum + Number(site.conversations_count || 0),
                0
            ),
        };
    }, [sites]);

    async function copyText(text: string, id: number) {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        window.setTimeout(() => setCopiedId(null), 1600);
    }

    return (
        <AppShell
            title="سایت‌ها"
            kicker="Registered Websites"
            description="مدیریت و بررسی سایت‌هایی که ویجت چت روی آن‌ها نصب می‌شود"
            actions={
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                        className="btn secondary"
                        onClick={() => loadSites(true)}
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
                <MetricCard label="کل سایت‌ها" value={stats.total} />
                <MetricCard label="سایت‌های فعال" value={stats.active} />
                <MetricCard label="غیرفعال" value={stats.inactive} />
                <MetricCard label="کل گفتگوها" value={stats.conversations} />
            </div>

            <section className="admin-clean-card" style={{ marginTop: 18 }}>
                <div className="admin-customers-toolbar">
                    <input
                        className="input admin-search-box"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="جستجو در نام سایت، دامنه، مشتری، site_key یا AI mode..."
                    />

                    <span className="soft-chip primary">{filteredSites.length} سایت</span>
                </div>

                {error && <div className="error">{error}</div>}

                {loading ? (
                    <p className="muted">در حال بارگذاری سایت‌ها...</p>
                ) : filteredSites.length === 0 ? (
                    <div className="admin-empty-state">
                        <div style={{ fontSize: 42, marginBottom: 10 }}>◎</div>
                        <h3 style={{ margin: 0 }}>سایتی پیدا نشد</h3>
                        <p className="muted">بعد از ساخت مشتری، سایت اولیه اینجا نمایش داده می‌شود.</p>
                    </div>
                ) : (
                    <div className="admin-site-grid">
                        {filteredSites.map((site) => {
                            const installCode = `<script src="http://localhost/ai-chat-saas/widget/dist/widget.js" data-site-key="${site.site_key}"></script>`;

                            return (
                                <article key={site.id} className="admin-site-card">
                                    <div className="admin-site-top">
                                        <div>
                                            <h3 className="admin-site-title">{site.name}</h3>
                                            <div className="admin-site-subtitle">
                                                {site.domain} · مشتری: {site.tenant_name}
                                            </div>
                                        </div>

                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span className={`soft-chip ${site.is_active ? "success" : "danger"}`}>
                        {site.is_active ? "فعال" : "غیرفعال"}
                      </span>

                                            <span className="soft-chip primary">AI: {site.ai_mode}</span>
                                        </div>
                                    </div>

                                    <div className="admin-small-grid">
                                        <SmallTile label="شناسه سایت" value={`#${site.id}`} />
                                        <SmallTile label="گفتگوها" value={String(site.conversations_count)} />
                                        <SmallTile label="رنگ برند" value={site.brand_color || "-"} />
                                        <SmallTile label="تاریخ ایجاد" value={site.created_at} />
                                    </div>

                                    <div className="grid" style={{ marginTop: 14 }}>
                                        <label className="grid">
                                            <span className="muted">site_key</span>
                                            <input
                                                className="input"
                                                readOnly
                                                value={site.site_key}
                                                onFocus={(event) => event.currentTarget.select()}
                                            />
                                        </label>

                                        <label className="grid">
                                            <span className="muted">کد نصب ویجت</span>
                                            <textarea
                                                className="textarea"
                                                readOnly
                                                value={installCode}
                                                onFocus={(event) => event.currentTarget.select()}
                                            />
                                        </label>

                                        <button
                                            className="btn secondary"
                                            type="button"
                                            onClick={() => copyText(installCode, site.id)}
                                        >
                                            {copiedId === site.id ? "کپی شد" : "کپی کد نصب"}
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </AppShell>
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

function SmallTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="admin-small-tile">
            <div className="admin-small-label">{label}</div>
            <div className="admin-small-value">{value}</div>
        </div>
    );
}