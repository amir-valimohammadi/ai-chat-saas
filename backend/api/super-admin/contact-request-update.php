<?php

// مسیر فایل: backend/api/super-admin/contact-request-update.php
// هدف: تغییر وضعیت، اولویت، خلاصه داخلی و زمان پیگیری درخواست

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/contact-requests.php';
require_once __DIR__ . '/../../includes/admin-audit.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if (!in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PATCH'], true)) {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);
$input = get_json_input();
$requestId = (int) ($input['id'] ?? 0);

if ($requestId <= 0) {
    json_response(['success' => false, 'message' => 'شناسه درخواست معتبر نیست.'], 422);
}

$statuses = contact_request_statuses();
$priorities = contact_request_priorities();
$status = contact_request_trim($input['status'] ?? '', 50);
$priority = contact_request_trim($input['priority'] ?? '', 30);
$internalSummary = contact_request_trim($input['internal_summary'] ?? '', 3000);
$followUpRaw = contact_request_trim($input['follow_up_at'] ?? '', 40);
$markContacted = filter_var($input['mark_contacted'] ?? false, FILTER_VALIDATE_BOOLEAN);

if (!array_key_exists($status, $statuses)) {
    json_response(['success' => false, 'message' => 'وضعیت انتخاب‌شده معتبر نیست.'], 422);
}
if (!array_key_exists($priority, $priorities)) {
    json_response(['success' => false, 'message' => 'اولویت انتخاب‌شده معتبر نیست.'], 422);
}

$followUpAt = null;
if ($followUpRaw !== '') {
    $timestamp = strtotime($followUpRaw);
    if ($timestamp === false) {
        json_response(['success' => false, 'message' => 'زمان پیگیری معتبر نیست.'], 422);
    }
    $followUpAt = date('Y-m-d H:i:s', $timestamp);
}

try {
    $currentStmt = $pdo->prepare("SELECT * FROM customer_requests WHERE id = :id LIMIT 1");
    $currentStmt->execute([':id' => $requestId]);
    $current = $currentStmt->fetch();

    if (!$current) {
        json_response(['success' => false, 'message' => 'درخواست پیدا نشد.'], 404);
    }

    if ($current['status'] === 'converted' && $status !== 'converted') {
        json_response(['success' => false, 'message' => 'درخواست تبدیل‌شده را نمی‌توان به وضعیت قبلی برگرداند.'], 422);
    }

    if ($current['status'] !== 'converted' && $status === 'converted') {
        json_response([
            'success' => false,
            'message' => 'برای تبدیل درخواست، از دکمه «ایجاد مشتری از درخواست» استفاده کنید.',
        ], 422);
    }

    $pdo->beginTransaction();

    $updateStmt = $pdo->prepare("\n        UPDATE customer_requests\n        SET status = :status,\n            priority = :priority,\n            internal_summary = :internal_summary,\n            follow_up_at = :follow_up_at,\n            last_contacted_at = CASE WHEN :mark_contacted = 1 THEN NOW() ELSE last_contacted_at END\n        WHERE id = :id\n    ");
    $updateStmt->execute([
        ':status' => $status,
        ':priority' => $priority,
        ':internal_summary' => $internalSummary !== '' ? $internalSummary : null,
        ':follow_up_at' => $followUpAt,
        ':mark_contacted' => $markContacted ? 1 : 0,
        ':id' => $requestId,
    ]);

    if ($current['status'] !== $status) {
        contact_request_insert_event(
            $pdo,
            $requestId,
            'status_changed',
            $user,
            'وضعیت درخواست از «' . ($statuses[$current['status']] ?? $current['status']) . '» به «' . $statuses[$status] . '» تغییر کرد.',
            $current['status'],
            $status
        );
    }

    if ($current['priority'] !== $priority) {
        contact_request_insert_event(
            $pdo,
            $requestId,
            'priority_changed',
            $user,
            'اولویت درخواست به «' . $priorities[$priority] . '» تغییر کرد.',
            null,
            null,
            ['old_priority' => $current['priority'], 'new_priority' => $priority]
        );
    }

    if ($markContacted) {
        contact_request_insert_event(
            $pdo,
            $requestId,
            'contacted',
            $user,
            'تماس با متقاضی ثبت شد.',
            null,
            null,
            ['contact_method' => $current['preferred_contact']]
        );
    }

    admin_audit_log(
        $pdo,
        $user,
        'customer_request.updated',
        'customer_request',
        $requestId,
        'درخواست مشتری «' . $current['tracking_code'] . '» ویرایش شد.',
        [
            'status' => $current['status'],
            'priority' => $current['priority'],
            'follow_up_at' => $current['follow_up_at'],
        ],
        [
            'status' => $status,
            'priority' => $priority,
            'follow_up_at' => $followUpAt,
            'mark_contacted' => $markContacted,
        ]
    );

    $pdo->commit();

    json_response(['success' => true, 'message' => 'درخواست به‌روزرسانی شد.']);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[CONTACT_REQUEST_UPDATE] ' . $e->getMessage());
    json_response(['success' => false, 'message' => 'به‌روزرسانی درخواست ناموفق بود.'], 500);
}
