<?php

// مسیر فایل: backend/includes/qa-test-runner.php
// هدف: اجرای تست‌های ایمن و بدون تغییر داده برای مرکز تست Super Admin

declare(strict_types=1);

require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/system-settings.php';
require_once __DIR__ . '/routing.php';
require_once __DIR__ . '/qa-security-suite.php';

if (!function_exists('qa_table_exists')) {
    function qa_table_exists(PDO $pdo, string $table): bool
    {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=:table');
        $stmt->execute([':table' => $table]);
        return (int) $stmt->fetchColumn() > 0;
    }
}

if (!function_exists('qa_column_exists')) {
    function qa_column_exists(PDO $pdo, string $table, string $column): bool
    {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=:table AND column_name=:column');
        $stmt->execute([':table' => $table, ':column' => $column]);
        return (int) $stmt->fetchColumn() > 0;
    }
}

if (!function_exists('qa_index_exists')) {
    function qa_index_exists(PDO $pdo, string $table, string $index): bool
    {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=:table AND index_name=:index');
        $stmt->execute([':table' => $table, ':index' => $index]);
        return (int) $stmt->fetchColumn() > 0;
    }
}

if (!function_exists('qa_directory_size')) {
    function qa_directory_size(string $path, int $maxFiles = 30000): array
    {
        if (!is_dir($path)) {
            return ['exists' => false, 'writable' => false, 'bytes' => 0, 'files' => 0, 'truncated' => false];
        }

        $bytes = 0;
        $files = 0;
        $truncated = false;
        try {
            $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS));
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
            // خطای دسترسی به یک فایل نباید Runner را متوقف کند.
        }

        return [
            'exists' => true,
            'writable' => is_writable($path),
            'bytes' => $bytes,
            'files' => $files,
            'truncated' => $truncated,
        ];
    }
}

if (!function_exists('qa_result')) {
    function qa_result(
        string $status,
        string $message,
        string $severity = 'info',
        mixed $actual = null,
        mixed $expected = null,
        ?string $remediation = null,
        array $details = [],
        ?string $rootCause = null,
        ?string $impact = null,
        array $evidence = []
    ): array {
        return [
            'status' => $status,
            'severity' => $severity,
            'message' => $message,
            'actual' => $actual,
            'expected' => $expected,
            'remediation' => $remediation,
            'details' => $details,
            'root_cause' => $rootCause,
            'impact' => $impact,
            'evidence' => $evidence,
        ];
    }
}

if (!function_exists('qa_default_root_cause')) {
    function qa_default_root_cause(array $result): ?string
    {
        if (!empty($result['root_cause'])) return (string) $result['root_cause'];
        if (in_array($result['status'] ?? '', ['warning','failed','error'], true)) {
            return (string) ($result['message'] ?? 'عدم تطابق نتیجه واقعی با وضعیت مورد انتظار تست.');
        }
        return null;
    }
}

if (!function_exists('qa_default_impact')) {
    function qa_default_impact(array $result): ?string
    {
        if (!empty($result['impact'])) return (string) $result['impact'];
        return match ((string) ($result['severity'] ?? 'info')) {
            'critical' => 'احتمال توقف سرویس، نشت داده یا شکست امنیتی جدی وجود دارد و رسیدگی فوری لازم است.',
            'high' => 'ممکن است قابلیت اصلی سامانه یا امنیت کاربران مختل شود.',
            'medium' => 'بخشی از رفتار سامانه می‌تواند ناپایدار یا ناقص باشد.',
            'low' => 'ریسک محدود یا مشکل نگهداری وجود دارد که بهتر است اصلاح شود.',
            default => null,
        };
    }
}

if (!function_exists('qa_with_rollback')) {
    function qa_with_rollback(PDO $pdo, Closure $callback): mixed
    {
        if ($pdo->inTransaction()) {
            throw new RuntimeException('تست عملیاتی نمی‌تواند داخل Transaction فعال دیگری اجرا شود.');
        }
        $pdo->beginTransaction();
        try {
            return $callback();
        } finally {
            if ($pdo->inTransaction()) $pdo->rollBack();
        }
    }
}

if (!function_exists('qa_synthetic_context')) {
    function qa_synthetic_context(PDO $pdo, string $suffix): array
    {
        $email = 'qa-' . $suffix . '@example.invalid';
        $pdo->prepare("INSERT INTO tenants (name,owner_name,owner_email,status) VALUES (:name,:owner,:email,'active')")
            ->execute([':name'=>'QA Synthetic '.$suffix, ':owner'=>'QA Runner', ':email'=>$email]);
        $tenantId=(int)$pdo->lastInsertId();
        $pdo->prepare("INSERT INTO sites (tenant_id,name,domain,site_key,brand_name,ai_mode,is_active) VALUES (:tenant,:name,:domain,:site_key,:brand,'assistant',1)")
            ->execute([':tenant'=>$tenantId, ':name'=>'QA Site '.$suffix, ':domain'=>'qa-'.$suffix.'.example.invalid', ':site_key'=>bin2hex(random_bytes(24)), ':brand'=>'QA']);
        $siteId=(int)$pdo->lastInsertId();
        $passwordHash=password_hash(bin2hex(random_bytes(12)), PASSWORD_DEFAULT);
        $pdo->prepare("INSERT INTO users (tenant_id,name,email,password_hash,role,is_active,last_seen_at,availability_status) VALUES (:tenant,:name,:email,:password,'customer_admin',1,NOW(),'online')")
            ->execute([':tenant'=>$tenantId, ':name'=>'QA Admin', ':email'=>$email, ':password'=>$passwordHash]);
        $adminId=(int)$pdo->lastInsertId();
        $pdo->prepare("INSERT INTO users (tenant_id,name,email,password_hash,role,is_active,last_seen_at,availability_status) VALUES (:tenant,:name,:email,:password,'agent',1,NOW(),'online')")
            ->execute([':tenant'=>$tenantId, ':name'=>'QA Agent', ':email'=>'agent-'.$email, ':password'=>$passwordHash]);
        $agentId=(int)$pdo->lastInsertId();
        if (qa_table_exists($pdo,'agent_site_access')) {
            $pdo->prepare('INSERT INTO agent_site_access (user_id,site_id) VALUES (:user,:site)')->execute([':user'=>$adminId,':site'=>$siteId]);
            $pdo->prepare('INSERT INTO agent_site_access (user_id,site_id) VALUES (:user,:site)')->execute([':user'=>$agentId,':site'=>$siteId]);
        }
        return compact('tenantId','siteId','adminId','agentId','email');
    }
}

if (!function_exists('qa_scalar_string')) {
    function qa_scalar_string(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_scalar($value)) {
            return (string) $value;
        }
        $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return $json === false ? null : $json;
    }
}

if (!function_exists('qa_scope')) {
    function qa_scope(PDO $pdo, string $targetType, ?int $targetId): array
    {
        $scope = [
            'target_type' => $targetType,
            'target_id' => $targetId,
            'target_label' => 'کل سامانه',
            'tenant_id' => null,
            'site_id' => null,
        ];

        if ($targetType === 'tenant' && $targetId) {
            $stmt = $pdo->prepare('SELECT id,name FROM tenants WHERE id=:id LIMIT 1');
            $stmt->execute([':id' => $targetId]);
            $row = $stmt->fetch();
            if (!$row) {
                throw new RuntimeException('مشتری انتخاب‌شده وجود ندارد.');
            }
            $scope['tenant_id'] = (int) $row['id'];
            $scope['target_label'] = 'مشتری: ' . $row['name'];
        } elseif ($targetType === 'site' && $targetId) {
            $stmt = $pdo->prepare('SELECT s.id,s.tenant_id,s.name,t.name AS tenant_name FROM sites s INNER JOIN tenants t ON t.id=s.tenant_id WHERE s.id=:id LIMIT 1');
            $stmt->execute([':id' => $targetId]);
            $row = $stmt->fetch();
            if (!$row) {
                throw new RuntimeException('سایت انتخاب‌شده وجود ندارد.');
            }
            $scope['site_id'] = (int) $row['id'];
            $scope['tenant_id'] = (int) $row['tenant_id'];
            $scope['target_label'] = 'سایت: ' . $row['name'] . ' / ' . $row['tenant_name'];
        }

        return $scope;
    }
}

if (!function_exists('qa_scope_sql')) {
    function qa_scope_sql(array $scope, string $siteAlias = 's'): array
    {
        if ($scope['site_id']) {
            return ["{$siteAlias}.id = :scope_site_id", [':scope_site_id' => (int) $scope['site_id']]];
        }
        if ($scope['tenant_id']) {
            return ["{$siteAlias}.tenant_id = :scope_tenant_id", [':scope_tenant_id' => (int) $scope['tenant_id']]];
        }
        return ['1=1', []];
    }
}

if (!function_exists('qa_expected_api_files')) {
    function qa_expected_api_files(): array
    {
        return [
            'auth/login.php',
            'auth/logout-current.php',
            'auth/me.php',
            'agent/conversations-list.php',
            'agent/conversation-show.php',
            'agent/message-send.php',
            'widget/config.php',
            'widget/conversation-start.php',
            'widget/messages-list.php',
            'widget/message-send.php',
            'super-admin/operations-health.php',
            'super-admin/security-overview.php',
            'super-admin/customer-360.php',
        ];
    }
}

if (!function_exists('qa_case_catalog')) {
    function qa_case_catalog(PDO $pdo, array $scope): array
    {
        $backendRoot = APP_ROOT;
        $projectRoot = dirname(APP_ROOT);
        $widgetRoot = $projectRoot . '/widget';

        $cases = [];
        $add = static function (
            string $key,
            string $category,
            string $title,
            string $description,
            array $profiles,
            Closure $run
        ) use (&$cases): void {
            $cases[$key] = compact('key', 'category', 'title', 'description', 'profiles', 'run');
        };

        $add('runtime.php_version', 'runtime', 'نسخه PHP', 'نسخه PHP برای اجرای امن پروژه بررسی می‌شود.', ['quick','full'], static function (): array {
            $ok = version_compare(PHP_VERSION, '8.1.0', '>=');
            return $ok
                ? qa_result('passed', 'نسخه PHP پشتیبانی می‌شود.', 'info', PHP_VERSION, '>= 8.1')
                : qa_result('failed', 'نسخه PHP قدیمی است.', 'high', PHP_VERSION, '>= 8.1', 'PHP را به نسخه 8.1 یا جدیدتر ارتقا بده.');
        });

        $add('runtime.extensions', 'runtime', 'افزونه‌های ضروری PHP', 'وجود افزونه‌های موردنیاز Backend بررسی می‌شود.', ['quick','full'], static function (): array {
            $required = ['pdo_mysql','json','openssl','mbstring','fileinfo','curl'];
            $missing = array_values(array_filter($required, static fn(string $ext): bool => !extension_loaded($ext)));
            return $missing === []
                ? qa_result('passed', 'تمام افزونه‌های ضروری فعال هستند.', 'info', $required, $required)
                : qa_result('failed', 'یک یا چند افزونه ضروری PHP فعال نیست.', 'high', $missing, $required, 'افزونه‌های گزارش‌شده را در php.ini فعال و Apache را Restart کن.');
        });

        $add('runtime.production_debug', 'runtime', 'Debug در محیط Production', 'فعال‌بودن Debug در محیط Production بررسی می‌شود.', ['full','security'], static function (): array {
            $production = app_is_production();
            $debug = app_debug_enabled();
            if ($production && $debug) {
                return qa_result('failed', 'APP_DEBUG در Production فعال است.', 'high', true, false, 'APP_DEBUG=false تنظیم شود.');
            }
            if (!$production && $debug) {
                return qa_result('warning', 'Debug فعال است؛ برای محیط Local قابل قبول است.', 'low', app_env('APP_ENV', 'local'), 'production: false');
            }
            return qa_result('passed', 'تنظیم Debug با محیط سازگار است.', 'info', $debug, false);
        });

        $add('runtime.timezone', 'runtime', 'Timezone برنامه', 'Timezone معتبر و قابل استفاده بررسی می‌شود.', ['full'], static function (): array {
            $timezone = (string) app_config('timezone', '');
            $valid = in_array($timezone, timezone_identifiers_list(), true);
            return $valid
                ? qa_result('passed', 'Timezone معتبر است.', 'info', $timezone, 'IANA timezone')
                : qa_result('failed', 'Timezone تنظیم‌شده معتبر نیست.', 'medium', $timezone, 'IANA timezone', 'APP_TIMEZONE را به مقدار معتبری مثل Asia/Tehran تغییر بده.');
        });

        $add('database.connection', 'database', 'اتصال و تأخیر دیتابیس', 'اتصال PDO و زمان پاسخ یک Query ساده اندازه‌گیری می‌شود.', ['quick','full','security'], static function () use ($pdo): array {
            $started = microtime(true);
            $value = $pdo->query('SELECT 1')->fetchColumn();
            $latency = round((microtime(true) - $started) * 1000, 2);
            if ((int) $value !== 1) {
                return qa_result('failed', 'دیتابیس پاسخ معتبر نداد.', 'critical', $value, 1);
            }
            if ($latency > 500) {
                return qa_result('warning', 'اتصال دیتابیس برقرار است اما کند است.', 'medium', $latency . ' ms', '<= 500 ms');
            }
            return qa_result('passed', 'اتصال دیتابیس سالم است.', 'info', $latency . ' ms', '<= 500 ms');
        });

        $add('database.core_schema', 'database', 'جداول اصلی سامانه', 'وجود جداول اصلی و جداول فازهای نصب‌شده بررسی می‌شود.', ['quick','full'], static function () use ($pdo): array {
            $required = ['tenants','users','sites','visitors','conversations','messages','message_attachments','departments','visitor_sessions','auth_sessions','admin_roles','system_error_logs','admin_impersonations'];
            $missing = array_values(array_filter($required, static fn(string $table): bool => !qa_table_exists($pdo, $table)));
            return $missing === []
                ? qa_result('passed', 'تمام جداول اصلی موجود هستند.', 'info', count($required), count($required))
                : qa_result('failed', 'Migration یک یا چند بخش نصب نشده است.', 'critical', $missing, $required, 'Migrationهای پروژه را به‌ترتیب در phpMyAdmin اجرا کن.');
        });

        $add('database.charset', 'database', 'Charset و Collation دیتابیس', 'پشتیبانی کامل utf8mb4 برای متن فارسی بررسی می‌شود.', ['full'], static function () use ($pdo): array {
            $stmt = $pdo->query('SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=DATABASE()');
            $row = $stmt->fetch() ?: [];
            $charset = (string) ($row['DEFAULT_CHARACTER_SET_NAME'] ?? '');
            $collation = (string) ($row['DEFAULT_COLLATION_NAME'] ?? '');
            if ($charset !== 'utf8mb4') {
                return qa_result('failed', 'Charset دیتابیس utf8mb4 نیست.', 'high', [$charset,$collation], 'utf8mb4', 'Charset دیتابیس و جدول‌ها را به utf8mb4 تبدیل کن.');
            }
            return qa_result('passed', 'Charset دیتابیس برای فارسی مناسب است.', 'info', [$charset,$collation], 'utf8mb4');
        });

        $add('database.message_orphans', 'database', 'پیام‌های بدون گفتگو', 'یکپارچگی پیام و گفتگو بررسی می‌شود.', ['full','security'], static function () use ($pdo): array {
            if (!qa_table_exists($pdo, 'messages') || !qa_table_exists($pdo, 'conversations')) return qa_result('skipped', 'جدول‌های پیام‌رسان موجود نیستند.', 'medium');
            $count = (int) $pdo->query("SELECT COUNT(*) FROM messages m LEFT JOIN conversations c ON c.id=m.conversation_id WHERE c.id IS NULL")->fetchColumn();
            return $count === 0
                ? qa_result('passed', 'پیام بدون گفتگو پیدا نشد.', 'info', 0, 0)
                : qa_result('failed', 'پیام بدون گفتگوی معتبر پیدا شد.', 'high', $count, 0, 'رکوردهای Orphan را بررسی و پاک‌سازی کن.');
        });

        $add('database.conversation_integrity', 'database', 'یکپارچگی گفتگو، سایت و بازدیدکننده', 'تطابق سایت گفتگو با سایت Visitor بررسی می‌شود.', ['full','security'], static function () use ($pdo, $scope): array {
            [$where, $params] = qa_scope_sql($scope, 's');
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM conversations c INNER JOIN sites s ON s.id=c.site_id LEFT JOIN visitors v ON v.id=c.visitor_id WHERE ({$where}) AND (v.id IS NULL OR v.site_id<>c.site_id)");
            $stmt->execute($params);
            $count = (int) $stmt->fetchColumn();
            return $count === 0
                ? qa_result('passed', 'ارتباط گفتگو، سایت و Visitor سالم است.', 'info', 0, 0)
                : qa_result('failed', 'ناسازگاری Tenant/Site در گفتگوها پیدا شد.', 'critical', $count, 0, 'این مورد می‌تواند نشانه نشت داده بین سایت‌ها باشد؛ رکوردها و API ایجاد گفتگو را بررسی کن.');
        });

        $add('database.auth_session_orphans', 'database', 'نشست‌های بدون کاربر', 'نشست‌های Authentication بدون User معتبر بررسی می‌شوند.', ['full','security'], static function () use ($pdo): array {
            if (!qa_table_exists($pdo, 'auth_sessions')) return qa_result('skipped', 'جدول auth_sessions نصب نشده است.', 'medium');
            $count = (int) $pdo->query('SELECT COUNT(*) FROM auth_sessions a LEFT JOIN users u ON u.id=a.user_id WHERE u.id IS NULL')->fetchColumn();
            return $count === 0
                ? qa_result('passed', 'نشست Orphan وجود ندارد.', 'info', 0, 0)
                : qa_result('warning', 'نشست بدون کاربر پیدا شد.', 'medium', $count, 0, 'نشست‌های Orphan را پاک‌سازی کن.');
        });

        $add('storage.disk', 'storage', 'فضای آزاد دیسک', 'درصد مصرف دیسک پروژه بررسی می‌شود.', ['quick','full'], static function () use ($backendRoot): array {
            $total = @disk_total_space($backendRoot);
            $free = @disk_free_space($backendRoot);
            if (!is_numeric($total) || !is_numeric($free) || $total <= 0) return qa_result('warning', 'اطلاعات فضای دیسک قابل دریافت نیست.', 'medium');
            $percent = round((($total - $free) / $total) * 100, 1);
            if ($percent >= 95) return qa_result('failed', 'فضای دیسک در وضعیت بحرانی است.', 'critical', $percent . '%', '< 90%', 'فایل‌های Log، Upload و Backup را پاک‌سازی یا فضای دیسک را افزایش بده.');
            if ($percent >= 85) return qa_result('warning', 'فضای دیسک رو به اتمام است.', 'high', $percent . '%', '< 85%');
            return qa_result('passed', 'فضای دیسک مناسب است.', 'info', $percent . '%', '< 85%');
        });

        $add('storage.uploads', 'storage', 'پوشه Upload', 'وجود، دسترسی نوشتن و حجم پوشه Upload بررسی می‌شود.', ['quick','full'], static function () use ($backendRoot): array {
            $stats = qa_directory_size($backendRoot . '/uploads');
            if (!$stats['exists']) return qa_result('failed', 'پوشه Upload وجود ندارد.', 'high', false, true, 'پوشه backend/uploads را ایجاد کن.');
            if (!$stats['writable']) return qa_result('failed', 'پوشه Upload قابل نوشتن نیست.', 'high', false, true, 'مجوز نوشتن پوشه Upload را اصلاح کن.');
            return qa_result('passed', 'پوشه Upload سالم و قابل نوشتن است.', 'info', ['files'=>$stats['files'],'bytes'=>$stats['bytes']], 'writable');
        });

        $add('storage.executable_uploads', 'security', 'فایل اجرایی در Upload', 'وجود PHP یا فایل اجرایی خطرناک در Upload بررسی می‌شود.', ['security','full'], static function () use ($backendRoot): array {
            $path = $backendRoot . '/uploads';
            if (!is_dir($path)) return qa_result('skipped', 'پوشه Upload وجود ندارد.', 'medium');
            $dangerous = [];
            $extensions = ['php','phtml','phar','cgi','pl','py','sh','bat','cmd','exe','com'];
            try {
                $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS));
                foreach ($iterator as $file) {
                    if (!$file->isFile()) continue;
                    $ext = strtolower(pathinfo($file->getFilename(), PATHINFO_EXTENSION));
                    if (in_array($ext, $extensions, true)) {
                        $dangerous[] = str_replace('\\','/',substr($file->getPathname(), strlen($backendRoot) + 1));
                        if (count($dangerous) >= 20) break;
                    }
                }
            } catch (Throwable) {
                return qa_result('warning', 'اسکن کامل Upload به‌دلیل محدودیت دسترسی انجام نشد.', 'medium');
            }
            return $dangerous === []
                ? qa_result('passed', 'فایل اجرایی خطرناک در Upload پیدا نشد.', 'info', 0, 0)
                : qa_result('failed', 'فایل اجرایی در Upload پیدا شد.', 'critical', $dangerous, 0, 'فایل‌ها را قرنطینه و اجرای Script در مسیر Upload را در وب‌سرور مسدود کن.');
        });

        $add('security.jwt_secret', 'security', 'کلید JWT', 'طول و مقدار پیش‌فرض JWT_SECRET بررسی می‌شود.', ['quick','full','security'], static function (): array {
            $secret = (string) app_config('jwt_secret', '');
            $weak = $secret === '' || $secret === 'change_this_secret' || strlen($secret) < 32;
            return !$weak
                ? qa_result('passed', 'JWT_SECRET طول و پیچیدگی پایه مناسب دارد.', 'info', strlen($secret) . ' chars', '>= 32 chars')
                : qa_result('failed', 'JWT_SECRET ضعیف یا پیش‌فرض است.', 'critical', strlen($secret) . ' chars', '>= 32 chars', 'یک Secret تصادفی حداقل 32 بایتی در backend/.env تنظیم کن.');
        });

        $add('security.encryption_key', 'security', 'کلید رمزنگاری', 'APP_ENCRYPTION_KEY برای 2FA و داده‌های حساس بررسی می‌شود.', ['quick','full','security'], static function (): array {
            $key = (string) app_env('APP_ENCRYPTION_KEY', '');
            $jwt = (string) app_config('jwt_secret', '');
            if (strlen($key) < 32) return qa_result('failed', 'APP_ENCRYPTION_KEY تنظیم نشده یا کوتاه است.', 'critical', strlen($key) . ' chars', '>= 32 chars', 'کلید تصادفی مستقل در backend/.env قرار بده.');
            if (hash_equals($key, $jwt)) return qa_result('failed', 'کلید رمزنگاری با JWT_SECRET یکسان است.', 'high', 'same key', 'different keys', 'برای رمزنگاری و JWT دو کلید مستقل استفاده کن.');
            return qa_result('passed', 'کلید رمزنگاری مستقل و مناسب است.', 'info', strlen($key) . ' chars', '>= 32 chars');
        });

        $add('security.owner_account', 'security', 'مالک فعال پلتفرم', 'وجود حداقل یک مالک فعال و قابل ورود بررسی می‌شود.', ['quick','full','security'], static function () use ($pdo): array {
            $count = (int) $pdo->query("SELECT COUNT(*) FROM users u INNER JOIN admin_roles r ON r.id=u.admin_role_id WHERE u.role='super_admin' AND u.is_active=1 AND r.code='owner' AND r.is_active=1")->fetchColumn();
            return $count >= 1
                ? qa_result('passed', 'حداقل یک مالک فعال وجود دارد.', 'info', $count, '>= 1')
                : qa_result('failed', 'مالک فعال برای بازیابی و مدیریت سیستم وجود ندارد.', 'critical', $count, '>= 1', 'یک Super Admin فعال با نقش owner ایجاد کن.');
        });

        $add('security.admin_role_assignment', 'security', 'تخصیص نقش مدیران', 'Super Adminهای بدون نقش معتبر بررسی می‌شوند.', ['full','security'], static function () use ($pdo): array {
            $count = (int) $pdo->query("SELECT COUNT(*) FROM users u LEFT JOIN admin_roles r ON r.id=u.admin_role_id AND r.is_active=1 WHERE u.role='super_admin' AND u.is_active=1 AND r.id IS NULL")->fetchColumn();
            return $count === 0
                ? qa_result('passed', 'تمام مدیران فعال نقش معتبر دارند.', 'info', 0, 0)
                : qa_result('failed', 'مدیر فعال بدون نقش معتبر وجود دارد.', 'high', $count, 0, 'در صفحه مدیران، نقش معتبر به حساب‌ها اختصاص بده.');
        });

        $add('security.ip_allowlist_consistency', 'security', 'IP Allowlist مدیران', 'حساب‌های دارای Allowlist فعال اما بدون IP مجاز بررسی می‌شوند.', ['full','security'], static function () use ($pdo): array {
            if (!qa_table_exists($pdo, 'admin_ip_allowlist')) return qa_result('skipped', 'جدول IP Allowlist نصب نشده است.', 'medium');
            $count = (int) $pdo->query("SELECT COUNT(*) FROM users u WHERE u.role='super_admin' AND u.is_active=1 AND u.ip_allowlist_enabled=1 AND NOT EXISTS (SELECT 1 FROM admin_ip_allowlist a WHERE a.user_id=u.id AND a.is_active=1)")->fetchColumn();
            return $count === 0
                ? qa_result('passed', 'تنظیم IP Allowlist سازگار است.', 'info', 0, 0)
                : qa_result('failed', 'حساب مدیر با Allowlist فعال اما بدون IP مجاز وجود دارد.', 'high', $count, 0, 'IP فعلی یا شبکه مجاز را برای مدیر اضافه کن.');
        });

        $add('security.recent_events', 'security', 'هشدارهای امنیتی باز', 'رویدادهای امنیتی بحرانی حل‌نشده بررسی می‌شوند.', ['full','security'], static function () use ($pdo): array {
            if (!qa_table_exists($pdo, 'admin_security_events')) return qa_result('skipped', 'مرکز امنیت نصب نشده است.', 'medium');
            $critical = (int) $pdo->query("SELECT COUNT(*) FROM admin_security_events WHERE resolved_at IS NULL AND severity='critical'")->fetchColumn();
            $warning = (int) $pdo->query("SELECT COUNT(*) FROM admin_security_events WHERE resolved_at IS NULL AND severity='warning'")->fetchColumn();
            if ($critical > 0) return qa_result('failed', 'رویداد امنیتی بحرانی حل‌نشده وجود دارد.', 'critical', ['critical'=>$critical,'warning'=>$warning], 0, 'مرکز امنیت را بررسی و رویدادها را رسیدگی کن.');
            if ($warning > 0) return qa_result('warning', 'هشدار امنیتی حل‌نشده وجود دارد.', 'medium', $warning, 0);
            return qa_result('passed', 'هشدار امنیتی باز وجود ندارد.', 'info', 0, 0);
        });

        $add('security.impersonation_integrity', 'security', 'نشست‌های ورود موقت', 'نشست‌های فعال منقضی یا بدون کاربر معتبر بررسی می‌شوند.', ['full','security'], static function () use ($pdo): array {
            if (!qa_table_exists($pdo, 'admin_impersonations')) return qa_result('skipped', 'قابلیت ورود موقت نصب نشده است.', 'medium');
            $count = (int) $pdo->query("SELECT COUNT(*) FROM admin_impersonations ai LEFT JOIN users a ON a.id=ai.admin_user_id LEFT JOIN users t ON t.id=ai.target_user_id WHERE ai.status='active' AND (ai.expires_at<=NOW() OR a.id IS NULL OR a.is_active<>1 OR t.id IS NULL OR t.is_active<>1)")->fetchColumn();
            return $count === 0
                ? qa_result('passed', 'نشست ورود موقت ناسالم وجود ندارد.', 'info', 0, 0)
                : qa_result('warning', 'نشست ورود موقت منقضی یا ناسالم پیدا شد.', 'high', $count, 0, 'نشست‌ها را لغو و Cleanup دوره‌ای را اجرا کن.');
        });

        $add('security.permission_mapping', 'security', 'پوشش Permission APIهای Super Admin', 'تمام endpointهای مدیریتی باید Permission تعریف‌شده داشته باشند.', ['full','security'], static function () use ($backendRoot): array {
            $accessFile = $backendRoot . '/includes/admin-access.php';
            $dir = $backendRoot . '/api/super-admin';
            if (!is_file($accessFile) || !is_dir($dir)) return qa_result('failed', 'فایل‌های کنترل دسترسی پیدا نشد.', 'critical');
            $source = (string) file_get_contents($accessFile);
            $missing = [];
            foreach (glob($dir . '/*.php') ?: [] as $file) {
                $name = basename($file);
                if (!str_contains($source, "'{$name}'")) $missing[] = $name;
            }
            return $missing === []
                ? qa_result('passed', 'تمام APIهای Super Admin در Permission Map ثبت شده‌اند.', 'info', count(glob($dir . '/*.php') ?: []), 'all mapped')
                : qa_result('failed', 'API بدون Permission Mapping پیدا شد.', 'critical', $missing, 'all mapped', 'برای هر endpoint در admin_permission_for_script مجوز تعریف کن.');
        });

        $add('api.core_files', 'api', 'فایل‌های API حیاتی', 'وجود endpointهای کلیدی سامانه بررسی می‌شود.', ['quick','full'], static function () use ($backendRoot): array {
            $missing = [];
            foreach (qa_expected_api_files() as $relative) {
                if (!is_file($backendRoot . '/api/' . $relative)) $missing[] = $relative;
            }
            return $missing === []
                ? qa_result('passed', 'فایل‌های API حیاتی موجود هستند.', 'info', count(qa_expected_api_files()), count(qa_expected_api_files()))
                : qa_result('failed', 'یک یا چند API حیاتی وجود ندارد.', 'critical', $missing, qa_expected_api_files(), 'Patchهای پروژه را دوباره Merge کن.');
        });

        $add('widget.bundle', 'widget', 'Bundle ویجت', 'وجود و قابل‌خواندن بودن فایل اصلی Widget بررسی می‌شود.', ['quick','full'], static function () use ($widgetRoot): array {
            $path = $widgetRoot . '/dist/widget.js';
            if (!is_file($path) || !is_readable($path)) return qa_result('failed', 'فایل dist/widget.js وجود ندارد یا قابل‌خواندن نیست.', 'critical', false, true, 'Widget را Build یا پوشه dist را دوباره Deploy کن.');
            $size = filesize($path) ?: 0;
            if ($size < 1000) return qa_result('failed', 'فایل Widget به‌طور غیرعادی کوچک است.', 'high', $size . ' bytes', '> 1000 bytes');
            $source = (string) file_get_contents($path);
            if (str_contains($source, '<<<<<<<') || str_contains($source, '>>>>>>>')) return qa_result('failed', 'Merge marker در فایل Widget پیدا شد.', 'critical');
            return qa_result('passed', 'Bundle ویجت موجود و معتبر است.', 'info', $size . ' bytes', '> 1000 bytes');
        });

        $add('widget.source_dist_sync', 'widget', 'هماهنگی Source و Dist ویجت', 'یکسان‌بودن نسخه Source و Dist بررسی می‌شود.', ['full'], static function () use ($widgetRoot): array {
            $src = $widgetRoot . '/src/widget.js';
            $dist = $widgetRoot . '/dist/widget.js';
            if (!is_file($src) || !is_file($dist)) return qa_result('skipped', 'یکی از فایل‌های src یا dist وجود ندارد.', 'medium');
            $same = hash_file('sha256', $src) === hash_file('sha256', $dist);
            return $same
                ? qa_result('passed', 'Source و Dist ویجت همگام هستند.', 'info', 'same hash', 'same hash')
                : qa_result('warning', 'Source و Dist ویجت متفاوت‌اند.', 'medium', 'different hash', 'same hash', 'بعد از تغییر Source، نسخه Dist را دوباره Build/Copy کن.');
        });

        $add('widget.site_keys', 'widget', 'Site Key سایت‌های فعال', 'سایت فعال بدون کلید معتبر Widget بررسی می‌شود.', ['quick','full','security'], static function () use ($pdo, $scope): array {
            [$where, $params] = qa_scope_sql($scope, 's');
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM sites s WHERE ({$where}) AND s.is_active=1 AND (s.site_key IS NULL OR CHAR_LENGTH(TRIM(s.site_key))<24)");
            $stmt->execute($params);
            $count = (int) $stmt->fetchColumn();
            return $count === 0
                ? qa_result('passed', 'تمام سایت‌های فعال Site Key معتبر دارند.', 'info', 0, 0)
                : qa_result('failed', 'سایت فعال با Site Key ناقص پیدا شد.', 'high', $count, 0, 'Site Key امن برای سایت ایجاد کن.');
        });

        $add('widget.recent_activity', 'widget', 'فعالیت اخیر ویجت', 'آخرین رویداد Widget در محدوده انتخاب‌شده بررسی می‌شود.', ['full'], static function () use ($pdo, $scope): array {
            [$where, $params] = qa_scope_sql($scope, 's');
            $stmt = $pdo->prepare("SELECT MAX(we.created_at) FROM sites s LEFT JOIN widget_events we ON we.site_id=s.id WHERE {$where}");
            $stmt->execute($params);
            $last = $stmt->fetchColumn();
            if (!$last) return qa_result('warning', 'هیچ رویداد Widget ثبت نشده است.', 'medium', null, 'recent event');
            $ageDays = (int) floor((time() - strtotime((string) $last)) / 86400);
            if ($ageDays > 30) return qa_result('warning', 'فعالیت Widget قدیمی است.', 'medium', $last, 'within 30 days');
            return qa_result('passed', 'فعالیت اخیر Widget ثبت شده است.', 'info', $last, 'within 30 days');
        });

        $add('messaging.schema', 'messaging', 'ساختار پیام‌رسان حرفه‌ای', 'ستون‌ها و جدول‌های فازهای پیام‌رسانی بررسی می‌شوند.', ['full'], static function () use ($pdo): array {
            $checks = [
                ['messages','message_type'],['messages','reply_to_message_id'],['messages','delivered_at'],['messages','read_at'],
                ['conversations','department_id'],['conversations','priority'],['conversations','is_archived'],
            ];
            $missing = [];
            foreach ($checks as [$table,$column]) if (!qa_column_exists($pdo,$table,$column)) $missing[] = "{$table}.{$column}";
            foreach (['message_revisions','message_reactions','departments','department_members','conversation_assignment_logs','user_notification_preferences'] as $table) if (!qa_table_exists($pdo,$table)) $missing[] = $table;
            return $missing === []
                ? qa_result('passed', 'ساختار همه فازهای پیام‌رسانی نصب است.', 'info', 'complete', 'complete')
                : qa_result('failed', 'بخشی از Migrationهای پیام‌رسانی نصب نیست.', 'high', $missing, 'complete', 'Migrationهای Messaging را به‌ترتیب اجرا کن.');
        });

        $add('messaging.queue_integrity', 'messaging', 'یکپارچگی صف دپارتمان', 'گفتگوهای صف‌شده با Site و Department بررسی می‌شوند.', ['full','security'], static function () use ($pdo, $scope): array {
            if (!qa_column_exists($pdo, 'conversations', 'queue_status') || !qa_table_exists($pdo, 'departments')) return qa_result('skipped', 'صف گفتگو نصب نشده است.', 'medium');
            [$where, $params] = qa_scope_sql($scope, 's');
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM conversations c INNER JOIN sites s ON s.id=c.site_id LEFT JOIN departments d ON d.id=c.department_id WHERE ({$where}) AND c.queue_status='waiting' AND (d.id IS NULL OR d.tenant_id<>s.tenant_id OR d.site_id<>s.id OR c.queue_position IS NULL)");
            $stmt->execute($params);
            $count = (int) $stmt->fetchColumn();
            return $count === 0
                ? qa_result('passed', 'صف گفتگو ناسازگاری Tenant/Site ندارد.', 'info', 0, 0)
                : qa_result('failed', 'ناسازگاری امنیتی در صف گفتگو پیدا شد.', 'critical', $count, 0, 'صف‌ها و منطق انتقال دپارتمان را بررسی کن.');
        });

        $add('visitors.session_integrity', 'visitors', 'یکپارچگی Session بازدیدکنندگان', 'تطابق Site و Visitor در Sessionها بررسی می‌شود.', ['full','security'], static function () use ($pdo, $scope): array {
            if (!qa_table_exists($pdo, 'visitor_sessions')) return qa_result('skipped', 'ردیابی Visitor نصب نشده است.', 'medium');
            [$where, $params] = qa_scope_sql($scope, 's');
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM visitor_sessions vs INNER JOIN sites s ON s.id=vs.site_id LEFT JOIN visitors v ON v.id=vs.visitor_id WHERE ({$where}) AND (v.id IS NULL OR v.site_id<>vs.site_id)");
            $stmt->execute($params);
            $count = (int) $stmt->fetchColumn();
            return $count === 0
                ? qa_result('passed', 'Sessionهای Visitor با Site سازگارند.', 'info', 0, 0)
                : qa_result('failed', 'ناسازگاری Visitor Session و Site پیدا شد.', 'critical', $count, 0, 'API Presence و داده‌های ناسازگار را بررسی کن.');
        });

        $add('visitors.page_view_integrity', 'visitors', 'یکپارچگی Page View', 'ارتباط Page View با Session، Site و Visitor بررسی می‌شود.', ['full','security'], static function () use ($pdo, $scope): array {
            if (!qa_table_exists($pdo, 'visitor_page_views')) return qa_result('skipped', 'تاریخچه صفحات نصب نشده است.', 'medium');
            [$where, $params] = qa_scope_sql($scope, 's');
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM visitor_page_views pv INNER JOIN sites s ON s.id=pv.site_id LEFT JOIN visitor_sessions vs ON vs.id=pv.session_id LEFT JOIN visitors v ON v.id=pv.visitor_id WHERE ({$where}) AND (vs.id IS NULL OR v.id IS NULL OR vs.site_id<>pv.site_id OR v.site_id<>pv.site_id)");
            $stmt->execute($params);
            $count = (int) $stmt->fetchColumn();
            return $count === 0
                ? qa_result('passed', 'Page Viewهای Visitor سالم هستند.', 'info', 0, 0)
                : qa_result('failed', 'Page View ناسازگار یا Orphan پیدا شد.', 'high', $count, 0, 'داده‌های Orphan را پاک‌سازی و API Heartbeat را بررسی کن.');
        });

        $add('crawl.queue_health', 'crawl', 'سلامت صف Crawl', 'Jobهای متوقف، شکست‌خورده و قدیمی بررسی می‌شوند.', ['quick','full'], static function () use ($pdo, $scope): array {
            if (!qa_table_exists($pdo, 'ai_crawl_runs')) return qa_result('skipped', 'سیستم Crawl نصب نشده است.', 'medium');
            $condition = '1=1'; $params = [];
            if ($scope['site_id']) { $condition='site_id=:site_id'; $params[':site_id']=$scope['site_id']; }
            elseif ($scope['tenant_id']) { $condition='tenant_id=:tenant_id'; $params[':tenant_id']=$scope['tenant_id']; }
            $stmt = $pdo->prepare("SELECT SUM(CASE WHEN status IN ('queued','running') AND COALESCE(last_activity_at,created_at)<DATE_SUB(NOW(),INTERVAL 10 MINUTE) THEN 1 ELSE 0 END) stale, SUM(CASE WHEN status='failed' AND created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR) THEN 1 ELSE 0 END) failed FROM ai_crawl_runs WHERE {$condition}");
            $stmt->execute($params); $row=$stmt->fetch() ?: [];
            $stale=(int)($row['stale']??0); $failed=(int)($row['failed']??0);
            if ($stale>0) return qa_result('failed','Job Crawl متوقف یا قدیمی وجود دارد.','high',['stale'=>$stale,'failed_24h'=>$failed],0,'Worker و Queue را بررسی و Jobها را Retry کن.');
            if ($failed>0) return qa_result('warning','Crawl ناموفق در ۲۴ ساعت اخیر ثبت شده است.','medium',$failed,0);
            return qa_result('passed','صف Crawl سالم است.','info',['stale'=>0,'failed_24h'=>0],0);
        });

        $add('operations.error_logs', 'operations', 'خطاهای بحرانی سیستم', 'خطاهای بحرانی حل‌نشده و رخدادهای ۲۴ ساعت اخیر بررسی می‌شوند.', ['quick','full'], static function () use ($pdo): array {
            if (!qa_table_exists($pdo, 'system_error_logs')) return qa_result('skipped', 'ثبت خطاهای سیستم نصب نشده است.', 'medium');
            $row = $pdo->query("SELECT SUM(CASE WHEN resolved_at IS NULL AND level='critical' THEN 1 ELSE 0 END) critical_open, SUM(CASE WHEN last_seen_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR) THEN occurrences ELSE 0 END) occurrences_24h FROM system_error_logs")->fetch() ?: [];
            $critical=(int)($row['critical_open']??0); $occ=(int)($row['occurrences_24h']??0);
            if ($critical>0) return qa_result('failed','خطای بحرانی حل‌نشده وجود دارد.','critical',['critical'=>$critical,'occurrences_24h'=>$occ],0,'صفحه سلامت سیستم را بررسی کن.');
            if ($occ>100) return qa_result('warning','تعداد خطاهای ۲۴ ساعت اخیر زیاد است.','medium',$occ,'<= 100');
            return qa_result('passed','خطای بحرانی حل‌نشده وجود ندارد.','info',['critical'=>0,'occurrences_24h'=>$occ],0);
        });

        $add('operations.heartbeats', 'operations', 'Heartbeat سرویس‌ها', 'تازگی Heartbeatهای Cron و Worker بررسی می‌شود.', ['quick','full'], static function () use ($pdo): array {
            if (!qa_table_exists($pdo, 'system_service_heartbeats')) return qa_result('skipped', 'جدول Heartbeat نصب نشده است.', 'medium');
            $rows=$pdo->query('SELECT service_key,service_label,status,last_seen_at FROM system_service_heartbeats')->fetchAll();
            if ($rows===[]) return qa_result('warning','هیچ Heartbeat ثبت نشده است.','medium',0,'>= 1','Cron system-heartbeat.php را در Task Scheduler فعال کن.');
            $stale=[]; $threshold=max(60,(int)app_env('SYSTEM_HEARTBEAT_STALE_SECONDS',180));
            foreach($rows as $row){$age=time()-strtotime((string)$row['last_seen_at']);if($age>$threshold||$row['status']==='down')$stale[]=['service'=>$row['service_label'],'seconds'=>$age];}
            return $stale===[]
                ? qa_result('passed','Heartbeat سرویس‌ها تازه است.','info',count($rows),'fresh')
                : qa_result('warning','یک یا چند سرویس Heartbeat قدیمی دارد.','high',$stale,'fresh','Task Scheduler یا Worker مربوط را بررسی کن.');
        });

        $add('database.attachment_orphans', 'database', 'پیوست‌های بدون پیام', 'رکوردهای فایل بدون پیام معتبر بررسی می‌شوند.', ['full','security'], static function () use ($pdo): array {
            if (!qa_table_exists($pdo, 'message_attachments')) return qa_result('skipped', 'جدول پیوست‌ها وجود ندارد.', 'medium');
            $count = (int) $pdo->query("SELECT COUNT(*) FROM message_attachments a LEFT JOIN messages m ON m.id=a.message_id WHERE m.id IS NULL")->fetchColumn();
            return $count === 0
                ? qa_result('passed', 'پیوست Orphan پیدا نشد.', 'info', 0, 0)
                : qa_result('warning', 'پیوست بدون پیام معتبر پیدا شد.', 'high', $count, 0, 'رکورد و فایل‌های Orphan را پاک‌سازی کن.');
        });

        $add('database.department_integrity', 'database', 'یکپارچگی دپارتمان‌ها', 'Tenant و Site دپارتمان‌ها و اعضای آن‌ها بررسی می‌شود.', ['full','security'], static function () use ($pdo, $scope): array {
            if (!qa_table_exists($pdo, 'departments')) return qa_result('skipped', 'دپارتمان‌ها نصب نشده‌اند.', 'medium');
            [$where, $params] = qa_scope_sql($scope, 's');
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM departments d INNER JOIN sites s ON s.id=d.site_id WHERE ({$where}) AND d.tenant_id<>s.tenant_id");
            $stmt->execute($params);
            $mismatch = (int) $stmt->fetchColumn();
            $memberMismatch = 0;
            if (qa_table_exists($pdo, 'department_members')) {
                $memberStmt = $pdo->prepare("SELECT COUNT(*) FROM department_members dm INNER JOIN departments d ON d.id=dm.department_id INNER JOIN sites s ON s.id=d.site_id LEFT JOIN users u ON u.id=dm.user_id WHERE ({$where}) AND (u.id IS NULL OR u.tenant_id<>d.tenant_id OR u.role NOT IN ('customer_admin','agent'))");
                $memberStmt->execute($params);
                $memberMismatch = (int) $memberStmt->fetchColumn();
            }
            $total = $mismatch + $memberMismatch;
            return $total === 0
                ? qa_result('passed', 'ساختار دپارتمان و اعضا با Tenant سازگار است.', 'info', 0, 0)
                : qa_result('failed', 'ناسازگاری Tenant در دپارتمان‌ها یا اعضا پیدا شد.', 'critical', ['departments'=>$mismatch,'members'=>$memberMismatch], 0, 'دپارتمان‌ها و دسترسی Agentها را بررسی کن.');
        });

        $add('security.exposed_backup_files', 'security', 'فایل Backup در مسیر عمومی API', 'فایل‌های backup، old یا bak که ممکن است از وب قابل دسترسی باشند بررسی می‌شوند.', ['full','security'], static function () use ($backendRoot): array {
            $roots = [$backendRoot . '/api', $backendRoot . '/public'];
            $found = [];
            foreach ($roots as $root) {
                if (!is_dir($root)) continue;
                $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
                foreach ($iterator as $file) {
                    if (!$file->isFile()) continue;
                    $name = strtolower($file->getFilename());
                    if (preg_match('/(?:\.backup|\.bak|\.old|\.orig|~)(?:\.php)?$/', $name)) {
                        $found[] = str_replace('\\','/',substr($file->getPathname(), strlen($backendRoot) + 1));
                    }
                }
            }
            return $found === []
                ? qa_result('passed', 'فایل Backup قابل دسترسی در API پیدا نشد.', 'info', 0, 0)
                : qa_result('failed', 'فایل Backup در مسیر عمومی Backend پیدا شد.', 'high', $found, 0, 'فایل‌های Backup را از مسیر وب خارج کن؛ مخصوصاً فایل‌های .backup.php.');
        });

        $add('security.display_errors', 'security', 'نمایش خطای PHP', 'نمایش مستقیم خطاهای PHP در Production بررسی می‌شود.', ['security','full'], static function (): array {
            $display = strtolower((string) ini_get('display_errors'));
            $enabled = in_array($display, ['1','on','true','yes'], true);
            if (app_is_production() && $enabled) return qa_result('failed', 'display_errors در Production فعال است.', 'high', $display, 'Off', 'display_errors=Off و log_errors=On تنظیم شود.');
            if (!app_is_production() && $enabled) return qa_result('warning', 'نمایش خطا برای محیط Local فعال است.', 'low', $display, 'Production: Off');
            return qa_result('passed', 'نمایش خطا با محیط سازگار است.', 'info', $display ?: 'Off', 'Off');
        });

        $add('security.cors_configuration', 'security', 'تنظیم CORS پنل و ویجت', 'Originهای مجاز و استفاده از wildcard بررسی می‌شود.', ['security','full'], static function (): array {
            $panel = trim((string) app_env('PANEL_ALLOWED_ORIGINS', app_env('FRONTEND_URL', '')));
            $widget = trim((string) app_env('WIDGET_ALLOWED_ORIGINS', ''));
            if (str_contains($panel, '*') || str_contains($widget, '*')) return qa_result('failed', 'Wildcard در Originهای مجاز پیدا شد.', 'critical', ['panel'=>$panel,'widget'=>$widget], 'explicit origins', 'Originهای مشخص را به‌صورت لیست جداشده با کاما تنظیم کن.');
            if (app_is_production() && ($panel === '' || !str_contains($panel, 'https://'))) return qa_result('warning', 'Origin امن HTTPS برای پنل Production مشخص نیست.', 'high', $panel, 'https://...');
            return qa_result('passed', 'تنظیمات CORS پایه محدود و مشخص است.', 'info', ['panel'=>$panel,'widget'=>$widget], 'no wildcard');
        });

        $add('security.failed_login_activity', 'security', 'ورودهای ناموفق اخیر', 'تعداد شکست‌های ورود مدیران در یک ساعت اخیر بررسی می‌شود.', ['security','full'], static function () use ($pdo): array {
            if (!qa_table_exists($pdo, 'admin_login_attempts')) return qa_result('skipped', 'تاریخچه ورود مدیران نصب نشده است.', 'medium');
            $count = (int) $pdo->query("SELECT COUNT(*) FROM admin_login_attempts WHERE success=0 AND created_at>=DATE_SUB(NOW(),INTERVAL 1 HOUR)")->fetchColumn();
            if ($count >= 20) return qa_result('failed', 'تعداد ورود ناموفق در یک ساعت اخیر غیرعادی است.', 'critical', $count, '< 20', 'IPها و حساب‌های هدف را در مرکز امنیت بررسی کن.');
            if ($count >= 5) return qa_result('warning', 'چند ورود ناموفق اخیر ثبت شده است.', 'medium', $count, '< 5');
            return qa_result('passed', 'الگوی غیرعادی ورود ناموفق مشاهده نشد.', 'info', $count, '< 5');
        });

        $add('widget.active_site_domains', 'widget', 'دامنه سایت‌های فعال', 'سایت فعال بدون دامنه معتبر بررسی می‌شود.', ['full','security'], static function () use ($pdo, $scope): array {
            [$where, $params] = qa_scope_sql($scope, 's');
            $stmt = $pdo->prepare("SELECT id,name,domain FROM sites s WHERE ({$where}) AND s.is_active=1 AND (s.domain IS NULL OR CHAR_LENGTH(TRIM(s.domain))<3)");
            $stmt->execute($params);
            $rows = $stmt->fetchAll();
            return $rows === []
                ? qa_result('passed', 'تمام سایت‌های فعال دامنه ثبت‌شده دارند.', 'info', 0, 0)
                : qa_result('warning', 'سایت فعال بدون دامنه معتبر پیدا شد.', 'medium', $rows, 0, 'دامنه سایت را برای کنترل Origin ویجت ثبت کن.');
        });

        $add('operational.transaction_rollback', 'operations', 'نوشتن و Rollback دیتابیس', 'قابلیت نوشتن کنترل‌شده در دیتابیس و پاک‌شدن کامل داده آزمایشی بررسی می‌شود.', ['operational'], static function () use ($pdo): array {
            if (!qa_table_exists($pdo, 'qa_test_scratch')) return qa_result('skipped', 'جدول Scratch تست عملیاتی نصب نشده است.', 'high', null, 'qa_test_scratch', 'Migration فاز دوم QA را Import کن.');
            $probe=bin2hex(random_bytes(16));
            qa_with_rollback($pdo, static function () use ($pdo,$probe): void {
                $pdo->prepare('INSERT INTO qa_test_scratch (probe_key,payload) VALUES (:key,:payload)')->execute([':key'=>$probe,':payload'=>'rollback-probe']);
                $stmt=$pdo->prepare('SELECT payload FROM qa_test_scratch WHERE probe_key=:key');$stmt->execute([':key'=>$probe]);
                if($stmt->fetchColumn()!=='rollback-probe') throw new RuntimeException('رکورد آزمایشی پس از INSERT قابل خواندن نبود.');
            });
            $stmt=$pdo->prepare('SELECT COUNT(*) FROM qa_test_scratch WHERE probe_key=:key');$stmt->execute([':key'=>$probe]);
            $remaining=(int)$stmt->fetchColumn();
            return $remaining===0
                ? qa_result('passed','نوشتن آزمایشی و Rollback دیتابیس با موفقیت انجام شد.','info',0,0,null,['probe_key'=>$probe])
                : qa_result('failed','داده آزمایشی پس از Rollback باقی مانده است.','critical',$remaining,0,'Transaction و تنظیمات Engine جدول‌ها را بررسی کن.',['probe_key'=>$probe], 'Rollback تراکنش روی دیتابیس اعمال نشده است.', 'باقی‌ماندن داده مصنوعی می‌تواند گزارش‌ها و داده واقعی را آلوده کند.');
        });

        $add('operational.synthetic_tenant_lifecycle', 'api', 'چرخه ساخت مشتری، سایت و کاربر', 'ساخت، خواندن و ارتباط Tenant/Site/User با داده مصنوعی داخل Transaction آزمایش می‌شود.', ['operational'], static function () use ($pdo): array {
            $suffix=substr(bin2hex(random_bytes(8)),0,12);
            $ids=qa_with_rollback($pdo, static function () use ($pdo,$suffix): array {
                $ctx=qa_synthetic_context($pdo,$suffix);
                $stmt=$pdo->prepare('SELECT t.id tenant_id,s.id site_id,u.id user_id FROM tenants t INNER JOIN sites s ON s.tenant_id=t.id INNER JOIN users u ON u.tenant_id=t.id WHERE t.id=:tenant AND s.id=:site AND u.id=:user');
                $stmt->execute([':tenant'=>$ctx['tenantId'],':site'=>$ctx['siteId'],':user'=>$ctx['adminId']]);
                if(!$stmt->fetch()) throw new RuntimeException('ارتباط مشتری، سایت و کاربر مصنوعی قابل بازیابی نبود.');
                return $ctx;
            });
            $stmt=$pdo->prepare('SELECT COUNT(*) FROM tenants WHERE id=:id');$stmt->execute([':id'=>$ids['tenantId']]);
            return (int)$stmt->fetchColumn()===0
                ? qa_result('passed','چرخه ساخت و پاک‌سازی مشتری مصنوعی موفق بود.','info',['tenant_id'=>$ids['tenantId'],'site_id'=>$ids['siteId']], 'rollback cleanup')
                : qa_result('failed','مشتری مصنوعی بعد از تست پاک نشد.','critical',$ids['tenantId'],0,'Transaction دیتابیس را بررسی کن.',[], 'Rollback داده مصنوعی ناقص است.', 'داده تست ممکن است در پنل و گزارش‌های واقعی دیده شود.');
        });

        $add('operational.messaging_lifecycle', 'messaging', 'چرخه کامل پیام‌رسان مصنوعی', 'Visitor، Conversation، Reply، Edit، Delete، Reaction، Mention و Read Receipt داخل Transaction آزمایش می‌شوند.', ['operational'], static function () use ($pdo): array {
            $required=['message_revisions','message_reactions','message_mentions'];
            $missing=array_values(array_filter($required,static fn(string $t):bool=>!qa_table_exists($pdo,$t)));
            if($missing) return qa_result('skipped','جدول‌های پیام‌رسان لازم برای تست کامل نصب نیستند.','high',$missing,$required,'Migrationهای پیام‌رسان ۱ تا ۳ را بررسی کن.');
            $suffix=substr(bin2hex(random_bytes(8)),0,12);
            $summary=qa_with_rollback($pdo, static function () use ($pdo,$suffix): array {
                $ctx=qa_synthetic_context($pdo,$suffix);
                $pdo->prepare("INSERT INTO visitors (site_id,name,email,browser_id,last_seen_at) VALUES (:site,'QA Visitor',:email,:browser,NOW())")
                    ->execute([':site'=>$ctx['siteId'],':email'=>'visitor-'.$ctx['email'],':browser'=>'qa-browser-'.$suffix]);
                $visitorId=(int)$pdo->lastInsertId();
                $pdo->prepare("INSERT INTO conversations (site_id,visitor_id,assigned_agent_id,status,source_page_url,source_page_title,last_message_at) VALUES (:site,:visitor,:agent,'open',:url,'QA Operational',NOW())")
                    ->execute([':site'=>$ctx['siteId'],':visitor'=>$visitorId,':agent'=>$ctx['agentId'],':url'=>'https://qa.example.invalid/'.$suffix]);
                $conversationId=(int)$pdo->lastInsertId();
                $pdo->prepare("INSERT INTO messages (conversation_id,sender_type,sender_id,message_type,content,is_read,delivered_at,read_at) VALUES (:conversation,'visitor',:visitor,'text','پیام تست کاربر',1,NOW(),NOW())")
                    ->execute([':conversation'=>$conversationId,':visitor'=>$visitorId]);
                $visitorMessageId=(int)$pdo->lastInsertId();
                $pdo->prepare("INSERT INTO messages (conversation_id,sender_type,sender_id,message_type,reply_to_message_id,content,is_read,delivered_at,read_at) VALUES (:conversation,'agent',:agent,'text',:reply,'پاسخ تست اپراتور',1,NOW(),NOW())")
                    ->execute([':conversation'=>$conversationId,':agent'=>$ctx['agentId'],':reply'=>$visitorMessageId]);
                $agentMessageId=(int)$pdo->lastInsertId();
                $pdo->prepare("INSERT INTO message_revisions (message_id,editor_type,editor_id,action,previous_content,new_content) VALUES (:message,'agent',:agent,'edit','پاسخ تست اپراتور','پاسخ ویرایش شده')")
                    ->execute([':message'=>$agentMessageId,':agent'=>$ctx['agentId']]);
                $pdo->prepare("UPDATE messages SET content='پاسخ ویرایش شده',edited_at=NOW() WHERE id=:id")->execute([':id'=>$agentMessageId]);
                $pdo->prepare("INSERT INTO message_reactions (message_id,actor_type,actor_id,emoji) VALUES (:message,'visitor',:visitor,'👍')")
                    ->execute([':message'=>$agentMessageId,':visitor'=>$visitorId]);
                $pdo->prepare("INSERT INTO messages (conversation_id,sender_type,sender_id,message_type,content,is_read) VALUES (:conversation,'agent',:agent,'internal_note','یادداشت داخلی QA',1)")
                    ->execute([':conversation'=>$conversationId,':agent'=>$ctx['adminId']]);
                $noteId=(int)$pdo->lastInsertId();
                $pdo->prepare("INSERT INTO message_mentions (message_id,mentioned_user_id,created_by_user_id) VALUES (:message,:mentioned,:creator)")
                    ->execute([':message'=>$noteId,':mentioned'=>$ctx['agentId'],':creator'=>$ctx['adminId']]);
                $pdo->prepare("INSERT INTO message_revisions (message_id,editor_type,editor_id,action,previous_content,new_content) VALUES (:message,'agent',:agent,'delete','پاسخ ویرایش شده',NULL)")
                    ->execute([':message'=>$agentMessageId,':agent'=>$ctx['agentId']]);
                $pdo->prepare("UPDATE messages SET deleted_at=NOW(),deleted_by_type='agent',deleted_by_id=:agent WHERE id=:id")
                    ->execute([':agent'=>$ctx['agentId'],':id'=>$agentMessageId]);
                $stmt=$pdo->prepare("SELECT m.reply_to_message_id,m.edited_at,m.deleted_at,(SELECT COUNT(*) FROM message_reactions r WHERE r.message_id=m.id) reactions,(SELECT COUNT(*) FROM message_revisions v WHERE v.message_id=m.id) revisions FROM messages m WHERE m.id=:id");
                $stmt->execute([':id'=>$agentMessageId]);$row=$stmt->fetch();
                $mention=(int)$pdo->query('SELECT COUNT(*) FROM message_mentions WHERE message_id='.(int)$noteId)->fetchColumn();
                if(!$row || (int)$row['reply_to_message_id']!==$visitorMessageId || (int)$row['reactions']!==1 || (int)$row['revisions']<2 || !$row['edited_at'] || !$row['deleted_at'] || $mention!==1) {
                    throw new RuntimeException('یک یا چند مرحله چرخه پیام‌رسان نتیجه مورد انتظار را نداشت.');
                }
                return ['conversation_id'=>$conversationId,'visitor_message_id'=>$visitorMessageId,'agent_message_id'=>$agentMessageId,'reactions'=>(int)$row['reactions'],'revisions'=>(int)$row['revisions'],'mentions'=>$mention];
            });
            return qa_result('passed','چرخه عملیاتی پیام‌رسان و پاک‌سازی داده مصنوعی موفق بود.','info',$summary,'reply/edit/delete/reaction/mention/receipt');
        });

        $add('operational.department_round_robin', 'messaging', 'مسیریابی Round Robin', 'اختصاص خودکار گفتگو به اعضای آنلاین دپارتمان داخل داده مصنوعی بررسی می‌شود.', ['operational'], static function () use ($pdo): array {
            if(!qa_table_exists($pdo,'departments')||!qa_table_exists($pdo,'department_members')) return qa_result('skipped','جداول دپارتمان نصب نشده‌اند.','high');
            $suffix=substr(bin2hex(random_bytes(8)),0,12);
            $result=qa_with_rollback($pdo, static function () use ($pdo,$suffix): array {
                $ctx=qa_synthetic_context($pdo,$suffix);
                $pdo->prepare("INSERT INTO departments (tenant_id,site_id,name,slug,routing_strategy,queue_enabled,is_default,is_active,created_by) VALUES (:tenant,:site,'QA Routing',:slug,'round_robin',1,1,1,:creator)")
                    ->execute([':tenant'=>$ctx['tenantId'],':site'=>$ctx['siteId'],':slug'=>'qa-routing-'.$suffix,':creator'=>$ctx['adminId']]);
                $departmentId=(int)$pdo->lastInsertId();
                $pdo->prepare('UPDATE sites SET default_department_id=:department WHERE id=:site')->execute([':department'=>$departmentId,':site'=>$ctx['siteId']]);
                foreach([$ctx['adminId'],$ctx['agentId']] as $uid){$pdo->prepare('INSERT INTO department_members (department_id,user_id,max_active_conversations,routing_weight) VALUES (:department,:user,5,1)')->execute([':department'=>$departmentId,':user'=>$uid]);}
                $pdo->prepare("INSERT INTO visitors (site_id,name,browser_id,last_seen_at) VALUES (:site,'QA Visitor',:browser,NOW())")->execute([':site'=>$ctx['siteId'],':browser'=>'qa-route-'.$suffix]);$visitorId=(int)$pdo->lastInsertId();
                $assigned=[];$department=routing_department($pdo,$departmentId,$ctx['tenantId'],$ctx['siteId'],true);if(!$department)throw new RuntimeException('دپارتمان مصنوعی پیدا نشد.');
                for($i=0;$i<2;$i++){
                    $pdo->prepare("INSERT INTO conversations (site_id,visitor_id,department_id,status,last_message_at) VALUES (:site,:visitor,:department,'new',NOW())")->execute([':site'=>$ctx['siteId'],':visitor'=>$visitorId,':department'=>$departmentId]);
                    $conversationId=(int)$pdo->lastInsertId();$route=routing_route_conversation($pdo,$conversationId,$department,$ctx['adminId']);
                    if(empty($route['assigned']))throw new RuntimeException('گفتگو به اپراتور اختصاص داده نشد.');
                    $assigned[]=(int)$route['agent']['id'];
                }
                return ['assigned_agents'=>$assigned,'unique_agents'=>count(array_unique($assigned))];
            });
            return $result['unique_agents']===2
                ? qa_result('passed','Round Robin گفتگوها را بین دو عضو توزیع کرد.','info',$result,2)
                : qa_result('failed','Round Robin گفتگوها را بین اعضا توزیع نکرد.','high',$result,2,'زمان last_assigned_at و Candidate Agentها را بررسی کن.',[], 'الگوریتم انتخاب عضو به یک کاربر تکراری رسیده است.', 'توزیع نامتوازن باعث افزایش زمان پاسخ و فشار روی یک اپراتور می‌شود.');
        });

        $add('operational.department_queue', 'messaging', 'صف انتظار دپارتمان', 'وقتی ظرفیت عضو پر است، قرارگرفتن گفتگو در صف بررسی می‌شود.', ['operational'], static function () use ($pdo): array {
            if(!qa_table_exists($pdo,'departments')) return qa_result('skipped','جداول دپارتمان نصب نشده‌اند.','high');
            $suffix=substr(bin2hex(random_bytes(8)),0,12);
            $result=qa_with_rollback($pdo, static function () use ($pdo,$suffix): array {
                $ctx=qa_synthetic_context($pdo,$suffix);
                $pdo->prepare("INSERT INTO departments (tenant_id,site_id,name,slug,routing_strategy,queue_enabled,is_default,is_active,created_by) VALUES (:tenant,:site,'QA Queue',:slug,'least_busy',1,1,1,:creator)")
                    ->execute([':tenant'=>$ctx['tenantId'],':site'=>$ctx['siteId'],':slug'=>'qa-queue-'.$suffix,':creator'=>$ctx['adminId']]);
                $departmentId=(int)$pdo->lastInsertId();
                $pdo->prepare('UPDATE sites SET default_department_id=:department WHERE id=:site')->execute([':department'=>$departmentId,':site'=>$ctx['siteId']]);
                $pdo->prepare('INSERT INTO department_members (department_id,user_id,max_active_conversations,routing_weight) VALUES (:department,:user,0,1)')->execute([':department'=>$departmentId,':user'=>$ctx['agentId']]);
                $pdo->prepare("INSERT INTO visitors (site_id,name,browser_id,last_seen_at) VALUES (:site,'QA Visitor',:browser,NOW())")->execute([':site'=>$ctx['siteId'],':browser'=>'qa-queue-'.$suffix]);$visitorId=(int)$pdo->lastInsertId();
                $pdo->prepare("INSERT INTO conversations (site_id,visitor_id,department_id,status,last_message_at) VALUES (:site,:visitor,:department,'new',NOW())")->execute([':site'=>$ctx['siteId'],':visitor'=>$visitorId,':department'=>$departmentId]);$conversationId=(int)$pdo->lastInsertId();
                $department=routing_department($pdo,$departmentId,$ctx['tenantId'],$ctx['siteId'],true);$route=routing_route_conversation($pdo,$conversationId,$department,$ctx['adminId']);
                $stmt=$pdo->prepare('SELECT queue_status,queue_position,assigned_agent_id FROM conversations WHERE id=:id');$stmt->execute([':id'=>$conversationId]);$row=$stmt->fetch();
                return ['route'=>$route,'row'=>$row];
            });
            $queued=($result['row']['queue_status']??null)==='waiting' && (int)($result['row']['queue_position']??0)===1 && empty($result['row']['assigned_agent_id']);
            return $queued
                ? qa_result('passed','گفتگوی بدون ظرفیت در جایگاه اول صف قرار گرفت.','info',$result['row'],'waiting / position 1')
                : qa_result('failed','رفتار صف انتظار مطابق انتظار نبود.','high',$result,'waiting / position 1','قوانین ظرفیت و routing_queue_conversation را بررسی کن.');
        });

        $add('operational.auth_session_lifecycle', 'security', 'چرخه نشست و لغو Session', 'ساخت، مشاهده و لغو نشست مصنوعی کاربر داخل Transaction بررسی می‌شود.', ['operational'], static function () use ($pdo): array {
            if(!qa_table_exists($pdo,'auth_sessions')) return qa_result('skipped','جدول نشست‌های امن نصب نشده است.','high');
            $suffix=substr(bin2hex(random_bytes(8)),0,12);
            $result=qa_with_rollback($pdo, static function () use ($pdo,$suffix): array {
                $ctx=qa_synthetic_context($pdo,$suffix);$jti=hash('sha256','qa-'.$suffix);
                $pdo->prepare("INSERT INTO auth_sessions (user_id,jti_hash,ip_address,user_agent,expires_at) VALUES (:user,:jti,'127.0.0.1','QA Runner',DATE_ADD(NOW(),INTERVAL 10 MINUTE))")
                    ->execute([':user'=>$ctx['adminId'],':jti'=>$jti]);$sessionId=(int)$pdo->lastInsertId();
                $pdo->prepare("UPDATE auth_sessions SET revoked_at=NOW(),revoked_by=:user,revocation_reason='qa_test' WHERE id=:id")->execute([':user'=>$ctx['adminId'],':id'=>$sessionId]);
                $stmt=$pdo->prepare('SELECT revoked_at,revocation_reason FROM auth_sessions WHERE id=:id');$stmt->execute([':id'=>$sessionId]);return $stmt->fetch()?:[];
            });
            return !empty($result['revoked_at'])&&($result['revocation_reason']??'')==='qa_test'
                ? qa_result('passed','ساخت و لغو Session مصنوعی موفق بود.','info',$result,'revoked_at set')
                : qa_result('failed','لغو Session مصنوعی ثبت نشد.','critical',$result,'revoked_at set','ساختار auth_sessions و منطق Revocation را بررسی کن.');
        });

        $add('operational.upload_write_cleanup', 'storage', 'نوشتن و پاک‌سازی فایل آزمایشی', 'مجوز نوشتن واقعی در پوشه Upload و حذف فوری فایل Probe بررسی می‌شود.', ['operational'], static function () use ($backendRoot): array {
            $upload=$backendRoot.'/uploads';
            if(!is_dir($upload)) return qa_result('failed','پوشه Upload وجود ندارد.','high',$upload,'existing directory','پوشه backend/uploads را ایجاد و دسترسی نوشتن بده.');
            $path=$upload.'/.qa-probe-'.bin2hex(random_bytes(8)).'.tmp';$payload=random_bytes(64);
            $written=@file_put_contents($path,$payload,LOCK_EX);$read=$written!==false&&is_file($path)?@file_get_contents($path):false;$deleted=!is_file($path)||@unlink($path);
            $left=is_file($path);if($left)@unlink($path);
            if($written===64&&$read===$payload&&$deleted&&!$left) return qa_result('passed','نوشتن، خواندن و حذف فایل آزمایشی موفق بود.','info',64,64);
            return qa_result('failed','چرخه نوشتن یا پاک‌سازی فایل Upload ناموفق بود.','high',['written'=>$written,'read_ok'=>$read===$payload,'deleted'=>$deleted,'leftover'=>$left],['written'=>64,'read_ok'=>true,'deleted'=>true],'Permission پوشه Upload، آنتی‌ویروس و Lock فایل را بررسی کن.',[], 'دسترسی فایل‌سیستم یا حذف فایل موقت کامل نیست.', 'آپلود فایل کاربران یا Cleanup فایل‌های موقت ممکن است شکست بخورد.');
        });

        $add('operational.audit_write_rollback', 'operations', 'ثبت Audit Log در تراکنش', 'قابلیت ثبت رخداد مدیریتی بدون باقی‌ماندن داده آزمایشی بررسی می‌شود.', ['operational'], static function () use ($pdo): array {
            if(!qa_table_exists($pdo,'admin_audit_logs')) return qa_result('skipped','جدول Audit Log وجود ندارد.','high');
            $columns=$pdo->query("SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='admin_audit_logs'")->fetchAll(PDO::FETCH_COLUMN);
            $required=['action','entity_type'];$missing=array_values(array_diff($required,$columns));if($missing)return qa_result('skipped','ساختار Audit Log با تست عملیاتی سازگار نیست.','medium',$missing,$required);
            $probe='qa-audit-'.bin2hex(random_bytes(6));
            qa_with_rollback($pdo, static function () use ($pdo,$probe,$columns): void {
                $fields=['action','entity_type'];$values=[':action',':entity'];$params=[':action'=>$probe,':entity'=>'qa_test'];
                if(in_array('actor_user_id',$columns,true)){$fields[]='actor_user_id';$values[]='NULL';}
                if(in_array('description',$columns,true)){$fields[]='description';$values[]=':description';$params[':description']='QA operational audit probe';}
                if(in_array('created_at',$columns,true)){$fields[]='created_at';$values[]='NOW()';}
                $sql='INSERT INTO admin_audit_logs (`'.implode('`,`',$fields).'`) VALUES ('.implode(',',$values).')';$pdo->prepare($sql)->execute($params);
                $stmt=$pdo->prepare('SELECT COUNT(*) FROM admin_audit_logs WHERE action=:action');$stmt->execute([':action'=>$probe]);if((int)$stmt->fetchColumn()!==1)throw new RuntimeException('Audit probe قابل خواندن نبود.');
            });
            $stmt=$pdo->prepare('SELECT COUNT(*) FROM admin_audit_logs WHERE action=:action');$stmt->execute([':action'=>$probe]);
            return (int)$stmt->fetchColumn()===0?qa_result('passed','Audit Log آزمایشی ثبت و Rollback شد.','info',0,0):qa_result('failed','Audit آزمایشی باقی مانده است.','high',1,0,'Transaction Audit Log را بررسی کن.');
        });

        foreach (qa_security_case_catalog($pdo, $scope) as $securityKey => $securityCase) {
            $cases[$securityKey] = $securityCase;
        }

        return $cases;
    }
}

if (!function_exists('qa_insert_item')) {
    function qa_insert_item(PDO $pdo, int $runId, array $case, array $result, int $durationMs): void
    {
        $rootCause=qa_default_root_cause($result);
        $impact=qa_default_impact($result);
        $details=$result['details'] ?? [];
        $evidence=$result['evidence'] ?? [];
        if($evidence===[] && $details!==[]) $evidence=$details;
        $stmt = $pdo->prepare("INSERT INTO qa_test_run_items (run_id,case_key,category,title,description,status,severity,duration_ms,message,root_cause,impact,expected_value,actual_value,remediation,details_json,evidence_json,risk_score,confidence,owasp_category,cwe_id,affected_component,verification_mode) VALUES (:run_id,:case_key,:category,:title,:description,:status,:severity,:duration_ms,:message,:root_cause,:impact,:expected,:actual,:remediation,:details,:evidence,:risk_score,:confidence,:owasp_category,:cwe_id,:affected_component,:verification_mode)");
        $stmt->execute([
            ':run_id'=>$runId,
            ':case_key'=>$case['key'],
            ':category'=>$case['category'],
            ':title'=>$case['title'],
            ':description'=>$case['description'],
            ':status'=>$result['status'],
            ':severity'=>$result['severity'],
            ':duration_ms'=>$durationMs,
            ':message'=>$result['message'],
            ':root_cause'=>$rootCause,
            ':impact'=>$impact,
            ':expected'=>qa_scalar_string($result['expected']),
            ':actual'=>qa_scalar_string($result['actual']),
            ':remediation'=>$result['remediation'],
            ':details'=>$details ? json_encode($details,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES) : null,
            ':evidence'=>$evidence ? json_encode($evidence,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES) : null,
            ':risk_score'=>isset($result['risk_score']) ? (float)$result['risk_score'] : null,
            ':confidence'=>$result['confidence'] ?? null,
            ':owasp_category'=>$result['owasp_category'] ?? null,
            ':cwe_id'=>$result['cwe_id'] ?? null,
            ':affected_component'=>$result['affected_component'] ?? null,
            ':verification_mode'=>$result['verification_mode'] ?? null,
        ]);
    }
}

if (!function_exists('qa_finding_target_ref')) {
    function qa_finding_target_ref(string $targetType, ?int $targetId): string
    {
        return $targetType==='system'?'system':$targetType.':'.(int)$targetId;
    }
}

if (!function_exists('qa_sync_findings_for_run')) {
    function qa_sync_findings_for_run(PDO $pdo, int $runId): void
    {
        if(!qa_table_exists($pdo,'qa_findings')) return;
        $runStmt=$pdo->prepare('SELECT id,target_type,target_id,target_label FROM qa_test_runs WHERE id=:id LIMIT 1');
        $runStmt->execute([':id'=>$runId]);$run=$runStmt->fetch();if(!$run)return;
        $targetRef=qa_finding_target_ref((string)$run['target_type'],$run['target_id']!==null?(int)$run['target_id']:null);
        $items=$pdo->prepare("SELECT * FROM qa_test_run_items WHERE run_id=:id");$items->execute([':id'=>$runId]);
        foreach($items->fetchAll() as $item){
            $fingerprint=hash('sha256',$targetRef.'|'.$item['case_key']);
            if(in_array($item['status'],['warning','failed','error'],true)){
                $evidence=$item['evidence_json'] ?: $item['details_json'];
                $stmt=$pdo->prepare("INSERT INTO qa_findings (fingerprint,case_key,category,title,target_type,target_id,target_ref,target_label,status,test_status,severity,message,root_cause,impact,expected_value,actual_value,remediation,evidence_json,risk_score,confidence,owasp_category,cwe_id,affected_component,verification_mode,first_seen_at,last_seen_at,occurrence_count,last_run_id) VALUES (:fingerprint,:case_key,:category,:title,:target_type,:target_id,:target_ref,:target_label,'open',:test_status,:severity,:message,:root_cause,:impact,:expected,:actual,:remediation,:evidence,:risk_score,:confidence,:owasp_category,:cwe_id,:affected_component,:verification_mode,NOW(),NOW(),1,:run_id) ON DUPLICATE KEY UPDATE category=VALUES(category),title=VALUES(title),target_label=VALUES(target_label),status=IF(status='ignored','ignored','open'),test_status=VALUES(test_status),severity=VALUES(severity),message=VALUES(message),root_cause=VALUES(root_cause),impact=VALUES(impact),expected_value=VALUES(expected_value),actual_value=VALUES(actual_value),remediation=VALUES(remediation),evidence_json=VALUES(evidence_json),risk_score=VALUES(risk_score),confidence=VALUES(confidence),owasp_category=VALUES(owasp_category),cwe_id=VALUES(cwe_id),affected_component=VALUES(affected_component),verification_mode=VALUES(verification_mode),last_seen_at=NOW(),occurrence_count=occurrence_count+1,last_run_id=VALUES(last_run_id),resolved_by=IF(status='ignored',resolved_by,NULL),resolved_at=IF(status='ignored',resolved_at,NULL),resolution_note=IF(status='ignored',resolution_note,NULL)");
                $stmt->execute([':fingerprint'=>$fingerprint,':case_key'=>$item['case_key'],':category'=>$item['category'],':title'=>$item['title'],':target_type'=>$run['target_type'],':target_id'=>$run['target_id'],':target_ref'=>$targetRef,':target_label'=>$run['target_label'],':test_status'=>$item['status'],':severity'=>$item['severity'],':message'=>$item['message'],':root_cause'=>$item['root_cause'],':impact'=>$item['impact'],':expected'=>$item['expected_value'],':actual'=>$item['actual_value'],':remediation'=>$item['remediation'],':evidence'=>$evidence,':risk_score'=>$item['risk_score']!==null?(float)$item['risk_score']:null,':confidence'=>$item['confidence'],':owasp_category'=>$item['owasp_category'],':cwe_id'=>$item['cwe_id'],':affected_component'=>$item['affected_component'],':verification_mode'=>$item['verification_mode'],':run_id'=>$runId]);
            } elseif($item['status']==='passed') {
                $stmt=$pdo->prepare("UPDATE qa_findings SET status='resolved',resolved_at=NOW(),resolution_note='این مورد در اجرای تست جدید موفق شد.',last_run_id=:run_id WHERE fingerprint=:fingerprint AND status='open'");
                $stmt->execute([':run_id'=>$runId,':fingerprint'=>$fingerprint]);
            }
        }
    }
}

if (!function_exists('qa_execute_run')) {
    function qa_execute_run(PDO $pdo, int $runId, array $selectedCaseKeys = []): array
    {
        $runStmt=$pdo->prepare('SELECT * FROM qa_test_runs WHERE id=:id LIMIT 1');
        $runStmt->execute([':id'=>$runId]);
        $run=$runStmt->fetch();
        if(!$run) throw new RuntimeException('اجرای تست پیدا نشد.');

        $scope=qa_scope($pdo,(string)$run['target_type'],$run['target_id']!==null?(int)$run['target_id']:null);
        $pdo->prepare("UPDATE qa_test_runs SET status='running',target_label=:label,started_at=NOW(),error_message=NULL WHERE id=:id")->execute([':label'=>$scope['target_label'],':id'=>$runId]);
        $pdo->prepare('DELETE FROM qa_test_run_items WHERE run_id=:id')->execute([':id'=>$runId]);

        $started=microtime(true);
        $catalog=qa_case_catalog($pdo,$scope);
        $counts=['passed'=>0,'warning'=>0,'failed'=>0,'skipped'=>0,'error'=>0];
        $executed=0;

        try {
            foreach($catalog as $case){
                if(!in_array((string)$run['profile'],$case['profiles'],true)) continue;
                if($selectedCaseKeys!==[]&&!in_array($case['key'],$selectedCaseKeys,true)) continue;
                $caseStarted=microtime(true);
                try{
                    $result=($case['run'])();
                    if(!isset($counts[$result['status']])) $result=qa_result('error','وضعیت نامعتبر از تست دریافت شد.','high');
                }catch(Throwable $e){
                    $result=qa_result('error','اجرای تست با خطای کنترل‌شده متوقف شد.','high',null,null,'Log سیستم و ساختار دیتابیس را بررسی کن.',['exception'=>get_class($e),'message'=>$e->getMessage()]);
                }
                $duration=(int)round((microtime(true)-$caseStarted)*1000);
                qa_insert_item($pdo,$runId,$case,$result,$duration);
                $counts[$result['status']]++;
                $executed++;
            }

            $evaluated=max(1,$counts['passed']+$counts['warning']+$counts['failed']+$counts['error']);
            $score=round((($counts['passed']+($counts['warning']*0.5))/$evaluated)*100,2);
            $duration=(int)round((microtime(true)-$started)*1000);
            $pdo->prepare("UPDATE qa_test_runs SET status='completed',total_count=:total,passed_count=:passed,warning_count=:warning,failed_count=:failed,skipped_count=:skipped,score_percent=:score,duration_ms=:duration,finished_at=NOW() WHERE id=:id")->execute([
                ':total'=>$executed,':passed'=>$counts['passed'],':warning'=>$counts['warning'],':failed'=>$counts['failed']+$counts['error'],':skipped'=>$counts['skipped'],':score'=>$score,':duration'=>$duration,':id'=>$runId,
            ]);
            qa_sync_findings_for_run($pdo,$runId);
        }catch(Throwable $e){
            $pdo->prepare("UPDATE qa_test_runs SET status='failed',error_message=:error,duration_ms=:duration,finished_at=NOW() WHERE id=:id")->execute([':error'=>$e->getMessage(),':duration'=>(int)round((microtime(true)-$started)*1000),':id'=>$runId]);
            throw $e;
        }

        $runStmt->execute([':id'=>$runId]);
        return $runStmt->fetch() ?: [];
    }
}

if (!function_exists('qa_catalog_summary')) {
    function qa_catalog_summary(PDO $pdo): array
    {
        $scope=['target_type'=>'system','target_id'=>null,'target_label'=>'کل سامانه','tenant_id'=>null,'site_id'=>null];
        $catalog=qa_case_catalog($pdo,$scope);
        $categories=[];$profiles=['quick'=>0,'full'=>0,'security'=>0,'security_deep'=>0,'operational'=>0,'browser'=>18];
        foreach($catalog as $case){
            $categories[$case['category']]=($categories[$case['category']]??0)+1;
            foreach($case['profiles'] as $profile)$profiles[$profile]=($profiles[$profile]??0)+1;
        }
        $categories['browser']=18;
        ksort($categories);
        return ['total'=>count($catalog)+18,'categories'=>$categories,'profiles'=>$profiles];
    }
}
