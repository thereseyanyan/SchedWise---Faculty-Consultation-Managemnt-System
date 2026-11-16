import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, KeyboardEvent, ReactNode } from "react"
import { Clock3, LogOut, Menu, Search, Settings, UserRound, X } from "lucide-react"
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
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Asia/Manila",
    }).format(new Date()),
  )
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function getDateChip() {
  const now = new Date()
  const datePart = now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  })
  const timePart = now.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  })
  return { datePart, timePart }
}

function getLastNameOrFull(name: string) {
  const trimmed = name.replace(/^(?:Dr|Prof)\.\s*/i, "").trim()
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
  profileLocation = "Room 302",
  acceptingRequests = true,
  onAcceptingRequestsChange,
  showDashboardContent = true,
  pageHeader,
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
  profileLocation?: string
  acceptingRequests?: boolean
  onAcceptingRequestsChange?: (accepting: boolean) => void
  showDashboardContent?: boolean
  pageHeader?: { title: string; description?: string }
  children: ReactNode
}) {
  const isPage = Boolean(pageHeader)
  const displayName = name.replace(/^(?:Dr|Prof)\.\s*/i, "").trim()
  const profileName = `Prof. ${displayName || name}`
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
  const lastName = getLastNameOrFull(name)
  const greetingName = lastName ? `Prof. ${lastName}` : profileName
  const [dateChip, setDateChip] = useState(getDateChip)
  const subtitle = detail && detail.trim() ? detail.trim() : null
  const [search, setSearch] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const profileButtonRef = useRef<HTMLButtonElement>(null)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)

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
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileMenuOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setDateChip(getDateChip()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!mobileNavOpen && !profileMenuOpen) return
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && profileMenuOpen) {
        setProfileMenuOpen(false)
        profileButtonRef.current?.focus()
        return
      }
      if (event.key === "Escape" && mobileNavOpen) {
        setMobileNavOpen(false)
        mobileMenuButtonRef.current?.focus()
        return
      }
      if (!mobileNavOpen || event.key !== "Tab") return
      const focusable = Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    if (mobileNavOpen) {
      sidebarRef.current?.querySelector<HTMLElement>("nav button")?.focus()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [mobileNavOpen, profileMenuOpen])

  const navigate = (view: string) => {
    onNavigate(view)
    setMobileNavOpen(false)
    mobileMenuButtonRef.current?.focus()
  }

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
      className="min-h-screen overflow-x-clip bg-page-bg text-ink"
      style={{ "--focus-ring": "var(--color-primary)" } as CSSProperties}
    >
      {mobileNavOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => {
            setMobileNavOpen(false)
            mobileMenuButtonRef.current?.focus()
          }}
          className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden"
        />
      ) : null}
      <aside
        ref={sidebarRef}
        id="faculty-navigation"
        aria-label="Faculty navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(84vw,280px)] flex-col overflow-y-auto border-r border-border bg-white transition-transform duration-200 lg:w-[248px] lg:translate-x-0 ${
          mobileNavOpen ? "visible translate-x-0" : "invisible -translate-x-full lg:visible"
        }`}
      >
        <div className="flex h-[88px] items-center px-6">
          <BrandLogo className="text-ink" showMark />
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => {
              setMobileNavOpen(false)
              mobileMenuButtonRef.current?.focus()
            }}
            className="ml-auto inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary lg:hidden"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mx-6 border-t border-border" aria-hidden="true" />
        <nav className="flex flex-1 flex-col gap-1 px-3 pt-3">
          {navItems.map(({ label, icon: IconComponent, badge }) => {
            const isActive = active === label
            return (
              <button
                key={label}
                type="button"
                onClick={() => navigate(label)}
                aria-current={isActive ? "page" : undefined}
                className={`group relative flex h-11 w-full items-center gap-3 rounded-full px-3 text-sm transition ${
                  isActive
                    ? "bg-primary text-white"
                    : "text-ink hover:bg-soft"
                } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
              >
                <IconComponent
                  size={20}
                  strokeWidth={1.9}
                  className={`shrink-0 ${isActive ? "text-white" : "text-primary/70"}`}
                />
                <span className="min-w-0 flex-1 truncate text-left leading-5">{label}</span>
                {badge !== undefined && badge !== null && badge > 0 ? (
                  <span
                    className={`ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[12px] font-semibold ${
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
        <div className="flex flex-col gap-2 px-3 pb-4 pt-5">
          <div className="flex flex-col gap-2 rounded-[16px] border border-border-card bg-white p-4 shadow-[0_1px_2px_rgba(45,27,105,0.06)]">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-soft text-xs font-semibold text-primary">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{profileName}</p>
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
                {profileLocation}
              </span>
              {openTimeToday ? (
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
                  <Clock3 size={12} aria-hidden="true" />
                  {openTimeToday}
                </p>
              ) : null}
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={acceptingRequests}
                aria-label="Accepting requests"
                title="Local only"
                onClick={() => onAcceptingRequestsChange?.(!acceptingRequests)}
                className="flex min-h-11 w-full items-center justify-between rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="text-[13px] text-ink">Accepting requests</span>
                <span className="text-xs text-muted">Local only</span>
              <span
                aria-hidden="true"
                className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
                  acceptingRequests ? "bg-primary" : "bg-slate-300"
                }`}
              >
                <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${
                  acceptingRequests ? "translate-x-4" : "translate-x-0"
                }`} />
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={onOpenAccount}
            className="flex h-11 items-center gap-3 rounded-full px-3 text-sm text-ink transition hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Settings size={20} className="text-primary/70" />
            <span className="truncate">Account</span>
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="flex h-11 items-center gap-3 rounded-full px-3 text-sm text-ink transition hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <LogOut size={20} className="text-primary/70" />
            <span className="truncate">Sign Out</span>
          </button>
        </div>
      </aside>

      <div className="min-h-screen overflow-x-clip lg:pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-divider bg-white/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
            <button
              ref={mobileMenuButtonRef}
              type="button"
              aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileNavOpen}
              aria-controls="faculty-navigation"
              onClick={() => setMobileNavOpen((open) => !open)}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border-card bg-white text-primary focus-visible:outline-2 focus-visible:outline-primary lg:hidden"
            >
              <Menu size={19} />
            </button>
            <div className="min-w-0 flex-1 sm:min-w-[160px]">
              {pageHeader ? (
                <>
                  <h1 className="font-[var(--font-display)] text-[28px] font-semibold leading-[36px] text-ink">
                    {pageHeader.title}
                  </h1>
                  {pageHeader.description ? (
                    <p className="mt-1 text-sm font-medium text-muted">{pageHeader.description}</p>
                  ) : null}
                </>
              ) : (
                <>
                  <h1 className="font-[var(--font-display)] text-[28px] font-semibold leading-[36px] text-ink">
                    {getGreeting()}, {greetingName}
                  </h1>
                  {subtitle ? <p className="mt-1 text-sm font-medium text-muted">{subtitle}</p> : null}
                </>
              )}
            </div>

            <div ref={searchRef} className="relative order-3 w-full sm:order-2 sm:w-[220px] sm:flex-none lg:w-[260px]">
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
                <span>{dateChip.datePart}</span>
                <span className="mx-1.5 text-muted" aria-hidden="true">·</span>
                <span>{dateChip.timePart}</span>
                <span className="ml-1.5 text-xs text-muted">GMT+8</span>
              </span>
              <div className="relative [&>button]:!border-border-card [&>button]:!bg-white [&>button]:!text-primary [&>button:hover]:!bg-soft [&>button:hover]:!text-primary [&>button:focus-visible]:!ring-primary/40 [&>button>svg]:!size-5">
                <NotificationsButton />
              </div>
              <div ref={profileMenuRef} className="relative">
                <button
                  ref={profileButtonRef}
                  type="button"
                  aria-label={`Open ${profileName} profile menu`}
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setProfileMenuOpen((open) => !open)}
                  className="flex max-w-[190px] items-center gap-2 rounded-full border border-border-card bg-white px-2.5 py-1.5 text-left shadow-[0_1px_2px_rgba(45,27,105,0.06)] transition hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary sm:max-w-none sm:gap-2.5 sm:px-3"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-soft text-xs font-semibold text-primary">
                    {initials}
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-sm font-semibold text-ink">{profileName}</span>
                    <span className="block truncate text-xs text-muted">{role}</span>
                  </span>
                </button>
                {profileMenuOpen ? (
                  <div
                    role="menu"
                    aria-label="Profile actions"
                    className="absolute right-0 top-[calc(100%+8px)] z-50 w-48 rounded-2xl border border-border-card bg-white p-1.5 shadow-[0_16px_40px_rgba(45,27,105,0.16)]"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setProfileMenuOpen(false)
                        onOpenAccount()
                      }}
                      className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-ink hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <UserRound size={16} className="text-primary" /> Account
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setProfileMenuOpen(false)
                        onSignOut()
                      }}
                      className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-ink hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <LogOut size={16} className="text-primary" /> Sign Out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 pb-8 pt-5 sm:px-6 sm:pt-6">
          {!isPage && showDashboardContent && banner ? <div className="mt-0">{banner}</div> : null}
          {!isPage && showDashboardContent ? <div className="mt-4 grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
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
          </div> : null}
          <div className={showDashboardContent && !isPage ? "mt-4" : isPage ? "mt-0" : "mt-2"}>{children}</div>
        </main>
      </div>
    </div>
  )
}
