<?php

declare(strict_types=1);

/**
 * Current date according to the database server.
 *
 * PHP and MySQL must use the same timezone for date-based rules. The database
 * remains the source of truth for appointment dates and times, and bootstrap
 * aligns PHP's default timezone with the configured application timezone.
 */
function dbNowDate(): string
{
    global $pdo;
    return (string)$pdo->query('SELECT CURDATE()')->fetchColumn();
}

/**
 * Current time in minutes from midnight according to the database server.
 */
function dbNowMinutes(): int
{
    global $pdo;
    return (int)$pdo->query('SELECT FLOOR(TIME_TO_SEC(CURTIME()) / 60)')->fetchColumn();
}

/**
 * Current year and month according to the database server.
 *
 * @return array{0:int,1:int}
 */
function dbCurrentYearMonth(): array
{
    global $pdo;
    $row = $pdo->query('SELECT YEAR(CURDATE()) AS year, MONTH(CURDATE()) AS month')->fetch();
    return [(int)$row['year'], (int)$row['month']];
}
