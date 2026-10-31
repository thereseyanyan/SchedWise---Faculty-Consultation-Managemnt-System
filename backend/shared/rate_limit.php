<?php

declare(strict_types=1);

/**
 * Best-effort client IP address.
 *
 * The application is designed to run directly behind Apache/PHP's built-in
 * server. If it is ever placed behind a reverse proxy, configure the proxy to
 * overwrite REMOTE_ADDR or add a trusted-proxy setting before relying on this
 * value for rate limiting.
 */
function clientIp(): string
{
    return (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

/**
 * Check whether an identifier has reached the attempt limit for a bucket.
 */
function isRateLimited(string $bucket, string $identifier, int $maxAttempts, int $windowSeconds): bool
{
    global $pdo;

    $windowSeconds = max(1, $windowSeconds);
    $maxAttempts = max(1, $maxAttempts);

    try {
        $statement = $pdo->prepare(
            'SELECT COUNT(*) FROM rate_limits
             WHERE bucket = :bucket
               AND identifier = :identifier
               AND attempted_at > DATE_SUB(NOW(), INTERVAL ' . $windowSeconds . ' SECOND)'
        );
        $statement->execute([
            ':bucket' => $bucket,
            ':identifier' => substr($identifier, 0, 255),
        ]);

        return (int)$statement->fetchColumn() >= $maxAttempts;
    } catch (Throwable $exception) {
        // Never take the whole application down because the optional rate
        // limit table has not been migrated yet. The failure is logged.
        error_log('Rate limit check failed: ' . $exception->getMessage());
        return false;
    }
}

/**
 * Record one attempt for a bucket/identifier pair.
 */
function recordRateLimitAttempt(string $bucket, string $identifier): void
{
    global $pdo;

    try {
        $statement = $pdo->prepare(
            'INSERT INTO rate_limits (bucket, identifier, attempted_at)
             VALUES (:bucket, :identifier, NOW())'
        );
        $statement->execute([
            ':bucket' => $bucket,
            ':identifier' => substr($identifier, 0, 255),
        ]);

        // Opportunistic cleanup so the table does not grow forever.
        if (random_int(1, 50) === 1) {
            $pdo->exec('DELETE FROM rate_limits WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
        }
    } catch (Throwable $exception) {
        error_log('Rate limit record failed: ' . $exception->getMessage());
    }
}

/**
 * Clear attempts after a successful action (for example, a valid login).
 */
function clearRateLimitAttempts(string $bucket, string $identifier): void
{
    global $pdo;

    try {
        $statement = $pdo->prepare(
            'DELETE FROM rate_limits WHERE bucket = :bucket AND identifier = :identifier'
        );
        $statement->execute([
            ':bucket' => $bucket,
            ':identifier' => substr($identifier, 0, 255),
        ]);
    } catch (Throwable $exception) {
        error_log('Rate limit clear failed: ' . $exception->getMessage());
    }
}
