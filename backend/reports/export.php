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

// Prevent spreadsheet formula injection when a cell starts with a dangerous
// character (for example a topic beginning with "=" or "+").
function csvSafeCell(mixed $value): string
{
    $text = (string)($value ?? '');
    if ($text !== '' && preg_match('/^[=+\-@\t\r\n]/', $text)) {
        return "'" . $text;
    }
    return $text;
}

if ($user['role_id'] !== 'admin' && $user['role_id'] !== 'faculty') {
    respond(['error' => 'Insufficient permissions'], 403);
}

global $pdo;

[$defaultYear, $defaultMonth] = dbCurrentYearMonth();
$year = isset($_GET['year']) ? (int)$_GET['year'] : $defaultYear;
$month = isset($_GET['month']) ? (int)$_GET['month'] : $defaultMonth;

if ($year < 2000 || $year > 2100 || $month < 1 || $month > 12) {
    respond(['error' => 'Invalid year or month'], 400);
}

$startDate = sprintf('%04d-%02d-01', $year, $month);
$endDate = date('Y-m-t', strtotime($startDate));

$where = ['a.appointment_date BETWEEN :start_date AND :end_date'];
$params = [':start_date' => $startDate, ':end_date' => $endDate];

[$scopeConditions, $scopeParams] = reportScopeFilters($pdo, $user, $_GET);
$where = array_merge($where, $scopeConditions);
$params = array_merge($params, $scopeParams);

$whereClause = 'WHERE ' . implode(' AND ', $where);

try {
    $statement = $pdo->prepare(
        "SELECT a.id, a.appointment_date, a.start_minutes, a.end_minutes, a.topic, a.status,
                a.reason, a.location,
                CONCAT(COALESCE(us.first_name, ''), ' ', COALESCE(us.last_name, '')) AS student_name,
                us.student_number,
                CONCAT(COALESCE(uf.first_name, ''), ' ', COALESCE(uf.last_name, '')) AS faculty_name,
                uf.faculty_number
         FROM appointments a
         LEFT JOIN user_profiles us ON a.student_id = us.user_id
         LEFT JOIN user_profiles uf ON a.faculty_id = uf.user_id
         {$whereClause}
         ORDER BY a.appointment_date, a.start_minutes"
    );
    $statement->execute($params);
    $rows = $statement->fetchAll();

    $format = strtolower((string)($_GET['format'] ?? 'json'));

    if ($format === 'csv') {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="schedwise-appointments-' . $year . '-' . sprintf('%02d', $month) . '.csv"');

        $out = fopen('php://output', 'w');
        fputcsv($out, [
            'id', 'date', 'start_minutes', 'end_minutes', 'topic', 'status',
            'student', 'student_number', 'faculty', 'faculty_number', 'location', 'reason',
        ]);
        foreach ($rows as $row) {
            fputcsv($out, array_map('csvSafeCell', [
                $row['id'],
                $row['appointment_date'],
                $row['start_minutes'],
                $row['end_minutes'],
                $row['topic'],
                $row['status'],
                trim($row['student_name']),
                $row['student_number'],
                trim($row['faculty_name']),
                $row['faculty_number'],
                $row['location'],
                $row['reason'],
            ]));
        }
        fclose($out);
        exit;
    }

    respond([
        'period' => ['year' => $year, 'month' => $month, 'start_date' => $startDate, 'end_date' => $endDate],
        'filters' => [
            'faculty_id' => $params[':report_faculty_id'] ?? null,
            'department_id' => $params[':report_department_id'] ?? null,
        ],
        'rows' => $rows,
        'count' => count($rows),
    ]);
} catch (Throwable $exception) {
    respondServerError($exception, 'Failed to export report.');
}
