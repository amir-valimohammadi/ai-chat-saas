"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiDownload, apiRequest, getAuthUser } from "@/lib/api";

type FindingStatus = "open" | "resolved" | "ignored";
type Severity = "info" | "low" | "medium" | "high" | "critical";
type Finding = {
    id:number; case_key:string; category:string; title:string; target_type:string; target_id:number|null; target_label:string|null;
    status:FindingStatus; test_status:"warning"|"failed"|"error"; severity:Severity; message:string|null; root_cause:string|null;
    impact:string|null; expected_value:string|null; actual_value:string|null; remediation:string|null; evidence:unknown;
    first_seen_at:string; last_seen_at:string; occurrence_count:number; last_run_id:number; resolved_by_name:string|null;
    resolved_at:string|null; resolution_note:string|null; risk_score:number|null; confidence:"low"|"medium"|"high"|"confirmed"|null;
    owasp_category:string|null; cwe_id:string|null; affected_component:string|null; verification_mode:"static"|"runtime"|"database"|"configuration"|"hybrid"|null;
};
type Response = {
    success:true; findings:Finding[]; summary:Array<{status:FindingStatus;severity:Severity;total:number}>;
    categories:Array<{category:string;total:number}>; pagination:{page:number;per_page:number;total:number;pages:number};
    permissions:{can_export:boolean;can_manage:boolean};
};

const statusLabels:Record<FindingStatus,string>={open:"باز",resolved:"حل‌شده",ignored:"نادیده‌گرفته‌شده"};
const severityLabels:Record<Severity,string>={info:"اطلاعاتی",low:"کم",medium:"متوسط",high:"زیاد",critical:"بحرانی"};
const categoryLabels:Record<string,string>={runtime:"محیط اجرا",database:"دیتابیس",storage:"فضا و فایل",security:"امنیت",api:"API",widget:"ویجت",messaging:"پیام‌رسان",visitors:"بازدیدکنندگان",crawl:"خزش",operations:"عملیات"};

export default function QaFindingsPage(){
    const router=useRouter();
    const searchParams=useSearchParams();
    const focusId=Number(searchParams.get("focus")||0);
    const [findings,setFindings]=useState<Finding[]>([]);
    const [summary,setSummary]=useState<Response["summary"]>([]);
    const [categories,setCategories]=useState<Response["categories"]>([]);
    const [permissions,setPermissions]=useState({can_export:false,can_manage:false});
    const [pagination,setPagination]=useState({page:1,per_page:25,total:0,pages:1});
    const [status,setStatus]=useState<"all"|FindingStatus>("open");
    const [severity,setSeverity]=useState<"all"|Severity>("all");
    const [category,setCategory]=useState("all");
    const [query,setQuery]=useState("");
    const [loading,setLoading]=useState(true);
    const [error,setError]=useState("");
    const [workingId,setWorkingId]=useState<number|null>(null);

    const load=useCallback(async(page=1)=>{
        try{
            setLoading(true);setError("");
            const response=await apiRequest(`/super-admin/qa-findings-list.php?page=${page}&per_page=25&status=${encodeURIComponent(status)}&severity=${encodeURIComponent(severity)}&category=${encodeURIComponent(category)}&q=${encodeURIComponent(query.trim())}`) as Response;
            setFindings(response.findings);setSummary(response.summary);setCategories(response.categories);setPagination(response.pagination);setPermissions(response.permissions);
        }catch(err){setError(err instanceof Error?err.message:"دریافت ایرادات ناموفق بود.")}
        finally{setLoading(false)}
    },[category,query,severity,status]);

    useEffect(()=>{
        const user=getAuthUser() as {role?:string}|null;
        if(!user){router.push("/login");return}
        if(user.role!=="super_admin"){router.push("/dashboard");return}
        load(1);
    },[load,router]);

    useEffect(()=>{
        if(!focusId||loading)return;
        const element=document.getElementById(`qa-finding-${focusId}`);
        element?.scrollIntoView({behavior:"smooth",block:"center"});
    },[focusId,loading,findings]);

    const counts=useMemo(()=>{
        const result={open:0,resolved:0,ignored:0,critical:0,high:0};
        summary.forEach((item)=>{result[item.status]+=Number(item.total);if(item.status==="open"&&item.severity==="critical")result.critical+=Number(item.total);if(item.status==="open"&&item.severity==="high")result.high+=Number(item.total)});
        return result;
    },[summary]);

    async function updateFinding(finding:Finding,action:"resolve"|"reopen"|"ignore"){
        const label=action==="resolve"?"حل مشکل":action==="ignore"?"نادیده‌گرفتن":"بازگشایی";
        const note=window.prompt(`یادداشت ${label} را وارد کن:`,finding.resolution_note||"");
        if(note===null)return;
        try{
            setWorkingId(finding.id);setError("");
            await apiRequest("/super-admin/qa-finding-update.php",{method:"POST",body:JSON.stringify({id:finding.id,action,note})});
            await load(pagination.page);
        }catch(err){setError(err instanceof Error?err.message:"بروزرسانی ایراد ناموفق بود.")}
        finally{setWorkingId(null)}
    }

    return <AppShell title="ایرادات و هشدارهای تست"><main className="qa-findings-page">
        <header className="qa-hero">
            <div><span className="qa-kicker">QA FINDINGS REGISTRY</span><h1>خروجی ایرادات و هشدارها</h1><p>مشکلات را همراه با دلیل، اثر، شواهد، تعداد تکرار و راهکار رفع بررسی و مدیریت کن.</p></div>
            <div className="qa-findings-header-actions"><button className="qa-secondary-button" onClick={()=>router.push("/super-admin/test-center")}>مرکز تست</button><button className="qa-secondary-button" onClick={()=>window.print()}>چاپ گزارش</button><button className="qa-secondary-button" disabled={!permissions.can_export} onClick={()=>apiDownload("/super-admin/qa-findings-export.php?scope=open&format=csv","qa-open-findings.csv").catch(err=>setError(err instanceof Error?err.message:"دانلود ناموفق بود."))}>CSV مشکلات باز</button><button className="qa-primary-button" disabled={!permissions.can_export} onClick={()=>apiDownload("/super-admin/qa-findings-export.php?scope=all&format=json","qa-all-findings.json").catch(err=>setError(err instanceof Error?err.message:"دانلود ناموفق بود."))}>JSON کامل</button></div>
        </header>
        {error&&<div className="qa-alert qa-alert-error">{error}</div>}
        <section className="qa-findings-summary-grid">
            <article><span>مشکلات باز</span><strong>{formatNumber(counts.open)}</strong></article>
            <article><span>بحرانی</span><strong className="qa-text-danger">{formatNumber(counts.critical)}</strong></article>
            <article><span>شدت بالا</span><strong className="qa-text-danger">{formatNumber(counts.high)}</strong></article>
            <article><span>حل‌شده</span><strong className="qa-text-success">{formatNumber(counts.resolved)}</strong></article>
            <article><span>نادیده‌گرفته</span><strong>{formatNumber(counts.ignored)}</strong></article>
        </section>
        <section className="qa-card"><div className="qa-findings-filter-bar">
            <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")load(1)}} placeholder="جست‌وجو در عنوان، دلیل، راهکار یا هدف…" />
            <select value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="all">همه وضعیت‌ها</option>{Object.entries(statusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
            <select value={severity} onChange={e=>setSeverity(e.target.value as typeof severity)}><option value="all">همه شدت‌ها</option>{Object.entries(severityLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
            <select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">همه دسته‌ها</option>{categories.map(item=><option key={item.category} value={item.category}>{categoryLabels[item.category]??item.category} ({item.total})</option>)}</select>
            <button className="qa-link-button" onClick={()=>load(1)}>اعمال فیلتر</button><span>{formatNumber(pagination.total)} مورد</span>
        </div></section>
        <section className="qa-findings-list">
            {!loading&&findings.map(finding=><article id={`qa-finding-${finding.id}`} key={finding.id} className={`qa-finding-card is-${finding.severity} ${focusId===finding.id?"is-focused":""}`}>
                <div className="qa-finding-card-head"><div><div className="qa-finding-badges"><span className={`qa-finding-severity is-${finding.severity}`}>{severityLabels[finding.severity]}</span><span className={`qa-finding-status is-${finding.status}`}>{statusLabels[finding.status]}</span><span>{categoryLabels[finding.category]??finding.category}</span></div><h2>{finding.title}</h2><code>{finding.case_key}</code></div><div className="qa-finding-occurrence"><strong>{formatNumber(finding.occurrence_count)}</strong><span>بار مشاهده</span></div></div>
                <div className="qa-finding-meta"><span>هدف: {finding.target_label||"کل سامانه"}</span><span>آخرین Run: #{finding.last_run_id}</span><span>آخرین مشاهده: {formatDate(finding.last_seen_at)}</span></div>
                {(finding.risk_score!=null||finding.owasp_category||finding.cwe_id||finding.affected_component||finding.verification_mode)&&<div className="qa-security-meta-row qa-finding-security-meta">
                    {finding.risk_score!=null&&<span className={`qa-risk-badge ${finding.risk_score>=8?"is-critical":finding.risk_score>=5?"is-high":"is-medium"}`}>ریسک {finding.risk_score}/10</span>}
                    {finding.confidence&&<span>اطمینان: {confidenceLabel(finding.confidence)}</span>}
                    {finding.owasp_category&&<span>{finding.owasp_category}</span>}
                    {finding.cwe_id&&<span>{finding.cwe_id}</span>}
                    {finding.affected_component&&<span>بخش: {finding.affected_component}</span>}
                    {finding.verification_mode&&<span>روش: {modeLabel(finding.verification_mode)}</span>}
                </div>}
                <div className="qa-finding-problem"><strong>شرح مشکل</strong><p>{finding.message||"شرح ثبت نشده است."}</p></div>
                <div className="qa-diagnosis-grid"><div><strong>دلیل احتمالی</strong><p>{finding.root_cause||"دلیل اختصاصی ثبت نشده است."}</p></div><div><strong>اثر و ریسک</strong><p>{finding.impact||"اثر اختصاصی ثبت نشده است."}</p></div></div>
                {(finding.expected_value||finding.actual_value)&&<div className="qa-value-grid"><div><span>مقدار مورد انتظار</span><pre>{finding.expected_value||"—"}</pre></div><div><span>مقدار فعلی</span><pre>{finding.actual_value||"—"}</pre></div></div>}
                {finding.remediation&&<div className="qa-remediation"><strong>راهکار پیشنهادی رفع</strong><p>{finding.remediation}</p></div>}
                {finding.evidence!=null&&<details className="qa-details-json"><summary>شواهد فنی</summary><pre>{JSON.stringify(finding.evidence,null,2)}</pre></details>}
                {finding.resolution_note&&<div className="qa-finding-resolution"><strong>یادداشت مدیریت</strong><p>{finding.resolution_note}</p><small>{finding.resolved_by_name||"—"} · {finding.resolved_at?formatDate(finding.resolved_at):"—"}</small></div>}
                <div className="qa-finding-actions"><button className="qa-link-button" onClick={()=>router.push(`/super-admin/test-center/runs/${finding.last_run_id}`)}>مشاهده Run</button>{permissions.can_manage&&finding.status==="open"&&<><button disabled={workingId===finding.id} className="qa-primary-button" onClick={()=>updateFinding(finding,"resolve")}>حل شد</button><button disabled={workingId===finding.id} className="qa-secondary-button" onClick={()=>updateFinding(finding,"ignore")}>نادیده گرفتن</button></>}{permissions.can_manage&&finding.status!=="open"&&<button disabled={workingId===finding.id} className="qa-secondary-button" onClick={()=>updateFinding(finding,"reopen")}>بازگشایی</button>}</div>
            </article>)}
            {loading&&<div className="qa-empty-table">در حال دریافت ایرادات…</div>}
            {!loading&&findings.length===0&&<div className="qa-empty-table">موردی با فیلتر فعلی پیدا نشد.</div>}
        </section>
        <div className="qa-pagination"><button disabled={pagination.page<=1||loading} onClick={()=>load(pagination.page-1)}>صفحه قبل</button><span>صفحه {pagination.page} از {Math.max(1,pagination.pages)}</span><button disabled={pagination.page>=pagination.pages||loading} onClick={()=>load(pagination.page+1)}>صفحه بعد</button></div>
    </main></AppShell>
}

function formatNumber(value:number){return new Intl.NumberFormat("fa-IR").format(value)}
function formatDate(value:string){try{return new Intl.DateTimeFormat("fa-IR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value.replace(" ","T")))}catch{return value}}

function confidenceLabel(value:NonNullable<Finding["confidence"]>){return ({low:"کم",medium:"متوسط",high:"زیاد",confirmed:"قطعی"} as const)[value]}
function modeLabel(value:NonNullable<Finding["verification_mode"]>){return ({static:"اسکن کد",runtime:"اجرای واقعی",database:"دیتابیس",configuration:"تنظیمات",hybrid:"ترکیبی"} as const)[value]}
