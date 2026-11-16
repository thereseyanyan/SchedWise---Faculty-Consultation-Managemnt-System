import { useEffect, useState, type ReactNode } from "react"
import { ChevronDown, LogOut, Search, User } from "lucide-react"
import { BrandLogo, Button, type Icon } from "../../shared"
import { NotificationsButton } from "../../shared/NotificationsButton"

export type StudentNavItem = {
  label: string
  icon: Icon
  /** Small count pill shown on the right (e.g. pending requests). */
  badge?: number
  badgeTone?: "amber" | "red"
}

type StudentShellProps = {
  name: string
  detail: string
  initials: string
  greeting: string
  navItems: StudentNavItem[]
  active: string
  onNavigate: (view: string) => void
  onOpenAccount: () => void
  onSignOut: () => void
  onSearch: (query: string) => void
  nextConsultation?: string
  children: ReactNode
}

const badgeClass = {
  amber: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-600",
}

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

const zoneShort = (date: Date) => {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZoneName: "shortOffset" })
        .formatToParts(date)
        .find((part) => part.type === "timeZoneName")?.value ?? ""
    )
  } catch {
    return ""
  }
}

/**
 * Student layout: left sidebar + top bar + scrolling workspace.
 * Mirrors the redesigned Figma "Student" frames (sidebar nav, profile card,
 * greeting header, live date/time, search, notifications, profile chip).
 */
export function StudentShell({
  name,
  detail,
  initials,
  greeting,
  navItems,
  active,
  onNavigate,
  onOpenAccount,
  onSignOut,
  onSearch,
  nextConsultation,
  children,
}: StudentShellProps) {
  const now = useNow()
  const [query, setQuery] = useState("")
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const timeLabel = `${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · ${zoneShort(now)}`

  return (
    <div className="flex min-h-screen bg-schedwise-lavender-50 text-brand-deep-purple">
      {/* ---------- Sidebar ---------- */}
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col border-r border-[#e9e2f5] bg-white px-4 pb-5 pt-6 lg:flex">
        <div className="border-b border-schedwise-lavender-100 px-1 pb-5">
          <BrandLogo showMark className="[&_span.font-display]:text-[32px]" />
        </div>

        <nav aria-label="Student navigation" className="mt-4 flex flex-col gap-2">
          {navItems.map(({ label, icon: IconComponent, badge, badgeTone = "red" }) => {
            const isActive = active === label
            return (
              <Button
                key={label}
                onClick={() => onNavigate(label)}
                aria-current={isActive ? "page" : undefined}
                aria-label={label}
                title={badge ? `${label} (${badge})` : label}
                className={`h-11 justify-start gap-3 rounded-xl px-3 text-sm ${
                  isActive
                    ? "bg-schedwise-lavender-100 font-semibold text-schedwise-purple"
                    : "font-medium text-[#5b5078] hover:bg-schedwise-lavender-50"
                }`}
              >
                <IconComponent size={20} strokeWidth={1.8} />
                <span className="flex-1 text-left">{label}</span>
                {badge ? (
                  <span className={`min-w-[22px] rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${badgeClass[badgeTone]}`}>
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </Button>
            )
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          <div className="rounded-2xl border border-[#e4defa] bg-white p-3.5 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-schedwise-lavender-100 text-xs font-semibold text-schedwise-purple">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="truncate text-xs text-[#5b5078]">{detail}</p>
              </div>
            </div>
            {nextConsultation ? (
              <p className="mt-3 truncate rounded-lg bg-schedwise-lavender-100 px-2.5 py-1.5 text-xs font-semibold text-schedwise-purple">
                Next: {nextConsultation}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <Button onClick={onOpenAccount} className="h-11 justify-start gap-3 rounded-xl px-3 text-sm font-medium text-[#5b5078] hover:bg-schedwise-lavender-50">
              <User size={20} strokeWidth={1.8} /> Account
            </Button>
            <Button onClick={onSignOut} className="h-11 justify-start gap-3 rounded-xl px-3 text-sm font-medium text-[#5b5078] hover:bg-schedwise-lavender-50">
              <LogOut size={20} strokeWidth={1.8} /> Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* ---------- Workspace ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-schedwise-lavender-100 bg-white px-6 py-4">
          <div className="min-w-0 flex-1 basis-64">
            <h1 className="truncate text-[26px] font-semibold leading-8 tracking-tight">{greeting}</h1>
          </div>

          <div className="hidden rounded-xl bg-schedwise-lavender-50 px-3.5 py-2 xl:block">
            <p className="text-sm font-semibold leading-5">{dateLabel}</p>
            <p className="text-xs text-[#5b5078]">{timeLabel}</p>
          </div>

          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              onSearch(query.trim())
            }}
            className="flex h-11 w-64 items-center gap-2 rounded-xl border border-[#ddd6fe] bg-white px-3 focus-within:border-schedwise-purple focus-within:ring-[3px] focus-within:ring-purple-600/15"
          >
            <Search size={18} className="shrink-0 text-[#5b5078]" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search your appointments"
              placeholder="Search faculty, topics…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#8a80a8]"
            />
          </form>

          <NotificationsButton />

          <Button
            onClick={onOpenAccount}
            title="Account settings"
            className="gap-2.5 rounded-full border border-[#e4defa] bg-white py-1.5 pl-1.5 pr-3.5 hover:bg-schedwise-lavender-50"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-schedwise-lavender-100 text-xs font-semibold text-schedwise-purple">
              {initials}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-[15px] font-semibold">{name}</span>
              <span className="block text-xs text-[#5b5078]">{detail}</span>
            </span>
            <ChevronDown size={16} className="text-[#5b5078]" aria-hidden />
          </Button>
        </header>

        {/* Sidebar collapses to a scrolling tab strip on small screens. */}
        <nav aria-label="Student navigation" className="flex gap-2 overflow-x-auto border-b border-schedwise-lavender-100 bg-white px-4 py-2 lg:hidden">
          {navItems.map(({ label, icon: IconComponent }) => (
            <Button
              key={label}
              onClick={() => onNavigate(label)}
              aria-current={active === label ? "page" : undefined}
              className={`shrink-0 gap-2 rounded-xl px-3 py-2 text-sm ${
                active === label
                  ? "bg-schedwise-lavender-100 font-semibold text-schedwise-purple"
                  : "font-medium text-[#5b5078]"
              }`}
            >
              <IconComponent size={16} strokeWidth={1.8} />
              {label}
            </Button>
          ))}
        </nav>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
