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
        respond(['error' => 'Insufficient permissions to update this appointment'], 403);
    }

    if ($appointment['status'] !== 'confirmed') {
        respond(['error' => 'Only confirmed appointments can be marked as a no-show'], 400);
    }

    // A no-show is only meaningful after the consultation window has ended.
    $today = dbNowDate();
    $nowMinutes = dbNowMinutes();
    $appointmentEnded = $appointment['appointment_date'] < $today
        || (
            $appointment['appointment_date'] === $today
            && (int)$appointment['end_minutes'] <= $nowMinutes
        );

    if (!$appointmentEnded) {
        respond(['error' => 'A no-show can only be recorded after the consultation has ended'], 400);
    }

    $statement = $pdo->prepare(
        'UPDATE appointments SET
         status = :status,
         updated_at = NOW()
         WHERE id = :id'
    );
    $statement->execute([
        ':status' => 'no_show',
        ':id' => $id,
    ]);

    $pdo->commit();

    logAudit('update', 'appointment', $id, ['status' => 'confirmed'], ['status' => 'no_show']);

    createNotification(
        $appointment['student_id'],
        'appointment_no_show',
        'Appointment marked as a no-show',
        'Your consultation was marked as a no-show because it was not attended.',
        $id
    );

    respond(fetchAppointmentById($id));
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respondServerError($exception, 'Failed to mark appointment as a no-show.');
}
