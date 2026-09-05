<?php

declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/auth-cookie.php';
require_once __DIR__ . '/../includes/auth-session.php';

if (app_is_production()) {
    fwrite(STDERR, "Refusing synthetic customer-plan fixtures in production.\n");
    exit(2);
}

// Uses the real HTTP endpoint, but only newly-created synthetic customers/plans.
// Authentication is issued locally: this tests authorization/CSRF, not the login flow.
$tenantId = 0;
$adminId = 0;
$planIds = [];
$count = 0;
$assert = static function (bool $condition, string $message) use (&$count): void {
    if (!$condition) throw new RuntimeException($message);
    $count++;
};
$suffix = bin2hex(random_bytes(8));
$request = static function (array $payload, array $cookies, ?string $csrf, string $endpoint = 'customer-plan-update.php'): array {
    $headers = ['Content-Type: application/json', 'Accept: application/json',
        'Origin: ' . app_config('frontend_url')];
    $pairs = [];
    foreach ($cookies as $name => $value) $pairs[] = $name . '=' . $value;
    $headers[] = 'Cookie: ' . implode('; ', $pairs);
    if ($csrf !== null) $headers[] = 'X-CSRF-Token: ' . $csrf;
    $curl = curl_init(rtrim((string) app_config('api_url'), '/') . '/super-admin/' . $endpoint);
    try {
        curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_THROW_ON_ERROR)]);
        $body = curl_exec($curl);
        if ($body === false) throw new RuntimeException('Customer-plan HTTP request failed.');
        return ['status' => (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE),
            'data' => json_decode($body, true, 512, JSON_THROW_ON_ERROR)];
    } finally { curl_close($curl); }
};

try {
    $roleId = (int) $pdo->query("SELECT id FROM admin_roles WHERE code='owner' AND is_active=1 LIMIT 1")->fetchColumn();
    $assert($roleId > 0, 'An active owner role is required.');
    foreach ([1, 1, 0] as $active) {
        $pdo->prepare('INSERT INTO plans(name,price_monthly,is_active) VALUES(:name,1000,:active)')
            ->execute([':name' => 'Release QA ' . $suffix, ':active' => $active]);
        $planIds[] = (int) $pdo->lastInsertId();
    }
    $pdo->prepare("INSERT INTO tenants(name,owner_name,owner_email,status) VALUES(:name,'Release QA',:email,'active')")
        ->execute([':name' => 'Release QA ' . $suffix, ':email' => $suffix . '@example.invalid']);
    $tenantId = (int) $pdo->lastInsertId();
    $pdo->prepare("INSERT INTO users(name,email,password_hash,role,admin_role_id,is_active) VALUES('Release QA',:email,:password,'super_admin',:role,1)")
        ->execute([':email' => 'release-admin-' . $suffix . '@example.invalid',
            ':password' => password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT), ':role' => $roleId]);
    $adminId = (int) $pdo->lastInsertId();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id=:id');
    $stmt->execute([':id' => $adminId]);
    $session = auth_issue_session($pdo, $stmt->fetch());
    $csrf = bin2hex(random_bytes(32));
    $cookies = [auth_session_cookie_name() => $session['token'], auth_csrf_cookie_name() => $csrf];
    $payload = ['tenant_id' => $tenantId, 'plan_id' => $planIds[0], 'expected_plan_id' => 0,
        'billing_cycle' => 'monthly', 'price' => '1250.50', 'confirmed' => true];
    $assert($request($payload, $cookies, null)['status'] === 403, 'Missing CSRF was accepted.');
    foreach ([['confirmed' => false], ['billing_cycle' => 'manual'], ['price' => '-1'],
        ['price' => '1e3'], ['price' => '12.345'], ['price' => '1000000000000'], ['price' => null]] as $invalid) {
        $assert($request(array_replace($payload, $invalid), $cookies, $csrf)['status'] === 422, 'Invalid or unconfirmed billing terms accepted.');
    }
    $assert($request(['tenant_id' => $tenantId, 'plan_id' => $planIds[0]], $cookies, $csrf)['status'] === 422,
        'Legacy request without billing confirmation accepted.');
    $assert($request($payload, $cookies, $csrf)['status'] === 200, 'Initial plan assignment failed.');
    $payload['plan_id'] = $planIds[1];
    $assert($request($payload, $cookies, $csrf)['status'] === 409, 'Stale customer plan was overwritten.');
    $payload['expected_plan_id'] = $planIds[0];
    $payload['billing_cycle'] = 'quarterly';
    $payload['price'] = '3000.25';
    $assert($request($payload, $cookies, $csrf)['status'] === 200, 'Changing existing plan failed.');
    $rows = $pdo->prepare('SELECT plan_id,status,billing_cycle,price,currency,auto_renew,starts_at,ends_at,ends_at > starts_at AS valid_dates FROM tenant_subscriptions WHERE tenant_id=:tenant ORDER BY id');
    $rows->execute([':tenant' => $tenantId]);
    $subscriptions = $rows->fetchAll();
    $assert(count($subscriptions) === 2, 'Expected exactly two subscription records.');
    $assert($subscriptions[0]['status'] === 'cancelled', 'Previous subscription was not cancelled.');
    $assert($subscriptions[1]['status'] === 'active' && (int) $subscriptions[1]['plan_id'] === $planIds[1], 'New subscription is not active.');
    $assert($subscriptions[0]['billing_cycle'] === 'monthly' && (float) $subscriptions[0]['price'] === 1250.5,
        'Confirmed initial billing terms were not stored.');
    $assert($subscriptions[1]['billing_cycle'] === 'quarterly' && (int) $subscriptions[1]['auto_renew'] === 0
        && (float) $subscriptions[1]['price'] === 3000.25 && $subscriptions[1]['currency'] === 'IRR'
        && (int) $subscriptions[1]['valid_dates'] === 1, 'Confirmed billing terms were not stored.');
    $duration = $pdo->prepare("SELECT ends_at = DATE_ADD(starts_at, INTERVAL 3 MONTH) FROM tenant_subscriptions WHERE tenant_id=:id AND status='active'");
    $duration->execute([':id' => $tenantId]);
    $assert((int) $duration->fetchColumn() === 1, 'Quarterly subscription end date is incorrect.');
    $assert($request($payload, $cookies, $csrf)['status'] === 200, 'Same-plan request failed.');
    $assert($request(array_replace($payload, ['price' => '999']), $cookies, $csrf)['status'] === 409,
        'Same-plan request with different billing terms reported success.');
    $rows->execute([':tenant' => $tenantId]);
    $assert(count($rows->fetchAll()) === 2, 'Same-plan request duplicated subscriptions.');
    $payload['plan_id'] = $planIds[2];
    $assert($request($payload, $cookies, $csrf)['status'] === 422, 'Inactive plan was accepted.');
    $tenantStmt = $pdo->prepare('SELECT plan_id FROM tenants WHERE id=:id');
    $tenantStmt->execute([':id' => $tenantId]);
    $assert((int) $tenantStmt->fetchColumn() === $planIds[1], 'Rejected request altered the customer plan.');
    $rows->execute([':tenant' => $tenantId]);
    $assert($rows->fetchAll() === $subscriptions, 'No-op or rejected request altered subscription records.');
    $audit = $pdo->prepare("SELECT COUNT(*) FROM admin_audit_logs WHERE actor_user_id=:id AND action='customer.plan_changed'");
    $audit->execute([':id' => $adminId]);
    $assert((int) $audit->fetchColumn() === 2, 'Audit count does not match successful changes.');
    $payload = array_replace($payload, ['plan_id' => $planIds[0], 'expected_plan_id' => $planIds[1],
        'billing_cycle' => 'yearly', 'price' => '9000']);
    $assert($request($payload, $cookies, $csrf)['status'] === 200, 'Yearly plan change failed.');
    $yearly = $pdo->prepare("SELECT COUNT(*) FROM tenant_subscriptions WHERE tenant_id=:id AND status='active'
        AND billing_cycle='yearly' AND price=9000 AND ends_at=DATE_ADD(starts_at, INTERVAL 1 YEAR)");
    $yearly->execute([':id' => $tenantId]);
    $assert((int) $yearly->fetchColumn() === 1, 'Yearly billing terms were not stored.');
    $payments = $pdo->prepare('SELECT COUNT(*) FROM subscription_payments WHERE tenant_id=:id');
    $payments->execute([':id' => $tenantId]);
    $assert((int) $payments->fetchColumn() === 0, 'Changing a plan must not record payment.');
    $catalogPayload = ['name' => 'Money QA ' . $suffix, 'price_monthly' => 3900000, 'price_currency' => 'IRR', 'is_active' => false];
    $assert($request(array_replace($catalogPayload, ['price_currency' => 'IRT']), $cookies, $csrf, 'plan-create.php')['status'] === 422,
        'Catalog create accepted a non-IRR amount.');
    $created = $request($catalogPayload, $cookies, $csrf, 'plan-create.php');
    if (!empty($created['data']['plan_id'])) $planIds[] = (int) $created['data']['plan_id'];
    $assert($created['status'] === 201, 'Catalog create failed.');
    $catalogId = (int) $created['data']['plan_id'];
    $catalogQuery = $pdo->prepare('SELECT price_monthly FROM plans WHERE id=:id');
    $catalogQuery->execute([':id' => $catalogId]);
    $assert($catalogQuery->fetchColumn() === '3900000.00', 'Catalog price stored in wrong unit.');
    $catalogPayload['id'] = $catalogId;
    $catalogPayload['price_monthly'] = 8900000;
    $legacyCatalog = $catalogPayload;
    unset($legacyCatalog['price_currency']);
    $assert($request($legacyCatalog, $cookies, $csrf, 'plan-update.php')['status'] === 422, 'Catalog update accepted missing currency.');
    $assert($request($catalogPayload, $cookies, $csrf, 'plan-update.php')['status'] === 200, 'Catalog update failed.');
    $catalogQuery->execute([':id' => $catalogId]);
    $assert($catalogQuery->fetchColumn() === '8900000.00', 'Catalog update changed the monetary unit.');
    echo "Customer plan HTTP smoke: {$count} assertions passed.\n";
} finally {
    // Exact fixture IDs only; never delete by a broad name/prefix or existing tenant.
    if ($adminId > 0) {
        $pdo->prepare('DELETE FROM admin_audit_logs WHERE actor_user_id=:id')->execute([':id' => $adminId]);
        $pdo->prepare('DELETE FROM users WHERE id=:id')->execute([':id' => $adminId]);
    }
    if ($tenantId > 0) $pdo->prepare('DELETE FROM tenants WHERE id=:id')->execute([':id' => $tenantId]);
    foreach ($planIds as $planId) $pdo->prepare('DELETE FROM plans WHERE id=:id')->execute([':id' => $planId]);
    echo "Synthetic customer-plan fixtures removed.\n";
}
