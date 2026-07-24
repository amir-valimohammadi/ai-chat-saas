<?php

declare(strict_types=1);

if (!function_exists('admin_impersonation_revoke_for_admin')) {
    /**
     * پایان‌دادن تمام Ticketها و نشست‌های ورود موقت صادرشده توسط یک مدیر.
     * این تابع داخل Transaction موجود نیز قابل اجرا است.
     */
    function admin_impersonation_revoke_for_admin(
        PDO $pdo,
        int $adminUserId,
        ?int $endedBy,
        string $reason = 'Administrator access changed'
    ): array {
        $sessionStmt = $pdo->prepare(
            "UPDATE auth_sessions s
             INNER JOIN admin_impersonations ai ON ai.id=s.impersonation_id
             SET s.revoked_at=COALESCE(s.revoked_at,NOW()),
                 s.revoked_by=:ended_by,
                 s.revocation_reason=:reason
             WHERE ai.admin_user_id=:admin_id
               AND ai.status IN ('issued','active')
               AND s.revoked_at IS NULL"
        );
        $sessionStmt->execute([
            ':ended_by' => $endedBy,
            ':reason' => substr($reason, 0, 255),
            ':admin_id' => $adminUserId,
        ]);

        $impersonationStmt = $pdo->prepare(
            "UPDATE admin_impersonations
             SET status='revoked',
                 ended_at=COALESCE(ended_at,NOW()),
                 ended_by=:ended_by
             WHERE admin_user_id=:admin_id
               AND status IN ('issued','active')"
        );
        $impersonationStmt->execute([
            ':ended_by' => $endedBy,
            ':admin_id' => $adminUserId,
        ]);

        return [
            'sessions_revoked' => $sessionStmt->rowCount(),
            'impersonations_revoked' => $impersonationStmt->rowCount(),
        ];
    }
}

if (!function_exists('admin_impersonation_expire_stale')) {
    /**
     * منقضی‌کردن Ticketهای استفاده‌نشده و نشست‌های موقت پایان‌یافته.
     */
    function admin_impersonation_expire_stale(PDO $pdo): array
    {
        $issuedStmt = $pdo->prepare(
            "UPDATE admin_impersonations
             SET status='expired',ended_at=COALESCE(ended_at,NOW())
             WHERE status='issued' AND ticket_expires_at <= NOW()"
        );
        $issuedStmt->execute();

        $activeStmt = $pdo->prepare(
            "UPDATE admin_impersonations
             SET status='expired',ended_at=COALESCE(ended_at,NOW())
             WHERE status='active' AND expires_at <= NOW()"
        );
        $activeStmt->execute();

        $sessionStmt = $pdo->prepare(
            "UPDATE auth_sessions s
             INNER JOIN admin_impersonations ai ON ai.id=s.impersonation_id
             SET s.revoked_at=COALESCE(s.revoked_at,NOW()),
                 s.revocation_reason=COALESCE(s.revocation_reason,'Impersonation expired')
             WHERE s.revoked_at IS NULL
               AND ai.status IN ('ended','expired','revoked')"
        );
        $sessionStmt->execute();

        return [
            'issued_expired' => $issuedStmt->rowCount(),
            'active_expired' => $activeStmt->rowCount(),
            'sessions_revoked' => $sessionStmt->rowCount(),
        ];
    }
}
