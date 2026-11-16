import assert from "node:assert/strict";
import test from "node:test";

import {
  bulkEligibleAppointments,
  canBulkAct,
  nextAppointmentIndex,
  previousAppointmentIndex,
  resolveShortcutTarget,
  runBulkAppointmentAction,
} from "../src/features/faculty/appointmentBulkState.ts";
import { todayInTimeZone } from "../src/shared/datetime.ts";

function appointment(overrides = {}) {
  return {
    id: "appointment-1",
    faculty_id: "faculty-1",
    student_id: "student-1",
    appointment_date: "2026-11-10",
    start_minutes: 540,
    end_minutes: 600,
    status: "pending",
    ...overrides,
  };
}

test("bulk actions are limited to pending and reschedule requests", () => {
  for (const status of ["pending", "reschedule_requested"]) {
    assert.equal(canBulkAct("accept", appointment({ status })), true);
    assert.equal(canBulkAct("decline", appointment({ status })), true);
  }
  for (const status of ["confirmed", "completed", "rejected", "cancelled", "no_show"]) {
    assert.equal(canBulkAct("accept", appointment({ status })), false);
    assert.equal(canBulkAct("decline", appointment({ status })), false);
  }
});

test("select-all only includes actionable appointments in the current view", () => {
  const rows = [
    appointment({ id: "pending", status: "pending" }),
    appointment({ id: "reschedule", status: "reschedule_requested" }),
    appointment({ id: "confirmed", status: "confirmed" }),
    appointment({ id: "completed", status: "completed" }),
  ];
  assert.deepEqual(
    bulkEligibleAppointments(rows, "decline").map((row) => row.id),
    ["pending", "reschedule"],
  );
});

test("shortcut actions prefer the selected eligible request, then the first eligible request", () => {
  const rows = [
    appointment({ id: "confirmed", status: "confirmed" }),
    appointment({ id: "pending-1", status: "pending" }),
    appointment({ id: "pending-2", status: "reschedule_requested" }),
  ];
  assert.equal(resolveShortcutTarget(rows, "pending-2", "accept")?.id, "pending-2");
  assert.equal(resolveShortcutTarget(rows, "confirmed", "accept")?.id, "pending-1");
  assert.equal(resolveShortcutTarget(rows, "", "decline")?.id, "pending-1");
  assert.equal(resolveShortcutTarget([], "", "decline"), null);
});

test("J and K navigation wraps across the filtered list", () => {
  assert.equal(nextAppointmentIndex(-1, 3), 0);
  assert.equal(nextAppointmentIndex(0, 3), 1);
  assert.equal(nextAppointmentIndex(2, 3), 0);
  assert.equal(previousAppointmentIndex(-1, 3), 2);
  assert.equal(previousAppointmentIndex(0, 3), 2);
  assert.equal(previousAppointmentIndex(2, 3), 1);
  assert.equal(nextAppointmentIndex(-1, 0), -1);
  assert.equal(previousAppointmentIndex(-1, 0), -1);
});

test("bulk processing continues after a failure and reports partial success", async () => {
  const rows = [
    appointment({ id: "one", status: "pending" }),
    appointment({ id: "two", status: "reschedule_requested" }),
    appointment({ id: "three", status: "pending" }),
  ];
  const attempted = [];
  const outcome = await runBulkAppointmentAction(
    rows,
    "accept",
    async (row) => {
      attempted.push(row.id);
      if (row.id === "two") throw new Error("already handled");
      return { ...row, status: "confirmed" };
    },
    (_row, error) => (error instanceof Error ? error.message : "failed"),
  );

  assert.deepEqual(attempted, ["one", "two", "three"]);
  assert.deepEqual(outcome.succeeded.map((row) => row.id), ["one", "three"]);
  assert.deepEqual(outcome.failed.map((failure) => failure.appointment.id), ["two"]);
  assert.equal(outcome.failed[0].error, "already handled");
  assert.deepEqual(outcome.skipped, []);
});

test("bulk processing does not submit ineligible or duplicate records", async () => {
  const rows = [
    appointment({ id: "one", status: "pending" }),
    appointment({ id: "one", status: "pending" }),
    appointment({ id: "two", status: "confirmed" }),
  ];
  const attempted = [];
  const outcome = await runBulkAppointmentAction(
    rows,
    "decline",
    async (row) => {
      attempted.push(row.id);
      return { ...row, status: "rejected" };
    },
    () => "failed",
  );

  assert.deepEqual(attempted, ["one"]);
  assert.deepEqual(outcome.succeeded.map((row) => row.id), ["one"]);
  assert.deepEqual(outcome.skipped.map((row) => row.id), ["two"]);
});

test("Today uses the application timezone across UTC date boundaries", () => {
  const now = new Date("2026-11-04T17:30:00Z");
  assert.equal(todayInTimeZone("UTC", now), "2026-11-04");
  assert.equal(todayInTimeZone("Asia/Kuala_Lumpur", now), "2026-11-05");
});
