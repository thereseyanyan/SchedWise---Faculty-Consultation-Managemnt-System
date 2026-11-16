import { useEffect, useMemo, useState } from "react"
import { History, Search } from "lucide-react"
import {
  appointmentApi,
  consultationApi,
  type Appointment,
  type ApptStatus,
  type ConsultationRecord,
} from "../../api"
import {
  Button,
  EmptyState,
  errorMessage,
  formatDate,
  fromIso,
  fullName,
  timeRange,
  toIso,
} from "../../shared"
import type { StudentNavigate } from "./StudentDashboardView"
import {
  FacultyAvatar,
  StatusChip,
  StudentCard,
  StudentDialog,
  StudentPageHeader,
  sizeMd,
  studentButton,
  studentField,
} from "./studentUi"

type Feedback = {
  faculty: string
  topic: string
  date: string
  summary: string
  actionItems: string[]
  followUpDate: string
}

type Row = {
  id: string
  faculty: string
  topic: string
  date: string
  time: string
  sortDate: string
  status: ApptStatus
  feedback: Feedback | null
}

const FINISHED: ApptStatus[] = ["completed", "rejected", "cancelled", "no_show"]
const FILTERS: { value: "all" | ApptStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rejected", label: "Declined" },
  { value: "no_show", label: "No-show" },
]

export function StudentHistoryView({ onNavigate }: { onNavigate?: StudentNavigate }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [consultations, setConsultations] = useState<ConsultationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | ApptStatus>("all")

  // Both endpoints are scoped to the signed-in student by the API.
  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true)
      setError(null)
      try {
        const [allAppointments, ownConsultations] = await Promise.all([
          appointmentApi.list(),
          consultationApi.list(),
        ])
        setAppointments(allAppointments)
        setConsultations(ownConsultations)
      } catch (err) {
        setError(errorMessage(err, "Failed to load appointment history"))
        setAppointments([])
        setConsultations([])
      } finally {
        setLoading(false)
      }
    }
    void fetchHistory()
  }, [])

  const today = toIso(new Date())
  // Active future appointments belong in My Appointments; history shows
  // finished records and appointments whose date has already passed.
  const rows: Row[] = useMemo(
    () =>
      appointments
        .filter((appt) => FINISHED.includes(appt.status) || appt.appointment_date < today)
        .sort((a, b) => b.appointment_date.localeCompare(a.appointment_date))
        .map((appt) => {
          const consultation = consultations.find((record) => record.appointment_id === appt.id)
          const summary = consultation?.summary?.trim() || ""
          const faculty = fullName(appt.faculty_first_name, appt.faculty_last_name, `Faculty ID: ${appt.faculty_id}`)
          const date = formatDate(fromIso(appt.appointment_date), { month: "short", day: "numeric", year: "numeric" })
          return {
            id: appt.id,
            faculty,
            topic: appt.topic || "Consultation",
            date,
            time: timeRange(appt.start_minutes, appt.end_minutes),
            sortDate: appt.appointment_date,
            status: appt.status,
            feedback: summary
              ? {
                  faculty,
                  topic: appt.topic || "Consultation",
                  date,
                  summary,
                  actionItems: (consultation?.action_items ?? "")
                    .split(/\r?\n/)
                    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
                    .filter(Boolean),
                  followUpDate: consultation?.follow_up_date || "",
                }
              : null,
          }
        }),
    [appointments, consultations, today],
  )

  const needle = query.trim().toLowerCase()
  const visible = rows.filter(
    (row) =>
      (statusFilter === "all" || row.status === statusFilter) &&
      (!needle || `${row.faculty} ${row.topic} ${row.date}`.toLowerCase().includes(needle)),
  )
  const countFor = (value: "all" | ApptStatus) =>
    value === "all" ? rows.length : rows.filter((row) => row.status === value).length

  return (
    <div className="flex flex-col gap-5">
      <StudentPageHeader
        title="My History"
      />

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filter history by status" className="flex flex-wrap gap-1.5">
          {FILTERS.map(({ value, label }) => {
            const active = statusFilter === value
            return (
              <Button
                key={value}
                onClick={() => setStatusFilter(value)}
                aria-pressed={active}
                className={`h-9 gap-1.5 rounded-full px-3.5 text-[13px] font-semibold ${
                  active
                    ? "bg-schedwise-purple text-white"
                    : "border border-[#ddd6fe] bg-white text-[#5b5078] hover:bg-schedwise-lavender-50"
                }`}
              >
                {label}
                <span className={`tabular-nums ${active ? "text-white/80" : "text-[#8a80a8]"}`}>{countFor(value)}</span>
              </Button>
            )
          })}
        </div>
        <label className="relative ml-auto block w-full max-w-xs">
          <span className="sr-only">Search history</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5b5078]" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search faculty or topic"
            className={`${studentField} h-10 pl-9 pr-3`}
          />
        </label>
      </div>

      <StudentCard bodyClassName="p-0">
        {loading ? (
          <p className="px-6 py-12 text-center text-sm text-[#5b5078]">Loading consultation history…</p>
        ) : visible.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={History}
              title={rows.length === 0 ? "No consultation history yet" : "No records match these filters"}
              description={
                rows.length === 0
                  ? "Your completed and past consultation records will appear here after your first appointment."
                  : "Try a different status or search."
              }
              action={
                rows.length === 0 && onNavigate ? (
                  <Button onClick={() => onNavigate("Book a Consultation")} className={`${studentButton.primary} ${sizeMd}`}>
                    Book a consultation
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="bg-schedwise-lavender-50 text-xs font-semibold uppercase tracking-wide text-[#5b5078]">
                  <th scope="col" className="px-5 py-3">Faculty</th>
                  <th scope="col" className="px-3 py-3">Topic</th>
                  <th scope="col" className="px-3 py-3">Date</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-5 py-3 text-right">Summary</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className="border-t border-schedwise-lavender-100 transition hover:bg-schedwise-lavender-50/60">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <FacultyAvatar name={row.faculty} />
                        <p className="truncate text-sm font-semibold text-brand-deep-purple">{row.faculty}</p>
                      </div>
                    </td>
                    <td className="max-w-[260px] px-3 py-3.5 text-sm text-brand-deep-purple">{row.topic}</td>
                    <td className="px-3 py-3.5">
                      <p className="text-sm font-semibold text-brand-deep-purple">{row.date}</p>
                      <p className="text-xs text-[#5b5078]">{row.time}</p>
                    </td>
                    <td className="px-3 py-3.5"><StatusChip status={row.status} /></td>
                    <td className="px-5 py-3.5 text-right">
                      {row.feedback ? (
                        <Button
                          onClick={() => setFeedback(row.feedback)}
                          aria-label={`View summary: ${row.topic}`}
                          className={`${studentButton.secondary} h-8 px-4 text-[13px]`}
                        >
                          View summary
                        </Button>
                      ) : row.status === "completed" ? (
                        <span className="text-xs text-[#8a80a8]">No summary yet</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StudentCard>

      {feedback && (
        <StudentDialog
          titleId="student-feedback-title"
          title="Consultation summary"
          subtitle={`${feedback.topic} · ${feedback.faculty} · ${feedback.date}`}
          onClose={() => setFeedback(null)}
          footer={<Button onClick={() => setFeedback(null)} className={`${studentButton.primary} ${sizeMd}`}>Close</Button>}
        >
          <p className="rounded-xl bg-schedwise-lavender-50 p-4 text-sm leading-6 text-brand-deep-purple">{feedback.summary}</p>
          {feedback.actionItems.length > 0 && (
            <div className="mt-4">
              <p className="text-[13px] font-semibold text-brand-deep-purple">Action items</p>
              <ul className="mt-2 flex flex-col gap-2">
                {feedback.actionItems.map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-brand-deep-purple">
                    <span className="size-[18px] shrink-0 rounded-[5px] border-2 border-purple-300 bg-white" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {feedback.followUpDate && (
            <p className="mt-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              Follow-up · {formatDate(fromIso(feedback.followUpDate), { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </p>
          )}
        </StudentDialog>
      )}
    </div>
  )
}
