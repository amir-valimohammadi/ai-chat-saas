// Plan catalog amounts are IRR. Human-facing catalog prices are displayed in toman.
export function formatPlanPrice(rial: number | string): string {
    const value = Number(rial);
    if (!Number.isFinite(value) || value < 0) return "—";
    return value === 0 ? "رایگان" : `${(value / 10).toLocaleString("fa-IR", { maximumFractionDigits: 3 })} تومان`;
}

export function rialToTomanInput(rial: number | string): string {
    return String(Number((Number(rial) / 10).toFixed(3)));
}

export function tomanInputToRial(value: string): number {
    // Up to 3 toman decimals == 2 rial decimals, within plans DECIMAL(12,2).
    if (!/^(0|[1-9][0-9]{0,8})(\.[0-9]{1,3})?$/.test(value)) return NaN;
    const [whole, fraction = ""] = value.split(".");
    return (Number(whole) * 1000 + Number(fraction.padEnd(3, "0"))) / 100;
}

export function suggestedSubscriptionPrice(rial: number, cycle: string, currency: string): string {
    const amount = Math.round(rial * (cycle === "yearly" ? 12 : cycle === "quarterly" ? 3 : 1) * 100) / 100;
    if (currency === "IRR") return String(amount);
    // Contracts allow 2 decimal places, unlike the catalog's toman editor.
    if (currency === "IRT") return String(Math.round(amount * 10) / 100);
    // No implicit exchange rate for USD/EUR or arbitrary currencies.
    return "";
}
