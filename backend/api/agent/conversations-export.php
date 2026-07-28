<?php

// Export accessible conversations as UTF-8 CSV.

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/csv.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['customer_admin', 'agent']);

$status = trim((string) ($_GET['status'] ?? ''));
$priority = trim((string) ($_GET['priority'] ?? ''));
$query = trim((string) ($_GET['q'] ?? ''));
$archived = trim((string) ($_GET['archived'] ?? '0'));
$siteId = isset($_GET['site_id']) && $_GET['site_id'] !== '' ? (int) $_GET['site_id'] : 0;
$agentId = isset($_GET['assigned_agent_id']) && $_GET['assigned_agent_id'] !== '' ? (int) $_GET['assigned_agent_id'] : 0;
$departmentId = isset($_GET['department_id']) && $_GET['department_id'] !== '' ? (int) $_GET['department_id'] : 0;
$queued = isset($_GET['queued']) && in_array((string) $_GET['queued'], ['1','true'], true);

$conditions = ['sites.tenant_id = :tenant_id'];
$params = [':tenant_id' => (int) $user['tenant_id']];

if ($user['role'] === 'agent') {
    $conditions[] = 'EXISTS (SELECT 1 FROM agent_site_access WHERE agent_site_access.site_id = conversations.site_id AND agent_site_access.user_id = :user_id)';
    $params[':user_id'] = (int) $user['id'];
}
if (in_array($archived, ['0', '1'], true)) {
    $conditions[] = 'conversations.is_archived = :is_archived';
    $params[':is_archived'] = $archived === '1' ? 1 : 0;
}
if ($status !== '') {
    $conditions[] = 'conversations.status = :status';
    $params[':status'] = $status;
}
if ($priority !== '') {
    $conditions[] = 'conversations.priority = :priority';
    $params[':priority'] = $priority;
}
if ($siteId > 0) {
    $conditions[] = 'conversations.site_id = :site_id';
    $params[':site_id'] = $siteId;
}
if ($agentId > 0) {
    $conditions[] = 'conversations.assigned_agent_id = :agent_id';
    $params[':agent_id'] = $agentId;
}
if ($departmentId > 0) {
    $conditions[] = 'conversations.department_id = :department_id';
    $params[':department_id'] = $departmentId;
}
if ($queued) {
    $conditions[] = "conversations.queue_status = 'waiting'";
}
if ($query !== '') {
    $conditions[] = '(visitors.name LIKE :q1 OR visitors.email LIKE :q2 OR visitors.phone LIKE :q3 OR sites.name LIKE :q4 OR conversations.source_page_title LIKE :q5 OR EXISTS (SELECT 1 FROM messages WHERE messages.conversation_id = conversations.id AND messages.deleted_at IS NULL AND messages.content LIKE :q6))';
    foreach (range(1, 6) as $index) {
        $params[':q' . $index] = '%' . $query . '%';
    }
}

try {
    $stmt = $pdo->prepare("
        SELECT
            conversations.id,
            conversations.status,
            conversations.priority,
            conversations.is_pinned,
            conversations.is_archived,
            visitors.name AS visitor_name,
            visitors.email AS visitor_email,
            visitors.phone AS visitor_phone,
            sites.name AS site_name,
            assigned_agent.name AS assigned_agent_name,
            departments.name AS department_name,
            conversations.queue_status, conversations.queue_position, conversations.assignment_method,
            conversations.source_page_title,
            conversations.source_page_url,
            conversations.last_message_at,
            conversations.created_at,
            (SELECT COUNT(*) FROM messages WHERE messages.conversation_id = conversations.id AND messages.deleted_at IS NULL) AS message_count,
            (SELECT COUNT(*) FROM messages m INNER JOIN message_attachments a ON a.message_id = m.id WHERE m.conversation_id = conversations.id AND m.deleted_at IS NULL) AS attachment_count
        FROM conversations
        INNER JOIN sites ON sites.id = conversations.site_id
        INNER JOIN visitors ON visitors.id = conversations.visitor_id
        LEFT JOIN users assigned_agent ON assigned_agent.id = conversations.assigned_agent_id
        LEFT JOIN departments ON departments.id = conversations.department_id
        WHERE " . implode(' AND ', $conditions) . "
        ORDER BY conversations.is_pinned DESC, conversations.last_message_at DESC, conversations.id DESC
        LIMIT 5000
    ");
    $stmt->execute($params);

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="conversations-' . date('Y-m-d-His') . '.csv"');
    header('Cache-Control: no-store');

    $output = fopen('php://output', 'wb');
    fwrite($output, "\xEF\xBB\xBF");
    csv_write_row($output, [
        'شناسه', 'وضعیت', 'اولویت', 'سنجاق‌شده', 'آرشیو', 'نام کاربر', 'ایمیل', 'تلفن',
        'سایت', 'دپارتمان', 'وضعیت صف', 'شماره صف', 'روش اختصاص', 'پشتیبان', 'صفحه ورود', 'آدرس صفحه', 'تعداد پیام', 'تعداد فایل', 'آخرین پیام', 'تاریخ ایجاد'
    ]);

    while ($row = $stmt->fetch()) {
        csv_write_row($output, [
            $row['id'], $row['status'], $row['priority'], (int) $row['is_pinned'], (int) $row['is_archived'],
            $row['visitor_name'], $row['visitor_email'], $row['visitor_phone'], $row['site_name'],
            $row['department_name'], $row['queue_status'], $row['queue_position'], $row['assignment_method'], $row['assigned_agent_name'], $row['source_page_title'], $row['source_page_url'],
            $row['message_count'], $row['attachment_count'], $row['last_message_at'], $row['created_at'],
        ]);
    }
    fclose($output);
    exit;
} catch (Throwable $e) {
    app_log_error($e, ['endpoint' => 'agent/conversations-export.php', 'status_code' => 500]);
    json_response(['success' => false, 'message' => 'CSV export failed'], 500);
}
