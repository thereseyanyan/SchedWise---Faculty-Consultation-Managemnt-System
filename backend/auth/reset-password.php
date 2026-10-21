<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['error' => 'Method not allowed.'], 405);
}

$input = jsonInput();
$email = strtolower(trim((string)($input['email'] ?? '')));
$code = trim((string)($input['code'] ?? $input['token'] ?? ''));
$password = (string)($input['password'] ?? '');

if ($email === '' || $code === '' || $password === '') {
    respond(['error' => 'Email, code, and new password are required'], 400);
}

$passwordErrors = validatePassword($password);
if (!empty($passwordErrors)) {
    respond(['error' => implode(' ', $passwordErrors)], 400);
}

$ip = clientIp();
$attemptKey = $ip . '|' . $email;
if (isRateLimited('reset_password', $attemptKey, 10, 900)
    || isRateLimited('reset_password_email', $email, 10, 900)
) {
    header('Retry-After: 900');
    respond(['error' => 'Too many reset attempts. Please try again later.'], 429);
}

global $pdo;

try {
    $statement = $pdo->prepare('SELECT id FROM users WHERE LOWER(email) = :email AND status = \'active\'');
    $statement->execute([':email' => $email]);
    $account = $statement->fetch();

    if (!$account) {
        recordRateLimitAttempt('reset_password', $attemptKey);
        recordRateLimitAttempt('reset_password_email', $email);
        respond(['error' => 'Invalid or expired reset code'], 400);
    }

    $tokenHash = hash('sha256', $code);
    $statement = $pdo->prepare(
        'SELECT id FROM password_resets
         WHERE user_id = :user_id
           AND token_hash = :token_hash
           AND used_at IS NULL
           AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1'
    );
    $statement->execute([
        ':user_id' => $account['id'],
        ':token_hash' => $tokenHash,
    ]);
    $reset = $statement->fetch();

    if (!$reset) {
        recordRateLimitAttempt('reset_password', $attemptKey);
        recordRateLimitAttempt('reset_password_email', $email);
        respond(['error' => 'Invalid or expired reset code'], 400);
    }

    $pdo->beginTransaction();

    $statement = $pdo->prepare(
        'UPDATE users SET password_hash = :password_hash, updated_at = NOW() WHERE id = :id'
    );
    $statement->execute([
        ':password_hash' => hashPassword($password),
        ':id' => $account['id'],
    ]);

    // A password change invalidates every outstanding reset code.
    $statement = $pdo->prepare(
        'UPDATE password_resets SET used_at = NOW() WHERE user_id = :user_id AND used_at IS NULL'
    );
    $statement->execute([':user_id' => $account['id']]);

    $pdo->commit();

    clearRateLimitAttempts('reset_password', $attemptKey);
    clearRateLimitAttempts('reset_password_email', $email);

    // Attribute the audit entry to the account being recovered, then restore
    // any pre-existing session identity (for example, an admin resetting
    // another user's password).
    $previousUserId = $_SESSION['user_id'] ?? null;
    $_SESSION['user_id'] = $account['id'];
    logAudit('password_reset', 'user', $account['id']);
    if ($previousUserId !== null) {
        $_SESSION['user_id'] = $previousUserId;
    } else {
        unset($_SESSION['user_id']);
    }

    respond(['message' => 'Password updated. You can log in with your new password.']);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respondServerError($exception, 'Failed to reset password. Please try again.');
}
