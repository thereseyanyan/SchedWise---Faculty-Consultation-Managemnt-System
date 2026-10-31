import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const php = process.env.SCHEDWISE_PHP || (existsSync("C:/xampp/php/php.exe") ? "C:/xampp/php/php.exe" : "php");

// Execute the actual endpoint code with an injected audit failure and in-memory
// collaborators. No HTTP requests, database connections, or email are possible.
for (const endpoint of ["auth/register.php", "users/index.php"]) {
  test(`${endpoint}: audit failure rolls back the account change before email`, () => {
    const directory = mkdtempSync(path.join(tmpdir(), "schedwise-audit-"));
    try {
      const source = readFileSync(path.join(root, "backend", endpoint), "utf8")
        .replace(/^<\?php\s*/, "")
        .replace("declare(strict_types=1);", "")
        .replace("require_once __DIR__ . '/../bootstrap.php';", "");
      const harness = `<?php
      require ${JSON.stringify(path.join(root, "backend/shared/validation.php").replaceAll("\\", "/"))};
      $_SERVER['REQUEST_METHOD'] = ${endpoint.startsWith("auth/") ? "'POST'" : "'PUT'"};
      $_GET['id'] = 'test-student';
      $mailAttempts = 0;
      $pdo = new class {
        public bool $active = false;
        public bool $committed = false;
        public bool $rolledBack = false;
        public function beginTransaction() { $this->active = true; }
        public function commit() { $this->committed = true; $this->active = false; }
        public function rollBack() { $this->rolledBack = true; $this->active = false; }
        public function inTransaction() { return $this->active; }
        public function prepare($sql) { return new class($sql) {
          public function __construct(public string $sql) {}
          public function execute($params = []) {}
          public function rowCount() { return 1; }
          public function fetchColumn() { return false; }
          public function fetch() {
            if (str_contains($this->sql, 'FROM roles')) return ['id' => 'student'];
            if (str_contains($this->sql, 'SELECT u.*')) return ['id' => 'test-student', 'role_id' => 'student', 'student_approval_status' => 'pending', 'status' => 'pending', 'email' => 'test@example.invalid', 'first_name' => 'Test', 'last_name' => 'Student'];
            return false;
          }
        }; }
      };
      function clientIp() { return '127.0.0.1'; }
      function isRateLimited(...$args) { return false; }
      function recordRateLimitAttempt(...$args) {}
      function jsonInput() { return ['role_id' => 'student', 'email' => 'test@example.invalid', 'first_name' => 'Test', 'last_name' => 'Student', 'student_number' => '001-2026', 'password' => 'Example123!', 'student_approval_action' => 'approve']; }
      function authenticateUser() { return ['id' => 'admin', 'role_id' => 'admin']; }
      function hashPassword($password) { return 'test-hash'; }
      function createNotification(...$args) {}
      function logAudit(...$args) { throw new RuntimeException('Injected audit failure'); }
      function sendStudentRegistrationReceived(...$args) { global $mailAttempts; $mailAttempts++; }
      function sendStudentApprovalDecision(...$args) { global $mailAttempts; $mailAttempts++; }
      function respond($body, $status = 200) { global $pdo, $mailAttempts; echo json_encode(['status' => $status, 'committed' => $pdo->committed, 'rolled_back' => $pdo->rolledBack, 'mail_attempts' => $mailAttempts]); exit; }
      function respondServerError($exception, $message) { respond(['error' => $message], 500); }
      ${source}`;
      const script = path.join(directory, "endpoint.php");
      writeFileSync(script, harness);
      const result = spawnSync(php, [script], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { status: 500, committed: false, rolled_back: true, mail_attempts: 0 });
    } finally {
      assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()), "Temporary cleanup must stay inside the temp directory");
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
