<?php

declare(strict_types=1);

require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/totp.php';
require_once __DIR__ . '/auth-session.php';
require_once __DIR__ . '/routing.php';
require_once __DIR__ . '/qa-test-runner.php';

if (!function_exists('qa_browser_frontend_url')) {
    function qa_browser_frontend_url(): string
    {
        return rtrim((string) app_env('QA_BROWSER_FRONTEND_URL', 'http://localhost:3000'), '/');
    }
}

if (!function_exists('qa_browser_api_url')) {
    function qa_browser_api_url(): string
    {
        return rtrim((string) app_env('QA_BROWSER_API_URL', 'http://localhost/ai-chat-saas/backend/api'), '/');
    }
}

if (!function_exists('qa_browser_widget_script_url')) {
    function qa_browser_widget_script_url(): string
    {
        return (string) app_env(
            'QA_BROWSER_WIDGET_SCRIPT_URL',
            (string) app_config('widget_script_url', 'http://localhost/ai-chat-saas/widget/dist/widget.js')
        );
    }
}

if (!function_exists('qa_browser_artifact_root')) {
    function qa_browser_artifact_root(): string
    {
        $configured = trim((string) app_env('QA_BROWSER_ARTIFACT_DIR', ''));
        $path = $configured !== '' ? $configured : APP_ROOT . '/uploads/qa-artifacts';
        return rtrim(str_replace('\\', '/', $path), '/');
    }
}

if (!function_exists('qa_browser_runner_root')) {
    function qa_browser_runner_root(): string
    {
        $configured = trim((string) app_env('QA_BROWSER_RUNNER_DIR', ''));
        $path = $configured !== '' ? $configured : dirname(APP_ROOT) . '/qa-browser-runner';
        return rtrim(str_replace('\\', '/', $path), '/');
    }
}

if (!function_exists('qa_browser_origin')) {
    function qa_browser_origin(string $url): string
    {
        $parts = parse_url($url);
        if (!$parts || empty($parts['scheme']) || empty($parts['host'])) {
            return 'http://localhost:3000';
        }
        $origin = $parts['scheme'] . '://' . $parts['host'];
        if (isset($parts['port'])) {
            $origin .= ':' . (int) $parts['port'];
        }
        return $origin;
    }
}

if (!function_exists('qa_browser_create_worker_token')) {
    function qa_browser_create_worker_token(PDO $pdo, int $runId): string
    {
        $token = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:s', time() + max(600, (int) app_env('QA_BROWSER_TOKEN_TTL_SECONDS', 3600)));
        $stmt = $pdo->prepare("UPDATE qa_test_runs SET worker_token_hash=:hash,worker_token_encrypted=:encrypted,worker_token_expires_at=:expires WHERE id=:id");
        $stmt->execute([
            ':hash' => hash('sha256', $token),
            ':encrypted' => security_encrypt_secret($token),
            ':expires' => $expiresAt,
            ':id' => $runId,
        ]);
        return $token;
    }
}

if (!function_exists('qa_browser_worker_token_for_run')) {
    function qa_browser_worker_token_for_run(PDO $pdo, int $runId): string
    {
        $stmt = $pdo->prepare('SELECT worker_token_encrypted,worker_token_expires_at FROM qa_test_runs WHERE id=:id AND profile=\'browser\' LIMIT 1');
        $stmt->execute([':id' => $runId]);
        $row = $stmt->fetch();
        if (!$row || !$row['worker_token_encrypted']) {
            throw new RuntimeException('توکن Worker برای این اجرا موجود نیست.');
        }
        if ($row['worker_token_expires_at'] && strtotime((string) $row['worker_token_expires_at']) <= time()) {
            throw new RuntimeException('توکن Worker منقضی شده است.');
        }
        return security_decrypt_secret((string) $row['worker_token_encrypted']);
    }
}

if (!function_exists('qa_browser_validate_worker')) {
    function qa_browser_validate_worker(PDO $pdo, int $runId, string $token): array
    {
        if ($runId < 1 || strlen($token) < 32) {
            throw new RuntimeException('اعتبارنامه Worker نامعتبر است.');
        }
        $stmt = $pdo->prepare('SELECT * FROM qa_test_runs WHERE id=:id AND profile=\'browser\' LIMIT 1');
        $stmt->execute([':id' => $runId]);
        $run = $stmt->fetch();
        if (!$run) {
            throw new RuntimeException('اجرای مرورگری پیدا نشد.');
        }
        if (!$run['worker_token_hash'] || !hash_equals((string) $run['worker_token_hash'], hash('sha256', $token))) {
            throw new RuntimeException('توکن Worker معتبر نیست.');
        }
        if ($run['worker_token_expires_at'] && strtotime((string) $run['worker_token_expires_at']) <= time()) {
            throw new RuntimeException('توکن Worker منقضی شده است.');
        }
        return $run;
    }
}

if (!function_exists('qa_browser_prepare_fixture')) {
    function qa_browser_prepare_fixture(PDO $pdo, array $run): array
    {
        $runId = (int) $run['id'];
        $existing = $pdo->prepare('SELECT * FROM qa_browser_fixtures WHERE run_id=:run_id LIMIT 1');
        $existing->execute([':run_id' => $runId]);
        $fixture = $existing->fetch();
        if ($fixture && $fixture['status'] === 'ready') {
            return qa_browser_fixture_context($pdo, $run, $fixture);
        }

        $plan = $pdo->query("SELECT id,price_monthly FROM plans WHERE is_active=1 ORDER BY id ASC LIMIT 1")->fetch();
        if (!$plan) {
            throw new RuntimeException('برای ساخت محیط مصنوعی، حداقل یک پلن فعال لازم است.');
        }

        $suffix = substr($run['run_key'], 0, 12);
        $tenantName = 'System QA Browser ' . $suffix;
        $email = 'qa-browser-' . $suffix . '@example.invalid';
        $frontendOrigin = qa_browser_origin(qa_browser_frontend_url());
        $siteKey = bin2hex(random_bytes(24));
        $passwordHash = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);

        $pdo->beginTransaction();
        try {
            $pdo->prepare("INSERT INTO qa_browser_fixtures(run_id,status) VALUES(:run_id,'creating') ON DUPLICATE KEY UPDATE status='creating',cleanup_error=NULL")
                ->execute([':run_id' => $runId]);

            $tenantStmt = $pdo->prepare("INSERT INTO tenants(name,owner_name,owner_email,plan_id,status) VALUES(:name,'System QA',:email,:plan,'active')");
            $tenantStmt->execute([':name' => $tenantName, ':email' => $email, ':plan' => (int) $plan['id']]);
            $tenantId = (int) $pdo->lastInsertId();

            $siteStmt = $pdo->prepare("INSERT INTO sites(tenant_id,name,domain,site_key,brand_name,brand_color,welcome_message,ai_mode,is_active) VALUES(:tenant,:name,:domain,:site_key,:brand,'#2563eb','سلام، این گفتگوی آزمایشی مرکز تست است.','assistant',1)");
            $siteStmt->execute([
                ':tenant' => $tenantId,
                ':name' => 'QA Browser Site',
                ':domain' => $frontendOrigin . '/qa-' . $suffix,
                ':site_key' => $siteKey,
                ':brand' => 'QA Browser',
            ]);
            $siteId = (int) $pdo->lastInsertId();

            $userStmt = $pdo->prepare("INSERT INTO users(tenant_id,name,email,password_hash,role,is_active,availability_status) VALUES(:tenant,'QA Customer Admin',:email,:password,'customer_admin',1,'online')");
            $userStmt->execute([':tenant' => $tenantId, ':email' => $email, ':password' => $passwordHash]);
            $customerUserId = (int) $pdo->lastInsertId();

            if (qa_table_exists($pdo, 'tenant_subscriptions')) {
                $pdo->prepare("INSERT INTO tenant_subscriptions(tenant_id,plan_id,status,billing_cycle,starts_at,ends_at,auto_renew,price,currency,created_by) VALUES(:tenant,:plan,'active','manual',NOW(),DATE_ADD(NOW(),INTERVAL 1 DAY),0,:price,'IRR',:creator)")
                    ->execute([
                        ':tenant' => $tenantId,
                        ':plan' => (int) $plan['id'],
                        ':price' => (float) $plan['price_monthly'],
                        ':creator' => (int) $run['triggered_by'],
                    ]);
            }

            if (qa_table_exists($pdo, 'agent_site_access')) {
                $pdo->prepare('INSERT INTO agent_site_access(user_id,site_id) VALUES(:user,:site)')
                    ->execute([':user' => $customerUserId, ':site' => $siteId]);
            }

            $departmentId = routing_ensure_default_department($pdo, $tenantId, $siteId, $customerUserId);

            $pdo->prepare("UPDATE qa_browser_fixtures SET tenant_id=:tenant,site_id=:site,customer_user_id=:user,department_id=:department,status='ready' WHERE run_id=:run_id")
                ->execute([
                    ':tenant' => $tenantId,
                    ':site' => $siteId,
                    ':user' => $customerUserId,
                    ':department' => $departmentId,
                    ':run_id' => $runId,
                ]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        $existing->execute([':run_id' => $runId]);
        $fixture = $existing->fetch();
        if (!$fixture) {
            throw new RuntimeException('محیط مصنوعی مرورگر ساخته نشد.');
        }
        return qa_browser_fixture_context($pdo, $run, $fixture);
    }
}

if (!function_exists('qa_browser_fixture_context')) {
    function qa_browser_fixture_context(PDO $pdo, array $run, array $fixture): array
    {
        $adminStmt = $pdo->prepare('SELECT * FROM users WHERE id=:id AND role=\'super_admin\' AND is_active=1 LIMIT 1');
        $adminStmt->execute([':id' => (int) $run['triggered_by']]);
        $admin = $adminStmt->fetch();
        if (!$admin) {
            throw new RuntimeException('مدیر اجراکننده فعال نیست.');
        }

        $customerStmt = $pdo->prepare('SELECT * FROM users WHERE id=:id AND is_active=1 LIMIT 1');
        $customerStmt->execute([':id' => (int) $fixture['customer_user_id']]);
        $customer = $customerStmt->fetch();
        if (!$customer) {
            throw new RuntimeException('کاربر مصنوعی مشتری پیدا نشد.');
        }

        $siteStmt = $pdo->prepare('SELECT id,tenant_id,name,domain,site_key FROM sites WHERE id=:id LIMIT 1');
        $siteStmt->execute([':id' => (int) $fixture['site_id']]);
        $site = $siteStmt->fetch();
        if (!$site) {
            throw new RuntimeException('سایت مصنوعی پیدا نشد.');
        }

        $sessionContext = ['expires_at' => date('Y-m-d H:i:s', time() + 1800)];
        $adminSession = auth_issue_session($pdo, $admin, $sessionContext);
        $customerSession = auth_issue_session($pdo, $customer, $sessionContext);
        $pdo->prepare('UPDATE qa_browser_fixtures SET admin_session_id=:admin_session,customer_session_id=:customer_session WHERE run_id=:run_id')
            ->execute([':admin_session'=>(int)$adminSession['session_id'],':customer_session'=>(int)$customerSession['session_id'],':run_id'=>(int)$run['id']]);

        return [
            'run_id' => (int) $run['id'],
            'run_key' => $run['run_key'],
            'frontend_url' => qa_browser_frontend_url(),
            'api_url' => qa_browser_api_url(),
            'widget_script_url' => qa_browser_widget_script_url(),
            'widget_host_url' => qa_browser_frontend_url() . '/qa-widget-host',
            'headless' => filter_var((string) app_env('QA_BROWSER_HEADLESS', 'true'), FILTER_VALIDATE_BOOL),
            'timeout_ms' => max(5000, (int) app_env('QA_BROWSER_TIMEOUT_MS', 20000)),
            'admin' => ['token' => $adminSession['token'], 'user' => $adminSession['user']],
            'customer' => ['token' => $customerSession['token'], 'user' => $customerSession['user']],
            'site' => $site,
            'artifact_dir' => qa_browser_artifact_root() . '/' . $run['run_key'],
        ];
    }
}

if (!function_exists('qa_browser_cleanup_fixture')) {
    function qa_browser_cleanup_fixture(PDO $pdo, int $runId): array
    {
        $stmt = $pdo->prepare('SELECT * FROM qa_browser_fixtures WHERE run_id=:run_id LIMIT 1');
        $stmt->execute([':run_id' => $runId]);
        $fixture = $stmt->fetch();
        if (!$fixture) {
            return ['cleaned' => true, 'message' => 'محیط مصنوعی وجود نداشت.'];
        }

        $pdo->prepare("UPDATE qa_browser_fixtures SET status='cleanup_pending' WHERE id=:id")
            ->execute([':id' => (int) $fixture['id']]);
        try {
            foreach (['admin_session_id','customer_session_id'] as $sessionColumn) {
                if (!empty($fixture[$sessionColumn])) {
                    $pdo->prepare("UPDATE auth_sessions SET revoked_at=NOW(),revocation_reason='QA browser run finished' WHERE id=:id AND revoked_at IS NULL")
                        ->execute([':id'=>(int)$fixture[$sessionColumn]]);
                }
            }
            if (!empty($fixture['tenant_id'])) {
                $delete = $pdo->prepare('DELETE FROM tenants WHERE id=:id');
                $delete->execute([':id' => (int) $fixture['tenant_id']]);
            }
            $pdo->prepare("UPDATE qa_browser_fixtures SET status='cleaned',cleaned_at=NOW(),cleanup_error=NULL WHERE id=:id")
                ->execute([':id' => (int) $fixture['id']]);
            return ['cleaned' => true, 'message' => 'داده مصنوعی پاک شد.'];
        } catch (Throwable $e) {
            $pdo->prepare("UPDATE qa_browser_fixtures SET status='cleanup_failed',cleanup_error=:error WHERE id=:id")
                ->execute([':error' => $e->getMessage(), ':id' => (int) $fixture['id']]);
            return ['cleaned' => false, 'message' => $e->getMessage()];
        }
    }
}

if (!function_exists('qa_browser_spawn_worker')) {
    function qa_browser_spawn_worker(int $runId): array
    {
        if (!filter_var((string) app_env('QA_BROWSER_AUTO_START', 'true'), FILTER_VALIDATE_BOOL)) {
            return ['started' => false, 'message' => 'اجرای خودکار Worker غیرفعال است.'];
        }
        if (!function_exists('popen')) {
            return ['started' => false, 'message' => 'تابع popen در PHP غیرفعال است.'];
        }
        $php = (string) app_env('QA_BROWSER_PHP_BINARY', PHP_BINARY);
        $worker = APP_ROOT . '/cli/qa-browser-worker.php';
        if (!is_file($worker)) {
            return ['started' => false, 'message' => 'فایل Worker مرورگر پیدا نشد.'];
        }
        $runner = qa_browser_runner_root() . '/run.mjs';
        if (!is_file($runner)) {
            return [
                'started' => false,
                'message' => 'بسته qa-browser-runner یا فایل run.mjs در ریشه پروژه موجود نیست.',
            ];
        }
        $base = escapeshellarg($php) . ' ' . escapeshellarg($worker) . ' ' . $runId;
        if (PHP_OS_FAMILY === 'Windows') {
            $command = 'start /B "" ' . $base . ' > NUL 2>&1';
        } else {
            $command = $base . ' > /dev/null 2>&1 &';
        }
        $handle = @popen($command, 'r');
        if ($handle === false) {
            return ['started' => false, 'message' => 'شروع پردازش پس‌زمینه ناموفق بود.'];
        }
        @pclose($handle);
        return ['started' => true, 'message' => 'Worker مرورگر آغاز شد.'];
    }
}

if (!function_exists('qa_browser_finalize_run')) {
    function qa_browser_finalize_run(PDO $pdo, int $runId, string $status = 'completed', ?string $error = null): array
    {
        $countsStmt = $pdo->prepare("SELECT COUNT(*) total_count,SUM(status='passed') passed_count,SUM(status='warning') warning_count,SUM(status IN ('failed','error')) failed_count,SUM(status='skipped') skipped_count FROM qa_test_run_items WHERE run_id=:id");
        $countsStmt->execute([':id' => $runId]);
        $counts = $countsStmt->fetch() ?: [];
        $evaluated = max(1, (int) ($counts['passed_count'] ?? 0) + (int) ($counts['warning_count'] ?? 0) + (int) ($counts['failed_count'] ?? 0));
        $score = round((((int) ($counts['passed_count'] ?? 0) + ((int) ($counts['warning_count'] ?? 0) * 0.5)) / $evaluated) * 100, 2);
        $runStmt = $pdo->prepare('SELECT started_at FROM qa_test_runs WHERE id=:id');
        $runStmt->execute([':id' => $runId]);
        $startedAt = $runStmt->fetchColumn();
        $duration = $startedAt ? max(0, (int) round((time() - strtotime((string) $startedAt)) * 1000)) : null;
        $stmt = $pdo->prepare("UPDATE qa_test_runs SET status=:status,total_count=:total,passed_count=:passed,warning_count=:warning,failed_count=:failed,skipped_count=:skipped,score_percent=:score,duration_ms=:duration,progress_percent=100,current_case_key=NULL,heartbeat_at=NOW(),finished_at=NOW(),error_message=:error,worker_token_hash=NULL,worker_token_encrypted=NULL,worker_token_expires_at=NULL WHERE id=:id");
        $stmt->execute([
            ':status' => $status,
            ':total' => (int) ($counts['total_count'] ?? 0),
            ':passed' => (int) ($counts['passed_count'] ?? 0),
            ':warning' => (int) ($counts['warning_count'] ?? 0),
            ':failed' => (int) ($counts['failed_count'] ?? 0),
            ':skipped' => (int) ($counts['skipped_count'] ?? 0),
            ':score' => $score,
            ':duration' => $duration,
            ':error' => $error,
            ':id' => $runId,
        ]);
        qa_sync_findings_for_run($pdo, $runId);
        $result = $pdo->prepare('SELECT * FROM qa_test_runs WHERE id=:id');
        $result->execute([':id' => $runId]);
        return $result->fetch() ?: [];
    }
}
