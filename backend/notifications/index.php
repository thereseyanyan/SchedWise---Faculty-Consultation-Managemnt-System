<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$user = authenticateUser();
global $pdo;

// GET — list current user's notifications
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['page'])) {
        $page = filter_var($_GET['page'], FILTER_VALIDATE_INT);
        $perPage = filter_var($_GET['per_page'] ?? '25', FILTER_VALIDATE_INT);
        if ($page === false || $page === null || $page < 1 ||
            $perPage === false || $perPage === null || $perPage < 1 || $perPage > 100) {
            respond(['error' => 'Invalid notification pagination.'], 400);
        }

        $search = trim((string)($_GET['search'] ?? ''));
        $type = trim((string)($_GET['type'] ?? ''));
        $unreadOnly = ($_GET['read'] ?? 'all') === 'unread';
        $from = trim((string)($_GET['from'] ?? ''));
        $to = trim((string)($_GET['to'] ?? ''));
        $sort = ($_GET['sort'] ?? 'newest') === 'oldest' ? 'ASC' : 'DESC';

        foreach (['from' => $from, 'to' => $to] as $field => $date) {
            if ($date !== '' && (
                !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ||
                DateTimeImmutable::createFromFormat('!Y-m-d', $date) === false
            )) {
                respond(['error' => 'Invalid notification date filter.'], 400);
            }
        }
        if ($from !== '' && $to !== '' && $from > $to) {
            respond(['error' => 'Start date must be on or before end date.'], 400);
        }
        if (strlen($search) > 200 || strlen($type) > 50) {
            respond(['error' => 'Notification filter is too long.'], 400);
        }

        $whereConditions = ['user_id = :user_id'];
        $params = [':user_id' => $user['id']];
        if ($search !== '') {
            $whereConditions[] = '(title LIKE :search_title OR message LIKE :search_message)';
            $searchPattern = '%' . addcslashes($search, '\\_%') . '%';
            $params[':search_title'] = $searchPattern;
            $params[':search_message'] = $searchPattern;
        }
        if ($type !== '') {
            $whereConditions[] = 'type = :type';
            $params[':type'] = $type;
        }
        if ($unreadOnly) {
            $whereConditions[] = 'read_at IS NULL';
        }
        if ($from !== '') {
            $whereConditions[] = 'DATE(created_at) >= :date_from';
            $params[':date_from'] = $from;
        }
        if ($to !== '') {
            $whereConditions[] = 'DATE(created_at) <= :date_to';
            $params[':date_to'] = $to;
        }

        $whereClause = implode(' AND ', $whereConditions);
        $countStatement = $pdo->prepare(
            "SELECT COUNT(*) FROM notifications WHERE {$whereClause}"
        );
        $countStatement->execute($params);
        $matchingTotal = (int)$countStatement->fetchColumn();

        $summaryStatement = $pdo->prepare(
            'SELECT COUNT(*) AS total, SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) AS unread
             FROM notifications WHERE user_id = :user_id'
        );
        $summaryStatement->execute([':user_id' => $user['id']]);
        $summary = $summaryStatement->fetch();

        $typesStatement = $pdo->prepare(
            'SELECT DISTINCT type FROM notifications WHERE user_id = :user_id ORDER BY type'
        );
        $typesStatement->execute([':user_id' => $user['id']]);
        $types = array_column($typesStatement->fetchAll(), 'type');

        $offset = ($page - 1) * $perPage;
        $statement = $pdo->prepare(
            "SELECT * FROM notifications
             WHERE {$whereClause}
             ORDER BY created_at {$sort}, id {$sort}
             LIMIT {$perPage} OFFSET {$offset}"
        );
        $statement->execute($params);

        respond([
            'items' => $statement->fetchAll(),
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $matchingTotal,
                'total_pages' => max(1, (int)ceil($matchingTotal / $perPage)),
            ],
            'counts' => [
                'total' => (int)($summary['total'] ?? 0),
                'unread' => (int)($summary['unread'] ?? 0),
            ],
            'types' => $types,
        ]);
    }

    $unreadOnly = isset($_GET['unread']) && $_GET['unread'] === '1';

    $sql = 'SELECT * FROM notifications WHERE user_id = :user_id';
    if ($unreadOnly) {
        $sql .= ' AND read_at IS NULL';
    }
    $sql .= ' ORDER BY created_at DESC LIMIT 100';

    $statement = $pdo->prepare($sql);
    $statement->execute([':user_id' => $user['id']]);
    respond($statement->fetchAll());
}

// PUT — mark one or all as read
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $id = $_GET['id'] ?? null;
    $input = jsonInput();
    $markAll = !empty($input['mark_all']);

    if ($markAll) {
        $statement = $pdo->prepare(
            'UPDATE notifications SET read_at = NOW()
             WHERE user_id = :user_id AND read_at IS NULL'
        );
        $statement->execute([':user_id' => $user['id']]);
        respond(['message' => 'All notifications marked as read']);
    }

    if (!$id) {
        respond(['error' => 'Notification ID is required'], 400);
    }

    $statement = $pdo->prepare(
        'SELECT id FROM notifications WHERE id = :id AND user_id = :user_id'
    );
    $statement->execute([':id' => $id, ':user_id' => $user['id']]);
    if (!$statement->fetch()) {
        respond(['error' => 'Notification not found'], 404);
    }

    $statement = $pdo->prepare(
        'UPDATE notifications SET read_at = NOW() WHERE id = :id AND user_id = :user_id'
    );
    $statement->execute([':id' => $id, ':user_id' => $user['id']]);
    respond(['message' => 'Notification marked as read']);
}

respond(['error' => 'Method not allowed.'], 405);
