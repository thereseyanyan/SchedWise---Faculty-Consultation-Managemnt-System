import { useContext, useEffect, useMemo, useState } from "react"
import { Bell, ChevronLeft, ChevronRight, Search } from "lucide-react"
import { notificationsApi, type AppNotification, type NotificationPage } from "../../api"
import { Button, CurrentUserContext, errorMessage, fromIso, todayInTimeZone } from "../../shared"
import {
  markAllNotificationsRead,
  markNotificationRead,
  useNotifications,
} from "../../shared/notificationsStore"

const PAGE_SIZE = 25
type ReadFilter = "all" | "unread"
type SortOrder = "newest" | "oldest"

function notificationDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0] ?? ""
}

function dateHeading(date: string, timeZone?: string) {
  const today = todayInTimeZone(timeZone)
  if (date === today) return "Today"
  const yesterday = fromIso(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = [
    yesterday.getFullYear(),
    String(yesterday.getMonth() + 1).padStart(2, "0"),
    String(yesterday.getDate()).padStart(2, "0"),
  ].join("-")
  if (date === yesterdayKey) return "Yesterday"
  return fromIso(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

function typeLabel(value: string) {
  return value
    .split("_")
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "")
    .join(" ")
}

export function FacultyNotificationsView() {
  const currentUser = useContext(CurrentUserContext)
  const userId = currentUser?.id ?? ""
  const notifications = useNotifications(userId)
  const [search, setSearch] = useState("")
  const [readFilter, setReadFilter] = useState<ReadFilter>("all")
  const [typeFilter, setTypeFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [sort, setSort] = useState<SortOrder>("newest")
  const [page, setPage] = useState(1)
  const [retryKey, setRetryKey] = useState(0)
  const [result, setResult] = useState<NotificationPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError("")
    void notificationsApi.search(
      {
        page,
        per_page: PAGE_SIZE,
        search: debouncedSearch,
        type: typeFilter,
        read: readFilter,
        from: dateFrom,
        to: dateTo,
        sort,
      },
      controller.signal,
    )
      .then((response) => {
        setResult(response)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(errorMessage(cause, "Unable to load notifications."))
        setLoading(false)
      })
    return () => controller.abort()
  }, [
    userId,
    page,
    debouncedSearch,
    typeFilter,
    readFilter,
    dateFrom,
    dateTo,
    sort,
    retryKey,
    notifications.revision,
  ])

  const groupedItems = useMemo(() => {
    const groups = new Map<string, AppNotification[]>()
    result?.items.forEach((item) => {
      const date = notificationDate(item.created_at)
      const group = groups.get(date) ?? []
      group.push(item)
      groups.set(date, group)
    })
    return Array.from(groups.entries())
  }, [result])

  const filteredCount = result?.pagination.total ?? 0
  const totalCount = result?.counts.total ?? 0
  const unreadCount = notifications.unreadCount ?? result?.counts.unread ?? 0
  const totalPages = result?.pagination.total_pages ?? 1
  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo)

  const resetPage = () => setPage(1)
  const updateDateFrom = (value: string) => {
    setDateFrom(value)
    resetPage()
  }
  const updateDateTo = (value: string) => {
    setDateTo(value)
    resetPage()
  }

  return (
    <div className="min-w-0" data-testid="faculty-notifications-view">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-primary">
            Inbox
          </p>
          <h1 className="mt-2 font-[var(--font-display)] text-[28px] font-semibold leading-tight tracking-tight text-ink">
            Notifications
          </h1>
          <p className="mt-2 text-[14px] leading-6 text-muted">
            {filteredCount} matching {filteredCount === 1 ? "notification" : "notifications"} of{" "}
            {totalCount} total · {unreadCount} unread across your account
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          <Button
            disabled={unreadCount === 0 || notifications.markingAll || notifications.busyId !== ""}
            aria-busy={notifications.markingAll}
            onClick={() => void markAllNotificationsRead(userId)}
            className="h-10 rounded-[10px] bg-primary px-4 text-[14px] font-semibold text-white hover:bg-primary/90"
          >
            {notifications.markingAll ? "Marking as read…" : "Mark all as read"}
          </Button>
          <span className="text-[12px] text-muted">Applies to all notifications for your account.</span>
        </div>
      </header>

      <section
        className="mt-6 rounded-[16px] border border-border-card bg-white p-5 shadow-card"
        aria-label="Notification filters"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_190px_170px_170px]">
          <label className="min-w-0 md:col-span-2 xl:col-span-1">
            <span className="mb-2 block text-[12px] font-semibold text-muted">Search</span>
            <span className="relative block">
              <Search
                size={16}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  resetPage()
                }}
                placeholder="Search title or message"
                className="h-10 w-full rounded-[10px] border border-border-card bg-white pl-10 pr-3 text-[14px] text-ink outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
              />
            </span>
          </label>

          <label className="min-w-0">
            <span className="mb-2 block text-[12px] font-semibold text-muted">
              Notification type
            </span>
            <select
              aria-label="Notification type"
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value)
                resetPage()
              }}
              className="h-10 w-full rounded-[10px] border border-border-card bg-white px-3 text-[14px] text-ink outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
            >
              <option value="">All types</option>
              {(result?.types ?? []).map((type) => (
                <option key={type} value={type}>{typeLabel(type)}</option>
              ))}
            </select>
          </label>

          <label className="min-w-0">
            <span className="mb-2 block text-[12px] font-semibold text-muted">Sort by date</span>
            <select
              aria-label="Sort notifications"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as SortOrder)
                resetPage()
              }}
              className="h-10 w-full rounded-[10px] border border-border-card bg-white px-3 text-[14px] text-ink outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>

          <div className="min-w-0">
            <span className="mb-2 block text-[12px] font-semibold text-muted">Date range</span>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <input
                type="date"
                aria-label="From date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => updateDateFrom(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-[10px] border border-border-card bg-white px-2 text-[14px] text-ink outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
              />
              <span className="text-[12px] text-muted">to</span>
              <input
                type="date"
                aria-label="To date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => updateDateTo(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-[10px] border border-border-card bg-white px-2 text-[14px] text-ink outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4">
          <div className="inline-flex rounded-[10px] border border-border-card bg-page-bg p-1" role="group" aria-label="Notification read status">
            {(["all", "unread"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={readFilter === filter}
                onClick={() => {
                  setReadFilter(filter)
                  resetPage()
                }}
                className={`min-h-9 rounded-[8px] px-3 text-[14px] font-semibold transition ${
                  readFilter === filter ? "bg-white text-primary shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {filter === "all" ? "All" : "Unread"}{" "}
                <span className="tabular-nums">
                  {filter === "all" ? totalCount : unreadCount}
                </span>
              </button>
            ))}
          </div>
          {invalidDateRange ? (
            <p className="text-[12px] font-medium text-rose-700" role="alert">
              Start date must be on or before end date.
            </p>
          ) : null}
        </div>
      </section>

      {notifications.notice ? (
        <p className="mt-4 rounded-[10px] border border-green/20 bg-green-tint px-4 py-3 text-[14px] text-green" role="status">
          {notifications.notice}
        </p>
      ) : null}
      {notifications.actionError ? (
        <p className="mt-4 rounded-[10px] border border-amber/30 bg-amber-tint/60 px-4 py-3 text-[14px] text-amber-900" role="alert">
          {notifications.actionError}
        </p>
      ) : null}

      <section className="mt-6 overflow-hidden rounded-[16px] border border-border-card bg-white shadow-card" aria-label="Notification list">
        {loading ? (
          <div className="flex min-h-32 items-center justify-center px-5 py-8 text-[14px] text-muted" role="status">
            Loading notifications…
          </div>
        ) : error ? (
          <div className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-rose-200 bg-rose-50 px-4 py-3 text-[14px] text-rose-800" role="alert">
            <span>{error}</span>
            <Button
              onClick={() => setRetryKey((value) => value + 1)}
              className="h-9 rounded-[8px] border border-rose-300 bg-white px-3 text-[13px] font-semibold text-rose-800 hover:bg-rose-100"
            >
              Retry
            </Button>
          </div>
        ) : groupedItems.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center p-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-soft text-primary">
              <Bell size={19} aria-hidden />
            </span>
            <h2 className="mt-4 text-[15px] font-semibold text-ink">
              {totalCount === 0 ? "No notifications yet" : "No notifications match these filters"}
            </h2>
            <p className="mt-1 max-w-md text-[14px] leading-6 text-muted">
              {totalCount === 0
                ? "Appointment updates and account notices will appear here."
                : "Try changing the search, read status, type, or date range."}
            </p>
          </div>
        ) : (
          <div className="max-h-[min(70vh,760px)] overflow-y-auto">
            {groupedItems.map(([date, items]) => (
              <section key={date} aria-label={date ? dateHeading(date, currentUser?.timezone) : "Date unavailable"}>
                <h2 className="sticky top-0 z-10 border-y border-divider bg-page-bg/95 px-5 py-2 text-[13px] font-semibold text-muted backdrop-blur">
                  {date ? dateHeading(date, currentUser?.timezone) : "Date unavailable"}
                </h2>
                <ul className="divide-y divide-divider">
                  {items.map((item) => {
                    const unread = !item.read_at
                    const busy = notifications.busyId === item.id
                    return (
                      <li
                        key={item.id}
                        className={`flex min-w-0 items-start gap-3 px-5 py-4 ${
                          unread ? "bg-soft/40" : "bg-white"
                        }`}
                      >
                        <span
                          aria-label={unread ? "Unread" : "Read"}
                          className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                            unread ? "bg-primary" : "bg-border"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`break-words text-[14px] leading-5 ${unread ? "font-semibold text-ink" : "font-medium text-ink"}`}>
                            {item.title}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-6 text-muted">
                            {item.message}
                          </p>
                          <p className="mt-2 text-[12px] text-muted">
                            {typeLabel(item.type)} · {item.created_at}
                          </p>
                        </div>
                        {unread ? (
                          <Button
                            disabled={busy || notifications.busyId !== "" || notifications.markingAll}
                            aria-busy={busy}
                            onClick={() => void markNotificationRead(userId, item)}
                            className="h-9 shrink-0 whitespace-nowrap rounded-[8px] border border-primary bg-white px-3 text-[13px] font-semibold text-primary hover:bg-soft"
                          >
                            {busy ? "Saving…" : "Mark as read"}
                          </Button>
                        ) : (
                          <span className="shrink-0 rounded-full bg-page-bg px-2.5 py-1 text-[12px] font-medium text-muted">
                            Read
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        {!loading && !error && filteredCount > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider bg-page-bg/40 px-5 py-3">
            <p className="text-[12px] font-medium text-muted">
              Page {page} of {totalPages} · {filteredCount} matching
            </p>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1}
                className="h-9 gap-1 rounded-[8px] border border-border-card bg-white px-3 text-[13px] font-semibold text-ink hover:bg-soft"
              >
                <ChevronLeft size={15} /> Previous
              </Button>
              <Button
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                disabled={page >= totalPages}
                className="h-9 gap-1 rounded-[8px] border border-border-card bg-white px-3 text-[13px] font-semibold text-ink hover:bg-soft"
              >
                Next <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
