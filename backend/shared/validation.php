<?php

declare(strict_types=1);

/** Allocate a numeric role ID while holding the role's counter row in a transaction. */
function allocateAccountNumber(PDO $pdo, string $role, ?string $requested = null): ?string
{
    if (!in_array($role, ['student', 'faculty'], true)) return null;
    $field = $role === 'student' ? 'student_number' : 'faculty_number';
    $prefix = $role === 'student' ? 'STU-' : 'FAC-';
    $requested = strtoupper(trim((string)$requested));
    if ($requested !== '' && !preg_match('/^' . $prefix . '\\d{4,}$/', $requested)) {
        respond(['error' => 'Invalid account ID', 'fields' => [$field => "Use {$prefix} followed by at least four digits."]], 400);
    }
    $pdo->prepare('INSERT IGNORE INTO account_id_sequences (role_id, next_number) VALUES (?, 0)')->execute([$role]);
    $counter = $pdo->prepare('SELECT next_number FROM account_id_sequences WHERE role_id = ? FOR UPDATE');
    $counter->execute([$role]);
    $number = (int)$counter->fetchColumn();
    $exists = $pdo->prepare("SELECT user_id FROM user_profiles WHERE {$field} = ?");
    if ($requested !== '') {
        $exists->execute([$requested]);
        if ($exists->fetchColumn()) respond(['error' => 'ID already registered', 'fields' => [$field => 'This ID is already registered.']], 409);

        // Keep later automatic IDs above any manually supplied ID. This avoids
        // reusing a lower number and keeps the sequence monotonic.
        $requestedNumber = (int)substr($requested, strlen($prefix));
        $pdo->prepare(
            'UPDATE account_id_sequences SET next_number = GREATEST(next_number, ?) WHERE role_id = ?'
        )->execute([$requestedNumber, $role]);

        return $requested;
    }
    do {
        $candidate = $prefix . str_pad((string)++$number, 4, '0', STR_PAD_LEFT);
        $exists->execute([$candidate]);
    } while ($exists->fetchColumn());
    $pdo->prepare('UPDATE account_id_sequences SET next_number = ? WHERE role_id = ?')->execute([$number, $role]);
    return $candidate;
}

/**
 * Move an account-ID sequence forward to the highest ID already stored. This
 * keeps automatic IDs monotonic after importing data or repairing legacy rows.
 */
function syncAccountIdSequence(PDO $pdo, string $role): void
{
    if (!in_array($role, ['student', 'faculty'], true)) return;

    $field = $role === 'student' ? 'student_number' : 'faculty_number';
    $prefix = $role === 'student' ? 'STU-' : 'FAC-';
    $statement = $pdo->query("SELECT {$field} FROM user_profiles WHERE {$field} IS NOT NULL");
    $highest = 0;
    foreach ($statement->fetchAll(PDO::FETCH_COLUMN) as $value) {
        $value = strtoupper(trim((string)$value));
        if (preg_match('/^' . $prefix . '(\d{4,})$/', $value, $matches)) {
            $highest = max($highest, (int)$matches[1]);
        }
    }

    $pdo->prepare(
        'INSERT INTO account_id_sequences (role_id, next_number) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE next_number = GREATEST(next_number, ?)'
    )->execute([$role, $highest, $highest]);
}

/**
 * Validate email format and institutional domain
 */
function validateEmail(string $email, bool $requireInstitutional = false): bool
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return false;
    }

    if ($requireInstitutional) {
        // Require an academic TLD segment (e.g. name@schedwise.edu, name@x.ac.uk,
        // name@student.college.edu) - customize as needed
        $institutionalPattern = '/@([a-z0-9-]+\.)+(edu|ac|sch|school|college|university)(\.[a-z]{2,})?$/i';
        return (bool) preg_match($institutionalPattern, $email);
    }

    return true;
}

/**
 * Validate password strength
 */
function validatePassword(string $password): array
{
    $errors = [];

    if (strlen($password) < 8) {
        $errors[] = 'Password must be at least 8 characters long';
    }

    if (!preg_match('/[A-Z]/', $password)) {
        $errors[] = 'Password must contain at least one uppercase letter';
    }

    if (!preg_match('/[a-z]/', $password)) {
        $errors[] = 'Password must contain at least one lowercase letter';
    }

    if (!preg_match('/[0-9]/', $password)) {
        $errors[] = 'Password must contain at least one digit';
    }

    if (!preg_match('/[\W_]/', $password)) {
        $errors[] = 'Password must contain at least one special character';
    }

    return $errors;
}

/**
 * Validate an optional HTTP(S) URL.
 */
function validateHttpUrl(string $url): bool
{
    if ($url === '') {
        return true;
    }

    if (filter_var($url, FILTER_VALIDATE_URL) === false) {
        return false;
    }

    $scheme = strtolower((string)parse_url($url, PHP_URL_SCHEME));
    return in_array($scheme, ['http', 'https'], true);
}

/**
 * Validate date string (YYYY-MM-DD)
 */
function validateDate(string $date): bool
{
    $dateObj = DateTime::createFromFormat('Y-m-d', $date);
    return $dateObj && $dateObj->format('Y-m-d') === $date;
}

/**
 * Validate time in minutes (0-1439)
 */
function validateTimeMinutes(int $minutes): bool
{
    return $minutes >= 0 && $minutes <= 1439;
}

/**
 * Validate that start time is before end time
 */
function validateTimeRange(int $startMinutes, int $endMinutes): bool
{
    return $startMinutes < $endMinutes;
}

/**
 * Sanitize input for display (prevent XSS)
 */
function sanitizeOutput(string $input): string
{
    return htmlspecialchars($input, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * Validate appointment data
 */
function validateAppointmentData(array $data, bool $isUpdate = false): array
{
    $errors = [];

    // Required fields for creation. Do not use empty(), which would treat a
    // legitimate value of 0 (midnight) as missing.
    if (!$isUpdate) {
        $required = ['student_id', 'faculty_id', 'appointment_date', 'start_minutes', 'end_minutes', 'topic', 'reason'];
        foreach ($required as $field) {
            if (!array_key_exists($field, $data)
                || $data[$field] === null
                || (is_string($data[$field]) && trim($data[$field]) === '')
            ) {
                $errors[$field] = ucfirst(str_replace('_', ' ', $field)) . ' is required';
            }
        }
    }

    // Validate date
    if (!empty($data['appointment_date']) && !validateDate((string)$data['appointment_date'])) {
        $errors['appointment_date'] = 'Invalid date format';
    } elseif (!empty($data['appointment_date']) && function_exists('dbNowDate')) {
        // Use the database clock so a PHP/MySQL timezone mismatch cannot make
        // the boundary day inconsistent between environments.
        if ((string)$data['appointment_date'] < dbNowDate()) {
            $errors['appointment_date'] = 'Appointment date cannot be in the past';
        }
    }

    // Validate times
    if (array_key_exists('start_minutes', $data) && $data['start_minutes'] !== '') {
        if (!is_numeric($data['start_minutes']) || !validateTimeMinutes((int)$data['start_minutes'])) {
            $errors['start_minutes'] = 'Start time must be between 0 and 1439 minutes';
        }
    }

    if (array_key_exists('end_minutes', $data) && $data['end_minutes'] !== '') {
        if (!is_numeric($data['end_minutes']) || !validateTimeMinutes((int)$data['end_minutes'])) {
            $errors['end_minutes'] = 'End time must be between 0 and 1439 minutes';
        }
    }

    // Validate time range
    if (isset($data['start_minutes'], $data['end_minutes'])
        && $data['start_minutes'] !== ''
        && $data['end_minutes'] !== ''
        && is_numeric($data['start_minutes'])
        && is_numeric($data['end_minutes'])
    ) {
        if (!validateTimeRange((int)$data['start_minutes'], (int)$data['end_minutes'])) {
            $errors['time'] = 'End time must be after start time';
        }
    }

    // Validate topic length
    if (!empty($data['topic']) && strlen((string)$data['topic']) > 255) {
        $errors['topic'] = 'Topic must not exceed 255 characters';
    }

    // Validate reason
    if (empty($data['reason'])) {
        $errors['reason'] = 'Reason is required';
    } elseif (strlen((string)$data['reason']) > 5000) {
        $errors['reason'] = 'Reason must not exceed 5000 characters';
    }

    // Optional free-text fields
    if (isset($data['location']) && strlen((string)$data['location']) > 255) {
        $errors['location'] = 'Location must not exceed 255 characters';
    }

    if (isset($data['meeting_link'])) {
        $meetingLink = (string)$data['meeting_link'];
        if (strlen($meetingLink) > 500) {
            $errors['meeting_link'] = 'Meeting link must not exceed 500 characters';
        } elseif (!validateHttpUrl($meetingLink)) {
            $errors['meeting_link'] = 'Meeting link must be a valid http or https URL';
        }
    }

    // Validate status
    if (!empty($data['status'])) {
        $allowedStatuses = ['pending', 'confirmed', 'rejected', 'reschedule_requested', 'cancelled', 'completed', 'no_show'];
        if (!in_array($data['status'], $allowedStatuses, true)) {
            $errors['status'] = 'Invalid status';
        }
    }

    return $errors;
}

/**
 * Validate user registration data
 */
function validateRegistrationData(array $data): array
{
    $errors = [];

    $required = ['email', 'password', 'first_name', 'last_name', 'role_id'];
    foreach ($required as $field) {
        if (empty($data[$field])) {
            $errors[$field] = ucfirst(str_replace('_', ' ', $field)) . ' is required';
        }
    }

    if (!empty($data['email'])) {
        if (!validateEmail($data['email'], true)) { // Require institutional email
            $errors['email'] = 'Please provide a valid institutional email address';
        }
    }

    if (!empty($data['password'])) {
        $passwordErrors = validatePassword($data['password']);
        if (!empty($passwordErrors)) {
            $errors['password'] = implode(' ', $passwordErrors);
        }
    }

    // Validate role
    if (!empty($data['role_id'])) {
        global $pdo;
        $statement = $pdo->prepare('SELECT id FROM roles WHERE id = :role_id');
        $statement->execute([':role_id' => $data['role_id']]);
        if (!$statement->fetch()) {
            $errors['role_id'] = 'Invalid role';
        }
    }

    return $errors;
}
