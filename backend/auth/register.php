<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['error' => 'Method not allowed.'], 405);
}

$ip = clientIp();
if (isRateLimited('register', $ip, 10, 3600)) {
    header('Retry-After: 3600');
    respond(['error' => 'Too many registration attempts. Please try again later.'], 429);
}
recordRateLimitAttempt('register', $ip);

$input = jsonInput();
$input['role_id'] = $input['role_id'] ?? 'student';
if (is_string($input['role_id'])) $input['role_id'] = strtolower(trim($input['role_id']));
$typeErrors = validateRegistrationData($input);
if ($typeErrors !== []) {
    respond(['error' => 'Validation failed', 'fields' => $typeErrors], 400);
}
foreach (['first_name', 'last_name'] as $field) $input[$field] = trim($input[$field]);
$input['email'] = strtolower(trim((string)($input['email'] ?? '')));
$input['student_number'] = strtoupper(trim((string)($input['student_number'] ?? '')));

// Only students may submit public applications.
$role = strtolower(trim((string)($input['role_id'] ?? 'student')));
if ($role !== 'student') {
    respond(['error' => 'Only students can self-register. Faculty accounts are created by an administrator.'], 403);
}
$input['role_id'] = $role;

// Validate input
$validationErrors = [];
if (!validateStudentNumber($input['student_number'])) {
    $validationErrors['student_number'] = 'Enter your Student ID (1–100 letters, digits, dots, hyphens, or underscores).';
}
if (!empty($validationErrors)) {
    respond(['error' => 'Validation failed', 'fields' => $validationErrors], 400);
}

// Basic length limits for profile fields.
$lengthLimits = [
    'first_name' => 100,
    'last_name' => 100,
    'student_number' => 100,
    'department_id' => 255,
    'program' => 255,
    'phone' => 20,
];
foreach ($lengthLimits as $field => $limit) {
    if (isset($input[$field]) && strlen((string)$input[$field]) > $limit) {
        respond(['error' => ucfirst(str_replace('_', ' ', $field)) . " must not exceed {$limit} characters"], 400);
    }
}

global $pdo;

// Department IDs are stored in user_profiles. Reject labels or unknown IDs so
// the faculty directory and reports can join departments reliably.
if (!empty($input['department_id'])) {
    $departmentStmt = $pdo->prepare(
        "SELECT id FROM departments WHERE id = :id AND status = 'active'"
    );
    $departmentStmt->execute([':id' => (string)$input['department_id']]);
    if (!$departmentStmt->fetch()) {
        respond([
            'error' => 'Validation failed',
            'fields' => ['department_id' => 'Select a valid department'],
        ], 400);
    }
}

// Check if email already exists.
$statement = $pdo->prepare('SELECT id FROM users WHERE email = :email');
$statement->execute([':email' => strtolower((string)$input['email'])]);
if ($statement->fetch()) {
    respond(['error' => 'Email already registered', 'fields' => ['email' => 'Email already registered']], 409);
}

try {
    $pdo->beginTransaction();
    $studentNumber = $input['student_number'];
    $facultyNumber = null;
    $existingNumber = $pdo->prepare('SELECT user_id FROM user_profiles WHERE student_number = ?');
    $existingNumber->execute([$studentNumber]);
    if ($existingNumber->fetchColumn()) {
        $pdo->rollBack();
        respond(['error' => 'Student ID already registered', 'fields' => ['student_number' => 'This Student ID is already registered.']], 409);
    }

    // Student applications remain pending until an administrator approves them.
    $userId = bin2hex(random_bytes(16));
    $statement = $pdo->prepare(
        'INSERT INTO users (id, email, password_hash, role_id, status, student_approval_status, email_verified_at)
         VALUES (:id, :email, :password_hash, :role_id, :status, :student_approval_status, :email_verified_at)'
    );
    $statement->execute([
        ':id' => $userId,
        ':email' => strtolower((string)$input['email']),
        ':password_hash' => hashPassword((string)$input['password']),
        ':role_id' => $role,
        ':status' => 'pending',
        ':student_approval_status' => 'pending',
        ':email_verified_at' => null,
    ]);

    // Create user profile
    $statement = $pdo->prepare(
        'INSERT INTO user_profiles (user_id, first_name, last_name, student_number, faculty_number, department_id, program, phone)
         VALUES (:user_id, :first_name, :last_name, :student_number, :faculty_number, :department_id, :program, :phone)'
    );
    $statement->execute([
        ':user_id' => $userId,
        ':first_name' => $input['first_name'] ?? null,
        ':last_name' => $input['last_name'] ?? null,
        ':student_number' => $studentNumber,
        ':faculty_number' => $facultyNumber,
        ':department_id' => $input['department_id'] ?? null,
        ':program' => $role === 'student' ? ($input['program'] ?? null) : null,
        ':phone' => $input['phone'] ?? null,
    ]);

    logAudit('create', 'user', $userId, [], ['role_id' => 'student', 'student_approval_status' => 'pending']);
    $pdo->commit();
    $emailSent = false;
    try {
        sendStudentRegistrationReceived(
            $input['email'],
            trim((string)$input['first_name'] . ' ' . (string)$input['last_name']),
            $studentNumber
        );
        $emailSent = true;
    } catch (Throwable $mailException) {
        // Preserve the application if the SMTP provider is unavailable.
        error_log('Registration email failed for user ' . $userId . ': ' . $mailException->getMessage());
    }
    respond([
        'message' => 'Student application submitted. Wait for administrator approval, then sign in with your Student ID and password.',
        'user_id' => $userId,
        'student_number' => $studentNumber,
        'approval_required' => true,
        'verification_required' => false,
        'email_sent' => $emailSent,
    ], 201);

} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ($exception instanceof PDOException && $exception->getCode() === '23000') {
        $existing = $pdo->prepare('SELECT id FROM users WHERE email = ?');
        $existing->execute([strtolower(trim((string)$input['email']))]);
        if ($existing->fetchColumn()) {
            respond(['error' => 'Email already registered', 'fields' => ['email' => 'Email already registered']], 409);
        }
        $existingNumber = $pdo->prepare('SELECT user_id FROM user_profiles WHERE student_number = ?');
        $existingNumber->execute([$input['student_number']]);
        if ($existingNumber->fetchColumn()) {
            respond(['error' => 'Student ID already registered', 'fields' => ['student_number' => 'This Student ID is already registered.']], 409);
        }
    }
    respondServerError($exception, 'Registration failed. Please try again.');
}
