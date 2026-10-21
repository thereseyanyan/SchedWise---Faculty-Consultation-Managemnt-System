<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Get availability ID from URL if present (e.g., /api/faculty/availability.php?id=xxx)
$id = $_GET['id'] ?? null;

global $pdo;

// GET /api/faculty/availability.php - List faculty availability
// GET /api/faculty/availability.php?id=xxx - Get specific faculty availability
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Authenticate user
    $user = authenticateUser();

    if ($id) {
        // Get specific availability
        $statement = $pdo->prepare(
            "SELECT fa.*,
                    uf.first_name AS faculty_first_name, uf.last_name AS faculty_last_name
             FROM faculty_availability fa
             JOIN users u ON fa.faculty_id = u.id
             LEFT JOIN user_profiles uf ON u.id = uf.user_id
             WHERE fa.id = :id"
        );
        $statement->execute([':id' => $id]);
        $availability = $statement->fetch();

        if (!$availability) {
            respond(['error' => 'Availability not found'], 404);
        }

        // Check permissions: faculty can see their own, admin can see any, students can see any active faculty's availability
        $canView = false;
        if ($user['role_id'] === 'admin') {
            $canView = true;
        } elseif ($user['role_id'] === 'faculty' && $availability['faculty_id'] === $user['id']) {
            $canView = true;
        } elseif ($user['role_id'] === 'student') {
            // Students can see availability of active faculty
            $facultyStmt = $pdo->prepare("SELECT status FROM users WHERE id = :id AND role_id = 'faculty'");
            $facultyStmt->execute([':id' => $availability['faculty_id']]);
            $faculty = $facultyStmt->fetch();
            if ($faculty && $faculty['status'] === 'active') {
                $canView = true;
            }
        }

        if (!$canView) {
            respond(['error' => 'Insufficient permissions to view this availability'], 403);
        }

        respond($availability);
    } else {
        // List availabilities with filtering
        // Get query parameters
        $facultyId = $_GET['faculty_id'] ?? null;
        $activeOnly = isset($_GET['active']) ? ($_GET['active'] === 'true') : true;
        $weekday = isset($_GET['weekday']) ? (int)$_GET['weekday'] : null;

        // Build query
        $whereConditions = [];
        $params = [];

        // Apply role-based filtering
        if ($user['role_id'] === 'student') {
            // Students can only see active faculty availability
            $whereConditions[] = "u.status = 'active'";
            if ($activeOnly) {
                $whereConditions[] = 'fa.active = 1';
            }
        } elseif ($user['role_id'] === 'faculty') {
            // Faculty can see their own availability
            $whereConditions[] = 'fa.faculty_id = :faculty_id';
            $params[':faculty_id'] = $user['id'];
            if ($activeOnly) {
                $whereConditions[] = 'fa.active = 1';
            }
        }
        // Admin can see all (with optional filters)

        // Apply explicit filters if provided (and user has permission)
        if ($facultyId && ($user['role_id'] === 'admin' ||
                           ($user['role_id'] === 'faculty' && $facultyId == $user['id']) ||
                           ($user['role_id'] === 'student' &&
                            // Students can check specific faculty's availability
                            true))) {
            $whereConditions[] = 'fa.faculty_id = :filter_faculty_id';
            $params[':filter_faculty_id'] = $facultyId;

            // Also verify faculty exists and is active for student role
            if ($user['role_id'] === 'student') {
                $whereConditions[] = "u.status = 'active'";
            }
        }

        if ($weekday !== null && $weekday >= 0 && $weekday <= 6) {
            $whereConditions[] = 'fa.weekday = :weekday';
            $params[':weekday'] = $weekday;
        }

        $whereClause = empty($whereConditions) ? '' : 'WHERE ' . implode(' AND ', $whereConditions);

        // Prepare and execute query
        $statement = $pdo->prepare(
            "SELECT fa.*,
                    uf.first_name AS faculty_first_name, uf.last_name AS faculty_last_name
             FROM faculty_availability fa
             JOIN users u ON fa.faculty_id = u.id
             LEFT JOIN user_profiles uf ON u.id = uf.user_id
             {$whereClause}
             ORDER BY fa.weekday, fa.start_minutes"
        );
        $statement->execute($params);
        $availabilities = $statement->fetchAll();

        respond($availabilities);
    }
}

// POST /api/faculty/availability.php - Create new faculty availability
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Authenticate user
    $user = authenticateUser();

    // Only faculty can create their own availability, admins can create for any faculty
    if ($user['role_id'] !== 'faculty' && $user['role_id'] !== 'admin') {
        respond(['error' => 'Insufficient permissions'], 403);
    }

    $input = jsonInput();

    // Validate input
    $required = ['faculty_id', 'weekday', 'start_minutes', 'end_minutes'];
    foreach ($required as $field) {
        if (!array_key_exists($field, $input) || $input[$field] === null || $input[$field] === '') {
            respond(['error' => ucfirst(str_replace('_', ' ', $field)) . ' is required'], 400);
        }
    }

    // Validate weekday (0-6)
    $weekday = (int)$input['weekday'];
    if ($weekday < 0 || $weekday > 6) {
        respond(['error' => 'Weekday must be between 0 (Sunday) and 6 (Saturday)'], 400);
    }

    // Validate times
    $startMinutes = (int)$input['start_minutes'];
    $endMinutes = (int)$input['end_minutes'];
    if ($startMinutes < 0 || $startMinutes > 1439 || $endMinutes < 0 || $endMinutes > 1439) {
        respond(['error' => 'Times must be between 0 and 1439 minutes'], 400);
    }

    if ($startMinutes >= $endMinutes) {
        respond(['error' => 'End time must be after start time'], 400);
    }

    if (isset($input['location']) && strlen((string)$input['location']) > 255) {
        respond(['error' => 'Location must not exceed 255 characters'], 400);
    }

    if (isset($input['meeting_link'])) {
        $meetingLink = (string)$input['meeting_link'];
        if (strlen($meetingLink) > 500) {
            respond(['error' => 'Meeting link must not exceed 500 characters'], 400);
        }
        if (!validateHttpUrl($meetingLink)) {
            respond(['error' => 'Meeting link must be a valid http or https URL'], 400);
        }
    }

    if (isset($input['timezone']) && strlen((string)$input['timezone']) > 50) {
        respond(['error' => 'Timezone must not exceed 50 characters'], 400);
    }

    $active = isset($input['active']) ? (int)$input['active'] : 1;
    if (!in_array($active, [0, 1], true)) {
        respond(['error' => 'Active must be 0 or 1'], 400);
    }

    // Determine which faculty_id to use
    $targetFacultyId = $input['faculty_id'];
    if ($user['role_id'] === 'faculty') {
        // Faculty can only create availability for themselves
        if ($targetFacultyId !== $user['id']) {
            respond(['error' => 'Can only create availability for yourself'], 403);
        }
    }
    // Admin can create for any faculty_id (but should verify it exists)

    try {
        $pdo->beginTransaction();

        // Verify faculty exists and is active (if creating for someone else)
        if ($user['role_id'] === 'admin' && $targetFacultyId !== $user['id']) {
            $facultyCheck = $pdo->prepare("SELECT id, status FROM users WHERE id = :id AND role_id = 'faculty'");
            $facultyCheck->execute([':id' => $targetFacultyId]);
            $faculty = $facultyCheck->fetch();

            if (!$faculty) {
                respond(['error' => 'Faculty not found'], 404);
            }

            if ($faculty['status'] !== 'active') {
                respond(['error' => 'Faculty is not active'], 400);
            }
        }

        // Check for overlapping availability (for same faculty and weekday)
        $overlapCheck = $pdo->prepare(
            'SELECT id FROM faculty_availability
             WHERE faculty_id = :faculty_id
               AND weekday = :weekday
               AND active = 1
               AND (
                   (start_minutes < :end_minutes AND end_minutes > :start_minutes)  -- Time overlap
               )'
        );
        $overlapCheck->execute([
            ':faculty_id' => $targetFacultyId,
            ':weekday' => $weekday,
            ':start_minutes' => $startMinutes,
            ':end_minutes' => $endMinutes
        ]);

        if ($overlapCheck->fetch()) {
            respond(['error' => 'Overlapping availability already exists for this time slot'], 409);
        }

        // Create availability
        $availabilityId = bin2hex(random_bytes(16));
        $statement = $pdo->prepare(
            'INSERT INTO faculty_availability (
                id, faculty_id, weekday, start_minutes, end_minutes,
                location, meeting_link, timezone, active
            ) VALUES (
                :id, :faculty_id, :weekday, :start_minutes, :end_minutes,
                :location, :meeting_link, :timezone, :active
            )'
        );
        $statement->execute([
            ':id' => $availabilityId,
            ':faculty_id' => $targetFacultyId,
            ':weekday' => $weekday,
            ':start_minutes' => $startMinutes,
            ':end_minutes' => $endMinutes,
            ':location' => $input['location'] ?? null,
            ':meeting_link' => $input['meeting_link'] ?? null,
            ':timezone' => $input['timezone'] ?? 'UTC',
            ':active' => $active
        ]);

        $pdo->commit();

        // Log audit
        logAudit('create', 'faculty_availability', $availabilityId, [], [
            'faculty_id' => $targetFacultyId,
            'weekday' => $weekday,
            'start_minutes' => $startMinutes,
            'end_minutes' => $endMinutes
        ]);

        // Return created availability
        $statement = $pdo->prepare(
            'SELECT fa.*,
                    uf.first_name AS faculty_first_name, uf.last_name AS faculty_last_name
             FROM faculty_availability fa
             JOIN users u ON fa.faculty_id = u.id
             LEFT JOIN user_profiles uf ON u.id = uf.user_id
             WHERE fa.id = :id'
        );
        $statement->execute([':id' => $availabilityId]);
        $availability = $statement->fetch();

        respond($availability, 201);
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        respondServerError($exception, 'Failed to create availability.');
    }
}

// PUT /api/faculty/availability.php?id=xxx - Update faculty availability
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    if (!$id) {
        respond(['error' => 'Availability ID is required'], 400);
    }

    // Authenticate user
    $user = authenticateUser();

    $input = jsonInput();

    try {
        $pdo->beginTransaction();

        // Get existing availability
        $existingStmt = $pdo->prepare('SELECT * FROM faculty_availability WHERE id = :id');
        $existingStmt->execute([':id' => $id]);
        $existing = $existingStmt->fetch();

        if (!$existing) {
            respond(['error' => 'Availability not found'], 404);
        }

        // Check permissions: faculty can update their own, admin can update any
        $canUpdate = false;
        if ($user['role_id'] === 'admin') {
            $canUpdate = true;
        } elseif ($user['role_id'] === 'faculty' && $existing['faculty_id'] === $user['id']) {
            $canUpdate = true;
        }

        if (!$canUpdate) {
            respond(['error' => 'Insufficient permissions to update this availability'], 403);
        }

        // Validate input if fields are provided
        $facultyId = $existing['faculty_id']; // Keep existing if not provided
        $weekday = $existing['weekday'];
        $startMinutes = $existing['start_minutes'];
        $endMinutes = $existing['end_minutes'];
        $location = $existing['location'];
        $meetingLink = $existing['meeting_link'];
        $timezone = $existing['timezone'];
        $active = $existing['active'];

        // Override with provided values
        if (isset($input['faculty_id'])) {
            // Only admin can change faculty_id
            if ($user['role_id'] !== 'admin') {
                respond(['error' => 'Cannot change faculty_id'], 400);
            }
            $facultyId = $input['faculty_id'];

            # Verify faculty exists and is active
            $facultyCheck = $pdo->prepare("SELECT id, status FROM users WHERE id = :id AND role_id = 'faculty'");
            $facultyCheck->execute([':id' => $facultyId]);
            $faculty = $facultyCheck->fetch();

            if (!$faculty) {
                respond(['error' => 'Faculty not found'], 404);
            }

            if ($faculty['status'] !== 'active') {
                respond(['error' => 'Faculty is not active'], 400);
            }
        }

        if (isset($input['weekday'])) {
            $weekday = (int)$input['weekday'];
            if ($weekday < 0 || $weekday > 6) {
                respond(['error' => 'Weekday must be between 0 (Sunday) and 6 (Saturday)'], 400);
            }
        }

        if (isset($input['start_minutes'])) {
            $startMinutes = (int)$input['start_minutes'];
            if ($startMinutes < 0 || $startMinutes > 1439) {
                respond(['error' => 'Start time must be between 0 and 1439 minutes'], 400);
            }
        }

        if (isset($input['end_minutes'])) {
            $endMinutes = (int)$input['end_minutes'];
            if ($endMinutes < 0 || $endMinutes > 1439) {
                respond(['error' => 'End time must be between 0 and 1439 minutes'], 400);
            }
        }

        if (isset($input['start_minutes']) || isset($input['end_minutes'])) {
            if ($startMinutes >= $endMinutes) {
                respond(['error' => 'End time must be after start time'], 400);
            }
        }

        if (isset($input['location'])) {
            if (strlen((string)$input['location']) > 255) {
                respond(['error' => 'Location must not exceed 255 characters'], 400);
            }
            $location = $input['location'];
        }

        if (isset($input['meeting_link'])) {
            $meetingLink = (string)$input['meeting_link'];
            if (strlen($meetingLink) > 500) {
                respond(['error' => 'Meeting link must not exceed 500 characters'], 400);
            }
            if (!validateHttpUrl($meetingLink)) {
                respond(['error' => 'Meeting link must be a valid http or https URL'], 400);
            }
            $meetingLink = $input['meeting_link'];
        }

        if (isset($input['timezone'])) {
            if (strlen((string)$input['timezone']) > 50) {
                respond(['error' => 'Timezone must not exceed 50 characters'], 400);
            }
            $timezone = $input['timezone'];
        }

        if (isset($input['active'])) {
            $active = (int)$input['active'];
            if ($active !== 0 && $active !== 1) {
                respond(['error' => 'Active must be 0 or 1'], 400);
            }
        }

        # Check for overlapping availability (excluding self)
        $overlapCheck = $pdo->prepare(
            'SELECT id FROM faculty_availability
             WHERE faculty_id = :faculty_id
               AND weekday = :weekday
               AND active = 1
               AND id <> :exclude_id
               AND (
                   (start_minutes < :end_minutes AND end_minutes > :start_minutes)  -- Time overlap
               )'
        );
        $overlapCheck->execute([
            ':faculty_id' => $facultyId,
            ':weekday' => $weekday,
            ':start_minutes' => $startMinutes,
            ':end_minutes' => $endMinutes,
            ':exclude_id' => $id
        ]);

        if ($overlapCheck->fetch()) {
            respond(['error' => 'Overlapping availability already exists for this time slot'], 409);
        }

        # Update availability
        $statement = $pdo->prepare(
            'UPDATE faculty_availability SET
             faculty_id = :faculty_id,
             weekday = :weekday,
             start_minutes = :start_minutes,
             end_minutes = :end_minutes,
             location = :location,
             meeting_link = :meeting_link,
             timezone = :timezone,
             active = :active,
             updated_at = NOW()
             WHERE id = :id'
        );
        $statement->execute([
            ':faculty_id' => $facultyId,
            ':weekday' => $weekday,
            ':start_minutes' => $startMinutes,
            ':end_minutes' => $endMinutes,
            ':location' => $location,
            ':meeting_link' => $meetingLink,
            ':timezone' => $timezone,
            ':active' => $active,
            ':id' => $id
        ]);

        $pdo->commit();

        # Log audit
        logAudit('update', 'faculty_availability', $id,
                 ['faculty_id' => $existing['faculty_id'], 'weekday' => $existing['weekday'],
                  'start_minutes' => $existing['start_minutes'], 'end_minutes' => $existing['end_minutes']],
                 ['faculty_id' => $facultyId, 'weekday' => $weekday,
                  'start_minutes' => $startMinutes, 'end_minutes' => $endMinutes]);

        # Return updated availability
        $statement = $pdo->prepare(
            'SELECT fa.*,
                    uf.first_name AS faculty_first_name, uf.last_name AS faculty_last_name
             FROM faculty_availability fa
             JOIN users u ON fa.faculty_id = u.id
             LEFT JOIN user_profiles uf ON u.id = uf.user_id
             WHERE fa.id = :id'
        );
        $statement->execute([':id' => $id]);
        $availability = $statement->fetch();

        respond($availability);
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        respondServerError($exception, 'Failed to update availability.');
    }
}

// DELETE /api/faculty/availability.php?id=xxx - Delete faculty availability
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    if (!$id) {
        respond(['error' => 'Availability ID is required'], 400);
    }

    // Authenticate user
    $user = authenticateUser();

    try {
        $pdo->beginTransaction();

        // Get existing availability
        $existingStmt = $pdo->prepare('SELECT * FROM faculty_availability WHERE id = :id');
        $existingStmt->execute([':id' => $id]);
        $existing = $existingStmt->fetch();

        if (!$existing) {
            respond(['error' => 'Availability not found'], 404);
        }

        // Check permissions: faculty can delete their own, admin can delete any
        $canDelete = false;
        if ($user['role_id'] === 'admin') {
            $canDelete = true;
        } elseif ($user['role_id'] === 'faculty' && $existing['faculty_id'] === $user['id']) {
            $canDelete = true;
        }

        if (!$canDelete) {
            respond(['error' => 'Insufficient permissions to delete this availability'], 403);
        }

        // Check if any appointments are using this availability (prevent deletion if in use)
        $appointmentCheck = $pdo->prepare('SELECT COUNT(*) FROM appointments WHERE availability_id = :id');
        $appointmentCheck->execute([':id' => $id]);
        $appointmentCount = $appointmentCheck->fetchColumn();

        if ($appointmentCount > 0) {
            respond(['error' => 'Cannot delete availability that is used by existing appointments'], 400);
        }

        // Delete availability
        $deleteStmt = $pdo->prepare('DELETE FROM faculty_availability WHERE id = :id');
        $deleteStmt->execute([':id' => $id]);

        $pdo->commit();

        // Log audit
        logAudit('delete', 'faculty_availability', $id, [
            'faculty_id' => $existing['faculty_id'],
            'weekday' => $existing['weekday'],
            'start_minutes' => $existing['start_minutes'],
            'end_minutes' => $existing['end_minutes'],
        ], []);

        respond(['message' => 'Availability deleted successfully']);
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        respondServerError($exception, 'Failed to delete availability.');
    }
}

// If we reach here, method not allowed
respond(['error' => 'Method not allowed'], 405);