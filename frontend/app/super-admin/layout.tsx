import "../../styles/super-admin/shared.css";
import "../../styles/super-admin/dashboard.css";
import "../../styles/super-admin/customers.css";
import "../../styles/super-admin/customer-detail.css";
import "../../styles/super-admin/customer-create.css";
import "../../styles/super-admin/sites.css";
import "../../styles/super-admin/plans.css";
import "../../styles/super-admin/subscriptions.css";
import "../../styles/super-admin/ai-monitoring.css";
import "../../styles/super-admin/audit-logs.css";
import "../../styles/super-admin/requests.css";
import "../../styles/super-admin/announcements.css";
import "../../styles/super-admin/system-health.css";

export default function SuperAdminLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return <div className="super-admin-route">{children}</div>;
}
