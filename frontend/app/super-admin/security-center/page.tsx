"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser, logout } from "@/lib/api";

type Tab = "overview" | "sessions" | "logins" | "events" | "ip" | "two-factor";
type AdminOption = { id: number; name: string; email: string; admin_role_name: string };
type Session = { id: number; ip_address: string | null; user_agent: string | null; created_at: string; last_seen_at: string; expires_at: string; revoked_at: string | null; revocation_reason: string | null; is_current: number };
type LoginAttempt = { id: number; email: string; success: number; failure_reason: string | null; ip_address: string | null; user_agent: string | null; created_at: string };
type SecurityEvent = { id: number; event_type: string; severity: "info" | "warning" | "critical"; title: string; details: Record<string, unknown> | null; ip_address: string | null; resolved_at: string | null; created_at: string };
type IpRule = { id: number; label: string; ip_cidr: string; is_active: number; created_at: string };
type Overview = {
    target_admin: { id: number; name: string; email: string; is_active: number; two_factor_enabled: number; two_factor_confirmed_at: string | null; ip_allowlist_enabled: number; locked_until: string | null; last_login_at: string | null; last_login_ip: string | null; admin_role_name: string };
    admins: AdminOption[];
    summary: { active_sessions: number; failed_24h: number; open_events: number; critical_events: number };
    sessions: Session[];
    login_attempts: LoginAttempt[];
    events: SecurityEvent[];
    allowlist: IpRule[];
    two_factor: { enabled: boolean; confirmed_at: string | null; unused_recovery_codes: number };
    current_ip: string | null;
    can_manage: boolean;
    is_self: boolean;
};

function date(value: string | null) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function browserLabel(userAgent: string | null) {
    if (!userAgent) return "مرورگر نامشخص";
    if (userAgent.includes("Edg/")) return "Microsoft Edge";
    if (userAgent.includes("Firefox/")) return "Firefox";
    if (userAgent.includes("Chrome/")) return "Google Chrome";
    if (userAgent.includes("Safari/")) return "Safari";
    return userAgent.slice(0, 55);
}

export default function SecurityCenterPage() {
    const router = useRouter();
    const [tab, setTab] = useState<Tab>("overview");
    const [data, setData] = useState<Overview | null>(null);
    const [selectedUserId, setSelectedUserId] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [actionLoading, setActionLoading] = useState(false);
    const [ipLabel, setIpLabel] = useState("");
    const [ipCidr, setIpCidr] = useState("");
    const [ipPassword, setIpPassword] = useState("");
    const [setupSecret, setSetupSecret] = useState("");
    const [setupUri, setSetupUri] = useState("");
    const [twoFactorCode, setTwoFactorCode] = useState("");
    const [twoFactorPassword, setTwoFactorPassword] = useState("");
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

    const loadOverview = useCallback(async (userId?: number) => {
        try {
            setLoading(true);
            setError("");
            const response = await apiRequest(`/super-admin/security-overview.php${userId ? `?user_id=${userId}` : ""}`);
            setData(response);
            setSelectedUserId(Number(response.target_admin?.id || 0));
        } catch (err) {
            setError(err instanceof Error ? err.message : "دریافت اطلاعات امنیتی ناموفق بود.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const user = getAuthUser() as { role?: string; permissions?: string[]; is_platform_owner?: boolean } | null;
        if (!user) return void router.push("/login");
        if (user.role !== "super_admin") return void router.push("/dashboard");
        if (!user.is_platform_owner && !user.permissions?.includes("*") && !user.permissions?.includes("security.view")) return void router.push("/super-admin/dashboard");
        loadOverview();
    }, [loadOverview, router]);

    const activeSessions = useMemo(() => data?.sessions.filter((item) => !item.revoked_at && new Date(item.expires_at) > new Date()) || [], [data]);

    async function revokeSession(sessionId?: number) {
        if (!data) return;
        const password = window.prompt("برای لغو نشست، رمز عبور فعلی خود را وارد کنید:");
        if (!password) return;
        try {
            setActionLoading(true);
            const response = await apiRequest("/super-admin/security-session-revoke.php", { method: "POST", body: JSON.stringify({ user_id: data.target_admin.id, session_id: sessionId, current_password: password }) });
            setMessage(response.message);
            await loadOverview(data.target_admin.id);
            if (data.is_self && sessionId && data.sessions.find((item) => item.id === sessionId)?.is_current) {
                logout();
                router.push("/login");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "لغو نشست ناموفق بود.");
        } finally { setActionLoading(false); }
    }

    async function resolveEvent(item: SecurityEvent) {
        try {
            const response = await apiRequest("/super-admin/security-event-resolve.php", { method: "POST", body: JSON.stringify({ id: item.id, resolved: !item.resolved_at }) });
            setMessage(response.message);
            await loadOverview(selectedUserId);
        } catch (err) { setError(err instanceof Error ? err.message : "ثبت وضعیت رویداد ناموفق بود."); }
    }

    async function saveIpRule(event: FormEvent) {
        event.preventDefault();
        if (!data) return;
        try {
            setActionLoading(true);
            const response = await apiRequest("/super-admin/security-ip-allowlist.php", { method: "POST", body: JSON.stringify({ action: "save", user_id: data.target_admin.id, label: ipLabel, ip_cidr: ipCidr, current_password: ipPassword }) });
            setMessage(response.message); setIpLabel(""); setIpCidr(""); setIpPassword("");
            await loadOverview(data.target_admin.id);
        } catch (err) { setError(err instanceof Error ? err.message : "ذخیره IP ناموفق بود."); }
        finally { setActionLoading(false); }
    }

    async function deleteIpRule(rule: IpRule) {
        if (!data) return;
        const password = window.prompt(`رمز فعلی را برای حذف «${rule.label}» وارد کنید:`);
        if (!password) return;
        try {
            await apiRequest("/super-admin/security-ip-allowlist.php", { method: "POST", body: JSON.stringify({ action: "delete", id: rule.id, user_id: data.target_admin.id, current_password: password }) });
            await loadOverview(data.target_admin.id);
        } catch (err) { setError(err instanceof Error ? err.message : "حذف قانون ناموفق بود."); }
    }

    async function toggleIpAllowlist() {
        if (!data) return;
        const password = window.prompt("رمز عبور فعلی خود را وارد کنید:");
        if (!password) return;
        try {
            const enabled = !data.target_admin.ip_allowlist_enabled;
            const response = await apiRequest("/super-admin/security-ip-allowlist.php", { method: "POST", body: JSON.stringify({ action: "set_enabled", user_id: data.target_admin.id, enabled, current_password: password }) });
            setMessage(response.message);
            await loadOverview(data.target_admin.id);
            if (data.is_self) { logout(); router.push("/login"); }
        } catch (err) { setError(err instanceof Error ? err.message : "تغییر محدودیت IP ناموفق بود."); }
    }

    async function beginTwoFactor() {
        try {
            setActionLoading(true);
            const response = await apiRequest("/auth/two-factor-settings.php", { method: "POST", body: JSON.stringify({ action: "begin" }) });
            setSetupSecret(response.secret); setSetupUri(response.otpauth_uri); setTwoFactorCode(""); setRecoveryCodes([]);
        } catch (err) { setError(err instanceof Error ? err.message : "شروع فعال‌سازی 2FA ناموفق بود."); }
        finally { setActionLoading(false); }
    }

    async function confirmTwoFactor(event: FormEvent) {
        event.preventDefault();
        try {
            setActionLoading(true);
            const response = await apiRequest("/auth/two-factor-settings.php", { method: "POST", body: JSON.stringify({ action: "confirm", secret: setupSecret, code: twoFactorCode, current_password: twoFactorPassword }) });
            setRecoveryCodes(response.recovery_codes || []); setMessage(response.message);
        } catch (err) { setError(err instanceof Error ? err.message : "فعال‌سازی 2FA ناموفق بود."); }
        finally { setActionLoading(false); }
    }

    async function disableTwoFactor() {
        const password = window.prompt("رمز عبور فعلی خود را وارد کنید:");
        if (!password) return;
        const code = window.prompt("کد Authenticator یا کد بازیابی را وارد کنید:");
        if (!code) return;
        try {
            const response = await apiRequest("/auth/two-factor-settings.php", { method: "POST", body: JSON.stringify({ action: "disable", current_password: password, code }) });
            setMessage(response.message); logout(); router.push("/login");
        } catch (err) { setError(err instanceof Error ? err.message : "غیرفعال‌سازی 2FA ناموفق بود."); }
    }

    if (loading && !data) return <AppShell title="مرکز امنیت"><div className="security-center-loading">در حال دریافت اطلاعات امنیتی...</div></AppShell>;

    return (
        <AppShell kicker="Security Operations" title="مرکز امنیت" description="مدیریت نشست‌ها، ورودها، هشدارها، IP و ورود دومرحله‌ای">
            <div className="security-center-page">
                <section className="security-center-selector">
                    <div><strong>حساب تحت بررسی</strong><small>اطلاعات امنیتی هر مدیر را به‌صورت جداگانه مشاهده کنید.</small></div>
                    <select className="input" value={selectedUserId} onChange={(event) => { const id = Number(event.target.value); setSelectedUserId(id); loadOverview(id); }}>{data?.admins.map((admin) => <option key={admin.id} value={admin.id}>{admin.name} — {admin.admin_role_name}</option>)}</select>
                </section>
                {message && <div className="success">{message}</div>}{error && <div className="error">{error}</div>}

                {data && <>
                    <section className="security-center-hero">
                        <div className="security-center-identity"><span>{data.target_admin.name.slice(0,1)}</span><div><h2>{data.target_admin.name}</h2><p dir="ltr">{data.target_admin.email}</p><small>{data.target_admin.admin_role_name}</small></div></div>
                        <div className="security-center-flags"><span className={data.two_factor.enabled ? "on" : ""}>2FA {data.two_factor.enabled ? "فعال" : "خاموش"}</span><span className={data.target_admin.ip_allowlist_enabled ? "on" : ""}>IP {data.target_admin.ip_allowlist_enabled ? "محدود" : "آزاد"}</span><span className={data.target_admin.locked_until ? "danger" : "on"}>{data.target_admin.locked_until ? "قفل‌شده" : "حساب باز"}</span></div>
                    </section>
                    <section className="security-center-stats"><article><span>نشست فعال</span><b>{data.summary.active_sessions}</b><small>دستگاه متصل</small></article><article><span>ورود ناموفق ۲۴ ساعت</span><b>{data.summary.failed_24h}</b><small>نیازمند بررسی</small></article><article><span>رویداد باز</span><b>{data.summary.open_events}</b><small>{data.summary.critical_events} مورد بحرانی</small></article><article><span>آخرین IP</span><b dir="ltr">{data.target_admin.last_login_ip || "—"}</b><small>{date(data.target_admin.last_login_at)}</small></article></section>
                    <nav className="security-center-tabs">{([['overview','نمای کلی'],['sessions','نشست‌ها'],['logins','تاریخچه ورود'],['events','هشدارها'],['ip','IP Allowlist'],['two-factor','ورود دومرحله‌ای']] as [Tab,string][]).map(([key,label]) => <button key={key} className={tab===key?'active':''} onClick={() => setTab(key)}>{label}</button>)}</nav>

                    {tab === "overview" && <section className="security-overview-grid"><article><h3>وضعیت حساب</h3><dl><div><dt>آخرین ورود</dt><dd>{date(data.target_admin.last_login_at)}</dd></div><div><dt>IP فعلی شما</dt><dd dir="ltr">{data.current_ip || "—"}</dd></div><div><dt>2FA</dt><dd>{data.two_factor.enabled ? `فعال از ${date(data.two_factor.confirmed_at)}` : "غیرفعال"}</dd></div><div><dt>کد بازیابی</dt><dd>{data.two_factor.unused_recovery_codes} کد استفاده‌نشده</dd></div></dl></article><article><h3>پیشنهادهای امنیتی</h3><ul><li className={data.two_factor.enabled ? 'done' : ''}>فعال‌سازی ورود دومرحله‌ای</li><li className={data.target_admin.ip_allowlist_enabled ? 'done' : ''}>محدودکردن ورود به IPهای مورد اعتماد</li><li className={activeSessions.length <= 3 ? 'done' : ''}>بررسی و بستن نشست‌های قدیمی</li><li className={Number(data.summary.failed_24h) === 0 ? 'done' : ''}>بررسی ورودهای ناموفق اخیر</li></ul></article></section>}

                    {tab === "sessions" && <section className="security-list-card"><header><div><h3>نشست‌های حساب</h3><p>هر JWT اکنون یک نشست قابل ردیابی و لغو دارد.</p></div>{data.can_manage && activeSessions.length > 0 && <button className="btn danger" disabled={actionLoading} onClick={() => revokeSession()}>لغو همه نشست‌ها</button>}</header><div className="security-session-list">{data.sessions.map((session) => <article className={session.revoked_at ? "revoked" : ""} key={session.id}><span className="device-icon">{session.user_agent?.includes('Mobile') ? 'M' : 'PC'}</span><div><strong>{browserLabel(session.user_agent)} {session.is_current ? '(نشست فعلی)' : ''}</strong><small dir="ltr">{session.ip_address || 'IP unknown'}</small><p>آخرین فعالیت: {date(session.last_seen_at)} · انقضا: {date(session.expires_at)}</p>{session.revoked_at && <em>لغوشده: {date(session.revoked_at)} — {session.revocation_reason}</em>}</div>{!session.revoked_at && data.can_manage && <button onClick={() => revokeSession(session.id)}>لغو نشست</button>}</article>)}</div></section>}

                    {tab === "logins" && <section className="security-list-card"><header><div><h3>تاریخچه ورود</h3><p>موفقیت، دلیل شکست، IP و زمان هر تلاش.</p></div></header><div className="security-login-list">{data.login_attempts.map((item) => <article key={item.id}><span className={item.success ? 'success-dot' : 'failure-dot'} /><div><strong>{item.success ? 'ورود موفق' : 'ورود ناموفق'}</strong><small>{item.failure_reason || 'بدون خطا'} · {browserLabel(item.user_agent)}</small></div><div><b dir="ltr">{item.ip_address || '—'}</b><small>{date(item.created_at)}</small></div></article>)}</div></section>}

                    {tab === "events" && <section className="security-list-card"><header><div><h3>رویدادهای امنیتی</h3><p>قفل حساب، IP غیرمجاز، شکست 2FA و تغییرات حساس.</p></div></header><div className="security-event-list">{data.events.map((item) => <article className={`${item.severity} ${item.resolved_at ? 'resolved' : ''}`} key={item.id}><span>{item.severity === 'critical' ? '!' : item.severity === 'warning' ? '⚠' : 'i'}</span><div><strong>{item.title}</strong><small>{item.event_type} · {date(item.created_at)} · <b dir="ltr">{item.ip_address || '—'}</b></small></div>{data.can_manage && <button onClick={() => resolveEvent(item)}>{item.resolved_at ? 'بازکردن' : 'حل‌شده'}</button>}</article>)}</div></section>}

                    {tab === "ip" && <section className="security-ip-layout"><article className="security-list-card"><header><div><h3>IPهای مجاز</h3><p>IPv4، IPv6 یا CIDR مانند 192.168.1.0/24</p></div>{data.can_manage && <button className={`btn ${data.target_admin.ip_allowlist_enabled ? 'danger' : 'primary'}`} onClick={toggleIpAllowlist}>{data.target_admin.ip_allowlist_enabled ? 'غیرفعال‌کردن محدودیت' : 'فعال‌کردن محدودیت'}</button>}</header><div className="security-ip-list">{data.allowlist.length === 0 ? <p className="security-empty">قانونی ثبت نشده است.</p> : data.allowlist.map((rule) => <article key={rule.id}><span className={rule.is_active ? 'on' : ''}/><div><strong>{rule.label}</strong><code>{rule.ip_cidr}</code></div>{data.can_manage && <button onClick={() => deleteIpRule(rule)}>حذف</button>}</article>)}</div></article>{data.can_manage && <form className="security-ip-form" onSubmit={saveIpRule}><h3>افزودن IP مورد اعتماد</h3><p>برای حساب خودتان ابتدا IP فعلی را اضافه کنید تا قفل نشوید.</p><label><span>عنوان</span><input className="input" value={ipLabel} onChange={(e) => setIpLabel(e.target.value)} placeholder="دفتر مرکزی" required /></label><label><span>IP یا CIDR</span><input className="input" dir="ltr" value={ipCidr} onChange={(e) => setIpCidr(e.target.value)} placeholder={data.current_ip || '192.168.1.10'} required /></label><label className="sensitive"><span>رمز فعلی شما</span><input className="input" type="password" value={ipPassword} onChange={(e) => setIpPassword(e.target.value)} required /></label><button className="btn primary" disabled={actionLoading}>ثبت قانون</button></form>}</section>}

                    {tab === "two-factor" && <section className="security-two-factor-card">{!data.is_self ? <div className="security-empty">تنظیم 2FA فقط توسط خودِ مدیر انجام می‌شود. برای این حساب نمی‌توانید Secret را مشاهده یا تغییر دهید.</div> : data.two_factor.enabled ? <><div className="two-factor-state enabled"><span>✓</span><div><h3>ورود دومرحله‌ای فعال است</h3><p>پس از رمز عبور، کد Authenticator یا Recovery Code لازم است.</p></div></div><div className="two-factor-metrics"><span><b>{data.two_factor.unused_recovery_codes}</b> کد بازیابی باقی‌مانده</span><span>فعال از {date(data.two_factor.confirmed_at)}</span></div><button className="btn danger" onClick={disableTwoFactor}>غیرفعال‌کردن 2FA</button></> : !setupSecret ? <><div className="two-factor-state"><span>2FA</span><div><h3>محافظت دومرحله‌ای را فعال کنید</h3><p>با Google Authenticator، Microsoft Authenticator یا برنامه سازگار.</p></div></div><button className="btn primary" disabled={actionLoading} onClick={beginTwoFactor}>شروع فعال‌سازی</button></> : recoveryCodes.length ? <div className="recovery-result"><h3>کدهای بازیابی را همین حالا ذخیره کنید</h3><p>این کدها دوباره نمایش داده نمی‌شوند. هر کد فقط یک‌بار قابل استفاده است.</p><div>{recoveryCodes.map((code) => <code key={code}>{code}</code>)}</div><button className="btn primary" onClick={() => { logout(); router.push('/login'); }}>ذخیره کردم؛ ورود دوباره</button></div> : <form className="two-factor-setup" onSubmit={confirmTwoFactor}><h3>اتصال Authenticator</h3><p>Secret زیر را در برنامه وارد یا URI را کپی کنید.</p><label><span>Secret</span><div className="secret-copy"><code>{setupSecret}</code><button type="button" onClick={() => navigator.clipboard.writeText(setupSecret)}>کپی</button></div></label><details><summary>نمایش URI کامل</summary><code className="uri-code">{setupUri}</code></details><label><span>کد ۶ رقمی</span><input className="input" dir="ltr" inputMode="numeric" value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g,'').slice(0,6))} required /></label><label className="sensitive"><span>رمز فعلی شما</span><input className="input" type="password" value={twoFactorPassword} onChange={(e) => setTwoFactorPassword(e.target.value)} required /></label><button className="btn primary" disabled={actionLoading}>تأیید و فعال‌سازی</button></form>}</section>}
                </>}
            </div>
        </AppShell>
    );
}
