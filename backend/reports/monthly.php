<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(['error' => 'Method not allowed.'], 405);
}

$user = authenticateUser();
global $pdo;

$months = isset($_GET['months']) ? max(1, min(24, (int)$_GET['months'])) : 6;
$endMonth = trim((string)($_GET['end_month'] ?? ''));

if ($endMonth !== '') {
    if (!preg_match('/^\d{4}-\d{2}$/', $endMonth)) {
        respond(['error' => 'End month must use YYYY-MM format'], 400);
    }
    [$endYear, $endMonthNumber] = array_map('intval', explode('-', $endMonth));
    if ($endYear < 2000 || $endYear > 2100 || $endMonthNumber < 1 || $endMonthNumber > 12) {
        respond(['error' => 'Invalid end month'], 400);
    }
    $monthStart = sprintf('%04d-%02d-01', $endYear, $endMonthNumber);
} else {
    // Anchor the series to the database month to keep the report aligned with
    // stored appointment dates even when PHP and MySQL use different timezones.
    $monthStart = (string)$pdo->query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-01')")->fetchColumn();
}

$end = new DateTimeImmutable($monthStart);
$start = $end->modify('-' . ($months - 1) . ' months');

$params = [
    ':start_date' => $start->format('Y-m-d'),
    ':end_date' => $end->modify('last day of this month')->format('Y-m-d'),
];
[$scopeConditions, $scopeParams] = reportScopeFilters($pdo, $user, $_GET);
$whereConditions = array_merge(['a.appointment_date BETWEEN :start_date AND :end_date'], $scopeConditions);
$whereClause = 'WHERE ' . implode(' AND ', $whereConditions);
$params = array_merge($params, $scopeParams);

try {
    $statement = $pdo->prepare(
        "SELECT DATE_FORMAT(a.appointment_date, '%Y-%m') AS period,
                COUNT(*) AS total,
                SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
                SUM(CASE WHEN a.status = 'pending' THEN 1 ELSE 0 END) AS pending
         FROM appointments a
         {$whereClause}
         GROUP BY DATE_FORMAT(a.appointment_date, '%Y-%m')
         ORDER BY period ASC"
    );
    $statement->execute($params);
    $rows = $statement->fetchAll();

    $byPeriod = [];
    foreach ($rows as $row) {
        $byPeriod[$row['period']] = [
            'period' => $row['period'],
            'total' => (int)$row['total'],
            'completed' => (int)$row['completed'],
            'cancelled' => (int)$row['cancelled'],
            'pending' => (int)$row['pending'],
        ];
    }

    $series = [];
    $cursor = $start;
    for ($i = 0; $i < $months; $i++) {
        $key = $cursor->format('Y-m');
        $label = $cursor->format('M');
        $entry = $byPeriod[$key] ?? [
            'period' => $key,
            'total' => 0,
            'completed' => 0,
            'cancelled' => 0,
            'pending' => 0,
        ];
        $entry['month'] = $label;
        $series[] = $entry;
        $cursor = $cursor->modify('+1 month');
    }

    respond([
        'months' => $months,
        'end_month' => $end->format('Y-m'),
        'filters' => [
            'faculty_id' => $params[':report_faculty_id'] ?? null,
            'department_id' => $params[':report_department_id'] ?? null,
        ],
        'series' => $series,
    ]);
} catch (Throwable $exception) {
    respondServerError($exception, 'Failed to generate monthly report.');
}
