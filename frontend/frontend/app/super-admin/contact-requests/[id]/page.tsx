"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type ContactRequest = {
    id: number;
    tracking_code: string;
    full_name: string;
    phone: string;
    normalized_phone: string;
    whatsapp_phone: string;
    business_name?: string | null;
    email?: string | null;
    website_url?: string | null;
    request_type: string;
    request_type_label: string;
    business_field?: string | null;
    sites_count?: number | null;
    agents_count?: number | null;
    monthly_conversations?: string | null;
    desired_plan_id?: number | null;
    desired_plan_name?: string | null;
    desired_plan_name_snapshot?: string | null;
    website_technology?: string | null;
    preferred_contact: "phone" | "whatsapp";
    preferred_contact_label: string;
    preferred_contact_time?: string | null;
    description?: string | null;
    status: string;
    status_label: string;
    priority: string;
    priority_label: string;
    internal_summary?: string | null;
    follow_up_at?: string | null;
    last_contacted_at?: string | null;
    converted_tenant_id?: number | null;
    converted_tenant_name?: string | null;
    converted_at?: string | null;
    source_page?: string | null;
    created_at: string;
    updated_at?: string | null;
};

type EventItem = {
    id: number;
    actor_name?: string | null;
    event_type: string;
    note?: string | null;
    old_status?: string | null;
    new_status?: string | null;
    created_at: string;
};

type Labels = {
    types: Record<string, string>;
    statuses: Record<string, string>;
    priorities: Record<string, string>;
    contact_methods: Record<string, string>;
};

const emptyLabels: Labels = { types: {}, statuses: {}, priorities: {}, contact_methods: {} };

function formatDate(value?: string | null) {
    if (!value) return "—";
    const date = new Date(value.replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });
}

function contactTimeLabel(value?: string | null) {
    return ({ anytime: "در ساعات کاری فرقی ندارد", morning: "صبح، ۹ تا ۱۲", afternoon: "بعدازظهر، ۱۲ تا ۱۷", evening: "عصر، ۱۷ تا ۲۰" } as Record<string, string>)[value || ""] || value || "—";
}

function conversationLabel(value?: string | null) {
    return ({ unknown: "اطلاع ندارد", under_500: "کمتر از ۵۰۰", "500_3000": "۵۰۰ تا ۳٬۰۰۰", "3000_10000": "۳٬۰۰۰ تا ۱۰٬۰۰۰", over_10000: "بیشتر از ۱۰٬۰۰۰" } as Record<string, string>)[value || ""] || value || "—";
}

function eventTitle(event: EventItem) {
    const map: Record<string, string> = {
        created: "ثبت درخواست",
        note: "یادداشت داخلی",
        status_changed: "تغییر وضعیت",
        priority_changed: "تغییر اولویت",
        contacted: "ثبت تماس",
        converted: "تبدیل به مشتری",
    };
    return map[event.event_type] || "رویداد درخواست";
}

export default function ContactRequestDetailPage() {
    const params = useParams();
    const router = useRouter();
    const requestId = Number(params?.id || 0);

    const [request, setRequest] = useState<ContactRequest | null>(null);
    const [events, setEvents] = useState<EventItem[]>([]);
    const [labels, setLabels] = useState<Labels>(emptyLabels);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [addingNote, setAddingNote] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [note, setNote] = useState("");
    const [edit, setEdit] = useState({ status: "new", priority: "normal", internal_summary: "", follow_up_at: "" });

    const whatsappUrl = useMemo(() => {
        if (!request?.whatsapp_phone) return "#";
        const message = `سلام ${request.full_name}، درباره درخواست ${request.tracking_code} برای سامانه پشتیبانی و ویجت گفت‌وگو پیام می‌دهم.`;
        return `https://wa.me/${request.whatsapp_phone}?text=${encodeURIComponent(message)}`;
    }, [request]);

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

    async function loadRequest(showLoader = true) {
        if (!requestId) return;
        if (showLoader) setLoading(true);
        setError("");

        try {
            const data = await apiRequest(`/super-admin/contact-request-show.php?id=${requestId}`);
            const loaded = data.request as ContactRequest;
            setRequest(loaded);
            setEvents(data.events || []);
            setLabels(data.labels || emptyLabels);
            setEdit({
                status: loaded.status,
                priority: loaded.priority,
                internal_summary: loaded.internal_summary || "",
                follow_up_at: loaded.follow_up_at ? loaded.follow_up_at.replace(" ", "T").slice(0, 16) : "",
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "دریافت درخواست ناموفق بود.");
        } finally {
            if (showLoader) setLoading(false);
        }
    }

    useEffect(() => {
        loadRequest();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestId]);

    async function saveRequest(markContacted = false) {
        if (!request) return;
        setSaving(true);
        setError("");
        setSuccess("");

        try {
            const nextStatus = markContacted && ["new", "reviewing"].includes(edit.status)
                ? "contacted"
                : edit.status;

            await apiRequest("/super-admin/contact-request-update.php", {
                method: "POST",
                body: JSON.stringify({ id: request.id, ...edit, status: nextStatus, mark_contacted: markContacted }),
            });
            setSuccess(markContacted ? "تماس و تغییرات درخواست ثبت شد." : "تغییرات درخواست ذخیره شد.");
            await loadRequest(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ذخیره تغییرات ناموفق بود.");
        } finally {
            setSaving(false);
        }
    }

    async function submitNote(event: FormEvent) {
        event.preventDefault();
        if (!request || !note.trim()) return;
        setAddingNote(true);
        setError("");
        setSuccess("");

        try {
            await apiRequest("/super-admin/contact-request-note-create.php", {
                method: "POST",
                body: JSON.stringify({ id: request.id, note: note.trim() }),
            });
            setNote("");
            setSuccess("یادداشت داخلی ثبت شد.");
            await loadRequest(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ثبت یادداشت ناموفق بود.");
        } finally {
            setAddingNote(false);
        }
    }

    if (loading) {
        return <AppShell title="جزئیات درخواست" description="در حال دریافت اطلاعات..."><div className="request-empty">در حال بارگذاری درخواست...</div></AppShell>;
    }

    if (!request) {
        return <AppShell title="جزئیات درخواست"><div className="error">{error || "درخواست پیدا نشد."}</div></AppShell>;
    }

    const createCustomerHref = `/super-admin/customers/create?request_id=${request.id}`;

    return (
        <AppShell
            title={request.full_name}
            kicker={request.tracking_code}
            description={`${request.request_type_label} · ثبت‌شده در ${formatDate(request.created_at)}`}
            actions={<div className="request-header-actions"><Link className="btn secondary" href="/super-admin/contact-requests">بازگشت</Link>{request.status !== "converted" ? <Link className="btn" href={createCustomerHref}>ایجاد مشتری از درخواست</Link> : request.converted_tenant_id ? <Link className="btn" href={`/super-admin/customers/${request.converted_tenant_id}`}>مشاهده مشتری ساخته‌شده</Link> : null}</div>}
        >
            {error && <div className="error">{error}</div>}
            {success && <div className="success">{success}</div>}

            <section className="request-detail-hero">
                <div className="request-detail-person">
                    <span>{request.full_name.slice(0, 1)}</span>
                    <div><small>متقاضی</small><h2>{request.full_name}</h2><p>{request.business_name || request.business_field || "بدون نام مجموعه"}</p></div>
                </div>
                <div className="request-detail-badges"><span className={`request-status request-status--${request.status}`}>{request.status_label}</span><span className={`request-priority request-priority--${request.priority}`}>اولویت {request.priority_label}</span><span className="request-method-badge">{request.preferred_contact_label}</span></div>
                <div className="request-detail-contact-actions">
                    <a className="btn" href={`tel:${request.normalized_phone}`} onClick={() => saveRequest(true)}>تماس تلفنی</a>
                    <a className="btn request-whatsapp-btn" target="_blank" rel="noreferrer" href={whatsappUrl} onClick={() => saveRequest(true)}>بازکردن واتساپ</a>
                </div>
            </section>

            <div className="request-detail-grid">
                <div className="request-detail-main">
                    <section className="request-detail-card">
                        <div className="request-card-heading"><div><small>اطلاعات ثبت‌شده</small><h3>نیاز و مشخصات کسب‌وکار</h3></div></div>
                        <div className="request-info-grid">
                            <Info label="شماره موبایل" value={request.phone} dir="ltr" />
                            <Info label="ایمیل" value={request.email || "—"} dir="ltr" />
                            <Info label="نام مجموعه" value={request.business_name || "—"} />
                            <Info label="حوزه فعالیت" value={request.business_field || "—"} />
                            <Info label="هدف درخواست" value={request.request_type_label} />
                            <Info label="پلن موردنظر" value={request.desired_plan_name || request.desired_plan_name_snapshot || "هنوز انتخاب نشده"} />
                            <Info label="تعداد سایت" value={request.sites_count?.toLocaleString("fa-IR") || "—"} />
                            <Info label="تعداد پشتیبان" value={request.agents_count?.toLocaleString("fa-IR") || "—"} />
                            <Info label="گفت‌وگوی ماهانه" value={conversationLabel(request.monthly_conversations)} />
                            <Info label="فناوری سایت" value={request.website_technology || "—"} />
                            <Info label="روش تماس" value={request.preferred_contact_label} />
                            <Info label="زمان مناسب تماس" value={contactTimeLabel(request.preferred_contact_time)} />
                        </div>
                        {request.website_url && <div className="request-website-row"><span>وب‌سایت</span><a href={request.website_url} target="_blank" rel="noreferrer">{request.website_url}</a></div>}
                        <div className="request-description-box"><span>توضیحات متقاضی</span><p>{request.description || "توضیحی ثبت نشده است."}</p></div>
                    </section>

                    <section className="request-detail-card">
                        <div className="request-card-heading"><div><small>تاریخچه پیگیری</small><h3>رویدادها و یادداشت‌ها</h3></div></div>
                        <form onSubmit={submitNote} className="request-note-form"><textarea className="textarea" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="یادداشت داخلی برای پیگیری بعدی..." /><button className="btn" disabled={addingNote || !note.trim()}>{addingNote ? "در حال ثبت..." : "ثبت یادداشت"}</button></form>
                        <div className="request-timeline">
                            {events.length === 0 ? <div className="request-empty">رویدادی ثبت نشده است.</div> : events.map((event) => <article key={event.id} className={`request-event request-event--${event.event_type}`}><i /><div><header><strong>{eventTitle(event)}</strong><span>{formatDate(event.created_at)}</span></header><p>{event.note || "بدون توضیح"}</p><small>{event.actor_name || "فرم عمومی سایت"}</small></div></article>)}
                        </div>
                    </section>
                </div>

                <aside className="request-detail-sidebar">
                    <section className="request-detail-card request-manage-card">
                        <div className="request-card-heading"><div><small>مدیریت درخواست</small><h3>وضعیت و پیگیری</h3></div></div>
                        <label><span>وضعیت</span><select className="input" value={edit.status} onChange={(event) => setEdit((current) => ({ ...current, status: event.target.value }))} disabled={request.status === "converted"}>{Object.entries(labels.statuses)
                            .filter(([value]) => value !== "converted" || request.status === "converted")
                            .map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                        <label><span>اولویت</span><select className="input" value={edit.priority} onChange={(event) => setEdit((current) => ({ ...current, priority: event.target.value }))}>{Object.entries(labels.priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                        <label><span>زمان پیگیری بعدی</span><input className="input" type="datetime-local" value={edit.follow_up_at} onChange={(event) => setEdit((current) => ({ ...current, follow_up_at: event.target.value }))} /></label>
                        <label><span>خلاصه داخلی</span><textarea className="textarea" rows={5} value={edit.internal_summary} onChange={(event) => setEdit((current) => ({ ...current, internal_summary: event.target.value }))} placeholder="جمع‌بندی نیاز مشتری، نتیجه تماس و قدم بعدی..." /></label>
                        <button className="btn" type="button" disabled={saving} onClick={() => saveRequest(false)}>{saving ? "در حال ذخیره..." : "ذخیره تغییرات"}</button>
                        <button className="btn secondary" type="button" disabled={saving} onClick={() => saveRequest(true)}>ثبت انجام تماس</button>
                    </section>

                    <section className="request-detail-card request-meta-card">
                        <h3>اطلاعات سیستمی</h3>
                        <Info label="کد پیگیری" value={request.tracking_code} dir="ltr" />
                        <Info label="تاریخ ثبت" value={formatDate(request.created_at)} />
                        <Info label="آخرین تماس" value={formatDate(request.last_contacted_at)} />
                        <Info label="پیگیری بعدی" value={formatDate(request.follow_up_at)} />
                        <Info label="منبع ثبت" value={request.source_page || "صفحه اصلی"} dir="ltr" />
                    </section>
                </aside>
            </div>
        </AppShell>
    );
}

function Info({ label, value, dir }: { label: string; value: string; dir?: "ltr" | "rtl" }) {
    return <div className="request-info-item"><span>{label}</span><strong dir={dir}>{value}</strong></div>;
}
