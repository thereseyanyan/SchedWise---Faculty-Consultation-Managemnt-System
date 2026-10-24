import { GraduationCap, Presentation } from "lucide-react"
import { Check } from "lucide-react"

type RoleCardProps = {
  role: "student" | "faculty"
  selected: boolean
  onSelect: (role: "student" | "faculty") => void
}

export function RoleCard({ role, selected, onSelect }: RoleCardProps) {
  const isStudent = role === "student"
  const title = isStudent ? "STUDENT" : "FACULTY"
  const description = isStudent
    ? "Book consultations with your faculty"
    : "Manage your schedule and consultations"
  const Icon = isStudent ? GraduationCap : Presentation

  return (
    <div className="relative w-full">
      <input
        type="radio"
        name="role-selection"
        value={role}
        checked={selected}
        onChange={() => onSelect(role)}
        className="peer sr-only"
        aria-label={`I am a ${title.toLowerCase()}`}
      />
      <button
        type="button"
        data-role={role}
        onClick={() => onSelect(role)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onSelect(role)
          }
        }}
        role="radio"
        aria-checked={selected}
        className={`group relative flex h-full min-h-[280px] w-full flex-col items-center justify-center gap-4 rounded-[16px] border bg-white p-8 text-center shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-schedwise-purple focus-visible:ring-offset-2 hover:-translate-y-0.5 hover:border-schedwise-lavender-200 hover:shadow-schedwise-soft active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none ${
          selected
            ? "border-[1.5px] border-schedwise-purple shadow-schedwise"
            : "border-slate-100"
        }`}
      >
        {selected ? (
          <span
            className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full bg-schedwise-purple text-white shadow-schedwise"
            aria-hidden="true"
          >
            <Check size={16} />
          </span>
        ) : null}
        <div className="flex w-full flex-row items-center justify-center gap-2" aria-hidden="true">
          <div className="flex h-[80px] w-[80px] items-center justify-center rounded-[20px] bg-schedwise-lavender-100 text-schedwise-purple">
            <Icon size={44} strokeWidth={1.8} />
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div className="text-sm font-bold uppercase tracking-wide text-schedwise-navy">{title}</div>
          <p className="mt-2 text-sm text-schedwise-body">{description}</p>
        </div>
      </button>
    </div>
  )
}

export function FeaturePill({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[999px] bg-white px-4 py-2 text-sm font-medium text-schedwise-navy shadow-sm">{children}</div>
  )
}
