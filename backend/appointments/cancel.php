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

    $isAdmin = $user['role_id'] === 'admin';
    $isStudentOwner = $user['role_id'] === 'student' && $appointment['student_id'] === $user['id'];
    $isFacultyOwner = $user['role_id'] === 'faculty' && $appointment['faculty_id'] === $user['id'];

    if (!$isAdmin && !$isStudentOwner && !$isFacultyOwner) {
        respond(['error' => 'Insufficient permissions to cancel this appointment'], 403);
    }

    // Only active appointments can be cancelled. This prevents repeat
    // cancellation and duplicate notifications for finished records.
    if (!in_array($appointment['status'], ['pending', 'confirmed', 'reschedule_requested'], true)) {
        respond(['error' => 'This appointment can no longer be cancelled'], 400);
    }

    $input = jsonInput();
    $cancelReason = trim((string)($input['reason'] ?? ''));

    if ($cancelReason === '' && !$isAdmin) {
        respond(['error' => 'Cancellation reason is required'], 400);
    }
    if (strlen($cancelReason) > 5000) {
        respond(['error' => 'Cancellation reason is too long'], 400);
    }

    $statement = $pdo->prepare(
        'UPDATE appointments SET
         status = :status,
         cancelled_at = NOW(),
         cancelled_by = :cancelled_by,
         cancellation_reason = :cancellation_reason,
         updated_at = NOW()
         WHERE id = :id'
    );
    $statement->execute([
        ':status' => 'cancelled',
        ':cancelled_by' => $user['id'],
        ':cancellation_reason' => $cancelReason !== '' ? $cancelReason : null,
        ':id' => $id,
    ]);

    $pdo->commit();

    logAudit(
        'update',
        'appointment',
        $id,
        ['status' => $appointment['status']],
        ['status' => 'cancelled', 'cancelled_by' => $user['id'], 'reason' => $cancelReason]
    );

    $message = $cancelReason !== '' ? "Appointment cancelled: {$cancelReason}" : 'An appointment was cancelled.';

    if ($isAdmin) {
        createNotification($appointment['student_id'], 'appointment_cancelled', 'Appointment cancelled', $message, $id);
        createNotification($appointment['faculty_id'], 'appointment_cancelled', 'Appointment cancelled', $message, $id);
    } else {
        $notifyUserId = $appointment['student_id'] === $user['id']
            ? $appointment['faculty_id']
            : $appointment['student_id'];
        createNotification($notifyUserId, 'appointment_cancelled', 'Appointment cancelled', $message, $id);
    }

    respond(fetchAppointmentById($id));
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respondServerError($exception, 'Failed to cancel appointment.');
}
