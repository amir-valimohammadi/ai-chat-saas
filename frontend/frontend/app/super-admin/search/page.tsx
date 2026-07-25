"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type Scope = "all" | "customers" | "sites" | "users" | "conversations";
type SearchItem = { id: number; title: string; subtitle: string; href: string; meta: Record<string, unknown> };
type SearchData = { query: string; scope: Scope; total: number; groups: Partial<Record<Exclude<Scope,"all">, SearchItem[]>> };

const scopeLabels: Record<Scope,string> = { all:"همه", customers:"مشتری‌ها", sites:"سایت‌ها", users:"کاربران", conversations:"گفتگوها" };
const groupLabels: Record<Exclude<Scope,"all">,string> = { customers:"مشتری‌ها", sites:"سایت‌ها", users:"کاربران", conversations:"گفتگوها" };

export default function SuperAdminGlobalSearchPage() {
  const [authorized, setAuthorized] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [data, setData] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = getAuthUser();
    const can = user?.role === "super_admin" && (user?.is_platform_owner || user?.permissions?.includes("*") || user?.permissions?.includes("customers.view"));
    setAuthorized(Boolean(can));
  }, []);

  async function search(event?: FormEvent) {
    event?.preventDefault();
    const value = query.trim();
    if (value.length < 2) { setError("حداقل دو نویسه وارد کن."); return; }
    setLoading(true); setError("");
    try { setData(await apiRequest(`/super-admin/global-search.php?q=${encodeURIComponent(value)}&scope=${scope}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "جست‌وجو ناموفق بود."); }
    finally { setLoading(false); }
  }

  const groups = useMemo(() => data ? (Object.entries(data.groups) as Array<[Exclude<Scope,"all">,SearchItem[]]>).filter(([,items]) => items.length) : [], [data]);

  if (!authorized) return <main className="global-search-guard">دسترسی لازم برای جست‌وجوی سراسری وجود ندارد.</main>;

  return (
    <AppShell title="جست‌وجوی سراسری" description="جست‌وجوی یکپارچه بین مشتری، سایت، کاربر و گفتگو" kicker="Customer 360">
      <section className="global-search-page">
        <form className="global-search-box" onSubmit={search}>
          <div className="global-search-input-wrap"><span>⌕</span><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="نام مشتری، ایمیل، دامنه، site_key، تلفن یا شناسه گفتگو..." /></div>
          <div className="global-search-scopes">{(Object.keys(scopeLabels) as Scope[]).map((item) => <button type="button" key={item} className={scope===item?"is-active":""} onClick={() => setScope(item)}>{scopeLabels[item]}</button>)}</div>
          <button className="global-search-submit" disabled={loading}>{loading?"در حال جست‌وجو...":"جست‌وجو"}</button>
        </form>
        {error && <div className="global-search-alert">{error}</div>}
        {data && <div className="global-search-summary"><strong>{data.total.toLocaleString("fa-IR")}</strong> نتیجه برای «{data.query}»</div>}
        <div className="global-search-results">
          {groups.map(([group,items]) => <section key={group} className="global-search-group"><header><h2>{groupLabels[group]}</h2><span>{items.length.toLocaleString("fa-IR")}</span></header><div>{items.map((item) => <Link href={item.href} key={`${group}-${item.id}`} className="global-search-result"><span className="global-search-result-icon">{group === "customers" ? "👥" : group === "sites" ? "◎" : group === "users" ? "●" : "💬"}</span><div><strong>{item.title}</strong><p>{item.subtitle || "بدون توضیح"}</p><small>{formatMeta(item.meta)}</small></div><b>‹</b></Link>)}</div></section>)}
          {data && groups.length===0 && <div className="global-search-empty">نتیجه‌ای پیدا نشد. عبارت کوتاه‌تر یا Scope دیگری را امتحان کن.</div>}
        </div>
      </section>
    </AppShell>
  );
}

function formatMeta(meta: Record<string, unknown>) {
  return Object.entries(meta).filter(([,value]) => value !== null && value !== "" && value !== undefined).slice(0,4).map(([key,value]) => `${key}: ${String(value)}`).join(" · ");
}
