import type { Appointment, AppNotification } from "../../api"

export const APPOINTMENT_UNAVAILABLE_MESSAGE = "This appointment is no longer available."
export const REQUEST_ALREADY_HANDLED_MESSAGE = "This request was already handled."

export function accountScopeChanged(previousUserId: string, nextUserId: string) {
  return previousUserId !== nextUserId
}

const PENDING_REQUEST_STATUSES: Appointment["status"][] = [
  "pending",
  "reschedule_requested",
]

export function notificationAppointmentId(
  notification: Pick<AppNotification, "related_appointment_id">,
): string | null {
  const id = notification.related_appointment_id?.trim()
  return id ? id : null
}

export function appointmentViewErrorMessage(status: number, fallback: string) {
  return status === 403 || status === 404 ? APPOINTMENT_UNAVAILABLE_MESSAGE : fallback
}

export function isPendingRequestStatus(status: Appointment["status"]) {
  return PENDING_REQUEST_STATUSES.includes(status)
}

export function isPendingRequestAppointment(
  appointment: Pick<Appointment, "status">,
) {
  return isPendingRequestStatus(appointment.status)
}

export function isRescheduleRequestStatus(status: Appointment["status"]) {
  return status === "reschedule_requested"
}
