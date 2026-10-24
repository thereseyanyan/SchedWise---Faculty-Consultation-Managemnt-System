import { useContext, useEffect, useState } from "react"
import {
  BarChart3,
  CalendarDays,
  GraduationCap,
  ShieldCheck,
  UserCog,
  UsersRound,
} from "lucide-react"
import { appointmentApi, usersApi } from "../../api"
import { AppointmentListView } from "../appointments/AppointmentListView"
import { AdminAuditView } from "./AdminAuditView"
import { AdminGettingStarted } from "./AdminGettingStarted"
import { AdminReportsView } from "./AdminReportsView"
import { AdminUsersView } from "./AdminUsersView"
import {
  CurrentUserContext,
  PortalShell,
  errorMessage,
  fullName,
} from "../../shared"

export function AdminPortal({
  onSignOut,
  onOpenAccount,
}: {
  onSignOut: () => void
  onOpenAccount: () => void
}) {
  const [drilldown, setDrilldown] = useState<string | null>(null)
  const currentUser = useContext(CurrentUserContext)
  const [view, setView] = useState("User Management")
  const [counts, setCounts] = useState<{
    users: number
    faculty: number
    pendingStudents: number
    appointments: number
    completion: number
  } | null>(null)
  const name = fullName(currentUser?.first_name, currentUser?.last_name, currentUser?.email ?? "Administrator")
  const nav = [
    { label: "User Management", icon: UserCog, badge: counts?.pendingStudents ?? 0 },
    { label: "System Analytics", icon: BarChart3 },
    { label: "Audit Log", icon: ShieldCheck },
  ]

  useEffect(() => {
    const loadCounts = async () => {
      try {
        const [all, faculty, appointments] = await Promise.all([
          usersApi.list(), usersApi.list({ role_id: "faculty" }), appointmentApi.list(),
        ])
        setCounts({
          users: all.length,
          faculty: faculty.length,
          pendingStudents: all.filter((user) => user.role_id === "student" && user.student_approval_status === "pending").length,
          appointments: appointments.length,
          completion: appointments.length ? Math.round(100 * appointments.filter((a) => a.status === "completed").length / appointments.length) : 0,
        })
      } catch (err) {
        console.error("Unable to load admin counts.", err)
      }
    }
    void loadCounts()
    window.addEventListener("schedwise:users-changed", loadCounts)
    return () => window.removeEventListener("schedwise:users-changed", loadCounts)
  }, [])

  return (
    <PortalShell
      role="Admin"
      stats={[
        { label: "Total Users", attention: Boolean(counts?.pendingStudents), value: counts ? String(counts.users) : "—", hint: counts?.pendingStudents ? `${counts.pendingStudents} student applications pending` : "Registered accounts", icon: UsersRound, onClick: () => setDrilldown("Total Users") },
        { label: "Faculty", value: counts ? String(counts.faculty) : "—", hint: "Faculty accounts", icon: GraduationCap, onClick: () => setDrilldown("Faculty") },
        { label: "Appointments", value: counts ? String(counts.appointments) : "—", hint: "All appointments", icon: CalendarDays, onClick: () => setDrilldown("Appointments") },
        { label: "Completion Rate", value: counts ? `${counts.completion}%` : "—", hint: "Completed / all appointments", icon: BarChart3, onClick: () => setDrilldown("Completion Rate") },
      ]}
      name={name}
      detail={currentUser?.email ?? ""}
      navItems={nav}
      active={view}
      onNavigate={(next) => { setView(next); setDrilldown(null) }}
      onOpenAccount={onOpenAccount}
      onSignOut={onSignOut}
    >
      {counts && counts.users <= 1 && counts.appointments === 0 && (
        <AdminGettingStarted
          onManageAccounts={() => { setView("User Management"); setDrilldown(null) }}
        />
      )}
      {drilldown === "Total Users" || drilldown === "Faculty" ? <AdminUsersView key={drilldown} roleFilter={drilldown === "Faculty" ? "faculty" : undefined} />
        : drilldown === "Appointments" ? <AppointmentListView />
        : drilldown === "Completion Rate" ? <AdminReportsView />
        : view === "User Management" ? <AdminUsersView />
        : view === "Audit Log" ? <AdminAuditView /> : <AdminReportsView />}
    </PortalShell>
  )
}
