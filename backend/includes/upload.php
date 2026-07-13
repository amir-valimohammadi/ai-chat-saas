<?php

// مسیر فایل: ai-chat-saas/backend/includes/upload.php
// هدف: آپلود امن فایل‌های چت برای ویجت و پنل پشتیبان

require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/response.php';

if (!function_exists('get_upload_max_bytes')) {
    function get_upload_max_bytes(): int
    {
        return max(1, (int) app_env('UPLOAD_MAX_BYTES', 3 * 1024 * 1024));
    }
}

if (!function_exists('get_upload_max_image_pixels')) {
    function get_upload_max_image_pixels(): int
    {
        return max(1, (int) app_env('UPLOAD_MAX_IMAGE_PIXELS', 12000000));
    }
}

if (!function_exists('get_allowed_upload_types')) {
    function get_allowed_upload_types(): array
    {
        return [
            'jpg' => ['image/jpeg', 'image/pjpeg'],
            'jpeg' => ['image/jpeg', 'image/pjpeg'],
            'png' => ['image/png', 'image/x-png'],
            'gif' => ['image/gif'],
            'webp' => ['image/webp'],
            'pdf' => ['application/pdf', 'application/x-pdf'],
        ];
    }
}

if (!function_exists('get_dangerous_upload_extensions')) {
    function get_dangerous_upload_extensions(): array
    {
        return [
            'php',
            'php3',
            'php4',
            'php5',
            'php7',
            'php8',
            'phtml',
            'phar',
            'cgi',
            'pl',
            'py',
            'rb',
            'sh',
            'bash',
            'bat',
            'cmd',
            'com',
            'exe',
            'dll',
            'so',
            'js',
            'mjs',
            'html',
            'htm',
            'shtml',
            'svg',
            'xml',
            'xhtml',
            'htaccess',
            'user.ini',
            'ini',
            'conf',
        ];
    }
}

if (!function_exists('upload_error_message')) {
    function upload_error_message(int $errorCode): string
    {
        return match ($errorCode) {
            UPLOAD_ERR_INI_SIZE,
            UPLOAD_ERR_FORM_SIZE => 'File is too large',
            UPLOAD_ERR_PARTIAL => 'File was only partially uploaded',
            UPLOAD_ERR_NO_FILE => 'No file was uploaded',
            UPLOAD_ERR_NO_TMP_DIR => 'Upload temporary directory is missing',
            UPLOAD_ERR_CANT_WRITE => 'Failed to write uploaded file',
            UPLOAD_ERR_EXTENSION => 'File upload was blocked by server extension',
            default => 'File upload failed',
        };
    }
}

if (!function_exists('sanitize_original_file_name')) {
    function sanitize_original_file_name(string $name): string
    {
        $name = str_replace('\\', '/', $name);
        $name = basename($name);
        $name = preg_replace('/[\x00-\x1F\x7F]+/u', '', $name);
        $name = preg_replace('/[^\p{L}\p{N}\.\-_ ]+/u', '', $name);
        $name = preg_replace('/\s+/u', ' ', $name);
        $name = trim($name, ". \t\n\r\0\x0B");

        if ($name === '') {
            return 'uploaded-file';
        }

        if (function_exists('mb_substr')) {
            return mb_substr($name, 0, 180, 'UTF-8');
        }

        return substr($name, 0, 180);
    }
}

if (!function_exists('file_name_has_dangerous_extension')) {
    function file_name_has_dangerous_extension(string $name): bool
    {
        $parts = explode('.', strtolower($name));

        if (count($parts) <= 1) {
            return false;
        }

        $dangerousExtensions = get_dangerous_upload_extensions();

        // همه بخش‌های بعد از نام اصلی بررسی می‌شوند تا file.php.jpg هم رد شود.
        array_shift($parts);

        foreach ($parts as $part) {
            if (in_array($part, $dangerousExtensions, true)) {
                return true;
            }
        }

        return false;
    }
}

if (!function_exists('normalize_upload_channel')) {
    function normalize_upload_channel(string $channel): string
    {
        $channel = strtolower(trim($channel));

        if (!preg_match('/^[a-z0-9_-]{1,40}$/', $channel)) {
            return 'shared';
        }

        return $channel;
    }
}

if (!function_exists('get_upload_public_base_url')) {
    function get_upload_public_base_url(): string
    {
        $envUrl = trim((string) app_env('UPLOAD_PUBLIC_URL', ''));

        if ($envUrl !== '') {
            return rtrim($envUrl, '/');
        }

        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        $scheme = $https ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';

        // برای مسیرهایی مثل:
        // /ai-chat-saas/backend/api/widget/attachment-send.php
        // خروجی می‌شود:
        // /ai-chat-saas/backend
        $backendBasePath = dirname($_SERVER['SCRIPT_NAME'] ?? '/ai-chat-saas/backend/api/index.php', 3);

        return $scheme . '://' . $host . rtrim($backendBasePath, '/');
    }
}

if (!function_exists('get_upload_storage_root')) {
    function get_upload_storage_root(): string
    {
        $customRoot = trim((string) app_env('UPLOAD_STORAGE_ROOT', ''));

        if ($customRoot !== '') {
            return rtrim($customRoot, '/\\') . '/chat';
        }

        return dirname(__DIR__) . '/uploads/chat';
    }
}

if (!function_exists('create_directory_or_fail')) {
    function create_directory_or_fail(string $directory): void
    {
        if (is_dir($directory)) {
            return;
        }

        if (!mkdir($directory, 0755, true) && !is_dir($directory)) {
            json_response([
                'success' => false,
                'message' => 'Failed to create upload directory'
            ], 500);
        }
    }
}

if (!function_exists('ensure_upload_protection_files')) {
    function ensure_upload_protection_files(string $directory): void
    {
        create_directory_or_fail($directory);

        $htaccessPath = $directory . '/.htaccess';

        if (!file_exists($htaccessPath)) {
            $content = <<<'HTACCESS'
Options -Indexes

<IfModule mod_php.c>
    php_flag engine off
</IfModule>

RemoveHandler .php .php3 .php4 .php5 .php7 .php8 .phtml .phar .cgi .pl .py .rb .sh .bash .bat .cmd .com .exe .dll .so .js .mjs .html .htm .shtml .svg .xml .xhtml .ini .conf
RemoveType .php .php3 .php4 .php5 .php7 .php8 .phtml .phar .cgi .pl .py .rb .sh .bash .bat .cmd .com .exe .dll .so .js .mjs .html .htm .shtml .svg .xml .xhtml .ini .conf

<FilesMatch "\.(php|php3|php4|php5|php7|php8|phtml|phar|cgi|pl|py|rb|sh|bash|bat|cmd|com|exe|dll|so|js|mjs|html|htm|shtml|svg|xml|xhtml|ini|conf)$">
    <IfModule mod_authz_core.c>
        Require all denied
    </IfModule>
    <IfModule !mod_authz_core.c>
        Order allow,deny
        Deny from all
    </IfModule>
</FilesMatch>

<FilesMatch "^\.">
    <IfModule mod_authz_core.c>
        Require all denied
    </IfModule>
    <IfModule !mod_authz_core.c>
        Order allow,deny
        Deny from all
    </IfModule>
</FilesMatch>
HTACCESS;

            if (file_put_contents($htaccessPath, $content, LOCK_EX) === false) {
                json_response([
                    'success' => false,
                    'message' => 'Failed to protect upload directory'
                ], 500);
            }

            @chmod($htaccessPath, 0644);
        }

        $indexPath = $directory . '/index.html';

        if (!file_exists($indexPath)) {
            @file_put_contents($indexPath, '');
            @chmod($indexPath, 0644);
        }
    }
}

if (!function_exists('read_upload_prefix')) {
    function read_upload_prefix(string $tmpPath, int $length = 65536): string
    {
        $handle = fopen($tmpPath, 'rb');

        if (!$handle) {
            return '';
        }

        $chunk = fread($handle, $length);
        fclose($handle);

        return (string) $chunk;
    }
}

if (!function_exists('read_upload_scan_content')) {
    function read_upload_scan_content(string $tmpPath): string
    {
        $fileSize = filesize($tmpPath);

        if ($fileSize === false || $fileSize <= 0) {
            return '';
        }

        // چون حجم آپلود را محدود کرده‌ایم، اسکن کل فایل قابل قبول است.
        // اگر بعداً حجم آپلود را خیلی زیاد کردی، این بخش را به اسکن chunk-based تبدیل کن.
        $maxScanBytes = min((int) $fileSize, get_upload_max_bytes());
        $content = file_get_contents($tmpPath, false, null, 0, $maxScanBytes);

        return $content === false ? '' : $content;
    }
}

if (!function_exists('file_has_forbidden_payload')) {
    function file_has_forbidden_payload(string $tmpPath): bool
    {
        $content = read_upload_scan_content($tmpPath);

        if ($content === '') {
            return true;
        }

        // فایل اجرایی ویندوز اگر با MZ شروع شود رد می‌شود.
        if (strncmp($content, "MZ", 2) === 0) {
            return true;
        }

        $lowerContent = strtolower($content);

        $blockedPatterns = [
            '<?php',
            '<?=',
            '<script',
            '<svg',
            '<html',
            '<!doctype html',
            '#!/bin/',
            '#!/usr/bin/',
        ];

        foreach ($blockedPatterns as $pattern) {
            if (str_contains($lowerContent, $pattern)) {
                return true;
            }
        }

        return false;
    }
}

if (!function_exists('pdf_has_active_content')) {
    function pdf_has_active_content(string $tmpPath): bool
    {
        $content = read_upload_scan_content($tmpPath);

        if ($content === '') {
            return true;
        }

        $content = strtolower($content);

        $blockedPatterns = [
            '/javascript',
            '/js',
            '/openaction',
            '/aa',
            '/launch',
            '/embeddedfile',
            '/xfa',
            '/richmedia',
            '/submitform',
            '/importdata',
        ];

        foreach ($blockedPatterns as $pattern) {
            if (str_contains($content, strtolower($pattern))) {
                return true;
            }
        }

        return false;
    }
}

if (!function_exists('validate_uploaded_file_or_fail')) {
    function validate_uploaded_file_or_fail(array $file): array
    {
        if (
            !isset($file['error']) ||
            is_array($file['error']) ||
            is_array($file['name'] ?? null) ||
            is_array($file['tmp_name'] ?? null)
        ) {
            json_response([
                'success' => false,
                'message' => 'Invalid file upload'
            ], 422);
        }

        $uploadError = (int) $file['error'];

        if ($uploadError !== UPLOAD_ERR_OK) {
            json_response([
                'success' => false,
                'message' => upload_error_message($uploadError)
            ], 422);
        }

        if (empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
            json_response([
                'success' => false,
                'message' => 'Invalid uploaded file'
            ], 422);
        }

        $tmpPath = (string) $file['tmp_name'];
        $actualSize = filesize($tmpPath);

        if ($actualSize === false) {
            json_response([
                'success' => false,
                'message' => 'Could not read uploaded file'
            ], 422);
        }

        $actualSize = (int) $actualSize;
        $maxBytes = get_upload_max_bytes();

        if ($actualSize <= 0 || $actualSize > $maxBytes) {
            json_response([
                'success' => false,
                'message' => 'File size is not allowed'
            ], 422);
        }

        if (isset($file['size']) && (int) $file['size'] > $maxBytes) {
            json_response([
                'success' => false,
                'message' => 'File size is not allowed'
            ], 422);
        }

        $originalName = sanitize_original_file_name($file['name'] ?? 'uploaded-file');

        if (file_name_has_dangerous_extension($originalName)) {
            json_response([
                'success' => false,
                'message' => 'File name is not allowed'
            ], 422);
        }

        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        $allowedTypes = get_allowed_upload_types();

        if ($extension === '' || !array_key_exists($extension, $allowedTypes)) {
            json_response([
                'success' => false,
                'message' => 'File extension is not allowed'
            ], 422);
        }

        if (in_array($extension, get_dangerous_upload_extensions(), true)) {
            json_response([
                'success' => false,
                'message' => 'File type is not allowed'
            ], 422);
        }

        if (file_has_forbidden_payload($tmpPath)) {
            json_response([
                'success' => false,
                'message' => 'File content is not allowed'
            ], 422);
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($tmpPath);

        if (!$mimeType || !in_array($mimeType, $allowedTypes[$extension], true)) {
            json_response([
                'success' => false,
                'message' => 'File MIME type is not allowed'
            ], 422);
        }

        if (str_starts_with($mimeType, 'image/')) {
            $imageInfo = @getimagesize($tmpPath);

            if ($imageInfo === false) {
                json_response([
                    'success' => false,
                    'message' => 'Invalid image file'
                ], 422);
            }

            $width = (int) ($imageInfo[0] ?? 0);
            $height = (int) ($imageInfo[1] ?? 0);
            $imageMime = $imageInfo['mime'] ?? '';

            if ($imageMime !== '' && !in_array($imageMime, $allowedTypes[$extension], true)) {
                json_response([
                    'success' => false,
                    'message' => 'Image MIME type is not allowed'
                ], 422);
            }

            if ($width <= 0 || $height <= 0 || ($width * $height) > get_upload_max_image_pixels()) {
                json_response([
                    'success' => false,
                    'message' => 'Image dimensions are not allowed'
                ], 422);
            }
        }

        if ($extension === 'pdf') {
            $signature = read_upload_prefix($tmpPath, 5);

            if ($signature !== '%PDF-') {
                json_response([
                    'success' => false,
                    'message' => 'Invalid PDF file'
                ], 422);
            }

            if ($mimeType !== 'application/pdf' && $mimeType !== 'application/x-pdf') {
                json_response([
                    'success' => false,
                    'message' => 'PDF MIME type is not allowed'
                ], 422);
            }

            if (pdf_has_active_content($tmpPath)) {
                json_response([
                    'success' => false,
                    'message' => 'PDF content is not allowed'
                ], 422);
            }
        }

        return [
            'original_name' => $originalName,
            'extension' => $extension,
            'mime_type' => $mimeType,
            'file_size' => $actualSize,
        ];
    }
}

if (!function_exists('save_chat_attachment')) {
    function save_chat_attachment(array $file, string $channel = 'shared'): array
    {
        $validated = validate_uploaded_file_or_fail($file);

        $safeChannel = normalize_upload_channel($channel);
        $uploadRoot = get_upload_storage_root();
        $channelDirectory = $uploadRoot . '/' . $safeChannel;
        $datePath = date('Y/m');
        $targetDirectory = $channelDirectory . '/' . $datePath;

        ensure_upload_protection_files($uploadRoot);
        ensure_upload_protection_files($channelDirectory);
        ensure_upload_protection_files($targetDirectory);

        $storedName = bin2hex(random_bytes(24)) . '.' . $validated['extension'];
        $targetPath = $targetDirectory . '/' . $storedName;

        $realUploadRoot = realpath($uploadRoot);
        $realTargetDirectory = realpath($targetDirectory);

        if (
            !$realUploadRoot ||
            !$realTargetDirectory ||
            !str_starts_with($realTargetDirectory, $realUploadRoot)
        ) {
            json_response([
                'success' => false,
                'message' => 'Invalid upload path'
            ], 500);
        }

        if (file_exists($targetPath)) {
            json_response([
                'success' => false,
                'message' => 'Upload file name collision'
            ], 500);
        }

        if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
            json_response([
                'success' => false,
                'message' => 'Failed to save uploaded file'
            ], 500);
        }

        @chmod($targetPath, 0644);

        $relativePath = 'uploads/chat/' . $safeChannel . '/' . $datePath . '/' . $storedName;
        $fileUrl = get_upload_public_base_url() . '/' . $relativePath;

        return [
            'original_name' => $validated['original_name'],
            'stored_name' => $storedName,
            'file_path' => realpath($targetPath) ?: $targetPath,
            'file_url' => $fileUrl,
            'mime_type' => $validated['mime_type'],
            'file_size' => $validated['file_size'],
        ];
    }
}

if (!function_exists('public_attachment_payload')) {
    function public_attachment_payload(array $attachment): array
    {
        return [
            'original_name' => $attachment['original_name'],
            'file_url' => $attachment['file_url'],
            'mime_type' => $attachment['mime_type'],
            'file_size' => (int) $attachment['file_size'],
        ];
    }
}