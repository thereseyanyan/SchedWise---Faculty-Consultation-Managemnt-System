<?php
declare(strict_types=1);
$config = require __DIR__ . '/../backend/config.php';
$mail = $config['mail'] ?? [];
if (!in_array($mail['host'] ?? '', ['127.0.0.1', 'localhost', '::1'], true)
    || (int)($mail['port'] ?? 0) !== 1025 || empty($config['app']['debug'])) {
    fwrite(STDERR, "Email regression tests require an isolated local SMTP fixture on port 1025 and local debug mode. Never run them against a real SMTP provider.\n");
    exit(1);
}
