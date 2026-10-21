<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['error' => 'Method not allowed.'], 405);
}

$input = jsonInput();
$token = trim((string)($input['token'] ?? ''));

if ($token === '' || strlen($token) > 128) {
    respond(['error' => 'This verification link is invalid or has expired.'], 400);
}

$ip = clientIp();
if (isRateLimited('verify_email_ip', $ip, 30, 900)) {
    header('Retry-After: 900');
    respond(['error' => 'Too many verification attempts. Please try again later.'], 429);
}
recordRateLimitAttempt('verify_email_ip', $ip);

global $pdo;

try {
    $tokenHash = hash('sha256', $token);

    $statement = $pdo->prepare(
        'SELECT ev.id, ev.user_id, ev.used_at,
                (ev.expires_at <= NOW()) AS is_expired,
                u.status, u.email, u.email_verified_at
         FROM email_verifications ev
         JOIN users u ON u.id = ev.user_id
         WHERE ev.token_hash = :token_hash
         LIMIT 1'
    );
    $statement->execute([':token_hash' => $tokenHash]);
    $verification = $statement->fetch();

    if (!$verification) {
        respond(['error' => 'This verification link is invalid or has expired.'], 400);
    }

    // Verification is idempotent for an already verified account. This keeps
    // browser retries and React development-mode double mounts from turning a
    // successful click into a misleading error.
    if ($verification['used_at'] !== null) {
        if ($verification['status'] === 'active'
            && $verification['email_verified_at'] !== null
        ) {
            respond(['message' => 'Email already verified. You can sign in.']);
        }
        respond(['error' => 'This verification link is invalid or has expired.'], 400);
    }

    if ((int)$verification['is_expired'] === 1) {
        respond(['error' => 'This verification link has expired. Request a new one.'], 400);
    }

    if (!in_array($verification['status'], ['pending', 'active'], true)) {
        respond(['error' => 'This account cannot be verified. Contact an administrator.'], 400);
    }

    $pdo->beginTransaction();

    if ($verification['status'] === 'pending') {
        $statement = $pdo->prepare(
            "UPDATE users
             SET status = 'active', email_verified_at = COALESCE(email_verified_at, NOW())
             WHERE id = :id AND status = 'pending'"
        );
    } else {
        $statement = $pdo->prepare(
            'UPDATE users
             SET email_verified_at = COALESCE(email_verified_at, NOW())
             WHERE id = :id'
        );
    }
    $statement->execute([':id' => $verification['user_id']]);

    $pdo->prepare(
        'UPDATE email_verifications SET used_at = NOW()
         WHERE user_id = :user_id AND used_at IS NULL'
    )->execute([':user_id' => $verification['user_id']]);

    $pdo->commit();

    logAudit('verify_email', 'user', $verification['user_id'], [], ['status' => 'active']);

    respond([
        'message' => 'Email verified successfully. You can now sign in.',
    ]);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respondServerError($exception, 'Email verification is temporarily unavailable.');
}
