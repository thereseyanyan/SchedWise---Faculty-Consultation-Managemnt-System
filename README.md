# SchedWise — Faculty Consultation and Appointment Management System

> **Current email setup:** Outgoing messages use the SMTP sender configured in ignored `backend/config.php` or `SCHEDWISE_MAIL_*` variables. The launcher no longer starts Mailpit automatically. Local configuration currently uses Gmail SMTP; keep sender credentials private.


The document reserves a stable vertical scrollbar gutter so centered headers, dashboard cards, and content do not shift horizontally between short and long pages. Older browsers use an always-reserved vertical scrollbar as a fallback.

SchedWise is a local-first academic consultation platform for students, faculty, and administrators. It centralizes faculty availability, appointment requests, consultation records, notifications, and reports in one React + PHP + MySQL application.

> **Project mode:** local development/demo. The app is intentionally not deployed, but it is built with production-grade authorization, session handling, CSRF protection, validation, and error handling. Keep the same standard when extending it.

---

## Current registration and account workflow (2026-10-24)

This section supersedes the earlier email-only login, generated Student IDs, institutional email restrictions, and public faculty registration descriptions below.

### Added requirements: User Registration & Admin Workflow

The revised requirements are implemented as follows:

| Area | Updated requirement |
| --- | --- |
| Public student registration | Students register themselves using their Student ID, personal email, and password through the Student Registration form. |
| Student account creation by admins | Removed. Admins review student applications instead of manually registering students. |
| Student approval | New applications remain **Pending** until an admin selects **Approve** or **Reject** from User Management on the admin dashboard. |
| Student authentication | Students log in using their **Student ID or registered email and password**. |
| Public faculty registration | Removed and blocked by the backend. |
| Faculty account creation | Only an admin can create faculty accounts and provide an initial password. |
| First faculty login | Faculty must change the initial password before accessing the system. |

The database adjustments, backend API behavior, and frontend workflow details are documented below.

- **Students:** choose Student on the welcome page and submit Student Registration. Students supply their own permanent unique Student ID and personal email (Gmail, Yahoo, Outlook, or another valid domain). IDs accept 1–100 letters, digits, dots, underscores, or hyphens, are normalized to uppercase, and preserve leading zeroes. Existing `STU-` IDs remain valid. Applications have `status = pending` and `student_approval_status = pending`. Students sign in with **Student ID or registered email and password**, after administrator approval; email is also used for contact and password recovery. Email verification is not an additional approval prerequisite.
- **Administrators:** User Management lists pending student applications with **Approve** and **Reject** actions. Approval sets `status = active` and approval status `approved`; rejection sets `status = disabled` and approval status `rejected`. Decisions are audited and send email/in-app notifications. Generic status updates cannot activate pending or rejected applications. Administrators cannot create student accounts.
- **Faculty:** public registration is blocked in the UI and API. Administrators use **Create Faculty Account** to supply the faculty member's email and initial password. Faculty sign in with that email and password. The first session shows a required password-change form; refreshing keeps that form visible. Only self-session inspection, password change, and logout are permitted until the password changes. The new password must satisfy the password policy and differ from the initial password.

### Personal email validation and automated approval notifications

- Immediately after a successful student signup, the system emails the student's own registered address to confirm receipt and explain that administrator approval is pending. This is a registration acknowledgement, not an email-verification link. The account remains pending. The API returns `email_sent`; the signup screen reports delivery failures without losing the saved application.
- Registration uses general email syntax validation in the frontend and PHP `FILTER_VALIDATE_EMAIL` in the backend. There is no custom or institutional domain allowlist. Gmail, Yahoo, Outlook, and institutional addresses are accepted; malformed addresses are rejected.
- Approving a student activates the account and automatically sends a welcome email stating that the account is activated and ready for login. Rejection emails are also sent. Email delivery uses the existing PHPMailer SMTP integration in `backend/shared/mailer.php`, called from the administrator approval endpoint.
- The in-app notification is saved in the same transaction as the decision. SMTP delivery runs after commit; a delivery failure does not undo account activation. The response includes `notification_email_sent`, and the admin panel warns when email sending fails. Repeated approval requests return 409 to prevent duplicate decisions/emails.
- **Local delivery:** Mailpit captures outgoing messages at `http://localhost:8025`; personal email addresses are accepted, but messages are not delivered to external Gmail/Yahoo/Outlook inboxes while using Mailpit.
- **External delivery:** configure `SCHEDWISE_MAIL_HOST`, `SCHEDWISE_MAIL_PORT`, `SCHEDWISE_MAIL_USERNAME`, `SCHEDWISE_MAIL_PASSWORD`, `SCHEDWISE_MAIL_ENCRYPTION` (`tls`/`ssl`), and an authorized `SCHEDWISE_MAIL_FROM` sender. Set `SCHEDWISE_FRONTEND_URL` to the address recipients can open, then restart the backend. Keep credentials in environment variables or ignored local configuration.

### Database and migration

Fresh installs use `database.sql`. Existing installs run `C:\xampp\php\php.exe tools\setup-database.php` (also run by the launcher). The migration is repeatable and preserves existing accounts, passwords, and consultation history.

| Field on `users` | Type/default | Purpose |
| --- | --- | --- |
| `student_approval_status` | `ENUM('not_required','pending','approved','rejected')`, default `not_required` | New student applications start pending. Existing pending students need approval; existing active students retain access. |
| `must_change_password` | `TINYINT(1)`, default `0` | Admin-created faculty are inserted with `1`; only successful authenticated password change clears it. Existing accounts are preserved. |

No additional database columns are needed for personal emails or supplied Student IDs: `users.email` and `user_profiles.student_number` already have unique indexes. The existing unique `user_profiles.student_number` index enforces Student ID uniqueness. The setup migration preserves valid supplied IDs, including leading zeroes, across restarts. The legacy `faculty_approval_status` column remains for compatibility with existing data; no new public faculty registrations are accepted. Previously pending/rejected faculty remain blocked and require administrator attention.

Validation: PHP syntax checks, TypeScript checking, production build, 17/17 API regressions, 4/4 client CSRF tests, and the Playwright browser smoke test pass. The browser suite covers student application/approval, admin faculty creation, forced password change across reloads, and existing booking/report flows. The launcher readiness check now matches the current SchedWise page title.

### API contract

- **Bug fixes (2026-10-24):** direct API/browser test runs now check the local SMTP fixture before any requests or cleanup and refuse real Gmail SMTP. Registration rejects whitespace-only names and non-text JSON fields with field errors. Registration, approval/rejection, and admin account mutations now write their audit entries before committing, so audit failures roll back the account changes rather than reporting an error after saving them. Email sending remains after commit.
- **Offline regression checks (safe with real SMTP configured):** run `C:\xampp\php\php.exe tests\registration-validation.test.php` and `node --test tests/audit-transaction.test.mjs tests/csrf-client.test.mjs`. These check input validation, injected audit failures, rollback/no-email behavior, and client CSRF handling without database or SMTP connections. Full API/browser tests intentionally refuse the current real SMTP configuration; run them only with an isolated local mail fixture.

- `POST /auth/register.php`: requires `student_number`, a standard email address, password, first/last names, and `role_id: "student"`; duplicate Student IDs or emails return 409 with field errors; returns `student_number`, `approval_required: true`, and `verification_required: false`.
- `POST /auth/login.php`: accepts `{ identifier, password }`; students provide their Student ID or registered email; faculty/admin provide email. The legacy `email` input key remains accepted as an identifier key, including registered student email.
- `PUT /users/index.php?id=...`: admin decisions use `{ student_approval_action: "approve" | "reject" }`; repeat/stale decisions return 409.
- `POST /users/index.php`: admin-only faculty creation, always sets `must_change_password = 1`.
- `GET /auth/me.php` and login responses include `must_change_password`; `POST /auth/change-password.php` validates the current/new passwords, clears the flag, and rotates CSRF. Other protected APIs reject restricted sessions with `password_change_required`.

## Change Summary (2026-10-24)

- Redesigned **Login** and **Sign Up** as popup modals over the Welcome page with backdrop `rgba(45,27,105,0.30)` (#2D1B69 at 30%), soft blur on Welcome page behind modal (no Welcome opacity reduction), Esc/backdrop/Back close, focus trap, portal. Split into small components (AuthModal, LoginForm, SignUpForm, IllustrationPanel, RoleCard). Connected to existing API (login, register, forgot/reset) with validation, loading states, verification/approval messages, and email autofill opt-out preserved. Privacy notice kept on registration.
- Redesigned **Welcome page** to match "Student Selected" style: light lavender container with purple border, four corner decorative circles clipped, taller equal-height centered role cards with centered icons/tile/slot, check badge on selected card, action buttons below cards.
- Introduced centralized design tokens in `frontend/src/index.css` (@theme) with colors, fonts (Inter + Baloo 2 loaded locally via @fontsource), radius, shadows, and preserved root scrollbar-gutter. Added `frontend/src/shared/BrandLogo.tsx` (text wordmark only, `showMark?: boolean` default false) for one-file future logo enablement; applied BrandLogo across auth and portal headers. Updated page title to "SchedWise".
- Updated browser smoke test to route from welcome page; added/adjusted navigation expectations. TypeScript and production build verified.

## Change Summary (2026-10-22)

- Rebranded the system as **SchedWise** across the interface, email templates, API messages, launcher, scripts, documentation, demo accounts, local database name, and `SCHEDWISE_*` configuration variables. The local database was migrated from `fcams` to `schedwise`; a pre-migration backup is retained, and the working database was reset to the documented clean demo baseline after stale manual data was detected.
- Split the former 5,600-line `frontend/src/App.tsx` into a small root shell plus shared modules (`src/shared/`) and role/feature components (`src/features/auth`, `student`, `faculty`, `admin`, `appointments`, `account`, `legal`). Behavior and API contracts are unchanged.
- Added report filters for month, department, and faculty across the analytics summary, six-month chart, and CSV export. Admin-selected filters are validated server-side and stay within the role-scoped report query.
- Added a **no-show** appointment action for faculty/admin after the consultation window ends. The server records the transition, writes an audit entry, and sends the student an in-app notification. Final states hide reschedule/cancel actions, and reschedule requests now use an enabled approval control with explicit text.
- Clarified reschedule-request handling in the faculty appointment panel: the requested date/time and the student's note are shown together, approval is labelled as confirming the new time, and scheduling failures stay inside the reschedule form with retry and choose-another-time actions. Student booking conflicts now offer a refresh-availability retry instead of only a text error.
- Normalized timezone display: `app.timezone`/`SCHEDWISE_TIMEZONE` now sets PHP's default timezone to `Asia/Kuala_Lumpur` by default, matching the local MySQL clock. Database rules still use `backend/shared/clock.php`.
- Added student self-service cancel and reschedule actions from the new **My Appointments** view. Both actions require a written reason and confirmation; reschedule conflicts keep the dialog open with a **Refresh available times** retry. Student history now shows only past/finished appointments.
- Added an in-app notification inbox to every portal header with unread counts, individual and bulk mark-read actions, focus refresh, and a 60-second poll. This exposes the notifications the API already generated for bookings, decisions, cancellations, no-shows, and account approval.
- Fixed the student consultation history to read actual consultation records (shared summary, action items, follow-up date) instead of an appointment `summary` field the appointment API never returned. Appointment list responses now include only the shared consultation summary; private notes remain faculty/admin-only.
- Faculty declines and cancellations now require a written reason instead of the hard-coded `"No reason provided"` / `"Cancelled by faculty"` text, with inline validation, visible server errors, and confirmation before the final action.
- Expanded the committed Playwright browser smoke test to cover privacy placement, dashboard card navigation, faculty self-registration with Mailpit verification and admin approval, the notification inbox and mark-all-read, the purple theme, inline login validation, sign-out cancellation, student appointment filtering, student cancel/reschedule, consultation feedback, report department/faculty filters, and the filtered CSV export link.
- Applied a purple theme throughout the interface.
- Made student, faculty, and administrator dashboard summary cards clickable, opening the corresponding lists or analytics.
- Reserved scrollbar space to prevent horizontal layout shifts between short and long pages.
- Restricted login to email and password; STU/FAC IDs remain account identifiers.
- Added fixed `STU-` and `FAC-` prefixes with digits-only input, preserved leading zeroes, automatic unique ID generation for every student/faculty registration, and duplicate prevention. Sequences advance past manually supplied IDs and resync to the highest existing ID. Assigned IDs remain permanent.
- Added faculty self-registration with email verification and explicit administrator approval/rejection; faculty cannot sign in until approved. Decisions send email and in-app notifications.
- Surfaced pending faculty approvals on the Admin Dashboard with an amber Faculty card and a User Management nav badge; removed the hard-coded demo credentials from the login screen.
- Made the admin Master User List search filter as you type after a short debounce, with stale-response protection.
- Added an admin-only **Audit Log** view with server-side pagination, search, action/entity/date filters, and a read-only event timeline. Sensitive values are rendered as summarized changes.
- Added search, status/date filters, result counts, and client-side pagination to the appointment lists used by administrators and students.
- Added guided empty states across appointment, user, report, consultation-history, and audit views, plus a first-run setup panel on the Admin Dashboard when only the administrator account exists.
- Added a committed Playwright browser smoke test that covers admin login, user search-as-you-type, appointment filters, report filters, the Audit Log view, sign-out, and student/faculty role routing. `tools/run-tests.ps1` now runs the API suite followed by the browser smoke test when frontend dependencies are installed.
- Made account roles permanent, including for administrators.
- Added account deletion that removes access while retaining appointment and audit history.
- Placed validation errors below the relevant form fields and kept dialog errors visible inside their forms.
- Allowed requests to different faculty while limiting each student to one pending request per faculty. Pending, reschedule-requested, and confirmed appointment times cannot overlap on the same date.
- Limited booking choices to actual faculty availability, accounting for blocked schedules and existing bookings.
- Included future pending requests in faculty request handling and updated appointment counts after approval or rejection.
- Moved the privacy notice from dashboards to registration and Account Settings > Privacy.
- Added Yes/No confirmations before sign-out, deletions, schedule changes, appointment actions, and other important account changes.
- Standardized system-authored interface text in English.
- Kept local Mailpit testing and automatic startup while hiding inbox links and on-screen debug tokens.
- Updated setup documentation and regression coverage for account IDs, roles, booking rules, deletion, and email testing.

Validation recorded for these changes includes TypeScript checking, production builds, PHP syntax checks, 16/16 API regressions, 4/4 client CSRF tests, and the committed Playwright browser smoke test. The browser test runs against headless Brave/Chrome/Edge and covers privacy placement, purple-theme styling, dashboard card navigation, faculty registration/email verification/admin approval, notification inbox and mark-all-read, inline validation, sign-out cancel/accept, admin user search, appointment filtering, student cancel/reschedule, consultation feedback, report filters and export, the Audit Log view, and seeded role routing. The SchedWise rebrand and frontend module split were verified with the same suite. Multi-worker concurrency coverage remains pending. The high-priority TODO list reflects the remaining maintainability and polish work.

## 0. Documentation Contract

**Every code, API, database, configuration, or tooling change must update this README in the same change.**

At minimum, update:

- the affected feature/API/schema sections
- the high-priority TODO list
- the "Last verified" date and test results
- any setup or launcher changes

This README is the main handoff document for the next developer or AI agent. It should describe the system as it actually exists, not an older prototype.

---

## 1. What the System Is

### Problem

Students often arrange consultations through informal messages, paper records, or separate chat threads. That causes double bookings, missed appointments, unclear status, lost consultation notes, and manual reporting.

### Solution

SchedWise provides:

- authenticated student, faculty, and administrator accounts
- recurring faculty availability and date-specific schedule overrides
- appointment request → approval/rejection → reschedule → completion flow
- student-visible consultation summaries and private faculty notes
- in-app notifications
- role-scoped dashboards, reports, and CSV export
- a one-click local launcher for Windows

### Users

| Role | Main capabilities |
| --- | --- |
| Student | Register, browse faculty, book appointments, cancel or request a new time, review consultation feedback, and read notifications |
| Faculty | Manage recurring availability and overrides, approve/reject with a reason, reschedule/complete appointments, write consultation records, and read notifications |
| Administrator | Manage accounts and statuses, review faculty approvals and the audit log, view all appointment lists and reports, export CSV, and mark ended appointments as no-show |

---

## 2. Current Status

### Implemented

- React 19 + TypeScript frontend with role-based views
- PHP 8 API using PDO prepared statements
- MySQL schema with `users`, profiles, departments, availability, overrides, appointments, consultations, notifications, audit logs, password resets, email verifications, and rate limits
- Session authentication with secure cookie settings and idle/absolute timeouts
- CSRF token enforcement on state-changing requests
- Login, registration, email-verification/resend, forgot-password, and reset-password throttling
- Password reset codes hashed, expiring, single-use, and all outstanding codes invalidated after reset
- Student self-registration accepts supplied IDs and personal email; admin approval activates accounts and sends a welcome email. Faculty accounts are created by admins and require an initial password change.
- Pending faculty approvals are counted on the Admin Dashboard Faculty card and shown as an amber badge on User Management; the login screen no longer prints demo credentials
- The admin Master User List filters as you type after a 250 ms debounce; pressing Enter is not required, and stale responses cannot overwrite newer results
- The admin-only **Audit Log** view reads `audit_logs` through a paginated endpoint with search, action, entity type, actor, and date filters; old/new values are summarized and no audit row is editable
- Appointment lists accept search text, status and date-range filters, show the visible/total count, and paginate in 8-row pages for both administrator and student views
- System Analytics accepts month, department, and faculty filters. The summary, six-month chart, and CSV export use the same validated filter scope; administrators can also clear filters in one action
- Confirmed appointments can be marked `no_show` by faculty or an administrator after the consultation end time; the server checks the database clock, writes an audit entry, and notifies the student. Final states hide reschedule/cancel actions. Reschedule-requested appointments show an enabled approval control and explicit request text. The action is available from the faculty calendar panel and from admin/faculty appointment lists once the consultation has ended.
- Students can cancel or request a new time for their own pending/confirmed/reschedule-requested appointments from **My Appointments**. The dialog requires a reason, confirms destructive actions, refreshes availability after a conflict, and updates the appointment cache and dashboard counts. **My History** is limited to past/finished appointments.
- Every portal header has a notification inbox with an unread badge, per-notification and bulk mark-read, focus refresh, and a 60-second poll. It reads the existing `/notifications/index.php` API for the signed-in user.
- Student feedback reads `consultation_records` through the role-scoped consultation API so summaries, action items, and follow-up dates are real. Appointment list responses carry only the shared `summary`; `private_notes` is never included. A saved consultation is frozen in the calendar panel to prevent duplicate creation; the complete record remains available in **Consultation Records**.
- Guided empty states explain the next action for empty appointment lists, filtered user searches, reports without completed consultations, consultation history, faculty request queues, and the audit log. A first-run panel appears on the Admin Dashboard when only the administrator account exists
- Registration opts out of browser autofill on the email field to avoid a Brave 1.97 browser-process crash when its email suggestion dropdown opens; custom validation and the mobile email keyboard remain available
- Server-side role and ownership authorization on every protected resource
- Appointment conflict detection, availability checks, past-date rejection, and state-transition guards
- Consultation private notes hidden from students
- CSV formula-injection escaping
- Security headers, generic 500 responses, and `no-store` API responses
- One-click Windows launcher and stop shortcut
- Launcher preflight checks for PHP 8+, Node.js 20.19+/22.12+, npm, and MySQL; missing prerequisites get a clear dialog with the requirement and an optional download page
- Verification and password-reset delivery through local Mailpit using vendored PHPMailer; the launcher starts Mailpit automatically, and optional `SCHEDWISE_MAIL_*` settings can target a real SMTP provider
- Account settings dialog for profile editing and signed-in password changes
- Repeatable API regression suite covering auth, CSRF, roles, verified student/faculty registration, faculty approval/rejection, resend/verification, reset email, booking and bookable slots, profile, password changes, permanent/unique IDs, account deletion, consultation privacy, report filters, no-show guards, appointment transitions, reschedule conflicts, and admin-only audit pagination/filtering
- Committed Playwright browser smoke test covering privacy placement, purple-theme styling, dashboard card navigation, faculty self-registration with Mailpit verification and admin approval, notification inbox and mark-all-read, inline login validation, admin login/search, appointment filters, student cancel/reschedule, student consultation feedback, report department/faculty filters and export, the Audit Log view, sign-out cancel/accept, and student/faculty role routing; it uses installed Brave/Chrome/Edge through `playwright-core` and skips cleanly when no supported browser is available
- PHP's default timezone follows `app.timezone`/`SCHEDWISE_TIMEZONE` (default `Asia/Kuala_Lumpur`) so formatted dates match the local MySQL clock; business rules still use `backend/shared/clock.php`
- Filtered appointment, audit, and report counts use polite live regions so screen readers announce result changes
- Explicit demo reset command and timestamped SQL backup/restore commands
- Clean demo seed: 3 accounts, 4 departments, 10 availability rows, no seeded appointments/notifications

### High-Priority TODO

#### P0 — do next

- [ ] None for the local demo. The former dependency-preflight gap is covered by the launcher; see Implemented. Production blockers are tracked in **Production Backend Backlog** below.

#### TODO
- [x] Implement student self-registration/admin decisions, Student ID or email login, admin-only faculty creation, and enforced initial password change.
- [x] Accept personal email domains and supplied Student IDs, send activation emails automatically on approval, and preserve IDs across schema setup.
- [ ] Add the final logo SVG and enable BrandLogo showMark.

### Pending backend work (UI already in place)

These placeholders are intentionally non-functional so nobody assumes they work.

- [ ] **Accepting requests toggle:** add a column (for example `faculty_accepting_requests TINYINT(1) DEFAULT 1` on the faculty profile/user), faculty-only update endpoint with CSRF, ownership check and audit entry; enforce it in `POST /appointments/index.php` (reject with a clear 409/422 message when off) and hide the faculty's slots in `GET /faculty/slots.php`; add it to `database.sql` and the idempotent `tools/setup-database.php` migration; API regression tests; then enable the sidebar toggle (currently disabled placeholder).
- [ ] **Faculty classes:** add a `faculty_classes` table (id, faculty_id, course_code, title, room, weekday, start/end minutes, term start/end dates, timestamps), faculty-owned CRUD endpoint with CSRF/ownership/audit, decide whether classes block bookable slots (recommended: yes, same half-open interval rule), migration and tests; then render class bars in Today's schedule, class dots in the calendar, the Today's Classes number/helper, and the greeting subtitle count.
- [ ] **Open time today:** currently computed in the frontend from availability, overrides and appointments (sidebar only); consider a server-side endpoint if it must match booking rules exactly or include classes.

#### P1 — next quality pass

- [x] Expand the committed browser smoke test to privacy placement, dashboard card navigation, student approvals and faculty initial password changes, and the purple theme. The current test covers inline validation, sign-out cancel/accept, admin login/search, appointment filters, report filters/export, the Audit Log view, and seeded role routing.
- [x] Split `frontend/src/App.tsx` into feature components. The root shell now handles session bootstrapping and role routing; shared UI/API helpers and role features live under `frontend/src/shared/` and `frontend/src/features/`.
- [x] Expand automated coverage to remaining appointment state transitions and reschedule conflict/error states. Report filters, no-show guards, and student reschedule-request approval are covered.
- [x] Add clearer reschedule-request UI text and dedicated retry/error states for scheduling conflicts.
- [x] Add student-facing cancel/reschedule controls instead of leaving those API actions unreachable from the UI.
- [x] Surface in-app notifications with an inbox, unread count, and mark-read controls for every role.
- [x] Load real consultation summaries/action items in student history and freeze saved consultation forms to prevent duplicate records.
- [x] Require written faculty decline/cancel reasons and show inline validation/server errors.

#### P2 — polish

- [ ] Accessibility audit (keyboard navigation, focus states, labels, contrast). Filtered appointment, audit, and report counts now use polite live regions.
- [ ] Responsive layout review on small screens.
- [ ] Email or desktop notifications in addition to in-app notifications.
- [ ] Optional branding/icon pass for the launcher and app.

### Production Backend Backlog

> **Scope:** none of these items block the current local demo or submission. They are the backend work required before SchedWise is exposed to real users on a shared network. Items are ordered by risk.

#### Production P0 — required before shared deployment

- [ ] **Production email delivery and retry.** Configure SMTP with TLS and a verified sender domain. Add an `email_outbox` table and worker with retry/backoff, persistent queued/sent/failed status, and alerts for failed verification, reset, and decision emails. Current mail is synchronous; Mailpit is local-only.
- [ ] **Production runtime and database security.** Run behind HTTPS with PHP-FPM and Nginx/Apache; use secure cookies; set production `allowed_origins`/`frontend_url`; disable debug and localhost recovery fallbacks; add a Content-Security-Policy and review other security headers; create a least-privilege MySQL user; keep `config.php` and secrets outside the web root; replace the demo credentials.
- [ ] **Backup, restore, and retention.** Automate encrypted backups off-machine; schedule restore drills into a separate database; document recovery point/time objectives; define and implement retention, purge, and anonymization rules for audit logs, consultation records, notifications, deleted accounts, and backups.
- [ ] **Concurrency and data integrity.** Add a unique constraint on `consultation_records.appointment_id`; lock the appointment row while creating a consultation; handle duplicate-key conflicts; run multi-worker tests for booking, approval, reschedule, cancellation, and consultation creation. Current slot protection is application-level and has only been exercised against the single-process PHP server.
- [ ] **Monitoring and alerting.** Add structured application logs with request IDs, mail-failure alerts, database/slow-query monitoring, health/readiness checks, uptime monitoring, and alerts for failed backups and rate-limit spikes.
- [ ] **Server-side pagination and search.** Add pagination and server-side filters to appointments, consultations, and user lists; paginate notifications. Appointment search and pagination are currently client-side over the full role-scoped result set.

#### Production P1 — major backend features

- [ ] **Consultation editing and versioning.** Add `PUT /consultations/index.php` with faculty ownership/admin authorization, audit old/new values, private-note redaction, optional revision history, and a documented rule for what students see after an edit. Consultation records are currently create-only.
- [ ] **Scheduled background jobs.** Add a scheduler/worker for appointment reminders, email notification delivery, expired verification/reset-token cleanup, rate-limit cleanup, notification retention, and soft-deleted account anonymization.
- [ ] **Data export and deletion.** Provide a documented export workflow and a delayed purge/anonymization process for deleted accounts while preserving required audit history.
- [ ] **Versioned database migrations.** Replace the idempotent setup script as the production schema path with versioned migrations, an applied-migration table, clean-database CI runs, and an intentional rollback/recovery procedure.
- [ ] **Email notifications and reminders.** Send approved/rejected, cancellation/reschedule, pending-approval, and upcoming-appointment emails through the outbox from Production P0.

#### Production P2 — smaller backend follow-ups

- [ ] Add consistent pagination metadata to every list endpoint.
- [ ] Add indexes and server-side filtering for appointment topics/reasons if search volume requires it.
- [ ] Add paginated admin consultation and availability browsing endpoints.
- [ ] Add audit-log retention/archival and database-level tamper resistance.
- [ ] Add OpenAPI/API reference generation.
- [ ] Add CI for PHP lint, TypeScript, API/CSRF/browser suites, and clean-database migrations.

---

## 3. Architecture

### Local runtime

```text
Browser
  http://localhost:5173
        │
        │  /api/*  (Vite dev proxy)
        ▼
PHP built-in server
  http://127.0.0.1:8000
        │
        ├── PDO / MySQL ──▶ MySQL 127.0.0.1:3306 / database: schedwise
        │
        └── SMTP ─────────▶ Mailpit 127.0.0.1:1025
                                 │
                                 └── web inbox http://localhost:8025
```

Apache is **not required** for local use. The launcher starts the PHP built-in server and Vite. Vite proxies `/api` to PHP so cookies and CSRF tokens remain same-origin. Transactional emails use local Mailpit by default; configure optional `SCHEDWISE_MAIL_*` values only when testing real delivery.

### Technology

| Layer | Current choice |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, Lucide icons, @fontsource/inter, @fontsource/baloo-2 |
| Backend | PHP 8.0+ (strict types), PDO MySQL |
| Database | MySQL 9.5 locally |
| Local tools | PowerShell launcher, VBS hidden wrapper, Windows shortcuts |
| Auth | PHP sessions + password hashing (`PASSWORD_DEFAULT`) |
| Email | Local Mailpit SMTP (`127.0.0.1:1025`) with optional real-provider overrides; PHPMailer 7.1.1 vendored under `backend/vendor/phpmailer` |
| Tests | Node built-in test runner (`node:test`) against the running API |

### Request conventions

- Every successful API response uses `{ "data": ... }`.
- Errors use `{ "error": "message" }`, sometimes with `fields` for validation.
- Unsafe methods require the `X-CSRF-Token` header.
- The frontend is API-only. Do not reintroduce `localStorage` mock data, demo fallbacks, or client-only authorization.

---

## 4. Folder Map

```text
PHP FINAL/
├── backend/
│   ├── bootstrap.php              # env, headers, CORS, session, CSRF, DB, error handling
│   ├── config.php                 # local DB/origin/mail/debug config (gitignored)
│   ├── config.example.php         # template for teammates
│   ├── health.php                 # safe health endpoint
│   ├── auth/                      # register, login/logout, verify/resend, forgot/reset/change password
│   ├── users/                     # admin user management + self profile
│   ├── audit/                     # admin-only paginated audit-log reader
│   ├── faculty/                   # directory, recurring availability, schedule overrides
│   ├── appointments/              # list/create + approve/reject/cancel/complete/no-show/reschedule
│   ├── consultations/             # consultation records and privacy filtering
│   ├── notifications/             # list and mark-read
│   ├── reports/                   # summary, monthly series, CSV export with shared filters
│   ├── vendor/phpmailer/          # pinned PHPMailer 7.1.1 source + license (no Composer needed)
│   └── shared/
│       ├── auth.php               # sessions, CSRF, current user, audit, notifications
│       ├── authorization.php      # ownership and availability/conflict rules
│       ├── validation.php         # appointment, URL, password, email validation
│       ├── report_filters.php     # role scope + admin department/faculty report filters
│       ├── clock.php              # DB-consistent current date helpers
│       ├── rate_limit.php         # database-backed throttling
│       ├── verification.php       # hashed email-verification tokens and frontend links
│       └── mailer.php             # SMTP transport, verification/reset email templates
├── frontend/
│   ├── src/api.ts                 # typed API client and CSRF token holder
│   ├── src/App.tsx                # root session shell and role routing
│   ├── src/shared/                # shared UI, types, appointment store, notification inbox, auth/date helpers
│   ├── src/features/              # auth, student, faculty, admin, appointments, account, legal
│   ├── src/main.tsx
│   ├── src/index.css
│   ├── tests/browser-smoke.test.mjs # Playwright-core browser smoke test (Brave/Chrome/Edge)
│   ├── package.json               # includes the test:browser script and playwright-core dev dependency
│   ├── .env                       # VITE_API_URL=/api (gitignored)
│   ├── .env.example
│   └── vite.config.ts             # /api proxy → 127.0.0.1:8000
├── tests/
│   └── api.test.mjs               # Node API regression suite with temporary-user cleanup
├── tools/
│   ├── setup-database.php         # safe schema/demo bootstrap and migrations
│   ├── reset-demo.php             # explicit destructive reset to the demo seed (--yes)
│   ├── backup-database.php        # timestamped SQL backup under .runtime/backups
│   ├── restore-database.php       # restore a backup (--yes; stop SchedWise first)
│   ├── test-cleanup.php           # removes e2e test users and related rows
│   ├── run-tests.ps1              # starts SchedWise if needed; runs the API suite plus browser smoke test
│   ├── schedwise-launcher.ps1         # start/stop MySQL, Mailpit, PHP, Vite, browser
│   ├── schedwise-launch.vbs           # hidden entry point used by shortcuts
│   ├── schedwise-start.ico            # green play icon for the start shortcut
│   └── schedwise-stop.ico             # red stop icon for the stop shortcut
├── database.sql                   # complete fresh schema + demo accounts + availability + verification table
├── .runtime/                      # generated logs, process IDs, backups, Mailpit data (gitignored)
└── README.md
```

Generated folders such as `frontend/node_modules`, `frontend/dist`, and `.runtime` are intentionally not part of the source handoff. `frontend/node_modules` is required to run locally but is reinstalled by the launcher when missing.

---

## 5. Roles and Permissions

### Student

- Self-register as a student with a Student ID and personal email. Accounts remain pending until administrator approval.
- Browse active faculty and availability/overrides.
- Create appointments for themselves only, with at most one request awaiting approval/rejection per faculty (including `reschedule_requested`). Requests to different faculty are allowed when their times do not overlap.
- View only their own appointments, notifications, and consultation records. **My Appointments** holds active/pending history; **My History** lists past/finished appointments with shared consultation feedback.
- Cancel their own pending/confirmed/reschedule-requested appointments from **My Appointments**, with a required reason and confirmation.
- Request a reschedule (status becomes `reschedule_requested`) from **My Appointments**, choosing from current faculty availability; conflicts keep the dialog open with a refresh action.
- Read their notification inbox from the header, including unread counts and mark-read controls.
- Cannot read another student's consultations.
- Cannot read faculty `private_notes`.

### Faculty

- Receive an admin-created faculty account. Change the initial password at first login before accessing protected features. Faculty public registration is disabled.
- Receive an approval or rejection email after an administrator reviews the registration.
- Manage their own recurring availability and date overrides.
- View appointments only where they are the assigned faculty.
- Approve pending or reschedule-requested appointments. Declining requires a written reason, which is sent to the student.
- Complete confirmed appointments.
- Reschedule their own appointments. Cancelling requires a written reason and confirmation.
- Create consultation records for their completed appointments. Once saved, the calendar form is read-only; the complete record, including private notes, remains available in **Consultation Records**.
- Read their notification inbox from the header.
- Cannot read another faculty member's private notes through the API.

### Administrator

- List, create, search, update status, inspect, and delete accounts. Roles and STU/FAC IDs are permanent after creation, including for administrators. Master User List search filters as you type after a 250 ms debounce; pressing Enter is not required.
- Review self-registered faculty in the **Faculty approvals** panel or the pending-account row; approve only after email verification, or reject the registration. Pending/rejected accounts cannot be activated through the ordinary status dropdown.
- See the pending faculty count on the Admin Dashboard Faculty card and as an amber badge on **User Management**; both open the existing approvals panel.
- Delete removes access and hides the account from management lists; historical appointments, consultations, audit records, email, and ID reservations remain. Administrators cannot delete themselves.
- View all appointment lists and reports. Administrator API access can also read role-scoped consultation, availability, and schedule data; the UI exposes appointment oversight rather than schedule editing.
- Review the read-only **Audit Log** with search, action/entity/date filters, result counts, and 25-entry server-side pages. The endpoint is administrator-only.
- Mark ended confirmed appointments as no-show from the appointment list.
- Export CSV reports.
- Cannot set their own account to a non-active status through the self-update path.

---

### Account IDs and form feedback

Students provide their own Student ID during public registration; existing `STU-` IDs remain usable. IDs preserve leading zeroes and accept letters, digits, dots, underscores, and hyphens (up to 100 characters). Duplicate Student IDs and emails are rejected. Admin-created faculty receive generated `FAC-` IDs, or an admin can supply a unique `FAC-` ID with at least four digits. Students can sign in with their Student ID or registered email and password. Faculty and administrators sign in with email and password. All account IDs and roles remain permanent.

Email, password, name, ID, registration, reset-password, and booking validation errors appear below their corresponding fields. General create-account errors stay inside the account dialog. Calendar save errors appear in the active sidebar panel. Invalid inputs are marked with `aria-invalid` and associated error messages.

The privacy notice appears only during registration and under Account Settings > Privacy; it does not appear on dashboards. Sign-out, account deletion/status changes, schedule creation/edit/deletion, appointment request/approval/rejection/cancellation/rescheduling/completion, consultation-note saving, account creation, and profile/password changes require an Yes/No confirmation before processing. No or Escape cancels without submitting the action.

All dashboard summary cards are buttons. Student and faculty cards open matching appointment lists (Today/Upcoming, Pending, Completed, Total). Admin cards open all users, faculty-only users, all appointments, or completion analytics. The Admin Faculty card turns amber and shows the pending count when faculty approvals are waiting, and **User Management** shows the same count as a badge. Faculty pending requests include future dates; approvals/rejections update cached dashboard counts. The frontend uses a purple palette throughout.

Appointment lists now include a search box (student/faculty name, topic, reason, status, or date), a status selector, From/To date filters, a visible/total count, and 8-row pagination. Search is client-side over the role-scoped result set, so student lists never load another student's appointments. Empty results explain whether the list is empty or the filters are too narrow and offer a **Clear filters** action. Admin empty states also explain when an account search has no matches or when a report has no completed consultations yet. When the database contains only the administrator account, the Admin Dashboard shows a first-run panel with account, availability, and booking steps.

System Analytics includes month, department, and faculty controls plus a **Clear** action and a filtered **Export CSV** link. The selected scope applies to the summary cards, the six-month chart, and the CSV row set. Department choices come from the active faculty directory, and changing the department resets a faculty selection outside that department.

## 6. Appointment Rules

### Status flow

```text
pending ──approve──► confirmed ──complete──► completed
   │                    │
   ├──reject──► rejected│
   ├──cancel──► cancelled
   └──student reschedule──► reschedule_requested
                              ├──approve──► confirmed
                              ├──reject──► rejected
                              └──cancel──► cancelled

confirmed ──student reschedule──► reschedule_requested
confirmed ──cancel──► cancelled
confirmed ──no-show (after end time)──► no_show
```

Faculty/admin reschedules go directly to `confirmed`. Students can only request a new time. `no_show` is available only to faculty/admin after the consultation end time and is terminal; it does not reopen the booking.

When an appointment is `reschedule_requested`, the faculty panel shows the requested date/time and the student's note in an amber summary, and the approval switch is labelled **Approve New Time**. If the server rejects a move because the slot was taken or the faculty is no longer available, the error stays in the reschedule form with **Retry same time** and **Choose another time** actions; the form is not closed and the notes error area is not reused. Student booking conflicts show a **Refresh available times** action that reloads faculty slots before the student tries again.

Students use **My Appointments** for active requests and **My History** for past/finished consultations. Cancelling or requesting a new time opens one dialog with a required reason, a final Yes/No confirmation, and (for reschedules) the faculty member's currently available slots. A conflict keeps the dialog open and exposes **Refresh available times**. Successful actions update the appointment cache and dashboard counts. The header notification inbox is shared by all roles: it shows unread counts, marks one or all notifications read, reloads when the window regains focus, and polls every 60 seconds. Student history reads the consultation API for shared summaries and action items; the appointment list includes only `summary`, never `private_notes`.

### Booking and account API changes (2026-10-21)

- `GET /faculty/slots.php`: authenticated list of `{ faculty_id, date, start_minutes }` for bookable 30-minute slots; exposes no student identities or private appointment details.
- `POST /appointments/index.php`: returns 409 if another request is pending with the same faculty, or any pending/reschedule-requested/confirmed student appointment overlaps on the same date.
- `POST /auth/login.php`: the `email` parameter requires a valid email address; STU/FAC IDs are rejected with a field-specific 400 response.
- `POST /users/index.php`: field-specific validation errors; generates a unique STU/FAC ID if omitted.
- `POST /auth/register.php`: accepts students only, requires a supplied unique `student_number` and valid personal email, and creates a pending application.
- `PUT /users/index.php?id=…`: rejects role/ID changes, including by administrators. With `{ "faculty_approval_action": "approve" | "reject" }`, administrators approve or reject a pending faculty registration; approval requires `email_verified_at`.
- `DELETE /users/index.php?id=…`: admin-only account deletion (soft delete), retaining history and rejecting self-deletion. Existing sessions stop authenticating.
- `GET /appointments/index.php` and single-appointment responses include `summary` from the linked consultation record when one exists. `action_items`, `private_notes`, and other consultation fields are not embedded; clients read those from the role-scoped consultation endpoint.

### Validation

- The appointment date cannot be in the past (checked against the MySQL clock).
- Start/end minutes must be valid and end must be after start.
- The slot must fit inside recurring availability or an `available` override.
- `blocked` overrides prevent booking using half-open time ranges: a slot immediately before/after a blocked range remains bookable.
- New bookings are refused only when the student already has a pending/reschedule-requested booking with the same faculty. Requests to other faculty are allowed. Pending, reschedule-requested, and confirmed student appointments block overlapping times on the same date across all faculty; adjacent time ranges are allowed. Student row locks serialize bookings and reschedules; rescheduling also enforces these constraints.
- The booking picker lists only faculty with real, unbooked 30-minute slots during the next 14 days, including weekends when explicitly available. Recurring schedules and date overrides are combined server-side using the database clock; past times are excluded.
- Existing `pending`, `confirmed`, and `reschedule_requested` appointments block overlapping slots.
- Meeting links must be valid `http` or `https` URLs.
- Topic/reason/length fields are bounded server-side.
- Approval re-checks availability/conflicts before confirming.

### Consultation privacy

- `summary` and `action_items` are student-visible.
- Appointment responses embed only the shared `summary`; `action_items` and follow-up data come from `/consultations/index.php`.
- `private_notes` is faculty/admin-only and is removed from student API responses, including appointment responses (which never select it).

---

## 7. Database

### Current tables

| Table | Purpose |
| --- | --- |
| `roles` | student, faculty, admin |
| `users` | email identity, supplied student/generated faculty IDs, permanent role, status, `student_approval_status`, `must_change_password`, legacy `faculty_approval_status`, password hash, verification/login timestamps, `deleted_at` |
| `account_id_sequences` | transaction-locked numeric counters for automatic STU/FAC IDs |
| `user_profiles` | name, unique permanent student/faculty number, department, program, phone |
| `departments` | stable department IDs used by profiles and registration |
| `faculty_availability` | recurring weekday time blocks |
| `schedule_overrides` | date-specific `available` or `blocked` blocks |
| `appointments` | requests, status, schedule, reasons, cancellation/reschedule metadata |
| `consultation_records` | summary, action items, private notes |
| `notifications` | in-app messages and read state |
| `audit_logs` | security/business events; actor may be null for failed logins; indexes support newest-first admin filtering by date, action, and entity, while actor lookups use the foreign-key index |
| `password_resets` | hashed, expiring, single-use reset codes |
| `email_verifications` | hashed, expiring, single-use registration verification links |
| `rate_limits` | login/registration/email-verification/reset throttling |

### Fresh database

`database.sql` is the complete source of truth. It includes:

- all tables and indexes, including `email_verifications`
- demo departments (`ccs`, `coe`, `cba`, `cas`)
- demo admin/faculty/student accounts (already active and email-verified)
- Monday–Friday availability (09:00–12:00 and 13:00–16:00)

`tools/setup-database.php` imports it automatically when the database or `users` table is empty. The launcher calls this on every start and applies small non-destructive upgrades to an existing database:

- makes failed-login audit actor fields nullable
- adds `appointments.cancellation_reason` when missing
- ensures the `email_verifications`, `password_resets`, and `rate_limits` tables exist
- ensures roles and demo departments exist
- adds `users.deleted_at`, `users.faculty_approval_status`, account ID counters, and unique indexes on student/faculty numbers
- adds audit-log indexes on `created_at`, `action`, and `entity_type` when missing; `actor_user_id` already has the foreign-key index
- preserves supplied valid Student IDs and existing account history; repairs missing/invalid legacy IDs and retains faculty ID sequences
- resyncs both account-ID sequences to the highest valid existing ID so automatic IDs stay monotonic after imports or repairs

It does **not** reset passwords, delete users, or wipe appointments.

The registration form maps college labels to the seeded department IDs (`ccs`, `coe`, `cba`, `cas`). Keep `departmentIds` in `frontend/src/shared/auth.ts` in sync with the `departments` seed; the register endpoint rejects unknown department IDs.

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@schedwise.edu` | `Admin123!` |
| Faculty | `elena.cruz@schedwise.edu` | `Passw0rd!` |
| Student | `juan.delacruz@schedwise.edu` | `Passw0rd!` |

These are local demo credentials only. The login screen no longer displays them; use this table for local demo access. Change them if the project is shared or exposed.

### Clean baseline and maintenance

A fresh reset via `tools/reset-demo.php --yes` produces:

- 3 users
- 4 departments
- 10 faculty availability rows
- 0 appointments, consultation records, notifications, reset codes, verification links, and rate-limit rows

The local checkout currently contains a small amount of manual review activity (one appointment and audit history). Do not run the demo reset unless you intend to discard that activity.

Reset to the demo seed (destructive, requires `--yes`):

```powershell
C:\xampp\php\php.exe tools\reset-demo.php --yes
```

Create a timestamped backup under `.runtime/backups`:

```powershell
C:\xampp\php\php.exe tools\backup-database.php
```

Restore a backup (stop **SchedWise** first; destructive, requires `--yes`):

```powershell
C:\xampp\php\php.exe tools\restore-database.php .runtime\backups\schedwise-YYYYMMDD-HHMMSS.sql --yes
```

Backups use `mysqldump --single-transaction --set-gtid-purged=OFF` so they can be restored on the same local MySQL server without GTID conflicts. The scripts find MySQL 9.5 or XAMPP `mysqldump`/`mysql` automatically; set `SCHEDWISE_MYSQLDUMP` or `SCHEDWISE_MYSQL` to override the path.

---

## 8. API Reference

Base URL locally: `http://localhost:5173/api` through Vite, forwarded to PHP at `http://127.0.0.1:8000`.

All protected endpoints require a session cookie. Unsafe endpoints also require `X-CSRF-Token`.

### Authentication

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register.php` | public | Submit a pending student application with supplied Student ID, personal email, and password; faculty registration is blocked |
| POST | `/auth/verify-email.php` | public | Handle legacy verification links; pending student approval remains required |
| POST | `/auth/resend-verification.php` | public | Issue a new link for a pending unverified account; generic response to prevent enumeration |
| POST | `/auth/login.php` | public | Login by student ID or registered email (staff use email); pending/rejected students receive 403; new faculty sessions require password change |
| POST | `/auth/logout.php` | authenticated + CSRF | Destroy session |
| GET | `/auth/me.php` | authenticated | Current user + CSRF token |
| POST | `/auth/change-password.php` | authenticated + CSRF | Verify current password and set a new one |
| POST | `/auth/forgot-password.php` | public | Email a reset code; debug code only localhost + debug mode |
| POST | `/auth/reset-password.php` | public | Complete reset, invalidate old sessions |

### Users

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/users/index.php` | admin | List/search users |
| GET | `/users/index.php?id=...` | admin or self | Read one profile |
| POST | `/users/index.php` | admin | Create faculty account with mandatory initial password change; student creation is blocked |
| PUT | `/users/index.php?id=...` | admin or self | Update profile; admin can change status. Pending/rejected students use `student_approval_action` (`approve`/`reject`). Self-service cannot change role/status or institutional numbers |

### Audit log

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/audit/index.php` | admin | Read-only, newest-first audit events. Query parameters: `page`, `per_page` (10–100, default 25), `q`, `action`, `entity_type`, `actor_id`, `date_from`, `date_to`. Returns `entries`, `pagination`, and distinct filter `options`. Invalid dates return 400 |

`old_values` and `new_values` are decoded JSON objects when valid. Keys matching password, token, secret, hash, API-key, reset-code, or verification-code patterns are replaced with `[redacted]` before the response is sent. The response includes actor name/email and truncated entity IDs are rendered by the client; no update or delete route exists for audit rows.

### Faculty

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/faculty/index.php` | authenticated | Active faculty directory |
| GET/POST/PUT/DELETE | `/faculty/availability.php` | role/ownership rules | Recurring availability |
| GET/POST/PUT/DELETE | `/faculty/schedule_overrides.php` | role/ownership rules | Date-specific overrides |

### Appointments

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/appointments/index.php` | authenticated | Role-scoped list/filter |
| POST | `/appointments/index.php` | student | Create own request |
| PUT | `/appointments/approve.php?id=...` | faculty/admin | Approve |
| PUT | `/appointments/reject.php?id=...` | faculty/admin | Reject with reason |
| PUT | `/appointments/cancel.php?id=...` | owner/faculty/admin | Cancel with reason |
| PUT | `/appointments/reschedule.php?id=...` | owner/faculty/admin | Reschedule |
| PUT | `/appointments/complete.php?id=...` | faculty/admin | Mark completed |
| PUT | `/appointments/no-show.php?id=...` | faculty/admin | Mark a confirmed appointment as a no-show after its end time |

### Consultations, notifications, reports

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET/POST | `/consultations/index.php` | role-scoped | Read/create consultation records |
| GET | `/notifications/index.php` | authenticated | Own notifications |
| PUT | `/notifications/index.php?id=...` or `{mark_all:true}` | authenticated | Mark read |
| GET | `/reports/summary.php?year=...&month=...&department_id=...&faculty_id=...` | authenticated | Role-scoped dashboard summary; admin filters are optional |
| GET | `/reports/monthly.php?months=...&end_month=YYYY-MM&department_id=...&faculty_id=...` | authenticated | Six-month series ending at the selected month |
| GET | `/reports/export.php?format=csv&year=...&month=...&department_id=...&faculty_id=...` | faculty/admin | CSV export using the same report filters |
| GET | `/health.php` | public | Minimal health status |

---

## 9. Security Model

### Authentication and sessions

- Password hashes use `password_hash(..., PASSWORD_DEFAULT)`.
- Registration requires a valid personal or institutional email address, a supplied Student ID, and a password with at least 8 characters, uppercase, lowercase, a digit, and a special character.
- The registration form mirrors these checks and displays the API's field-level validation errors; the server remains authoritative.
- The registration email field deliberately disables browser autofill (`autocomplete="off"`, an explicit field name, and `type="text"` with `inputMode="email"`). Brave 1.97 can crash in its browser process when its email autofill dropdown opens on this form; do not re-enable autofill there without testing Brave.
- Students self-register as `pending` and need an admin decision; faculty cannot self-register. Legacy verification links may verify email but cannot bypass student approval. Historical verification behavior: The verification token is stored only as a SHA-256 hash, expires after 24 hours, is single-use, and is invalidated when a newer link is issued. Opening a legacy link sets `email_verified_at`; pending students remain blocked until administrator approval. Verification is idempotent for browser retries.
- Verification links point at the React app (`/?verify_token=...`), which submits the token to the API and removes it from the address bar. The raw token is never logged.
- Pending and rejected student applications are blocked on every request even if their raw status is active. Legacy pending/rejected faculty also remain blocked. Approval/rejection is admin-only and uses a separate action so the ordinary status dropdown cannot bypass review.
- Approval and rejection send a decision email and an in-app notification without exposing tokens or credentials.
- Demo accounts are preserved. Only faculty accounts can be created by an administrator; newly created faculty must change the initial password before accessing protected features.
- Session cookie is HttpOnly, SameSite=Lax, strict mode, and Secure automatically on HTTPS.
- Session ID is regenerated on login.
- Idle timeout: 2 hours. Absolute timeout: 12 hours.
- A password reset changes the password fingerprint and invalidates existing sessions.
- A signed-in password change verifies the current password, rejects reuse of the current password, invalidates other sessions, clears outstanding reset codes, and keeps the current session valid.
- Inactive/suspended users are rejected on every request. Unverified pending users receive a specific `email_unverified` response only after supplying the correct password, so the login screen can offer resend.
- Password-reset codes are stored only as SHA-256 hashes, expire after 30 minutes, and are single-use.
- Verification and reset emails are delivered through Mailpit locally; tokens/codes are never written to logs. The admin UI has no reset-code or verification-token screen and cannot retrieve the hashes.

### CSRF and origin checks

- Login and `me` issue an `X-CSRF-Token`.
- All unsafe methods require the token, except the documented public auth endpoints.
- Origin allowlist adds defense in depth. Configure `app.allowed_origins` in `backend/config.php`.
- Vite keeps `/api` same-origin, which avoids cross-site cookie problems locally.

### Rate limits

- Login: 10 failures per account/IP and 40 per IP per 15 minutes.
- Registration: 10 per hour per IP.
- Email verification attempts: 30 per IP per 15 minutes.
- Verification resend: 3 per email and 10 per IP per hour.
- Forgot password: 5 per email and 20 per IP per hour.
- Reset attempts: 10 per 15 minutes.
- Signed-in password changes: 5 failed attempts per user per 15 minutes.

### Authorization

The server checks the current role and ownership on every request. Do not rely on hidden UI controls. Important invariants:

- Students can only create appointments for themselves.
- Students can only read their own consultations.
- Faculty can only modify their own appointments.
- Admin-only endpoints are checked server-side, including the Audit Log reader.
- `private_notes` are never returned to students.

### Output and data handling

- SQL uses prepared statements.
- Validation errors return field-level messages.
- Server errors log details but return generic JSON.
- CSV cells beginning with spreadsheet formula characters are escaped.
- API responses use `Cache-Control: no-store` and security headers.

### Local-only caveats

- HTTP is used locally. Add HTTPS before any shared deployment.
- `backend/config.php` enables debug locally so password-reset codes and verification links can also be returned to localhost. Never enable debug on an exposed server.
- Mailpit binds to `127.0.0.1` only. The inbox at `http://localhost:8025` is a local developer tool, not a production mail service.
- For real email, configure the `SCHEDWISE_MAIL_*` environment variables from the example config. Set `app.frontend_url`/`SCHEDWISE_FRONTEND_URL` to the public frontend origin so verification links are correct.
- Self-registration requires email verification. If Mailpit is unavailable, the local debug response includes a verification link. Faculty approval still requires an administrator decision; approval cannot be completed until verification succeeds.
- Rate limiting uses `REMOTE_ADDR`; behind a proxy, configure trusted proxy handling first.

---

## 10. Run the App

### Prerequisites

- Windows 10/11
- PHP 8.0+ at `C:\xampp\php\php.exe` or available as `php.exe`
- MySQL 8+ listening on `127.0.0.1:3306` (the current machine uses MySQL 9.5)
- Node.js 20.19+ or 22.12+ and npm (the current machine uses Node 25.9.0)

The launcher can start the local MySQL service/direct `mysqld` process, the two app servers, and Mailpit. It checks PHP/Node.js versions, npm, and MySQL availability first and offers the relevant download page if a prerequisite is missing, but it cannot install them silently.

### One-click (normal use)

1. Double-click **SchedWise** on the Desktop (green play icon).
2. The launcher:
   - creates `backend/config.php` and `frontend/.env` if missing
   - starts MySQL if it is not listening
   - runs `tools/setup-database.php`
   - installs frontend dependencies if `node_modules` is missing
   - starts the PHP API, Vite, and Mailpit hidden
   - opens `http://localhost:5173`
3. Sign in with a demo account above, or register a student or faculty account.
4. New registrations are pending until the verification email is opened. Verification and password-reset emails appear in the local Mailpit inbox at `http://localhost:8025`.
5. To stop the app servers, double-click **STOP SchedWise** on the Desktop (red stop icon). MySQL is intentionally left running.

First run may take a few minutes if `npm install` is needed and Mailpit must be downloaded to `.runtime/mailpit`. Later starts are fast. The Mailpit download is pinned to v1.31.6 and requires internet once; if it cannot be downloaded, SchedWise still starts and localhost debug reset codes/verification links remain available.

### Shortcut locations

- `C:\Users\miran\OneDrive\Desktop\SchedWise.lnk` (green play icon)
- `C:\Users\miran\OneDrive\Desktop\STOP SchedWise.lnk` (red stop icon)

If the shortcuts are missing, recreate them with the paths below:

- Target: `C:\Windows\System32\wscript.exe`
- Start arguments: `"C:\Users\miran\OneDrive\Desktop\PHP FINAL\tools\schedwise-launch.vbs" start`
- Start working directory: `C:\Users\miran\OneDrive\Desktop\PHP FINAL`
- Stop arguments: `"C:\Users\miran\OneDrive\Desktop\PHP FINAL\tools\schedwise-launch.vbs" stop`

### Manual start

From PowerShell in the project root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\schedwise-launcher.ps1 start
```

Start without opening the browser (useful for testing):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\schedwise-launcher.ps1 start -NoBrowser
```

Stop:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\schedwise-launcher.ps1 stop
```

### Logs

| File | Contents |
| --- | --- |
| `.runtime/logs/launcher.log` | launcher start/stop and failures |
| `.runtime/logs/database.log` | setup/migration output |
| `.runtime/logs/backend.out.log` | PHP server output |
| `.runtime/logs/backend.err.log` | PHP server errors |
| `.runtime/logs/vite.out.log` | Vite output |
| `.runtime/logs/vite.err.log` | Vite errors |
| `.runtime/logs/mailpit.out.log` | Mailpit output |
| `.runtime/logs/mailpit.err.log` | Mailpit errors |
| `.runtime/logs/npm-install.*.log` | first-run dependency install |
| `.runtime/backups/*.sql` | database backups (not a log, but generated runtime data) |

### Manual fallback (if the launcher cannot start)

Start MySQL first (MySQL95 service or XAMPP), then:

```powershell
C:\xampp\php\php.exe tools\setup-database.php
C:\xampp\php\php.exe -d session.save_path="$PWD\.runtime\sessions" -S 127.0.0.1:8000 -t backend
```

In a second terminal:

```powershell
cd frontend
npm install
npm run dev -- --port 5173 --strictPort
```

Then open `http://localhost:5173`.

### Configuration

`backend/config.php`:

- `app.debug`: local debug flag; reset codes and verification links are still restricted to localhost
- `app.frontend_url`: public frontend origin used inside verification emails; defaults to `http://localhost:5173`
- `app.timezone`: PHP display timezone; defaults to `Asia/Kuala_Lumpur` to match the local MySQL clock. Set `SCHEDWISE_TIMEZONE` for another environment
- `app.allowed_origins`: front-end origins
- `db.host`, `db.port`, `db.name`, `db.user`, `db.password`, `db.charset`
- `mail.host`, `mail.port`, `mail.username`, `mail.password`, `mail.encryption`, `mail.from_email`, `mail.from_name`, `mail.timeout`

Local defaults send to Mailpit at `127.0.0.1:1025` with no authentication or encryption and sender `no-reply@schedwise.edu`. For a real provider, set the environment variables below (or equivalent values only in ignored `backend/config.php`); use `tls` for port 587 or `ssl` for port 465.

```text
SCHEDWISE_MAIL_HOST=smtp.example.com
SCHEDWISE_MAIL_PORT=587
SCHEDWISE_MAIL_USERNAME=...
SCHEDWISE_MAIL_PASSWORD=...
SCHEDWISE_MAIL_ENCRYPTION=tls
SCHEDWISE_MAIL_FROM=no-reply@example.edu
SCHEDWISE_FRONTEND_URL=https://schedwise.example.edu
SCHEDWISE_TIMEZONE=Asia/Kuala_Lumpur
```

Restart the PHP server after changing environment variables. Keep secrets out of `config.php` and source control.

`frontend/.env`:

```text
VITE_API_URL=/api
```

Use an absolute API URL only when the frontend is served from a different origin. Then update `app.allowed_origins` and cookie settings accordingly.

---

## 11. Development Workflow

When adding or changing a feature:

1. Read the relevant backend endpoint and `frontend/src/api.ts`.
2. Keep authorization server-side. Re-check role and ownership.
3. Use the `respond()` / `respondServerError()` response conventions.
4. Use unique named SQL parameters. Reusing the same placeholder for both a permission scope and a user-supplied filter caused a historical IDOR.
5. Use `backend/shared/clock.php` for date rules that must match the MySQL clock.
6. Update the relevant `frontend/src/features/...` module, shared helpers, `frontend/src/api.ts`, and types together.
7. Update this README and the TODO list.
8. Run verification:

```powershell
# PHP lint
Get-ChildItem -Recurse -Filter *.php backend,tools | ForEach-Object { & C:\xampp\php\php.exe -l $_.FullName }

# TypeScript
cd frontend
npx tsc --noEmit

# Production build (output is gitignored/regenerable)
npm run build

# API regression suite + browser smoke test
# Starts SchedWise/Mailpit if needed; temporary API data is removed.
powershell -NoProfile -ExecutionPolicy Bypass -File tools\run-tests.ps1

# Browser smoke test only (SchedWise must already be running; requires installed frontend dependencies)
cd frontend
npm run test:browser

# Skip the browser portion when only backend/API coverage is needed
powershell -NoProfile -ExecutionPolicy Bypass -File tools\run-tests.ps1 -SkipBrowser

# Client-side CSRF retry tests (mocked fetch; no live server required)
node --test tests\csrf-client.test.mjs

# Smoke test through the real launcher
powershell -NoProfile -ExecutionPolicy Bypass -File tools\schedwise-launcher.ps1 start -NoBrowser
# open http://localhost:5173, sign in, exercise the changed flow
powershell -NoProfile -ExecutionPolicy Bypass -File tools\schedwise-launcher.ps1 stop
```

The API suite creates a unique `e2e.*@schedwise.edu` student, checks that login is blocked while pending, tests resend, opens the verification link from Mailpit, verifies idempotency, resets the password, and deletes test data in `finally`. It also registers two faculty accounts: it verifies that IDs are unique, blocks approval before email verification, confirms login is blocked with `faculty_approval_pending` after verification, approves one account and signs in successfully, then rejects the other and checks `faculty_approval_rejected`; both decision emails are confirmed in Mailpit. It also checks that the audit endpoint is admin-only, paginated, filterable, and rejects malformed dates; that report filters by faculty, department, month, and export scope work and reject unknown filters; that a confirmed future appointment cannot be marked as a no-show before its end time; and that a student reschedule request becomes `reschedule_requested` and can be approved by the faculty member. A dedicated state-transition case covers pending/confirmed/completed/rejected/cancelled guards, cancel and reject reason requirements, direct faculty reschedules, cross-account reschedule authorization, invalid and past reschedule dates, unavailable slots, faculty overlaps (`409`), and approval failing when availability is blocked after a student request. The consultation-privacy case also verifies that appointment lists embed the shared `summary` but never `action_items` or `private_notes`. It requires Mailpit on `127.0.0.1:8025`; `run-tests.ps1` starts the app and Mailpit if they are not running. The suite also signs in with the seeded admin, faculty, and student accounts, so keep those demo passwords unchanged or update the test fixtures together.

The browser smoke test uses `playwright-core` and launches an installed Chromium-based browser (Brave first, then Chrome, then Edge). It checks the purple primary action, empty login validation, privacy disclosure placement on registration (and its absence from dashboards plus presence under Account Settings > Privacy), and registers a new `e2e.browser.*` faculty account through the UI. It retrieves the verification link from Mailpit, confirms the pre-approval login block, signs in as the seeded administrator, approves the pending faculty member through User Management, and verifies the new account can sign in. The new faculty account opens the notification inbox, confirms the approval notice, and marks all notifications read. The test then validates dashboard card navigation, availability setup, student registration/booking, student reschedule, notification delivery, faculty approval/completion through the API, consultation feedback in **My History**, admin user search-as-you-type, appointment filters, Audit Log filtering, report department/faculty filters, the filtered CSV export link, sign-out cancellation, and student/faculty role routing. If no supported browser is found, the test skips with a message; set `SCHEDWISE_BROWSER_PATH` to override the executable. The client CSRF suite is separate and does not require the app to be running.

Before a destructive demo reset, take a backup. Do not commit generated `frontend/dist`, `.runtime`, `backend/config.php`, or `frontend/.env`.

---

## 12. Verification Checklist

Use this before handing the project to someone:

- [ ] PHP lint passes for `backend` and `tools`.
- [ ] The launcher prerequisite dialog appears clearly for missing/old PHP, Node.js/npm, or MySQL instead of a raw error.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run build` passes.
- [ ] `SchedWise` shortcut starts the app without a terminal.
- [ ] Login works through `http://localhost:5173/api`.
- [ ] A mutation without a CSRF token returns 403.
- [ ] Student cannot read another student's consultations or private notes.
- [ ] Student cannot approve/reject/complete appointments.
- [ ] Past dates and `javascript:` meeting links are rejected.
- [ ] Admin cannot set their own account to `pending`.
- [ ] Forgot-password email arrives in Mailpit and the debug code is returned only for localhost when debug is on.
- [ ] A reset code is single-use and expires after 30 minutes.
- [ ] Registration accepts personal email and shows clear errors for malformed email, missing/invalid Student ID, duplicate IDs, weak password, and first-name-only input.
- [ ] Typing in the registration email field does not open a browser autofill dropdown in Brave, and valid personal email addresses are accepted.
- [ ] A successful student registration creates a `pending` account with the supplied Student ID, lands on login with the Student ID prefilled, and shows the pending administrator approval notice.
- [ ] Public faculty registration is unavailable and rejected by the API.
- [ ] Admin-created faculty must change the initial password before accessing the Faculty Dashboard, including after a reload.
- [ ] Student approval sends an activation/welcome email and in-app notification; approved students can sign in with either their ID or registered email. Rejection blocks login with `student_approval_rejected`.
- [ ] A legacy student email-verification link cannot bypass pending administrator approval.
- [ ] Re-opening the same verification link is harmless for the verified account, while a different invalid token is rejected.
- [ ] Automatic STU/FAC IDs are unique and sequential; manually supplied IDs advance the sequence, and duplicate IDs are rejected.
- [ ] The Admin **Audit Log** is visible only to administrators; search, action/entity/date filters, and pagination work, and malformed dates are rejected.
- [ ] Appointment lists filter by search/status/date and paginate; clearing filters restores the role-scoped list.
- [ ] System Analytics filters by month, department, and faculty; the chart and CSV link follow the selected scope and unknown filters are rejected.
- [ ] A confirmed appointment can be marked `no_show` only after its end time; the student receives an in-app notification and final appointments cannot be rescheduled or cancelled.
- [ ] A `reschedule_requested` appointment shows the requested date/time and student note; approval is labelled as confirming the new time; a server conflict keeps the reschedule form open with retry and choose-another-time actions.
- [ ] The student **My Appointments** dialog cancels with a required reason, requests a new time from live slots, and updates the list/counts without a reload.
- [ ] The header notification inbox shows the unread count, opens for every role, marks one or all messages read, and refreshes after approvals/completions.
- [ ] **My History** shows only past/finished appointments and opens the shared consultation summary, action items, and follow-up date; private notes never appear.
- [ ] Faculty decline and cancel forms reject an empty reason and show server errors inline; saved consultation forms do not allow a duplicate create.
- [ ] The privacy notice appears during registration and under Account Settings > Privacy, and not on any dashboard.
- [ ] PHP reports `Asia/Kuala_Lumpur` (or the configured `SCHEDWISE_TIMEZONE`) and formatted dates match MySQL's local clock.
- [ ] Empty appointment/user/report/history/audit views explain the next action, and a clean database shows the Admin first-run setup panel.
- [ ] Account settings can update the signed-in user's profile.
- [ ] A signed-in password change accepts the new password, rejects the old one, and keeps the current session valid.
- [ ] `tools/run-tests.ps1` passes all API tests and the browser smoke test.
- [ ] `tools/run-tests.ps1 -SkipBrowser` passes the API suite without requiring a browser.
- [ ] `node --test tests\csrf-client.test.mjs` passes all client CSRF retry tests.
- [ ] A backup can be created and restored after stopping the app.
- [ ] Stopping via `STOP SchedWise` closes ports 8000, 5173, and 1025/8025 (Mailpit), leaving MySQL running.

**Last verified:** 2026-10-22 — student self-service, notification, and consultation-feedback pass completed. PHP syntax checks passed for every PHP file in `backend`, `tools`, and `tests`; `npx tsc --noEmit` and the Vite production build passed; the API regression suite passed 16/16 tests, including shared-summary embedding with private notes excluded; the client CSRF suite passed 4/4 tests; and the committed Playwright browser smoke test passed 1/1 against headless Brave (privacy placement, purple-theme styling, dashboard card navigation, faculty registration with Mailpit verification, administrator approval, notification inbox/mark-all-read, sign-out cancellation, admin user search, appointment filters, student cancel/reschedule, consultation feedback, Audit Log filtering, report filters/export, role routing, zero page exceptions). Test cleanup left no `e2e.*` accounts or test-created appointments/overrides; the intentional non-test local account and its demo data were left untouched, and the clean seed still provides 10 availability rows. The pre-migration database backup is at `.runtime/backups/pre-schedwise-migration.sql`. Desktop shortcuts remain `SchedWise.lnk` and `STOP SchedWise.lnk`.

---

## 13. Troubleshooting

### The browser does not open

Open `http://localhost:5173` manually after a few seconds. Check `.runtime/logs/launcher.log`.

### Port 5173 or 8000 is already in use

Run **STOP SchedWise**. If that does not help, close the other Vite/PHP process or reboot. The launcher uses strict ports so it fails clearly instead of silently moving to another port.

### MySQL is not running

Start the `MySQL95` Windows service or MySQL from XAMPP, then click **SchedWise** again. The launcher also attempts the service and a direct `mysqld` start before showing the prerequisite dialog with the XAMPP download option.

### PHP, Node.js, or npm is missing or too old

The launcher checks for PHP 8.0+, Node.js 20.19+ or 22.12+, and npm before starting. The dialog explains what was found, what is required, and offers to open the XAMPP or Node.js download page. Install the prerequisite, then click **SchedWise** again. This check is separate from `npm install`, which retries automatically when `frontend/node_modules` is missing.

### Brave closes while typing in the registration email field

Brave 1.97 can crash inside its own autofill/password-manager UI when an email suggestion opens. The registration form deliberately opts out of autofill on the email field; keep its `autoComplete="off"`, explicit `name`, and `inputMode="email"` settings. If Brave still closes, turn off address/email autofill at `brave://settings/autofill` and password suggestions at `brave://settings/passwords`, test Incognito with extensions disabled, and check `brave://settings/help` for an update. The PHP API is not involved until **Register** is submitted.

### The browser smoke test skips or cannot launch a browser

Run `npm install` in `frontend` so `playwright-core` is present, then run `tools\run-tests.ps1` or `npm run test:browser` from `frontend` while SchedWise is running. The test auto-detects Brave, Chrome, and Edge on Windows. Set `SCHEDWISE_BROWSER_PATH` to a full executable path if the browser is installed elsewhere. A skip message is expected when no supported Chromium-based browser exists; the API suite can still be run with `-SkipBrowser`.

### Login works but API calls fail

Check that `frontend/.env` contains `VITE_API_URL=/api` and that `frontend/vite.config.ts` proxies to `http://127.0.0.1:8000`. Do not point the local app at the old Apache path.

### Database setup fails

Read `.runtime/logs/database.log`. Verify `backend/config.php` credentials and that MySQL is listening on port 3306.

### `npm install` fails

Install Node.js 20.19+ (or 22.12+) and npm, then run **SchedWise** again. Check `.runtime/logs/npm-install.err.log`.

### Password reset email does not appear

Open the Mailpit inbox at `http://localhost:8025`. If the page is unavailable, check `.runtime/logs/mailpit.err.log` and whether port 1025/8025 is already occupied. The launcher downloads Mailpit on first use; an offline first run leaves the localhost debug code available instead. In local debug mode, the code is also returned only to localhost. Set `app.debug` to `true` in `backend/config.php` for local use.

### Verification email does not appear

Confirm the account is still `pending` and check the Mailpit inbox. Use **Resend verification email** on the login screen; each new link invalidates older links and expires after 24 hours. In local debug mode, the API returns a localhost-only `debug_verification_url` that the login screen shows as a fallback link. If Mailpit cannot run, an administrator can activate a student account manually from user management or use the debug link. A self-registered faculty account must verify its email before approval; an administrator cannot approve it early.

### Backup or restore fails

Use the MySQL 9.5 or XAMPP client tools, or set `SCHEDWISE_MYSQLDUMP`/`SCHEDWISE_MYSQL`. Stop **SchedWise** before restoring. Backups are created with `--set-gtid-purged=OFF`; if you restore an older dump that still contains a GTID line, MySQL will reject it with error 3546. Take a new backup with the current script instead.

### Account settings changes do not appear

Refresh after saving a profile. A password change keeps the current session but invalidates other browsers. If the save fails, check the API response and `.runtime/logs/backend.err.log`.

---

## 14. AI Handoff Notes

Read in this order:

1. `README.md` (this file)
2. `database.sql`
3. `backend/bootstrap.php`
4. `backend/shared/auth.php`
5. `backend/shared/authorization.php`
6. `backend/shared/verification.php`
7. `backend/shared/mailer.php`
8. `backend/audit/index.php`
9. `tests/api.test.mjs`
10. `frontend/tests/browser-smoke.test.mjs`
11. `frontend/src/api.ts`
12. `frontend/src/shared/` and `frontend/src/features/`

Non-negotiable invariants:

- The frontend never authorizes by itself.
- Every protected endpoint calls `authenticateUser()` and checks role/ownership.
- Unsafe browser requests carry `X-CSRF-Token`.
- Students never receive `private_notes`.
- Student filters cannot override role scoping.
- Audit rows are administrator-only, read-only, and must not expose passwords, tokens, or other secrets in summaries.
- Self-registered students stay pending until email verification; self-registered faculty stay pending until email verification **and** administrator approval. Never auto-activate either role in registration code.
- Pending/rejected faculty cannot be activated through the generic status dropdown or an active status alone; use the explicit approval action after verification.
- Verification and reset tokens are stored only as hashes, expire, are single-use (verification is idempotent only for an already verified account), and must never be logged.
- Date rules use `less than`/`greater than` carefully; appointment conflicts use half-open interval overlap.
- Do not reintroduce demo fallbacks, localStorage mocks, hard-coded statistics, or the deleted unauthenticated `backend/appointments.php`.
- Keep the README and TODO list current with every change.
- Mailpit is local-only. Never ship reset codes, verification links, or SMTP credentials to logs or a shared server.

Known risk areas:

- Keep feature code inside `frontend/src/features/...` and shared primitives inside `frontend/src/shared/`; run the role flows and full test suite after moving components between modules.
- Brave 1.97 can crash in its own autofill UI on the registration form. The email input is intentionally opted out of autofill; test Brave again before restoring autofill behavior.
- Email verification depends on Mailpit in local use. The localhost debug fallback and manual admin activation are intentional recovery paths for student accounts; self-registered faculty still need verification before approval. This is not a replacement for real SMTP in a shared environment.
- The one-click launcher is Windows-specific and assumes XAMPP PHP + a local MySQL installation. Document any path changes.
- The local database uses the root account with an empty password. Change it if the machine is shared.
- PHPMailer is vendored manually (7.1.1) because Composer is not part of the one-click stack. Update `backend/vendor/phpmailer` and its `VERSION`/`LICENSE` together if a security release requires it.
- Mailpit is downloaded from a pinned GitHub release into `.runtime/mailpit` on first launch. If the download is blocked, local email delivery is unavailable until the binary is supplied manually.
- Browser smoke tests require `frontend/node_modules/playwright-core` and a local Chromium-based browser. They launch an installed Brave/Chrome/Edge executable rather than downloading a browser; set `SCHEDWISE_BROWSER_PATH` if auto-detection fails.
- `tools/reset-demo.php` and `tools/restore-database.php` are destructive; keep the `--yes` guard and take a backup before using either.

---

## 15. Change Log

### 2026-10-22

#### Student self-service, notification inbox, and consultation feedback

- Added `frontend/src/features/appointments/StudentAppointmentDialog.tsx` and student actions in `AppointmentListView.tsx`. Students can cancel or request a new time from **My Appointments** with a required reason, confirmation, live faculty-slot selection, conflict handling, and a **Refresh available times** retry. Successful actions update the role-scoped appointment cache and dashboard counts.
- Added **My Appointments** to student navigation and retained the existing total-list behavior. **My History** now limits results to past or terminal appointments, uses shared status labels/tones, uses unique row keys, and shows **No feedback** only for completed appointments.
- Fixed student consultation history: it now loads `/consultations/index.php` for the signed-in student and displays the shared summary, action items, and follow-up date. Appointment list/single responses now include the shared consultation `summary` via a left join; `private_notes` is never selected. The faculty calendar panel freezes a saved record to prevent duplicate creation and points to **Consultation Records** for the full record.
- Added a shared header notification inbox (`frontend/src/shared/NotificationsButton.tsx`) for students, faculty, and administrators. It shows unread counts, loads on mount/focus/open, polls every 60 seconds, supports individual and bulk mark-read, and renders clear loading/error/empty states.
- Added a required-reason decline dialog to the faculty request queue, showing the student's reschedule note and keeping accept/decline loading and error states in place. Replaced the hard-coded faculty cancellation reason with an inline required-reason form and confirmation in the appointment panel.
- Fixed `Button` to forward native HTML attributes such as `aria-label`, added accessible labels/dialog semantics to the new actions, and made the notification dialog render through a portal so the main content cannot intercept clicks.
- Expanded `frontend/tests/browser-smoke.test.mjs` to cover the notification inbox and mark-all-read, student cancel, student reschedule, and student consultation feedback (faculty approval/completion/consultation creation through the API fixture). Added `ApiClient` fixtures for the temporary student/faculty pair and availability override.
- Updated `tools/test-cleanup.php` to remove schedule-override audit rows and report override counts for test-created data.
- Updated README feature, roles, API, UI, testing, TODO, verification, and changelog sections.
- Added a **Production Backend Backlog** to the high-priority TODO. It separates the completed local demo from production P0 work (email outbox/retry, runtime and database security, backup/restore and retention, concurrency/integrity, monitoring, server-side pagination), P1 features (consultation editing, scheduled jobs, export/deletion, versioned migrations, email notifications), and smaller P2 follow-ups.

#### P1 coverage and reschedule UX

- Expanded `frontend/tests/browser-smoke.test.mjs` with privacy placement on registration and Account Settings, dashboard stat-card navigation, faculty self-registration through the real form, Mailpit verification, pre-approval login blocking, administrator approval, purple-theme checks, and sign-in verification for the newly approved faculty account. Test-created accounts use the `e2e.browser.*` prefix and are removed in `finally`.
- Added an API regression case for the remaining appointment lifecycle: pending/confirmed/completed/rejected/cancelled transitions, cancel/reject reason requirements, repeat-action guards, direct faculty reschedules, cross-account reschedule authorization, invalid/past dates, unavailable slots, faculty overlaps, and approval conflicts after availability is blocked following a student request.
- Updated the faculty appointment panel to show the requested date/time and student note for `reschedule_requested` appointments, label approval as **Approve New Time**, keep server reschedule errors inside the reschedule form, and offer **Retry same time** / **Choose another time** actions. Appointment lists also show the reschedule-request note.
- Updated student booking conflicts to offer a **Refresh available times** retry against the live faculty-slot endpoint instead of leaving only a static error. A successful refresh clears the conflict state and prompts the student to choose another slot.
- Updated README feature, API/testing, TODO, verification, and changelog sections. The API suite now passes 16/16, the client CSRF suite 4/4, and the browser smoke test 1/1; PHP lint, TypeScript checking, and the production build pass.

#### SchedWise rebrand and frontend module split

- Renamed the system to **SchedWise** in the UI, browser title, email templates/subjects/body, API error messages, launcher dialogs, scripts, README, and demo accounts.
- Renamed configuration variables from `FCAMS_*` to `SCHEDWISE_*`, the session cookie to `SCHEDWISESESSID`, browser events to `schedwise:*`, CSV exports to `schedwise-appointments-*.csv`, backups to `schedwise-*.sql`, and the local database to `schedwise`.
- Migrated the existing local database from `fcams` to `schedwise` with user and appointment counts preserved; demo addresses now use `@schedwise.edu`.
- A pre-migration backup is stored at `.runtime/backups/pre-schedwise-migration.sql`. Because the migrated local database contained stale altered demo accounts and orphaned availability, it was then reset to the documented clean demo baseline (3 users, 0 appointments, 10 availability rows).
- Renamed the launcher files to `tools/schedwise-launcher.ps1` and `tools/schedwise-launch.vbs`, with matching SchedWise desktop shortcuts and icons.
- Split `frontend/src/App.tsx` (5,602 lines) into a 118-line root shell plus `frontend/src/shared/` primitives and `frontend/src/features/` modules for auth, student, faculty, admin, appointments, account, and legal content. No API or behavior changes were intended.
- Updated README folder map, development workflow, handoff notes, TODO, and rebrand/testing details.

#### Report filters, no-show workflow, timezone normalization, and browser coverage

- Added `backend/shared/report_filters.php` to build role-scoped report conditions and validate optional administrator `department_id`/`faculty_id` filters against active departments and non-deleted faculty accounts.
- Extended `GET /reports/summary.php`, `GET /reports/monthly.php`, and `GET /reports/export.php` with shared department/faculty filters. `monthly.php` also accepts `end_month=YYYY-MM` and anchors the six-month series to the selected month. CSV export uses exactly the same filter scope and returns filters in JSON mode.
- Added the System Analytics filter bar (month, department, faculty, clear, export) and wired the summary, chart, and CSV link to the same state. Changing department clears a faculty selection that no longer belongs to the scope.
- Added `PUT /appointments/no-show.php`. It permits faculty/admin users to mark only confirmed appointments as `no_show` after the database-clock end time, writes an audit entry, and notifies the student. The appointment panel shows **Mark no-show** only when the consultation has ended; admin/faculty appointment lists expose the same action.
- Final appointment states (`cancelled`, `rejected`, `completed`, `no_show`) now hide approve/reschedule/cancel actions and show a read-only status instead.
- Fixed the reschedule-request approval control: `reschedule_requested` appointments now show an enabled switch and specific confirmation text instead of appearing locked like a confirmed appointment.
- Added API coverage for a student reschedule request and faculty approval of the requested time.
- Added polite live regions to filtered appointment counts, audit result counts, and the report filter summary so assistive technology announces updates.
- Added `app.timezone`/`SCHEDWISE_TIMEZONE` to `backend/config.example.php` and bootstrap. PHP now defaults to `Asia/Kuala_Lumpur`, matching the local MySQL clock while `backend/shared/clock.php` remains authoritative for business-date rules.
- Expanded `frontend/tests/browser-smoke.test.mjs` to cover empty-login validation, sign-out cancellation, System Analytics department/faculty filters, and the filtered export link.
- Updated the API regression suite from 14 to 15 tests with report-filter validation, export scope, and early no-show rejection.
- Verified the successful no-show path with a temporary confirmed past appointment: the faculty session received `200` and `no_show`, and the temporary appointment, notification, and audit rows were removed afterward.
- Updated README API/config/testing sections and the high-priority TODO list.

### 2026-10-21

#### Admin audit viewer, appointment filters, empty states, and browser smoke tests

- Added `GET /audit/index.php`, an administrator-only read-only endpoint with newest-first pagination (`page`, `per_page`), search (`q`), action/entity/actor filters, date-range validation, decoded `old_values`/`new_values`, and distinct filter options. `backend/audit/index.php` uses the existing `audit_logs` table without adding a write path.
- Added three audit-log indexes to `database.sql` and the idempotent setup migration: `created_at`, `action`, and `entity_type`; actor filtering uses the existing foreign-key index.
- Added the Admin **Audit Log** view with search, action/entity/date filters, refresh, result counts, 25-entry pages, and summarized change details. Actor and IP context are shown, while entity IDs are shortened in the table. Password/token/secret-like keys in old/new values are redacted server-side.
- Added appointment search (student/faculty/topic/reason/status/date), status and From/To date filters, visible/total counts, and 8-row client-side pagination to the shared appointment list. Filtering stays within the role-scoped API result set.
- Added guided empty states to appointment lists, the Master User List, the monthly report, consultation history, faculty request queues, and the Audit Log. Added a first-run Admin Dashboard panel when only the administrator account exists.
- Added `frontend/tests/browser-smoke.test.mjs` with `playwright-core`, plus `npm run test:browser`. The test auto-detects Brave/Chrome/Edge, signs in as the seeded admin, verifies user search-as-you-type, appointment filtering, Audit Log filtering, sign-out, and seeded student/faculty routing. `tools/run-tests.ps1` now runs it after the API suite unless `-SkipBrowser` is passed; missing frontend dependencies or browsers produce a skip instead of a false failure.
- Updated the API regression suite from 13 to 14 tests with admin-only audit access, pagination/filtering, and malformed-date coverage.
- Last verified 2026-10-21: setup migration applied; PHP lint, `tsc --noEmit`, Vite production build, 14/14 API tests, 4/4 client CSRF tests, and 1/1 Playwright browser smoke test passed. The browser run produced zero JavaScript page exceptions.

#### Faculty self-registration, approval, and unique IDs

- Added `users.faculty_approval_status` (`not_required`, `pending`, `approved`, `rejected`) to `database.sql` and the additive setup migration. Existing faculty are marked approved when the column is first added.
- Public registration now accepts `student` or `faculty`. Both roles receive an automatically allocated, permanent, unique `STU-`/`FAC-` ID. Faculty profiles require a department and remain `pending` after email verification until an administrator decides.
- Added faculty-specific verification email text, approval/rejection emails, and in-app notifications.
- Login reports `faculty_approval_pending` after correct credentials and verified email, and `faculty_approval_rejected` after rejection. Pending/rejected faculty sessions are also refused by `authenticateUser()`.
- User Management shows a **Faculty approvals** panel. Approve is disabled until email verification; pending faculty cannot be activated through the generic status dropdown. `PUT /users/index.php?id=…` accepts `faculty_approval_action`.
- Hardened the ID allocator: automatic IDs are sequence-backed, unique indexes remain enforced, manually supplied IDs advance the sequence, and setup resyncs sequences to the highest stored ID.
- Updated the API regression suite to 13 tests at that stage (now 14) and added the faculty approval/rejection flow and unique-ID assertions.
- Last verified 2026-10-21: additive database migration and sequence resync applied to the local database with a fresh pre-migration backup; PHP lint, TypeScript check, Vite production build, 13/13 API tests at that stage, 4/4 client CSRF tests, Mailpit fixture and decision-email checks, and a full headless Brave student approvals and faculty initial password changes/dashboard flow passed with zero JavaScript exceptions. Multi-worker concurrency coverage remains pending.

#### Pending-approval visibility and login polish

- The Admin Dashboard Faculty card now turns amber and shows `N awaiting approval` while faculty registrations are waiting. **User Management** shows an amber count badge, and both open the existing **Faculty approvals** panel.
- Removed the hard-coded demo administrator credentials from the login screen. Demo credentials remain documented in the Demo accounts section.
- Last verified 2026-10-21: `npx tsc --noEmit` and `npm run build` passed after the change. No backend, API, schema, or launcher changes were made.

#### Admin user search as you type

- The Master User List now debounces search input by 250 ms and ignores stale responses, so names and emails appear without pressing Enter.
- Last verified 2026-10-21: `npx tsc --noEmit` and `npm run build` passed. A headless Brave check signed in as the seeded administrator and typed `elena` into the Master User List; the result count changed to one account without a keyboard submit. No backend, API, schema, or launcher changes were made.

- Fixed launcher sessions failing with permission denied under LocalAppData: local sessions now use the project's gitignored `.runtime/sessions` directory, outside the backend document root, with the PHP `-d` argument quoted for paths with spaces. Restart the launcher and sign in again after upgrading; old sessions are not migrated.
- PHP now returns 503 if session storage cannot open instead of reporting successful login without a persistent session. The frontend returns to sign-in when a protected endpoint reports 401.
- Last verified for session persistence: restarted the real launcher, all 14 API/client regression tests passed through `http://localhost:5173/api`, TypeScript checking and production build passed. High-priority TODO list unchanged.

- Fixed recovery from missing/stale browser CSRF tokens, including module hot reload and other-tab session changes: on an explicit CSRF rejection, the API client retrieves the authenticated session token and retries the rejected mutation once. Ordinary authorization errors, server errors, and network failures are never replayed; expired sessions show a sign-in instruction. Backend CSRF enforcement remains enabled.
- Last verified for CSRF recovery: `node --test tests/csrf-client.test.mjs` passed all 4 tests (account-creation replay, retry bound, expired session, unrelated errors); TypeScript checking and production build passed. High-priority TODO list unchanged. These mocked client checks supplement the earlier API checks; this pass did not create a real faculty account.

- Separated student-visible consultation summaries from private faculty notes. Only the assigned faculty receives private notes through the consultation API; administrators retain access to shared summaries. Faculty directory responses omit phone/faculty numbers for non-administrators.
- Added an explicit consultation completion action and server-confirmed notes saving with visible failures. The student records summary view is read-only instead of implying that unsaved local edits persist.
- Corrected report period labels to the current month, removed fabricated fallback totals and the hard-coded growth badge, and added a privacy notice on registration and in Account Settings > Privacy.
- Serialized booking, approval, and rescheduling using the faculty user row, with current locking reads for appointment conflicts. Existing cancelled/completed appointments remain terminal; reopening is not supported.
- Last verified 2026-10-21 for this change: TypeScript checking, Vite production build, PHP application syntax checks, and all 10 API tests passed against the local backend. The added regression covers completion, shared summaries, private-note access for faculty/admin/student, unrelated-student isolation, and minimized directory fields. Multi-worker concurrency and browser interaction tests remain outstanding.

### Privacy and operational limits (2026-10-21)

Private notes are protected by application authorization, not field encryption; database/backup operators can access stored data. Historical summaries are preserved and require review if private notes were previously copied into them. Backups, audit logs, and consultation records have no automatic retention deletion; a school-approved policy is required before collecting real records. Do not expose the local development servers or Mailpit publicly. Production requires HTTPS, debug disabled, changed demo credentials, a dedicated restricted database user, and protected backups. These operational settings depend on the deployment environment and are not automatically changed by this update.


- Fixed Windows PowerShell launcher configuration generation to write UTF-8 without a byte-order mark, preventing PHP's `strict_types declaration must be the very first statement` error. Repaired the existing local configuration without changing settings.
- Last verified 2026-10-21: local configuration passed PHP syntax validation; launcher passed PowerShell parsing. Full application startup has not been reverified in this pass. High-priority TODO list unchanged.

### 2026-10-20

- Completed security hardening pass: CSRF, origin checks, hardened sessions, rate limits, password-reset invalidation, authorization/IDOR fixes, validation, generic errors, CSV escaping, and security headers.
- Added one-click Windows launcher, stop action, hidden VBS entry point, database bootstrap, and desktop shortcuts with distinct green/red icons.
- Removed the legacy unauthenticated appointments endpoint, generated `dist`, `.vscode`, and redundant migration files.
- Added a clean demo baseline with departments, faculty/student accounts, and weekday availability.
- Fixed registration to store department IDs instead of college display labels.
- Improved registration UX: client-side name/email/password checks, clear field-level API errors, prefilled email and success notice on the login screen; the reset-password form now uses the same password policy.
- Added local password-reset delivery through Mailpit + vendored PHPMailer, automatic Mailpit startup, and a local inbox link on the reset screen.
- Added repeatable API regression tests with temporary-user cleanup.
- Added explicit demo reset, timestamped backup, and restore commands with `--yes` guards.
- Added account settings for profile editing and signed-in password changes; self-service profile updates now validate department IDs and names.
- Added verified self-registration: pending accounts, hashed 24-hour single-use verification links, Mailpit delivery, resend handling, pending-login/resend UI, and browser-link cleanup.
- Added launcher prerequisite preflight for PHP 8+, Node.js 20.19+/22.12+, npm, and MySQL, with clear guidance and optional download pages.
- Opted the registration email field out of browser autofill to avoid a Brave 1.97 browser-process crash when its email suggestion dropdown opens; custom validation and email keyboard input remain available.
- Reworked this README into the current system/handoff document.


### Account, booking, and purple dashboard update — 2026-10-21

- Implemented permanent roles and IDs, deletion with historical record preservation, email-only login, field-level warnings, one pending student booking per faculty, real faculty slot selection, clickable dashboard cards, and a purple theme.
- Applied the existing-database migration locally, including repair of duplicate legacy faculty IDs. Valid unique IDs are preserved; email/password and appointment history are retained.
- Last verified 2026-10-21: TypeScript check, Vite production build, PHP syntax checks, 12 API regression tests (including suite wrapper), and client CSRF tests. Added API coverage for pending-booking rejection, generated/duplicate IDs, rejection of ID login, immutable roles/IDs, deletion/session invalidation/history preservation, weekend overrides, blocked-boundary slots, and booked-slot exclusion. Browser interaction and multi-worker concurrency tests remain outstanding.
- High-priority TODO updated with browser coverage for these flows; larger component refactoring and timezone normalization remain pending.


### Email-only login correction - 2026-10-21

- Login now accepts email and password only, in both the frontend and API. STU/FAC IDs remain permanent account identifiers.
- Last verified 2026-10-21: TypeScript check, production build, login PHP syntax check, and all 12 API regression tests passed, including student/faculty ID-login rejection and successful email login.
- High-priority TODO unchanged; browser interaction coverage remains pending.


### Per-faculty booking rule correction - 2026-10-21

- Students may request multiple faculty while earlier requests remain pending, provided appointment times do not overlap on the same date. Only one pending/reschedule-requested request per faculty is allowed. Approved requests no longer count toward that pending limit.
- The frontend disables only faculty with an existing pending request and excludes times conflicting with the student's other pending or confirmed appointments. The API enforces exact and partial overlaps, including reschedules.
- Last verified 2026-10-21: TypeScript, production build, changed PHP syntax checks, and all 12 API regression tests passed. Extended API coverage checks overlapping requests to different faculty, adjacent non-overlapping requests, duplicate pending requests to the same faculty, and conflicting reschedules.
- High-priority TODO unchanged; browser and multi-worker concurrency coverage remain pending.


### Privacy placement and action confirmation - 2026-10-21

- Removed the privacy notice from all dashboard shells. Kept it on registration and added a Privacy tab in Account Settings.
- Added a shared purple confirmation dialog with Yes/No buttons. The default focus is No; Escape cancels. Native modal behavior isolates keyboard focus, and confirmation resolves before an action can submit.
- Added confirmation to sign-out, account deletion/status changes, account creation, schedule creation/edit/deletion/default saving, booking requests, appointment decisions/rescheduling/completion, consultation-note saving, and profile/password updates. Cancelled actions retain the current page and unsaved edits.
- Existing time-block editing now waits for the availability/override API before updating local times or showing success. Save failures remain in the panel.
- Last verified 2026-10-21: TypeScript checking, Vite production build, and all 4 client CSRF tests passed. Browser interaction checks, including the new native dialog keyboard behavior, remain pending.
- High-priority TODO updated with confirmation and privacy browser coverage.


### English interface - 2026-10-21

- All system-authored interface text must be English, regardless of the language used to request changes. Confirmation buttons now read Yes/No, and the sign-out prompt is English.
- Last verified 2026-10-21: checked frontend/backend source for remaining Tagalog UI text; TypeScript checking and the production build passed. High-priority TODO unchanged.

### Stable page alignment - 2026-10-21

- Added a stable root scrollbar gutter with a legacy browser fallback to prevent horizontal layout shifts when navigating between short and scrollable pages.
- Last verified 2026-10-21: production build passed. Visual browser verification remains pending. High-priority TODO unchanged.


### Hide local inbox links - 2026-10-21

- Removed visible Mailpit inbox links from login and password-reset pages. Mailpit startup, local email capture, and developer access at http://localhost:8025 remain available for testing. Hiding links does not add inbox authentication.
- Local Mailpit testing requires no subscription or paid email provider.
- Last verified 2026-10-21: frontend TypeScript check and production build passed. High-priority TODO unchanged.


### Real SMTP migration - 2026-10-21

- Removed automatic Mailpit download and startup. Existing tracked-process cleanup remains compatible with old launcher state.
- Removed inbox links and debug-code/verification-link UI. Local configuration now uses provider environment variables and disables debug token responses; database credentials are unchanged.
- Configure `SCHEDWISE_MAIL_HOST`, `SCHEDWISE_MAIL_PORT` (usually 587), `SCHEDWISE_MAIL_USERNAME`, `SCHEDWISE_MAIL_PASSWORD`, `SCHEDWISE_MAIL_ENCRYPTION` (`tls` or `ssl`), and `SCHEDWISE_MAIL_FROM` (a sender authorized by your provider). `SCHEDWISE_FRONTEND_URL` must be the address recipients can open for verification. Alternatively, set equivalent values in ignored `backend/config.php`; never commit credentials.
- Restart the PHP backend after changing process environment variables. Keep `app.debug` false for real delivery. Registration stays pending until verification; no SMTP credentials are configured by this change.
- Remote SMTP requires encrypted transport. There is no fallback to local Mailpit or to showing reset codes in the UI. The SMTP provider determines cost and sending limits; this code does not create a paid subscription.
- The full API/email suite requires a separately started local Mailpit fixture and explicitly configured local test mail/debug settings. Its preflight now refuses real SMTP settings to avoid sending test messages to real recipients. Do not run the full email suite against real mail credentials.
- Last verified 2026-10-21: changed PHP syntax, PowerShell parsing, TypeScript check, frontend production build, and client CSRF tests. Real delivery remains unverified pending SMTP provider credentials; full email API tests were not run against real SMTP.
- High-priority TODO: configure and verify the SMTP provider and authorized sender, then test registration/reset delivery with an intended recipient. Browser/concurrency coverage remains pending.


### Restore local Mailpit testing - 2026-10-21

- Reversed the real-SMTP migration: restored local Mailpit defaults and automatic launcher startup/download. Inbox links and on-screen debug tokens remain hidden. Local debug mode is enabled for the existing email API regression fixture. The real-SMTP setup steps above are historical and are not required for local testing.
- Last verified 2026-10-21: PHP syntax and PowerShell parsing passed. SMTP provider setup is no longer pending. High-priority SMTP configuration TODO withdrawn; browser coverage remains pending.


### Fixed account ID prefixes - 2026-10-21

- Admin account creation displays a fixed FAC- or STU- prefix and an editable digits-only suffix. Leading zeroes are preserved; supply at least four digits or leave the suffix blank to generate a unique ID. The API continues to receive the full prefixed ID, reject duplicates, and prevent changes after creation.
- Last verified 2026-10-21: TypeScript, production build, and API regressions passed. Browser interaction coverage remains pending; high-priority TODO unchanged.


### Team snapshot integration - 2026-10-21

- Imported the team's updated snapshot, including permanent account roles/IDs, email-only login, account deletion with history preservation, real faculty slot selection, shared confirmation dialogs, clickable dashboard cards, the purple theme, expanded API/client tests, and updated documentation. The Brave registration autofill workaround remains in place.
- Preserved the ignored local `backend/config.php`, `frontend/.env`, `.runtime/` data, and existing MySQL records. The setup migration only added `users.deleted_at`, permanent unique profile IDs, and account-ID sequences; it did not reset passwords or delete accounts, appointments, or audit history.
- Updated the README's current email/config statements to match the restored local Mailpit setup. Real SMTP is optional through `SCHEDWISE_MAIL_*`, not required for local use.
- Last verified 2026-10-21: PHP lint, TypeScript check, production build, 12/12 API tests at that stage, 4/4 client CSRF tests, launcher stop/start, Mailpit fixture, and a Brave role-routing plus confirmation-dialog smoke check all passed. Browser automation and multi-worker concurrency coverage were still pending at that stage.
