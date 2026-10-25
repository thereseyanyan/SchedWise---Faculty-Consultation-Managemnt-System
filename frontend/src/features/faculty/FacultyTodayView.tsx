import { useEffect, useState, type FormEvent } from "react"
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, Info, X } from "lucide-react"
import { appointmentApi, type Appointment } from "../../api"
import { confirmAction } from "../../confirmation"
import {
  Avatar,
  Button,
  FieldError,
  TextareaTag,
  errorMessage,
  formatDate,
  fullName,
  mergeAppointment,
  pillField,
  pillLabel,
  toIso,
} from "../../shared"

type IncomingRequest = {
  id: string
  student_name: string
  reason: string
  note: string
  timeLabel: string
  timeIso: string
  initials: string
  status: string
  room?: string
  topic?: string
}

function formatTime(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  const period = hours >= 12 ? "PM" : "AM"
  const displayHours = hours % 12 || 12
  return `${displayHours}:${mins.toString().padStart(2, "0")} ${period}`
}

function getInitials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??"
  )
}

function formatDateLabel(dateStr: string) {
  try {
    const [y, m, d] = dateStr.split("-").map(Number)
    const date = new Date(y, m - 1, d)
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
  } catch {
    return dateStr
  }
}

export function FacultyTodayView() {
  const [requests, setRequests] = useState<IncomingRequest[]>([])
  const [upcoming, setUpcoming] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState("")
  const [declineTarget, setDeclineTarget] = useState<IncomingRequest | null>(null)
  const [declineReason, setDeclineReason] = useState("")
  const [declineError, setDeclineError] = useState("")

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const appointments = await appointmentApi.list()
      const studentName = (appt: Appointment) =>
        fullName(appt.student_first_name, appt.student_last_name, `Student ID: ${appt.student_id}`)

      const pendingRequests = appointments
        .filter((appt) => ["pending", "reschedule_requested"].includes(appt.status))
        .sort((a, b) => (a.appointment_date === b.appointment_date ? a.start_minutes - b.start_minutes : a.appointment_date.localeCompare(b.appointment_date)))
        .map((appt) => ({
          id: appt.id,
          student_name: studentName(appt),
          reason: appt.topic || "Consultation request",
          note: appt.status === "reschedule_requested" ? (appt as any).reschedule_reason ?? (appt as any).note ?? "" : (appt as any).note ?? "",
          timeLabel: `${formatDateLabel(appt.appointment_date)} · ${formatTime(appt.start_minutes)}`,
          timeIso: appt.appointment_date,
          initials: getInitials(studentName(appt)),
          status: appt.status,
          room: appt.location || undefined,
          topic: appt.topic || undefined,
        }))

      const upcomingList = appointments
        .filter((appt) => {
          if (appt.status === "cancelled" || appt.status === "rejected" || appt.status === "completed" || appt.status === "no_show") return false
          if (appt.status === "pending") return false
          return true
        })
        .sort((a, b) => (a.appointment_date === b.appointment_date ? a.start_minutes - b.start_minutes : a.appointment_date.localeCompare(b.appointment_date)))

      setRequests(pendingRequests)
      setUpcoming(upcomingList)
    } catch (err) {
      setError(errorMessage(err, "Failed to load appointments"))
      setRequests([])
      setUpcoming([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const openDecline = (request: IncomingRequest) => {
    setDeclineTarget(request)
    setDeclineReason("")
    setDeclineError("")
  }

  const declineRequest = async (event: FormEvent) => {
    event.preventDefault()
    if (!declineTarget) return
    if (!declineReason.trim()) {
      setDeclineError("Enter a short reason so the student knows why the request was declined.")
      return
    }
    setActingId(declineTarget.id)
    setDeclineError("")
    try {
      const rejected = await appointmentApi.reject(declineTarget.id, declineReason.trim())
      mergeAppointment(rejected)
      setRequests((current) => current.filter((request) => request.id !== declineTarget.id))
      setUpcoming((current) => current.filter((appt) => appt.id !== declineTarget.id))
      setDeclineTarget(null)
      setDeclineReason("")
    } catch (err) {
      setDeclineError(errorMessage(err, "Failed to reject request."))
    } finally {
      setActingId("")
    }
  }

  const visibleRequests = requests.slice(0, 2)
  const moreRequests = requests.length - visibleRequests.length
  const visibleUpcoming = upcoming.slice(0, 3)
  const moreUpcoming = upcoming.length - visibleUpcoming.length

  const getStatusChip = (status: string) => {
    if (status === "confirmed") return { label: "Confirmed", className: "bg-green-tint text-green" }
    if (status === "pending") return { label: "Pending", className: "bg-amber-tint text-amber" }
    if (status === "reschedule_requested") return { label: "Reschedule", className: "bg-amber-tint text-amber" }
    return { label: status.replace(/_/g, " "), className: "bg-soft text-ink" }
  }

  return (
    <div className="mt-6">
      {error && (
        <div className="mb-4 flex items-center justify-between rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          <span>Couldn't load appointments · Retry</span>
          <button type="button" onClick={loadData} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch">
        <section className="flex h-full flex-col rounded-[16px] border border-border-card bg-card p-5 shadow-[0_1px_2px_rgba(45,27,105,0.06)] lg:col-span-5">
          <div className="flex items-center justify-between">
            <h2 className="font-[var(--font-display)] text-[18px] leading-[24px] font-semibold text-ink">Needs your response</h2>
            {requests.length > 0 ? (
              <span className="inline-flex items-center rounded-full bg-amber-tint px-2.5 py-1 text-[12px] font-semibold text-amber">
                {requests.length}
              </span>
            ) : null}
          </div>
          <div className="-mx-5 mt-3 border-t border-divider" />
          <div className="mt-4 flex items-center gap-2 rounded-[8px] bg-amber-tint/60 px-3 py-2 text-[12px] text-ink">
            <Info size={14} className="text-amber" />
            <span>Decline requires a written reason</span>
          </div>
          <div className="mt-4 flex flex-1 flex-col gap-3">
            {loading ? (
              <>
                {[0, 1].map((idx) => (
                  <div key={idx} className="animate-pulse rounded-[12px] border border-divider p-4">
                    <div className="h-4 w-1/3 rounded bg-soft" />
                    <div className="mt-2 h-3 w-2/3 rounded bg-soft" />
                    <div className="mt-2 h-3 w-1/2 rounded bg-soft" />
                    <div className="mt-4 flex gap-2">
                      <div className="h-10 flex-1 rounded-full bg-soft" />
                      <div className="h-10 flex-1 rounded-full bg-soft" />
                    </div>
                  </div>
                ))}
              </>
            ) : visibleRequests.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-green-tint text-green">
                  <CheckCircle2 size={18} />
                </div>
                <p className="mt-3 font-[var(--font-display)] text-[18px] text-ink">You're all caught up</p>
                <p className="mt-1 text-sm text-muted">New requests will appear here.</p>
              </div>
            ) : (
              visibleRequests.map((request, idx) => (
                <div key={request.id} className="rounded-[12px] border border-divider p-4">
                  <div className="flex items-start gap-2">
                    <span className="text-sm text-muted">{idx + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {request.student_name} · Pending
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted">{request.topic || request.reason}</p>
                      <p className="mt-1 text-[13px] text-muted">
                        {request.timeLabel}
                        {request.room ? ` · Room ${request.room}` : ""}
                      </p>
                      {request.status === "reschedule_requested" && request.note ? (
                        <p className="mt-2 rounded-[8px] bg-amber-tint/60 px-2.5 py-1.5 text-[12px] text-ink">
                          Requested-time note: {request.note}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Button
                        disabled={actingId === request.id}
                        onClick={async () => {
                          if (!await confirmAction(`Approve the appointment request from ${request.student_name}?`)) return
                          setActingId(request.id)
                          setError(null)
                          try {
                            const approved = await appointmentApi.approve(request.id)
                            mergeAppointment(approved)
                            setRequests((prev) => prev.filter((req) => req.id !== request.id))
                            setUpcoming((prev) => [...prev, approved].sort((a, b) => (a.appointment_date === b.appointment_date ? a.start_minutes - b.start_minutes : a.appointment_date.localeCompare(b.appointment_date))))
                          } catch (err) {
                            setError(errorMessage(err, "Failed to approve request."))
                          } finally {
                            setActingId("")
                          }
                        }}
                        className="h-10 flex-1 rounded-full bg-primary text-sm font-semibold text-white"
                      >
                        {actingId === request.id ? "Saving…" : request.status === "reschedule_requested" ? "Approve New Time" : "Accept"}
                      </Button>
                      <Button
                        disabled={actingId === request.id}
                        onClick={() => openDecline(request)}
                        className="h-10 flex-1 rounded-full border border-primary bg-white text-sm font-semibold text-primary"
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {moreRequests > 0 ? (
            <button type="button" className="mt-3 text-center text-sm font-semibold text-primary">
              View all ({requests.length})
            </button>
          ) : null}
        </section>

        <section className="flex h-full flex-col rounded-[16px] border border-border-card bg-card p-5 shadow-[0_1px_2px_rgba(45,27,105,0.06)] lg:col-span-7">
          <div className="flex items-center justify-between">
            <h2 className="font-[var(--font-display)] text-[18px] leading-[24px] font-semibold text-ink">Upcoming appointments</h2>
          </div>
          <div className="-mx-5 mt-3 border-t border-divider" />
          <div className="mt-4 flex flex-1 flex-col">
            {loading ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((idx) => (
                  <div key={idx} className="flex animate-pulse items-center gap-3 rounded-[12px] border border-divider p-3">
                    <div className="size-10 rounded-full bg-soft" />
                    <div className="flex-1">
                      <div className="h-4 w-1/3 rounded bg-soft" />
                      <div className="mt-2 h-3 w-2/3 rounded bg-soft" />
                    </div>
                    <div className="h-7 w-20 rounded-full bg-soft" />
                  </div>
                ))}
              </div>
            ) : visibleUpcoming.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-soft text-primary">
                  <CalendarDays size={18} />
                </div>
                <p className="mt-3 font-[var(--font-display)] text-[18px] text-ink">No upcoming appointments</p>
                <p className="mt-1 text-sm text-muted">Approved consultations will show up here.</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {visibleUpcoming.map((appt) => {
                  const studentName = fullName(appt.student_first_name, appt.student_last_name, appt.student_id)
                  const initials = getInitials(studentName)
                  const status = getStatusChip(appt.status)
                  const isPending = appt.status === "pending"
                  const timeStr = `${formatDateLabel(appt.appointment_date)} · ${formatTime(appt.start_minutes)}`
                  return (
                    <button
                      key={appt.id}
                      type="button"
                      className={`flex items-center gap-3 border-b border-divider px-1 py-3 text-left transition last:border-b-0 hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary ${
                        isPending ? "bg-amber-tint/40" : ""
                      }`}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-soft text-[13px] font-semibold text-primary">
                        {initials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{studentName}</p>
                        <p className="truncate text-sm text-muted">{appt.topic || "Consultation"}</p>
                        <p className="truncate text-[13px] text-muted">
                          {timeStr}
                          {appt.location ? ` · Room ${appt.location}` : ""}
                        </p>
                      </div>
                      <span className={`inline-flex h-7 w-[90px] items-center justify-center rounded-full text-[12px] font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {moreUpcoming > 0 ? (
            <button type="button" className="mt-3 text-center text-sm font-semibold text-primary">
              View all ({upcoming.length})
            </button>
          ) : null}
        </section>
      </div>
      <div className="mt-6" />
      {declineTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeclineTarget(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="faculty-decline-title"
            className="w-full max-w-md rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
          >
            <form onSubmit={declineRequest}>
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-purple-600">
                    Appointment request
                  </p>
                  <h2 id="faculty-decline-title" className="mt-1 text-xl font-bold tracking-tight text-slate-900">
                    Decline request
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {declineTarget.student_name} · {declineTarget.timeLabel}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => setDeclineTarget(null)}
                  title="Close decline dialog"
                  className="size-9 shrink-0 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X size={18} />
                </Button>
              </div>
              <div className="space-y-4 px-6 py-6">
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                  The student will receive this reason with the declined request.
                </p>
                <label className="block">
                  <span className={pillLabel}>Reason for declining</span>
                  <TextareaTag
                    rows={4}
                    autoFocus
                    maxLength={5000}
                    value={declineReason}
                    aria-invalid={Boolean(declineError)}
                    aria-describedby={declineError ? "faculty-decline-error" : undefined}
                    onChange={(event) => {
                      setDeclineReason(event.target.value)
                      setDeclineError("")
                    }}
                    placeholder="Explain why this time does not work..."
                    className={`${pillField} resize-none`}
                  />
                  <FieldError id="faculty-decline-error" message={declineError || undefined} />
                </label>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
                <Button
                  type="button"
                  onClick={() => setDeclineTarget(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Keep request
                </Button>
                <Button
                  type="submit"
                  disabled={actingId === declineTarget.id}
                  className="rounded-[4px] bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {actingId === declineTarget.id ? "Declining…" : "Decline request"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
