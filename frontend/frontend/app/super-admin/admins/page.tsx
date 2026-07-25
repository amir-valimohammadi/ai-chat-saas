"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type AdminRole = {
    id: number;
    code: string;
    name: string;
    description: string | null;
    is_system: number;
    is_active: number;
    admins_count: number;
    permissions_count?: number;
    permissions?: string[];
};

type Permission = {
    id: number;
    code: string;
    name: string;
    group_name: string;
    description: string | null;
};

type AdminUser = {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    is_active: number;
    admin_role_id: number;
    admin_role_code: string;
    admin_role_name: string;
    must_change_password: number;
    two_factor_enabled: number;
    ip_allowlist_enabled: number;
    locked_until: string | null;
    last_login_at: string | null;
    last_login_ip: string | null;
    active_sessions: number;
    created_at: string;
};

type AdminForm = {
    id: number;
    name: string;
    email: string;
    phone: string;
    admin_role_id: string;
    password: string;
    must_change_password: boolean;
    current_password: string;
};

type RoleForm = {
    id: number;
    code: string;
    name: string;
    description: string;
    permissions: string[];
    current_password: string;
};

const emptyAdminForm: AdminForm = {
    id: 0,
    name: "",
    email: "",
    phone: "",
    admin_role_id: "",
    password: "",
    must_change_password: true,
    current_password: "",
};

const emptyRoleForm: RoleForm = {
    id: 0,
    code: "",
    name: "",
    description: "",
    permissions: [],
    current_password: "",
};

function formatDate(value: string | null) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function AdminsPage() {
    const router = useRouter();
    const [tab, setTab] = useState<"admins" | "roles">("admins");
    const [admins, setAdmins] = useState<AdminUser[]>([]);
    const [roles, setRoles] = useState<AdminRole[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("all");
    const [roleFilter, setRoleFilter] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [adminModal, setAdminModal] = useState(false);
    const [roleModal, setRoleModal] = useState(false);
    const [resetAdmin, setResetAdmin] = useState<AdminUser | null>(null);
    const [adminForm, setAdminForm] = useState<AdminForm>(emptyAdminForm);
    const [roleForm, setRoleForm] = useState<RoleForm>(emptyRoleForm);
    const [resetPassword, setResetPassword] = useState("");
    const [confirmationPassword, setConfirmationPassword] = useState("");
    const [saving, setSaving] = useState(false);
    const [currentAdminId, setCurrentAdminId] = useState(0);
    const [isOwner, setIsOwner] = useState(false);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setError("");
            const [adminsData, rolesData] = await Promise.all([
                apiRequest(`/super-admin/admins-list.php?q=${encodeURIComponent(query)}&status=${status}&role_id=${roleFilter || 0}`),
                apiRequest("/super-admin/admin-roles-list.php"),
            ]);
            setAdmins(adminsData.admins || []);
            setRoles(rolesData.roles || []);
            setPermissions(rolesData.permissions || []);
            setCurrentAdminId(Number(adminsData.current_admin?.id || 0));
            setIsOwner(Boolean(adminsData.current_admin?.is_owner));
        } catch (err) {
            setError(err instanceof Error ? err.message : "دریافت مدیران ناموفق بود.");
        } finally {
            setLoading(false);
        }
    }, [query, roleFilter, status]);

    useEffect(() => {
        const user = getAuthUser() as { role?: string; permissions?: string[]; is_platform_owner?: boolean } | null;
        if (!user) return void router.push("/login");
        if (user.role !== "super_admin") return void router.push("/dashboard");
        if (!user.is_platform_owner && !user.permissions?.includes("*") && !user.permissions?.includes("admins.view")) {
            return void router.push("/super-admin/dashboard");
        }
        const timer = window.setTimeout(loadData, 200);
        return () => window.clearTimeout(timer);
    }, [loadData, router]);

    const permissionGroups = useMemo(() => {
        return permissions.reduce<Record<string, Permission[]>>((groups, item) => {
            (groups[item.group_name] ||= []).push(item);
            return groups;
        }, {});
    }, [permissions]);

    function openCreateAdmin() {
        setAdminForm({ ...emptyAdminForm, admin_role_id: String(roles.find((item) => item.is_active)?.id || "") });
        setAdminModal(true);
    }

    function openEditAdmin(admin: AdminUser) {
        setAdminForm({
            id: admin.id,
            name: admin.name,
            email: admin.email,
            phone: admin.phone || "",
            admin_role_id: String(admin.admin_role_id || ""),
            password: "",
            must_change_password: Boolean(admin.must_change_password),
            current_password: "",
        });
        setAdminModal(true);
    }

    async function saveAdmin(event: FormEvent) {
        event.preventDefault();
        try {
            setSaving(true);
            setError("");
            const response = await apiRequest("/super-admin/admin-save.php", {
                method: "POST",
                body: JSON.stringify({ ...adminForm, admin_role_id: Number(adminForm.admin_role_id) }),
            });
            setMessage(response.message);
            setAdminModal(false);
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "ذخیره مدیر ناموفق بود.");
        } finally {
            setSaving(false);
        }
    }

    async function unlockAdmin(admin: AdminUser) {
        const currentPassword = window.prompt(`رمز عبور فعلی خود را برای بازکردن قفل «${admin.name}» وارد کنید:`);
        if (!currentPassword) return;
        try {
            const response = await apiRequest("/super-admin/admin-status-update.php", {
                method: "POST",
                body: JSON.stringify({ id: admin.id, unlock: true, current_password: currentPassword }),
            });
            setMessage(response.message);
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "بازکردن قفل ناموفق بود.");
        }
    }

    async function toggleAdmin(admin: AdminUser) {
        const currentPassword = window.prompt(`رمز عبور فعلی خود را برای ${admin.is_active ? "غیرفعال‌سازی" : "فعال‌سازی"} «${admin.name}» وارد کنید:`);
        if (!currentPassword) return;
        try {
            const response = await apiRequest("/super-admin/admin-status-update.php", {
                method: "POST",
                body: JSON.stringify({ id: admin.id, is_active: !admin.is_active, current_password: currentPassword }),
            });
            setMessage(response.message);
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "تغییر وضعیت ناموفق بود.");
        }
    }

    async function submitResetPassword(event: FormEvent) {
        event.preventDefault();
        if (!resetAdmin) return;
        try {
            setSaving(true);
            const response = await apiRequest("/super-admin/admin-password-reset.php", {
                method: "POST",
                body: JSON.stringify({ id: resetAdmin.id, new_password: resetPassword, current_password: confirmationPassword }),
            });
            setMessage(response.message);
            setResetAdmin(null);
            setResetPassword("");
            setConfirmationPassword("");
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "بازنشانی رمز ناموفق بود.");
        } finally {
            setSaving(false);
        }
    }

    function openCreateRole() {
        setRoleForm(emptyRoleForm);
        setRoleModal(true);
    }

    function openEditRole(role: AdminRole) {
        setRoleForm({
            id: role.id,
            code: role.code,
            name: role.name,
            description: role.description || "",
            permissions: role.permissions?.includes("*") ? permissions.map((item) => item.code) : role.permissions || [],
            current_password: "",
        });
        setRoleModal(true);
    }

    async function saveRole(event: FormEvent) {
        event.preventDefault();
        try {
            setSaving(true);
            const response = await apiRequest("/super-admin/admin-role-save.php", {
                method: "POST",
                body: JSON.stringify(roleForm),
            });
            setMessage(response.message);
            setRoleModal(false);
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "ذخیره نقش ناموفق بود.");
        } finally {
            setSaving(false);
        }
    }

    async function toggleRole(role: AdminRole) {
        const currentPassword = window.prompt("رمز عبور فعلی خود را وارد کنید:");
        if (!currentPassword) return;
        try {
            const response = await apiRequest("/super-admin/admin-role-toggle.php", {
                method: "POST",
                body: JSON.stringify({ id: role.id, is_active: !role.is_active, current_password: currentPassword }),
            });
            setMessage(response.message);
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "تغییر وضعیت نقش ناموفق بود.");
        }
    }

    return (
        <AppShell
            kicker="Access Control"
            title="مدیران و نقش‌ها"
            description="مدیریت حساب‌های پلتفرم، نقش‌ها و مجوزهای دسترسی"
            actions={<button className="btn primary" onClick={tab === "admins" ? openCreateAdmin : openCreateRole}>+ {tab === "admins" ? "مدیر جدید" : "نقش جدید"}</button>}
        >
            <div className="admin-access-page">
                <div className="admin-access-tabs">
                    <button className={tab === "admins" ? "active" : ""} onClick={() => setTab("admins")}>مدیران پلتفرم <span>{admins.length}</span></button>
                    <button className={tab === "roles" ? "active" : ""} onClick={() => setTab("roles")}>نقش‌ها و مجوزها <span>{roles.length}</span></button>
                </div>

                {message && <div className="success">{message}</div>}
                {error && <div className="error">{error}</div>}

                {tab === "admins" ? (
                    <>
                        <section className="admin-access-toolbar">
                            <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی نام، ایمیل یا تلفن" />
                            <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
                                <option value="all">همه وضعیت‌ها</option><option value="active">فعال</option><option value="inactive">غیرفعال</option><option value="locked">قفل‌شده</option>
                            </select>
                            <select className="input" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                                <option value="">همه نقش‌ها</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                            </select>
                            <button className="btn secondary" onClick={() => loadData()}>بروزرسانی</button>
                        </section>

                        <section className="admin-access-card">
                            {loading ? <div className="admin-access-empty">در حال دریافت مدیران...</div> : admins.length === 0 ? <div className="admin-access-empty">مدیری پیدا نشد.</div> : (
                                <div className="admin-access-table-wrap"><table className="admin-access-table"><thead><tr><th>مدیر</th><th>نقش</th><th>امنیت</th><th>آخرین ورود</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>
                                    {admins.map((admin) => <tr key={admin.id}>
                                        <td><div className="admin-person"><span>{admin.name.slice(0, 1)}</span><div><strong>{admin.name}{admin.id === currentAdminId ? " (شما)" : ""}</strong><small dir="ltr">{admin.email}</small></div></div></td>
                                        <td><span className={`admin-role-badge role-${admin.admin_role_code}`}>{admin.admin_role_name || "بدون نقش"}</span></td>
                                        <td><div className="admin-security-flags"><span className={admin.two_factor_enabled ? "on" : ""}>2FA</span><span className={admin.ip_allowlist_enabled ? "on" : ""}>IP</span><small>{admin.active_sessions} نشست</small></div></td>
                                        <td><strong>{formatDate(admin.last_login_at)}</strong><small className="admin-table-sub" dir="ltr">{admin.last_login_ip || "بدون IP"}</small></td>
                                        <td><span className={`admin-status ${admin.locked_until ? "locked" : admin.is_active ? "active" : "inactive"}`}>{admin.locked_until ? "قفل‌شده" : admin.is_active ? "فعال" : "غیرفعال"}</span></td>
                                        <td><div className="admin-row-actions"><button onClick={() => openEditAdmin(admin)}>ویرایش</button><button onClick={() => { setResetAdmin(admin); setResetPassword(""); setConfirmationPassword(""); }}>رمز جدید</button>{admin.locked_until && <button className="success-action" onClick={() => unlockAdmin(admin)}>بازکردن قفل</button>}{admin.id !== currentAdminId && <button className={admin.is_active ? "danger" : "success-action"} onClick={() => toggleAdmin(admin)}>{admin.is_active ? "غیرفعال" : "فعال"}</button>}</div></td>
                                    </tr>)}
                                </tbody></table></div>
                            )}
                        </section>
                    </>
                ) : (
                    <section className="admin-role-grid">
                        {roles.map((role) => <article className={`admin-role-card ${!role.is_active ? "disabled" : ""}`} key={role.id}>
                            <header><div><span className="admin-role-code">{role.code}</span><h3>{role.name}</h3></div><span className={role.is_active ? "admin-status active" : "admin-status inactive"}>{role.is_active ? "فعال" : "غیرفعال"}</span></header>
                            <p>{role.description || "بدون توضیح"}</p>
                            <div className="admin-role-metrics"><span><b>{role.admins_count}</b> مدیر</span><span><b>{role.permissions?.includes("*") ? permissions.length : role.permissions?.length || 0}</b> مجوز</span><span>{role.is_system ? "سیستمی" : "سفارشی"}</span></div>
                            <footer><button className="btn secondary" disabled={role.code === "owner"} onClick={() => openEditRole(role)}>ویرایش مجوزها</button>{role.code !== "owner" && <button className="btn ghost" onClick={() => toggleRole(role)}>{role.is_active ? "غیرفعال‌کردن" : "فعال‌کردن"}</button>}</footer>
                        </article>)}
                    </section>
                )}
            </div>

            {adminModal && <div className="admin-modal-backdrop"><form className="admin-modal" onSubmit={saveAdmin}><header><div><h2>{adminForm.id ? "ویرایش مدیر" : "ایجاد مدیر جدید"}</h2><p>عملیات با رمز فعلی شما تأیید می‌شود.</p></div><button type="button" onClick={() => setAdminModal(false)}>×</button></header><div className="admin-form-grid">
                <label><span>نام کامل</span><input className="input" value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })} required /></label>
                <label><span>ایمیل</span><input className="input" type="email" dir="ltr" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} required /></label>
                <label><span>تلفن</span><input className="input" dir="ltr" value={adminForm.phone} onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })} /></label>
                <label><span>نقش مدیریتی</span><select className="input" value={adminForm.admin_role_id} onChange={(e) => setAdminForm({ ...adminForm, admin_role_id: e.target.value })} required>{roles.filter((role) => role.is_active && (isOwner || role.code !== "owner")).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
                {!adminForm.id && <label className="wide"><span>رمز اولیه</span><input className="input" type="password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} placeholder="حداقل ۱۰ کاراکتر، حرف، عدد و نماد" required /></label>}
                <label className="admin-checkbox wide"><input type="checkbox" checked={adminForm.must_change_password} onChange={(e) => setAdminForm({ ...adminForm, must_change_password: e.target.checked })} /><span>در ورود بعدی تغییر رمز اجباری باشد</span></label>
                <label className="wide sensitive"><span>رمز فعلی شما</span><input className="input" type="password" value={adminForm.current_password} onChange={(e) => setAdminForm({ ...adminForm, current_password: e.target.value })} required /></label>
            </div><footer><button type="button" className="btn secondary" onClick={() => setAdminModal(false)}>انصراف</button><button className="btn primary" disabled={saving}>{saving ? "در حال ذخیره..." : "ذخیره مدیر"}</button></footer></form></div>}

            {roleModal && <div className="admin-modal-backdrop"><form className="admin-modal role-modal" onSubmit={saveRole}><header><div><h2>{roleForm.id ? "ویرایش نقش" : "نقش جدید"}</h2><p>مجوزهای دقیق این نقش را انتخاب کنید.</p></div><button type="button" onClick={() => setRoleModal(false)}>×</button></header><div className="admin-form-grid">
                <label><span>نام نقش</span><input className="input" value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} required /></label>
                {!roleForm.id && <label><span>کد انگلیسی</span><input className="input" dir="ltr" value={roleForm.code} onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} required /></label>}
                <label className="wide"><span>توضیح</span><textarea className="input" value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} /></label>
            </div><div className="permission-groups">{Object.entries(permissionGroups).map(([group, items]) => <section key={group}><header><strong>{group}</strong><button type="button" onClick={() => { const codes = items.map((item) => item.code); const all = codes.every((code) => roleForm.permissions.includes(code)); setRoleForm({ ...roleForm, permissions: all ? roleForm.permissions.filter((code) => !codes.includes(code)) : Array.from(new Set([...roleForm.permissions, ...codes])) }); }}>{items.every((item) => roleForm.permissions.includes(item.code)) ? "حذف همه" : "انتخاب همه"}</button></header>{items.map((permission) => <label key={permission.code}><input type="checkbox" checked={roleForm.permissions.includes(permission.code)} onChange={(e) => setRoleForm({ ...roleForm, permissions: e.target.checked ? [...roleForm.permissions, permission.code] : roleForm.permissions.filter((code) => code !== permission.code) })} /><span><strong>{permission.name}</strong><small>{permission.description}</small></span></label>)}</section>)}</div><label className="sensitive role-confirm"><span>رمز فعلی شما</span><input className="input" type="password" value={roleForm.current_password} onChange={(e) => setRoleForm({ ...roleForm, current_password: e.target.value })} required /></label><footer><button type="button" className="btn secondary" onClick={() => setRoleModal(false)}>انصراف</button><button className="btn primary" disabled={saving}>{saving ? "در حال ذخیره..." : "ذخیره نقش"}</button></footer></form></div>}

            {resetAdmin && <div className="admin-modal-backdrop"><form className="admin-modal compact" onSubmit={submitResetPassword}><header><div><h2>بازنشانی رمز {resetAdmin.name}</h2><p>همه نشست‌های قبلی این مدیر لغو می‌شوند.</p></div><button type="button" onClick={() => setResetAdmin(null)}>×</button></header><label><span>رمز جدید مدیر</span><input className="input" type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} required /></label><label className="sensitive"><span>رمز فعلی شما</span><input className="input" type="password" value={confirmationPassword} onChange={(e) => setConfirmationPassword(e.target.value)} required /></label><footer><button type="button" className="btn secondary" onClick={() => setResetAdmin(null)}>انصراف</button><button className="btn primary" disabled={saving}>ثبت رمز جدید</button></footer></form></div>}
        </AppShell>
    );
}
