<?php

declare(strict_types=1);

/**
 * Restore an FCAMS SQL backup. Stop FCAMS before restoring.
 *
 * Usage:
 *   C:\xampp\php\php.exe tools/restore-database.php .runtime\backups\fcams-....sql --yes
 */

$file = $argv[1] ?? '';
$confirmed = in_array('--yes', $argv, true);

if ($file === '' || !is_file($file)) {
    fwrite(STDERR, "Usage: php tools/restore-database.php <backup.sql> --yes\n");
    exit(1);
}
if (!$confirmed) {
    fwrite(STDERR, "Refusing to restore without --yes. Stop FCAMS first and retry.\n");
    exit(1);
}

$projectRoot = dirname(__DIR__);
$configPath = $projectRoot . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'config.php';
if (!is_file($configPath)) {
    fwrite(STDERR, "backend/config.php is missing.\n");
    exit(1);
}

$config = require $configPath;
$db = $config['db'] ?? [];

function findMysqlClient(): string
{
    $override = getenv('FCAMS_MYSQL');
    if ($override !== false && $override !== '' && is_file($override)) {
        return $override;
    }

    $candidates = [
        'C:\\Program Files\\MySQL\\MySQL Server 9.5\\bin\\mysql.exe',
        'C:\\xampp\\mysql\\bin\\mysql.exe',
    ];
    foreach ($candidates as $candidate) {
        if (is_file($candidate)) {
            return $candidate;
        }
    }

    $which = @shell_exec('where.exe mysql 2>NUL');
    if (is_string($which)) {
        foreach (preg_split('/\r?\n/', trim($which)) ?: [] as $line) {
            if ($line !== '' && is_file($line)) {
                return $line;
            }
        }
    }

    throw new RuntimeException('mysql.exe was not found. Set FCAMS_MYSQL.');
}

try {
    $mysql = findMysqlClient();
    $command = [
        $mysql,
        '--default-character-set=' . (string)($db['charset'] ?? 'utf8mb4'),
        '--host=' . (string)$db['host'],
        '--port=' . (string)$db['port'],
        '--user=' . (string)$db['user'],
        '--database=' . (string)$db['name'],
    ];

    $password = (string)($db['password'] ?? '');
    if ($password !== '') {
        putenv('MYSQL_PWD=' . $password);
    }

    $descriptors = [
        0 => ['file', $file, 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $process = proc_open($command, $descriptors, $pipes, $projectRoot);
    if (!is_resource($process)) {
        throw new RuntimeException('Could not start mysql.');
    }

    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);

    if ($password !== '') {
        putenv('MYSQL_PWD');
    }

    if ($exitCode !== 0) {
        throw new RuntimeException(trim($stderr . "\n" . $stdout));
    }

    fwrite(STDOUT, "Restored: {$file}\n");
    fwrite(STDOUT, "Database: {$db['name']} on {$db['host']}:{$db['port']}\n");
} catch (Throwable $exception) {
    if (isset($password) && $password !== '') {
        putenv('MYSQL_PWD');
    }
    fwrite(STDERR, 'Restore failed: ' . $exception->getMessage() . "\n");
    exit(1);
}
