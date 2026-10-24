<?php

declare(strict_types=1);

/**
 * Start the application session with hardened cookie settings.
 */
function startSecureSession(): void
{
    if (session_status() !== PHP_SESSION_NONE) {
        return;
    }

    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', '43200');

    session_name('SCHEDWISESESSID');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    if (!session_start()) {
        http_response_code(503);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Sign-in is temporarily unavailable because session storage could not be opened. Restart SchedWise or contact the administrator.']);
        exit;
    }

    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
}

/**
 * Destroy the current session and expire its cookie.
 */
function destroySession(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        return;
    }

    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'],
            'domain' => $params['domain'],
            'secure' => $params['secure'],
            'httponly' => $params['httponly'],
            'samesite' => $params['samesite'] ?? 'Lax',
        ]);
    }

    session_destroy();
}

/**
 * Check if user is authenticated.
 * Returns user data if authenticated, exits with 401 if not.
 */
function authenticateUser(): array
{
    startSecureSession();

    if (!isset($_SESSION['user_id'])) {
        respond(['error' => 'Authentication required'], 401);
    }

    $idleTimeout = 2 * 60 * 60;        // 2 hours without activity
    $absoluteTimeout = 12 * 60 * 60;   // 12 hours after login

    $timedOut = (isset($_SESSION['last_activity']) && time() - (int)$_SESSION['last_activity'] > $idleTimeout)
        || (isset($_SESSION['logged_in_at']) && time() - (int)$_SESSION['logged_in_at'] > $absoluteTimeout);

    if ($timedOut) {
        destroySession();
        respond(['error' => 'Session expired. Please sign in again.'], 401);
    }

    global $pdo;
    $statement = $pdo->prepare(
        'SELECT u.id, u.email, u.role_id, u.status, u.faculty_approval_status, u.student_approval_status, u.must_change_password, u.password_hash,
                up.first_name, up.last_name,
                up.student_number, up.faculty_number, up.department_id, up.program, up.phone
         FROM users u
         LEFT JOIN user_profiles up ON u.id = up.user_id
         WHERE u.id = :id AND u.deleted_at IS NULL'
    );
    $statement->execute([':id' => $_SESSION['user_id']]);
    $user = $statement->fetch();

    $pendingFaculty = $user
        && ($user['role_id'] ?? null) === 'faculty'
        && in_array($user['faculty_approval_status'] ?? '', ['pending', 'rejected'], true);

    if (!$user || $user['status'] !== 'active' || $pendingFaculty || ($user['role_id'] === 'student' && in_array($user['student_approval_status'], ['pending', 'rejected'], true))) {
        destroySession();
        respond(['error' => 'Invalid session'], 401);
    }

    // Invalidate existing sessions when the password changes (including a
    // password reset), without needing a separate session table.
    $fingerprint = hash('sha256', (string)$user['password_hash']);
    if (empty($_SESSION['password_fingerprint'])
        || !hash_equals($fingerprint, (string)$_SESSION['password_fingerprint'])
    ) {
        destroySession();
        respond(['error' => 'Session expired. Please sign in again.'], 401);
    }

    $_SESSION['last_activity'] = time();

    // Restricted sessions may only inspect themselves, change password, or sign out.
    $path = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
    if ((bool)$user['must_change_password'] && !in_array(basename($path), ['me.php', 'change-password.php', 'logout.php'], true)) {
        respond(['error' => 'Change your initial password before accessing the system.', 'code' => 'password_change_required'], 403);
    }
    return $user;
}

/**
 * Check if user has required role.
 */
function authorizeRole(array $user, string $requiredRole): void
{
    if ($user['role_id'] !== $requiredRole) {
        respond(['error' => 'Insufficient permissions'], 403);
    }
}

/**
 * Check if user has one of the allowed roles.
 */
function authorizeRoles(array $user, array $allowedRoles): void
{
    if (!in_array($user['role_id'], $allowedRoles, true)) {
        respond(['error' => 'Insufficient permissions'], 403);
    }
}

/**
 * Hash password securely.
 */
function hashPassword(string $password): string
{
    return password_hash($password, PASSWORD_DEFAULT);
}

/**
 * Verify password against hash.
 */
function verifyPassword(string $password, string $hash): bool
{
    return password_verify($password, $hash);
}

/**
 * Generate (or reuse) the session CSRF token.
 */
function generateCsrfToken(): string
{
    startSecureSession();

    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    return $_SESSION['csrf_token'];
}

/**
 * Rotate the CSRF token (used after a successful login).
 */
function rotateCsrfToken(): string
{
    startSecureSession();
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf_token'];
}

/**
 * Require a valid CSRF token on a state-changing request.
 */
function requireCsrfToken(): void
{
    startSecureSession();

    $token = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($token === '' && isset($_POST['csrf_token'])) {
        $token = (string)$_POST['csrf_token'];
    }

    if (empty($_SESSION['csrf_token']) || $token === '' || !hash_equals((string)$_SESSION['csrf_token'], $token)) {
        respond(['error' => 'Invalid or missing CSRF token'], 403);
    }
}

/**
 * Log an audit entry. Failed pre-authentication events (such as a failed
 * login) are recorded with a NULL actor.
 */
function logAudit(
    string $action,
    ?string $entityType = null,
    ?string $entityId = null,
    array $oldValues = [],
    array $newValues = []
): void {
    global $pdo;

    $actorId = $_SESSION['user_id'] ?? null;

    $statement = $pdo->prepare(
        'INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
         VALUES (:id, :actor_user_id, :action, :entity_type, :entity_id, :old_values, :new_values, :ip_address)'
    );
    $statement->execute([
        ':id' => bin2hex(random_bytes(16)),
        ':actor_user_id' => $actorId,
        ':action' => $action,
        ':entity_type' => $entityType,
        ':entity_id' => $entityId,
        ':old_values' => $oldValues === [] ? null : json_encode($oldValues),
        ':new_values' => $newValues === [] ? null : json_encode($newValues),
        ':ip_address' => $_SERVER['REMOTE_ADDR'] ?? null,
    ]);
}

/**
 * Create an in-app notification for a user.
 */
function createNotification(
    string $userId,
    string $type,
    string $title,
    string $message,
    ?string $relatedAppointmentId = null
): void {
    global $pdo;

    $statement = $pdo->prepare(
        'INSERT INTO notifications (id, user_id, type, title, message, related_appointment_id)
         VALUES (:id, :user_id, :type, :title, :message, :related_appointment_id)'
    );
    $statement->execute([
        ':id' => bin2hex(random_bytes(16)),
        ':user_id' => $userId,
        ':type' => $type,
        ':title' => $title,
        ':message' => $message,
        ':related_appointment_id' => $relatedAppointmentId,
    ]);
}

/**
 * Fetch a full appointment row with display names.
 */
function fetchAppointmentById(string $id): ?array
{
    global $pdo;
    $statement = $pdo->prepare(
        'SELECT a.*, cr.summary,
                uf.first_name AS faculty_first_name, uf.last_name AS faculty_last_name,
                uf.faculty_number AS faculty_number,
                us.first_name AS student_first_name, us.last_name AS student_last_name,
                us.student_number AS student_number, us.program AS student_program
         FROM appointments a
         LEFT JOIN user_profiles uf ON a.faculty_id = uf.user_id
         LEFT JOIN user_profiles us ON a.student_id = us.user_id
         LEFT JOIN consultation_records cr ON cr.appointment_id = a.id
         WHERE a.id = :id'
    );
    $statement->execute([':id' => $id]);
    $row = $statement->fetch();
    return $row ?: null;
}
