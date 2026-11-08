import assert from "node:assert/strict";
import test from "node:test";

import {
  APPOINTMENT_UNAVAILABLE_MESSAGE,
  REQUEST_ALREADY_HANDLED_MESSAGE,
  appointmentViewErrorMessage,
  isPendingRequestAppointment,
  isPendingRequestStatus,
  isRescheduleRequestStatus,
  notificationAppointmentId,
} from "../src/features/faculty/notificationAppointmentState.ts";

test("appointment notifications expose their linked appointment", () => {
  assert.equal(
    notificationAppointmentId({ related_appointment_id: "appointment-1" }),
    "appointment-1",
  );
  assert.equal(
    notificationAppointmentId({ related_appointment_id: "  appointment-2  " }),
    "appointment-2",
  );
});

test("account notifications have no appointment action", () => {
  assert.equal(notificationAppointmentId({}), null);
  assert.equal(notificationAppointmentId({ related_appointment_id: null }), null);
  assert.equal(notificationAppointmentId({ related_appointment_id: "   " }), null);
});

test("403 and 404 responses show the unavailable appointment message", () => {
  assert.equal(
    appointmentViewErrorMessage(403, "Unable to open this appointment."),
    APPOINTMENT_UNAVAILABLE_MESSAGE,
  );
  assert.equal(
    appointmentViewErrorMessage(404, "Unable to open this appointment."),
    APPOINTMENT_UNAVAILABLE_MESSAGE,
  );
  assert.equal(
    appointmentViewErrorMessage(500, "Unable to open this appointment."),
    "Unable to open this appointment.",
  );
});

test("only pending and reschedule-requested appointments need a response", () => {
  assert.equal(isPendingRequestStatus("pending"), true);
  assert.equal(isPendingRequestStatus("reschedule_requested"), true);
  assert.equal(isPendingRequestStatus("confirmed"), false);
  assert.equal(isPendingRequestStatus("rejected"), false);
  assert.equal(isPendingRequestStatus("cancelled"), false);
  assert.equal(isPendingRequestStatus("completed"), false);
  assert.equal(isPendingRequestStatus("no_show"), false);
  assert.equal(isPendingRequestAppointment({ status: "pending" }), true);
  assert.equal(isPendingRequestAppointment({ status: "confirmed" }), false);
});

test("reschedule approval is limited to reschedule-requested appointments", () => {
  assert.equal(isRescheduleRequestStatus("reschedule_requested"), true);
  assert.equal(isRescheduleRequestStatus("pending"), false);
  assert.equal(isRescheduleRequestStatus("confirmed"), false);
  assert.equal(isRescheduleRequestStatus("rejected"), false);
});

test("handled requests use one consistent status message", () => {
  assert.equal(REQUEST_ALREADY_HANDLED_MESSAGE, "This request was already handled.");
});
