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

// Public self-registration is limited to student accounts. Faculty and
// administrator accounts must be created by an administrator.
if (isset($input['role_id']) && $input['role_id'] !== 'student') {
    respond(['error' => 'Only student accounts can be self-registered'], 403);
}
$input['role_id'] = 'student';

// Validate input
$validationErrors = validateRegistrationData($input);
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
    $studentNumber = allocateAccountNumber($pdo, 'student', $input['student_number'] ?? null);

    // Self-registered accounts remain pending until the email address is
    // verified. Demo and administrator-created accounts stay active.
    $userId = bin2hex(random_bytes(16));
    $statement = $pdo->prepare(
        'INSERT INTO users (id, email, password_hash, role_id, status, email_verified_at)
         VALUES (:id, :email, :password_hash, :role_id, :status, :email_verified_at)'
    );
    $statement->execute([
        ':id' => $userId,
        ':email' => strtolower((string)$input['email']),
        ':password_hash' => hashPassword((string)$input['password']),
        ':role_id' => 'student',
        ':status' => 'pending',
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
        ':faculty_number' => null,
        ':department_id' => $input['department_id'] ?? null,
        ':program' => $input['program'] ?? null,
        ':phone' => $input['phone'] ?? null,
    ]);

    $verificationToken = issueEmailVerification($pdo, $userId);

    $pdo->commit();

    logAudit('create', 'user', $userId, [], ['email' => $input['email'], 'role_id' => 'student']);

    $mailSent = false;
    try {
        sendEmailVerificationLink(
            strtolower((string)$input['email']),
            emailVerificationUrl($verificationToken)
        );
        $mailSent = true;
    } catch (Throwable $mailException) {
        // The account remains pending and the user can request a new link.
        // Never log the token or the verification URL.
        error_log(sprintf(
            'Verification email failed for user %s: %s',
            $userId,
            $mailException->getMessage()
        ));
    }

    $response = [
        'message' => 'Account created. Verify your email address before signing in.',
        'user_id' => $userId,
        'student_number' => $studentNumber,
        'verification_required' => true,
        'email_sent' => $mailSent,
    ];

    // Local debugging fallback when Mailpit is unavailable. The token is only
    // returned to localhost in debug mode, matching the reset-code policy.
    if (!empty($config['app']['debug'])
        && in_array(clientIp(), ['127.0.0.1', '::1'], true)
    ) {
        $response['debug_verification_url'] = emailVerificationUrl($verificationToken);
    }

    respond($response, 201);
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
    }
    respondServerError($exception, 'Registration failed. Please try again.');
}
