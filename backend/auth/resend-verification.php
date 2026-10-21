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

// Keep the response identical whether or not an unverified account exists.
$generic = [
    'message' => 'If an unverified account exists for that email, a new verification link has been sent.',
];

$ip = clientIp();
if (isRateLimited('resend_verification_email', $email, 3, 3600)
    || isRateLimited('resend_verification_ip', $ip, 10, 3600)
) {
    respond($generic);
}
recordRateLimitAttempt('resend_verification_email', $email);
recordRateLimitAttempt('resend_verification_ip', $ip);

global $pdo;

try {
    $statement = $pdo->prepare(
        'SELECT id, email, status, email_verified_at
         FROM users
         WHERE LOWER(email) = :email
         LIMIT 1'
    );
    $statement->execute([':email' => $email]);
    $account = $statement->fetch();

    if (!$account
        || $account['status'] !== 'pending'
        || $account['email_verified_at'] !== null
    ) {
        respond($generic);
    }

    $token = issueEmailVerification($pdo, $account['id']);

    $mailSent = false;
    try {
        sendEmailVerificationLink(
            (string)$account['email'],
            emailVerificationUrl($token)
        );
        $mailSent = true;
    } catch (Throwable $mailException) {
        // Never log the token or verification URL.
        error_log(sprintf(
            'Verification resend failed for user %s: %s',
            (string)$account['id'],
            $mailException->getMessage()
        ));
    }

    logAudit('resend_verification', 'user', $account['id']);

    if (!empty($config['app']['debug'])
        && in_array(clientIp(), ['127.0.0.1', '::1'], true)
    ) {
        $generic['debug_mail_sent'] = $mailSent;
        $generic['debug_verification_url'] = emailVerificationUrl($token);
    }

    respond($generic);
} catch (Throwable $exception) {
    respondServerError($exception, 'Verification email is temporarily unavailable.');
}
