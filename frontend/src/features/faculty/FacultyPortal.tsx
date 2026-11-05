import { useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react"
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
import { FacultyAppointmentsView } from "./FacultyAppointmentsView"
import { FacultyCalendarDemoView } from "./FacultyCalendarDemoView"
import { FacultyPortalShell } from "./FacultyPortalShell"
import { FacultyRecordsView } from "./FacultyRecordsView"
import { FacultyTodayView } from "./FacultyTodayView"
import { FacultyNotificationsView } from "./FacultyNotificationsView"
import {
  calendarDemoReducer,
  createInitialCalendarDemoState,
  type CalendarDemoAction,
  type CalendarDemoState,
} from "./calendarDemoState"
import {
  loadCalendarDemoData,
  saveCalendarDemoData,
  simulateNextCalendarDemoSaveFailure,
} from "./calendarDemoService"
import { openTimeTodayLabel, startOfLocaleWeek, todayOpenTime } from "./facultyCalendar"
import {
  Button,
  CurrentUserContext,
  addDays,
  fullName,
  toIso,
  useAppointments,
} from "../../shared"
import {
  consultationApi,
  facultyAvailabilityApi,
  facultyScheduleOverridesApi,
  type FacultyAvailability,
  type ScheduleOverride,
} from "../../api"
import { useNotifications } from "../../shared/notificationsStore"

const departmentLabels: Record<string, string> = {
  ccs: "Computer Science",
  coe: "Engineering",
  cba: "Business",
  cas: "Arts & Sciences",
}

const PERSISTED_CALENDAR_ACTIONS = new Set<CalendarDemoAction["type"]>([
  "select-date",
  "select-event",
  "set-view",
  "shift-period",
  "set-filter",
  "set-accepting-requests",
  "add-events",
  "replace-events",
  "archive-event",
  "restore-event",
  "delete-event",
  "bulk-calendar-events",
  "bulk-restore-archived",
  "save-availability-rules",
  "block-whole-day",
  "accept-demo-appointment",
  "decline-demo-appointment",
  "reschedule-demo-appointment",
  "cancel-demo-appointment",
])
const DIALOG_RETRY_ACTIONS = new Set<CalendarDemoAction["type"]>([
  "add-events",
  "replace-events",
  "archive-event",
  "delete-event",
  "bulk-calendar-events",
  "save-availability-rules",
  "block-whole-day",
  "decline-demo-appointment",
  "reschedule-demo-appointment",
  "cancel-demo-appointment",
])

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
  const notifications = useNotifications(currentUser?.id ?? "")
  const [view, setView] = useState("Calendar & Availability")
  const [calendarState, dispatchCalendar] = useReducer(
    calendarDemoReducer,
    createInitialCalendarDemoState(),
  )
  const calendarStateRef = useRef(calendarState)
  const calendarStorageReadyRef = useRef(false)
  const savePendingRef = useRef(false)
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [calendarLoadAttempt, setCalendarLoadAttempt] = useState(0)
  const [calendarStorageError, setCalendarStorageError] = useState("")
  const [calendarLoadFailed, setCalendarLoadFailed] = useState(false)
  const [calendarSavePending, setCalendarSavePending] = useState<CalendarDemoAction | null>(null)
  const [calendarSaveError, setCalendarSaveError] = useState("")
  const [calendarSaving, setCalendarSaving] = useState(false)
  const [calendarSaveNotice, setCalendarSaveNotice] = useState("")
  const [recordCount, setRecordCount] = useState<number>()
  const [appointments] = useAppointments()
  const [availability, setAvailability] = useState<FacultyAvailability[]>([])
  const [overrides, setOverrides] = useState<ScheduleOverride[]>([])
  const name = fullName(currentUser?.first_name, currentUser?.last_name, currentUser?.email ?? "Faculty")
  const facultyNumber = currentUser?.faculty_number
  const department = currentUser?.program?.replace(/^BS\s+/i, "") ||
    (currentUser?.department_id ? departmentLabels[currentUser.department_id] : "")
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
  const detailParts = []
  if (facultyNumber) detailParts.push(facultyNumber)
  if (department) detailParts.push(department)
  const detail = detailParts.join("\n")

  useEffect(() => {
    let active = true
    const load = async () => {
      setCalendarLoading(true)
      try {
        const storage = typeof window === "undefined" ? null : window.localStorage
        const savedState = await loadCalendarDemoData(storage)
        if (!active) return
        calendarStateRef.current = savedState
        dispatchCalendar({ type: "replace-state", state: savedState })
        calendarStorageReadyRef.current = true
        setCalendarStorageError("")
        setCalendarLoadFailed(false)
      } catch (error) {
        if (!active) return
        calendarStorageReadyRef.current = false
        setCalendarLoadFailed(true)
        setCalendarStorageError(
          error instanceof Error ? error.message : "Unable to load saved demo calendar data.",
        )
      } finally {
        if (active) setCalendarLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [calendarLoadAttempt])

  const persistCalendarAction = useCallback(async (action: CalendarDemoAction) => {
    if (savePendingRef.current) return false
    if (!calendarStorageReadyRef.current) {
      setCalendarSavePending(action)
      setCalendarSaveError("Saved calendar data is unavailable. Retry loading before saving.")
      return false
    }
    savePendingRef.current = true
    setCalendarSaving(true)
    setCalendarSaveError("")
    setCalendarSaveNotice("")
    setCalendarSavePending(action)
    const nextState = calendarDemoReducer(calendarStateRef.current, action)
    try {
      const storage = typeof window === "undefined" ? null : window.localStorage
      await saveCalendarDemoData(storage, nextState)
      calendarStateRef.current = nextState
      dispatchCalendar({ type: "replace-state", state: nextState })
      setCalendarSavePending(null)
      setCalendarSaveNotice("Calendar changes saved in this browser.")
      return true
    } catch (error) {
      console.error("Unable to persist the local calendar demo.", error)
      setCalendarSaveError("Could not save. Try again.")
      return false
    } finally {
      savePendingRef.current = false
      setCalendarSaving(false)
    }
  }, [])

  const dispatchCalendarAction = useCallback((action: CalendarDemoAction): Promise<boolean> => {
    if (action.type === "replace-state") {
      calendarStateRef.current = action.state
      dispatchCalendar(action)
      return Promise.resolve(true)
    }
    if (PERSISTED_CALENDAR_ACTIONS.has(action.type)) {
      return persistCalendarAction(action)
    }
    const nextState = calendarDemoReducer(calendarStateRef.current, action)
    calendarStateRef.current = nextState
    dispatchCalendar({ type: "replace-state", state: nextState })
    return Promise.resolve(true)
  }, [persistCalendarAction])

  const retryCalendarSave = () => {
    if (calendarSavePending) void dispatchCalendarAction(calendarSavePending)
  }
  const dismissCalendarSaveError = () => {
    setCalendarSavePending(null)
    setCalendarSaveError("")
  }

  useEffect(() => {
    if (!facultyId) return
    let active = true
    const loadBadges = async () => {
      const [recordsResult] = await Promise.allSettled([
        consultationApi.list({ faculty_id: facultyId }),
      ])
      if (!active) return
      if (recordsResult.status === "fulfilled") {
        setRecordCount(recordsResult.value.length)
      } else {
        console.error("Unable to load consultation record count.", recordsResult.reason)
      }
    }
    void loadBadges()
    return () => {
      active = false
    }
  }, [facultyId])

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
    { label: "Appointments", icon: CalendarClock, badge: pendingCount },
    { label: "Calendar & Availability", icon: CalendarDays },
    { label: "Consultation Records", icon: NotebookPen, badge: recordCount },
    { label: "Notifications", icon: Bell, badge: notifications.unreadCount ?? undefined },
  ]

  const banner = (
    <div className="flex w-full flex-col gap-3 rounded-[16px] border border-border bg-soft p-5 md:flex-row md:items-center md:justify-between">
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
          <div className="flex items-center gap-3 whitespace-nowrap md:shrink-0">
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
      profileLocation="Room 302"
      acceptingRequests={calendarState.acceptingRequests}
      onAcceptingRequestsChange={(value) =>
        void dispatchCalendarAction({ type: "set-accepting-requests", value })
      }
      showDashboardContent={!drilldown && (view === "Dashboard" || view === "Today's Schedule")}
      pageHeader={!drilldown && view === "Appointments" ? {
        title: "Appointments",
        description: "Review, respond to, and manage your consultation requests.",
      } : undefined}
      name={name}
      detail={detail}
      navItems={nav}
      active={view}
      onNavigate={(next) => {
        setView(next === "Live Schedule" || next === "Set Availability"
          ? "Calendar & Availability"
          : next)
        setDrilldown(null)
      }}
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
      {!drilldown && (view === "Dashboard" || view === "Today's Schedule") && (
        <FacultyTodayView onViewAppointments={() => { setView("Appointments"); setDrilldown(null) }} />
      )}
      {!drilldown && view === "Appointments" && (
        <FacultyAppointmentsView
          onOpenRecords={() => setView("Consultation Records")}
        />
      )}
      {!drilldown && view === "Calendar & Availability" && (
        <div>
          {calendarStorageError ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">
              <div>
              <p>{calendarStorageError}</p>
              <p className="mt-1 text-xs">
                The demo is running with temporary in-memory data. Saved browser data was not overwritten.
              </p>
              </div>
              {calendarLoadFailed ? (
                <button type="button" onClick={() => setCalendarLoadAttempt((attempt) => attempt + 1)} className="min-h-10 rounded-full border border-amber-800 px-4 text-sm font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-amber-800">
                  Try loading again
                </button>
              ) : null}
            </div>
          ) : null}
          {calendarSaveError ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-950" role="alert">
              <div>
                <p className="font-semibold">{calendarSaveError}</p>
                <p className="mt-1 text-xs">
                  {calendarSavePending?.type === "save-availability-rules" ||
                    calendarSavePending?.type === "block-whole-day" ||
                    calendarSavePending?.type === "add-events" &&
                      calendarSavePending.events.some((event) => event.type === "open-slot")
                    ? "Your availability was not changed."
                    : "Your calendar was not changed."}
                </p>
              </div>
              {calendarSavePending && !DIALOG_RETRY_ACTIONS.has(calendarSavePending.type) ? (
                <button type="button" disabled={calendarSaving} onClick={retryCalendarSave} className="min-h-10 rounded-full border border-rose-800 px-4 text-sm font-semibold text-rose-950 hover:bg-rose-100 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-rose-800">
                  {calendarSaving ? "Saving…" : "Try again"}
                </button>
              ) : null}
            </div>
          ) : null}
          {calendarSaving ? <p className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-950" role="status" aria-live="polite">Saving calendar changes…</p> : null}
          {calendarSaveNotice ? <p className="sr-only" role="status" aria-live="polite">{calendarSaveNotice}</p> : null}
          <FacultyCalendarDemoView
            state={calendarState}
            dispatch={dispatchCalendarAction}
            loading={calendarLoading}
            loadError={calendarLoadFailed ? calendarStorageError : ""}
            onRetryLoad={() => setCalendarLoadAttempt((attempt) => attempt + 1)}
            saving={calendarSaving}
            facultyName={name}
            onSimulateSaveFailure={import.meta.env.DEV ? simulateNextCalendarDemoSaveFailure : undefined}
            onDismissFailedSave={dismissCalendarSaveError}
          />
        </div>
      )}
      {!drilldown && (view === "Consultation Records" || view === "Student Records") && (
        <FacultyRecordsView
          onNewRecord={() => {
            setDrilldown(null)
            setView("Appointments")
          }}
        />
      )}
      {!drilldown && view === "Notifications" && <FacultyNotificationsView />}
    </FacultyPortalShell>
  )
}
