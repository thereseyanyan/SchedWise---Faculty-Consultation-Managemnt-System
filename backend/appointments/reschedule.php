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
$input = jsonInput();
global $pdo;

$appointmentDate = (string)($input['appointment_date'] ?? '');
$startMinutes = isset($input['start_minutes']) ? (int)$input['start_minutes'] : null;
$endMinutes = isset($input['end_minutes']) ? (int)$input['end_minutes'] : null;
$reason = trim((string)($input['reason'] ?? $input['reschedule_reason'] ?? ''));

if ($appointmentDate === '' || $startMinutes === null || $endMinutes === null) {
    respond(['error' => 'appointment_date, start_minutes, and end_minutes are required'], 400);
}

if (!validateDate($appointmentDate)) {
    respond(['error' => 'Invalid appointment date'], 400);
}

if ($startMinutes < 0 || $startMinutes > 1439 || $endMinutes < 0 || $endMinutes > 1439) {
    respond(['error' => 'Times must be between 0 and 1439 minutes'], 400);
}

if ($endMinutes <= $startMinutes) {
    respond(['error' => 'End time must be after start time'], 400);
}

if ($appointmentDate < dbNowDate()) {
    respond(['error' => 'Appointment date cannot be in the past'], 400);
}

if (strlen($reason) > 5000) {
    respond(['error' => 'Reschedule reason is too long'], 400);
}

try {
    $pdo->beginTransaction();
    // Keep the same student-then-faculty lock order as new bookings.
    $ownerLookup = $pdo->prepare('SELECT student_id FROM appointments WHERE id = ?');
    $ownerLookup->execute([$id]);
    $studentId = $ownerLookup->fetchColumn();
    if (!$studentId) respond(['error' => 'Appointment not found'], 404);
    $studentLock = $pdo->prepare('SELECT id FROM users WHERE id = ? FOR UPDATE');
    $studentLock->execute([$studentId]);
    lockAppointmentFaculty((string)$id);

    $statement = $pdo->prepare('SELECT * FROM appointments WHERE id = :id FOR UPDATE');
    $statement->execute([':id' => $id]);
    $appointment = $statement->fetch();

    if (!$appointment) {
        respond(['error' => 'Appointment not found'], 404);
    }

    $isFacultyOwner = $user['role_id'] === 'faculty' && $appointment['faculty_id'] === $user['id'];
    $isStudentOwner = $user['role_id'] === 'student' && $appointment['student_id'] === $user['id'];
    $isAdmin = $user['role_id'] === 'admin';

    if (!$isFacultyOwner && !$isStudentOwner && !$isAdmin) {
        respond(['error' => 'Insufficient permissions to reschedule this appointment'], 403);
    }

    if (!in_array($appointment['status'], ['pending', 'confirmed', 'reschedule_requested'], true)) {
        respond(['error' => 'This appointment cannot be rescheduled'], 400);
    }
    if ($isStudentOwner) {
        $pending = $pdo->prepare("SELECT id FROM appointments WHERE student_id = ? AND faculty_id = ? AND id <> ? AND status IN ('pending', 'reschedule_requested') LIMIT 1 FOR UPDATE");
        $pending->execute([$studentId, $appointment['faculty_id'], $id]);
        if ($pending->fetchColumn()) respond(['error' => 'You already have a pending request with this faculty.'], 409);
    }
    $overlap = $pdo->prepare("SELECT id FROM appointments WHERE student_id = ? AND id <> ? AND appointment_date = ? AND status IN ('pending', 'confirmed', 'reschedule_requested') AND start_minutes < ? AND end_minutes > ? LIMIT 1 FOR UPDATE");
    $overlap->execute([$studentId, $id, $appointmentDate, $endMinutes, $startMinutes]);
    if ($overlap->fetchColumn()) respond(['error' => 'You already have an appointment at this time.'], 409);

    // Students may only request times that the faculty has published as
    // available. Faculty and administrators manage the calendar themselves.
    if ($isStudentOwner && !facultyIsAvailable(
        $appointment['faculty_id'],
        $appointmentDate,
        $startMinutes,
        $endMinutes
    )) {
        respond(['error' => 'Faculty is not available at the requested time'], 400);
    }

    if (hasAppointmentConflict(
        $appointment['faculty_id'],
        $appointmentDate,
        $startMinutes,
        $endMinutes,
        $id
    )) {
        respond(['error' => 'The selected time conflicts with another appointment'], 409);
    }

    // Faculty/admin can confirm the new slot; students request a reschedule.
    $newStatus = ($isFacultyOwner || $isAdmin) ? 'confirmed' : 'reschedule_requested';

    $statement = $pdo->prepare(
        'UPDATE appointments SET
         appointment_date = :appointment_date,
         start_minutes = :start_minutes,
         end_minutes = :end_minutes,
         status = :status,
         reschedule_reason = :reschedule_reason,
         approved_at = CASE WHEN :status2 = \'confirmed\' THEN COALESCE(approved_at, NOW()) ELSE approved_at END,
         updated_at = NOW()
         WHERE id = :id'
    );
    $statement->execute([
        ':appointment_date' => $appointmentDate,
        ':start_minutes' => $startMinutes,
        ':end_minutes' => $endMinutes,
        ':status' => $newStatus,
        ':status2' => $newStatus,
        ':reschedule_reason' => $reason !== '' ? $reason : null,
        ':id' => $id,
    ]);

    $pdo->commit();

    logAudit(
        'reschedule',
        'appointment',
        $id,
        [
            'appointment_date' => $appointment['appointment_date'],
            'start_minutes' => $appointment['start_minutes'],
            'end_minutes' => $appointment['end_minutes'],
            'status' => $appointment['status'],
        ],
        [
            'appointment_date' => $appointmentDate,
            'start_minutes' => $startMinutes,
            'end_minutes' => $endMinutes,
            'status' => $newStatus,
        ]
    );

    $notifyUserId = $isStudentOwner ? $appointment['faculty_id'] : $appointment['student_id'];
    $actorName = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')) ?: $user['email'];
    createNotification(
        $notifyUserId,
        'appointment_rescheduled',
        'Appointment rescheduled',
        sprintf(
            '%s %s the appointment to %s (%d–%d minutes from midnight).',
            $actorName,
            $isStudentOwner ? 'requested a new time for' : 'moved',
            $appointmentDate,
            $startMinutes,
            $endMinutes
        ),
        $id
    );

    respond(fetchAppointmentById($id));
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respondServerError($exception, 'Failed to reschedule appointment.');
}
