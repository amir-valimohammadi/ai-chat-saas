// مسیر فایل: ai-chat-saas/frontend/components/layout/AppShell.tsx
// هدف: Layout حرفه‌ای مشترک برای پنل مشتری، پشتیبان و سوپر ادمین

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { apiRequest, getAuthUser, logout } from "@/lib/api";

type AppShellProps = {
    children: ReactNode;
    title: string;
    description?: string;
    kicker?: string;
    actions?: ReactNode;
};

type UserRole = "super_admin" | "customer_admin" | "agent";

type User = {
    name: string;
    email: string;
    role: UserRole;
};

type NavLink = {
    href: string;
    label: string;
    icon: string;
    description?: string;
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
                                 }: AppShellProps) {
    const router = useRouter();
    const pathname = usePathname();

    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        const authUser = getAuthUser();

        if (!authUser) {
            router.push("/login");
            return;
        }

        setUser(authUser);
    }, [router]);

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
                        },
                        {
                            href: "/super-admin/customers",
                            label: "مشتری‌ها",
                            icon: "👥",
                            description: "حساب‌های مشتریان",
                        },
                        {
                            href: "/super-admin/customers/create",
                            label: "ایجاد مشتری",
                            icon: "+",
                            description: "ساخت حساب جدید",
                        },
                        {
                            href: "/super-admin/sites",
                            label: "سایت‌ها",
                            icon: "◎",
                            description: "سایت‌های ثبت‌شده",
                        },
                        {
                            href: "/super-admin/plans",
                            label: "پلن‌ها",
                            icon: "◆",
                            description: "مدیریت پلن‌ها",
                        },
                        {
                            href: "/super-admin/announcements",
                            label: "اعلان‌ها",
                            icon: "🔔",
                            description: "ارسال پیام به مشتریان",
                        },
                    ],
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
                        href: "/team",
                        label: "تیم پشتیبانی",
                        icon: "☰",
                        description: "کاربران و دسترسی‌ها",
                    },
                ],
            },
            {
                title: "حساب کاربری",
                links: accountLinks,
            },
        ];
    }, [user]);

    function handleLogout() {
        logout();
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
        <div className="app-shell app-shell-pro">
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
                        <strong>{roleLabels[user.role]}</strong>
                        <p>{user.role === "super_admin" ? "مدیریت کل سیستم" : "مدیریت پشتیبانی"}</p>
                    </div>
                </div>

                <nav className="sidebar-nav sidebar-nav-pro">
                    {navGroups.map((group) => (
                        <div className="sidebar-section" key={group.title}>
                            <div className="sidebar-section-title">{group.title}</div>

                            <div className="sidebar-section-links">
                                {group.links.map((link) => {
                                    const active = isActiveLink(link.href);

                                    return (
                                        <Link
                                            key={link.href}
                                            href={link.href}
                                            className={`sidebar-link ${active ? "active" : ""}`}
                                            aria-current={active ? "page" : undefined}
                                        >
                                            <span className="sidebar-link-icon">{link.icon}</span>

                                            <span className="sidebar-link-content">
                                                <strong>{link.label}</strong>
                                                {link.description && <small>{link.description}</small>}
                                            </span>

                                            <span className="sidebar-link-arrow">‹</span>
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

                    <button className="btn secondary shell-logout-btn" onClick={handleLogout}>
                        خروج از حساب
                    </button>
                </div>
            </aside>

            <main className="main-area main-area-pro">
                <header className="page-header page-header-pro">
                    <div>
                        {kicker && <div className="page-kicker">{kicker}</div>}
                        <h1 className="page-title">{title}</h1>
                        {description && <p className="muted page-description">{description}</p>}
                    </div>

                    {actions && <div className="page-actions">{actions}</div>}
                </header>

                <div className="page-content-pro">{children}</div>
            </main>
        </div>
    );
}