<?php

declare(strict_types=1);

/**
 * Create a timestamped SQL backup under .runtime/backups.
 *
 * Usage:
 *   C:\xampp\php\php.exe tools/backup-database.php
 */

$projectRoot = dirname(__DIR__);
$configPath = $projectRoot . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'config.php';
if (!is_file($configPath)) {
    fwrite(STDERR, "backend/config.php is missing.\n");
    exit(1);
}

$config = require $configPath;
$db = $config['db'] ?? [];

function findMysqlTool(string $name): string
{
    $override = getenv('SCHEDWISE_' . strtoupper($name));
    if ($override !== false && $override !== '' && is_file($override)) {
        return $override;
    }

    $candidates = [
        "C:\\Program Files\\MySQL\\MySQL Server 9.5\\bin\\{$name}.exe",
        "C:\\xampp\\mysql\\bin\\{$name}.exe",
    ];
    foreach ($candidates as $candidate) {
        if (is_file($candidate)) {
            return $candidate;
        }
    }

    $which = @shell_exec('where.exe ' . escapeshellarg($name) . ' 2>NUL');
    if (is_string($which)) {
        foreach (preg_split('/\r?\n/', trim($which)) ?: [] as $line) {
            if ($line !== '' && is_file($line)) {
                return $line;
            }
        }
    }

    throw new RuntimeException("{$name}.exe was not found. Set SCHEDWISE_" . strtoupper($name) . '.');
}

try {
    $mysqldump = findMysqlTool('mysqldump');
    $backupDir = $projectRoot . DIRECTORY_SEPARATOR . '.runtime' . DIRECTORY_SEPARATOR . 'backups';
    if (!is_dir($backupDir) && !mkdir($backupDir, 0775, true) && !is_dir($backupDir)) {
        throw new RuntimeException('Could not create .runtime/backups.');
    }

    $filename = 'schedwise-' . date('Ymd-His') . '.sql';
    $path = $backupDir . DIRECTORY_SEPARATOR . $filename;

    $command = [
        $mysqldump,
        '--single-transaction',
        '--skip-lock-tables',
        '--no-tablespaces',
        '--set-gtid-purged=OFF',
        '--routines',
        '--triggers',
        '--default-character-set=' . (string)($db['charset'] ?? 'utf8mb4'),
        '--host=' . (string)$db['host'],
        '--port=' . (string)$db['port'],
        '--user=' . (string)$db['user'],
        '--result-file=' . $path,
        (string)$db['name'],
    ];

    $password = (string)($db['password'] ?? '');
    if ($password !== '') {
        putenv('MYSQL_PWD=' . $password);
    }

    $descriptors = [
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $process = proc_open($command, $descriptors, $pipes, $projectRoot);
    if (!is_resource($process)) {
        throw new RuntimeException('Could not start mysqldump.');
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
        @unlink($path);
        throw new RuntimeException(trim($stderr . "\n" . $stdout));
    }
    if (!is_file($path) || filesize($path) === 0) {
        @unlink($path);
        throw new RuntimeException('mysqldump produced an empty backup.');
    }

    fwrite(STDOUT, "Backup created: {$path}\n");
    fwrite(STDOUT, 'Size: ' . number_format((float)filesize($path)) . " bytes\n");
} catch (Throwable $exception) {
    if (isset($password) && $password !== '') {
        putenv('MYSQL_PWD');
    }
    fwrite(STDERR, 'Backup failed: ' . $exception->getMessage() . "\n");
    exit(1);
}
