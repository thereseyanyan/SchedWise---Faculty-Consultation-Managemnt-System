<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

global $pdo;

// GET /api/consultations/index.php - List consultation records
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Authenticate user
    $user = authenticateUser();

    // Get query parameters for filtering
    $appointmentId = $_GET['appointment_id'] ?? null;
    $facultyId = $_GET['faculty_id'] ?? null;
    $studentId = $_GET['student_id'] ?? null;

    // Build query
    $whereConditions = [];
    $params = [];

    // Role scoping is always applied first and uses dedicated placeholders.
    // Filter parameters use different placeholders so they cannot overwrite
    // the ownership condition (which would allow reading other users' records).
    if ($user['role_id'] === 'student') {
        $whereConditions[] = 'cr.student_id = :scope_student_id';
        $params[':scope_student_id'] = $user['id'];
    } elseif ($user['role_id'] === 'faculty') {
        $whereConditions[] = 'cr.faculty_id = :scope_faculty_id';
        $params[':scope_faculty_id'] = $user['id'];
    }
    // Admin can see all (no additional filter needed)

    if ($appointmentId) {
        $whereConditions[] = 'cr.appointment_id = :filter_appointment_id';
        $params[':filter_appointment_id'] = $appointmentId;
    }

    if ($facultyId) {
        $whereConditions[] = 'cr.faculty_id = :filter_faculty_id';
        $params[':filter_faculty_id'] = $facultyId;
    }

    if ($studentId) {
        $whereConditions[] = 'cr.student_id = :filter_student_id';
        $params[':filter_student_id'] = $studentId;
    }

    $whereClause = empty($whereConditions) ? '' : 'WHERE ' . implode(' AND ', $whereConditions);

    // Prepare and execute query
    $statement = $pdo->prepare(
        "SELECT cr.*,
                a.appointment_date, a.start_minutes, a.end_minutes, a.topic,
                uf.first_name AS faculty_first_name, uf.last_name AS faculty_last_name,
                us.first_name AS student_first_name, us.last_name AS student_last_name
         FROM consultation_records cr
         JOIN appointments a ON cr.appointment_id = a.id
         LEFT JOIN user_profiles uf ON cr.faculty_id = uf.user_id
         LEFT JOIN user_profiles us ON cr.student_id = us.user_id
         {$whereClause}
         ORDER BY cr.created_at DESC"
    );
    $statement->execute($params);
    $consultations = $statement->fetchAll();

    // Private notes are only returned to the assigned faculty; administrators receive shared summaries.
    if ($user['role_id'] !== 'faculty') {
        foreach ($consultations as &$consultation) {
            unset($consultation['private_notes']);
        }
        unset($consultation);
    }

    respond($consultations);
}

// POST /api/consultations/index.php - Create consultation record (after appointment completion)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Authenticate user
    $user = authenticateUser();

    // Only faculty can create consultation records
    if ($user['role_id'] !== 'faculty') {
        respond(['error' => 'Only faculty can create consultation records'], 403);
    }

    $input = jsonInput();

    // Validate input
    $required = ['appointment_id', 'summary'];
    foreach ($required as $field) {
        if (empty($input[$field])) {
            respond(['error' => ucfirst(str_replace('_', ' ', $field)) . ' is required'], 400);
        }
    }

    foreach (['summary', 'action_items', 'private_notes'] as $field) {
        if (isset($input[$field]) && strlen((string)$input[$field]) > 10000) {
            respond(['error' => ucfirst(str_replace('_', ' ', $field)) . ' is too long'], 400);
        }
    }

    if (!empty($input['follow_up_date']) && !validateDate((string)$input['follow_up_date'])) {
        respond(['error' => 'Invalid follow-up date format'], 400);
    }

    try {
        $pdo->beginTransaction();

        // Get appointment to verify it exists and is completed
        $appointmentStmt = $pdo->prepare(
            'SELECT a.*, uf.first_name AS faculty_first_name, us.first_name AS student_first_name
             FROM appointments a
             LEFT JOIN user_profiles uf ON a.faculty_id = uf.user_id
             LEFT JOIN user_profiles us ON a.student_id = us.user_id
             WHERE a.id = :appointment_id'
        );
        $appointmentStmt->execute([':appointment_id' => $input['appointment_id']]);
        $appointment = $appointmentStmt->fetch();

        if (!$appointment) {
            respond(['error' => 'Appointment not found'], 404);
        }

        // Verify that the faculty creating the record is the faculty on the appointment
        if ($appointment['faculty_id'] !== $user['id']) {
            respond(['error' => 'Can only create consultation records for your own appointments'], 403);
        }

        // Verify appointment is completed
        if ($appointment['status'] !== 'completed') {
            respond(['error' => 'Consultation records can only be created for completed appointments'], 400);
        }

        // Check if consultation record already exists for this appointment
        $existingStmt = $pdo->prepare('SELECT id FROM consultation_records WHERE appointment_id = :appointment_id');
        $existingStmt->execute([':appointment_id' => $input['appointment_id']]);
        if ($existingStmt->fetch()) {
            respond(['error' => 'Consultation record already exists for this appointment'], 409);
        }

        // Create consultation record
        $consultationId = bin2hex(random_bytes(16));
        $statement = $pdo->prepare(
            'INSERT INTO consultation_records (
                id, appointment_id, faculty_id, student_id, summary, action_items, private_notes, follow_up_date
            ) VALUES (
                :id, :appointment_id, :faculty_id, :student_id, :summary, :action_items, :private_notes, :follow_up_date
            )'
        );
        $statement->execute([
            ':id' => $consultationId,
            ':appointment_id' => $input['appointment_id'],
            ':faculty_id' => $user['id'],
            ':student_id' => $appointment['student_id'],
            ':summary' => $input['summary'],
            ':action_items' => $input['action_items'] ?? null,
            ':private_notes' => $input['private_notes'] ?? null,
            ':follow_up_date' => $input['follow_up_date'] ?? null
        ]);

        $pdo->commit();

        // Log audit
        logAudit('create', 'consultation_record', $consultationId, [], [
            'appointment_id' => $input['appointment_id'],
            'faculty_id' => $user['id'],
            'student_id' => $appointment['student_id']
        ]);

        // Return created consultation record
        $statement = $pdo->prepare(
            'SELECT cr.*,
                    a.appointment_date, a.start_minutes, a.end_minutes, a.topic,
                    uf.first_name AS faculty_first_name, uf.last_name AS faculty_last_name,
                    us.first_name AS student_first_name, us.last_name AS student_last_name
             FROM consultation_records cr
             JOIN appointments a ON cr.appointment_id = a.id
             LEFT JOIN user_profiles uf ON cr.faculty_id = uf.user_id
             LEFT JOIN user_profiles us ON cr.student_id = us.user_id
             WHERE cr.id = :id'
        );
        $statement->execute([':id' => $consultationId]);
        $consultation = $statement->fetch();

        respond($consultation, 201);
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        respondServerError($exception, 'Failed to create consultation record.');
    }
}

// If we reach here, method not allowed
respond(['error' => 'Method not allowed'], 405);