import type { CSSProperties, ReactNode } from "react"
import { Clock3, LogOut, Settings } from "lucide-react"
import { BrandLogo } from "../../shared/BrandLogo"
import { NotificationsButton } from "../../shared/NotificationsButton"
import type { Icon, Role, Stat } from "../../shared/types"

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function getDateChip() {
  const now = new Date()
  const datePart = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
  const timePart = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  return `${datePart} · ${timePart}`
}

function getLastNameOrFull(name: string) {
  const trimmed = name.replace(/^Dr\.\s*/i, "").trim()
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return trimmed
  return parts[parts.length - 1]
}

export function FacultyPortalShell({
  role,
  name,
  detail,
  navItems,
  active,
  onNavigate,
  onOpenAccount,
  onSignOut,
  stats,
  banner,
  openTimeToday,
  children,
}: {
  role: Role
  name: string
  detail: string
  navItems: { label: string; icon: Icon; badge?: number }[]
  active: string
  onNavigate: (view: string) => void
  onOpenAccount: () => void
  onSignOut: () => void
  stats: Stat[]
  banner?: ReactNode
  openTimeToday?: string
  children: ReactNode
}) {
  const initials = name
    .replace(/^Dr\.\s*/i, "")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
  const lastName = getLastNameOrFull(name)
  const greetingName = lastName ? `Prof. ${lastName}` : name
  const dateChip = getDateChip()
  const subtitle = detail && detail.trim() ? detail.trim() : null

  return (
    <div
      className="min-h-screen bg-page-bg text-ink"
      style={{ "--focus-ring": "var(--color-primary)" } as CSSProperties}
    >
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-[248px] flex-col border-r border-border bg-white">
        <div className="flex h-[88px] items-center px-6">
          <BrandLogo className="text-ink" />
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {navItems.map(({ label, icon: IconComponent, badge }) => {
            const isActive = active === label
            return (
              <button
                key={label}
                type="button"
                onClick={() => onNavigate(label)}
                className={`group relative flex h-11 w-full items-center gap-3 rounded-full px-3 text-sm transition ${
                  isActive
                    ? "bg-primary text-white"
                    : "text-ink hover:bg-soft"
                }`}
              >
                <IconComponent
                  size={20}
                  strokeWidth={1.9}
                  className={`shrink-0 ${isActive ? "text-white" : "text-primary/70"}`}
                />
                <span className="min-w-0 flex-1 truncate text-left leading-5">{label}</span>
                {badge !== undefined && badge !== null && badge > 0 ? (
                  <span
                    className={`ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                      isActive ? "bg-white/90 text-ink" : "bg-soft text-ink"
                    }`}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2 px-3 pb-4">
          <div className="flex flex-col gap-2 rounded-[16px] border border-border-card bg-white p-4 shadow-[0_1px_2px_rgba(45,27,105,0.06)]">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-soft text-xs font-semibold text-primary">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{name}</p>
                {detail && detail.trim() ? (
                  <div className="mt-0.5 text-xs text-muted">
                    {detail
                      .split(/\n|,/)
                      .filter(Boolean)
                      .map((line, idx) => (
                        <p key={idx} className="truncate leading-4">
                          {line.trim()}
                        </p>
                      ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-soft px-2.5 py-1 text-[12px] text-muted">
                <Clock3 size={12} />
                {openTimeToday || "No open time today"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-ink">Accepting requests</span>
              <button
                type="button"
                role="switch"
                aria-checked="false"
                aria-disabled="true"
                disabled
                title="Coming soon: not yet connected to the system"
                className="relative h-6 w-10 rounded-full bg-border opacity-60"
              >
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm" />
              </button>
            </div>
            <p className="text-[12px] text-muted">Coming soon</p>
            {/* TODO(backend): wire to faculty accepting-requests setting (see README "Pending backend work") */}
          </div>
          <button
            type="button"
            onClick={onOpenAccount}
            className="flex h-11 items-center gap-3 rounded-full px-3 text-sm text-ink transition hover:bg-soft"
          >
            <Settings size={20} className="text-primary/70" />
            <span className="truncate">Account</span>
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="flex h-11 items-center gap-3 rounded-full px-3 text-sm text-ink transition hover:bg-soft"
          >
            <LogOut size={20} className="text-primary/70" />
            <span className="truncate">Sign Out</span>
          </button>
        </div>
      </aside>

      <div className="pl-[248px]">
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 border-b border-divider bg-page-bg/95 px-6 py-4 backdrop-blur">
          <div className="min-w-0">
            <h1 className="font-[var(--font-display)] text-[28px] leading-[36px] text-ink">
              {getGreeting()}, {greetingName}
            </h1>
            {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-4 pr-6">
            <span className="inline-flex items-center rounded-full bg-soft px-3 py-1.5 text-sm text-ink whitespace-nowrap">
              {dateChip}
            </span>
            <div className="relative">
              <NotificationsButton />
            </div>
            <div className="flex items-center gap-2.5 rounded-full border border-border-card bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(45,27,105,0.06)]">
              <span className="flex size-9 items-center justify-center rounded-full bg-soft text-xs font-semibold text-primary">
                {initials}
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold text-ink">{name}</p>
                <p className="truncate text-xs text-muted">{role}</p>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1120px] px-6 py-6">
          {banner ? <div className="mt-6">{banner}</div> : null}
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map(({ label, value, hint, icon: IconComponent, onClick, attention }) => {
              const interactive = typeof onClick === "function"
              if (interactive) {
                return (
                  <button
                    type="button"
                    onClick={onClick}
                    key={label}
                    className={`cursor-pointer rounded-[16px] border p-4 text-left shadow-[0_1px_2px_rgba(45,27,105,0.06)] transition ${
                      attention ? "border-amber bg-amber-tint/60" : "border-border-card bg-card"
                    } hover:border-primary focus-visible:outline-2 focus-visible:outline-primary`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 flex size-8 items-center justify-center rounded-lg ${attention ? "bg-amber-tint text-amber" : "bg-soft text-primary"}`}>
                        <IconComponent size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-muted truncate">{label}</p>
                        <p className="mt-1 font-[var(--font-display)] text-[36px] leading-[40px] font-bold text-ink">{value}</p>
                        {hint ? <p className="mt-1 text-sm text-muted truncate">{hint}</p> : null}
                      </div>
                    </div>
                  </button>
                )
              }
              return (
                <div
                  key={label}
                  className={`rounded-[16px] border p-4 text-left shadow-[0_1px_2px_rgba(45,27,105,0.06)] transition ${
                    attention ? "border-amber bg-amber-tint/60" : "border-border-card bg-card"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex size-8 items-center justify-center rounded-lg ${attention ? "bg-amber-tint text-amber" : "bg-soft text-primary"}`}>
                      <IconComponent size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-muted truncate">{label}</p>
                      <p className="mt-1 font-[var(--font-display)] text-[36px] leading-[40px] font-bold text-ink">{value}</p>
                      {hint ? <p className="mt-1 text-sm text-muted truncate">{hint}</p> : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
