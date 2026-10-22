<?php

declare(strict_types=1);

/**
 * Build the role and admin-selected scope for report queries.
 *
 * Students and faculty are always scoped to their own records. Administrators
 * may optionally narrow reports by faculty and department. The returned
 * conditions use the `a` alias for the appointments table.
 *
 * @return array{0:string[],1:array<string,string>}
 */
function reportScopeFilters(PDO $pdo, array $user, array $query): array
{
    $where = [];
    $params = [];

    if ($user['role_id'] === 'student') {
        $where[] = 'a.student_id = :report_user_id';
        $params[':report_user_id'] = (string)$user['id'];
        return [$where, $params];
    }

    if ($user['role_id'] === 'faculty') {
        $where[] = 'a.faculty_id = :report_user_id';
        $params[':report_user_id'] = (string)$user['id'];
        return [$where, $params];
    }

    if ($user['role_id'] !== 'admin') {
        return [$where, $params];
    }

    $facultyId = trim((string)($query['faculty_id'] ?? ''));
    if ($facultyId !== '') {
        if (strlen($facultyId) > 64) {
            respond(['error' => 'Invalid faculty filter'], 400);
        }
        $statement = $pdo->prepare(
            "SELECT id FROM users WHERE id = :id AND role_id = 'faculty' AND deleted_at IS NULL"
        );
        $statement->execute([':id' => $facultyId]);
        if (!$statement->fetchColumn()) {
            respond(['error' => 'Select a valid faculty member.'], 400);
        }
        $where[] = 'a.faculty_id = :report_faculty_id';
        $params[':report_faculty_id'] = $facultyId;
    }

    $departmentId = trim((string)($query['department_id'] ?? ''));
    if ($departmentId !== '') {
        if (strlen($departmentId) > 64) {
            respond(['error' => 'Invalid department filter'], 400);
        }
        $statement = $pdo->prepare(
            "SELECT id FROM departments WHERE id = :id AND status = 'active'"
        );
        $statement->execute([':id' => $departmentId]);
        if (!$statement->fetchColumn()) {
            respond(['error' => 'Select a valid department.'], 400);
        }
        $where[] = 'EXISTS (
            SELECT 1 FROM user_profiles report_profile
            WHERE report_profile.user_id = a.faculty_id
              AND report_profile.department_id = :report_department_id
        )';
        $params[':report_department_id'] = $departmentId;
    }

    return [$where, $params];
}
