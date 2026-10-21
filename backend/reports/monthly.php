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

// Anchor the series to the database month to keep the report aligned with
// stored appointment dates even when PHP and MySQL use different timezones.
$monthStart = (string)$pdo->query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-01')")->fetchColumn();
$end = new DateTimeImmutable($monthStart);
$start = $end->modify('-' . ($months - 1) . ' months');

$roleFilter = '';
$params = [
    ':start_date' => $start->format('Y-m-d'),
    ':end_date' => $end->modify('last day of this month')->format('Y-m-d'),
];

if ($user['role_id'] === 'student') {
    $roleFilter = 'AND student_id = :uid';
    $params[':uid'] = $user['id'];
} elseif ($user['role_id'] === 'faculty') {
    $roleFilter = 'AND faculty_id = :uid';
    $params[':uid'] = $user['id'];
}

try {
    $statement = $pdo->prepare(
        "SELECT DATE_FORMAT(appointment_date, '%Y-%m') AS period,
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
         FROM appointments
         WHERE appointment_date BETWEEN :start_date AND :end_date
         {$roleFilter}
         GROUP BY DATE_FORMAT(appointment_date, '%Y-%m')
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
        'series' => $series,
    ]);
} catch (Throwable $exception) {
    respondServerError($exception, 'Failed to generate monthly report.');
}
