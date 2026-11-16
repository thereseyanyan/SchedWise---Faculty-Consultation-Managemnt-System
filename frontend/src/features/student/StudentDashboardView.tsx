import { useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  MessageSquare,
} from "lucide-react"
import {
  consultationApi,
  facultyApi,
  notificationsApi,
  type AppNotification,
  type ApptStatus,
  type ConsultationRecord,
  type FacultyDirectoryEntry,
  type UiAppointment,
} from "../../api"
import { StudentAppointmentDialog } from "../appointments/StudentAppointmentDialog"
import {
  Button,
  CurrentUserContext,
  EmptyState,
  StatusBadge,
  addDays,
  clock,
  formatDate,
  fromIso,
  fullName,
  initialsOf,
  mergeAppointment,
  startOfWeek,
  statusLabel,
  statusTone,
  timeRange,
  toIso,
  useAppointments,
} from "../../shared"

export type StudentNavigate = (view: string, options?: { filter?: string }) => void

const ACTIVE: ApptStatus[] = ["pending", "confirmed", "reschedule_requested"]
const PENDING: ApptStatus[] = ["pending", "reschedule_requested"]
const CANCELLED: ApptStatus[] = ["cancelled", "rejected", "no_show"]

const startOf = (a: UiAppointment) => {
  const d = fromIso(a.date)
  d.setMinutes(a.start)
  return d
}
const endOf = (a: UiAppointment) => {
  const d = fromIso(a.date)
  d.setMinutes(a.end)
  return d
}

const countdown = (target: Date, now: Date) => {
  const mins = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60_000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? "" : "s"}`
}

const dayLabel = (iso: string, today: string) => {
  if (iso === today) return "Today"
  if (iso === toIso(addDays(fromIso(today), 1))) return "Tomorrow"
  return formatDate(fromIso(iso), { weekday: "short", month: "short", day: "numeric" })
}

const facultyName = (a: UiAppointment) =>
  fullName(a.faculty_first_name, a.faculty_last_name, a.faculty)

function Card({
  title,
  right,
  children,
  className = "",
}: {
  title: string
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-[#e4defa] bg-white shadow-[0_5px_18px_rgba(109,40,217,0.10)] ${className}`}>
      <div className="flex h-[60px] items-center gap-2.5 border-b border-schedwise-lavender-100 px-5">
        <h2 className="text-lg font-semibold text-brand-deep-purple">{title}</h2>
        {right ? <div className="ml-auto">{right}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function LinkButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button onClick={onClick} className="mx-auto mt-3 w-full rounded-lg py-1 text-sm font-semibold text-schedwise-purple hover:underline">
      {children}
    </Button>
  )
}

function Pill({ tone = "lavender", children }: { tone?: "lavender" | "amber"; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone === "amber" ? "bg-amber-100 text-amber-800" : "bg-schedwise-lavender-100 text-schedwise-purple"}`}>
      {children}
    </span>
  )
}

function StatTile({
  label,
  value,
  icon: IconComponent,
  tile,
  onClick,
}: {
  label: string
  value: number
  icon: typeof Clock3
  tile: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer flex-col gap-1.5 rounded-2xl border border-[#e4defa] bg-white p-5 text-left shadow-[0_5px_18px_rgba(109,40,217,0.10)] transition hover:border-purple-400 focus-visible:outline-2 focus-visible:outline-purple-600"
    >
      <span className={`flex size-7 items-center justify-center rounded-lg text-white ${tile}`}>
        <IconComponent size={16} />
      </span>
      <span className="text-xs font-semibold uppercase tracking-wide text-brand-deep-purple">{label}</span>
      <span className="text-4xl font-semibold tabular-nums text-brand-deep-purple">{value}</span>
    </button>
  )
}

function Donut({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0)
  const radius = 42
  const circumference = 2 * Math.PI * radius
  let offset = 0
  const completed = parts.find((part) => part.label === "Completed")?.value ?? 0
  return (
    <div className="flex items-center gap-5">
      <div className="relative size-[104px] shrink-0">
        <svg viewBox="0 0 104 104" className="size-full -rotate-90" role="img" aria-label="Appointments by status">
          <circle cx="52" cy="52" r={radius} fill="none" stroke="#ede9fe" strokeWidth="12" />
          {total > 0 &&
            parts.map((part) => {
              if (!part.value) return null
              const length = (part.value / total) * circumference
              const circle = (
                <circle
                  key={part.label}
                  cx="52"
                  cy="52"
                  r={radius}
                  fill="none"
                  stroke={part.color}
                  strokeWidth="12"
                  strokeDasharray={`${Math.max(length - 2, 0)} ${circumference}`}
                  strokeDashoffset={-offset}
                />
              )
              offset += length
              return circle
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[22px] font-semibold leading-6 text-schedwise-purple">
            {total ? Math.round((completed / total) * 100) : 0}%
          </span>
          <span className="text-[11px] text-[#5b5078]">completed</span>
        </div>
      </div>
      <ul className="flex flex-col gap-2 text-xs">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center gap-2">
            <span className="size-2.5 rounded-[3px]" style={{ background: part.color }} />
            {part.label} · {part.value}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function StudentDashboardView({ onNavigate }: { onNavigate: StudentNavigate }) {
  const currentUser = useContext(CurrentUserContext)
  const [appointments] = useAppointments(currentUser?.id ?? "")
  const [records, setRecords] = useState<ConsultationRecord[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [faculty, setFaculty] = useState<FacultyDirectoryEntry[]>([])
  const [slots, setSlots] = useState<{ faculty_id: string; date: string; start_minutes: number }[]>([])
  const [reschedule, setReschedule] = useState<UiAppointment | null>(null)
  const [weekRange, setWeekRange] = useState<"week" | "month">("week")
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  // Each request fails independently so one broken endpoint never blanks the page.
  useEffect(() => {
    let live = true
    void consultationApi.list().then((rows) => live && setRecords(rows)).catch(() => undefined)
    void notificationsApi.list().then((rows) => live && setNotifications(rows)).catch(() => undefined)
    void Promise.all([facultyApi.list(), facultyApi.slots()])
      .then(([directory, available]) => {
        if (!live) return
        setFaculty(directory)
        setSlots(available)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])

  const today = toIso(now)
  const mine = useMemo(
    () => (currentUser ? appointments.filter((a) => a.student_id === currentUser.id) : appointments),
    [appointments, currentUser],
  )

  const upcoming = mine
    .filter((a) => a.status === "confirmed" && endOf(a) > now)
    .sort((a, b) => startOf(a).getTime() - startOf(b).getTime())
  const next = upcoming[0]
  const pending = mine.filter((a) => PENDING.includes(a.status))
  const thisMonth = today.slice(0, 7)
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonth = toIso(lastMonthDate).slice(0, 7)
  const completedThis = mine.filter((a) => a.status === "completed" && a.date.startsWith(thisMonth)).length
  const completedLast = mine.filter((a) => a.status === "completed" && a.date.startsWith(lastMonth)).length

  const latestRecord = [...records]
    .filter((r) => r.summary?.trim())
    .sort((a, b) => (b.appointment_date ?? "").localeCompare(a.appointment_date ?? ""))[0]
  const actionItems = (latestRecord?.action_items ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean)

  // Weekly chart: Monday–Sunday of the current week (or the whole month).
  const weekStart = startOfWeek(now)
  const chartDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const counted = mine.filter((a) => !CANCELLED.includes(a.status))
  const chartCounts =
    weekRange === "week"
      ? chartDays.map((d) => counted.filter((a) => a.date === toIso(d)).length)
      : chartDays.map((_, i) => counted.filter((a) => a.date.startsWith(thisMonth) && (fromIso(a.date).getDay() + 6) % 7 === i).length)
  const chartMax = Math.max(1, ...chartCounts)
  const total = mine.length
  const completedAll = mine.filter((a) => a.status === "completed").length
  const cancelledAll = mine.filter((a) => CANCELLED.includes(a.status)).length

  const appointmentRows = [...mine]
    .filter((a) => ACTIVE.includes(a.status) && endOf(a) > now)
    .sort((a, b) => startOf(a).getTime() - startOf(b).getTime())
  const todays = mine
    .filter((a) => a.date === today && ACTIVE.includes(a.status))
    .sort((a, b) => a.start - b.start)

  // First open slot per faculty that does not collide with the student's own bookings.
  const openSlots = useMemo(() => {
    const free = slots
      .filter((slot) => `${slot.date}` >= today)
      .filter(
        (slot) =>
          !mine.some(
            (a) => ACTIVE.includes(a.status) && a.date === slot.date && a.start < slot.start_minutes + 30 && a.end > slot.start_minutes,
          ),
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_minutes - b.start_minutes)
    const seen = new Set<string>()
    const rows: { entry: FacultyDirectoryEntry; date: string; start: number }[] = []
    for (const slot of free) {
      if (seen.has(slot.faculty_id)) continue
      const entry = faculty.find((f) => f.id === slot.faculty_id)
      if (!entry) continue
      seen.add(slot.faculty_id)
      rows.push({ entry, date: slot.date, start: slot.start_minutes })
    }
    return rows.slice(0, 4)
  }, [slots, faculty, mine, today])

  const unread = notifications.filter((n) => !n.read_at).length
  const markAllRead = async () => {
    try {
      await notificationsApi.markAllRead()
      const stamp = new Date().toISOString()
      setNotifications((current) => current.map((n) => (n.read_at ? n : { ...n, read_at: stamp })))
    } catch {
      /* leave unread; the full page shows the error state */
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- Next consultation banner ---------- */}
      {next ? (
        <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#ddd6fe] bg-schedwise-lavender-100 px-6 py-5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[11px] bg-purple-500 text-white">
            <ArrowUpRight size={22} />
          </span>
          <div className="min-w-0 flex-1 basis-72">
            <p className="text-xs font-semibold uppercase text-schedwise-purple">
              Your next consultation · {dayLabel(next.date, today)}, {clock(next.start)}
            </p>
            <p className="truncate text-xl font-semibold text-brand-deep-purple">
              {next.topic || "Consultation"} with {facultyName(next)}
            </p>
            <p className="text-sm text-[#5b5078]">
              {next.location ? `${next.location} · ` : ""}starts in {countdown(startOf(next), now)}
            </p>
          </div>
          <StatusBadge tone={statusTone[next.status]}>{statusLabel[next.status]}</StatusBadge>
          <Button
            onClick={() => onNavigate("My Appointments", { filter: "Upcoming" })}
            className="h-10 rounded-full bg-schedwise-purple px-[22px] text-sm font-semibold text-white hover:bg-purple-800"
          >
            View details
          </Button>
          <Button
            onClick={() => setReschedule(next)}
            className="h-10 rounded-full border border-purple-300 bg-white px-[22px] text-sm font-semibold text-schedwise-purple hover:bg-schedwise-lavender-50"
          >
            Request new time
          </Button>
        </section>
      ) : (
        <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#ddd6fe] bg-schedwise-lavender-100 px-6 py-5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[11px] bg-purple-500 text-white">
            <CalendarDays size={22} />
          </span>
          <div className="min-w-0 flex-1 basis-72">
            <p className="text-xs font-semibold uppercase text-schedwise-purple">No upcoming consultation</p>
            <p className="text-xl font-semibold text-brand-deep-purple">Book time with a faculty member</p>
          </div>
          <Button
            onClick={() => onNavigate("Book a Consultation")}
            className="h-10 rounded-full bg-schedwise-purple px-[22px] text-sm font-semibold text-white hover:bg-purple-800"
          >
            Book a consultation
          </Button>
        </section>
      )}

      {/* ---------- Stats ---------- */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile
          label="Upcoming"
          value={upcoming.length}
          icon={CalendarDays}
          tile="bg-schedwise-purple"
          onClick={() => onNavigate("My Appointments", { filter: "Upcoming" })}
        />
        <StatTile
          label="Pending"
          value={pending.length}
          icon={Clock3}
          tile="bg-amber-500"
          onClick={() => onNavigate("My Appointments", { filter: "Pending Requests" })}
        />
        <StatTile
          label="Completed this month"
          value={completedThis}
          icon={Check}
          tile="bg-green-600"
          onClick={() => onNavigate("My Appointments", { filter: "Completed" })}
        />
        <StatTile
          label="Open action items"
          value={actionItems.length}
          icon={BookOpen}
          tile="bg-purple-500"
          onClick={() => onNavigate("My History")}
        />
      </div>

      {/* ---------- Columns ---------- */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card
            title="My consultations"
            right={
              <select
                aria-label="Chart range"
                value={weekRange}
                onChange={(event) => setWeekRange(event.target.value as "week" | "month")}
                className="h-8 rounded-full border border-[#ddd6fe] bg-white px-3 text-[13px] font-semibold text-[#5b5078]"
              >
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
              </select>
            }
          >
            <div className="flex flex-wrap gap-10">
              <div className="flex min-w-[300px] flex-1 flex-col gap-4">
                <div className="flex items-end gap-[18px]" role="img" aria-label="Consultations per weekday">
                  {chartCounts.map((count, index) => (
                    <div key={index} className="flex w-9 flex-col items-center gap-1.5">
                      <span className="text-xs font-semibold">{count}</span>
                      <div className="flex h-[84px] w-5 items-end overflow-hidden rounded-full bg-schedwise-lavender-100">
                        <div
                          className={`w-full rounded-full ${fromIso(today).getDay() === (index + 1) % 7 ? "bg-schedwise-purple" : "bg-purple-500"}`}
                          style={{ height: count ? `${Math.max(5, (count / chartMax) * 100)}%` : 4 }}
                        />
                      </div>
                      <span className="text-xs font-medium text-[#5b5078]">{["M", "T", "W", "T", "F", "S", "S"][index]}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    ["Total", total],
                    ["Completed", completedAll],
                    ["Cancelled", cancelledAll],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-schedwise-lavender-50 px-3.5 py-2.5">
                      <p className="text-lg font-semibold">{value}</p>
                      <p className="text-xs text-[#5b5078]">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3.5">
                <h3 className="text-sm font-semibold">Appointment status</h3>
                <Donut
                  parts={[
                    { label: "Completed", value: completedAll, color: "#6d28d9" },
                    { label: "Confirmed", value: mine.filter((a) => a.status === "confirmed").length, color: "#16a34a" },
                    { label: "Pending", value: pending.length, color: "#f59e0b" },
                    { label: "Cancelled", value: cancelledAll, color: "#a39bb8" },
                  ]}
                />
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_344px]">
            <Card title="My appointments" right={pending.length ? <Pill tone="amber">{pending.length} awaiting reply</Pill> : undefined}>
              {appointmentRows.length === 0 ? (
                <EmptyState
                  title="No upcoming appointments"
                  description="When you request a consultation it will show up here."
                  action={<Button onClick={() => onNavigate("Book a Consultation")} className="rounded-full bg-schedwise-purple px-4 py-2 text-sm font-semibold text-white">Book a consultation</Button>}
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  {appointmentRows.slice(0, 3).map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => onNavigate("My Appointments", { filter: "Total" })}
                        className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition hover:border-purple-400 ${
                          PENDING.includes(a.status) ? "border-amber-300 bg-amber-50" : "border-[#e4defa] bg-white"
                        }`}
                      >
                        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-schedwise-lavender-100 text-xs font-semibold text-schedwise-purple">
                          {initialsOf(facultyName(a).replace(/^(Prof\.|Dr\.)\s*/, ""))}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{facultyName(a)}</span>
                          <span className="block truncate text-[13px]">{a.topic || "Consultation"}</span>
                          <span className="block truncate text-xs text-[#5b5078]">
                            {formatDate(fromIso(a.date), { month: "short", day: "numeric" })} · {clock(a.start)}
                            {a.location ? ` · ${a.location}` : ""}
                          </span>
                        </span>
                        <StatusBadge tone={statusTone[a.status]}>{statusLabel[a.status]}</StatusBadge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {appointmentRows.length > 0 && <LinkButton onClick={() => onNavigate("My Appointments", { filter: "Total" })}>View all ({mine.length}) →</LinkButton>}
            </Card>

            <Card title="Faculty with open slots">
              {openSlots.length === 0 ? (
                <EmptyState title="No open slots right now" description="Check back soon — faculty add availability throughout the week." />
              ) : (
                <ul className="flex flex-col gap-3">
                  {openSlots.map(({ entry, date, start }) => {
                    const label = fullName(entry.first_name, entry.last_name, entry.email)
                    return (
                      <li key={entry.id} className="flex items-center gap-2.5 rounded-xl border border-[#e4defa] p-2.5">
                        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-schedwise-lavender-100 text-xs font-semibold text-schedwise-purple">
                          {initialsOf(label.replace(/^(Prof\.|Dr\.)\s*/, ""))}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">{label}</span>
                          <span className="block truncate text-xs text-[#5b5078]">{entry.department_name || "Department not set"}</span>
                          <span className="block text-xs font-semibold text-schedwise-purple">{dayLabel(date, today)} · {clock(start)}</span>
                        </span>
                        <Button
                          onClick={() => onNavigate("Book a Consultation")}
                          aria-label={`Book ${label}`}
                          className="h-8 rounded-full bg-schedwise-purple px-4 text-[13px] font-semibold text-white hover:bg-purple-800"
                        >
                          Book
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <LinkButton onClick={() => onNavigate("Book a Consultation")}>Browse all faculty →</LinkButton>
            </Card>
          </div>

          <Card title="Latest consultation summary" right={latestRecord ? <Pill>Completed</Pill> : undefined}>
            {latestRecord ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold text-[#5b5078]">
                  {latestRecord.appointment_date ? `${formatDate(fromIso(latestRecord.appointment_date), { month: "short", day: "numeric" })} · ` : ""}
                  {fullName(latestRecord.faculty_first_name, latestRecord.faculty_last_name, "Faculty")}
                  {latestRecord.topic ? ` · ${latestRecord.topic}` : ""}
                </p>
                <p className="text-sm leading-5">{latestRecord.summary}</p>
                {actionItems.length > 0 && (
                  <>
                    <p className="text-[13px] font-semibold">Action items</p>
                    <ul className="flex flex-col gap-2">
                      {actionItems.map((item) => (
                        <li key={item} className="flex items-center gap-2.5 text-sm">
                          <span className="size-[18px] shrink-0 rounded-[5px] border-2 border-purple-300 bg-white" aria-hidden />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="flex flex-wrap items-center gap-2.5">
                  {latestRecord.follow_up_date && (
                    <Pill tone="amber">Follow-up · {formatDate(fromIso(latestRecord.follow_up_date), { weekday: "short", month: "short", day: "numeric" })}</Pill>
                  )}
                  <Button onClick={() => onNavigate("My History")} className="ml-auto text-sm font-semibold text-schedwise-purple hover:underline">
                    Open full record →
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState icon={MessageSquare} title="No summaries yet" description="After a consultation, your faculty's summary and action items appear here." />
            )}
          </Card>
        </div>

        {/* ---------- Right rail ---------- */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Today's schedule" right={todays.length ? <Pill>{todays.length} session{todays.length === 1 ? "" : "s"}</Pill> : undefined}>
            {todays.length === 0 ? (
              <p className="py-2 text-sm text-[#5b5078]">No consultations today.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {todays.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-xl bg-schedwise-lavender-50 p-3">
                    <span className="h-12 w-1 shrink-0 rounded-sm bg-schedwise-purple" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-schedwise-purple">
                        {timeRange(a.start, a.end)}{a.location ? ` · ${a.location}` : ""}
                      </span>
                      <span className="block truncate text-sm font-semibold">{facultyName(a)}</span>
                      <span className="block truncate text-xs text-[#5b5078]">{a.topic || "Consultation"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <LinkButton onClick={() => onNavigate("My Appointments", { filter: "Today" })}>View full schedule →</LinkButton>
          </Card>

          <Card
            title="Recent notifications"
            right={
              unread > 0 ? (
                <Button onClick={markAllRead} className="text-[13px] font-semibold text-schedwise-purple hover:underline">
                  Mark all read
                </Button>
              ) : undefined
            }
          >
            {notifications.length === 0 ? (
              <p className="py-2 text-sm text-[#5b5078]">You're all caught up.</p>
            ) : (
              <ul className="-m-2 flex flex-col gap-1">
                {notifications.slice(0, 4).map((n) => (
                  <li key={n.id} className={`flex items-center gap-2.5 rounded-xl p-2.5 ${n.read_at ? "" : "bg-schedwise-lavender-100"}`}>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-[#e4defa] bg-white text-schedwise-purple">
                      <MessageSquare size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{n.title}</span>
                      <span className="block truncate text-xs text-[#5b5078]">{n.message}</span>
                    </span>
                    <time className="shrink-0 text-xs text-[#5b5078]" dateTime={n.created_at}>
                      {formatDate(new Date(n.created_at.replace(" ", "T")), { month: "short", day: "numeric" })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
            <LinkButton onClick={() => onNavigate("Notifications")}>See all notifications →</LinkButton>
          </Card>
        </div>
      </div>

      {reschedule && (
        <StudentAppointmentDialog
          appointment={reschedule}
          mode="reschedule"
          onClose={() => setReschedule(null)}
          onUpdated={(updated) => {
            mergeAppointment(updated)
            setReschedule(null)
          }}
        />
      )}
    </div>
  )
}
