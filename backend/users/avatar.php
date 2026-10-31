<?php
declare(strict_types=1);

$allowedOrigin = 'http://localhost:5173';

if (
    isset($_SERVER['HTTP_ORIGIN']) &&
    $_SERVER['HTTP_ORIGIN'] === $allowedOrigin
) {
    header("Access-Control-Allow-Origin: $allowedOrigin");
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}

header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token');

// Handle the browser's CORS preflight request before loading the API.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../bootstrap.php';

// Only allow POST requests for avatar uploads.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['error' => 'Method not allowed.'], 405);
}

$user = authenticateUser();

// Check whether an avatar file was uploaded.
if (
    !isset($_FILES['avatar']) ||
    !is_uploaded_file($_FILES['avatar']['tmp_name'])
) {
    respond(['error' => 'Choose a profile picture to upload.'], 400);
}

$file = $_FILES['avatar'];

// Check for upload errors.
if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    respond(['error' => 'The upload failed. Please try again.'], 400);
}

// Limit the image size to 3 MB.
if ((int) $file['size'] > 3 * 1024 * 1024) {
    respond(['error' => 'Profile pictures must be 3 MB or smaller.'], 413);
}

// Check the uploaded image type.
$info = @getimagesize($file['tmp_name']);
$mime = $info['mime'] ?? '';

$allowed = [
    'image/png' => 'png',
    'image/jpeg' => 'jpg',
    'image/webp' => 'webp',
];

if (!$info || !isset($allowed[$mime])) {
    respond(['error' => 'Use a PNG, JPG, or WEBP image.'], 415);
}

// Prepare the avatar upload directory.
$uploadDir = dirname(__DIR__) . '/uploads/avatars';

if (
    !is_dir($uploadDir) &&
    !mkdir($uploadDir, 0755, true) &&
    !is_dir($uploadDir)
) {
    respond(['error' => 'Could not prepare the profile picture folder.'], 500);
}

// Generate a unique filename.
$fileName = bin2hex(random_bytes(16)) . '.' . $allowed[$mime];
$destination = $uploadDir . '/' . $fileName;

// Save the uploaded image.
if (!move_uploaded_file($file['tmp_name'], $destination)) {
    respond(['error' => 'Could not save the profile picture.'], 500);
}

// Get the user's existing avatar path.
global $pdo;

$statement = $pdo->prepare(
    'SELECT avatar_path FROM user_profiles WHERE user_id = ?'
);

$statement->execute([$user['id']]);
$oldPath = $statement->fetchColumn();

// Save the new avatar path in the database.
$avatarPath = '/api/uploads/avatars/' . $fileName;

$update = $pdo->prepare(
    'UPDATE user_profiles
     SET avatar_path = ?, updated_at = NOW()
     WHERE user_id = ?'
);

$update->execute([$avatarPath, $user['id']]);

// Remove the previous avatar file, if it exists.
if (
    is_string($oldPath) &&
    str_starts_with($oldPath, '/api/uploads/avatars/')
) {
    $oldFile = dirname(__DIR__) . substr($oldPath, strlen('/api'));

    if (is_file($oldFile) && basename($oldFile) !== $fileName) {
        @unlink($oldFile);
    }
}

// Return the new avatar path.
respond(['avatar_path' => $avatarPath]);