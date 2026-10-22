import { useContext, useEffect, useState } from "react"
import { CalendarClock, ChevronLeft, ChevronRight, Search, X } from "lucide-react"
import {
  appointmentApi,
  type Appointment,
  type ApptStatus,
} from "../../api"
import { confirmAction } from "../../confirmation"
import {
  Button,
  CurrentUserContext,
  EmptyState,
  InputTag,
  PageTitle,
  SelectTag,
  StatusBadge,
  consultationHasEnded,
  errorMessage,
  fullName,
  mergeAppointment,
  statusLabel,
  statusTone,
  timeRange,
  toIso,
} from "../../shared"
import {
  StudentAppointmentDialog,
  type StudentAppointmentMode,
} from "./StudentAppointmentDialog"

export function AppointmentListView({ filter = "Total" }: { filter?: string }) {
  const [rows, setRows] = useState<Appointment[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [page, setPage] = useState(1)
  const [actingId, setActingId] = useState("")
  const [actionNotice, setActionNotice] = useState("")
  const [studentAction, setStudentAction] = useState<{
    appointment: Appointment
    mode: StudentAppointmentMode
  } | null>(null)
  const currentUser = useContext(CurrentUserContext)
  const pageSize = 8
  const isStudent = currentUser?.role_id === "student"

  useEffect(() => {
    let live = true
    setLoading(true)
    setError("")
    appointmentApi.list().then((data) => { if (live) setRows(data) })
      .catch((err) => { if (live) setError(errorMessage(err, "Unable to load appointments.")) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [filter])

  useEffect(() => {
    setPage(1)
  }, [filter, query, statusFilter, dateFrom, dateTo])

  const today = toIso(new Date())
  const scoped = rows.filter((a) => filter === "Today" ? a.appointment_date === today && a.status !== "cancelled"
    : filter === "Upcoming" ? a.status === "confirmed" && a.appointment_date >= today
    : filter.startsWith("Pending") ? ["pending", "reschedule_requested"].includes(a.status)
    : filter === "Completed" ? a.status === "completed" : true)
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = scoped.filter((a) => {
    const haystack = [
      a.topic,
      a.reason,
      a.status,
      a.appointment_date,
      fullName(a.student_first_name, a.student_last_name),
      fullName(a.faculty_first_name, a.faculty_last_name),
    ].map((value) => String(value ?? "").toLowerCase()).join(" ")
    const matchesQuery = normalizedQuery === "" || haystack.includes(normalizedQuery)
    const matchesStatus = statusFilter === "all" || a.status === statusFilter
    const matchesFrom = dateFrom === "" || a.appointment_date >= dateFrom
    const matchesTo = dateTo === "" || a.appointment_date <= dateTo
    return matchesQuery && matchesStatus && matchesFrom && matchesTo
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const hasFilters = Boolean(query.trim() || statusFilter !== "all" || dateFrom || dateTo)
  const clearFilters = () => {
    setQuery("")
    setStatusFilter("all")
    setDateFrom("")
    setDateTo("")
    setPage(1)
  }
  const statusOptions: ApptStatus[] = ["pending", "confirmed", "reschedule_requested", "completed", "rejected", "cancelled", "no_show"]
  const canRecordNoShow = currentUser?.role_id === "admin" || currentUser?.role_id === "faculty"
  const canManageStudentAppointment = (appointment: Appointment) =>
    isStudent &&
    currentUser?.id === appointment.student_id &&
    ["pending", "confirmed", "reschedule_requested"].includes(appointment.status)
  const markNoShow = async (appointment: Appointment) => {
    if (!await confirmAction("Mark this appointment as a no-show?")) return
    setActingId(appointment.id)
    setError("")
    try {
      const updated = await appointmentApi.noShow(appointment.id)
      setRows((current) => current.map((row) => row.id === appointment.id ? { ...row, ...updated } : row))
      mergeAppointment(updated)
    } catch (err) {
      setError(errorMessage(err, "Unable to mark this appointment as a no-show."))
    } finally {
      setActingId("")
    }
  }
  const handleStudentAction = (updated: Appointment) => {
    setRows((current) => current.map((row) => row.id === updated.id ? { ...row, ...updated } : row))
    mergeAppointment(updated)
    setActionNotice(
      updated.status === "cancelled"
        ? "Appointment cancelled. The faculty member has been notified."
        : "Reschedule request sent. The faculty member will review the new time.",
    )
    setStudentAction(null)
  }

  return <div>
    <PageTitle
      eyebrow="Appointments"
      title={isStudent && filter === "Total" ? "My Appointments" : `${filter} Appointments`}
      description="View appointment dates, participants, and status."
    />
    {error && <p role="alert" className="mt-4 text-rose-700">{error}</p>}
    {actionNotice && (
      <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
        {actionNotice}
      </p>
    )}
    {loading ? <p className="mt-6">Loading appointments…</p> : <>
      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-end">
        <label className="block min-w-[190px] flex-1">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Search</span>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <InputTag
              type="search"
              aria-label="Search appointments"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Student, faculty, topic, or date"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15"
            />
          </div>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status</span>
          <SelectTag
            aria-label="Filter appointments by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 outline-none focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15"
          >
            <option value="all">All statuses</option>
            {statusOptions.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}
          </SelectTag>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">From</span>
          <InputTag
            type="date"
            aria-label="Appointments from date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 outline-none focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">To</span>
          <InputTag
            type="date"
            aria-label="Appointments to date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 outline-none focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15"
          />
        </label>
        {hasFilters && (
          <Button onClick={clearFilters} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            Clear filters
          </Button>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-slate-500">
          {hasFilters ? `Showing ${filtered.length} of ${scoped.length} appointments` : `${filtered.length} appointments`}
        </p>
        {filtered.length > pageSize && <p className="text-xs text-slate-400">Page {currentPage} of {totalPages}</p>}
      </div>
      <div className="mt-4 divide-y divide-purple-100 rounded-2xl border border-purple-100 bg-white">
        {pageRows.map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div><p className="font-semibold">{a.topic}</p>
            <p className="text-sm text-slate-500">{fullName(a.student_first_name, a.student_last_name)} · {fullName(a.faculty_first_name, a.faculty_last_name)}</p>
            <p className="text-xs text-slate-500">{a.appointment_date} · {timeRange(a.start_minutes, a.end_minutes)}</p>
            {a.status === "reschedule_requested" && a.reschedule_reason && (
              <p className="mt-1 max-w-2xl text-xs leading-5 text-amber-700">
                Requested-time note: {a.reschedule_reason}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={statusTone[a.status]}>{statusLabel[a.status]}</StatusBadge>
            {canManageStudentAppointment(a) && (
              <>
                <Button
                  aria-label={`Request a new time: ${a.topic}`}
                  onClick={() => {
                    setActionNotice("")
                    setStudentAction({ appointment: a, mode: "reschedule" })
                  }}
                  className="gap-1.5 rounded-xl border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50"
                >
                  <CalendarClock size={14} /> Request new time
                </Button>
                <Button
                  aria-label={`Cancel appointment: ${a.topic}`}
                  onClick={() => {
                    setActionNotice("")
                    setStudentAction({ appointment: a, mode: "cancel" })
                  }}
                  className="gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  <X size={14} /> Cancel
                </Button>
              </>
            )}
            {canRecordNoShow && a.status === "confirmed" && consultationHasEnded(a.appointment_date, a.end_minutes) && (
              <Button
                disabled={actingId === a.id}
                onClick={() => { void markNoShow(a) }}
                className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                {actingId === a.id ? "Saving…" : "Mark no-show"}
              </Button>
            )}
          </div>
        </div>)}
        {filtered.length === 0 && (
          <div className="p-4">
            <EmptyState
              title={rows.length === 0 ? "No appointments yet" : "No appointments match these filters"}
              description={rows.length === 0
                ? isStudent
                  ? "Request a consultation from the Book Appointment page and it will appear here."
                  : "Appointments will appear here after students submit consultation requests."
                : "Try adjusting the search, status, or date range."}
              action={hasFilters ? <Button onClick={clearFilters} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Clear filters</Button> : undefined}
            />
          </div>
        )}
      </div>
      {filtered.length > pageSize && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <Button
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
            className="gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <ChevronLeft size={14} /> Previous
          </Button>
          <Button
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
            className="gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Next <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </>}
    {studentAction && (
      <StudentAppointmentDialog
        key={`${studentAction.mode}-${studentAction.appointment.id}`}
        appointment={studentAction.appointment}
        mode={studentAction.mode}
        onClose={() => setStudentAction(null)}
        onUpdated={handleStudentAction}
      />
    )}
  </div>
}
