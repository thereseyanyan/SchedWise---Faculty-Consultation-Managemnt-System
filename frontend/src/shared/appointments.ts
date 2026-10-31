import { useEffect, useSyncExternalStore } from "react"
import {
  appointmentApi,
  consultationApi,
  type Appointment,
  type ApptStatus,
  type UiAppointment,
} from "../api"
import { fullName, initialsOf } from "./utils"

export const EMPTY_APPOINTMENTS: UiAppointment[] = []

let apptCache: UiAppointment[] | null = null
export const apptListeners = new Set<() => void>()
let remoteLoadStarted = false

export const toUiAppointment = (row: Appointment): UiAppointment => {
  const student = fullName(row.student_first_name, row.student_last_name, row.student_id)
  return {
    ...row,
    faculty: fullName(row.faculty_first_name, row.faculty_last_name, row.faculty_id),
    student,
    initials: initialsOf(student),
    date: row.appointment_date,
    start: row.start_minutes,
    end: row.end_minutes,
    notes: "",
  }
}

export const readAppts = (): UiAppointment[] => apptCache ?? EMPTY_APPOINTMENTS

export const writeAppts = (next: UiAppointment[]) => {
  apptCache = next
  apptListeners.forEach((listener) => listener())
}

export const mergeAppointment = (row: Appointment) => {
  const next = apptCache ? [...apptCache] : []
  const uiRow = toUiAppointment(row)
  const index = next.findIndex((a) => a.id === row.id)
  if (index >= 0) next[index] = uiRow
  else next.push(uiRow)
  writeAppts(next)
}

export const subscribeAppts = (listener: () => void) => {
  apptListeners.add(listener)
  return () => {
    apptListeners.delete(listener)
  }
}

export function useAppointments() {
  useEffect(() => {
    if (remoteLoadStarted) return
    remoteLoadStarted = true
    void appointmentApi
      .list()
      .then((rows) => {
        apptCache = rows.map(toUiAppointment)
        apptListeners.forEach((listener) => listener())
      })
      .catch((error: unknown) => {
        console.error("Unable to load appointments from the PHP API.", error)
        apptListeners.forEach((listener) => listener())
      })
  }, [])
  const list = useSyncExternalStore(subscribeAppts, readAppts)
  const update = (fn: (current: UiAppointment[]) => UiAppointment[]) =>
    writeAppts(fn(readAppts()))
  return [list, update] as const
}

export const statusTone = {
  confirmed: "success",
  pending: "warning",
  rejected: "danger",
  reschedule_requested: "warning",
  cancelled: "danger",
  completed: "success",
  no_show: "danger",
} as const
export const statusLabel: Record<ApptStatus, string> = {
  confirmed: "Confirmed",
  pending: "Pending approval",
  rejected: "Rejected",
  reschedule_requested: "Reschedule requested",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
}

export async function applyAppointmentPatch(
  appointment: UiAppointment,
  patch: Partial<UiAppointment>,
) {
  if (patch.status === "completed") {
    mergeAppointment(await appointmentApi.complete(appointment.id))
    return
  }
  if (patch.status === "no_show") {
    mergeAppointment(await appointmentApi.noShow(appointment.id))
    return
  }
  if (patch.status === "confirmed" && ["pending", "reschedule_requested"].includes(appointment.status)) {
    mergeAppointment(await appointmentApi.approve(appointment.id))
    return
  }
  if (
    patch.date !== undefined ||
    patch.start !== undefined ||
    patch.end !== undefined
  ) {
    mergeAppointment(
      await appointmentApi.reschedule(appointment.id, {
        appointment_date: patch.date ?? appointment.date,
        start_minutes: patch.start ?? appointment.start,
        end_minutes: patch.end ?? appointment.end,
        reason: "Rescheduled by faculty",
      }),
    )
    return
  }
  if (patch.summary !== undefined || patch.notes !== undefined) {
    await consultationApi.create({
      appointment_id: appointment.id,
      faculty_id: appointment.faculty_id,
      student_id: appointment.student_id,
      private_notes: patch.notes,
      summary: patch.summary?.trim() ?? "",
    })
    writeAppts(
      readAppts().map((row) =>
        row.id === appointment.id
          ? {
              ...row,
              notes: patch.notes ?? "",
              summary: patch.summary?.trim() ?? row.summary,
            }
          : row,
      ),
    )
  }
}
