<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['error' => 'Method not allowed.'], 405);
}

// Log the logout before the session (and its user id) is destroyed.
if (isset($_SESSION['user_id'])) {
    logAudit('logout', 'user', $_SESSION['user_id']);
}

destroySession();

respond(['message' => 'Logged out successfully']);
