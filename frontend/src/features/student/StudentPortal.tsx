import { useContext, useState } from "react"
import { CalendarDays, CalendarRange, Check, Clock3, History } from "lucide-react"
import { AppointmentListView } from "../appointments/AppointmentListView"
import { StudentBookingView } from "./StudentBookingView"
import { StudentHistoryView } from "./StudentHistoryView"
import {
  CurrentUserContext,
  PortalShell,
  fullName,
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
  const [drilldown, setDrilldown] = useState<string | null>(null)
  const currentUser = useContext(CurrentUserContext)
  const [view, setView] = useState("Book Appointment")
  const [appointments] = useAppointments()
  const name = fullName(currentUser?.first_name, currentUser?.last_name, currentUser?.email ?? "Student")
  const studentNumber = currentUser?.student_number
  const now = toIso(new Date())
  const upcoming = appointments.filter((a) => a.date >= now && a.status === "confirmed").length
  const pending = appointments.filter((a) => ["pending", "reschedule_requested"].includes(a.status)).length
  const completed = appointments.filter((a) => a.status === "completed").length
  const nav = [
    { label: "Book Appointment", icon: CalendarDays },
    { label: "My Appointments", icon: CalendarRange },
    { label: "My History", icon: History },
  ]
  return (
    <PortalShell
      role="Student"
      stats={[
        { label: "Upcoming", value: String(upcoming), hint: "Confirmed appointments", icon: CalendarDays, onClick: () => setDrilldown("Upcoming") },
        { label: "Pending", value: String(pending), hint: "Awaiting faculty", icon: Clock3, onClick: () => setDrilldown("Pending") },
        { label: "Completed", value: String(completed), hint: "Consultations held", icon: History, onClick: () => setDrilldown("Completed") },
        { label: "Total", value: String(appointments.length), hint: "All requests", icon: Check, onClick: () => setDrilldown("Total") },
      ]}
      name={name}
      detail={studentNumber ? `Student ID: ${studentNumber}` : currentUser?.email ?? ""}
      navItems={nav}
      active={view}
      onNavigate={(next) => { setView(next); setDrilldown(null) }}
      onOpenAccount={onOpenAccount}
      onSignOut={onSignOut}
    >
      {drilldown ? (
        <AppointmentListView key={drilldown} filter={drilldown} />
      ) : view === "Book Appointment" ? (
        <StudentBookingView />
      ) : view === "My Appointments" ? (
        <AppointmentListView key="My Appointments" filter="Total" />
      ) : (
        <StudentHistoryView />
      )}
    </PortalShell>
  )
}
