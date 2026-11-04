import type { Appointment } from "../../api"

export type BulkActionId = "accept" | "decline"

export type BulkFailure = {
  appointment: Appointment
  error: string
}

export type BulkOutcome = {
  succeeded: Appointment[]
  failed: BulkFailure[]
  skipped: Appointment[]
}

export const canBulkAct = (action: BulkActionId, appointment: Appointment) => {
  void action
  return (
    appointment.status === "pending" ||
    appointment.status === "reschedule_requested"
  )
}

export const bulkEligibleAppointments = (
  appointments: Appointment[],
  action: BulkActionId,
) => appointments.filter((appointment) => canBulkAct(action, appointment))

export const resolveShortcutTarget = (
  appointments: Appointment[],
  selectedId: string,
  action: BulkActionId,
) => {
  const selected = appointments.find((appointment) => appointment.id === selectedId)
  if (selected && canBulkAct(action, selected)) return selected
  return appointments.find((appointment) => canBulkAct(action, appointment)) ?? null
}

export const nextAppointmentIndex = (currentIndex: number, length: number) => {
  if (length <= 0) return -1
  if (currentIndex < 0 || currentIndex >= length) return 0
  return (currentIndex + 1) % length
}

export const previousAppointmentIndex = (currentIndex: number, length: number) => {
  if (length <= 0) return -1
  if (currentIndex < 0 || currentIndex >= length) return length - 1
  return (currentIndex - 1 + length) % length
}

export const runBulkAppointmentAction = async (
  appointments: Appointment[],
  action: BulkActionId,
  submit: (appointment: Appointment) => Promise<Appointment>,
  describeError: (appointment: Appointment, error: unknown) => string,
): Promise<BulkOutcome> => {
  const seen = new Set<string>()
  const outcome: BulkOutcome = { succeeded: [], failed: [], skipped: [] }

  for (const appointment of appointments) {
    if (seen.has(appointment.id)) continue
    seen.add(appointment.id)
    if (!canBulkAct(action, appointment)) {
      outcome.skipped.push(appointment)
      continue
    }
    try {
      outcome.succeeded.push(await submit(appointment))
    } catch (error) {
      outcome.failed.push({ appointment, error: describeError(appointment, error) })
    }
  }

  return outcome
}
