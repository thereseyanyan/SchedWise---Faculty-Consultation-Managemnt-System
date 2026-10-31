<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Get override ID from URL if present (e.g., /api/faculty/schedule_overrides.php?id=xxx)
$id = $_GET['id'] ?? null;

global $pdo;

// GET /api/faculty/schedule_overrides.php - List faculty schedule overrides
// GET /api/faculty/schedule_overrides.php?id=xxx - Get specific schedule override
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Authenticate user
    $user = authenticateUser();

    if ($id) {
        // Get specific override
        $statement = $pdo->prepare(
            "SELECT fo.*,
                    uf.first_name AS faculty_first_name, uf.last_name AS faculty_last_name
             FROM schedule_overrides fo
             JOIN users u ON fo.faculty_id = u.id
             LEFT JOIN user_profiles uf ON u.id = uf.user_id
             WHERE fo.id = :id"
        );
        $statement->execute([':id' => $id]);
        $override = $statement->fetch();

        if (!$override) {
            respond(['error' => 'Schedule override not found'], 404);
        }

        // Check permissions: faculty can see their own, admin can see any, students can see any active faculty's overrides
        $canView = false;
        if ($user['role_id'] === 'admin') {
            $canView = true;
        } elseif ($user['role_id'] === 'faculty' && $override['faculty_id'] === $user['id']) {
            $canView = true;
        } elseif ($user['role_id'] === 'student') {
            // Students can see overrides of active faculty
            $facultyStmt = $pdo->prepare("SELECT status FROM users WHERE id = :id AND role_id = 'faculty'");
            $facultyStmt->execute([':id' => $override['faculty_id']]);
            $faculty = $facultyStmt->fetch();
            if ($faculty && $faculty['status'] === 'active') {
                $canView = true;
            }
        }

        if (!$canView) {
            respond(['error' => 'Insufficient permissions to view this schedule override'], 403);
        }

        respond($override);
    } else {
        // List overrides with filtering
        // Get query parameters
        $facultyId = $_GET['faculty_id'] ?? null;
        $date = $_GET['date'] ?? null;
        $kind = $_GET['kind'] ?? null; // 'available' or 'blocked'

        // Build query
        $whereConditions = [];
        $params = [];

        // Apply role-based filtering
        if ($user['role_id'] === 'student') {
            // Students can only see active faculty overrides
            $whereConditions[] = "u.status = 'active'";
        } elseif ($user['role_id'] === 'faculty') {
            // Faculty can see their own overrides
            $whereConditions[] = 'fo.faculty_id = :faculty_id';
            $params[':faculty_id'] = $user['id'];
        }
        // Admin can see all (with optional filters)

        // Apply explicit filters if provided (and user has permission)
        if ($facultyId && ($user['role_id'] === 'admin' ||
                           ($user['role_id'] === 'faculty' && $facultyId == $user['id']) ||
                           ($user['role_id'] === 'student' &&
                            // Students can check specific faculty's overrides
                            true))) {
            $whereConditions[] = 'fo.faculty_id = :filter_faculty_id';
            $params[':filter_faculty_id'] = $facultyId;

            // Also verify faculty exists and is active for student role
            if ($user['role_id'] === 'student') {
                $whereConditions[] = "u.status = 'active'";
            }
        }

        if ($date) {
            $whereConditions[] = 'fo.date = :date';
            $params[':date'] = $date;
        }

        if ($kind && ($kind === 'available' || $kind === 'blocked')) {
            $whereConditions[] = 'fo.kind = :kind';
            $params[':kind'] = $kind;
        }

        $whereClause = empty($whereConditions) ? '' : 'WHERE ' . implode(' AND ', $whereConditions);

        // Prepare and execute query
        $statement = $pdo->prepare(
            "SELECT fo.*,
                    uf.first_name AS faculty_first_name, uf.last_name AS faculty_last_name
             FROM schedule_overrides fo
             JOIN users u ON fo.faculty_id = u.id
             LEFT JOIN user_profiles uf ON u.id = uf.user_id
             {$whereClause}
             ORDER BY fo.date, fo.start_minutes"
        );
        $statement->execute($params);
        $overrides = $statement->fetchAll();

        respond($overrides);
    }
}

// POST /api/faculty/schedule_overrides.php - Create new schedule override
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Authenticate user
    $user = authenticateUser();

    // Only faculty can create their own overrides, admins can create for any faculty
    if ($user['role_id'] !== 'faculty' && $user['role_id'] !== 'admin') {
        respond(['error' => 'Insufficient permissions'], 403);
    }

    $input = jsonInput();

    // Validate input
    $required = ['faculty_id', 'date', 'kind'];
    foreach ($required as $field) {
        if (empty($input[$field])) {
            respond(['error' => ucfirst(str_replace('_', ' ', $field)) . ' is required'], 400);
        }
    }

    // Validate date
    if (!validateDate($input['date'])) {
        respond(['error' => 'Invalid date format (expected YYYY-MM-DD)'], 400);
    }

    // Validate kind
    $kind = $input['kind'];
    if ($kind !== 'available' && $kind !== 'blocked') {
        respond(['error' => 'Kind must be either "available" or "blocked"'], 400);
    }

    // For time-based overrides, validate times.
    $hasStart = isset($input['start_minutes']) && $input['start_minutes'] !== '';
    $hasEnd = isset($input['end_minutes']) && $input['end_minutes'] !== '';
    if ($hasStart !== $hasEnd) {
        respond(['error' => 'Both start_minutes and end_minutes must be provided together'], 400);
    }

    $hasTime = $hasStart && $hasEnd;
    if ($hasTime) {
        $startMinutes = (int)$input['start_minutes'];
        $endMinutes = (int)$input['end_minutes'];

        if ($startMinutes < 0 || $startMinutes > 1439 || $endMinutes < 0 || $endMinutes > 1439) {
            respond(['error' => 'Times must be between 0 and 1439 minutes'], 400);
        }

        if ($startMinutes >= $endMinutes) {
            respond(['error' => 'End time must be after start time'], 400);
        }
    }

    if (isset($input['location']) && strlen((string)$input['location']) > 255) {
        respond(['error' => 'Location must not exceed 255 characters'], 400);
    }

    if (isset($input['reason']) && strlen((string)$input['reason']) > 255) {
        respond(['error' => 'Reason must not exceed 255 characters'], 400);
    }

    // Determine which faculty_id to use
    $targetFacultyId = $input['faculty_id'];
    if ($user['role_id'] === 'faculty') {
        // Faculty can only create overrides for themselves
        if ($targetFacultyId !== $user['id']) {
            respond(['error' => 'Can only create schedule overrides for yourself'], 403);
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

        # Check for overlapping overrides (for same faculty, date, and kind)
        # For time-based overlaps, check time conflicts
        # For day-based overrides (no times), just check if same date and kind exists
        if ($hasTime) {
            $overlapCheck = $pdo->prepare(
                'SELECT id FROM schedule_overrides
                 WHERE faculty_id = :faculty_id
                   AND date = :date
                   AND kind = :kind
                   AND id <> :exclude_id  -- Exclude self when updating
                   AND (
                       (start_minutes IS NULL AND end_minutes IS NULL) OR  -- Day-based override conflicts with time-based
                       (start_minutes <= :end_minutes AND end_minutes >= :start_minutes)  -- Time overlap
                   )'
            );
            // For creation, exclude_id can be null
            $excludeId = null;

            $overlapCheck->execute([
                ':faculty_id' => $targetFacultyId,
                ':date' => $input['date'],
                ':kind' => $kind,
                ':start_minutes' => $startMinutes,
                ':end_minutes' => $endMinutes,
                ':exclude_id' => $excludeId
            ]);
        } else {
            # Day-based override (no specific times) - check if any override exists for same date and kind
            $overlapCheck = $pdo->prepare(
                'SELECT id FROM schedule_overrides
                 WHERE faculty_id = :faculty_id
                   AND date = :date
                   AND kind = :kind
                   AND id <> :exclude_id'
            );
            $excludeId = null;

            $overlapCheck->execute([
                ':faculty_id' => $targetFacultyId,
                ':date' => $input['date'],
                ':kind' => $kind,
                ':exclude_id' => $excludeId
            ]);
        }

        if ($overlapCheck->fetch()) {
            respond(['error' => 'Overlapping schedule override already exists for this date and time'], 409);
        }

        # Create override
        $overrideId = bin2hex(random_bytes(16));
        $statement = $pdo->prepare(
            'INSERT INTO schedule_overrides (
                id, faculty_id, date, kind, start_minutes, end_minutes,
                location, reason
            ) VALUES (
                :id, :faculty_id, :date, :kind, :start_minutes, :end_minutes,
                :location, :reason
            )'
        );
        $statement->execute([
            ':id' => $overrideId,
            ':faculty_id' => $targetFacultyId,
            ':date' => $input['date'],
            ':kind' => $kind,
            ':start_minutes' => $hasTime ? (int)$input['start_minutes'] : null,
            ':end_minutes' => $hasTime ? (int)$input['end_minutes'] : null,
            ':location' => $input['location'] ?? null,
            ':reason' => $input['reason'] ?? null
        ]);

        $pdo->commit();

        # Log audit
        logAudit('create', 'schedule_overrides', $overrideId, [], [
            'faculty_id' => $targetFacultyId,
            'date' => $input['date'],
            'kind' => $kind,
            'start_minutes' => $hasTime ? (int)$input['start_minutes'] : null,
            'end_minutes' => $hasTime ? (int)$input['end_minutes'] : null
        ]);

        # Return created override
        $statement = $pdo->prepare(
            'SELECT fo.*,
                    uf.first_name AS faculty_first_name, uf.last_name AS faculty_last_name
             FROM schedule_overrides fo
             JOIN users u ON fo.faculty_id = u.id
             LEFT JOIN user_profiles uf ON u.id = uf.user_id
             WHERE fo.id = :id'
        );
        $statement->execute([':id' => $overrideId]);
        $override = $statement->fetch();

        respond($override, 201);
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        respondServerError($exception, 'Failed to create schedule override.');
    }
}

// PUT /api/faculty/schedule_overrides.php?id=xxx - Update schedule override
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    if (!$id) {
        respond(['error' => 'Schedule override ID is required'], 400);
    }

    // Authenticate user
    $user = authenticateUser();

    $input = jsonInput();

    try {
        $pdo->beginTransaction();

        // Get existing override
        $existingStmt = $pdo->prepare('SELECT * FROM schedule_overrides WHERE id = :id');
        $existingStmt->execute([':id' => $id]);
        $existing = $existingStmt->fetch();

        if (!$existing) {
            respond(['error' => 'Schedule override not found'], 404);
        }

        // Check permissions: faculty can update their own, admin can update any
        $canUpdate = false;
        if ($user['role_id'] === 'admin') {
            $canUpdate = true;
        } elseif ($user['role_id'] === 'faculty' && $existing['faculty_id'] === $user['id']) {
            $canUpdate = true;
        }

        if (!$canUpdate) {
            respond(['error' => 'Insufficient permissions to update this schedule override'], 403);
        }

        // Validate input if fields are provided
        $facultyId = $existing['faculty_id']; // Keep existing if not provided
        $date = $existing['date'];
        $kind = $existing['kind'];
        $startMinutes = $existing['start_minutes'];
        $endMinutes = $existing['end_minutes'];
        $location = $existing['location'];
        $reason = $existing['reason'];

        // Override with provided values
        if (isset($input['faculty_id'])) {
            // Only admin can change faculty_id
            if ($user['role_id'] !== 'admin') {
                respond(['error' => 'Cannot change faculty_id'], 400);
            }
            $facultyId = $input['faculty_id'];

            // Verify faculty exists and is active
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

        if (isset($input['date'])) {
            if (!validateDate($input['date'])) {
                respond(['error' => 'Invalid date format (expected YYYY-MM-DD)'], 400);
            }
            $date = $input['date'];
        }

        if (isset($input['kind'])) {
            if (!in_array($input['kind'], ['available', 'blocked'], true)) {
                respond(['error' => 'Kind must be either "available" or "blocked"'], 400);
            }
            $kind = $input['kind'];
        }

        // Handle time fields
        $hasTime = false;
        if (isset($input['start_minutes']) && isset($input['end_minutes'])) {
            $hasTime = true;
            $startMinutes = (int)$input['start_minutes'];
            $endMinutes = (int)$input['end_minutes'];

            if ($startMinutes < 0 || $startMinutes > 1439 || $endMinutes < 0 || $endMinutes > 1439) {
                respond(['error' => 'Times must be between 0 and 1439 minutes'], 400);
            }

            if ($startMinutes >= $endMinutes) {
                respond(['error' => 'End time must be after start time'], 400);
            }
        } elseif (isset($input['start_minutes']) || isset($input['end_minutes'])) {
            // Both must be provided together
            respond(['error' => 'Both start_minutes and end_minutes must be provided together'], 400);
        } else {
            // Keep existing time values (could be null for day-based overrides)
            $hasTime = $startMinutes !== null && $endMinutes !== null;
        }

        if (isset($input['location'])) {
            if (strlen((string)$input['location']) > 255) {
                respond(['error' => 'Location must not exceed 255 characters'], 400);
            }
            $location = $input['location'];
        }

        if (isset($input['reason'])) {
            if (strlen((string)$input['reason']) > 255) {
                respond(['error' => 'Reason must not exceed 255 characters'], 400);
            }
            $reason = $input['reason'];
        }

        // Check for overlapping overrides (excluding self)
        if ($hasTime) {
            $overlapCheck = $pdo->prepare(
                'SELECT id FROM schedule_overrides
                 WHERE faculty_id = :faculty_id
                   AND date = :date
                   AND kind = :kind
                   AND id <> :exclude_id
                   AND (
                       (start_minutes IS NULL AND end_minutes IS NULL) OR
                       (start_minutes <= :end_minutes AND end_minutes >= :start_minutes)
                   )'
            );
            $overlapCheck->execute([
                ':faculty_id' => $facultyId,
                ':date' => $date,
                ':kind' => $kind,
                ':start_minutes' => $startMinutes,
                ':end_minutes' => $endMinutes,
                ':exclude_id' => $id
            ]);
        } else {
            // Day-based override (no specific times) - check if any override exists for same date and kind (excluding self)
            $overlapCheck = $pdo->prepare(
                'SELECT id FROM schedule_overrides
                 WHERE faculty_id = :faculty_id
                   AND date = :date
                   AND kind = :kind
                   AND id <> :exclude_id
                   AND (
                       start_minutes IS NULL AND end_minutes IS NULL
                   )'
            );
            $overlapCheck->execute([
                ':faculty_id' => $facultyId,
                ':date' => $date,
                ':kind' => $kind,
                ':exclude_id' => $id
            ]);
        }

        if ($overlapCheck->fetch()) {
            respond(['error' => 'Overlapping schedule override already exists for this date and time'], 409);
        }

        // Update override
        $statement = $pdo->prepare(
            'UPDATE schedule_overrides SET
             faculty_id = :faculty_id,
             date = :date,
             kind = :kind,
             start_minutes = :start_minutes,
             end_minutes = :end_minutes,
             location = :location,
             reason = :reason,
             updated_at = NOW()
             WHERE id = :id'
        );
        $statement->execute([
            ':faculty_id' => $facultyId,
            ':date' => $date,
            ':kind' => $kind,
            ':start_minutes' => $startMinutes,
            ':end_minutes' => $endMinutes,
            ':location' => $location,
            ':reason' => $reason,
            ':id' => $id
        ]);

        $pdo->commit();

        // Log audit
        logAudit('update', 'schedule_overrides', $id, [
            'faculty_id' => $existing['faculty_id'],
            'date' => $existing['date'],
            'kind' => $existing['kind'],
            'start_minutes' => $existing['start_minutes'],
            'end_minutes' => $existing['end_minutes'],
        ], [
            'faculty_id' => $facultyId,
            'date' => $date,
            'kind' => $kind,
            'start_minutes' => $startMinutes,
            'end_minutes' => $endMinutes,
        ]);

        // Return updated override
        $statement = $pdo->prepare(
            'SELECT fo.*,
                    uf.first_name AS faculty_first_name, uf.last_name AS faculty_last_name
             FROM schedule_overrides fo
             JOIN users u ON fo.faculty_id = u.id
             LEFT JOIN user_profiles uf ON u.id = uf.user_id
             WHERE fo.id = :id'
        );
        $statement->execute([':id' => $id]);
        $override = $statement->fetch();

        respond($override);
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        respondServerError($exception, 'Failed to update schedule override.');
    }
}

// DELETE /api/faculty/schedule_overrides.php?id=xxx - Delete schedule override
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    if (!$id) {
        respond(['error' => 'Schedule override ID is required'], 400);
    }

    // Authenticate user
    $user = authenticateUser();

    try {
        $pdo->beginTransaction();

        // Get existing override
        $existingStmt = $pdo->prepare('SELECT * FROM schedule_overrides WHERE id = :id');
        $existingStmt->execute([':id' => $id]);
        $existing = $existingStmt->fetch();

        if (!$existing) {
            respond(['error' => 'Schedule override not found'], 404);
        }

        // Check permissions: faculty can delete their own, admin can delete any
        $canDelete = false;
        if ($user['role_id'] === 'admin') {
            $canDelete = true;
        } elseif ($user['role_id'] === 'faculty' && $existing['faculty_id'] === $user['id']) {
            $canDelete = true;
        }

        if (!$canDelete) {
            respond(['error' => 'Insufficient permissions to delete this schedule override'], 403);
        }

        // Delete override
        $deleteStmt = $pdo->prepare('DELETE FROM schedule_overrides WHERE id = :id');
        $deleteStmt->execute([':id' => $id]);

        $pdo->commit();

        // Log audit
        logAudit('delete', 'schedule_overrides', $id, [
            'faculty_id' => $existing['faculty_id'],
            'date' => $existing['date'],
            'kind' => $existing['kind'],
            'start_minutes' => $existing['start_minutes'],
            'end_minutes' => $existing['end_minutes'],
        ], []);

        respond(['message' => 'Schedule override deleted successfully']);
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        respondServerError($exception, 'Failed to delete schedule override.');
    }
}

// If we reach here, method not allowed
respond(['error' => 'Method not allowed'], 405);