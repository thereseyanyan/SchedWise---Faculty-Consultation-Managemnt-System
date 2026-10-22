import { useContext, useEffect, useState } from "react"
import {
  Check,
  ChevronRight,
  Clock3,
  MapPin,
  Search,
  X,
} from "lucide-react"
import { ApiError, appointmentApi, facultyApi } from "../../api"
import { confirmAction } from "../../confirmation"
import {
  Avatar,
  Button,
  CurrentUserContext,
  FieldError,
  InputTag,
  PageTitle,
  SelectTag,
  TextareaTag,
  clock,
  errorMessage,
  formatDate,
  fromIso,
  fullName,
  mergeAppointment,
  pillField,
  pillLabel,
  timeRange,
  toIso,
  useAppointments,
  type Professor,
} from "../../shared"

export function StudentBookingView() {
  const currentUser = useContext(CurrentUserContext)
  const [query, setQuery] = useState("")
  const [professor, setProfessor] = useState<Professor | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appointments] = useAppointments()
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

  const visible = facultyList.filter((item) =>
    `${item.name} ${item.department}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )

  return (
    <div>
      <PageTitle
        eyebrow="Appointments"
        title="Book an Appointment"
        description="Choose a faculty member, select an available time, and briefly describe your academic concern."
      />
      {loading && (
        <div className="text-center py-8">
          <p className="text-sm text-slate-500">Loading faculty list...</p>
        </div>
      )}
      {error && (
        <div className="text-center py-8">
          <p className="text-sm text-rose-500">{error}</p>
        </div>
      )}
      <p className="mt-5 rounded-xl bg-purple-50 p-4 text-sm text-purple-800">You can request different faculty at different times. Only one pending request per faculty is allowed, and appointment times must not overlap.</p>
      {!loading && !error && facultyList.length === 0 && <p className="mt-5 text-sm text-slate-500">No faculty have bookable times in the next 14 days.</p>}
      <div className="relative mt-8 max-w-xl">
        <Search
          size={17}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <InputTag
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search professor or department"
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15"
        />
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {visible.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl bg-white p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
          >
            <div className="flex gap-4">
              <Avatar initials={item.name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(-2)} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {item.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">{item.department}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <Clock3 size={13} className="text-slate-400" /> {item.next}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin size={13} className="text-slate-400" /> {item.location}
              </span>
            </div>
            <Button
              disabled={hasPendingRequest(item.id) || loading || !selectableSlots.some((slot) => slot.faculty_id === item.id)}
              onClick={() => {
                setProfessor(item)
                setBookingErrors({})
                setSent(false)
                setBookError("")
                setBookNotice("")
                setConflictRetry(false)
                const first = selectableSlots.find((slot) => slot.faculty_id === item.id)!
                setBooking({ date: first.date, start: first.start_minutes, topic: "", reason: "" })
              }}
              className="mt-5 w-full gap-2 rounded-[4px] bg-purple-600 py-2.5 text-xs font-semibold text-white hover:bg-purple-700"
            >
              {hasPendingRequest(item.id) ? "Request pending with this faculty" : "View Available Times"} <ChevronRight size={14} />
            </Button>
          </div>
        ))}
      </div>

      {professor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Button
            onClick={() => setProfessor(null)}
            title="Close"
            className="absolute inset-0 rounded-none bg-slate-900/40"
          >
            <span className="sr-only">Close</span>
          </Button>
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-7 shadow-[0_10px_40px_-10px_rgba(15,23,42,0.25)]">
            {sent ? (
              <div className="py-5 text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <Check size={25} />
                </div>
                <p className="mt-5 text-xl font-semibold text-slate-900">
                  Request submitted
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {professor.name} will review your request. It now appears on their calendar as pending.
                </p>
                <Button
                  onClick={() => setProfessor(null)}
                  className="mt-7 w-full rounded-[4px] bg-purple-600 py-3 text-sm font-semibold text-white"
                >
                  Done
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {professor.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {professor.department}
                    </p>
                  </div>
                  <Button
                    onClick={() => setProfessor(null)}
                    className="size-9 rounded-xl text-slate-400 hover:bg-slate-100"
                  >
                    <X size={18} />
                  </Button>
                </div>
                <div className="mt-7 space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className={pillLabel}>Date</span>
                      <SelectTag
                        value={booking.date}
                        onChange={(e) => {
                          setBooking({ ...booking, date: e.target.value, start: timesFor(professor.id, e.target.value)[0] })
                          setBookError("")
                          setBookNotice("")
                          setConflictRetry(false)
                        }}
                        className={`${pillField} cursor-pointer`}
                      >
                        {bookDates.map((d) => (
                          <option key={toIso(d)} value={toIso(d)}>
                            {formatDate(d, { weekday: "short", month: "short", day: "numeric" })}
                          </option>
                        ))}
                      </SelectTag>
                    </label>
                    <label className="block">
                      <span className={pillLabel}>Time (30 min)</span>
                      <SelectTag
                        value={booking.start}
                        onChange={(e) => {
                          setBooking({ ...booking, start: Number(e.target.value) })
                          setBookError("")
                          setBookNotice("")
                          setConflictRetry(false)
                        }}
                        className={`${pillField} cursor-pointer`}
                      >
                        {timesFor(professor.id, booking.date)
                          .map((t) => (
                            <option key={t} value={t}>
                              {clock(t)}
                            </option>
                          ))}
                      </SelectTag>
                    </label>
                  </div>
                  <label className="block">
                    <span className={pillLabel}>Topic</span>
                    <InputTag
                      aria-invalid={!!bookingErrors.topic} aria-describedby="booking-topic-error" value={booking.topic}
                      onChange={(e) => {
                        setBooking({ ...booking, topic: e.target.value })
                        setBookError(""); setBookNotice(""); setConflictRetry(false)
                        setBookingErrors((f) => ({ ...f, topic: "" }))
                      }}
                      placeholder="e.g. Capstone project review"
                      className={pillField}
                    />
                    <FieldError id="booking-topic-error" message={bookingErrors.topic} />
                  </label>
                  <label className="block">
                    <span className={pillLabel}>Consultation reason</span>
                    <TextareaTag
                      rows={4}
                      aria-invalid={!!bookingErrors.reason} aria-describedby="booking-reason-error" value={booking.reason}
                      onChange={(e) => {
                        setBooking({ ...booking, reason: e.target.value })
                        setBookError(""); setBookNotice(""); setConflictRetry(false)
                        setBookingErrors((f) => ({ ...f, reason: "" }))
                      }}
                      placeholder="Briefly describe what you would like to discuss..."
                      className={`${pillField} resize-none`}
                    />
                    <FieldError id="booking-reason-error" message={bookingErrors.reason} />
                  </label>
                  {bookNotice && (
                    <p className="rounded-xl bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
                      {bookNotice}
                    </p>
                  )}
                  {bookError && (
                    <div role="alert" className="space-y-2 rounded-xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
                      <p>{bookError}</p>
                      {conflictRetry && (
                        <Button
                          disabled={loading}
                          onClick={() => { void refreshAvailability() }}
                          className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          {loading ? "Refreshing…" : "Refresh available times"}
                        </Button>
                      )}
                    </div>
                  )}
                  <Button
                    onClick={requestAppointment}
                    disabled={loading || hasPendingRequest(professor.id)}
                    className="w-full rounded-[4px] bg-purple-600 py-3 text-sm font-semibold text-white hover:bg-purple-700"
                  >
                    {loading ? "Requesting..." : "Request Appointment"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
