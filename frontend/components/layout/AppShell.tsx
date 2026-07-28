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

    useEffect(() => {
        const authUser = getAuthUser();

        if (!authUser) {
            router.push("/login");
            return;
        }

        setUser(authUser);

        if (authUser.must_change_password && pathname !== "/security") {
            router.replace("/security?required=1");
        }
    }, [pathname, router]);

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
                icon: "🔐",
                description: "رمز عبور و نشست‌ها",
            },
        ];

        if (user.role === "super_admin") {
            return [
                {
                    title: "مدیریت پلتفرم",
                    links: [
                        {
                            href: "/super-admin/dashboard",
                            label: "داشبورد",
                            icon: "⌂",
                            description: "نمای کلی سیستم",
                            permission: "dashboard.view",
                        },
                        {
                            href: "/super-admin/contact-requests",
                            label: "درخواست‌ها",
                            icon: "✉",
                            description: "مشاوره، خرید و راه‌اندازی",
                            permission: "requests.view",
                        },
                        {
                            href: "/super-admin/customers",
                            label: "مشتری‌ها",
                            icon: "👥",
                            description: "حساب‌های مشتریان",
                            permission: "customers.view",
                        },
                        {
                            href: "/super-admin/search",
                            label: "جست‌وجوی سراسری",
                            icon: "⌕",
                            description: "مشتری، سایت، کاربر و گفتگو",
                            permission: "customers.view",
                        },
                        {
                            href: "/super-admin/customers/create",
                            label: "ایجاد مشتری",
                            icon: "+",
                            description: "ساخت حساب جدید",
                            permission: "customers.manage",
                        },
                        {
                            href: "/super-admin/sites",
                            label: "سایت‌ها",
                            icon: "◎",
                            description: "سایت‌های ثبت‌شده",
                            permission: "sites.view",
                        },
                        {
                            href: "/super-admin/plans",
                            label: "پلن‌ها",
                            icon: "◆",
                            description: "مدیریت پلن‌ها",
                            permission: "plans.view",
                        },
                        {
                            href: "/super-admin/subscriptions",
                            label: "اشتراک‌ها",
                            icon: "◷",
                            description: "انقضا، تمدید و پرداخت‌ها",
                            permission: "billing.view",
                        },
                        {
                            href: "/super-admin/ai-monitoring",
                            label: "نظارت AI",
                            icon: "AI",
                            description: "مصرف و کیفیت پاسخ‌ها",
                            permission: "ai.view",
                        },
                        {
                            href: "/super-admin/system-health",
                            label: "سلامت سیستم",
                            icon: "SYS",
                            description: "سرویس‌ها، خطاها و Jobها",
                            permission: "operations.view",
                        },
                        {
                            href: "/super-admin/test-center",
                            label: "مرکز جامع تست",
                            icon: "QA",
                            description: "تست سلامت، امنیت و یکپارچگی",
                            permission: "tests.view",
                        },
                        {
                            href: "/super-admin/test-center/findings",
                            label: "ایرادات تست",
                            icon: "!",
                            description: "دلایل، اثر و راهکار رفع",
                            permission: "tests.view",
                        },
                        {
                            href: "/super-admin/test-center/security",
                            label: "امنیت عمیق",
                            icon: "🔒",
                            description: "Risk، OWASP و جداسازی Tenant",
                            permission: "tests.view_security_evidence",
                        },
                        {
                            href: "/super-admin/admins",
                            label: "مدیران و نقش‌ها",
                            icon: "ADM",
                            description: "حساب‌ها، نقش‌ها و مجوزها",
                            permission: "admins.view",
                        },
                        {
                            href: "/super-admin/security-center",
                            label: "مرکز امنیت",
                            icon: "SEC",
                            description: "نشست‌ها، ورودها و 2FA",
                            permission: "security.view",
                        },
                        {
                            href: "/super-admin/audit-logs",
                            label: "گزارش فعالیت‌ها",
                            icon: "LOG",
                            description: "تغییرات حساس مدیران",
                            permission: "audit.view",
                        },
                        {
                            href: "/super-admin/announcements",
                            label: "اعلان‌ها",
                            icon: "🔔",
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
                icon: "⌂",
                description: "مرکز کنترل حساب",
            },
            {
                href: "/conversations",
                label: "گفتگوها",
                icon: "💬",
                description: "پیام‌های کاربران",
            },
            {
                href: "/visitors",
                label: "بازدیدکنندگان",
                icon: "◉",
                description: "حضور زنده و مسیر صفحات",
            },
            {
                href: "/announcements",
                label: "اعلان‌ها",
                icon: "🔔",
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
                title: "مدیریت مشتری",
                links: [
                    {
                        href: "/sites",
                        label: "سایت‌ها",
                        icon: "◎",
                        description: "دامنه‌ها و کد نصب",
                    },
                    {
                        href: "/reports",
                        label: "گزارش‌ها",
                        icon: "📊",
                        description: "روند و عملکرد",
                    },
                    {
                        href: "/subscription",
                        label: "پلن و مصرف",
                        icon: "◌",
                        description: "محدودیت‌ها و مصرف",
                    },
                    {
                        href: "/knowledge",
                        label: "دانش AI",
                        icon: "AI",
                        description: "منبع پاسخ هوشمند",
                    },
                    {
                        href: "/ai-center",
                        label: "مرکز AI",
                        icon: "✦",
                        description: "خزش، تست و پاسخ خودکار",
                    },
                    {
                        href: "/quick-replies",
                        label: "پاسخ‌های آماده",
                        icon: "✎",
                        description: "متن‌های پرتکرار",
                    },
                    {
                        href: "/widget-settings",
                        label: "تنظیمات ویجت",
                        icon: "◈",
                        description: "ظاهر و رفتار ویجت",
                    },
                    {
                        href: "/hosted-support",
                        label: "صفحه پشتیبانی",
                        icon: "↗",
                        description: "لینک اختصاصی و ساعت کاری",
                    },
                    {
                        href: "/team",
                        label: "تیم پشتیبانی",
                        icon: "☰",
                        description: "کاربران و دسترسی‌ها",
                    },
                    {
                        href: "/departments",
                        label: "دپارتمان‌ها",
                        icon: "⇄",
                        description: "صف و توزیع خودکار",
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

    return (
        <div className={`app-shell app-shell-pro ${user.is_impersonating ? "has-impersonation" : ""} ${variant === "workspace" ? "app-shell-workspace" : ""}`}>
            {user.is_impersonating && (
                <ImpersonationBanner
                    impersonatorName={user.impersonator_name}
                    expiresAt={user.impersonation_expires_at}
                />
            )}
            <aside className="sidebar sidebar-pro">
                <div className="sidebar-brand sidebar-brand-pro">
                    <div className="sidebar-logo">AI</div>

                    <div>
                        <div className="sidebar-title">AI Chat SaaS</div>
                        <div className="sidebar-subtitle">
                            {user.role === "super_admin"
                                ? "Platform Command Center"
                                : "Customer Support Panel"}
                        </div>
                    </div>
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
                                        >
                                            <span className="sidebar-link-icon">
                                                {link.icon}
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
                    >
                        خروج از حساب
                    </button>
                </div>
            </aside>

            <main className={`main-area main-area-pro ${variant === "workspace" ? "main-area-workspace" : ""}`}>
                {variant !== "workspace" && (
                    <header className="page-header page-header-pro">
                        <div>
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

                        {actions && (
                            <div className="page-actions">{actions}</div>
                        )}
                    </header>
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
