import { useEffect, useState, type FormEvent } from "react"
import { Clock3, MapPin, X } from "lucide-react"
import { appointmentApi, type Appointment } from "../../api"
import { confirmAction } from "../../confirmation"
import {
  Avatar,
  Button,
  EmptyState,
  FieldError,
  PageTitle,
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
  time: string
  initials: string
}

export function FacultyTodayView() {
  const [requests, setRequests] = useState<IncomingRequest[]>([])
  const [confirmedToday, setConfirmedToday] = useState<{ time: string; name: string; reason: string; location: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState("")
  const [declineTarget, setDeclineTarget] = useState<IncomingRequest | null>(null)
  const [declineReason, setDeclineReason] = useState("")
  const [declineError, setDeclineError] = useState("")

  // Fetch today's appointments and pending requests
  useEffect(() => {
    const fetchTodayData = async () => {
      setLoading(true)
      setError(null)
      try {
        // Get today's date in YYYY-MM-DD format
        const today = new Date()
        const todayDate = toIso(today)

        // Fetch appointments for today
        const appointments = await appointmentApi.list()

        const studentName = (appt: Appointment) =>
          fullName(appt.student_first_name, appt.student_last_name, `Student ID: ${appt.student_id}`)

        // Separate pending requests and confirmed appointments
        const pendingRequests = appointments
          .filter(appt => ['pending', 'reschedule_requested'].includes(appt.status))
          .map(appt => ({
            id: appt.id,
            student_name: studentName(appt),
            reason: appt.topic || "Consultation request",
            note: appt.status === "reschedule_requested" ? appt.reschedule_reason ?? "" : "",
            time: `${appt.appointment_date} · ${formatTime(appt.start_minutes)}`,
            initials: getInitials(studentName(appt))
          }))

        const confirmedAppointments = appointments
          .filter(appt => appt.status === 'confirmed' && appt.appointment_date === todayDate)
          .map(appt => ({
            time: formatTime(appt.start_minutes),
            name: studentName(appt),
            reason: appt.topic || "Consultation",
            location: appt.location || "TBD"
          }))

        setRequests(pendingRequests)
        setConfirmedToday(confirmedAppointments)
      } catch (err) {
        setError(errorMessage(err, "Failed to load today's schedule"))
        setRequests([])
        setConfirmedToday([])
      } finally {
        setLoading(false)
      }
    }
    fetchTodayData()
  }, [])

  // Helper functions
  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '??'
  }

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
      setDeclineTarget(null)
      setDeclineReason("")
    } catch (err) {
      setDeclineError(errorMessage(err, "Failed to reject request."))
    } finally {
      setActingId("")
    }
  }

  return (
    <div>
      {loading && (
        <div className="text-center py-8">
          <p className="text-sm text-slate-500">Loading today's schedule...</p>
        </div>
      )}
      {error && (
        <div className="text-center py-8">
          <p className="text-sm text-rose-500">{error}</p>
        </div>
      )}
      <PageTitle
        eyebrow="Schedule"
        title="Today’s Schedule"
        description="Review incoming requests and keep track of your confirmed consultations."
      />
      <div className="mt-10 grid gap-12 xl:grid-cols-2 xl:gap-20">
        <section>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-base font-semibold text-slate-900">
                Incoming Requests
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {requests.length} requests need your response
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {requests.map((request) => (
              <div
                key={request.id}
                className="rounded-2xl bg-white p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
              >
                <div className="flex gap-3">
                  <Avatar initials={request.initials} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {request.student_name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{request.reason}</p>
                    {request.note && (
                      <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs leading-5 text-amber-800">
                        Requested-time note: {request.note}
                      </p>
                    )}
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                      <Clock3 size={12} /> Requested for {request.time}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-5 border-t border-slate-100 pt-4">
                  <Button
                    disabled={actingId === request.id}
                    onClick={async () => {
                      if (!await confirmAction(`Approve the appointment request from ${request.student_name}?`)) return
                      setActingId(request.id)
                      setError(null)
                      try {
                        const approved = await appointmentApi.approve(request.id)
                        mergeAppointment(approved)
                        if (approved.appointment_date === toIso(new Date())) {
                          setConfirmedToday((current) => [...current, {
                            time: formatTime(approved.start_minutes), name: request.student_name,
                            reason: approved.topic, location: approved.location || "TBD",
                          }])
                        }
                        setRequests(prev => prev.filter(req => req.id !== request.id))
                      } catch (err) {
                        setError(errorMessage(err, "Failed to approve request."))
                      } finally {
                        setActingId("")
                      }
                    }}
                    className="rounded-[4px] bg-purple-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-60"
                  >
                    {actingId === request.id ? "Saving…" : "Accept"}
                  </Button>
                  <Button
                    disabled={actingId === request.id}
                    onClick={() => openDecline(request)}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
            {requests.length === 0 && (
              <EmptyState
                className="py-8"
                title="No incoming requests"
                description="New consultation requests will appear here for review."
              />
            )}
          </div>
        </section>

        <section>
          <p className="text-base font-semibold text-slate-900">
            Confirmed Today
          </p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(new Date(), { weekday: "long", month: "long", day: "numeric" })}</p>
          <div className="mt-7 space-y-8">
            {confirmedToday.map((appointment, index) => (
              <div key={appointment.time} className="relative flex gap-5">
                {index < 2 && (
                  <span className="absolute left-1 top-4 h-16 w-px bg-slate-200" />
                )}
                <span className="relative mt-1 size-2.5 shrink-0 rounded-full bg-slate-900 ring-4 ring-slate-50" />
                <div>
                  <p className="text-xs font-semibold tabular-nums text-slate-900">
                    {appointment.time}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {appointment.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{appointment.reason}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                    <MapPin size={12} /> {appointment.location}
                  </p>
                </div>
              </div>
            ))}
            {confirmedToday.length === 0 && (
              <EmptyState
                className="py-8"
                title="No confirmed consultations today"
                description="Approved appointments for today will appear on your schedule."
              />
            )}
          </div>
        </section>
      </div>
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
                    {declineTarget.student_name} · {declineTarget.time}
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
