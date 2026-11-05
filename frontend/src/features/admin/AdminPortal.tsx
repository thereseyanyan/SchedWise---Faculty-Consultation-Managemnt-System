import { useContext, useEffect, useState } from "react"
import { BarChart3, CalendarDays, GraduationCap, History, House, LogOut, Settings, ShieldCheck, UserCog, UsersRound, ChevronDown } from "lucide-react"
import { appointmentApi, usersApi } from "../../api"
import { NotificationsButton } from "../../shared/NotificationsButton"
import { AppointmentListView } from "../appointments/AppointmentListView"
import { AdminAuditView } from "./AdminAuditView"
import { AdminGettingStarted } from "./AdminGettingStarted"
import { AdminReportsView } from "./AdminReportsView"
import { AdminUsersView } from "./AdminUsersView"
import { CurrentUserContext, errorMessage, fullName } from "../../shared"
import "./admin-portal.css"

export function AdminPortal({ onSignOut, onOpenAccount }: { onSignOut: () => void; onOpenAccount: () => void }) {
  const [drilldown, setDrilldown] = useState<string | null>(null)
  const currentUser = useContext(CurrentUserContext)
  const [view, setView] = useState("User Management")
  const [counts, setCounts] = useState<{ users: number; faculty: number; pendingStudents: number; appointments: number; completion: number } | null>(null)
  const name = fullName(currentUser?.first_name, currentUser?.last_name, currentUser?.email ?? "Administrator")
  const nav = [
    { label: "User Management", icon: House, badge: counts?.pendingStudents ?? 0 },
    { label: "Total Appointments", icon: CalendarDays },
    { label: "System Analytics", icon: BarChart3 },
    { label: "Audit Log", icon: History },
  ]
  useEffect(() => {
    const loadCounts = async () => {
      try {
        const [all, faculty, appointments] = await Promise.all([usersApi.list(), usersApi.list({ role_id: "faculty" }), appointmentApi.list()])
        setCounts({ users: all.length, faculty: faculty.length, pendingStudents: all.filter(u => u.role_id === "student" && u.student_approval_status === "pending").length, appointments: appointments.length, completion: appointments.length ? Math.round(100 * appointments.filter(a => a.status === "completed").length / appointments.length) : 0 })
      } catch (err) { console.error("Unable to load admin counts.", errorMessage(err, "")) }
    }
    void loadCounts(); window.addEventListener("schedwise:users-changed", loadCounts)
    return () => window.removeEventListener("schedwise:users-changed", loadCounts)
  }, [])
  const open = (label: string) => { setView(label); setDrilldown(null) }
  return <div className="sched-admin">
    <aside className="sched-admin__sidebar">
      <div className="sched-admin__brand"><div className="sched-admin__brand-name"><span><span>Sched</span><span>Wise</span></span><img src="/logoo.png" alt="SchedWise mark" className="sched-admin__brand-icon" /></div></div>
      <nav className="sched-admin__nav" aria-label="Admin navigation">
        {nav.map(({ label, icon: Icon, badge }) => <button key={label} className={view === label && !drilldown ? "is-active" : ""} onClick={() => open(label)}><Icon size={18}/><span>{label}</span>{badge ? <b>{badge}</b> : null}</button>)}
      </nav>
      <div className="sched-admin__sidebar-bottom"><div className="sched-admin__mini-profile"><span className="sched-admin__avatar">{currentUser?.avatar_path ? <img src={currentUser.avatar_path} alt="" /> : name.split(/\s+/).map(x=>x[0]).slice(0,2).join("").toUpperCase()}</span><div><strong>{name}</strong><small>{currentUser?.email ?? ""}</small></div></div>
        <button onClick={onOpenAccount}><Settings size={17}/> Account Settings</button><button onClick={onSignOut}><LogOut size={17}/> Sign Out</button>
      </div>
    </aside>
    <main className="sched-admin__main">
      <header className="sched-admin__topbar"><div><h1>Admin Dashboard</h1><p>Manage your SchedWise workspace.</p></div><div className="sched-admin__top-actions"><span className="sched-admin__date">{new Date().toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric", year:"numeric" })}<small>Local system date</small></span><div className="sched-admin__notification"><NotificationsButton /></div><button className="sched-admin__account" onClick={onOpenAccount}><span className="sched-admin__avatar">{currentUser?.avatar_path ? <img src={currentUser.avatar_path} alt="" /> : name.split(/\s+/).map(x=>x[0]).slice(0,2).join("").toUpperCase()}</span><span><strong>{name}</strong><small>Admin · {currentUser?.email ?? ""}</small></span><ChevronDown size={16}/></button></div></header>
      <section className="sched-admin__content"><div className="sched-admin__stats">{[
        { label:"Total Users", value:counts?.users, note:counts?.pendingStudents ? `${counts.pendingStudents} student applications pending` : "Registered accounts", icon:UsersRound, action:()=>{setDrilldown("Total Users")} },
        { label:"Faculty", value:counts?.faculty, note:"Faculty accounts", icon:GraduationCap, action:()=>setDrilldown("Faculty") },
        { label:"Appointments", value:counts?.appointments, note:"All appointments", icon:CalendarDays, action:()=>{setView("Total Appointments");setDrilldown(null)} },
        { label:"Completion Rate", value:counts ? `${counts.completion}%` : undefined, note:"Completed / all appointments", icon:BarChart3, action:()=>{setView("System Analytics");setDrilldown(null)} },
      ].map(({label,value,note,icon:Icon,action})=><button key={label} className="sched-admin__stat" onClick={action}><span className="sched-admin__stat-label">{label}<i><Icon size={17}/></i></span><strong>{value ?? "—"}</strong><small>{note}</small></button>)}</div>
      {counts && counts.users <= 1 && counts.appointments === 0 && <AdminGettingStarted onManageAccounts={()=>open("User Management")}/>}
      <div className="sched-admin__page">{drilldown === "Total Users" || drilldown === "Faculty" ? <AdminUsersView key={drilldown} roleFilter={drilldown === "Faculty" ? "faculty" : undefined}/> : view === "Total Appointments" ? <AppointmentListView/> : view === "User Management" ? <AdminUsersView/> : view === "Audit Log" ? <AdminAuditView/> : <AdminReportsView/>}</div>
      </section>
    </main>
  </div>
}
