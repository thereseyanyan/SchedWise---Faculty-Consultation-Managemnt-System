import { useContext, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Download, Info, Plus, Search, X } from "lucide-react"
import {
  appointmentApi,
  consultationApi,
  type Appointment,
  type ApptStatus,
  type ConsultationRecord,
} from "../../api"
import {
  Button,
  CurrentUserContext,
  EmptyState,
  consultationHasEnded,
  errorMessage,
  formatDate,
  fromIso,
  fullName,
  mergeAppointment,
  timeRange,
  toIso,
} from "../../shared"
import {
  StudentAppointmentDialog,
  type StudentAppointmentMode,
} from "../appointments/StudentAppointmentDialog"
import { StudentAppointmentDetailsDialog } from "./StudentAppointmentDetailsDialog"
import type { StudentNavigate } from "./StudentDashboardView"
import {
  FacultyAvatar,
  StatusChip,
  StudentCard,
  StudentPageHeader,
  StudentTab,
  sizeMd,
  studentButton,
  studentField,
} from "./studentUi"

type Tab = "all" | "pending" | "upcoming" | "past" | "closed"

const PAGE_SIZE = 8
const PENDING: ApptStatus[] = ["pending", "reschedule_requested"]
const MANAGEABLE: ApptStatus[] = ["pending", "confirmed", "reschedule_requested"]
const STATUS_OPTIONS: { value: ApptStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "reschedule_requested", label: "Reschedule requested" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No-show" },
]

/** Dashboard tiles and links pass a filter name; map it onto a tab. */
const tabFromFilter = (filter: string): Tab => {
  if (filter.startsWith("Pending")) return "pending"
  if (filter === "Upcoming" || filter === "Today") return "upcoming"
  if (filter === "Completed") return "past"
  return "all"
}

const inTab = (a: Appointment, tab: Tab, today: string) => {
  switch (tab) {
    case "pending":
      return PENDING.includes(a.status)
    case "upcoming":
      return a.status === "confirmed" && a.appointment_date >= today && !consultationHasEnded(a.appointment_date, a.end_minutes)
    case "past":
      return a.status === "completed" || a.status === "no_show" || (a.status === "confirmed" && consultationHasEnded(a.appointment_date, a.end_minutes))
    case "closed":
      return a.status === "cancelled" || a.status === "rejected"
    default:
      return true
  }
}

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`

export function StudentAppointmentsView({
  filter = "Total",
  initialQuery = "",
  onNavigate,
}: {
  filter?: string
  initialQuery?: string
  onNavigate: StudentNavigate
}) {
  const currentUser = useContext(CurrentUserContext)
  const [rows, setRows] = useState<Appointment[]>([])
  const [records, setRecords] = useState<ConsultationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [tab, setTab] = useState<Tab>(() => tabFromFilter(filter))
  const [todayOnly, setTodayOnly] = useState(filter === "Today")
  const [query, setQuery] = useState(initialQuery)
  const [statusFilter, setStatusFilter] = useState<"all" | ApptStatus>("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [page, setPage] = useState(1)
  const [details, setDetails] = useState<Appointment | null>(null)
  const [action, setAction] = useState<{ appointment: Appointment; mode: StudentAppointmentMode } | null>(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    setError("")
    appointmentApi
      .list()
      .then((data) => live && setRows(data))
      .catch((err) => live && setError(errorMessage(err, "Unable to load appointments.")))
      .finally(() => live && setLoading(false))
    // Summaries are optional extras for the details dialog; never block the table on them.
    consultationApi
      .list()
      .then((data) => live && setRecords(data))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])

  useEffect(() => setPage(1), [tab, todayOnly, query, statusFilter, dateFrom, dateTo])

  const today = toIso(new Date())
  const mine = useMemo(
    () => (currentUser ? rows.filter((a) => a.student_id === currentUser.id) : rows),
    [rows, currentUser],
  )
  const counts = useMemo(
    () => ({
      all: mine.length,
      pending: mine.filter((a) => inTab(a, "pending", today)).length,
      upcoming: mine.filter((a) => inTab(a, "upcoming", today)).length,
      past: mine.filter((a) => inTab(a, "past", today)).length,
      closed: mine.filter((a) => inTab(a, "closed", today)).length,
    }),
    [mine, today],
  )

  const needle = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      mine
        .filter((a) => inTab(a, tab, today))
        .filter((a) => !todayOnly || a.appointment_date === today)
        .filter((a) => statusFilter === "all" || a.status === statusFilter)
        .filter((a) => !dateFrom || a.appointment_date >= dateFrom)
        .filter((a) => !dateTo || a.appointment_date <= dateTo)
        .filter((a) => {
          if (!needle) return true
          const haystack = [
            a.topic,
            a.reason,
            a.location,
            a.faculty_number,
            a.appointment_date,
            fullName(a.faculty_first_name, a.faculty_last_name),
          ]
            .map((value) => String(value ?? "").toLowerCase())
            .join(" ")
          return haystack.includes(needle)
        })
        .sort((a, b) => {
          const byDate = a.appointment_date.localeCompare(b.appointment_date) || a.start_minutes - b.start_minutes
          // Upcoming items read soonest-first; everything else newest-first.
          return tab === "upcoming" || tab === "pending" ? byDate : -byDate
        }),
    [mine, tab, todayOnly, statusFilter, dateFrom, dateTo, needle, today],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const hasFilters = Boolean(needle || statusFilter !== "all" || dateFrom || dateTo || todayOnly)
  const clearFilters = () => {
    setQuery("")
    setStatusFilter("all")
    setDateFrom("")
    setDateTo("")
    setTodayOnly(false)
  }

  const canManage = (a: Appointment) => MANAGEABLE.includes(a.status) && !consultationHasEnded(a.appointment_date, a.end_minutes)
  const recordFor = (a: Appointment) => records.find((r) => r.appointment_id === a.id)

  const exportCsv = () => {
    const header = ["Faculty", "Topic", "Date", "Time", "Room", "Status"]
    const lines = filtered.map((a) =>
      [
        fullName(a.faculty_first_name, a.faculty_last_name, "Faculty"),
        a.topic,
        a.appointment_date,
        timeRange(a.start_minutes, a.end_minutes),
        a.location ?? "",
        a.status.replace(/_/g, " "),
      ]
        .map((cell) => csvCell(String(cell)))
        .join(","),
    )
    const blob = new Blob([[header.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `my-appointments-${today}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleUpdated = (updated: Appointment) => {
    setRows((current) => current.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)))
    mergeAppointment(updated)
    setNotice(
      updated.status === "cancelled"
        ? "Appointment cancelled. The faculty member has been notified."
        : "Reschedule request sent. The faculty member will review the new time.",
    )
    setAction(null)
    setDetails(null)
  }

  const textAction = "text-[13px] font-semibold hover:underline"

  return (
    <div className="flex flex-col gap-5">
      <StudentPageHeader
        title="My Appointments"
        actions={
          <>
            <Button onClick={exportCsv} disabled={filtered.length === 0} className={`${studentButton.secondary} ${sizeMd} gap-2`}>
              <Download size={16} /> Export
            </Button>
            <Button onClick={() => onNavigate("Book a Consultation")} className={`${studentButton.primary} ${sizeMd} gap-2`}>
              <Plus size={16} /> Book a consultation
            </Button>
          </>
        }
      />

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>}

      {/* ---------- Tabs ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <StudentTab label="All" count={counts.all} active={tab === "all"} onClick={() => setTab("all")} />
        <StudentTab label="Pending" count={counts.pending} active={tab === "pending"} onClick={() => setTab("pending")} />
        <StudentTab label="Upcoming" count={counts.upcoming} active={tab === "upcoming"} onClick={() => setTab("upcoming")} />
        <StudentTab label="Past" count={counts.past} active={tab === "past"} onClick={() => setTab("past")} />
        <StudentTab label="Cancelled / Declined" count={counts.closed} active={tab === "closed"} onClick={() => setTab("closed")} />
        {counts.pending > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-[13px] font-semibold text-amber-800">
            <Info size={14} aria-hidden /> {counts.pending} request{counts.pending === 1 ? "" : "s"} awaiting faculty reply
          </span>
        )}
      </div>

      {/* ---------- Toolbar ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative block w-full max-w-xs">
          <span className="sr-only">Search appointments</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5b5078]" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search faculty, topic or room"
            className={`${studentField} h-10 pl-9 pr-3`}
          />
        </label>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-[#5b5078]">
          From
          <input type="date" aria-label="Appointments from date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className={`${studentField} h-10 w-auto px-3`} />
        </label>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-[#5b5078]">
          To
          <input type="date" aria-label="Appointments to date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className={`${studentField} h-10 w-auto px-3`} />
        </label>
        <select
          aria-label="Filter appointments by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "all" | ApptStatus)}
          className={`${studentField} h-10 w-auto cursor-pointer px-3 font-medium`}
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {todayOnly && (
          <span className="inline-flex h-8 items-center gap-2 rounded-full bg-schedwise-lavender-100 pl-3 pr-2 text-[13px] font-semibold text-schedwise-purple">
            Today
            <Button onClick={() => setTodayOnly(false)} aria-label="Remove today filter" className="size-5 rounded-full hover:bg-white/70">
              <X size={12} />
            </Button>
          </span>
        )}
        {hasFilters && (
          <Button onClick={clearFilters} className="text-[13px] font-semibold text-schedwise-purple hover:underline">
            Clear filters
          </Button>
        )}
        <p aria-live="polite" className="ml-auto text-sm font-semibold text-[#5b5078]">
          {filtered.length} appointment{filtered.length === 1 ? "" : "s"}
        </p>
      </div>

      {/* ---------- Table ---------- */}
      <StudentCard bodyClassName="p-0">
        {loading ? (
          <p className="px-6 py-12 text-center text-sm text-[#5b5078]">Loading appointments…</p>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={mine.length === 0 ? "No appointments yet" : "No appointments match these filters"}
              description={
                mine.length === 0
                  ? "Request a consultation and it will show up here."
                  : "Try a different tab, search or date range."
              }
              action={
                mine.length === 0 ? (
                  <Button onClick={() => onNavigate("Book a Consultation")} className={`${studentButton.primary} ${sizeMd}`}>
                    Book a consultation
                  </Button>
                ) : hasFilters ? (
                  <Button onClick={clearFilters} className={`${studentButton.secondary} ${sizeMd}`}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left">
              <thead>
                <tr className="bg-schedwise-lavender-50 text-xs font-semibold uppercase tracking-wide text-[#5b5078]">
                  <th scope="col" className="px-5 py-3">Faculty</th>
                  <th scope="col" className="px-3 py-3">Topic</th>
                  <th scope="col" className="px-3 py-3">Date &amp; time</th>
                  <th scope="col" className="px-3 py-3">Room</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((a) => {
                  const faculty = fullName(a.faculty_first_name, a.faculty_last_name, "Faculty")
                  const needsReply = a.status === "reschedule_requested"
                  const hasSummary = a.status === "completed" && Boolean(recordFor(a)?.summary?.trim() || a.summary?.trim())
                  return (
                    <tr key={a.id} className={`border-t border-schedwise-lavender-100 align-middle ${needsReply ? "bg-amber-50" : ""}`}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <FacultyAvatar name={faculty} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-brand-deep-purple">{faculty}</p>
                            {a.faculty_number && <p className="truncate text-xs text-[#5b5078]">{a.faculty_number}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[240px] px-3 py-3.5 text-sm text-brand-deep-purple">{a.topic || "Consultation"}</td>
                      <td className="px-3 py-3.5">
                        <p className="text-sm font-semibold text-brand-deep-purple">
                          {formatDate(fromIso(a.appointment_date), { weekday: "short", month: "short", day: "numeric" })}
                        </p>
                        <p className="text-xs text-[#5b5078]">{timeRange(a.start_minutes, a.end_minutes)}</p>
                      </td>
                      <td className="px-3 py-3.5 text-sm text-[#5b5078]">{a.location || "—"}</td>
                      <td className="px-3 py-3.5"><StatusChip status={a.status} /></td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
                          <Button onClick={() => setDetails(a)} aria-label={`View details: ${a.topic}`} className={`${textAction} text-schedwise-purple`}>
                            View
                          </Button>
                          {hasSummary && (
                            <Button onClick={() => setDetails(a)} aria-label={`View summary: ${a.topic}`} className={`${textAction} text-schedwise-purple`}>
                              Summary
                            </Button>
                          )}
                          {canManage(a) && (
                            <>
                              <Button
                                onClick={() => { setNotice(""); setAction({ appointment: a, mode: "reschedule" }) }}
                                aria-label={`Request a new time: ${a.topic}`}
                                className={`${textAction} text-schedwise-purple`}
                              >
                                Reschedule
                              </Button>
                              <Button
                                onClick={() => { setNotice(""); setAction({ appointment: a, mode: "cancel" }) }}
                                aria-label={`Cancel appointment: ${a.topic}`}
                                className={`${textAction} text-rose-700`}
                              >
                                {a.status === "confirmed" ? "Cancel" : "Cancel request"}
                              </Button>
                            </>
                          )}
                          {(a.status === "cancelled" || a.status === "rejected" || a.status === "no_show") && (
                            <Button onClick={() => onNavigate("Book a Consultation")} className={`${textAction} text-schedwise-purple`}>
                              Rebook
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-schedwise-lavender-100 px-5 py-3.5">
            <p className="text-[13px] text-[#5b5078]">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <Button
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                aria-label="Previous page"
                className="size-[34px] rounded-[10px] border border-[#ddd6fe] bg-white text-[#5b5078] hover:bg-schedwise-lavender-50"
              >
                <ChevronLeft size={16} />
              </Button>
              <span className="min-w-[72px] text-center text-[13px] font-semibold text-brand-deep-purple">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                aria-label="Next page"
                className="size-[34px] rounded-[10px] border border-[#ddd6fe] bg-white text-[#5b5078] hover:bg-schedwise-lavender-50"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </StudentCard>

      {details && !action && (
        <StudentAppointmentDetailsDialog
          appointment={details}
          record={recordFor(details)}
          canManage={canManage(details)}
          onClose={() => setDetails(null)}
          onRequestNewTime={() => setAction({ appointment: details, mode: "reschedule" })}
          onCancel={() => setAction({ appointment: details, mode: "cancel" })}
        />
      )}
      {action && (
        <StudentAppointmentDialog
          key={`${action.mode}-${action.appointment.id}`}
          appointment={action.appointment}
          mode={action.mode}
          onClose={() => setAction(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  )
}
