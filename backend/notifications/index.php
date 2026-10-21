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
