<?php

// مسیر فایل: ai-chat-saas/backend/includes/ai-answer-engine.php
// هدف: موتور بازیابی و پاسخ استخراجی فارسی، بدون API خارجی
// نسخه رتبه‌بندی: persian-hybrid-v2

require_once __DIR__ . '/ai-crawler.php';

if (!function_exists('ai_search_engine_version')) {
    function ai_search_engine_version(): string
    {
        return 'persian-hybrid-v2';
    }
}

if (!function_exists('ai_search_normalize')) {
    function ai_search_normalize(string $text): string
    {
        $text = mb_strtolower(ai_normalize_text($text));

        $text = strtr($text, [
            '‌' => ' ', // نیم‌فاصله
            'ـ' => '',
            'ى' => 'ی',
            'ي' => 'ی',
            'ك' => 'ک',
            'ۀ' => 'ه',
            'ة' => 'ه',
            'ؤ' => 'و',
            'إ' => 'ا',
            'أ' => 'ا',
            'ٱ' => 'ا',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
        ]);

        // حذف اعراب عربی و نشانه‌های کنترلی نامرئی
        $text = preg_replace('/[\x{064B}-\x{065F}\x{0670}\x{06D6}-\x{06ED}\x{200E}\x{200F}\x{202A}-\x{202E}]/u', '', $text);
        $text = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', (string) $text);
        $text = preg_replace('/\s+/u', ' ', (string) $text);

        return trim((string) $text);
    }
}

if (!function_exists('ai_search_stop_words')) {
    function ai_search_stop_words(): array
    {
        static $words = null;

        if ($words !== null) {
            return $words;
        }

        $words = [
            'سلام', 'درود', 'لطفا', 'لطفاً', 'خواهشا', 'خواهشاً', 'میشه', 'میشود',
            'می‌شود', 'میتونم', 'میتوانم', 'می‌توانم', 'ایا', 'آیا', 'این', 'اون',
            'آن', 'برای', 'با', 'به', 'از', 'در', 'را', 'که', 'یک', 'یا', 'و', 'اما',
            'اگر', 'است', 'هست', 'هستن', 'هستند', 'شد', 'شود', 'شده', 'کرد', 'کنم',
            'کنید', 'کنه', 'چیه', 'چیست', 'چطور', 'چگونه', 'چقدر', 'چند', 'چه',
            'من', 'شما', 'ما', 'خودم', 'خودش', 'دارم', 'دارید', 'داره', 'دارد',
            'بگید', 'بگویید', 'بدید', 'بدهید', 'ممکنه', 'ممکن', 'مورد', 'مربوط',
            'the', 'and', 'or', 'for', 'with', 'this', 'that', 'you', 'your', 'is',
            'are', 'how', 'what', 'when', 'where', 'please',
        ];

        return $words;
    }
}

if (!function_exists('ai_search_synonym_groups')) {
    function ai_search_synonym_groups(): array
    {
        return [
            ['قیمت', 'هزینه', 'مبلغ', 'تعرفه', 'نرخ', 'چنده', 'چند'],
            ['ارسال', 'تحویل', 'پست', 'مرسوله', 'باربری', 'shipping', 'delivery'],
            ['مرجوعی', 'بازگشت', 'عودت', 'پس', 'تعویض', 'return', 'refund'],
            ['ضمانت', 'گارانتی', 'تضمین', 'warranty'],
            ['اقساط', 'اقساطی', 'قسط', 'اعتباری'],
            ['پرداخت', 'درگاه', 'کارت', 'واریز', 'تسویه'],
            ['پشتیبانی', 'پاسخگویی', 'پاسخگویی', 'اپراتور', 'کارشناس', 'support'],
            ['ساعت', 'زمان', 'روز', 'شیفت', 'فعال'],
            ['تماس', 'تلفن', 'شماره', 'آدرس', 'ادرس', 'مکان', 'لوکیشن'],
            ['موجود', 'موجودی', 'ناموجود', 'stock'],
            ['خرید', 'سفارش', 'ثبت', 'تهیه'],
            ['محصول', 'کالا', 'مدل', 'دستگاه'],
            ['رایگان', 'مجانی', 'بدون هزینه'],
            ['شرایط', 'قوانین', 'ضوابط'],
            ['لغو', 'کنسل', 'انصراف'],
            ['رزرو', 'نوبت', 'وقت', 'appointment', 'booking'],
        ];
    }
}

if (!function_exists('ai_search_token_variants')) {
    function ai_search_token_variants(string $token): array
    {
        $token = ai_search_normalize($token);

        if ($token === '') {
            return [];
        }

        $variants = [$token];
        $length = mb_strlen($token);

        if ($length >= 5) {
            foreach (['نمی', 'می'] as $prefix) {
                if (mb_strpos($token, $prefix) === 0 && mb_strlen($token) - mb_strlen($prefix) >= 3) {
                    $variants[] = mb_substr($token, mb_strlen($prefix));
                }
            }
        }

        $suffixes = ['هایی', 'های', 'ها', 'ترین', 'تر', 'مان', 'تان', 'شان', 'ام', 'ات', 'اش', 'ای', 'ی'];

        foreach ($suffixes as $suffix) {
            if (mb_strlen($token) >= mb_strlen($suffix) + 3 && str_ends_with($token, $suffix)) {
                $variants[] = mb_substr($token, 0, mb_strlen($token) - mb_strlen($suffix));
            }
        }

        return array_values(array_unique(array_filter($variants, static fn ($item) => mb_strlen($item) >= 2)));
    }
}

if (!function_exists('ai_search_synonyms_for_token')) {
    function ai_search_synonyms_for_token(string $token): array
    {
        $tokenVariants = ai_search_token_variants($token);
        $result = [];

        foreach (ai_search_synonym_groups() as $group) {
            $normalizedGroup = [];

            foreach ($group as $item) {
                $normalizedGroup[] = ai_search_normalize($item);
            }

            if (array_intersect($tokenVariants, $normalizedGroup)) {
                $result = array_merge($result, $normalizedGroup);
            }
        }

        return array_values(array_unique(array_filter($result)));
    }
}

if (!function_exists('ai_question_tokens')) {
    function ai_question_tokens(string $text): array
    {
        $normalized = ai_search_normalize($text);
        $parts = preg_split('/\s+/u', $normalized) ?: [];
        $stopWords = ai_search_stop_words();
        $tokens = [];

        foreach ($parts as $part) {
            $part = trim($part);

            if (mb_strlen($part) < 2 || in_array($part, $stopWords, true)) {
                continue;
            }

            $tokens[] = $part;
        }

        return array_values(array_unique(array_slice($tokens, 0, 16)));
    }
}

if (!function_exists('ai_build_question_profile')) {
    function ai_build_question_profile(string $question): array
    {
        $normalized = ai_search_normalize($question);
        $tokens = ai_question_tokens($normalized);
        $expanded = $tokens;
        $tokenSynonyms = [];

        foreach ($tokens as $token) {
            $variants = ai_search_token_variants($token);
            $synonyms = ai_search_synonyms_for_token($token);
            $tokenSynonyms[$token] = array_values(array_unique(array_merge($variants, $synonyms)));
            $expanded = array_merge($expanded, $tokenSynonyms[$token]);
        }

        $expanded = array_values(array_unique(array_slice(array_filter($expanded), 0, 30)));
        $bigrams = [];

        for ($i = 0, $count = count($tokens) - 1; $i < $count; $i++) {
            $bigrams[] = $tokens[$i] . ' ' . $tokens[$i + 1];
        }

        return [
            'original' => trim($question),
            'normalized' => $normalized,
            'tokens' => $tokens,
            'expanded_tokens' => $expanded,
            'token_synonyms' => $tokenSynonyms,
            'bigrams' => array_values(array_unique($bigrams)),
            'core_phrase' => implode(' ', $tokens),
        ];
    }
}

if (!function_exists('ai_detect_question_intent')) {
    function ai_detect_question_intent(string $question): array
    {
        $q = ai_search_normalize($question);

        $rules = [
            ['category' => 'قیمت و تعرفه', 'intent' => 'pricing', 'keywords' => ['قیمت', 'هزینه', 'تعرفه', 'مبلغ', 'نرخ', 'چنده', 'price', 'cost']],
            ['category' => 'ارسال و تحویل', 'intent' => 'shipping', 'keywords' => ['ارسال', 'تحویل', 'پست', 'مرسوله', 'باربری', 'delivery', 'shipping']],
            ['category' => 'مرجوعی و بازگشت', 'intent' => 'returns', 'keywords' => ['مرجوعی', 'عودت', 'بازگشت', 'تعویض', 'پس دادن', 'refund', 'return']],
            ['category' => 'ضمانت', 'intent' => 'warranty', 'keywords' => ['ضمانت', 'گارانتی', 'تضمین', 'warranty']],
            ['category' => 'خرید اقساطی', 'intent' => 'installment', 'keywords' => ['اقساط', 'اقساطی', 'قسط', 'اعتباری']],
            ['category' => 'پرداخت', 'intent' => 'payment', 'keywords' => ['پرداخت', 'درگاه', 'کارت', 'واریز', 'تسویه']],
            ['category' => 'ساعات پشتیبانی', 'intent' => 'support_hours', 'keywords' => ['ساعت پشتیبانی', 'زمان پشتیبانی', 'پنجشنبه', 'جمعه', 'ساعات کاری']],
            ['category' => 'تماس و مراجعه', 'intent' => 'contact', 'keywords' => ['تماس', 'آدرس', 'ادرس', 'تلفن', 'شماره', 'لوکیشن', 'کجا', 'location', 'contact']],
            ['category' => 'موجودی', 'intent' => 'availability', 'keywords' => ['موجود', 'موجودی', 'ناموجود', 'stock']],
            ['category' => 'نوبت‌دهی', 'intent' => 'appointment', 'keywords' => ['نوبت', 'رزرو', 'وقت', 'مشاوره', 'booking', 'appointment']],
            ['category' => 'محصولات', 'intent' => 'product_info', 'keywords' => ['محصول', 'کالا', 'مدل', 'دستگاه']],
            ['category' => 'خدمات', 'intent' => 'service_info', 'keywords' => ['خدمات', 'سرویس', 'درمان', 'جراحی', 'service']],
        ];

        foreach ($rules as $rule) {
            foreach ($rule['keywords'] as $keyword) {
                if (mb_strpos($q, ai_search_normalize($keyword)) !== false) {
                    return ['category' => $rule['category'], 'intent' => $rule['intent']];
                }
            }
        }

        return ['category' => null, 'intent' => 'general_info'];
    }
}

if (!function_exists('ai_search_text_tokens')) {
    function ai_search_text_tokens(string $text): array
    {
        $normalized = ai_search_normalize($text);
        $parts = preg_split('/\s+/u', $normalized) ?: [];

        return [
            'normalized' => $normalized,
            'tokens' => array_values(array_unique(array_filter($parts, static fn ($item) => mb_strlen($item) >= 2))),
        ];
    }
}

if (!function_exists('ai_search_token_matches_text')) {
    function ai_search_token_matches_text(string $token, array $textProfile): bool
    {
        foreach (ai_search_token_variants($token) as $variant) {
            if (in_array($variant, $textProfile['tokens'], true) || mb_strpos($textProfile['normalized'], $variant) !== false) {
                return true;
            }
        }

        return false;
    }
}

if (!function_exists('ai_score_text_field')) {
    function ai_score_text_field(array $profile, string $text): array
    {
        $textProfile = ai_search_text_tokens($text);
        $tokens = $profile['tokens'];

        if (!$tokens || $textProfile['normalized'] === '') {
            return [
                'score' => 0.00,
                'coverage' => 0.00,
                'matched_terms' => [],
                'matched_synonyms' => [],
                'matched_bigrams' => [],
                'exact_phrase' => false,
            ];
        }

        $matched = [];
        $synonymMatched = [];
        $weightedMatched = 0.00;
        $totalWeight = 0.00;

        foreach ($tokens as $token) {
            $weight = max(1.00, min(2.00, mb_strlen($token) / 4));
            $totalWeight += $weight;

            if (ai_search_token_matches_text($token, $textProfile)) {
                $matched[] = $token;
                $weightedMatched += $weight;
                continue;
            }

            foreach ($profile['token_synonyms'][$token] ?? [] as $synonym) {
                if ($synonym !== $token && ai_search_token_matches_text($synonym, $textProfile)) {
                    $synonymMatched[$token] = $synonym;
                    break;
                }
            }
        }

        $coverage = count($matched) / max(1, count($tokens));
        $semanticCoverage = (count($matched) + count($synonymMatched)) / max(1, count($tokens));
        $weightedCoverage = $weightedMatched / max(1.00, $totalWeight);
        $matchedBigrams = [];

        foreach ($profile['bigrams'] as $bigram) {
            if (mb_strpos($textProfile['normalized'], $bigram) !== false) {
                $matchedBigrams[] = $bigram;
            }
        }

        $bigramCoverage = count($matchedBigrams) / max(1, count($profile['bigrams']));
        $exactPhrase = false;

        if (mb_strlen($profile['normalized']) >= 6 && mb_strpos($textProfile['normalized'], $profile['normalized']) !== false) {
            $exactPhrase = true;
        }

        $corePhraseMatch = false;

        if (count($tokens) >= 2 && mb_strlen($profile['core_phrase']) >= 5) {
            $corePhraseMatch = mb_strpos($textProfile['normalized'], $profile['core_phrase']) !== false;
        }

        $score = ($coverage * 48)
            + ($weightedCoverage * 17)
            + ($semanticCoverage * 10)
            + ($bigramCoverage * 13)
            + ($exactPhrase ? 18 : 0)
            + ($corePhraseMatch ? 8 : 0);

        if (count($tokens) >= 3 && $semanticCoverage < 0.34) {
            $score *= 0.55;
        } elseif (count($tokens) >= 2 && $semanticCoverage < 0.50) {
            $score *= 0.78;
        }

        if (!$matched && !$synonymMatched) {
            $score = 0;
        }

        return [
            'score' => min(100, round($score, 2)),
            'coverage' => round($coverage * 100, 2),
            'semantic_coverage' => round($semanticCoverage * 100, 2),
            'matched_terms' => array_values($matched),
            'matched_synonyms' => $synonymMatched,
            'matched_bigrams' => $matchedBigrams,
            'exact_phrase' => $exactPhrase,
            'core_phrase' => $corePhraseMatch,
        ];
    }
}

if (!function_exists('ai_text_match_score')) {
    function ai_text_match_score(array $tokens, string $text, string $originalQuestion = ''): float
    {
        $profile = ai_build_question_profile($originalQuestion !== '' ? $originalQuestion : implode(' ', $tokens));

        return (float) ai_score_text_field($profile, $text)['score'];
    }
}

if (!function_exists('ai_build_excerpt_reply')) {
    function ai_build_excerpt_reply(string $text, array $tokens = [], string $question = '', int $maxLength = 520): string
    {
        $text = trim((string) preg_replace('/\s+/u', ' ', ai_normalize_text($text)));

        if ($text === '') {
            return 'برای این سؤال پاسخ دقیقی در اطلاعات سایت پیدا نکردم.';
        }

        $profile = ai_build_question_profile($question !== '' ? $question : implode(' ', $tokens));
        $sentences = preg_split('/(?<=[.!؟?؛])\s+/u', $text) ?: [];
        $scored = [];

        foreach ($sentences as $index => $sentence) {
            $sentence = trim($sentence);

            if ($sentence === '') {
                continue;
            }

            $fieldScore = ai_score_text_field($profile, $sentence);
            $scored[] = [
                'sentence' => $sentence,
                'score' => $fieldScore['score'],
                'index' => $index,
            ];
        }

        usort($scored, static function ($a, $b) {
            if ($a['score'] === $b['score']) {
                return $a['index'] <=> $b['index'];
            }

            return $b['score'] <=> $a['score'];
        });

        $selected = array_slice(array_filter($scored, static fn ($item) => $item['score'] > 0), 0, 2);

        if (!$selected) {
            $reply = mb_substr($text, 0, $maxLength);
        } else {
            usort($selected, static fn ($a, $b) => $a['index'] <=> $b['index']);
            $reply = implode(' ', array_column($selected, 'sentence'));
        }

        if (mb_strlen($reply) > $maxLength) {
            $reply = rtrim(mb_substr($reply, 0, $maxLength)) . '...';
        }

        return 'بر اساس اطلاعات موجود در سایت: ' . trim($reply);
    }
}

if (!function_exists('ai_load_term_boosts')) {
    function ai_load_term_boosts(PDO $pdo, int $tenantId, int $siteId, array $chunkIds, array $tokens): array
    {
        $chunkIds = array_values(array_unique(array_filter(array_map('intval', $chunkIds))));
        $tokens = array_values(array_unique(array_filter($tokens)));

        if (!$chunkIds || !$tokens) {
            return [];
        }

        $chunkPlaceholders = [];
        $tokenPlaceholders = [];
        $params = [':tenant_id' => $tenantId, ':site_id' => $siteId];

        foreach ($chunkIds as $i => $chunkId) {
            $key = ':chunk_' . $i;
            $chunkPlaceholders[] = $key;
            $params[$key] = $chunkId;
        }

        foreach (array_slice($tokens, 0, 30) as $i => $token) {
            $key = ':token_' . $i;
            $tokenPlaceholders[] = $key;
            $params[$key] = $token;
        }

        $sql = "
            SELECT chunk_id, SUM(score) AS total_score
            FROM ai_terms
            WHERE tenant_id = :tenant_id
              AND site_id = :site_id
              AND chunk_id IN (" . implode(',', $chunkPlaceholders) . ")
              AND normalized_term IN (" . implode(',', $tokenPlaceholders) . ")
            GROUP BY chunk_id
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $boosts = [];

        while ($row = $stmt->fetch()) {
            $boosts[(int) $row['chunk_id']] = min(12, ((float) $row['total_score']) / 12);
        }

        return $boosts;
    }
}

if (!function_exists('ai_build_like_conditions')) {
    function ai_build_like_conditions(array $tokens, array $columns, array &$params, string $prefix): array
    {
        $conditions = [];

        foreach (array_slice($tokens, 0, 20) as $i => $token) {
            $parts = [];

            foreach ($columns as $columnIndex => $column) {
                $key = ':' . $prefix . '_' . $i . '_' . $columnIndex;
                $parts[] = $column . ' LIKE ' . $key;
                $params[$key] = '%' . $token . '%';
            }

            $conditions[] = '(' . implode(' OR ', $parts) . ')';
        }

        return $conditions;
    }
}

if (!function_exists('ai_search_chunk_candidates')) {
    function ai_search_chunk_candidates(PDO $pdo, int $tenantId, int $siteId, array $tokens): array
    {
        if (!$tokens) {
            return [];
        }

        $params = [':tenant_id' => $tenantId, ':site_id' => $siteId];
        $conditions = ai_build_like_conditions(
            $tokens,
            ['c.chunk_text', 'c.normalized_text', 'c.heading', 'p.title', 'p.main_heading'],
            $params,
            'chunk'
        );

        $sql = "
            SELECT
                c.id AS chunk_id,
                c.page_id,
                c.heading,
                c.chunk_text,
                c.normalized_text,
                c.category,
                c.detected_intent,
                c.importance_score,
                p.url,
                p.title,
                p.main_heading
            FROM ai_content_chunks c
            INNER JOIN ai_pages p ON p.id = c.page_id
            WHERE c.tenant_id = :tenant_id
              AND c.site_id = :site_id
              AND c.status = 'active'
              AND (" . implode(' OR ', $conditions) . ")
            ORDER BY c.importance_score DESC, c.id DESC
            LIMIT 80
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll();
    }
}

if (!function_exists('ai_search_question_candidates')) {
    function ai_search_question_candidates(PDO $pdo, int $tenantId, int $siteId, array $tokens): array
    {
        if (!$tokens) {
            return [];
        }

        $params = [':tenant_id' => $tenantId, ':site_id' => $siteId];
        $conditions = ai_build_like_conditions(
            $tokens,
            ['q.question', 'q.normalized_question', 'q.answer_text'],
            $params,
            'question'
        );

        $sql = "
            SELECT
                q.id AS question_id,
                q.page_id,
                q.chunk_id,
                q.question,
                q.normalized_question,
                q.answer_text,
                q.category,
                q.detected_intent,
                q.score,
                q.source_type,
                q.is_user_edited,
                p.url,
                p.title,
                p.main_heading
            FROM ai_generated_questions q
            LEFT JOIN ai_pages p ON p.id = q.page_id
            WHERE q.tenant_id = :tenant_id
              AND q.site_id = :site_id
              AND q.status = 'active'
              AND (" . implode(' OR ', $conditions) . ")
            ORDER BY q.is_user_edited DESC, q.score DESC, q.id DESC
            LIMIT 80
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll();
    }
}

if (!function_exists('ai_search_legacy_knowledge_candidates')) {
    function ai_search_legacy_knowledge_candidates(PDO $pdo, int $siteId, array $tokens): array
    {
        if (!$tokens) {
            return [];
        }

        $params = [':site_id' => $siteId];
        $conditions = ai_build_like_conditions(
            $tokens,
            ['title', 'question', 'answer', 'content', 'type'],
            $params,
            'knowledge'
        );

        $sql = "
            SELECT id, site_id, type, title, question, answer, content, url, status, created_at, updated_at
            FROM knowledge_sources
            WHERE site_id = :site_id
              AND status IN ('approved', 'active')
              AND (" . implode(' OR ', $conditions) . ")
            ORDER BY status = 'approved' DESC, id DESC
            LIMIT 80
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll();
    }
}

if (!function_exists('ai_candidate_source_key')) {
    function ai_candidate_source_key(array $candidate): string
    {
        return implode(':', [
            $candidate['type'] ?? '',
            $candidate['knowledge_source_id'] ?? '',
            $candidate['question_id'] ?? '',
            $candidate['chunk_id'] ?? '',
        ]);
    }
}

if (!function_exists('ai_confidence_label')) {
    function ai_confidence_label(float $score): string
    {
        if ($score >= 85) {
            return 'very_high';
        }

        if ($score >= 70) {
            return 'high';
        }

        if ($score >= 50) {
            return 'medium';
        }

        return 'low';
    }
}

if (!function_exists('ai_find_best_answer')) {
    function ai_find_best_answer(PDO $pdo, array $site, string $question): array
    {
        $startedAt = microtime(true);
        $tenantId = (int) $site['tenant_id'];
        $siteId = (int) $site['id'];
        $profile = ai_build_question_profile($question);
        $detected = ai_detect_question_intent($question);

        $emptyResult = static function (string $message) use ($question, $profile, $detected, $startedAt): array {
            return [
                'success' => false,
                'reply_mode' => 'no_answer',
                'message' => $message,
                'question' => trim($question),
                'normalized_question' => $profile['normalized'],
                'tokens' => $profile['tokens'],
                'expanded_tokens' => $profile['expanded_tokens'],
                'detected' => $detected,
                'confidence_score' => 0,
                'confidence_label' => 'low',
                'answer' => null,
                'sources' => [],
                'best_candidates' => [],
                'search_meta' => [
                    'engine_version' => ai_search_engine_version(),
                    'candidate_count' => 0,
                    'score_gap' => 0,
                    'matched_terms' => [],
                    'processing_time_ms' => round((microtime(true) - $startedAt) * 1000, 2),
                ],
            ];
        };

        if (mb_strlen($profile['normalized']) < 2 || !$profile['tokens']) {
            return $emptyResult('Question is too short');
        }

        $searchTokens = $profile['expanded_tokens'];
        $legacyCandidates = ai_search_legacy_knowledge_candidates($pdo, $siteId, $searchTokens);
        $chunkCandidates = ai_search_chunk_candidates($pdo, $tenantId, $siteId, $searchTokens);
        $questionCandidates = ai_search_question_candidates($pdo, $tenantId, $siteId, $searchTokens);
        $chunkIds = [];

        foreach ($chunkCandidates as $candidate) {
            $chunkIds[] = (int) $candidate['chunk_id'];
        }

        foreach ($questionCandidates as $candidate) {
            if (!empty($candidate['chunk_id'])) {
                $chunkIds[] = (int) $candidate['chunk_id'];
            }
        }

        $termBoosts = ai_load_term_boosts($pdo, $tenantId, $siteId, $chunkIds, $searchTokens);
        $scored = [];

        foreach ($legacyCandidates as $candidate) {
            $title = trim((string) ($candidate['title'] ?? ''));
            $candidateQuestion = trim((string) ($candidate['question'] ?? ''));
            $answer = trim((string) ($candidate['answer'] ?? ''));
            $content = trim((string) ($candidate['content'] ?? ''));
            $answerText = $answer !== '' ? $answer : $content;

            if ($answerText === '') {
                continue;
            }

            $questionField = ai_score_text_field($profile, trim($title . ' ' . $candidateQuestion . ' ' . ($candidate['type'] ?? '')));
            $answerField = ai_score_text_field($profile, $answerText);
            $allField = ai_score_text_field($profile, trim($title . ' ' . $candidateQuestion . ' ' . $answerText));
            $boosts = 12.0;
            $boosts += ($candidate['status'] ?? '') === 'approved' ? 6 : 0;
            $boosts += ($candidate['type'] ?? '') === 'faq' ? 4 : 0;
            $score = ($questionField['score'] * 0.56) + ($answerField['score'] * 0.29) + ($allField['score'] * 0.15) + $boosts;

            $scored[] = [
                'type' => 'knowledge_source',
                'score' => min(100, round($score, 2)),
                'knowledge_source_id' => (int) $candidate['id'],
                'question_id' => null,
                'chunk_id' => null,
                'page_id' => null,
                'answer_text' => $answerText,
                'matched_question' => $candidateQuestion ?: $title,
                'category' => 'دانش دستی سایت',
                'intent' => $candidate['type'] ?: 'manual_knowledge',
                'url' => $candidate['url'] ?? null,
                'title' => $title ?: $candidateQuestion ?: 'دانش دستی سایت',
                'is_user_edited' => true,
                'matched_terms' => array_values(array_unique(array_merge($questionField['matched_terms'], $answerField['matched_terms']))),
                'score_breakdown' => [
                    'question_match' => $questionField['score'],
                    'answer_match' => $answerField['score'],
                    'intent_boost' => 0,
                    'term_boost' => 0,
                    'source_boost' => $boosts,
                ],
            ];
        }

        foreach ($questionCandidates as $candidate) {
            $questionField = ai_score_text_field($profile, (string) ($candidate['question'] ?? ''));
            $answerField = ai_score_text_field($profile, (string) ($candidate['answer_text'] ?? ''));
            $contextField = ai_score_text_field($profile, trim((string) ($candidate['title'] ?? '') . ' ' . (string) ($candidate['main_heading'] ?? '')));
            $intentBoost = 0.0;

            if ($detected['intent'] !== 'general_info' && $candidate['detected_intent'] === $detected['intent']) {
                $intentBoost += 8;
            }

            if ($detected['category'] && $candidate['category'] === $detected['category']) {
                $intentBoost += 5;
            }

            $termBoost = !empty($candidate['chunk_id']) && isset($termBoosts[(int) $candidate['chunk_id']])
                ? $termBoosts[(int) $candidate['chunk_id']]
                : 0;
            $sourceBoost = min(6, ((float) $candidate['score']) / 16);
            $sourceBoost += !empty($candidate['is_user_edited']) ? 8 : 0;
            $score = ($questionField['score'] * 0.63)
                + ($answerField['score'] * 0.25)
                + ($contextField['score'] * 0.12)
                + $intentBoost
                + $termBoost
                + $sourceBoost;

            $scored[] = [
                'type' => 'generated_question',
                'score' => min(100, round($score, 2)),
                'knowledge_source_id' => null,
                'question_id' => (int) $candidate['question_id'],
                'chunk_id' => !empty($candidate['chunk_id']) ? (int) $candidate['chunk_id'] : null,
                'page_id' => !empty($candidate['page_id']) ? (int) $candidate['page_id'] : null,
                'answer_text' => $candidate['answer_text'] ?? '',
                'matched_question' => $candidate['question'] ?? '',
                'category' => $candidate['category'] ?? null,
                'intent' => $candidate['detected_intent'] ?? null,
                'url' => $candidate['url'] ?? null,
                'title' => $candidate['title'] ?? null,
                'is_user_edited' => !empty($candidate['is_user_edited']),
                'matched_terms' => array_values(array_unique(array_merge($questionField['matched_terms'], $answerField['matched_terms']))),
                'score_breakdown' => [
                    'question_match' => $questionField['score'],
                    'answer_match' => $answerField['score'],
                    'intent_boost' => $intentBoost,
                    'term_boost' => round($termBoost, 2),
                    'source_boost' => round($sourceBoost, 2),
                ],
            ];
        }

        foreach ($chunkCandidates as $candidate) {
            $headingField = ai_score_text_field(
                $profile,
                trim((string) ($candidate['heading'] ?? '') . ' ' . (string) ($candidate['title'] ?? '') . ' ' . (string) ($candidate['main_heading'] ?? ''))
            );
            $contentField = ai_score_text_field($profile, (string) ($candidate['chunk_text'] ?? ''));
            $intentBoost = 0.0;

            if ($detected['intent'] !== 'general_info' && $candidate['detected_intent'] === $detected['intent']) {
                $intentBoost += 8;
            }

            if ($detected['category'] && $candidate['category'] === $detected['category']) {
                $intentBoost += 5;
            }

            $termBoost = $termBoosts[(int) $candidate['chunk_id']] ?? 0;
            $sourceBoost = min(6, ((float) $candidate['importance_score']) / 16);
            $score = ($headingField['score'] * 0.35)
                + ($contentField['score'] * 0.55)
                + (max($headingField['score'], $contentField['score']) * 0.10)
                + $intentBoost
                + $termBoost
                + $sourceBoost;

            $scored[] = [
                'type' => 'content_chunk',
                'score' => min(100, round($score, 2)),
                'knowledge_source_id' => null,
                'question_id' => null,
                'chunk_id' => (int) $candidate['chunk_id'],
                'page_id' => (int) $candidate['page_id'],
                'answer_text' => $candidate['chunk_text'] ?? '',
                'matched_question' => $candidate['heading'] ?? null,
                'category' => $candidate['category'] ?? null,
                'intent' => $candidate['detected_intent'] ?? null,
                'url' => $candidate['url'] ?? null,
                'title' => $candidate['title'] ?? null,
                'is_user_edited' => false,
                'matched_terms' => array_values(array_unique(array_merge($headingField['matched_terms'], $contentField['matched_terms']))),
                'score_breakdown' => [
                    'question_match' => $headingField['score'],
                    'answer_match' => $contentField['score'],
                    'intent_boost' => $intentBoost,
                    'term_boost' => round($termBoost, 2),
                    'source_boost' => round($sourceBoost, 2),
                ],
            ];
        }

        $scored = array_values(array_filter($scored, static fn ($item) => $item['score'] > 0));
        usort($scored, static fn ($a, $b) => $b['score'] <=> $a['score']);
        $deduplicated = [];
        $seen = [];

        foreach ($scored as $candidate) {
            $key = ai_candidate_source_key($candidate);

            if (isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
            $candidate['preview'] = mb_substr(trim((string) $candidate['answer_text']), 0, 220);
            unset($candidate['answer_text']);
            $deduplicated[] = $candidate;
        }

        $bestRaw = $scored[0] ?? null;

        if (!$bestRaw) {
            return $emptyResult('No matching knowledge found');
        }

        $secondScore = isset($scored[1]) ? (float) $scored[1]['score'] : 0.0;
        $gap = max(0, (float) $bestRaw['score'] - $secondScore);
        $confidence = (float) $bestRaw['score'];
        $matchedCount = count($bestRaw['matched_terms'] ?? []);
        $tokenCoverage = $matchedCount / max(1, count($profile['tokens']));

        if ($gap >= 10) {
            $confidence += min(6, $gap * 0.20);
        } elseif ($secondScore >= 40 && $gap < 3) {
            $confidence -= 5;
        }

        if ($tokenCoverage < 0.50 && count($profile['tokens']) >= 2) {
            $confidence -= 7;
        }

        if (($bestRaw['type'] === 'knowledge_source') || !empty($bestRaw['is_user_edited'])) {
            $confidence += 3;
        }

        $confidence = min(100, max(0, round($confidence, 2)));
        $sources = [];

        foreach (array_slice($deduplicated, 0, 3) as $item) {
            $sources[] = [
                'type' => $item['type'],
                'score' => $item['score'],
                'knowledge_source_id' => $item['knowledge_source_id'] ?? null,
                'page_id' => $item['page_id'] ?? null,
                'chunk_id' => $item['chunk_id'] ?? null,
                'question_id' => $item['question_id'] ?? null,
                'title' => $item['title'] ?? null,
                'url' => $item['url'] ?? null,
                'category' => $item['category'] ?? null,
                'intent' => $item['intent'] ?? null,
                'matched_terms' => $item['matched_terms'] ?? [],
                'score_breakdown' => $item['score_breakdown'] ?? [],
            ];
        }

        $answerText = (string) ($bestRaw['answer_text'] ?? '');
        $answer = ai_build_excerpt_reply($answerText, $profile['tokens'], $question);

        return [
            'success' => true,
            'reply_mode' => 'suggestion',
            'message' => 'Best answer found',
            'question' => trim($question),
            'normalized_question' => $profile['normalized'],
            'tokens' => $profile['tokens'],
            'expanded_tokens' => $profile['expanded_tokens'],
            'detected' => $detected,
            'confidence_score' => $confidence,
            'confidence_label' => ai_confidence_label($confidence),
            'answer' => $answer,
            'matched_type' => $bestRaw['type'],
            'matched_knowledge_source_id' => $bestRaw['knowledge_source_id'] ?? null,
            'matched_chunk_id' => $bestRaw['chunk_id'] ?? null,
            'matched_question_id' => $bestRaw['question_id'] ?? null,
            'sources' => $sources,
            'best_candidates' => array_slice($deduplicated, 0, 5),
            'search_meta' => [
                'engine_version' => ai_search_engine_version(),
                'candidate_count' => count($deduplicated),
                'score_gap' => round($gap, 2),
                'matched_terms' => $bestRaw['matched_terms'] ?? [],
                'processing_time_ms' => round((microtime(true) - $startedAt) * 1000, 2),
            ],
        ];
    }
}
