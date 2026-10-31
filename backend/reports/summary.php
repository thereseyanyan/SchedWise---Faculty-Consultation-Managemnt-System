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

try {
    // Use the database clock so PHP/MySQL timezone differences do not select
    // the wrong default month around month boundaries.
    [$defaultYear, $defaultMonth] = dbCurrentYearMonth();
    $year = isset($_GET['year']) ? (int)$_GET['year'] : $defaultYear;
    $month = isset($_GET['month']) ? (int)$_GET['month'] : $defaultMonth;

    if ($year < 2000 || $year > 2100 || $month < 1 || $month > 12) {
        respond(['error' => 'Invalid year or month'], 400);
    }

    $startDate = sprintf('%04d-%02d-01', $year, $month);
    $endDate = date('Y-m-t', strtotime($startDate));

    $whereConditions = ['a.appointment_date BETWEEN :start_date AND :end_date'];
    $params = [
        ':start_date' => $startDate,
        ':end_date' => $endDate,
    ];

    [$scopeConditions, $scopeParams] = reportScopeFilters($pdo, $user, $_GET);
    $whereConditions = array_merge($whereConditions, $scopeConditions);
    $params = array_merge($params, $scopeParams);

    $whereClause = 'WHERE ' . implode(' AND ', $whereConditions);
    $stats = [];

    $statement = $pdo->prepare(
        "SELECT COUNT(*) as total FROM appointments a {$whereClause}"
    );
    $statement->execute($params);
    $stats['total_appointments'] = (int)$statement->fetchColumn();

    $statement = $pdo->prepare(
        "SELECT status, COUNT(*) as count
         FROM appointments a
         {$whereClause}
         GROUP BY status"
    );
    $statement->execute($params);
    $stats['appointments_by_status'] = [];
    foreach ($statement->fetchAll() as $row) {
        $stats['appointments_by_status'][$row['status']] = (int)$row['count'];
    }

    $statement = $pdo->prepare(
        "SELECT COUNT(*) FROM appointments a {$whereClause} AND a.status = 'completed'"
    );
    $statement->execute($params);
    $stats['completed_appointments'] = (int)$statement->fetchColumn();

    $statement = $pdo->prepare(
        "SELECT COUNT(*) FROM appointments a {$whereClause} AND a.status = 'cancelled'"
    );
    $statement->execute($params);
    $stats['cancelled_appointments'] = (int)$statement->fetchColumn();

    $statement = $pdo->prepare(
        "SELECT COUNT(*) FROM appointments a {$whereClause} AND a.status = 'pending'"
    );
    $statement->execute($params);
    $stats['pending_appointments'] = (int)$statement->fetchColumn();

    $stats['completion_rate'] = $stats['total_appointments'] > 0
        ? round(($stats['completed_appointments'] / $stats['total_appointments']) * 100, 2)
        : 0;
    $stats['cancellation_rate'] = $stats['total_appointments'] > 0
        ? round(($stats['cancelled_appointments'] / $stats['total_appointments']) * 100, 2)
        : 0;

    if ($user['role_id'] === 'admin') {
        $statement = $pdo->prepare(
            "SELECT u.id, up.first_name, up.last_name, COUNT(a.id) as appointment_count
             FROM appointments a
             JOIN users u ON a.faculty_id = u.id
             LEFT JOIN user_profiles up ON u.id = up.user_id
             {$whereClause}
             GROUP BY u.id, up.first_name, up.last_name
             ORDER BY appointment_count DESC
             LIMIT 5"
        );
        $statement->execute($params);
        $stats['top_faculty'] = $statement->fetchAll();
    }

    if ($user['role_id'] === 'faculty' || $user['role_id'] === 'admin') {
        $facultyId = $user['role_id'] === 'faculty'
            ? $user['id']
            : ($params[':report_faculty_id'] ?? $user['id']);
        if ($user['role_id'] === 'faculty') {
            $statement = $pdo->prepare(
                "SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
                 FROM appointments a
                 WHERE a.faculty_id = :faculty_id
                   AND a.appointment_date BETWEEN :start_date AND :end_date"
            );
            $statement->execute([
                ':faculty_id' => $facultyId,
                ':start_date' => $startDate,
                ':end_date' => $endDate,
            ]);
            $facultyStats = $statement->fetch();
            $stats['faculty_stats'] = [
                'total' => (int)$facultyStats['total'],
                'completed' => (int)$facultyStats['completed'],
                'cancelled' => (int)$facultyStats['cancelled'],
                'completion_rate' => $facultyStats['total'] > 0
                    ? round(($facultyStats['completed'] / $facultyStats['total']) * 100, 2)
                    : 0,
            ];
        }
    }

    respond([
        'period' => [
            'year' => $year,
            'month' => $month,
            'start_date' => $startDate,
            'end_date' => $endDate,
        ],
        'filters' => [
            'faculty_id' => $params[':report_faculty_id'] ?? null,
            'department_id' => $params[':report_department_id'] ?? null,
        ],
        'statistics' => $stats,
    ]);
} catch (Throwable $exception) {
    respondServerError($exception, 'Failed to generate report.');
}
