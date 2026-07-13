// مسیر فایل: ai-chat-saas/frontend/app/super-admin/dashboard/page.tsx
// هدف: داشبورد حرفه‌ای‌تر برای Super Admin

"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { getAuthUser } from "@/lib/api";

export default function SuperAdminDashboardPage() {
    const router = useRouter();

    useEffect(() => {
        const user = getAuthUser();

        if (!user) {
            router.push("/login");
            return;
        }

        if (user.role !== "super_admin") {
            router.push("/dashboard");
        }
    }, [router]);

    return (
        <AppShell
            title="داشبورد سوپر ادمین"
            kicker="Platform Control"
            description="مدیریت مرکزی پلتفرم، مشتری‌ها، سایت‌ها، پلن‌ها و اعلان‌ها"
            actions={
                <Link className="btn" href="/super-admin/customers/create">
                    ایجاد مشتری جدید
                </Link>
            }
        >
            <section className="platform-hero">
                <div className="platform-hero-copy">
                    <span className="soft-chip primary">AI Chat SaaS Control Center</span>

                    <h2>مرکز فرماندهی پلتفرم برای مدیریت مشتری‌ها، سرویس‌ها و رشد محصول</h2>

                    <p>
                        از این بخش می‌توانی مشتری‌ها، سایت‌ها، پلن‌ها و اعلان‌های پلتفرم را
                        مدیریت کنی. هدف این داشبورد این است که مسیرهای اصلی مدیریت سیستم
                        سریع، تمیز و قابل توسعه باشند.
                    </p>

                    <div className="platform-hero-actions">
                        <Link className="btn" href="/super-admin/customers">
                            مشاهده مشتری‌ها
                        </Link>

                        <Link className="btn secondary" href="/super-admin/announcements">
                            مدیریت اعلان‌ها
                        </Link>
                    </div>
                </div>

                <div className="platform-health-card">
                    <HealthRow label="وضعیت پلتفرم" value="فعال" status="success" />
                    <HealthRow label="ساختار سرویس" value="Multi Tenant" />
                    <HealthRow label="ویجت چت" value="آماده نصب" />
                    <HealthRow label="اعلان‌های سیستمی" value="فعال" />
                    <HealthRow label="AI داخلی" value="Knowledge Based" />
                </div>
            </section>

            <div className="platform-metric-grid">
                <PlatformMetric icon="👥" value="Customers" label="مدیریت مشتری‌ها" />
                <PlatformMetric icon="◎" value="Sites" label="سایت‌های متصل" />
                <PlatformMetric icon="◆" value="Plans" label="پلن‌ها و محدودیت‌ها" />
                <PlatformMetric icon="🔔" value="Announce" label="اعلان‌های مشتریان" />
            </div>

            <div className="platform-action-grid">
                <PlatformActionCard
                    href="/super-admin/customers"
                    icon="👥"
                    title="مشتری‌ها"
                    description="مشاهده کسب‌وکارهای ثبت‌شده، وضعیت حساب‌ها، اطلاعات مالک و مسیر مدیریت هر مشتری."
                    featured
                />

                <PlatformActionCard
                    href="/super-admin/customers/create"
                    icon="+"
                    title="ایجاد مشتری"
                    description="ساخت مشتری جدید، سایت اولیه، حساب مدیر مشتری و دریافت site_key برای نصب ویجت."
                />

                <PlatformActionCard
                    href="/super-admin/sites"
                    icon="◎"
                    title="سایت‌ها"
                    description="بررسی سایت‌های ثبت‌شده، کد نصب ویجت، دامنه‌ها و وضعیت فعال بودن هر سایت."
                />

                <PlatformActionCard
                    href="/super-admin/plans"
                    icon="◆"
                    title="پلن‌ها"
                    description="مشاهده پلن‌های فعلی، محدودیت‌ها و قابلیت‌های فعال هر پلن برای مشتریان."
                />

                <PlatformActionCard
                    href="/super-admin/announcements"
                    icon="🔔"
                    title="اعلان‌ها"
                    description="ارسال اعلان عمومی یا خصوصی برای مشتری‌ها، هشدارها، تخفیف‌ها و پیام‌های مهم پنل."
                />
            </div>

            <div className="platform-section-grid">
                <section className="platform-panel">
                    <div className="platform-panel-head">
                        <div>
                            <span className="soft-chip primary">Roadmap</span>
                            <h2>مسیر پیشنهادی توسعه Super Admin</h2>
                            <p className="muted">
                                بعد از ارتقای ظاهر، این موارد ارزش مدیریتی پنل را بیشتر می‌کنند.
                            </p>
                        </div>
                    </div>

                    <div className="platform-roadmap-list">
                        <RoadmapItem
                            title="جزئیات کامل مشتری"
                            description="صفحه اختصاصی برای مشاهده سایت‌ها، کاربران، پلن، مصرف و آمار هر مشتری."
                        />

                        <RoadmapItem
                            title="فعال / غیرفعال کردن مشتری"
                            description="امکان متوقف کردن سرویس مشتری بدون حذف اطلاعات و با ثبت دلیل مدیریتی."
                        />

                        <RoadmapItem
                            title="تغییر پلن مشتری"
                            description="مدیریت ارتقا یا کاهش پلن مشتری از داخل پنل سوپر ادمین."
                        />

                        <RoadmapItem
                            title="گزارش کل پلتفرم"
                            description="نمای کلی از مشتری‌ها، گفتگوها، سایت‌ها، پلن‌ها و رشد سرویس."
                        />
                    </div>
                </section>

                <aside className="platform-side-panel">
                    <h2>دسترسی سریع</h2>
                    <p className="muted">مسیرهای پرتکرار مدیریت پلتفرم.</p>

                    <div className="platform-mini-list">
                        <MiniLink
                            href="/super-admin/customers/create"
                            label="ساخت مشتری جدید"
                            value="Start"
                        />

                        <MiniLink
                            href="/super-admin/customers"
                            label="بررسی مشتری‌ها"
                            value="CRM"
                        />

                        <MiniLink
                            href="/super-admin/sites"
                            label="دریافت کد نصب ویجت"
                            value="Widget"
                        />

                        <MiniLink
                            href="/super-admin/plans"
                            label="مشاهده پلن‌ها"
                            value="Plans"
                        />

                        <MiniLink
                            href="/super-admin/announcements"
                            label="ارسال اعلان"
                            value="Notify"
                        />
                    </div>

                    <div className="platform-note-card">
                        <strong>پیشنهاد مدیریتی</strong>
                        <p>
                            بعد از این مرحله، بهتر است داشبورد سوپر ادمین را به آمار واقعی
                            مشتری‌ها، سایت‌ها، گفتگوها و وضعیت پلن‌ها وصل کنیم.
                        </p>
                    </div>
                </aside>
            </div>
        </AppShell>
    );
}

function HealthRow({
                       label,
                       value,
                       status,
                   }: {
    label: string;
    value: string;
    status?: "success";
}) {
    return (
        <div className="platform-health-row">
            <span>{label}</span>
            <strong className={status === "success" ? "is-success" : ""}>{value}</strong>
        </div>
    );
}

function PlatformMetric({
                            icon,
                            value,
                            label,
                        }: {
    icon: string;
    value: string;
    label: string;
}) {
    return (
        <section className="platform-metric-card">
            <div>{icon}</div>
            <strong>{value}</strong>
            <span>{label}</span>
        </section>
    );
}

function PlatformActionCard({
                                href,
                                icon,
                                title,
                                description,
                                featured = false,
                            }: {
    href: string;
    icon: string;
    title: string;
    description: string;
    featured?: boolean;
}) {
    return (
        <Link
            className={`platform-action-card ${featured ? "featured" : ""}`}
            href={href}
        >
            <div className="platform-action-icon">{icon}</div>
            <h3>{title}</h3>
            <p>{description}</p>
        </Link>
    );
}

function RoadmapItem({
                         title,
                         description,
                     }: {
    title: string;
    description: string;
}) {
    return (
        <div className="platform-roadmap-item">
            <span />

            <div>
                <strong>{title}</strong>
                <p>{description}</p>
            </div>
        </div>
    );
}

function MiniLink({
                      href,
                      label,
                      value,
                  }: {
    href: string;
    label: string;
    value: string;
}) {
    return (
        <Link className="platform-mini-link" href={href}>
            <span>{label}</span>
            <b>{value}</b>
        </Link>
    );
}