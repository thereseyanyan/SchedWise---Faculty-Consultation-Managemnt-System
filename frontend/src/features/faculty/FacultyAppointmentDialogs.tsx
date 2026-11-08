import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  Loader2,
  X,
} from "lucide-react"

import {
  ApiError,
  appointmentApi,
  facultyApi,
  type Appointment,
} from "../../api"
import {
  Button,
  FieldError,
  TextareaTag,
  clock,
  errorMessage,
  formatDate,
  fromIso,
  fullName,
  timeRange,
} from "../../shared"
import {
  DECLINE_QUICK_REASONS,
  normalizeReason,
  submitNewTime,
  submitReason,
  validateNewTimeSelection,
  validateReason,
  type AvailableSlot,
  type NewTimeSelection,
  type ReasonDialogKind,
} from "./appointmentDialogState"
import type { BulkOutcome } from "./appointmentBulkState"

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableWithin(root: HTMLElement | null) {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.getAttribute("aria-hidden") !== "true")
}

function studentName(appointment: Appointment) {
  return fullName(
    appointment.student_first_name,
    appointment.student_last_name,
    "Student",
  )
}

function dateLabel(date: string) {
  return formatDate(fromIso(date), {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function AppointmentSummary({ appointment }: { appointment: Appointment }) {
  return (
    <div className="mt-4 rounded-[12px] border border-border-card bg-soft/60 px-4 py-3">
      <p className="break-words text-[13px] font-semibold text-ink">{studentName(appointment)}</p>
      <p className="mt-0.5 text-[12px] text-muted">
        {dateLabel(appointment.appointment_date)} &middot;{" "}
        {timeRange(appointment.start_minutes, appointment.end_minutes)}
      </p>
      {appointment.topic ? (
        <p className="mt-2 break-words text-[12px] leading-5 text-muted">
          {appointment.topic}
        </p>
      ) : null}
    </div>
  )
}

function DialogAlert({
  children,
  tone = "error",
}: {
  children: ReactNode
  tone?: "error" | "conflict"
}) {
  const Icon = tone === "conflict" ? AlertTriangle : AlertCircle
  return (
    <div
      role="alert"
      className="mt-4 flex items-start gap-2 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] leading-5 text-rose-700"
    >
      <Icon size={15} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

function AppointmentDialogFrame({
  title,
  description,
  onClose,
  busy,
  initialFocusRef,
  children,
}: {
  title: string
  description: ReactNode
  onClose: () => void
  busy: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const busyRef = useRef(busy)
  const closeRef = useRef(onClose)

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const dialog = dialogRef.current
    const target = initialFocusRef?.current ?? focusableWithin(dialog)[0]
    target?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        if (!busyRef.current) closeRef.current()
        return
      }
      if (event.key !== "Tab") return
      const focusable = focusableWithin(dialog)
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!dialog?.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("keydown", onKeyDown, true)
      document.body.style.overflow = previousOverflow
      const returnTarget = previous && previous !== document.body && previous.isConnected
        ? previous
        : document.querySelector<HTMLElement>("[data-dialog-focus-fallback]")
      returnTarget?.focus({ preventScroll: true })
    }
  }, [initialFocusRef])

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(45,27,105,0.30)] p-4 backdrop-blur-[6px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="max-h-[calc(100vh-2rem)] w-full max-w-[440px] overflow-y-auto rounded-[16px] border border-border-card bg-white shadow-[0_20px_60px_rgba(45,27,105,0.18)]"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="font-[var(--font-display)] text-[20px] font-semibold text-ink"
            >
              {title}
            </h2>
            <div id={descriptionId} className="mt-1 break-words text-[13px] leading-5 text-muted">
              {description}
            </div>
          </div>
          <Button
            type="button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-soft text-ink hover:opacity-80"
          >
            <X size={16} />
          </Button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

function ReasonDialog({
  kind,
  appointment,
  title,
  description,
  submitLabel,
  busyLabel,
  dismissLabel,
  quickReasons,
  beforeSubmit,
  onClose,
  onUpdated,
}: {
  kind: ReasonDialogKind
  appointment: Appointment
  title: string
  description: ReactNode
  submitLabel: string
  busyLabel: string
  dismissLabel: string
  quickReasons?: readonly string[]
  beforeSubmit?: () => Promise<string | null>
  onClose: () => void
  onUpdated: (appointment: Appointment) => void
}) {
  const [reason, setReason] = useState("")
  const [fieldError, setFieldError] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [busy, setBusy] = useState(false)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const errorId = useId()

  const updateReason = (value: string) => {
    setReason(value)
    setFieldError("")
    setSubmitError("")
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setFieldError("")
    setSubmitError("")
    setBusy(true)
    try {
      const preflightError = beforeSubmit ? await beforeSubmit() : null
      if (preflightError) {
        setSubmitError(preflightError)
        setBusy(false)
        return
      }
      const result = await submitReason(kind, reason, (value) =>
        kind === "decline"
          ? appointmentApi.reject(appointment.id, value)
          : appointmentApi.cancel(appointment.id, value)
      )
      if (!result.ok) {
        setFieldError(result.error)
        setBusy(false)
        reasonRef.current?.focus()
        return
      }
      setBusy(false)
      onUpdated(result.value)
      onClose()
    } catch (err) {
      setSubmitError(errorMessage(
        err,
        kind === "decline"
          ? "The request could not be declined. Try again."
          : "The appointment could not be cancelled. Try again.",
      ))
      setBusy(false)
    }
  }

  return (
    <AppointmentDialogFrame
      title={title}
      description={description}
      onClose={onClose}
      busy={busy}
      initialFocusRef={reasonRef}
    >
      <form onSubmit={submit} noValidate>
        <div className="px-6 pt-4">
          <AppointmentSummary appointment={appointment} />
          <label className="mt-4 block">
            <span className="text-[13px] font-semibold text-ink">
              Reason &middot; Required
            </span>
            <TextareaTag
              ref={reasonRef}
              rows={4}
              maxLength={5000}
              value={reason}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? errorId : undefined}
              onChange={(event) => updateReason(event.target.value)}
              placeholder="Share a short reason with the student"
              className="mt-2 w-full resize-none rounded-[12px] border border-border bg-white px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <FieldError id={errorId} message={fieldError} />
          {quickReasons ? (
            <div className="mt-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                Quick reasons
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {quickReasons.map((quickReason) => {
                  const selected = reason === quickReason
                  return (
                    <button
                      key={quickReason}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        updateReason(quickReason)
                        reasonRef.current?.focus()
                      }}
                      className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                        selected
                          ? "border-primary bg-soft text-primary"
                          : "border-border-card bg-white text-muted hover:border-primary/30 hover:text-primary"
                      }`}
                    >
                      {quickReason}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
          {submitError ? <DialogAlert>{submitError}</DialogAlert> : null}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-divider px-6 py-4">
          <Button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="h-10 rounded-full border border-primary bg-white px-4 text-[13px] font-semibold text-primary hover:bg-soft"
          >
            {dismissLabel}
          </Button>
          <Button
            type="submit"
            disabled={busy}
            className={`h-10 rounded-full px-4 text-[13px] font-semibold text-white ${
              kind === "cancel"
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-primary hover:opacity-90"
            }`}
          >
            {busy ? busyLabel : submitLabel}
          </Button>
        </div>
      </form>
    </AppointmentDialogFrame>
  )
}

export function DeclineAppointmentDialog({
  appointment,
  beforeSubmit,
  onClose,
  onUpdated,
}: {
  appointment: Appointment
  beforeSubmit?: () => Promise<string | null>
  onClose: () => void
  onUpdated: (appointment: Appointment) => void
}) {
  const reschedule = appointment.status === "reschedule_requested"
  return (
    <ReasonDialog
      kind="decline"
      appointment={appointment}
      title={reschedule ? "Reject requested time" : "Decline appointment"}
      description={reschedule
        ? `The requested new time will not be accepted. ${studentName(appointment)} will receive your reason.`
        : `Decline this consultation request. ${studentName(appointment)} will receive your reason.`}
      submitLabel={reschedule ? "Reject request" : "Decline request"}
      busyLabel="Declining..."
      dismissLabel="Keep request"
      quickReasons={DECLINE_QUICK_REASONS}
      beforeSubmit={beforeSubmit}
      onClose={onClose}
      onUpdated={onUpdated}
    />
  )
}

export function BulkDeclineAppointmentsDialog({
  appointments,
  onClose,
  onConfirm,
  onCompleted,
}: {
  appointments: Appointment[]
  onClose: () => void
  onConfirm: (reason: string) => Promise<BulkOutcome>
  onCompleted: (outcome: BulkOutcome) => void
}) {
  const [reason, setReason] = useState("")
  const [fieldError, setFieldError] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [busy, setBusy] = useState(false)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const errorId = useId()

  const updateReason = (value: string) => {
    setReason(value)
    setFieldError("")
    setSubmitError("")
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const validation = validateReason("decline", reason)
    if (!validation.valid) {
      setFieldError(validation.error)
      setSubmitError("")
      reasonRef.current?.focus()
      return
    }
    setFieldError("")
    setSubmitError("")
    setBusy(true)
    try {
      const outcome = await onConfirm(normalizeReason(reason))
      onCompleted(outcome)
      if (outcome.succeeded.length === 0 && outcome.failed.length > 0) {
        setSubmitError(
          outcome.failed.length === 1
            ? `The request was not declined. ${outcome.failed[0].error}`
            : `None of the ${outcome.failed.length} requests were declined. ${outcome.failed[0].error}`,
        )
        setBusy(false)
        return
      }
      onClose()
    } catch (err) {
      setSubmitError(errorMessage(
        err,
        "The selected requests could not be declined. Try again.",
      ))
      setBusy(false)
    }
  }

  return (
    <AppointmentDialogFrame
      title={`Decline ${appointments.length} ${appointments.length === 1 ? "request" : "requests"}`}
      description="Each student will receive the same reason. Requests that are no longer actionable will not be changed."
      onClose={onClose}
      busy={busy}
      initialFocusRef={reasonRef}
    >
      <form onSubmit={submit} noValidate>
        <div className="px-6 pt-4">
          <div className="rounded-[12px] border border-border-card bg-soft/60 px-4 py-3">
            {appointments.slice(0, 4).map((appointment) => (
              <p key={appointment.id} className="text-[12px] leading-5 text-muted">
                <span className="break-words font-semibold text-ink">{studentName(appointment)}</span>
                {" · "}
                {dateLabel(appointment.appointment_date)} &middot;{" "}
                {timeRange(appointment.start_minutes, appointment.end_minutes)}
              </p>
            ))}
            {appointments.length > 4 ? (
              <p className="mt-1 text-[12px] font-medium text-muted">
                and {appointments.length - 4} more
              </p>
            ) : null}
          </div>
          <label className="mt-4 block">
            <span className="text-[13px] font-semibold text-ink">
              Reason &middot; Required
            </span>
            <TextareaTag
              ref={reasonRef}
              rows={4}
              maxLength={5000}
              value={reason}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? errorId : undefined}
              onChange={(event) => updateReason(event.target.value)}
              placeholder="Share a short reason with the students"
              className="mt-2 w-full resize-none rounded-[12px] border border-border bg-white px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <FieldError id={errorId} message={fieldError} />
          <div className="mt-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
              Quick reasons
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DECLINE_QUICK_REASONS.map((quickReason) => {
                const selected = reason === quickReason
                return (
                  <button
                    key={quickReason}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      updateReason(quickReason)
                      reasonRef.current?.focus()
                    }}
                    className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                      selected
                        ? "border-primary bg-soft text-primary"
                        : "border-border-card bg-white text-muted hover:border-primary/30 hover:text-primary"
                    }`}
                  >
                    {quickReason}
                  </button>
                )
              })}
            </div>
          </div>
          {submitError ? <DialogAlert>{submitError}</DialogAlert> : null}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-divider px-6 py-4">
          <Button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="h-10 rounded-full border border-primary bg-white px-4 text-[13px] font-semibold text-primary hover:bg-soft"
          >
            Keep requests
          </Button>
          <Button
            type="submit"
            disabled={busy}
            className="h-10 rounded-full bg-primary px-4 text-[13px] font-semibold text-white hover:opacity-90"
          >
            {busy ? "Declining..." : "Decline selected"}
          </Button>
        </div>
      </form>
    </AppointmentDialogFrame>
  )
}

export function CancelAppointmentDialog({
  appointment,
  onClose,
  onUpdated,
}: {
  appointment: Appointment
  onClose: () => void
  onUpdated: (appointment: Appointment) => void
}) {
  return (
    <ReasonDialog
      kind="cancel"
      appointment={appointment}
      title="Cancel appointment"
      description={`Cancel this consultation. ${studentName(appointment)} will receive your reason.`}
      submitLabel="Cancel appointment"
      busyLabel="Cancelling..."
      dismissLabel="Keep appointment"
      onClose={onClose}
      onUpdated={onUpdated}
    />
  )
}

export function AcceptAppointmentDialog({
  appointment,
  onClose,
  onUpdated,
  beforeAccept,
}: {
  appointment: Appointment
  onClose: () => void
  onUpdated: (appointment: Appointment) => void
  beforeAccept?: () => Promise<string | null>
}) {
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const noRef = useRef<HTMLButtonElement>(null)

  const accept = async () => {
    if (busy) return
    setSubmitError("")
    setBusy(true)
    try {
      const preflightError = beforeAccept ? await beforeAccept() : null
      if (preflightError) {
        setSubmitError(preflightError)
        setBusy(false)
        return
      }
      const updated = await appointmentApi.approve(appointment.id)
      setBusy(false)
      onUpdated(updated)
      onClose()
    } catch (err) {
      setSubmitError(errorMessage(
        err,
        "The appointment could not be accepted. Try again.",
      ))
      setBusy(false)
    }
  }

  return (
    <AppointmentDialogFrame
      title="Accept request"
      description={`Accept this consultation request and notify ${studentName(appointment)}.`}
      onClose={onClose}
      busy={busy}
      initialFocusRef={noRef}
    >
      <div className="px-6 pt-4">
        <AppointmentSummary appointment={appointment} />
        <p className="mt-4 text-[13px] leading-5 text-muted">
          Accepting confirms the appointment and sends the student a notification.
        </p>
        {submitError ? <DialogAlert>{submitError}</DialogAlert> : null}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-divider px-6 py-4">
        <button
          ref={noRef}
          type="button"
          disabled={busy}
          onClick={onClose}
          className="inline-flex h-10 cursor-pointer items-center justify-center rounded-full border border-primary bg-white px-4 text-[13px] font-semibold text-primary transition hover:bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          No
        </button>
        <Button
          type="button"
          disabled={busy}
          onClick={accept}
          className="h-10 rounded-full bg-primary px-4 text-[13px] font-semibold text-white hover:opacity-90"
        >
          {busy ? "Accepting..." : "Yes, accept"}
        </Button>
      </div>
    </AppointmentDialogFrame>
  )
}

export function ConfirmAppointmentDialog({
  appointment,
  action,
  onClose,
  onUpdated,
}: {
  appointment: Appointment
  action: "complete" | "no-show"
  onClose: () => void
  onUpdated: (appointment: Appointment) => void
}) {
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const noRef = useRef<HTMLButtonElement>(null)
  const isComplete = action === "complete"

  const confirm = async () => {
    if (busy) return
    setSubmitError("")
    setBusy(true)
    try {
      const updated = isComplete
        ? await appointmentApi.complete(appointment.id)
        : await appointmentApi.noShow(appointment.id)
      setBusy(false)
      onUpdated(updated)
      onClose()
    } catch (err) {
      setSubmitError(errorMessage(
        err,
        isComplete
          ? "The consultation could not be marked completed. Try again."
          : "The appointment could not be marked as a no-show. Try again.",
      ))
      setBusy(false)
    }
  }

  return (
    <AppointmentDialogFrame
      title={isComplete ? "Mark consultation completed?" : "Mark as no-show?"}
      description={isComplete
        ? "Confirm that this consultation has been completed."
        : "Confirm that the student did not attend this consultation."}
      onClose={onClose}
      busy={busy}
      initialFocusRef={noRef}
    >
      <div className="px-6 pt-4">
        <AppointmentSummary appointment={appointment} />
        <p className="mt-4 text-[13px] leading-5 text-muted">
          {isComplete
            ? "This records the consultation as completed and notifies the student."
            : "This records a no-show for the appointment and notifies the student."}
        </p>
        {submitError ? <DialogAlert>{submitError}</DialogAlert> : null}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-divider px-6 py-4">
        <button
          ref={noRef}
          type="button"
          disabled={busy}
          onClick={onClose}
          className="inline-flex h-10 cursor-pointer items-center justify-center rounded-full border border-primary bg-white px-4 text-[13px] font-semibold text-primary transition hover:bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          No
        </button>
        <Button
          type="button"
          disabled={busy}
          onClick={confirm}
          className={`h-10 rounded-full px-4 text-[13px] font-semibold text-white ${
            isComplete ? "bg-primary hover:opacity-90" : "bg-rose-600 hover:bg-rose-700"
          }`}
        >
          {busy
            ? "Saving..."
            : isComplete
              ? "Yes, mark completed"
              : "Yes, mark no-show"}
        </Button>
      </div>
    </AppointmentDialogFrame>
  )
}

export function ChooseNewTimeDialog({
  appointment,
  appointments,
  onClose,
  onUpdated,
}: {
  appointment: Appointment
  appointments: Appointment[]
  onClose: () => void
  onUpdated: (appointment: Appointment) => void
}) {
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [reloadToken, setReloadToken] = useState(0)
  const [selection, setSelection] = useState<NewTimeSelection>({
    date: "",
    startMinutes: null,
  })
  const [conflict, setConflict] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [busy, setBusy] = useState(false)
  const firstDateRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError("")
    facultyApi.slots()
      .then((rows) => {
        if (cancelled) return
        setSlots(rows
          .filter((row) => row.faculty_id === appointment.faculty_id)
          .map((row) => ({
            date: row.date,
            start_minutes: row.start_minutes,
          })))
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(errorMessage(
          err,
          "Available times could not be loaded. Try again.",
        ))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [appointment.faculty_id, reloadToken])

  const dates = Array.from(new Set(slots.map((slot) => slot.date))).sort()
  const times = slots
    .filter((slot) => slot.date === selection.date)
    .map((slot) => slot.start_minutes)
    .sort((a, b) => a - b)

  useEffect(() => {
    if (loading) return
    if (!selection.date || selection.startMinutes === null) {
      setConflict("")
      return
    }
    const validation = validateNewTimeSelection({
      appointment,
      selection,
      slots,
      appointments,
    })
    setConflict(validation.conflict ?? "")
  }, [appointment, appointments, loading, selection, slots])

  const chooseDate = (date: string) => {
    setSelection({ date, startMinutes: null })
    setConflict("")
    setSubmitError("")
  }

  const chooseTime = (startMinutes: number) => {
    setSelection((current) => ({ ...current, startMinutes }))
    setSubmitError("")
  }

  const confirm = async () => {
    if (busy || loading) return
    setSubmitError("")
    setBusy(true)
    try {
      const result = await submitNewTime({
        appointment,
        selection,
        slots,
        appointments,
      }, (payload) => appointmentApi.reschedule(appointment.id, payload))
      if (!result.ok) {
        if (result.conflict) {
          setConflict(result.conflict)
          setReloadToken((token) => token + 1)
        } else {
          setSubmitError(result.error)
        }
        setBusy(false)
        return
      }
      setBusy(false)
      onUpdated(result.value)
      onClose()
    } catch (err) {
      const message = errorMessage(
        err,
        "The appointment could not be moved. Try again.",
      )
      const conflictError = err instanceof ApiError &&
        (err.status === 409 || /available|conflict/i.test(message))
      if (conflictError) {
        setConflict(`${message} Choose another time.`)
        setReloadToken((token) => token + 1)
      } else {
        setSubmitError(message)
      }
      setBusy(false)
    }
  }

  const canConfirm = !busy &&
    !loading &&
    !loadError &&
    !conflict &&
    Boolean(selection.date) &&
    selection.startMinutes !== null

  return (
    <AppointmentDialogFrame
      title="Choose new time"
      description={`Move this appointment for ${studentName(appointment)} to another available time.`}
      onClose={onClose}
      busy={busy}
      initialFocusRef={firstDateRef}
    >
      <div className="px-6 pt-4">
        <AppointmentSummary appointment={appointment} />
        <div className="mt-4">
          {loading ? (
            <div
              role="status"
              className="flex items-center gap-2 rounded-[10px] border border-border-card bg-soft px-3 py-3 text-[13px] text-muted"
            >
              <Loader2 size={16} className="animate-spin" />
              Loading available times...
            </div>
          ) : loadError ? (
            <div>
              <DialogAlert>{loadError}</DialogAlert>
              <Button
                type="button"
                onClick={() => setReloadToken((token) => token + 1)}
                className="mt-3 h-9 rounded-full border border-primary bg-white px-3 text-[12px] font-semibold text-primary hover:bg-soft"
              >
                Retry
              </Button>
            </div>
          ) : dates.length === 0 ? (
            <div className="rounded-[10px] border border-border-card bg-soft px-3 py-4 text-center">
              <CalendarClock size={20} className="mx-auto text-muted" />
              <p className="mt-2 text-[13px] font-semibold text-ink">
                No open times in the next 14 days
              </p>
              <p className="mt-1 text-[12px] text-muted">
                Keep the current appointment or adjust availability first.
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Date
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {dates.map((date, index) => {
                    const selected = selection.date === date
                    return (
                      <button
                        key={date}
                        ref={index === 0 ? firstDateRef : undefined}
                        type="button"
                        aria-pressed={selected}
                        disabled={busy}
                        onClick={() => chooseDate(date)}
                        className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                          selected
                            ? "border-primary bg-primary text-white"
                            : "border-border-card bg-white text-muted hover:border-primary/30 hover:text-primary"
                        }`}
                      >
                        {dateLabel(date)}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="mt-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Time
                </p>
                {selection.date ? (
                  times.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {times.map((startMinutes) => {
                        const selected = selection.startMinutes === startMinutes
                        return (
                          <button
                            key={startMinutes}
                            type="button"
                            aria-pressed={selected}
                            disabled={busy}
                            onClick={() => chooseTime(startMinutes)}
                            className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                              selected
                                ? "border-primary bg-primary text-white"
                                : "border-border-card bg-white text-muted hover:border-primary/30 hover:text-primary"
                            }`}
                          >
                            {clock(startMinutes)}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="mt-2 text-[12px] text-muted">
                      No open times on this date. Choose another date.
                    </p>
                  )
                ) : (
                  <p className="mt-2 text-[12px] text-muted">
                    Choose a date to see available times.
                  </p>
                )}
              </div>
              <p className="mt-3 text-[12px] text-muted" aria-live="polite">
                {selection.date && selection.startMinutes !== null
                  ? `Selected: ${dateLabel(selection.date)} at ${clock(selection.startMinutes)}`
                  : "No time selected."}
              </p>
            </>
          )}
          {conflict ? <DialogAlert tone="conflict">{conflict}</DialogAlert> : null}
          {submitError ? <DialogAlert>{submitError}</DialogAlert> : null}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-divider px-6 py-4">
        <Button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="h-10 rounded-full border border-primary bg-white px-4 text-[13px] font-semibold text-primary hover:bg-soft"
        >
          Keep appointment
        </Button>
        <Button
          type="button"
          disabled={!canConfirm}
          onClick={confirm}
          className="h-10 rounded-full bg-primary px-4 text-[13px] font-semibold text-white hover:opacity-90"
        >
          {busy ? "Moving..." : "Confirm new time"}
        </Button>
      </div>
    </AppointmentDialogFrame>
  )
}
