import { useContext, useEffect, useMemo, useState } from "react"
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
} from "lucide-react"
import { AppointmentListView } from "../appointments/AppointmentListView"
import { FacultyAvailabilityView } from "./FacultyAvailabilityView"
import { FacultyPortalShell } from "./FacultyPortalShell"
import { FacultyRecordsView } from "./FacultyRecordsView"
import { FacultyTodayView } from "./FacultyTodayView"
import { openTimeTodayLabel, startOfLocaleWeek, todayOpenTime } from "./facultyCalendar"
import {
  Button,
  CurrentUserContext,
  addDays,
  fullName,
  toIso,
  useAppointments,
} from "../../shared"
import { facultyAvailabilityApi, facultyScheduleOverridesApi, type FacultyAvailability, type ScheduleOverride } from "../../api"

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
  const [availability, setAvailability] = useState<FacultyAvailability[]>([])
  const [overrides, setOverrides] = useState<ScheduleOverride[]>([])
  const name = fullName(currentUser?.first_name, currentUser?.last_name, currentUser?.email ?? "Faculty")
  const facultyNumber = currentUser?.faculty_number
  const department = (currentUser as any)?.department
  const now = new Date()
  const today = toIso(now)
  const weekStartDate = startOfLocaleWeek(now)
  const weekStart = toIso(weekStartDate)
  const weekEnd = toIso(addDays(weekStartDate, 6))
  const facultyId = currentUser?.id ?? ""
  const todayCount = appointments.filter((a) => a.date === today && a.status !== "cancelled").length
  const todayConfirmedCount = appointments.filter((a) => a.date === today && a.status === "confirmed").length
  const weeklyConfirmedCount = appointments.filter((a) => a.status === "confirmed" && a.date >= weekStart && a.date <= weekEnd).length
  const pendingCount = appointments.filter((a) => ["pending", "reschedule_requested"].includes(a.status)).length
  const completedCount = appointments.filter((a) => a.status === "completed").length
  const detailParts = []
  if (facultyNumber) detailParts.push(`Faculty ID: ${facultyNumber}`)
  if (department) detailParts.push(department)
  const detail = detailParts.join("\n")

  useEffect(() => {
    if (!facultyId) return
    void (async () => {
      try {
        const [avail, ov] = await Promise.all([
          facultyAvailabilityApi.list({ faculty_id: facultyId }),
          facultyScheduleOverridesApi.list({ faculty_id: facultyId }),
        ])
        setAvailability(avail)
        setOverrides(ov)
      } catch {
        setAvailability([])
        setOverrides([])
      }
    })()
  }, [facultyId])

  const nextUp = useMemo(() => {
    const candidates = appointments
      .filter((a) => a.status === "confirmed" && a.date >= today)
      .sort((a, b) => (a.date === b.date ? a.start_minutes - b.start_minutes : a.date.localeCompare(b.date)))
    return candidates[0] ?? null
  }, [appointments, today])

  const openTimeToday = useMemo(() => {
    const { minutes } = todayOpenTime(
      availability,
      overrides,
      appointments,
      today,
      new Date().getDay(),
    )
    return openTimeTodayLabel(minutes)
  }, [availability, overrides, appointments, today])

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
    <FacultyPortalShell
      role="Faculty"
      stats={[
        { label: "Today", value: String(todayCount), hint: "", icon: Clock3, onClick: () => setDrilldown("Today") } as any,
        { label: "Today's Consultations", value: String(todayConfirmedCount), hint: todayConfirmedCount > 0 ? `${todayConfirmedCount} confirmed` : "", icon: CalendarClock, onClick: () => setDrilldown("Today") } as any,
        { label: "Pending Requests", value: String(pendingCount), hint: pendingCount > 0 ? "Needs your review" : "", icon: AlertCircle, onClick: () => setDrilldown("Pending Requests") } as any,
        { label: "Consultations for this week", value: String(weeklyConfirmedCount), hint: "Scheduled this week", icon: CalendarDays } as any,
      ]}
      banner={banner}
      openTimeToday={openTimeToday || "No open time today"}
      name={name}
      detail={detail}
      navItems={nav}
      active={view}
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
    </FacultyPortalShell>
  )
}
