import { useContext, useEffect, useMemo, useState } from "react"
import { Bell, ChevronLeft, ChevronRight, Eye, Search } from "lucide-react"
import {
  ApiError,
  appointmentApi,
  notificationsApi,
  type Appointment,
  type AppNotification,
  type NotificationPage,
} from "../../api"
import {
  Button,
  CurrentUserContext,
  addDays,
  dateKeyInTimeZone,
  dateTimeInTimeZone,
  errorMessage,
  fromIso,
  mergeAppointment,
  refreshAppointments,
  relativeDateHeading,
  todayInTimeZone,
  toIso,
} from "../../shared"
import {
  markAllNotificationsRead,
  markNotificationRead,
  syncNotificationCounts,
  useNotifications,
} from "../../shared/notificationsStore"
import { confirmAction } from "../../confirmation"
import {
  REQUEST_ALREADY_HANDLED_MESSAGE,
  APPOINTMENT_UNAVAILABLE_MESSAGE,
  appointmentViewErrorMessage,
  isPendingRequestAppointment,
  isRescheduleRequestStatus,
  notificationAppointmentId,
} from "./notificationAppointmentState"
import {
  AcceptAppointmentDialog,
  DeclineAppointmentDialog,
} from "./FacultyAppointmentDialogs"

type NotificationActionTarget = {
  action: "accept" | "decline"
  notification: AppNotification
  appointment: Appointment
}

const PAGE_SIZE = 25
type ReadFilter = "all" | "unread"
type SortOrder = "newest" | "oldest"
const rangePresets = [
  { id: "all", label: "All time", days: 0 },
  { id: "today", label: "Today", days: 1 },
  { id: "last7", label: "Last 7 days", days: 7 },
  { id: "last30", label: "Last 30 days", days: 30 },
] as const
type RangePresetId = (typeof rangePresets)[number]["id"]

function notificationTimestamp(value: string, timeZone?: string) {
  const createdAt = dateTimeInTimeZone(value, timeZone)
  if (!createdAt) return "Time unavailable"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(createdAt)
}

function typeLabel(value: string) {
  return value
    .split("_")
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "")
    .join(" ")
}

export function FacultyNotificationsView({
  onViewAppointment,
}: {
  onViewAppointment?: (appointmentId: string) => void
}) {
  const currentUser = useContext(CurrentUserContext)
  const userId = currentUser?.id ?? ""
  const timeZone = currentUser?.timezone
  const notifications = useNotifications(userId)
  const [search, setSearch] = useState("")
  const [readFilter, setReadFilter] = useState<ReadFilter>("all")
  const [typeFilter, setTypeFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [rangePreset, setRangePreset] = useState<RangePresetId | "custom">("all")
  const [sort, setSort] = useState<SortOrder>("newest")
  const [page, setPage] = useState(1)
  const [retryKey, setRetryKey] = useState(0)
  const [result, setResult] = useState<NotificationPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [openingId, setOpeningId] = useState("")
  const [detailError, setDetailError] = useState<{ id: string; message: string } | null>(null)
  const [appointments, setAppointments] = useState<Map<string, Appointment>>(new Map())
  const [appointmentLoadError, setAppointmentLoadError] = useState("")
  const [appointmentRetryKey, setAppointmentRetryKey] = useState(0)
  const [actionTarget, setActionTarget] = useState<NotificationActionTarget | null>(null)
  const [approvingId, setApprovingId] = useState("")
  const [requestErrors, setRequestErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!userId) return
    let active = true
    setAppointmentLoadError("")
    void appointmentApi.list()
      .then((rows) => {
        if (!active) return
        setAppointments(new Map(rows.map((appointment) => [appointment.id, appointment])))
      })
      .catch((cause: unknown) => {
        if (!active) return
        setAppointmentLoadError(errorMessage(
          cause,
          "Unable to load request actions.",
        ))
      })
    return () => {
      active = false
    }
  }, [userId, appointmentRetryKey])

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
        if (controller.signal.aborted) return
        setResult(response)
        syncNotificationCounts(userId, response.counts)
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
      const heading = relativeDateHeading(
        dateKeyInTimeZone(item.created_at, timeZone),
        timeZone,
      )
      const group = groups.get(heading) ?? []
      group.push(item)
      groups.set(heading, group)
    })
    return Array.from(groups.entries())
  }, [result, timeZone])

  const filteredCount = result?.pagination.total ?? 0
  const totalCount = result?.counts.total ?? 0
  const unreadCount = notifications.unreadCount ?? result?.counts.unread ?? 0
  const totalPages = result?.pagination.total_pages ?? 1
  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo)
  const hasActiveFilters = Boolean(
    search || typeFilter || dateFrom || dateTo || readFilter !== "all" || sort !== "newest",
  )

  const resetPage = () => setPage(1)
  const clearFilters = () => {
    setSearch("")
    setReadFilter("all")
    setTypeFilter("")
    setDateFrom("")
    setDateTo("")
    setRangePreset("all")
    setSort("newest")
    setPage(1)
  }
  const applyRangePreset = (preset: RangePresetId) => {
    setRangePreset(preset)
    if (preset === "all") {
      setDateFrom("")
      setDateTo("")
    } else {
      const span = rangePresets.find((item) => item.id === preset)?.days ?? 1
      const today = todayInTimeZone(timeZone)
      setDateFrom(toIso(addDays(fromIso(today), -(span - 1))))
      setDateTo(today)
    }
    resetPage()
  }
  const updateDateFrom = (value: string) => {
    setDateFrom(value)
    setRangePreset("custom")
    resetPage()
  }
  const updateDateTo = (value: string) => {
    setDateTo(value)
    setRangePreset("custom")
    resetPage()
  }

  const openAppointmentDetails = async (notification: AppNotification) => {
    const appointmentId = notificationAppointmentId(notification)
    if (!appointmentId || !onViewAppointment || openingId) return

    setOpeningId(notification.id)
    setDetailError(null)
    try {
      const appointment = await appointmentApi.getById(appointmentId)
      onViewAppointment(appointment.id)
    } catch (cause) {
      const message = cause instanceof ApiError
        ? appointmentViewErrorMessage(cause.status, "Unable to open this appointment.")
        : "Unable to open this appointment."
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        forgetAppointment(appointmentId)
      }
      setDetailError({ id: notification.id, message })
    } finally {
      setOpeningId("")
    }
  }

  const rememberAppointment = (appointment: Appointment) => {
    setAppointments((current) => {
      const next = new Map(current)
      next.set(appointment.id, appointment)
      return next
    })
    mergeAppointment(appointment, userId)
  }

  const setRequestError = (notificationId: string, message: string) => {
    setRequestErrors((current) => ({ ...current, [notificationId]: message }))
  }

  const clearRequestError = (notificationId: string) => {
    setRequestErrors((current) => {
      if (!(notificationId in current)) return current
      const next = { ...current }
      delete next[notificationId]
      return next
    })
  }

  const forgetAppointment = (appointmentId: string) => {
    setAppointments((current) => {
      const next = new Map(current)
      next.delete(appointmentId)
      return next
    })
  }

  const refreshAppointment = async (appointmentId: string) => {
    const appointment = await appointmentApi.getById(appointmentId)
    rememberAppointment(appointment)
    return appointment
  }

  const checkRequestStillPending = async (notification: AppNotification) => {
    const appointmentId = notificationAppointmentId(notification)
    if (!appointmentId) {
      setRequestError(notification.id, REQUEST_ALREADY_HANDLED_MESSAGE)
      return REQUEST_ALREADY_HANDLED_MESSAGE
    }

    try {
      const appointment = await refreshAppointment(appointmentId)
      if (!isPendingRequestAppointment(appointment)) {
        setRequestError(notification.id, REQUEST_ALREADY_HANDLED_MESSAGE)
        setRetryKey((value) => value + 1)
        return REQUEST_ALREADY_HANDLED_MESSAGE
      }
      return null
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        forgetAppointment(appointmentId)
        setRequestError(
          notification.id,
          appointmentViewErrorMessage(cause.status, "This appointment is no longer available."),
        )
        setRetryKey((value) => value + 1)
      }
      return cause instanceof ApiError
        ? appointmentViewErrorMessage(cause.status, "Unable to check this request. Try again.")
        : "Unable to check this request. Try again."
    }
  }

  const approveNewTime = async (
    notification: AppNotification,
    appointment: Appointment,
  ) => {
    if (approvingId || actionTarget) return
    setApprovingId(notification.id)
    try {
      const confirmed = await confirmAction(
        "Approve this new consultation time? The student will be notified of the confirmed schedule.",
      )
      if (!confirmed) return

      clearRequestError(notification.id)
      const current = await refreshAppointment(appointment.id)
      if (!isRescheduleRequestStatus(current.status)) {
        setRequestError(notification.id, REQUEST_ALREADY_HANDLED_MESSAGE)
        setRetryKey((value) => value + 1)
        return
      }

      const updated = await appointmentApi.approve(current.id)
      handleRequestUpdated(notification, updated)
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        forgetAppointment(appointment.id)
        setRequestError(
          notification.id,
          appointmentViewErrorMessage(cause.status, "This appointment is no longer available."),
        )
        setRetryKey((value) => value + 1)
        return
      }
      if (
        cause instanceof ApiError &&
        cause.status === 400 &&
        /only pending or reschedule-requested/i.test(cause.message)
      ) {
        setRequestError(notification.id, REQUEST_ALREADY_HANDLED_MESSAGE)
        setRetryKey((value) => value + 1)
        void refreshAppointment(appointment.id).catch(() => undefined)
        return
      }
      setRequestError(
        notification.id,
        errorMessage(cause, "Unable to approve this request. Try again."),
      )
      if (cause instanceof ApiError && (cause.status === 400 || cause.status === 409)) {
        setRetryKey((value) => value + 1)
        setAppointmentRetryKey((value) => value + 1)
      }
    } finally {
      setApprovingId("")
    }
  }

  const handleRequestUpdated = (
    notification: AppNotification,
    updated: Appointment,
  ) => {
    rememberAppointment(updated)
    void refreshAppointments(userId, true)
    clearRequestError(notification.id)
    setDetailError(null)
    if (!notification.read_at) {
      void markNotificationRead(userId, notification)
    }
  }

  return (
    <div className="min-w-0" data-testid="faculty-notifications-view">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex flex-wrap rounded-[10px] border border-border-card bg-page-bg p-1"
            role="group"
            aria-label="Notification read status"
          >
            {(["all", "unread"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={readFilter === filter}
                onClick={() => {
                  setReadFilter(filter)
                  resetPage()
                }}
                className={`min-h-9 rounded-[8px] px-3 text-[14px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 ${
                  readFilter === filter ? "bg-primary text-white" : "text-muted hover:bg-soft hover:text-ink"
                }`}
              >
                {filter === "all" ? "All" : "Unread"}{" "}
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[12px] font-bold tabular-nums ${
                    readFilter === filter ? "bg-white/20 text-white" : "bg-soft text-ink"
                  }`}
                >
                  {filter === "all" ? totalCount : unreadCount}
                </span>
              </button>
            ))}
          </div>
          <div
            className="inline-flex flex-wrap rounded-[10px] border border-border-card bg-page-bg p-1"
            role="group"
            aria-label="Notification time range"
          >
            {rangePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={rangePreset === preset.id}
                onClick={() => applyRangePreset(preset.id)}
                className={`min-h-9 rounded-[8px] px-3 text-[14px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 ${
                  rangePreset === preset.id ? "bg-primary text-white" : "text-muted hover:bg-soft hover:text-ink"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
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
            {invalidDateRange ? (
              <p className="mt-1.5 text-[12px] font-medium text-rose-700" role="alert">
                Start date must be on or before end date.
              </p>
            ) : null}
          </div>
        </div>

      </section>

      {notifications.notice ? (
        <p className="mt-4 rounded-[10px] border border-green/20 bg-green-tint px-4 py-3 text-[14px] text-green" role="status">
          {notifications.notice}
        </p>
      ) : null}
      {notifications.actionError && !notifications.actionErrorId ? (
        <p className="mt-4 rounded-[10px] border border-amber/30 bg-amber-tint/60 px-4 py-3 text-[14px] text-amber-900" role="alert">
          {notifications.actionError}
        </p>
      ) : null}
      {appointmentLoadError ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-amber/30 bg-amber-tint/60 px-4 py-3 text-[14px] text-amber-900" role="alert">
          <span>{appointmentLoadError}</span>
          <Button
            onClick={() => setAppointmentRetryKey((value) => value + 1)}
            className="h-9 rounded-[8px] border border-amber-700 bg-white px-3 text-[13px] font-semibold text-amber-900 hover:bg-amber-100"
          >
            Retry
          </Button>
        </div>
      ) : null}

      <section className="mt-6 overflow-hidden rounded-[16px] border border-border-card bg-white shadow-card" aria-label="Notification list">
        {loading ? (
          <div className="flex flex-col gap-3 px-5 py-4" role="status" aria-busy="true" aria-label="Loading notifications">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="animate-pulse rounded-[12px] border border-divider px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1 size-2.5 shrink-0 rounded-full bg-soft" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3.5 w-1/3 rounded bg-soft" />
                    <div className="h-3 w-2/3 rounded bg-soft" />
                    <div className="h-3 w-1/4 rounded bg-soft" />
                  </div>
                  <div className="h-9 w-24 shrink-0 rounded-[8px] bg-soft" />
                </div>
              </div>
            ))}
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
              {totalCount === 0 ? "You’re all caught up" : "No notifications match these filters"}
            </h2>
            <p className="mt-1 max-w-md text-[14px] leading-6 text-muted">
              {totalCount === 0
                ? "Appointment updates and account notices will appear here."
                : "Try changing the search, read status, type, or date range."}
            </p>
            {totalCount > 0 && hasActiveFilters ? (
              <Button
                onClick={clearFilters}
                className="mt-4 h-9 rounded-[8px] border border-primary bg-white px-3 text-[13px] font-semibold text-primary hover:bg-soft"
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="max-h-[min(70vh,760px)] overflow-y-auto">
            {groupedItems.map(([heading, items]) => (
              <section key={heading} aria-label={heading}>
                <h2 className="sticky top-0 z-10 border-y border-divider bg-page-bg/95 px-5 py-2 text-[13px] font-semibold text-muted backdrop-blur">
                  {heading}
                </h2>
                <ul className="divide-y divide-divider">
                  {items.map((item) => {
                    const unread = !item.read_at
                    const busy = notifications.busyId === item.id
                    const appointmentId = notificationAppointmentId(item)
                    const opening = openingId === item.id
                    const itemError = detailError?.id === item.id ? detailError.message : ""
                    const requestError = requestErrors[item.id] ?? ""
                    const readError = notifications.actionErrorId === item.id
                      ? notifications.actionError
                      : ""
                    const appointmentUnavailable = itemError === APPOINTMENT_UNAVAILABLE_MESSAGE
                    const linkedAppointment = appointmentId
                      ? appointments.get(appointmentId) ?? null
                      : null
                    const requestAppointment = !appointmentUnavailable && linkedAppointment &&
                      isPendingRequestAppointment(linkedAppointment)
                      ? linkedAppointment
                      : null
                    const actionsDisabled = Boolean(actionTarget) ||
                      Boolean(openingId) ||
                      Boolean(approvingId) ||
                      notifications.busyId !== "" ||
                      notifications.markingAll
                    return (
                      <li
                        key={item.id}
                        className={`flex min-w-0 flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start ${
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
                          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                            <span>{typeLabel(item.type)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{unread ? "Unread" : "Read"}</span>
                          </p>
                          {itemError ? (
                            <p role="alert" className="mt-2 rounded-[8px] border border-amber/30 bg-amber-tint/60 px-3 py-2 text-[12px] leading-5 text-amber-900">
                              {itemError}
                            </p>
                          ) : null}
                          {requestError ? (
                            <p role="alert" className="mt-2 rounded-[8px] border border-amber/30 bg-amber-tint/60 px-3 py-2 text-[12px] leading-5 text-amber-900">
                              {requestError}
                            </p>
                          ) : null}
                          {readError ? (
                            <p role="alert" className="mt-2 rounded-[8px] border border-amber/30 bg-amber-tint/60 px-3 py-2 text-[12px] leading-5 text-amber-900">
                              {readError}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:max-w-[42%] lg:justify-end">
                          {requestAppointment ? (
                            <div className="flex items-center gap-2">
                              {isRescheduleRequestStatus(requestAppointment.status) ? (
                                <Button
                                  disabled={actionsDisabled}
                                  aria-busy={approvingId === item.id}
                                  onClick={() => void approveNewTime(item, requestAppointment)}
                                  className="h-9 whitespace-nowrap rounded-[8px] bg-primary px-3 text-[13px] font-semibold text-white hover:bg-primary/90"
                                >
                                  {approvingId === item.id ? "Approving…" : "Approve New Time"}
                                </Button>
                              ) : (
                                <Button
                                  disabled={actionsDisabled}
                                  onClick={() => setActionTarget({
                                    action: "accept",
                                    notification: item,
                                    appointment: requestAppointment,
                                  })}
                                  className="h-9 whitespace-nowrap rounded-[8px] bg-primary px-3 text-[13px] font-semibold text-white hover:bg-primary/90"
                                >
                                  Accept
                                </Button>
                              )}
                              {!isRescheduleRequestStatus(requestAppointment.status) ? (
                                <Button
                                  disabled={actionsDisabled}
                                  onClick={() => setActionTarget({
                                    action: "decline",
                                    notification: item,
                                    appointment: requestAppointment,
                                  })}
                                  className="h-9 whitespace-nowrap rounded-[8px] border border-primary bg-white px-3 text-[13px] font-semibold text-primary hover:bg-soft"
                                >
                                  Decline
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                          {unread ? (
                            <Button
                              disabled={busy || notifications.busyId !== "" || notifications.markingAll || Boolean(approvingId)}
                              aria-busy={busy}
                              onClick={() => void markNotificationRead(userId, item)}
                              className="h-9 whitespace-nowrap rounded-[8px] border border-primary bg-white px-3 text-[13px] font-semibold text-primary hover:bg-soft"
                            >
                              {busy ? "Saving…" : "Mark as read"}
                            </Button>
                          ) : (
                            <span className="rounded-full bg-page-bg px-2.5 py-1 text-[12px] font-medium text-muted">
                              Read
                            </span>
                          )}
                          {appointmentId && onViewAppointment && !appointmentUnavailable ? (
                            <Button
                              disabled={Boolean(openingId)}
                              aria-busy={opening}
                              aria-label={opening ? "Opening appointment details" : "View appointment details"}
                              onClick={() => void openAppointmentDetails(item)}
                              className="h-9 gap-1.5 whitespace-nowrap rounded-[8px] border border-border-card bg-white px-3 text-[13px] font-semibold text-ink hover:border-primary/30 hover:bg-soft"
                            >
                              <Eye size={14} />
                              {opening ? "Opening…" : "View details"}
                            </Button>
                          ) : null}
                        </div>
                        <time
                          dateTime={item.created_at}
                          className="shrink-0 text-left text-[12px] text-muted lg:min-w-[108px] lg:text-right"
                        >
                          {notificationTimestamp(item.created_at, timeZone)}
                        </time>
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

      {actionTarget?.action === "accept" ? (
        <AcceptAppointmentDialog
          appointment={actionTarget.appointment}
          onClose={() => setActionTarget(null)}
          beforeAccept={() => checkRequestStillPending(actionTarget.notification)}
          onUpdated={(updated) => {
            handleRequestUpdated(actionTarget.notification, updated)
          }}
        />
      ) : null}

      {actionTarget?.action === "decline" ? (
        <DeclineAppointmentDialog
          appointment={actionTarget.appointment}
          onClose={() => setActionTarget(null)}
          beforeSubmit={() => checkRequestStillPending(actionTarget.notification)}
          onUpdated={(updated) => {
            handleRequestUpdated(actionTarget.notification, updated)
          }}
        />
      ) : null}
    </div>
  )
}
