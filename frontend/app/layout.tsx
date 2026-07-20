// مسیر فایل: ai-chat-saas/frontend/app/layout.tsx

import "./globals.css";

import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/components.css";
import "../styles/shell.css";
import "../styles/conversation.css";
import "../styles/ai-center.css";
import "../styles/dashboard.css";
import "../styles/conversations-list.css";
import "../styles/widget-settings.css";
import "../styles/team.css";
import "../styles/reports.css";
import "../styles/super-admin-dashboard.css";
import "../styles/super-admin-customers.css";
import "../styles/super-admin-customer-detail.css";
import "../styles/super-admin-sites.css";
import "../styles/super-admin-plans.css";
import "../styles/super-admin-subscriptions.css";
import "../styles/super-admin-ai-monitoring.css";
import "../styles/super-admin-audit-logs.css";
import "../styles/super-admin-requests.css";
import "../styles/subscription.css";
import "../styles/sites.css";
import "../styles/landing.css";
import "../styles/auth.css";
export const metadata = {
    title: "AI Chat SaaS | پلتفرم چت و پشتیبانی هوشمند",
    description: "ویجت چت، مدیریت تیم پشتیبانی، خزش دانش سایت و موتور پاسخ هوشمند فارسی",
};

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <html lang="fa" dir="rtl">
        <body>{children}</body>
        </html>
    );
}
