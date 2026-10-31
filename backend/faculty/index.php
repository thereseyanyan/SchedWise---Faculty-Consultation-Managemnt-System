<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(['error' => 'Method not allowed.'], 405);
}

// Any authenticated user may browse the active faculty directory
$user = authenticateUser();

global $pdo;

try {
    $statement = $pdo->prepare(
        'SELECT u.id, u.email, u.status,
                up.first_name, up.last_name, up.faculty_number, up.department_id,
                up.program, up.phone,
                d.name AS department_name
         FROM users u
         LEFT JOIN user_profiles up ON u.id = up.user_id
         LEFT JOIN departments d ON up.department_id = d.id
         WHERE u.role_id = :role_id AND u.status = :status
         ORDER BY up.last_name, up.first_name'
    );
    $statement->execute([':role_id' => 'faculty', ':status' => 'active']);
    $faculty = $statement->fetchAll();

    if ($user['role_id'] !== 'admin') {
        foreach ($faculty as &$member) {
            unset($member['phone'], $member['faculty_number']);
        }
        unset($member);
    }
    respond($faculty);
} catch (Throwable $exception) {
    respondServerError($exception, 'Failed to load faculty directory.');
}
