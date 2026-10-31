<?php

declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;

// PHPMailer is vendored under backend/vendor/phpmailer to keep the local
// one-click setup dependency-free. Load it only when mail is actually sent.
spl_autoload_register(static function (string $class): void {
    $prefix = 'PHPMailer\\PHPMailer\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }

    $file = __DIR__ . '/../vendor/phpmailer/src/' . substr($class, strlen($prefix)) . '.php';
    if (is_file($file)) {
        require_once $file;
    }
});

/**
 * Send a transactional email using the configured SMTP transport.
 *
 * Local testing defaults to Mailpit. SCHEDWISE_MAIL_* overrides are optional.
 *
 * @throws RuntimeException when delivery fails.
 */
function sendSchedWiseMail(
    string $to,
    string $subject,
    string $htmlBody,
    string $textBody = ''
): void {
    global $config;

    $to = trim($to);
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Invalid email recipient.');
    }

    $mailConfig = is_array($config['mail'] ?? null) ? $config['mail'] : [];
    $host = (string)($mailConfig['host'] ?? '127.0.0.1');
    $port = (int)($mailConfig['port'] ?? 1025);
    $username = (string)($mailConfig['username'] ?? '');
    $password = (string)($mailConfig['password'] ?? '');
    $encryption = strtolower((string)($mailConfig['encryption'] ?? ''));
    $fromEmail = (string)($mailConfig['from_email'] ?? 'no-reply@schedwise.edu');
    $fromName = (string)($mailConfig['from_name'] ?? 'SchedWise');
    $timeout = max(3, (int)($mailConfig['timeout'] ?? 10));

    if ($host === '') {
        throw new RuntimeException('Mail transport is not configured.');
    }
    if (!filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Configure a valid SMTP sender email address.');
    }
    if (!in_array($encryption, ['tls', 'ssl'], true) && !in_array($host, ['127.0.0.1', 'localhost', '::1'], true)) {
        throw new RuntimeException('Remote SMTP requires tls or ssl encryption.');
    }

    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = $host;
    $mail->Port = $port;
    $mail->Timeout = $timeout;
    $mail->SMTPAuth = $username !== '';
    if ($mail->SMTPAuth) {
        $mail->Username = $username;
        $mail->Password = $password;
    }

    if ($encryption === 'tls' || $encryption === 'ssl') {
        $mail->SMTPSecure = $encryption === 'ssl'
            ? PHPMailer::ENCRYPTION_SMTPS
            : PHPMailer::ENCRYPTION_STARTTLS;
    } else {
        // Mailpit runs plain SMTP on the loopback interface. Do not try to
        // upgrade a local connection to TLS automatically.
        $mail->SMTPSecure = '';
        $mail->SMTPAutoTLS = false;
    }

    $mail->CharSet = PHPMailer::CHARSET_UTF8;
    $mail->setFrom($fromEmail, $fromName);
    $mail->addAddress($to);
    $mail->isHTML(true);
    $mail->Subject = $subject;
    $mail->Body = $htmlBody;
    $mail->AltBody = $textBody !== '' ? $textBody : strip_tags($htmlBody);

    try {
        $mail->send();
    } catch (Throwable $exception) {
        // Never include the message body or reset code in logs.
        throw new RuntimeException(
            'Email delivery failed: ' . $exception->getMessage(),
            0,
            $exception
        );
    }
}

/**
 * Email a password-reset code. The code is never logged.
 */
function sendPasswordResetCode(string $to, string $code): void
{
    $safeCode = htmlspecialchars($code, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

    $html = <<<HTML
<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <div style="max-width:560px;margin:32px auto;padding:0 20px;">
    <div style="background:#ffffff;border:1px solid #dbeafe;border-radius:16px;padding:32px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#2563eb;">SchedWise</p>
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">Reset your password</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">Use the code below to choose a new password. It expires in <strong>30 minutes</strong>.</p>
      <div style="margin:0 0 20px;padding:18px 20px;border-radius:12px;background:#eff6ff;text-align:center;">
        <span style="font-size:30px;font-weight:700;letter-spacing:.18em;color:#1d4ed8;">{$safeCode}</span>
      </div>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">If you did not request a password reset, you can ignore this email. Your password will not change.</p>
    </div>
    <p style="margin:16px 0 0;text-align:center;font-size:11px;color:#94a3b8;">Faculty Consultation and Appointment Management System</p>
  </div>
</body>
</html>
HTML;

    $text = "SchedWise password reset\n\n"
        . "Use this code to choose a new password: {$code}\n\n"
        . "The code expires in 30 minutes. If you did not request a reset, ignore this email.\n";

    sendSchedWiseMail($to, 'Your SchedWise password reset code', $html, $text);
}

/**
 * Email a single-use account-verification link. The raw token stays in the
 * URL and is never logged by the application.
 */
function sendEmailVerificationLink(string $to, string $url, string $role = 'student'): void
{
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        throw new RuntimeException('Verification URL is invalid.');
    }

    $scheme = strtolower((string)parse_url($url, PHP_URL_SCHEME));
    if (!in_array($scheme, ['http', 'https'], true)) {
        throw new RuntimeException('Verification URL must use HTTP or HTTPS.');
    }

    $safeUrl = htmlspecialchars($url, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $role = $role === 'faculty' ? 'faculty' : 'student';
    $accountLabel = $role === 'faculty' ? 'faculty' : 'student';
    $approvalNote = $role === 'faculty'
        ? ' After verification, an administrator must approve your student account before you can sign in.'
        : '';

    $html = <<<HTML
<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <div style="max-width:560px;margin:32px auto;padding:0 20px;">
    <div style="background:#ffffff;border:1px solid #dbeafe;border-radius:16px;padding:32px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#2563eb;">SchedWise</p>
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">Verify your email address</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">Confirm this email address to verify your {$accountLabel} account.{$approvalNote} The link expires in <strong>24 hours</strong> and can be used once.</p>
      <p style="margin:0 0 24px;text-align:center;">
        <a href="{$safeUrl}" style="display:inline-block;padding:13px 22px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Verify Email</a>
      </p>
      <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#64748b;">If the button does not work, copy this link into your browser:</p>
      <p style="margin:0 0 20px;font-size:12px;line-height:1.6;word-break:break-all;color:#2563eb;">{$safeUrl}</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">If you did not create a SchedWise account, you can ignore this email.</p>
    </div>
    <p style="margin:16px 0 0;text-align:center;font-size:11px;color:#94a3b8;">Faculty Consultation and Appointment Management System</p>
  </div>
</body>
</html>
HTML;

    $text = "SchedWise email verification\n\n"
        . "Verify your email address for your {$accountLabel} account.{$approvalNote}\n{$url}\n\n"
        . "The link expires in 24 hours and can be used once. If you did not create an account, ignore this email.\n";

    sendSchedWiseMail($to, 'Verify your SchedWise email address', $html, $text);
}

/**
 * Notify a self-registered faculty member that an administrator approved or
 * rejected the account. This email contains no tokens or credentials.
 */
function sendStudentRegistrationReceived(string $to, string $name, string $studentNumber): void
{
    $text = "Hello {$name},\n\nWe received your SchedWise registration. Your Student ID is {$studentNumber}. Your account is pending administrator approval. We will email you again when a decision is made.\n\nIf you did not register, contact the system administrator.";
    $html = '<h1>Registration received</h1><p>'
        . nl2br(htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')) . '</p>';
    sendSchedWiseMail($to, 'SchedWise registration received — awaiting approval', $html, $text);
}

function sendStudentApprovalDecision(string $to, string $name, bool $approved): void
{
    global $config;

    $name = trim($name);
    $safeName = htmlspecialchars($name !== '' ? $name : 'Student', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $frontendUrl = (string)($config['app']['frontend_url'] ?? 'http://localhost:5173');
    $safeUrl = htmlspecialchars(rtrim($frontendUrl, '/'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

    if ($approved) {
        $subject = 'Your SchedWise student account has been approved';
        $heading = 'Student account approved';
        $body = 'Welcome to SchedWise! Your student account is activated and ready for login. Sign in with your Student ID or registered email and password to book consultations.';
        $text = "SchedWise student account approved\n\nHello {$name},\n\nWelcome to SchedWise! Your student account is activated and ready for login. Use your Student ID or registered email and password:\n{$frontendUrl}\n";
    } else {
        $subject = 'Your SchedWise student registration was not approved';
        $heading = 'Student registration not approved';
        $body = 'An administrator reviewed your student registration and did not approve it. Contact the system administrator if you believe this is a mistake.';
        $text = "SchedWise student registration not approved\n\nHello {$name},\n\nAn administrator reviewed your student registration and did not approve it. Contact the system administrator if you believe this is a mistake.\n";
    }

    $html = <<<HTML
<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <div style="max-width:560px;margin:32px auto;padding:0 20px;">
    <div style="background:#ffffff;border:1px solid #dbeafe;border-radius:16px;padding:32px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#2563eb;">SchedWise</p>
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">{$heading}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">Hello {$safeName},</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">{$body}</p>
      <p style="margin:0 0 24px;text-align:center;">
        <a href="{$safeUrl}" style="display:inline-block;padding:13px 22px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Open SchedWise</a>
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">If you did not create a SchedWise account, you can ignore this email.</p>
    </div>
    <p style="margin:16px 0 0;text-align:center;font-size:11px;color:#94a3b8;">Faculty Consultation and Appointment Management System</p>
  </div>
</body>
</html>
HTML;

    sendSchedWiseMail($to, $subject, $html, $text);
}
