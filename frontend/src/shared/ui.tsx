import type { ButtonHTMLAttributes, ReactNode } from "react"
import { LogOut, Search, Settings } from "lucide-react"
import { NotificationsButton } from "./NotificationsButton"
import type { Icon, Role, Stat } from "./types"
import { BrandLogo } from "./BrandLogo"

export const ButtonTag = "button"
export const InputTag = "input"
export const SelectTag = "select"
export const TextareaTag = "textarea"

export function Button({
  children,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <ButtonTag
      type={type}
      className={`inline-flex cursor-pointer items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </ButtonTag>
  )
}

export function FieldError({ message, id }: { message?: string; id?: string }) {
  return message ? <p id={id} role="alert" className="mt-1.5 text-xs font-medium text-rose-700">{message}</p> : null
}

export function Avatar({
  initials,
  dark = false,
}: {
  initials: string
  dark?: boolean
}) {
  return (
    <div
      className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${
        dark ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
      }`}
    >
      {initials}
    </div>
  )
}

export function WaveHeader({ className = "h-64" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 top-0 overflow-hidden ${className}`}
    >
      <svg
        viewBox="0 0 1440 320"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id="wave-royal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7e22ce" />
            <stop offset="1" stopColor="#9333ea" />
          </linearGradient>
        </defs>
        <path
          fill="#d8b4fe"
          fillOpacity="0.5"
          d="M0,0H1440V262C1290,312 1110,196 930,236C750,276 590,330 410,292C250,258 115,214 0,250Z"
        />
        <path
          fill="#c084fc"
          fillOpacity="0.75"
          d="M0,0H1440V212C1280,262 1095,160 900,198C715,234 555,286 375,256C225,230 105,182 0,212Z"
        />
        <path
          fill="url(#wave-royal)"
          d="M0,0H1440V158C1270,208 1080,116 880,156C700,192 540,236 360,210C210,188 100,146 0,166Z"
        />
      </svg>
    </div>
  )
}

export function GroundWave() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 220"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-44 w-full"
    >
      <path
        fill="#d8b4fe"
        fillOpacity="0.55"
        d="M0,90C220,30 420,150 700,110C980,70 1180,10 1440,60V220H0Z"
      />
      <path
        fill="#9333ea"
        d="M0,140C260,90 470,190 760,150C1040,112 1220,80 1440,118V220H0Z"
      />
    </svg>
  )
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger"
  children: ReactNode
}) {
  const tones = {
    success: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
    warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
    danger: "bg-rose-50 text-rose-700 ring-rose-600/15",
  }
  const dots = {
    success: "bg-emerald-600/70",
    warning: "bg-amber-600/70",
    danger: "bg-rose-600/70",
  }
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-xl px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      <span className={`size-1.5 rounded-full ${dots[tone]}`} />
      {children}
    </span>
  )
}

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

export function PortalShell({
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
    <div className="min-h-screen bg-page-bg text-ink">
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
          <div className="flex items-center gap-3 rounded-[16px] border border-border-card bg-white p-4 shadow-[0_1px_2px_rgba(45,27,105,0.06)]">
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
            {stats.map(({ label, value, hint, icon: IconComponent, onClick, attention }) => (
              <button
                type="button"
                onClick={onClick}
                key={label}
                className={`cursor-pointer rounded-[16px] border p-4 text-left shadow-[0_1px_2px_rgba(45,27,105,0.06)] transition focus-visible:outline-2 focus-visible:outline-primary ${
                  attention ? "border-amber bg-amber-tint/60" : "border-border-card bg-card"
                } hover:border-primary`}
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
            ))}
          </div>
          <div className="mt-6">{children}</div>
        </main>
      </div>
    </div>
  )
}

export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>
      {action}
    </div>
  )
}

export function EmptyState({
  icon: IconComponent = Search,
  title,
  description,
  action,
  className = "",
}: {
  icon?: Icon
  title: string
  description: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center ${className}`}>
      <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-white text-slate-400 ring-1 ring-slate-200">
        <IconComponent size={19} />
      </span>
      <p className="mt-4 text-sm font-semibold text-slate-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={`flex rounded-xl bg-slate-100 p-0.5 ${className}`}>
      {options.map((option) => (
        <ButtonTag
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 cursor-pointer rounded-[5px] px-3 py-2 text-center text-xs font-medium leading-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 ${
            value === option.value
              ? "bg-white text-purple-700 shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          {option.label}
        </ButtonTag>
      ))}
    </div>
  )
}

export const pillButton =
  "gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold transition"
export const readOnlyPill =
  "w-full truncate rounded-2xl border border-purple-100 bg-slate-50/60 px-4 py-2.5 text-sm text-slate-800"
