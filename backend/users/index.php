<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$user = authenticateUser();
global $pdo;

// GET /users/index.php — list users (admin) or self via ?id=
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $id = $_GET['id'] ?? null;

    if ($id) {
        if ($user['role_id'] !== 'admin' && $user['id'] !== $id) {
            respond(['error' => 'Insufficient permissions'], 403);
        }

        $statement = $pdo->prepare(
            'SELECT u.id, u.email, u.role_id, u.status, u.email_verified_at,
                    u.faculty_approval_status, u.student_approval_status, u.last_login_at, u.created_at,
                    up.first_name, up.last_name, up.student_number, up.faculty_number,
                    up.department_id, up.program, up.phone
             FROM users u
             LEFT JOIN user_profiles up ON u.id = up.user_id
             WHERE u.id = :id AND u.deleted_at IS NULL'
        );
        $statement->execute([':id' => $id]);
        $row = $statement->fetch();
        if (!$row) {
            respond(['error' => 'User not found'], 404);
        }
        respond($row);
    }

    if ($user['role_id'] !== 'admin') {
        respond(['error' => 'Insufficient permissions'], 403);
    }

    $role = $_GET['role_id'] ?? null;
    $status = $_GET['status'] ?? null;
    $search = trim((string)($_GET['q'] ?? ''));

    $where = ['u.deleted_at IS NULL'];
    $params = [];

    if ($role !== null && !in_array($role, ['student', 'faculty', 'admin'], true)) {
        respond(['error' => 'Invalid role'], 400);
    }
    if ($status !== null && !in_array($status, ['pending', 'active', 'suspended', 'disabled'], true)) {
        respond(['error' => 'Invalid status'], 400);
    }
    if (strlen($search) > 100) {
        respond(['error' => 'Search query is too long'], 400);
    }

    if ($role) {
        $where[] = 'u.role_id = :role_id';
        $params[':role_id'] = $role;
    }
    if ($status) {
        $where[] = 'u.status = :status';
        $params[':status'] = $status;
    }
    if ($search !== '') {
        $where[] = '(u.email LIKE :q OR up.first_name LIKE :q OR up.last_name LIKE :q
                    OR up.student_number LIKE :q OR up.faculty_number LIKE :q)';
        $params[':q'] = '%' . $search . '%';
    }

    $whereClause = $where === [] ? '' : 'WHERE ' . implode(' AND ', $where);

    $statement = $pdo->prepare(
        "SELECT u.id, u.email, u.role_id, u.status, u.email_verified_at,
                u.faculty_approval_status, u.student_approval_status, u.last_login_at, u.created_at,
                up.first_name, up.last_name, up.student_number, up.faculty_number,
                up.department_id, up.program, up.phone
         FROM users u
         LEFT JOIN user_profiles up ON u.id = up.user_id
         {$whereClause}
         ORDER BY u.created_at DESC"
    );
    $statement->execute($params);
    respond($statement->fetchAll());
}

// PUT /users/index.php?id=xxx — admin update status, or user update own profile fields
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $id = $_GET['id'] ?? null;
    if (!$id) {
        respond(['error' => 'User ID is required'], 400);
    }

    $input = jsonInput();

    $statement = $pdo->prepare(
        'SELECT u.*, up.first_name, up.last_name, up.student_number, up.faculty_number,
                up.department_id, up.program, up.phone
         FROM users u
         LEFT JOIN user_profiles up ON u.id = up.user_id
         WHERE u.id = :id AND u.deleted_at IS NULL'
    );
    $statement->execute([':id' => $id]);
    $target = $statement->fetch();
    if (!$target) {
        respond(['error' => 'User not found'], 404);
    }

    $isAdmin = $user['role_id'] === 'admin';
    $isSelf = $user['id'] === $id;

    if (!$isAdmin && !$isSelf) {
        respond(['error' => 'Insufficient permissions'], 403);
    }

    // Student self-registrations are approved or rejected here. This is kept
    // separate from the generic status dropdown so a pending student account
    // cannot bypass the administrator decision.
    if (isset($input['student_approval_action'])) {
        if (!$isAdmin) {
            respond(['error' => 'Insufficient permissions'], 403);
        }
        if ($target['role_id'] !== 'student') {
            respond(['error' => 'Only student accounts use the approval workflow.'], 400);
        }

        $approvalAction = strtolower(trim((string)$input['student_approval_action']));
        if (!in_array($approvalAction, ['approve', 'reject'], true)) {
            respond(['error' => 'Invalid student approval action.'], 400);
        }
        if ($target['student_approval_status'] !== 'pending') {
            respond(['error' => 'This student account is no longer awaiting approval.'], 409);
        }

        $newStatus = $approvalAction === 'approve' ? 'active' : 'disabled';
        $newApprovalStatus = $approvalAction === 'approve' ? 'approved' : 'rejected';

        try {
            $pdo->beginTransaction();
            $statement = $pdo->prepare(
                "UPDATE users
                 SET status = :status, student_approval_status = :approval_status, updated_at = NOW()
                 WHERE id = :id
                   AND role_id = 'student'
                   AND student_approval_status = 'pending'
                   AND deleted_at IS NULL"
            );
            $statement->execute([
                ':status' => $newStatus,
                ':approval_status' => $newApprovalStatus,
                ':id' => $id,
            ]);
            if ($statement->rowCount() !== 1) {
                $pdo->rollBack();
                respond(['error' => 'This student account is no longer awaiting approval.'], 409);
            }
            createNotification(
                $id,
                'account',
                $approvalAction === 'approve' ? 'Student account approved' : 'Student registration not approved',
                $approvalAction === 'approve'
                    ? 'An administrator approved your student account. You can now sign in.'
                    : 'An administrator did not approve your student registration. Contact the system administrator for details.'
            );
            logAudit(
                $approvalAction === 'approve' ? 'approve_student' : 'reject_student',
                'user',
                $id,
                ['status' => $target['status'], 'student_approval_status' => $target['student_approval_status']],
                ['status' => $newStatus, 'student_approval_status' => $newApprovalStatus]
            );
            $pdo->commit();

            $notificationEmailSent = false;
            try {
                sendStudentApprovalDecision(
                    (string)$target['email'],
                    trim((string)$target['first_name'] . ' ' . (string)$target['last_name']),
                    $approvalAction === 'approve'
                );
                $notificationEmailSent = true;
            } catch (Throwable $notificationException) {
                error_log(sprintf(
                    'Student approval notification failed for user %s: %s',
                    $id,
                    $notificationException->getMessage()
                ));
            }
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            respondServerError($exception, 'Failed to update student approval.');
        }

        $statement = $pdo->prepare(
            'SELECT u.id, u.email, u.role_id, u.status, u.email_verified_at,
                    u.student_approval_status, u.last_login_at, u.created_at,
                    up.first_name, up.last_name, up.student_number, up.faculty_number,
                    up.department_id, up.program, up.phone
             FROM users u
             LEFT JOIN user_profiles up ON u.id = up.user_id
             WHERE u.id = :id'
        );
        $statement->execute([':id' => $id]);
        $result = $statement->fetch();
        $result['notification_email_sent'] = $notificationEmailSent;
        respond($result);
    }

    if (isset($input['role_id']) && $input['role_id'] !== $target['role_id']) {
        respond(['error' => 'Account roles are permanent and cannot be changed.', 'fields' => ['role_id' => 'Account roles are permanent.']], 400);
    }
    foreach (['student_number', 'faculty_number'] as $field) {
        if (array_key_exists($field, $input) && $input[$field] !== $target[$field]) {
            respond(['error' => 'Account IDs are permanent.', 'fields' => [$field => 'Account IDs are permanent.']], 400);
        }
    }

    try {
        $pdo->beginTransaction();

        $old = [
            'role_id' => $target['role_id'],
            'status' => $target['status'],
            'first_name' => $target['first_name'],
            'last_name' => $target['last_name'],
        ];

        if ($isAdmin) {
            $newStatus = $input['status'] ?? $target['status'];

            $allowedStatuses = ['pending', 'active', 'suspended', 'disabled'];

            if (!in_array($newStatus, $allowedStatuses, true)) {
                respond(['error' => 'Invalid status'], 400);
            }

            if ($isSelf && in_array($newStatus, ['pending', 'suspended', 'disabled'], true)) {
                respond(['error' => 'You cannot suspend, disable, or deactivate your own account'], 400);
            }

            // Pending/rejected students must use the explicit approval action.
            if ($target['role_id'] === 'student'
                && in_array($target['student_approval_status'], ['pending', 'rejected'], true)
            ) {
                respond(['error' => 'Use the student approval action for this account.'], 409);
            }

            $statement = $pdo->prepare(
                'UPDATE users SET status = :status, updated_at = NOW() WHERE id = :id'
            );
            $statement->execute([
                ':status' => $newStatus,
                ':id' => $id,
            ]);
        }

        // Profile fields: self or admin
        $profileFields = ['first_name', 'last_name', 'phone', 'program', 'department_id'];

        $updates = [];
        $profileParams = [':user_id' => $id];
        $profileLimits = [
            'first_name' => 100,
            'last_name' => 100,
            'phone' => 20,
            'program' => 255,
            'department_id' => 255,
            'student_number' => 100,
            'faculty_number' => 100,
        ];
        foreach ($profileFields as $field) {
            if (!array_key_exists($field, $input)) {
                continue;
            }

            if (!is_scalar($input[$field]) && $input[$field] !== null) {
                respond(['error' => ucfirst(str_replace('_', ' ', $field)) . ' must be text'], 400);
            }

            $value = trim((string)($input[$field] ?? ''));
            if (in_array($field, ['first_name', 'last_name'], true) && $value === '') {
                respond(['error' => ucfirst(str_replace('_', ' ', $field)) . ' is required'], 400);
            }
            if (strlen($value) > $profileLimits[$field]) {
                respond(['error' => ucfirst(str_replace('_', ' ', $field)) . ' is too long'], 400);
            }

            if ($field === 'department_id' && $value !== '') {
                $department = $pdo->prepare(
                    "SELECT id FROM departments WHERE id = :id AND status = 'active'"
                );
                $department->execute([':id' => $value]);
                if (!$department->fetchColumn()) {
                    respond(['error' => 'Select a valid department.'], 400);
                }
            }

            $updates[] = "{$field} = :{$field}";
            $profileParams[":{$field}"] = $value !== '' ? $value : null;
        }

        if ($updates !== []) {
            $sql = 'UPDATE user_profiles SET ' . implode(', ', $updates) . ', updated_at = NOW() WHERE user_id = :user_id';
            $statement = $pdo->prepare($sql);
            $statement->execute($profileParams);
        }

        logAudit('update', 'user', $id, $old, $input);
        $pdo->commit();

        $statement = $pdo->prepare(
            'SELECT u.id, u.email, u.role_id, u.status, u.email_verified_at,
                    u.faculty_approval_status, u.student_approval_status, u.last_login_at, u.created_at,
                    up.first_name, up.last_name, up.student_number, up.faculty_number,
                    up.department_id, up.program, up.phone
             FROM users u
             LEFT JOIN user_profiles up ON u.id = up.user_id
             WHERE u.id = :id'
        );
        $statement->execute([':id' => $id]);
        respond($statement->fetch());
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        respondServerError($exception, 'Failed to update user.');
    }
}

// POST /users/index.php — admin create faculty/student account
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($user['role_id'] !== 'admin') {
        respond(['error' => 'Insufficient permissions'], 403);
    }

    $input = jsonInput();

    $email = strtolower(trim((string)($input['email'] ?? '')));
    $password = (string)($input['password'] ?? '');
    $roleId = (string)($input['role_id'] ?? '');
    $firstName = trim((string)($input['first_name'] ?? ''));
    $lastName = trim((string)($input['last_name'] ?? ''));

    $fields = [];
    if ($firstName === '' || strlen($firstName) > 100) $fields['first_name'] = 'Enter a first name of up to 100 characters.';
    if ($lastName === '' || strlen($lastName) > 100) $fields['last_name'] = 'Enter a last name of up to 100 characters.';
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $fields['email'] = 'Enter a valid email address.';
    $passwordErrors = validatePassword($password);
    if ($passwordErrors) $fields['password'] = implode(' ', $passwordErrors);
    if ($fields) respond(['error' => 'Check the highlighted fields.', 'fields' => $fields], 400);
    if ($roleId !== 'faculty') {
        respond(['error' => 'Only faculty accounts can be created by administrators. Students must self-register.'], 403);
    }
    if (strlen($firstName) > 100 || strlen($lastName) > 100) {
        respond(['error' => 'First and last name must not exceed 100 characters'], 400);
    }

    $status = (string)($input['status'] ?? 'active');
    if (!in_array($status, ['pending', 'active'], true)) {
        respond(['error' => 'Invalid status'], 400);
    }

    foreach (['student_number' => 100, 'faculty_number' => 100, 'department_id' => 255, 'program' => 255, 'phone' => 20] as $field => $limit) {
        if (isset($input[$field]) && strlen((string)$input[$field]) > $limit) {
            respond(['error' => ucfirst(str_replace('_', ' ', $field)) . ' is too long'], 400);
        }
    }

    $statement = $pdo->prepare('SELECT id FROM users WHERE email = :email');
    $statement->execute([':email' => $email]);
    if ($statement->fetch()) {
        respond(['error' => 'Email already registered', 'fields' => ['email' => 'Email already registered']], 409);
    }

    try {
        $pdo->beginTransaction();

        $accountNumber = allocateAccountNumber($pdo, $roleId, $input[$roleId === 'faculty' ? 'faculty_number' : 'student_number'] ?? null);
        $userId = bin2hex(random_bytes(16));

        $statement = $pdo->prepare(
            'INSERT INTO users (id, email, password_hash, role_id, status, faculty_approval_status, must_change_password, email_verified_at)
             VALUES (:id, :email, :password_hash, :role_id, :status, :faculty_approval_status, 1, NOW())'
        );
        $statement->execute([
            ':id' => $userId,
            ':email' => $email,
            ':password_hash' => hashPassword($password),
            ':role_id' => $roleId,
            ':status' => $status,
            ':faculty_approval_status' => $roleId === 'faculty' ? 'approved' : 'not_required',
        ]);

        $statement = $pdo->prepare(
            'INSERT INTO user_profiles (user_id, first_name, last_name, student_number, faculty_number, department_id, program, phone)
             VALUES (:user_id, :first_name, :last_name, :student_number, :faculty_number, :department_id, :program, :phone)'
        );
        $statement->execute([
            ':user_id' => $userId,
            ':first_name' => $firstName,
            ':last_name' => $lastName,
            ':student_number' => $roleId === 'student' ? $accountNumber : null,
            ':faculty_number' => $roleId === 'faculty' ? $accountNumber : null,
            ':department_id' => $input['department_id'] ?? null,
            ':program' => $input['program'] ?? null,
            ':phone' => $input['phone'] ?? null,
        ]);

        logAudit('create', 'user', $userId, [], ['email' => $email, 'role_id' => $roleId]);
        $pdo->commit();

        respond([
            'message' => 'Account created',
            'user_id' => $userId,
        ], 201);
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ($exception instanceof PDOException && $exception->getCode() === '23000') {
            $existing = $pdo->prepare('SELECT id FROM users WHERE email = ?');
            $existing->execute([$email]);
            if ($existing->fetchColumn()) {
                respond(['error' => 'Email already registered', 'fields' => ['email' => 'Email already registered']], 409);
            }
        }
        respondServerError($exception, 'Failed to create user.');
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    if ($user['role_id'] !== 'admin') respond(['error' => 'Insufficient permissions'], 403);
    $id = (string)($_GET['id'] ?? '');
    if ($id === $user['id']) respond(['error' => 'You cannot delete your own account.'], 400);
    try {
        $pdo->beginTransaction();
        $target = $pdo->prepare('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE');
        $target->execute([$id]);
        if (!$target->fetchColumn()) respond(['error' => 'User not found'], 404);
        // Remove access and hide the account while preserving historical foreign keys.
        $pdo->prepare("UPDATE users SET status = 'disabled', deleted_at = NOW(), updated_at = NOW() WHERE id = ?")->execute([$id]);
        logAudit('delete', 'user', $id);
        $pdo->commit();
        respond(['message' => 'Account deleted.']);
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        respondServerError($exception, 'Unable to delete account.');
    }
}
respond(['error' => 'Method not allowed.'], 405);
