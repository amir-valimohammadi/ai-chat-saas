// مسیر فایل: ai-chat-saas/frontend/components/layout/AppShell.tsx
// هدف: Layout حرفه‌ای مشترک برای پنل مشتری، پشتیبان و سوپر ادمین

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import MaintenanceOverlay from "@/components/system/MaintenanceOverlay";
import ImpersonationBanner from "@/components/auth/ImpersonationBanner";
import {
    apiRequest,
    getAuthUser,
    updateAuthUser,
    logout,
    logoutCurrentDevice,
    clearImpersonationAuth,
    MAINTENANCE_MODE_EVENT,
    type MaintenanceModeDetails,
} from "@/lib/api";

type AppShellProps = {
    children: ReactNode;
    title: string;
    description?: string;
    kicker?: string;
    actions?: ReactNode;
    variant?: "default" | "workspace";
};

type UserRole = "super_admin" | "customer_admin" | "agent";

type User = {
    id?: number;
    name: string;
    email: string;
    role: UserRole;
    permissions?: string[];
    admin_role_name?: string | null;
    is_platform_owner?: boolean;
    must_change_password?: boolean;
    is_impersonating?: boolean;
    impersonation_id?: number;
    impersonator_name?: string | null;
    impersonation_expires_at?: string | null;
};

type NavLink = {
    href: string;
    label: string;
    icon: string;
    description?: string;
    permission?: string;
};

type NavGroup = {
    title: string;
    links: NavLink[];
};

const roleLabels: Record<UserRole, string> = {
    super_admin: "سوپر ادمین",
    customer_admin: "مدیر مشتری",
    agent: "پشتیبان",
};

export default function AppShell({
                                     children,
                                     title,
                                     description,
                                     kicker,
                                     actions,
                                     variant = "default",
                                 }: AppShellProps) {
    const router = useRouter();
    const pathname = usePathname();

    const [user, setUser] = useState<User | null>(null);
    const [newRequestCount, setNewRequestCount] = useState(0);
    const [maintenance, setMaintenance] =
        useState<MaintenanceModeDetails | null>(null);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    useEffect(() => {
        setSidebarCollapsed(window.localStorage.getItem("panel_sidebar_collapsed") === "1");
    }, []);

    useEffect(() => {
        setMobileNavOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (!mobileNavOpen) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") setMobileNavOpen(false);
        }

        window.addEventListener("keydown", closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [mobileNavOpen]);

    useEffect(() => {
        let active = true;
        const authUser = getAuthUser() as User | null;

        if (!authUser) {
            router.push("/login");
            return;
        }

        setUser(authUser);

        apiRequest("/auth/me.php", { cache: "no-store" })
            .then((data) => {
                if (!active || !data?.user) return;
                updateAuthUser(data.user);
                setUser(data.user as User);
            })
            .catch(() => {
                // apiRequest handles expired sessions and redirects to login.
            });

        return () => {
            active = false;
        };
    }, [router]);

    useEffect(() => {
        if (user?.must_change_password && pathname !== "/security") {
            router.replace("/security?required=1");
        }
    }, [pathname, router, user?.must_change_password]);

    useEffect(() => {
        if (!user || user.role === "super_admin") {
            setMaintenance(null);
            return;
        }

        let active = true;

        function handleMaintenanceEvent(event: Event) {
            const customEvent = event as CustomEvent<MaintenanceModeDetails>;
            if (active && customEvent.detail?.enabled) {
                setMaintenance(customEvent.detail);
            }
        }

        async function loadMaintenanceStatus() {
            try {
                const data = await apiRequest(
                    "/system/maintenance-status.php",
                    { auth: false, cache: "no-store" }
                );

                if (!active) {
                    return;
                }

                if (data?.maintenance?.enabled) {
                    setMaintenance({
                        enabled: true,
                        message:
                            data.maintenance.message ||
                            "سامانه برای انجام عملیات نگهداری موقتاً در دسترس نیست.",
                        until: data.maintenance.until || null,
                    });
                } else {
                    setMaintenance(null);
                }
            } catch {
                // خرابی endpoint وضعیت نباید پنل یا خروج کاربر را مختل کند.
            }
        }

        window.addEventListener(
            MAINTENANCE_MODE_EVENT,
            handleMaintenanceEvent as EventListener
        );

        loadMaintenanceStatus();
        const timer = window.setInterval(loadMaintenanceStatus, 20000);

        return () => {
            active = false;
            window.clearInterval(timer);
            window.removeEventListener(
                MAINTENANCE_MODE_EVENT,
                handleMaintenanceEvent as EventListener
            );
        };
    }, [user]);

    useEffect(() => {
        if (user?.role !== "super_admin") {
            setNewRequestCount(0);
            return;
        }

        let active = true;

        async function loadRequestCount() {
            try {
                const data = await apiRequest("/super-admin/contact-requests-count.php");
                if (active) {
                    setNewRequestCount(Number(data.new_count || 0));
                }
            } catch {
                // شمارنده نباید مانع نمایش پنل شود.
            }
        }

        loadRequestCount();
        const timer = window.setInterval(loadRequestCount, 60000);

        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, [user?.role]);

    useEffect(() => {
        const authUser = getAuthUser();

        if (!authUser || authUser.role === "super_admin") {
            return;
        }

        async function updatePresence() {
            try {
                await apiRequest("/agent/presence-update.php", {
                    method: "POST",
                });
            } catch {
                // خطای presence نباید کل پنل را خراب کند.
            }
        }

        updatePresence();

        const timer = window.setInterval(updatePresence, 30000);

        return () => window.clearInterval(timer);
    }, []);

    const navGroups = useMemo<NavGroup[]>(() => {
        if (!user) {
            return [];
        }

        const can = (permission?: string) => {
            if (!permission) return true;
            const permissions = user.permissions ?? [];
            return Boolean(user.is_platform_owner) || permissions.includes("*") || permissions.includes(permission);
        };

        const accountLinks: NavLink[] = [
            {
                href: "/security",
                label: "امنیت حساب",
                icon: "security",
                description: "رمز عبور و نشست‌ها",
            },
        ];

        if (user.role === "super_admin") {
            return [
                {
                    title: "مرکز فرماندهی",
                    links: [
                        {
                            href: "/super-admin/dashboard",
                            label: "داشبورد",
                            icon: "dashboard",
                            description: "نمای کلی سیستم",
                            permission: "dashboard.view",
                        },
                        {
                            href: "/super-admin/contact-requests",
                            label: "درخواست‌ها",
                            icon: "requests",
                            description: "مشاوره، خرید و راه‌اندازی",
                            permission: "requests.view",
                        },
                        {
                            href: "/super-admin/search",
                            label: "جست‌وجوی سراسری",
                            icon: "search",
                            description: "جست‌وجو در کل پلتفرم",
                            permission: "customers.view",
                        },
                    ].filter((link) => can(link.permission)),
                },
                {
                    title: "کسب‌وکار و مشتریان",
                    links: [
                        {
                            href: "/super-admin/customers",
                            label: "مشتری‌ها",
                            icon: "customers",
                            description: "حساب‌های مشتریان",
                            permission: "customers.view",
                        },
                        {
                            href: "/super-admin/customers/create",
                            label: "ایجاد مشتری",
                            icon: "add-user",
                            description: "ساخت حساب جدید",
                            permission: "customers.manage",
                        },
                        {
                            href: "/super-admin/sites",
                            label: "سایت‌ها",
                            icon: "sites",
                            description: "سایت‌های ثبت‌شده",
                            permission: "sites.view",
                        },
                        {
                            href: "/super-admin/plans",
                            label: "پلن‌ها",
                            icon: "plans",
                            description: "مدیریت پلن‌ها",
                            permission: "plans.view",
                        },
                        {
                            href: "/super-admin/subscriptions",
                            label: "اشتراک‌ها",
                            icon: "billing",
                            description: "انقضا، تمدید و پرداخت‌ها",
                            permission: "billing.view",
                        },
                    ].filter((link) => can(link.permission)),
                },
                {
                    title: "عملیات و کیفیت",
                    links: [
                        {
                            href: "/super-admin/ai-monitoring",
                            label: "نظارت AI",
                            icon: "ai",
                            description: "مصرف و کیفیت پاسخ‌ها",
                            permission: "ai.view",
                        },
                        {
                            href: "/super-admin/system-health",
                            label: "سلامت سیستم",
                            icon: "activity",
                            description: "سرویس‌ها، خطاها و Jobها",
                            permission: "operations.view",
                        },
                        {
                            href: "/super-admin/test-center",
                            label: "مرکز جامع تست",
                            icon: "tests",
                            description: "تست سلامت، امنیت و یکپارچگی",
                            permission: "tests.view",
                        },
                        {
                            href: "/super-admin/test-center/findings",
                            label: "ایرادات تست",
                            icon: "findings",
                            description: "دلایل، اثر و راهکار رفع",
                            permission: "tests.view",
                        },
                    ].filter((link) => can(link.permission)),
                },
                {
                    title: "امنیت و مدیریت",
                    links: [
                        {
                            href: "/super-admin/test-center/security",
                            label: "امنیت عمیق",
                            icon: "shield-check",
                            description: "Risk، OWASP و جداسازی Tenant",
                            permission: "tests.view_security_evidence",
                        },
                        {
                            href: "/super-admin/admins",
                            label: "مدیران و نقش‌ها",
                            icon: "admins",
                            description: "حساب‌ها، نقش‌ها و مجوزها",
                            permission: "admins.view",
                        },
                        {
                            href: "/super-admin/security-center",
                            label: "مرکز امنیت",
                            icon: "security",
                            description: "نشست‌ها، ورودها و 2FA",
                            permission: "security.view",
                        },
                        {
                            href: "/super-admin/audit-logs",
                            label: "گزارش فعالیت‌ها",
                            icon: "audit",
                            description: "تغییرات حساس مدیران",
                            permission: "audit.view",
                        },
                    ].filter((link) => can(link.permission)),
                },
                {
                    title: "ارتباطات",
                    links: [
                        {
                            href: "/super-admin/announcements",
                            label: "اعلان‌ها",
                            icon: "announcements",
                            description: "ارسال پیام به مشتریان",
                            permission: "announcements.view",
                        },
                    ].filter((link) => can(link.permission)),
                },
                {
                    title: "حساب کاربری",
                    links: accountLinks,
                },
            ];
        }

        const mainLinks: NavLink[] = [
            {
                href: "/dashboard",
                label: "داشبورد",
                icon: "dashboard",
                description: "مرکز کنترل حساب",
            },
            {
                href: "/conversations",
                label: "گفتگوها",
                icon: "conversations",
                description: "پیام‌های کاربران",
            },
            {
                href: "/visitors",
                label: "بازدیدکنندگان",
                icon: "visitors",
                description: "حضور زنده و مسیر صفحات",
            },
            {
                href: "/announcements",
                label: "اعلان‌ها",
                icon: "announcements",
                description: "پیام‌های مدیر سیستم",
            },
        ];

        if (user.role === "agent") {
            return [
                {
                    title: "پنل پشتیبان",
                    links: mainLinks,
                },
                {
                    title: "حساب کاربری",
                    links: accountLinks,
                },
            ];
        }

        return [
            {
                title: "مرکز کار",
                links: mainLinks,
            },
            {
                title: "رشد و هوش مصنوعی",
                links: [
                    {
                        href: "/sites",
                        label: "سایت‌ها",
                        icon: "sites",
                        description: "دامنه‌ها و کد نصب",
                    },
                    {
                        href: "/reports",
                        label: "گزارش‌ها",
                        icon: "reports",
                        description: "روند و عملکرد",
                    },
                    {
                        href: "/subscription",
                        label: "پلن و مصرف",
                        icon: "billing",
                        description: "محدودیت‌ها و مصرف",
                    },
                    {
                        href: "/knowledge",
                        label: "دانش AI",
                        icon: "knowledge",
                        description: "منبع پاسخ هوشمند",
                    },
                    {
                        href: "/ai-center",
                        label: "مرکز AI",
                        icon: "ai",
                        description: "خزش، تست و پاسخ خودکار",
                    },
                ],
            },
            {
                title: "تنظیمات پشتیبانی",
                links: [
                    {
                        href: "/quick-replies",
                        label: "پاسخ‌های آماده",
                        icon: "quick-replies",
                        description: "متن‌های پرتکرار",
                    },
                    {
                        href: "/widget-settings",
                        label: "تنظیمات ویجت",
                        icon: "widget",
                        description: "ظاهر و رفتار ویجت",
                    },
                    {
                        href: "/hosted-support",
                        label: "صفحه پشتیبانی",
                        icon: "external-link",
                        description: "لینک اختصاصی و ساعت کاری",
                    },
                    {
                        href: "/team",
                        label: "تیم پشتیبانی",
                        icon: "team",
                        description: "کاربران و دسترسی‌ها",
                    },
                    {
                        href: "/departments",
                        label: "دپارتمان‌ها",
                        icon: "departments",
                        description: "صف و توزیع خودکار",
                    },
                    {
                        href: "/automations",
                        label: "مرکز اتوماسیون",
                        icon: "automation",
                        description: "قوانین، SLA و هشدارها",
                    },
                ],
            },
            {
                title: "حساب کاربری",
                links: accountLinks,
            },
        ];
    }, [user]);

    async function handleLogout() {
        if (user?.is_impersonating) {
            try {
                await apiRequest("/auth/impersonation-stop.php", { method: "POST" });
            } catch {
                // نشست موقت در سمت کاربر نیز پاک می‌شود تا تب قفل نماند.
            }
            clearImpersonationAuth();
            window.location.href = "/impersonate?ended=1";
            return;
        }

        try {
            await logoutCurrentDevice();
        } catch {
            logout();
        }
        router.push("/login");
    }

    function toggleSidebar() {
        setSidebarCollapsed((current) => {
            const next = !current;
            window.localStorage.setItem("panel_sidebar_collapsed", next ? "1" : "0");
            return next;
        });
    }

    function isActiveLink(href: string) {
        if (pathname === href) {
            return true;
        }

        if (href === "/dashboard") {
            return false;
        }

        if (href === "/super-admin/dashboard") {
            return false;
        }

        return pathname.startsWith(`${href}/`);
    }

    if (!user) {
        return (
            <main className="shell-loader">
                <div className="shell-loader-card">
                    <div className="shell-loader-logo">AI</div>
                    <strong>در حال آماده‌سازی پنل...</strong>
                    <p>لطفا چند لحظه صبر کنید.</p>
                </div>
            </main>
        );
    }

    const shellRoleClass = user.role === "super_admin" ? "app-shell--super" : "app-shell--customer";

    return (
        <div className={`app-shell app-shell-pro ${shellRoleClass} ${sidebarCollapsed ? "is-sidebar-collapsed" : ""} ${user.is_impersonating ? "has-impersonation" : ""} ${variant === "workspace" ? "app-shell-workspace" : ""}`}>
            {user.is_impersonating && (
                <ImpersonationBanner
                    impersonatorName={user.impersonator_name}
                    expiresAt={user.impersonation_expires_at}
                />
            )}

            <div className="shell-mobile-bar">
                <div className="shell-mobile-brand">
                    <span className="shell-mobile-logo">AI</span>
                    <div>
                        <strong>AI Chat SaaS</strong>
                        <small>{roleLabels[user.role]}</small>
                    </div>
                </div>
                <button
                    type="button"
                    className="shell-mobile-menu-button"
                    aria-label="باز کردن منوی اصلی"
                    aria-expanded={mobileNavOpen}
                    aria-controls="app-primary-navigation"
                    onClick={() => setMobileNavOpen(true)}
                >
                    <span /><span /><span />
                </button>
            </div>

            <button
                type="button"
                className={`shell-sidebar-backdrop ${mobileNavOpen ? "is-visible" : ""}`}
                aria-label="بستن منوی اصلی"
                tabIndex={mobileNavOpen ? 0 : -1}
                onClick={() => setMobileNavOpen(false)}
            />

            <aside
                id="app-primary-navigation"
                className={`sidebar sidebar-pro ${mobileNavOpen ? "is-open" : ""}`}
            >
                <div className="sidebar-brand sidebar-brand-pro">
                    <div className="sidebar-logo"><span>AI</span><i /></div>

                    <div className="sidebar-brand-copy">
                        <div className="sidebar-title">AI Chat SaaS</div>
                        <div className="sidebar-subtitle">
                            {user.role === "super_admin"
                                ? "فرماندهی و پایش پلتفرم"
                                : "فضای کار پشتیبانی هوشمند"}
                        </div>
                    </div>

                    <button
                        type="button"
                        className="sidebar-mobile-close"
                        aria-label="بستن منو"
                        onClick={() => setMobileNavOpen(false)}
                    >
                        ×
                    </button>

                    <button
                        type="button"
                        className="sidebar-desktop-collapse"
                        aria-label={sidebarCollapsed ? "باز کردن نوار کناری" : "جمع کردن نوار کناری"}
                        aria-pressed={sidebarCollapsed}
                        title={sidebarCollapsed ? "باز کردن منو" : "جمع کردن منو"}
                        onClick={toggleSidebar}
                    >
                        <ShellIcon name="panel-left" />
                    </button>
                </div>

                <div className="sidebar-role-card">
                    <span className="role-dot" />
                    <div>
                        <strong>{user.role === "super_admin" && user.admin_role_name ? user.admin_role_name : roleLabels[user.role]}</strong>
                        <p>
                            {user.role === "super_admin"
                                ? "مدیریت کل سیستم"
                                : "مدیریت پشتیبانی"}
                        </p>
                    </div>
                </div>

                <nav className="sidebar-nav sidebar-nav-pro">
                    {navGroups.map((group) => (
                        <div className="sidebar-section" key={group.title}>
                            <div className="sidebar-section-title">
                                {group.title}
                            </div>

                            <div className="sidebar-section-links">
                                {group.links.map((link) => {
                                    const active = isActiveLink(link.href);

                                    return (
                                        <Link
                                            key={link.href}
                                            href={link.href}
                                            className={`sidebar-link ${
                                                active ? "active" : ""
                                            }`}
                                            aria-current={
                                                active ? "page" : undefined
                                            }
                                            onClick={() => setMobileNavOpen(false)}
                                            title={sidebarCollapsed ? link.label : undefined}
                                        >
                                            <span className="sidebar-link-icon">
                                                <ShellIcon name={link.icon} />
                                            </span>

                                            <span className="sidebar-link-content">
                                                <strong>{link.label}</strong>
                                                {link.description && (
                                                    <small>
                                                        {link.description}
                                                    </small>
                                                )}
                                            </span>

                                            {link.href === "/super-admin/contact-requests" && newRequestCount > 0 && (
                                                <span className="sidebar-link-badge">
                                                    {newRequestCount > 99 ? "99+" : newRequestCount}
                                                </span>
                                            )}

                                            <span className="sidebar-link-arrow">
                                                ‹
                                            </span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className="sidebar-footer sidebar-footer-pro">
                    <div className="user-card user-card-pro">
                        <div className="user-avatar">
                            {user.name?.slice(0, 1) || "U"}
                        </div>

                        <div className="user-card-content">
                            <strong>{user.name}</strong>
                            <span>{user.email}</span>
                            <b>{roleLabels[user.role]}</b>
                        </div>
                    </div>

                    <button
                        className="btn secondary shell-logout-btn"
                        onClick={handleLogout}
                        aria-label="خروج از حساب"
                    >
                        <ShellIcon name="logout" />
                        <span>خروج از حساب</span>
                    </button>
                </div>
            </aside>

            <main className={`main-area main-area-pro ${variant === "workspace" ? "main-area-workspace" : ""}`}>
                {variant !== "workspace" && (
                    <>
                        <div className="shell-utility-bar">
                            <div className="shell-breadcrumbs">
                                <button
                                    type="button"
                                    className="shell-sidebar-toggle"
                                    onClick={toggleSidebar}
                                    aria-label={sidebarCollapsed ? "باز کردن نوار کناری" : "جمع کردن نوار کناری"}
                                    aria-pressed={sidebarCollapsed}
                                >
                                    <ShellIcon name="panel-left" />
                                </button>
                                <span>{user.role === "super_admin" ? "مدیریت پلتفرم" : "فضای کاری"}</span>
                                <b>/</b>
                                <strong>{title}</strong>
                            </div>

                            <div className="shell-utility-actions">
                                <Link
                                    className="shell-quick-access"
                                    href={user.role === "super_admin" ? "/super-admin/search" : "/conversations"}
                                >
                                    <ShellIcon name={user.role === "super_admin" ? "search" : "conversations"} />
                                    <span>{user.role === "super_admin" ? "جست‌وجوی سراسری" : "رفتن به گفتگوها"}</span>
                                </Link>

                                {user.role === "super_admin" && newRequestCount > 0 && (
                                    <Link className="shell-notification" href="/super-admin/contact-requests" aria-label={`${newRequestCount} درخواست جدید`}>
                                        <ShellIcon name="announcements" />
                                        <b>{newRequestCount > 99 ? "99+" : newRequestCount}</b>
                                    </Link>
                                )}

                                <div className="shell-user-compact">
                                    <span>{user.name?.slice(0, 1) || "U"}</span>
                                    <div><strong>{user.name}</strong><small>{roleLabels[user.role]}</small></div>
                                </div>
                            </div>
                        </div>

                        <header className="page-header page-header-pro">
                            <div className="page-header-copy">
                                {kicker && (
                                    <div className="page-kicker">{kicker}</div>
                                )}
                                <h1 className="page-title">{title}</h1>
                                {description && (
                                    <p className="muted page-description">
                                        {description}
                                    </p>
                                )}
                            </div>

                            <div className="page-header-tools">
                                <div className="shell-context-chip">
                                    <span />
                                    {user.role === "super_admin" && user.admin_role_name
                                        ? user.admin_role_name
                                        : roleLabels[user.role]}
                                </div>
                                {actions && (
                                    <div className="page-actions">{actions}</div>
                                )}
                            </div>
                        </header>
                    </>
                )}

                <div className={`page-content-pro ${variant === "workspace" ? "page-content-workspace" : ""}`}>{children}</div>
            </main>

            {user.role !== "super_admin" && maintenance && (
                <MaintenanceOverlay
                    message={maintenance.message}
                    until={maintenance.until}
                    onLogout={handleLogout}
                />
            )}
        </div>
    );
}

const shellIconPaths: Record<string, string[]> = {
    dashboard: ["M4 4h6v6H4z", "M14 4h6v9h-6z", "M4 14h6v6H4z", "M14 17h6v3h-6z"],
    requests: ["M4 6h16v12H4z", "m4 8 4 4 4-4"],
    search: ["M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14", "m16 16 4 4"],
    customers: ["M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M3 21v-2a6 6 0 0 1 12 0v2", "M17 4a4 4 0 0 1 0 7", "M17 15a5 5 0 0 1 4 4v2"],
    "add-user": ["M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M3 21v-2a6 6 0 0 1 12 0v2", "M19 8v6", "M16 11h6"],
    sites: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18", "M3 12h18", "M12 3c3 3 3 15 0 18", "M12 3c-3 3-3 15 0 18"],
    plans: ["m12 3 9 5-9 5-9-5z", "m3 12 9 5 9-5", "m3 16 9 5 9-5"],
    billing: ["M4 5h16v14H4z", "M4 9h16", "M8 15h3"],
    ai: ["m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8z", "M5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8z", "M19 14l.7 1.8 1.8.7-1.8.7L19 19l-.7-1.8-1.8-.7 1.8-.7z"],
    activity: ["M3 12h4l2-7 4 14 2-7h6"],
    tests: ["M9 3h6", "M10 3v5l-5 10a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3L14 8V3", "M8 15h8"],
    findings: ["m12 3 10 18H2z", "M12 9v5", "M12 18h.01"],
    "shield-check": ["M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z", "m9 12 2 2 4-5"],
    admins: ["M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M3 21v-2a6 6 0 0 1 9-5.2", "M18 14v6", "M15 17h6"],
    security: ["M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z", "M9 12h6", "M12 9v6"],
    audit: ["M6 3h12v18H6z", "M9 8h6", "M9 12h6", "M9 16h4"],
    announcements: ["M5 14V9a7 7 0 0 1 14 0v5l2 3H3z", "M9 20h6"],
    conversations: ["M4 5h16v12H9l-5 4z", "M8 9h8", "M8 13h5"],
    visitors: ["M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M3 21v-2a7 7 0 0 1 14 0v2", "M19 8v6", "M16 11h6"],
    reports: ["M4 20V10", "M10 20V4", "M16 20v-7", "M3 20h18"],
    knowledge: ["M4 5a4 4 0 0 1 4-2h4v17H8a4 4 0 0 0-4 2z", "M20 5a4 4 0 0 0-4-2h-4v17h4a4 4 0 0 1 4 2z"],
    "quick-replies": ["M5 4h14v16H5z", "M8 8h8", "M8 12h8", "M8 16h5"],
    widget: ["M4 5h16v14H4z", "M8 9h8", "M8 13h5", "M17 16h.01"],
    "external-link": ["M14 4h6v6", "m20 4-9 9", "M18 14v6H4V6h6"],
    team: ["M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M2 21v-2a6 6 0 0 1 12 0v2", "M16 4a4 4 0 0 1 0 7", "M16 15a6 6 0 0 1 6 6"],
    departments: ["M12 4v6", "M6 10h12", "M6 10v4", "M18 10v4", "M6 18h.01", "M12 14v4", "M12 18h.01", "M18 18h.01"],
    automation: ["M12 3v4", "M12 17v4", "M3 12h4", "M17 12h4", "m5.6 5.6 2.8 2.8", "m15.6 15.6 2.8 2.8", "m18.4 5.6-2.8 2.8", "m8.4 15.6-2.8 2.8", "M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0"],
    logout: ["M10 5H5v14h5", "M14 8l4 4-4 4", "M18 12H9"],
    "panel-left": ["M4 4h16v16H4z", "M9 4v16", "m13 9 3 3-3 3"],
};

function ShellIcon({ name }: { name: string }) {
    const paths = shellIconPaths[name] || shellIconPaths.dashboard;
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {paths.map((path, index) => <path d={path} key={`${name}-${index}`} />)}
        </svg>
    );
}
