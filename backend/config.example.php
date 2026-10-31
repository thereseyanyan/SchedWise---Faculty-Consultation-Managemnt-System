<?php

declare(strict_types=1);

return [
    'app' => [
        // Set to false in production. When true, forgot-password may return a
        // debug reset code, but only to requests from localhost.
        'debug' => false,
        // Used in verification email links. Keep the localhost default for
        // local use; set SCHEDWISE_FRONTEND_URL when the frontend moves.
        'frontend_url' => getenv('SCHEDWISE_FRONTEND_URL') ?: 'http://localhost:5173',
        // Match the MySQL server's timezone so formatted dates and report
        // month boundaries use the same local clock.
        'timezone' => getenv('SCHEDWISE_TIMEZONE') ?: 'Asia/Kuala_Lumpur',
        'allowed_origins' => [
            'http://localhost:5173',
            'http://127.0.0.1:5173',
        ],
    ],
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'schedwise',
        'user' => 'root',
        'password' => '',
        'charset' => 'utf8mb4',
    ],
    // Local Mailpit testing defaults; optional SCHEDWISE_MAIL_* overrides for an SMTP
    // provider. Use encryption "tls" for port 587 or "ssl" for port 465.
    'mail' => [
        'host' => getenv('SCHEDWISE_MAIL_HOST') ?: '127.0.0.1',
        'port' => (int)(getenv('SCHEDWISE_MAIL_PORT') ?: 1025),
        'username' => getenv('SCHEDWISE_MAIL_USERNAME') ?: '',
        'password' => getenv('SCHEDWISE_MAIL_PASSWORD') ?: '',
        'encryption' => getenv('SCHEDWISE_MAIL_ENCRYPTION') ?: '',
        'from_email' => getenv('SCHEDWISE_MAIL_FROM') ?: 'no-reply@schedwise.edu',
        'from_name' => 'SchedWise',
        'timeout' => 10,
    ],
];
