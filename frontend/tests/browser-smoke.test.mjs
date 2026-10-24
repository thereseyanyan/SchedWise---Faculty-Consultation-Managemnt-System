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
  await page.getByPlaceholder("Student ID or email").fill(email === "juan.delacruz@schedwise.edu" ? "STU-0001" : email);
  await page.getByPlaceholder("Enter your password", { exact: true }).fill(password);
  await page.getByRole("dialog").getByRole("button", { name: /^login$/i }).click();
}

async function signOut(page) {
  await page.getByRole("button", { name: "Sign Out", exact: true }).click();
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await page.waitForFunction(() => /ARE YOU A|Welcome to SchedWise|Login/.test(document.body.innerText));
  await page.locator("button[data-role=student]").click();
  await page.getByRole("button", { name: "Login", exact: true }).click();
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
  // Run before requests, browser startup, or cleanup: direct test invocations must also be safe.
  const fixtureCheck = spawnSync(PHP, [path.join(ROOT, "tests", "check-mail-fixture.php")], { cwd: ROOT, encoding: "utf8" });
  assert.equal(fixtureCheck.status, 0, fixtureCheck.stderr || fixtureCheck.stdout || "SMTP fixture safety check failed");

  if (!browserPath) {
    t.skip("Brave, Chrome, or Edge was not found. Set SCHEDWISE_BROWSER_PATH to run the browser smoke test.");
    return;
  }

  const runId = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const emailPrefix = `e2e.browser.${runId}`;
  const facultyEmail = `${emailPrefix}@schedwise.edu`;
  let facultyPassword = "Browser1234!";
  let studentNumber = "";
  const studentEmail = `${emailPrefix}.student@gmail.com`;
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
    await page.locator("button[data-role=faculty]").click();
    assert.equal(await page.getByRole("button", { name: /Sign Up/ }).count(), 0);
    await page.getByText(/Faculty accounts are created by your administrator/).waitFor();
    await page.locator("button[data-role=student]").click();
    await page.getByRole("button", { name: "Sign Up as a Student" }).click();
    await page.getByRole("heading", { name: "Student Registration" }).waitFor();
    assert.equal(await page.getByRole("option", { name: "Faculty", exact: true }).count(), 0);
    await page.getByPlaceholder("Enter full name").fill("Browser Student");
    studentNumber = `00-${runId}`;
    await page.getByLabel("Student ID", { exact: true }).fill(studentNumber);
    await page.getByPlaceholder("name@gmail.com").fill(studentEmail);
    await page.getByPlaceholder("Enter password", { exact: true }).fill(studentPassword);
    await page.getByPlaceholder("Confirm password", { exact: true }).fill(studentPassword);
    const selects = page.getByRole("dialog").locator("select");
    await selects.nth(0).selectOption({ label: "College of Computer Studies" });
    await selects.nth(1).selectOption({ index: 1 });
    await page.getByRole("button", { name: "SIGN UP", exact: true }).click();
    const notice = page.getByText(/Application submitted. Your Student ID is/);
    await notice.waitFor();
    assert.ok((await notice.innerText()).includes(studentNumber.toUpperCase()));
    await login(page, studentNumber, studentPassword);
    await page.getByText("Your student application is awaiting administrator approval.", { exact: true }).waitFor();
    await login(page, "admin@schedwise.edu", "Admin123!");
    await page.getByRole("heading", { name: "Admin Dashboard" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Register Student" }).count(), 0);
    await page.getByRole("heading", { name: "Student applications" }).waitFor();
    const pending = page.locator("div.rounded-xl").filter({ has: page.getByText(studentEmail, { exact: false }) }).filter({ has: page.getByRole("button", { name: "Approve", exact: true }) }).last();
    await pending.getByRole("button", { name: "Approve", exact: true }).click();
    await page.getByRole("button", { name: "Yes", exact: true }).click();
    await page.getByText("Student application approved. The student can now sign in with their Student ID or email.").waitFor();
    await page.getByRole("button", { name: "Create Faculty Account", exact: true }).click();
    await page.getByLabel("first name", { exact: true }).fill("Browser");
    await page.getByLabel("last name", { exact: true }).fill("Faculty");
    await page.getByLabel("email", { exact: true }).fill(facultyEmail);
    await page.getByLabel("password", { exact: true }).fill(facultyPassword);
    await page.getByRole("button", { name: "Create Faculty Account", exact: true }).last().click();
    await page.getByRole("button", { name: "Yes", exact: true }).click();
    await page.getByLabel("first name", { exact: true }).waitFor({ state: "detached" });

    // Set up a clean student/faculty pair through the API so the student
    // cancel/reschedule UI can be exercised without touching seed data.
    const fixtureApi = new ApiClient();
    const fixtureLogin = await fixtureApi.login("admin@schedwise.edu", "Admin123!");
    assert.equal(fixtureLogin.status, 200, fixtureLogin.text);
    const facultyList = await fixtureApi.request("/users/index.php?role_id=faculty");
    assert.equal(facultyList.status, 200, facultyList.text);
    const fixtureFaculty = facultyList.payload.data.find((row) => row.email === facultyEmail);
    assert.ok(fixtureFaculty, "Approved browser faculty was not listed");
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
    await page.getByRole("combobox", { name: "Faculty", exact: true }).selectOption({ label: "Elena Cruz" });
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
    await page.getByRole("heading", { name: "Change your initial password" }).waitFor();
    await page.reload();
    await page.getByRole("heading", { name: "Change your initial password" }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Faculty Dashboard" }).count(), 0);
    await page.getByLabel("Initial password", { exact: true }).fill(facultyPassword);
    facultyPassword = "ChangedBrowser1234!";
    await page.getByLabel("New password", { exact: true }).fill(facultyPassword);
    await page.getByLabel("Confirm new password", { exact: true }).fill(facultyPassword);
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await page.getByRole("heading", { name: "Faculty Dashboard" }).waitFor();
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
