import { useContext, useState } from "react"
import {
  CalendarDays,
  Check,
  Clock3,
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

export function FacultyPortal({
  onSignOut,
  onOpenAccount,
}: {
  onSignOut: () => void
  onOpenAccount: () => void
}) {
  const [drilldown, setDrilldown] = useState<string | null>(null)
  const currentUser = useContext(CurrentUserContext)
  const [view, setView] = useState("Today's Schedule")
  const [appointments] = useAppointments()
  const name = fullName(currentUser?.first_name, currentUser?.last_name, currentUser?.email ?? "Faculty")
  const facultyNumber = currentUser?.faculty_number
  const today = toIso(new Date())
  const todayCount = appointments.filter((a) => a.date === today && a.status !== "cancelled").length
  const pendingCount = appointments.filter((a) => ["pending", "reschedule_requested"].includes(a.status)).length
  const completedCount = appointments.filter((a) => a.status === "completed").length
  const nav = [
    { label: "Today's Schedule", icon: Clock3 },
    { label: "Set Availability", icon: CalendarDays },
    { label: "Student Records", icon: NotebookPen },
  ]
  return (
    <PortalShell
      role="Faculty"
      stats={[
        { label: "Today", value: String(todayCount), hint: "Consultations scheduled", icon: Clock3, onClick: () => setDrilldown("Today") },
        { label: "Pending Requests", value: String(pendingCount), hint: "Needs your review", icon: UsersRound, onClick: () => setDrilldown("Pending Requests") },
        { label: "Completed", value: String(completedCount), hint: "Consultations held", icon: Check, onClick: () => setDrilldown("Completed") },
        { label: "Total", value: String(appointments.length), hint: "All requests", icon: NotebookPen, onClick: () => setDrilldown("Total") },
      ]}
      name={name}
      detail={facultyNumber ? `Faculty ID: ${facultyNumber}` : currentUser?.email ?? ""}
      navItems={nav}
      active={view}
      onNavigate={(next) => { setView(next); setDrilldown(null) }}
      onOpenAccount={onOpenAccount}
      onSignOut={onSignOut}
    >
      {drilldown && <><AppointmentListView key={drilldown} filter={drilldown} /><Button onClick={() => { setDrilldown(null); setView("Set Availability") }} className="mt-5 text-purple-700 underline">Manage requests in calendar</Button></>}
      {!drilldown && view === "Today's Schedule" && <FacultyTodayView />}
      {!drilldown && view === "Set Availability" && <FacultyAvailabilityView />}
      {!drilldown && view === "Student Records" && <FacultyRecordsView />}
    </PortalShell>
  )
}
