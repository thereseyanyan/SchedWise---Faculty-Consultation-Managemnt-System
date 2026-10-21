<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

global $pdo;

// GET /api/appointments/index.php - List appointments with filtering
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Authenticate user
    $user = authenticateUser();

    // Get query parameters for filtering
    $studentId = $_GET['student_id'] ?? null;
    $facultyId = $_GET['faculty_id'] ?? null;
    $status = $_GET['status'] ?? null;
    $dateFrom = $_GET['date_from'] ?? null;
    $dateTo = $_GET['date_to'] ?? null;

    // Build query
    $whereConditions = [];
    $params = [];

    // Apply role-based filtering
    if ($user['role_id'] === 'student') {
        $whereConditions[] = 'student_id = :student_id';
        $params[':student_id'] = $user['id'];
    } elseif ($user['role_id'] === 'faculty') {
        $whereConditions[] = 'faculty_id = :faculty_id';
        $params[':faculty_id'] = $user['id'];
    }
    // Admin can see all (no additional filter needed)

    // Apply explicit filters if provided (and user has permission)
    if ($studentId && ($user['role_id'] === 'admin' || $user['role_id'] === 'faculty')) {
        $whereConditions[] = 'student_id = :filter_student_id';
        $params[':filter_student_id'] = $studentId;
    }

    if ($facultyId && ($user['role_id'] === 'admin' || $user['role_id'] === 'student')) {
        $whereConditions[] = 'faculty_id = :filter_faculty_id';
        $params[':filter_faculty_id'] = $facultyId;
    }

    if ($status) {
        $whereConditions[] = 'status = :status';
        $params[':status'] = $status;
    }

    if ($dateFrom) {
        $whereConditions[] = 'appointment_date >= :date_from';
        $params[':date_from'] = $dateFrom;
    }

    if ($dateTo) {
        $whereConditions[] = 'appointment_date <= :date_to';
        $params[':date_to'] = $dateTo;
    }

    $whereClause = empty($whereConditions) ? '' : 'WHERE ' . implode(' AND ', $whereConditions);

    // Prepare and execute query
    $statement = $pdo->prepare(
        "SELECT a.*,
                uf.first_name AS faculty_first_name, uf.last_name AS faculty_last_name,
                uf.faculty_number AS faculty_number,
                us.first_name AS student_first_name, us.last_name AS student_last_name,
                us.student_number AS student_number, us.program AS student_program
         FROM appointments a
         LEFT JOIN user_profiles uf ON a.faculty_id = uf.user_id
         LEFT JOIN user_profiles us ON a.student_id = us.user_id
         {$whereClause}
         ORDER BY a.appointment_date, a.start_minutes"
    );
    $statement->execute($params);
    $appointments = $statement->fetchAll();

    respond($appointments);
}

// POST /api/appointments/index.php - Create new appointment
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Authenticate user
    $user = authenticateUser();

    // Only students can create appointments (for now)
    if ($user['role_id'] !== 'student') {
        respond(['error' => 'Only students can create appointments'], 403);
    }

    $input = jsonInput();

    // Validate input
    $validationErrors = validateAppointmentData($input);
    if (!empty($validationErrors)) {
        respond(['error' => 'Validation failed', 'fields' => $validationErrors], 400);
    }

    // Ensure the student creating the appointment is the authenticated user
    if ($input['student_id'] !== $user['id']) {
        respond(['error' => 'Can only create appointments for yourself'], 403);
    }

    try {
        $pdo->beginTransaction();

        // Serialize requests from one student, including bookings with different faculty.
        $studentLock = $pdo->prepare('SELECT id FROM users WHERE id = ? FOR UPDATE');
        $studentLock->execute([$user['id']]);
        $pending = $pdo->prepare("SELECT id FROM appointments WHERE student_id = ? AND faculty_id = ? AND status IN ('pending', 'reschedule_requested') LIMIT 1 FOR UPDATE");
        $pending->execute([$user['id'], $input['faculty_id']]);
        if ($pending->fetchColumn()) {
            respond(['error' => 'You already have a pending request with this faculty. Wait for approval or rejection before requesting again with them.'], 409);
        }
        $overlap = $pdo->prepare("SELECT id FROM appointments WHERE student_id = ? AND appointment_date = ? AND status IN ('pending', 'confirmed', 'reschedule_requested') AND start_minutes < ? AND end_minutes > ? LIMIT 1 FOR UPDATE");
        $overlap->execute([$user['id'], $input['appointment_date'], (int)$input['end_minutes'], (int)$input['start_minutes']]);
        if ($overlap->fetchColumn()) {
            respond(['error' => 'You already have an appointment at this time.'], 409);
        }

        // Check if faculty exists and is active
        $facultyStmt = $pdo->prepare("SELECT id, status FROM users WHERE id = :id AND role_id = 'faculty' FOR UPDATE");
        $facultyStmt->execute([':id' => $input['faculty_id']]);
        $faculty = $facultyStmt->fetch();

        if (!$faculty) {
            respond(['error' => 'Faculty not found'], 404);
        }

        if ($faculty['status'] !== 'active') {
            respond(['error' => 'Faculty is not active'], 400);
        }

        // Check faculty availability
        if (!facultyIsAvailable(
                $input['faculty_id'],
                $input['appointment_date'],
                (int)$input['start_minutes'],
                (int)$input['end_minutes']
            )) {
            respond(['error' => 'Faculty is not available at the requested time'], 400);
        }

        // Check for conflicts
        if (hasAppointmentConflict(
                $input['faculty_id'],
                $input['appointment_date'],
                (int)$input['start_minutes'],
                (int)$input['end_minutes']
            )) {
            respond(['error' => 'Time slot is already booked'], 409);
        }

        // Create appointment
        $appointmentId = bin2hex(random_bytes(16));
        $statement = $pdo->prepare(
            'INSERT INTO appointments (
                id, student_id, faculty_id, appointment_date, start_minutes, end_minutes,
                topic, reason, location, meeting_link, status
            ) VALUES (
                :id, :student_id, :faculty_id, :appointment_date, :start_minutes, :end_minutes,
                :topic, :reason, :location, :meeting_link, :status
            )'
        );
        $statement->execute([
            ':id' => $appointmentId,
            ':student_id' => $input['student_id'],
            ':faculty_id' => $input['faculty_id'],
            ':appointment_date' => $input['appointment_date'],
            ':start_minutes' => (int)$input['start_minutes'],
            ':end_minutes' => (int)$input['end_minutes'],
            ':topic' => $input['topic'],
            ':reason' => $input['reason'],
            ':location' => $input['location'] ?? null,
            ':meeting_link' => $input['meeting_link'] ?? null,
            ':status' => 'pending'
        ]);

        $pdo->commit();

        // Log audit
        logAudit('create', 'appointment', $appointmentId, [], [
            'student_id' => $input['student_id'],
            'faculty_id' => $input['faculty_id'],
            'appointment_date' => $input['appointment_date'],
            'start_minutes' => $input['start_minutes'],
            'end_minutes' => $input['end_minutes']
        ]);

        // Return created appointment
        $statement = $pdo->prepare(
            'SELECT a.*,
                    uf.first_name AS faculty_first_name, uf.last_name AS faculty_last_name,
                    uf.faculty_number AS faculty_number,
                    us.first_name AS student_first_name, us.last_name AS student_last_name,
                    us.student_number AS student_number, us.program AS student_program
             FROM appointments a
             LEFT JOIN user_profiles uf ON a.faculty_id = uf.user_id
             LEFT JOIN user_profiles us ON a.student_id = us.user_id
             WHERE a.id = :id'
        );
        $statement->execute([':id' => $appointmentId]);
        $appointment = $statement->fetch();

        respond($appointment, 201);
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        respondServerError($exception, 'Failed to create appointment.');
    }
}

// If we reach here, method not allowed
respond(['error' => 'Method not allowed'], 405);
