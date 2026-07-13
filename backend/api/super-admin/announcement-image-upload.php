<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/announcement-image-upload.php
// هدف: آپلود تصویر اعلان توسط Super Admin

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../config/app.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed'
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);

if (!isset($_FILES['image'])) {
    json_response([
        'success' => false,
        'message' => 'Image is required'
    ], 422);
}

$file = $_FILES['image'];

try {
    if (!isset($file['error']) || is_array($file['error']) || $file['error'] !== UPLOAD_ERR_OK) {
        json_response([
            'success' => false,
            'message' => 'Image upload failed'
        ], 422);
    }

    if (empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
        json_response([
            'success' => false,
            'message' => 'Invalid uploaded image'
        ], 422);
    }

    $maxBytes = (int) app_env('ANNOUNCEMENT_IMAGE_MAX_BYTES', 2 * 1024 * 1024);

    if ((int) $file['size'] <= 0 || (int) $file['size'] > $maxBytes) {
        json_response([
            'success' => false,
            'message' => 'Image size is not allowed'
        ], 422);
    }

    $originalName = basename($file['name'] ?? 'announcement-image');
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

    $allowed = [
        'jpg' => ['image/jpeg'],
        'jpeg' => ['image/jpeg'],
        'png' => ['image/png'],
        'gif' => ['image/gif'],
        'webp' => ['image/webp'],
    ];

    if ($extension === '' || !isset($allowed[$extension])) {
        json_response([
            'success' => false,
            'message' => 'Only jpg, png, gif and webp images are allowed'
        ], 422);
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($file['tmp_name']);

    if (!$mimeType || !in_array($mimeType, $allowed[$extension], true)) {
        json_response([
            'success' => false,
            'message' => 'Image MIME type is not allowed'
        ], 422);
    }

    if (@getimagesize($file['tmp_name']) === false) {
        json_response([
            'success' => false,
            'message' => 'Invalid image file'
        ], 422);
    }

    $uploadRoot = dirname(__DIR__, 2) . '/uploads/announcements';
    $datePath = date('Y/m');
    $targetDirectory = $uploadRoot . '/' . $datePath;

    if (!is_dir($targetDirectory)) {
        if (!mkdir($targetDirectory, 0755, true) && !is_dir($targetDirectory)) {
            json_response([
                'success' => false,
                'message' => 'Failed to create upload directory'
            ], 500);
        }
    }

    $storedName = bin2hex(random_bytes(24)) . '.' . $extension;
    $targetPath = $targetDirectory . '/' . $storedName;

    if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
        json_response([
            'success' => false,
            'message' => 'Failed to save uploaded image'
        ], 500);
    }

    chmod($targetPath, 0644);

    $publicBaseUrl = trim((string) app_env('UPLOAD_PUBLIC_URL', ''));

    if ($publicBaseUrl === '') {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        $scheme = $https ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $backendBasePath = dirname($_SERVER['SCRIPT_NAME'] ?? '/ai-chat-saas/backend/api/index.php', 3);
        $publicBaseUrl = $scheme . '://' . $host . rtrim($backendBasePath, '/');
    }

    $relativePath = 'uploads/announcements/' . $datePath . '/' . $storedName;
    $imageUrl = rtrim($publicBaseUrl, '/') . '/' . $relativePath;

    json_response([
        'success' => true,
        'message' => 'Image uploaded successfully',
        'image_url' => $imageUrl,
    ], 201);
} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to upload image',
        'error' => $e->getMessage()
    ], 500);
}