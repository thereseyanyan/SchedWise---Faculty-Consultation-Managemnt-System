<?php

declare(strict_types=1);

// Never leak PHP errors, warnings, or stack traces to API clients.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

// ---------------------------------------------------------------------------
// Configuration (needed early for CORS, session and debug settings).
// ---------------------------------------------------------------------------
$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Create backend/config.php from backend/config.example.php.']);
    exit;
}

$config = require $configPath;
$appConfig = $config['app'] ?? [];

// Keep PHP date formatting aligned with the database server. Business rules
// still use the database clock, but this prevents displayed dates from
// shifting when PHP defaults to a different timezone than MySQL.
$timezone = (string)($appConfig['timezone'] ?? (getenv('SCHEDWISE_TIMEZONE') ?: 'Asia/Kuala_Lumpur'));
if (!in_array($timezone, timezone_identifiers_list(), true)) {
    error_log('Invalid SchedWise timezone "' . $timezone . '"; falling back to Asia/Kuala_Lumpur.');
    $timezone = 'Asia/Kuala_Lumpur';
}
date_default_timezone_set($timezone);

// ---------------------------------------------------------------------------
// Shared functions.
// ---------------------------------------------------------------------------
require_once __DIR__ . '/shared/auth.php';
require_once __DIR__ . '/shared/authorization.php';
require_once __DIR__ . '/shared/report_filters.php';
require_once __DIR__ . '/shared/validation.php';
require_once __DIR__ . '/shared/clock.php';
require_once __DIR__ . '/shared/rate_limit.php';
require_once __DIR__ . '/shared/verification.php';
require_once __DIR__ . '/shared/mailer.php';

// ---------------------------------------------------------------------------
// Response and transport hardening.
// ---------------------------------------------------------------------------
header_remove('X-Powered-By');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');

$allowedOrigins = $appConfig['allowed_origins'] ?? [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
];
$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origin !== '') {
    header('Vary: Origin');
}
$originAllowed = $origin !== '' && in_array($origin, $allowedOrigins, true);

if ($originAllowed) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
}

if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$isUnsafeMethod = !in_array($method, ['GET', 'HEAD', 'OPTIONS'], true);

// A browser request from an unrecognised origin is never allowed to perform a
// state-changing action. Requests without an Origin header (CLI tools, tests)
// are still protected by the CSRF token check below.
if ($isUnsafeMethod && $origin !== '' && !$originAllowed) {
    http_response_code(403);
    echo json_encode(['error' => 'Origin not allowed']);
    exit;
}

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Start the hardened session for every request. The CSRF token lives in it.
startSecureSession();

// ---------------------------------------------------------------------------
// Global helpers.
// ---------------------------------------------------------------------------
function jsonInput(): array
{
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['error' => 'Request body must be valid JSON.']);
        exit;
    }
    return $input;
}

function respond(mixed $data, int $status = 200): never
{
    http_response_code($status);
    if ($status >= 400) {
        $error = is_array($data) && isset($data['error']) ? $data : ['error' => 'Request failed.'];
        echo json_encode($error);
        exit;
    }
    echo json_encode(['data' => $data]);
    exit;
}

/**
 * Log an exception and return a generic error to the client. Details stay in
 * the PHP error log instead of being exposed through the API.
 */
function respondServerError(Throwable $exception, string $message = 'An unexpected server error occurred.'): never
{
    error_log(sprintf(
        'Unhandled %s: %s in %s:%d',
        $exception::class,
        $exception->getMessage(),
        $exception->getFile(),
        $exception->getLine()
    ));

    respond(['error' => $message], 500);
}

set_exception_handler(static function (Throwable $exception): void {
    error_log(sprintf(
        'Unhandled %s: %s in %s:%d',
        $exception::class,
        $exception->getMessage(),
        $exception->getFile(),
        $exception->getLine()
    ));

    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode(['error' => 'An unexpected server error occurred.']);
});

// ---------------------------------------------------------------------------
// CSRF protection.
//
// Login, registration and password-reset requests are pre-authentication and
// are rate limited instead. Every other state-changing request must carry the
// session's CSRF token in the X-CSRF-Token header.
// ---------------------------------------------------------------------------
$scriptPath = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
$publicUnsafeEndpoints = [
    '/auth/login.php',
    '/auth/register.php',
    '/auth/forgot-password.php',
    '/auth/reset-password.php',
    '/auth/verify-email.php',
    '/auth/resend-verification.php',
];

$isPublicUnsafeEndpoint = false;
foreach ($publicUnsafeEndpoints as $endpointSuffix) {
    if (str_ends_with($scriptPath, $endpointSuffix)) {
        $isPublicUnsafeEndpoint = true;
        break;
    }
}

if ($isUnsafeMethod && !$isPublicUnsafeEndpoint) {
    requireCsrfToken();
}

// ---------------------------------------------------------------------------
// Database connection.
// ---------------------------------------------------------------------------
$db = $config['db'];

try {
    $pdo = new PDO(
        sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            $db['host'],
            $db['port'],
            $db['name'],
            $db['charset']
        ),
        $db['user'],
        $db['password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
} catch (PDOException $exception) {
    error_log('Database connection failed: ' . $exception->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed.']);
    exit;
}
