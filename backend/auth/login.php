<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['error' => 'Method not allowed.'], 405);
}

$input = jsonInput();
$email = strtolower(trim((string)($input['identifier'] ?? $input['student_number'] ?? $input['email'] ?? '')));
$password = (string)($input['password'] ?? '');

if ($email === '' || $password === '') {
    respond(['error' => 'Student ID or email and password are required'], 400);
}


global $pdo;

$ip = clientIp();
$accountKey = $ip . '|' . $email;

// Throttle both per account/IP and per IP to slow down brute force attempts.
if (isRateLimited('login', $accountKey, 10, 900) || isRateLimited('login_ip', $ip, 40, 900)) {
    header('Retry-After: 900');
    respond(['error' => 'Too many login attempts. Please try again later.'], 429);
}

// A valid bcrypt hash used only to keep the response time similar when the
// email does not exist (reduces account enumeration through timing).
$dummyHash = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';

try {
    $statement = $pdo->prepare(
        'SELECT u.id, u.email, u.password_hash, u.role_id, u.status, u.email_verified_at,
                u.faculty_approval_status, u.student_approval_status, u.must_change_password,
                up.first_name, up.last_name, up.student_number, up.faculty_number,
                up.department_id, up.program, up.phone
         FROM users u
         LEFT JOIN user_profiles up ON u.id = up.user_id
         WHERE u.deleted_at IS NULL AND ((u.role_id = \'student\' AND up.student_number = :student_id) OR (u.role_id IN (\'student\', \'faculty\', \'admin\') AND LOWER(u.email) = :email))'
    );
    $statement->execute([':student_id' => strtoupper($email), ':email' => $email]);
    $user = $statement->fetch();

    if (!$user) {
        verifyPassword($password, $dummyHash);
        recordRateLimitAttempt('login', $accountKey);
        recordRateLimitAttempt('login_ip', $ip);
        logAudit('failed_login', null, null, [], ['email_attempted' => $email]);
        respond(['error' => 'Invalid credentials'], 401);
    }

    if (!verifyPassword($password, (string)$user['password_hash'])) {
        recordRateLimitAttempt('login', $accountKey);
        recordRateLimitAttempt('login_ip', $ip);
        logAudit('failed_login', 'user', $user['id'], [], ['reason' => 'invalid_password']);
        respond(['error' => 'Invalid credentials'], 401);
    }

    if ($user['role_id'] === 'student' && in_array($user['student_approval_status'], ['pending', 'rejected'], true)) {
        $pending = $user['student_approval_status'] === 'pending';
        respond(['error' => $pending ? 'Your student application is awaiting administrator approval.' : 'Your student application was rejected. Contact the administrator.',
            'code' => $pending ? 'student_approval_pending' : 'student_approval_rejected'], 403);
    }
    if ($user['role_id'] === 'faculty' && in_array($user['faculty_approval_status'], ['pending', 'rejected'], true)) {
        respond(['error' => 'Contact the administrator to provision your faculty account.'], 403);
    }
    // Do not reveal whether the account exists but is inactive/suspended.
    if ($user['status'] !== 'active') {
        recordRateLimitAttempt('login', $accountKey);
        recordRateLimitAttempt('login_ip', $ip);
        logAudit('failed_login_inactive', 'user', $user['id'], [], ['status' => $user['status']]);
        respond(['error' => 'Invalid credentials'], 401);
    }

    clearRateLimitAttempts('login', $accountKey);

    // Session fixation protection and a fresh CSRF token for the new session.
    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['user_email'] = $user['email'];
    $_SESSION['user_role'] = $user['role_id'];
    $_SESSION['password_fingerprint'] = hash('sha256', (string)$user['password_hash']);
    $_SESSION['logged_in_at'] = time();
    $_SESSION['last_activity'] = time();
    $csrfToken = rotateCsrfToken();

    $statement = $pdo->prepare('UPDATE users SET last_login_at = NOW() WHERE id = :id');
    $statement->execute([':id' => $user['id']]);

    logAudit('login', 'user', $user['id']);

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
        'csrf_token' => $csrfToken,
    ]);
} catch (Throwable $exception) {
    respondServerError($exception, 'Login failed. Please try again.');
}
