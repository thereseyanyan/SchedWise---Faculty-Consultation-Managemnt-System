import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const BASE_URL = (process.env.SCHEDWISE_BASE_URL || "http://localhost:5173/api").replace(/\/$/, "");
const MAILPIT_URL = (process.env.SCHEDWISE_MAILPIT_URL || "http://127.0.0.1:8025").replace(/\/$/, "");
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLEANUP_SCRIPT = path.join(ROOT, "tools", "test-cleanup.php");
const PHP =
  process.env.SCHEDWISE_PHP ||
  (existsSync("C:\\xampp\\php\\php.exe") ? "C:\\xampp\\php\\php.exe" : "php");

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class ApiClient {
  cookies = new Map();
  csrf = "";

  async request(route, { method = "GET", body, csrf = true } = {}) {
    const headers = {};
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (csrf && this.csrf && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      headers["X-CSRF-Token"] = this.csrf;
    }
    if (this.cookies.size > 0) {
      headers.Cookie = [...this.cookies.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    }

    const response = await fetch(`${BASE_URL}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });

    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];
    for (const rawCookie of setCookies) {
      const pair = rawCookie.split(";")[0];
      const separator = pair.indexOf("=");
      if (separator === -1) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value === "" || /expires=Thu, 01 Jan 1970/i.test(rawCookie)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }

    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    return { status: response.status, payload, text };
  }

  async login(email, password) {
    const response = await this.request("/auth/login.php", {
      method: "POST",
      body: { email, password },
      csrf: false,
    });
    if (response.status === 200 && response.payload?.data?.csrf_token) {
      this.csrf = response.payload.data.csrf_token;
    }
    return response;
  }
}

const localDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

async function matchingMessages(email, subjectPattern) {
  const listResponse = await fetch(`${MAILPIT_URL}/api/v1/messages`);
  if (!listResponse.ok) return [];
  const list = await listResponse.json();
  return (list.messages || []).filter(
    (message) =>
      subjectPattern.test(String(message.Subject || "")) &&
      (message.To || []).some(
        (recipient) =>
          String(recipient.Address || "").toLowerCase() === email.toLowerCase(),
      ),
  );
}

async function messageBody(message) {
  const detailResponse = await fetch(
    `${MAILPIT_URL}/api/v1/message/${encodeURIComponent(message.ID)}`,
  );
  if (!detailResponse.ok) return "";
  const detail = await detailResponse.json();
  return `${detail.Text || ""}\n${detail.HTML || ""}`;
}

async function findEmailCode(email) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const matching = await matchingMessages(email, /password reset/i);
    for (const message of matching) {
      const body = await messageBody(message);
      const match = body.match(/\b(\d{6})\b/);
      if (match) return match[1];
    }
    await sleep(300);
  }
  throw new Error(`No reset email found for ${email}. Is Mailpit running?`);
}

async function findVerificationLink(email) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const matching = await matchingMessages(email, /verify.*email|email.*verify/i);
    for (const message of matching) {
      const body = await messageBody(message);
      const match = body.match(/https?:\/\/[^\s"'<>]*verify_token=[A-Fa-f0-9]+/);
      if (match) return match[0].replace(/&amp;/g, "&");
    }
    await sleep(300);
  }
  throw new Error(`No verification email found for ${email}. Is Mailpit running?`);
}

test("SchedWise API regression suite", async (t) => {
  const runId = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const emailPrefix = `e2e.${runId}`;
  const email = `${emailPrefix}@schedwise.edu`;
  const initialPassword = "Test1234!";
  const newPassword = "NewTest1234!";
  const finalPassword = "FinalTest1234!";

  const cleanup = () => {
    const result = spawnSync(PHP, [CLEANUP_SCRIPT, emailPrefix], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      console.error(result.stdout || "");
      console.error(result.stderr || "");
      process.exitCode = 1;
    }
  };

  try {
    await t.test("health endpoint is available", async () => {
      const response = await fetch(`${BASE_URL}/health.php`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload?.data?.status, "healthy");
    });

    await t.test("login, CSRF enforcement, and logout", async () => {
      const admin = new ApiClient();
      const login = await admin.login("admin@schedwise.edu", "Admin123!");
      assert.equal(login.status, 200, login.text);
      assert.equal(login.payload?.data?.user?.role_id, "admin");
      assert.ok(admin.csrf);

      const me = await admin.request("/auth/me.php");
      assert.equal(me.status, 200, me.text);
      assert.equal(me.payload?.data?.user?.email, "admin@schedwise.edu");

      const withoutCsrf = await admin.request("/auth/logout.php", {
        method: "POST",
        csrf: false,
      });
      assert.equal(withoutCsrf.status, 403);

      const logout = await admin.request("/auth/logout.php", { method: "POST" });
      assert.equal(logout.status, 200, logout.text);
    });

    await t.test("admin-only user listing rejects a student", async () => {
      const student = new ApiClient();
      const login = await student.login("juan.delacruz@schedwise.edu", "Passw0rd!");
      assert.equal(login.status, 200, login.text);
      const users = await student.request("/users/index.php");
      assert.equal(users.status, 403);
    });

    await t.test("audit log is admin-only, paginated, and filterable", async () => {
      const admin = new ApiClient();
      const adminLogin = await admin.login("admin@schedwise.edu", "Admin123!");
      assert.equal(adminLogin.status, 200, adminLogin.text);

      const page = await admin.request("/audit/index.php?per_page=10&q=login");
      assert.equal(page.status, 200, page.text);
      assert.ok(Array.isArray(page.payload?.data?.entries));
      assert.ok(page.payload?.data?.pagination?.total >= 1);
      assert.ok(page.payload?.data?.pagination?.per_page === 10);
      assert.ok(page.payload?.data?.pagination?.total_pages >= 1);
      assert.ok(page.payload?.data?.options?.actions?.includes("login"));

      const filtered = await admin.request("/audit/index.php?action=login&per_page=10");
      assert.equal(filtered.status, 200, filtered.text);
      assert.ok(filtered.payload?.data?.entries?.every((entry) => entry.action === "login"));

      const badDate = await admin.request("/audit/index.php?date_from=not-a-date");
      assert.equal(badDate.status, 400);

      const student = new ApiClient();
      const studentLogin = await student.login("juan.delacruz@schedwise.edu", "Passw0rd!");
      assert.equal(studentLogin.status, 200, studentLogin.text);
      const denied = await student.request("/audit/index.php");
      assert.equal(denied.status, 403);
    });

    await t.test("admin reports support department, faculty, and date filters", async () => {
      const admin = new ApiClient();
      assert.equal((await admin.login("admin@schedwise.edu", "Admin123!")).status, 200);

      const faculty = new ApiClient();
      const facultyLogin = await faculty.login("elena.cruz@schedwise.edu", "Passw0rd!");
      assert.equal(facultyLogin.status, 200, facultyLogin.text);
      const facultyId = facultyLogin.payload.data.user.id;

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const monthParam = `${year}-${String(month).padStart(2, "0")}`;

      const byFaculty = await admin.request(
        `/reports/summary.php?year=${year}&month=${month}&faculty_id=${encodeURIComponent(facultyId)}`,
      );
      assert.equal(byFaculty.status, 200, byFaculty.text);
      assert.equal(byFaculty.payload?.data?.filters?.faculty_id, facultyId);
      assert.ok(
        byFaculty.payload?.data?.statistics?.top_faculty?.every(
          (row) => row.id === facultyId,
        ),
      );

      const byDepartment = await admin.request(
        `/reports/summary.php?year=${year}&month=${month}&department_id=ccs`,
      );
      assert.equal(byDepartment.status, 200, byDepartment.text);
      assert.equal(byDepartment.payload?.data?.filters?.department_id, "ccs");

      const monthly = await admin.request(
        `/reports/monthly.php?months=3&end_month=${monthParam}&faculty_id=${encodeURIComponent(facultyId)}`,
      );
      assert.equal(monthly.status, 200, monthly.text);
      assert.equal(monthly.payload?.data?.end_month, monthParam);
      assert.equal(monthly.payload?.data?.series?.length, 3);
      assert.equal(monthly.payload?.data?.filters?.faculty_id, facultyId);

      const exported = await admin.request(
        `/reports/export.php?year=${year}&month=${month}&faculty_id=${encodeURIComponent(facultyId)}&format=json`,
      );
      assert.equal(exported.status, 200, exported.text);
      assert.equal(exported.payload?.data?.filters?.faculty_id, facultyId);

      const invalid = await admin.request("/reports/summary.php?department_id=not-a-department");
      assert.equal(invalid.status, 400);
    });

    await t.test("registration rejects weak passwords and unknown departments", async () => {
      const weak = await new ApiClient().request("/auth/register.php", {
        method: "POST",
        csrf: false,
        body: {
          email,
          password: "password",
          first_name: "Automated",
          last_name: "Test",
          role_id: "student",
          department_id: "ccs",
          program: "BS Computer Science",
        },
      });
      assert.equal(weak.status, 400);
      assert.ok(weak.payload?.fields?.password);

      const badDepartment = await new ApiClient().request("/auth/register.php", {
        method: "POST",
        csrf: false,
        body: {
          email,
          password: initialPassword,
          first_name: "Automated",
          last_name: "Test",
          role_id: "student",
          department_id: "not-a-department",
          program: "BS Computer Science",
        },
      });
      assert.equal(badDepartment.status, 400);
      assert.ok(badDepartment.payload?.fields?.department_id);
    });

    await t.test("verified registration, forgot-password email, and reset", async () => {
      const registration = await new ApiClient().request("/auth/register.php", {
        method: "POST",
        csrf: false,
        body: {
          email,
          password: initialPassword,
          first_name: "Automated",
          last_name: "Test",
          role_id: "student",
          department_id: "ccs",
          program: "BS Computer Science",
        },
      });
      assert.equal(registration.status, 201, registration.text);
      assert.equal(registration.payload?.data?.verification_required, true);
      assert.equal(registration.payload?.data?.email_sent, true);

      const pendingLogin = await new ApiClient().login(email, initialPassword);
      assert.equal(pendingLogin.status, 403);
      assert.equal(pendingLogin.payload?.code, "email_unverified");

      const resend = await new ApiClient().request(
        "/auth/resend-verification.php",
        {
          method: "POST",
          csrf: false,
          body: { email },
        },
      );
      assert.equal(resend.status, 200, resend.text);
      assert.match(resend.payload?.data?.message || "", /verification link/i);

      const verificationLink = await findVerificationLink(email);
      const verificationToken = new URL(verificationLink).searchParams.get(
        "verify_token",
      );
      assert.ok(verificationToken);

      const verified = await new ApiClient().request("/auth/verify-email.php", {
        method: "POST",
        csrf: false,
        body: { token: verificationToken },
      });
      assert.equal(verified.status, 200, verified.text);

      const reusedVerification = await new ApiClient().request(
        "/auth/verify-email.php",
        {
          method: "POST",
          csrf: false,
          body: { token: verificationToken },
        },
      );
      assert.equal(reusedVerification.status, 200);
      assert.match(reusedVerification.payload?.data?.message || "", /already verified/i);

      const invalidVerification = await new ApiClient().request(
        "/auth/verify-email.php",
        {
          method: "POST",
          csrf: false,
          body: { token: "0".repeat(64) },
        },
      );
      assert.equal(invalidVerification.status, 400);

      const afterVerification = await new ApiClient().login(email, initialPassword);
      assert.equal(afterVerification.status, 200, afterVerification.text);
      assert.equal(afterVerification.payload?.data?.user?.role_id, "student");

      const forgot = await new ApiClient().request("/auth/forgot-password.php", {
        method: "POST",
        csrf: false,
        body: { email },
      });
      assert.equal(forgot.status, 200, forgot.text);
      assert.match(forgot.payload?.data?.message || "", /if an account exists/i);

      const emailedCode = await findEmailCode(email);
      assert.match(emailedCode, /^\d{6}$/);

      const reset = await new ApiClient().request("/auth/reset-password.php", {
        method: "POST",
        csrf: false,
        body: { email, code: emailedCode, password: newPassword },
      });
      assert.equal(reset.status, 200, reset.text);

      const login = await new ApiClient().login(email, newPassword);
      assert.equal(login.status, 200, login.text);
      assert.equal(login.payload?.data?.user?.role_id, "student");

      const reused = await new ApiClient().request("/auth/reset-password.php", {
        method: "POST",
        csrf: false,
        body: { email, code: emailedCode, password: "Another1234!" },
      });
      assert.equal(reused.status, 400);
    });

    await t.test("faculty self-registration is unique, verified, and admin-approved", async () => {
      const facultyEmail = `${emailPrefix}.self-faculty@schedwise.edu`;
      const rejectedEmail = `${emailPrefix}.rejected-faculty@schedwise.edu`;

      const registerFaculty = (facultyAddress) =>
        new ApiClient().request("/auth/register.php", {
          method: "POST",
          csrf: false,
          body: {
            email: facultyAddress,
            password: initialPassword,
            first_name: "Automated",
            last_name: "Faculty",
            role_id: "faculty",
            department_id: "ccs",
          },
        });

      const register = await registerFaculty(facultyEmail);
      assert.equal(register.status, 201, register.text);
      assert.equal(register.payload?.data?.approval_required, true);
      assert.equal(register.payload?.data?.student_number, null);
      assert.match(register.payload?.data?.faculty_number || "", /^FAC-\d{4,}$/);
      const facultyNumber = register.payload.data.faculty_number;

      const unverifiedLogin = await new ApiClient().login(facultyEmail, initialPassword);
      assert.equal(unverifiedLogin.status, 403);
      assert.equal(unverifiedLogin.payload?.code, "email_unverified");

      const admin = new ApiClient();
      assert.equal((await admin.login("admin@schedwise.edu", "Admin123!")).status, 200);
      const pendingFaculty = async () => {
        const listed = await admin.request("/users/index.php?role_id=faculty&status=pending");
        assert.equal(listed.status, 200, listed.text);
        return listed.payload.data.find((row) => row.email === facultyEmail);
      };
      const pending = await pendingFaculty();
      assert.ok(pending, "Self-registered faculty was not listed as pending");
      assert.equal(pending.faculty_approval_status, "pending");
      assert.equal(pending.email_verified_at, null);

      const earlyApproval = await admin.request(
        `/users/index.php?id=${encodeURIComponent(pending.id)}`,
        { method: "PUT", body: { faculty_approval_action: "approve" } },
      );
      assert.equal(earlyApproval.status, 400, earlyApproval.text);
      assert.equal(earlyApproval.payload?.code, "faculty_email_unverified");

      const verificationLink = await findVerificationLink(facultyEmail);
      const verificationToken = new URL(verificationLink).searchParams.get("verify_token");
      assert.ok(verificationToken);
      const verified = await new ApiClient().request("/auth/verify-email.php", {
        method: "POST",
        csrf: false,
        body: { token: verificationToken },
      });
      assert.equal(verified.status, 200, verified.text);
      assert.match(verified.payload?.data?.message || "", /awaiting administrator approval/i);

      const reusedVerification = await new ApiClient().request("/auth/verify-email.php", {
        method: "POST",
        csrf: false,
        body: { token: verificationToken },
      });
      assert.equal(reusedVerification.status, 200, reusedVerification.text);
      assert.match(reusedVerification.payload?.data?.message || "", /awaiting administrator approval/i);

      const awaitingLogin = await new ApiClient().login(facultyEmail, initialPassword);
      assert.equal(awaitingLogin.status, 403);
      assert.equal(awaitingLogin.payload?.code, "faculty_approval_pending");

      const verifiedPending = await pendingFaculty();
      assert.ok(verifiedPending?.email_verified_at);

      const approved = await admin.request(
        `/users/index.php?id=${encodeURIComponent(verifiedPending.id)}`,
        { method: "PUT", body: { faculty_approval_action: "approve" } },
      );
      assert.equal(approved.status, 200, approved.text);
      assert.equal(approved.payload?.data?.status, "active");
      assert.equal(approved.payload?.data?.faculty_approval_status, "approved");
      assert.ok(
        (await matchingMessages(facultyEmail, /faculty account has been approved/i)).length > 0,
        "Approval decision email was not delivered to Mailpit",
      );

      const approvedLogin = await new ApiClient().login(facultyEmail, initialPassword);
      assert.equal(approvedLogin.status, 200, approvedLogin.text);
      assert.equal(approvedLogin.payload?.data?.user?.role_id, "faculty");
      assert.equal(approvedLogin.payload?.data?.user?.faculty_number, facultyNumber);

      const rejectedRegistration = await registerFaculty(rejectedEmail);
      assert.equal(rejectedRegistration.status, 201, rejectedRegistration.text);
      assert.notEqual(
        rejectedRegistration.payload?.data?.faculty_number,
        facultyNumber,
        "Faculty registrations must receive unique IDs.",
      );

      const rejectedLink = await findVerificationLink(rejectedEmail);
      const rejectedToken = new URL(rejectedLink).searchParams.get("verify_token");
      assert.ok(rejectedToken);
      assert.equal((await new ApiClient().request("/auth/verify-email.php", {
        method: "POST",
        csrf: false,
        body: { token: rejectedToken },
      })).status, 200);

      const rejectedList = await admin.request("/users/index.php?role_id=faculty&status=pending");
      const rejectedUser = rejectedList.payload.data.find((row) => row.email === rejectedEmail);
      assert.ok(rejectedUser);

      const rejected = await admin.request(
        `/users/index.php?id=${encodeURIComponent(rejectedUser.id)}`,
        { method: "PUT", body: { faculty_approval_action: "reject" } },
      );
      assert.equal(rejected.status, 200, rejected.text);
      assert.equal(rejected.payload?.data?.status, "disabled");
      assert.equal(rejected.payload?.data?.faculty_approval_status, "rejected");
      assert.ok(
        (await matchingMessages(rejectedEmail, /faculty registration was not approved/i)).length > 0,
        "Rejection decision email was not delivered to Mailpit",
      );

      const rejectedLogin = await new ApiClient().login(rejectedEmail, initialPassword);
      assert.equal(rejectedLogin.status, 403);
      assert.equal(rejectedLogin.payload?.code, "faculty_approval_rejected");
    });

    await t.test("student can book an available slot and cannot spoof another student", async () => {
      const student = new ApiClient();
      const login = await student.login(email, newPassword);
      assert.equal(login.status, 200, login.text);
      const studentId = login.payload.data.user.id;

      const availability = await student.request("/faculty/availability.php?active=true");
      assert.equal(availability.status, 200, availability.text);
      const rows = availability.payload?.data || [];
      assert.ok(rows.length > 0, "Seed data has no faculty availability");

      const slot = rows.find(
        (row) => Number(row.end_minutes) - Number(row.start_minutes) >= 30,
      );
      assert.ok(slot, "No 30-minute availability slot found");

      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() + 14);
      while (date.getDay() !== Number(slot.weekday)) {
        date.setDate(date.getDate() + 1);
      }

      const body = {
        student_id: studentId,
        faculty_id: slot.faculty_id,
        appointment_date: localDate(date),
        start_minutes: Number(slot.start_minutes),
        end_minutes: Number(slot.start_minutes) + 30,
        topic: "Automated test appointment",
        reason: "Created by the automated API test and removed by cleanup.",
        location: "Online",
      };

      const withoutCsrf = await student.request("/appointments/index.php", {
        method: "POST",
        body,
        csrf: false,
      });
      assert.equal(withoutCsrf.status, 403);

      const spoofed = await student.request("/appointments/index.php", {
        method: "POST",
        body: { ...body, student_id: "not-the-current-student" },
      });
      assert.equal(spoofed.status, 403);

      const created = await student.request("/appointments/index.php", {
        method: "POST",
        body,
      });
      assert.equal(created.status, 201, created.text);
      assert.equal(created.payload?.data?.status, "pending");
      assert.equal(created.payload?.data?.student_id, studentId);
      const duplicate = await student.request('/appointments/index.php', { method: 'POST', body: {
        ...body, start_minutes: body.start_minutes + 30, end_minutes: body.end_minutes + 30,
      }});
      assert.equal(duplicate.status, 409, duplicate.text);
      assert.match(duplicate.payload.error, /pending request/i);
    });

    await t.test("student can update their own profile", async () => {
      const student = new ApiClient();
      const login = await student.login(email, newPassword);
      assert.equal(login.status, 200, login.text);
      const studentId = login.payload.data.user.id;

      const updated = await student.request(
        `/users/index.php?id=${encodeURIComponent(studentId)}`,
        {
          method: "PUT",
          body: {
            first_name: "Automated",
            last_name: "Updated",
            phone: "09170000000",
            program: "BS Information Technology",
            department_id: "ccs",
          },
        },
      );
      assert.equal(updated.status, 200, updated.text);
      assert.equal(updated.payload?.data?.last_name, "Updated");
      assert.equal(updated.payload?.data?.department_id, "ccs");
      assert.equal(updated.payload?.data?.phone, "09170000000");
    });

    await t.test("signed-in password change invalidates the old password", async () => {
      const student = new ApiClient();
      const login = await student.login(email, newPassword);
      assert.equal(login.status, 200, login.text);

      const changed = await student.request("/auth/change-password.php", {
        method: "POST",
        body: {
          current_password: newPassword,
          new_password: finalPassword,
        },
      });
      assert.equal(changed.status, 200, changed.text);
      assert.ok(changed.payload?.data?.csrf_token);
      student.csrf = changed.payload.data.csrf_token;

      const me = await student.request("/auth/me.php");
      assert.equal(me.status, 200, me.text);

      const oldLogin = await new ApiClient().login(email, newPassword);
      assert.equal(oldLogin.status, 401);

      const newLogin = await new ApiClient().login(email, finalPassword);
      assert.equal(newLogin.status, 200, newLogin.text);
    });
    await t.test("consultation privacy and faculty directory minimization", async () => {
      const student = new ApiClient();
      assert.equal((await student.login(email, finalPassword)).status, 200);
      const directory = await student.request("/faculty/index.php");
      assert.equal(directory.status, 200, directory.text);
      for (const member of directory.payload.data) {
        assert.equal(Object.hasOwn(member, "phone"), false);
        assert.equal(Object.hasOwn(member, "faculty_number"), false);
      }
      const faculty = new ApiClient();
      assert.equal((await faculty.login("elena.cruz@schedwise.edu", "Passw0rd!")).status, 200);
      const appointments = await student.request("/appointments/index.php");
      const appointment = appointments.payload.data.find(row => row.topic === "Automated test appointment");
      assert.ok(appointment);
      const id = encodeURIComponent(appointment.id);
      assert.equal((await faculty.request(`/appointments/approve.php?id=${id}`, { method: "PUT" })).status, 200);
      const earlyNoShow = await faculty.request(`/appointments/no-show.php?id=${id}`, { method: "PUT" });
      assert.equal(earlyNoShow.status, 400, earlyNoShow.text);
      assert.match(earlyNoShow.payload?.error || "", /after the consultation has ended/i);
      assert.equal((await faculty.request(`/appointments/complete.php?id=${id}`, { method: "PUT" })).status, 200);
      const created = await faculty.request("/consultations/index.php", { method: "POST", body: {
        appointment_id: appointment.id, summary: "Shared follow-up instructions", private_notes: "Confidential faculty information"
      }});
      assert.equal(created.status, 201, created.text);
      const refreshedAppointments = await student.request("/appointments/index.php");
      assert.equal(refreshedAppointments.status, 200, refreshedAppointments.text);
      const refreshedRow = refreshedAppointments.payload.data.find(row => row.id === appointment.id);
      assert.equal(refreshedRow.summary, "Shared follow-up instructions");
      assert.equal(Object.hasOwn(refreshedRow, "private_notes"), false);
      assert.equal(Object.hasOwn(refreshedRow, "action_items"), false);
      const admin = new ApiClient();
      assert.equal((await admin.login("admin@schedwise.edu", "Admin123!")).status, 200);
      for (const client of [student, admin]) {
        const records = await client.request(`/consultations/index.php?appointment_id=${id}`);
        assert.equal(records.status, 200, records.text);
        assert.equal(records.payload.data.length, 1);
        assert.equal(records.payload.data[0].summary, "Shared follow-up instructions");
        assert.equal(Object.hasOwn(records.payload.data[0], "private_notes"), false);
      }
      const own = await faculty.request(`/consultations/index.php?appointment_id=${id}`);
      assert.equal(own.payload.data[0].private_notes, "Confidential faculty information");
      const outsider = new ApiClient();
      assert.equal((await outsider.login("juan.delacruz@schedwise.edu", "Passw0rd!")).status, 200);
      const hidden = await outsider.request(`/consultations/index.php?appointment_id=${id}`);
      assert.deepEqual(hidden.payload.data, []);
    });
    await t.test('account IDs, field errors, permanent roles, and deletion', async () => {
      const admin = new ApiClient();
      assert.equal((await admin.login('admin@schedwise.edu', 'Admin123!')).status, 200);
      const profile = { email: `${emailPrefix}.faculty@schedwise.edu`, password: initialPassword,
        first_name: 'Test', last_name: 'Faculty', role_id: 'faculty' };
      const invalid = await admin.request('/users/index.php', { method: 'POST', body: { ...profile, email: 'bad', password: 'weak' } });
      assert.equal(invalid.status, 400, invalid.text);
      assert.ok(invalid.payload.fields.email);
      assert.ok(invalid.payload.fields.password);
      const created = await admin.request('/users/index.php', { method: 'POST', body: profile });
      assert.equal(created.status, 201, created.text);
      const facultyId = created.payload.data.user_id;
      const account = await admin.request(`/users/index.php?id=${facultyId}`);
      assert.match(account.payload.data.faculty_number, /^FAC-\d{4,}$/);
      assert.equal(account.payload.data.student_number, null);
      const faculty = new ApiClient();
      const idLogin = await faculty.login(account.payload.data.faculty_number, initialPassword);
      assert.equal(idLogin.status, 400, idLogin.text);
      assert.ok(idLogin.payload.fields.email);
      assert.equal((await faculty.login(profile.email, initialPassword)).status, 200);
      const student = new ApiClient();
      const studentLogin = await student.login(email, finalPassword);
      assert.equal(studentLogin.status, 200, studentLogin.text);
      assert.match(studentLogin.payload.data.user.student_number, /^STU-\d{4,}$/);
      assert.equal((await new ApiClient().login(studentLogin.payload.data.user.student_number, finalPassword)).status, 400);
      const duplicateEmail = await admin.request('/users/index.php', { method: 'POST', body: profile });
      assert.equal(duplicateEmail.status, 409);
      assert.ok(duplicateEmail.payload.fields.email);
      const duplicateId = await admin.request('/users/index.php', { method: 'POST', body: { ...profile,
        email: `${emailPrefix}.duplicate@schedwise.edu`, faculty_number: account.payload.data.faculty_number,
      }});
      assert.equal(duplicateId.status, 409, duplicateId.text);
      assert.ok(duplicateId.payload.fields.faculty_number);
      const changeRole = await admin.request(`/users/index.php?id=${facultyId}`, { method: 'PUT', body: { role_id: 'student' } });
      assert.equal(changeRole.status, 400, changeRole.text);
      const changeId = await admin.request(`/users/index.php?id=${facultyId}`, { method: 'PUT', body: { faculty_number: 'FAC-9999' } });
      assert.equal(changeId.status, 400);
      assert.equal((await faculty.request(`/users/index.php?id=${facultyId}`, { method: 'DELETE' })).status, 403);
      const adminMe = await admin.request('/auth/me.php');
      assert.equal((await admin.request(`/users/index.php?id=${adminMe.payload.data.user.id}`, { method: 'DELETE' })).status, 400);
      assert.equal((await admin.request(`/users/index.php?id=${facultyId}`, { method: 'DELETE' })).status, 200);
      const listed = await admin.request('/users/index.php');
      assert.equal(listed.payload.data.some((row) => row.id === facultyId), false);
      assert.equal((await faculty.request('/auth/me.php')).status, 401);
      assert.equal((await new ApiClient().login(profile.email, initialPassword)).status, 401);
      assert.equal((await admin.request(`/users/index.php?id=${facultyId}`, { method: 'PUT', body: { status: 'active' } })).status, 404);
    });

    await t.test('bookable slots respect custom availability, blocked ranges, and weekends', async () => {
      const admin = new ApiClient();
      assert.equal((await admin.login('admin@schedwise.edu', 'Admin123!')).status, 200);
      const created = await admin.request('/users/index.php', { method: 'POST', body: {
        email: `${emailPrefix}.slots@schedwise.edu`, password: initialPassword,
        first_name: 'Test', last_name: 'Slots', role_id: 'faculty',
      }});
      assert.equal(created.status, 201, created.text);
      const facultyId = created.payload.data.user_id;
      const student = new ApiClient();
      assert.equal((await student.login(email, finalPassword)).status, 200);
      const before = await student.request('/faculty/slots.php');
      assert.equal(before.status, 200, before.text);
      assert.equal(before.payload.data.some((slot) => slot.faculty_id === facultyId), false);
      const date = new Date(); date.setDate(date.getDate() + 1);
      while (date.getDay() !== 0) date.setDate(date.getDate() + 1);
      const iso = localDate(date);
      const available = await admin.request('/faculty/schedule_overrides.php', { method: 'POST', body: {
        faculty_id: facultyId, date: iso, kind: 'available', start_minutes: 600, end_minutes: 720,
      }});
      assert.equal(available.status, 201, available.text);
      const blocked = await admin.request('/faculty/schedule_overrides.php', { method: 'POST', body: {
        faculty_id: facultyId, date: iso, kind: 'blocked', start_minutes: 630, end_minutes: 660,
      }});
      assert.equal(blocked.status, 201, blocked.text);
      const slots = await student.request('/faculty/slots.php');
      assert.equal(slots.status, 200, slots.text);
      const own = slots.payload.data.filter((slot) => slot.faculty_id === facultyId && slot.date === iso);
      assert.deepEqual(own.map((slot) => slot.start_minutes), [600, 660, 690]);
      const body = { student_id: (await student.request('/auth/me.php')).payload.data.user.id,
        faculty_id: facultyId, appointment_date: iso, start_minutes: 600, end_minutes: 630,
        topic: 'Test boundary', reason: 'Tests a slot immediately before a blocked range.' };
      const booking = await student.request('/appointments/index.php', { method: 'POST', body });
      assert.equal(booking.status, 201, booking.text);
      const other = await admin.request('/users/index.php', { method: 'POST', body: {
        email: `${emailPrefix}.other-slots@schedwise.edu`, password: initialPassword,
        first_name: 'Other', last_name: 'Faculty', role_id: 'faculty',
      }});
      assert.equal(other.status, 201, other.text);
      const otherId = other.payload.data.user_id;
      const otherAvailability = await admin.request('/faculty/schedule_overrides.php', { method: 'POST', body: {
        faculty_id: otherId, date: iso, kind: 'available', start_minutes: 600, end_minutes: 720,
      }});
      assert.equal(otherAvailability.status, 201, otherAvailability.text);
      for (const start of [600, 615]) {
        const conflict = await student.request('/appointments/index.php', { method: 'POST', body: {
          ...body, faculty_id: otherId, start_minutes: start, end_minutes: start + 30,
        }});
        assert.equal(conflict.status, 409, conflict.text);
        assert.match(conflict.payload.error, /at this time/i);
      }
      // Back-to-back requests to different faculty are allowed while both remain pending.
      const differentFaculty = await student.request('/appointments/index.php', { method: 'POST', body: {
        ...body, faculty_id: otherId, start_minutes: 630, end_minutes: 660,
      }});
      assert.equal(differentFaculty.status, 201, differentFaculty.text);
      const sameFaculty = await student.request('/appointments/index.php', { method: 'POST', body: {
        ...body, faculty_id: otherId, start_minutes: 690, end_minutes: 720,
      }});
      assert.equal(sameFaculty.status, 409, sameFaculty.text);
      assert.match(sameFaculty.payload.error, /pending request with this faculty/i);
      const rescheduledOverlap = await student.request(`/appointments/reschedule.php?id=${differentFaculty.payload.data.id}`, {
        method: 'PUT', body: { appointment_date: iso, start_minutes: 600, end_minutes: 630 },
      });
      assert.equal(rescheduledOverlap.status, 409, rescheduledOverlap.text);
      const rescheduleRequest = await student.request(`/appointments/reschedule.php?id=${differentFaculty.payload.data.id}`, {
        method: 'PUT', body: { appointment_date: iso, start_minutes: 660, end_minutes: 690, reason: 'Requested a later time' },
      });
      assert.equal(rescheduleRequest.status, 200, rescheduleRequest.text);
      assert.equal(rescheduleRequest.payload?.data?.status, 'reschedule_requested');
      const otherFaculty = new ApiClient();
      assert.equal((await otherFaculty.login(`${emailPrefix}.other-slots@schedwise.edu`, initialPassword)).status, 200);
      const approvedReschedule = await otherFaculty.request(`/appointments/approve.php?id=${differentFaculty.payload.data.id}`, { method: 'PUT' });
      assert.equal(approvedReschedule.status, 200, approvedReschedule.text);
      assert.equal(approvedReschedule.payload?.data?.status, 'confirmed');
      assert.equal(Number(approvedReschedule.payload?.data?.start_minutes), 660);
      const after = await student.request('/faculty/slots.php');
      assert.equal(after.payload.data.some((slot) => slot.faculty_id === facultyId && slot.date === iso && slot.start_minutes === 600), false);
      // Deletion preserves this booking, but removes the faculty from future booking choices.
      assert.equal((await admin.request(`/users/index.php?id=${facultyId}`, { method: 'DELETE' })).status, 200);
      const deleted = await student.request('/faculty/slots.php');
      assert.equal(deleted.payload.data.some((slot) => slot.faculty_id === facultyId), false);
      const history = await student.request('/appointments/index.php');
      assert.equal(history.payload.data.some((a) => a.id === booking.payload.data.id), true);
    });
    await t.test('appointment transitions and reschedule guard rails', async () => {
      const admin = new ApiClient();
      assert.equal((await admin.login('admin@schedwise.edu', 'Admin123!')).status, 200);

      const facultyEmail = `${emailPrefix}.transitions-faculty@schedwise.edu`;
      const studentEmail = `${emailPrefix}.transitions-student@schedwise.edu`;
      const otherEmail = `${emailPrefix}.transitions-other@schedwise.edu`;
      const createUser = async (body) => {
        const response = await admin.request('/users/index.php', { method: 'POST', body: {
          password: initialPassword, status: 'active', ...body,
        } });
        assert.equal(response.status, 201, response.text);
        return response.payload.data.user_id;
      };
      const facultyId = await createUser({
        email: facultyEmail, first_name: 'Transition', last_name: 'Faculty', role_id: 'faculty',
      });
      const studentId = await createUser({
        email: studentEmail, first_name: 'Transition', last_name: 'Student', role_id: 'student',
      });
      await createUser({
        email: otherEmail, first_name: 'Other', last_name: 'Student', role_id: 'student',
      });

      const faculty = new ApiClient();
      assert.equal((await faculty.login(facultyEmail, initialPassword)).status, 200);
      const student = new ApiClient();
      assert.equal((await student.login(studentEmail, initialPassword)).status, 200);
      const other = new ApiClient();
      const otherLogin = await other.login(otherEmail, initialPassword);
      assert.equal(otherLogin.status, 200, otherLogin.text);
      const otherId = otherLogin.payload.data.user.id;

      const date = new Date();
      date.setDate(date.getDate() + 21);
      while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
      const iso = localDate(date);
      const available = await admin.request('/faculty/schedule_overrides.php', { method: 'POST', body: {
        faculty_id: facultyId, date: iso, kind: 'available', start_minutes: 540, end_minutes: 720,
      } });
      assert.equal(available.status, 201, available.text);

      const book = (start, end, topic, client = student, ownerId = studentId) =>
        client.request('/appointments/index.php', { method: 'POST', body: {
          student_id: ownerId, faculty_id: facultyId, appointment_date: iso,
          start_minutes: start, end_minutes: end, topic, reason: 'State-transition regression test.',
        } });
      const transition = (id, action, body) =>
        faculty.request(`/appointments/${action}.php?id=${encodeURIComponent(id)}`, {
          method: 'PUT', body,
        });

      const pending = await book(540, 570, 'Pending transition');
      assert.equal(pending.status, 201, pending.text);
      const pendingId = pending.payload.data.id;
      assert.equal((await student.request(`/appointments/approve.php?id=${encodeURIComponent(pendingId)}`, { method: 'PUT' })).status, 403);
      assert.equal((await transition(pendingId, 'complete')).status, 400);
      assert.equal((await transition(pendingId, 'no-show')).status, 400);
      const rejectWithoutReason = await transition(pendingId, 'reject', { reason: '' });
      assert.equal(rejectWithoutReason.status, 400, rejectWithoutReason.text);
      assert.match(rejectWithoutReason.payload.error, /reason is required/i);
      const cancelWithoutReason = await student.request(`/appointments/cancel.php?id=${encodeURIComponent(pendingId)}`, {
        method: 'PUT', body: { reason: '' },
      });
      assert.equal(cancelWithoutReason.status, 400, cancelWithoutReason.text);
      assert.match(cancelWithoutReason.payload.error, /reason is required/i);
      const cancelled = await student.request(`/appointments/cancel.php?id=${encodeURIComponent(pendingId)}`, {
        method: 'PUT', body: { reason: 'No longer needed' },
      });
      assert.equal(cancelled.status, 200, cancelled.text);
      assert.equal(cancelled.payload.data.status, 'cancelled');
      assert.equal((await transition(pendingId, 'approve')).status, 400);
      assert.equal((await transition(pendingId, 'reschedule', {
        appointment_date: iso, start_minutes: 570, end_minutes: 600,
      })).status, 400);
      assert.equal((await student.request(`/appointments/cancel.php?id=${encodeURIComponent(pendingId)}`, {
        method: 'PUT', body: { reason: 'Again' },
      })).status, 400);

      const confirmed = await book(540, 570, 'Completed transition');
      assert.equal(confirmed.status, 201, confirmed.text);
      const confirmedId = confirmed.payload.data.id;
      const approved = await transition(confirmedId, 'approve');
      assert.equal(approved.status, 200, approved.text);
      assert.equal(approved.payload.data.status, 'confirmed');
      assert.equal((await transition(confirmedId, 'approve')).status, 400);
      const completed = await transition(confirmedId, 'complete');
      assert.equal(completed.status, 200, completed.text);
      assert.equal(completed.payload.data.status, 'completed');
      assert.equal((await transition(confirmedId, 'complete')).status, 400);
      assert.equal((await transition(confirmedId, 'cancel', { reason: 'Too late' })).status, 400);
      assert.equal((await transition(confirmedId, 'reschedule', {
        appointment_date: iso, start_minutes: 570, end_minutes: 600,
      })).status, 400);
      assert.equal((await transition(confirmedId, 'no-show')).status, 400);

      const rejectable = await book(570, 600, 'Rejection transition');
      assert.equal(rejectable.status, 201, rejectable.text);
      const rejectableId = rejectable.payload.data.id;
      assert.equal((await transition(rejectableId, 'reject', { reason: '' })).status, 400);
      const rejected = await transition(rejectableId, 'reject', { reason: 'Schedule conflict' });
      assert.equal(rejected.status, 200, rejected.text);
      assert.equal(rejected.payload.data.status, 'rejected');
      assert.equal(rejected.payload.data.reschedule_reason, 'Schedule conflict');
      assert.equal((await transition(rejectableId, 'approve')).status, 400);
      assert.equal((await transition(rejectableId, 'complete')).status, 400);
      assert.equal((await transition(rejectableId, 'no-show')).status, 400);
      assert.equal((await transition(rejectableId, 'cancel', { reason: 'Too late' })).status, 400);

      const target = await book(540, 570, 'Reschedule transition');
      assert.equal(target.status, 201, target.text);
      const targetId = target.payload.data.id;
      const otherBooking = await book(600, 630, 'Conflicting faculty slot', other, otherId);
      assert.equal(otherBooking.status, 201, otherBooking.text);

      const outsiderReschedule = await other.request(`/appointments/reschedule.php?id=${encodeURIComponent(targetId)}`, {
        method: 'PUT', body: { appointment_date: iso, start_minutes: 540, end_minutes: 570 },
      });
      assert.equal(outsiderReschedule.status, 403, outsiderReschedule.text);

      const invalidEnd = await student.request(`/appointments/reschedule.php?id=${encodeURIComponent(targetId)}`, {
        method: 'PUT', body: { appointment_date: iso, start_minutes: 600, end_minutes: 600 },
      });
      assert.equal(invalidEnd.status, 400, invalidEnd.text);
      assert.match(invalidEnd.payload.error, /end time must be after/i);

      const invalidDate = await student.request(`/appointments/reschedule.php?id=${encodeURIComponent(targetId)}`, {
        method: 'PUT', body: { appointment_date: 'not-a-date', start_minutes: 540, end_minutes: 570 },
      });
      assert.equal(invalidDate.status, 400, invalidDate.text);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const pastDate = await student.request(`/appointments/reschedule.php?id=${encodeURIComponent(targetId)}`, {
        method: 'PUT', body: { appointment_date: localDate(yesterday), start_minutes: 540, end_minutes: 570 },
      });
      assert.equal(pastDate.status, 400, pastDate.text);
      assert.match(pastDate.payload.error, /cannot be in the past/i);

      const unavailable = await student.request(`/appointments/reschedule.php?id=${encodeURIComponent(targetId)}`, {
        method: 'PUT', body: { appointment_date: iso, start_minutes: 720, end_minutes: 750 },
      });
      assert.equal(unavailable.status, 400, unavailable.text);
      assert.match(unavailable.payload.error, /not available/i);

      const facultyOverlap = await student.request(`/appointments/reschedule.php?id=${encodeURIComponent(targetId)}`, {
        method: 'PUT', body: { appointment_date: iso, start_minutes: 600, end_minutes: 630 },
      });
      assert.equal(facultyOverlap.status, 409, facultyOverlap.text);
      assert.match(facultyOverlap.payload.error, /conflicts with another appointment/i);

      const requested = await student.request(`/appointments/reschedule.php?id=${encodeURIComponent(targetId)}`, {
        method: 'PUT', body: {
          appointment_date: iso, start_minutes: 570, end_minutes: 600,
          reason: 'Requested a later slot for a lab conflict.',
        },
      });
      assert.equal(requested.status, 200, requested.text);
      assert.equal(requested.payload.data.status, 'reschedule_requested');
      assert.equal(Number(requested.payload.data.start_minutes), 570);
      assert.equal(requested.payload.data.reschedule_reason, 'Requested a later slot for a lab conflict.');

      const blocked = await admin.request('/faculty/schedule_overrides.php', { method: 'POST', body: {
        faculty_id: facultyId, date: iso, kind: 'blocked', start_minutes: 570, end_minutes: 600,
        reason: 'Availability changed after the request.',
      } });
      assert.equal(blocked.status, 201, blocked.text);
      const approvalConflict = await transition(targetId, 'approve');
      assert.equal(approvalConflict.status, 409, approvalConflict.text);
      assert.match(approvalConflict.payload.error, /no longer available/i);
      assert.equal((await admin.request(
        `/faculty/schedule_overrides.php?id=${encodeURIComponent(blocked.payload.data.id)}`,
        { method: 'DELETE' },
      )).status, 200);

      const approvedRequest = await transition(targetId, 'approve');
      assert.equal(approvedRequest.status, 200, approvedRequest.text);
      assert.equal(approvedRequest.payload.data.status, 'confirmed');
      assert.equal(Number(approvedRequest.payload.data.start_minutes), 570);

      const facultyMoved = await transition(targetId, 'reschedule', {
        appointment_date: iso, start_minutes: 540, end_minutes: 570,
      });
      assert.equal(facultyMoved.status, 200, facultyMoved.text);
      assert.equal(facultyMoved.payload.data.status, 'confirmed');
      assert.equal(Number(facultyMoved.payload.data.start_minutes), 540);

      const reRequested = await student.request(`/appointments/reschedule.php?id=${encodeURIComponent(targetId)}`, {
        method: 'PUT', body: {
          appointment_date: iso, start_minutes: 570, end_minutes: 600,
          reason: 'The original lab conflict is still unresolved.',
        },
      });
      assert.equal(reRequested.status, 200, reRequested.text);
      assert.equal(reRequested.payload.data.status, 'reschedule_requested');
      const rejectedReschedule = await transition(targetId, 'reject', { reason: 'No later openings this week.' });
      assert.equal(rejectedReschedule.status, 200, rejectedReschedule.text);
      assert.equal(rejectedReschedule.payload.data.status, 'rejected');
      assert.equal((await transition(targetId, 'approve')).status, 400);
    });

  } finally {
    cleanup();
  }
});
