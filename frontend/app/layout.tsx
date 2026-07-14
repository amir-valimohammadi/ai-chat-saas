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
export const metadata = {
    title: "AI Chat SaaS Panel",
    description: "Admin and support panel for AI Chat SaaS",
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