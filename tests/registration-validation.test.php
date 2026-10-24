<?php
declare(strict_types=1);

require __DIR__ . '/../backend/shared/validation.php';

// Validation only: no database connection, SMTP connection, or account mutations.
$pdo = new class {
    public function prepare(string $sql): object {
        return new class {
            public function execute(array $params): void {}
            public function fetch(): array { return ['id' => 'student']; }
        };
    }
};
$base = ['email' => 'student@gmail.com', 'password' => 'Example123!', 'first_name' => 'Jane', 'last_name' => 'Student', 'role_id' => 'student', 'student_number' => '001-2026'];
$checks = 0;
function check(bool $condition, string $message): void {
    global $checks;
    if (!$condition) throw new RuntimeException($message);
    $checks++;
}
check(validateRegistrationData($base) === [], 'Valid personal email registration must pass.');
foreach (['email', 'password', 'first_name', 'last_name', 'role_id'] as $field) {
    foreach (['', " \t\n", null, ['invalid'], 123, true] as $value) {
        $errors = validateRegistrationData(array_replace($base, [$field => $value]));
        check(isset($errors[$field]), "Invalid {$field} must produce a field error.");
    }
}
foreach (['student_number', 'department_id', 'program', 'phone'] as $field) {
    check(isset(validateRegistrationData(array_replace($base, [$field => ['invalid']]))[$field]), "Array {$field} must be rejected.");
}
foreach (['gmail.com', 'yahoo.com', 'outlook.com', 'university.edu'] as $domain) {
    check(validateRegistrationData(array_replace($base, ['email' => "student@{$domain}"])) === [], 'Valid email domains must remain accepted.');
}
check(isset(validateRegistrationData(array_replace($base, ['password' => 'weak']))['password']), 'Weak passwords must remain rejected.');
check(validateStudentNumber('001-2026'), 'Leading-zero student IDs must remain accepted.');
echo "Passed {$checks} registration validation checks.\n";
