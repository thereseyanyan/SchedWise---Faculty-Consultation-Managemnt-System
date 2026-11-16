import { useContext, useEffect, useState } from "react"
import { Check, ChevronRight, Clock3, MapPin, Search } from "lucide-react"
import { ApiError, appointmentApi, facultyApi } from "../../api"
import { confirmAction } from "../../confirmation"
import {
  Button,
  CurrentUserContext,
  FieldError,
  clock,
  errorMessage,
  formatDate,
  fromIso,
  fullName,
  mergeAppointment,
  timeRange,
  toIso,
  useAppointments,
  type Professor,
} from "../../shared"
import type { StudentNavigate } from "./StudentDashboardView"
import {
  FacultyAvatar,
  StudentCard,
  StudentDialog,
  StudentPageHeader,
  sizeMd,
  studentButton,
  studentField,
  studentLabel,
} from "./studentUi"

export function StudentBookingView({ onNavigate }: { onNavigate?: StudentNavigate }) {
  const currentUser = useContext(CurrentUserContext)
  const [query, setQuery] = useState("")
  const [department, setDepartment] = useState("all")
  const [professor, setProfessor] = useState<Professor | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appointments] = useAppointments(currentUser?.id ?? "")
  const [slots, setSlots] = useState<{ faculty_id: string; date: string; start_minutes: number }[]>([])
  const hasPendingRequest = (facultyId: string) => appointments.some((a) => a.faculty_id === facultyId && ["pending", "reschedule_requested"].includes(a.status))
  const selectableSlots = slots.filter((slot) => !appointments.some((a) =>
    ["pending", "confirmed", "reschedule_requested"].includes(a.status) && a.appointment_date === slot.date
    && a.start_minutes < slot.start_minutes + 30 && a.end_minutes > slot.start_minutes))
  const bookDates = [...new Set(selectableSlots.filter((slot) => !professor || slot.faculty_id === professor.id).map((slot) => slot.date))].map(fromIso)
  const timesFor = (facultyId: string, date: string) => selectableSlots.filter((slot) => slot.faculty_id === facultyId && slot.date === date).map((slot) => slot.start_minutes)
  const [booking, setBooking] = useState({
    date: toIso(new Date()),
    start: 600,
    topic: "",
    reason: "",
  })
  const [bookError, setBookError] = useState("")
  const [bookNotice, setBookNotice] = useState("")
  const [conflictRetry, setConflictRetry] = useState(false)
  const [bookingErrors, setBookingErrors] = useState<Record<string, string>>({})
  const [facultyList, setFacultyList] = useState<Professor[]>([])

  // Fetch the active faculty directory along with their availability. The same
  // loader powers the conflict retry action after a 409 response.
  const loadFaculty = async (): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      const [directory, availableSlots] = await Promise.all([
        facultyApi.list(), facultyApi.slots(),
      ])
      setSlots(availableSlots)

      const list: Professor[] = directory
        .filter((entry) => availableSlots.some((slot) => slot.faculty_id === entry.id))
        .map((entry) => {
          const slot = availableSlots.find((slot) => slot.faculty_id === entry.id)
          return {
            id: entry.id,
            name: fullName(entry.first_name, entry.last_name, entry.email),
            department: entry.department_name || "Department not set",
            location: "See faculty schedule",
            next: slot ? `${slot.date} · ${clock(slot.start_minutes)}` : "No available times",
          }
        })

      setFacultyList(list)
      return true
    } catch (err) {
      setError(errorMessage(err, "Failed to load faculty list"))
      setFacultyList([])
      return false
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFaculty()
  }, [])

  const refreshAvailability = async () => {
    setBookError("")
    setConflictRetry(false)
    setBookNotice("")
    if (await loadFaculty()) {
      setBookNotice("Available times refreshed. Choose another slot and try again.")
    } else {
      setConflictRetry(true)
      setBookError("Could not refresh available times. Check your connection and try again.")
    }
  }

  const requestAppointment = async () => {
    if (!professor) return
    setConflictRetry(false)
    setBookNotice("")
    if (hasPendingRequest(professor.id)) { setBookError("You already have a pending request with this faculty. You can request another faculty at a different time."); return }
    if (!timesFor(professor.id, booking.date).includes(booking.start)) { setBookError("Select an available time."); return }
    if (!currentUser) {
      setBookError("Your session has expired. Please sign in again.")
      return
    }
    const fields: Record<string, string> = {}
    if (!booking.topic.trim()) fields.topic = "Enter a consultation topic."
    if (!booking.reason.trim()) fields.reason = "Enter a short reason for the consultation."
    setBookingErrors(fields)
    if (Object.keys(fields).length) return
    const end = booking.start + 30

    // Check for conflicts using real API data
    const clash = appointments.some(
      (a) =>
        ["pending", "confirmed", "reschedule_requested"].includes(a.status) &&
        a.appointment_date === booking.date &&
        a.start_minutes < end &&
        booking.start < a.end_minutes,
    )
    if (clash) {
      setConflictRetry(true)
      setBookError("That time is no longer available for you. Refresh the available times and choose another slot.")
      return
    }

    setLoading(true)
    setBookError("")
    try {
      if (!await confirmAction(`Request an appointment with ${professor.name} on ${booking.date}, ${timeRange(booking.start, end)}?`)) return
      const created = await appointmentApi.create({
        student_id: currentUser.id,
        faculty_id: professor.id,
        appointment_date: booking.date,
        start_minutes: booking.start,
        end_minutes: end,
        topic: booking.topic.trim(),
        reason: booking.reason.trim(),
        status: "pending",
      })
      mergeAppointment(created)
      setSent(true)
      // Reset form
      setBooking({ date: toIso(new Date()), start: 600, topic: "", reason: "" })
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setBookingErrors(err.fields)
      else {
        const conflict = err instanceof ApiError && err.status === 409
        setConflictRetry(conflict)
        setBookError(conflict
          ? `${errorMessage(err, "That time is no longer available.")} Refresh the available times and choose another slot.`
          : errorMessage(err, "Failed to request appointment"))
      }
    } finally {
      setLoading(false)
    }
  }

  const departments = [...new Set(facultyList.map((item) => item.department))].sort()
  const visible = facultyList.filter(
    (item) =>
      (department === "all" || item.department === department) &&
      `${item.name} ${item.department}`.toLowerCase().includes(query.toLowerCase()),
  )

  const openBooking = (item: Professor) => {
    setProfessor(item)
    setBookingErrors({})
    setSent(false)
    setBookError("")
    setBookNotice("")
    setConflictRetry(false)
    const first = selectableSlots.find((slot) => slot.faculty_id === item.id)!
    setBooking({ date: first.date, start: first.start_minutes, topic: "", reason: "" })
  }
  const clearMessages = () => {
    setBookError("")
    setBookNotice("")
    setConflictRetry(false)
  }

  return (
    <div className="flex flex-col gap-5">
      <StudentPageHeader
        title="Book a Consultation"
      />

      <p className="rounded-2xl border border-[#ddd6fe] bg-schedwise-lavender-100 px-5 py-3.5 text-sm text-brand-deep-purple">
        You can request different faculty at different times. Only one pending request per faculty is allowed, and appointment times must not overlap.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">Search professor or department</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5b5078]" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search professor or department"
            className={`${studentField} h-10 pl-9 pr-3`}
          />
        </label>
        <select
          aria-label="Filter by department"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          className={`${studentField} h-10 w-auto cursor-pointer px-3 font-medium`}
        >
          <option value="all">All departments</option>
          {departments.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <p aria-live="polite" className="ml-auto text-sm font-semibold text-[#5b5078]">
          {visible.length} faculty with open times
        </p>
      </div>

      {loading && !professor && <p className="py-8 text-center text-sm text-[#5b5078]">Loading faculty list…</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
      {!loading && !error && facultyList.length === 0 && (
        <p className="rounded-2xl border border-dashed border-[#ddd6fe] bg-white px-6 py-10 text-center text-sm text-[#5b5078]">
          No faculty have bookable times in the next 14 days.
        </p>
      )}
      {!loading && !error && facultyList.length > 0 && visible.length === 0 && (
        <p className="rounded-2xl border border-dashed border-[#ddd6fe] bg-white px-6 py-10 text-center text-sm text-[#5b5078]">
          No faculty match your search.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((item) => {
          const pendingHere = hasPendingRequest(item.id)
          return (
            <StudentCard key={item.id} bodyClassName="flex flex-col gap-4 p-5">
              <div className="flex items-center gap-3">
                <FacultyAvatar name={item.name} size={44} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-brand-deep-purple">{item.name}</p>
                  <p className="truncate text-xs text-[#5b5078]">{item.department}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 rounded-xl bg-schedwise-lavender-50 px-3.5 py-3 text-[13px] text-[#5b5078]">
                <span className="flex items-center gap-2">
                  <Clock3 size={14} className="shrink-0 text-schedwise-purple" aria-hidden />
                  <span className="font-semibold text-schedwise-purple">Next open:</span> {item.next}
                </span>
                <span className="flex items-center gap-2">
                  <MapPin size={14} className="shrink-0 text-schedwise-purple" aria-hidden /> {item.location}
                </span>
              </div>
              <Button
                disabled={pendingHere || loading || !selectableSlots.some((slot) => slot.faculty_id === item.id)}
                onClick={() => openBooking(item)}
                className={`${studentButton.primary} ${sizeMd} w-full gap-2`}
              >
                {pendingHere ? "Request pending" : "View available times"} {!pendingHere && <ChevronRight size={15} />}
              </Button>
            </StudentCard>
          )
        })}
      </div>

      {professor && (
        <StudentDialog
          titleId="student-booking-title"
          title={sent ? "Request submitted" : `Book ${professor.name}`}
          subtitle={sent ? undefined : professor.department}
          onClose={() => setProfessor(null)}
          footer={
            sent ? (
              <>
                <Button onClick={() => setProfessor(null)} className={`${studentButton.secondary} ${sizeMd}`}>Done</Button>
                {onNavigate && (
                  <Button
                    onClick={() => { setProfessor(null); onNavigate("My Appointments", { filter: "Pending Requests" }) }}
                    className={`${studentButton.primary} ${sizeMd}`}
                  >
                    View my appointments
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button onClick={() => setProfessor(null)} className={`${studentButton.secondary} ${sizeMd}`}>Cancel</Button>
                <Button
                  onClick={requestAppointment}
                  disabled={loading || hasPendingRequest(professor.id)}
                  className={`${studentButton.primary} ${sizeMd}`}
                >
                  {loading ? "Requesting…" : "Request appointment"}
                </Button>
              </>
            )
          }
        >
          {sent ? (
            <div className="py-4 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#e8f7ef] text-[#16a34a]">
                <Check size={26} />
              </div>
              <p className="mt-4 text-sm leading-6 text-[#5b5078]">
                {professor.name} will review your request. It now appears in My Appointments as pending.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <label className="block">
                <span className={studentLabel}>Date</span>
                <select
                  value={booking.date}
                  onChange={(e) => {
                    setBooking({ ...booking, date: e.target.value, start: timesFor(professor.id, e.target.value)[0] })
                    clearMessages()
                  }}
                  className={`${studentField} h-11 cursor-pointer`}
                >
                  {bookDates.map((d) => (
                    <option key={toIso(d)} value={toIso(d)}>
                      {formatDate(d, { weekday: "short", month: "short", day: "numeric" })}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset>
                <legend className={studentLabel}>Time (30 min)</legend>
                <div className="flex flex-wrap gap-2">
                  {timesFor(professor.id, booking.date).map((t) => (
                    <Button
                      key={t}
                      aria-pressed={booking.start === t}
                      onClick={() => {
                        setBooking({ ...booking, start: t })
                        clearMessages()
                      }}
                      className={`h-9 rounded-full border px-3.5 text-[13px] font-semibold ${
                        booking.start === t
                          ? "border-schedwise-purple bg-schedwise-purple text-white"
                          : "border-[#ddd6fe] bg-white text-schedwise-purple hover:bg-schedwise-lavender-50"
                      }`}
                    >
                      {clock(t)}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[#5b5078]">
                  {formatDate(fromIso(booking.date), { weekday: "long", month: "long", day: "numeric" })} · {timeRange(booking.start, booking.start + 30)}
                </p>
              </fieldset>

              <label className="block">
                <span className={studentLabel}>Topic</span>
                <input
                  aria-invalid={!!bookingErrors.topic}
                  aria-describedby="booking-topic-error"
                  value={booking.topic}
                  onChange={(e) => {
                    setBooking({ ...booking, topic: e.target.value })
                    clearMessages()
                    setBookingErrors((f) => ({ ...f, topic: "" }))
                  }}
                  placeholder="e.g. Capstone project review"
                  className={`${studentField} h-11`}
                />
                <FieldError id="booking-topic-error" message={bookingErrors.topic} />
              </label>

              <label className="block">
                <span className={studentLabel}>Consultation reason</span>
                <textarea
                  rows={4}
                  aria-invalid={!!bookingErrors.reason}
                  aria-describedby="booking-reason-error"
                  value={booking.reason}
                  onChange={(e) => {
                    setBooking({ ...booking, reason: e.target.value })
                    clearMessages()
                    setBookingErrors((f) => ({ ...f, reason: "" }))
                  }}
                  placeholder="Briefly describe what you would like to discuss…"
                  className={`${studentField} resize-none py-3`}
                />
                <FieldError id="booking-reason-error" message={bookingErrors.reason} />
              </label>

              {bookNotice && (
                <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">{bookNotice}</p>
              )}
              {bookError && (
                <div role="alert" className="space-y-2 rounded-xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
                  <p>{bookError}</p>
                  {conflictRetry && (
                    <Button
                      disabled={loading}
                      onClick={() => { void refreshAvailability() }}
                      className="rounded-full border border-rose-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                    >
                      {loading ? "Refreshing…" : "Refresh available times"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </StudentDialog>
      )}
    </div>
  )
}
