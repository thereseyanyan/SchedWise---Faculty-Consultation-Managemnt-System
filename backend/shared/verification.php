<?php

declare(strict_types=1);

/**
 * Build the public frontend URL used in verification emails.
 *
 * The link deliberately points at the React app, not directly at the API.
 * The app submits the token to the API and removes it from the address bar.
 */
function emailVerificationUrl(string $token): string
{
    global $config;

    $frontendUrl = (string)($config['app']['frontend_url'] ?? '');
    if ($frontendUrl === '') {
        $origins = $config['app']['allowed_origins'] ?? [];
        $frontendUrl = is_array($origins) && $origins !== []
            ? (string)$origins[0]
            : 'http://localhost:5173';
    }

    return rtrim($frontendUrl, '/') . '/?verify_token=' . rawurlencode($token);
}

/**
 * Create a new email-verification token for a user.
 *
 * Only a SHA-256 hash is stored. The caller is responsible for emailing the
 * returned raw token and must never log it.
 */
function issueEmailVerification(PDO $pdo, string $userId): string
{
    $token = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $token);
    $verificationId = bin2hex(random_bytes(16));

    // A new link supersedes every older unused link for this account.
    $statement = $pdo->prepare(
        'UPDATE email_verifications SET used_at = NOW()
         WHERE user_id = :user_id AND used_at IS NULL'
    );
    $statement->execute([':user_id' => $userId]);

    $statement = $pdo->prepare(
        'INSERT INTO email_verifications (id, user_id, token_hash, expires_at)
         VALUES (:id, :user_id, :token_hash, DATE_ADD(NOW(), INTERVAL 24 HOUR))'
    );
    $statement->execute([
        ':id' => $verificationId,
        ':user_id' => $userId,
        ':token_hash' => $tokenHash,
    ]);

    return $token;
}
