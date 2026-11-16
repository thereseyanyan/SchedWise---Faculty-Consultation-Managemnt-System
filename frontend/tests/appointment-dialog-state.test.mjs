import assert from "node:assert/strict";
import test from "node:test";

import {
  DECLINE_QUICK_REASONS,
  buildReschedulePayload,
  submitNewTime,
  submitReason,
  validateNewTimeSelection,
  validateReason,
} from "../src/features/faculty/appointmentDialogState.ts";

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

const slot = (date, start_minutes) => ({ date, start_minutes });

test("required reasons are validated after trimming whitespace", () => {
  assert.equal(validateReason("decline", "   ").valid, false);
  assert.equal(validateReason("cancel", "\n\t").valid, false);
  assert.equal(validateReason("decline", "  Schedule conflict  ").valid, true);
  assert.match(validateReason("decline", "").error, /reason/i);
  assert.match(validateReason("cancel", "").error, /reason/i);
});

test("decline quick reasons are available and non-empty", () => {
  assert.ok(DECLINE_QUICK_REASONS.length >= 2);
  assert.ok(DECLINE_QUICK_REASONS.every((reason) => reason.trim().length > 0));
});

test("reason submission does not call the API for invalid input", async () => {
  let calls = 0;
  const result = await submitReason("cancel", "   ", async () => {
    calls += 1;
    return appointment();
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});

test("reason submission trims valid input before calling the API", async () => {
  let received = "";
  const result = await submitReason("decline", "  Schedule conflict  ", async (reason) => {
    received = reason;
    return appointment({ status: "rejected" });
  });
  assert.equal(result.ok, true);
  assert.equal(received, "Schedule conflict");
  assert.equal(result.value.status, "rejected");
});

test("reason submission surfaces persistence failures instead of reporting success", async () => {
  await assert.rejects(
    submitReason("decline", "Schedule conflict", async () => {
      throw new Error("Unable to save the reason");
    }),
    /Unable to save the reason/,
  );
});

test("new time submission surfaces persistence failures instead of reporting success", async () => {
  await assert.rejects(
    submitNewTime({
      appointment: appointment({ status: "confirmed" }),
      selection: { date: "2026-11-12", startMinutes: 600 },
      slots: [slot("2026-11-12", 600)],
      appointments: [],
    }, async () => {
      throw new Error("Unable to move the appointment");
    }),
    /Unable to move the appointment/,
  );
});

test("reschedule payload uses a 30-minute duration", () => {
  assert.deepEqual(buildReschedulePayload("2026-11-12", 600), {
    appointment_date: "2026-11-12",
    start_minutes: 600,
    end_minutes: 630,
  });
});

test("new time validation requires a selected date and time", () => {
  const result = validateNewTimeSelection({
    appointment: appointment({ status: "confirmed" }),
    selection: { date: "", startMinutes: null },
    slots: [slot("2026-11-12", 600)],
    appointments: [],
  });
  assert.equal(result.valid, false);
  assert.match(result.error, /select/i);
});

test("new time validation rejects a slot missing from the available list", () => {
  const result = validateNewTimeSelection({
    appointment: appointment({ status: "confirmed" }),
    selection: { date: "2026-11-12", startMinutes: 600 },
    slots: [slot("2026-11-12", 630)],
    appointments: [],
  });
  assert.equal(result.valid, false);
  assert.match(result.conflict, /no longer available/i);
});

test("new time validation rejects a slot overlapping another appointment", () => {
  const result = validateNewTimeSelection({
    appointment: appointment({ status: "confirmed" }),
    selection: { date: "2026-11-12", startMinutes: 600 },
    slots: [slot("2026-11-12", 600)],
    appointments: [
      appointment({
        id: "other",
        status: "confirmed",
        appointment_date: "2026-11-12",
        start_minutes: 615,
        end_minutes: 645,
      }),
    ],
  });
  assert.equal(result.valid, false);
  assert.match(result.conflict, /overlaps/i);
});

test("new time validation accepts an available, conflict-free slot", () => {
  const result = validateNewTimeSelection({
    appointment: appointment({ status: "confirmed" }),
    selection: { date: "2026-11-12", startMinutes: 600 },
    slots: [slot("2026-11-12", 600)],
    appointments: [],
  });
  assert.equal(result.valid, true);
  assert.equal(result.endMinutes, 630);
});

test("new time submission does not call the API for invalid selections", async () => {
  let calls = 0;
  const result = await submitNewTime({
    appointment: appointment({ status: "confirmed" }),
    selection: { date: "2026-11-12", startMinutes: 600 },
    slots: [],
    appointments: [],
  }, async () => {
    calls += 1;
    return appointment();
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});

test("new time submission sends the validated payload", async () => {
  let received = null;
  const result = await submitNewTime({
    appointment: appointment({ status: "confirmed" }),
    selection: { date: "2026-11-12", startMinutes: 600 },
    slots: [slot("2026-11-12", 600)],
    appointments: [],
  }, async (payload) => {
    received = payload;
    return appointment({
      status: "confirmed",
      appointment_date: "2026-11-12",
      start_minutes: 600,
      end_minutes: 630,
    });
  });
  assert.equal(result.ok, true);
  assert.deepEqual(received, {
    appointment_date: "2026-11-12",
    start_minutes: 600,
    end_minutes: 630,
  });
});
