<?php

declare(strict_types=1);

return [
    'app' => [
        // Set to false in production. When true, forgot-password may return a
        // debug reset code, but only to requests from localhost.
        'debug' => false,
        // Used in verification email links. Keep the localhost default for
        // local use; set FCAMS_FRONTEND_URL when the frontend moves.
        'frontend_url' => getenv('FCAMS_FRONTEND_URL') ?: 'http://localhost:5173',
        'allowed_origins' => [
            'http://localhost:5173',
            'http://127.0.0.1:5173',
        ],
    ],
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'fcams',
        'user' => 'root',
        'password' => '',
        'charset' => 'utf8mb4',
    ],
    // Local Mailpit testing defaults; optional FCAMS_MAIL_* overrides for an SMTP
    // provider. Use encryption "tls" for port 587 or "ssl" for port 465.
    'mail' => [
        'host' => getenv('FCAMS_MAIL_HOST') ?: '127.0.0.1',
        'port' => (int)(getenv('FCAMS_MAIL_PORT') ?: 1025),
        'username' => getenv('FCAMS_MAIL_USERNAME') ?: '',
        'password' => getenv('FCAMS_MAIL_PASSWORD') ?: '',
        'encryption' => getenv('FCAMS_MAIL_ENCRYPTION') ?: '',
        'from_email' => getenv('FCAMS_MAIL_FROM') ?: 'no-reply@fcams.edu',
        'from_name' => 'FCAMS',
        'timeout' => 10,
    ],
];
