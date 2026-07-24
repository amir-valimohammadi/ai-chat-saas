"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { apiRequest, getAuthUser } from "@/lib/api";

type Run = {
    id:number; profile:"quick"|"full"|"security"|"security_deep"|"operational"|"browser"; target_label:string|null; status:string;
    passed_count:number; warning_count:number; failed_count:number; skipped_count:number;
    score_percent:number|null; duration_ms:number|null; triggered_by_name:string|null; created_at:string;
};

type Response = { success:true; runs:Run[]; pagination:{page:number;per_page:number;total:number;pages:number} };

export default function TestRunsHistoryPage(){
    const router=useRouter();
    const [runs,setRuns]=useState<Run[]>([]);
    const [pagination,setPagination]=useState({page:1,per_page:15,total:0,pages:1});
    const [status,setStatus]=useState("all");
    const [profile,setProfile]=useState("all");
    const [loading,setLoading]=useState(true);
    const [error,setError]=useState("");

    const load=useCallback(async(page=1)=>{
        try{
            setLoading(true);setError("");
            const response=await apiRequest(`/super-admin/qa-runs-list.php?page=${page}&per_page=15&status=${encodeURIComponent(status)}&profile=${encodeURIComponent(profile)}`) as Response;
            setRuns(response.runs);setPagination(response.pagination);
        }catch(err){setError(err instanceof Error?err.message:"دریافت تاریخچه تست ناموفق بود.")}
        finally{setLoading(false)}
    },[profile,status]);

    useEffect(()=>{
        const user=getAuthUser() as {role?:string}|null;
        if(!user){router.push("/login");return}
        if(user.role!=="super_admin"){router.push("/dashboard");return}
        load(1);
    },[load,router]);

    return <AppShell title="تاریخچه تست‌ها"><main className="qa-center-page">
        <header className="qa-hero"><div><span className="qa-kicker">QA RUN HISTORY</span><h1>تاریخچه اجرای تست‌های سامانه</h1><p>نتایج قبلی را فیلتر، مقایسه و برای بررسی جزئیات باز کن.</p></div><button className="qa-secondary-button" onClick={()=>router.push("/super-admin/test-center")}>مرکز تست</button></header>
        {error&&<div className="qa-alert qa-alert-error">{error}</div>}
        <section className="qa-card"><div className="qa-filter-bar qa-history-filter"><select value={profile} onChange={e=>setProfile(e.target.value)}><option value="all">همه پروفایل‌ها</option><option value="quick">تست سریع</option><option value="full">تست کامل</option><option value="operational">تست عملیاتی</option><option value="security">تست امنیتی</option><option value="security_deep">تست امنیت عمیق</option><option value="browser">تست مرورگری و ویجت</option></select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">همه وضعیت‌ها</option><option value="completed">تکمیل‌شده</option><option value="running">در حال اجرا</option><option value="failed">خطای Runner</option><option value="cancelled">لغوشده</option></select><span>{new Intl.NumberFormat("fa-IR").format(pagination.total)} اجرا</span></div></section>
        <section className="qa-card"><div className="qa-table-wrap"><table className="qa-table"><thead><tr><th>شناسه</th><th>نوع تست</th><th>هدف</th><th>خلاصه نتیجه</th><th>امتیاز</th><th>اجراکننده</th><th>زمان</th><th></th></tr></thead><tbody>
            {!loading&&runs.map(run=><tr key={run.id}><td><strong>#{run.id}</strong></td><td>{profileLabel(run.profile)}</td><td>{run.target_label||"کل سامانه"}</td><td><span className={`qa-status ${run.failed_count>0?"qa-status-failed":run.warning_count>0?"qa-status-warning":"qa-status-passed"}`}>{run.failed_count>0?"نیازمند بررسی":run.warning_count>0?"دارای هشدار":"سالم"}</span><small>{run.passed_count} موفق، {run.warning_count} هشدار، {run.failed_count} ناموفق</small></td><td><strong>{run.score_percent??"—"}{run.score_percent!=null?"%":""}</strong></td><td>{run.triggered_by_name||"—"}</td><td>{formatDate(run.created_at)}<small>{run.duration_ms!=null?`${run.duration_ms} ms`:"—"}</small></td><td><button className="qa-link-button" onClick={()=>router.push(`/super-admin/test-center/runs/${run.id}`)}>جزئیات</button></td></tr>)}
            {loading&&<tr><td colSpan={8}><div className="qa-empty-table">در حال دریافت تاریخچه…</div></td></tr>}
            {!loading&&runs.length===0&&<tr><td colSpan={8}><div className="qa-empty-table">اجرایی با این فیلتر پیدا نشد.</div></td></tr>}
        </tbody></table></div>
        <div className="qa-pagination"><button disabled={pagination.page<=1||loading} onClick={()=>load(pagination.page-1)}>صفحه قبل</button><span>صفحه {pagination.page} از {Math.max(1,pagination.pages)}</span><button disabled={pagination.page>=pagination.pages||loading} onClick={()=>load(pagination.page+1)}>صفحه بعد</button></div></section>
    </main></AppShell>
}
function profileLabel(value:Run["profile"]){return value==="quick"?"سریع":value==="full"?"کامل":value==="security_deep"?"امنیت عمیق":value==="operational"?"عملیاتی":value==="browser"?"مرورگری":"امنیتی"}
function formatDate(value:string){try{return new Intl.DateTimeFormat("fa-IR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value.replace(" ","T")))}catch{return value}}
