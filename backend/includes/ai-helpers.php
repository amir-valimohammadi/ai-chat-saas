<?php

// مسیر فایل: ai-chat-saas/backend/includes/ai-helpers.php
// هدف: توابع کمکی مشترک برای بخش AI Knowledge

require_once __DIR__ . '/response.php';

if (!function_exists('ai_bool')) {
    function ai_bool($value): int
    {
        if (is_bool($value)) {
            return $value ? 1 : 0;
        }

        if (is_numeric($value)) {
            return ((int) $value) === 1 ? 1 : 0;
        }

        $value = strtolower(trim((string) $value));

        return in_array($value, ['1', 'true', 'yes', 'on'], true) ? 1 : 0;
    }
}

if (!function_exists('ai_score')) {
    function ai_score($value, float $default, float $min = 0.00, float $max = 100.00): float
    {
        if ($value === null || $value === '') {
            return $default;
        }

        if (!is_numeric($value)) {
            return $default;
        }

        $score = (float) $value;

        if ($score < $min) {
            return $min;
        }

        if ($score > $max) {
            return $max;
        }

        return round($score, 2);
    }
}

if (!function_exists('ai_get_customer_site')) {
    function ai_get_customer_site(PDO $pdo, array $user, int $siteId): array
    {
        if ($siteId <= 0) {
            json_response([
                'success' => false,
                'message' => 'Site ID is required'
            ], 422);
        }

        $stmt = $pdo->prepare(" 
            SELECT id, tenant_id, name, domain, site_key
            FROM sites
            WHERE id = :site_id
              AND tenant_id = :tenant_id
            LIMIT 1
        ");

        $stmt->execute([
            ':site_id' => $siteId,
            ':tenant_id' => $user['tenant_id'],
        ]);

        $site = $stmt->fetch();

        if (!$site) {
            json_response([
                'success' => false,
                'message' => 'Site not found'
            ], 404);
        }

        return $site;
    }
}

if (!function_exists('ai_normalize_host')) {
    function ai_normalize_host(string $value): string
    {
        $value = trim(strtolower($value));

        if ($value === '') {
            return '';
        }

        if (!preg_match('/^https?:\/\//i', $value)) {
            $value = 'https://' . $value;
        }

        $host = parse_url($value, PHP_URL_HOST);

        if (!$host) {
            return '';
        }

        $host = strtolower($host);

        if (str_starts_with($host, 'www.')) {
            $host = substr($host, 4);
        }

        return $host;
    }
}

if (!function_exists('ai_host_belongs_to_site')) {
    function ai_host_belongs_to_site(string $host, string $siteDomain): bool
    {
        $host = ai_normalize_host($host);
        $siteHost = ai_normalize_host($siteDomain);

        if ($host === '' || $siteHost === '') {
            return false;
        }

        if ($host === $siteHost) {
            return true;
        }

        return str_ends_with($host, '.' . $siteHost);
    }
}

if (!function_exists('ai_validate_crawl_source')) {
    function ai_validate_crawl_source(string $sourceType, string $sourceValue, string $siteDomain): string
    {
        $sourceType = trim($sourceType);
        $sourceValue = trim($sourceValue);

        $allowedTypes = ['url', 'path_prefix', 'sitemap'];

        if (!in_array($sourceType, $allowedTypes, true)) {
            json_response([
                'success' => false,
                'message' => 'Invalid crawl source type'
            ], 422);
        }

        if ($sourceValue === '') {
            json_response([
                'success' => false,
                'message' => 'Crawl source value is required'
            ], 422);
        }

        if (mb_strlen($sourceValue) > 1000) {
            json_response([
                'success' => false,
                'message' => 'Crawl source value is too long'
            ], 422);
        }

        if ($sourceType === 'path_prefix') {
            if (!str_starts_with($sourceValue, '/')) {
                json_response([
                    'success' => false,
                    'message' => 'Path prefix must start with /'
                ], 422);
            }

            return $sourceValue;
        }

        if (preg_match('/^https?:\/\//i', $sourceValue)) {
            $urlHost = parse_url($sourceValue, PHP_URL_HOST);

            if (!$urlHost || !ai_host_belongs_to_site($urlHost, $siteDomain)) {
                json_response([
                    'success' => false,
                    'message' => 'Crawl source must belong to the selected site domain'
                ], 422);
            }

            return strtok($sourceValue, '#') ?: $sourceValue;
        }

        if (!str_starts_with($sourceValue, '/')) {
            json_response([
                'success' => false,
                'message' => 'Crawl source must be a full URL or a path starting with /'
            ], 422);
        }

        return $sourceValue;
    }
}

if (!function_exists('ai_trim_or_null')) {
    function ai_trim_or_null($value, int $maxLength = 255): ?string
    {
        $value = trim((string) ($value ?? ''));

        if ($value === '') {
            return null;
        }

        if (mb_strlen($value) > $maxLength) {
            return mb_substr($value, 0, $maxLength);
        }

        return $value;
    }
}
if (!function_exists('ai_normalize_question_key')) {
    function ai_normalize_question_key(string $question): string
    {
        $question = function_exists('ai_normalize_text')
            ? ai_normalize_text($question)
            : trim($question);

        $question = mb_strtolower($question);
        $question = preg_replace('/\s+/u', ' ', (string) $question);

        return trim((string) $question);
    }
}

if (!function_exists('ai_question_hash')) {
    function ai_question_hash(string $question): string
    {
        return hash('sha256', ai_normalize_question_key($question));
    }
}

if (!function_exists('ai_failure_reason')) {
    function ai_failure_reason(array $result, float $minimumScore): ?string
    {
        $message = strtolower(trim((string) ($result['message'] ?? '')));

        if (!$result['success']) {
            if (str_contains($message, 'too short')) {
                return 'question_too_short';
            }

            return 'no_candidate';
        }

        if ((float) ($result['confidence_score'] ?? 0) < $minimumScore) {
            return 'low_confidence';
        }

        return null;
    }
}

if (!function_exists('ai_record_unanswered_question')) {
    function ai_record_unanswered_question(PDO $pdo, array $data): int
    {
        $question = trim((string) ($data['question'] ?? ''));
        $normalizedQuestion = ai_normalize_question_key($question);

        if ($question === '' || $normalizedQuestion === '') {
            return 0;
        }

        $messageId = isset($data['message_id']) && (int) $data['message_id'] > 0
            ? (int) $data['message_id']
            : null;

        $stmt = $pdo->prepare("
            INSERT INTO ai_unanswered_questions (
                tenant_id,
                site_id,
                conversation_id,
                message_id,
                question,
                normalized_question,
                question_hash,
                detected_category,
                detected_intent,
                best_match_score,
                best_sources_json,
                occurrence_count,
                first_seen_at,
                last_seen_at,
                failure_reason,
                status
            ) VALUES (
                :tenant_id,
                :site_id,
                :conversation_id,
                :message_id,
                :question,
                :normalized_question,
                :question_hash,
                :detected_category,
                :detected_intent,
                :best_match_score,
                :best_sources_json,
                1,
                NOW(),
                NOW(),
                :failure_reason,
                'new'
            )
            ON DUPLICATE KEY UPDATE
                occurrence_count = occurrence_count + CASE
                    WHEN VALUES(message_id) IS NOT NULL
                     AND message_id = VALUES(message_id)
                    THEN 0
                    ELSE 1
                END,
                conversation_id = VALUES(conversation_id),
                message_id = VALUES(message_id),
                question = VALUES(question),
                normalized_question = VALUES(normalized_question),
                detected_category = VALUES(detected_category),
                detected_intent = VALUES(detected_intent),
                best_match_score = VALUES(best_match_score),
                best_sources_json = VALUES(best_sources_json),
                last_seen_at = NOW(),
                failure_reason = VALUES(failure_reason),
                status = CASE
                    WHEN status = 'ignored' THEN 'ignored'
                    ELSE 'new'
                END,
                updated_at = NOW(),
                id = LAST_INSERT_ID(id)
        ");

        $stmt->execute([
            ':tenant_id' => (int) ($data['tenant_id'] ?? 0),
            ':site_id' => (int) ($data['site_id'] ?? 0),
            ':conversation_id' => isset($data['conversation_id']) && (int) $data['conversation_id'] > 0
                ? (int) $data['conversation_id']
                : null,
            ':message_id' => $messageId,
            ':question' => $question,
            ':normalized_question' => $normalizedQuestion,
            ':question_hash' => ai_question_hash($question),
            ':detected_category' => $data['detected_category'] ?? null,
            ':detected_intent' => $data['detected_intent'] ?? null,
            ':best_match_score' => (float) ($data['best_match_score'] ?? 0),
            ':best_sources_json' => json_encode(
                $data['best_sources'] ?? [],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            ),
            ':failure_reason' => $data['failure_reason'] ?? 'unknown',
        ]);

        return (int) $pdo->lastInsertId();
    }
}

if (!function_exists('ai_log_answer')) {
    function ai_log_answer(PDO $pdo, array $data): int
    {
        $question = trim((string) ($data['user_question'] ?? ''));

        $stmt = $pdo->prepare("
            INSERT INTO ai_answer_logs (
                tenant_id,
                site_id,
                conversation_id,
                message_id,
                user_question,
                normalized_question,
                reply_text,
                confidence_score,
                matched_chunk_id,
                matched_question_id,
                sources_json,
                reply_mode,
                request_source,
                failure_reason
            ) VALUES (
                :tenant_id,
                :site_id,
                :conversation_id,
                :message_id,
                :user_question,
                :normalized_question,
                :reply_text,
                :confidence_score,
                :matched_chunk_id,
                :matched_question_id,
                :sources_json,
                :reply_mode,
                :request_source,
                :failure_reason
            )
        ");

        $stmt->execute([
            ':tenant_id' => (int) ($data['tenant_id'] ?? 0),
            ':site_id' => (int) ($data['site_id'] ?? 0),
            ':conversation_id' => isset($data['conversation_id']) && (int) $data['conversation_id'] > 0
                ? (int) $data['conversation_id']
                : null,
            ':message_id' => isset($data['message_id']) && (int) $data['message_id'] > 0
                ? (int) $data['message_id']
                : null,
            ':user_question' => $question,
            ':normalized_question' => ai_normalize_question_key($question),
            ':reply_text' => $data['reply_text'] ?? null,
            ':confidence_score' => (float) ($data['confidence_score'] ?? 0),
            ':matched_chunk_id' => isset($data['matched_chunk_id']) && (int) $data['matched_chunk_id'] > 0
                ? (int) $data['matched_chunk_id']
                : null,
            ':matched_question_id' => isset($data['matched_question_id']) && (int) $data['matched_question_id'] > 0
                ? (int) $data['matched_question_id']
                : null,
            ':sources_json' => json_encode(
                $data['sources'] ?? [],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            ),
            ':reply_mode' => (string) ($data['reply_mode'] ?? 'suggestion'),
            ':request_source' => (string) ($data['request_source'] ?? 'agent'),
            ':failure_reason' => $data['failure_reason'] ?? null,
        ]);

        return (int) $pdo->lastInsertId();
    }
}
