<?php

declare(strict_types=1);

/**
 * Reset FCAMS to the clean demo baseline.
 *
 * This is destructive: it removes all users, appointments, consultations,
 * notifications, availability, reset codes, audit history, and rate limits,
 * then reloads the demo seed from database.sql.
 *
 * Usage:
 *   C:\xampp\php\php.exe tools/reset-demo.php --yes
 */

if (!in_array('--yes', $argv, true)) {
    fwrite(
        STDERR,
        "Refusing to reset. This deletes all local FCAMS data.\n"
        . "Run again with --yes to continue.\n"
    );
    exit(1);
}

$projectRoot = dirname(__DIR__);
$configPath = $projectRoot . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'config.php';
$schemaPath = $projectRoot . DIRECTORY_SEPARATOR . 'database.sql';

if (!is_file($configPath) || !is_file($schemaPath)) {
    fwrite(STDERR, "backend/config.php or database.sql is missing.\n");
    exit(1);
}

$config = require $configPath;
$db = $config['db'] ?? [];

function resetPdo(array $db): PDO
{
    return new PDO(
        sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            $db['host'],
            (int)$db['port'],
            $db['name'],
            $db['charset']
        ),
        (string)$db['user'],
        (string)$db['password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
}

function resetSeedStatements(string $sql): array
{
    $sql = ltrim($sql, "\xEF\xBB\xBF");
    $sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;

    $parts = preg_split('/;\s*(?:\r?\n|$)/', $sql) ?: [];
    $statements = [];
    foreach ($parts as $part) {
        $part = trim($part);
        if ($part !== '' && preg_match('/^INSERT\s+IGNORE\s+INTO\b/i', $part)) {
            $statements[] = $part;
        }
    }
    return $statements;
}

try {
    $pdo = resetPdo($db);
    $pdo->exec('SET NAMES utf8mb4');

    $pdo->beginTransaction();

    // Delete in dependency order. The demo seed is reloaded afterward.
    foreach ([
        'consultation_records',
        'notifications',
        'appointments',
        'schedule_overrides',
        'faculty_availability',
        'password_resets',
        'email_verifications',
        'audit_logs',
        'rate_limits',
        'user_profiles',
        'users',
    ] as $table) {
        $pdo->exec("DELETE FROM `$table`");
    }

    $seedStatements = resetSeedStatements((string)file_get_contents($schemaPath));
    if ($seedStatements === []) {
        throw new RuntimeException('No demo INSERT statements found in database.sql.');
    }

    foreach ($seedStatements as $statement) {
        $pdo->exec($statement);
    }

    $pdo->commit();

    $userCount = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $departmentCount = (int)$pdo->query('SELECT COUNT(*) FROM departments')->fetchColumn();
    $availabilityCount = (int)$pdo->query('SELECT COUNT(*) FROM faculty_availability')->fetchColumn();

    fwrite(
        STDOUT,
        "FCAMS demo reset complete.\n"
        . "Users: {$userCount}, departments: {$departmentCount}, availability rows: {$availabilityCount}.\n"
        . "Demo accounts: admin@fcams.edu, elena.cruz@fcams.edu, juan.delacruz@fcams.edu.\n"
    );
} catch (Throwable $exception) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, 'Demo reset failed: ' . $exception->getMessage() . "\n");
    exit(1);
}
