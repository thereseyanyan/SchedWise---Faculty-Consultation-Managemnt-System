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
        respond(['error' => 'Insufficient permissions to complete this appointment'], 403);
    }

    if ($appointment['status'] !== 'confirmed') {
        respond(['error' => 'Only confirmed appointments can be completed'], 400);
    }

    $statement = $pdo->prepare(
        'UPDATE appointments SET
         status = :status,
         completed_at = NOW(),
         updated_at = NOW()
         WHERE id = :id'
    );
    $statement->execute([
        ':status' => 'completed',
        ':id' => $id,
    ]);

    $pdo->commit();

    logAudit('update', 'appointment', $id, ['status' => $appointment['status']], ['status' => 'completed']);

    $notifyUserId = $appointment['student_id'] === $user['id']
        ? $appointment['faculty_id']
        : $appointment['student_id'];

    createNotification(
        $notifyUserId,
        'appointment_completed',
        'Appointment completed',
        'Your consultation was marked as completed.',
        $id
    );

    respond(fetchAppointmentById($id));
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respondServerError($exception, 'Failed to complete appointment.');
}
