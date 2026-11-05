import { useEffect, useRef, useState, type FormEvent } from "react"
import type { CalendarDemoEvent, CalendarEditScope } from "./calendarDemoState"

type Props = {
  mode:
    | "scope"
    | "archive"
    | "delete"
    | "booked"
    | "decline-consultation"
    | "confirm-decline"
    | "cancel-consultation"
    | "confirm-cancel"
    | "reschedule-consultation"
  event: CalendarDemoEvent
  booking?: CalendarDemoEvent
  reason?: string
  onClose: () => void
  onContinue?: (scope: CalendarEditScope) => void
  onConfirm?: () => Promise<boolean>
  onGoToAppointment?: () => void
  onSubmitReason?: (reason: string) => void
  onBackToForm?: () => void
  onReschedule?: (draft: {
    date: string
    startMinutes: number
    endMinutes: number
    location: string
  }) => Promise<string | null>
}

function timeLabel(minutes: number) {
  const date = new Date(Date.UTC(2026, 0, 1, Math.floor(minutes / 60), minutes % 60))
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date)
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`))
}

function timeInputValue(minutes: number) {
  return `${Math.floor(minutes / 60).toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`
}

export function CalendarEventLifecycleDialog({
  mode,
  event,
  booking,
  reason: initialReason = "",
  onClose,
  onContinue,
  onConfirm,
  onGoToAppointment,
  onSubmitReason,
  onBackToForm,
  onReschedule,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [scope, setScope] = useState<CalendarEditScope>("this")
  const [reason, setReason] = useState(initialReason)
  const [reasonError, setReasonError] = useState("")
  const [date, setDate] = useState(event.date)
  const [startTime, setStartTime] = useState(timeInputValue(event.startMinutes))
  const [endTime, setEndTime] = useState(timeInputValue(event.endMinutes))
  const [location, setLocation] = useState(event.location)
  const [formError, setFormError] = useState("")
  const [savingReschedule, setSavingReschedule] = useState(false)
  const [confirmingAction, setConfirmingAction] = useState(false)
  const [confirmError, setConfirmError] = useState("")

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    dialog.showModal()
    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key !== "Escape" || !dialog.open) return
      keyboardEvent.preventDefault()
      keyboardEvent.stopPropagation()
      closeRef.current()
    }
    document.addEventListener("keydown", handleKeyDown, true)
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true)
      if (dialog.open) dialog.close()
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus({ preventScroll: true })
      }
    }
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog?.open) return
    if (mode === "decline-consultation" || mode === "cancel-consultation") {
      reasonRef.current?.focus()
    } else {
      dialog.querySelector<HTMLButtonElement>("button")?.focus()
    }
  }, [mode])

  useEffect(() => {
    setReason(initialReason)
    setReasonError("")
    setFormError("")
    setConfirmError("")
    setDate(event.date)
    setStartTime(timeInputValue(event.startMinutes))
    setEndTime(timeInputValue(event.endMinutes))
    setLocation(event.location)
  }, [event.id, event.date, event.startMinutes, event.endMinutes, event.location, initialReason, mode])

  const submitReason = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault()
    if (!reason.trim()) {
      setReasonError(mode === "decline-consultation"
        ? "Please provide a reason before declining."
        : "Please provide a reason before canceling.")
      return
    }
    onSubmitReason?.(reason.trim())
  }
  const confirmAction = async () => {
    if (confirmingAction) return
    setConfirmingAction(true)
    setConfirmError("")
    try {
      if (await onConfirm?.() === false) setConfirmError("Could not save. Try again.")
    } finally {
      setConfirmingAction(false)
    }
  }

  const saveReschedule = async () => {
    if (savingReschedule) return
    setFormError("")
    const startMinutes = timeToMinutes(startTime)
    const endMinutes = timeToMinutes(endTime)
    if (!isValidDate(date) || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      setFormError("Enter a valid date and an end time after the start time.")
      return
    }
    if (!location.trim()) {
      setFormError("Enter a location or room.")
      return
    }
    setSavingReschedule(true)
    try {
      const error = await onReschedule?.({
        date,
        startMinutes,
        endMinutes,
        location: location.trim(),
      })
      if (error) {
        setFormError(error)
        return
      }
      onClose()
    } finally {
      setSavingReschedule(false)
    }
  }
  const submitReschedule = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault()
    void saveReschedule()
  }

  const isReasonForm = mode === "decline-consultation" || mode === "cancel-consultation"
  const isReschedule = mode === "reschedule-consultation"
  const title = mode === "scope"
    ? "Edit recurring event"
    : mode === "archive"
      ? "Archive this slot?"
      : mode === "delete"
        ? "Delete permanently?"
        : mode === "booked"
          ? "This slot is booked"
          : mode === "decline-consultation"
            ? "Decline consultation request"
            : mode === "confirm-decline"
              ? "Decline this request?"
              : mode === "cancel-consultation"
                ? "Cancel consultation"
                : mode === "confirm-cancel"
                  ? "Cancel consultation?"
                  : "Reschedule consultation"

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="calendar-lifecycle-title"
      aria-describedby="calendar-lifecycle-description"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[460px] overflow-y-auto rounded-2xl border border-violet-100 bg-white p-0 text-ink shadow-2xl backdrop:bg-slate-950/50"
    >
      <form onSubmit={
        isReasonForm
          ? submitReason
          : isReschedule
            ? submitReschedule
            : (formEvent) => formEvent.preventDefault()
      }>
        <div className="p-5 sm:p-6">
          <h2 id="calendar-lifecycle-title" className="font-[var(--font-display)] text-xl font-semibold text-ink">{title}</h2>
          {confirmError ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
              <p>{confirmError}</p>
              <p className="mt-1">{event.type === "open-slot" ? "Your availability was not changed." : "Your schedule was not changed."}</p>
              <button type="button" disabled={confirmingAction} onClick={() => void confirmAction()} className="mt-1 min-h-9 rounded-full px-2 font-semibold underline underline-offset-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">
                {confirmingAction ? "Saving…" : "Try again"}
              </button>
            </div>
          ) : null}
          {mode === "scope" ? (
            <>
              <p id="calendar-lifecycle-description" className="mt-2 text-sm leading-6 text-muted">
                Choose which occurrences of “{event.title}” to edit.
              </p>
              <fieldset className="mt-4 space-y-2">
                <legend className="sr-only">Recurring event edit scope</legend>
                {([
                  ["this", "This slot only"],
                  ["following", "This and following"],
                  ["all", "All slots"],
                ] as const).map(([value, label]) => (
                  <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-page-bg">
                    <input
                      type="radio"
                      name="edit-scope"
                      value={value}
                      checked={scope === value}
                      onChange={() => setScope(value)}
                      className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-primary"
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary">Cancel</button>
                <button type="button" onClick={() => onContinue?.(scope)} className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Continue</button>
              </div>
            </>
          ) : mode === "archive" ? (
            <>
              <p id="calendar-lifecycle-description" className="mt-2 text-sm leading-6 text-muted">
                Archived slots leave the calendar and can’t be booked. You can restore them later.
              </p>
              <p className="mt-3 rounded-lg bg-page-bg px-3 py-2 text-sm font-semibold text-ink">{event.title}</p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary">Keep slot</button>
                <button type="button" disabled={confirmingAction} onClick={() => void confirmAction()} className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{confirmingAction ? "Saving…" : "Archive slot"}</button>
              </div>
            </>
          ) : mode === "delete" ? (
            <>
              <p id="calendar-lifecycle-description" className="mt-2 text-sm leading-6 text-muted">
                Permanently delete “{event.title}”? This cannot be undone.
              </p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary">Keep event</button>
                <button type="button" disabled={confirmingAction} onClick={() => void confirmAction()} className="min-h-11 rounded-full bg-rose-700 px-5 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700">{confirmingAction ? "Saving…" : "Delete permanently"}</button>
              </div>
            </>
          ) : mode === "booked" ? (
            <>
              <p id="calendar-lifecycle-description" className="mt-2 text-sm leading-6 text-muted">
                This slot has an active appointment. The appointment must first be canceled with a written reason.
              </p>
              {booking ? (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  {booking.title} · {timeLabel(booking.startMinutes)}–{timeLabel(booking.endMinutes)}
                </p>
              ) : null}
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary">No, keep slot</button>
                <button type="button" onClick={onGoToAppointment} className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Go to appointment</button>
              </div>
            </>
          ) : isReasonForm ? (
            <>
              <p id="calendar-lifecycle-description" className="mt-2 text-sm leading-6 text-muted">
                {mode === "decline-consultation"
                  ? "Add a reason for declining this request."
                  : "A written reason is required and will be kept with this local demo appointment."}
              </p>
              <dl className="mt-4 space-y-2 rounded-xl bg-page-bg p-3 text-sm">
                <div><dt className="inline font-semibold text-ink">Student: </dt><dd className="inline text-muted">{event.type === "consultation" ? event.student : "Unknown"}</dd></div>
                <div><dt className="inline font-semibold text-ink">Topic: </dt><dd className="inline text-muted">{event.type === "consultation" ? event.topic : event.title}</dd></div>
                <div><dt className="inline font-semibold text-ink">Date: </dt><dd className="inline text-muted">{dateLabel(event.date)}</dd></div>
                <div><dt className="inline font-semibold text-ink">Time: </dt><dd className="inline text-muted">{timeLabel(event.startMinutes)}–{timeLabel(event.endMinutes)}</dd></div>
              </dl>
              <label className="mt-4 block">
                <span className="text-sm font-semibold text-ink">
                  {mode === "decline-consultation" ? "Reason for declining" : "Reason for canceling"} · Required
                </span>
                <textarea
                  ref={reasonRef}
                  rows={4}
                  maxLength={1000}
                  value={reason}
                  aria-invalid={Boolean(reasonError)}
                  aria-required="true"
                  aria-describedby={reasonError ? "consultation-reason-error" : undefined}
                  onChange={(event) => {
                    setReason(event.target.value)
                    setReasonError("")
                  }}
                  className="mt-1.5 w-full resize-y rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                />
                {reasonError ? <span id="consultation-reason-error" role="alert" className="mt-1 block text-sm text-rose-800">{reasonError}</span> : null}
              </label>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary">
                  {mode === "decline-consultation" ? "Keep request" : "Keep consultation"}
                </button>
                <button type="submit" className="min-h-11 rounded-full bg-rose-700 px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700">
                  {mode === "decline-consultation" ? "Decline request" : "Continue"}
                </button>
              </div>
            </>
          ) : mode === "confirm-decline" || mode === "confirm-cancel" ? (
            <>
              <p id="calendar-lifecycle-description" className="mt-2 text-sm leading-6 text-muted">
                {mode === "confirm-decline"
                  ? `Decline ${event.type === "consultation" ? event.student : "this student's"} consultation request?`
                  : `Cancel the consultation with ${event.type === "consultation" ? event.student : "this student"}?`}
              </p>
              <p className="mt-3 rounded-lg bg-page-bg px-3 py-2 text-sm text-ink">
                {mode === "confirm-decline" ? "Reason for declining" : "Cancellation reason"}: {initialReason}
              </p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={onBackToForm} className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary">No, keep it</button>
                <button type="button" disabled={confirmingAction} onClick={() => void confirmAction()} className="min-h-11 rounded-full bg-rose-700 px-5 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700">
                  {mode === "confirm-decline" ? "Yes, decline" : "Yes, cancel"}
                </button>
              </div>
            </>
          ) : isReschedule ? (
            <>
              <p id="calendar-lifecycle-description" className="mt-2 text-sm leading-6 text-muted">
                Update the date, time, and location for {event.type === "consultation" ? event.student : "this consultation"}. Changes stay in this local demo.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold text-ink">Date
                  <input type="date" required value={date} onChange={(change) => setDate(change.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-border px-3 text-sm font-normal focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" />
                </label>
                <label className="text-sm font-semibold text-ink">Location / Room
                  <input type="text" required value={location} onChange={(change) => setLocation(change.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-border px-3 text-sm font-normal focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" />
                </label>
                <label className="text-sm font-semibold text-ink">Start time
                  <input type="time" required value={startTime} onChange={(change) => setStartTime(change.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-border px-3 text-sm font-normal focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" />
                </label>
                <label className="text-sm font-semibold text-ink">End time
                  <input type="time" required value={endTime} onChange={(change) => setEndTime(change.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-border px-3 text-sm font-normal focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" />
                </label>
              </div>
              {formError ? (
                <div role="alert" className="mt-3 text-sm font-medium text-rose-800">
                  <p>{formError}</p>
                  {formError === "Could not save. Try again." ? (
                    <>
                      <p className="mt-1">The consultation was not changed.</p>
                      <button type="button" disabled={savingReschedule} onClick={() => void saveReschedule()} className="mt-1 min-h-9 rounded-full px-2 font-semibold underline underline-offset-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">
                        {savingReschedule ? "Saving…" : "Try again"}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" disabled={savingReschedule} onClick={onClose} className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold text-primary hover:bg-soft disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">Keep current time</button>
                <button type="submit" disabled={savingReschedule} className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{savingReschedule ? "Saving…" : "Save reschedule"}</button>
              </div>
            </>
          ) : (
            <p id="calendar-lifecycle-description" className="mt-2 text-sm leading-6 text-muted">
              This appointment action is unavailable.
            </p>
          )}
        </div>
      </form>
    </dialog>
  )
}

function timeToMinutes(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
