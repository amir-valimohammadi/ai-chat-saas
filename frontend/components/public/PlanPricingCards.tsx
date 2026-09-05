"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { formatPlanPrice } from "@/lib/plan-money";

type PublicPlan = {
    id: number; name: string; description: string | null; price_monthly: number;
    max_sites: number; max_agents: number; max_monthly_conversations: number;
    ai_suggestions_enabled: boolean; ai_auto_reply_enabled: boolean; knowledge_base_enabled: boolean;
};

export default function PlanPricingCards({ onChoose }: { onChoose: (name: string) => void }) {
    const [plans, setPlans] = useState<PublicPlan[]>([]);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        apiRequest("/public/plans-list.php", { auth: false })
            .then((data) => {
                if (!Array.isArray(data.plans)) throw new Error("Invalid catalog");
                if (active) { setPlans(data.plans); setStatus("ready"); }
            })
            .catch(() => { if (active) setStatus("error"); });
        return () => { active = false; };
    }, [attempt]);
    if (status === "loading") return <p role="status">در حال دریافت تعرفه‌ها…</p>;
    if (status === "error") return <div role="status"><p>تعرفه‌ها دریافت نشد؛ برای قیمت روز با ما تماس بگیرید.</p>
        <button type="button" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}>تلاش مجدد</button></div>;
    if (!plans.length) return <p>فعلاً پلنی برای خرید نمایش داده نشده است؛ با ما تماس بگیرید.</p>;
    return plans.map((plan) => (
        <article key={plan.id} className={plan.name === "Growth" ? "is-featured" : ""}>
            {plan.name === "Growth" && <span className="orbit-plan-badge">انتخاب پیشنهادی</span>}
            <small>{plan.description || "اشتراک ماهانه"}</small>
            <h3>{plan.name}</h3>
            <strong>{formatPlanPrice(plan.price_monthly)} / ماه</strong>
            <div className="orbit-plan-line" />
            <ul>
                <li>{plan.max_sites.toLocaleString("fa-IR")} سایت</li>
                <li>{plan.max_agents > 0 ? `${plan.max_agents.toLocaleString("fa-IR")} اپراتور` : "ظرفیت اپراتور طبق قرارداد"}</li>
                <li>{plan.max_monthly_conversations > 0 ? `${plan.max_monthly_conversations.toLocaleString("fa-IR")} گفتگوی جدید در ماه` : "ظرفیت گفتگو طبق قرارداد"}</li>
                {plan.knowledge_base_enabled && <li>پایگاه دانش</li>}
                {plan.ai_suggestions_enabled && <li>پیشنهاد پاسخ دانش‌محور</li>}
                {plan.ai_auto_reply_enabled && <li>پاسخ خودکار کنترل‌شده</li>}
            </ul>
            <button type="button" onClick={() => onChoose(plan.name)}>درخواست این پلن</button>
        </article>
    ));
}
