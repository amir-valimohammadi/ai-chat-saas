<?php

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/qa-test-runner.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success'=>false,'message'=>'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);
require_admin_permission($user, 'tests.view_security_evidence');

try {
    $summary = $pdo->query(
        "SELECT
            COUNT(*) AS total,
            SUM(status='open') AS open_total,
            SUM(status='open' AND severity='critical') AS critical,
            SUM(status='open' AND severity='high') AS high,
            SUM(status='open' AND risk_score>=7) AS high_risk,
            ROUND(AVG(CASE WHEN status='open' THEN risk_score END),1) AS average_risk,
            MAX(last_seen_at) AS last_seen_at
         FROM qa_findings
         WHERE risk_score IS NOT NULL"
    )->fetch() ?: [];

    $owasp = $pdo->query(
        "SELECT COALESCE(owasp_category,'بدون دسته') AS owasp_category,
                COUNT(*) AS total,
                SUM(status='open') AS open_total,
                ROUND(MAX(COALESCE(risk_score,0)),1) AS max_risk
         FROM qa_findings
         WHERE risk_score IS NOT NULL
         GROUP BY COALESCE(owasp_category,'بدون دسته')
         ORDER BY max_risk DESC, open_total DESC, total DESC"
    )->fetchAll();

    $top = $pdo->query(
        "SELECT id,case_key,category,title,status,test_status,severity,message,root_cause,impact,
                remediation,risk_score,confidence,owasp_category,cwe_id,affected_component,
                verification_mode,occurrence_count,last_seen_at,last_run_id,target_label
         FROM qa_findings
         WHERE status='open' AND risk_score IS NOT NULL
         ORDER BY risk_score DESC, FIELD(severity,'critical','high','medium','low','info'), last_seen_at DESC
         LIMIT 20"
    )->fetchAll();

    $runs = $pdo->query(
        "SELECT id,profile,status,total_count,passed_count,warning_count,failed_count,skipped_count,
                score_percent,duration_ms,triggered_by_name,reason,created_at,finished_at
         FROM qa_test_runs
         WHERE profile='security_deep'
         ORDER BY id DESC
         LIMIT 12"
    )->fetchAll();

    $catalog = qa_catalog_summary($pdo);

    json_response([
        'success'=>true,
        'summary'=>[
            'total'=>(int)($summary['total']??0),
            'open_total'=>(int)($summary['open_total']??0),
            'critical'=>(int)($summary['critical']??0),
            'high'=>(int)($summary['high']??0),
            'high_risk'=>(int)($summary['high_risk']??0),
            'average_risk'=>$summary['average_risk']!==null?(float)$summary['average_risk']:null,
            'last_seen_at'=>$summary['last_seen_at']??null,
            'suite_cases'=>(int)($catalog['profiles']['security_deep']??0),
        ],
        'owasp'=>$owasp,
        'top_findings'=>$top,
        'recent_runs'=>$runs,
        'permissions'=>[
            'can_run'=>admin_has_permission($user,'tests.run_security_deep'),
            'can_export'=>admin_has_permission($user,'tests.export_findings'),
            'can_manage'=>admin_has_permission($user,'tests.manage_findings'),
        ],
        'generated_at'=>date('Y-m-d H:i:s'),
    ]);
} catch (Throwable $e) {
    json_response(['success'=>false,'message'=>'دریافت نمای امنیت عمیق ناموفق بود.','request_id'=>defined('APP_REQUEST_ID')?APP_REQUEST_ID:null], 500);
}
