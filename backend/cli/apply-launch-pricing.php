<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/admin-audit.php';

// Explicit catalog update, NOT a migration of historic subscriptions/payments.
// Default is read-only preview. Id/name and old prices are guarded to avoid overwrites.
$apply = in_array('--apply', $argv, true);
$targets = [1 => ['Basic', '3900000.00'], 2 => ['Growth', '8900000.00'], 3 => ['Pro', '19900000.00']];
$financialFingerprint = static function () use ($pdo): string {
    $subscriptions = $pdo->query('SELECT id,tenant_id,plan_id,status,billing_cycle,price,currency,starts_at,ends_at,auto_renew FROM tenant_subscriptions ORDER BY id')->fetchAll();
    $payments = $pdo->query('SELECT id,tenant_id,subscription_id,amount,currency,status FROM subscription_payments ORDER BY id')->fetchAll();
    return hash('sha256', json_encode([$subscriptions, $payments], JSON_THROW_ON_ERROR));
};
try {
    $pdo->beginTransaction();
    $before = $financialFingerprint();
    $changed = 0;
    foreach ($targets as $id => [$name, $price]) {
        $query = $pdo->prepare('SELECT id,name,price_monthly,ai_auto_reply_enabled FROM plans WHERE id=:id FOR UPDATE');
        $query->execute([':id' => $id]);
        $old = $query->fetch();
        if (!$old || $old['name'] !== $name || !in_array($old['price_monthly'], ['0.00', $price], true)) {
            throw new RuntimeException('Catalog differs from approved launch values; no changes applied.');
        }
        if ($old['price_monthly'] === $price && (int) $old['ai_auto_reply_enabled'] !== 1) {
            throw new RuntimeException('Features changed after launch pricing; refusing to overwrite.');
        }
        if ($old['price_monthly'] === $price && (int) $old['ai_auto_reply_enabled'] !== 1) {
            throw new RuntimeException('Features changed after launch pricing; refusing to overwrite.');
        }
        $needsChange = $old['price_monthly'] !== $price || (int) $old['ai_auto_reply_enabled'] !== 1;
        echo $name . ': ' . $price . ' IRR/month; auto_reply=1; ' . ($needsChange ? 'pending' : 'already applied') . PHP_EOL;
        if (!$needsChange) continue;
        $changed++;
        if (!$apply) continue;
        $pdo->prepare('UPDATE plans SET price_monthly=:price,ai_auto_reply_enabled=1,updated_at=NOW() WHERE id=:id')
            ->execute([':price' => $price, ':id' => $id]);
        admin_audit_log($pdo, ['name' => 'Launch pricing CLI'], 'plan.launch_pricing_applied', 'plan', $id,
            'Approved launch pricing applied; existing financial records unchanged.', $old,
            ['price_monthly' => $price, 'currency' => 'IRR', 'ai_auto_reply_enabled' => true], ['plan_id' => $id]);
    }
    if (!hash_equals($before, $financialFingerprint())) throw new RuntimeException('Financial record invariant failed.');
    if ($apply) $pdo->commit(); else $pdo->rollBack();
    echo ($apply ? 'Applied' : 'Preview only') . ": {$changed} plan(s); subscriptions and payments unchanged.\n";
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fwrite(STDERR, $error->getMessage() . PHP_EOL);
    exit(1);
}
