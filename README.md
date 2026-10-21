# FCAMS — Faculty Consultation and Appointment Management System

> **Current email setup:** Local Mailpit testing is restored. The launcher starts Mailpit automatically; inbox links remain hidden in the app. No real email provider or paid subscription is needed.


The document reserves a stable vertical scrollbar gutter so centered headers, dashboard cards, and content do not shift horizontally between short and long pages. Older browsers use an always-reserved vertical scrollbar as a fallback.

FCAMS is a local-first academic consultation platform for students, faculty, and administrators. It centralizes faculty availability, appointment requests, consultation records, notifications, and reports in one React + PHP + MySQL application.

> **Project mode:** local development/demo. The app is intentionally not deployed, but it is built with production-grade authorization, session handling, CSRF protection, validation, and error handling. Keep the same standard when extending it.

---

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

FCAMS provides:

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
| Student | Register, browse faculty, book appointments, cancel/reschedule requests, read own consultations and notifications |
| Faculty | Manage recurring availability and overrides, approve/reject/reschedule/complete appointments, write consultation records |
| Administrator | Manage accounts and roles/status, view all appointments and reports, export CSV, manage any schedule/record |

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
- Verified self-registration: new students stay `pending` until they open a hashed, 24-hour, single-use email link; demo accounts remain active and administrator-created accounts default to active with `email_verified_at` set
- Registration opts out of browser autofill on the email field to avoid a Brave 1.97 browser-process crash when its email suggestion dropdown opens; custom validation and the mobile email keyboard remain available
- Server-side role and ownership authorization on every protected resource
- Appointment conflict detection, availability checks, past-date rejection, and state-transition guards
- Consultation private notes hidden from students
- CSV formula-injection escaping
- Security headers, generic 500 responses, and `no-store` API responses
- One-click Windows launcher and stop shortcut
- Launcher preflight checks for PHP 8+, Node.js 20.19+/22.12+, npm, and MySQL; missing prerequisites get a clear dialog with the requirement and an optional download page
- Verification and password-reset delivery through a configured SMTP provider using vendored PHPMailer; no automatic Mailpit download/startup
- Account settings dialog for profile editing and signed-in password changes
- Repeatable API regression suite covering auth, CSRF, roles, verified registration, resend/verification, reset email, booking, profile, and password changes
- Explicit demo reset command and timestamped SQL backup/restore commands
- Clean demo seed: 3 accounts, 4 departments, 10 availability rows, no seeded appointments/notifications

### High-Priority TODO

#### P0 — do next

- [ ] None currently. The former dependency-preflight gap is covered by the launcher; see Implemented.

#### P1 — next quality pass

- [ ] Add browser automation for confirmation accept/cancel, privacy placement, inline form errors, dashboard card navigation, and the purple theme. API coverage for booking/IDs/deletion is in place.

- [ ] Split `frontend/src/App.tsx` into feature components. It is currently a large monolith and is the main frontend maintainability risk.
- [ ] Add pagination/search to users, appointments, and reports.
- [ ] Expand automated coverage to appointment state transitions and browser-level UI flows.
- [ ] Add an audit-log viewer for administrators.
- [ ] Add a `no_show` workflow and clearer reschedule-request UI.
- [ ] Normalize timezone display. Database time rules use the MySQL clock through `backend/shared/clock.php`; PHP is configured as Europe/Berlin while MySQL uses the local Malay Peninsula time.
- [ ] Add guided empty states and first-run onboarding for a clean database.

#### P2 — polish

- [ ] Accessibility audit (keyboard navigation, focus states, labels, contrast).
- [ ] Responsive layout review on small screens.
- [ ] Report filters by department/faculty/date.
- [ ] Email or desktop notifications in addition to in-app notifications.
- [ ] Optional branding/icon pass for the launcher and app.

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
        ├── PDO / MySQL ──▶ MySQL 127.0.0.1:3306 / database: fcams
        │
        └── SMTP ─────────▶ Mailpit 127.0.0.1:1025
                                 │
                                 └── web inbox http://localhost:8025
```

Apache is **not required** for local use. The launcher starts the PHP built-in server and Vite. Vite proxies `/api` to PHP so cookies and CSRF tokens remain same-origin. Transactional emails use the configured SMTP provider; mail remains unavailable until configured.

### Technology

| Layer | Current choice |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, Lucide icons |
| Backend | PHP 8.0+ (strict types), PDO MySQL |
| Database | MySQL 9.5 locally |
| Local tools | PowerShell launcher, VBS hidden wrapper, Windows shortcuts |
| Auth | PHP sessions + password hashing (`PASSWORD_DEFAULT`) |
| Email | Real SMTP provider; PHPMailer 7.1.1 vendored under `backend/vendor/phpmailer` |
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
│   ├── faculty/                   # directory, recurring availability, schedule overrides
│   ├── appointments/              # list/create + approve/reject/cancel/complete/reschedule
│   ├── consultations/             # consultation records and privacy filtering
│   ├── notifications/             # list and mark-read
│   ├── reports/                   # summary, monthly series, CSV export
│   ├── vendor/phpmailer/          # pinned PHPMailer 7.1.1 source + license (no Composer needed)
│   └── shared/
│       ├── auth.php               # sessions, CSRF, current user, audit, notifications
│       ├── authorization.php      # ownership and availability/conflict rules
│       ├── validation.php         # appointment, URL, password, email validation
│       ├── clock.php              # DB-consistent current date helpers
│       ├── rate_limit.php         # database-backed throttling
│       ├── verification.php       # hashed email-verification tokens and frontend links
│       └── mailer.php             # SMTP transport, verification/reset email templates
├── frontend/
│   ├── src/api.ts                 # typed API client and CSRF token holder
│   ├── src/App.tsx                # current UI (role views + account settings; refactor is a backlog item)
│   ├── src/main.tsx
│   ├── src/index.css
│   ├── .env                       # VITE_API_URL=/api (gitignored)
│   ├── .env.example
│   └── vite.config.ts             # /api proxy → 127.0.0.1:8000
├── tests/
│   └── api.test.mjs               # Node API regression suite with temporary-user cleanup
├── tools/
│   ├── setup-database.php         # safe schema/demo bootstrap and migrations
│   ├── reset-demo.php             # explicit destructive reset to the demo seed (--yes)
│   ├── backup-database.php        # timestamped SQL backup under .runtime/backups
│   ├── restore-database.php       # restore a backup (--yes; stop FCAMS first)
│   ├── test-cleanup.php           # removes e2e test users and related rows
│   ├── run-tests.ps1              # starts FCAMS if needed and runs the API suite
│   ├── fcams-launcher.ps1         # start/stop MySQL, Mailpit, PHP, Vite, browser
│   ├── fcams-launch.vbs           # hidden entry point used by shortcuts
│   ├── fcams-start.ico            # green play icon for the start shortcut
│   └── fcams-stop.ico             # red stop icon for the stop shortcut
├── database.sql                   # complete fresh schema + demo accounts + availability + verification table
├── .runtime/                      # generated logs, process IDs, backups, Mailpit data (gitignored)
└── README.md
```

Generated folders such as `frontend/node_modules`, `frontend/dist`, and `.runtime` are intentionally not part of the source handoff. `frontend/node_modules` is required to run locally but is reinstalled by the launcher when missing.

---

## 5. Roles and Permissions

### Student

- Self-register only as a student.
- Browse active faculty and availability/overrides.
- Create appointments for themselves only, with at most one request awaiting approval/rejection per faculty (including `reschedule_requested`). Requests to different faculty are allowed when their times do not overlap.
- View only their own appointments, notifications, and consultation records.
- Cancel their own pending/confirmed/reschedule-requested appointments.
- Request a reschedule (status becomes `reschedule_requested`).
- Cannot read another student's consultations.
- Cannot read faculty `private_notes`.

### Faculty

- Manage their own recurring availability and date overrides.
- View appointments only where they are the assigned faculty.
- Approve/reject pending or reschedule-requested appointments.
- Complete confirmed appointments.
- Reschedule their own appointments.
- Create consultation records for their completed appointments.
- Cannot read another faculty member's private notes through the API.

### Administrator

- List, create, search, update status, inspect, and delete accounts. Roles and STU/FAC IDs are permanent after creation, including for administrators.
- Delete removes access and hides the account from management lists; historical appointments, consultations, audit records, email, and ID reservations remain. Administrators cannot delete themselves.
- View all appointments, consultations, availability, and reports.
- Manage any schedule or appointment.
- Export CSV reports.
- Cannot set their own account to a non-active status through the self-update path.

---

### Account IDs and form feedback

Students receive `STU-` IDs (for example `STU-0124`); faculty receive `FAC-` IDs (for example `FAC-0111`). New IDs are generated automatically when omitted. Administrators can supply a unique ID of the correct prefix and at least four digits during creation. Only email and password are accepted at login. STU/FAC IDs identify account records and cannot be used to sign in. Email is also required for verification and password reset. Public registration returns the generated Student ID and displays it in the confirmation notice.

Email, password, name, ID, registration, reset-password, and booking validation errors appear below their corresponding fields. General create-account errors stay inside the account dialog. Calendar save errors appear in the active sidebar panel. Invalid inputs are marked with `aria-invalid` and associated error messages.

The privacy notice appears only during registration and under Account Settings > Privacy; it does not appear on dashboards. Sign-out, account deletion/status changes, schedule creation/edit/deletion, appointment request/approval/rejection/cancellation/rescheduling/completion, consultation-note saving, account creation, and profile/password changes require an Yes/No confirmation before processing. No or Escape cancels without submitting the action.

All dashboard summary cards are buttons. Student and faculty cards open matching appointment lists (Today/Upcoming, Pending, Completed, Total). Admin cards open all users, faculty-only users, all appointments, or completion analytics. Faculty pending requests include future dates; approvals/rejections update cached dashboard counts. The frontend uses a purple palette throughout.

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
```

Faculty/admin reschedules go directly to `confirmed`. Students can only request a new time.

### Booking and account API changes (2026-10-21)

- `GET /faculty/slots.php`: authenticated list of `{ faculty_id, date, start_minutes }` for bookable 30-minute slots; exposes no student identities or private appointment details.
- `POST /appointments/index.php`: returns 409 if another request is pending with the same faculty, or any pending/reschedule-requested/confirmed student appointment overlaps on the same date.
- `POST /auth/login.php`: the `email` parameter requires a valid email address; STU/FAC IDs are rejected with a field-specific 400 response.
- `POST /users/index.php`: field-specific validation errors; generates STU/FAC ID if omitted.
- `PUT /users/index.php?id=…`: rejects role/ID changes, including by administrators.
- `DELETE /users/index.php?id=…`: admin-only account deletion (soft delete), retaining history and rejecting self-deletion. Existing sessions stop authenticating.

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
- `private_notes` is faculty/admin-only and is removed from student API responses.

---

## 7. Database

### Current tables

| Table | Purpose |
| --- | --- |
| `roles` | student, faculty, admin |
| `users` | email login identity, STU/FAC profile identifiers, permanent role, status, password hash, verification/login timestamps, `deleted_at` |
| `account_id_sequences` | transaction-locked numeric counters for automatic STU/FAC IDs |
| `user_profiles` | name, unique permanent student/faculty number, department, program, phone |
| `departments` | stable department IDs used by profiles and registration |
| `faculty_availability` | recurring weekday time blocks |
| `schedule_overrides` | date-specific `available` or `blocked` blocks |
| `appointments` | requests, status, schedule, reasons, cancellation/reschedule metadata |
| `consultation_records` | summary, action items, private notes |
| `notifications` | in-app messages and read state |
| `audit_logs` | security/business events; actor may be null for failed logins |
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
- adds `users.deleted_at`, account ID counters, and unique indexes on student/faculty numbers
- assigns STU-/FAC- IDs to missing, malformed, or duplicate legacy profile IDs, preserving one existing ID per duplicate; login email and history are retained

It does **not** reset passwords, delete users, or wipe appointments.

The registration form maps college labels to the seeded department IDs (`ccs`, `coe`, `cba`, `cas`). Keep `departmentIds` in `frontend/src/App.tsx` in sync with the `departments` seed; the register endpoint rejects unknown department IDs.

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@fcams.edu` | `Admin123!` |
| Faculty | `elena.cruz@fcams.edu` | `Passw0rd!` |
| Student | `juan.delacruz@fcams.edu` | `Passw0rd!` |

These are local demo credentials only. Change them if the project is shared or exposed.

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

Restore a backup (stop **FCAMS** first; destructive, requires `--yes`):

```powershell
C:\xampp\php\php.exe tools\restore-database.php .runtime\backups\fcams-YYYYMMDD-HHMMSS.sql --yes
```

Backups use `mysqldump --single-transaction --set-gtid-purged=OFF` so they can be restored on the same local MySQL server without GTID conflicts. The scripts find MySQL 9.5 or XAMPP `mysqldump`/`mysql` automatically; set `FCAMS_MYSQLDUMP` or `FCAMS_MYSQL` to override the path.

---

## 8. API Reference

Base URL locally: `http://localhost:5173/api` through Vite, forwarded to PHP at `http://127.0.0.1:8000`.

All protected endpoints require a session cookie. Unsafe endpoints also require `X-CSRF-Token`.

### Authentication

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register.php` | public | Create a pending student account and email a verification link |
| POST | `/auth/verify-email.php` | public | Consume a verification token, activate the account, and invalidate other links |
| POST | `/auth/resend-verification.php` | public | Issue a new link for a pending account; generic response to prevent enumeration |
| POST | `/auth/login.php` | public | Login and issue session/CSRF token; unverified accounts return 403 `email_unverified` |
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
| POST | `/users/index.php` | admin | Create account |
| PUT | `/users/index.php?id=...` | admin or self | Update profile; admin can change role/status. Self-service cannot change role/status or institutional numbers |

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

### Consultations, notifications, reports

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET/POST | `/consultations/index.php` | role-scoped | Read/create consultation records |
| GET | `/notifications/index.php` | authenticated | Own notifications |
| PUT | `/notifications/index.php?id=...` or `{mark_all:true}` | authenticated | Mark read |
| GET | `/reports/summary.php` | authenticated | Role-scoped dashboard summary |
| GET | `/reports/monthly.php?months=...` | authenticated | Monthly series |
| GET | `/reports/export.php?format=csv` | authenticated | CSV export |
| GET | `/health.php` | public | Minimal health status |

---

## 9. Security Model

### Authentication and sessions

- Password hashes use `password_hash(..., PASSWORD_DEFAULT)`.
- Registration requires an institutional email address and a password with at least 8 characters, uppercase, lowercase, a digit, and a special character.
- The registration form mirrors these checks and displays the API's field-level validation errors; the server remains authoritative.
- The registration email field deliberately disables browser autofill (`autocomplete="off"`, an explicit field name, and `type="text"` with `inputMode="email"`). Brave 1.97 can crash in its browser process when its email autofill dropdown opens on this form; do not re-enable autofill there without testing Brave.
- Self-registered students start as `pending`. The verification token is stored only as a SHA-256 hash, expires after 24 hours, is single-use, and is invalidated when a newer link is issued. Opening the link activates the account and sets `email_verified_at`; a successful verification is idempotent for browser retries.
- Verification links point at the React app (`/?verify_token=...`), which submits the token to the API and removes it from the address bar. The raw token is never logged.
- Demo accounts are active and verified. Administrator-created accounts are marked email-verified and default to active; an administrator can also create a pending account or activate one manually.
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
- Admin-only endpoints are checked server-side.
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
- For real email, configure the `FCAMS_MAIL_*` environment variables from the example config. Set `app.frontend_url`/`FCAMS_FRONTEND_URL` to the public frontend origin so verification links are correct.
- Self-registration requires email verification. If Mailpit is unavailable, the local debug response includes a verification link, and an administrator can activate the pending account manually.
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

1. Double-click **FCAMS** on the Desktop (green play icon).
2. The launcher:
   - creates `backend/config.php` and `frontend/.env` if missing
   - starts MySQL if it is not listening
   - runs `tools/setup-database.php`
   - installs frontend dependencies if `node_modules` is missing
   - starts the PHP API, Vite, and Mailpit hidden
   - opens `http://localhost:5173`
3. Sign in with a demo account above, or register a student account.
4. New registrations are pending until the verification email is opened. Verification and password-reset emails appear in the local Mailpit inbox at `http://localhost:8025`.
5. To stop the app servers, double-click **STOP FCAMS** on the Desktop (red stop icon). MySQL is intentionally left running.

First run may take a few minutes if `npm install` is needed and Mailpit must be downloaded to `.runtime/mailpit`. Later starts are fast. The Mailpit download is pinned to v1.31.6 and requires internet once; if it cannot be downloaded, FCAMS still starts and localhost debug reset codes/verification links remain available.

### Shortcut locations

- `C:\Users\miran\OneDrive\Desktop\FCAMS.lnk` (green play icon)
- `C:\Users\miran\OneDrive\Desktop\STOP FCAMS.lnk` (red stop icon)

If the shortcuts are missing, recreate them with the paths below:

- Target: `C:\Windows\System32\wscript.exe`
- Start arguments: `"C:\Users\miran\OneDrive\Desktop\PHP FINAL\tools\fcams-launch.vbs" start`
- Start working directory: `C:\Users\miran\OneDrive\Desktop\PHP FINAL`
- Stop arguments: `"C:\Users\miran\OneDrive\Desktop\PHP FINAL\tools\fcams-launch.vbs" stop`

### Manual start

From PowerShell in the project root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\fcams-launcher.ps1 start
```

Start without opening the browser (useful for testing):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\fcams-launcher.ps1 start -NoBrowser
```

Stop:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\fcams-launcher.ps1 stop
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
- `app.allowed_origins`: front-end origins
- `db.host`, `db.port`, `db.name`, `db.user`, `db.password`, `db.charset`
- `mail.host`, `mail.port`, `mail.username`, `mail.password`, `mail.encryption`, `mail.from_email`, `mail.from_name`, `mail.timeout`

SMTP defaults to an empty host/sender, port 587, and TLS. Set the environment variables below, or enter provider values only in ignored `backend/config.php`:

```text
FCAMS_MAIL_HOST=smtp.example.com
FCAMS_MAIL_PORT=587
FCAMS_MAIL_USERNAME=...
FCAMS_MAIL_PASSWORD=...
FCAMS_MAIL_ENCRYPTION=tls
FCAMS_MAIL_FROM=no-reply@example.edu
FCAMS_FRONTEND_URL=https://fcams.example.edu
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
6. Update `frontend/src/App.tsx`, `frontend/src/api.ts`, and types together.
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

# API regression suite (starts FCAMS/Mailpit if needed; temporary data is removed)
powershell -NoProfile -ExecutionPolicy Bypass -File tools\run-tests.ps1

# Smoke test through the real launcher
powershell -NoProfile -ExecutionPolicy Bypass -File tools\fcams-launcher.ps1 start -NoBrowser
# open http://localhost:5173, sign in, exercise the changed flow
powershell -NoProfile -ExecutionPolicy Bypass -File tools\fcams-launcher.ps1 stop
```

The API suite creates a unique `e2e.*@fcams.edu` student, checks that login is blocked while pending, tests resend, opens the verification link from Mailpit, verifies the link is idempotent, then reads the reset email and deletes the test user and related rows in `finally`. It requires Mailpit on `127.0.0.1:8025`; `run-tests.ps1` starts the app and Mailpit if they are not running. The suite also signs in with the seeded admin and student accounts, so keep those demo passwords unchanged or update the test fixtures together.

Before a destructive demo reset, take a backup. Do not commit generated `frontend/dist`, `.runtime`, `backend/config.php`, or `frontend/.env`.

---

## 12. Verification Checklist

Use this before handing the project to someone:

- [ ] PHP lint passes for `backend` and `tools`.
- [ ] The launcher prerequisite dialog appears clearly for missing/old PHP, Node.js/npm, or MySQL instead of a raw error.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run build` passes.
- [ ] `FCAMS` shortcut starts the app without a terminal.
- [ ] Login works through `http://localhost:5173/api`.
- [ ] A mutation without a CSRF token returns 403.
- [ ] Student cannot read another student's consultations or private notes.
- [ ] Student cannot approve/reject/complete appointments.
- [ ] Past dates and `javascript:` meeting links are rejected.
- [ ] Admin cannot set their own account to `pending`.
- [ ] Forgot-password email arrives in Mailpit and the debug code is returned only for localhost when debug is on.
- [ ] A reset code is single-use and expires after 30 minutes.
- [ ] Registration shows clear errors for a non-institutional email, weak password, and first-name-only input.
- [ ] Typing in the registration email field does not open a browser autofill dropdown in Brave, and the custom non-institutional email error still appears.
- [ ] A successful registration creates a `pending` account, lands on login with the email prefilled, and shows the check-email notice.
- [ ] Unverified login is rejected with the resend prompt; resend sends a fresh link and invalidates the old one.
- [ ] Opening the verification link from Mailpit activates the account, shows the success notice, and removes `verify_token` from the address bar.
- [ ] Re-opening the same verification link is harmless for the verified account, while a different invalid token is rejected.
- [ ] Account settings can update the signed-in user's profile.
- [ ] A signed-in password change accepts the new password, rejects the old one, and keeps the current session valid.
- [ ] `tools/run-tests.ps1` passes all API tests.
- [ ] A backup can be created and restored after stopping the app.
- [ ] Stopping via `STOP FCAMS` closes ports 8000, 5173, and 1025/8025 (Mailpit), leaving MySQL running.

**Last verified:** 2026-10-20 — PHP lint passed; `tsc --noEmit` and Vite build passed; the API suite passed 9/9 tests covering health, login/logout, CSRF rejection, role scoping, registration validation, pending-login rejection, resend, Mailpit verification-link activation and idempotency, single-use reset, booking, profile update, and signed-in password change; a headless-browser check opened a real verification email link, showed the success notice on the login screen, and removed the token from the address bar. The registration autofill workaround was verified in Brave: the email field renders with `type=text`, `inputMode=email`, `autocomplete=off`, and `name=fcams_registration_email`, the form is `autocomplete=off`, and an invalid institutional email still shows the client-side validation message. The launcher start path passed its PHP 8.0.30/Node 25.9.0/npm/MySQL preflight, returned exit code 0, and the backend health/frontend checks returned healthy/200. Mailpit was started by the launcher on port 1025/8025; demo reset produced 3 users/4 departments/10 availability rows; a GTID-safe backup was created and restored. The desktop shortcut start/stop flow was verified in the earlier pass; run the shortcut checklist again after changing launcher or Mailpit code.

---

## 13. Troubleshooting

### The browser does not open

Open `http://localhost:5173` manually after a few seconds. Check `.runtime/logs/launcher.log`.

### Port 5173 or 8000 is already in use

Run **STOP FCAMS**. If that does not help, close the other Vite/PHP process or reboot. The launcher uses strict ports so it fails clearly instead of silently moving to another port.

### MySQL is not running

Start the `MySQL95` Windows service or MySQL from XAMPP, then click **FCAMS** again. The launcher also attempts the service and a direct `mysqld` start before showing the prerequisite dialog with the XAMPP download option.

### PHP, Node.js, or npm is missing or too old

The launcher checks for PHP 8.0+, Node.js 20.19+ or 22.12+, and npm before starting. The dialog explains what was found, what is required, and offers to open the XAMPP or Node.js download page. Install the prerequisite, then click **FCAMS** again. This check is separate from `npm install`, which retries automatically when `frontend/node_modules` is missing.

### Brave closes while typing in the registration email field

Brave 1.97 can crash inside its own autofill/password-manager UI when an email suggestion opens. The registration form deliberately opts out of autofill on the email field; keep its `autoComplete="off"`, explicit `name`, and `inputMode="email"` settings. If Brave still closes, turn off address/email autofill at `brave://settings/autofill` and password suggestions at `brave://settings/passwords`, test Incognito with extensions disabled, and check `brave://settings/help` for an update. The PHP API is not involved until **Register** is submitted.

### Login works but API calls fail

Check that `frontend/.env` contains `VITE_API_URL=/api` and that `frontend/vite.config.ts` proxies to `http://127.0.0.1:8000`. Do not point the local app at the old Apache path.

### Database setup fails

Read `.runtime/logs/database.log`. Verify `backend/config.php` credentials and that MySQL is listening on port 3306.

### `npm install` fails

Install Node.js 20.19+ (or 22.12+) and npm, then run **FCAMS** again. Check `.runtime/logs/npm-install.err.log`.

### Password reset email does not appear

Open the Mailpit inbox at `http://localhost:8025`. If the page is unavailable, check `.runtime/logs/mailpit.err.log` and whether port 1025/8025 is already occupied. The launcher downloads Mailpit on first use; an offline first run leaves the localhost debug code available instead. In local debug mode, the code is also returned only to localhost. Set `app.debug` to `true` in `backend/config.php` for local use.

### Verification email does not appear

Confirm the account is still `pending` and check the Mailpit inbox. Use **Resend verification email** on the login screen; each new link invalidates older links and expires after 24 hours. In local debug mode, the API returns a localhost-only `debug_verification_url` that the login screen shows as a fallback link. If Mailpit cannot run, an administrator can activate the account manually from user management, or use the debug link.

### Backup or restore fails

Use the MySQL 9.5 or XAMPP client tools, or set `FCAMS_MYSQLDUMP`/`FCAMS_MYSQL`. Stop **FCAMS** before restoring. Backups are created with `--set-gtid-purged=OFF`; if you restore an older dump that still contains a GTID line, MySQL will reject it with error 3546. Take a new backup with the current script instead.

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
8. `tests/api.test.mjs`
9. `frontend/src/api.ts`
10. `frontend/src/App.tsx`

Non-negotiable invariants:

- The frontend never authorizes by itself.
- Every protected endpoint calls `authenticateUser()` and checks role/ownership.
- Unsafe browser requests carry `X-CSRF-Token`.
- Students never receive `private_notes`.
- Student filters cannot override role scoping.
- Self-registered students stay pending until email verification; never auto-activate them in registration code.
- Verification and reset tokens are stored only as hashes, expire, are single-use (verification is idempotent only for an already verified account), and must never be logged.
- Date rules use `less than`/`greater than` carefully; appointment conflicts use half-open interval overlap.
- Do not reintroduce demo fallbacks, localStorage mocks, hard-coded statistics, or the deleted unauthenticated `backend/appointments.php`.
- Keep the README and TODO list current with every change.
- Mailpit is local-only. Never ship reset codes, verification links, or SMTP credentials to logs or a shared server.

Known risk areas:

- `frontend/src/App.tsx` is very large; refactor only with a clear plan and test the role flows afterward.
- Brave 1.97 can crash in its own autofill UI on the registration form. The email input is intentionally opted out of autofill; test Brave again before restoring autofill behavior.
- Email verification depends on Mailpit in local use. The localhost debug fallback and manual admin activation are intentional recovery paths, not a replacement for real SMTP in a shared environment.
- The one-click launcher is Windows-specific and assumes XAMPP PHP + a local MySQL installation. Document any path changes.
- The local database uses the root account with an empty password. Change it if the machine is shared.
- PHPMailer is vendored manually (7.1.1) because Composer is not part of the one-click stack. Update `backend/vendor/phpmailer` and its `VERSION`/`LICENSE` together if a security release requires it.
- Mailpit is downloaded from a pinned GitHub release into `.runtime/mailpit` on first launch. If the download is blocked, local email delivery is unavailable until the binary is supplied manually.
- `tools/reset-demo.php` and `tools/restore-database.php` are destructive; keep the `--yes` guard and take a backup before using either.

---

## 15. Change Log

### 2026-10-21

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
- Configure `FCAMS_MAIL_HOST`, `FCAMS_MAIL_PORT` (usually 587), `FCAMS_MAIL_USERNAME`, `FCAMS_MAIL_PASSWORD`, `FCAMS_MAIL_ENCRYPTION` (`tls` or `ssl`), and `FCAMS_MAIL_FROM` (a sender authorized by your provider). `FCAMS_FRONTEND_URL` must be the address recipients can open for verification. Alternatively, set equivalent values in ignored `backend/config.php`; never commit credentials.
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
