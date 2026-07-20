"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type SubscriptionStatus =
    | "trial"
    | "active"
    | "past_due"
    | "expired"
    | "cancelled"
    | "suspended";

type BillingCycle = "monthly" | "quarterly" | "yearly" | "manual";
type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "cancelled";

type Subscription = {
    id: number;
    tenant_id: number;
    tenant_name: string;
    owner_email: string;
    tenant_status: string;
    plan_id: number;
    plan_name: string;
    plan_description: string | null;
    status: SubscriptionStatus;
    billing_cycle: BillingCycle;
    starts_at: string;
    ends_at: string;
    trial_ends_at: string | null;
    auto_renew: boolean;
    price: number;
    currency: string;
    days_remaining: number;
    created_at: string;
    updated_at: string | null;
};

type Payment = {
    id: number;
    amount: string | number;
    currency: string;
    status: PaymentStatus;
    payment_method: string;
    reference_number: string | null;
    paid_at: string | null;
    description: string | null;
    created_at: string;
    created_by_name: string | null;
};

type HistoryItem = {
    id: number;
    plan_name: string;
    status: SubscriptionStatus;
    billing_cycle: BillingCycle;
    starts_at: string;
    ends_at: string;
    price: string | number;
    currency: string;
};

type PageData = {
    subscription: Subscription;
    payments: Payment[];
    history: HistoryItem[];
};

const statusLabels: Record<SubscriptionStatus, string> = {
    trial: "آزمایشی",
    active: "فعال",
    past_due: "سررسید گذشته",
    expired: "منقضی",
    cancelled: "لغوشده",
    suspended: "تعلیق‌شده",
};

const statusHelp: Record<SubscriptionStatus, string> = {
    trial: "مشتری در دوره آزمایشی قرار دارد.",
    active: "مشتری می‌تواند از همه قابلیت‌های مجاز پلن استفاده کند.",
    past_due: "پرداخت سررسید شده و نیازمند پیگیری است.",
    expired: "اعتبار قرارداد پایان یافته و عملیات جدید محدود است.",
    cancelled: "قرارداد لغو شده و برای فعال‌سازی مجدد باید وضعیت تغییر کند.",
    suspended: "اشتراک موقتاً تعلیق شده است.",
};

const cycleLabels: Record<BillingCycle, string> = {
    monthly: "ماهانه",
    quarterly: "سه‌ماهه",
    yearly: "سالانه",
    manual: "دستی",
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
    pending: "در انتظار",
    paid: "پرداخت‌شده",
    failed: "ناموفق",
    refunded: "بازپرداخت‌شده",
    cancelled: "لغوشده",
};

const methodLabels: Record<string, string> = {
    manual: "ثبت دستی",
    bank_transfer: "واریز بانکی",
    cash: "نقدی",
    card: "کارت‌خوان",
    online: "درگاه آنلاین",
};

function toLocalDateTime(value: string | Date) {
    const date = value instanceof Date ? value : new Date(value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return "";
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export default function SubscriptionDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const subscriptionId = Number(params.id);

    const [data, setData] = useState<PageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyAction, setBusyAction] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [pendingStatus, setPendingStatus] = useState<SubscriptionStatus | null>(null);

    const [renewEnd, setRenewEnd] = useState("");
    const [renewPrice, setRenewPrice] = useState("");

    const [paymentAmount, setPaymentAmount] = useState("");
    const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
    const [paymentMethod, setPaymentMethod] = useState("manual");
    const [paymentReference, setPaymentReference] = useState("");
    const [paymentDescription, setPaymentDescription] = useState("");
    const [paidAt, setPaidAt] = useState(toLocalDateTime(new Date()));

    async function load(silent = false) {
        if (!silent) setLoading(true);
        setError("");
        try {
            const response = await apiRequest(`/super-admin/subscription-show.php?id=${subscriptionId}`);
            setData(response);
            const subscription = response.subscription as Subscription;
            setRenewPrice(String(subscription.price));
            const base = new Date(subscription.ends_at.replace(" ", "T"));
            const next = new Date(Math.max(base.getTime(), Date.now()));
            next.setMonth(next.getMonth() + 1);
            setRenewEnd(toLocalDateTime(next));
            if (!paymentAmount) setPaymentAmount(String(subscription.price));
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت جزئیات اشتراک");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const user = getAuthUser();
        if (!user || user.role !== "super_admin") {
            router.push("/dashboard");
            return;
        }
        if (!Number.isInteger(subscriptionId) || subscriptionId < 1) {
            setError("شناسه اشتراک معتبر نیست.");
            setLoading(false);
            return;
        }
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router, subscriptionId]);

    const paidTotal = useMemo(
        () =>
            (data?.payments || [])
                .filter((payment) => payment.status === "paid")
                .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
        [data]
    );

    async function post(path: string, body: Record<string, unknown>, actionName: string, successMessage: string) {
        setBusyAction(actionName);
        setError("");
        setSuccess("");
        try {
            await apiRequest(path, { method: "POST", body: JSON.stringify(body) });
            setSuccess(successMessage);
            await load(true);
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : "عملیات انجام نشد.");
            return false;
        } finally {
            setBusyAction("");
        }
    }

    async function confirmStatusChange() {
        if (!pendingStatus || !data) return;
        const done = await post(
            "/super-admin/subscription-status-update.php",
            { subscription_id: data.subscription.id, status: pendingStatus },
            "status",
            `وضعیت اشتراک به «${statusLabels[pendingStatus]}» تغییر کرد.`
        );
        if (done) setPendingStatus(null);
    }

    async function handleRenew(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!data) return;
        if (!renewEnd) return setError("تاریخ پایان جدید را وارد کنید.");
        const currentEnd = new Date(data.subscription.ends_at.replace(" ", "T")).getTime();
        const renewalBase = Math.max(currentEnd, Date.now());
        if (new Date(renewEnd).getTime() <= renewalBase) {
            return setError("تاریخ پایان جدید باید بعد از پایان فعلی اشتراک یا زمان حاضر باشد.");
        }
        if (renewPrice && Number(renewPrice) < 0) return setError("مبلغ تمدید نمی‌تواند منفی باشد.");

        await post(
            "/super-admin/subscription-renew.php",
            {
                subscription_id: data.subscription.id,
                ends_at: renewEnd,
                price: renewPrice === "" ? undefined : Number(renewPrice),
            },
            "renew",
            "اشتراک با موفقیت تمدید شد."
        );
    }

    async function handlePayment(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!data) return;
        if (paymentAmount === "" || Number(paymentAmount) < 0) {
            return setError("مبلغ پرداخت را به‌درستی وارد کنید.");
        }

        const done = await post(
            "/super-admin/subscription-payment-create.php",
            {
                subscription_id: data.subscription.id,
                amount: Number(paymentAmount),
                currency: data.subscription.currency,
                status: paymentStatus,
                payment_method: paymentMethod,
                reference_number: paymentReference.trim(),
                description: paymentDescription.trim(),
                paid_at: paymentStatus === "paid" ? paidAt || undefined : undefined,
            },
            "payment",
            "پرداخت با موفقیت در سوابق ثبت شد."
        );

        if (done) {
            setPaymentReference("");
            setPaymentDescription("");
            setPaidAt(toLocalDateTime(new Date()));
        }
    }

    if (loading) {
        return (
            <AppShell title="جزئیات اشتراک" kicker="Subscription detail">
                <div className="subscription-detail-loading">
                    {Array.from({ length: 4 }).map((_, index) => <span key={index} />)}
                </div>
            </AppShell>
        );
    }

    if (!data) {
        return (
            <AppShell title="جزئیات اشتراک" kicker="Subscription detail">
                <div className="subscription-empty-state">
                    <h3>اطلاعات اشتراک در دسترس نیست</h3>
                    <p>{error || "اشتراک موردنظر پیدا نشد."}</p>
                    <Link className="btn secondary" href="/super-admin/subscriptions">بازگشت به اشتراک‌ها</Link>
                </div>
            </AppShell>
        );
    }

    const subscription = data.subscription;

    return (
        <AppShell
            title={`اشتراک ${subscription.tenant_name}`}
            kicker="Subscription detail"
            description="مدیریت وضعیت، تمدید قرارداد و سوابق پرداخت مشتری"
            actions={
                <Link className="btn secondary" href="/super-admin/subscriptions">
                    بازگشت به فهرست
                </Link>
            }
        >
            <div className="sa-subscriptions detail">
                {error && <div className="error">{error}</div>}
                {success && <div className="success">{success}</div>}

                <section className={`subscription-detail-hero is-${subscription.status}`}>
                    <div className="subscription-detail-identity">
                        <span className="subscription-detail-avatar">
                            {subscription.tenant_name.trim().slice(0, 1) || "م"}
                        </span>
                        <div>
                            <div className="subscription-detail-title-row">
                                <h2>{subscription.tenant_name}</h2>
                                <span className={`subscription-badge is-${subscription.status}`}>
                                    {statusLabels[subscription.status]}
                                </span>
                            </div>
                            <p>{subscription.owner_email}</p>
                            <small>{statusHelp[subscription.status]}</small>
                        </div>
                    </div>
                    <div className="subscription-detail-plan">
                        <span>پلن جاری</span>
                        <strong>{subscription.plan_name}</strong>
                        <small>{cycleLabels[subscription.billing_cycle]} · {formatMoney(subscription.price, subscription.currency)}</small>
                    </div>
                </section>

                <section className="subscription-detail-metrics">
                    <MetricCard label="روزهای باقی‌مانده" value={remainingText(subscription)} hint={`تا ${formatDate(subscription.ends_at)}`} tone={subscription.days_remaining <= 7 ? "danger" : subscription.days_remaining <= 30 ? "warning" : "default"} />
                    <MetricCard label="مجموع پرداخت موفق" value={formatMoney(paidTotal, subscription.currency)} hint={`${data.payments.filter((p) => p.status === "paid").length.toLocaleString("fa-IR")} پرداخت`} />
                    <MetricCard label="تعداد قراردادها" value={data.history.length.toLocaleString("fa-IR")} hint="برای این مشتری" />
                    <MetricCard label="تمدید خودکار" value={subscription.auto_renew ? "فعال" : "غیرفعال"} hint="تنظیم ثبت‌شده در قرارداد" tone={subscription.auto_renew ? "success" : "default"} />
                </section>

                <section className="subscription-detail-grid">
                    <article className="subscription-panel subscription-info-panel">
                        <PanelHeader eyebrow="Contract" title="اطلاعات قرارداد" description="مشخصات اصلی اشتراک فعلی" />
                        <dl className="subscription-definition-list">
                            <div><dt>شناسه اشتراک</dt><dd>#{subscription.id.toLocaleString("fa-IR")}</dd></div>
                            <div><dt>شناسه مشتری</dt><dd>#{subscription.tenant_id.toLocaleString("fa-IR")}</dd></div>
                            <div><dt>وضعیت حساب مشتری</dt><dd>{tenantStatusLabel(subscription.tenant_status)}</dd></div>
                            <div><dt>تاریخ شروع</dt><dd>{formatDateTime(subscription.starts_at)}</dd></div>
                            <div><dt>تاریخ پایان</dt><dd>{formatDateTime(subscription.ends_at)}</dd></div>
                            {subscription.trial_ends_at && <div><dt>پایان آزمایشی</dt><dd>{formatDateTime(subscription.trial_ends_at)}</dd></div>}
                            <div><dt>دوره پرداخت</dt><dd>{cycleLabels[subscription.billing_cycle]}</dd></div>
                            <div><dt>مبلغ قرارداد</dt><dd>{formatMoney(subscription.price, subscription.currency)}</dd></div>
                        </dl>

                        <div className="subscription-status-manager">
                            <div>
                                <strong>تغییر وضعیت اشتراک</strong>
                                <p>عملیات حساس در گزارش فعالیت‌های مدیریتی ثبت می‌شود.</p>
                            </div>
                            <div className="subscription-actions">
                                {(["active", "trial", "past_due", "suspended", "cancelled"] as SubscriptionStatus[]).map((status) => (
                                    <button
                                        className={`subscription-status-button is-${status} ${subscription.status === status ? "is-current" : ""}`}
                                        type="button"
                                        key={status}
                                        disabled={Boolean(busyAction) || subscription.status === status}
                                        onClick={() => setPendingStatus(status)}
                                    >
                                        {statusLabels[status]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </article>

                    <div className="subscription-operation-stack">
                        <form className="subscription-panel subscription-operation-card" onSubmit={handleRenew}>
                            <PanelHeader eyebrow="Renewal" title="تمدید اشتراک" description="پایان اعتبار و مبلغ قرارداد را بروزرسانی کن." />
                            <label className="subscription-field">
                                <span>تاریخ پایان جدید</span>
                                <input
                                    type="datetime-local"
                                    min={toLocalDateTime(subscription.ends_at)}
                                    value={renewEnd}
                                    onChange={(event) => setRenewEnd(event.target.value)}
                                    required
                                />
                            </label>
                            <label className="subscription-field">
                                <span>مبلغ جدید</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={renewPrice}
                                    onChange={(event) => setRenewPrice(event.target.value)}
                                />
                                <small>خالی‌گذاشتن این فیلد، مبلغ فعلی را حفظ می‌کند.</small>
                            </label>
                            <button className="btn primary subscription-submit-button" type="submit" disabled={Boolean(busyAction)}>
                                {busyAction === "renew" ? "در حال تمدید..." : "ثبت تمدید"}
                            </button>
                        </form>

                        <form className="subscription-panel subscription-operation-card" onSubmit={handlePayment}>
                            <PanelHeader eyebrow="Payment" title="ثبت پرداخت دستی" description="واریز بانکی یا پرداخت آفلاین مشتری را ثبت کن." />
                            <div className="subscription-form-grid two-columns compact">
                                <label className="subscription-field">
                                    <span>مبلغ</span>
                                    <input type="number" min="0" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} required />
                                </label>
                                <label className="subscription-field">
                                    <span>وضعیت</span>
                                    <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)}>
                                        {Object.entries(paymentStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                                    </select>
                                </label>
                            </div>
                            <div className="subscription-form-grid two-columns compact">
                                <label className="subscription-field">
                                    <span>روش پرداخت</span>
                                    <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                                        {Object.entries(methodLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                                    </select>
                                </label>
                                <label className="subscription-field">
                                    <span>شماره پیگیری</span>
                                    <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="اختیاری" />
                                </label>
                            </div>
                            {paymentStatus === "paid" && (
                                <label className="subscription-field">
                                    <span>زمان پرداخت</span>
                                    <input type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
                                </label>
                            )}
                            <label className="subscription-field">
                                <span>توضیحات</span>
                                <textarea value={paymentDescription} onChange={(event) => setPaymentDescription(event.target.value)} placeholder="توضیح تکمیلی درباره پرداخت" rows={3} />
                            </label>
                            <button className="btn primary subscription-submit-button" type="submit" disabled={Boolean(busyAction)}>
                                {busyAction === "payment" ? "در حال ثبت..." : "ثبت پرداخت"}
                            </button>
                        </form>
                    </div>
                </section>

                <section className="subscription-panel subscription-records-panel">
                    <PanelHeader eyebrow="Payments" title="سوابق پرداخت" description="آخرین تراکنش‌ها و پرداخت‌های ثبت‌شده برای این قرارداد" />
                    {data.payments.length === 0 ? (
                        <div className="subscription-inline-empty">هنوز پرداختی برای این اشتراک ثبت نشده است.</div>
                    ) : (
                        <div className="subscription-table-wrap">
                            <table className="subscription-table subscription-payments-table">
                                <thead><tr><th>تاریخ</th><th>مبلغ</th><th>وضعیت</th><th>روش</th><th>شماره پیگیری</th><th>ثبت‌کننده</th><th>توضیحات</th></tr></thead>
                                <tbody>
                                {data.payments.map((payment) => (
                                    <tr key={payment.id}>
                                        <td>{formatDateTime(payment.paid_at || payment.created_at)}</td>
                                        <td><strong>{formatMoney(Number(payment.amount), payment.currency)}</strong></td>
                                        <td><span className={`subscription-payment-badge is-${payment.status}`}>{paymentStatusLabels[payment.status] || payment.status}</span></td>
                                        <td>{methodLabels[payment.payment_method] || payment.payment_method}</td>
                                        <td>{payment.reference_number || "—"}</td>
                                        <td>{payment.created_by_name || "سیستم"}</td>
                                        <td>{payment.description || "—"}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <section className="subscription-panel subscription-history-panel">
                    <PanelHeader eyebrow="History" title="تاریخچه اشتراک و پلن" description="نسخه‌های قبلی و فعلی قرارداد این مشتری" />
                    <div className="subscription-timeline">
                        {data.history.map((item, index) => (
                            <article className="subscription-history" key={item.id}>
                                <span className="subscription-timeline-dot" aria-hidden="true" />
                                <div className="subscription-history-main">
                                    <div>
                                        <strong>{item.plan_name}</strong>
                                        <span className={`subscription-badge is-${item.status}`}>{statusLabels[item.status]}</span>
                                        {index === 0 && <span className="subscription-current-tag">جدیدترین</span>}
                                    </div>
                                    <p>{formatDate(item.starts_at)} تا {formatDate(item.ends_at)}</p>
                                </div>
                                <div className="subscription-history-meta">
                                    <span>{cycleLabels[item.billing_cycle]}</span>
                                    <strong>{formatMoney(Number(item.price), item.currency)}</strong>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            </div>

            {pendingStatus && (
                <div className="subscription-confirm-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setPendingStatus(null)}>
                    <section className="subscription-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-status-title">
                        <span className={`subscription-confirm-icon is-${pendingStatus}`} aria-hidden="true">!</span>
                        <h2 id="confirm-status-title">تغییر وضعیت اشتراک</h2>
                        <p>
                            وضعیت اشتراک «{subscription.tenant_name}» به <strong>{statusLabels[pendingStatus]}</strong> تغییر می‌کند.
                        </p>
                        <div className="subscription-confirm-actions">
                            <button className="btn secondary" type="button" onClick={() => setPendingStatus(null)} disabled={Boolean(busyAction)}>انصراف</button>
                            <button className={pendingStatus === "cancelled" || pendingStatus === "suspended" ? "btn danger" : "btn primary"} type="button" onClick={confirmStatusChange} disabled={Boolean(busyAction)}>
                                {busyAction === "status" ? "در حال ثبت..." : "تأیید تغییر"}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </AppShell>
    );
}

function PanelHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
    return (
        <header className="subscription-panel-header">
            <span>{eyebrow}</span>
            <h2>{title}</h2>
            <p>{description}</p>
        </header>
    );
}

function MetricCard({ label, value, hint, tone = "default" }: { label: string; value: string; hint: string; tone?: "default" | "warning" | "danger" | "success" }) {
    return (
        <article className={`subscription-detail-metric tone-${tone}`}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{hint}</small>
        </article>
    );
}

function formatDate(value: string) {
    const date = new Date(value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function formatDateTime(value: string) {
    const date = new Date(value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatMoney(value: number, currency: string) {
    const labels: Record<string, string> = { IRR: "ریال", IRT: "تومان", USD: "دلار", EUR: "یورو" };
    return `${Number(value || 0).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} ${labels[currency] || currency}`;
}

function tenantStatusLabel(value: string) {
    const labels: Record<string, string> = { active: "فعال", inactive: "غیرفعال", suspended: "تعلیق‌شده" };
    return labels[value] || value;
}

function remainingText(subscription: Subscription) {
    if (subscription.status === "expired") return "منقضی";
    if (subscription.status === "cancelled") return "لغوشده";
    if (subscription.days_remaining <= 0) return "امروز";
    return `${subscription.days_remaining.toLocaleString("fa-IR")} روز`;
}
