<?php

// مسیر فایل: ai-chat-saas/backend/api/super-admin/plan-create.php
// هدف: ساخت امن پلن جدید و ثبت Audit Log

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

$planValues = [
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
    $duplicateStmt = $pdo->prepare("
        SELECT id
        FROM plans
        WHERE LOWER(name) = LOWER(:name)
        LIMIT 1
    ");

    $duplicateStmt->execute([
        ':name' => $name,
    ]);

    if ($duplicateStmt->fetch()) {
        json_response([
            'success' => false,
            'message' => 'پلنی با این نام قبلاً ثبت شده است.',
        ], 409);
    }

    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
        INSERT INTO plans (
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
        ) VALUES (
            :name,
            :description,
            :max_sites,
            :max_agents,
            :max_monthly_conversations,
            :ai_suggestions_enabled,
            :ai_auto_reply_enabled,
            :knowledge_base_enabled,
            :price_monthly,
            :is_active
        )
    ");

    $stmt->execute([
        ':name' => $planValues['name'],
        ':description' => $planValues['description'],
        ':max_sites' => $planValues['max_sites'],
        ':max_agents' => $planValues['max_agents'],
        ':max_monthly_conversations' =>
            $planValues['max_monthly_conversations'],
        ':ai_suggestions_enabled' =>
            $planValues['ai_suggestions_enabled'] ? 1 : 0,
        ':ai_auto_reply_enabled' =>
            $planValues['ai_auto_reply_enabled'] ? 1 : 0,
        ':knowledge_base_enabled' =>
            $planValues['knowledge_base_enabled'] ? 1 : 0,
        ':price_monthly' => $planValues['price_monthly'],
        ':is_active' => $planValues['is_active'] ? 1 : 0,
    ]);

    $planId = (int) $pdo->lastInsertId();

    admin_audit_log(
        $pdo,
        $user,
        'plan.created',
        'plan',
        $planId,
        sprintf(
            'پلن «%s» ساخته شد.',
            $name
        ),
        null,
        $planValues,
        [
            'plan_id' => $planId,
        ]
    );

    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'پلن با موفقیت ساخته شد.',
        'plan_id' => $planId,
    ], 201);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $payload = [
        'success' => false,
        'message' => 'ساخت پلن ناموفق بود.',
    ];

    if (!app_is_production()) {
        $payload['error'] = $e->getMessage();
    }

    json_response($payload, 500);
}
