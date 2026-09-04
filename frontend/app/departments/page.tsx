"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type Site = { id: number; name: string; domain: string };
type Member = {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  site_ids: number[];
};
type DepartmentMember = {
  user_id: number;
  name: string;
  email: string;
  is_active: boolean;
  is_online: boolean;
  max_active_conversations: number;
  routing_weight: number;
  active_conversation_count: number;
};
type Department = {
  id: number;
  site_id: number;
  site_name: string;
  site_domain: string;
  name: string;
  description: string | null;
  color: string;
  routing_strategy: "manual" | "round_robin" | "least_busy";
  queue_enabled: boolean;
  queue_message: string | null;
  is_default: boolean;
  is_active: boolean;
  member_count: number;
  waiting_count: number;
  active_count: number;
  members: DepartmentMember[];
};
type MemberDraft = {
  user_id: number;
  enabled: boolean;
  max_active_conversations: number;
  routing_weight: number;
};
type DepartmentForm = {
  department_id: number;
  site_id: string;
  name: string;
  description: string;
  color: string;
  routing_strategy: Department["routing_strategy"];
  queue_enabled: boolean;
  queue_message: string;
  is_default: boolean;
  is_active: boolean;
};
type DepartmentIconName =
  | "activity"
  | "arrow"
  | "close"
  | "edit"
  | "globe"
  | "plus"
  | "queue"
  | "refresh"
  | "routing"
  | "trash"
  | "users";

const EMPTY_FORM: DepartmentForm = {
  department_id: 0,
  site_id: "",
  name: "",
  description: "",
  color: "#0f766e",
  routing_strategy: "round_robin",
  queue_enabled: true,
  queue_message: "درخواست شما در صف پشتیبانی قرار گرفت و به‌زودی پاسخ داده می‌شود.",
  is_default: false,
  is_active: true,
};

const strategyLabels: Record<Department["routing_strategy"], string> = {
  manual: "اختصاص دستی",
  round_robin: "توزیع نوبتی",
  least_busy: "کم‌مشغله‌ترین پشتیبان",
};

function DepartmentIcon({ name }: { name: DepartmentIconName }) {
  const paths: Record<DepartmentIconName, string[]> = {
    activity: ["M4 12h3l2-6 4 12 2-6h5"],
    arrow: ["m9 18 6-6-6-6"],
    close: ["M6 6l12 12M18 6 6 18"],
    edit: ["M4 20h4L19 9l-4-4L4 16z", "m13-13 4 4"],
    globe: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18", "M3 12h18", "M12 3c3 3 3 15 0 18", "M12 3c-3 3-3 15 0 18"],
    plus: ["M12 5v14M5 12h14"],
    queue: ["M5 6h14M5 12h14M5 18h9", "m17 16 3 2-3 2"],
    refresh: ["M20 7v5h-5", "M4 17v-5h5", "M6.1 9a7 7 0 0 1 11.7-2L20 12", "M4 12l2.2 5a7 7 0 0 0 11.7-2"],
    routing: ["M5 5h6v5", "M19 19h-6v-5", "M11 7H8a3 3 0 0 0-3 3v4", "M13 17h3a3 3 0 0 0 3-3v-4"],
    trash: ["M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13", "M10 11v5M14 11v5"],
    users: ["M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M3 21v-2a6 6 0 0 1 12 0v2", "M17 4a4 4 0 0 1 0 7", "M17 15a5 5 0 0 1 4 4v2"],
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name].map((path) => <path key={path} d={path} />)}
    </svg>
  );
}

export default function DepartmentsPage() {
  const router = useRouter();
  const loadRequestRef = useRef(0);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [team, setTeam] = useState<Member[]>([]);
  const [form, setForm] = useState<DepartmentForm>(EMPTY_FORM);
  const [memberDrafts, setMemberDrafts] = useState<MemberDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [queueLoading, setQueueLoading] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [siteFilter, setSiteFilter] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const filteredDepartments = useMemo(
    () => siteFilter
      ? departments.filter((item) => item.site_id === Number(siteFilter))
      : departments,
    [departments, siteFilter]
  );
  const selectedSiteId = Number(form.site_id || 0);
  const availableMembers = useMemo(
    () => team.filter(
      (member) => member.is_active
        && (
          member.role === "customer_admin"
          || (Array.isArray(member.site_ids) && member.site_ids.includes(selectedSiteId))
        )
    ),
    [team, selectedSiteId]
  );
  const editingDepartment = useMemo(
    () => departments.find((item) => item.id === form.department_id) || null,
    [departments, form.department_id]
  );
  const stats = useMemo(() => ({
    total: departments.filter((item) => item.is_active).length,
    waiting: departments.reduce((sum, item) => sum + item.waiting_count, 0),
    active: departments.reduce((sum, item) => sum + item.active_count, 0),
    members: new Set(
      departments.flatMap((item) => item.members.filter((member) => member.is_active).map((member) => member.user_id))
    ).size,
  }), [departments]);

  const loadData = useCallback(async (silent = false) => {
    const requestId = ++loadRequestRef.current;
    try {
      setError("");
      if (silent) setRefreshing(true);
      else setLoading(true);

      const [departmentData, sitesData, teamData] = await Promise.all([
        apiRequest("/customer/departments-list.php"),
        apiRequest("/customer/sites-list.php"),
        apiRequest("/customer/team-list.php"),
      ]);
      if (requestId !== loadRequestRef.current) return;

      const nextDepartments = Array.isArray(departmentData.departments)
        ? departmentData.departments as Department[]
        : [];
      const nextSites = Array.isArray(sitesData.sites) ? sitesData.sites as Site[] : [];
      const nextTeam = Array.isArray(teamData.members) ? teamData.members as Member[] : [];
      setDepartments(nextDepartments);
      setSites(nextSites);
      setTeam(nextTeam);
      setForm((current) => current.site_id || nextSites.length === 0
        ? current
        : { ...current, site_id: String(nextSites[0].id) });
    } catch (caughtError) {
      if (requestId !== loadRequestRef.current) return;
      setError(
        caughtError instanceof Error ? caughtError.message : "خطا در دریافت دپارتمان‌ها"
      );
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

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
    void loadData();
  }, [loadData, router]);

  useEffect(() => {
    if (!editorOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) setEditorOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editorOpen, saving]);

  function initialSiteId() {
    return siteFilter || (sites[0] ? String(sites[0].id) : "");
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM, site_id: initialSiteId() });
    setMemberDrafts([]);
  }

  function openCreateEditor() {
    setError("");
    setSuccess("");
    resetForm();
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setEditorOpen(false);
  }

  function editDepartment(department: Department) {
    setError("");
    setSuccess("");
    setForm({
      department_id: department.id,
      site_id: String(department.site_id),
      name: department.name,
      description: department.description || "",
      color: /^#[0-9a-f]{6}$/i.test(department.color) ? department.color : "#0f766e",
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
    setEditorOpen(true);
  }

  function getMemberDraft(userId: number) {
    return memberDrafts.find((item) => item.user_id === userId) || {
      user_id: userId,
      enabled: false,
      max_active_conversations: 5,
      routing_weight: 1,
    };
  }

  function updateMember(userId: number, patch: Partial<MemberDraft>) {
    setMemberDrafts((current) => {
      const existing = current.find((item) => item.user_id === userId);
      if (!existing) {
        return [...current, {
          user_id: userId,
          enabled: false,
          max_active_conversations: 5,
          routing_weight: 1,
          ...patch,
        }];
      }
      return current.map((item) => item.user_id === userId ? { ...item, ...patch } : item);
    });
  }

  async function saveDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.site_id || !form.name.trim()) {
      setError("سایت و نام دپارتمان الزامی است.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const result = await apiRequest("/customer/department-save.php", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          site_id: Number(form.site_id),
          name: form.name.trim(),
          description: form.description.trim(),
          queue_message: form.queue_message.trim(),
        }),
      });
      const departmentId = Number(result.department_id || form.department_id);

      try {
        await apiRequest("/customer/department-members-update.php", {
          method: "POST",
          body: JSON.stringify({
            department_id: departmentId,
            members: memberDrafts.filter((item) => item.enabled).map((item) => ({
              user_id: item.user_id,
              is_active: true,
              max_active_conversations: Math.max(1, Math.min(100, item.max_active_conversations || 1)),
              routing_weight: Math.max(1, Math.min(20, item.routing_weight || 1)),
            })),
          }),
        });
      } catch (memberError) {
        setError(
          `اطلاعات دپارتمان ذخیره شد، اما بروزرسانی اعضا کامل نشد: ${
            memberError instanceof Error ? memberError.message : "خطای نامشخص"
          }`
        );
        setEditorOpen(false);
        await loadData(true);
        return;
      }

      setSuccess(form.department_id ? "تغییرات دپارتمان ذخیره شد." : "دپارتمان جدید ساخته شد.");
      setEditorOpen(false);
      resetForm();
      await loadData(true);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "ذخیره دپارتمان ناموفق بود"
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteDepartment(department: Department) {
    if (!window.confirm(`دپارتمان «${department.name}» حذف شود؟`)) return;
    try {
      setDeletingId(department.id);
      setError("");
      setSuccess("");
      await apiRequest("/customer/department-delete.php", {
        method: "POST",
        body: JSON.stringify({ department_id: department.id }),
      });
      setSuccess("دپارتمان حذف شد.");
      if (form.department_id === department.id) setEditorOpen(false);
      await loadData(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "حذف ناموفق بود");
    } finally {
      setDeletingId(null);
    }
  }

  async function processQueue(departmentId: number) {
    try {
      setQueueLoading(departmentId);
      setError("");
      setSuccess("");
      const data = await apiRequest("/agent/queue-process.php", {
        method: "POST",
        body: JSON.stringify({ department_id: departmentId, limit: 25 }),
      });
      setSuccess(`${data.result?.assigned || 0} گفتگو از صف به پشتیبان‌ها اختصاص داده شد.`);
      await loadData(true);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "پردازش صف ناموفق بود"
      );
    } finally {
      setQueueLoading(null);
    }
  }

  return (
    <AppShell
      title="دپارتمان‌ها"
      kicker="مسیردهی گفتگو"
      description="واحدهای پاسخ‌گویی، ظرفیت اعضا و صف انتظار را از یک نمای کاری مدیریت کنید."
      actions={
        <div className="department-header-actions">
          <button
            className={`department-refresh-button ${refreshing ? "is-loading" : ""}`}
            type="button"
            onClick={() => void loadData(true)}
            disabled={loading || refreshing || saving}
          >
            <DepartmentIcon name="refresh" />
            <span>{refreshing ? "در حال بروزرسانی" : "بروزرسانی"}</span>
          </button>
          <button
            className="department-create-button"
            type="button"
            onClick={openCreateEditor}
            disabled={loading || sites.length === 0}
          >
            <DepartmentIcon name="plus" /> دپارتمان جدید
          </button>
        </div>
      }
    >
      <div className="department-shell">
        {error && (
          <div className="department-alert error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="بستن خطا">×</button>
          </div>
        )}
        {success && (
          <div className="department-alert success" role="status">
            <span>{success}</span>
            <button type="button" onClick={() => setSuccess("")} aria-label="بستن پیام">×</button>
          </div>
        )}

        <section className="department-overview" aria-labelledby="department-overview-title">
          <div className="department-overview-copy">
            <span className="department-overview-icon"><DepartmentIcon name="routing" /></span>
            <div>
              <span>تصویر کلی مسیردهی</span>
              <h2 id="department-overview-title">وضعیت پاسخ‌گویی تیم</h2>
              <p>صف‌ها و ظرفیت پشتیبان‌ها را ببینید و فقط در صورت نیاز تنظیمات هر واحد را باز کنید.</p>
            </div>
          </div>
          <div className="department-overview-metrics" role="list">
            <DepartmentMetric label="دپارتمان فعال" value={stats.total} icon="routing" />
            <DepartmentMetric label="گفتگوی فعال" value={stats.active} icon="activity" />
            <DepartmentMetric label="در صف انتظار" value={stats.waiting} icon="queue" tone="warning" />
            <DepartmentMetric label="پشتیبان عضو" value={stats.members} icon="users" />
          </div>
        </section>

        <section className="department-list-panel" aria-labelledby="department-list-title">
          <header className="department-list-header">
            <div>
              <span>ساختار پاسخ‌گویی</span>
              <h2 id="department-list-title">دپارتمان‌های موجود</h2>
              <p>{filteredDepartments.length.toLocaleString("fa-IR")} دپارتمان در این نما</p>
            </div>
            <label className="department-site-filter">
              <span>فیلتر سایت</span>
              <select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)}>
                <option value="">همه سایت‌ها</option>
                {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </label>
          </header>

          {loading ? (
            <div className="department-loading" aria-label="در حال دریافت دپارتمان‌ها">
              <span /><span /><span />
            </div>
          ) : sites.length === 0 ? (
            <div className="department-empty">
              <span><DepartmentIcon name="globe" /></span>
              <h3>ابتدا یک سایت بسازید</h3>
              <p>هر دپارتمان باید به یک سایت متصل باشد. پس از ساخت سایت، تنظیم مسیردهی فعال می‌شود.</p>
              <Link className="department-empty-action" href="/sites">رفتن به مدیریت سایت‌ها</Link>
            </div>
          ) : filteredDepartments.length === 0 ? (
            <div className="department-empty">
              <span><DepartmentIcon name="routing" /></span>
              <h3>دپارتمانی در این نما وجود ندارد</h3>
              <p>{siteFilter ? "برای سایت انتخاب‌شده هنوز دپارتمانی نساخته‌اید." : "اولین واحد پاسخ‌گویی را برای تیم خود بسازید."}</p>
              <button className="department-empty-action" type="button" onClick={openCreateEditor}>ساخت دپارتمان</button>
            </div>
          ) : (
            <div className="department-card-list">
              {filteredDepartments.map((department) => (
                <DepartmentCard
                  key={department.id}
                  department={department}
                  queueLoading={queueLoading === department.id}
                  deleting={deletingId === department.id}
                  onEdit={() => editDepartment(department)}
                  onProcessQueue={() => void processQueue(department.id)}
                  onDelete={() => void deleteDepartment(department)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {editorOpen && (
        <div
          className="department-editor-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditor();
          }}
        >
          <aside
            className="department-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="department-editor-title"
          >
            <header className="department-editor-header">
              <div>
                <span>{form.department_id ? "ویرایش تنظیمات" : "واحد پاسخ‌گویی جدید"}</span>
                <h2 id="department-editor-title">
                  {form.department_id ? form.name || "ویرایش دپارتمان" : "ساخت دپارتمان"}
                </h2>
                <p>مشخصات، روش توزیع و اعضای این واحد را تنظیم کنید.</p>
              </div>
              <button type="button" onClick={closeEditor} disabled={saving} aria-label="بستن ویرایشگر">
                <DepartmentIcon name="close" />
              </button>
            </header>

            <form className="department-form" onSubmit={saveDepartment} noValidate>
              <section className="department-form-section">
                <header><span>۱</span><div><h3>اطلاعات پایه</h3><p>نام و سایت میزبان دپارتمان</p></div></header>
                <label className="department-field">
                  <span>سایت</span>
                  <select
                    value={form.site_id}
                    disabled={form.department_id > 0}
                    onChange={(event) => {
                      setForm((current) => ({ ...current, site_id: event.target.value }));
                      setMemberDrafts([]);
                    }}
                    required
                  >
                    <option value="">انتخاب سایت</option>
                    {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                  </select>
                  {form.department_id > 0 && <small>سایت دپارتمان بعد از ساخت قابل تغییر نیست.</small>}
                </label>
                <div className="department-two-col">
                  <label className="department-field">
                    <span>نام دپارتمان</span>
                    <input
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="مثلاً فروش یا پشتیبانی"
                      maxLength={120}
                      required
                    />
                  </label>
                  <label className="department-field department-color-field">
                    <span>رنگ نشانگر</span>
                    <input
                      className="department-color"
                      type="color"
                      value={form.color}
                      onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
                    />
                  </label>
                </div>
                <label className="department-field">
                  <span>توضیحات</span>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="وظیفه این واحد را کوتاه توضیح دهید."
                    maxLength={500}
                  />
                  <small>{form.description.length.toLocaleString("fa-IR")} از ۵۰۰ نویسه</small>
                </label>
              </section>

              <section className="department-form-section">
                <header><span>۲</span><div><h3>مسیردهی و صف</h3><p>روش تقسیم گفتگو بین اعضا</p></div></header>
                <label className="department-field">
                  <span>روش توزیع گفتگو</span>
                  <select
                    value={form.routing_strategy}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      routing_strategy: event.target.value as Department["routing_strategy"],
                    }))}
                  >
                    {Object.entries(strategyLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="department-toggle-row">
                  <input
                    type="checkbox"
                    checked={form.queue_enabled}
                    onChange={(event) => setForm((current) => ({ ...current, queue_enabled: event.target.checked }))}
                  />
                  <span><strong>صف انتظار فعال باشد</strong><small>وقتی پشتیبان آزاد نیست، گفتگو در صف می‌ماند.</small></span>
                </label>
                {form.queue_enabled && (
                  <label className="department-field">
                    <span>پیام صف برای کاربر</span>
                    <textarea
                      rows={2}
                      value={form.queue_message}
                      onChange={(event) => setForm((current) => ({ ...current, queue_message: event.target.value }))}
                      maxLength={500}
                    />
                  </label>
                )}
                <div className="department-toggle-grid">
                  <label className="department-toggle-row">
                    <input
                      type="checkbox"
                      checked={form.is_default}
                      disabled={Boolean(editingDepartment?.is_default)}
                      onChange={(event) => setForm((current) => ({ ...current, is_default: event.target.checked }))}
                    />
                    <span><strong>پیش‌فرض سایت</strong><small>گفتگوهای بدون انتخاب به این واحد می‌روند.</small></span>
                  </label>
                  <label className="department-toggle-row">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      disabled={Boolean(editingDepartment?.is_default)}
                      onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                    />
                    <span><strong>دپارتمان فعال</strong><small>واحد در دسترس کاربران و تیم باشد.</small></span>
                  </label>
                </div>
                {editingDepartment?.is_default && (
                  <p className="department-default-note">برای غیرفعال‌کردن این واحد، ابتدا دپارتمان فعال دیگری را پیش‌فرض کنید.</p>
                )}
              </section>

              <section className="department-form-section department-members-section">
                <header><span>۳</span><div><h3>اعضای دپارتمان</h3><p>ظرفیت و سهم هر پشتیبان در توزیع خودکار</p></div></header>
                {selectedSiteId <= 0 ? (
                  <p className="department-members-empty">ابتدا سایت را انتخاب کنید.</p>
                ) : availableMembers.length === 0 ? (
                  <p className="department-members-empty">برای این سایت پشتیبان فعالی تعریف نشده است.</p>
                ) : (
                  <div className="department-member-list">
                    {availableMembers.map((member) => {
                      const draft = getMemberDraft(member.id);
                      return (
                        <article key={member.id} className={`department-member ${draft.enabled ? "is-enabled" : ""}`}>
                          <label className="department-member-main">
                            <input
                              type="checkbox"
                              checked={draft.enabled}
                              onChange={(event) => updateMember(member.id, { enabled: event.target.checked })}
                            />
                            <span>
                              <strong>{member.name}</strong>
                              <small>{member.email} · {member.role === "agent" ? "پشتیبان" : "مدیر"}</small>
                            </span>
                          </label>
                          {draft.enabled && (
                            <div className="department-member-config">
                              <label>
                                <span>ظرفیت گفتگو</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={draft.max_active_conversations}
                                  onChange={(event) => updateMember(member.id, {
                                    max_active_conversations: Number(event.target.value),
                                  })}
                                />
                              </label>
                              <label>
                                <span>وزن توزیع</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={20}
                                  value={draft.routing_weight}
                                  onChange={(event) => updateMember(member.id, {
                                    routing_weight: Number(event.target.value),
                                  })}
                                />
                              </label>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <footer className="department-form-actions">
                <button className="button button-secondary" type="button" onClick={closeEditor} disabled={saving}>انصراف</button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={saving || !form.site_id || !form.name.trim()}
                >
                  {saving ? "در حال ذخیره…" : form.department_id ? "ذخیره تغییرات" : "ساخت دپارتمان"}
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function DepartmentMetric({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: DepartmentIconName;
  tone?: "default" | "warning";
}) {
  return (
    <article className={`department-overview-metric tone-${tone}`} role="listitem">
      <span><DepartmentIcon name={icon} /></span>
      <div><strong>{value.toLocaleString("fa-IR")}</strong><small>{label}</small></div>
    </article>
  );
}

function DepartmentCard({
  department,
  queueLoading,
  deleting,
  onEdit,
  onProcessQueue,
  onDelete,
}: {
  department: Department;
  queueLoading: boolean;
  deleting: boolean;
  onEdit: () => void;
  onProcessQueue: () => void;
  onDelete: () => void;
}) {
  const activeMembers = department.members.filter((member) => member.is_active);
  const onlineMembers = activeMembers.filter((member) => member.is_online).length;
  const departmentColor = /^#[0-9a-f]{6}$/i.test(department.color)
    ? department.color
    : "#0f766e";

  return (
    <article className={`department-item ${department.is_active ? "" : "is-inactive"}`}>
      <i className="department-color-bar" style={{ background: departmentColor }} />
      <header className="department-item-head">
        <div className="department-item-title">
          <span className="department-mark" style={{ color: departmentColor, background: `${departmentColor}16` }}>
            {department.name.trim().slice(0, 1) || "د"}
          </span>
          <div>
            <div>
              <h3>{department.name}</h3>
              {department.is_default && <span className="department-badge default">پیش‌فرض</span>}
              {!department.is_active && <span className="department-badge inactive">غیرفعال</span>}
            </div>
            <a href={normalizeSiteHref(department.site_domain)} target="_blank" rel="noreferrer">
              <DepartmentIcon name="globe" /> {department.site_name}
            </a>
          </div>
        </div>
        <button className="department-edit-button" type="button" onClick={onEdit}>
          <DepartmentIcon name="edit" /> ویرایش
        </button>
      </header>

      <p className="department-description">
        {department.description || "برای این دپارتمان توضیحی ثبت نشده است."}
      </p>

      <div className="department-facts">
        <div>
          <span><DepartmentIcon name="routing" /></span>
          <p>روش توزیع</p>
          <strong>{strategyLabels[department.routing_strategy]}</strong>
        </div>
        <div>
          <span><DepartmentIcon name="users" /></span>
          <p>تیم پاسخ‌گو</p>
          <strong>{activeMembers.length} عضو · {onlineMembers} آنلاین</strong>
        </div>
        <div className={department.waiting_count > 0 ? "has-waiting" : ""}>
          <span><DepartmentIcon name="queue" /></span>
          <p>بار کاری</p>
          <strong>{department.active_count} فعال · {department.waiting_count} در صف</strong>
        </div>
      </div>

      <div className="department-item-footer">
        <div className="department-member-preview" aria-label="اعضای فعال">
          {activeMembers.length === 0 ? (
            <span className="department-no-members">بدون عضو فعال</span>
          ) : (
            <>
              {activeMembers.slice(0, 4).map((member) => (
                <span
                  key={member.user_id}
                  className={member.is_online ? "is-online" : ""}
                  title={`${member.name} · ${member.active_conversation_count} از ${member.max_active_conversations} گفتگو`}
                >
                  {member.name.trim().slice(0, 1) || "پ"}
                </span>
              ))}
              {activeMembers.length > 4 && <b>+{activeMembers.length - 4}</b>}
            </>
          )}
        </div>

        <div className="department-actions">
          {department.waiting_count > 0 && (
            <button type="button" onClick={onProcessQueue} disabled={queueLoading || deleting}>
              <DepartmentIcon name="queue" /> {queueLoading ? "در حال پردازش…" : "پردازش صف"}
            </button>
          )}
          {!department.is_default && (
            <button className="danger" type="button" onClick={onDelete} disabled={deleting || queueLoading}>
              <DepartmentIcon name="trash" /> {deleting ? "در حال حذف…" : "حذف"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function normalizeSiteHref(domain: string) {
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}
