<?php

// مسیر فایل: backend/api/super-admin/operations-health.php
// هدف: مرکز داده سلامت سیستم برای Super Admin

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/system-settings.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);

function operations_directory_size(string $path, int $maxFiles = 100000): array
{
    if (!is_dir($path)) {
        return ['bytes' => 0, 'files' => 0, 'truncated' => false, 'exists' => false];
    }

    $bytes = 0;
    $files = 0;
    $truncated = false;

    try {
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS)
        );

        foreach ($iterator as $file) {
            if (!$file->isFile() || $file->isLink()) {
                continue;
            }

            $bytes += max(0, (int) $file->getSize());
            $files++;

            if ($files >= $maxFiles) {
                $truncated = true;
                break;
            }
        }
    } catch (Throwable) {
        // نبود دسترسی به یک فایل نباید کل Health Check را متوقف کند.
    }

    return ['bytes' => $bytes, 'files' => $files, 'truncated' => $truncated, 'exists' => true];
}

function operations_probe_url(?string $url): array
{
    if (!app_env('OPERATIONS_HTTP_PROBES_ENABLED', false)) {
        return [
            'status' => 'unknown',
            'latency_ms' => null,
            'status_code' => null,
            'message' => 'بررسی HTTP از طریق تنظیمات غیرفعال است.',
        ];
    }

    $url = trim((string) $url);
    $parts = parse_url($url);

    if ($url === '' || !is_array($parts) || !in_array($parts['scheme'] ?? '', ['http', 'https'], true)) {
        return [
            'status' => 'unknown',
            'latency_ms' => null,
            'status_code' => null,
            'message' => 'آدرس Health Check معتبر تنظیم نشده است.',
        ];
    }

    if (!function_exists('curl_init')) {
        return [
            'status' => 'unknown',
            'latency_ms' => null,
            'status_code' => null,
            'message' => 'افزونه cURL روی PHP فعال نیست.',
        ];
    }

    $startedAt = microtime(true);
    $handle = curl_init($url);
    curl_setopt_array($handle, [
        CURLOPT_NOBODY => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT_MS => 1200,
        CURLOPT_TIMEOUT_MS => 2200,
        CURLOPT_USERAGENT => 'AI-Chat-SaaS-Health/1.0',
    ]);
    curl_exec($handle);
    $error = curl_error($handle);
    $statusCode = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);

    $latency = round((microtime(true) - $startedAt) * 1000, 1);
    $healthy = $error === '' && $statusCode >= 200 && $statusCode < 500;

    return [
        'status' => $healthy ? 'healthy' : 'down',
        'latency_ms' => $latency,
        'status_code' => $statusCode > 0 ? $statusCode : null,
        'message' => $healthy ? 'پاسخ HTTP دریافت شد.' : ($error !== '' ? $error : 'پاسخ HTTP ناموفق بود.'),
    ];
}

function operations_seconds_since(?string $dateTime): ?int
{
    if (!$dateTime) {
        return null;
    }

    $timestamp = strtotime($dateTime);
    return $timestamp === false ? null : max(0, time() - $timestamp);
}

try {
    $warnings = [];

    $databaseStarted = microtime(true);
    $pdo->query('SELECT 1')->fetchColumn();
    $databaseLatency = round((microtime(true) - $databaseStarted) * 1000, 1);

    $projectRoot = dirname(APP_ROOT);
    $uploadsPath = APP_ROOT . '/uploads';
    $diskTotal = @disk_total_space(APP_ROOT);
    $diskFree = @disk_free_space(APP_ROOT);
    $diskUsed = is_numeric($diskTotal) && is_numeric($diskFree) ? max(0, $diskTotal - $diskFree) : null;
    $diskUsagePercent = is_numeric($diskTotal) && $diskTotal > 0 && is_numeric($diskUsed)
        ? round(($diskUsed / $diskTotal) * 100, 1)
        : null;
    $uploads = operations_directory_size($uploadsPath);

    if ($diskUsagePercent !== null && $diskUsagePercent >= 90) {
        $warnings[] = [
            'code' => 'disk_critical',
            'severity' => 'critical',
            'title' => 'فضای دیسک در محدوده بحرانی است',
            'message' => "{$diskUsagePercent} درصد فضای دیسک مصرف شده است.",
        ];
    } elseif ($diskUsagePercent !== null && $diskUsagePercent >= 80) {
        $warnings[] = [
            'code' => 'disk_warning',
            'severity' => 'warning',
            'title' => 'فضای دیسک رو به اتمام است',
            'message' => "{$diskUsagePercent} درصد فضای دیسک مصرف شده است.",
        ];
    }

    $crawlSummaryStmt = $pdo->query("
        SELECT
            SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued_runs,
            SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running_runs,
            SUM(CASE WHEN status IN ('queued','running') AND COALESCE(last_activity_at, created_at) < DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1 ELSE 0 END) AS stale_runs,
            SUM(CASE WHEN status = 'failed' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) AS failed_24h,
            SUM(CASE WHEN status = 'completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) AS completed_24h
        FROM ai_crawl_runs
    ");
    $crawlSummary = $crawlSummaryStmt->fetch() ?: [];

    $queueSummaryStmt = $pdo->query("
        SELECT
            SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued_items,
            SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_items,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_items,
            SUM(CASE WHEN status = 'processing' AND updated_at < DATE_SUB(NOW(), INTERVAL 2 MINUTE) THEN 1 ELSE 0 END) AS stuck_items
        FROM ai_crawl_queue
    ");
    $queueSummary = $queueSummaryStmt->fetch() ?: [];

    $staleRuns = (int) ($crawlSummary['stale_runs'] ?? 0);
    $failedRuns = (int) ($crawlSummary['failed_24h'] ?? 0);
    $stuckItems = (int) ($queueSummary['stuck_items'] ?? 0);

    if ($staleRuns > 0 || $stuckItems > 0) {
        $warnings[] = [
            'code' => 'crawl_stale',
            'severity' => 'critical',
            'title' => 'پردازش خزش متوقف یا کند شده است',
            'message' => sprintf('%d اجرای قدیمی و %d آیتم متوقف شناسایی شد.', $staleRuns, $stuckItems),
        ];
    }

    if ($failedRuns > 0) {
        $warnings[] = [
            'code' => 'crawl_failed',
            'severity' => 'warning',
            'title' => 'خزش ناموفق در ۲۴ ساعت اخیر',
            'message' => sprintf('%d اجرای خزش ناموفق ثبت شده است.', $failedRuns),
        ];
    }

    $errorStatsStmt = $pdo->query("
        SELECT
            SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) AS unresolved,
            SUM(CASE WHEN resolved_at IS NULL AND level = 'critical' THEN 1 ELSE 0 END) AS critical_unresolved,
            SUM(CASE WHEN last_seen_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN occurrences ELSE 0 END) AS occurrences_24h
        FROM system_error_logs
    ");
    $errorStats = $errorStatsStmt->fetch() ?: [];
    $unresolvedErrors = (int) ($errorStats['unresolved'] ?? 0);
    $criticalErrors = (int) ($errorStats['critical_unresolved'] ?? 0);

    if ($criticalErrors > 0) {
        $warnings[] = [
            'code' => 'critical_errors',
            'severity' => 'critical',
            'title' => 'خطای بحرانی حل‌نشده وجود دارد',
            'message' => sprintf('%d خطای بحرانی نیازمند بررسی است.', $criticalErrors),
        ];
    } elseif ($unresolvedErrors > 0) {
        $warnings[] = [
            'code' => 'unresolved_errors',
            'severity' => 'warning',
            'title' => 'خطاهای حل‌نشده وجود دارد',
            'message' => sprintf('%d خطا هنوز بررسی نشده است.', $unresolvedErrors),
        ];
    }

    $maintenanceEnabled = (bool) system_setting_get($pdo, 'maintenance_enabled', false);
    $maintenanceMessage = (string) system_setting_get(
        $pdo,
        'maintenance_message',
        'سامانه برای انجام عملیات نگهداری موقتاً در دسترس نیست.'
    );
    $maintenanceUntil = system_setting_get($pdo, 'maintenance_until');

    if ($maintenanceEnabled) {
        $warnings[] = [
            'code' => 'maintenance_enabled',
            'severity' => 'warning',
            'title' => 'Maintenance Mode فعال است',
            'message' => 'APIهای مشتری و ویجت در حال حاضر پاسخ نگهداری دریافت می‌کنند.',
        ];
    }

    $heartbeatsStmt = $pdo->query("
        SELECT service_key, service_label, status, message, metadata_json, last_seen_at
        FROM system_service_heartbeats
        ORDER BY service_label ASC
    ");
    $heartbeatRows = $heartbeatsStmt->fetchAll();
    $heartbeatStaleSeconds = max(60, (int) app_env('SYSTEM_HEARTBEAT_STALE_SECONDS', 180));
    $services = [];

    foreach ($heartbeatRows as $heartbeat) {
        $secondsAgo = operations_seconds_since($heartbeat['last_seen_at']);
        $status = $heartbeat['status'];
        if ($secondsAgo === null || $secondsAgo > $heartbeatStaleSeconds) {
            $status = 'down';
        }

        $services[] = [
            'key' => $heartbeat['service_key'],
            'label' => $heartbeat['service_label'],
            'status' => $status,
            'message' => $heartbeat['message'],
            'last_seen_at' => $heartbeat['last_seen_at'],
            'seconds_since_seen' => $secondsAgo,
            'metadata' => $heartbeat['metadata_json'] ? json_decode($heartbeat['metadata_json'], true) : null,
        ];
    }

    $hasScheduler = false;
    foreach ($services as $service) {
        if ($service['key'] === 'scheduler') {
            $hasScheduler = true;
            if ($service['status'] === 'down') {
                $warnings[] = [
                    'code' => 'scheduler_down',
                    'severity' => 'warning',
                    'title' => 'Heartbeat زمان‌بندی‌شده دریافت نمی‌شود',
                    'message' => 'Task Scheduler یا Cron را بررسی کنید.',
                ];
            }
            break;
        }
    }

    if (!$hasScheduler) {
        $services[] = [
            'key' => 'scheduler',
            'label' => 'Cron / Task Scheduler',
            'status' => 'unknown',
            'message' => 'هنوز Heartbeat ثبت نشده است.',
            'last_seen_at' => null,
            'seconds_since_seen' => null,
            'metadata' => null,
        ];
    }

    $activeRuns = (int) ($crawlSummary['queued_runs'] ?? 0) + (int) ($crawlSummary['running_runs'] ?? 0);
    $services[] = [
        'key' => 'crawl_engine',
        'label' => 'موتور خزش',
        'status' => $staleRuns > 0 || $stuckItems > 0 ? 'degraded' : ($activeRuns > 0 ? 'healthy' : 'idle'),
        'message' => $activeRuns > 0
            ? sprintf('%d اجرای فعال و %d آیتم در انتظار', $activeRuns, (int) ($queueSummary['queued_items'] ?? 0))
            : 'در حال حاضر اجرای فعالی وجود ندارد.',
        'last_seen_at' => null,
        'seconds_since_seen' => null,
        'metadata' => [
            'active_runs' => $activeRuns,
            'queued_items' => (int) ($queueSummary['queued_items'] ?? 0),
        ],
    ];

    $frontendProbe = operations_probe_url((string) app_env('FRONTEND_HEALTH_URL', app_config('frontend_url')));

    $recentRunsStmt = $pdo->query("
        SELECT
            r.id, r.tenant_id, r.site_id, r.status, r.current_stage,
            r.current_message, r.progress_percent, r.total_urls, r.processed_urls,
            r.failed_pages, r.error_message, r.started_at, r.finished_at,
            r.last_activity_at, r.created_at,
            t.name AS tenant_name, s.name AS site_name, s.domain AS site_domain
        FROM ai_crawl_runs r
        INNER JOIN tenants t ON t.id = r.tenant_id
        INNER JOIN sites s ON s.id = r.site_id
        ORDER BY r.id DESC
        LIMIT 25
    ");
    $recentRuns = array_map(static function (array $row): array {
        return [
            'id' => (int) $row['id'],
            'tenant_id' => (int) $row['tenant_id'],
            'site_id' => (int) $row['site_id'],
            'tenant_name' => $row['tenant_name'],
            'site_name' => $row['site_name'],
            'site_domain' => $row['site_domain'],
            'status' => $row['status'],
            'current_stage' => $row['current_stage'],
            'current_message' => $row['current_message'],
            'progress_percent' => (int) $row['progress_percent'],
            'total_urls' => (int) $row['total_urls'],
            'processed_urls' => (int) $row['processed_urls'],
            'failed_pages' => (int) $row['failed_pages'],
            'error_message' => $row['error_message'],
            'started_at' => $row['started_at'],
            'finished_at' => $row['finished_at'],
            'last_activity_at' => $row['last_activity_at'],
            'created_at' => $row['created_at'],
            'is_stale' => in_array($row['status'], ['queued', 'running'], true)
                && operations_seconds_since($row['last_activity_at'] ?: $row['created_at']) > 300,
            'can_retry' => in_array($row['status'], ['failed', 'cancelled'], true),
        ];
    }, $recentRunsStmt->fetchAll());

    $errorsStmt = $pdo->query("
        SELECT
            id, fingerprint, level, source, message, exception_class,
            file_path, line_number, request_method, request_uri, status_code,
            occurrences, first_seen_at, last_seen_at, resolved_at
        FROM system_error_logs
        ORDER BY (resolved_at IS NULL) DESC, last_seen_at DESC
        LIMIT 30
    ");
    $errors = array_map(static function (array $row): array {
        $row['id'] = (int) $row['id'];
        $row['line_number'] = $row['line_number'] !== null ? (int) $row['line_number'] : null;
        $row['status_code'] = $row['status_code'] !== null ? (int) $row['status_code'] : null;
        $row['occurrences'] = (int) $row['occurrences'];
        return $row;
    }, $errorsStmt->fetchAll());

    $slowRequestsStmt = $pdo->query("
        SELECT id, request_method, request_uri, status_code, duration_ms,
               peak_memory_bytes, occurred_at
        FROM system_request_logs
        WHERE occurred_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY duration_ms DESC, id DESC
        LIMIT 30
    ");
    $slowRequests = array_map(static function (array $row): array {
        return [
            'id' => (int) $row['id'],
            'request_method' => $row['request_method'],
            'request_uri' => $row['request_uri'],
            'status_code' => (int) $row['status_code'],
            'duration_ms' => (float) $row['duration_ms'],
            'peak_memory_bytes' => (int) $row['peak_memory_bytes'],
            'occurred_at' => $row['occurred_at'],
        ];
    }, $slowRequestsStmt->fetchAll());

    $overallStatus = 'healthy';
    foreach ($warnings as $warning) {
        if ($warning['severity'] === 'critical') {
            $overallStatus = 'critical';
            break;
        }
        if ($overallStatus === 'healthy' && $warning['severity'] === 'warning') {
            $overallStatus = 'warning';
        }
    }

    $extensions = ['pdo_mysql', 'curl', 'mbstring', 'json', 'openssl'];
    $extensionStatus = [];
    foreach ($extensions as $extension) {
        $extensionStatus[$extension] = extension_loaded($extension);
    }

    json_response([
        'success' => true,
        'generated_at' => date('Y-m-d H:i:s'),
        'overall_status' => $overallStatus,
        'warnings' => $warnings,
        'summary' => [
            'unresolved_errors' => $unresolvedErrors,
            'critical_errors' => $criticalErrors,
            'error_occurrences_24h' => (int) ($errorStats['occurrences_24h'] ?? 0),
            'failed_jobs_24h' => $failedRuns,
            'stale_jobs' => $staleRuns,
            'slow_requests' => count($slowRequests),
            'disk_usage_percent' => $diskUsagePercent,
        ],
        'components' => [
            'backend' => [
                'status' => 'healthy',
                'message' => 'API مرکز عملیات پاسخ‌گو است.',
                'latency_ms' => round((microtime(true) - APP_REQUEST_STARTED_AT) * 1000, 1),
            ],
            'database' => [
                'status' => 'healthy',
                'message' => 'اتصال PDO برقرار است.',
                'latency_ms' => $databaseLatency,
                'driver' => $pdo->getAttribute(PDO::ATTR_DRIVER_NAME),
                'server_version' => $pdo->getAttribute(PDO::ATTR_SERVER_VERSION),
            ],
            'frontend' => $frontendProbe,
        ],
        'storage' => [
            'project_root' => $projectRoot,
            'uploads_path' => $uploadsPath,
            'disk_total_bytes' => is_numeric($diskTotal) ? (int) $diskTotal : null,
            'disk_free_bytes' => is_numeric($diskFree) ? (int) $diskFree : null,
            'disk_used_bytes' => is_numeric($diskUsed) ? (int) $diskUsed : null,
            'disk_usage_percent' => $diskUsagePercent,
            'uploads_bytes' => $uploads['bytes'],
            'uploads_files' => $uploads['files'],
            'uploads_scan_truncated' => $uploads['truncated'],
            'uploads_exists' => $uploads['exists'],
            'uploads_writable' => is_dir($uploadsPath) && is_writable($uploadsPath),
        ],
        'runtime' => [
            'php_version' => PHP_VERSION,
            'sapi' => PHP_SAPI,
            'app_env' => app_config('env'),
            'debug_enabled' => app_debug_enabled(),
            'timezone' => date_default_timezone_get(),
            'server_time' => date(DATE_ATOM),
            'memory_limit' => ini_get('memory_limit'),
            'max_execution_time' => (int) ini_get('max_execution_time'),
            'extensions' => $extensionStatus,
        ],
        'maintenance' => [
            'enabled' => $maintenanceEnabled,
            'message' => $maintenanceMessage,
            'until' => $maintenanceUntil ?: null,
        ],
        'services' => $services,
        'crawl' => [
            'queued_runs' => (int) ($crawlSummary['queued_runs'] ?? 0),
            'running_runs' => (int) ($crawlSummary['running_runs'] ?? 0),
            'stale_runs' => $staleRuns,
            'failed_24h' => $failedRuns,
            'completed_24h' => (int) ($crawlSummary['completed_24h'] ?? 0),
            'queued_items' => (int) ($queueSummary['queued_items'] ?? 0),
            'processing_items' => (int) ($queueSummary['processing_items'] ?? 0),
            'failed_items' => (int) ($queueSummary['failed_items'] ?? 0),
            'stuck_items' => $stuckItems,
        ],
        'recent_jobs' => $recentRuns,
        'errors' => $errors,
        'slow_requests' => $slowRequests,
    ]);
} catch (Throwable $e) {
    app_log_error($e, [
        'component' => 'operations_health',
        'status_code' => 500,
    ]);

    json_response([
        'success' => false,
        'message' => 'دریافت وضعیت سلامت سیستم ناموفق بود.',
        'error' => app_is_production() ? null : $e->getMessage(),
    ], 500);
}
