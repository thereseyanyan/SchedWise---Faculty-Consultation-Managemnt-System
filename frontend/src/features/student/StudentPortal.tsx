import { useCallback, useContext, useEffect, useState } from "react"
import {
  Bell,
  CalendarPlus,
  ClipboardList,
  History,
  LayoutDashboard,
} from "lucide-react"
import { notificationsApi } from "../../api"
import { StudentAppointmentsView } from "./StudentAppointmentsView"
import { StudentBookingView } from "./StudentBookingView"
import { StudentDashboardView, type StudentNavigate } from "./StudentDashboardView"
import { StudentHistoryView } from "./StudentHistoryView"
import { StudentNotificationsView } from "./StudentNotificationsView"
import { StudentShell, type StudentNavItem } from "./StudentShell"
import {
  CurrentUserContext,
  clock,
  fromIso,
  fullName,
  initialsOf,
  toIso,
  useAppointments,
} from "../../shared"

export function StudentPortal({
  onSignOut,
  onOpenAccount,
}: {
  onSignOut: () => void
  onOpenAccount: () => void
}) {
  const currentUser = useContext(CurrentUserContext)
  const [view, setView] = useState("Dashboard")
  const [filter, setFilter] = useState("Total")
  const [searchQuery, setSearchQuery] = useState("")
  const [unread, setUnread] = useState(0)
  const [appointments] = useAppointments(currentUser?.id ?? "")

  const name = fullName(currentUser?.first_name, currentUser?.last_name, currentUser?.email ?? "Student")
  const firstName = currentUser?.first_name || name
  const detail = currentUser?.student_number ? `${currentUser.student_number} · Student` : "Student"

  // Sidebar badge: keep the unread count fresh without a second source of truth.
  useEffect(() => {
    let live = true
    const refresh = () =>
      void notificationsApi
        .list(true)
        .then((rows) => live && setUnread(rows.length))
        .catch(() => undefined)
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener("focus", refresh)
    return () => {
      live = false
      window.clearInterval(timer)
      window.removeEventListener("focus", refresh)
    }
  }, [])

  const now = new Date()
  const today = toIso(now)
  const mine = currentUser ? appointments.filter((a) => a.student_id === currentUser.id) : appointments
  const pendingCount = mine.filter((a) => ["pending", "reschedule_requested"].includes(a.status)).length
  const next = mine
    .filter((a) => a.status === "confirmed" && a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)[0]
  const nextLabel = next
    ? `${next.date === today ? "Today" : fromIso(next.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${clock(next.start)}`
    : undefined

  const hour = now.getHours()
  const greeting = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${firstName}`

  const navItems: StudentNavItem[] = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "My Appointments", icon: ClipboardList, badge: pendingCount, badgeTone: "amber" },
    { label: "Book a Consultation", icon: CalendarPlus },
    { label: "My History", icon: History },
    { label: "Notifications", icon: Bell, badge: unread, badgeTone: "red" },
  ]

  // One navigation function shared by the sidebar, stat tiles, banner buttons and links.
  const navigate: StudentNavigate = useCallback((target, options) => {
    setView(target)
    setFilter(options?.filter ?? "Total")
    setSearchQuery("")
  }, [])

  return (
    <StudentShell
      name={name}
      detail={detail}
      initials={initialsOf(name)}
      greeting={greeting}
      navItems={navItems}
      active={view}
      onNavigate={(label) => navigate(label)}
      onOpenAccount={onOpenAccount}
      onSignOut={onSignOut}
      onSearch={(query) => {
        setSearchQuery(query)
        setFilter("Total")
        setView("My Appointments")
      }}
      nextConsultation={nextLabel}
    >
      {view === "Dashboard" && <StudentDashboardView onNavigate={navigate} />}
      {view === "My Appointments" && (
        <StudentAppointmentsView key={`${filter}:${searchQuery}`} filter={filter} initialQuery={searchQuery} onNavigate={navigate} />
      )}
      {view === "Book a Consultation" && <StudentBookingView onNavigate={navigate} />}
      {view === "My History" && <StudentHistoryView onNavigate={navigate} />}
      {view === "Notifications" && (
        <StudentNotificationsView onNavigate={navigate} onUnreadChange={setUnread} />
      )}
    </StudentShell>
  )
}
