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
import "../styles/departments.css";
import "../styles/visitors.css";
import "../styles/reports.css";
import "../styles/subscription.css";
import "../styles/sites.css";
import "../styles/landing.css";
import "../styles/auth.css";
import "../styles/hosted-support.css";
import "../styles/hosted-support-settings.css";
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
