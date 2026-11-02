import { useEffect, useRef, useState } from "react"
import {
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

function durationLabel(start: number, end: number) {
  const minutes = Math.max(0, end - start)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`
}

function statusChipClass(status: ApptStatus) {
  if (status === "pending" || status === "reschedule_requested") {
    return "border-amber/25 bg-amber-tint text-amber"
  }
  if (status === "confirmed" || status === "completed") {
    return "border-green/20 bg-green-tint text-green"
  }
  return "border-rose-200 bg-rose-50 text-rose-700"
}

function historyFor(appointment: Appointment): HistoryStep[] {
  const requestedAt = appointment.requested_at || appointment.created_at
  const requested: HistoryStep = {
    title: "Request received",
    detail: requestedAt ? `Requested ${relativeAge(requestedAt)}` : "Request details not recorded.",
    timestamp: timestampLabel(requestedAt) || "Timestamp not available",
  }

  if (appointment.status === "pending") {
    return [
      requested,
      {
        title: "Awaiting review",
        detail: "Waiting for your response.",
        timestamp: "No decision recorded yet.",
      },
      {
        title: "Accept or decline",
        detail: "Respond using the actions below.",
        current: true,
      },
    ]
  }

  if (appointment.status === "reschedule_requested") {
    return [
      requested,
      {
        title: "New time requested",
        detail: appointment.reschedule_reason?.trim() || "The student asked for a different time. No reason was recorded.",
        timestamp: timestampLabel(appointment.updated_at) || "Timestamp not available",
      },
      {
        title: "Awaiting review",
        detail: "Waiting for your decision on the requested time.",
        timestamp: "No decision recorded yet.",
      },
      {
        title: "Approve or reject",
        detail: "Respond using the actions below.",
        current: true,
      },
    ]
  }

  if (appointment.status === "confirmed") {
    const steps: HistoryStep[] = [requested]
    steps.push({
      title: "Approved",
      detail: "Appointment confirmed.",
      timestamp: timestampLabel(appointment.approved_at) || "Timestamp not available",
    })
    steps.push({
      title: "Upcoming",
      detail: "Awaiting the consultation.",
      current: true,
    })
    return steps
  }

  if (appointment.status === "completed") {
    return [
      requested,
      {
        title: "Approved",
        detail: "Appointment confirmed.",
        timestamp: timestampLabel(appointment.approved_at) || "Timestamp not available",
      },
      {
        title: "Completed",
        detail: "Consultation marked as completed.",
        timestamp: timestampLabel(appointment.completed_at) || "Timestamp not available",
        current: true,
      },
    ]
  }

  if (appointment.status === "cancelled") {
    return [
      requested,
      {
        title: "Cancelled",
        detail: appointment.reason?.trim() ? `Reason: ${appointment.reason.trim()}` : "Cancelled. No reason was recorded.",
        timestamp: timestampLabel(appointment.cancelled_at || appointment.updated_at) || "Timestamp not available",
        current: true,
      },
    ]
  }

  if (appointment.status === "rejected") {
    return [
      requested,
      {
        title: "Declined",
        detail: appointment.reason?.trim() ? `Reason: ${appointment.reason.trim()}` : "Declined. No reason was recorded.",
        timestamp: timestampLabel(appointment.updated_at) || "Timestamp not available",
        current: true,
      },
    ]
  }

  if (appointment.status === "no_show") {
    return [
      requested,
      {
        title: "Approved",
        detail: "Appointment confirmed.",
        timestamp: timestampLabel(appointment.approved_at) || "Timestamp not available",
      },
      {
        title: "No-show",
        detail: "Marked as no-show after the scheduled end time.",
        timestamp: timestampLabel(appointment.updated_at) || "Timestamp not available",
        current: true,
      },
    ]
  }

  return [
    requested,
    {
      title: statusLabel[appointment.status],
      detail: `Current status: ${statusLabel[appointment.status]}.`,
      timestamp: timestampLabel(appointment.updated_at) || "Timestamp not available",
      current: true,
    },
  ]
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
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [recordsError, setRecordsError] = useState("")
  const [recordsReload, setRecordsReload] = useState(0)

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
  const isPending = appointment.status === "pending" || appointment.status === "reschedule_requested"
  const isReschedule = appointment.status === "reschedule_requested"
  const acceptLabel = isReschedule ? "Approve" : "Accept"
  const declineLabel = isReschedule ? "Reject" : "Decline"
  const isConfirmed = appointment.status === "confirmed"
  const ended = consultationHasEnded(appointment.appointment_date, appointment.end_minutes)
  const canMarkNoShow = isConfirmed && ended
  const canComplete = isConfirmed && ended
  const isFinal = ["completed", "cancelled", "rejected", "no_show"].includes(appointment.status)
  const showPendingFooter = isPending
  const showConfirmedFooter = isConfirmed && !isFinal
  const requestedTimeLabel = `${formatDate(fromIso(appointment.appointment_date), {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} · ${clock(appointment.start_minutes, appointment.start_minutes >= 720 !== appointment.end_minutes >= 720)} \u2013 ${clock(appointment.end_minutes)}`

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
    setReasonExpanded(false)
    setCopyState("idle")
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
    consultationApi.list({ student_id: appointment.student_id })
      .then((items) => {
        if (cancelled) return
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

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-label="Appointment details"
      className="panel-in flex min-h-0 w-[380px] shrink-0 flex-col overflow-hidden rounded-[16px] border border-border-card bg-white shadow-[0_1px_2px_rgba(45,27,105,0.06)] focus:outline-none"
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
            <div className="mt-3 space-y-2 rounded-[12px] border border-amber/25 bg-amber-tint px-3 py-3">
              <div>
                <p className="text-[12px] font-semibold text-amber">Current time</p>
                <p className="mt-0.5 text-[13px] font-semibold text-ink">{requestedTimeLabel}</p>
              </div>
              <div>
                <p className="text-[12px] font-semibold text-amber">Requested time</p>
                <p className="mt-0.5 text-[13px] font-semibold text-ink">Pending review - see request details</p>
              </div>
              <div>
                <p className="text-[12px] font-semibold text-amber">Student note</p>
                <p className="mt-0.5 break-words text-[13px] leading-5 text-ink">
                  {appointment.reschedule_reason?.trim() || "No note provided."}
                </p>
              </div>
              <p className="text-[12px] leading-5 text-amber">Availability conflict will be checked on approval/rejection if applicable.</p>
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
                className="mt-1 text-[12px] font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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

        <section aria-labelledby="panel-private-notes-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="panel-private-notes-heading" className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
              <Lock size={13} /> Private notes
            </h2>
          </div>
          <p className="mt-3 rounded-[10px] border border-dashed border-border-card px-3 py-4 text-[12px] leading-5 text-muted">
            Private notes are stored in consultation records and visible only to authorized faculty via server authorization.
          </p>
        </section>

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
              <p className="text-[12px] leading-5 text-rose-700">{recordsError}</p>
              <button
                type="button"
                onClick={() => setRecordsReload((value) => value + 1)}
                className="mt-1.5 text-[12px] font-semibold text-rose-700 underline underline-offset-2"
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

      {showPendingFooter ? (
        <footer className="shrink-0 border-t border-divider bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              disabled={busy}
              onClick={onDecline}
              className="h-10 basis-0 flex-1 rounded-full border border-border-card bg-white text-[14px] font-semibold text-ink hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
            >
              {declineLabel}
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={onAccept}
              className="h-10 basis-0 flex-1 rounded-full bg-primary text-[14px] font-semibold text-white hover:bg-primary/90"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : acceptLabel}
            </Button>
          </div>
        </footer>
      ) : null}

      {isFinal ? (
        <footer className="shrink-0 border-t border-divider bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              disabled={!onOpenRecords}
              onClick={() => onOpenRecords?.(appointment)}
              className="h-10 basis-0 flex-1 rounded-full border border-border-card bg-white text-[14px] font-semibold text-primary hover:border-primary/30 hover:bg-soft"
            >
              <FileText size={16} /> View record
            </Button>
          </div>
        </footer>
      ) : null}
    </aside>
  )
}
