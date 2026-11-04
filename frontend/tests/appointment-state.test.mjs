import assert from "node:assert/strict";
import test from "node:test";

import {
  facultyScheduleAllows,
  findAppointmentConflict,
  getAppointmentPanelState,
} from "../src/features/faculty/appointmentPanelState.ts";

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

const actionIds = (state) => state.actions.map((action) => action.id);
const action = (state, id) => state.actions.find((item) => item.id === id);

test("pending requests offer decline and accept", () => {
  const state = getAppointmentPanelState(appointment({ status: "pending" }), false);
  assert.equal(state.phase, "pending");
  assert.equal(state.readOnly, false);
  assert.equal(state.final, false);
  assert.deepEqual(actionIds(state), ["decline", "accept"]);
  assert.equal(action(state, "decline").requiresReason, true);
});

test("reschedule requests offer reject and approve with request details", () => {
  const state = getAppointmentPanelState(appointment({ status: "reschedule_requested" }), false);
  assert.equal(state.phase, "reschedule");
  assert.equal(state.showRescheduleDetails, true);
  assert.deepEqual(actionIds(state), ["reject", "approve"]);
  assert.equal(action(state, "reject").requiresReason, true);
});

test("confirmed appointments before the end time cannot be completed or marked no-show", () => {
  const state = getAppointmentPanelState(appointment({ status: "confirmed" }), false);
  assert.equal(state.phase, "confirmed-upcoming");
  assert.deepEqual(actionIds(state), ["reschedule", "cancel"]);
  assert.equal(actionIds(state).includes("complete"), false);
  assert.equal(actionIds(state).includes("no-show"), false);
  assert.equal(action(state, "cancel").requiresReason, true);
});

test("confirmed appointments after the end time offer complete, no-show, reschedule, and cancel", () => {
  const state = getAppointmentPanelState(appointment({ status: "confirmed" }), true);
  assert.equal(state.phase, "confirmed-ended");
  assert.deepEqual(actionIds(state), ["complete", "no-show", "reschedule", "cancel"]);
  assert.equal(action(state, "cancel").requiresReason, true);
});

for (const [status, phase] of [
  ["completed", "completed"],
  ["rejected", "declined"],
  ["cancelled", "cancelled"],
  ["no_show", "no-show"],
]) {
  test(`${status} appointments are read-only with only a record action`, () => {
    const state = getAppointmentPanelState(appointment({ status }), true);
    assert.equal(state.phase, phase);
    assert.equal(state.readOnly, true);
    assert.equal(state.final, true);
    assert.deepEqual(actionIds(state), ["view-record"]);
  });
}

test("conflict detection finds overlapping active appointments", () => {
  const target = appointment({ status: "reschedule_requested", start_minutes: 540, end_minutes: 600 });
  const conflict = findAppointmentConflict(target, [
    appointment({ id: "other", status: "confirmed", start_minutes: 570, end_minutes: 630 }),
  ]);
  assert.equal(conflict?.id, "other");
});

test("conflict detection ignores self, inactive states, other faculty, other dates, and non-overlaps", () => {
  const target = appointment({ status: "reschedule_requested", start_minutes: 540, end_minutes: 600 });
  const candidates = [
    appointment({ id: target.id, status: "confirmed", start_minutes: 540, end_minutes: 600 }),
    appointment({ id: "completed", status: "completed", start_minutes: 540, end_minutes: 600 }),
    appointment({ id: "cancelled", status: "cancelled", start_minutes: 540, end_minutes: 600 }),
    appointment({ id: "other-faculty", faculty_id: "faculty-2", start_minutes: 540, end_minutes: 600 }),
    appointment({ id: "other-date", appointment_date: "2026-11-11", start_minutes: 540, end_minutes: 600 }),
    appointment({ id: "touching", status: "confirmed", start_minutes: 600, end_minutes: 660 }),
  ];
  assert.equal(findAppointmentConflict(target, candidates), null);
});

test("schedule helper accepts times inside an active availability window", () => {
  const availability = [
    { weekday: 2, start_minutes: 480, end_minutes: 720, active: true },
  ];
  assert.equal(facultyScheduleAllows("2026-11-10", 540, 600, availability, []), true);
});

test("schedule helper rejects times outside availability and inactive rules", () => {
  const availability = [
    { weekday: 2, start_minutes: 480, end_minutes: 720, active: true },
    { weekday: 2, start_minutes: 0, end_minutes: 1440, active: false },
  ];
  assert.equal(facultyScheduleAllows("2026-11-10", 420, 480, availability, []), false);
  assert.equal(facultyScheduleAllows("2026-11-10", 0, 1440, availability, []), false);
});

test("blocked overrides reject overlapping times and available overrides allow them", () => {
  const availability = [];
  const blocked = [{ date: "2026-11-10", kind: "blocked", start_minutes: 540, end_minutes: 600 }];
  const available = [{ date: "2026-11-10", kind: "available", start_minutes: 480, end_minutes: 660 }];
  assert.equal(facultyScheduleAllows("2026-11-10", 540, 600, availability, blocked), false);
  assert.equal(facultyScheduleAllows("2026-11-10", 540, 600, availability, available), true);
});
