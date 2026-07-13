// مسیر فایل: ai-chat-saas/frontend/app/super-admin/plans/page.tsx
// هدف: مدیریت کامل پلن‌ها توسط Super Admin

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type Plan = {
    id: number;
    name: string;
    description: string | null;
    max_sites: number;
    max_agents: number;
    max_monthly_conversations: number;
    ai_suggestions_enabled: boolean;
    ai_auto_reply_enabled: boolean;
    knowledge_base_enabled: boolean;
    price_monthly: number;
    is_active: boolean;
    created_at: string;
};

type PlanForm = {
    id: number | null;
    name: string;
    description: string;
    max_sites: string;
    max_agents: string;
    max_monthly_conversations: string;
    ai_suggestions_enabled: boolean;
    ai_auto_reply_enabled: boolean;
    knowledge_base_enabled: boolean;
    price_monthly: string;
    is_active: boolean;
};

const emptyForm: PlanForm = {
    id: null,
    name: "",
    description: "",
    max_sites: "1",
    max_agents: "1",
    max_monthly_conversations: "30",
    ai_suggestions_enabled: false,
    ai_auto_reply_enabled: false,
    knowledge_base_enabled: false,
    price_monthly: "0",
    is_active: true,
};

export default function SuperAdminPlansPage() {
    const router = useRouter();

    const [plans, setPlans] = useState<Plan[]>([]);
    const [form, setForm] = useState<PlanForm>(emptyForm);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [updatingPlanId, setUpdatingPlanId] = useState<number | null>(null);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    async function loadPlans(silent = false) {
        try {
            setError("");

            if (silent) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            const data = await apiRequest("/super-admin/plans-list.php");
            setPlans(data.plans || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "خطا در دریافت پلن‌ها");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    useEffect(() => {
        const user = getAuthUser();

        if (!user) {
            router.push("/login");
            return;
        }

        if (user.role !== "super_admin") {
            router.push("/dashboard");
            return;
        }

        loadPlans();
    }, [router]);

    const stats = useMemo(() => {
        return {
            total: plans.length,
            active: plans.filter((plan) => plan.is_active).length,
            inactive: plans.filter((plan) => !plan.is_active).length,
            aiReady: plans.filter((plan) => plan.ai_suggestions_enabled).length,
            knowledge: plans.filter((plan) => plan.knowledge_base_enabled).length,
        };
    }, [plans]);

    function updateField(field: keyof PlanForm, value: string | boolean) {
        setForm((prev) => ({
            ...prev,
            [field]: value,
        }));
    }

    function resetForm() {
        setForm(emptyForm);
        setError("");
        setSuccess("");
    }

    function editPlan(plan: Plan) {
        setForm({
            id: plan.id,
            name: plan.name || "",
            description: plan.description || "",
            max_sites: String(plan.max_sites ?? 1),
            max_agents: String(plan.max_agents ?? 1),
            max_monthly_conversations: String(plan.max_monthly_conversations ?? 30),
            ai_suggestions_enabled: Boolean(plan.ai_suggestions_enabled),
            ai_auto_reply_enabled: Boolean(plan.ai_auto_reply_enabled),
            knowledge_base_enabled: Boolean(plan.knowledge_base_enabled),
            price_monthly: String(plan.price_monthly ?? 0),
            is_active: Boolean(plan.is_active),
        });

        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });
    }

    function buildPayload() {
        return {
            id: form.id,
            name: form.name.trim(),
            description: form.description.trim(),
            max_sites: Number(form.max_sites || 0),
            max_agents: Number(form.max_agents || 0),
            max_monthly_conversations: Number(form.max_monthly_conversations || 0),
            ai_suggestions_enabled: form.ai_suggestions_enabled,
            ai_auto_reply_enabled: form.ai_auto_reply_enabled,
            knowledge_base_enabled: form.knowledge_base_enabled,
            price_monthly: Number(form.price_monthly || 0),
            is_active: form.is_active,
        };
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        try {
            setSaving(true);
            setError("");
            setSuccess("");

            const payload = buildPayload();

            if (!payload.name) {
                setError("نام پلن الزامی است.");
                return;
            }

            if (payload.max_sites < 1) {
                setError("حداکثر سایت باید حداقل ۱ باشد.");
                return;
            }

            if (payload.max_agents < 0) {
                setError("حداکثر پشتیبان نمی‌تواند منفی باشد.");
                return;
            }

            if (payload.max_monthly_conversations < 0) {
                setError("گفتگوی ماهانه نمی‌تواند منفی باشد.");
                return;
            }

            if (form.id) {
                await apiRequest("/super-admin/plan-update.php", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });

                setSuccess("پلن با موفقیت ویرایش شد.");
            } else {
                await apiRequest("/super-admin/plan-create.php", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });

                setSuccess("پلن جدید با موفقیت ساخته شد.");
            }

            resetForm();
            await loadPlans(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "ذخیره پلن ناموفق بود");
        } finally {
            setSaving(false);
        }
    }

    async function togglePlanStatus(plan: Plan) {
        try {
            setUpdatingPlanId(plan.id);
            setError("");
            setSuccess("");

            await apiRequest("/super-admin/plan-toggle-status.php", {
                method: "POST",
                body: JSON.stringify({
                    id: plan.id,
                    is_active: !plan.is_active,
                }),
            });

            setSuccess(
                !plan.is_active
                    ? "پلن با موفقیت فعال شد."
                    : "پلن با موفقیت غیرفعال شد."
            );

            await loadPlans(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "تغییر وضعیت پلن ناموفق بود");
        } finally {
            setUpdatingPlanId(null);
        }
    }

    return (
        <AppShell
            title="پلن‌ها"
            kicker="Pricing Plans"
            description="ساخت، ویرایش و مدیریت محدودیت‌های پلن‌های مشتریان"
            actions={
                <button
                    className="btn secondary"
                    onClick={() => loadPlans(true)}
                    disabled={refreshing}
                >
                    {refreshing ? "در حال بروزرسانی..." : "بروزرسانی"}
                </button>
            }
        >
            {error && <div className="error">{error}</div>}
            {success && <div className="success">{success}</div>}

            <div className="metric-compact-grid">
                <MetricCard label="کل پلن‌ها" value={stats.total} />
                <MetricCard label="پلن‌های فعال" value={stats.active} />
                <MetricCard label="غیرفعال" value={stats.inactive} />
                <MetricCard label="دارای AI Suggestion" value={stats.aiReady} />
                <MetricCard label="دارای Knowledge Base" value={stats.knowledge} />
            </div>

            <div
                className="admin-form-layout"
                style={{
                    marginTop: 18,
                }}
            >
                <section className="admin-form-card">
                    <form onSubmit={handleSubmit}>
                        <div className="admin-form-section">
                            <div>
                                <h2 className="admin-form-section-title">
                                    {form.id ? "ویرایش پلن" : "ساخت پلن جدید"}
                                </h2>
                                <p className="admin-form-section-text">
                                    محدودیت‌هایی که اینجا تنظیم می‌کنی روی قابلیت‌های مشتری اعمال می‌شود.
                                </p>
                            </div>

                            <div className="admin-two-col">
                                <label className="grid">
                                    <span>نام پلن</span>
                                    <input
                                        className="input"
                                        value={form.name}
                                        onChange={(event) => updateField("name", event.target.value)}
                                        placeholder="مثلاً Basic"
                                    />
                                </label>

                                <label className="grid">
                                    <span>قیمت ماهانه</span>
                                    <input
                                        className="input"
                                        type="number"
                                        min="0"
                                        value={form.price_monthly}
                                        onChange={(event) =>
                                            updateField("price_monthly", event.target.value)
                                        }
                                        placeholder="مثلاً 490000"
                                    />
                                </label>
                            </div>

                            <label className="grid">
                                <span>توضیحات</span>
                                <textarea
                                    className="textarea"
                                    value={form.description}
                                    onChange={(event) =>
                                        updateField("description", event.target.value)
                                    }
                                    placeholder="توضیح کوتاه درباره این پلن"
                                />
                            </label>
                        </div>

                        <div className="admin-form-section">
                            <div>
                                <h2 className="admin-form-section-title">محدودیت‌ها</h2>
                                <p className="admin-form-section-text">
                                    این مقدارها در APIهای پروژه بررسی می‌شوند.
                                </p>
                            </div>

                            <div className="admin-two-col">
                                <label className="grid">
                                    <span>حداکثر سایت</span>
                                    <input
                                        className="input"
                                        type="number"
                                        min="1"
                                        value={form.max_sites}
                                        onChange={(event) =>
                                            updateField("max_sites", event.target.value)
                                        }
                                    />
                                </label>

                                <label className="grid">
                                    <span>حداکثر پشتیبان</span>
                                    <input
                                        className="input"
                                        type="number"
                                        min="0"
                                        value={form.max_agents}
                                        onChange={(event) =>
                                            updateField("max_agents", event.target.value)
                                        }
                                    />
                                </label>

                                <label className="grid">
                                    <span>گفتگوی ماهانه</span>
                                    <input
                                        className="input"
                                        type="number"
                                        min="0"
                                        value={form.max_monthly_conversations}
                                        onChange={(event) =>
                                            updateField(
                                                "max_monthly_conversations",
                                                event.target.value
                                            )
                                        }
                                    />
                                </label>

                                <label className="grid">
                                    <span>وضعیت پلن</span>
                                    <select
                                        className="input"
                                        value={form.is_active ? "active" : "inactive"}
                                        onChange={(event) =>
                                            updateField("is_active", event.target.value === "active")
                                        }
                                    >
                                        <option value="active">فعال</option>
                                        <option value="inactive">غیرفعال</option>
                                    </select>
                                </label>
                            </div>
                        </div>

                        <div className="admin-form-section">
                            <div>
                                <h2 className="admin-form-section-title">قابلیت‌ها</h2>
                                <p className="admin-form-section-text">
                                    قابلیت‌هایی که برای مشتریان این پلن فعال می‌شوند.
                                </p>
                            </div>

                            <div className="admin-two-col">
                                <ToggleBox
                                    title="Knowledge Base"
                                    description="امکان ثبت دانش برای پاسخ‌های AI داخلی"
                                    checked={form.knowledge_base_enabled}
                                    onChange={(value) =>
                                        updateField("knowledge_base_enabled", value)
                                    }
                                />

                                <ToggleBox
                                    title="AI Suggestion"
                                    description="تولید پیشنهاد پاسخ بر اساس Knowledge Base"
                                    checked={form.ai_suggestions_enabled}
                                    onChange={(value) =>
                                        updateField("ai_suggestions_enabled", value)
                                    }
                                />

                                <ToggleBox
                                    title="AI Auto Reply"
                                    description="پاسخ خودکار AI؛ فعلاً برای آینده نگه داشته شده"
                                    checked={form.ai_auto_reply_enabled}
                                    onChange={(value) =>
                                        updateField("ai_auto_reply_enabled", value)
                                    }
                                />
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <button className="btn" type="submit" disabled={saving}>
                                {saving
                                    ? "در حال ذخیره..."
                                    : form.id
                                        ? "ذخیره تغییرات پلن"
                                        : "ساخت پلن"}
                            </button>

                            {form.id && (
                                <button
                                    className="btn secondary"
                                    type="button"
                                    onClick={resetForm}
                                >
                                    انصراف از ویرایش
                                </button>
                            )}
                        </div>
                    </form>
                </section>

                <aside className="admin-info-stack">
                    <section className="admin-clean-card">
                        <h3 style={{ marginTop: 0 }}>پلن‌ها چطور اعمال می‌شوند؟</h3>

                        <div className="grid">
                            <HintItem
                                number="1"
                                title="تعداد پشتیبان"
                                text="هنگام ساخت agent جدید بررسی می‌شود."
                            />

                            <HintItem
                                number="2"
                                title="گفتگوی ماهانه"
                                text="هنگام شروع گفتگوی جدید از ویجت بررسی می‌شود."
                            />

                            <HintItem
                                number="3"
                                title="Knowledge Base"
                                text="هنگام ساخت آیتم دانش بررسی می‌شود."
                            />

                            <HintItem
                                number="4"
                                title="AI Suggestion"
                                text="هنگام تولید پیشنهاد پاسخ بررسی می‌شود."
                            />
                        </div>
                    </section>

                    <section className="admin-mini-panel">
                        <h3 style={{ marginTop: 0 }}>پیشنهاد پلن‌ها</h3>
                        <p className="muted" style={{ lineHeight: 1.9 }}>
                            برای MVP بهتر است ۳ پلن داشته باشی: Basic، Growth و Pro. پلن Basic
                            بدون AI، پلن Growth با Knowledge Base، و پلن Pro با AI Suggestion.
                        </p>
                    </section>
                </aside>
            </div>

            <section className="admin-clean-card" style={{ marginTop: 18 }}>
                {loading ? (
                    <p className="muted">در حال بارگذاری پلن‌ها...</p>
                ) : plans.length === 0 ? (
                    <div className="admin-empty-state">
                        <div style={{ fontSize: 42, marginBottom: 10 }}>◆</div>
                        <h3 style={{ margin: 0 }}>پلنی ثبت نشده است</h3>
                        <p className="muted">از فرم بالا اولین پلن را بساز.</p>
                    </div>
                ) : (
                    <div
                        className="admin-plan-grid"
                        style={{
                            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                        }}
                    >
                        {plans.map((plan) => (
                            <article key={plan.id} className="admin-plan-card">
                                <div className="admin-plan-top">
                                    <div>
                                        <h3 className="admin-plan-title">{plan.name}</h3>
                                        <div className="admin-plan-subtitle">
                                            {plan.description || "بدون توضیح ثبت‌شده"}
                                        </div>
                                    </div>

                                    <span className={`soft-chip ${plan.is_active ? "success" : "danger"}`}>
                    {plan.is_active ? "فعال" : "غیرفعال"}
                  </span>
                                </div>

                                <div className="admin-plan-price">
                                    {Number(plan.price_monthly || 0).toLocaleString("fa-IR")}
                                </div>
                                <div className="muted">هزینه ماهانه</div>

                                <div className="admin-feature-list">
                                    <FeatureRow label="حداکثر سایت" value={plan.max_sites} />
                                    <FeatureRow label="حداکثر پشتیبان" value={plan.max_agents} />
                                    <FeatureRow
                                        label="گفتگوی ماهانه"
                                        value={plan.max_monthly_conversations}
                                    />
                                    <FeatureRow
                                        label="AI Suggestion"
                                        value={plan.ai_suggestions_enabled ? "فعال" : "غیرفعال"}
                                    />
                                    <FeatureRow
                                        label="AI Auto Reply"
                                        value={plan.ai_auto_reply_enabled ? "فعال" : "غیرفعال"}
                                    />
                                    <FeatureRow
                                        label="Knowledge Base"
                                        value={plan.knowledge_base_enabled ? "فعال" : "غیرفعال"}
                                    />
                                </div>

                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                                    <button
                                        className="btn"
                                        type="button"
                                        onClick={() => editPlan(plan)}
                                    >
                                        ویرایش
                                    </button>

                                    <button
                                        className={plan.is_active ? "btn danger" : "btn secondary"}
                                        type="button"
                                        onClick={() => togglePlanStatus(plan)}
                                        disabled={updatingPlanId === plan.id}
                                    >
                                        {updatingPlanId === plan.id
                                            ? "در حال تغییر..."
                                            : plan.is_active
                                                ? "غیرفعال"
                                                : "فعال"}
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </AppShell>
    );
}

function MetricCard({
                        label,
                        value,
                    }: {
    label: string;
    value: string | number;
}) {
    return (
        <section className="metric-compact">
            <div className="metric-compact-value">{value}</div>
            <div className="metric-compact-label">{label}</div>
        </section>
    );
}

function FeatureRow({
                        label,
                        value,
                    }: {
    label: string;
    value: string | number;
}) {
    return (
        <div className="admin-feature-row">
            <span className="muted">{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function ToggleBox({
                       title,
                       description,
                       checked,
                       onChange,
                   }: {
    title: string;
    description: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <label
            style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: 14,
                borderRadius: 18,
                background: "var(--surface-soft)",
                border: "1px solid var(--border)",
                cursor: "pointer",
            }}
        >
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                style={{ marginTop: 5 }}
            />

            <span>
        <strong>{title}</strong>
        <span
            className="muted"
            style={{
                display: "block",
                marginTop: 4,
                lineHeight: 1.7,
            }}
        >
          {description}
        </span>
      </span>
        </label>
    );
}

function HintItem({
                      number,
                      title,
                      text,
                  }: {
    number: string;
    title: string;
    text: string;
}) {
    return (
        <div className="admin-hint-item">
            <span className="admin-hint-number">{number}</span>

            <div>
                <strong>{title}</strong>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                    {text}
                </p>
            </div>
        </div>
    );
}