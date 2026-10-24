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
      className={`inline-flex cursor-pointer items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
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
  children: ReactNode
}) {
  const initials = name
    .replace(/^Dr\.\s*/, "")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-white text-[#1E293B]">
      <WaveHeader className="h-56" />
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 pt-5 sm:px-8">
        <div className="flex items-center gap-3 text-white">
          <BrandLogo className="text-white" />
          <div className="hidden sm:block">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-purple-100">
              {role === "Admin" ? "Admin Control Panel" : `${role} Portal`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2.5 rounded-2xl bg-white/15 py-1.5 pl-1.5 pr-4 text-white ring-1 ring-white/25">
            <span className="flex size-8 items-center justify-center rounded-xl bg-white text-xs font-semibold text-purple-700">
              {initials}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-semibold">{name}</p>
              <p className="hidden truncate text-[11px] text-purple-100 sm:block">
                {detail}
              </p>
            </div>
          </div>
          <NotificationsButton />
          <Button
            onClick={onOpenAccount}
            title="Account settings"
            className="gap-2 rounded-[4px] border border-white/70 px-3 py-2 text-xs font-semibold text-white hover:bg-white hover:text-purple-700"
          >
            <Settings size={14} />
            <span className="hidden sm:inline">Account</span>
          </Button>
          <Button
            onClick={onSignOut}
            title="Sign out"
            className="gap-2 rounded-[4px] border border-white/70 px-3 py-2 text-xs font-semibold text-white hover:bg-white hover:text-purple-700"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-5 pb-16 pt-40 sm:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-purple-600">
              Welcome back
            </p>
            <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-[#1E293B]">
              {role} Dashboard
            </h1>
          </div>
          <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {navItems.map(({ label, icon: IconComponent, badge }) => (
              <Button
                key={label}
                onClick={() => onNavigate(label)}
                aria-label={
                  badge
                    ? `${label}, ${badge} student ${badge === 1 ? "application" : "applications"} pending`
                    : undefined
                }
                className={`shrink-0 gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium ${
                  active === label
                    ? "border-purple-600 bg-purple-600 text-white"
                    : "border-transparent text-slate-500 hover:border-purple-100 hover:bg-purple-50 hover:text-purple-700"
                }`}
              >
                <IconComponent size={16} strokeWidth={1.9} />
                {label}
                {badge ? (
                  <span
                    title={`${badge} student ${badge === 1 ? "application" : "applications"} pending`}
                    className={`ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                      active === label
                        ? "bg-white/20 text-white"
                        : "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-600/20"
                    }`}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </Button>
            ))}
          </nav>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map(({ label, value, hint, icon: IconComponent, onClick, attention }) => (
            <button type="button" onClick={onClick}
              key={label}
              className={`cursor-pointer rounded-2xl border p-5 text-left shadow-sm transition focus-visible:outline-2 focus-visible:outline-purple-600 ${
                attention
                  ? "border-amber-300 bg-amber-50/50 hover:border-amber-400 hover:bg-amber-50"
                  : "border-purple-100 bg-white hover:border-purple-400 hover:bg-purple-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <span className={`flex size-8 items-center justify-center rounded-xl ${
                  attention ? "bg-amber-100 text-amber-700" : "bg-purple-50 text-purple-600"
                }`}>
                  <IconComponent size={15} />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight">
                {value}
              </p>
              <p className={`mt-1 text-[11px] ${
                attention ? "font-semibold text-amber-700" : "text-slate-400"
              }`}>{hint}</p>
            </button>
          ))}
        </div>

        <div className="mt-10 border-t border-slate-100 pt-8">{children}</div>
      </main>
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
