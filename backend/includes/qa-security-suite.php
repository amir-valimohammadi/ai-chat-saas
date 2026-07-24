<?php

// مسیر فایل: backend/includes/qa-security-suite.php
// هدف: تست‌های امنیت عمیق، کنترل‌شده و بدون آسیب برای Super Admin QA Center

declare(strict_types=1);

require_once __DIR__ . '/jwt.php';
require_once __DIR__ . '/auth-session.php';
require_once __DIR__ . '/site-access.php';
require_once __DIR__ . '/upload.php';
require_once __DIR__ . '/security-events.php';
require_once __DIR__ . '/totp.php';

if (!function_exists('qa_security_risk_score')) {
    function qa_security_risk_score(string $severity): float
    {
        return match ($severity) {
            'critical' => 10.0,
            'high' => 8.0,
            'medium' => 5.5,
            'low' => 2.5,
            default => 0.0,
        };
    }
}

if (!function_exists('qa_security_result')) {
    function qa_security_result(
        string $status,
        string $message,
        string $severity = 'info',
        mixed $actual = null,
        mixed $expected = null,
        ?string $remediation = null,
        array $details = [],
        ?string $rootCause = null,
        ?string $impact = null,
        array $evidence = [],
        ?string $owasp = null,
        ?string $cwe = null,
        ?string $component = null,
        string $confidence = 'high',
        string $verificationMode = 'configuration',
        ?float $riskScore = null
    ): array {
        $result = qa_result(
            $status,
            $message,
            $severity,
            $actual,
            $expected,
            $remediation,
            $details,
            $rootCause,
            $impact,
            $evidence
        );
        $result['risk_score'] = $riskScore ?? qa_security_risk_score($severity);
        $result['confidence'] = in_array($confidence, ['low','medium','high','confirmed'], true) ? $confidence : 'high';
        $result['owasp_category'] = $owasp;
        $result['cwe_id'] = $cwe;
        $result['affected_component'] = $component;
        $result['verification_mode'] = in_array($verificationMode, ['static','runtime','database','configuration','hybrid'], true)
            ? $verificationMode
            : 'configuration';
        return $result;
    }
}

if (!function_exists('qa_security_files')) {
    function qa_security_files(string $root, array $extensions = ['php']): array
    {
        $files = [];
        if (!is_dir($root)) return $files;
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS)
        );
        foreach ($iterator as $file) {
            if (!$file->isFile() || $file->isLink()) continue;
            $extension = strtolower((string) pathinfo($file->getFilename(), PATHINFO_EXTENSION));
            if ($extensions !== [] && !in_array($extension, $extensions, true)) continue;
            $files[] = $file->getPathname();
            if (count($files) >= 5000) break;
        }
        return $files;
    }
}

if (!function_exists('qa_security_relative')) {
    function qa_security_relative(string $path, string $projectRoot): string
    {
        $normalizedPath = str_replace('\\', '/', $path);
        $normalizedRoot = rtrim(str_replace('\\', '/', $projectRoot), '/');
        return str_starts_with($normalizedPath, $normalizedRoot . '/')
            ? substr($normalizedPath, strlen($normalizedRoot) + 1)
            : basename($path);
    }
}

if (!function_exists('qa_security_scan_files')) {
    function qa_security_scan_files(array $files, string $pattern, string $projectRoot, int $limit = 30): array
    {
        $matches = [];
        foreach ($files as $file) {
            $content = @file_get_contents($file);
            if ($content === false) continue;
            $lines = preg_split('/\R/', $content) ?: [];
            foreach ($lines as $index => $line) {
                if (@preg_match($pattern, $line) === 1) {
                    $matches[] = [
                        'file' => qa_security_relative($file, $projectRoot),
                        'line' => $index + 1,
                        'sample' => function_exists('mb_substr') ? mb_substr(trim((string) $line), 0, 180, 'UTF-8') : substr(trim((string) $line), 0, 180),
                    ];
                    if (count($matches) >= $limit) return $matches;
                }
            }
        }
        return $matches;
    }
}

if (!function_exists('qa_security_case_catalog')) {
    function qa_security_case_catalog(PDO $pdo, array $scope): array
    {
        $backendRoot = APP_ROOT;
        $projectRoot = dirname(APP_ROOT);
        $frontendRoot = $projectRoot . '/frontend';
        $widgetRoot = $projectRoot . '/widget';
        $cases = [];
        $add = static function (
            string $key,
            string $category,
            string $title,
            string $description,
            Closure $run
        ) use (&$cases): void {
            $cases[$key] = [
                'key' => $key,
                'category' => $category,
                'title' => $title,
                'description' => $description,
                'profiles' => ['security_deep'],
                'run' => $run,
            ];
        };

        $add('security.deep.jwt_secret_strength', 'security', 'قدرت JWT Secret', 'طول، مقدار پیش‌فرض و الگوی کلید JWT بررسی می‌شود.', static function (): array {
            $secret = (string) app_env('JWT_SECRET', '');
            $weakValues = ['', 'change_this_secret', 'secret', 'password', '123456'];
            $weak = in_array(strtolower($secret), $weakValues, true) || strlen($secret) < 32;
            return $weak
                ? qa_security_result('failed', 'JWT_SECRET ضعیف یا پیش‌فرض است.', 'critical', strlen($secret) . ' chars', '>= 32 random chars', 'یک کلید تصادفی حداقل ۳۲ بایتی تولید و در backend/.env ثبت کن.', [], 'کلید کوتاه یا قابل حدس است.', 'مهاجم می‌تواند Token جعلی بسازد و کنترل حساب‌ها را به‌دست بگیرد.', [], 'A02:2021 Cryptographic Failures', 'CWE-321', 'Authentication/JWT', 'confirmed')
                : qa_security_result('passed', 'JWT Secret از حداقل قدرت لازم برخوردار است.', 'info', strlen($secret) . ' chars', '>= 32 random chars', null, [], null, null, [], 'A02:2021 Cryptographic Failures', 'CWE-321', 'Authentication/JWT');
        });

        $add('security.deep.encryption_key_strength', 'security', 'قدرت کلید رمزنگاری', 'APP_ENCRYPTION_KEY برای داده‌های 2FA بررسی می‌شود.', static function (): array {
            $key = (string) app_env('APP_ENCRYPTION_KEY', '');
            $weak = $key === '' || strlen($key) < 32 || str_contains(strtolower($key), 'change_this');
            return $weak
                ? qa_security_result('failed', 'APP_ENCRYPTION_KEY تنظیم نشده یا ضعیف است.', 'critical', strlen($key) . ' chars', '>= 32 random chars', 'یک کلید تصادفی مستقل از JWT_SECRET بساز و بعد از فعال‌شدن 2FA آن را تغییر نده.', [], 'رمزنگاری Secretهای 2FA به کلید ضعیف یا fallback وابسته است.', 'افشای این کلید می‌تواند Secretهای ورود دومرحله‌ای را قابل بازیابی کند.', [], 'A02:2021 Cryptographic Failures', 'CWE-326', 'Two-factor authentication', 'confirmed')
                : qa_security_result('passed', 'کلید رمزنگاری مستقل و مناسب است.', 'info', strlen($key) . ' chars', '>= 32 random chars', null, [], null, null, [], 'A02:2021 Cryptographic Failures', 'CWE-326', 'Two-factor authentication');
        });

        $add('security.deep.secret_separation', 'security', 'جداسازی کلیدها', 'یکسان نبودن JWT_SECRET و APP_ENCRYPTION_KEY بررسی می‌شود.', static function (): array {
            $jwt = (string) app_env('JWT_SECRET', '');
            $enc = (string) app_env('APP_ENCRYPTION_KEY', '');
            $same = $jwt !== '' && $enc !== '' && hash_equals($jwt, $enc);
            return $same
                ? qa_security_result('failed', 'کلید JWT و کلید رمزنگاری یکسان هستند.', 'high', 'same', 'different secrets', 'برای هر کاربرد کلید مستقل تولید کن.', [], 'Reuse شدن یک Secret دامنه آسیب را افزایش می‌دهد.', 'افشای یک کلید هم JWT و هم 2FA را تحت‌تأثیر قرار می‌دهد.', [], 'A02:2021 Cryptographic Failures', 'CWE-320', 'Secrets management', 'confirmed')
                : qa_security_result('passed', 'کلیدهای امنیتی از یکدیگر جدا هستند.', 'info', 'different', 'different secrets', null, [], null, null, [], 'A02:2021 Cryptographic Failures', 'CWE-320', 'Secrets management');
        });

        $add('security.deep.production_error_display', 'security', 'نمایش خطا در Production', 'تنظیم display_errors و APP_DEBUG در محیط Production کنترل می‌شود.', static function (): array {
            $display = filter_var((string) ini_get('display_errors'), FILTER_VALIDATE_BOOL);
            $bad = app_is_production() && ($display || app_debug_enabled());
            return $bad
                ? qa_security_result('failed', 'نمایش خطا یا Debug در Production فعال است.', 'high', ['display_errors'=>$display,'app_debug'=>app_debug_enabled()], ['display_errors'=>false,'app_debug'=>false], 'در Production، APP_DEBUG=false و display_errors=Off تنظیم کن.', [], 'پیام‌های خطا ممکن است مسیر فایل، Query یا داده حساس را افشا کنند.', 'اطلاعات فنی به مهاجم در شناسایی سطح حمله کمک می‌کند.', [], 'A05:2021 Security Misconfiguration', 'CWE-209', 'PHP runtime', 'confirmed')
                : qa_security_result('passed', 'تنظیم نمایش خطا با محیط سازگار است.', 'info', ['display_errors'=>$display,'app_debug'=>app_debug_enabled()], 'disabled in production', null, [], null, null, [], 'A05:2021 Security Misconfiguration', 'CWE-209', 'PHP runtime');
        });

        $add('security.deep.cors_configuration', 'security', 'پیکربندی CORS', 'Wildcard، Origin خالی و ترکیب Credentials بررسی می‌شود.', static function (): array {
            $raw = trim((string) app_env('PANEL_ALLOWED_ORIGINS', app_env('FRONTEND_URL', '')));
            $origins = array_values(array_filter(array_map('trim', explode(',', $raw))));
            $invalid = array_values(array_filter($origins, static fn(string $origin): bool => $origin === '*' || !preg_match('#^https?://#i', $origin)));
            if ($invalid !== []) {
                return qa_security_result('failed', 'Origin ناامن یا نامعتبر در CORS وجود دارد.', 'high', $invalid, 'explicit http/https origins', 'Wildcard را حذف و فقط Originهای دقیق پنل را ثبت کن.', [], 'Credentials همراه Origin گسترده می‌تواند درخواست‌های غیرمجاز را ممکن کند.', 'API پنل ممکن است از سایت مهاجم فراخوانی شود.', ['origins'=>$origins], 'A05:2021 Security Misconfiguration', 'CWE-942', 'CORS', 'confirmed');
            }
            return qa_security_result('passed', 'CORS از Originهای صریح استفاده می‌کند.', 'info', $origins, 'explicit origins', null, [], null, null, [], 'A05:2021 Security Misconfiguration', 'CWE-942', 'CORS');
        });

        $add('security.deep.security_headers_source', 'security', 'هدرهای امنیتی', 'ارسال CSP، nosniff، Frame protection و HSTS بررسی می‌شود.', static function () use ($backendRoot): array {
            $path = $backendRoot . '/includes/security-headers.php';
            $content = is_file($path) ? (string) file_get_contents($path) : '';
            $required = ['X-Content-Type-Options', 'X-Frame-Options', 'Content-Security-Policy', 'Referrer-Policy', 'Strict-Transport-Security'];
            $missing = array_values(array_filter($required, static fn(string $header): bool => !str_contains($content, $header)));
            return $missing === []
                ? qa_security_result('passed', 'هدرهای امنیتی اصلی در کد تعریف شده‌اند.', 'info', $required, $required, null, [], null, null, [], 'A05:2021 Security Misconfiguration', 'CWE-693', 'HTTP security headers', 'high', 'static')
                : qa_security_result('failed', 'یک یا چند هدر امنیتی در کد وجود ندارد.', 'high', $missing, $required, 'هدرهای گزارش‌شده را در security-headers.php اضافه کن.', [], 'پاسخ‌های HTTP بدون دفاع مرورگر ارسال می‌شوند.', 'ریسک Clickjacking، MIME sniffing و افشای Referrer افزایش می‌یابد.', ['file'=>'backend/includes/security-headers.php'], 'A05:2021 Security Misconfiguration', 'CWE-693', 'HTTP security headers', 'high', 'static');
        });

        $add('security.deep.jwt_tamper_runtime', 'security', 'رد Token دست‌کاری‌شده', 'اعتبارسنجی Signature با Token جعلی به‌صورت Runtime بررسی می‌شود.', static function (): array {
            $now = time();
            $token = jwt_encode(['sub'=>1,'email'=>'qa@example.invalid','role'=>'super_admin','token_version'=>1,'iat'=>$now,'exp'=>$now+300]);
            $parts = explode('.', $token);
            $payload = json_decode((string) base64url_decode($parts[1]), true) ?: [];
            $payload['role'] = 'customer_admin';
            $parts[1] = base64url_encode(json_encode($payload, JSON_UNESCAPED_SLASHES));
            $tampered = implode('.', $parts);
            $accepted = jwt_decode($tampered) !== null;
            return !$accepted
                ? qa_security_result('passed', 'Token دست‌کاری‌شده رد شد.', 'info', false, false, null, [], null, null, [], 'A07:2021 Identification and Authentication Failures', 'CWE-347', 'JWT validation', 'confirmed', 'runtime')
                : qa_security_result('failed', 'Token دست‌کاری‌شده پذیرفته شد.', 'critical', true, false, 'اعتبارسنجی HMAC و hash_equals در jwt_decode را اصلاح کن.', [], 'Signature Token به‌درستی اعتبارسنجی نمی‌شود.', 'مهاجم می‌تواند نقش و شناسه کاربر را جعل کند.', [], 'A07:2021 Identification and Authentication Failures', 'CWE-347', 'JWT validation', 'confirmed', 'runtime');
        });

        $add('security.deep.jwt_expiry_runtime', 'security', 'رد Token منقضی', 'انقضای JWT به‌صورت Runtime بررسی می‌شود.', static function (): array {
            $now = time();
            $expired = jwt_encode(['sub'=>1,'email'=>'qa@example.invalid','role'=>'super_admin','token_version'=>1,'iat'=>$now-600,'nbf'=>$now-600,'exp'=>$now-180]);
            $accepted = jwt_decode($expired) !== null;
            return !$accepted
                ? qa_security_result('passed', 'Token منقضی رد شد.', 'info', false, false, null, [], null, null, [], 'A07:2021 Identification and Authentication Failures', 'CWE-613', 'JWT validation', 'confirmed', 'runtime')
                : qa_security_result('failed', 'Token منقضی پذیرفته شد.', 'critical', true, false, 'بررسی exp و Clock Skew را اصلاح کن.', [], 'Expiration Token اعمال نمی‌شود.', 'نشست سرقت‌شده ممکن است برای مدت نامحدود معتبر بماند.', [], 'A07:2021 Identification and Authentication Failures', 'CWE-613', 'JWT validation', 'confirmed', 'runtime');
        });

        $add('security.deep.session_revocation_runtime', 'security', 'لغو واقعی نشست', 'صدور، اعتبارسنجی و لغو Session داخل Transaction بررسی می‌شود.', static function () use ($pdo): array {
            if (!qa_table_exists($pdo, 'auth_sessions')) return qa_security_result('skipped', 'جدول auth_sessions موجود نیست.', 'high', null, 'installed', 'Migration فاز امنیت را اجرا کن.', [], null, null, [], 'A07:2021 Identification and Authentication Failures', 'CWE-613', 'Auth sessions', 'high', 'database');
            $suffix = substr(bin2hex(random_bytes(8)), 0, 12);
            $result = qa_with_rollback($pdo, static function () use ($pdo, $suffix): array {
                $ctx = qa_synthetic_context($pdo, $suffix);
                $stmt = $pdo->prepare('SELECT * FROM users WHERE id=:id LIMIT 1');
                $stmt->execute([':id'=>$ctx['adminId']]);
                $user = $stmt->fetch();
                if (!$user) throw new RuntimeException('کاربر مصنوعی ایجاد نشد.');
                $issued = auth_issue_session($pdo, $user);
                $payload = jwt_decode((string) $issued['token']);
                if (!$payload) throw new RuntimeException('Token صادرشده قابل Decode نیست.');
                $before = auth_validate_session($pdo, (int)$user['id'], (string)$payload['jti']);
                auth_revoke_sessions($pdo, (int)$user['id'], (int)$user['id'], 'QA deep security test', (int)$issued['session_id']);
                $after = auth_validate_session($pdo, (int)$user['id'], (string)$payload['jti']);
                return ['before'=>$before,'after'=>$after];
            });
            return $result['before'] && !$result['after']
                ? qa_security_result('passed', 'نشست پس از لغو دیگر معتبر نبود.', 'info', $result, ['before'=>true,'after'=>false], null, [], null, null, [], 'A07:2021 Identification and Authentication Failures', 'CWE-613', 'Auth sessions', 'confirmed', 'runtime')
                : qa_security_result('failed', 'لغو نشست به‌درستی اعمال نشد.', 'critical', $result, ['before'=>true,'after'=>false], 'منطق auth_revoke_sessions و auth_validate_session را بررسی کن.', [], 'Session Revocation در دیتابیس یا اعتبارسنجی Token اعمال نمی‌شود.', 'کاربر خارج‌شده یا نشست سرقت‌شده همچنان قابل استفاده است.', [], 'A07:2021 Identification and Authentication Failures', 'CWE-613', 'Auth sessions', 'confirmed', 'runtime');
        });

        $add('security.deep.inactive_user_sessions', 'security', 'نشست فعال کاربران غیرفعال', 'وجود Session لغونشده برای کاربران غیرفعال بررسی می‌شود.', static function () use ($pdo): array {
            if (!qa_table_exists($pdo, 'auth_sessions')) return qa_security_result('skipped', 'جدول نشست نصب نشده است.', 'medium');
            $count = (int) $pdo->query("SELECT COUNT(*) FROM auth_sessions s INNER JOIN users u ON u.id=s.user_id WHERE u.is_active=0 AND s.revoked_at IS NULL AND s.expires_at>NOW()")->fetchColumn();
            return $count === 0
                ? qa_security_result('passed', 'کاربر غیرفعال با نشست فعال پیدا نشد.', 'info', 0, 0, null, [], null, null, [], 'A07:2021 Identification and Authentication Failures', 'CWE-613', 'Auth sessions', 'high', 'database')
                : qa_security_result('failed', 'کاربران غیرفعال دارای نشست فعال هستند.', 'high', $count, 0, 'هنگام غیرفعال‌سازی کاربر، تمام نشست‌های او را لغو کن.', [], 'تغییر وضعیت کاربر با Revocation نشست هماهنگ نیست.', 'حساب غیرفعال ممکن است تا انقضای Token قابل استفاده بماند.', [], 'A07:2021 Identification and Authentication Failures', 'CWE-613', 'Auth sessions', 'confirmed', 'database');
        });

        $add('security.deep.password_hashes', 'security', 'الگوریتم Hash رمزها', 'Hash رمز کاربران از نظر فرمت امن بررسی می‌شود.', static function () use ($pdo): array {
            $rows = $pdo->query("SELECT id,email,password_hash FROM users WHERE password_hash IS NOT NULL AND password_hash<>'' LIMIT 2000")->fetchAll();
            $bad = [];
            foreach ($rows as $row) {
                $info = password_get_info((string)$row['password_hash']);
                if (($info['algoName'] ?? 'unknown') === 'unknown') $bad[] = ['id'=>(int)$row['id'],'email'=>$row['email']];
            }
            return $bad === []
                ? qa_security_result('passed', 'تمام Password Hashهای بررسی‌شده با الگوریتم امن PHP ساخته شده‌اند.', 'info', count($rows), count($rows), null, [], null, null, [], 'A02:2021 Cryptographic Failures', 'CWE-916', 'Passwords', 'high', 'database')
                : qa_security_result('failed', 'Hash رمز نامعتبر یا قدیمی پیدا شد.', 'critical', count($bad), 0, 'برای حساب‌های گزارش‌شده Reset Password اجباری انجام بده.', [], 'برخی رمزها با password_hash استاندارد ذخیره نشده‌اند.', 'در صورت نشت دیتابیس، رمزها سریع‌تر قابل بازیابی هستند.', $bad, 'A02:2021 Cryptographic Failures', 'CWE-916', 'Passwords', 'confirmed', 'database');
        });

        $add('security.deep.two_factor_storage', 'security', 'ذخیره امن Secret دومرحله‌ای', 'Secretهای 2FA و Recovery Codeها از نظر رمزنگاری/Hash بررسی می‌شوند.', static function () use ($pdo): array {
            if (!qa_column_exists($pdo, 'users', 'two_factor_secret_encrypted')) return qa_security_result('skipped', 'ستون 2FA نصب نشده است.', 'medium');
            $secrets = $pdo->query("SELECT id,two_factor_secret_encrypted FROM users WHERE two_factor_enabled=1")->fetchAll();
            $badSecrets = [];
            foreach ($secrets as $row) {
                $raw = base64_decode((string)$row['two_factor_secret_encrypted'], true);
                if ($raw === false || strlen($raw) < 29 || security_decrypt_secret((string)$row['two_factor_secret_encrypted']) === '') {
                    $badSecrets[] = (int)$row['id'];
                }
            }
            $badRecovery = 0;
            if (qa_table_exists($pdo, 'admin_two_factor_recovery_codes')) {
                $badRecovery = (int)$pdo->query("SELECT COUNT(*) FROM admin_two_factor_recovery_codes WHERE code_hash NOT REGEXP '^[0-9a-f]{64}$'")->fetchColumn();
            }
            if ($badSecrets !== [] || $badRecovery > 0) {
                return qa_security_result('failed', 'ذخیره‌سازی 2FA یا Recovery Code ناامن/خراب است.', 'critical', ['bad_secrets'=>$badSecrets,'bad_recovery_hashes'=>$badRecovery], ['bad_secrets'=>[],'bad_recovery_hashes'=>0], 'Secretها را با AES-256-GCM و Recovery Codeها را فقط به‌صورت Hash نگهداری کن.', [], 'داده 2FA به‌صورت قابل بازیابی یا فرمت نامعتبر ذخیره شده است.', 'مهاجم دارای دسترسی دیتابیس می‌تواند کنترل دومرحله‌ای را دور بزند.', [], 'A02:2021 Cryptographic Failures', 'CWE-312', 'Two-factor authentication', 'confirmed', 'database');
            }
            return qa_security_result('passed', 'ذخیره‌سازی 2FA و Recovery Codeها امن است.', 'info', ['enabled_users'=>count($secrets),'bad_recovery_hashes'=>0], 'encrypted and hashed', null, [], null, null, [], 'A02:2021 Cryptographic Failures', 'CWE-312', 'Two-factor authentication', 'high', 'database');
        });

        $add('security.deep.ip_cidr_runtime', 'security', 'اعتبارسنجی IP Allowlist', 'IPv4 و IPv6/CIDR با نمونه‌های مثبت و منفی بررسی می‌شوند.', static function (): array {
            $checks = [
                security_ip_matches_cidr('192.168.1.20', '192.168.1.0/24') === true,
                security_ip_matches_cidr('192.168.2.20', '192.168.1.0/24') === false,
                security_ip_matches_cidr('2001:db8::5', '2001:db8::/32') === true,
                security_normalize_cidr('10.0.0.0/8') === '10.0.0.0/8',
                security_normalize_cidr('not-an-ip') === null,
            ];
            return !in_array(false, $checks, true)
                ? qa_security_result('passed', 'منطق IP/CIDR نمونه‌های امنیتی را درست پردازش کرد.', 'info', $checks, array_fill(0, count($checks), true), null, [], null, null, [], 'A01:2021 Broken Access Control', 'CWE-284', 'Admin IP allowlist', 'confirmed', 'runtime')
                : qa_security_result('failed', 'یک یا چند سناریوی IP/CIDR نتیجه نادرست داشت.', 'high', $checks, array_fill(0, count($checks), true), 'توابع security_ip_matches_cidr و security_normalize_cidr را اصلاح کن.', [], 'محاسبه Range یا Prefix شبکه دقیق نیست.', 'IP غیرمجاز ممکن است اجازه دسترسی بگیرد یا مدیر مجاز مسدود شود.', [], 'A01:2021 Broken Access Control', 'CWE-284', 'Admin IP allowlist', 'confirmed', 'runtime');
        });

        $add('security.deep.owner_invariant', 'security', 'وجود مالک فعال پلتفرم', 'وجود حداقل یک Owner فعال و متصل به کاربر Super Admin بررسی می‌شود.', static function () use ($pdo): array {
            if (!qa_table_exists($pdo, 'admin_roles')) return qa_security_result('skipped', 'جداول نقش مدیریتی نصب نشده‌اند.', 'high');
            $count = (int)$pdo->query("SELECT COUNT(*) FROM users u INNER JOIN admin_roles r ON r.id=u.admin_role_id WHERE u.role='super_admin' AND u.is_active=1 AND r.code='owner' AND r.is_active=1")->fetchColumn();
            return $count >= 1
                ? qa_security_result('passed', 'حداقل یک مالک فعال وجود دارد.', 'info', $count, '>= 1', null, [], null, null, [], 'A01:2021 Broken Access Control', 'CWE-269', 'Admin roles', 'high', 'database')
                : qa_security_result('failed', 'مالک فعال برای بازیابی و مدیریت سامانه وجود ندارد.', 'critical', $count, '>= 1', 'یک حساب Super Admin فعال را به نقش Owner متصل کن.', [], 'Invariant نقش مالک شکسته شده است.', 'ممکن است مدیریت امنیت و دسترسی‌ها قفل شود.', [], 'A01:2021 Broken Access Control', 'CWE-269', 'Admin roles', 'confirmed', 'database');
        });

        $add('security.deep.permission_orphans', 'security', 'یکپارچگی Permissionها', 'Permissionهای بدون نقش و اتصال نقش‌های غیرفعال بررسی می‌شوند.', static function () use ($pdo): array {
            if (!qa_table_exists($pdo, 'admin_role_permissions')) return qa_security_result('skipped', 'جداول Permission نصب نشده‌اند.', 'high');
            $orphans = (int)$pdo->query("SELECT COUNT(*) FROM admin_role_permissions rp LEFT JOIN admin_roles r ON r.id=rp.role_id LEFT JOIN admin_permissions p ON p.id=rp.permission_id WHERE r.id IS NULL OR p.id IS NULL")->fetchColumn();
            return $orphans === 0
                ? qa_security_result('passed', 'رکورد Orphan در Permissionها وجود ندارد.', 'info', 0, 0, null, [], null, null, [], 'A01:2021 Broken Access Control', 'CWE-284', 'Admin permissions', 'high', 'database')
                : qa_security_result('failed', 'Permission Orphan در دیتابیس وجود دارد.', 'high', $orphans, 0, 'رکوردهای Orphan را حذف و Foreign Keyها را بررسی کن.', [], 'رابطه نقش و Permission یکپارچگی ندارد.', 'مجوزها ممکن است غیرقابل پیش‌بینی یا قابل دورزدن شوند.', [], 'A01:2021 Broken Access Control', 'CWE-284', 'Admin permissions', 'confirmed', 'database');
        });

        $add('security.deep.super_admin_endpoint_guards', 'security', 'Guard همه Endpointهای Super Admin', 'وجود Authentication و Permission Guard در تمام Endpointهای مدیریتی اسکن می‌شود.', static function () use ($backendRoot, $projectRoot): array {
            $files = qa_security_files($backendRoot . '/api/super-admin', ['php']);
            $missing = [];
            foreach ($files as $file) {
                $name = basename($file);
                if ($name === '.gitkeep') continue;
                $content = (string)@file_get_contents($file);
                $hasAuth = str_contains($content, 'require_auth(');
                $hasPermission = str_contains($content, 'require_admin_permission(') || admin_permission_for_script($name) !== null;
                if (!$hasAuth || !$hasPermission) {
                    $missing[] = ['file'=>qa_security_relative($file, $projectRoot),'auth'=>$hasAuth,'permission'=>$hasPermission];
                }
            }
            return $missing === []
                ? qa_security_result('passed', 'تمام Endpointهای Super Admin دارای Guard هستند.', 'info', count($files), count($files), null, [], null, null, [], 'A01:2021 Broken Access Control', 'CWE-862', 'Super Admin APIs', 'high', 'static')
                : qa_security_result('failed', 'Endpoint مدیریتی بدون Guard کامل پیدا شد.', 'critical', count($missing), 0, 'در هر Endpoint، require_auth و Permission اختصاصی اعمال کن.', [], 'برخی مسیرهای مدیریت بدون کنترل دسترسی صریح هستند.', 'کاربر کم‌مجوز ممکن است عملیات مدیریتی انجام دهد.', $missing, 'A01:2021 Broken Access Control', 'CWE-862', 'Super Admin APIs', 'confirmed', 'static');
        });

        $add('security.deep.customer_agent_auth_guards', 'security', 'Guard APIهای مشتری و اپراتور', 'وجود require_auth در Endpointهای Customer و Agent بررسی می‌شود.', static function () use ($backendRoot, $projectRoot): array {
            $files = array_merge(
                qa_security_files($backendRoot . '/api/customer', ['php']),
                qa_security_files($backendRoot . '/api/agent', ['php'])
            );
            $missing = [];
            foreach ($files as $file) {
                if (str_ends_with($file, '.backup.php')) continue;
                $content = (string)@file_get_contents($file);
                if (!str_contains($content, 'require_auth(')) $missing[] = qa_security_relative($file, $projectRoot);
            }
            return $missing === []
                ? qa_security_result('passed', 'تمام APIهای مشتری و اپراتور Authentication دارند.', 'info', count($files), count($files), null, [], null, null, [], 'A01:2021 Broken Access Control', 'CWE-306', 'Customer/Agent APIs', 'high', 'static')
                : qa_security_result('failed', 'API بدون Authentication پیدا شد.', 'critical', count($missing), 0, 'require_auth و Role/Site guard را به فایل‌های گزارش‌شده اضافه کن.', [], 'Endpoint بدون احراز هویت در مسیر خصوصی قرار دارد.', 'داده مشتری یا عملیات پیام‌رسان ممکن است بدون Login قابل دسترسی باشد.', $missing, 'A01:2021 Broken Access Control', 'CWE-306', 'Customer/Agent APIs', 'confirmed', 'static');
        });

        $add('security.deep.sensitive_confirmation_guards', 'security', 'تأیید عملیات حساس', 'مسیرهای حساس از نظر تأیید رمز فعلی مدیر بررسی می‌شوند.', static function () use ($backendRoot, $projectRoot): array {
            $expected = [
                'api/super-admin/customer-impersonation-start.php',
                'api/super-admin/admin-password-reset.php',
                'api/super-admin/operations-maintenance-update.php',
                'api/super-admin/qa-run-create.php',
            ];
            $missing = [];
            foreach ($expected as $relative) {
                $path = $backendRoot . '/' . $relative;
                $content = is_file($path) ? (string)file_get_contents($path) : '';
                if (!str_contains($content, 'require_sensitive_confirmation(')) $missing[] = $relative;
            }
            return $missing === []
                ? qa_security_result('passed', 'عملیات حساس تأیید مجدد رمز دارند.', 'info', $expected, $expected, null, [], null, null, [], 'A01:2021 Broken Access Control', 'CWE-620', 'Sensitive admin operations', 'high', 'static')
                : qa_security_result('failed', 'عملیات حساس بدون تأیید مجدد پیدا شد.', 'high', $missing, [], 'require_sensitive_confirmation را به مسیرهای گزارش‌شده اضافه کن.', [], 'عملیات پرریسک فقط به نشست موجود اعتماد می‌کند.', 'در صورت سرقت نشست، مهاجم می‌تواند عملیات مخرب انجام دهد.', [], 'A01:2021 Broken Access Control', 'CWE-620', 'Sensitive admin operations', 'confirmed', 'static');
        });

        $add('security.deep.tenant_site_isolation_runtime', 'security', 'جداسازی Site بین دو Tenant', 'دسترسی Customer Admin و Agent بین دو Tenant به‌صورت Runtime بررسی می‌شود.', static function () use ($pdo): array {
            $suffix = substr(bin2hex(random_bytes(8)), 0, 12);
            $result = qa_with_rollback($pdo, static function () use ($pdo, $suffix): array {
                $a = qa_synthetic_context($pdo, $suffix . 'a');
                $b = qa_synthetic_context($pdo, $suffix . 'b');
                $adminA = ['id'=>$a['adminId'],'tenant_id'=>$a['tenantId'],'role'=>'customer_admin'];
                $agentA = ['id'=>$a['agentId'],'tenant_id'=>$a['tenantId'],'role'=>'agent'];
                return [
                    'admin_own'=>user_can_access_site($pdo, $adminA, $a['siteId']),
                    'admin_other'=>user_can_access_site($pdo, $adminA, $b['siteId']),
                    'agent_own'=>user_can_access_site($pdo, $agentA, $a['siteId']),
                    'agent_other'=>user_can_access_site($pdo, $agentA, $b['siteId']),
                ];
            });
            $ok = $result['admin_own'] && !$result['admin_other'] && $result['agent_own'] && !$result['agent_other'];
            return $ok
                ? qa_security_result('passed', 'دسترسی بین دو Tenant جدا باقی ماند.', 'info', $result, ['admin_own'=>true,'admin_other'=>false,'agent_own'=>true,'agent_other'=>false], null, [], null, null, [], 'A01:2021 Broken Access Control', 'CWE-639', 'Tenant/site isolation', 'confirmed', 'runtime')
                : qa_security_result('failed', 'Tenant Isolation در دسترسی Site شکست خورد.', 'critical', $result, ['admin_own'=>true,'admin_other'=>false,'agent_own'=>true,'agent_other'=>false], 'user_can_access_site و تمام Queryهای Site را بر tenant_id محدود کن.', [], 'کنترل Site ID به Tenant کاربر متصل نیست.', 'نشت داده و کنترل سایت مشتری دیگر ممکن است رخ دهد.', [], 'A01:2021 Broken Access Control', 'CWE-639', 'Tenant/site isolation', 'confirmed', 'runtime');
        });

        $add('security.deep.cross_tenant_database_integrity', 'security', 'یکپارچگی داده چندمستاجری', 'رابطه Tenant/Site در Visitor، Conversation، User و Session بررسی می‌شود.', static function () use ($pdo, $scope): array {
            $issues = [];
            if (qa_table_exists($pdo, 'visitors')) {
                $issues['visitors_without_site'] = (int)$pdo->query('SELECT COUNT(*) FROM visitors v LEFT JOIN sites s ON s.id=v.site_id WHERE s.id IS NULL')->fetchColumn();
            }
            if (qa_table_exists($pdo, 'conversations')) {
                $issues['conversation_visitor_site_mismatch'] = (int)$pdo->query('SELECT COUNT(*) FROM conversations c INNER JOIN visitors v ON v.id=c.visitor_id WHERE v.site_id<>c.site_id')->fetchColumn();
            }
            if (qa_table_exists($pdo, 'visitor_sessions')) {
                $issues['visitor_session_site_mismatch'] = (int)$pdo->query('SELECT COUNT(*) FROM visitor_sessions vs INNER JOIN visitors v ON v.id=vs.visitor_id WHERE v.site_id<>vs.site_id')->fetchColumn();
            }
            if (qa_table_exists($pdo, 'agent_site_access')) {
                $issues['agent_site_tenant_mismatch'] = (int)$pdo->query("SELECT COUNT(*) FROM agent_site_access asa INNER JOIN users u ON u.id=asa.user_id INNER JOIN sites s ON s.id=asa.site_id WHERE u.tenant_id IS NULL OR u.tenant_id<>s.tenant_id")->fetchColumn();
            }
            $total = array_sum($issues);
            return $total === 0
                ? qa_security_result('passed', 'ناسازگاری چندمستاجری در روابط اصلی پیدا نشد.', 'info', $issues, 'all zero', null, [], null, null, [], 'A01:2021 Broken Access Control', 'CWE-639', 'Multi-tenant database', 'high', 'database')
                : qa_security_result('failed', 'رکوردهای ناسازگار بین Tenant و Site پیدا شد.', 'critical', $issues, 'all zero', 'رکوردهای گزارش‌شده را اصلاح و Foreign Key/Validation ایجاد را سخت‌گیرانه کن.', [], 'شناسه‌های مرتبط به Site/Tenant متفاوت اشاره می‌کنند.', 'ممکن است داده یک مشتری در گزارش یا API مشتری دیگر دیده شود.', $issues, 'A01:2021 Broken Access Control', 'CWE-639', 'Multi-tenant database', 'confirmed', 'database');
        });

        $add('security.deep.site_key_strength', 'security', 'قدرت و یکتایی Site Key', 'طول، تکراری نبودن و مقدار خالی Site Keyها بررسی می‌شود.', static function () use ($pdo): array {
            $weak = $pdo->query("SELECT id,site_key FROM sites WHERE site_key IS NULL OR CHAR_LENGTH(site_key)<32 LIMIT 50")->fetchAll();
            $duplicates = $pdo->query("SELECT site_key,COUNT(*) total FROM sites WHERE site_key IS NOT NULL AND site_key<>'' GROUP BY site_key HAVING COUNT(*)>1 LIMIT 50")->fetchAll();
            if ($weak !== [] || $duplicates !== []) {
                return qa_security_result('failed', 'Site Key ضعیف یا تکراری پیدا شد.', 'critical', ['weak'=>$weak,'duplicates'=>$duplicates], ['weak'=>[],'duplicates'=>[]], 'برای هر سایت کلید تصادفی حداقل ۳۲ کاراکتری و Unique تولید کن.', [], 'Site Key قابل حدس یا مشترک است.', 'مهاجم می‌تواند تنظیمات Widget یا گفتگو را به سایت دیگری منتسب کند.', [], 'A07:2021 Identification and Authentication Failures', 'CWE-330', 'Widget site keys', 'confirmed', 'database');
            }
            return qa_security_result('passed', 'تمام Site Keyها طول و یکتایی مناسب دارند.', 'info', 'unique >=32 chars', 'unique >=32 chars', null, [], null, null, [], 'A07:2021 Identification and Authentication Failures', 'CWE-330', 'Widget site keys', 'high', 'database');
        });

        $add('security.deep.impersonation_controls', 'security', 'کنترل ورود موقت', 'Hash Ticket، انقضا، مصرف یک‌بار و ثبت Session بررسی می‌شود.', static function () use ($pdo, $backendRoot): array {
            if (!qa_table_exists($pdo, 'admin_impersonations')) return qa_security_result('skipped', 'جدول ورود موقت نصب نشده است.', 'high');
            $columns = ['ticket_hash','ticket_expires_at','used_at','expires_at','status','target_user_id','admin_user_id'];
            $missing = array_values(array_filter($columns, static fn(string $column): bool => !qa_column_exists($pdo, 'admin_impersonations', $column)));
            $exchange = (string)@file_get_contents($backendRoot . '/api/auth/impersonation-exchange.php');
            $sourceOk = str_contains($exchange, "status='issued'") && str_contains($exchange, 'ticket_expires_at') && str_contains($exchange, 'used_at');
            $badRows = (int)$pdo->query("SELECT COUNT(*) FROM admin_impersonations WHERE status='issued' AND (ticket_hash IS NULL OR CHAR_LENGTH(ticket_hash)<64 OR ticket_expires_at IS NULL)")->fetchColumn();
            if ($missing !== [] || !$sourceOk || $badRows > 0) {
                return qa_security_result('failed', 'کنترل‌های ورود موقت ناقص هستند.', 'critical', ['missing_columns'=>$missing,'single_use_source'=>$sourceOk,'bad_issued_rows'=>$badRows], ['missing_columns'=>[],'single_use_source'=>true,'bad_issued_rows'=>0], 'Ticket را فقط Hash‌شده، کوتاه‌عمر و یک‌بارمصرف نگهداری کن و Exchange را اتمیک انجام بده.', [], 'چرخه ورود موقت یکی از شروط مصرف/انقضا را اعمال نمی‌کند.', 'Ticket دزدیده‌شده ممکن است مجدداً استفاده شود یا نشست طولانی بسازد.', [], 'A07:2021 Identification and Authentication Failures', 'CWE-294', 'Admin impersonation', 'confirmed', 'hybrid');
            }
            return qa_security_result('passed', 'ورود موقت دارای Hash، انقضا و مصرف یک‌بار است.', 'info', ['columns'=>'ok','source'=>'ok','bad_rows'=>0], 'all controls present', null, [], null, null, [], 'A07:2021 Identification and Authentication Failures', 'CWE-294', 'Admin impersonation', 'high', 'hybrid');
        });

        $add('security.deep.upload_protection', 'security', 'حفاظت پوشه Upload', 'وجود .htaccess، جلوگیری از اجرا و فایل اجرایی موجود بررسی می‌شود.', static function () use ($backendRoot): array {
            $dirs = [$backendRoot . '/uploads', $backendRoot . '/storage/uploads'];
            $missingProtection = [];
            $executables = [];
            foreach ($dirs as $dir) {
                if (!is_dir($dir)) continue;
                $htaccess = $dir . '/.htaccess';
                $content = is_file($htaccess) ? (string)file_get_contents($htaccess) : '';
                if (!str_contains($content, 'Options -Indexes') || !str_contains($content, 'FilesMatch')) $missingProtection[] = $dir;
                foreach (qa_security_files($dir, ['php','phtml','phar','cgi','pl','py','exe','js','mjs','html','svg']) as $file) {
                    $name = strtolower(basename($file));
                    if ($name === 'index.html') {
                        $guardContent = (string) @file_get_contents($file);
                        if (filesize($file) <= 512 && !preg_match('/<script|<iframe|<object|<embed|<\?php/i', $guardContent)) {
                            continue;
                        }
                    }
                    $executables[] = qa_security_relative($file, $backendRoot);
                    if (count($executables) >= 30) break 2;
                }
            }
            if ($missingProtection !== [] || $executables !== []) {
                return qa_security_result('failed', 'پوشه Upload حفاظت کافی ندارد یا فایل اجرایی در آن وجود دارد.', 'critical', ['unprotected'=>$missingProtection,'executables'=>$executables], ['unprotected'=>[],'executables'=>[]], 'اجرای Script و Directory Listing را مسدود و فایل‌های اجرایی را حذف کن.', [], 'فایل کاربر می‌تواند به‌عنوان کد یا محتوای فعال سرو شود.', 'آپلود مخرب ممکن است به اجرای کد یا XSS ذخیره‌شده منجر شود.', [], 'A04:2021 Insecure Design', 'CWE-434', 'File uploads', 'confirmed', 'hybrid');
            }
            return qa_security_result('passed', 'پوشه‌های Upload محافظت شده و بدون فایل اجرایی هستند.', 'info', 'protected', 'protected', null, [], null, null, [], 'A04:2021 Insecure Design', 'CWE-434', 'File uploads', 'high', 'hybrid');
        });

        $add('security.deep.upload_validation_runtime', 'security', 'اعتبارسنجی نام و Payload فایل', 'پسوند دوگانه و Payload اجرایی با فایل موقت بررسی می‌شود.', static function (): array {
            $path = tempnam(sys_get_temp_dir(), 'qa-upload-');
            if ($path === false) return qa_security_result('error', 'ساخت فایل موقت ناموفق بود.', 'medium');
            file_put_contents($path, "\xFF\xD8\xFF<?php echo 'x'; ?>");
            try {
                $checks = [
                    'double_extension' => file_name_has_dangerous_extension('image.jpg.php'),
                    'null_like_name' => file_name_has_dangerous_extension('avatar.phtml.jpg'),
                    'payload' => file_has_forbidden_payload($path),
                    'safe_name' => !file_name_has_dangerous_extension('avatar.jpg'),
                ];
            } finally {
                @unlink($path);
            }
            $ok = !in_array(false, $checks, true);
            return $ok
                ? qa_security_result('passed', 'نام و Payloadهای خطرناک رد شدند.', 'info', $checks, array_fill_keys(array_keys($checks), true), null, [], null, null, [], 'A04:2021 Insecure Design', 'CWE-434', 'File uploads', 'confirmed', 'runtime')
                : qa_security_result('failed', 'اعتبارسنجی Upload یک Payload خطرناک را تشخیص نداد.', 'critical', $checks, array_fill_keys(array_keys($checks), true), 'لیست پسوندهای خطرناک و اسکن محتوای فایل را اصلاح کن.', [], 'Validation فایل فقط به نام یا MIME اعلام‌شده اعتماد می‌کند.', 'آپلود Script یا فایل فعال ممکن می‌شود.', [], 'A04:2021 Insecure Design', 'CWE-434', 'File uploads', 'confirmed', 'runtime');
        });

        $add('security.deep.backup_source_files', 'security', 'فایل Backup در مسیر اجرایی', 'فایل‌های backup/old/copy در Backend API اسکن می‌شوند.', static function () use ($backendRoot, $projectRoot): array {
            $matches = [];
            foreach (qa_security_files($backendRoot . '/api', []) as $file) {
                $name = strtolower(basename($file));
                if (preg_match('/\.(backup|bak|old|orig|copy)(\.|$)|backup\.php$|\.php~$/i', $name)) {
                    $matches[] = qa_security_relative($file, $projectRoot);
                }
            }
            return $matches === []
                ? qa_security_result('passed', 'فایل Backup در مسیر API پیدا نشد.', 'info', 0, 0, null, [], null, null, [], 'A05:2021 Security Misconfiguration', 'CWE-530', 'Backend source files', 'high', 'static')
                : qa_security_result('failed', 'فایل Backup در مسیر عمومی/اجرایی پیدا شد.', 'high', $matches, [], 'فایل‌ها را خارج از Web Root منتقل یا حذف کن.', [], 'نسخه‌های قدیمی Source در مسیر قابل دسترسی باقی مانده‌اند.', 'Source Code یا Endpoint قدیمی و آسیب‌پذیر ممکن است افشا/اجرا شود.', $matches, 'A05:2021 Security Misconfiguration', 'CWE-530', 'Backend source files', 'confirmed', 'static');
        });

        $add('security.deep.sensitive_public_files', 'security', 'فایل حساس در Web Root', 'وجود .env، SQL Dump، ZIP و کلید خصوصی در مسیرهای عمومی بررسی می‌شود.', static function () use ($projectRoot): array {
            $roots = [$projectRoot . '/backend/public', $projectRoot . '/backend/api', $projectRoot . '/frontend/public', $projectRoot . '/widget'];
            $matches = [];
            foreach ($roots as $root) {
                foreach (qa_security_files($root, []) as $file) {
                    $name = strtolower(basename($file));
                    if (preg_match('/(^\.env|\.sql$|\.sqlite$|\.zip$|\.tar$|\.gz$|\.pem$|\.key$|id_rsa)/i', $name)) {
                        $matches[] = qa_security_relative($file, $projectRoot);
                        if (count($matches) >= 30) break 2;
                    }
                }
            }
            return $matches === []
                ? qa_security_result('passed', 'فایل حساس در مسیر عمومی پیدا نشد.', 'info', 0, 0, null, [], null, null, [], 'A05:2021 Security Misconfiguration', 'CWE-552', 'Public web roots', 'high', 'static')
                : qa_security_result('failed', 'فایل حساس در مسیر عمومی پیدا شد.', 'critical', $matches, [], 'فایل‌ها را فوراً از Web Root خارج و دسترسی وب‌سرور را محدود کن.', [], 'Artifact یا Secret داخل مسیر قابل سرو قرار دارد.', 'دیتابیس، کلیدها یا Source Code ممکن است مستقیماً دانلود شود.', $matches, 'A05:2021 Security Misconfiguration', 'CWE-552', 'Public web roots', 'confirmed', 'static');
        });

        $add('security.deep.error_detail_leak_scan', 'security', 'افشای جزئیات Exception در API', 'ارسال مستقیم getMessage در پاسخ JSON اسکن می‌شود.', static function () use ($backendRoot, $projectRoot): array {
            $files = qa_security_files($backendRoot . '/api', ['php']);
            $matches = qa_security_scan_files($files, '/[\'\"]error[\'\"]\s*=>\s*\$[A-Za-z_][A-Za-z0-9_]*->getMessage\s*\(/', $projectRoot, 40);
            return $matches === []
                ? qa_security_result('passed', 'Exception Message مستقیم در پاسخ API پیدا نشد.', 'info', 0, 0, null, [], null, null, [], 'A05:2021 Security Misconfiguration', 'CWE-209', 'API error responses', 'high', 'static')
                : qa_security_result('failed', 'جزئیات Exception در پاسخ API قابل افشا است.', 'high', count($matches), 0, 'در Production فقط Request ID و پیام عمومی برگردان؛ جزئیات را در Log امن ثبت کن.', [], 'برخی catchها مقدار getMessage را در JSON خروجی قرار می‌دهند.', 'Query، مسیر فایل یا ساختار داخلی سامانه ممکن است افشا شود.', $matches, 'A05:2021 Security Misconfiguration', 'CWE-209', 'API error responses', 'confirmed', 'static');
        });

        $add('security.deep.sql_interpolation_scan', 'security', 'Queryهای SQL مشکوک', 'Interpolation متغیر داخل query/exec/prepare اسکن می‌شود.', static function () use ($backendRoot, $projectRoot): array {
            $files = array_merge(qa_security_files($backendRoot . '/api', ['php']), qa_security_files($backendRoot . '/includes', ['php']));
            $matches = qa_security_scan_files($files, '/(?:query|exec|prepare)\s*\(\s*[\'\"][^\'\"]*(?:\$[A-Za-z_]|\{\$)/', $projectRoot, 40);
            if ($matches === []) {
                return qa_security_result('passed', 'Interpolation مستقیم متغیر در SQL پیدا نشد.', 'info', 0, 0, null, [], null, null, [], 'A03:2021 Injection', 'CWE-89', 'Database queries', 'medium', 'static');
            }
            return qa_security_result('warning', 'Queryهای دارای Interpolation برای بازبینی دستی پیدا شدند.', 'medium', count($matches), 0, 'اطمینان حاصل کن فقط Fragmentهای ثابت/Whitelist وارد SQL می‌شوند و تمام داده‌ها Parameterized هستند.', [], 'اسکن استاتیک نمی‌تواند امن‌بودن منشأ متغیر را قطعی تعیین کند.', 'در صورت ورود داده کاربر به SQL، Injection ممکن است رخ دهد.', $matches, 'A03:2021 Injection', 'CWE-89', 'Database queries', 'medium', 'static', 5.0);
        });

        $add('security.deep.frontend_xss_sinks', 'security', 'Sinkهای XSS در Frontend/Widget', 'innerHTML و dangerouslySetInnerHTML برای بازبینی امنیتی اسکن می‌شوند.', static function () use ($frontendRoot, $widgetRoot, $projectRoot): array {
            $files = array_merge(qa_security_files($frontendRoot, ['ts','tsx','js','jsx']), qa_security_files($widgetRoot, ['js']));
            $matches = qa_security_scan_files($files, '/dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML\s*\(/', $projectRoot, 40);
            return $matches === []
                ? qa_security_result('passed', 'Sink مستقیم HTML در کد رابط پیدا نشد.', 'info', 0, 0, null, [], null, null, [], 'A03:2021 Injection', 'CWE-79', 'Frontend/Widget rendering', 'high', 'static')
                : qa_security_result('warning', 'Sinkهای HTML نیازمند بازبینی دستی پیدا شدند.', 'high', count($matches), 0, 'داده کاربر را با textContent/React escaping نمایش بده و برای HTML ضروری Sanitizer معتبر استفاده کن.', [], 'innerHTML یا API مشابه می‌تواند داده کنترل‌نشده را به DOM وارد کند.', 'XSS ذخیره‌شده یا بازتابی ممکن است Token و اطلاعات پنل را سرقت کند.', $matches, 'A03:2021 Injection', 'CWE-79', 'Frontend/Widget rendering', 'medium', 'static', 7.0);
        });

        $add('security.deep.frontend_token_storage', 'security', 'محل ذخیره Token پنل', 'استفاده از localStorage/sessionStorage برای Access Token بررسی می‌شود.', static function () use ($frontendRoot, $projectRoot): array {
            $api = $frontendRoot . '/lib/api.ts';
            $content = is_file($api) ? (string)file_get_contents($api) : '';
            $usesWebStorage = str_contains($content, 'localStorage.setItem("auth_token"') || str_contains($content, "localStorage.setItem('auth_token'");
            return !$usesWebStorage
                ? qa_security_result('passed', 'Access Token در localStorage ذخیره نمی‌شود.', 'info', 'not found', 'HttpOnly cookie or memory', null, [], null, null, [], 'A07:2021 Identification and Authentication Failures', 'CWE-922', 'Frontend authentication', 'medium', 'static')
                : qa_security_result('warning', 'Access Token در localStorage ذخیره می‌شود.', 'high', 'localStorage', 'HttpOnly Secure SameSite cookie', 'برای Production به Cookie امن HttpOnly مهاجرت کن و CSRF Token اضافه کن.', [], 'Token قابل خواندن توسط JavaScript صفحه است.', 'در صورت XSS، مهاجم می‌تواند Token را استخراج کند.', ['file'=>qa_security_relative($api, $projectRoot)], 'A07:2021 Identification and Authentication Failures', 'CWE-922', 'Frontend authentication', 'confirmed', 'static', 7.5);
        });

        $add('security.deep.rate_limit_coverage', 'security', 'پوشش Rate Limit مسیرهای حساس', 'Login، ارسال پیام، شروع گفتگو، Upload و ورود موقت اسکن می‌شوند.', static function () use ($backendRoot): array {
            $expected = [
                'api/auth/login.php',
                'api/auth/verify-2fa.php',
                'api/widget/conversation-start.php',
                'api/widget/message-send.php',
                'api/widget/attachment-send.php',
                'api/super-admin/customer-impersonation-start.php',
            ];
            $missing = [];
            foreach ($expected as $relative) {
                $path = $backendRoot . '/' . $relative;
                $content = is_file($path) ? (string)file_get_contents($path) : '';
                if (!str_contains($content, 'enforce_rate_limit(')) $missing[] = $relative;
            }
            return $missing === []
                ? qa_security_result('passed', 'مسیرهای حساس Rate Limit دارند.', 'info', $expected, $expected, null, [], null, null, [], 'A07:2021 Identification and Authentication Failures', 'CWE-307', 'Rate limiting', 'high', 'static')
                : qa_security_result('failed', 'مسیر حساس بدون Rate Limit پیدا شد.', 'high', $missing, [], 'برای مسیرهای گزارش‌شده Rate Limit مبتنی بر IP/User/Site اضافه کن.', [], 'درخواست‌های حساس بدون محدودیت دفعات قابل ارسال هستند.', 'Brute Force، Spam یا مصرف منابع ممکن است رخ دهد.', [], 'A07:2021 Identification and Authentication Failures', 'CWE-307', 'Rate limiting', 'confirmed', 'static');
        });

        $add('security.deep.sensitive_log_scan', 'security', 'داده حساس در Log', 'Logهای اخیر برای Token، Password و Secret با خروجی Redacted بررسی می‌شوند.', static function () use ($backendRoot, $projectRoot): array {
            $logRoot = $backendRoot . '/storage/logs';
            if (!is_dir($logRoot)) return qa_security_result('skipped', 'پوشه Log وجود ندارد.', 'low');
            $files = qa_security_files($logRoot, ['log','txt']);
            usort($files, static fn(string $a, string $b): int => filemtime($b) <=> filemtime($a));
            $files = array_slice($files, 0, 20);
            $patterns = [
                'jwt' => '/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/',
                'password' => '/password\s*[=:]\s*[^\s,;]+/i',
                'secret' => '/(?:JWT_SECRET|APP_ENCRYPTION_KEY)\s*[=:]\s*[^\s]+/i',
            ];
            $evidence = [];
            foreach ($files as $file) {
                $content = @file_get_contents($file, false, null, 0, 2_000_000);
                if ($content === false) continue;
                foreach ($patterns as $type => $pattern) {
                    if (preg_match($pattern, $content)) {
                        $evidence[] = ['file'=>qa_security_relative($file, $projectRoot),'pattern'=>$type,'value'=>'[REDACTED]'];
                    }
                }
            }
            return $evidence === []
                ? qa_security_result('passed', 'الگوی Secret یا Token در Logهای بررسی‌شده پیدا نشد.', 'info', 0, 0, null, [], null, null, [], 'A09:2021 Security Logging and Monitoring Failures', 'CWE-532', 'Application logs', 'medium', 'static')
                : qa_security_result('failed', 'داده حساس در Log پیدا شد.', 'critical', count($evidence), 0, 'Logها را پاک‌سازی، Secretها را Rotate و Redaction مرکزی اضافه کن.', [], 'مقادیر احراز هویت یا Secret در Log نوشته شده‌اند.', 'هر فرد دارای دسترسی Log می‌تواند حساب یا سرویس را تصاحب کند.', $evidence, 'A09:2021 Security Logging and Monitoring Failures', 'CWE-532', 'Application logs', 'confirmed', 'static');
        });

        $add('security.deep.attachment_tenant_integrity', 'security', 'یکپارچگی Attachment و Tenant', 'تطابق Attachment→Message→Conversation→Site بررسی می‌شود.', static function () use ($pdo): array {
            if (!qa_table_exists($pdo, 'message_attachments')) return qa_security_result('skipped', 'جدول Attachment وجود ندارد.', 'medium');
            $columns = $pdo->query("SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='message_attachments'")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('message_id', $columns, true)) return qa_security_result('skipped', 'Attachment به message_id متصل نیست.', 'medium');
            $orphans = (int)$pdo->query('SELECT COUNT(*) FROM message_attachments a LEFT JOIN messages m ON m.id=a.message_id LEFT JOIN conversations c ON c.id=m.conversation_id LEFT JOIN sites s ON s.id=c.site_id WHERE m.id IS NULL OR c.id IS NULL OR s.id IS NULL')->fetchColumn();
            return $orphans === 0
                ? qa_security_result('passed', 'تمام Attachmentها زنجیره مالکیت معتبر دارند.', 'info', 0, 0, null, [], null, null, [], 'A01:2021 Broken Access Control', 'CWE-639', 'Attachments', 'high', 'database')
                : qa_security_result('failed', 'Attachment بدون زنجیره مالکیت معتبر پیدا شد.', 'high', $orphans, 0, 'رکوردهای Orphan را پاک و دانلود فایل را با Site/Tenant پیام کنترل کن.', [], 'فایل به پیام یا گفتگوی معتبر متصل نیست.', 'فایل ممکن است بدون کنترل مالکیت دانلود شود.', [], 'A01:2021 Broken Access Control', 'CWE-639', 'Attachments', 'confirmed', 'database');
        });

        $add('security.deep.production_https_urls', 'security', 'HTTPS در محیط Production', 'URLهای عمومی و API در Production باید HTTPS باشند.', static function (): array {
            $urls = [
                'APP_URL'=>(string)app_env('APP_URL',''),
                'FRONTEND_URL'=>(string)app_env('FRONTEND_URL',''),
                'API_URL'=>(string)app_env('API_URL',''),
                'WIDGET_SCRIPT_URL'=>(string)app_env('WIDGET_SCRIPT_URL',''),
            ];
            if (!app_is_production()) return qa_security_result('passed', 'محیط Production نیست؛ الزام HTTPS فقط در استقرار نهایی اعمال می‌شود.', 'info', app_env('APP_ENV','local'), 'production: https', null, [], null, null, [], 'A02:2021 Cryptographic Failures', 'CWE-319', 'Transport security', 'high', 'configuration');
            $bad = array_filter($urls, static fn(string $url): bool => $url === '' || !str_starts_with(strtolower($url), 'https://'));
            return $bad === []
                ? qa_security_result('passed', 'تمام URLهای Production از HTTPS استفاده می‌کنند.', 'info', $urls, 'https://', null, [], null, null, [], 'A02:2021 Cryptographic Failures', 'CWE-319', 'Transport security', 'confirmed', 'configuration')
                : qa_security_result('failed', 'یک یا چند URL Production امن نیست.', 'critical', $bad, 'https://', 'تمام URLهای عمومی، API و Widget را به HTTPS منتقل و Redirect اجباری فعال کن.', [], 'ترافیک بخشی از سامانه رمزنگاری نمی‌شود.', 'Token، پیام و اطلاعات کاربر در مسیر شبکه قابل شنود یا تغییر است.', $urls, 'A02:2021 Cryptographic Failures', 'CWE-319', 'Transport security', 'confirmed', 'configuration');
        });

        $add('security.deep.jwt_ttl_policy', 'security', 'سیاست طول عمر JWT', 'طول عمر Access Token و سقف مجاز بررسی می‌شود.', static function (): array {
            $ttl = (int)app_config('jwt_expiration_seconds', 0);
            $max = (int)app_config('jwt_max_ttl_seconds', 0);
            if ($ttl <= 0 || $max <= 0 || $ttl > $max || $max > 604800) {
                return qa_security_result('failed', 'سیاست طول عمر JWT نامعتبر یا بیش‌ازحد طولانی است.', 'high', ['ttl'=>$ttl,'max'=>$max], ['ttl>0','ttl<=max','max<=604800'], 'Access Token را کوتاه‌عمر کن و سقف آن را حداکثر ۷ روز قرار بده؛ برای Production ترجیحاً ۱۵ تا ۶۰ دقیقه.', [], 'Token برای بازه طولانی معتبر می‌ماند یا محدودیت TTL ناسازگار است.', 'در صورت سرقت Token، پنجره سوءاستفاده افزایش می‌یابد.', [], 'A07:2021 Identification and Authentication Failures', 'CWE-613', 'JWT policy', 'confirmed', 'configuration');
            }
            if ($ttl > 86400) {
                return qa_security_result('warning', 'Access Token بیش از ۲۴ ساعت اعتبار دارد.', 'medium', $ttl, '<= 86400 recommended', 'برای Production TTL کوتاه‌تر و Refresh Session کنترل‌شده در نظر بگیر.', [], 'پیش‌فرض فعلی برای راحتی توسعه طولانی است.', 'در صورت سرقت Token، دسترسی مهاجم طولانی‌تر باقی می‌ماند.', [], 'A07:2021 Identification and Authentication Failures', 'CWE-613', 'JWT policy', 'confirmed', 'configuration', 5.5);
            }
            return qa_security_result('passed', 'سیاست TTL توکن در محدوده مناسب است.', 'info', ['ttl'=>$ttl,'max'=>$max], 'ttl<=86400 and max<=604800', null, [], null, null, [], 'A07:2021 Identification and Authentication Failures', 'CWE-613', 'JWT policy', 'high', 'configuration');
        });

        $add('security.deep.expired_session_cleanup', 'security', 'پاک‌سازی نشست‌های منقضی', 'نشست‌های منقضی و لغونشده قدیمی بررسی می‌شوند.', static function () use ($pdo): array {
            if (!qa_table_exists($pdo,'auth_sessions')) return qa_security_result('skipped','جدول نشست نصب نشده است.','medium');
            $count=(int)$pdo->query("SELECT COUNT(*) FROM auth_sessions WHERE revoked_at IS NULL AND expires_at<DATE_SUB(NOW(),INTERVAL 24 HOUR)")->fetchColumn();
            return $count===0
                ? qa_security_result('passed','نشست منقضی قدیمی بدون پاک‌سازی پیدا نشد.','info',0,0,null,[],null,null,[],'A07:2021 Identification and Authentication Failures','CWE-613','Session cleanup','high','database')
                : qa_security_result('warning','نشست‌های منقضی قدیمی در دیتابیس باقی مانده‌اند.','medium',$count,0,'Cron پاک‌سازی نشست‌ها را فعال و Retention مشخص کن.',[],'Cleanup دوره‌ای نشست‌ها اجرا نمی‌شود یا ناقص است.','انباشت داده و تحلیل امنیتی نشست‌ها دشوار می‌شود.',[],'A07:2021 Identification and Authentication Failures','CWE-613','Session cleanup','confirmed','database',4.5);
        });

        $add('security.deep.admin_two_factor_coverage', 'security', 'پوشش 2FA مدیران', 'فعال‌بودن ورود دومرحله‌ای برای Owner و مدیران فعال بررسی می‌شود.', static function () use ($pdo): array {
            if (!qa_column_exists($pdo,'users','two_factor_enabled')) return qa_security_result('skipped','قابلیت 2FA نصب نشده است.','high');
            $rows=$pdo->query("SELECT u.id,u.email,r.code role_code,u.two_factor_enabled FROM users u LEFT JOIN admin_roles r ON r.id=u.admin_role_id WHERE u.role='super_admin' AND u.is_active=1")->fetchAll();
            $owners=[];$others=[];
            foreach($rows as $row){if((int)$row['two_factor_enabled']===1)continue; if(($row['role_code']??'')==='owner')$owners[]=['id'=>(int)$row['id'],'email'=>$row['email']];else $others[]=['id'=>(int)$row['id'],'email'=>$row['email']];}
            if($owners!==[])return qa_security_result('failed','یک یا چند Owner فعال بدون 2FA هستند.','high',['owners'=>$owners,'other_admins'=>$others],['owners'=>[]],'ورود دومرحله‌ای را برای تمام Ownerها اجباری کن.',[],'حساب‌های با بالاترین دسترسی فقط با رمز محافظت می‌شوند.','تصاحب حساب Owner می‌تواند کل پلتفرم را در اختیار مهاجم قرار دهد.',[],'A07:2021 Identification and Authentication Failures','CWE-308','Super Admin accounts','confirmed','database');
            if($others!==[])return qa_security_result('warning','برخی مدیران فعال 2FA ندارند.','medium',$others,[],'برای نقش‌های مدیریتی 2FA اجباری یا سیاست مرحله‌ای تعریف کن.',[],'پوشش 2FA برای همه مدیران کامل نیست.','ریسک تصاحب حساب مدیریتی افزایش می‌یابد.',[],'A07:2021 Identification and Authentication Failures','CWE-308','Super Admin accounts','confirmed','database',5.5);
            return qa_security_result('passed','تمام مدیران فعال 2FA دارند.','info',count($rows),count($rows),null,[],null,null,[],'A07:2021 Identification and Authentication Failures','CWE-308','Super Admin accounts','high','database');
        });

        $add('security.deep.login_lockout_policy', 'security', 'سیاست قفل ورود', 'Threshold و مدت قفل تلاش ناموفق بررسی می‌شود.', static function (): array {
            $threshold=(int)app_env('ADMIN_LOGIN_LOCK_THRESHOLD',5);$minutes=(int)app_env('ADMIN_LOGIN_LOCK_MINUTES',15);
            $ok=$threshold>=3&&$threshold<=10&&$minutes>=5&&$minutes<=1440;
            return $ok
                ? qa_security_result('passed','سیاست قفل ورود در محدوده مناسب است.','info',['threshold'=>$threshold,'minutes'=>$minutes],['threshold'=>3 . '-' . 10,'minutes'=>5 . '-' . 1440],null,[],null,null,[],'A07:2021 Identification and Authentication Failures','CWE-307','Admin login','high','configuration')
                : qa_security_result('failed','سیاست قفل ورود بسیار ضعیف یا نامعتبر است.','high',['threshold'=>$threshold,'minutes'=>$minutes],['threshold'=>3 . '-' . 10,'minutes'=>5 . '-' . 1440],'ADMIN_LOGIN_LOCK_THRESHOLD و ADMIN_LOGIN_LOCK_MINUTES را اصلاح کن.',[],'محدودیت تلاش ورود بازدارندگی کافی ندارد.','Brute Force رمز مدیر آسان‌تر می‌شود یا حساب‌ها بیش‌ازحد قفل می‌شوند.',[],'A07:2021 Identification and Authentication Failures','CWE-307','Admin login','confirmed','configuration');
        });

        $add('security.deep.widget_cors_guards', 'security', 'CORS و Origin ویجت', 'تمام Endpointهای Widget از Guard اختصاصی Widget استفاده می‌کنند.', static function () use ($backendRoot,$projectRoot): array {
            $files=qa_security_files($backendRoot.'/api/widget',['php']);$missing=[];
            foreach($files as $file){$content=(string)@file_get_contents($file);if(!str_contains($content,'widget-cors.php'))$missing[]=qa_security_relative($file,$projectRoot);}
            return $missing===[]
                ? qa_security_result('passed','تمام Endpointهای Widget Guard اختصاصی CORS دارند.','info',count($files),count($files),null,[],null,null,[],'A05:2021 Security Misconfiguration','CWE-942','Widget APIs','high','static')
                : qa_security_result('failed','Endpoint ویجت بدون Guard اختصاصی پیدا شد.','high',$missing,[],'widget-cors.php و اعتبارسنجی Site Origin را اعمال کن.',[],'برخی مسیرهای عمومی ویجت Origin و Site را کنترل نمی‌کنند.','سایت غیرمجاز می‌تواند API ویجت را مصرف یا جعل کند.',$missing,'A05:2021 Security Misconfiguration','CWE-942','Widget APIs','confirmed','static');
        });

        $add('security.deep.http_method_guards', 'security', 'محدودیت Method در API', 'Endpointهای PHP از نظر کنترل REQUEST_METHOD اسکن می‌شوند.', static function () use ($backendRoot,$projectRoot): array {
            $files=qa_security_files($backendRoot.'/api',['php']);$missing=[];
            foreach($files as $file){if(str_contains(str_replace('\\','/',$file),'/internal/'))continue;$content=(string)@file_get_contents($file);if(!str_contains($content,'REQUEST_METHOD')){$missing[]=qa_security_relative($file,$projectRoot);if(count($missing)>=40)break;}}
            return $missing===[]
                ? qa_security_result('passed','تمام Endpointهای بررسی‌شده Method Guard دارند.','info',count($files),count($files),null,[],null,null,[],'A04:2021 Insecure Design','CWE-749','API routing','medium','static')
                : qa_security_result('warning','Endpoint بدون کنترل صریح Method پیدا شد.','medium',count($missing),0,'برای هر Endpoint فقط Methodهای لازم را مجاز و بقیه را با 405 رد کن.',[],'مسیر به Method ورودی وابستگی صریح ندارد.','رفتار ناخواسته، Cache اشتباه یا دورزدن کنترل‌ها ممکن است رخ دهد.',$missing,'A04:2021 Insecure Design','CWE-749','API routing','medium','static',4.5);
        });

        $add('security.deep.audit_redaction_source', 'security', 'Redaction داده حساس در Audit', 'لیست کلیدهای حساس و حذف Token/Password از Audit بررسی می‌شود.', static function () use ($backendRoot): array {
            $path=$backendRoot.'/includes/admin-audit.php';$content=is_file($path)?(string)file_get_contents($path):'';
            $required=['password','authorization','cookie','two_factor_secret','recovery_codes','challenge_token','ticket'];$missing=array_values(array_filter($required,static fn(string $key):bool=>!str_contains(strtolower($content),strtolower($key))));
            return $missing===[]
                ? qa_security_result('passed','Redaction کلیدهای حساس در Audit تعریف شده است.','info',$required,$required,null,[],null,null,[],'A09:2021 Security Logging and Monitoring Failures','CWE-532','Audit logs','high','static')
                : qa_security_result('failed','برخی کلیدهای حساس از Redaction Audit جا مانده‌اند.','high',$missing,[],'کلیدهای گزارش‌شده را به Sanitizer مرکزی Audit اضافه کن.',[],'Audit ممکن است Payload حساس را کامل ذخیره کند.','Password، Token یا Ticket می‌تواند در گزارش مدیریتی افشا شود.',$missing,'A09:2021 Security Logging and Monitoring Failures','CWE-532','Audit logs','confirmed','static');
        });

        $add('security.deep.critical_foreign_keys', 'security', 'Foreign Keyهای امنیتی', 'رابطه‌های حیاتی چندمستاجری در information_schema بررسی می‌شوند.', static function () use ($pdo): array {
            $expected=[['visitor_sessions','site_id','sites'],['visitor_sessions','visitor_id','visitors'],['messages','conversation_id','conversations'],['auth_sessions','user_id','users'],['agent_site_access','site_id','sites']];$missing=[];
            $stmt=$pdo->prepare("SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name=:table AND column_name=:column AND referenced_table_name=:referenced");
            foreach($expected as [$table,$column,$referenced]){$stmt->execute([':table'=>$table,':column'=>$column,':referenced'=>$referenced]);if((int)$stmt->fetchColumn()<1)$missing[]="$table.$column -> $referenced";}
            return $missing===[]
                ? qa_security_result('passed','Foreign Keyهای حیاتی موجود هستند.','info',$expected,$expected,null,[],null,null,[],'A04:2021 Insecure Design','CWE-666','Database constraints','high','database')
                : qa_security_result('warning','برخی Foreign Keyهای حیاتی وجود ندارند.','medium',$missing,[],'پس از پاک‌سازی داده‌های Orphan، Foreign Keyهای گزارش‌شده را اضافه کن.',[],'یکپارچگی فقط به کد برنامه وابسته است.','رکوردهای ناسازگار و نشت داده در اثر خطای برنامه آسان‌تر رخ می‌دهد.',$missing,'A04:2021 Insecure Design','CWE-666','Database constraints','confirmed','database',5.0);
        });

        return $cases;
    }
}
