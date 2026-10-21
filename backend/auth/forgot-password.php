<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['error' => 'Method not allowed.'], 405);
}

$input = jsonInput();
$email = strtolower(trim((string)($input['email'] ?? '')));

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(['error' => 'A valid email address is required'], 400);
}

// Always return a generic success message to avoid email enumeration.
$generic = [
    'message' => 'If an account exists for that email, a reset code has been issued.',
];

$ip = clientIp();

// Throttle password-reset requests per address and per IP. When the limit is
// reached the response stays generic, so this cannot be used to enumerate
// accounts.
if (isRateLimited('forgot_password_email', $email, 5, 3600)
    || isRateLimited('forgot_password_ip', $ip, 20, 3600)
) {
    respond($generic);
}
recordRateLimitAttempt('forgot_password_email', $email);
recordRateLimitAttempt('forgot_password_ip', $ip);

global $pdo;
$debug = !empty($config['app']['debug']);
$isLocalRequest = in_array(clientIp(), ['127.0.0.1', '::1'], true);

try {
    $statement = $pdo->prepare('SELECT id, email, status FROM users WHERE LOWER(email) = :email');
    $statement->execute([':email' => $email]);
    $account = $statement->fetch();

    if (!$account || $account['status'] !== 'active') {
        respond($generic);
    }

    // Invalidate previous unused tokens.
    $statement = $pdo->prepare(
        'UPDATE password_resets SET used_at = NOW()
         WHERE user_id = :user_id AND used_at IS NULL'
    );
    $statement->execute([':user_id' => $account['id']]);

    $code = (string)random_int(100000, 999999);
    $tokenHash = hash('sha256', $code);
    $resetId = bin2hex(random_bytes(16));

    // Compute expiry in the database so PHP and MySQL timezone differences
    // cannot make the code expire immediately.
    $statement = $pdo->prepare(
        'INSERT INTO password_resets (id, user_id, token_hash, expires_at)
         VALUES (:id, :user_id, :token_hash, DATE_ADD(NOW(), INTERVAL 30 MINUTE))'
    );
    $statement->execute([
        ':id' => $resetId,
        ':user_id' => $account['id'],
        ':token_hash' => $tokenHash,
    ]);

    $expiryStatement = $pdo->prepare('SELECT expires_at FROM password_resets WHERE id = :id');
    $expiryStatement->execute([':id' => $resetId]);
    $expiresAt = (string)$expiryStatement->fetchColumn();

    $mailSent = false;
    try {
        sendPasswordResetCode((string)$account['email'], $code);
        $mailSent = true;
    } catch (Throwable $mailException) {
        // Keep the public response generic. The launcher log and PHP error log
        // are the places to diagnose SMTP/Mailpit failures.
        error_log(sprintf(
            'Password reset email failed for user %s: %s',
            (string)$account['id'],
            $mailException->getMessage()
        ));
    }

    // In debug mode on the local machine only, return the code for testing;
    // never expose reset codes to remote clients.
    if ($debug && $isLocalRequest) {
        $generic['debug_code'] = $code;
        $generic['expires_at'] = $expiresAt;
        $generic['debug_mail_sent'] = $mailSent;
    }

    respond($generic);
} catch (Throwable $exception) {
    respondServerError($exception, 'Password reset is temporarily unavailable.');
}
