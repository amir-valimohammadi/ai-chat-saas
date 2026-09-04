"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest } from "@/lib/api";

type PresenceStatus = "online" | "idle" | "offline";
type StatusFilter = PresenceStatus | "all";
type SiteOption = { id: number; name: string };
type VisitorStats = { online: number; idle: number; offline: number };
type VisitorPagination = { page: number; pages: number; total: number };
type VisitorFilters = {
  q: string;
  status: StatusFilter;
  site_id: string;
  device: string;
};

type Visitor = {
  id: number;
  site: SiteOption;
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
  session: {
    id: number;
    started_at: string;
    page_view_count: number;
    total_active_seconds: number;
    widget_open: boolean;
  } | null;
  active_conversation_id: number | null;
  pending_invite_count: number;
};

type VisitorProfile = Omit<
  Visitor,
  "session" | "active_conversation_id" | "pending_invite_count"
>;

type VisitorDetails = {
  visitor: VisitorProfile;
  sessions: Array<{
    id: number;
    started_at: string;
    last_seen_at: string;
    ended_at: string | null;
    page_view_count: number;
    total_active_seconds: number;
    widget_open: boolean;
    is_active: boolean;
    first_page_url: string | null;
    last_page_url: string | null;
  }>;
  page_views: Array<{
    id: number;
    page_url: string;
    page_title: string | null;
    referrer_url: string | null;
    entered_at: string;
    last_seen_at: string;
    duration_seconds: number;
    is_current: boolean;
  }>;
  conversations: Array<{
    id: number;
    status: string;
    created_at: string;
    last_message_at: string | null;
    department_name: string | null;
    assigned_agent_name: string | null;
  }>;
  departments: Array<{
    id: number;
    name: string;
    color: string;
    is_default: boolean;
  }>;
  invites: Array<{
    id: number;
    conversation_id: number;
    message_preview: string;
    status: string;
    created_at: string;
    expires_at: string;
  }>;
};

type VisitorsResponse = {
  visitors?: Visitor[];
  sites?: SiteOption[];
  stats?: VisitorStats;
  pagination?: VisitorPagination;
};

type InviteResponse = {
  invite?: { conversation_id?: number };
};

type VisitorIconName =
  | "activity"
  | "arrow"
  | "clock"
  | "close"
  | "device"
  | "external"
  | "filter"
  | "globe"
  | "message"
  | "pages"
  | "refresh"
  | "search";

const statusLabels: Record<PresenceStatus, string> = {
  online: "آنلاین",
  idle: "غیرفعال",
  offline: "آفلاین",
};

const filterLabels: Record<StatusFilter, string> = {
  online: "افراد آنلاین",
  idle: "افراد غیرفعال",
  offline: "بازدیدهای آفلاین",
  all: "همه بازدیدکنندگان",
};

const deviceLabels: Record<string, string> = {
  desktop: "دسکتاپ",
  mobile: "موبایل",
  tablet: "تبلت",
  bot: "ربات",
  unknown: "نامشخص",
};

const initialFilters: VisitorFilters = {
  q: "",
  status: "online",
  site_id: "",
  device: "",
};
const initialStats: VisitorStats = { online: 0, idle: 0, offline: 0 };
const initialPagination: VisitorPagination = { page: 1, pages: 1, total: 0 };

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("fa-IR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

function formatTime(value: Date | null) {
  if (!value) return "در انتظار نخستین بروزرسانی";
  return `بروزرسانی در ${new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value)}`;
}

function formatDuration(seconds = 0) {
  const safeSeconds = Math.max(0, seconds);
  if (safeSeconds < 60) return `${safeSeconds} ثانیه`;
  if (safeSeconds < 3600) return `${Math.floor(safeSeconds / 60)} دقیقه`;
  return `${Math.floor(safeSeconds / 3600)} ساعت و ${Math.floor(
    (safeSeconds % 3600) / 60
  )} دقیقه`;
}

function safeHost(url?: string | null) {
  if (!url) return "ورود مستقیم";
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function visitorInitial(visitor: { id: number; name: string | null }) {
  return visitor.name?.trim().slice(0, 1) || String(visitor.id).slice(-1);
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

function VisitorIcon({ name }: { name: VisitorIconName }) {
  const paths: Record<VisitorIconName, string[]> = {
    activity: ["M4 12h3l2-6 4 12 2-6h5"],
    arrow: ["m9 18 6-6-6-6"],
    clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18", "M12 7v5l3 2"],
    close: ["M6 6l12 12M18 6 6 18"],
    device: ["M5 4h14v12H5z", "M9 20h6M12 16v4"],
    external: ["M14 4h6v6", "M20 4 11 13", "M18 13v6H5V6h6"],
    filter: ["M4 6h16M7 12h10M10 18h4"],
    globe: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18", "M3 12h18", "M12 3c3 3 3 15 0 18", "M12 3c-3 3-3 15 0 18"],
    message: ["M5 5h14v11H9l-4 4z", "M9 9h6M9 12h4"],
    pages: ["M7 4h10v16H7z", "M10 8h4M10 12h4M10 16h2"],
    refresh: ["M20 7v5h-5", "M4 17v-5h5", "M6.1 9a7 7 0 0 1 11.7-2L20 12", "M4 12l2.2 5a7 7 0 0 0 11.7-2"],
    search: ["M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14", "m16 16 4 4"],
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name].map((path) => <path key={path} d={path} />)}
    </svg>
  );
}

export default function VisitorsPage() {
  const router = useRouter();
  const listRequestRef = useRef(0);
  const detailsRequestRef = useRef(0);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [stats, setStats] = useState<VisitorStats>(initialStats);
  const [filters, setFilters] = useState<VisitorFilters>(initialFilters);
  const deferredSearch = useDeferredValue(filters.q.trim());
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<VisitorPagination>(initialPagination);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<VisitorDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMessage, setInviteMessage] = useState(
    "سلام، اگر درباره این صفحه سؤالی دارید در خدمتتان هستیم."
  );
  const [departmentId, setDepartmentId] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: "50",
      status: filters.status,
    });
    if (deferredSearch) params.set("q", deferredSearch);
    if (filters.site_id) params.set("site_id", filters.site_id);
    if (filters.device) params.set("device", filters.device);
    return params.toString();
  }, [deferredSearch, filters.device, filters.site_id, filters.status, page]);

  const hasActiveFilters = Boolean(
    filters.q || filters.site_id || filters.device || filters.status !== initialFilters.status
  );
  const advancedFilterCount = Number(Boolean(filters.site_id)) + Number(Boolean(filters.device));
  const presentCount = stats.online + stats.idle;
  const allVisitorsCount = presentCount + stats.offline;
  const drawerOpen = detailsLoading || selected !== null;

  function updateFilter<Key extends keyof VisitorFilters>(
    key: Key,
    value: VisitorFilters[Key]
  ) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setPage(1);
    setFilters(initialFilters);
    setAdvancedFiltersOpen(false);
  }

  const loadVisitors = useCallback(async (silent = false) => {
    const requestId = ++listRequestRef.current;
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError("");

      const data = (await apiRequest(
        `/agent/visitors-online-list.php?${query}`
      )) as VisitorsResponse;
      if (requestId !== listRequestRef.current) return;

      const nextPagination = data.pagination || initialPagination;
      setVisitors(data.visitors || []);
      setSites(data.sites || []);
      setStats(data.stats || initialStats);
      setPagination(nextPagination);
      setLastUpdatedAt(new Date());
      if (page > nextPagination.pages) setPage(nextPagination.pages);
    } catch (caughtError) {
      if (requestId !== listRequestRef.current) return;
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "خطا در دریافت بازدیدکنندگان"
      );
    } finally {
      if (requestId === listRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [page, query]);

  const openVisitor = useCallback(async (visitorId: number, openInvite = false) => {
    const requestId = ++detailsRequestRef.current;
    try {
      setDetailsLoading(true);
      setSelected(null);
      setInviteOpen(false);
      setError("");

      const data = (await apiRequest(
        `/agent/visitor-show.php?visitor_id=${visitorId}`
      )) as VisitorDetails;
      if (requestId !== detailsRequestRef.current) return;

      const defaultDepartment =
        data.departments.find((item) => item.is_default) || data.departments[0];
      setSelected(data);
      setDepartmentId(defaultDepartment ? String(defaultDepartment.id) : "");
      setInviteOpen(openInvite);
    } catch (caughtError) {
      if (requestId !== detailsRequestRef.current) return;
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "خطا در دریافت جزئیات بازدیدکننده"
      );
    } finally {
      if (requestId === detailsRequestRef.current) setDetailsLoading(false);
    }
  }, []);

  const closeVisitor = useCallback(() => {
    detailsRequestRef.current += 1;
    setDetailsLoading(false);
    setSelected(null);
    setInviteOpen(false);
  }, []);

  async function sendInvite() {
    if (!selected || !departmentId || !inviteMessage.trim()) return;
    const visitorId = selected.visitor.id;

    try {
      setInviteLoading(true);
      setError("");
      setNotice("");
      const data = (await apiRequest("/agent/visitor-invite.php", {
        method: "POST",
        body: JSON.stringify({
          visitor_id: visitorId,
          department_id: Number(departmentId),
          message: inviteMessage.trim(),
        }),
      })) as InviteResponse;

      const conversationId = data.invite?.conversation_id;
      setNotice(
        conversationId
          ? `دعوت گفتگو ارسال شد و گفتگوی شماره ${conversationId} آماده است.`
          : "دعوت گفتگو برای بازدیدکننده ارسال شد."
      );
      setInviteOpen(false);
      await Promise.allSettled([loadVisitors(true), openVisitor(visitorId, false)]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "ارسال دعوت ناموفق بود"
      );
    } finally {
      setInviteLoading(false);
    }
  }

  useEffect(() => {
    void loadVisitors(false);
  }, [loadVisitors]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadVisitors(true), 15000);
    return () => window.clearInterval(timer);
  }, [loadVisitors]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !inviteLoading) closeVisitor();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeVisitor, drawerOpen, inviteLoading]);

  return (
    <AppShell
      title="بازدیدکنندگان"
      kicker="حضور زنده"
      description="حضور کاربران و مسیر بازدیدشان را ببینید و در زمان مناسب گفتگو را آغاز کنید."
      actions={
        <button
          className={`visitor-refresh-button ${refreshing ? "is-loading" : ""}`}
          type="button"
          onClick={() => void loadVisitors(true)}
          disabled={refreshing}
        >
          <VisitorIcon name="refresh" />
          <span>{refreshing ? "در حال بروزرسانی" : "بروزرسانی"}</span>
        </button>
      }
    >
      <div className="visitors-page">
        {error && (
          <div className="alert alert-danger visitor-alert" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadVisitors(false)}>تلاش دوباره</button>
          </div>
        )}
        {notice && (
          <div className="alert alert-success visitor-alert" role="status">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice("")} aria-label="بستن پیام">×</button>
          </div>
        )}

        <section className="visitor-presence-overview" aria-labelledby="visitor-live-title">
          <div className="visitor-presence-copy">
            <span className="visitor-live-label"><i /> پایش خودکار فعال است</span>
            <div>
              <h2 id="visitor-live-title">وضعیت حضور در سایت</h2>
              <p>فهرست هر ۱۵ ثانیه بروزرسانی می‌شود؛ برای شروع گفتگو، یک بازدیدکننده حاضر را انتخاب کنید.</p>
            </div>
          </div>

          <div className="visitor-present-count" aria-live="polite">
            <span>حاضر اکنون</span>
            <strong>{loading && !lastUpdatedAt ? "—" : presentCount}</strong>
            <small>{formatTime(lastUpdatedAt)}</small>
          </div>

          <div className="visitor-status-tabs" role="group" aria-label="فیلتر بر اساس وضعیت حضور">
            {([
              ["online", "آنلاین", stats.online],
              ["idle", "غیرفعال", stats.idle],
              ["offline", "آفلاین", stats.offline],
              ["all", "همه", allVisitorsCount],
            ] as Array<[StatusFilter, string, number]>).map(([status, label, count]) => (
              <button
                key={status}
                type="button"
                className={`visitor-status-tab tone-${status} ${filters.status === status ? "is-active" : ""}`}
                aria-pressed={filters.status === status}
                onClick={() => updateFilter("status", status)}
              >
                <span><i />{label}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </div>
        </section>

        <section className="visitor-directory" aria-labelledby="visitor-directory-title">
          <header className="visitor-directory-header">
            <div>
              <span className="visitor-section-kicker">فهرست مخاطبان</span>
              <h2 id="visitor-directory-title">{filterLabels[filters.status]}</h2>
              <p>{pagination.total} نتیجه در این نما</p>
            </div>

            <div className="visitor-search-tools">
              <label className="visitor-search-field">
                <span className="visitor-visually-hidden">جست‌وجوی بازدیدکنندگان</span>
                <VisitorIcon name="search" />
                <input
                  type="search"
                  placeholder="نام، شماره تماس یا صفحه..."
                  value={filters.q}
                  onChange={(event) => updateFilter("q", event.target.value)}
                />
              </label>
              <button
                className={`visitor-filter-toggle ${advancedFiltersOpen ? "is-active" : ""}`}
                type="button"
                aria-expanded={advancedFiltersOpen}
                aria-controls="visitor-advanced-filters"
                onClick={() => setAdvancedFiltersOpen((current) => !current)}
              >
                <VisitorIcon name="filter" />
                <span>فیلترها</span>
                {advancedFilterCount > 0 && <b>{advancedFilterCount}</b>}
              </button>
              {hasActiveFilters && (
                <button className="visitor-clear-filters" type="button" onClick={clearFilters}>پاک‌کردن</button>
              )}
            </div>
          </header>

          {advancedFiltersOpen && (
            <div className="visitor-advanced-filters" id="visitor-advanced-filters">
              <label>
                <span>سایت</span>
                <select value={filters.site_id} onChange={(event) => updateFilter("site_id", event.target.value)}>
                  <option value="">همه سایت‌ها</option>
                  {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                </select>
              </label>
              <label>
                <span>نوع دستگاه</span>
                <select value={filters.device} onChange={(event) => updateFilter("device", event.target.value)}>
                  <option value="">همه دستگاه‌ها</option>
                  <option value="desktop">دسکتاپ</option>
                  <option value="mobile">موبایل</option>
                  <option value="tablet">تبلت</option>
                  <option value="bot">ربات</option>
                </select>
              </label>
              <p>فیلترهای وضعیت، سایت و دستگاه هم‌زمان روی فهرست اعمال می‌شوند.</p>
            </div>
          )}

          {loading ? (
            <div className="visitor-loading-state" aria-label="در حال دریافت بازدیدکنندگان">
              <span /><span /><span />
            </div>
          ) : visitors.length === 0 ? (
            <div className="visitor-empty-state">
              <span className="visitor-empty-visual"><VisitorsEmptyIcon /></span>
              <div>
                <span>نتیجه‌ای پیدا نشد</span>
                <h3>بازدیدکننده‌ای با این فیلتر وجود ندارد</h3>
                <p>فیلترها را تغییر دهید یا کمی بعد دوباره بررسی کنید. اطلاعات حضور به‌صورت خودکار تازه می‌شود.</p>
              </div>
              <div className="visitor-empty-actions">
                {hasActiveFilters && (
                  <button className="button button-primary" type="button" onClick={clearFilters}>نمایش افراد آنلاین</button>
                )}
                <button className="button button-secondary" type="button" onClick={() => void loadVisitors(true)}>بررسی دوباره</button>
              </div>
            </div>
          ) : (
            <div className="visitor-list" role="list">
              <div className="visitor-list-labels" aria-hidden="true">
                <span>بازدیدکننده</span><span>صفحه فعلی</span><span>اطلاعات نشست</span><span>عملیات</span>
              </div>

              {visitors.map((item) => (
                <article
                  className={`visitor-list-row ${item.presence_status === "online" ? "is-live" : ""}`}
                  key={item.id}
                  role="listitem"
                >
                  <div className="visitor-identity">
                    <span className="visitor-avatar" aria-hidden="true">
                      {visitorInitial(item)}
                      <i className={`presence-dot ${item.presence_status}`} />
                    </span>
                    <div>
                      <div className="visitor-identity-title">
                        <strong>{item.name || <>بازدیدکننده <bdi>#{item.id}</bdi></>}</strong>
                        <span className={`presence-badge ${item.presence_status}`}>{statusLabels[item.presence_status]}</span>
                      </div>
                      <small>{item.phone || item.email || item.site.name}</small>
                      <span className="visitor-site-name"><VisitorIcon name="globe" /> {item.site.name}</span>
                    </div>
                  </div>

                  <div className="visitor-current-context">
                    <span className="visitor-mobile-label">صفحه فعلی</span>
                    <strong>{item.current_page_title || "صفحه بدون عنوان"}</strong>
                    {item.current_page_url ? (
                      <a href={item.current_page_url} target="_blank" rel="noreferrer">
                        {safeHost(item.current_page_url)} <VisitorIcon name="external" />
                      </a>
                    ) : <small>آدرس صفحه ثبت نشده است</small>}
                    <small>آخرین حضور: {formatDate(item.last_seen_at)}</small>
                  </div>

                  <div className="visitor-session-context">
                    <span className="visitor-mobile-label">اطلاعات نشست</span>
                    <span>
                      <VisitorIcon name="device" />
                      <b>{deviceLabels[item.device_type] || item.device_type}</b>
                      <small>{item.browser_name || "مرورگر نامشخص"}</small>
                    </span>
                    <span>
                      <VisitorIcon name="pages" />
                      <b>{item.session?.page_view_count || 0} صفحه</b>
                      <small>{formatDuration(item.session?.total_active_seconds || 0)}</small>
                    </span>
                  </div>

                  <div className="visitor-row-actions">
                    <button className="visitor-details-button" type="button" onClick={() => void openVisitor(item.id)}>
                      جزئیات <VisitorIcon name="arrow" />
                    </button>
                    {item.active_conversation_id ? (
                      <button
                        className="visitor-conversation-button"
                        type="button"
                        onClick={() => router.push(`/conversations/${item.active_conversation_id}`)}
                      >
                        <VisitorIcon name="message" />
                        {item.pending_invite_count > 0 ? "دعوت ارسال‌شده" : "بازکردن گفتگو"}
                      </button>
                    ) : (
                      <button
                        className="visitor-conversation-button"
                        type="button"
                        disabled={item.presence_status === "offline"}
                        onClick={() => void openVisitor(item.id, true)}
                      >
                        <VisitorIcon name="message" /> شروع گفتگو
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {!loading && visitors.length > 0 && (
            <footer className="visitor-pagination">
              <span>نمایش {visitors.length} از {pagination.total} بازدیدکننده</span>
              <div>
                <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>قبلی</button>
                <span>صفحه <b>{pagination.page}</b> از {pagination.pages}</span>
                <button type="button" disabled={page >= pagination.pages} onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))}>بعدی</button>
              </div>
            </footer>
          )}
        </section>
      </div>

      {drawerOpen && (
        <div
          className="visitor-drawer-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !inviteLoading) closeVisitor();
          }}
        >
          <aside
            className="visitor-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="جزئیات بازدیدکننده"
            aria-busy={detailsLoading}
          >
            <button
              className="visitor-drawer-close"
              type="button"
              onClick={closeVisitor}
              disabled={inviteLoading}
              aria-label="بستن جزئیات"
            >
              <VisitorIcon name="close" />
            </button>

            {detailsLoading || !selected ? (
              <div className="visitor-drawer-loading">
                <span /><span /><span /><span />
                <p>در حال آماده‌سازی جزئیات بازدیدکننده…</p>
              </div>
            ) : (
              <>
                <header className="visitor-drawer-header">
                  <span className="visitor-drawer-avatar">
                    {visitorInitial(selected.visitor)}
                    <i className={`presence-dot ${selected.visitor.presence_status}`} />
                  </span>
                  <div>
                    <span className={`presence-badge ${selected.visitor.presence_status}`}>{statusLabels[selected.visitor.presence_status]}</span>
                    <h2>{selected.visitor.name || <>بازدیدکننده <bdi>#{selected.visitor.id}</bdi></>}</h2>
                    <p><VisitorIcon name="globe" /> {selected.visitor.site.name}</p>
                  </div>
                </header>

                <div className="visitor-profile-grid">
                  <div><span>راه ارتباطی</span><strong>{selected.visitor.phone || selected.visitor.email || "ثبت نشده"}</strong></div>
                  <div>
                    <span>دستگاه</span>
                    <strong>
                      {deviceLabels[selected.visitor.device_type] || "نامشخص"}
                      {selected.visitor.browser_name ? ` · ${selected.visitor.browser_name}` : ""}
                    </strong>
                  </div>
                  <div><span>اولین بازدید</span><strong>{formatDate(selected.visitor.first_seen_at)}</strong></div>
                  <div><span>منبع ورود</span><strong>{safeHost(selected.visitor.referrer_url)}</strong></div>
                </div>

                <section className="visitor-current-page-card">
                  <span className="visitor-card-icon"><VisitorIcon name="activity" /></span>
                  <div>
                    <span>صفحه فعلی بازدیدکننده</span>
                    <strong>{selected.visitor.current_page_title || "صفحه بدون عنوان"}</strong>
                    <small>آخرین حضور: {formatDate(selected.visitor.last_seen_at)}</small>
                  </div>
                  {selected.visitor.current_page_url && (
                    <a href={selected.visitor.current_page_url} target="_blank" rel="noreferrer" aria-label="بازکردن صفحه فعلی در تب جدید">
                      <VisitorIcon name="external" />
                    </a>
                  )}
                </section>

                <div className="visitor-drawer-actions">
                  {selected.visitor.presence_status !== "offline" && (
                    <button className="button button-primary" type="button" onClick={() => setInviteOpen(true)}>
                      <VisitorIcon name="message" /> شروع گفتگو
                    </button>
                  )}
                  {selected.conversations[0] && (
                    <button className="button button-secondary" type="button" onClick={() => router.push(`/conversations/${selected.conversations[0].id}`)}>
                      آخرین گفتگو <VisitorIcon name="arrow" />
                    </button>
                  )}
                </div>

                {inviteOpen && (
                  <section className="visitor-invite-box" aria-labelledby="visitor-invite-title">
                    <header>
                      <div><span>دعوت پیش‌دستانه</span><h3 id="visitor-invite-title">پیام آغاز گفتگو</h3></div>
                      <button type="button" onClick={() => setInviteOpen(false)} disabled={inviteLoading}>لغو</button>
                    </header>
                    {selected.departments.length > 0 ? (
                      <>
                        <label>
                          <span>دپارتمان پاسخ‌گو</span>
                          <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
                            {selected.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                          </select>
                        </label>
                        <label>
                          <span>متن پیام</span>
                          <textarea rows={4} maxLength={5000} value={inviteMessage} onChange={(event) => setInviteMessage(event.target.value)} />
                          <small>{inviteMessage.length.toLocaleString("fa-IR")} از ۵٬۰۰۰ نویسه</small>
                        </label>
                        <button
                          className="button button-primary"
                          type="button"
                          disabled={inviteLoading || !departmentId || !inviteMessage.trim()}
                          onClick={() => void sendInvite()}
                        >
                          <VisitorIcon name="message" />
                          {inviteLoading ? "در حال ارسال دعوت…" : "ارسال دعوت گفتگو"}
                        </button>
                      </>
                    ) : (
                      <p className="visitor-invite-empty">برای این سایت دپارتمان فعالی در دسترس شما نیست؛ ابتدا دسترسی دپارتمان را بررسی کنید.</p>
                    )}
                  </section>
                )}

                <section className="visitor-journey">
                  <header>
                    <div><span>رفتار کاربر</span><h3>مسیر بازدید</h3></div>
                    <b>{selected.page_views.length} صفحه</b>
                  </header>
                  {selected.page_views.length === 0 ? (
                    <p className="visitor-journey-empty">هنوز صفحه‌ای برای این بازدیدکننده ثبت نشده است.</p>
                  ) : (
                    <div className="visitor-timeline">
                      {selected.page_views.map((view) => (
                        <div className={`visitor-timeline-item ${view.is_current ? "is-current" : ""}`} key={view.id}>
                          <span />
                          <div>
                            <strong>{view.page_title || "صفحه بدون عنوان"}</strong>
                            <a href={view.page_url} target="_blank" rel="noreferrer">{view.page_url}</a>
                            <small><VisitorIcon name="clock" /> {formatDate(view.entered_at)} · {formatDuration(view.duration_seconds)}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </aside>
        </div>
      )}
    </AppShell>
  );
}
