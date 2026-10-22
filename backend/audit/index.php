<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(['error' => 'Method not allowed.'], 405);
}

$user = authenticateUser();
authorizeRole($user, 'admin');
global $pdo;

function validAuditDate(string $value): bool
{
    if ($value === '') {
        return true;
    }
    $date = DateTimeImmutable::createFromFormat('Y-m-d', $value);
    return $date !== false && $date->format('Y-m-d') === $value;
}

function redactAuditValues(mixed $value): mixed
{
    if (!is_array($value)) {
        return $value;
    }

    $redacted = [];
    foreach ($value as $key => $item) {
        if (is_string($key) && preg_match('/(password|token|secret|hash|api[_-]?key|reset[_-]?code|verification[_-]?code)/i', $key)) {
            $redacted[$key] = '[redacted]';
            continue;
        }
        $redacted[$key] = redactAuditValues($item);
    }
    return $redacted;
}

$page = max(1, (int)($_GET['page'] ?? 1));
$perPage = (int)($_GET['per_page'] ?? 25);
$perPage = max(10, min(100, $perPage));
$search = trim((string)($_GET['q'] ?? ''));
$action = trim((string)($_GET['action'] ?? ''));
$entityType = trim((string)($_GET['entity_type'] ?? ''));
$actorId = trim((string)($_GET['actor_id'] ?? ''));
$dateFrom = trim((string)($_GET['date_from'] ?? ''));
$dateTo = trim((string)($_GET['date_to'] ?? ''));

if (strlen($search) > 100) {
    respond(['error' => 'Search query is too long'], 400);
}
if (strlen($action) > 100) {
    respond(['error' => 'Action filter is too long'], 400);
}
if (strlen($entityType) > 50) {
    respond(['error' => 'Entity filter is too long'], 400);
}
if (strlen($actorId) > 64) {
    respond(['error' => 'Actor filter is too long'], 400);
}
if (!validAuditDate($dateFrom) || !validAuditDate($dateTo)) {
    respond(['error' => 'Dates must use YYYY-MM-DD format'], 400);
}
if ($dateFrom !== '' && $dateTo !== '' && $dateFrom > $dateTo) {
    respond(['error' => 'The start date must be on or before the end date'], 400);
}

$where = [];
$params = [];

if ($search !== '') {
    $where[] = '(a.action LIKE :q OR a.entity_type LIKE :q OR a.entity_id LIKE :q
                 OR a.ip_address LIKE :q OR u.email LIKE :q
                 OR up.first_name LIKE :q OR up.last_name LIKE :q)';
    $params[':q'] = '%' . $search . '%';
}
if ($action !== '') {
    $where[] = 'a.action = :action';
    $params[':action'] = $action;
}
if ($entityType !== '') {
    $where[] = 'a.entity_type = :entity_type';
    $params[':entity_type'] = $entityType;
}
if ($actorId !== '') {
    $where[] = 'a.actor_user_id = :actor_id';
    $params[':actor_id'] = $actorId;
}
if ($dateFrom !== '') {
    $where[] = 'a.created_at >= :date_from';
    $params[':date_from'] = $dateFrom . ' 00:00:00';
}
if ($dateTo !== '') {
    $where[] = 'a.created_at < DATE_ADD(:date_to, INTERVAL 1 DAY)';
    $params[':date_to'] = $dateTo . ' 00:00:00';
}

$fromClause = 'FROM audit_logs a
               LEFT JOIN users u ON a.actor_user_id = u.id
               LEFT JOIN user_profiles up ON u.id = up.user_id';
$whereClause = $where === [] ? '' : 'WHERE ' . implode(' AND ', $where);

try {
    $countStatement = $pdo->prepare("SELECT COUNT(*) {$fromClause} {$whereClause}");
    $countStatement->execute($params);
    $total = (int)$countStatement->fetchColumn();
    $totalPages = max(1, (int)ceil($total / $perPage));
    $page = min($page, $totalPages);
    $offset = ($page - 1) * $perPage;

    $statement = $pdo->prepare(
        "SELECT a.id, a.actor_user_id, a.action, a.entity_type, a.entity_id,
                a.old_values, a.new_values, a.ip_address, a.created_at,
                u.email AS actor_email, up.first_name AS actor_first_name,
                up.last_name AS actor_last_name
         {$fromClause}
         {$whereClause}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT :limit OFFSET :offset"
    );
    $statement->bindValue(':limit', $perPage, PDO::PARAM_INT);
    $statement->bindValue(':offset', $offset, PDO::PARAM_INT);
    foreach ($params as $key => $value) {
        $statement->bindValue($key, $value);
    }
    $statement->execute();
    $entries = $statement->fetchAll();

    foreach ($entries as &$entry) {
        foreach (['old_values', 'new_values'] as $field) {
            if ($entry[$field] === null || $entry[$field] === '') {
                $entry[$field] = null;
                continue;
            }
            try {
                $entry[$field] = redactAuditValues(
                    json_decode((string)$entry[$field], true, 512, JSON_THROW_ON_ERROR)
                );
            } catch (Throwable) {
                $entry[$field] = null;
            }
        }

        $actorName = trim(
            (string)($entry['actor_first_name'] ?? '') . ' ' . (string)($entry['actor_last_name'] ?? '')
        );
        $entry['actor_name'] = $actorName !== ''
            ? $actorName
            : ($entry['actor_email'] ?? 'Anonymous');
    }
    unset($entry);

    $actions = $pdo->query('SELECT DISTINCT action FROM audit_logs ORDER BY action')->fetchAll(PDO::FETCH_COLUMN);
    $entityTypes = $pdo->query(
        'SELECT DISTINCT entity_type FROM audit_logs WHERE entity_type IS NOT NULL ORDER BY entity_type'
    )->fetchAll(PDO::FETCH_COLUMN);

    respond([
        'entries' => $entries,
        'pagination' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => $totalPages,
        ],
        'options' => [
            'actions' => $actions,
            'entity_types' => $entityTypes,
        ],
    ]);
} catch (Throwable $exception) {
    respondServerError($exception, 'Failed to load audit log.');
}
