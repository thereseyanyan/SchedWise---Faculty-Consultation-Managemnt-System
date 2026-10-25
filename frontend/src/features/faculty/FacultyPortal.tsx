import { useContext, useMemo, useState } from "react"
import {
  AlertCircle,
  ArrowUpRight,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  NotebookPen,
  UsersRound,
} from "lucide-react"
import { AppointmentListView } from "../appointments/AppointmentListView"
import { FacultyAvailabilityView } from "./FacultyAvailabilityView"
import { FacultyRecordsView } from "./FacultyRecordsView"
import { FacultyTodayView } from "./FacultyTodayView"
import {
  Button,
  CurrentUserContext,
  PortalShell,
  fullName,
  toIso,
  useAppointments,
} from "../../shared"

function formatTimeHM(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  const period = hours >= 12 ? "PM" : "AM"
  const displayHours = hours % 12 || 12
  return `${displayHours}:${mins.toString().padStart(2, "0")} ${period}`
}

function diffText(startMinutes: number, date: string) {
  const [y, m, d] = date.split("-").map(Number)
  const now = new Date()
  const start = new Date(y, m - 1, d, Math.floor(startMinutes / 60), startMinutes % 60)
  const diffMs = start.getTime() - now.getTime()
  if (diffMs <= 0) return "starting soon"
  const totalMin = Math.round(diffMs / 60000)
  const h = Math.floor(totalMin / 60)
  const min = totalMin % 60
  if (h > 0 && min > 0) return `starts in ${h}h ${min}m`
  if (h > 0) return `starts in ${h}h`
  return `starts in ${min}m`
}

export function FacultyPortal({
  onSignOut,
  onOpenAccount,
}: {
  onSignOut: () => void
  onOpenAccount: () => void
}) {
  const [drilldown, setDrilldown] = useState<string | null>(null)
  const currentUser = useContext(CurrentUserContext)
  const [view, setView] = useState("Dashboard")
  const [appointments] = useAppointments()
  const name = fullName(currentUser?.first_name, currentUser?.last_name, currentUser?.email ?? "Faculty")
  const facultyNumber = currentUser?.faculty_number
  const department = (currentUser as any)?.department
  const today = toIso(new Date())
  const todayCount = appointments.filter((a) => a.date === today && a.status !== "cancelled").length
  const pendingCount = appointments.filter((a) => ["pending", "reschedule_requested"].includes(a.status)).length
  const completedCount = appointments.filter((a) => a.status === "completed").length
  const detailParts = []
  if (facultyNumber) detailParts.push(`Faculty ID: ${facultyNumber}`)
  if (department) detailParts.push(department)
  const detail = detailParts.join("\n")

  const nextUp = useMemo(() => {
    const candidates = appointments
      .filter((a) => a.status === "confirmed" && a.date >= today)
      .sort((a, b) => (a.date === b.date ? a.start_minutes - b.start_minutes : a.date.localeCompare(b.date)))
    return candidates[0] ?? null
  }, [appointments, today])

  const openTodayChip = useMemo(() => {
    if (!nextUp) return null
    const remaining = appointments.filter((a) => a.date === today && a.status === "confirmed").length
    if (remaining <= 0) return null
    // Try to compute something simple from remaining count if exact slots unknown
    return `${remaining} consultation${remaining === 1 ? "" : "s"} left today`
  }, [appointments, today, nextUp])

  const nav = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Appointments", icon: CalendarClock },
    { label: "Calendar & Availability", icon: CalendarDays },
    { label: "Consultation Records", icon: NotebookPen },
    { label: "Notifications", icon: Bell },
  ]

  const banner = (
    <div className="flex flex-col gap-3 rounded-[16px] border border-border bg-soft p-5 md:flex-row md:items-center md:justify-between">
      {nextUp ? (
        <>
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex size-12 items-center justify-center rounded-[12px] bg-primary text-white">
              <ArrowUpRight size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">
                NEXT UP · {formatTimeHM(nextUp.start_minutes)}
              </p>
              <p className="mt-1 truncate font-[var(--font-display)] text-[22px] leading-[28px] font-bold text-ink">
                Consultation with{" "}
                {fullName(nextUp.student_first_name, nextUp.student_last_name, nextUp.student_id)}
                {nextUp.location ? ` · Room ${nextUp.location}` : ""}
              </p>
              <p className="mt-1 truncate text-sm text-muted">
                {nextUp.topic ? `${nextUp.topic} · ` : ""}
                {diffText(nextUp.start_minutes, nextUp.date)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 whitespace-nowrap md:shrink-0">
            {openTodayChip ? (
              <span className="inline-flex h-10 items-center rounded-full border border-primary/20 bg-white px-4 text-sm font-semibold text-primary">
                {openTodayChip}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setDrilldown("Today")}
              className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-white transition hover:opacity-90"
            >
              View details
            </button>
            <button
              type="button"
              onClick={() => setView("Calendar & Availability")}
              className="inline-flex h-10 items-center rounded-full border border-primary bg-white px-4 text-sm font-semibold text-primary transition hover:bg-soft"
            >
              Today's schedule
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-[12px] bg-primary text-white">
            <ArrowUpRight size={22} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">No upcoming consultations today</p>
            <p className="mt-1 text-sm text-muted">New requests will appear here once approved.</p>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <PortalShell
      role="Faculty"
      stats={[
        { label: "Today", value: String(todayCount), hint: undefined, icon: Clock3, onClick: () => setDrilldown("Today") },
        { label: "Consultations", value: String(appointments.filter(a => a.status === 'confirmed').length), hint: undefined, icon: CalendarClock, onClick: () => setDrilldown("All") },
        { label: "Pending Requests", value: String(pendingCount), hint: pendingCount > 0 ? "Needs your review" : undefined, icon: AlertCircle, onClick: () => setDrilldown("Pending Requests") },
        { label: "Completed This Month", value: String(completedCount), hint: undefined, icon: CheckCircle2, onClick: () => setDrilldown("Completed") },
      ]}
      name={name}
      detail={detail}
      navItems={nav}
      active={view}
      banner={banner}
      onNavigate={(next) => { setView(next); setDrilldown(null) }}
      onOpenAccount={onOpenAccount}
      onSignOut={onSignOut}
    >
      {drilldown && (
        <>
          <AppointmentListView key={drilldown} filter={drilldown} />
          <Button onClick={() => { setDrilldown(null); setView("Calendar & Availability") }} className="mt-5 text-primary underline">
            Manage requests in calendar
          </Button>
        </>
      )}
      {!drilldown && (view === "Dashboard" || view === "Today's Schedule") && <FacultyTodayView />}
      {!drilldown && view === "Appointments" && <AppointmentListView filter="All" />}
      {!drilldown && (view === "Calendar & Availability" || view === "Set Availability") && <FacultyAvailabilityView />}
      {!drilldown && (view === "Consultation Records" || view === "Student Records") && <FacultyRecordsView />}
      {!drilldown && view === "Notifications" && <AppointmentListView filter="All" />}
    </PortalShell>
  )
}
