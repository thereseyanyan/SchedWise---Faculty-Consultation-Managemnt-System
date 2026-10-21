import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const BASE_URL = (process.env.FCAMS_BASE_URL || "http://localhost:5173/api").replace(/\/$/, "");
const MAILPIT_URL = (process.env.FCAMS_MAILPIT_URL || "http://127.0.0.1:8025").replace(/\/$/, "");
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLEANUP_SCRIPT = path.join(ROOT, "tools", "test-cleanup.php");
const PHP =
  process.env.FCAMS_PHP ||
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

test("FCAMS API regression suite", async (t) => {
  const runId = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const emailPrefix = `e2e.${runId}`;
  const email = `${emailPrefix}@fcams.edu`;
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
      const login = await admin.login("admin@fcams.edu", "Admin123!");
      assert.equal(login.status, 200, login.text);
      assert.equal(login.payload?.data?.user?.role_id, "admin");
      assert.ok(admin.csrf);

      const me = await admin.request("/auth/me.php");
      assert.equal(me.status, 200, me.text);
      assert.equal(me.payload?.data?.user?.email, "admin@fcams.edu");

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
      const login = await student.login("juan.delacruz@fcams.edu", "Passw0rd!");
      assert.equal(login.status, 200, login.text);
      const users = await student.request("/users/index.php");
      assert.equal(users.status, 403);
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
      assert.equal((await faculty.login("elena.cruz@fcams.edu", "Passw0rd!")).status, 200);
      const appointments = await student.request("/appointments/index.php");
      const appointment = appointments.payload.data.find(row => row.topic === "Automated test appointment");
      assert.ok(appointment);
      const id = encodeURIComponent(appointment.id);
      assert.equal((await faculty.request(`/appointments/approve.php?id=${id}`, { method: "PUT" })).status, 200);
      assert.equal((await faculty.request(`/appointments/complete.php?id=${id}`, { method: "PUT" })).status, 200);
      const created = await faculty.request("/consultations/index.php", { method: "POST", body: {
        appointment_id: appointment.id, summary: "Shared follow-up instructions", private_notes: "Confidential faculty information"
      }});
      assert.equal(created.status, 201, created.text);
      const admin = new ApiClient();
      assert.equal((await admin.login("admin@fcams.edu", "Admin123!")).status, 200);
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
      assert.equal((await outsider.login("juan.delacruz@fcams.edu", "Passw0rd!")).status, 200);
      const hidden = await outsider.request(`/consultations/index.php?appointment_id=${id}`);
      assert.deepEqual(hidden.payload.data, []);
    });
    await t.test('account IDs, field errors, permanent roles, and deletion', async () => {
      const admin = new ApiClient();
      assert.equal((await admin.login('admin@fcams.edu', 'Admin123!')).status, 200);
      const profile = { email: `${emailPrefix}.faculty@fcams.edu`, password: initialPassword,
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
        email: `${emailPrefix}.duplicate@fcams.edu`, faculty_number: account.payload.data.faculty_number,
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
      assert.equal((await admin.login('admin@fcams.edu', 'Admin123!')).status, 200);
      const created = await admin.request('/users/index.php', { method: 'POST', body: {
        email: `${emailPrefix}.slots@fcams.edu`, password: initialPassword,
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
        email: `${emailPrefix}.other-slots@fcams.edu`, password: initialPassword,
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
      const after = await student.request('/faculty/slots.php');
      assert.equal(after.payload.data.some((slot) => slot.faculty_id === facultyId && slot.date === iso && slot.start_minutes === 600), false);
      // Deletion preserves this booking, but removes the faculty from future booking choices.
      assert.equal((await admin.request(`/users/index.php?id=${facultyId}`, { method: 'DELETE' })).status, 200);
      const deleted = await student.request('/faculty/slots.php');
      assert.equal(deleted.payload.data.some((slot) => slot.faculty_id === facultyId), false);
      const history = await student.request('/appointments/index.php');
      assert.equal(history.payload.data.some((a) => a.id === booking.payload.data.id), true);
    });
  } finally {
    cleanup();
  }
});
