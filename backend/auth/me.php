<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(['error' => 'Method not allowed.'], 405);
}

$user = authenticateUser();

respond([
    'user' => [
        'id' => $user['id'],
        'email' => $user['email'],
        'role_id' => $user['role_id'],
        'status' => $user['status'],
        'must_change_password' => (bool)$user['must_change_password'],
        'student_approval_status' => $user['student_approval_status'],
        'faculty_approval_status' => $user['faculty_approval_status'] ?? null,
        'first_name' => $user['first_name'] ?? null,
        'last_name' => $user['last_name'] ?? null,
        'student_number' => $user['student_number'] ?? null,
        'faculty_number' => $user['faculty_number'] ?? null,
        'department_id' => $user['department_id'] ?? null,
        'program' => $user['program'] ?? null,
        'phone' => $user['phone'] ?? null,
    ],
    'csrf_token' => generateCsrfToken(),
]);
