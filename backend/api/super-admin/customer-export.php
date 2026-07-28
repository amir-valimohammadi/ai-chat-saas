<?php

declare(strict_types=1);

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/csv.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/admin-audit.php';


if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method not allowed'], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);
$tenantId = filter_var(
    $_GET['tenant_id'] ?? 0,
    FILTER_VALIDATE_INT,
    ['options' => ['default' => 0, 'min_range' => 1]]
);
$format = strtolower((string) ($_GET['format'] ?? 'json'));
if ($tenantId <= 0 || !in_array($format, ['json', 'csv'], true)) {
    json_response(['success' => false, 'message' => 'پارامتر خروجی معتبر نیست.'], 422);
}

try {
    $tenantStmt = $pdo->prepare(
        'SELECT t.*,p.name AS plan_name
         FROM tenants t
         LEFT JOIN plans p ON p.id=t.plan_id
         WHERE t.id=:id
         LIMIT 1'
    );
    $tenantStmt->execute([':id' => $tenantId]);
    $tenant = $tenantStmt->fetch();
    if (!$tenant) {
        json_response(['success' => false, 'message' => 'مشتری پیدا نشد.'], 404);
    }

    $queries = [
        'sites' => 'SELECT id,name,domain,site_key,is_active,ai_mode,created_at FROM sites WHERE tenant_id=:id ORDER BY id',
        'users' => "SELECT id,name,email,phone,role,is_active,last_login_at,created_at FROM users WHERE tenant_id=:id ORDER BY id",
        'subscriptions' => 'SELECT id,plan_id,status,billing_cycle,starts_at,ends_at,auto_renew,price,currency,created_at FROM tenant_subscriptions WHERE tenant_id=:id ORDER BY id',
        'payments' => 'SELECT id,subscription_id,amount,currency,payment_method,reference_number,status,paid_at,description,created_at FROM subscription_payments WHERE tenant_id=:id ORDER BY id',
        'notes' => 'SELECT n.id,n.body,n.is_pinned,n.created_at,u.name AS author_name FROM tenant_notes n INNER JOIN users u ON u.id=n.author_user_id WHERE n.tenant_id=:id ORDER BY n.id',
        'onboarding' => 'SELECT item_key,title,status,due_at,completed_at FROM tenant_onboarding_items WHERE tenant_id=:id ORDER BY sort_order,id',
    ];

    $data = ['exported_at' => date(DATE_ATOM), 'tenant' => $tenant];
    foreach ($queries as $key => $sql) {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':id' => $tenantId]);
        $data[$key] = $stmt->fetchAll();
    }

    $tagsStmt = $pdo->prepare(
        'SELECT tt.name,tt.slug,tt.color
         FROM tenant_tag_assignments a
         INNER JOIN tenant_tags tt ON tt.id=a.tag_id
         WHERE a.tenant_id=:id
         ORDER BY tt.name'
    );
    $tagsStmt->execute([':id' => $tenantId]);
    $data['tags'] = $tagsStmt->fetchAll();

    admin_audit_log(
        $pdo,
        $user,
        'customer.exported',
        'tenant',
        $tenantId,
        'از اطلاعات مشتری «' . $tenant['name'] . '» خروجی ' . $format . ' گرفته شد.',
        null,
        ['format' => $format],
        ['tenant_id' => $tenantId]
    );

    $safeName = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string) $tenant['name']) ?: 'customer';
    $filename = 'customer-' . $tenantId . '-' . $safeName . '-' . date('Ymd-His') . '.' . $format;
    if (!headers_sent()) {
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
    }

    if ($format === 'json') {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR);
        exit;
    }

    header('Content-Type: text/csv; charset=utf-8');
    echo "\xEF\xBB\xBF";
    $output = fopen('php://output', 'wb');
    if ($output === false) {
        throw new RuntimeException('خروجی CSV قابل ایجاد نیست.');
    }

    $writeRow = static function (array $row) use ($output): void {
        csv_write_row($output, $row);
    };
    $writeRow(['بخش', 'شناسه/کلید', 'عنوان', 'مقدار', 'تاریخ']);

    foreach ($tenant as $key => $value) {
        $writeRow(['tenant', $key, $key, $value, null]);
    }

    foreach (['sites', 'users', 'subscriptions', 'payments', 'notes', 'onboarding', 'tags'] as $section) {
        foreach ($data[$section] as $row) {
            $id = $row['id'] ?? ($row['item_key'] ?? ($row['slug'] ?? ''));
            $title = $row['name'] ?? ($row['title'] ?? ($row['body'] ?? ''));
            $date = $row['created_at'] ?? ($row['paid_at'] ?? ($row['completed_at'] ?? null));
            $writeRow([
                $section,
                $id,
                $title,
                json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR),
                $date,
            ]);
        }
    }

    fclose($output);
    exit;
} catch (Throwable $e) {
    error_log('[CUSTOMER_EXPORT] ' . $e->getMessage());
    json_response(['success' => false, 'message' => 'ساخت خروجی مشتری ناموفق بود.'], 500);
}
