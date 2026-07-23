"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type RequestItem = {
    id: number;
    tracking_code: string;
    full_name: string;
    phone: string;
    normalized_phone: string;
    business_name?: string | null;
    email?: string | null;
    website_url?: string | null;
    request_type: string;
    request_type_label: string;
    desired_plan_name?: string | null;
    desired_plan_name_snapshot?: string | null;
    preferred_contact: "phone" | "whatsapp";
    preferred_contact_label: string;
    status: string;
    status_label: string;
    priority: string;
    priority_label: string;
    follow_up_at?: string | null;
    notes_count: number;
    created_at: string;
};

type Labels = {
    types: Record<string, string>;
    statuses: Record<string, string>;
    priorities: Record<string, string>;
    contact_methods: Record<string, string>;
};

type Stats = {
    total_count: number;
    new_count: number;
    reviewing_count: number;
    qualified_count: number;
    converted_count: number;
    open_count: number;
    overdue_follow_up_count: number;
};

const emptyLabels: Labels = { types: {}, statuses: {}, priorities: {}, contact_methods: {} };
const emptyStats: Stats = { total_count: 0, new_count: 0, reviewing_count: 0, qualified_count: 0, converted_count: 0, open_count: 0, overdue_follow_up_count: 0 };

function formatDate(value?: string | null) {
    if (!value) return "—";
    const date = new Date(value.replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });
}

function whatsappPhone(phone: string) {
    const digits = phone.replace(/\D/g, "");
    if (/^09\d{9}$/.test(digits)) return `98${digits.slice(1)}`;
    return digits.replace(/^0+/, "");
}

export default function ContactRequestsPage() {
    const router = useRouter();
    const [requests, setRequests] = useState<RequestItem[]>([]);
    const [labels, setLabels] = useState<Labels>(emptyLabels);
    const [stats, setStats] = useState<Stats>(emptyStats);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [filters, setFilters] = useState({ search: "", status: "", request_type: "", priority: "", preferred_contact: "" });
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, total_pages: 1 });

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
    }, [router]);

    useEffect(() => {
        let active = true;

        async function load() {
            setLoading(true);
            setError("");

            const params = new URLSearchParams({ page: String(page), per_page: "20" });
            Object.entries(filters).forEach(([key, value]) => {
                if (value) params.set(key, value);
            });

            try {
                const data = await apiRequest(`/super-admin/contact-requests-list.php?${params.toString()}`);
                if (!active) return;
                setRequests(data.requests || []);
                setLabels(data.labels || emptyLabels);
                setStats(data.stats || emptyStats);
                setPagination({ total: Number(data.pagination?.total || 0), total_pages: Number(data.pagination?.total_pages || 1) });
            } catch (err) {
                if (active) setError(err instanceof Error ? err.message : "دریافت درخواست‌ها ناموفق بود.");
            } finally {
                if (active) setLoading(false);
            }
        }

        load();
        return () => { active = false; };
    }, [filters, page]);

    function submitSearch(event: FormEvent) {
        event.preventDefault();
        setPage(1);
        setFilters((current) => ({ ...current, search: searchInput.trim() }));
    }

    function updateFilter(name: keyof typeof filters, value: string) {
        setPage(1);
        setFilters((current) => ({ ...current, [name]: value }));
    }

    function resetFilters() {
        setSearchInput("");
        setPage(1);
        setFilters({ search: "", status: "", request_type: "", priority: "", preferred_contact: "" });
    }

    return (
        <AppShell
            title="درخواست‌های مشتریان"
            kicker="Sales & Onboarding Requests"
            description="مدیریت درخواست‌های مشاوره، خرید پلن، دمو و راه‌اندازی ثبت‌شده از صفحه عمومی"
            actions={<Link className="btn secondary" href="/">مشاهده فرم عمومی</Link>}
        >
            <section className="request-stats-grid">
                <StatCard label="درخواست جدید" value={stats.new_count} tone="new" />
                <StatCard label="در حال پیگیری" value={stats.open_count} tone="open" />
                <StatCard label="واجد شرایط" value={stats.qualified_count} tone="qualified" />
                <StatCard label="تبدیل به مشتری" value={stats.converted_count} tone="converted" />
                <StatCard label="پیگیری عقب‌افتاده" value={stats.overdue_follow_up_count} tone="overdue" />
            </section>

            <section className="request-filter-card">
                <form onSubmit={submitSearch} className="request-search-row">
                    <input className="input" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="جست‌وجو با نام، شماره، مجموعه یا کد پیگیری" />
                    <button className="btn" type="submit">جست‌وجو</button>
                </form>

                <div className="request-filter-row">
                    <select className="input" value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
                        <option value="">همه وضعیت‌ها</option>
                        {Object.entries(labels.statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <select className="input" value={filters.request_type} onChange={(event) => updateFilter("request_type", event.target.value)}>
                        <option value="">همه اهداف</option>
                        {Object.entries(labels.types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <select className="input" value={filters.priority} onChange={(event) => updateFilter("priority", event.target.value)}>
                        <option value="">همه اولویت‌ها</option>
                        {Object.entries(labels.priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <select className="input" value={filters.preferred_contact} onChange={(event) => updateFilter("preferred_contact", event.target.value)}>
                        <option value="">همه روش‌های تماس</option>
                        {Object.entries(labels.contact_methods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <button className="btn secondary" type="button" onClick={resetFilters}>حذف فیلترها</button>
                </div>
            </section>

            {error && <div className="error">{error}</div>}

            <section className="request-list-card">
                <div className="request-list-head">
                    <div><strong>فهرست درخواست‌ها</strong><span>{pagination.total.toLocaleString("fa-IR")} درخواست</span></div>
                    <small>درخواست‌های جدید در ابتدای فهرست قرار می‌گیرند.</small>
                </div>

                {loading ? (
                    <div className="request-empty">در حال دریافت درخواست‌ها...</div>
                ) : requests.length === 0 ? (
                    <div className="request-empty"><strong>درخواستی پیدا نشد</strong><p>فیلترها را تغییر بده یا منتظر ثبت درخواست جدید بمان.</p></div>
                ) : (
                    <div className="request-table-wrap">
                        <table className="request-table">
                            <thead><tr><th>متقاضی</th><th>هدف و پلن</th><th>تماس</th><th>وضعیت</th><th>زمان ثبت</th><th /></tr></thead>
                            <tbody>
                                {requests.map((item) => (
                                    <tr key={item.id} className={item.status === "new" ? "is-new" : ""}>
                                        <td>
                                            <div className="request-person"><span>{item.full_name.slice(0, 1)}</span><div><strong>{item.full_name}</strong><small>{item.business_name || item.tracking_code}</small></div></div>
                                        </td>
                                        <td><div className="request-purpose"><strong>{item.request_type_label}</strong><small>{item.desired_plan_name || item.desired_plan_name_snapshot || "بدون انتخاب پلن"}</small></div></td>
                                        <td>
                                            <div className="request-contact-cell"><strong dir="ltr">{item.phone}</strong><small>{item.preferred_contact_label}</small><div><a href={`tel:${item.normalized_phone}`}>تماس</a><a target="_blank" rel="noreferrer" href={`https://wa.me/${whatsappPhone(item.normalized_phone)}`}>واتساپ</a></div></div>
                                        </td>
                                        <td><div className="request-status-stack"><span className={`request-status request-status--${item.status}`}>{item.status_label}</span><small className={`request-priority request-priority--${item.priority}`}>{item.priority_label}</small></div></td>
                                        <td><div className="request-date"><strong>{formatDate(item.created_at)}</strong>{item.follow_up_at && <small>پیگیری: {formatDate(item.follow_up_at)}</small>}</div></td>
                                        <td><Link className="request-open-link" href={`/super-admin/contact-requests/${item.id}`}>بررسی درخواست</Link></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {pagination.total_pages > 1 && (
                    <div className="request-pagination">
                        <button className="btn secondary" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>صفحه قبل</button>
                        <span>صفحه {page.toLocaleString("fa-IR")} از {pagination.total_pages.toLocaleString("fa-IR")}</span>
                        <button className="btn secondary" disabled={page >= pagination.total_pages} onClick={() => setPage((current) => Math.min(pagination.total_pages, current + 1))}>صفحه بعد</button>
                    </div>
                )}
            </section>
        </AppShell>
    );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
    return <article className={`request-stat request-stat--${tone}`}><span>{label}</span><strong>{value.toLocaleString("fa-IR")}</strong></article>;
}
