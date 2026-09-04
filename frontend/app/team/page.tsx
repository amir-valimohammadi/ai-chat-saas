"use client";

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
  plan: { name: string | null; limits: { max_agents: number } };
  usage: {
    agents: {
      used: number;
      limit: number;
      remaining: number;
      percent: number;
    };
  };
};

type Site = { id: number; name: string; domain: string };

type TeamIconName =
  | "activity"
  | "close"
  | "globe"
  | "key"
  | "mail"
  | "phone"
  | "plus"
  | "refresh"
  | "search"
  | "shield"
  | "users";

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  password: "",
  site_ids: [] as number[],
};

const roleLabels: Record<string, string> = {
  customer_admin: "مدیر مشتری",
  agent: "پشتیبان",
  super_admin: "سوپر ادمین",
};

function TeamIcon({ name }: { name: TeamIconName }) {
  const paths: Record<TeamIconName, string[]> = {
    activity: ["M4 12h3l2-6 4 12 2-6h5"],
    close: ["M6 6l12 12M18 6 6 18"],
    globe: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18", "M3 12h18", "M12 3c3 3 3 15 0 18", "M12 3c-3 3-3 15 0 18"],
    key: ["M21 2l-2 2m-7.6 7.6a5 5 0 1 1-7.1 7.1 5 5 0 0 1 7.1-7.1ZM14 9l3 3 4-4-3-3"],
    mail: ["M4 5h16v14H4z", "m4 8 8 6 8-6"],
    phone: ["M5 4h4l2 5-3 2a15 15 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2C9.7 21 3 14.3 3 6a2 2 0 0 1 2-2Z"],
    plus: ["M12 5v14M5 12h14"],
    refresh: ["M20 7v5h-5", "M4 17v-5h5", "M6.1 9a7 7 0 0 1 11.7-2L20 12", "M4 12l2.2 5a7 7 0 0 0 11.7-2"],
    search: ["m21 21-4.3-4.3", "M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"],
    shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z", "m9 12 2 2 4-4"],
    users: ["M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M3 21v-2a6 6 0 0 1 12 0v2", "M17 4a4 4 0 0 1 0 7", "M17 15a5 5 0 0 1 4 4v2"],
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name].map((path) => <path key={path} d={path} />)}
    </svg>
  );
}

export default function TeamPage() {
  const router = useRouter();
  const loadRequestRef = useRef(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [planUsage, setPlanUsage] = useState<PlanUsageData | null>(null);

  const agentUsage = planUsage?.usage.agents;
  const isAgentLimitReached = Boolean(
    agentUsage && agentUsage.limit > 0 && agentUsage.used >= agentUsage.limit,
  );

  const stats = useMemo(() => ({
    total: members.length,
    agents: members.filter((member) => member.role === "agent").length,
    admins: members.filter((member) => member.role === "customer_admin").length,
    active: members.filter((member) => member.is_active).length,
    inactive: members.filter((member) => !member.is_active).length,
  }), [members]);

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return members.filter((member) => {
      const siteNames = Array.isArray(member.site_names) ? member.site_names : [];
      const matchesSearch = !query || [
        member.name,
        member.email,
        member.phone,
        member.role,
        roleLabels[member.role],
        ...siteNames,
      ].filter(Boolean).join(" ").toLowerCase().includes(query);
      const matchesRole = roleFilter === "all" || member.role === roleFilter;
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "active" && member.is_active)
        || (statusFilter === "inactive" && !member.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [members, roleFilter, search, statusFilter]);

  const loadPageData = useCallback(async (silent = false) => {
    const requestId = ++loadRequestRef.current;

    try {
      setError("");
      if (silent) setRefreshing(true);
      else setLoading(true);

      const [teamData, sitesData, usageData] = await Promise.all([
        apiRequest("/customer/team-list.php"),
        apiRequest("/customer/sites-list.php"),
        apiRequest("/customer/plan-usage.php").catch(() => null),
      ]);

      if (requestId !== loadRequestRef.current) return;

      setMembers(Array.isArray(teamData.members) ? teamData.members as Member[] : []);
      setSites(Array.isArray(sitesData.sites) ? sitesData.sites as Site[] : []);
      if (usageData) setPlanUsage(usageData as PlanUsageData);
    } catch (caughtError) {
      if (requestId !== loadRequestRef.current) return;
      setError(caughtError instanceof Error ? caughtError.message : "خطا در دریافت اطلاعات تیم");
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
    void loadPageData();
  }, [loadPageData, router]);

  useEffect(() => {
    if (!editorOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !creating) setEditorOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [creating, editorOpen]);

  function updateField(field: "name" | "email" | "phone" | "password", value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleSite(siteId: number) {
    setForm((current) => ({
      ...current,
      site_ids: current.site_ids.includes(siteId)
        ? current.site_ids.filter((id) => id !== siteId)
        : [...current.site_ids, siteId],
    }));
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM, site_ids: [] });
  }

  function openEditor() {
    setError("");
    setSuccess("");
    resetForm();
    setEditorOpen(true);
  }

  function closeEditor() {
    if (!creating) setEditorOpen(false);
  }

  async function handleCreateAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isAgentLimitReached) {
      setError("ظرفیت پشتیبان‌های مجاز در پلن فعلی تکمیل شده است.");
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

    try {
      setCreating(true);
      setError("");
      setSuccess("");
      await apiRequest("/customer/team-create.php", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
        }),
      });
      resetForm();
      setEditorOpen(false);
      setSuccess("پشتیبان جدید ساخته شد و به سایت‌های انتخاب‌شده دسترسی دارد.");
      await loadPageData(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "ساخت پشتیبان ناموفق بود");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell
      title="اعضای تیم"
      kicker="مدیریت دسترسی"
      description="اعضای پاسخ‌گو، سطح دسترسی سایت‌ها و ظرفیت پلن را از یک نمای کاری مدیریت کنید."
      actions={
        <div className="team-header-actions">
          <button
            className={`team-refresh-button ${refreshing ? "is-loading" : ""}`}
            type="button"
            onClick={() => void loadPageData(true)}
            disabled={loading || refreshing || creating}
          >
            <TeamIcon name="refresh" />
            {refreshing ? "در حال بروزرسانی" : "بروزرسانی"}
          </button>
          <button
            className="team-create-button"
            type="button"
            onClick={openEditor}
            disabled={loading || sites.length === 0 || isAgentLimitReached}
            title={isAgentLimitReached ? "ظرفیت پلن تکمیل شده است" : undefined}
          >
            <TeamIcon name="plus" /> پشتیبان جدید
          </button>
        </div>
      }
    >
      <div className="team-shell">
        {error && (
          <div className="team-alert error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="بستن خطا">×</button>
          </div>
        )}
        {success && (
          <div className="team-alert success" role="status">
            <span>{success}</span>
            <button type="button" onClick={() => setSuccess("")} aria-label="بستن پیام">×</button>
          </div>
        )}

        <section className="team-overview" aria-labelledby="team-overview-title">
          <div className="team-overview-main">
            <div className="team-overview-copy">
              <span className="team-overview-icon"><TeamIcon name="users" /></span>
              <div>
                <span>تصویر کلی تیم</span>
                <h2 id="team-overview-title">تیم پاسخ‌گویی شما</h2>
                <p>{stats.admins.toLocaleString("fa-IR")} مدیر، {stats.agents.toLocaleString("fa-IR")} پشتیبان و دسترسی تفکیک‌شده برای هر سایت</p>
              </div>
            </div>
            <PlanUsageCard planUsage={planUsage} isAgentLimitReached={isAgentLimitReached} />
          </div>
          <div className="team-overview-metrics" role="list">
            <TeamMetric label="کل اعضا" value={stats.total} icon="users" />
            <TeamMetric label="پشتیبان‌ها" value={stats.agents} icon="activity" />
            <TeamMetric label="عضو فعال" value={stats.active} icon="shield" />
            <TeamMetric label="غیرفعال" value={stats.inactive} icon="activity" tone="warning" />
          </div>
        </section>

        <section className="team-members-panel" aria-labelledby="team-list-title">
          <header className="team-panel-head">
            <div>
              <span>فهرست دسترسی‌ها</span>
              <h2 id="team-list-title">اعضای تیم</h2>
              <p>{filteredMembers.length.toLocaleString("fa-IR")} عضو از مجموع {members.length.toLocaleString("fa-IR")} عضو نمایش داده می‌شود.</p>
            </div>
          </header>

          <div className="team-toolbar">
            <label className="team-search">
              <span><TeamIcon name="search" /></span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جستجو با نام، ایمیل یا سایت…" />
            </label>
            <label className="team-filter">
              <span>نقش</span>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="all">همه نقش‌ها</option>
                <option value="customer_admin">مدیر مشتری</option>
                <option value="agent">پشتیبان</option>
              </select>
            </label>
            <label className="team-filter">
              <span>وضعیت</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">همه وضعیت‌ها</option>
                <option value="active">فعال</option>
                <option value="inactive">غیرفعال</option>
              </select>
            </label>
          </div>

          {loading ? (
            <div className="team-loading" aria-label="در حال دریافت اعضای تیم"><span /><span /><span /></div>
          ) : members.length === 0 ? (
            <TeamEmptyState title="هنوز عضوی ثبت نشده است" text="اولین پشتیبان را بسازید تا پاسخ‌گویی سایت‌ها شروع شود." action={sites.length > 0 ? openEditor : undefined} />
          ) : filteredMembers.length === 0 ? (
            <TeamEmptyState title="عضوی با این مشخصات پیدا نشد" text="عبارت جستجو یا فیلترها را تغییر دهید." />
          ) : (
            <div className="team-member-list">
              {filteredMembers.map((member) => <MemberCard key={member.id} member={member} />)}
            </div>
          )}
        </section>
      </div>

      {editorOpen && (
        <div className="team-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
          <aside className="team-editor" role="dialog" aria-modal="true" aria-labelledby="team-editor-title">
            <header className="team-editor-header">
              <div><span>حساب پاسخ‌گویی جدید</span><h2 id="team-editor-title">ساخت پشتیبان</h2><p>اطلاعات ورود و سایت‌های قابل دسترس را مشخص کنید.</p></div>
              <button type="button" onClick={closeEditor} disabled={creating} aria-label="بستن فرم"><TeamIcon name="close" /></button>
            </header>

            <form className="team-create-form" onSubmit={handleCreateAgent} noValidate>
              <section className="team-form-section">
                <header><span>۱</span><div><h3>اطلاعات حساب</h3><p>مشخصات ورود پشتیبان</p></div></header>
                <label className="team-field">
                  <span>نام پشتیبان</span>
                  <div><TeamIcon name="users" /><input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="مثلاً پشتیبان فروش" maxLength={120} required /></div>
                </label>
                <label className="team-field">
                  <span>ایمیل ورود</span>
                  <div><TeamIcon name="mail" /><input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} placeholder="support@example.com" maxLength={190} autoComplete="off" dir="ltr" required /></div>
                </label>
                <div className="team-form-two-col">
                  <label className="team-field">
                    <span>شماره تماس</span>
                    <div><TeamIcon name="phone" /><input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} placeholder="اختیاری" maxLength={40} inputMode="tel" dir="ltr" /></div>
                  </label>
                  <label className="team-field">
                    <span>رمز عبور</span>
                    <div><TeamIcon name="key" /><input type="password" value={form.password} onChange={(event) => updateField("password", event.target.value)} placeholder="حداقل ۸ کاراکتر" minLength={8} maxLength={128} autoComplete="new-password" required /></div>
                  </label>
                </div>
              </section>

              <section className="team-form-section">
                <header><span>۲</span><div><h3>دسترسی سایت‌ها</h3><p>محدوده کاری این پشتیبان</p></div></header>
                <div className="team-sites-select-head"><strong>سایت‌های مجاز</strong><span>{form.site_ids.length.toLocaleString("fa-IR")} انتخاب</span></div>
                {sites.length === 0 ? (
                  <p className="team-sites-empty">ابتدا یک سایت فعال بسازید.</p>
                ) : (
                  <div className="team-site-check-list">
                    {sites.map((site) => {
                      const checked = form.site_ids.includes(site.id);
                      return (
                        <label key={site.id} className={checked ? "is-checked" : ""}>
                          <input type="checkbox" checked={checked} onChange={() => toggleSite(site.id)} />
                          <span><strong>{site.name}</strong><small dir="ltr">{site.domain}</small></span>
                          <TeamIcon name="globe" />
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="team-help-text">اگر سایتی انتخاب نکنید، تمام سایت‌های فعال به پشتیبان اختصاص داده می‌شوند.</p>
              </section>

              {isAgentLimitReached && <div className="team-limit-warning">ظرفیت ساخت پشتیبان در پلن فعلی تکمیل شده است.</div>}
              <footer className="team-form-actions">
                <button className="team-cancel-button" type="button" onClick={closeEditor} disabled={creating}>انصراف</button>
                <button className="team-submit-button" type="submit" disabled={creating || isAgentLimitReached || !form.name.trim() || !form.email.trim() || form.password.length < 8}>{creating ? "در حال ساخت…" : "ساخت پشتیبان"}</button>
              </footer>
            </form>
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function TeamMetric({ label, value, icon, tone = "default" }: { label: string; value: number; icon: TeamIconName; tone?: "default" | "warning" }) {
  return <article className={`team-overview-metric tone-${tone}`} role="listitem"><span><TeamIcon name={icon} /></span><div><strong>{value.toLocaleString("fa-IR")}</strong><small>{label}</small></div></article>;
}

function PlanUsageCard({ planUsage, isAgentLimitReached }: { planUsage: PlanUsageData | null; isAgentLimitReached: boolean }) {
  const usage = planUsage?.usage.agents;
  if (!usage) return <div className="team-plan-card is-loading"><span>ظرفیت پلن</span><strong>در حال دریافت…</strong></div>;
  const unlimited = usage.limit <= 0;
  const percent = unlimited ? 0 : Math.max(0, Math.min(usage.percent, 100));

  return (
    <div className={`team-plan-card ${isAgentLimitReached ? "is-full" : ""}`}>
      <div><span>ظرفیت پشتیبان · {planUsage?.plan.name || "پلن فعلی"}</span><strong>{usage.used.toLocaleString("fa-IR")} از {formatLimit(usage.limit)}</strong></div>
      <b>{unlimited ? "نامحدود" : isAgentLimitReached ? "تکمیل" : `${usage.remaining.toLocaleString("fa-IR")} باقی‌مانده`}</b>
      <span className="team-usage-track" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>
    </div>
  );
}

function MemberCard({ member }: { member: Member }) {
  const siteNames = Array.isArray(member.site_names) ? member.site_names : [];
  return (
    <article className={`team-member-card ${member.is_active ? "" : "is-inactive"}`}>
      <div className="team-member-identity">
        <span className="team-avatar">{getInitials(member.name)}</span>
        <div>
          <div><h3>{member.name}</h3><span className={`team-status ${member.is_active ? "is-active" : "is-inactive"}`}>{member.is_active ? "فعال" : "غیرفعال"}</span></div>
          <a href={`mailto:${member.email}`} dir="ltr"><TeamIcon name="mail" /> {member.email}</a>
        </div>
      </div>
      <div className="team-member-facts">
        <div><span>نقش</span><strong>{roleLabels[member.role] || member.role}</strong></div>
        <div><span>آخرین ورود</span><strong>{formatDate(member.last_login_at)}</strong></div>
        <div><span>تاریخ عضویت</span><strong>{formatDate(member.created_at, false)}</strong></div>
        {member.phone && <div><span>شماره تماس</span><strong dir="ltr">{member.phone}</strong></div>}
      </div>
      <div className="team-member-sites">
        <span><TeamIcon name="globe" /> دسترسی سایت‌ها</span>
        <div>{siteNames.length > 0 ? siteNames.map((siteName) => <b key={siteName}>{siteName}</b>) : <small>بدون سایت اختصاصی</small>}</div>
      </div>
    </article>
  );
}

function TeamEmptyState({ title, text, action }: { title: string; text: string; action?: () => void }) {
  return <div className="team-empty-state"><span><TeamIcon name="users" /></span><h3>{title}</h3><p>{text}</p>{action && <button type="button" onClick={action}>ساخت پشتیبان</button>}</div>;
}

function getInitials(name: string) {
  const cleanName = name.trim();
  if (!cleanName) return "پ";
  if (/^[A-Za-z]/.test(cleanName)) return cleanName.slice(0, 2).toUpperCase();
  return cleanName.slice(0, 1);
}

function formatLimit(limit: number) {
  return limit <= 0 ? "نامحدود" : limit.toLocaleString("fa-IR");
}

function formatDate(value: string | null, includeTime = true) {
  if (!value) return "ثبت نشده";
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fa-IR", includeTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
}
