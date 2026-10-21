<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['error' => 'Method not allowed.'], 405);
}

$user = authenticateUser();
$input = jsonInput();

$currentPassword = (string)($input['current_password'] ?? '');
$newPassword = (string)($input['new_password'] ?? '');

if ($currentPassword === '' || $newPassword === '') {
    respond(['error' => 'Current and new passwords are required'], 400);
}

$rateKey = (string)$user['id'];
if (isRateLimited('change_password', $rateKey, 5, 900)) {
    header('Retry-After: 900');
    respond(['error' => 'Too many password-change attempts. Please try again later.'], 429);
}

if (!verifyPassword($currentPassword, (string)$user['password_hash'])) {
    recordRateLimitAttempt('change_password', $rateKey);
    logAudit('change_password_failed', 'user', $user['id']);
    respond(['error' => 'Current password is incorrect.', 'fields' => ['current_password' => 'Current password is incorrect.']], 400);
}

$passwordErrors = validatePassword($newPassword);
if ($passwordErrors !== []) {
    respond(['error' => 'Validation failed', 'fields' => [
        'new_password' => implode(' ', $passwordErrors),
    ]], 400);
}

if (verifyPassword($newPassword, (string)$user['password_hash'])) {
    respond(['error' => 'Choose a password that is different from your current password.', 'fields' => ['new_password' => 'Choose a password that is different from your current password.']], 400);
}

global $pdo;

try {
    $newHash = hashPassword($newPassword);

    $pdo->beginTransaction();

    $statement = $pdo->prepare('UPDATE users SET password_hash = :password_hash, updated_at = NOW() WHERE id = :id');
    $statement->execute([
        ':password_hash' => $newHash,
        ':id' => $user['id'],
    ]);

    // Any outstanding reset code becomes useless after a password change.
    $pdo->prepare('DELETE FROM password_resets WHERE user_id = :user_id')
        ->execute([':user_id' => $user['id']]);

    $pdo->commit();

    clearRateLimitAttempts('change_password', $rateKey);

    // Keep this session valid while invalidating every other session through
    // the password fingerprint check in authenticateUser().
    $_SESSION['password_fingerprint'] = hash('sha256', $newHash);
    $csrfToken = rotateCsrfToken();

    logAudit('change_password', 'user', $user['id']);

    respond([
        'message' => 'Password changed successfully.',
        'csrf_token' => $csrfToken,
    ]);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respondServerError($exception, 'Failed to change password.');
}
