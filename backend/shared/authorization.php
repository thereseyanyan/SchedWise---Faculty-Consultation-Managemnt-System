<?php

declare(strict_types=1);

/**
 * Check appointment ownership and permissions
 */
function appointmentCanBeAccessedBy(string $appointmentId, string $userId, string $userRole): bool
{
    global $pdo;
    $statement = $pdo->prepare(
        'SELECT student_id, faculty_id, status
         FROM appointments
         WHERE id = :id'
    );
    $statement->execute([':id' => $appointmentId]);
    $appointment = $statement->fetch();

    if (!$appointment) {
        return false;
    }

    // Admin can access everything
    if ($userRole === 'admin') {
        return true;
    }

    // Faculty can access their own appointments
    if ($userRole === 'faculty' && $appointment['faculty_id'] === $userId) {
        return true;
    }

    // Student can access their own appointments
    if ($userRole === 'student' && $appointment['student_id'] === $userId) {
        return true;
    }

    return false;
}

/**
 * Check if user can modify appointment (approve, reject, etc.)
 */
function appointmentCanBeModifiedBy(string $appointmentId, string $userId, string $userRole): bool
{
    global $pdo;
    $statement = $pdo->prepare(
        'SELECT faculty_id, status
         FROM appointments
         WHERE id = :id'
    );
    $statement->execute([':id' => $appointmentId]);
    $appointment = $statement->fetch();

    if (!$appointment) {
        return false;
    }

    // Admin can modify everything
    if ($userRole === 'admin') {
        return true;
    }

    // Only faculty can modify their own appointments (approve/reject/etc.)
    if ($userRole === 'faculty' && $appointment['faculty_id'] === $userId) {
        // Additional status checks can be added here based on business rules
        return true;
    }

    return false;
}

/**
 * Check if faculty has availability at given time
 */
function scheduleAllowsSlot(array $recurring, array $overrides, string $date, int $startMinutes, int $endMinutes): bool
{
    $dayOverrides = array_filter($overrides, fn(array $row): bool => $row['date'] === $date);
    foreach ($dayOverrides as $row) {
        if ($row['kind'] === 'blocked' && (
            ($row['start_minutes'] === null && $row['end_minutes'] === null)
            || ((int)$row['start_minutes'] < $endMinutes && (int)$row['end_minutes'] > $startMinutes)
        )) return false;
    }
    foreach ($dayOverrides as $row) {
        if ($row['kind'] === 'available' && (
            ($row['start_minutes'] === null && $row['end_minutes'] === null)
            || ((int)$row['start_minutes'] <= $startMinutes && (int)$row['end_minutes'] >= $endMinutes)
        )) return true;
    }
    $weekday = (int)(new DateTimeImmutable($date))->format('w');
    foreach ($recurring as $row) {
        if ((bool)$row['active'] && (int)$row['weekday'] === $weekday
            && (int)$row['start_minutes'] <= $startMinutes && (int)$row['end_minutes'] >= $endMinutes) return true;
    }
    return false;
}

function facultyIsAvailable(string $facultyId, string $date, int $startMinutes, int $endMinutes): bool
{
    global $pdo;

    // Check for blocked overrides first
    $blockedStatement = $pdo->prepare(
        'SELECT id FROM schedule_overrides
         WHERE faculty_id = :faculty_id
         AND date = :date
         AND kind = \'blocked\'
         AND (
             (start_minutes IS NULL AND end_minutes IS NULL) OR
             (start_minutes < :end_minutes AND end_minutes > :start_minutes)
         )'
    );
    $blockedStatement->execute([
        ':faculty_id' => $facultyId,
        ':date' => $date,
        ':start_minutes' => $startMinutes,
        ':end_minutes' => $endMinutes
    ]);

    if ($blockedStatement->fetch()) {
        return false; // Blocked
    }

    // Check for specific availability override. A day-based override
    // (NULL times) opens the whole day; a timed override opens any slot that
    // fits inside its range.
    $availableStatement = $pdo->prepare(
        'SELECT id FROM schedule_overrides
         WHERE faculty_id = :faculty_id
         AND date = :date
         AND kind = \'available\'
         AND (
             (start_minutes IS NULL AND end_minutes IS NULL) OR
             (start_minutes <= :start_minutes AND end_minutes >= :end_minutes)
         )'
    );
    $availableStatement->execute([
        ':faculty_id' => $facultyId,
        ':date' => $date,
        ':start_minutes' => $startMinutes,
        ':end_minutes' => $endMinutes
    ]);

    if ($availableStatement->fetch()) {
        return true; // Explicitly available
    }

    // Check recurring availability
    $weekday = (int)date('w', strtotime($date)); // 0=Sunday, 6=Saturday
    $recurringStatement = $pdo->prepare(
        'SELECT id FROM faculty_availability
         WHERE faculty_id = :faculty_id
         AND weekday = :weekday
         AND active = 1
         AND start_minutes <= :start_minutes
         AND end_minutes >= :end_minutes'
    );
    $recurringStatement->execute([
        ':faculty_id' => $facultyId,
        ':weekday' => $weekday,
        ':start_minutes' => $startMinutes,
        ':end_minutes' => $endMinutes
    ]);

    return (bool)$recurringStatement->fetch();
}

/**
 * Check for appointment conflicts (excluding the appointment itself if updating)
 */
function hasAppointmentConflict(string $facultyId, string $date, int $startMinutes, int $endMinutes, ?string $excludeAppointmentId = null): bool
{
    global $pdo;

    $where = 'faculty_id = :faculty_id AND appointment_date = :date AND status IN (\'confirmed\', \'pending\', \'reschedule_requested\')';
    $params = [
        ':faculty_id' => $facultyId,
        ':date' => $date
    ];

    if ($excludeAppointmentId) {
        $where .= ' AND id != :exclude_id';
        $params[':exclude_id'] = $excludeAppointmentId;
    }

    $where .= ' AND (
        (start_minutes < :end_minutes AND end_minutes > :start_minutes)  -- Time overlap
    )';

    $params[':start_minutes'] = $startMinutes;
    $params[':end_minutes'] = $endMinutes;

    $statement = $pdo->prepare(
        "SELECT id FROM appointments WHERE {$where} FOR UPDATE"
    );
    $statement->execute($params);

    return (bool)$statement->fetch();
}
/** Serialize booking and rescheduling before locking appointment rows. */
function lockAppointmentFaculty(string $appointmentId): void
{
    global $pdo;
    $lookup = $pdo->prepare('SELECT faculty_id FROM appointments WHERE id = :id');
    $lookup->execute([':id' => $appointmentId]);
    $facultyId = $lookup->fetchColumn();
    if (!$facultyId) {
        respond(['error' => 'Appointment not found'], 404);
    }
    $lock = $pdo->prepare('SELECT id FROM users WHERE id = :id FOR UPDATE');
    $lock->execute([':id' => $facultyId]);
}
