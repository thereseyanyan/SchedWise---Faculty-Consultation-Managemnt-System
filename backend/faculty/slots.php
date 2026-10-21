<?php
declare(strict_types=1);
require_once __DIR__ . '/../bootstrap.php';
if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond(['error' => 'Method not allowed.'], 405);
authenticateUser();
global $pdo;
$faculty = $pdo->query("SELECT id FROM users WHERE role_id = 'faculty' AND status = 'active'")->fetchAll();
$result = [];
// Use the database clock, matching appointment validation.
$now = $pdo->query('SELECT CURRENT_DATE() AS today, HOUR(CURRENT_TIME()) * 60 + MINUTE(CURRENT_TIME()) AS minutes')->fetch();
$busy = $pdo->prepare("SELECT appointment_date, start_minutes, end_minutes FROM appointments WHERE faculty_id = ? AND appointment_date >= ? AND status IN ('pending', 'confirmed', 'reschedule_requested')");
$recurring = $pdo->prepare('SELECT weekday, start_minutes, end_minutes, active FROM faculty_availability WHERE faculty_id = ? AND active = 1');
$overrides = $pdo->prepare('SELECT date, kind, start_minutes, end_minutes FROM schedule_overrides WHERE faculty_id = ? AND date >= ?');
foreach ($faculty as $member) {
    $recurring->execute([$member['id']]);
    $rules = $recurring->fetchAll();
    $overrides->execute([$member['id'], $now['today']]);
    $exceptions = $overrides->fetchAll();
    $busy->execute([$member['id'], $now['today']]);
    $bookings = $busy->fetchAll();
    for ($day = 0; $day < 14; $day++) {
        $date = (new DateTimeImmutable($now['today']))->modify("+{$day} days")->format('Y-m-d');
        for ($start = 0; $start + 30 <= 1439; $start += 30) {
            if ($day === 0 && $start <= (int)$now['minutes']) continue;
            $end = $start + 30;
            foreach ($bookings as $booking) {
                if ($date === $booking['appointment_date'] && $start < (int)$booking['end_minutes'] && $end > (int)$booking['start_minutes']) continue 2;
            }
            if (scheduleAllowsSlot($rules, $exceptions, $date, $start, $end)) {
                $result[] = ['faculty_id' => $member['id'], 'date' => $date, 'start_minutes' => $start];
            }
        }
    }
}
respond($result);
