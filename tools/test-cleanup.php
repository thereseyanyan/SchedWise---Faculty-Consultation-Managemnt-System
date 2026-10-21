<?php

declare(strict_types=1);

/**
 * Remove data created by the automated API tests.
 *
 * Usage: php tools/test-cleanup.php e2e.
 * The prefix is intentionally restricted to the test namespace so this can
 * never be used to wipe a real account.
 */

$prefix = $argv[1] ?? '';
if (!preg_match('/^e2e\.[A-Za-z0-9._-]*$/', $prefix)) {
    fwrite(STDERR, "Refusing to clean up: prefix must start with e2e.\n");
    exit(1);
}

$config = require __DIR__ . '/../backend/config.php';
$db = $config['db'];
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
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

$userStatement = $pdo->prepare('SELECT id FROM users WHERE email LIKE :prefix');
$userStatement->execute([':prefix' => $prefix . '%']);
$userIds = array_column($userStatement->fetchAll(PDO::FETCH_ASSOC), 'id');

if ($userIds === []) {
    // Rate limits can exist even when a registration attempt failed.
    $pdo->exec('DELETE FROM rate_limits');
    fwrite(STDOUT, "No test users found.\n");
    exit(0);
}

$userPlaceholders = implode(',', array_fill(0, count($userIds), '?'));

$appointmentStatement = $pdo->prepare(
    "SELECT id FROM appointments WHERE student_id IN ($userPlaceholders) OR faculty_id IN ($userPlaceholders)"
);
$appointmentStatement->execute([...$userIds, ...$userIds]);
$appointmentIds = array_column($appointmentStatement->fetchAll(PDO::FETCH_ASSOC), 'id');

$appointmentPlaceholders = $appointmentIds === []
    ? null
    : implode(',', array_fill(0, count($appointmentIds), '?'));

if ($appointmentIds !== []) {
    $pdo->prepare(
        "DELETE FROM consultation_records WHERE appointment_id IN ($appointmentPlaceholders)
         OR student_id IN ($userPlaceholders) OR faculty_id IN ($userPlaceholders)"
    )->execute([...$appointmentIds, ...$userIds, ...$userIds]);

    $pdo->prepare(
        "DELETE FROM notifications WHERE related_appointment_id IN ($appointmentPlaceholders)
         OR user_id IN ($userPlaceholders)"
    )->execute([...$appointmentIds, ...$userIds]);

    $pdo->prepare("DELETE FROM appointments WHERE id IN ($appointmentPlaceholders)")
        ->execute($appointmentIds);
} else {
    $pdo->prepare(
        "DELETE FROM consultation_records WHERE student_id IN ($userPlaceholders)
         OR faculty_id IN ($userPlaceholders)"
    )->execute([...$userIds, ...$userIds]);

    $pdo->prepare("DELETE FROM notifications WHERE user_id IN ($userPlaceholders)")
        ->execute($userIds);
}

// Audit rows are protected by a foreign key to the actor. Remove them before
// the test user, including any rows attached to test appointments.
$auditEntityIds = [...$userIds, ...$appointmentIds];
$auditPlaceholders = implode(',', array_fill(0, count($auditEntityIds), '?'));
$pdo->prepare(
    "DELETE FROM audit_logs WHERE actor_user_id IN ($userPlaceholders)
     OR entity_id IN ($auditPlaceholders)"
)->execute([...$userIds, ...$auditEntityIds]);

$pdo->prepare("DELETE FROM users WHERE id IN ($userPlaceholders)")->execute($userIds);

// Test attempts are isolated by a unique email, but clearing the local
// counters keeps repeated runs deterministic.
$pdo->exec('DELETE FROM rate_limits');

fwrite(
    STDOUT,
    sprintf(
        "Removed %d test user(s), %d test appointment(s), and local rate-limit counters.\n",
        count($userIds),
        count($appointmentIds)
    )
);
