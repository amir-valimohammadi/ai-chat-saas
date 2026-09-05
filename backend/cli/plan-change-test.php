<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../includes/plan-change.php';
$count = 0;
foreach ([
    ['2027-01-31 12:34:56', 'monthly', '2027-02-28 12:34:56'],
    ['2028-01-31 12:34:56', 'monthly', '2028-02-29 12:34:56'],
    ['2028-02-29 12:34:56', 'yearly', '2029-02-28 12:34:56'],
    ['2026-11-30 12:34:56', 'quarterly', '2027-02-28 12:34:56'],
    ['2026-09-05 12:34:56', 'monthly', '2026-10-05 12:34:56'],
] as [$start, $cycle, $expected]) {
    $actual = plan_change_end(new DateTimeImmutable($start, new DateTimeZone('Asia/Tehran')), $cycle);
    if ($actual->format('Y-m-d H:i:s') !== $expected) throw new RuntimeException('Calendar cycle assertion failed.');
    $count++;
}
foreach (['0', '1250.50', '999999999999.99'] as $price) {
    if (plan_change_price($price) !== $price) throw new RuntimeException('Valid price rejected.');
    $count++;
}
foreach ([null, true, [], '-1', '1e3', '12.345', '1000000000000', '', '1,000', '01', INF] as $price) {
    if (plan_change_price($price) !== null) throw new RuntimeException('Invalid price accepted.');
    $count++;
}
echo "Plan change: {$count} assertions passed; no database access.\n";
