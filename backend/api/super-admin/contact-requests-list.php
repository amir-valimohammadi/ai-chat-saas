<?php

// مسیر فایل: backend/api/super-admin/contact-requests-list.php
// هدف: فهرست و فیلتر درخواست‌های عمومی مشتریان برای سوپرادمین

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

$search = contact_request_trim($_GET['search'] ?? '', 120);
$status = contact_request_trim($_GET['status'] ?? '', 50);
$requestType = contact_request_trim($_GET['request_type'] ?? '', 50);
$priority = contact_request_trim($_GET['priority'] ?? '', 30);
$contactMethod = contact_request_trim($_GET['preferred_contact'] ?? '', 20);
$page = max((int) ($_GET['page'] ?? 1), 1);
$perPage = min(max((int) ($_GET['per_page'] ?? 20), 5), 100);
$offset = ($page - 1) * $perPage;

$statuses = contact_request_statuses();
$types = contact_request_types();
$priorities = contact_request_priorities();
$contactMethods = contact_request_contact_methods();

if ($status !== '' && !array_key_exists($status, $statuses)) {
    json_response(['success' => false, 'message' => 'فیلتر وضعیت معتبر نیست.'], 422);
}
if ($requestType !== '' && !array_key_exists($requestType, $types)) {
    json_response(['success' => false, 'message' => 'فیلتر نوع درخواست معتبر نیست.'], 422);
}
if ($priority !== '' && !array_key_exists($priority, $priorities)) {
    json_response(['success' => false, 'message' => 'فیلتر اولویت معتبر نیست.'], 422);
}
if ($contactMethod !== '' && !array_key_exists($contactMethod, $contactMethods)) {
    json_response(['success' => false, 'message' => 'فیلتر روش تماس معتبر نیست.'], 422);
}

$where = [];
$params = [];

if ($search !== '') {
    $where[] = "(\n        cr.tracking_code LIKE :search\n        OR cr.full_name LIKE :search\n        OR cr.phone LIKE :search\n        OR cr.normalized_phone LIKE :search\n        OR cr.business_name LIKE :search\n        OR cr.email LIKE :search\n        OR cr.website_url LIKE :search\n    )";
    $params[':search'] = '%' . $search . '%';
}
if ($status !== '') {
    $where[] = 'cr.status = :status';
    $params[':status'] = $status;
}
if ($requestType !== '') {
    $where[] = 'cr.request_type = :request_type';
    $params[':request_type'] = $requestType;
}
if ($priority !== '') {
    $where[] = 'cr.priority = :priority';
    $params[':priority'] = $priority;
}
if ($contactMethod !== '') {
    $where[] = 'cr.preferred_contact = :preferred_contact';
    $params[':preferred_contact'] = $contactMethod;
}

$whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

try {
    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM customer_requests cr {$whereSql}");
    $countStmt->execute($params);
    $total = (int) $countStmt->fetchColumn();

    $stmt = $pdo->prepare("\n        SELECT\n            cr.*,\n            p.name AS desired_plan_name,\n            t.name AS converted_tenant_name,\n            (\n                SELECT COUNT(*)\n                FROM customer_request_events cre\n                WHERE cre.request_id = cr.id AND cre.event_type = 'note'\n            ) AS notes_count\n        FROM customer_requests cr\n        LEFT JOIN plans p ON p.id = cr.desired_plan_id\n        LEFT JOIN tenants t ON t.id = cr.converted_tenant_id\n        {$whereSql}\n        ORDER BY\n            FIELD(cr.status, 'new', 'reviewing', 'qualified', 'contacted', 'waiting_customer', 'converted', 'closed', 'rejected'),\n            FIELD(cr.priority, 'urgent', 'high', 'normal', 'low'),\n            cr.created_at DESC\n        LIMIT {$perPage} OFFSET {$offset}\n    ");
    $stmt->execute($params);
    $requests = $stmt->fetchAll();

    foreach ($requests as &$request) {
        $request['id'] = (int) $request['id'];
        $request['desired_plan_id'] = $request['desired_plan_id'] !== null ? (int) $request['desired_plan_id'] : null;
        $request['converted_tenant_id'] = $request['converted_tenant_id'] !== null ? (int) $request['converted_tenant_id'] : null;
        $request['sites_count'] = $request['sites_count'] !== null ? (int) $request['sites_count'] : null;
        $request['agents_count'] = $request['agents_count'] !== null ? (int) $request['agents_count'] : null;
        $request['notes_count'] = (int) $request['notes_count'];
        $request['request_type_label'] = $types[$request['request_type']] ?? $request['request_type'];
        $request['status_label'] = $statuses[$request['status']] ?? $request['status'];
        $request['priority_label'] = $priorities[$request['priority']] ?? $request['priority'];
        $request['preferred_contact_label'] = $contactMethods[$request['preferred_contact']] ?? $request['preferred_contact'];
    }
    unset($request);

    $statsStmt = $pdo->query("\n        SELECT\n            COUNT(*) AS total_count,\n            SUM(status = 'new') AS new_count,\n            SUM(status = 'reviewing') AS reviewing_count,\n            SUM(status = 'qualified') AS qualified_count,\n            SUM(status = 'converted') AS converted_count,\n            SUM(status IN ('new','reviewing','contacted','waiting_customer','qualified')) AS open_count,\n            SUM(follow_up_at IS NOT NULL AND follow_up_at <= NOW() AND status NOT IN ('converted','closed','rejected')) AS overdue_follow_up_count\n        FROM customer_requests\n    ");
    $stats = $statsStmt->fetch() ?: [];

    json_response([
        'success' => true,
        'requests' => $requests,
        'pagination' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => max((int) ceil($total / $perPage), 1),
        ],
        'stats' => [
            'total_count' => (int) ($stats['total_count'] ?? 0),
            'new_count' => (int) ($stats['new_count'] ?? 0),
            'reviewing_count' => (int) ($stats['reviewing_count'] ?? 0),
            'qualified_count' => (int) ($stats['qualified_count'] ?? 0),
            'converted_count' => (int) ($stats['converted_count'] ?? 0),
            'open_count' => (int) ($stats['open_count'] ?? 0),
            'overdue_follow_up_count' => (int) ($stats['overdue_follow_up_count'] ?? 0),
        ],
        'labels' => contact_request_labels_payload(),
    ]);
} catch (Throwable $e) {
    error_log('[CONTACT_REQUESTS_LIST] ' . $e->getMessage());
    json_response(['success' => false, 'message' => 'دریافت درخواست‌ها ناموفق بود.'], 500);
}
