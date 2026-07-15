<?php

require_once __DIR__ . '/response.php';

function calculate_subscription_status(array $subscription, ?DateTimeImmutable $now = null): string
{
    $stored = (string) ($subscription['status'] ?? 'expired');
    if (in_array($stored, ['cancelled', 'suspended'], true)) {
        return $stored;
    }

    $now = $now ?: new DateTimeImmutable('now');
    $endsAt = new DateTimeImmutable((string) $subscription['ends_at']);
    if ($endsAt <= $now) {
        return 'expired';
    }

    if ($stored === 'trial') {
        $trialEnd = empty($subscription['trial_ends_at'])
            ? $endsAt
            : new DateTimeImmutable((string) $subscription['trial_ends_at']);
        return $trialEnd > $now ? 'trial' : 'expired';
    }

    return in_array($stored, ['active', 'past_due'], true) ? $stored : 'expired';
}

function get_tenant_subscription(PDO $pdo, int $tenantId, bool $forUpdate = false): ?array
{
    $sql = "SELECT s.*, p.name AS plan_name, p.description AS plan_description,
                   p.price_monthly, p.is_active AS plan_is_active
            FROM tenant_subscriptions s
            INNER JOIN plans p ON p.id = s.plan_id
            WHERE s.tenant_id = :tenant_id
            ORDER BY (s.status IN ('trial','active','past_due','suspended')) DESC,
                     s.starts_at DESC, s.id DESC
            LIMIT 1" . ($forUpdate ? ' FOR UPDATE' : '');
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':tenant_id' => $tenantId]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }

    $calculated = calculate_subscription_status($row);
    if ($calculated === 'expired' && $row['status'] !== 'expired') {
        $update = $pdo->prepare("UPDATE tenant_subscriptions SET status = 'expired' WHERE id = :id");
        $update->execute([':id' => $row['id']]);
        $row['status'] = 'expired';
    }
    $row['calculated_status'] = $calculated;
    $row['days_remaining'] = max(0, (int) floor((strtotime($row['ends_at']) - time()) / 86400));
    return $row;
}

function require_active_subscription(PDO $pdo, int $tenantId, string $operation = 'create'): array
{
    $subscription = get_tenant_subscription($pdo, $tenantId);
    $status = $subscription['calculated_status'] ?? 'expired';
    if (!in_array($status, ['trial', 'active'], true)) {
        json_response([
            'success' => false,
            'code' => 'SUBSCRIPTION_INACTIVE',
            'message' => 'Subscription is not active. Existing data remains available, but new operations are disabled.',
            'operation' => $operation,
            'subscription_status' => $status,
        ], 403);
    }
    return $subscription;
}

function renew_subscription(PDO $pdo, int $subscriptionId, DateTimeImmutable $endsAt, int $createdBy, ?float $price = null): array
{
    $stmt = $pdo->prepare('SELECT * FROM tenant_subscriptions WHERE id = :id FOR UPDATE');
    $stmt->execute([':id' => $subscriptionId]);
    $subscription = $stmt->fetch();
    if (!$subscription) {
        throw new RuntimeException('Subscription not found');
    }
    $base = max(time(), strtotime($subscription['ends_at']));
    if ($endsAt->getTimestamp() <= $base) {
        throw new InvalidArgumentException('New end date must be after the current end date');
    }
    $update = $pdo->prepare("UPDATE tenant_subscriptions
        SET status = 'active', ends_at = :ends_at, trial_ends_at = NULL,
            price = COALESCE(:price, price), updated_at = NOW()
        WHERE id = :id");
    $update->execute([
        ':ends_at' => $endsAt->format('Y-m-d H:i:s'),
        ':price' => $price,
        ':id' => $subscriptionId,
    ]);
    return get_tenant_subscription($pdo, (int) $subscription['tenant_id']) ?: [];
}

function subscription_public_data(?array $s): ?array
{
    if (!$s) return null;
    return [
        'id' => (int) $s['id'], 'tenant_id' => (int) $s['tenant_id'],
        'plan_id' => (int) $s['plan_id'], 'plan_name' => $s['plan_name'] ?? null,
        'status' => $s['calculated_status'] ?? calculate_subscription_status($s),
        'billing_cycle' => $s['billing_cycle'], 'starts_at' => $s['starts_at'],
        'ends_at' => $s['ends_at'], 'trial_ends_at' => $s['trial_ends_at'],
        'auto_renew' => (bool) $s['auto_renew'], 'price' => (float) $s['price'],
        'currency' => $s['currency'], 'days_remaining' => (int) ($s['days_remaining'] ?? 0),
        'created_at' => $s['created_at'], 'updated_at' => $s['updated_at'],
    ];
}
