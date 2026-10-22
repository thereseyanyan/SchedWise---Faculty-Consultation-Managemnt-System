import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright-core";

const BASE_URL = (process.env.SCHEDWISE_WEB_URL || "http://localhost:5173").replace(/\/$/, "");
const API_URL = `${BASE_URL}/api`;
const MAILPIT_URL = (process.env.SCHEDWISE_MAILPIT_URL || "http://127.0.0.1:8025").replace(/\/$/, "");
const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const CLEANUP_SCRIPT = path.join(ROOT, "tools", "test-cleanup.php");
const PHP =
  process.env.SCHEDWISE_PHP ||
  (existsSync("C:\\xampp\\php\\php.exe") ? "C:\\xampp\\php\\php.exe" : "php");
const platform = process.platform;

const browserCandidates = [
  process.env.SCHEDWISE_BROWSER_PATH,
  process.env.BRAVE_PATH,
  platform === "win32" && process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
    : "",
  platform === "win32" ? "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" : "",
  platform === "win32" && process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
    : "",
  platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : "",
  platform === "win32" && process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe")
    : "",
].filter(Boolean);

const browserPath = browserCandidates.find((candidate) => existsSync(candidate));
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const localDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

class ApiClient {
  cookies = new Map();
  csrf = "";

  async request(route, { method = "GET", body, csrf = true } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (csrf && this.csrf && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      headers["X-CSRF-Token"] = this.csrf;
    }
    if (this.cookies.size > 0) {
      headers.Cookie = [...this.cookies.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    }
    const response = await fetch(`${API_URL}${route}`, {
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

async function login(page, email, password) {
  await page.getByLabel("Email Address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
}

async function signOut(page) {
  await page.getByRole("button", { name: "Sign Out", exact: true }).click();
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await page.waitForFunction(() => /Get Started|Login/.test(document.body.innerText));
  const getStarted = page.getByRole("button", { name: "Get Started", exact: true });
  if (await getStarted.count()) {
    await getStarted.click();
  }
  await page.getByRole("heading", { name: "Login" }).waitFor();
}

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

async function expectPurple(locator) {
  const background = await locator.evaluate((element) => getComputedStyle(element).backgroundColor);
  const oklch = background.match(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/i);
  if (oklch) {
    const hue = Number(oklch[1]);
    assert.ok(hue >= 285 && hue <= 320, `Expected a purple hue, received ${background}`);
    return;
  }
  const rgb = background.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) {
    const [red, green, blue] = rgb.slice(1).map(Number);
    assert.ok(blue > red && red > green && blue >= 150, `Expected a purple color, received ${background}`);
    return;
  }
  assert.fail(`Could not read a purple background from ${background}`);
}

test("SchedWise browser smoke", { timeout: 180_000 }, async (t) => {
  if (!browserPath) {
    t.skip("Brave, Chrome, or Edge was not found. Set SCHEDWISE_BROWSER_PATH to run the browser smoke test.");
    return;
  }

  const runId = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const emailPrefix = `e2e.browser.${runId}`;
  const facultyEmail = `${emailPrefix}@schedwise.edu`;
  const facultyPassword = "Browser1234!";
  const studentEmail = `${emailPrefix}.student@schedwise.edu`;
  const studentPassword = "Browser1234!";
  const availabilityDate = new Date();
  availabilityDate.setDate(availabilityDate.getDate() + 2);
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

  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => /Get Started|Login/.test(document.body.innerText));
    const getStarted = page.getByRole("button", { name: "Get Started", exact: true });
    if (await getStarted.count()) {
      await getStarted.click();
    }
    await page.getByRole("heading", { name: "Login" }).waitFor();

    await expectPurple(page.getByRole("button", { name: "Login", exact: true }));
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page.getByText("Enter your email address and password.").waitFor();

    // Privacy is placed on registration and in Account Settings, not on the dashboard.
    await page.getByRole("button", { name: /New Here\?/ }).click();
    await page.getByRole("heading", { name: "Register" }).waitFor();
    const registerPrivacy = page.getByText("Privacy and access to your data", { exact: true });
    await registerPrivacy.waitFor();
    await registerPrivacy.click();
    await page.getByText(/SchedWise stores account details/).waitFor();
    await page.getByText(/Private faculty notes are available only/).waitFor();

    // Register a faculty member through the real form, verify the email, and
    // let the administrator approve the account through User Management.
    await page.getByRole("button", { name: "Faculty", exact: true }).click();
    await page.getByLabel("Full Name").fill("Browser Faculty");
    await page.getByLabel("Institutional Email Address").fill(facultyEmail);
    await page.getByLabel("Password Creation").fill(facultyPassword);
    await page.getByLabel("Department / College").selectOption({
      label: "College of Computer Studies",
    });
    await page.getByRole("button", { name: "Register", exact: true }).click();
    await page.getByRole("heading", { name: "Login" }).waitFor();
    await page.getByText(/Faculty account created/).waitFor();
    await page.getByText(/Faculty ID is FAC-/).waitFor();

    await login(page, facultyEmail, facultyPassword);
    await page.getByText("Your account needs email verification before you can sign in.").waitFor();
    await page.getByRole("button", { name: "Resend verification email" }).waitFor();

    const verificationLink = await findVerificationLink(facultyEmail);
    await page.goto(verificationLink, { waitUntil: "domcontentloaded" });
    await page.getByText(/Email (?:already )?verified.*awaiting administrator approval/i).waitFor();

    await login(page, facultyEmail, facultyPassword);
    await page.getByText(
      "Your email is verified, but your faculty account is awaiting administrator approval.",
    ).waitFor();

    await login(page, "admin@schedwise.edu", "Admin123!");
    await page.getByRole("heading", { name: "Admin Dashboard" }).waitFor();
    await page.getByText("Master User List").waitFor();
    assert.equal(await page.getByText("Privacy and access to your data", { exact: true }).count(), 0);
    await expectPurple(page.getByRole("button", { name: /^User Management/ }).first());

    await page.getByTitle("Account settings").click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("button", { name: "Privacy", exact: true }).click();
    const settingsPrivacy = page.getByText("Privacy and access to your data", { exact: true });
    await settingsPrivacy.waitFor();
    await settingsPrivacy.click();
    await page.getByText(/SchedWise stores account details/).waitFor();
    await page.getByTitle("Close account settings").click();
    await page.getByRole("dialog").waitFor({ state: "detached" });

    // Dashboard cards open their matching management views.
    await page.getByRole("button", { name: /^Total Users/ }).click();
    await page.getByRole("heading", { name: "User Management" }).waitFor();
    await page.getByText(facultyEmail).waitFor();
    await page.getByRole("button", { name: "Approve", exact: true }).first().click();
    await page.getByRole("button", { name: "Yes", exact: true }).click();
    await page.getByText("Faculty account approved. The teacher can now sign in.").waitFor();

    // Set up a clean student/faculty pair through the API so the student
    // cancel/reschedule UI can be exercised without touching seed data.
    const fixtureApi = new ApiClient();
    const fixtureLogin = await fixtureApi.login("admin@schedwise.edu", "Admin123!");
    assert.equal(fixtureLogin.status, 200, fixtureLogin.text);
    const facultyList = await fixtureApi.request("/users/index.php?role_id=faculty");
    assert.equal(facultyList.status, 200, facultyList.text);
    const fixtureFaculty = facultyList.payload.data.find((row) => row.email === facultyEmail);
    assert.ok(fixtureFaculty, "Approved browser faculty was not listed");
    const createStudent = await fixtureApi.request("/users/index.php", {
      method: "POST",
      body: {
        email: studentEmail,
        password: studentPassword,
        first_name: "Browser",
        last_name: "Student",
        role_id: "student",
        department_id: "ccs",
        program: "BS Computer Science",
      },
    });
    assert.equal(createStudent.status, 201, createStudent.text);
    const createAvailability = await fixtureApi.request("/faculty/schedule_overrides.php", {
      method: "POST",
      body: {
        faculty_id: fixtureFaculty.id,
        date: localDate(availabilityDate),
        kind: "available",
        start_minutes: 540,
        end_minutes: 660,
        reason: "Automated browser smoke fixture",
      },
    });
    assert.equal(createAvailability.status, 201, createAvailability.text);

    const userSearch = page.getByLabel("Search accounts");
    await userSearch.fill("elena");
    await page.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes("Elena Cruz") && !text.includes("Juan Dela Cruz");
    });

    await page.locator("button").filter({ hasText: "Appointments" }).first().click();
    await page.getByRole("heading", { name: "Total Appointments" }).waitFor();
    const appointmentSearch = page.getByLabel("Search appointments");
    await appointmentSearch.fill("zzzz-no-match");
    await page.waitForFunction(() => document.body.innerText.includes("No appointments"));
    await page.getByRole("button", { name: "Clear filters", exact: true }).first().click();
    await page.waitForFunction(() => !document.body.innerText.includes("No appointments match these filters"));

    await page.getByRole("button", { name: "Audit Log", exact: true }).click();
    await page.getByRole("heading", { name: "Audit Log" }).waitFor();
    const auditSearch = page.getByLabel("Search audit log");
    await auditSearch.fill("login");
    await page.waitForFunction(() => /audit entries?/.test(document.body.innerText));

    await page.getByRole("button", { name: "System Analytics", exact: true }).click();
    await page.getByRole("heading", { name: "System Analytics" }).waitFor();
    await page.getByLabel("Month").waitFor();

    const departmentResponse = page.waitForResponse(
      (response) => response.url().includes("/reports/summary.php") && response.status() === 200,
    );
    await page.getByLabel("Department").selectOption("ccs");
    await departmentResponse;
    await page.waitForFunction(() => document.body.innerText.includes("for the selected department"));

    const facultyResponse = page.waitForResponse(
      (response) => response.url().includes("/reports/summary.php") && response.status() === 200,
    );
    await page.getByLabel("Faculty").selectOption({ label: "Elena Cruz" });
    await facultyResponse;
    await page.waitForFunction(() => document.body.innerText.includes("for the selected faculty member"));

    const exportHref = await page.getByRole("link", { name: "Export CSV" }).getAttribute("href");
    assert.match(exportHref || "", /reports\/export\.php\?.*faculty_id=/);

    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.waitForFunction(() => !document.body.innerText.includes("for the selected faculty member"));

    await page.getByRole("button", { name: "Sign Out", exact: true }).click();
    await page.getByRole("button", { name: "No", exact: true }).click();
    await page.getByRole("heading", { name: "Admin Dashboard" }).waitFor();

    await signOut(page);
    await login(page, facultyEmail, facultyPassword);
    await page.getByRole("heading", { name: "Faculty Dashboard" }).waitFor();
    await expectPurple(page.getByRole("button", { name: "Today's Schedule", exact: true }));
    await page.getByRole("button", { name: /Notifications/ }).click();
    const notificationsDialog = page.getByRole("dialog", { name: "Notifications" });
    await notificationsDialog.waitFor();
    await notificationsDialog.getByText("Faculty account approved", { exact: true }).waitFor();
    await notificationsDialog.getByRole("button", { name: "Mark all read", exact: true }).click();
    await notificationsDialog.getByText("All notifications marked as read.").waitFor();
    await page.getByTitle("Close notifications").click();
    await notificationsDialog.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Set Availability", exact: true }).click();
    await page.getByRole("heading", { name: "Set Consultation Availability" }).waitFor();

    await signOut(page);
    await login(page, studentEmail, studentPassword);
    await page.getByRole("heading", { name: "Student Dashboard" }).waitFor();
    await page.getByRole("button", { name: "My Appointments", exact: true }).click();
    await page.getByRole("heading", { name: "My Appointments" }).waitFor();
    await page.getByText("No appointments yet").waitFor();

    const bookAppointment = async (topic, reason) => {
      await page.getByRole("button", { name: "Book Appointment", exact: true }).click();
      await page.getByRole("heading", { name: "Book an Appointment" }).waitFor();
      await page.getByPlaceholder("Search professor or department").fill("Browser Faculty");
      const availableTimes = page.getByRole("button", { name: "View Available Times" });
      await availableTimes.waitFor();
      await availableTimes.click();
      await page.getByLabel("Topic", { exact: true }).fill(topic);
      await page.getByLabel("Consultation reason").fill(reason);
      await page.getByRole("button", { name: "Request Appointment", exact: true }).click();
      await page.getByRole("button", { name: "Yes", exact: true }).click();
      await page.getByText("Request submitted").waitFor();
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await page.getByText("Request submitted").waitFor({ state: "detached" });
    };
    const appointmentRow = (topic) =>
      page.locator("div.flex.flex-wrap.items-center.justify-between").filter({ hasText: topic }).first();

    const cancelledTopic = "Browser cancel test";
    await bookAppointment(cancelledTopic, "Created to verify student cancellation.");
    await page.getByRole("button", { name: "My Appointments", exact: true }).click();
    await page.getByRole("heading", { name: "My Appointments" }).waitFor();
    const cancelRow = appointmentRow(cancelledTopic);
    await cancelRow.waitFor();
    await cancelRow.getByRole("button", { name: `Cancel appointment: ${cancelledTopic}` }).click();
    const cancelDialog = page.getByRole("dialog", { name: "Cancel appointment" });
    await cancelDialog.waitFor();
    await page.getByLabel("Cancellation reason").fill("Browser smoke cancellation.");
    await page.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
    await page.getByRole("button", { name: "Yes", exact: true }).click();
    await cancelDialog.waitFor({ state: "detached" });
    await page.getByText("Appointment cancelled. The faculty member has been notified.").waitFor();
    await cancelRow.getByText("Cancelled", { exact: true }).waitFor();

    const rescheduledTopic = "Browser reschedule test";
    await bookAppointment(rescheduledTopic, "Created to verify student reschedule requests.");
    await page.getByRole("button", { name: "My Appointments", exact: true }).click();
    await page.getByRole("heading", { name: "My Appointments" }).waitFor();
    const rescheduleRow = appointmentRow(rescheduledTopic);
    await rescheduleRow.waitFor();
    await rescheduleRow.getByRole("button", { name: `Request a new time: ${rescheduledTopic}` }).click();
    const rescheduleDialog = page.getByRole("dialog", { name: "Request a new time" });
    await rescheduleDialog.waitFor();
    await rescheduleDialog.getByLabel("New date").waitFor();
    await rescheduleDialog.getByLabel("New time (30 min)").waitFor();
    await page.getByLabel("Reason for the new time").fill("Browser smoke reschedule reason.");
    await page.getByRole("button", { name: "Send reschedule request", exact: true }).click();
    await page.getByRole("button", { name: "Yes", exact: true }).click();
    await rescheduleDialog.waitFor({ state: "detached" });
    await page.getByText("Reschedule request sent. The faculty member will review the new time.").waitFor();
    await rescheduleRow.getByText("Reschedule requested", { exact: true }).waitFor();
    await page.getByText("Requested-time note: Browser smoke reschedule reason.").waitFor();

    // Complete the request through the API and confirm the student sees the
    // consultation summary and action items in My History.
    const facultyApiSession = new ApiClient();
    const facultyApiLogin = await facultyApiSession.login(facultyEmail, facultyPassword);
    assert.equal(facultyApiLogin.status, 200, facultyApiLogin.text);
    const facultyAppointments = await facultyApiSession.request("/appointments/index.php");
    assert.equal(facultyAppointments.status, 200, facultyAppointments.text);
    const completedAppointment = facultyAppointments.payload.data.find(
      (appointment) => appointment.topic === rescheduledTopic,
    );
    assert.ok(completedAppointment, "Rescheduled browser appointment was not listed for the faculty member");
    const approveResponse = await facultyApiSession.request(
      `/appointments/approve.php?id=${encodeURIComponent(completedAppointment.id)}`,
      { method: "PUT" },
    );
    assert.equal(approveResponse.status, 200, approveResponse.text);
    const completeResponse = await facultyApiSession.request(
      `/appointments/complete.php?id=${encodeURIComponent(completedAppointment.id)}`,
      { method: "PUT" },
    );
    assert.equal(completeResponse.status, 200, completeResponse.text);
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + 7);
    const consultationResponse = await facultyApiSession.request("/consultations/index.php", {
      method: "POST",
      body: {
        appointment_id: completedAppointment.id,
        summary: "Browser smoke consultation summary.",
        action_items: "Bring your draft chapter.",
        follow_up_date: localDate(followUpDate),
      },
    });
    assert.equal(consultationResponse.status, 201, consultationResponse.text);

    await page.getByRole("button", { name: /Notifications/ }).click();
    const studentNotifications = page.getByRole("dialog", { name: "Notifications" });
    await studentNotifications.getByText("Appointment completed", { exact: true }).waitFor();
    await page.getByTitle("Close notifications").click();
    await page.getByRole("button", { name: "My History", exact: true }).click();
    await page.getByRole("heading", { name: "My Consultation History" }).waitFor();
    await page.getByRole("button", { name: "View feedback", exact: true }).click();
    await page.getByText("Faculty Feedback").waitFor();
    await page.getByText("Browser smoke consultation summary.").waitFor();
    await page.getByText("Bring your draft chapter.").waitFor();
    await page.getByTitle("Close feedback").click();

    await signOut(page);
    await login(page, "juan.delacruz@schedwise.edu", "Passw0rd!");
    await page.getByRole("heading", { name: "Student Dashboard" }).waitFor();
    await page.getByRole("button", { name: /^Pending/ }).click();
    await page.getByRole("heading", { name: "Pending Appointments" }).waitFor();

    await signOut(page);
    await login(page, "elena.cruz@schedwise.edu", "Passw0rd!");
    await page.getByRole("heading", { name: "Faculty Dashboard" }).waitFor();

    assert.deepEqual(pageErrors, []);
  } finally {
    cleanup();
    await context.close();
    await browser.close();
  }
});
