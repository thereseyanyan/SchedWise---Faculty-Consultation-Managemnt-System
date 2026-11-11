import { useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  History,
  Loader2,
  Lock,
  MapPin,
  MessageSquare,
  Pencil,
  Timer,
  X,
} from "lucide-react"
import {
  consultationApi,
  type Appointment,
  type ApptStatus,
  type ConsultationRecord,
} from "../../api"
import {
  Button,
  clock,
  consultationHasEnded,
  errorMessage,
  formatDate,
  fromIso,
  fullName,
  statusLabel,
} from "../../shared"
import {
  getAppointmentPanelState,
  type AppointmentActionId,
} from "./appointmentPanelState"

type HistoryStep = {
  title: string
  detail: string
  timestamp?: string
  current?: boolean
}

function parseTimestamp(value?: string) {
  if (!value) return null
  const normalized = value.includes("T") ? value : value.replace(" ", "T")
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function relativeAge(value?: string) {
  const date = parseTimestamp(value)
  if (!date) return "Recently"
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000))
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(date, { month: "short", day: "numeric" })
}

function timestampLabel(value?: string) {
  const date = parseTimestamp(value)
  if (!date) return ""
  return `${formatDate(date, { month: "short", day: "numeric", year: "numeric" })} \u00b7 ${date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`
}

function scheduleTimeLabel(date: string, start: number, end: number) {
  return `${formatDate(fromIso(date), {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} \u00b7 ${clock(start, (start >= 720) !== (end >= 720))} \u2013 ${clock(end)}`
}

function actionIcon(id: AppointmentActionId) {
  switch (id) {
    case "accept":
    case "approve":
    case "complete":
      return Check
    case "decline":
    case "reject":
    case "cancel":
      return X
    case "reschedule":
      return CalendarClock
    case "no-show":
      return Timer
    case "view-record":
    default:
      return FileText
  }
}

function actionToneClass(tone: "primary" | "secondary" | "danger") {
  if (tone === "primary") {
    return "bg-primary text-white hover:bg-primary/90"
  }
  if (tone === "danger") {
    return "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
  }
  return "border border-border-card bg-white text-ink hover:border-primary/30 hover:bg-soft"
}

function durationLabel(start: number, end: number) {
  const minutes = Math.max(0, end - start)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`
}

function statusChipClass(status: ApptStatus) {
  if (status === "pending" || status === "reschedule_requested") {
    return "border-amber/25 bg-amber-tint text-amber-800"
  }
  if (status === "confirmed" || status === "completed") {
    return "border-green/20 bg-green-tint text-green"
  }
  return "border-rose-200 bg-rose-50 text-rose-700"
}

function historyFor(appointment: Appointment): HistoryStep[] {
  const requestedAt = appointment.requested_at || appointment.created_at
  const steps: HistoryStep[] = [{
    title: "Request received",
    detail: requestedAt ? `Requested ${relativeAge(requestedAt)}` : "Request date not recorded.",
    timestamp: timestampLabel(requestedAt) || "Timestamp not recorded",
  }]

  if (appointment.status === "pending") {
    steps.push({
      title: "Awaiting review",
      detail: "No decision has been recorded yet.",
      timestamp: "No decision recorded yet.",
      current: true,
    })
    return steps
  }

  if (appointment.status === "reschedule_requested") {
    steps.push({
      title: "Reschedule requested",
      detail: appointment.reschedule_reason?.trim() || "No reason was recorded for the requested change.",
      timestamp: timestampLabel(appointment.updated_at) || "Timestamp not recorded",
      current: true,
    })
    return steps
  }

  if (appointment.status === "rejected") {
    steps.push({
      title: "Declined",
      detail: appointment.reschedule_reason?.trim()
        ? `Reason: ${appointment.reschedule_reason.trim()}`
        : "No reason was recorded.",
      timestamp: timestampLabel(appointment.updated_at) || "Timestamp not recorded",
      current: true,
    })
    return steps
  }

  if (appointment.status === "cancelled") {
    steps.push({
      title: "Cancelled",
      detail: appointment.cancellation_reason?.trim()
        ? `Reason: ${appointment.cancellation_reason.trim()}`
        : "No reason was recorded.",
      timestamp: timestampLabel(appointment.cancelled_at || appointment.updated_at) || "Timestamp not recorded",
      current: true,
    })
    return steps
  }

  if (["confirmed", "completed", "no_show"].includes(appointment.status)) {
    steps.push({
      title: "Approved",
      detail: "Appointment confirmed.",
      timestamp: timestampLabel(appointment.approved_at) || "Timestamp not recorded",
    })
  }

  if (appointment.status === "completed") {
    steps.push({
      title: "Completed",
      detail: "Consultation marked as completed.",
      timestamp: timestampLabel(appointment.completed_at) || "Timestamp not recorded",
      current: true,
    })
  } else if (appointment.status === "no_show") {
    steps.push({
      title: "No-show",
      detail: "Marked as a no-show after the scheduled end time.",
      timestamp: timestampLabel(appointment.updated_at) || "Timestamp not recorded",
      current: true,
    })
  } else if (appointment.status === "confirmed") {
    steps.push({
      title: "Confirmed",
      detail: "Awaiting the consultation.",
      current: true,
    })
  }

  return steps
}

function recordDate(record: ConsultationRecord) {
  if (record.appointment_date) {
    return formatDate(fromIso(record.appointment_date), {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }
  const date = parseTimestamp(record.created_at)
  return date
    ? formatDate(date, { month: "short", day: "numeric", year: "numeric" })
    : "Date not recorded"
}

function DetailTile({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof CalendarDays
}) {
  return (
    <div className="min-w-0 rounded-[12px] border border-divider bg-soft/55 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
        <Icon size={13} className="shrink-0" />
        <span>{label}</span>
      </div>
      <p className="mt-1 truncate text-[14px] font-semibold leading-5 text-ink" title={value}>
        {value}
      </p>
    </div>
  )
}

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-full border border-border-card bg-white text-muted transition hover:border-primary/30 hover:bg-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function FacultyAppointmentDetailPanel({
  appointment,
  position,
  total,
  busy,
  onPrevious,
  onNext,
  onClose,
  onAccept,
  onDecline,
  onOpenRecords,
  onReschedule,
  onCancel,
  onComplete,
  onMarkNoShow,
  conflict,
  actionError,
  timeZone,
}: {
  appointment: Appointment
  position: number
  total: number
  busy?: boolean
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
  onAccept: () => void
  onDecline: () => void
  onOpenRecords?: (appointment?: Appointment) => void
  onReschedule?: () => void
  onCancel?: () => void
  onComplete?: () => void
  onMarkNoShow?: () => void
  conflict?: string | null
  actionError?: string
  timeZone?: string
}) {
  const panelRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const reasonBoxRef = useRef<HTMLDivElement>(null)
  const reasonMeasureRef = useRef<HTMLParagraphElement>(null)
  const copyTimerRef = useRef<number | null>(null)
  const [reasonExpanded, setReasonExpanded] = useState(false)
  const [reasonOverflowing, setReasonOverflowing] = useState(false)
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle")
  const [records, setRecords] = useState<ConsultationRecord[]>([])
  const [currentRecord, setCurrentRecord] = useState<ConsultationRecord | null>(null)
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [recordsError, setRecordsError] = useState("")
  const [recordsReload, setRecordsReload] = useState(0)
  const [notesEditing, setNotesEditing] = useState(false)
  const [draftSummary, setDraftSummary] = useState("")
  const [draftNotes, setDraftNotes] = useState("")
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesError, setNotesError] = useState("")

  const name = fullName(
    appointment.student_first_name,
    appointment.student_last_name,
    appointment.student_number || appointment.student_id,
  )
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "??"
  const studentId = appointment.student_number || appointment.student_id
  const reason = appointment.reason?.trim() || "No reason provided."
  const topic = appointment.topic?.trim() || "Consultation"
  const history = historyFor(appointment)
  const ended = consultationHasEnded(
    appointment.appointment_date,
    appointment.end_minutes,
    timeZone,
  )
  const panelState = getAppointmentPanelState(appointment, ended)
  const isReschedule = panelState.phase === "reschedule"
  const requestedTimeLabel = scheduleTimeLabel(
    appointment.appointment_date,
    appointment.start_minutes,
    appointment.end_minutes,
  )
  const hasSnapshotTime =
    Boolean(appointment.reschedule_from_date) &&
    appointment.reschedule_from_start_minutes !== undefined &&
    appointment.reschedule_from_start_minutes !== null &&
    appointment.reschedule_from_end_minutes !== undefined &&
    appointment.reschedule_from_end_minutes !== null
  const currentTimeLabel = hasSnapshotTime
    ? scheduleTimeLabel(
        appointment.reschedule_from_date as string,
        appointment.reschedule_from_start_minutes as number,
        appointment.reschedule_from_end_minutes as number,
      )
    : "Current time not recorded."
  const actionHandlers: Record<AppointmentActionId, () => void> = {
    accept: onAccept,
    decline: onDecline,
    approve: onAccept,
    reject: onDecline,
    reschedule: onReschedule ?? (() => undefined),
    cancel: onCancel ?? (() => undefined),
    complete: onComplete ?? (() => undefined),
    "no-show": onMarkNoShow ?? (() => undefined),
    "view-record": () => onOpenRecords?.(appointment),
  }
  const actions = panelState.actions
  const actionDisabled = (id: AppointmentActionId) =>
    Boolean(busy) ||
    (id === "reschedule" && !onReschedule) ||
    (id === "cancel" && !onCancel) ||
    (id === "complete" && !onComplete) ||
    (id === "no-show" && !onMarkNoShow) ||
    (id === "view-record" && !onOpenRecords)
  const primaryActionId = actions.find((action) => action.tone === "primary")?.id

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
    setReasonExpanded(false)
    setCopyState("idle")
    setNotesEditing(false)
    setNotesError("")
  }, [appointment.id])

  useEffect(() => {
    const measure = () => {
      const element = reasonMeasureRef.current
      if (!element) return
      const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight) || 24
      setReasonOverflowing(element.scrollHeight > lineHeight * 4 + 2)
    }
    measure()
    if (typeof ResizeObserver === "undefined" || !reasonBoxRef.current) return
    const observer = new ResizeObserver(measure)
    observer.observe(reasonBoxRef.current)
    return () => observer.disconnect()
  }, [appointment.id, reason])

  useEffect(() => {
    let cancelled = false
    setRecordsLoading(true)
    setRecordsError("")
    setRecords([])
    setCurrentRecord(null)
    consultationApi.list({ student_id: appointment.student_id })
      .then((items) => {
        if (cancelled) return
        setCurrentRecord(items.find((record) => record.appointment_id === appointment.id) ?? null)
        setRecords(items.filter((record) => record.appointment_id !== appointment.id))
      })
      .catch((error) => {
        if (!cancelled) setRecordsError(errorMessage(error, "Unable to load previous consultations."))
      })
      .finally(() => {
        if (!cancelled) setRecordsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [appointment.student_id, appointment.id, recordsReload])

  useEffect(() => () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
  }, [])

  const copyStudentId = async () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    try {
      if (!navigator.clipboard?.writeText || !studentId) throw new Error("Clipboard unavailable")
      await navigator.clipboard.writeText(studentId)
      setCopyState("success")
    } catch {
      setCopyState("error")
    }
    copyTimerRef.current = window.setTimeout(() => setCopyState("idle"), 3000)
  }

  const canManageNotes = !recordsLoading && !recordsError
  const startNotesEditing = () => {
    setDraftSummary(currentRecord?.summary ?? "")
    setDraftNotes(currentRecord?.private_notes ?? "")
    setNotesError("")
    setNotesEditing(true)
  }
  const saveConsultationNotes = async () => {
    if (notesSaving) return
    if (!draftSummary.trim()) {
      setNotesError("Enter shared feedback before saving.")
      return
    }
    setNotesSaving(true)
    setNotesError("")
    try {
      await consultationApi.create({
        appointment_id: appointment.id,
        faculty_id: appointment.faculty_id,
        student_id: appointment.student_id,
        summary: draftSummary.trim(),
        private_notes: draftNotes.trim() ? draftNotes.trim() : undefined,
      })
      setNotesEditing(false)
      setRecordsReload((value) => value + 1)
    } catch (error) {
      setNotesError(errorMessage(error, "Unable to save consultation notes."))
    } finally {
      setNotesSaving(false)
    }
  }

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-label="Appointment details"
      className="panel-in flex min-h-0 w-[380px] shrink-0 flex-col overflow-hidden rounded-[16px] border border-border-card bg-white shadow-[0_1px_2px_rgba(45,27,105,0.06)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-divider px-6 py-4">
        <div className="min-w-0">
          <p className="truncate font-[var(--font-display)] text-[15px] font-semibold text-ink">
            Appointment details
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {position} of {total}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <NavButton label="Previous appointment" disabled={position <= 1} onClick={onPrevious}>
            <ChevronLeft size={16} />
          </NavButton>
          <NavButton label="Next appointment" disabled={position >= total} onClick={onNext}>
            <ChevronRight size={16} />
          </NavButton>
          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-divider" />
          <NavButton label="Close appointment details" onClick={onClose}>
            <X size={16} />
          </NavButton>
        </div>
      </header>

      <div ref={bodyRef} className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 py-6">
        <section aria-labelledby="panel-student-heading">
          <h2 id="panel-student-heading" className="sr-only">Student identity</h2>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-soft text-[15px] font-bold text-primary">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[18px] font-semibold leading-6 text-ink" title={name}>{name}</p>
                <div className="mt-1 flex items-center gap-1.5 text-[14px] leading-5 text-muted">
                  <span className="truncate" title={studentId}>{studentId}</span>
                  <button
                    type="button"
                    aria-label="Copy student ID"
                    title="Copy student ID"
                    disabled={!studentId}
                    onClick={() => { void copyStudentId() }}
                    className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copyState === "success" ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
                <p className="mt-0.5 truncate text-[13px] leading-5 text-muted" title={appointment.student_program}>
                  {appointment.student_program || "Program not on file"}
                </p>
                <p
                  role="status"
                  aria-live="polite"
                  className={`mt-1 min-h-4 text-[12px] ${
                    copyState === "error" ? "text-rose-700" : "text-green"
                  }`}
                >
                  {copyState === "success" ? "Student ID copied." : copyState === "error" ? "Unable to copy student ID." : ""}
                </p>
              </div>
            </div>
            <span className={`mt-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-semibold ${statusChipClass(appointment.status)}`}>
              <span className="size-1.5 rounded-full bg-current opacity-70" />
              {statusLabel[appointment.status]}
            </span>
          </div>
        </section>

        <section aria-labelledby="panel-appointment-heading">
          <h2 id="panel-appointment-heading" className="text-[12px] font-semibold text-muted">
            Appointment
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <DetailTile
              label="Date"
              icon={CalendarDays}
              value={formatDate(fromIso(appointment.appointment_date), {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            />
            <DetailTile
              label="Time"
              icon={Clock3}
              value={`${clock(appointment.start_minutes, appointment.start_minutes >= 720 !== appointment.end_minutes >= 720)} \u2013 ${clock(appointment.end_minutes)}`}
            />
            <DetailTile
              label="Duration"
              icon={Timer}
              value={durationLabel(appointment.start_minutes, appointment.end_minutes)}
            />
            <DetailTile
              label="Room"
              icon={MapPin}
              value={appointment.location?.trim() || "Not specified"}
            />
          </div>
          {isReschedule ? (
            <div className="mt-3 space-y-3 rounded-[12px] border border-amber/25 bg-amber-tint px-3 py-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[12px] font-semibold text-amber-800">Current time</p>
                  <p className="mt-0.5 text-[13px] font-semibold leading-5 text-ink">{currentTimeLabel}</p>
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-amber-800">Requested time</p>
                  <p className="mt-0.5 text-[13px] font-semibold leading-5 text-ink">{requestedTimeLabel}</p>
                </div>
              </div>
              <div>
                <p className="text-[12px] font-semibold text-amber-800">Student note</p>
                <p className="mt-0.5 break-words text-[13px] leading-5 text-ink">
                  {appointment.reschedule_reason?.trim() || "No note provided."}
                </p>
              </div>
              {conflict ? (
                <div role="alert" className="flex items-start gap-2 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2.5">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rose-700" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-rose-700">Availability conflict</p>
                    <p className="mt-0.5 break-words text-[12px] leading-5 text-rose-700">{conflict}</p>
                  </div>
                </div>
              ) : conflict === "" ? (
                <p className="rounded-[10px] border border-green/20 bg-green-tint px-3 py-2 text-[12px] font-medium text-green">
                  No availability conflict detected.
                </p>
              ) : (
                <p role="status" aria-live="polite" className="text-[12px] leading-5 text-amber-800">Checking availability conflict…</p>
              )}
            </div>
          ) : null}
          {appointment.status === "rejected" ? (
            <div className="mt-3 rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-3">
              <p className="text-[12px] font-semibold text-rose-700">Decline reason</p>
              <p className="mt-1 break-words text-[13px] leading-5 text-ink">
                {appointment.reschedule_reason?.trim() || "No reason was recorded."}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-rose-700">
                {timestampLabel(appointment.updated_at) || "Timestamp not recorded."}
              </p>
            </div>
          ) : null}
          {appointment.status === "cancelled" ? (
            <div className="mt-3 rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-3">
              <p className="text-[12px] font-semibold text-rose-700">Cancellation reason</p>
              <p className="mt-1 break-words text-[13px] leading-5 text-ink">
                {appointment.cancellation_reason?.trim() || "No reason was recorded."}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-rose-700">
                {timestampLabel(appointment.cancelled_at || appointment.updated_at) || "Timestamp not recorded."}
              </p>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="panel-topic-heading">
          <h2 id="panel-topic-heading" className="text-[12px] font-semibold text-muted">
            Topic
          </h2>
          <p className="mt-2 break-words text-[14px] font-semibold leading-6 text-ink">
            {topic}
          </p>
        </section>

        <section aria-labelledby="panel-reason-heading">
          <h2 id="panel-reason-heading" className="text-[12px] font-semibold text-muted">
            Consultation reason
          </h2>
          <div ref={reasonBoxRef} className="relative mt-2">
            <p
              aria-hidden="true"
              ref={reasonMeasureRef}
              className="pointer-events-none invisible absolute inset-x-0 top-0 break-words text-[14px] leading-6"
            >
              {reason}
            </p>
            <p className={`break-words text-[14px] leading-6 text-ink ${reasonExpanded ? "" : "line-clamp-4"}`}>
              {reason}
            </p>
            {reasonOverflowing ? (
              <button
                type="button"
                aria-expanded={reasonExpanded}
                onClick={() => setReasonExpanded((current) => !current)}
                className="mt-1 rounded text-[12px] font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                {reasonExpanded ? "Show less" : "Show more"}
              </button>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="panel-history-heading">
          <h2 id="panel-history-heading" className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
            <History size={13} /> Appointment history
          </h2>
          <ol className="mt-3">
            {history.map((step, index) => (
              <li key={`${step.title}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
                <div className="flex w-4 shrink-0 flex-col items-center self-stretch">
                  <span className={`mt-1.5 size-2.5 shrink-0 rounded-full border-2 ${
                    step.current ? "border-primary bg-white" : "border-primary bg-primary"
                  }`} />
                  {index < history.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] font-semibold leading-5 ${step.current ? "text-primary" : "text-ink"}`}>
                    {step.title}
                  </p>
                  <p className="mt-0.5 break-words text-[12px] leading-5 text-muted">{step.detail}</p>
                  {step.timestamp ? <p className="mt-0.5 text-[12px] leading-5 text-muted">{step.timestamp}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {notesEditing ? (
          <section aria-label="Edit consultation notes">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
                <Pencil size={13} /> Consultation notes
              </h2>
              <span className="text-[12px] font-medium text-muted">Faculty only</span>
            </div>
            <label className="mt-3 block">
              <span className="text-[12px] font-semibold text-muted">Shared feedback (visible to the student)</span>
              <textarea
                rows={3}
                maxLength={10000}
                value={draftSummary}
                onChange={(event) => setDraftSummary(event.target.value)}
                placeholder="Agreed actions and follow-up instructions"
                className="mt-1.5 w-full resize-y rounded-[10px] border border-border-card bg-white px-3 py-2 text-[13px] leading-6 text-ink outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
            <label className="mt-3 block">
              <span className="text-[12px] font-semibold text-muted">Private notes (faculty only)</span>
              <textarea
                rows={4}
                maxLength={10000}
                value={draftNotes}
                onChange={(event) => setDraftNotes(event.target.value)}
                placeholder="Confidential notes for the assigned faculty member only"
                className="mt-1.5 w-full resize-y rounded-[10px] border border-border-card bg-white px-3 py-2 text-[13px] leading-6 text-ink outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
            {notesError ? (
              <p role="alert" className="mt-2 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] leading-5 text-rose-700">
                {notesError}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 flex-1 text-[12px] leading-5 text-muted">
                Shared feedback is visible to the student. Private notes stay faculty-only.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  disabled={notesSaving}
                  onClick={() => setNotesEditing(false)}
                  className="h-9 rounded-full border border-border-card bg-white px-4 text-[12px] font-semibold text-muted transition hover:border-primary/30 hover:bg-soft hover:text-primary"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={notesSaving || !draftSummary.trim()}
                  onClick={() => { void saveConsultationNotes() }}
                  className="h-9 gap-1.5 rounded-full bg-primary px-4 text-[12px] font-semibold text-white transition hover:opacity-90"
                >
                  {notesSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {notesSaving ? "Saving..." : "Save notes"}
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section aria-labelledby="panel-shared-feedback-heading">
              <div className="flex items-center justify-between gap-3">
                <h2 id="panel-shared-feedback-heading" className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
                  <MessageSquare size={13} /> Shared feedback
                </h2>
                {canManageNotes ? (
                  <button
                    type="button"
                    aria-label="Edit shared feedback and private notes"
                    title="Edit shared feedback and private notes"
                    onClick={startNotesEditing}
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  >
                    <Pencil size={14} />
                  </button>
                ) : null}
              </div>
              {recordsLoading ? (
                <div className="mt-3 animate-pulse rounded-[10px] border border-divider bg-soft/40 px-3 py-4">
                  <div className="h-3 w-2/3 rounded bg-border" />
                  <div className="mt-2 h-3 w-full rounded bg-border" />
                </div>
              ) : recordsError ? (
                <p className="mt-3 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-3 text-[12px] leading-5 text-rose-700">
                  Shared feedback could not be loaded.
                </p>
              ) : currentRecord?.summary?.trim() ? (
                <p className="mt-3 whitespace-pre-wrap break-words rounded-[10px] border border-border-card bg-soft/40 px-3 py-3 text-[13px] leading-6 text-ink">
                  {currentRecord.summary.trim()}
                </p>
              ) : (
                <p className="mt-3 rounded-[10px] border border-dashed border-border-card px-3 py-4 text-[12px] leading-5 text-muted">
                  No shared feedback recorded for this consultation.
                </p>
              )}
            </section>

            <section aria-labelledby="panel-private-notes-heading">
              <div className="flex items-center justify-between gap-3">
                <h2 id="panel-private-notes-heading" className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
                  <Lock size={13} /> Private notes
                </h2>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-[12px] font-medium text-muted">Faculty only</span>
                  {canManageNotes ? (
                    <button
                      type="button"
                      aria-label="Add shared feedback and private notes"
                      title="Add shared feedback and private notes"
                      onClick={startNotesEditing}
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    >
                      <Pencil size={14} />
                    </button>
                  ) : null}
                </div>
              </div>
              {recordsLoading ? (
                <div className="mt-3 animate-pulse rounded-[10px] border border-divider bg-soft/40 px-3 py-4">
                  <div className="h-3 w-2/3 rounded bg-border" />
                  <div className="mt-2 h-3 w-full rounded bg-border" />
                </div>
              ) : recordsError ? (
                <p className="mt-3 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-3 text-[12px] leading-5 text-rose-700">
                  Private notes could not be loaded.
                </p>
              ) : currentRecord?.private_notes?.trim() ? (
                <p className="mt-3 whitespace-pre-wrap break-words rounded-[10px] border border-border-card bg-soft/40 px-3 py-3 text-[13px] leading-6 text-ink">
                  {currentRecord.private_notes.trim()}
                </p>
              ) : (
                <p className="mt-3 rounded-[10px] border border-dashed border-border-card px-3 py-4 text-[12px] leading-5 text-muted">
                  No private notes recorded for this consultation.
                </p>
              )}
            </section>
          </>
        )}

        <section aria-labelledby="panel-records-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="panel-records-heading" className="text-[12px] font-semibold text-muted">
              Previous consultations
            </h2>
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-soft px-2 py-0.5 text-[12px] font-semibold text-primary">
              {recordsLoading ? "\u2026" : records.length}
            </span>
          </div>

          {recordsLoading ? (
            <div className="mt-3 space-y-2" aria-label="Loading previous consultations">
              {[0, 1].map((item) => (
                <div key={item} className="animate-pulse rounded-[10px] border border-divider bg-soft/40 px-3 py-3">
                  <div className="h-3 w-1/3 rounded bg-border" />
                  <div className="mt-2 h-3 w-4/5 rounded bg-border" />
                </div>
              ))}
            </div>
          ) : recordsError ? (
            <div className="mt-3 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-3">
              <p role="alert" className="text-[12px] leading-5 text-rose-700">{recordsError}</p>
              <button
                type="button"
                onClick={() => setRecordsReload((value) => value + 1)}
                className="mt-1.5 rounded text-[12px] font-semibold text-rose-700 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                Try again
              </button>
            </div>
          ) : records.length === 0 ? (
            <p className="mt-3 rounded-[10px] border border-dashed border-border-card px-3 py-4 text-[12px] leading-5 text-muted">
              No previous consultations with this student.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {records.slice(0, 3).map((record) => (
                <div key={record.id} className="rounded-[10px] border border-divider px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] font-semibold text-primary">{recordDate(record)}</p>
                    <FileText size={13} className="shrink-0 text-muted" />
                  </div>
                  <p className="mt-1 truncate text-[13px] font-semibold text-ink" title={record.topic || "Consultation"}>
                    {record.topic || "Consultation"}
                  </p>
                  <p className="mt-1 line-clamp-2 break-words text-[12px] leading-5 text-muted">
                    {record.summary || "No summary recorded."}
                  </p>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            disabled={!onOpenRecords}
            onClick={() => onOpenRecords?.(appointment)}
            className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-full border border-border-card bg-white px-3 text-[12px] font-semibold text-primary transition hover:border-primary/30 hover:bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            View records
          </button>
        </section>
      </div>

      {actions.length > 0 ? (
        <footer className="shrink-0 border-t border-divider bg-white px-6 py-4">
          {actionError ? (
            <p role="alert" className="mb-3 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] leading-5 text-rose-700">
              {actionError}
            </p>
          ) : null}
          <div className={`grid gap-3 ${actions.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {actions.map((action) => {
              const Icon = actionIcon(action.id)
              const isBusy = Boolean(busy) && action.id === primaryActionId
              return (
                <Button
                  key={action.id}
                  type="button"
                  disabled={actionDisabled(action.id)}
                  onClick={actionHandlers[action.id]}
                  className={`h-10 gap-1.5 rounded-full px-3 text-[13px] font-semibold ${actionToneClass(action.tone)}`}
                >
                  {isBusy ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <Icon size={15} />
                      {action.label}
                    </>
                  )}
                </Button>
              )
            })}
          </div>
        </footer>
      ) : null}
    </aside>
  )
}
