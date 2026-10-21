<?php

declare(strict_types=1);

/**
 * Current date according to the database server.
 *
 * PHP and MySQL may be configured with different timezones (this project has
 * been run with PHP in Europe/Berlin and MySQL in Malay Peninsula time), so
 * date-based rules must use one clock consistently. The database is the source
 * of truth for appointment dates.
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
