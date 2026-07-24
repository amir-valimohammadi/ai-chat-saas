<?php

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/qa-test-runner.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_response(['success'=>false,'message'=>'Method not allowed'],405);
$user=require_auth($pdo); require_role($user,['super_admin']);

try {
    $summary=$pdo->query("SELECT COUNT(*) total_runs, SUM(CASE WHEN created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR) THEN 1 ELSE 0 END) runs_24h, SUM(CASE WHEN status='completed' AND failed_count=0 THEN 1 ELSE 0 END) healthy_runs, SUM(CASE WHEN status='completed' AND failed_count>0 THEN 1 ELSE 0 END) unhealthy_runs, MAX(created_at) last_run_at FROM qa_test_runs")->fetch() ?: [];
    $latest=$pdo->query("SELECT id,run_key,profile,target_type,target_id,target_label,status,total_count,passed_count,warning_count,failed_count,skipped_count,score_percent,duration_ms,triggered_by_name,started_at,finished_at,created_at FROM qa_test_runs ORDER BY id DESC LIMIT 10")->fetchAll();
    $lastCompleted=$pdo->query("SELECT id,score_percent,passed_count,warning_count,failed_count,finished_at FROM qa_test_runs WHERE status='completed' ORDER BY id DESC LIMIT 1")->fetch() ?: null;
    $categoryRows=$pdo->query("SELECT category, SUM(CASE WHEN status IN ('failed','error') THEN 1 ELSE 0 END) failed, SUM(CASE WHEN status='warning' THEN 1 ELSE 0 END) warnings, SUM(CASE WHEN status='passed' THEN 1 ELSE 0 END) passed FROM qa_test_run_items WHERE run_id=(SELECT id FROM qa_test_runs WHERE status='completed' ORDER BY id DESC LIMIT 1) GROUP BY category ORDER BY category")->fetchAll();
    $tenants=$pdo->query("SELECT id,name,status FROM tenants ORDER BY name ASC LIMIT 500")->fetchAll();
    $sites=$pdo->query("SELECT s.id,s.tenant_id,s.name,s.domain,s.is_active,t.name tenant_name FROM sites s INNER JOIN tenants t ON t.id=s.tenant_id ORDER BY t.name,s.name LIMIT 1000")->fetchAll();
    $findingSummary=['open_total'=>0,'critical'=>0,'high'=>0,'warnings'=>0,'failed'=>0];
    $topFindings=[];
    if(qa_table_exists($pdo,'qa_findings')) {
        $findingSummary=$pdo->query("SELECT COUNT(*) open_total,SUM(severity='critical') critical,SUM(severity='high') high,SUM(test_status='warning') warnings,SUM(test_status IN ('failed','error')) failed FROM qa_findings WHERE status='open'")->fetch() ?: $findingSummary;
        $topFindings=$pdo->query("SELECT id,case_key,category,title,target_label,test_status,severity,message,root_cause,impact,remediation,occurrence_count,last_seen_at,last_run_id FROM qa_findings WHERE status='open' ORDER BY FIELD(severity,'critical','high','medium','low','info'),last_seen_at DESC LIMIT 8")->fetchAll();
    }

    json_response([
        'success'=>true,
        'summary'=>[
            'total_runs'=>(int)($summary['total_runs']??0),
            'runs_24h'=>(int)($summary['runs_24h']??0),
            'healthy_runs'=>(int)($summary['healthy_runs']??0),
            'unhealthy_runs'=>(int)($summary['unhealthy_runs']??0),
            'last_run_at'=>$summary['last_run_at']??null,
        ],
        'latest_run'=>$lastCompleted,
        'category_health'=>$categoryRows,
        'recent_runs'=>$latest,
        'catalog'=>qa_catalog_summary($pdo),
        'targets'=>['tenants'=>$tenants,'sites'=>$sites],
        'findings_summary'=>[
            'open_total'=>(int)($findingSummary['open_total']??0),
            'critical'=>(int)($findingSummary['critical']??0),
            'high'=>(int)($findingSummary['high']??0),
            'warnings'=>(int)($findingSummary['warnings']??0),
            'failed'=>(int)($findingSummary['failed']??0),
        ],
        'top_findings'=>$topFindings,
        'permissions'=>[
            'can_view'=>admin_has_permission($user,'tests.view'),
            'can_run_safe'=>admin_has_permission($user,'tests.run_safe'),
            'can_run_full'=>admin_has_permission($user,'tests.run_full'),
            'can_run_security'=>admin_has_permission($user,'tests.run_security'),
            'can_run_security_deep'=>admin_has_permission($user,'tests.run_security_deep'),
            'can_view_security_evidence'=>admin_has_permission($user,'tests.view_security_evidence'),
            'can_run_operational'=>admin_has_permission($user,'tests.run_operational'),
            'can_run_browser'=>admin_has_permission($user,'tests.run_browser'),
            'can_view_artifacts'=>admin_has_permission($user,'tests.view_artifacts'),
            'can_cancel_runs'=>admin_has_permission($user,'tests.cancel_runs'),
            'can_export_findings'=>admin_has_permission($user,'tests.export_findings'),
            'can_manage_findings'=>admin_has_permission($user,'tests.manage_findings'),
        ],
        'generated_at'=>date('Y-m-d H:i:s'),
    ]);
} catch(Throwable $e) {
    json_response(['success'=>false,'message'=>'دریافت اطلاعات مرکز تست ناموفق بود.','request_id'=>defined('APP_REQUEST_ID')?APP_REQUEST_ID:null],500);
}
