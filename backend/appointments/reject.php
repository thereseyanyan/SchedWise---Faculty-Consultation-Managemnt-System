<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    respond(['error' => 'Method not allowed.'], 405);
}

$id = $_GET['id'] ?? null;
if (!$id) {
    respond(['error' => 'Appointment ID is required'], 400);
}

$user = authenticateUser();
global $pdo;

try {
    $pdo->beginTransaction();

    $statement = $pdo->prepare('SELECT * FROM appointments WHERE id = :id FOR UPDATE');
    $statement->execute([':id' => $id]);
    $appointment = $statement->fetch();

    if (!$appointment) {
        respond(['error' => 'Appointment not found'], 404);
    }

    if (!appointmentCanBeModifiedBy($id, $user['id'], $user['role_id'])) {
        respond(['error' => 'Insufficient permissions to reject this appointment'], 403);
    }

    if (!in_array($appointment['status'], ['pending', 'reschedule_requested'], true)) {
        respond(['error' => 'Only pending or reschedule-requested appointments can be rejected'], 400);
    }

    $input = jsonInput();
    $reason = trim((string)($input['reason'] ?? ''));

    if ($reason === '') {
        respond(['error' => 'Rejection reason is required'], 400);
    }
    if (strlen($reason) > 5000) {
        respond(['error' => 'Rejection reason is too long'], 400);
    }

    $statement = $pdo->prepare(
        'UPDATE appointments SET
         status = :status,
         reschedule_reason = :rejection_reason,
         updated_at = NOW()
         WHERE id = :id'
    );
    $statement->execute([
        ':status' => 'rejected',
        ':rejection_reason' => $reason,
        ':id' => $id,
    ]);

    $pdo->commit();

    logAudit(
        'update',
        'appointment',
        $id,
        ['status' => $appointment['status']],
        ['status' => 'rejected', 'reason' => $reason]
    );

    createNotification(
        $appointment['student_id'],
        'appointment_rejected',
        'Appointment rejected',
        'Your consultation request was rejected: ' . $reason,
        $id
    );

    respond(fetchAppointmentById($id));
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respondServerError($exception, 'Failed to reject appointment.');
}
