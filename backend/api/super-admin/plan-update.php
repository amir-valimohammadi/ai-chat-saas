<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/plan-update.php
// هدف: ویرایش امن پلن، محاسبه اثر محدودیت و ثبت Audit Log

require_once __DIR__ . '/../../includes/cors.php';
require_once __DIR__ . '/../../includes/response.php';
require_once __DIR__ . '/../../includes/helpers.php';
require_once __DIR__ . '/../../includes/admin-audit.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Method not allowed',
    ], 405);
}

$user = require_auth($pdo);
require_role($user, ['super_admin']);

$input = get_json_input();

function plan_bool(
    array $input,
    string $key,
    bool $default
): bool {
    if (!array_key_exists($key, $input)) {
        return $default;
    }

    $value = filter_var(
        $input[$key],
        FILTER_VALIDATE_BOOLEAN,
        FILTER_NULL_ON_FAILURE
    );

    return $value === null
        ? $default
        : $value;
}

$planId = isset($input['id'])
    ? (int) $input['id']
    : 0;

$name = trim((string) ($input['name'] ?? ''));
$description = trim((string) ($input['description'] ?? ''));

$maxSites = filter_var(
    $input['max_sites'] ?? 1,
    FILTER_VALIDATE_INT,
    [
        'options' => [
            'min_range' => 1,
            'max_range' => 10000,
        ],
    ]
);

$maxAgents = filter_var(
    $input['max_agents'] ?? 1,
    FILTER_VALIDATE_INT,
    [
        'options' => [
            'min_range' => 0,
            'max_range' => 100000,
        ],
    ]
);

$maxMonthlyConversations = filter_var(
    $input['max_monthly_conversations'] ?? 500,
    FILTER_VALIDATE_INT,
    [
        'options' => [
            'min_range' => 0,
            'max_range' => 100000000,
        ],
    ]
);

$priceMonthly = is_numeric($input['price_monthly'] ?? 0)
    ? (float) $input['price_monthly']
    : -1;

if ($planId <= 0) {
    json_response([
        'success' => false,
        'message' => 'شناسه پلن الزامی است.',
    ], 422);
}

if (
    $name === ''
    || mb_strlen($name, 'UTF-8') > 100
) {
    json_response([
        'success' => false,
        'message' =>
            'نام پلن الزامی است و حداکثر ۱۰۰ کاراکتر دارد.',
    ], 422);
}

if (mb_strlen($description, 'UTF-8') > 1000) {
    json_response([
        'success' => false,
        'message' => 'توضیحات پلن حداکثر ۱۰۰۰ کاراکتر است.',
    ], 422);
}

if (
    $maxSites === false
    || $maxAgents === false
    || $maxMonthlyConversations === false
) {
    json_response([
        'success' => false,
        'message' => 'یکی از محدودیت‌های پلن معتبر نیست.',
    ], 422);
}

if (
    !is_finite($priceMonthly)
    || $priceMonthly < 0
    || $priceMonthly > 9999999999.99
) {
    json_response([
        'success' => false,
        'message' => 'قیمت ماهانه معتبر نیست.',
    ], 422);
}

$newValues = [
    'name' => $name,
    'description' => $description !== '' ? $description : null,
    'max_sites' => (int) $maxSites,
    'max_agents' => (int) $maxAgents,
    'max_monthly_conversations' =>
        (int) $maxMonthlyConversations,
    'ai_suggestions_enabled' =>
        plan_bool($input, 'ai_suggestions_enabled', true),
    'ai_auto_reply_enabled' =>
        plan_bool($input, 'ai_auto_reply_enabled', false),
    'knowledge_base_enabled' =>
        plan_bool($input, 'knowledge_base_enabled', true),
    'price_monthly' => round($priceMonthly, 2),
    'is_active' => plan_bool($input, 'is_active', true),
];

try {
    $currentStmt = $pdo->prepare("
        SELECT
            id,
            name,
            description,
            max_sites,
            max_agents,
            max_monthly_conversations,
            ai_suggestions_enabled,
            ai_auto_reply_enabled,
            knowledge_base_enabled,
            price_monthly,
            is_active
        FROM plans
        WHERE id = :id
        LIMIT 1
    ");

    $currentStmt->execute([
        ':id' => $planId,
    ]);

    $currentPlan = $currentStmt->fetch();

    if (!$currentPlan) {
        json_response([
            'success' => false,
            'message' => 'پلن پیدا نشد.',
        ], 404);
    }

    $duplicateStmt = $pdo->prepare("
        SELECT id
        FROM plans
        WHERE LOWER(name) = LOWER(:name)
          AND id <> :id
        LIMIT 1
    ");

    $duplicateStmt->execute([
        ':name' => $name,
        ':id' => $planId,
    ]);

    if ($duplicateStmt->fetch()) {
        json_response([
            'success' => false,
            'message' => 'پلن دیگری با این نام ثبت شده است.',
        ], 409);
    }

    $oldValues = [
        'name' => $currentPlan['name'],
        'description' => $currentPlan['description'],
        'max_sites' => (int) $currentPlan['max_sites'],
        'max_agents' => (int) $currentPlan['max_agents'],
        'max_monthly_conversations' =>
            (int) $currentPlan['max_monthly_conversations'],
        'ai_suggestions_enabled' =>
            (bool) $currentPlan['ai_suggestions_enabled'],
        'ai_auto_reply_enabled' =>
            (bool) $currentPlan['ai_auto_reply_enabled'],
        'knowledge_base_enabled' =>
            (bool) $currentPlan['knowledge_base_enabled'],
        'price_monthly' => (float) $currentPlan['price_monthly'],
        'is_active' => (bool) $currentPlan['is_active'],
    ];

    $impactStmt = $pdo->prepare("
        SELECT COUNT(*) AS affected_customers
        FROM tenants
        WHERE tenants.plan_id = :plan_id
          AND (
              (
                  SELECT COUNT(*)
                  FROM sites
                  WHERE sites.tenant_id = tenants.id
              ) > :max_sites

              OR

              (
                  SELECT COUNT(*)
                  FROM users
                  WHERE users.tenant_id = tenants.id
                    AND users.role = 'agent'
              ) > :max_agents

              OR

              (
                  SELECT COUNT(*)
                  FROM conversations
                  INNER JOIN sites
                      ON sites.id = conversations.site_id
                  WHERE sites.tenant_id = tenants.id
                    AND conversations.created_at >=
                        DATE_FORMAT(NOW(), '%Y-%m-01')
              ) > :max_monthly_conversations
          )
    ");

    $impactStmt->execute([
        ':plan_id' => $planId,
        ':max_sites' => $newValues['max_sites'],
        ':max_agents' => $newValues['max_agents'],
        ':max_monthly_conversations' =>
            $newValues['max_monthly_conversations'],
    ]);

    $impact = $impactStmt->fetch();

    if ($oldValues !== $newValues) {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            UPDATE plans
            SET
                name = :name,
                description = :description,
                max_sites = :max_sites,
                max_agents = :max_agents,
                max_monthly_conversations =
                    :max_monthly_conversations,
                ai_suggestions_enabled =
                    :ai_suggestions_enabled,
                ai_auto_reply_enabled =
                    :ai_auto_reply_enabled,
                knowledge_base_enabled =
                    :knowledge_base_enabled,
                price_monthly = :price_monthly,
                is_active = :is_active
            WHERE id = :id
        ");

        $stmt->execute([
            ':id' => $planId,
            ':name' => $newValues['name'],
            ':description' => $newValues['description'],
            ':max_sites' => $newValues['max_sites'],
            ':max_agents' => $newValues['max_agents'],
            ':max_monthly_conversations' =>
                $newValues['max_monthly_conversations'],
            ':ai_suggestions_enabled' =>
                $newValues['ai_suggestions_enabled'] ? 1 : 0,
            ':ai_auto_reply_enabled' =>
                $newValues['ai_auto_reply_enabled'] ? 1 : 0,
            ':knowledge_base_enabled' =>
                $newValues['knowledge_base_enabled'] ? 1 : 0,
            ':price_monthly' => $newValues['price_monthly'],
            ':is_active' => $newValues['is_active'] ? 1 : 0,
        ]);

        admin_audit_log(
            $pdo,
            $user,
            'plan.updated',
            'plan',
            $planId,
            sprintf(
                'پلن «%s» ویرایش شد.',
                $currentPlan['name']
            ),
            $oldValues,
            $newValues,
            [
                'plan_id' => $planId,
            ]
        );

        $pdo->commit();
    }

    json_response([
        'success' => true,
        'message' => $oldValues === $newValues
            ? 'پلن از قبل به‌روز بود.'
            : 'پلن با موفقیت ویرایش شد.',
        'impact' => [
            'affected_customers' =>
                (int) ($impact['affected_customers'] ?? 0),
            'limits_reduced' => [
                'sites' =>
                    $newValues['max_sites']
                    < $oldValues['max_sites'],
                'agents' =>
                    $newValues['max_agents']
                    < $oldValues['max_agents'],
                'monthly_conversations' =>
                    $newValues['max_monthly_conversations']
                    < $oldValues['max_monthly_conversations'],
            ],
        ],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $payload = [
        'success' => false,
        'message' => 'ویرایش پلن ناموفق بود.',
    ];

    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }

    json_response($payload, 500);
}
