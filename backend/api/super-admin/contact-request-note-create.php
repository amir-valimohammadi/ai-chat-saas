<?php

// مسیر فایل: backend/api/super-admin/contact-request-note-create.php
// هدف: ثبت یادداشت داخلی روی درخواست مشتری

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/contact-requests.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);
$input = get_json_input();
$requestId = (int) ($input['id'] ?? 0);
$note = contact_request_trim($input['note'] ?? '', 3000);

if ($requestId <= 0) {
    json_response(['success' => false, 'message' => 'شناسه درخواست معتبر نیست.'], 422);
}
if ($note === '') {
    json_response(['success' => false, 'message' => 'متن یادداشت را وارد کنید.'], 422);
}

try {
    $existsStmt = $pdo->prepare("SELECT id FROM customer_requests WHERE id = :id LIMIT 1");
    $existsStmt->execute([':id' => $requestId]);
    if (!$existsStmt->fetch()) {
        json_response(['success' => false, 'message' => 'درخواست پیدا نشد.'], 404);
    }

    $eventId = contact_request_insert_event($pdo, $requestId, 'note', $user, $note);

    json_response([
        'success' => true,
        'message' => 'یادداشت ثبت شد.',
        'event_id' => $eventId,
    ], 201);
} catch (Throwable $e) {
    error_log('[CONTACT_REQUEST_NOTE_CREATE] ' . $e->getMessage());
    json_response(['success' => false, 'message' => 'ثبت یادداشت ناموفق بود.'], 500);
}
