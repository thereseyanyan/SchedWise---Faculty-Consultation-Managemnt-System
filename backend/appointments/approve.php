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
    lockAppointmentFaculty((string)$id);

    $statement = $pdo->prepare('SELECT * FROM appointments WHERE id = :id FOR UPDATE');
    $statement->execute([':id' => $id]);
    $appointment = $statement->fetch();

    if (!$appointment) {
        respond(['error' => 'Appointment not found'], 404);
    }

    if (!appointmentCanBeModifiedBy($id, $user['id'], $user['role_id'])) {
        respond(['error' => 'Insufficient permissions to approve this appointment'], 403);
    }

    // Pending requests and student-requested reschedules can be approved.
    if (!in_array($appointment['status'], ['pending', 'reschedule_requested'], true)) {
        respond(['error' => 'Only pending or reschedule-requested appointments can be approved'], 400);
    }

    // Availability may have changed since the request was created.
    if (!facultyIsAvailable(
        $appointment['faculty_id'],
        $appointment['appointment_date'],
        (int)$appointment['start_minutes'],
        (int)$appointment['end_minutes']
    )) {
        respond(['error' => 'Faculty is no longer available at the requested time'], 409);
    }

    if (hasAppointmentConflict(
        $appointment['faculty_id'],
        $appointment['appointment_date'],
        (int)$appointment['start_minutes'],
        (int)$appointment['end_minutes'],
        $id
    )) {
        respond(['error' => 'The requested time conflicts with another appointment'], 409);
    }

    $statement = $pdo->prepare(
        'UPDATE appointments SET
         status = :status,
         approved_at = NOW(),
         updated_at = NOW()
         WHERE id = :id'
    );
    $statement->execute([
        ':status' => 'confirmed',
        ':id' => $id,
    ]);

    $pdo->commit();

    logAudit('update', 'appointment', $id, ['status' => $appointment['status']], ['status' => 'confirmed']);

    createNotification(
        $appointment['student_id'],
        'appointment_approved',
        'Appointment approved',
        'Your consultation request was approved.',
        $id
    );

    respond(fetchAppointmentById($id));
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respondServerError($exception, 'Failed to approve appointment.');
}
