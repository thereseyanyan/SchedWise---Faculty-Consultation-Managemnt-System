# SchedWise — Faculty Consultation and Appointment Management System

> **Current email setup:** Outgoing messages use the SMTP sender configured in ignored `backend/config.php` or the `SCHEDWISE_MAIL_*` variables. The tracked example config defaults to local Mailpit (`127.0.0.1:1025`), but **the launcher does not start Mailpit automatically**. Start Mailpit yourself, or configure a real SMTP provider. Keep sender credentials private.

SchedWise is a local-first academic consultation platform for students, faculty, and administrators. It centralizes faculty availability, appointment requests, consultation records, notifications, and reports in one React + PHP + MySQL application.

> **Project mode:** local development/demo. The app is intentionally not deployed, but it is built with production-grade authorization, session handling, CSRF protection, validation, and error handling. Keep the same standard when extending it.

---

## Current registration and account workflow (current as of 2026-11-04)

This section describes the current code, not the older prototypes summarized in the change log.

| Area | Current behavior |
| --- | --- |
| Public student registration | Only students can self-register. The form submits a Student ID, personal email, password, name, and department. |
| Faculty self-registration | Removed. The registration form is always the Student form, and `POST /auth/register.php` returns 403 for any non-student role. |
| Student approval | Applications start `pending` with `student_approval_status = pending`. An administrator approves or rejects them from User Management. |
| Email verification | **Not required** for student approval or login. Registration sends an acknowledgement email, not a verification link. Legacy verification links are still handled for backward compatibility. |
| Student login | `POST /auth/login.php` accepts `{ identifier, password }`; students may use their Student ID or registered email. |
| Faculty accounts | Administrators create faculty accounts with an initial password. Public faculty registration is blocked in both the UI and API. |
| Faculty first login | `must_change_password = 1` forces a password change before any protected feature is available; refreshing keeps the form visible. |
| Staff login | Faculty and administrators sign in with email and password. |
| Administrator review | User Management lists pending **student** applications with Approve/Reject actions. There is no current faculty-approval panel. |
| Legacy faculty | Existing `faculty_approval_status` data is preserved. Legacy pending/rejected faculty remain blocked and require administrator attention; they cannot be activated by email verification or the generic status dropdown. |

### API contract for registration and login

- `POST /auth/register.php`: requires `student_number`, a standard email address, password, first/last names, department, and `role_id: "student"`; duplicate Student IDs or emails return 409 with field errors; returns `student_number`, `approval_required: true`, and `verification_required: false`. Non-student roles return 403.
- `POST /auth/login.php`: accepts `{ identifier, password }`. Students may provide their Student ID or registered email; faculty/admin provide email. The legacy `email` input key remains accepted as an identifier key.
- `PUT /users/index.php?id=...`: admin decisions use `{ student_approval_action: "approve" | "reject" }`; repeat/stale decisions return 409. Generic status updates cannot activate a pending or rejected student.
- `POST /users/index.php`: admin-only faculty creation, always sets `must_change_password = 1` and `faculty_approval_status = approved`.
- `GET /auth/me.php` and login responses include `must_change_password`; `POST /auth/change-password.php` validates the current/new passwords, clears the flag, and rotates CSRF. Other protected APIs reject restricted sessions with `password_change_required`.
- `POST /auth/verify-email.php`: legacy-only. It can mark an email verified and, for an already-approved student, is idempotent. It cannot bypass student approval and cannot activate legacy pending/rejected faculty.

### Validation records

- The 2026-11-04 backend fix was checked with `php -l` on the five changed files, `php tests/registration-validation.test.php` (41 passed), `node --test tests/audit-transaction.test.mjs tests/csrf-client.test.mjs` (6 passed, 0 failed), and `npx tsc --noEmit`.
- The full API and browser suites were **not** re-run during the documentation pass. They require a running app and Mailpit, and the committed browser smoke test still refuses the local SMTP fixture unless Mailpit is running and debug restrictions are satisfied.
- Claims marked **not verified** below were not reproduced in the current pass.

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
| Student | Register (admin approval required), browse faculty, book appointments, cancel or request a new time, review consultation feedback, and read notifications |
| Faculty | Manage recurring availability and overrides, approve/reject with a reason, reschedule/complete appointments, write consultation records, and read notifications |
| Administrator | Manage accounts and statuses, review student applications, create faculty accounts, view all appointment lists and reports, export CSV, and mark ended appointments as no-show |

---

## 2. Current Status

### Implemented

- React 19 + TypeScript frontend with role-based views
- PHP 8 API using PDO prepared statements
- MySQL schema with `users`, profiles, departments, availability, overrides, appointments, consultations, notifications, audit logs, password resets, email verifications, and rate limits
- Session authentication with secure cookie settings and idle/absolute timeouts
- CSRF token enforcement on state-changing requests
- Login, registration, email-verification, forgot-password, and reset-password throttling
- Student self-registration with supplied IDs and personal email; administrator approval activates the account and sends a welcome email
- Admin-only faculty creation with an enforced initial password change
- Administrator review of pending **student** applications; pending student counts appear on the Admin Dashboard and User Management badge
- Admin-only read-only **Audit Log** with search, action/entity/actor/date filters, pagination, and redacted change summaries
- Appointment lists with search, status/date filters, result counts, and 8-row client-side pagination
- System Analytics with month, department, and faculty filters shared by the summary, six-month chart, and CSV export
- No-show action for faculty/admin after the consultation end time, with audit entry and student notification
- Student cancel/reschedule-request actions from **My Appointments**, with required reason, confirmation, and conflict retry
- Header notification inbox for every role with unread count, per-notification and bulk mark-read, focus refresh, and 60-second polling; backed by the real notifications API
- Student consultation history reads real `consultation_records`; appointment responses embed only the shared `summary`
- Faculty Dashboard cards: Today's Consultations, Consultations for this week, a month calendar, recent notifications, and Today's schedule timeline
- Faculty **Appointments** page with All/Pending/Upcoming/Past/Cancelled-Declined tabs, search, date range, status filters, sort, quick views, and pagination
- **Known exception:** Faculty **Calendar & Availability** currently runs on a localStorage demo (see **Pending work**)
- Server-side role and ownership authorization on every protected resource
- Appointment conflict detection, availability checks, past-date rejection, and state-transition guards
- Private consultation notes returned only to the assigned faculty; never to students or administrators
- CSV formula-injection escaping
- Security headers, generic 500 responses, and `no-store` API responses
- One-click Windows launcher and stop shortcut; launcher preflight checks for PHP 8+, Node.js 20.19+/22.12+, npm, and MySQL
- Verification and password-reset delivery through the configured SMTP sender (Mailpit by default in the example config)
- Account settings dialog for profile editing and signed-in password changes
- Offline regression checks for registration validation, audit transactions, and client CSRF handling
- Explicit demo reset command and timestamped SQL backup/restore commands
- Clean demo seed: 3 accounts, 4 departments, 10 availability rows, no seeded appointments/notifications

### High-Priority TODO

#### P0 — do next

- [ ] None for the local demo. Production blockers are tracked in **Production Backend Backlog** below.

#### TODO

- [x] Implement student self-registration/admin decisions, Student ID or email login, admin-only faculty creation, and enforced initial password change.
- [x] Accept personal email domains and supplied Student IDs, send activation emails automatically on approval, and preserve IDs across schema setup.
- [ ] Add the final logo SVG and enable BrandLogo showMark.

### Pending work

These items are known incomplete or unverified. They are not decorative placeholders; describe them honestly until they are finished.

- [ ] **Replace the Faculty Calendar & Availability localStorage demo with real APIs.**
  - Current files: `frontend/src/features/faculty/FacultyCalendarDemoView.tsx`, `calendarDemoService.ts`, `calendarDemoState.ts`, plus the calendar dialogs and `FacultyPortal.tsx`.
  - The view seeds weekly availability rules and example events into `localStorage` under `schedwise.calendar-demo.v1`. It simulates save failures in development and says "The demo is running with temporary in-memory data."
  - Rewire it to `facultyAvailabilityApi`, `facultyScheduleOverridesApi`, and the appointment APIs already in `frontend/src/api.ts`; map real appointments onto the calendar; remove or isolate the demo service/state; keep loading, error, retry, and conflict states. Add tests before removing the demo path.
- [ ] **Verify Faculty Consultation Records and Notifications against the real API.**
  - `FacultyRecordsView.tsx` already calls `appointmentApi.list` and `consultationApi.list`.
  - `FacultyNotificationsView.tsx` and `shared/notificationsStore.ts` already call `notificationsApi.search`, `markRead`, and `markAllRead` (they are **not** mocks).
  - Confirm role scoping, pagination, empty/error/loading states, read persistence, and that `private_notes` never leaks to non-faculty.
- [ ] **UI pass: spacing and layout.** The faculty appointment work still has known spacing/layout defects (see commit `783965a`, "need spacing fix"). Review the appointment toolbar, dialogs, detail panel, dashboard cards, and small-screen layouts.
- [ ] **Shared consultation feedback editing.** Consultation records are create-only. Either add an authorized edit/versioning path or keep the UI read-only and label it clearly. If edits are added, audit old/new values and define what students see after an edit.
- [ ] **Separate faculty private notes from student-visible notes in the records UI.** The API already separates shared summaries/action items from `private_notes`; make that distinction explicit in the faculty records interface and tests.
- [ ] **Move remaining PHP-clock business rules to `backend/shared/clock.php`.** `backend/shared/authorization.php:150` uses `date('w', strtotime($date))` for the weekday; `backend/reports/summary.php:31` and `backend/reports/export.php:44` use `date('Y-m-t', strtotime($startDate))` for month-end. These can disagree with the MySQL clock around timezone/month boundaries.

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

#### Known risks and decisions pending

- **Admin cancellation reason:** `backend/appointments/cancel.php:47` only requires a reason when the caller is not an administrator. Administrators can cancel with an empty reason. Decide whether that is intended; if not, require a reason and update the admin UI/API tests.
- **Calendar demo data:** Faculty Calendar & Availability persistence and conflict behaviour are not backed by the database until the pending rewire is complete.
- **Clock source:** the PHP-clock gaps listed under **Pending work** can make weekday/month-end rules disagree with the MySQL clock.

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
        └── SMTP ─────────▶ configured sender (example default: Mailpit 127.0.0.1:1025)
                                 │
                                 └── web inbox http://localhost:8025 (only when Mailpit is running)
```

Apache is **not required** for local use. The launcher starts the PHP built-in server and Vite. Vite proxies `/api` to PHP so cookies and CSRF tokens remain same-origin. The launcher does **not** start Mailpit; start it manually if you need the local inbox, or configure a real SMTP provider.

### Technology

| Layer | Current choice |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, Lucide icons, @fontsource/inter, @fontsource/baloo-2 |
| Backend | PHP 8.0+ (strict types), PDO MySQL |
| Database | MySQL 9.5 locally |
| Local tools | PowerShell launcher, VBS hidden wrapper, Windows shortcuts |
| Auth | PHP sessions + password hashing (`PASSWORD_DEFAULT`) |
| Email | Configurable SMTP; example config defaults to Mailpit (`127.0.0.1:1025`); PHPMailer 7.1.1 vendored under `backend/vendor/phpmailer` |
| Tests | Node built-in test runner (`node:test`) against the running API |

### Request conventions

- Every successful API response uses `{ "data": ... }`.
- Errors use `{ "error": "message" }`, sometimes with `fields` for validation.
- Unsafe methods require the `X-CSRF-Token` header.
- The frontend is intended to be API-only. The current Faculty Calendar & Availability view is a known localStorage exception (see **Pending work**); do not add new localStorage mock data, demo fallbacks, or client-only authorization.

---

## 4. Folder Map

```text
SchedWise project root/
├── backend/
│   ├── bootstrap.php              # env, headers, CORS, session, CSRF, DB, error handling
│   ├── config.php                 # local DB/origin/mail/debug config (gitignored)
│   ├── config.example.php         # template for teammates
│   ├── health.php                 # safe health endpoint
│   ├── auth/                      # register, login/logout, verify/resend, forgot/reset/change password
│   ├── users/                     # admin user management + self profile
│   ├── audit/                     # admin-only paginated audit-log reader
│   ├── faculty/                   # directory, recurring availability, schedule overrides, slots
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
│   │   ├── appointments.ts
│   │   ├── auth.ts
│   │   ├── BrandLogo.tsx
│   │   ├── contexts.ts
│   │   ├── datetime.ts
│   │   ├── NotificationsButton.tsx
│   │   ├── notificationsStore.ts  # real notifications API store (not a mock)
│   │   ├── types.ts
│   │   ├── ui.tsx
│   │   └── utils.ts
│   ├── src/features/
│   │   ├── auth/                  # welcome, login/signup modals, required password change
│   │   ├── student/               # booking, history, portal
│   │   ├── faculty/
│   │   │   ├── FacultyPortal.tsx
│   │   │   ├── FacultyPortalShell.tsx
│   │   │   ├── FacultyTodayView.tsx
│   │   │   ├── FacultyAppointmentsView.tsx
│   │   │   ├── FacultyAppointmentDetailPanel.tsx
│   │   │   ├── FacultyAppointmentDialogs.tsx
│   │   │   ├── FacultyRecordsView.tsx
│   │   │   ├── FacultyNotificationsView.tsx
│   │   │   ├── FacultyCalendarDemoView.tsx   # localStorage demo (see Pending work)
│   │   │   ├── calendarDemoService.ts         # localStorage demo persistence
│   │   │   ├── calendarDemoState.ts           # localStorage demo reducer/seed
│   │   │   ├── DashboardCalendarCard.tsx
│   │   │   ├── RecentNotificationsCard.tsx
│   │   │   ├── TodayScheduleCard.tsx
│   │   │   ├── facultyCalendar.ts
│   │   │   ├── appointmentBulkState.ts
│   │   │   ├── appointmentDialogState.ts
│   │   │   ├── appointmentPanelState.ts
│   │   │   ├── AppointmentPanels.tsx
│   │   │   ├── AvailabilityRulesDialog.tsx
│   │   │   ├── CalendarDayActionDialogs.tsx
│   │   │   ├── CalendarEventCreationDialog.tsx
│   │   │   ├── CalendarEventLifecycleDialog.tsx
│   │   │   └── CalendarSchedulePrintDialog.tsx
│   │   ├── admin/                 # users, reports, audit, getting started, portal
│   │   ├── appointments/          # shared appointment list and student dialog
│   │   ├── account/               # account settings dialog
│   │   └── legal/                 # privacy notice
│   ├── src/main.tsx
│   ├── src/index.css
│   ├── tests/
│   │   ├── browser-smoke.test.mjs
│   │   ├── appointment-state.test.mjs
│   │   ├── appointment-dialog-state.test.mjs
│   │   └── appointment-bulk-state.test.mjs
│   ├── package.json               # includes the test:browser script and playwright-core dev dependency
│   ├── .env                       # VITE_API_URL=/api (gitignored)
│   ├── .env.example
│   └── vite.config.ts             # /api proxy → 127.0.0.1:8000
├── tests/
│   ├── api.test.mjs               # Node API regression suite with temporary-user cleanup
│   ├── audit-transaction.test.mjs # injected audit-failure/rollback checks
│   ├── csrf-client.test.mjs       # mocked client CSRF retry checks
│   ├── registration-validation.test.php
│   └── check-mail-fixture.php     # refuses real SMTP for the email suite
├── tools/
│   ├── setup-database.php         # safe schema/demo bootstrap and migrations
│   ├── reset-demo.php             # explicit destructive reset to the demo seed (--yes)
│   ├── backup-database.php        # timestamped SQL backup under .runtime/backups
│   ├── restore-database.php       # restore a backup (--yes; stop SchedWise first)
│   ├── test-cleanup.php           # removes e2e test users and related rows
│   ├── run-tests.ps1              # runs state/API suites (expects Mailpit; starts app if needed)
│   ├── schedwise-launcher.ps1     # start/stop MySQL, PHP, Vite, browser (does not start Mailpit)
│   ├── schedwise-launch.vbs       # hidden entry point used by shortcuts
│   ├── schedwise-start.ico        # green play icon for the start shortcut
│   └── schedwise-stop.ico         # red stop icon for the stop shortcut
├── database.sql                   # complete fresh schema + demo accounts + availability + verification table
├── .runtime/                      # generated logs, process IDs, backups, optional Mailpit data (gitignored)
└── README.md
```

`frontend/src/features/faculty/FacultyAvailabilityView.tsx` was removed during the calendar work; its functionality now lives in `FacultyCalendarDemoView.tsx` and the supporting calendar dialogs/files above. Generated folders such as `frontend/node_modules`, `frontend/dist`, and `.runtime` are intentionally not part of the source handoff. `frontend/node_modules` is required to run locally but is reinstalled by the launcher when missing.

---

## 5. Roles and Permissions

### Student

- Self-register with a Student ID and personal email. Accounts remain pending until administrator approval.
- Browse active faculty and availability/overrides.
- Create appointments for themselves only, with at most one request awaiting approval/rejection per faculty (including `reschedule_requested`). Requests to different faculty are allowed when their times do not overlap.
- View only their own appointments, notifications, and consultation records. **My Appointments** holds active/pending history; **My History** lists past/finished appointments with shared consultation feedback.
- Cancel their own pending/confirmed/reschedule-requested appointments from **My Appointments**, with a required reason and confirmation.
- Request a reschedule (status becomes `reschedule_requested`) from **My Appointments**, choosing from current faculty availability; conflicts keep the dialog open with a refresh action.
- Read their notification inbox from the header, including unread counts and mark-read controls.
- Cannot read another student's consultations.
- Never receive faculty `private_notes`.

### Faculty

- Receive an admin-created faculty account. Change the initial password at first login before accessing protected features. Public faculty registration is disabled.
- Manage their own recurring availability and date overrides.
- View appointments only where they are the assigned faculty.
- Approve pending or reschedule-requested appointments. Declining requires a written reason, which is sent to the student.
- Complete confirmed appointments.
- Reschedule their own appointments. Cancelling requires a written reason and confirmation.
- Create consultation records for their completed appointments. Once saved, the calendar form is read-only; the complete record, including private notes, remains available in **Consultation Records**.
- Read their notification inbox from the header.
- See the four most recent notifications on the Faculty Dashboard, mark one or all as read without leaving the page, and open the full inbox from the card.
- See a compact month calendar on the Faculty Dashboard beside recent notifications. It marks confirmed consultations with solid amber dots and pending/reschedule-requested appointments with hollow amber dots, supports previous/next/Today navigation, and opens the existing **Calendar & Availability** view from its footer.
- See a full-width **Today's schedule** timeline at the bottom of the Faculty Dashboard. It positions real active appointments by start and end time, places overlapping appointments side by side, marks pending and reschedule requests, shows today's open availability, a NOW marker, conflict and needs-closing counts, and opens the existing appointment panel.
- The **Calendar & Availability** view itself is currently a localStorage demo; see **Pending work**. The dashboard month calendar and timeline use real appointment data.
- Receive `private_notes` only for consultations they are assigned to. Other faculty cannot read them through the API.

### Administrator

- List, create, search, update status, inspect, and delete accounts. Roles and STU/FAC IDs are permanent after creation, including for administrators. Master User List search filters as you type after a 250 ms debounce; pressing Enter is not required.
- Review self-registered **student** applications in the **Student applications** panel or the pending-account row; approve or reject them. Pending/rejected students cannot be activated through the ordinary status dropdown.
- See the pending student count on the Admin Dashboard and as an amber badge on **User Management**; both open the review panel.
- Create faculty accounts with an initial password. Faculty self-registration is not available.
- Delete removes access and hides the account from management lists; historical appointments, consultations, audit records, email, and ID reservations remain. Administrators cannot delete themselves.
- View all appointment lists and reports. Administrator API access can also read role-scoped consultation, availability, and schedule data; the UI exposes appointment oversight rather than schedule editing.
- Review the read-only **Audit Log** with search, action/entity/date filters, result counts, and 25-entry server-side pages. The endpoint is administrator-only.
- Mark ended confirmed appointments as no-show from the appointment list.
- Export CSV reports.
- Cannot set their own account to a non-active status through the self-update path.
- Do **not** receive `private_notes`; administrators receive shared consultation summaries only.

---

### Account IDs and form feedback

Students provide their own Student ID during public registration; existing `STU-` IDs remain usable. IDs preserve leading zeroes and accept letters, digits, dots, underscores, and hyphens (up to 100 characters). Duplicate Student IDs and emails are rejected. Admin-created faculty receive generated `FAC-` IDs, or an admin can supply a unique `FAC-` ID with at least four digits. Students can sign in with their Student ID or registered email and password. Faculty and administrators sign in with email and password. All account IDs and roles remain permanent.

Email, password, name, ID, registration, reset-password, and booking validation errors appear below their corresponding fields. General create-account errors stay inside the account dialog. Calendar save errors appear in the active sidebar panel. Invalid inputs are marked with `aria-invalid` and associated error messages.

The privacy notice appears only during registration and under Account Settings > Privacy; it does not appear on dashboards. Sign-out, account deletion/status changes, schedule creation/edit/deletion, appointment request/approval/rejection/cancellation/rescheduling/completion, consultation-note saving, account creation, and profile/password changes require a Yes/No confirmation before processing. No or Escape cancels without submitting the action.

Dashboard summary cards open matching appointment lists where one exists; the Faculty **Consultations for this week** card is a read-only summary. Student and faculty cards open matching appointment lists (Today/Upcoming, Pending, Completed, Total). Admin cards open all users, faculty-only users, all appointments, or completion analytics. The Admin dashboard shows the pending **student** application count. Faculty pending requests include future dates; approvals/rejections update cached dashboard counts. The Faculty Dashboard also pairs a compact month calendar with recent notifications: the calendar shows real consultation dots, month navigation with **Today**, a two-item legend, and a footer link to **Calendar & Availability**. A full-width timeline below that row shows today's active appointments and open availability, with conflict and needs-closing chips. The frontend uses a purple palette throughout.

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

When an appointment is `reschedule_requested`, the faculty panel shows the requested date/time and the student's note in an amber summary, and the approval switch is labelled **Approve New Time**. The backend stores the pre-request time in `reschedule_from_date`, `reschedule_from_start_minutes`, and `reschedule_from_end_minutes` so the panel can show both slots. If the server rejects a move because the slot was taken or the faculty is no longer available, the error stays in the reschedule form with **Retry same time** and **Choose another time** actions; the form is not closed and the notes error area is not reused. Student booking conflicts show a **Refresh available times** action that reloads faculty slots before the student tries again.

Students use **My Appointments** for active requests and **My History** for past/finished consultations. Cancelling or requesting a new time opens one dialog with a required reason, a final Yes/No confirmation, and (for reschedules) the faculty member's currently available slots. A conflict keeps the dialog open and exposes **Refresh available times**. Successful actions update the appointment cache and dashboard counts. The header notification inbox is shared by all roles: it shows unread counts, marks one or all notifications read, reloads when the window regains focus, and polls every 60 seconds. Student history reads the consultation API for shared summaries and action items; the appointment list includes only `summary`, never `private_notes`.

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
- Cancellation reasons are required for students/faculty. Administrators can currently cancel without a reason; see **Known risks and decisions pending**.

### Consultation privacy

- `summary` and `action_items` are student-visible.
- Appointment responses embed only the shared `summary`; `action_items` and follow-up data come from `/consultations/index.php`.
- `private_notes` is returned **only to the assigned faculty** and removed from every other role, including administrators, in `backend/consultations/index.php:75-79`. Appointment responses never select it.

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
| `appointments` | requests, status, schedule, reasons, cancellation/reschedule metadata (including `reschedule_from_*` snapshot columns) |
| `consultation_records` | summary, action items, private faculty notes |
| `notifications` | in-app messages and read state |
| `audit_logs` | security/business events; actor may be null for failed logins; indexes support newest-first admin filtering by date, action, and entity, while actor lookups use the foreign-key index |
| `password_resets` | hashed, expiring, single-use reset codes |
| `email_verifications` | hashed, expiring, single-use legacy verification links |
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
- adds appointment reschedule snapshot columns when missing
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

These are local demo credentials only. The login screen does not display them; use this table for local demo access. Change them if the project is shared or exposed.

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
| POST | `/auth/register.php` | public | Submit a pending **student** application with supplied Student ID, personal email, and password; non-student roles return 403 |
| POST | `/auth/verify-email.php` | public | Handle legacy verification links; pending student approval or faculty activation is not bypassed |
| POST | `/auth/resend-verification.php` | public | Issue a new link for a legacy pending unverified account; generic response to prevent enumeration |
| POST | `/auth/login.php` | public | Login by student ID or registered email (staff use email); pending/rejected students receive 403; new faculty sessions require password change |
| POST | `/auth/logout.php` | authenticated + CSRF | Destroy session |
| GET | `/auth/me.php` | authenticated | Current user, timezone, and CSRF token |
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

`old_values` and `new_values` are decoded JSON objects when valid. Keys matching password, token, secret, hash, API-key, reset-code, or verification-code patterns are replaced with `[redacted]` before the response is sent. The response includes actor name/email; entity IDs are truncated by the client. No update or delete route exists for audit rows.

### Faculty

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/faculty/index.php` | authenticated | Active faculty directory |
| GET | `/faculty/slots.php` | authenticated | Bookable 30-minute slots for approved faculty |
| GET/POST/PUT/DELETE | `/faculty/availability.php` | role/ownership rules | Recurring availability |
| GET/POST/PUT/DELETE | `/faculty/schedule_overrides.php` | role/ownership rules | Date-specific overrides |

### Appointments

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/appointments/index.php` | authenticated | Role-scoped list/filter |
| POST | `/appointments/index.php` | student | Create own request |
| PUT | `/appointments/approve.php?id=...` | faculty/admin | Approve |
| PUT | `/appointments/reject.php?id=...` | faculty/admin | Reject with reason |
| PUT | `/appointments/cancel.php?id=...` | owner/faculty/admin | Cancel with reason (admin reason currently optional) |
| PUT | `/appointments/reschedule.php?id=...` | owner/faculty/admin | Reschedule |
| PUT | `/appointments/complete.php?id=...` | faculty/admin | Mark completed |
| PUT | `/appointments/no-show.php?id=...` | faculty/admin | Mark a confirmed appointment as a no-show after its end time |

### Consultations, notifications, reports

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET/POST | `/consultations/index.php` | role-scoped | Read/create consultation records; `private_notes` only for the assigned faculty |
| GET | `/notifications/index.php` | authenticated | Own notifications |
| PUT | `/notifications/index.php?id=...` or `{mark_all:true}` | authenticated | Mark read |
| GET | `/reports/summary.php?year=...&month=...&department_id=...&faculty_id=...` | authenticated | Role-scoped dashboard summary; admin filters are optional |
| GET | `/reports/monthly.php?months=...&end_month=YYYY-MM&department_id=...&faculty_id=...` | authenticated | Six-month series ending at the selected month |
| GET | `/reports/export.php?format=csv&year=...&month=...&department_id=...&faculty_id=...` | faculty/admin | CSV export using the same report filters |
| GET | `/health.php` | public | Minimal health status |

The Faculty Calendar & Availability view is not currently backed by these endpoints; it is a localStorage demo. See **Pending work**.

---

## 9. Security Model

### Authentication and sessions

- Password hashes use `password_hash(..., PASSWORD_DEFAULT)`.
- Registration requires a valid personal or institutional email address, a supplied Student ID, and a password with at least 8 characters, uppercase, lowercase, a digit, and a special character.
- The registration form mirrors these checks and displays the API's field-level validation errors; the server remains authoritative.
- The registration email field deliberately disables browser autofill (`autocomplete="off"`, an explicit field name, and `type="text"` with `inputMode="email"`). Brave 1.97 can crash in its browser process when its email autofill dropdown opens on this form; do not re-enable autofill there without testing Brave.
- Students self-register as `pending` and need an administrator decision. Email verification is **not** required for approval or login.
- Legacy verification links may mark an email verified. They cannot bypass student approval and cannot activate legacy pending/rejected faculty. Historical verification behavior: the token is stored only as a SHA-256 hash, expires after 24 hours, is single-use, and is invalidated when a newer link is issued. Verification is idempotent for browser retries.
- Verification links point at the React app (`/?verify_token=...`), which submits the token to the API and removes it from the address bar. The raw token is never logged.
- Pending and rejected student applications are blocked on every request even if their raw status is active. Legacy pending/rejected faculty also remain blocked. Approval/rejection is admin-only and uses a separate action so the ordinary status dropdown cannot bypass review.
- Approval and rejection send a decision email and an in-app notification without exposing tokens or credentials.
- Demo accounts are preserved. Only faculty accounts can be created by an administrator; newly created faculty must change the initial password before accessing protected features.
- Session cookie is HttpOnly, SameSite=Lax, strict mode, and Secure automatically on HTTPS.
- Session ID is regenerated on login.
- Idle timeout: 2 hours. Absolute timeout: 12 hours.
- A password reset changes the password fingerprint and invalidates existing sessions.
- A signed-in password change verifies the current password, rejects reuse of the current password, invalidates other sessions, clears outstanding reset codes, and keeps the current session valid.
- Inactive/suspended users are rejected on every request. Pending/rejected students receive specific codes (`student_approval_pending` / `student_approval_rejected`); email verification is not a login gate in the current flow.
- Password-reset codes are stored only as SHA-256 hashes, expire after 30 minutes, and are single-use.
- Verification and reset emails are delivered through the configured SMTP sender; tokens/codes are never written to logs. The admin UI has no reset-code or verification-token screen and cannot retrieve the hashes.

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
- `private_notes` are returned only to the assigned faculty; students and administrators never receive them.

### Output and data handling

- SQL uses prepared statements.
- Validation errors return field-level messages.
- Server errors log details but return generic JSON.
- CSV cells beginning with spreadsheet formula characters are escaped.
- API responses use `Cache-Control: no-store` and security headers.

### Local-only caveats

- HTTP is used locally. Add HTTPS before any shared deployment.
- `backend/config.php` can enable debug locally so password-reset codes and verification links are also returned to localhost. Never enable debug on an exposed server.
- Mailpit binds to `127.0.0.1` only when it is started manually. The inbox at `http://localhost:8025` is a local developer tool, not a production mail service.
- For real email, configure the `SCHEDWISE_MAIL_*` environment variables from the example config. Set `app.frontend_url`/`SCHEDWISE_FRONTEND_URL` to the public frontend origin so verification links are correct.
- Student self-registration does not require email verification. If Mailpit is unavailable, registration still succeeds; localhost debug may return a legacy verification link for older pending accounts.
- Rate limiting uses `REMOTE_ADDR`; behind a proxy, configure trusted proxy handling first.

---

## 10. Run the App

### Prerequisites

- Windows 10/11
- PHP 8.0+ at `C:\xampp\php\php.exe` or available as `php.exe`
- MySQL 8+ listening on `127.0.0.1:3306` (the current machine uses MySQL 9.5)
- Node.js 20.19+ or 22.12+ and npm (the current machine uses Node 25.9.0)

The launcher can start the local MySQL service/direct `mysqld` process and the two app servers. It checks PHP/Node.js versions, npm, and MySQL availability first and offers the relevant download page if a prerequisite is missing, but it cannot install them silently. It does **not** start Mailpit.

### One-click (normal use)

1. Double-click **SchedWise** on the Desktop (green play icon).
2. The launcher:
   - creates `backend/config.php` and `frontend/.env` if missing
   - starts MySQL if it is not listening
   - runs `tools/setup-database.php`
   - installs frontend dependencies if `node_modules` is missing
   - starts the PHP API and Vite hidden
   - opens `http://localhost:5173`
3. Sign in with a demo account above, or register a student account. Faculty accounts are created by an administrator.
4. New student applications are pending until an administrator approves them in User Management. They do not wait for an email verification link.
5. To receive local email, start Mailpit yourself and keep the default `127.0.0.1:1025` mail settings, or configure real SMTP. The inbox is at `http://localhost:8025` while Mailpit is running.
6. To stop the app servers, double-click **STOP SchedWise** on the Desktop (red stop icon). MySQL is intentionally left running.

First run may take a few minutes if `npm install` is needed. Mailpit is not downloaded or started by the launcher; supply it yourself if you need local mail capture.

### Shortcut locations

The launcher creates SchedWise/STOP SchedWise shortcuts on the current user's Desktop. If they are missing, recreate them with the project's VBS entry point:

- Target: `C:\Windows\System32\wscript.exe`
- Start arguments: `"<project root>\tools\schedwise-launch.vbs" start`
- Start working directory: `<project root>`
- Stop arguments: `"<project root>\tools\schedwise-launch.vbs" stop`

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
| `.runtime/logs/mailpit.out.log` | Mailpit output (only if you start it manually) |
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

The tracked example defaults to `127.0.0.1:1025` with no authentication or encryption and sender `no-reply@schedwise.edu`. For a real provider, set the environment variables below (or equivalent values only in ignored `backend/config.php`); use `tls` for port 587 or `ssl` for port 465.

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

# Offline checks (no app or Mailpit required)
C:\xampp\php\php.exe tests\registration-validation.test.php
node --test tests\audit-transaction.test.mjs tests\csrf-client.test.mjs

# Full API + browser suites: start Mailpit first, then start SchedWise
powershell -NoProfile -ExecutionPolicy Bypass -File tools\run-tests.ps1

# Browser smoke test only (SchedWise must already be running and Mailpit available)
cd frontend
npm run test:browser
```

`tools/run-tests.ps1` expects Mailpit on `127.0.0.1:1025`; start it manually before running the suite. The launcher starts only the app servers. If Mailpit is missing, the script refuses to run the email-dependent tests rather than sending messages to a real provider.

The API suite creates a unique `e2e.*@schedwise.edu` student, checks that login is blocked while pending, confirms `verification_required` is false, approves the student as an administrator, checks the approval email, and removes test data in `finally`. It also verifies that faculty self-registration returns 403, admin-created faculty must change the initial password, and rejected students cannot sign in. It covers appointment transitions, reasons, reschedule conflicts, authorization, report filters, consultation privacy (including `private_notes`), and audit filtering.

The browser smoke test uses `playwright-core` and launches an installed Chromium-based browser (Brave first, then Chrome, then Edge). It checks login validation, student registration/approval, admin faculty creation, forced password change across reloads, dashboard navigation, booking, student cancel/reschedule, consultation feedback, admin search/filters, the Audit Log, report filters/export, and role routing. It requires Mailpit for email assertions. The committed test is **not verified in the current documentation pass**; the last recorded run was blocked by the local SMTP fixture safety check.

Before a destructive demo reset, take a backup. Do not commit generated `frontend/dist`, `.runtime`, `backend/config.php`, or `frontend/.env`.

---

## 12. Verification Checklist

Use this before handing the project to someone:

- [ ] PHP lint passes for `backend` and `tools`.
- [ ] The launcher prerequisite dialog appears clearly for missing/old PHP, Node.js/npm, or MySQL instead of a raw error.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run build` passes.
- [ ] `SchedWise` shortcut starts the app without a terminal.
- [ ] The launcher does **not** start Mailpit; a manually started Mailpit is reachable at `http://localhost:8025`.
- [ ] Login works through `http://localhost:5173/api`.
- [ ] A mutation without a CSRF token returns 403.
- [ ] Student cannot read another student's consultations or private notes.
- [ ] Student cannot approve/reject/complete appointments.
- [ ] Past dates and `javascript:` meeting links are rejected.
- [ ] Admin cannot set their own account to `pending`.
- [ ] Forgot-password email arrives in Mailpit when Mailpit is running; the debug code is returned only for localhost when debug is on.
- [ ] A reset code is single-use and expires after 30 minutes.
- [ ] Registration accepts personal email and shows clear errors for malformed email, missing/invalid Student ID, duplicate IDs, weak password, and first-name-only input.
- [ ] A successful student registration creates a `pending` account with the supplied Student ID, lands on login with the Student ID prefilled, and shows the pending administrator approval notice. No email-verification step is required.
- [ ] Public faculty registration is unavailable in the UI and rejected by the API with 403.
- [ ] Admin-created faculty must change the initial password before accessing the Faculty Dashboard, including after a reload.
- [ ] Student approval sends an activation/welcome email and in-app notification; approved students can sign in with either their ID or registered email. Rejection blocks login with `student_approval_rejected`.
- [ ] A legacy student email-verification link cannot bypass pending administrator approval.
- [ ] A legacy faculty verification link cannot activate a pending/rejected faculty account.
- [ ] Automatic STU/FAC IDs are unique and sequential; manually supplied IDs advance the sequence, and duplicate IDs are rejected.
- [ ] The Admin **Audit Log** is visible only to administrators; search, action/entity/date filters, and pagination work, and malformed dates are rejected.
- [ ] Appointment lists filter by search/status/date and paginate; clearing filters restores the role-scoped list.
- [ ] System Analytics filters by month, department, and faculty; the chart and CSV link follow the selected scope and unknown filters are rejected.
- [ ] A confirmed appointment can be marked `no_show` only after its end time; the student receives an in-app notification and final appointments cannot be rescheduled or cancelled.
- [ ] A `reschedule_requested` appointment shows the requested date/time and student note; approval is labelled as confirming the new time; a server conflict keeps the reschedule form open with retry and choose-another-time actions.
- [ ] The student **My Appointments** dialog cancels with a required reason, requests a new time from live slots, and updates the list/counts without a reload.
- [ ] The header notification inbox shows the unread count, opens for every role, marks one or all messages read, and refreshes after approvals/completions.
- [ ] **My History** shows only past/finished appointments and opens the shared consultation summary, action items, and follow-up date; private notes never appear.
- [ ] Administrators do not receive `private_notes` from the consultation API.
- [ ] Faculty decline and cancel forms reject an empty reason and show server errors inline; saved consultation forms do not allow a duplicate create.
- [ ] Administrators can currently cancel without a reason (documented known risk); decide whether to change this.
- [ ] The privacy notice appears during registration and under Account Settings > Privacy, and not on any dashboard.
- [ ] PHP reports `Asia/Kuala_Lumpur` (or the configured `SCHEDWISE_TIMEZONE`) and formatted dates match MySQL's local clock.
- [ ] Empty appointment/user/report/history/audit views explain the next action, and a clean database shows the Admin first-run setup panel.
- [ ] Account settings can update the signed-in user's profile.
- [ ] A signed-in password change accepts the new password, rejects the old one, and keeps the current session valid.
- [ ] `tools/run-tests.ps1` passes all API tests and the browser smoke test (requires Mailpit).
- [ ] `node --test tests\csrf-client.test.mjs` passes all client CSRF retry tests.
- [ ] A backup can be created and restored after stopping the app.
- [ ] Stopping via `STOP SchedWise` closes ports 8000 and 5173, leaving MySQL running.

**Last verified:** 2026-10-27 — faculty header search, Faculty Dashboard "Today's Consultations" metric, and "Consultations for this week" card. `npx tsc --noEmit` and `npm run build` passed. A headless Chrome run against seeded faculty data showed the daily card at **1 confirmed** for the local date while a future confirmed appointment was excluded; clicking the card opened **Today Appointments**. The weekly card used the `en-US` range **2026-10-25 through 2026-10-31**, showed **1**, and excluded the confirmed **2026-11-05** appointment; its label wrapped without clipping at 1920x1080, 1440x900, 1366x768, 1024x768, 768x900, and 640x900. The 375x667 view remains limited by the pre-existing fixed 248px faculty sidebar. Remaining console noise was limited to the pre-existing favicon 404 and two `/api/auth/me.php` 401s. The committed browser smoke test remained blocked by the local SMTP fixture safety check. **This paragraph was not reproduced during the 2026-11-04 documentation pass.** Prior timeline and calendar runs (2026-10-26) are **not verified** here.

The 2026-11-04 backend fix was checked offline (PHP lint, registration validation, audit/CSRF node tests, TypeScript). Full API and browser suites were not run because Mailpit is not auto-started.

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

### The browser smoke test skips, cannot launch a browser, or fails on email

Run `npm install` in `frontend` so `playwright-core` is present, then run `tools\run-tests.ps1` or `npm run test:browser` from `frontend` while SchedWise is running. Start Mailpit first; the suite asserts on captured mail and refuses real SMTP. The test auto-detects Brave, Chrome, and Edge on Windows. Set `SCHEDWISE_BROWSER_PATH` to a full executable path if the browser is installed elsewhere. A skip message is expected when no supported Chromium-based browser exists.

### Login works but API calls fail

Check that `frontend/.env` contains `VITE_API_URL=/api` and that `frontend/vite.config.ts` proxies to `http://127.0.0.1:8000`. Do not point the local app at the old Apache path.

### Database setup fails

Read `.runtime/logs/database.log`. Verify `backend/config.php` credentials and that MySQL is listening on port 3306.

### `npm install` fails

Install Node.js 20.19+ (or 22.12+) and npm, then run **SchedWise** again. Check `.runtime/logs/npm-install.err.log`.

### Password reset or approval email does not appear

Start Mailpit manually and open `http://localhost:8025`, or configure real SMTP in `backend/config.php`/`SCHEDWISE_MAIL_*` and restart PHP. The launcher does not start Mailpit. If Mailpit is unavailable, localhost debug may still return a reset code. Set `app.debug` to `true` in `backend/config.php` for local use.

### A legacy verification email does not appear

Students do **not** need email verification in the current workflow; an administrator approves them. For legacy pending accounts, confirm the account is still `pending`, start Mailpit, and use **Resend verification email** on the login screen. Each new link invalidates older links and expires after 24 hours. A legacy pending/rejected faculty account cannot be activated by verification or early approval; an administrator must correct its status/approval data.

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
- `private_notes` are returned only to the assigned faculty; students and administrators never receive them.
- Student filters cannot override role scoping.
- Audit rows are administrator-only, read-only, and must not expose passwords, tokens, or other secrets in summaries.
- Self-registered students stay pending until administrator approval. Email verification is not an approval prerequisite. Faculty accounts are admin-created; never re-enable public faculty registration or auto-activate a legacy pending/rejected faculty account.
- Pending/rejected faculty cannot be activated through the generic status dropdown or an active status alone.
- Verification and reset tokens are stored only as hashes, expire, are single-use (verification is idempotent only for an already verified account), and must never be logged.
- Date rules use `less than`/`greater than` carefully; appointment conflicts use half-open interval overlap.
- Do not add new demo fallbacks, localStorage mocks, hard-coded statistics, or the deleted unauthenticated `backend/appointments.php`. The existing Faculty Calendar demo is a known exception to remove (see **Pending work**).
- Keep the README and TODO list current with every change.
- Mailpit is local-only and is not started by the launcher. Never ship reset codes, verification links, or SMTP credentials to logs or a shared server.

Known risk areas:

- Keep feature code inside `frontend/src/features/...` and shared primitives inside `frontend/src/shared/`; run the role flows and full test suite after moving components between modules.
- Brave 1.97 can crash in its own autofill UI on the registration form. The email input is intentionally opted out of autofill; test Brave again before restoring autofill behavior.
- Email delivery depends on the configured SMTP sender. In local use, start Mailpit manually; it is not a replacement for real SMTP in a shared environment.
- The one-click launcher is Windows-specific and assumes XAMPP PHP + a local MySQL installation. Document any path changes.
- The local database uses the root account. Change it if the machine is shared.
- PHPMailer is vendored manually (7.1.1) because Composer is not part of the one-click stack. Update `backend/vendor/phpmailer` and its `VERSION`/`LICENSE` together if a security release requires it.
- Browser smoke tests require `frontend/node_modules/playwright-core` and a local Chromium-based browser. They launch an installed Brave/Chrome/Edge executable rather than downloading a browser; set `SCHEDWISE_BROWSER_PATH` if auto-detection fails.
- `tools/reset-demo.php` and `tools/restore-database.php` are destructive; keep the `--yes` guard and take a backup before using either.
- Faculty Calendar & Availability is still a localStorage demo; do not treat its data as authoritative.
- Administrators can cancel an appointment with an empty reason; decide whether to enforce the same required-reason rule as other roles.

---

## 15. Change Log

Short, newest first. Older superseded entries were removed; use `git log` for full history.

### 2026-11-04 — Faculty dashboard work

One line per commit, from `git show --stat`:

- `783965a` — Faculty appointment spacing/dialog work: added `reschedule_from_*` snapshots to `approve.php`/`reschedule.php` and `database.sql`, timezone to `me.php`, and expanded `FacultyAppointmentsView`, `FacultyAppointmentDialogs`, the detail panel, three appointment state helpers, and tests (21 files, +2906/−460).
- `6ef9dc7` — Faculty design, space maximized: reworked `FacultyPortalShell` and adjusted the dashboard calendar/notifications/timeline cards (6 files, +190/−195).
- `7d8e882` — Faculty schedule timeline and decline dialog updates in `FacultyTodayView` (1 file, +29/−29).
- `005ec01` — Faculty calendar/recent notifications adjustment in `FacultyPortal` (1 file, −1).
- `60166a8` — Faculty needs-response and upcoming appointments in `FacultyTodayView` (1 file, +256/−184).
- `8eba665` — Faculty next-up banner and summary cards in `FacultyPortal` (1 file, +4/−4).
- `af257e9` — Faculty next-up banner and summary cards: `FacultyPortal`, `index.css`, `BrandLogo`, and `ui` (4 files, +298/−120).

### 2026-10-27 — Faculty dashboard metrics

- Today's Consultations counts only confirmed appointments on the local calendar date and drills into Today Appointments.
- Replaced the Today's Classes placeholder with Consultations for this week; metric grid wraps cleanly.
- Faculty header redesign with scoped search, shortcuts, account settings, and notification button.

### 2026-10-24 — Student registration workflow and auth redesign

- Public student registration with supplied Student IDs and personal email; administrator approval; no email-verification prerequisite.
- Admin-only faculty creation with mandatory initial password change; public faculty registration blocked.
- Removed faculty approval UI; student applications are reviewed in User Management.
- Login/Sign Up redesigned as modals; Welcome page and shared design tokens updated.

### 2026-10-22 — Rebrand, module split, reports, and notifications

- Rebranded to SchedWise; split the 5,600-line `App.tsx` into shared modules and feature folders.
- Added report filters, no-show workflow, timezone normalization, student cancel/reschedule, consultation feedback, and the header notification inbox.
- Added the Production Backend Backlog and expanded browser coverage.

### 2026-10-21 — Security, audit, and account hardening

- Security pass: CSRF, origin checks, hardened sessions, rate limits, reset invalidation, authorization/IDOR fixes, validation, generic errors, CSV escaping, and headers.
- Added the one-click launcher, audit log, appointment filters, empty states, demo reset/backup/restore, and account ID sequences.
- Added the first API/client/browser regression coverage.

### 2026-10-20 — Initial local platform

- Local launcher, database bootstrap, demo baseline, Mailpit/PHPMailer reset delivery, API regressions, and README handoff structure.
