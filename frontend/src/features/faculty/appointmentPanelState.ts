import type { Appointment } from "../../api"

export type AppointmentActionId =
  | "accept"
  | "decline"
  | "approve"
  | "reject"
  | "reschedule"
  | "cancel"
  | "complete"
  | "no-show"
  | "view-record"

export type AppointmentActionTone = "primary" | "secondary" | "danger"

export type AppointmentAction = {
  id: AppointmentActionId
  label: string
  tone: AppointmentActionTone
  requiresReason?: boolean
}

export type AppointmentPhase =
  | "pending"
  | "reschedule"
  | "confirmed-upcoming"
  | "confirmed-ended"
  | "completed"
  | "declined"
  | "cancelled"
  | "no-show"

export type AppointmentPanelState = {
  phase: AppointmentPhase
  readOnly: boolean
  final: boolean
  actions: AppointmentAction[]
  showRescheduleDetails: boolean
}

const VIEW_RECORD: AppointmentAction = {
  id: "view-record",
  label: "View record",
  tone: "secondary",
}

const FINAL_STATE: Omit<AppointmentPanelState, "phase"> = {
  readOnly: true,
  final: true,
  actions: [VIEW_RECORD],
  showRescheduleDetails: false,
}

export function getAppointmentPanelState(
  appointment: Appointment,
  ended: boolean,
): AppointmentPanelState {
  switch (appointment.status) {
    case "pending":
      return {
        phase: "pending",
        readOnly: false,
        final: false,
        showRescheduleDetails: false,
        actions: [
          { id: "decline", label: "Decline", tone: "secondary", requiresReason: true },
          { id: "accept", label: "Accept", tone: "primary" },
        ],
      }
    case "reschedule_requested":
      return {
        phase: "reschedule",
        readOnly: false,
        final: false,
        showRescheduleDetails: true,
        actions: [
          { id: "reject", label: "Reject", tone: "secondary", requiresReason: true },
          { id: "approve", label: "Approve", tone: "primary" },
        ],
      }
    case "confirmed":
      if (!ended) {
        return {
          phase: "confirmed-upcoming",
          readOnly: false,
          final: false,
          showRescheduleDetails: false,
          actions: [
            { id: "reschedule", label: "Reschedule", tone: "secondary" },
            { id: "cancel", label: "Cancel", tone: "danger", requiresReason: true },
          ],
        }
      }
      return {
        phase: "confirmed-ended",
        readOnly: false,
        final: false,
        showRescheduleDetails: false,
        actions: [
          { id: "complete", label: "Mark completed", tone: "primary" },
          { id: "no-show", label: "Mark no-show", tone: "danger" },
          { id: "reschedule", label: "Reschedule", tone: "secondary" },
          { id: "cancel", label: "Cancel", tone: "danger", requiresReason: true },
        ],
      }
    case "completed":
      return { ...FINAL_STATE, phase: "completed" }
    case "rejected":
      return { ...FINAL_STATE, phase: "declined" }
    case "cancelled":
      return { ...FINAL_STATE, phase: "cancelled" }
    case "no_show":
      return { ...FINAL_STATE, phase: "no-show" }
  }
}

export type AvailabilityWindow = {
  weekday: number
  start_minutes: number
  end_minutes: number
  active?: boolean | number | string
}

export type ScheduleException = {
  date: string
  kind: "available" | "blocked"
  start_minutes?: number | null
  end_minutes?: number | null
}

const ACTIVE_CONFLICT_STATUSES = ["pending", "confirmed", "reschedule_requested"]

export function findAppointmentConflict(
  appointment: Appointment,
  appointments: Appointment[],
): Appointment | null {
  return appointments.find((other) =>
    other.id !== appointment.id &&
    other.faculty_id === appointment.faculty_id &&
    other.appointment_date === appointment.appointment_date &&
    ACTIVE_CONFLICT_STATUSES.includes(other.status) &&
    other.start_minutes < appointment.end_minutes &&
    other.end_minutes > appointment.start_minutes
  ) ?? null
}

function ruleIsActive(active: AvailabilityWindow["active"]) {
  return active !== false && active !== 0 && active !== "0"
}

function hasTimes(rule: ScheduleException): rule is ScheduleException & {
  start_minutes: number
  end_minutes: number
} {
  return rule.start_minutes !== null &&
    rule.start_minutes !== undefined &&
    rule.end_minutes !== null &&
    rule.end_minutes !== undefined
}

export function facultyScheduleAllows(
  date: string,
  startMinutes: number,
  endMinutes: number,
  availability: AvailabilityWindow[],
  overrides: ScheduleException[],
): boolean {
  const dayOverrides = overrides.filter((row) => row.date === date)

  for (const row of dayOverrides) {
    if (row.kind !== "blocked") continue
    if (!hasTimes(row)) return false
    if (row.start_minutes < endMinutes && row.end_minutes > startMinutes) return false
  }

  for (const row of dayOverrides) {
    if (row.kind !== "available") continue
    if (!hasTimes(row)) return true
    if (row.start_minutes <= startMinutes && row.end_minutes >= endMinutes) return true
  }

  const [year, month, day] = date.split("-").map(Number)
  const weekday = new Date(year, month - 1, day).getDay()
  return availability.some((row) =>
    ruleIsActive(row.active) &&
    Number(row.weekday) === weekday &&
    Number(row.start_minutes) <= startMinutes &&
    Number(row.end_minutes) >= endMinutes
  )
}
