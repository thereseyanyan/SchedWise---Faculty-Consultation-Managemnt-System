import { CalendarDays, GraduationCap, UsersRound } from "lucide-react"
import { Button } from "../../shared"

export function AdminGettingStarted({ onManageAccounts }: { onManageAccounts: () => void }) {
  const steps = [
    { icon: UsersRound, title: "Add accounts", text: "Create faculty accounts and share student registration. Review student applications here." },
    { icon: GraduationCap, title: "Set availability", text: "Faculty add recurring consultation hours and date-specific overrides." },
    { icon: CalendarDays, title: "Start booking", text: "Students book available slots, then faculty review and confirm requests." },
  ]
  return (
    <div className="mb-8 rounded-2xl border border-purple-100 bg-purple-50/60 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-purple-600">First run</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Set up your consultation workspace</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            The account list is empty except for your administrator account. Add the people who will use SchedWise, then let faculty publish their availability.
          </p>
        </div>
        <Button
          onClick={onManageAccounts}
          className="rounded-[4px] bg-purple-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-purple-700"
        >
          Manage accounts
        </Button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {steps.map(({ icon: IconComponent, title, text }) => (
          <div key={title} className="rounded-xl border border-purple-100 bg-white p-4">
            <IconComponent size={16} className="text-purple-600" />
            <p className="mt-2 text-xs font-semibold text-slate-800">{title}</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">{text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
