<?php

declare(strict_types=1);

/**
 * SchedWise local database bootstrap.
 *
 * This is called automatically by the one-click launcher. It is safe to run
 * every time:
 *   - creates the database when missing
 *   - imports database.sql on a fresh database
 *   - ensures schema tables and small data migrations on an existing database
 *   - never resets passwords or deletes user data
 *
 * Manual use:
 *   C:\xampp\php\php.exe tools\setup-database.php
 */

$projectRoot = dirname(__DIR__);
$configPath = $projectRoot . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'config.php';

if (!is_file($configPath)) {
    fwrite(STDERR, "Missing backend/config.php. Copy backend/config.example.php first.\n");
    exit(1);
}

$config = require $configPath;
$db = $config['db'] ?? [];
$required = ['host', 'port', 'name', 'user', 'password', 'charset'];
foreach ($required as $key) {
    if (!array_key_exists($key, $db)) {
        fwrite(STDERR, "backend/config.php is missing db.{$key}.\n");
        exit(1);
    }
}

function createPdo(array $db, ?string $database = null): PDO
{
    $dsn = sprintf(
        'mysql:host=%s;port=%d;%scharset=%s',
        $db['host'],
        (int)$db['port'],
        $database !== null ? 'dbname=' . $database . ';' : '',
        $db['charset']
    );

    return new PDO($dsn, (string)$db['user'], (string)$db['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

function databaseExists(PDO $pdo, string $database): bool
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = :name'
    );
    $statement->execute([':name' => $database]);
    return (int)$statement->fetchColumn() > 0;
}

function tableExists(PDO $pdo, string $table): bool
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table'
    );
    $statement->execute([':table' => $table]);
    return (int)$statement->fetchColumn() > 0;
}

function splitSqlStatements(string $sql): array
{
    $sql = ltrim($sql, "\xEF\xBB\xBF");
    $sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;
    $sql = preg_replace('/CREATE\s+DATABASE\b.*?;/is', '', $sql) ?? $sql;
    $sql = preg_replace('/^\s*USE\s+[^;]+;\s*$/mi', '', $sql) ?? $sql;

    $parts = preg_split('/;\s*(?:\r?\n|$)/', $sql) ?: [];
    $statements = [];
    foreach ($parts as $part) {
        $part = trim($part);
        if ($part !== '') {
            $statements[] = $part;
        }
    }
    return $statements;
}

function executeStatements(PDO $pdo, array $statements, bool $schemaOnly = false): int
{
    $executed = 0;
    foreach ($statements as $statement) {
        if ($schemaOnly && !preg_match('/^CREATE\s+TABLE\b/i', $statement)) {
            continue;
        }
        $pdo->exec($statement);
        $executed++;
    }
    return $executed;
}

function ensureReferenceData(PDO $pdo): void
{
    $pdo->exec(
        "INSERT IGNORE INTO roles (id, name, description) VALUES
         ('student', 'Student', 'Student role'),
         ('faculty', 'Faculty', 'Faculty role'),
         ('admin', 'Administrator', 'Administrator role')"
    );

    $pdo->exec(
        "INSERT IGNORE INTO departments (id, name, college, status) VALUES
         ('ccs', 'College of Computer Studies', 'College of Computer Studies', 'active'),
         ('coe', 'College of Engineering', 'College of Engineering', 'active'),
         ('cba', 'College of Business', 'College of Business', 'active'),
         ('cas', 'College of Arts & Sciences', 'College of Arts & Sciences', 'active')"
    );
}

function ensureMigrations(PDO $pdo): void
{
    if (!$pdo->query("SHOW COLUMNS FROM users LIKE 'deleted_at'")->fetch()) {
        $pdo->exec('ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP NULL');
    }
    if (!$pdo->query("SHOW COLUMNS FROM users LIKE 'faculty_approval_status'")->fetch()) {
        $pdo->exec(
            "ALTER TABLE users
             ADD COLUMN faculty_approval_status ENUM('not_required', 'pending', 'approved', 'rejected')
             NOT NULL DEFAULT 'not_required' AFTER status"
        );
        // Existing faculty were created or approved before the self-registration
        // workflow existed. Keep them usable.
        $pdo->exec("UPDATE users SET faculty_approval_status = 'approved' WHERE role_id = 'faculty'");
    }
    if (!$pdo->query("SHOW COLUMNS FROM users LIKE 'student_approval_status'")->fetch()) {
        $pdo->exec("ALTER TABLE users ADD COLUMN student_approval_status ENUM('not_required', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'not_required'");
        // Preserve existing active students; pending applications now need approval.
        $pdo->exec("UPDATE users SET student_approval_status = CASE WHEN status = 'pending' THEN 'pending' ELSE 'approved' END WHERE role_id = 'student'");
    }
    if (!$pdo->query("SHOW COLUMNS FROM users LIKE 'must_change_password'")->fetch()) {
        $pdo->exec("ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0");
        // Existing accounts are preserved; new admin-created faculty require a password change.
    }
    require_once __DIR__ . '/../backend/shared/validation.php';
    $accounts = $pdo->query("SELECT u.id, u.role_id, up.student_number, up.faculty_number FROM users u JOIN user_profiles up ON up.user_id = u.id WHERE u.role_id IN ('student', 'faculty') ORDER BY u.created_at, u.id")->fetchAll();
    $seen = [];
    foreach ($accounts as $account) {
        $field = $account['role_id'] === 'student' ? 'student_number' : 'faculty_number';
        $prefix = $account['role_id'] === 'student' ? 'STU-' : 'FAC-';
        $value = strtoupper(trim((string)$account[$field]));
        if (($account['role_id'] === 'student' ? validateStudentNumber($value) : preg_match('/^' . $prefix . '\\d{4,}$/', $value)) && !isset($seen[$field . ":" . $value])) {
            $seen[$field . ":" . $value] = true;
            continue;
        }
        try {
            $pdo->beginTransaction();
            $value = allocateAccountNumber($pdo, $account['role_id']);
            $pdo->prepare("UPDATE user_profiles SET {$field} = ? WHERE user_id = ?")->execute([$value, $account['id']]);
            $pdo->commit();
            $seen[$field . ":" . $value] = true;
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $exception;
        }
    }
    foreach (['student_number', 'faculty_number'] as $field) {
        $index = $pdo->query("SHOW INDEX FROM user_profiles WHERE Column_name = '{$field}' AND Non_unique = 0")->fetch();
        if (!$index) {
            $pdo->exec("UPDATE user_profiles SET {$field} = NULL WHERE {$field} = ''");
            $pdo->exec("ALTER TABLE user_profiles ADD UNIQUE INDEX unique_{$field} ({$field})");
        }
    }
    foreach (['student', 'faculty'] as $role) {
        syncAccountIdSequence($pdo, $role);
    }
    $column = $pdo->query("SHOW COLUMNS FROM audit_logs LIKE 'actor_user_id'")->fetch();
    if ($column !== false && strtoupper((string)$column['Null']) !== 'YES') {
        $pdo->exec('ALTER TABLE audit_logs MODIFY COLUMN actor_user_id VARCHAR(64) NULL');
    }

    $column = $pdo->query("SHOW COLUMNS FROM audit_logs LIKE 'entity_type'")->fetch();
    if ($column !== false && strtoupper((string)$column['Null']) !== 'YES') {
        $pdo->exec('ALTER TABLE audit_logs MODIFY COLUMN entity_type VARCHAR(50) NULL');
    }

    foreach ([
        'audit_logs_created_idx' => 'created_at',
        'audit_logs_action_idx' => 'action',
        'audit_logs_entity_idx' => 'entity_type',
    ] as $indexName => $columnName) {
        $index = $pdo->query("SHOW INDEX FROM audit_logs WHERE Key_name = '{$indexName}'")->fetch();
        if (!$index) {
            $pdo->exec("ALTER TABLE audit_logs ADD INDEX {$indexName} ({$columnName})");
        }
    }

    $column = $pdo->query("SHOW COLUMNS FROM appointments LIKE 'cancellation_reason'")->fetch();
    if ($column === false) {
        $pdo->exec('ALTER TABLE appointments ADD COLUMN cancellation_reason TEXT NULL AFTER cancelled_by');
    }
}

try {
    $server = createPdo($db);
    $database = (string)$db['name'];

    if (!databaseExists($server, $database)) {
        $server->exec(
            'CREATE DATABASE `' . str_replace('`', '``', $database) . '` '
            . 'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
        );
    }

    $pdo = createPdo($db, $database);
    $pdo->exec('SET NAMES utf8mb4');

    $schemaFile = $projectRoot . DIRECTORY_SEPARATOR . 'database.sql';
    if (!is_file($schemaFile)) {
        throw new RuntimeException('database.sql was not found.');
    }

    $statements = splitSqlStatements((string)file_get_contents($schemaFile));
    $hasUsers = tableExists($pdo, 'users');
    $userCount = $hasUsers ? (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() : 0;

    if (!$hasUsers || $userCount === 0) {
        $executed = executeStatements($pdo, $statements);
        fwrite(STDOUT, "Created SchedWise schema and demo data ({$executed} statements).\n");
    } else {
        $executed = executeStatements($pdo, $statements, true);
        fwrite(STDOUT, "Schema checked ({$executed} CREATE TABLE statements).\n");
    }

    ensureReferenceData($pdo);
    ensureMigrations($pdo);

    fwrite(STDOUT, "Database ready: {$database} @ {$db['host']}:{$db['port']}\n");
    exit(0);
} catch (Throwable $exception) {
    fwrite(STDERR, 'Database setup failed: ' . $exception->getMessage() . "\n");
    exit(1);
}
