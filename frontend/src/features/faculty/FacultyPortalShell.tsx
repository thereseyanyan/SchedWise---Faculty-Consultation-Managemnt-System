import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, KeyboardEvent, ReactNode } from "react"
import { Clock3, LogOut, Search, Settings, X } from "lucide-react"
import { BrandLogo } from "../../shared/BrandLogo"
import { NotificationsButton } from "../../shared/NotificationsButton"
import type { Icon, Role, Stat } from "../../shared/types"

type SearchTarget = {
  label: string
  hint: string
  icon: Icon
  keywords: string
  run: () => void
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
  const [search, setSearch] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const searchTargets = useMemo<SearchTarget[]>(() => {
    const targets: SearchTarget[] = navItems.map((item) => ({
      label: item.label,
      hint: "Faculty section",
      icon: item.icon,
      keywords: `${item.label} section navigate`,
      run: () => onNavigate(item.label),
    }))
    for (const stat of stats) {
      targets.push({
        label: stat.label,
        hint: "Dashboard shortcut",
        icon: stat.icon,
        keywords: `${stat.label} ${stat.hint} dashboard summary`,
        run: stat.onClick,
      })
    }
    targets.push(
      {
        label: "Account settings",
        hint: "Profile and security",
        icon: Settings,
        keywords: "account settings profile password security",
        run: onOpenAccount,
      },
      {
        label: "Sign out",
        hint: "End this session",
        icon: LogOut,
        keywords: "sign out logout exit",
        run: onSignOut,
      },
    )
    return targets
  }, [navItems, stats, onNavigate, onOpenAccount, onSignOut])

  const searchQuery = search.trim().toLowerCase()
  const searchResults = searchQuery
    ? searchTargets
        .filter((target) => `${target.label} ${target.hint} ${target.keywords}`.toLowerCase().includes(searchQuery))
        .slice(0, 6)
    : []

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [])

  const runSearchTarget = (target: SearchTarget) => {
    setSearch("")
    setSearchOpen(false)
    setActiveIndex(0)
    searchInputRef.current?.blur()
    target.run()
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setSearchOpen(false)
      setActiveIndex(0)
      searchInputRef.current?.blur()
      return
    }
    if (!searchOpen || searchResults.length === 0) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % searchResults.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + searchResults.length) % searchResults.length)
    } else if (event.key === "Enter") {
      event.preventDefault()
      runSearchTarget(searchResults[activeIndex] ?? searchResults[0])
    }
  }

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

      <div className="overflow-x-clip pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-divider bg-white/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-4 px-6 py-4">
            <div className="min-w-0 flex-1 sm:min-w-[160px]">
              <h1 className="font-[var(--font-display)] text-[28px] font-semibold leading-[36px] text-ink">
                {getGreeting()}, {greetingName}
              </h1>
              {subtitle ? <p className="mt-1 text-sm font-medium text-muted">{subtitle}</p> : null}
            </div>

            <div ref={searchRef} className="relative order-3 w-full sm:order-2 sm:w-[260px] sm:flex-none">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                type="text"
                role="combobox"
                aria-label="Search faculty portal"
                aria-expanded={searchOpen && searchQuery.length > 0}
                aria-controls="faculty-search-results"
                aria-autocomplete="list"
                aria-activedescendant={
                  searchOpen && searchResults[activeIndex] ? `faculty-search-option-${activeIndex}` : undefined
                }
                autoComplete="off"
                spellCheck={false}
                value={search}
                placeholder="Search anything"
                onChange={(event) => {
                  setSearch(event.target.value)
                  setActiveIndex(0)
                  setSearchOpen(true)
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={(event) => {
                  if (!searchRef.current?.contains(event.relatedTarget as Node | null)) setSearchOpen(false)
                }}
                onKeyDown={handleSearchKeyDown}
                className="h-10 w-full rounded-full border border-border-card bg-page-bg/70 pl-10 pr-9 text-sm font-medium text-ink outline-none transition placeholder:text-muted focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15"
              />
              {search ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setSearch("")
                    setActiveIndex(0)
                    setSearchOpen(false)
                    searchInputRef.current?.focus()
                  }}
                  className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted transition hover:bg-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <X size={14} />
                </button>
              ) : null}

              {searchOpen && searchQuery.length > 0 ? (
                <div
                  id="faculty-search-results"
                  role="listbox"
                  aria-label="Faculty search results"
                  className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-[14px] border border-border-card bg-white p-1.5 shadow-[0_16px_40px_rgba(45,27,105,0.16)]"
                >
                  {searchResults.length > 0 ? (
                    searchResults.map(({ label, hint, icon: ResultIcon }, index) => (
                      <button
                        key={`${label}-${index}`}
                        id={`faculty-search-option-${index}`}
                        type="button"
                        role="option"
                        aria-selected={index === activeIndex}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => runSearchTarget(searchResults[index])}
                        className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition ${
                          index === activeIndex ? "bg-soft" : "hover:bg-soft/70"
                        }`}
                      >
                        <span
                          className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                            index === activeIndex ? "bg-white text-primary" : "bg-soft text-primary"
                          }`}
                        >
                          <ResultIcon size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">{label}</span>
                          <span className="block truncate text-xs text-muted">{hint}</span>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p role="status" className="px-3 py-4 text-sm text-muted">
                      No matching section or action.
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="order-2 ml-auto flex flex-wrap items-center gap-3 sm:order-3">
              <span className="inline-flex items-center rounded-full bg-soft px-3 py-1.5 text-sm font-medium text-ink whitespace-nowrap">
                {dateChip}
              </span>
              <div className="relative [&>button]:!border-border-card [&>button]:!bg-white [&>button]:!text-primary [&>button:hover]:!bg-soft [&>button:hover]:!text-primary [&>button:focus-visible]:!ring-primary/40 [&>button>svg]:!size-5">
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
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-6 pb-6 pt-6">
          {banner ? <div className="mt-0">{banner}</div> : null}
          <div className="mt-4 grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
            {stats.map(({ label, value, hint, icon: IconComponent, onClick, attention }) => {
              const interactive = typeof onClick === "function"
              const cardBody = (
                <div className="flex h-full flex-col gap-2">
                  <span className={`flex size-8 items-center justify-center rounded-lg ${attention ? "bg-amber-tint text-amber" : "bg-soft text-primary"}`}>
                    <IconComponent size={16} />
                  </span>
                  <p className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold uppercase leading-[16px] tracking-[0.05em] text-muted" title={label}>
                    {label}
                  </p>
                  <p className="font-[var(--font-display)] text-[36px] leading-[40px] font-bold text-ink">{value}</p>
                  <p className="min-h-[20px] break-words text-sm text-muted">{hint}</p>
                </div>
              )
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
                    {cardBody}
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
                  {cardBody}
                </div>
              )
            })}
          </div>
          <div className={active === "Dashboard" || active === "Today's Schedule" ? "mt-4" : "mt-6"}>{children}</div>
        </main>
      </div>
    </div>
  )
}
