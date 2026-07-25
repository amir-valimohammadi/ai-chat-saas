"use client";

import { type CSSProperties, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiDownload, apiRequest } from "@/lib/api";

type Tag = { id: number; name: string; slug: string; color: string };
type Note = { id: number; body: string; is_pinned: boolean; author_name: string; author_email: string; created_at: string; updated_at: string | null };
type OnboardingItem = { id: number; item_key: string; title: string; status: "pending" | "in_progress" | "done" | "skipped"; due_at: string | null; completed_at: string | null; completed_by_name: string | null };
type Manager = { id: number; name: string; email: string };
type Target = { id: number; name: string; email: string; role: "customer_admin" | "agent"; is_active: boolean; last_login_at: string | null };
type TimelineItem = { id: string; type: "audit" | "note" | "payment"; title: string; body?: string; actor_name?: string | null; actor_email?: string | null; created_at: string; amount?: number; currency?: string; reference_number?: string | null };
type Payment = { id: number; amount: number; currency: string; status: string; payment_method: string; reference_number: string | null; paid_at: string | null; created_at: string };
type Customer360Data = {
  tenant_profile: { id: number; name: string; status: string; lifecycle_stage: "onboarding" | "active" | "at_risk" | "paused" | "churned"; suspension_reason: string | null; account_manager_id: number | null; account_manager_name: string | null; account_manager_email: string | null; onboarding_completed_at: string | null; last_activity_at: string | null };
  health: { score: number; level: "healthy" | "attention" | "critical"; reasons: string[] };
  metrics: { storage_bytes: number; failed_crawls: number; active_crawls: number; days_since_activity: number };
  subscription: null | { id: number; status: string; billing_cycle: string; starts_at: string; ends_at: string; auto_renew: boolean; price: number; currency: string; plan_name: string; days_left: number };
  payment_summary: { payments_count: number; paid_total: number; pending_total: number; last_payment_at: string | null };
  payments: Payment[];
  all_tags: Tag[];
  assigned_tags: Tag[];
  notes: Note[];
  onboarding: { percent: number; completed: number; total: number; items: OnboardingItem[] };
  timeline: TimelineItem[];
  account_managers: Manager[];
  impersonation_targets: Target[];
  permissions: { can_support: boolean; can_impersonate: boolean; can_export: boolean; can_manage: boolean };
};

type Props = { tenantId: number };

const stageLabels: Record<Customer360Data["tenant_profile"]["lifecycle_stage"], string> = {
  onboarding: "در حال راه‌اندازی",
  active: "فعال",
  at_risk: "در معرض ریزش",
  paused: "متوقف",
  churned: "ریزش‌کرده",
};
const onboardingLabels: Record<OnboardingItem["status"], string> = {
  pending: "در انتظار",
  in_progress: "در حال انجام",
  done: "انجام‌شده",
  skipped: "ردشده",
};
const money = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("fa-IR");

export default function Customer360Panel({ tenantId }: Props) {
  const [data, setData] = useState<Customer360Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [notePinned, setNotePinned] = useState(false);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [stage, setStage] = useState<Customer360Data["tenant_profile"]["lifecycle_stage"]>("active");
  const [managerId, setManagerId] = useState("");
  const [suspensionReason, setSuspensionReason] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [impersonationReason, setImpersonationReason] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const result = await apiRequest(`/super-admin/customer-360.php?tenant_id=${tenantId}`);
      setData(result);
      setSelectedTags(result.assigned_tags.map((tag: Tag) => tag.id));
      setStage(result.tenant_profile.lifecycle_stage);
      setManagerId(result.tenant_profile.account_manager_id ? String(result.tenant_profile.account_manager_id) : "");
      setSuspensionReason(result.tenant_profile.suspension_reason || "");
      setTargetUserId((current) => {
        if (current) return current;
        const preferred = result.impersonation_targets.find((item: Target) => item.role === "customer_admin" && item.is_active);
        return preferred ? String(preferred.id) : "";
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "بارگذاری پرونده مشتری ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key); setError(""); setNotice("");
    try {
      await action();
      setNotice(success);
      await load(true);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "عملیات ناموفق بود.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    await run("profile", () => apiRequest("/super-admin/customer-profile-update.php", {
      method: "POST",
      body: JSON.stringify({ tenant_id: tenantId, lifecycle_stage: stage, account_manager_id: managerId ? Number(managerId) : null, suspension_reason: suspensionReason }),
    }), "پرونده پشتیبانی بروزرسانی شد.");
  }

  async function saveTags() {
    await run("tags", () => apiRequest("/super-admin/customer-tags-update.php", {
      method: "POST", body: JSON.stringify({ tenant_id: tenantId, tag_ids: selectedTags }),
    }), "برچسب‌ها بروزرسانی شدند.");
  }

  async function addNote(event: FormEvent) {
    event.preventDefault();
    const body = noteBody.trim();
    if (!body) { setError("متن یادداشت را وارد کن."); return; }
    const saved = await run("note", () => apiRequest("/super-admin/customer-note-save.php", {
      method: "POST", body: JSON.stringify({ tenant_id: tenantId, body, is_pinned: notePinned }),
    }), "یادداشت ثبت شد.");
    if (saved) { setNoteBody(""); setNotePinned(false); }
  }

  async function deleteNote(noteId: number) {
    if (!window.confirm("این یادداشت حذف شود؟")) return;
    await run(`note-${noteId}`, () => apiRequest("/super-admin/customer-note-delete.php", {
      method: "POST", body: JSON.stringify({ note_id: noteId }),
    }), "یادداشت حذف شد.");
  }

  async function updateOnboarding(item: OnboardingItem, status: OnboardingItem["status"]) {
    await run(`onboarding-${item.id}`, () => apiRequest("/super-admin/customer-onboarding-update.php", {
      method: "POST", body: JSON.stringify({ item_id: item.id, status, due_at: item.due_at }),
    }), "چک‌لیست بروزرسانی شد.");
  }

  async function startImpersonation(event: FormEvent) {
    event.preventDefault();
    if (!targetUserId || impersonationReason.trim().length < 5 || !currentPassword) {
      setError("کاربر هدف، دلیل ورود و رمز فعلی مدیر الزامی است.");
      return;
    }
    const popup = window.open("about:blank", "_blank");
    setBusy("impersonate");
    setError("");
    setNotice("");
    try {
      const result = await apiRequest("/super-admin/customer-impersonation-start.php", {
        method: "POST",
        body: JSON.stringify({ tenant_id: tenantId, target_user_id: Number(targetUserId), reason: impersonationReason.trim(), current_password: currentPassword }),
      });
      const url = `${window.location.origin}/impersonate#ticket=${encodeURIComponent(result.ticket)}`;
      if (popup) {
        popup.opener = null;
        popup.location.href = url;
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      setCurrentPassword("");
      setImpersonationReason("");
      setNotice("ورود موقت در تب جدید باز شد.");
      await load(true);
    } catch (reason) {
      popup?.close();
      setError(reason instanceof Error ? reason.message : "ایجاد ورود موقت ناموفق بود.");
    } finally {
      setBusy("");
    }
  }

  async function exportCustomer(format: "json" | "csv") {
    setError("");
    try {
      await apiDownload(`/super-admin/customer-export.php?tenant_id=${tenantId}&format=${format}`, `customer-${tenantId}.${format}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "دریافت خروجی ناموفق بود.");
    }
  }

  const healthClass = data ? `is-${data.health.level}` : "";
  const assignedSet = useMemo(() => new Set(selectedTags), [selectedTags]);

  if (loading) return <div className="customer360-loading"><span /> در حال آماده‌سازی پرونده ۳۶۰...</div>;
  if (!data) return <div className="customer360-alert is-error">{error || "پرونده مشتری در دسترس نیست."}</div>;

  return (
    <section className="customer360-page">
      {(error || notice) && <div className={`customer360-alert ${error ? "is-error" : "is-success"}`}><span>{error || notice}</span><button type="button" onClick={() => { setError(""); setNotice(""); }}>×</button></div>}

      <div className="customer360-top-grid">
        <article className={`customer360-health-card ${healthClass}`}>
          <div className="customer360-score"><strong>{number.format(data.health.score)}</strong><span>از ۱۰۰</span></div>
          <div><p className="customer360-eyebrow">سلامت حساب</p><h3>{data.health.level === "healthy" ? "وضعیت پایدار" : data.health.level === "attention" ? "نیازمند توجه" : "بحرانی"}</h3><ul>{data.health.reasons.length ? data.health.reasons.map((item) => <li key={item}>{item}</li>) : <li>هشدار فعالی ثبت نشده است.</li>}</ul></div>
        </article>
        <MetricCard label="فضای فایل" value={formatBytes(data.metrics.storage_bytes)} detail="ضمیمه‌های گفتگو" />
        <MetricCard label="خزش ناموفق" value={number.format(data.metrics.failed_crawls)} detail={`${number.format(data.metrics.active_crawls)} Job فعال`} danger={data.metrics.failed_crawls > 0} />
        <MetricCard label="آخرین فعالیت" value={`${number.format(data.metrics.days_since_activity)} روز`} detail={formatDate(data.tenant_profile.last_activity_at)} />
      </div>

      <div className="customer360-grid customer360-grid-main">
        <form className="customer360-card" onSubmit={saveProfile}>
          <CardHead title="مالکیت و وضعیت مشتری" subtitle="مرحله چرخه عمر، مدیر حساب و دلیل توقف" />
          <div className="customer360-form-grid">
            <label><span>مرحله مشتری</span><select value={stage} onChange={(e) => setStage(e.target.value as typeof stage)} disabled={!data.permissions.can_support}>{Object.entries(stageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>مدیر حساب</span><select value={managerId} onChange={(e) => setManagerId(e.target.value)} disabled={!data.permissions.can_support}><option value="">بدون مسئول</option>{data.account_managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name} — {manager.email}</option>)}</select></label>
            <label className="is-wide"><span>دلیل تعلیق/ریسک یا توضیح داخلی</span><textarea value={suspensionReason} onChange={(e) => setSuspensionReason(e.target.value)} maxLength={1000} rows={3} disabled={!data.permissions.can_support} placeholder="برای نمونه: بدهی، توقف همکاری، مشکل راه‌اندازی یا ریسک ریزش" /></label>
          </div>
          {data.permissions.can_support && <button className="customer360-primary" disabled={busy === "profile"}>{busy === "profile" ? "در حال ذخیره..." : "ذخیره پرونده"}</button>}
        </form>

        <article className="customer360-card">
          <CardHead title="برچسب‌های مشتری" subtitle="برچسب‌ها در جست‌وجو و پیگیری سریع استفاده می‌شوند" />
          <div className="customer360-tags">{data.all_tags.map((tag) => <label key={tag.id} className={assignedSet.has(tag.id) ? "is-selected" : ""} style={{ "--tag-color": tag.color } as CSSProperties}><input type="checkbox" checked={assignedSet.has(tag.id)} disabled={!data.permissions.can_support} onChange={() => setSelectedTags((current) => current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id])} /><span>{tag.name}</span></label>)}</div>
          {data.permissions.can_support && <button className="customer360-secondary" type="button" onClick={saveTags} disabled={busy === "tags"}>{busy === "tags" ? "در حال ذخیره..." : "ثبت برچسب‌ها"}</button>}
        </article>
      </div>

      <div className="customer360-grid customer360-grid-main">
        <article className="customer360-card">
          <CardHead title="راه‌اندازی مشتری" subtitle={`${number.format(data.onboarding.completed)} از ${number.format(data.onboarding.total)} مرحله تکمیل شده`} />
          <div className="customer360-progress"><span style={{ width: `${data.onboarding.percent}%` }} /><b>{number.format(data.onboarding.percent)}٪</b></div>
          <div className="customer360-checklist">{data.onboarding.items.map((item) => <div key={item.id} className={`customer360-check-item is-${item.status}`}><span className="customer360-check-dot">{item.status === "done" ? "✓" : item.status === "skipped" ? "−" : "•"}</span><div><strong>{item.title}</strong><small>{item.completed_at ? `تکمیل: ${formatDate(item.completed_at)}` : item.due_at ? `سررسید: ${formatDate(item.due_at)}` : onboardingLabels[item.status]}</small></div><select value={item.status} disabled={!data.permissions.can_support || busy === `onboarding-${item.id}`} onChange={(e) => updateOnboarding(item, e.target.value as OnboardingItem["status"])}>{Object.entries(onboardingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>)}</div>
        </article>

        <article className="customer360-card">
          <CardHead title="اشتراک و پرداخت" subtitle="آخرین وضعیت مالی حساب" />
          {data.subscription ? <><div className="customer360-subscription"><div><span>پلن</span><strong>{data.subscription.plan_name}</strong></div><div><span>وضعیت</span><strong>{data.subscription.status}</strong></div><div><span>پایان</span><strong>{formatDate(data.subscription.ends_at)}</strong></div><div><span>باقی‌مانده</span><strong>{number.format(data.subscription.days_left)} روز</strong></div></div><div className="customer360-money-row"><div><span>پرداخت‌شده</span><strong>{money.format(data.payment_summary.paid_total)} {data.subscription.currency}</strong></div><div><span>در انتظار</span><strong>{money.format(data.payment_summary.pending_total)} {data.subscription.currency}</strong></div></div></> : <div className="customer360-empty">اشتراک فعالی برای این مشتری ثبت نشده است.</div>}
          <div className="customer360-payment-list">{data.payments.slice(0, 5).map((payment) => <div key={payment.id}><span className={`customer360-payment-status is-${payment.status}`}>{payment.status}</span><div><strong>{money.format(payment.amount)} {payment.currency}</strong><small>{payment.reference_number || payment.payment_method}</small></div><time>{formatDate(payment.paid_at || payment.created_at)}</time></div>)}</div>
        </article>
      </div>

      <div className="customer360-grid customer360-grid-main">
        <article className="customer360-card">
          <CardHead title="یادداشت‌های داخلی" subtitle="این یادداشت‌ها فقط برای مدیران پلتفرم قابل مشاهده‌اند" />
          {data.permissions.can_support && <form className="customer360-note-form" onSubmit={addNote}><textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={4} maxLength={5000} placeholder="نتیجه تماس، مشکل مشتری یا اقدام بعدی را ثبت کنید..." /><label><input type="checkbox" checked={notePinned} onChange={(e) => setNotePinned(e.target.checked)} /> سنجاق‌کردن یادداشت</label><button className="customer360-primary" disabled={busy === "note"}>{busy === "note" ? "در حال ثبت..." : "ثبت یادداشت"}</button></form>}
          <div className="customer360-notes">{data.notes.length ? data.notes.map((note) => <article key={note.id} className={note.is_pinned ? "is-pinned" : ""}><header><div><strong>{note.author_name}</strong><span>{note.is_pinned ? "سنجاق‌شده" : "یادداشت داخلی"}</span></div><time>{formatDate(note.created_at)}</time></header><p>{note.body}</p>{data.permissions.can_support && <button type="button" onClick={() => deleteNote(note.id)} disabled={busy === `note-${note.id}`}>حذف</button>}</article>) : <div className="customer360-empty">هنوز یادداشتی ثبت نشده است.</div>}</div>
        </article>

        <article className="customer360-card">
          <CardHead title="ورود موقت امن" subtitle="در تب جدا و با ثبت کامل Audit Log" />
          {data.permissions.can_impersonate ? <form className="customer360-impersonation" onSubmit={startImpersonation}><label><span>حساب هدف</span><select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>{data.impersonation_targets.map((target) => <option key={target.id} value={target.id} disabled={!target.is_active}>{target.name} — {target.role === "customer_admin" ? "مدیر مشتری" : "پشتیبان"}</option>)}</select></label><label><span>دلیل ورود</span><textarea value={impersonationReason} onChange={(e) => setImpersonationReason(e.target.value)} rows={3} maxLength={1000} placeholder="برای نمونه: بررسی مشکل گزارش‌شده در صفحه تنظیمات" /></label><label><span>رمز فعلی شما</span><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" /></label><div className="customer360-warning">نشست موقت برای مدت محدود فعال است و حساب اصلی Super Admin در تب فعلی باقی می‌ماند.</div><button className="customer360-danger" disabled={busy === "impersonate"}>{busy === "impersonate" ? "در حال ایجاد..." : "ورود موقت در تب جدید"}</button></form> : <div className="customer360-empty">مجوز ورود موقت برای نقش شما فعال نیست.</div>}
          {data.permissions.can_export && <div className="customer360-export"><button type="button" onClick={() => exportCustomer("json")}>خروجی JSON</button><button type="button" onClick={() => exportCustomer("csv")}>خروجی CSV</button></div>}
        </article>
      </div>

      <article className="customer360-card">
        <CardHead title="Timeline کامل مشتری" subtitle="تغییرات مدیریتی، پرداخت‌ها و یادداشت‌ها به‌ترتیب زمان" />
        <div className="customer360-timeline">{data.timeline.length ? data.timeline.map((item) => <div key={item.id} className={`is-${item.type}`}><span className="customer360-timeline-icon">{item.type === "payment" ? "₿" : item.type === "note" ? "✎" : "↺"}</span><div><header><strong>{item.title}</strong><time>{formatDate(item.created_at)}</time></header>{item.body && <p>{item.body}</p>}{item.amount !== undefined && <p>{money.format(item.amount)} {item.currency} {item.reference_number ? `· ${item.reference_number}` : ""}</p>}<small>{item.actor_name ? `${item.actor_name}${item.actor_email ? ` · ${item.actor_email}` : ""}` : "رویداد سیستمی"}</small></div></div>) : <div className="customer360-empty">رویدادی برای این مشتری ثبت نشده است.</div>}</div>
      </article>
    </section>
  );
}

function CardHead({ title, subtitle }: { title: string; subtitle: string }) { return <header className="customer360-card-head"><div><h3>{title}</h3><p>{subtitle}</p></div></header>; }
function MetricCard({ label, value, detail, danger = false }: { label: string; value: string; detail: string; danger?: boolean }) { return <article className={`customer360-metric ${danger ? "is-danger" : ""}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function formatBytes(bytes: number) { if (!bytes) return "۰ بایت"; const units = ["بایت", "KB", "MB", "GB"]; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${number.format(Number((bytes / 1024 ** index).toFixed(index ? 1 : 0)))} ${units[index]}`; }
function formatDate(value: string | null | undefined) { if (!value) return "ثبت نشده"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" }); }
