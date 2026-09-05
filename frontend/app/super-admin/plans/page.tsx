// مسیر فایل: ai-chat-saas/frontend/app/super-admin/plans/page.tsx
// هدف: مدیریت حرفه‌ای پلن‌ها، محدودیت‌ها و اثر تغییرات توسط Super Admin

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";
import { formatPlanPrice, rialToTomanInput, tomanInputToRial } from "@/lib/plan-money";

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
    updated_at: string | null;
    customers_count: number;
    active_customers_count: number;
    total_sites: number;
    total_agents: number;
    monthly_conversations_count: number;
    tenants_over_sites_limit: number;
    tenants_over_agents_limit: number;
    tenants_over_conversations_limit: number;
};

type Summary = {
    total_plans: number;
    active_plans: number;
    inactive_plans: number;
    assigned_customers: number;
    active_customers: number;
    estimated_monthly_revenue: number;
    customers_over_any_limit: number;
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

type StatusFilter = "all" | "active" | "inactive";
type SortMode = "default" | "price_asc" | "price_desc" | "customers_desc" | "capacity_desc";

const emptyForm: PlanForm = {
    id: null,
    name: "",
    description: "",
    max_sites: "1",
    max_agents: "1",
    max_monthly_conversations: "500",
    ai_suggestions_enabled: true,
    ai_auto_reply_enabled: false,
    knowledge_base_enabled: true,
    price_monthly: "0",
    is_active: true,
};

const emptySummary: Summary = {
    total_plans: 0,
    active_plans: 0,
    inactive_plans: 0,
    assigned_customers: 0,
    active_customers: 0,
    estimated_monthly_revenue: 0,
    customers_over_any_limit: 0,
};

export default function SuperAdminPlansPage() {
    const router = useRouter();

    const [plans, setPlans] = useState<Plan[]>([]);
    const [summary, setSummary] = useState<Summary>(emptySummary);
    const [form, setForm] = useState<PlanForm>(emptyForm);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [sortMode, setSortMode] = useState<SortMode>("default");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [updatingPlanId, setUpdatingPlanId] = useState<number | null>(null);
    const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    async function loadPlans(silent = false) {
        try {
            setError("");
            silent ? setRefreshing(true) : setLoading(true);
            const data = await apiRequest("/super-admin/plans-list.php");
            setPlans(data.plans || []);
            setSummary(data.summary || emptySummary);
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

    const filteredPlans = useMemo(() => {
        const query = search.trim().toLowerCase();
        const result = plans.filter((plan) => {
            const matchesSearch =
                !query ||
                [plan.name, plan.description, plan.id]
                    .filter((value) => value !== null && value !== undefined)
                    .join(" ")
                    .toLowerCase()
                    .includes(query);
            const matchesStatus =
                statusFilter === "all" ||
                (statusFilter === "active" ? plan.is_active : !plan.is_active);
            return matchesSearch && matchesStatus;
        });

        return [...result].sort((a, b) => {
            if (sortMode === "price_asc") return a.price_monthly - b.price_monthly;
            if (sortMode === "price_desc") return b.price_monthly - a.price_monthly;
            if (sortMode === "customers_desc") return b.customers_count - a.customers_count;
            if (sortMode === "capacity_desc") {
                return b.max_monthly_conversations - a.max_monthly_conversations;
            }
            return a.id - b.id;
        });
    }, [plans, search, statusFilter, sortMode]);

    const editingPlan = plans.find((plan) => plan.id === form.id) || null;

    function updateField(field: keyof PlanForm, value: string | boolean) {
        setForm((previous) => ({ ...previous, [field]: value }));
    }

    function resetForm(clearMessages = false) {
        setForm(emptyForm);
        if (clearMessages) {
            setError("");
            setSuccess("");
        }
    }

    function focusEditor() {
        requestAnimationFrame(() => {
            document.getElementById("sa-plan-editor")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        });
    }

    function editPlan(plan: Plan) {
        setForm({
            id: plan.id,
            name: plan.name,
            description: plan.description || "",
            max_sites: String(plan.max_sites),
            max_agents: String(plan.max_agents),
            max_monthly_conversations: String(plan.max_monthly_conversations),
            ai_suggestions_enabled: plan.ai_suggestions_enabled,
            ai_auto_reply_enabled: plan.ai_auto_reply_enabled,
            knowledge_base_enabled: plan.knowledge_base_enabled,
            price_monthly: rialToTomanInput(plan.price_monthly),
            is_active: plan.is_active,
        });
        setError("");
        setSuccess("");
        focusEditor();
    }

    function duplicatePlan(plan: Plan) {
        setForm({
            id: null,
            name: `${plan.name} Copy`,
            description: plan.description || "",
            max_sites: String(plan.max_sites),
            max_agents: String(plan.max_agents),
            max_monthly_conversations: String(plan.max_monthly_conversations),
            ai_suggestions_enabled: plan.ai_suggestions_enabled,
            ai_auto_reply_enabled: plan.ai_auto_reply_enabled,
            knowledge_base_enabled: plan.knowledge_base_enabled,
            price_monthly: rialToTomanInput(plan.price_monthly),
            is_active: false,
        });
        setSuccess("یک نسخه قابل ویرایش از پلن آماده شد؛ نام آن را بررسی کن.");
        focusEditor();
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const payload = {
            id: form.id,
            name: form.name.trim(),
            description: form.description.trim(),
            max_sites: Number(form.max_sites || 0),
            max_agents: Number(form.max_agents || 0),
            max_monthly_conversations: Number(form.max_monthly_conversations || 0),
            ai_suggestions_enabled: form.ai_suggestions_enabled,
            ai_auto_reply_enabled: form.ai_auto_reply_enabled,
            knowledge_base_enabled: form.knowledge_base_enabled,
            price_monthly: tomanInputToRial(form.price_monthly),
            price_currency: "IRR",
            is_active: form.is_active,
        };

        if (!payload.name) return setError("نام پلن الزامی است.");
        if (payload.max_sites < 1) return setError("حداکثر سایت باید حداقل ۱ باشد.");
        if (payload.max_agents < 0) return setError("حداکثر پشتیبان نمی‌تواند منفی باشد.");
        if (payload.max_monthly_conversations < 0) return setError("گفتگوی ماهانه نمی‌تواند منفی باشد.");
        if (!Number.isFinite(payload.price_monthly)) return setError("قیمت ماهانه به تومان معتبر نیست؛ حداکثر سه رقم اعشار مجاز است.");

        try {
            setSaving(true);
            setError("");
            setSuccess("");

            if (form.id) {
                const response = await apiRequest("/super-admin/plan-update.php", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                const affected = Number(response.impact?.affected_customers || 0);
                setSuccess(
                    affected > 0
                        ? `پلن ویرایش شد. ${formatNumber(affected)} مشتری پس از کاهش محدودیت‌ها نیازمند بررسی است.`
                        : "پلن با موفقیت ویرایش شد."
                );
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
            const response = await apiRequest("/super-admin/plan-toggle-status.php", {
                method: "POST",
                body: JSON.stringify({ id: plan.id, is_active: !plan.is_active }),
            });
            setSuccess(
                response.warning ||
                (!plan.is_active ? "پلن فعال شد." : "پلن غیرفعال شد.")
            );
            setConfirmPlan(null);
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
            kicker="Plans & Limits"
            description="مدیریت قیمت، ظرفیت، قابلیت‌ها و اثر هر پلن روی مشتریان"
            actions={
                <div className="sa-plans-header-actions">
                    <button className="btn secondary" type="button" onClick={() => loadPlans(true)} disabled={refreshing}>
                        {refreshing ? "در حال بروزرسانی..." : "بروزرسانی"}
                    </button>
                    <button className="btn" type="button" onClick={() => { resetForm(true); focusEditor(); }}>
                        ساخت پلن جدید
                    </button>
                </div>
            }
        >
            <div className="sa-plans-page">
                {error && <div className="error">{error}</div>}
                {success && <div className="success">{success}</div>}

                <section className="sa-plans-summary-grid">
                    <SummaryCard label="کل پلن‌ها" value={summary.total_plans} detail={`${formatNumber(summary.active_plans)} فعال`} />
                    <SummaryCard label="مشتریان دارای پلن" value={summary.assigned_customers} detail={`${formatNumber(summary.active_customers)} مشتری فعال`} />
                    <SummaryCard label="درآمد ماهانه تخمینی" value={formatMoney(summary.estimated_monthly_revenue)} detail="بر اساس مشتریان فعال" />
                    <SummaryCard label="نیازمند بررسی" value={summary.customers_over_any_limit} detail="عبور از حداقل یک سقف" warning={summary.customers_over_any_limit > 0} />
                </section>

                <section className="sa-plans-toolbar">
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جست‌وجو در نام، توضیحات یا شناسه پلن..." />
                    <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                        <option value="all">همه وضعیت‌ها</option>
                        <option value="active">فعال</option>
                        <option value="inactive">غیرفعال</option>
                    </select>
                    <select className="input" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                        <option value="default">ترتیب پیش‌فرض</option>
                        <option value="price_asc">قیمت کمتر</option>
                        <option value="price_desc">قیمت بیشتر</option>
                        <option value="customers_desc">بیشترین مشتری</option>
                        <option value="capacity_desc">بیشترین ظرفیت</option>
                    </select>
                    <span>{formatNumber(filteredPlans.length)} نتیجه</span>
                </section>

                <div className="sa-plans-workspace">
                    <aside id="sa-plan-editor" className="sa-plans-editor-card">
                        <header>
                            <div>
                                <small>{form.id ? `ویرایش #${form.id}` : "پلن جدید"}</small>
                                <h2>{form.id ? "ویرایش پلن" : "ساخت پلن"}</h2>
                                <p>ظرفیت‌ها و قابلیت‌های قابل اعمال در APIهای محدودیت.</p>
                            </div>
                            {form.id && <button type="button" onClick={() => resetForm(true)}>×</button>}
                        </header>

                        {editingPlan && (
                            <div className="sa-plans-editor-context">
                                این پلن به {formatNumber(editingPlan.customers_count)} مشتری اختصاص دارد.
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="sa-plans-form">
                            <FormField label="نام پلن">
                                <input className="input" value={form.name} maxLength={100} onChange={(event) => updateField("name", event.target.value)} />
                            </FormField>
                            <FormField label="قیمت ماهانه (تومان)">
                                <input className="input" type="number" min="0" max="999999999.999" step="0.001" value={form.price_monthly} onChange={(event) => updateField("price_monthly", event.target.value)} />
                            </FormField>
                            <FormField label="توضیحات">
                                <textarea className="textarea" value={form.description} maxLength={1000} onChange={(event) => updateField("description", event.target.value)} />
                            </FormField>

                            <div className="sa-plans-number-grid">
                                <NumberField label="حداکثر سایت" value={form.max_sites} min={1} onChange={(value) => updateField("max_sites", value)} />
                                <NumberField label="حداکثر پشتیبان" value={form.max_agents} min={0} onChange={(value) => updateField("max_agents", value)} />
                                <NumberField label="گفتگوی ماهانه" value={form.max_monthly_conversations} min={0} onChange={(value) => updateField("max_monthly_conversations", value)} wide />
                            </div>

                            <ToggleBox title="پایگاه دانش" checked={form.knowledge_base_enabled} onChange={(value) => updateField("knowledge_base_enabled", value)} />
                            <ToggleBox title="پیشنهاد پاسخ AI" checked={form.ai_suggestions_enabled} onChange={(value) => updateField("ai_suggestions_enabled", value)} />
                            <ToggleBox title="پاسخ خودکار AI" checked={form.ai_auto_reply_enabled} onChange={(value) => updateField("ai_auto_reply_enabled", value)} />
                            <ToggleBox title="پلن فعال" checked={form.is_active} onChange={(value) => updateField("is_active", value)} />

                            <div className="sa-plans-form-actions">
                                <button className="btn" type="submit" disabled={saving}>
                                    {saving ? "در حال ذخیره..." : form.id ? "ذخیره تغییرات" : "ساخت پلن"}
                                </button>
                                <button className="btn secondary" type="button" onClick={() => resetForm(true)}>پاک‌کردن فرم</button>
                            </div>
                        </form>
                    </aside>

                    <main className="sa-plans-catalog">
                        <header>
                            <div>
                                <small>Catalog</small>
                                <h2>پلن‌های پلتفرم</h2>
                                <p>قیمت، ظرفیت، مشتریان و هشدارهای هر پلن.</p>
                            </div>
                        </header>

                        {loading ? (
                            <div className="sa-plans-grid">{[1, 2, 3].map((item) => <div key={item} className="sa-plans-card is-loading" />)}</div>
                        ) : filteredPlans.length === 0 ? (
                            <div className="sa-plans-empty">پلنی پیدا نشد.</div>
                        ) : (
                            <div className="sa-plans-grid">
                                {filteredPlans.map((plan) => (
                                    <PlanCard
                                        key={plan.id}
                                        plan={plan}
                                        onEdit={() => editPlan(plan)}
                                        onDuplicate={() => duplicatePlan(plan)}
                                        onToggle={() => setConfirmPlan(plan)}
                                    />
                                ))}
                            </div>
                        )}
                    </main>
                </div>
            </div>

            {confirmPlan && (
                <div className="sa-plans-modal-backdrop" onMouseDown={() => setConfirmPlan(null)}>
                    <section className="sa-plans-modal" onMouseDown={(event) => event.stopPropagation()}>
                        <h2>{confirmPlan.is_active ? "غیرفعال‌کردن پلن" : "فعال‌کردن پلن"}</h2>
                        <p>
                            پلن <strong>{confirmPlan.name}</strong> به {formatNumber(confirmPlan.customers_count)} مشتری اختصاص دارد.
                            غیرفعال‌شدن، تخصیص‌های فعلی را حذف نمی‌کند.
                        </p>
                        <div>
                            <button className={confirmPlan.is_active ? "btn danger" : "btn"} type="button" onClick={() => togglePlanStatus(confirmPlan)} disabled={updatingPlanId === confirmPlan.id}>
                                {updatingPlanId === confirmPlan.id ? "در حال تغییر..." : "تأیید"}
                            </button>
                            <button className="btn secondary" type="button" onClick={() => setConfirmPlan(null)}>انصراف</button>
                        </div>
                    </section>
                </div>
            )}
        </AppShell>
    );
}

function PlanCard({ plan, onEdit, onDuplicate, onToggle }: { plan: Plan; onEdit: () => void; onDuplicate: () => void; onToggle: () => void }) {
    const alerts = plan.tenants_over_sites_limit + plan.tenants_over_agents_limit + plan.tenants_over_conversations_limit;

    return (
        <article className={`sa-plans-card ${plan.is_active ? "" : "is-inactive"}`}>
            <div className="sa-plans-card-head">
                <div>
                    <small>#{plan.id}</small>
                    <h3>{plan.name}</h3>
                    <p>{plan.description || "بدون توضیح ثبت‌شده"}</p>
                </div>
                <span className={plan.is_active ? "active" : "inactive"}>{plan.is_active ? "فعال" : "غیرفعال"}</span>
            </div>

            <strong className="sa-plans-price">{formatMoney(plan.price_monthly)}</strong>

            <div className="sa-plans-stats-row">
                <MiniStat label="مشتریان" value={plan.customers_count} />
                <MiniStat label="فعال" value={plan.active_customers_count} />
                <MiniStat label="گفتگوی ماه" value={plan.monthly_conversations_count} />
            </div>

            <div className="sa-plans-limits">
                <MiniStat label="سقف سایت" value={plan.max_sites} />
                <MiniStat label="سقف پشتیبان" value={plan.max_agents} />
                <MiniStat label="سقف گفتگو" value={plan.max_monthly_conversations} />
            </div>

            <div className="sa-plans-features">
                <Feature enabled={plan.knowledge_base_enabled} label="Knowledge Base" />
                <Feature enabled={plan.ai_suggestions_enabled} label="AI Suggestion" />
                <Feature enabled={plan.ai_auto_reply_enabled} label="AI Auto Reply" />
            </div>

            <div className={alerts > 0 ? "sa-plans-alert" : "sa-plans-ok"}>
                {alerts > 0
                    ? `${formatNumber(alerts)} هشدار محدودیت ثبت شده است.`
                    : "همه مشتریان داخل محدوده پلن هستند."}
            </div>

            <div className="sa-plans-card-actions">
                <button className="btn" type="button" onClick={onEdit}>ویرایش</button>
                <button className="btn secondary" type="button" onClick={onDuplicate}>ساخت کپی</button>
                <button className={plan.is_active ? "btn danger" : "btn secondary"} type="button" onClick={onToggle}>{plan.is_active ? "غیرفعال" : "فعال"}</button>
            </div>
        </article>
    );
}

function SummaryCard({ label, value, detail, warning = false }: { label: string; value: string | number; detail: string; warning?: boolean }) {
    return (
        <article className={`sa-plans-summary-card ${warning ? "warning" : ""}`}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
        </article>
    );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="sa-plans-field"><span>{label}</span>{children}</label>;
}

function NumberField({ label, value, min, wide = false, onChange }: { label: string; value: string; min: number; wide?: boolean; onChange: (value: string) => void }) {
    return (
        <label className={`sa-plans-field ${wide ? "wide" : ""}`}>
            <span>{label}</span>
            <input className="input" type="number" min={min} value={value} onChange={(event) => onChange(event.target.value)} />
        </label>
    );
}

function ToggleBox({ title, checked, onChange }: { title: string; checked: boolean; onChange: (value: boolean) => void }) {
    return (
        <label className={`sa-plans-toggle ${checked ? "checked" : ""}`}>
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
            <span className="track"><i /></span>
            <strong>{title}</strong>
        </label>
    );
}

function MiniStat({ label, value }: { label: string; value: number }) {
    return <div><span>{label}</span><strong>{formatNumber(value)}</strong></div>;
}

function Feature({ enabled, label }: { enabled: boolean; label: string }) {
    return <span className={enabled ? "enabled" : "disabled"}>{enabled ? "✓" : "×"} {label}</span>;
}

function formatMoney(value: number) {
    return formatPlanPrice(value);
}

function formatNumber(value: number) {
    return Number(value || 0).toLocaleString("fa-IR");
}
