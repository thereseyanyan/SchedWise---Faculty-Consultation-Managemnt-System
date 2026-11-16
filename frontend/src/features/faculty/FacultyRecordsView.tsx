import { useContext, useEffect, useMemo, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Lock,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react"
import {
  appointmentApi,
  consultationApi,
  type Appointment,
  type ApptStatus,
  type ConsultationRecord,
} from "../../api"
import {
  Avatar,
  Button,
  CurrentUserContext,
  EmptyState,
  Segmented,
  consultationHasEnded,
  errorMessage,
  formatDate,
  fromIso,
  fullName,
  initialsOf,
  statusLabel,
  statusTone,
  timeRange,
} from "../../shared"

type RecordRow = {
  appointment: Appointment
  record: ConsultationRecord | null
  studentName: string
  studentId: string
  topic: string
  location: string
  departmentId: string
  departmentName: string
}

type SortOrder = "date-desc" | "date-asc"
type RecordTab = "shared" | "notes"

const PAGE_SIZE = 8
const HISTORY_STATUS_ORDER: ApptStatus[] = ["completed", "confirmed", "no_show", "cancelled"]

const fieldLabelClass = "mb-2 block text-[12px] font-semibold text-muted"
const selectClass =
  "h-10 w-full rounded-[10px] border border-border-card bg-white px-3 text-[14px] font-medium text-ink outline-none transition focus:border-primary focus:ring-[3px] focus:ring-primary/15"
const dateClass =
  "h-10 min-w-[150px] flex-1 rounded-[10px] border border-border-card bg-white px-3 text-[14px] font-medium text-ink outline-none transition focus:border-primary focus:ring-[3px] focus:ring-primary/15"

const toneClass = {
  success: "border-green/20 bg-green-tint text-green",
  warning: "border-amber/30 bg-amber-tint text-amber-900",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
} as const

function toHistoryRow(
  appointment: Appointment,
  record: ConsultationRecord | null,
  timeZone?: string,
): RecordRow | null {
  const ended = consultationHasEnded(
    appointment.appointment_date,
    appointment.end_minutes,
    timeZone,
  )
  const isHistory =
    appointment.status === "completed" ||
    (appointment.status === "confirmed" && ended) ||
    ((appointment.status === "cancelled" || appointment.status === "no_show") && ended)

  if (!isHistory) return null

  const studentId = appointment.student_number?.trim() || appointment.student_id
  const studentName = fullName(
    appointment.student_first_name,
    appointment.student_last_name,
    studentId ? `Student ${studentId}` : "Student",
  )
  const departmentName =
    appointment.student_department_name?.trim() ||
    appointment.student_department_id?.trim() ||
    "Unassigned"

  return {
    appointment,
    record,
    studentName,
    studentId,
    topic: appointment.topic?.trim() || "Consultation",
    location: appointment.location?.trim() || (appointment.meeting_link?.trim() ? "Online" : ""),
    departmentId: appointment.student_department_id?.trim() || "",
    departmentName,
  }
}

function StatusChip({ status }: { status: ApptStatus }) {
  return (
    <span
      className={`inline-flex min-h-7 w-fit items-center justify-center whitespace-nowrap rounded-full border px-3 py-1 text-[12px] font-semibold leading-4 ${toneClass[statusTone[status]]}`}
    >
      {statusLabel[status]}
    </span>
  )
}

export function FacultyRecordsView({ onNewRecord }: { onNewRecord?: () => void } = {}) {
  const currentUser = useContext(CurrentUserContext)
  const [rows, setRows] = useState<RecordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [query, setQuery] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [departmentFilter, setDepartmentFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<"all" | ApptStatus>("all")
  const [sortOrder, setSortOrder] = useState<SortOrder>("date-desc")
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState("")
  const [recordTab, setRecordTab] = useState<RecordTab>("shared")

  useEffect(() => {
    let cancelled = false
    const facultyId = currentUser?.id
    const timeZone = currentUser?.timezone

    if (!facultyId) {
      setRows([])
      setError("Unable to determine the signed-in faculty account.")
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    Promise.all([
      appointmentApi.list({ faculty_id: facultyId }),
      consultationApi.list({ faculty_id: facultyId }),
    ])
      .then(([appointmentRows, recordRows]) => {
        if (cancelled) return

        const appointments = new Map<string, Appointment>()
        appointmentRows.forEach((appointment) => appointments.set(appointment.id, appointment))

        const records = new Map<string, ConsultationRecord>()
        recordRows.forEach((record) => {
          const existing = records.get(record.appointment_id)
          const recordTime = record.updated_at || record.created_at
          const existingTime = existing ? existing.updated_at || existing.created_at : ""
          if (!existing || recordTime > existingTime) {
            records.set(record.appointment_id, record)
          }
        })

        const history = Array.from(appointments.values())
          .map((appointment) =>
            toHistoryRow(appointment, records.get(appointment.id) ?? null, timeZone),
          )
          .filter((row): row is RecordRow => row !== null)

        setRows(history)
      })
      .catch((err) => {
        if (cancelled) return
        setRows([])
        setError(errorMessage(err, "Failed to load consultation records"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [currentUser?.id, currentUser?.timezone, reloadKey])

  useEffect(() => {
    setPage(1)
  }, [query, dateFrom, dateTo, departmentFilter, statusFilter, sortOrder])

  const departmentOptions = useMemo(() => {
    const options = new Map<string, string>()
    let hasUnassigned = false
    rows.forEach((row) => {
      if (row.departmentId) options.set(row.departmentId, row.departmentName)
      else hasUnassigned = true
    })
    const sorted = Array.from(options.entries()).sort((a, b) => a[1].localeCompare(b[1]))
    if (hasUnassigned) sorted.push(["unassigned", "Unassigned"])
    return sorted
  }, [rows])

  const statusOptions = useMemo(() => {
    const present = new Set(rows.map((row) => row.appointment.status))
    return HISTORY_STATUS_ORDER.filter((status) => present.has(status))
  }, [rows])

  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo)
  const hasFilters =
    Boolean(query.trim() || dateFrom || dateTo) ||
    departmentFilter !== "all" ||
    statusFilter !== "all" ||
    sortOrder !== "date-desc"

  const filteredRows = useMemo(() => {
    if (invalidDateRange) return []

    const needle = query.trim().toLowerCase()
    return rows
      .filter((row) => {
        if (departmentFilter === "unassigned" && row.departmentId) return false
        if (
          departmentFilter !== "all" &&
          departmentFilter !== "unassigned" &&
          row.departmentId !== departmentFilter
        ) {
          return false
        }
        if (statusFilter !== "all" && row.appointment.status !== statusFilter) return false
        if (dateFrom && row.appointment.appointment_date < dateFrom) return false
        if (dateTo && row.appointment.appointment_date > dateTo) return false
        if (!needle) return true
        return (
          row.studentName.toLowerCase().includes(needle) ||
          row.studentId.toLowerCase().includes(needle) ||
          row.topic.toLowerCase().includes(needle)
        )
      })
      .sort((a, b) => {
        const dateOrder = a.appointment.appointment_date.localeCompare(
          b.appointment.appointment_date,
        )
        const timeOrder = a.appointment.start_minutes - b.appointment.start_minutes
        return sortOrder === "date-desc" ? -(dateOrder || timeOrder) : dateOrder || timeOrder
      })
  }, [
    rows,
    query,
    departmentFilter,
    statusFilter,
    dateFrom,
    dateTo,
    invalidDateRange,
    sortOrder,
  ])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE)
  const selectedRow = rows.find((row) => row.appointment.id === selectedId) ?? null
  const selectedRecord = selectedRow?.record ?? null
  const selectedSummary = selectedRecord?.summary?.trim() ?? ""
  const selectedActionItems = selectedRecord?.action_items?.trim() ?? ""
  const selectedFollowUpDate = selectedRecord?.follow_up_date?.trim() ?? ""
  const selectedPrivateNotes = selectedRecord?.private_notes?.trim() ?? ""
  const selectedAnnouncement = selectedRow
    ? `Selected ${selectedRow.studentName}, ${formatDate(
        fromIso(selectedRow.appointment.appointment_date),
        { weekday: "long", month: "long", day: "numeric", year: "numeric" },
      )}, ${timeRange(selectedRow.appointment.start_minutes, selectedRow.appointment.end_minutes)}.`
    : ""
  const canCreate = currentUser?.role_id?.toLowerCase() === "faculty"
  const awaitingRecordCount = rows.filter(
    (row) => row.appointment.status === "completed" && !row.record,
  ).length
  const countLabel = loading
    ? "Loading records..."
    : hasFilters
      ? `Showing ${filteredRows.length} of ${rows.length} record${rows.length === 1 ? "" : "s"}`
      : `${rows.length} record${rows.length === 1 ? "" : "s"}`
  const noRecordsAvailable = !loading && !error && rows.length === 0

  const clearFilters = () => {
    setQuery("")
    setDateFrom("")
    setDateTo("")
    setDepartmentFilter("all")
    setStatusFilter("all")
    setSortOrder("date-desc")
  }

  return (
    <div data-testid="faculty-records-view">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p
            className="text-[13px] font-medium text-muted"
            role="status"
            aria-live="polite"
          >
            {countLabel}
          </p>
        </div>
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search</span>
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Student name, ID, or topic"
            className="h-10 w-full rounded-[10px] border border-border-card bg-white pl-10 pr-10 text-[14px] font-medium text-ink outline-none transition placeholder:font-normal placeholder:text-muted focus:border-primary focus:ring-[3px] focus:ring-primary/15"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted transition hover:bg-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </label>
        {canCreate && onNewRecord && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              onClick={onNewRecord}
              disabled={awaitingRecordCount === 0}
              title={
                awaitingRecordCount === 0
                  ? "No completed consultations are awaiting a record."
                  : "Open Appointments to add a record for a completed consultation."
              }
              className="h-10 gap-2 rounded-[10px] border border-primary bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary/90"
            >
              <Plus size={15} />
              New Record
            </Button>
          </div>
        )}
      </header>

      <section
        className="mt-6 rounded-[16px] border border-border-card bg-white p-5 shadow-card"
        aria-label="Record filters"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[170px] flex-1">
            <span className={fieldLabelClass}>Department</span>
            <select
              aria-label="Department"
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              className={selectClass}
            >
              <option value="all">All departments</option>
              {departmentOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[170px] flex-1">
            <span className={fieldLabelClass}>Status</span>
            <select
              aria-label="Status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | ApptStatus)}
              className={selectClass}
            >
              <option value="all">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {statusLabel[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[170px] flex-1">
            <span className={fieldLabelClass}>Sort by date</span>
            <select
              aria-label="Sort by date"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as SortOrder)}
              className={selectClass}
            >
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
            </select>
          </label>
          <div className="min-w-[340px] flex-[1.5]">
            <span className={fieldLabelClass}>Date range</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => setDateFrom(event.target.value)}
                aria-label="From date"
                aria-invalid={invalidDateRange || undefined}
                aria-describedby={invalidDateRange ? "records-date-error" : undefined}
                className={dateClass}
              />
              <span className="text-[12px] font-medium text-muted">to</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => setDateTo(event.target.value)}
                aria-label="To date"
                aria-invalid={invalidDateRange || undefined}
                aria-describedby={invalidDateRange ? "records-date-error" : undefined}
                className={dateClass}
              />
            </div>
            {invalidDateRange && (
              <p
                id="records-date-error"
                className="mt-1.5 text-[12px] font-medium text-rose-700"
                role="alert"
              >
                Start date must be on or before end date.
              </p>
            )}
          </div>

          {hasFilters && (
            <Button
              onClick={clearFilters}
              className="h-10 gap-2 rounded-[10px] border border-border-card bg-white px-4 text-[13px] font-semibold text-ink hover:border-primary/40 hover:bg-soft"
            >
              <RotateCcw size={15} />
              Clear filters
            </Button>
          )}
        </div>
      </section>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(340px,0.82fr)_minmax(0,1.18fr)]">
        <section
          className="min-w-0 overflow-hidden rounded-[16px] border border-border-card bg-white shadow-card"
          aria-label="Consultation history and records"
        >
          <div className="flex items-center justify-between gap-3 border-b border-divider px-4 py-3">
            <h2 className="text-[15px] font-semibold text-ink">Records</h2>
            <span className="text-[12px] font-medium text-muted">
              {loading ? "Loading..." : `${filteredRows.length} shown`}
            </span>
          </div>

          <div className="max-h-[560px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-12 text-[14px] font-medium text-muted">
                <Loader2 size={17} className="animate-spin" aria-hidden />
                Loading consultation records...
              </div>
            ) : error ? (
              <div
                className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-3 text-[14px] text-rose-800"
                role="alert"
              >
                <span>{error}</span>
                <Button
                  onClick={() => setReloadKey((value) => value + 1)}
                  className="h-9 rounded-[8px] border border-rose-300 bg-white px-3 text-[13px] font-semibold text-rose-800 hover:bg-rose-100"
                >
                  Retry
                </Button>
              </div>
            ) : pageRows.length === 0 ? (
              <EmptyState
                className="m-4"
                icon={hasFilters ? Search : FileText}
                title={hasFilters ? "No records match these filters" : "No consultation history yet"}
                description={
                  hasFilters
                    ? "Adjust the search, date range, department, or status filters to see more records."
                    : "Past consultations will appear here after their scheduled time."
                }
                action={
                  hasFilters ? (
                    <Button
                      onClick={clearFilters}
                      className="h-9 rounded-[8px] border border-border-card bg-white px-3 text-[13px] font-semibold text-ink hover:border-primary/40 hover:bg-soft"
                    >
                      Clear all filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul role="list" className="divide-y divide-divider">
                {pageRows.map((row) => {
                  const isSelected = row.appointment.id === selectedId
                  const dateLabel = formatDate(fromIso(row.appointment.appointment_date), {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                  const timeLabel = timeRange(
                    row.appointment.start_minutes,
                    row.appointment.end_minutes,
                  )
                  const detailLabel = row.studentId
                    ? `${row.studentId} · ${row.departmentName}`
                    : row.departmentName

                  return (
                    <li key={row.appointment.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (row.appointment.id !== selectedId) setRecordTab("shared")
                          setSelectedId(row.appointment.id)
                        }}
                        aria-pressed={isSelected}
                        aria-label={`Select record for ${row.studentName}, ${row.studentId}, ${dateLabel}, ${timeLabel}, ${statusLabel[row.appointment.status]}, ${row.location || "location not recorded"}`}
                        data-record-id={row.record?.id ?? undefined}
                        className={`relative block w-full cursor-pointer px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                          isSelected ? "bg-soft/70" : "bg-white hover:bg-page-bg/70"
                        }`}
                      >
                        {isSelected && (
                          <span
                            aria-hidden
                            className="absolute inset-y-0 left-0 w-1 rounded-r-full bg-primary"
                          />
                        )}
                        <span className="flex min-w-0 items-start gap-3">
                          <Avatar initials={initialsOf(row.studentName)} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span
                                className="min-w-0 truncate text-[14px] font-semibold text-ink"
                                title={row.studentName}
                              >
                                {row.studentName}
                              </span>
                              <StatusChip status={row.appointment.status} />
                            </span>
                            <span
                              className="mt-1 block truncate text-[13px] text-muted"
                              title={row.topic}
                            >
                              {row.topic}
                            </span>
                            <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                              <span>{dateLabel}</span>
                              <span aria-hidden>·</span>
                              <span>{timeLabel}</span>
                              {row.location && (
                                <>
                                  <span aria-hidden>·</span>
                                  <span className="inline-flex min-w-0 items-center gap-1">
                                    <MapPin size={12} aria-hidden className="shrink-0" />
                                    <span className="truncate">{row.location}</span>
                                  </span>
                                </>
                              )}
                            </span>
                            <span
                              className="mt-1 block truncate text-[12px] text-muted"
                              title={detailLabel}
                            >
                              {detailLabel}
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {!loading && !error && filteredRows.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider bg-page-bg/40 px-4 py-3">
              <p className="text-[12px] font-medium text-muted">
                Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filteredRows.length)} of{" "}
                {filteredRows.length}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  className="h-9 gap-1 rounded-[8px] border border-border-card bg-white px-2.5 text-[13px] font-semibold text-ink hover:border-primary/40 hover:bg-soft"
                >
                  <ChevronLeft size={15} />
                  Previous
                </Button>
                <span className="px-1 text-[12px] font-semibold tabular-nums text-muted">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                  className="h-9 gap-1 rounded-[8px] border border-border-card bg-white px-2.5 text-[13px] font-semibold text-ink hover:border-primary/40 hover:bg-soft"
                >
                  Next
                  <ChevronRight size={15} />
                </Button>
              </div>
            </div>
          )}
        </section>

        <section
          className="min-w-0 overflow-hidden rounded-[16px] border border-border-card bg-white shadow-card"
          aria-label="Selected consultation record"
        >
          {selectedRow ? (
            <>
              <header className="border-b border-divider px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar initials={initialsOf(selectedRow.studentName)} />
                    <div className="min-w-0">
                      <h2
                        className="truncate text-[18px] font-semibold leading-7 text-ink"
                        title={selectedRow.studentName}
                      >
                        {selectedRow.studentName}
                      </h2>
                      <p className="mt-0.5 truncate text-[13px] text-muted">
                        {selectedRow.studentId || "Student ID not on file"} ·{" "}
                        {selectedRow.departmentName}
                      </p>
                    </div>
                  </div>
                  <StatusChip status={selectedRow.appointment.status} />
                </div>
              </header>

              <div className="space-y-5 p-5">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-[12px] font-semibold text-muted">Date &amp; time</dt>
                    <dd className="mt-1 text-[14px] leading-6 text-ink">
                      <span className="block">
                        {formatDate(fromIso(selectedRow.appointment.appointment_date), {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span className="block text-[13px] text-muted">
                        {timeRange(
                          selectedRow.appointment.start_minutes,
                          selectedRow.appointment.end_minutes,
                        )}
                      </span>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[12px] font-semibold text-muted">Location</dt>
                    <dd className="mt-1 flex min-w-0 items-start gap-1.5 text-[14px] leading-6 text-ink">
                      {selectedRow.location && (
                        <MapPin size={14} aria-hidden className="mt-1 shrink-0 text-muted" />
                      )}
                      <span className="break-words">
                        {selectedRow.location || "Not recorded"}
                      </span>
                    </dd>
                  </div>
                </dl>

                <section aria-labelledby="records-detail-topic">
                  <h3 id="records-detail-topic" className="text-[12px] font-semibold text-muted">
                    Topic
                  </h3>
                  <p className="mt-1 break-words text-[14px] font-semibold leading-6 text-ink">
                    {selectedRow.topic}
                  </p>
                </section>

                <section aria-labelledby="records-detail-reason">
                  <h3 id="records-detail-reason" className="text-[12px] font-semibold text-muted">
                    Consultation reason
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-6 text-ink">
                    {selectedRow.appointment.reason?.trim() || "No reason was recorded."}
                  </p>
                </section>

                <section
                  className="rounded-[12px] border border-divider bg-page-bg/40 p-4"
                  aria-labelledby="records-detail-feedback"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3
                      id="records-detail-feedback"
                      className="text-[12px] font-semibold text-muted"
                    >
                      Consultation feedback
                    </h3>
                    <span className="text-[12px] font-medium text-muted">Read-only record</span>
                  </div>

                  <div role="group" aria-label="Consultation feedback sections">
                    <Segmented
                      className="mt-3"
                      options={[
                        { value: "shared", label: "Shared feedback" },
                        { value: "notes", label: "Faculty notes" },
                      ]}
                      value={recordTab}
                      onChange={setRecordTab}
                    />
                  </div>

                  {!selectedRecord ? (
                    <p className="mt-3 rounded-[10px] border border-dashed border-border-card px-3 py-4 text-[13px] leading-6 text-muted">
                      No consultation record has been added for this appointment yet.
                    </p>
                  ) : recordTab === "shared" ? (
                    <div className="mt-4 space-y-4">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-[12px] font-semibold text-muted">
                            Student-visible feedback
                          </h4>
                          <span className="rounded-full border border-green/20 bg-green-tint px-2.5 py-1 text-[12px] font-medium text-green">
                            Shared with student
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-6 text-ink">
                          {selectedSummary || "No shared summary was recorded."}
                        </p>
                      </div>

                      {selectedActionItems && (
                        <div>
                          <h4 className="text-[12px] font-semibold text-muted">Action items</h4>
                          <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-6 text-ink">
                            {selectedActionItems}
                          </p>
                        </div>
                      )}

                      {selectedFollowUpDate && (
                        <div>
                          <h4 className="text-[12px] font-semibold text-muted">Follow-up date</h4>
                          <p className="mt-2 text-[14px] leading-6 text-ink">
                            {formatDate(fromIso(selectedFollowUpDate), {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4">
                      <div className="flex items-start gap-2 rounded-[10px] border border-amber/30 bg-amber-tint/60 px-3 py-2.5">
                        <Lock size={14} aria-hidden className="mt-0.5 shrink-0 text-amber-900" />
                        <p className="text-[12px] font-medium leading-5 text-amber-900">
                          Faculty only. These notes are never shown to students.
                        </p>
                      </div>
                      {selectedPrivateNotes ? (
                        <p className="mt-3 whitespace-pre-wrap break-words text-[14px] leading-6 text-ink">
                          {selectedPrivateNotes}
                        </p>
                      ) : (
                        <p className="mt-3 rounded-[10px] border border-dashed border-border-card px-3 py-4 text-[13px] leading-6 text-muted">
                          No private notes recorded for this consultation.
                        </p>
                      )}
                    </div>
                  )}
                </section>
              </div>
            </>
          ) : selectedId ? (
            <div className="flex min-h-[280px] items-center justify-center p-6 text-center">
              <div className="max-w-xs">
                <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-soft text-primary">
                  {loading ? (
                    <Loader2 size={19} className="animate-spin" aria-hidden />
                  ) : (
                    <FileText size={19} aria-hidden />
                  )}
                </span>
                <h2 className="mt-4 text-[15px] font-semibold text-ink">
                  {loading
                    ? "Refreshing selected consultation"
                    : error
                      ? "Unable to verify selected consultation"
                      : "Selected consultation unavailable"}
                </h2>
                <p className="mt-1 text-[13px] leading-6 text-muted" role="status">
                  {loading
                    ? "The selected consultation is being checked against the latest records."
                    : error
                      ? "The selected consultation could not be verified. Retry loading the records to continue."
                      : "This consultation is no longer available to your account. Choose another record."}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[280px] items-center justify-center p-6 text-center">
              <div className="max-w-xs">
                <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-soft text-primary">
                  <FileText size={19} aria-hidden />
                </span>
                <h2 className="mt-4 text-[15px] font-semibold text-ink">
                  {noRecordsAvailable ? "No consultation records yet" : "Select a consultation record"}
                </h2>
                <p className="mt-1 text-[13px] leading-6 text-muted">
                  {noRecordsAvailable
                    ? "Completed consultations will appear here after their scheduled time."
                    : "Choose a record from the list to review appointment details, shared feedback, and faculty-only notes."}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      {selectedRow && (
        <p className="sr-only" role="status" aria-live="polite">
          {selectedAnnouncement}
        </p>
      )}
    </div>
  )
}
