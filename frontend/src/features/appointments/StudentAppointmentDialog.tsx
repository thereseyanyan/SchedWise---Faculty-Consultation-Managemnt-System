import { useEffect, useState, type FormEvent } from "react"
import { CalendarClock, X } from "lucide-react"
import {
  ApiError,
  appointmentApi,
  facultyApi,
  type Appointment,
} from "../../api"
import { confirmAction } from "../../confirmation"
import {
  Button,
  FieldError,
  SelectTag,
  TextareaTag,
  clock,
  errorMessage,
  formatDate,
  fromIso,
  pillField,
  pillLabel,
  timeRange,
} from "../../shared"

export type StudentAppointmentMode = "cancel" | "reschedule"

type AvailableSlot = { date: string; start_minutes: number }

export function StudentAppointmentDialog({
  appointment,
  mode,
  onClose,
  onUpdated,
}: {
  appointment: Appointment
  mode: StudentAppointmentMode
  onClose: () => void
  onUpdated: (appointment: Appointment) => void
}) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [retryable, setRetryable] = useState(false)
  const [notice, setNotice] = useState("")
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(mode === "reschedule")
  const [slotsError, setSlotsError] = useState("")
  const [selectedDate, setSelectedDate] = useState("")
  const [selectedStart, setSelectedStart] = useState<number | "">("")

  const dates = [...new Set(slots.map((slot) => slot.date))]
  const times = slots
    .filter((slot) => slot.date === selectedDate)
    .map((slot) => slot.start_minutes)

  const loadSlots = async (announce = false) => {
    setSlotsLoading(true)
    setSlotsError("")
    setError("")
    setRetryable(false)
    if (announce) setNotice("")
    try {
      const allSlots = await facultyApi.slots()
      const ownSlots = allSlots
        .filter((slot) => slot.faculty_id === appointment.faculty_id)
        .map((slot) => ({
          date: slot.date,
          start_minutes: slot.start_minutes,
        }))
      setSlots(ownSlots)
      if (ownSlots.length > 0) {
        const nextDate = ownSlots.some((slot) => slot.date === selectedDate)
          ? selectedDate
          : ownSlots[0].date
        const nextTimes = ownSlots
          .filter((slot) => slot.date === nextDate)
          .map((slot) => slot.start_minutes)
        const nextStart = nextTimes.includes(Number(selectedStart))
          ? Number(selectedStart)
          : nextTimes[0]
        setSelectedDate(nextDate)
        setSelectedStart(nextStart)
      } else {
        setSelectedDate("")
        setSelectedStart("")
      }
      if (announce) {
        setNotice("Available times refreshed. Choose another slot and try again.")
      }
    } catch (err) {
      setSlotsError(
        errorMessage(err, "Unable to load available times for this faculty member."),
      )
    } finally {
      setSlotsLoading(false)
    }
  }

  useEffect(() => {
    if (mode !== "reschedule") return
    void loadSlots()
    // The dialog is remounted for each appointment/mode pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, appointment.id])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    setRetryable(false)
    setNotice("")

    if (!reason.trim()) {
      setError(
        mode === "cancel"
          ? "Enter a reason for cancelling this appointment."
          : "Enter a short reason for the new time.",
      )
      return
    }

    if (mode === "cancel") {
      if (
        !await confirmAction(
          "Cancel this appointment? The faculty member will be notified.",
        )
      ) return
      setBusy(true)
      try {
        onUpdated(await appointmentApi.cancel(appointment.id, reason.trim()))
      } catch (err) {
        setError(errorMessage(err, "Unable to cancel this appointment."))
      } finally {
        setBusy(false)
      }
      return
    }

    if (!selectedDate || selectedStart === "") {
      setError("Select a new date and time.")
      return
    }
    if (
      selectedDate === appointment.appointment_date &&
      Number(selectedStart) === appointment.start_minutes
    ) {
      setError("Choose a time different from the current appointment.")
      return
    }

    const end = Number(selectedStart) + 30
    if (
      !await confirmAction(
        `Request ${formatDate(fromIso(selectedDate), {
          weekday: "short",
          month: "short",
          day: "numeric",
        })}, ${timeRange(Number(selectedStart), end)} for this appointment?`,
      )
    ) return

    setBusy(true)
    try {
      onUpdated(
        await appointmentApi.reschedule(appointment.id, {
          appointment_date: selectedDate,
          start_minutes: Number(selectedStart),
          end_minutes: end,
          reason: reason.trim(),
        }),
      )
    } catch (err) {
      const message = errorMessage(err, "Unable to request a new time.")
      const slotProblem =
        err instanceof ApiError &&
        (err.status === 409 || /available|conflict/i.test(err.message))
      setRetryable(slotProblem)
      setError(
        slotProblem
          ? `${message} Refresh available times and choose another slot.`
          : message,
      )
    } finally {
      setBusy(false)
    }
  }

  const title = mode === "cancel" ? "Cancel appointment" : "Request a new time"

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-appointment-action-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <form onSubmit={submit}>
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-purple-600">
                Appointment
              </p>
              <h2
                id="student-appointment-action-title"
                className="mt-1 text-xl font-bold tracking-tight text-slate-900"
              >
                {title}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {appointment.topic} ·{" "}
                {formatDate(fromIso(appointment.appointment_date), {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}{" "}
                at {timeRange(appointment.start_minutes, appointment.end_minutes)}
              </p>
            </div>
            <Button
              type="button"
              onClick={onClose}
              title="Close appointment actions"
              className="size-9 shrink-0 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </Button>
          </div>

          <div className="space-y-5 px-6 py-6">
            <p className="rounded-xl bg-purple-50 px-4 py-3 text-xs leading-5 text-purple-800">
              {mode === "cancel"
                ? "The faculty member will be notified. This cannot be undone."
                : "Choose another time published by this faculty member. They will review the request before it is confirmed."}
            </p>

            {mode === "reschedule" && (
              <>
                {slotsLoading ? (
                  <p className="text-sm text-slate-500">Loading available times…</p>
                ) : slotsError ? (
                  <div
                    role="alert"
                    className="space-y-2 rounded-xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700"
                  >
                    <p>{slotsError}</p>
                    <Button
                      type="button"
                      onClick={() => { void loadSlots(true) }}
                      className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      Retry loading times
                    </Button>
                  </div>
                ) : dates.length === 0 ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                    This faculty member has no open times in the next 14 days.
                    You can keep the current appointment or cancel it instead.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className={pillLabel}>New date</span>
                      <SelectTag
                        value={selectedDate}
                        onChange={(event) => {
                          const date = event.target.value
                          const nextTime = slots.find((slot) => slot.date === date)
                          setSelectedDate(date)
                          setSelectedStart(nextTime?.start_minutes ?? "")
                          setError("")
                          setRetryable(false)
                          setNotice("")
                        }}
                        className={`${pillField} cursor-pointer`}
                      >
                        {dates.map((date) => (
                          <option key={date} value={date}>
                            {formatDate(fromIso(date), {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </option>
                        ))}
                      </SelectTag>
                    </label>
                    <label className="block">
                      <span className={pillLabel}>New time (30 min)</span>
                      <SelectTag
                        value={selectedStart}
                        onChange={(event) => {
                          setSelectedStart(Number(event.target.value))
                          setError("")
                          setRetryable(false)
                          setNotice("")
                        }}
                        className={`${pillField} cursor-pointer`}
                      >
                        {times.map((time) => (
                          <option key={time} value={time}>
                            {clock(time)}
                          </option>
                        ))}
                      </SelectTag>
                    </label>
                  </div>
                )}

                {notice && (
                  <p className="rounded-xl bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
                    {notice}
                  </p>
                )}
              </>
            )}

            <label className="block">
              <span className={pillLabel}>
                {mode === "cancel"
                  ? "Cancellation reason"
                  : "Reason for the new time"}
              </span>
              <TextareaTag
                rows={4}
                value={reason}
                maxLength={5000}
                aria-invalid={!!error && !reason.trim()}
                aria-describedby={
                  !reason.trim() && error ? "student-appointment-reason-error" : undefined
                }
                onChange={(event) => {
                  setReason(event.target.value)
                  setError("")
                  setRetryable(false)
                  setNotice("")
                }}
                placeholder={
                  mode === "cancel"
                    ? "Explain why you can no longer attend..."
                    : "Explain why you need a different time..."
                }
                className={`${pillField} resize-none`}
              />
              <FieldError
                id="student-appointment-reason-error"
                message={!reason.trim() && error ? error : undefined}
              />
            </label>

            {error && reason.trim() && (
              <div
                role="alert"
                className="space-y-2 rounded-xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700"
              >
                <p>{error}</p>
                {retryable && mode === "reschedule" && (
                  <Button
                    type="button"
                    onClick={() => { void loadSlots(true) }}
                    className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Refresh available times
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-6 py-4">
            <Button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Keep appointment
            </Button>
            <Button
              type="submit"
              disabled={
                busy ||
                (mode === "reschedule" &&
                  (slotsLoading || dates.length === 0 || selectedStart === ""))
              }
              className={`gap-2 rounded-[4px] px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                mode === "cancel"
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-purple-600 hover:bg-purple-700"
              }`}
            >
              {mode === "reschedule" && <CalendarClock size={14} />}
              {busy
                ? mode === "cancel"
                  ? "Cancelling…"
                  : "Sending…"
                : mode === "cancel"
                  ? "Confirm cancellation"
                  : "Send reschedule request"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
