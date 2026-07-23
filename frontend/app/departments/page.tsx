"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type Site = { id: number; name: string; domain: string };
type Member = { id: number; name: string; email: string; role: string; is_active: boolean; site_ids: number[] };
type DepartmentMember = {
    user_id: number; name: string; email: string; is_active: boolean; is_online: boolean;
    max_active_conversations: number; routing_weight: number; active_conversation_count: number;
};
type Department = {
    id: number; site_id: number; site_name: string; site_domain: string; name: string; description: string | null;
    color: string; routing_strategy: "manual" | "round_robin" | "least_busy"; queue_enabled: boolean;
    queue_message: string | null; is_default: boolean; is_active: boolean; member_count: number;
    waiting_count: number; active_count: number; members: DepartmentMember[];
};
type MemberDraft = { user_id: number; enabled: boolean; max_active_conversations: number; routing_weight: number };

const emptyForm = {
    department_id: 0,
    site_id: "",
    name: "",
    description: "",
    color: "#2563eb",
    routing_strategy: "round_robin" as Department["routing_strategy"],
    queue_enabled: true,
    queue_message: "درخواست شما در صف پشتیبانی قرار گرفت و به‌زودی پاسخ داده می‌شود.",
    is_default: false,
    is_active: true,
};

const strategyLabels = {
    manual: "اختصاص دستی",
    round_robin: "توزیع نوبتی",
    least_busy: "کم‌مشغله‌ترین پشتیبان",
};

export default function DepartmentsPage() {
    const router = useRouter();
    const [departments, setDepartments] = useState<Department[]>([]);
    const [sites, setSites] = useState<Site[]>([]);
    const [team, setTeam] = useState<Member[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [memberDrafts, setMemberDrafts] = useState<MemberDraft[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [queueLoading, setQueueLoading] = useState<number | null>(null);
    const [siteFilter, setSiteFilter] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const filteredDepartments = useMemo(
        () => siteFilter ? departments.filter((item) => item.site_id === Number(siteFilter)) : departments,
        [departments, siteFilter]
    );
    const selectedSiteId = Number(form.site_id || 0);
    const availableMembers = useMemo(() => team.filter((member) =>
        member.is_active && (member.role === "customer_admin" || member.site_ids.includes(selectedSiteId))
    ), [team, selectedSiteId]);
    const stats = useMemo(() => ({
        total: departments.filter((item) => item.is_active).length,
        waiting: departments.reduce((sum, item) => sum + item.waiting_count, 0),
        active: departments.reduce((sum, item) => sum + item.active_count, 0),
        members: new Set(departments.flatMap((item) => item.members.map((member) => member.user_id))).size,
    }), [departments]);

    useEffect(() => {
        const user = getAuthUser();
        if (!user) { router.push("/login"); return; }
        if (user.role !== "customer_admin") { router.push("/dashboard"); return; }
        loadData();
    }, [router]);

    async function loadData(silent = false) {
        try {
            setError("");
            if (!silent) setLoading(true);
            const [departmentData, sitesData, teamData] = await Promise.all([
                apiRequest("/customer/departments-list.php"),
                apiRequest("/customer/sites-list.php"),
                apiRequest("/customer/team-list.php"),
            ]);
            setDepartments(departmentData.departments || []);
            setSites(sitesData.sites || []);
            setTeam(teamData.members || []);
            setForm((current) => current.site_id || !(sitesData.sites || []).length ? current : { ...current, site_id: String(sitesData.sites[0].id) });
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت دپارتمان‌ها");
        } finally { setLoading(false); }
    }

    function resetForm() {
        setForm({ ...emptyForm, site_id: sites[0] ? String(sites[0].id) : "" });
        setMemberDrafts([]);
    }

    function editDepartment(department: Department) {
        setForm({
            department_id: department.id,
            site_id: String(department.site_id),
            name: department.name,
            description: department.description || "",
            color: department.color,
            routing_strategy: department.routing_strategy,
            queue_enabled: department.queue_enabled,
            queue_message: department.queue_message || "",
            is_default: department.is_default,
            is_active: department.is_active,
        });
        setMemberDrafts(department.members.map((member) => ({
            user_id: member.user_id,
            enabled: member.is_active,
            max_active_conversations: member.max_active_conversations,
            routing_weight: member.routing_weight,
        })));
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function getMemberDraft(userId: number) {
        return memberDrafts.find((item) => item.user_id === userId) || {
            user_id: userId, enabled: false, max_active_conversations: 5, routing_weight: 1,
        };
    }

    function updateMember(userId: number, patch: Partial<MemberDraft>) {
        setMemberDrafts((current) => {
            const existing = current.find((item) => item.user_id === userId);
            if (!existing) return [...current, { user_id: userId, enabled: false, max_active_conversations: 5, routing_weight: 1, ...patch }];
            return current.map((item) => item.user_id === userId ? { ...item, ...patch } : item);
        });
    }

    async function saveDepartment(event: FormEvent) {
        event.preventDefault();
        if (!form.site_id || !form.name.trim()) { setError("سایت و نام دپارتمان الزامی است."); return; }
        try {
            setSaving(true); setError(""); setSuccess("");
            const result = await apiRequest("/customer/department-save.php", {
                method: "POST",
                body: JSON.stringify({ ...form, site_id: Number(form.site_id), name: form.name.trim() }),
            });
            const departmentId = Number(result.department_id || form.department_id);
            await apiRequest("/customer/department-members-update.php", {
                method: "POST",
                body: JSON.stringify({
                    department_id: departmentId,
                    members: memberDrafts.filter((item) => item.enabled).map((item) => ({
                        user_id: item.user_id,
                        is_active: true,
                        max_active_conversations: item.max_active_conversations,
                        routing_weight: item.routing_weight,
                    })),
                }),
            });
            setSuccess("دپارتمان و اعضای آن ذخیره شد.");
            resetForm();
            await loadData(true);
        } catch (err) { setError(err instanceof Error ? err.message : "ذخیره دپارتمان ناموفق بود"); }
        finally { setSaving(false); }
    }

    async function deleteDepartment(department: Department) {
        if (!window.confirm(`دپارتمان «${department.name}» حذف شود؟`)) return;
        try {
            await apiRequest("/customer/department-delete.php", { method: "POST", body: JSON.stringify({ department_id: department.id }) });
            setSuccess("دپارتمان حذف شد.");
            await loadData(true);
        } catch (err) { setError(err instanceof Error ? err.message : "حذف ناموفق بود"); }
    }

    async function processQueue(departmentId: number) {
        try {
            setQueueLoading(departmentId); setError("");
            const data = await apiRequest("/agent/queue-process.php", { method: "POST", body: JSON.stringify({ department_id: departmentId, limit: 25 }) });
            setSuccess(`${data.result?.assigned || 0} گفتگو از صف اختصاص داده شد.`);
            await loadData(true);
        } catch (err) { setError(err instanceof Error ? err.message : "پردازش صف ناموفق بود"); }
        finally { setQueueLoading(null); }
    }

    return (
        <AppShell title="دپارتمان‌ها و مسیریابی" kicker="Routing Center" description="ساخت واحدهای پشتیبانی، مدیریت ظرفیت تیم، صف انتظار و توزیع خودکار گفتگوها">
            <div className="department-shell">
                {error && <div className="error">{error}</div>}
                {success && <div className="success">{success}</div>}

                <section className="department-stat-grid">
                    <Stat label="دپارتمان فعال" value={stats.total} />
                    <Stat label="در صف انتظار" value={stats.waiting} tone="warning" />
                    <Stat label="گفتگوی فعال" value={stats.active} tone="primary" />
                    <Stat label="پشتیبان عضو" value={stats.members} tone="success" />
                </section>

                <div className="department-layout">
                    <section className="department-form-card">
                        <div className="department-card-head">
                            <div><span>Department Setup</span><h2>{form.department_id ? "ویرایش دپارتمان" : "ساخت دپارتمان"}</h2></div>
                            {form.department_id > 0 && <button className="btn secondary" type="button" onClick={resetForm}>دپارتمان جدید</button>}
                        </div>
                        <form onSubmit={saveDepartment} className="department-form">
                            <label><span>سایت</span><select className="input" value={form.site_id} disabled={form.department_id > 0} onChange={(e) => { setForm({ ...form, site_id: e.target.value }); setMemberDrafts([]); }}><option value="">انتخاب سایت</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
                            <div className="department-two-col">
                                <label><span>نام دپارتمان</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثلاً فروش" /></label>
                                <label><span>رنگ</span><input className="input department-color" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></label>
                            </div>
                            <label><span>توضیحات</span><textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
                            <label><span>روش توزیع</span><select className="input" value={form.routing_strategy} onChange={(e) => setForm({ ...form, routing_strategy: e.target.value as Department["routing_strategy"] })}>{Object.entries(strategyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                            <label className="department-check"><input type="checkbox" checked={form.queue_enabled} onChange={(e) => setForm({ ...form, queue_enabled: e.target.checked })} /><span>اگر پشتیبان آزاد نبود، گفتگو وارد صف شود</span></label>
                            {form.queue_enabled && <label><span>پیام صف برای کاربر</span><textarea className="input" rows={2} value={form.queue_message} onChange={(e) => setForm({ ...form, queue_message: e.target.value })} /></label>}
                            <div className="department-two-col">
                                <label className="department-check"><input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} /><span>دپارتمان پیش‌فرض سایت</span></label>
                                <label className="department-check"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /><span>فعال</span></label>
                            </div>

                            <div className="department-members-editor">
                                <div><strong>اعضای دپارتمان</strong><small>فقط پشتیبان‌های عضو در توزیع خودکار شرکت می‌کنند.</small></div>
                                {selectedSiteId <= 0 ? <p className="muted">ابتدا سایت را انتخاب کن.</p> : availableMembers.length === 0 ? <p className="muted">برای این سایت پشتیبانی تعریف نشده است.</p> : availableMembers.map((member) => {
                                    const draft = getMemberDraft(member.id);
                                    return <article key={member.id} className={draft.enabled ? "department-member enabled" : "department-member"}>
                                        <label className="department-member-main"><input type="checkbox" checked={draft.enabled} onChange={(e) => updateMember(member.id, { enabled: e.target.checked })} /><span><strong>{member.name}</strong><small>{member.email} · {member.role === "agent" ? "پشتیبان" : "مدیر"}</small></span></label>
                                        {draft.enabled && <div className="department-member-config"><label>ظرفیت<input className="input" type="number" min={1} max={100} value={draft.max_active_conversations} onChange={(e) => updateMember(member.id, { max_active_conversations: Number(e.target.value) })} /></label><label>وزن<input className="input" type="number" min={1} max={20} value={draft.routing_weight} onChange={(e) => updateMember(member.id, { routing_weight: Number(e.target.value) })} /></label></div>}
                                    </article>;
                                })}
                            </div>
                            <button className="btn primary" disabled={saving}>{saving ? "در حال ذخیره..." : "ذخیره دپارتمان"}</button>
                        </form>
                    </section>

                    <section className="department-list-card">
                        <div className="department-card-head"><div><span>Departments</span><h2>دپارتمان‌های موجود</h2></div><select className="input" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}><option value="">همه سایت‌ها</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></div>
                        {loading ? <div className="department-loading">در حال بارگذاری...</div> : filteredDepartments.length === 0 ? <div className="department-empty">دپارتمانی پیدا نشد.</div> : <div className="department-card-list">{filteredDepartments.map((department) => <article key={department.id} className="department-item" style={{ borderRightColor: department.color }}>
                            <div className="department-item-head"><div><span className="department-dot" style={{ background: department.color }} /><strong>{department.name}</strong>{department.is_default && <b>پیش‌فرض</b>}{!department.is_active && <b className="inactive">غیرفعال</b>}</div><small>{department.site_name}</small></div>
                            <p>{department.description || "بدون توضیح"}</p>
                            <div className="department-metrics"><span>{strategyLabels[department.routing_strategy]}</span><span>{department.member_count} عضو</span><span>{department.active_count} فعال</span><span className={department.waiting_count ? "waiting" : ""}>{department.waiting_count} در صف</span></div>
                            <div className="department-member-chips">{department.members.slice(0, 5).map((member) => <span key={member.user_id} className={member.is_online ? "online" : ""} title={`${member.active_conversation_count}/${member.max_active_conversations}`}>{member.name}</span>)}{department.members.length > 5 && <span>+{department.members.length - 5}</span>}</div>
                            <div className="department-actions"><button className="btn secondary" onClick={() => editDepartment(department)}>ویرایش</button><button className="btn secondary" disabled={queueLoading === department.id || department.waiting_count === 0} onClick={() => processQueue(department.id)}>{queueLoading === department.id ? "پردازش..." : "پردازش صف"}</button>{!department.is_default && <button className="btn danger" onClick={() => deleteDepartment(department)}>حذف</button>}</div>
                        </article>)}</div>}
                    </section>
                </div>
            </div>
        </AppShell>
    );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: string }) {
    return <article className={`department-stat tone-${tone}`}><strong>{value}</strong><span>{label}</span></article>;
}
