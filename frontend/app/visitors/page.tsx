"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest } from "@/lib/api";

type PresenceStatus = "online" | "idle" | "offline";
type Visitor = {
  id: number;
  site: { id: number; name: string };
  name: string | null;
  email: string | null;
  phone: string | null;
  browser_id: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  presence_status: PresenceStatus;
  current_page_url: string | null;
  current_page_title: string | null;
  referrer_url: string | null;
  device_type: string;
  browser_name: string | null;
  operating_system: string | null;
  session_count: number;
  session: { id: number; started_at: string; page_view_count: number; total_active_seconds: number; widget_open: boolean } | null;
  active_conversation_id: number | null;
  pending_invite_count: number;
};

type VisitorDetails = {
  visitor: Visitor & { presence_status: PresenceStatus };
  sessions: Array<{ id: number; started_at: string; last_seen_at: string; ended_at: string | null; page_view_count: number; total_active_seconds: number; widget_open: boolean; is_active: boolean; first_page_url: string | null; last_page_url: string | null }>;
  page_views: Array<{ id: number; page_url: string; page_title: string | null; referrer_url: string | null; entered_at: string; last_seen_at: string; duration_seconds: number; is_current: boolean }>;
  conversations: Array<{ id: number; status: string; created_at: string; last_message_at: string | null; department_name: string | null; assigned_agent_name: string | null }>;
  departments: Array<{ id: number; name: string; color: string; is_default: boolean }>;
  invites: Array<{ id: number; conversation_id: number; message_preview: string; status: string; created_at: string; expires_at: string }>;
};

const statusLabels: Record<PresenceStatus, string> = { online: "آنلاین", idle: "غیرفعال", offline: "آفلاین" };
const deviceLabels: Record<string, string> = { desktop: "دسکتاپ", mobile: "موبایل", tablet: "تبلت", bot: "ربات", unknown: "نامشخص" };

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatDuration(seconds = 0) {
  if (seconds < 60) return `${Math.max(0, seconds)} ثانیه`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} دقیقه`;
  return `${Math.floor(seconds / 3600)} ساعت و ${Math.floor((seconds % 3600) / 60)} دقیقه`;
}

function safeHost(url?: string | null) {
  if (!url) return "ورود مستقیم";
  try { return new URL(url).hostname || url; } catch { return url; }
}

function VisitorsEmptyIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M18 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm28 2a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" />
      <path d="M4 48c0-10 6-17 14-17s14 7 14 17M34 48c0-8 5-14 12-14s12 6 12 14" />
      <path d="M9 54h46" />
    </svg>
  );
}

export default function VisitorsPage() {
  const router = useRouter();
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [sites, setSites] = useState<Array<{ id: number; name: string }>>([]);
  const [stats, setStats] = useState({ online: 0, idle: 0, offline: 0 });
  const [filters, setFilters] = useState({ q: "", status: "online", site_id: "", device: "" });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<VisitorDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("سلام، اگر درباره این صفحه سؤالی دارید در خدمتتان هستیم.");
  const [departmentId, setDepartmentId] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: "50", status: filters.status });
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.site_id) params.set("site_id", filters.site_id);
    if (filters.device) params.set("device", filters.device);
    return params.toString();
  }, [filters, page]);

  const hasActiveFilters = Boolean(filters.q || filters.site_id || filters.device || filters.status !== "online");

  function clearFilters() {
    setFilters({ q: "", status: "online", site_id: "", device: "" });
  }

  async function loadVisitors(silent = false) {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError("");
      const data = await apiRequest(`/agent/visitors-online-list.php?${query}`);
      setVisitors(data.visitors || []);
      setSites(data.sites || []);
      setStats(data.stats || { online: 0, idle: 0, offline: 0 });
      setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
    } catch (e) { setError(e instanceof Error ? e.message : "خطا در دریافت بازدیدکنندگان"); }
    finally { setLoading(false); setRefreshing(false); }
  }

  async function openVisitor(visitorId: number) {
    try {
      setDetailsLoading(true); setError("");
      const data = await apiRequest(`/agent/visitor-show.php?visitor_id=${visitorId}`);
      setSelected(data);
      const defaultDepartment = (data.departments || []).find((item: { is_default: boolean }) => item.is_default) || data.departments?.[0];
      setDepartmentId(defaultDepartment ? String(defaultDepartment.id) : "");
      setInviteOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "خطا در دریافت جزئیات"); }
    finally { setDetailsLoading(false); }
  }

  async function sendInvite() {
    if (!selected || !departmentId || !inviteMessage.trim()) return;
    try {
      setInviteLoading(true); setError(""); setNotice("");
      const data = await apiRequest("/agent/visitor-invite.php", {
        method: "POST",
        body: JSON.stringify({ visitor_id: selected.visitor.id, department_id: Number(departmentId), message: inviteMessage.trim() }),
      });
      setNotice("دعوت گفتگو برای بازدیدکننده ارسال شد.");
      setInviteOpen(false);
      await Promise.all([loadVisitors(true), openVisitor(selected.visitor.id)]);
      if (data.invite?.conversation_id) {
        window.setTimeout(() => setNotice(`دعوت ارسال شد؛ شناسه گفتگو ${data.invite.conversation_id} است.`), 50);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "ارسال دعوت ناموفق بود"); }
    finally { setInviteLoading(false); }
  }

  useEffect(() => { setPage(1); }, [filters.q, filters.status, filters.site_id, filters.device]);
  useEffect(() => { loadVisitors(false); }, [query]);
  useEffect(() => {
    const timer = window.setInterval(() => loadVisitors(true), 15000);
    return () => window.clearInterval(timer);
  }, [query]);

  return (
    <AppShell title="بازدیدکنندگان سایت" kicker="حضور زنده" description="رفتار کاربران را ببینید و در بهترین لحظه گفتگو را آغاز کنید" actions={<button className="button button-secondary" onClick={() => loadVisitors(true)} disabled={refreshing}>{refreshing ? "در حال بروزرسانی…" : "بروزرسانی زنده"}</button>}>
      <div className="visitors-page">
        {error && <div className="alert alert-danger">{error}</div>}
        {notice && <div className="alert alert-success">{notice}</div>}

        <section className="visitor-command-card">
          <div className="visitor-command-copy">
            <span className="visitor-command-live"><i /> پایش لحظه‌ای فعال است</span>
            <h2>چه کسانی همین حالا در سایت شما هستند؟</h2>
            <p>وضعیت حضور، صفحه فعلی و مسیر هر بازدیدکننده را بررسی کنید و بدون جابه‌جایی بین چند ابزار، گفتگو را شروع کنید.</p>
          </div>
          <div className="visitor-command-total">
            <span>حاضر در سایت</span>
            <strong>{stats.online + stats.idle}</strong>
            <small>{stats.online} نفر آنلاین</small>
          </div>
        </section>

        <section className="visitor-stats-grid" aria-label="فیلتر وضعیت بازدیدکنندگان">
          <button className={`visitor-stat-card online ${filters.status === "online" ? "active" : ""}`} onClick={() => setFilters((f) => ({ ...f, status: "online" }))}>
            <span className="visitor-stat-copy"><i /><b>آنلاین</b><small>فعال در همین لحظه</small></span><strong>{stats.online}</strong>
          </button>
          <button className={`visitor-stat-card idle ${filters.status === "idle" ? "active" : ""}`} onClick={() => setFilters((f) => ({ ...f, status: "idle" }))}>
            <span className="visitor-stat-copy"><i /><b>غیرفعال</b><small>بدون تعامل اخیر</small></span><strong>{stats.idle}</strong>
          </button>
          <button className={`visitor-stat-card offline ${filters.status === "offline" ? "active" : ""}`} onClick={() => setFilters((f) => ({ ...f, status: "offline" }))}>
            <span className="visitor-stat-copy"><i /><b>آفلاین</b><small>بازدیدهای قبلی</small></span><strong>{stats.offline}</strong>
          </button>
          <button className={`visitor-stat-card all ${filters.status === "all" ? "active" : ""}`} onClick={() => setFilters((f) => ({ ...f, status: "all" }))}>
            <span className="visitor-stat-copy"><i /><b>همه</b><small>نمای کامل مخاطبان</small></span><strong>{stats.online + stats.idle + stats.offline}</strong>
          </button>
        </section>

        <section className="visitor-filters-card">
          <header className="visitor-section-heading">
            <div><span>جست‌وجو و تفکیک</span><h2>فیلتر بازدیدکنندگان</h2></div>
            {hasActiveFilters && <button className="visitor-clear-filters" onClick={clearFilters}>پاک‌کردن فیلترها</button>}
          </header>
          <div className="visitor-filters">
            <label className="visitor-search-field"><span>جست‌وجو</span><input className="input" placeholder="نام، تلفن، ایمیل یا صفحه…" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} /></label>
            <label><span>سایت</span><select className="select" value={filters.site_id} onChange={(e) => setFilters((f) => ({ ...f, site_id: e.target.value }))}><option value="">همه سایت‌ها</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
            <label><span>دستگاه</span><select className="select" value={filters.device} onChange={(e) => setFilters((f) => ({ ...f, device: e.target.value }))}><option value="">همه دستگاه‌ها</option><option value="desktop">دسکتاپ</option><option value="mobile">موبایل</option><option value="tablet">تبلت</option><option value="bot">ربات</option></select></label>
          </div>
        </section>

        <section className="visitor-table-panel">
          <header className="visitor-table-head">
            <div><span>فهرست مخاطبان</span><h2>{filters.status === "all" ? "همه بازدیدکنندگان" : `بازدیدکنندگان ${filters.status === "online" ? "آنلاین" : filters.status === "idle" ? "غیرفعال" : "آفلاین"}`}</h2></div>
            <b>{pagination.total} نفر</b>
          </header>

          {loading ? (
            <div className="visitor-loading-state"><span /><span /><span /></div>
          ) : visitors.length === 0 ? (
            <div className="visitor-empty-state">
              <span className="visitor-empty-visual"><VisitorsEmptyIcon /></span>
              <div><span>نتیجه‌ای پیدا نشد</span><h3>بازدیدکننده‌ای با این فیلتر وجود ندارد</h3><p>فیلترها را تغییر دهید یا کمی بعد دوباره بررسی کنید؛ فهرست هر ۱۵ ثانیه به‌صورت خودکار بروزرسانی می‌شود.</p></div>
              <div className="visitor-empty-actions"><button className="button button-primary" onClick={clearFilters}>نمایش افراد آنلاین</button><button className="button button-secondary" onClick={() => loadVisitors(true)}>بررسی دوباره</button></div>
            </div>
          ) : (
            <div className="visitor-table-wrap"><table className="visitor-table"><thead><tr><th>بازدیدکننده</th><th>وضعیت</th><th>صفحه فعلی</th><th>دستگاه</th><th>جلسه</th><th>عملیات</th></tr></thead><tbody>
              {visitors.map((item) => <tr key={item.id} className={item.presence_status === "online" ? "live-row" : ""}>
                <td><div className="visitor-identity"><span className={`presence-dot ${item.presence_status}`} /><div><strong>{item.name || `بازدیدکننده #${item.id}`}</strong><small>{item.phone || item.email || item.site.name}</small></div></div></td>
                <td><span className={`presence-badge ${item.presence_status}`}>{statusLabels[item.presence_status]}</span><small className="visitor-muted">{formatDate(item.last_seen_at)}</small></td>
                <td><strong>{item.current_page_title || "بدون عنوان"}</strong>{item.current_page_url ? <a href={item.current_page_url} target="_blank" rel="noreferrer">{safeHost(item.current_page_url)}</a> : <small>آدرس ثبت نشده</small>}</td>
                <td><span>{deviceLabels[item.device_type] || item.device_type}</span><small>{item.browser_name || "—"} · {item.operating_system || "—"}</small></td>
                <td><span>{item.session?.page_view_count || 0} صفحه</span><small>{formatDuration(item.session?.total_active_seconds || 0)}</small></td>
                <td><div className="visitor-row-actions"><button className="button button-secondary button-sm" onClick={() => openVisitor(item.id)}>جزئیات</button>{item.active_conversation_id ? <button className="button button-primary button-sm" onClick={() => router.push(`/conversations/${item.active_conversation_id}`)}>گفتگو</button> : <button className="button button-primary button-sm" disabled={item.presence_status === "offline"} onClick={async () => { await openVisitor(item.id); setInviteOpen(true); }}>شروع گفتگو</button>}</div></td>
              </tr>)}
            </tbody></table></div>
          )}

          {!loading && visitors.length > 0 && <div className="visitor-pagination"><span>نمایش {visitors.length} از {pagination.total} بازدیدکننده</span><div><button className="visitor-page-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>قبلی</button><span>صفحه <b>{pagination.page}</b> از {pagination.pages}</span><button className="visitor-page-button" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>بعدی</button></div></div>}
        </section>
      </div>

      {(selected || detailsLoading) && <div className="visitor-drawer-backdrop" onClick={() => setSelected(null)}><aside className="visitor-drawer" onClick={(e) => e.stopPropagation()}>
        <button className="visitor-drawer-close" onClick={() => setSelected(null)}>×</button>
        {detailsLoading || !selected ? <div className="empty-state">در حال دریافت جزئیات…</div> : <>
          <div className="visitor-drawer-header"><span className={`presence-dot ${selected.visitor.presence_status}`} /><div><h2>{selected.visitor.name || `بازدیدکننده #${selected.visitor.id}`}</h2><p>{selected.visitor.site.name} · {statusLabels[selected.visitor.presence_status]}</p></div></div>
          <div className="visitor-profile-grid"><div><span>تماس</span><strong>{selected.visitor.phone || selected.visitor.email || "ثبت نشده"}</strong></div><div><span>دستگاه</span><strong>{deviceLabels[selected.visitor.device_type]} · {selected.visitor.browser_name}</strong></div><div><span>اولین بازدید</span><strong>{formatDate(selected.visitor.first_seen_at)}</strong></div><div><span>منبع ورود</span><strong>{safeHost(selected.visitor.referrer_url)}</strong></div></div>
          <div className="visitor-current-page"><span>صفحه فعلی</span><strong>{selected.visitor.current_page_title || "بدون عنوان"}</strong>{selected.visitor.current_page_url && <a href={selected.visitor.current_page_url} target="_blank" rel="noreferrer">بازکردن صفحه ↗</a>}</div>
          <div className="visitor-drawer-actions">{selected.visitor.presence_status !== "offline" && <button className="button button-primary" onClick={() => setInviteOpen(true)}>شروع گفتگو</button>}{selected.conversations[0] && <button className="button button-secondary" onClick={() => router.push(`/conversations/${selected.conversations[0].id}`)}>آخرین گفتگو</button>}</div>

          {inviteOpen && <div className="visitor-invite-box"><h3>پیام آغاز گفتگو</h3><select className="select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>{selected.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select><textarea className="textarea" rows={4} maxLength={5000} value={inviteMessage} onChange={(e) => setInviteMessage(e.target.value)} /><div><button className="button button-primary" disabled={inviteLoading || !departmentId || !inviteMessage.trim()} onClick={sendInvite}>{inviteLoading ? "در حال ارسال…" : "ارسال دعوت"}</button><button className="button button-secondary" onClick={() => setInviteOpen(false)}>لغو</button></div></div>}

          <section className="visitor-journey"><h3>مسیر بازدید</h3>{selected.page_views.length === 0 ? <p className="visitor-muted">هنوز صفحه‌ای ثبت نشده است.</p> : <div className="visitor-timeline">{selected.page_views.map((view) => <div className={`visitor-timeline-item ${view.is_current ? "current" : ""}`} key={view.id}><span /><div><strong>{view.page_title || "بدون عنوان"}</strong><a href={view.page_url} target="_blank" rel="noreferrer">{view.page_url}</a><small>{formatDate(view.entered_at)} · {formatDuration(view.duration_seconds)}</small></div></div>)}</div>}</section>
        </>}
      </aside></div>}
    </AppShell>
  );
}
