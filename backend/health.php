<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(['error' => 'Method not allowed.'], 405);
}

try {
    global $pdo;
    $pdo->query('SELECT 1');

    // Keep the public health check free of version numbers and error details.
    respond(['status' => 'healthy']);
} catch (Throwable $exception) {
    error_log('Health check failed: ' . $exception->getMessage());
    respond(['error' => 'Service unavailable'], 503);
}
