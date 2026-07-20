<?php

// مسیر فایل: backend/api/super-admin/contact-request-show.php
// هدف: نمایش جزئیات، یادداشت‌ها و تاریخچه یک درخواست

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/contact-requests.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);

$requestId = (int) ($_GET['id'] ?? 0);
if ($requestId <= 0) {
    json_response(['success' => false, 'message' => 'شناسه درخواست معتبر نیست.'], 422);
}

try {
    $stmt = $pdo->prepare("\n        SELECT\n            cr.*,\n            p.name AS desired_plan_name,\n            t.name AS converted_tenant_name\n        FROM customer_requests cr\n        LEFT JOIN plans p ON p.id = cr.desired_plan_id\n        LEFT JOIN tenants t ON t.id = cr.converted_tenant_id\n        WHERE cr.id = :id\n        LIMIT 1\n    ");
    $stmt->execute([':id' => $requestId]);
    $request = $stmt->fetch();

    if (!$request) {
        json_response(['success' => false, 'message' => 'درخواست پیدا نشد.'], 404);
    }

    $eventsStmt = $pdo->prepare("\n        SELECT id, actor_user_id, actor_name, event_type, note, old_status, new_status, metadata_json, created_at\n        FROM customer_request_events\n        WHERE request_id = :request_id\n        ORDER BY id DESC\n    ");
    $eventsStmt->execute([':request_id' => $requestId]);
    $events = $eventsStmt->fetchAll();

    foreach ($events as &$event) {
        $event['id'] = (int) $event['id'];
        $event['actor_user_id'] = $event['actor_user_id'] !== null ? (int) $event['actor_user_id'] : null;
        $event['metadata'] = $event['metadata_json'] ? json_decode($event['metadata_json'], true) : null;
        unset($event['metadata_json']);
    }
    unset($event);

    $labels = contact_request_labels_payload();
    $request['id'] = (int) $request['id'];
    $request['desired_plan_id'] = $request['desired_plan_id'] !== null ? (int) $request['desired_plan_id'] : null;
    $request['converted_tenant_id'] = $request['converted_tenant_id'] !== null ? (int) $request['converted_tenant_id'] : null;
    $request['sites_count'] = $request['sites_count'] !== null ? (int) $request['sites_count'] : null;
    $request['agents_count'] = $request['agents_count'] !== null ? (int) $request['agents_count'] : null;
    $request['request_type_label'] = $labels['types'][$request['request_type']] ?? $request['request_type'];
    $request['status_label'] = $labels['statuses'][$request['status']] ?? $request['status'];
    $request['priority_label'] = $labels['priorities'][$request['priority']] ?? $request['priority'];
    $request['preferred_contact_label'] = $labels['contact_methods'][$request['preferred_contact']] ?? $request['preferred_contact'];
    $request['whatsapp_phone'] = contact_request_whatsapp_phone((string) $request['normalized_phone']);

    json_response([
        'success' => true,
        'request' => $request,
        'events' => $events,
        'labels' => $labels,
    ]);
} catch (Throwable $e) {
    error_log('[CONTACT_REQUEST_SHOW] ' . $e->getMessage());
    json_response(['success' => false, 'message' => 'دریافت جزئیات درخواست ناموفق بود.'], 500);
}
