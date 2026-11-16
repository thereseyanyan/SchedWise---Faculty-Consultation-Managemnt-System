import type { Appointment } from "../../api"
import { findAppointmentConflict } from "./appointmentPanelState.ts"

export type AvailableSlot = {
  date: string
  start_minutes: number
}

export type ReasonDialogKind = "decline" | "cancel"

export type NewTimeSelection = {
  date: string
  startMinutes: number | null
}

export type SubmissionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; conflict?: string }

export const RESCHEDULE_DURATION_MINUTES = 30

export const DECLINE_QUICK_REASONS = [
  "Schedule conflict",
  "Outside office hours",
  "Insufficient notice",
  "Already fully booked",
] as const

export function normalizeReason(value: string) {
  return value.trim()
}

export function validateReason(kind: ReasonDialogKind, value: string) {
  if (normalizeReason(value)) return { valid: true as const }
  return {
    valid: false as const,
    error: kind === "decline"
      ? "Enter a reason before declining this request."
      : "Enter a reason before cancelling this appointment.",
  }
}

export async function submitReason<T>(
  kind: ReasonDialogKind,
  value: string,
  submit: (reason: string) => Promise<T>,
): Promise<SubmissionResult<T>> {
  const validation = validateReason(kind, value)
  if (!validation.valid) {
    return { ok: false, error: validation.error }
  }
  return { ok: true, value: await submit(normalizeReason(value)) }
}

export function buildReschedulePayload(date: string, startMinutes: number) {
  return {
    appointment_date: date,
    start_minutes: startMinutes,
    end_minutes: startMinutes + RESCHEDULE_DURATION_MINUTES,
  }
}

export function validateNewTimeSelection({
  appointment,
  selection,
  slots,
  appointments,
}: {
  appointment: Appointment
  selection: NewTimeSelection
  slots: AvailableSlot[]
  appointments: Appointment[]
}) {
  if (!selection.date || selection.startMinutes === null) {
    return {
      valid: false as const,
      error: "Select a new date and time.",
    }
  }

  const available = slots.some((slot) =>
    slot.date === selection.date &&
    slot.start_minutes === selection.startMinutes
  )
  if (!available) {
    return {
      valid: false as const,
      error: "",
      conflict: "The selected time is no longer available. Choose another time.",
    }
  }

  const endMinutes = selection.startMinutes + RESCHEDULE_DURATION_MINUTES
  const candidate: Appointment = {
    ...appointment,
    appointment_date: selection.date,
    start_minutes: selection.startMinutes,
    end_minutes: endMinutes,
  }
  if (findAppointmentConflict(candidate, appointments)) {
    return {
      valid: false as const,
      error: "",
      conflict: "That time now overlaps with another appointment. Choose another time.",
    }
  }

  return { valid: true as const, endMinutes }
}

export async function submitNewTime<T>(
  input: {
    appointment: Appointment
    selection: NewTimeSelection
    slots: AvailableSlot[]
    appointments: Appointment[]
  },
  submit: (payload: {
    appointment_date: string
    start_minutes: number
    end_minutes: number
  }) => Promise<T>,
): Promise<SubmissionResult<T>> {
  const validation = validateNewTimeSelection(input)
  if (!validation.valid) {
    return {
      ok: false,
      error: validation.error,
      conflict: validation.conflict,
    }
  }
  return {
    ok: true,
    value: await submit(buildReschedulePayload(
      input.selection.date,
      input.selection.startMinutes as number,
    )),
  }
}
