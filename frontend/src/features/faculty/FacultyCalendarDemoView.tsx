import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react"
import { CalendarEventCreationDialog } from "./CalendarEventCreationDialog"
import { CalendarEventLifecycleDialog } from "./CalendarEventLifecycleDialog"
import { CalendarSchedulePrintDialog } from "./CalendarSchedulePrintDialog"
import { AvailabilityRulesDialog } from "./AvailabilityRulesDialog"
import { BlockWholeDayDialog, CopyCalendarDayDialog } from "./CalendarDayActionDialogs"
import {
  CALENDAR_TIME_ZONE,
  addIsoDays,
  availabilityRulesConflicts,
  calendarEventsInRange,
  calendarDemoWeekSummary,
  formatIsoDate,
  isoDateInTimeZone,
  isCalendarEventVisible,
  monthGridDates,
  startOfIsoWeek,
  calendarDaySummary,
  validateAvailabilityRules,
  archiveCalendarEvent,
  applyBulkCalendarOperation,
  applyBulkRestore,
  calendarEventToCreationDraft,
  createCalendarDemoEvents,
  deleteCalendarEvent,
  findCalendarEventConflict,
  findConsultationConflict,
  isCalendarEventBooked,
  getBulkCalendarEligibility,
  type CalendarBulkOperation,
  prepareCalendarDayCopies,
  wholeDayBlockPlan,
  prepareCalendarEventEdit,
  restoreCalendarEvent,
  validateCalendarCreationDraft,
  type CalendarDemoAction,
  type CalendarDemoDispatcher,
  type CalendarDemoEvent,
  type CalendarCreationDraft,
  type CalendarDayAction,
  type CalendarEditScope,
  type CalendarDemoState,
  type CalendarViewMode,
  type ConsultationCalendarEvent,
} from "./calendarDemoState"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const HOUR_START = 7
const HOUR_END = 17
const HOUR_HEIGHT = 64
const DAY_HOUR_HEIGHT = HOUR_HEIGHT
function timeToPosition(minutes: number, gridStartMinutes: number, pixelsPerMinute: number) {
  return (minutes - gridStartMinutes) * pixelsPerMinute
}

type SelectedDayView = "list" | "timeline"

const VIEW_LABELS: { value: CalendarViewMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
]
type Props = {
  state: CalendarDemoState
  dispatch: CalendarDemoDispatcher
  loading: boolean
  loadError?: string
  onRetryLoad: () => void
  saving: boolean
  facultyName: string
  onSimulateSaveFailure?: () => void
  onDismissFailedSave: () => void
}

function isoDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day, 12))
}

function formatDate(iso: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: "UTC",
  }).format(isoDate(iso))
}

function formatTime(minutes: number) {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  const date = new Date(Date.UTC(2026, 0, 1, hour, minute))
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date)
}

function timeRange(event: CalendarDemoEvent) {
  if (event.type === "blocked-time" && event.allDay) return "All day"
  return `${formatTime(event.startMinutes)} – ${formatTime(event.endMinutes)}`
}

function eventTone(event: CalendarDemoEvent) {
  if (event.type === "class") return "border-sky-200 bg-sky-50 text-sky-950"
  if (event.type === "consultation" && event.status === "confirmed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950"
  }
  if (event.type === "consultation" &&
    (event.status === "cancelled" || event.status === "declined")) {
    return "border-slate-200 bg-slate-100 text-slate-700"
  }
  if (event.type === "consultation") return "border-amber-200 bg-amber-50 text-amber-950"
  if (event.type === "open-slot") {
    return event.archived
      ? "border-slate-200 bg-slate-100 text-slate-600"
      : "border-violet-200 bg-violet-50 text-violet-950"
  }
  return "border-slate-300 bg-slate-100 text-slate-800"
}

function eventTypeLabel(event: CalendarDemoEvent) {
  if (event.type === "class") return event.recurrence === "weekly" ? "Weekly class" : "Class"
  if (event.type === "consultation") {
    if (event.status === "confirmed") return "Confirmed consultation"
    if (event.status === "pending") return "Pending consultation"
    return event.status === "declined" ? "Declined consultation" : "Canceled consultation"
  }
  if (event.type === "open-slot") return event.archived ? "Archived open slot" : "Open availability"
  return "Blocked time"
}

function eventStatusLabel(event: CalendarDemoEvent) {
  if (event.type === "consultation") {
    if (event.status === "confirmed") return "Confirmed"
    if (event.status === "pending") return "Pending approval"
    return event.status === "declined" ? "Declined" : "Canceled"
  }
  if (event.type === "open-slot") return event.archived ? "Archived" : "Available"
  if (event.type === "blocked-time") return "Blocked"
  return "Scheduled"
}

function eventDescription(event: CalendarDemoEvent) {
  if (event.description) return event.description
  if (event.type === "consultation") return event.topic || "Consultation"
  if (event.type === "class") return ""
  if (event.type === "open-slot") return "Bookable consultation time"
  return "Unavailable time"
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}m`
  if (hours > 0) return `${hours}h`
  return `${remainder}m`
}

function timelineLayout(events: CalendarDemoEvent[]) {
  const sorted = [...events].sort(
    (left, right) => left.startMinutes - right.startMinutes || right.endMinutes - left.endMinutes,
  )
  const layout = new Map<string, { lane: number; lanes: number }>()
  let cluster: CalendarDemoEvent[] = []
  let clusterEnd = 0
  const placeCluster = () => {
    if (!cluster.length) return
    const laneEnds: number[] = []
    const assignments = cluster.map((event) => {
      let lane = laneEnds.findIndex((end) => end <= event.startMinutes)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(event.endMinutes)
      } else {
        laneEnds[lane] = event.endMinutes
      }
      return { event, lane }
    })
    for (const { event, lane } of assignments) {
      layout.set(event.id, { lane, lanes: laneEnds.length })
    }
    cluster = []
    clusterEnd = 0
  }
  for (const event of sorted) {
    if (cluster.length && event.startMinutes >= clusterEnd) placeCluster()
    cluster.push(event)
    clusterEnd = Math.max(clusterEnd, event.endMinutes)
  }
  placeCluster()
  return layout
}

function monthLabel(iso: string, options: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }) {
  return formatDate(iso, options)
}

function monthRange(month: string) {
  const dates = monthGridDates(month)
  return { from: dates[0], to: dates[dates.length - 1] }
}

function getVisibleEvents(state: CalendarDemoState, from: string, to: string) {
  return calendarEventsInRange(state.events, from, to)
    .filter((event) => isCalendarEventVisible(event, state.filters))
}

function searchCalendarEvents(state: CalendarDemoState, query: string) {
  const anchor = state.selectedDate
  const from = addIsoDays(anchor, -366)
  const to = addIsoDays(anchor, 366)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return []
  const dateRanges = [{ from, to }]
  const dateLikeQuery = /^\d{4}-\d{2}-\d{2}$/.test(query.trim()) ||
    /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(query.trim()) ||
    /^[a-z]+\s+\d{1,2},?\s+\d{4}$/i.test(query.trim())
  if (dateLikeQuery) {
    const trimmedQuery = query.trim()
    const slashDate = trimmedQuery.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(trimmedQuery)
      ? new Date(`${trimmedQuery}T12:00:00Z`)
      : slashDate
        ? new Date(Date.UTC(Number(slashDate[3]), Number(slashDate[1]) - 1, Number(slashDate[2]), 12))
        : new Date(`${trimmedQuery} UTC`)
    if (!Number.isNaN(parsedDate.getTime())) {
      const exactDate = formatIsoDate(parsedDate)
      const expectedDate = slashDate
        ? `${slashDate[3]}-${String(Number(slashDate[1])).padStart(2, "0")}-${String(Number(slashDate[2])).padStart(2, "0")}`
        : /^\d{4}-\d{2}-\d{2}$/.test(trimmedQuery)
          ? trimmedQuery
          : exactDate
      if (exactDate === expectedDate) dateRanges.push({ from: exactDate, to: exactDate })
    }
  }
  const recurringEvents = state.events.filter((event) => event.recurrence === "weekly")
  const candidates = new Map<string, CalendarDemoEvent>()
  for (const event of state.events.filter((item) => item.recurrence !== "weekly")) {
    candidates.set(event.id, event)
  }
  for (const range of dateRanges) {
    for (const event of calendarEventsInRange(recurringEvents, range.from, range.to)) {
      candidates.set(event.id, event)
    }
  }
  return [...candidates.values()]
    .sort((left, right) =>
      left.date.localeCompare(right.date) ||
      left.startMinutes - right.startMinutes ||
      left.id.localeCompare(right.id),
    )
    .filter((event) => isCalendarEventVisible(event, state.filters))
    .filter((event) => {
      const month = Number(event.date.slice(5, 7))
      const day = Number(event.date.slice(8, 10))
      const year = Number(event.date.slice(0, 4))
      const dateValues = [
        event.date,
        `${month}/${day}/${year}`,
        `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`,
        `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
        formatDate(event.date, { month: "short", day: "numeric", year: "numeric" }),
        formatDate(event.date, { month: "long", day: "numeric", year: "numeric" }),
        formatDate(event.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
      ]
      const searchableText = [
        event.title,
        event.description,
        event.location,
        event.type === "consultation" ? event.student : "",
        event.type === "consultation" ? event.topic : "",
        ...dateValues,
      ].join(" ").toLocaleLowerCase()
      return searchableText.includes(normalizedQuery)
    })
}

function CalendarBulkActionDialog({
  operation,
  selectedEvents,
  eligibleIds,
  protectedEvents,
  onClose,
  onConfirm,
}: {
  operation: CalendarBulkOperation
  selectedEvents: CalendarDemoEvent[]
  eligibleIds: string[]
  protectedEvents: { event: CalendarDemoEvent; reason: string }[]
  onClose: () => void
  onConfirm: () => Promise<boolean>
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    dialog.showModal()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !dialog.open) return
      event.preventDefault()
      closeRef.current()
    }
    document.addEventListener("keydown", handleKeyDown, true)
    dialog.querySelector<HTMLButtonElement>("button")?.focus()
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true)
      if (dialog.open) dialog.close()
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus({ preventScroll: true })
      }
    }
  }, [])
  const selectedById = new Map(selectedEvents.map((event) => [event.id, event]))
  const eligibleEvents = eligibleIds.map((id) => selectedById.get(id)).filter(
    (event): event is CalendarDemoEvent => Boolean(event),
  )
  const title = operation === "archive" ? "Archive selected slots?" : "Delete selected events?"
  const confirm = async () => {
    if (saving) return
    setSaving(true)
    setSaveError("")
    try {
      if (!await onConfirm()) setSaveError("Could not save. Try again.")
    } finally {
      setSaving(false)
    }
  }
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="calendar-bulk-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className="m-auto w-[min(100%-2rem,440px)] max-h-[min(90dvh,720px)] overflow-hidden rounded-2xl border border-border-card bg-white p-0 text-ink shadow-2xl backdrop:bg-slate-950/40"
    >
      <div className="flex max-h-[min(90dvh,720px)] flex-col">
        <div className="overflow-y-auto p-5">
          <h2 id="calendar-bulk-dialog-title" className="text-lg font-semibold">{title}</h2>
          <p className="mt-2 text-sm text-muted">
            {eligibleEvents.length} {eligibleEvents.length === 1 ? "item is" : "items are"} eligible.
            {" "}{protectedEvents.length} {protectedEvents.length === 1 ? "item is" : "items are"} protected.
          </p>
          {protectedEvents.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-950">Protected items</p>
              <ul className="mt-2 space-y-2 text-sm text-amber-900">
                {protectedEvents.map(({ event, reason }) => (
                  <li key={event.id}><span className="font-semibold">{event.title}:</span> {reason}</li>
                ))}
              </ul>
              {eligibleEvents.length > 0 ? (
                <p className="mt-3 text-sm text-amber-950">
                  Confirm to apply this action only to the {eligibleEvents.length} eligible {eligibleEvents.length === 1 ? "item" : "items"}.
                </p>
              ) : null}
            </div>
          ) : null}
          {saveError ? (
            <p className="mt-3 text-sm text-rose-800" role="alert">
              {saveError} The selected events were not changed.
              <button type="button" disabled={saving} onClick={() => void confirm()} className="ml-2 min-h-9 rounded-full px-2 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary">
                Try again
              </button>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t border-divider p-4">
          <button type="button" disabled={saving} onClick={onClose} className="min-h-10 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">
            Cancel
          </button>
          {eligibleEvents.length > 0 ? (
            <button type="button" disabled={saving} onClick={() => void confirm()} className="min-h-10 rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              {saving ? "Saving…" : operation === "archive" ? "Archive eligible items" : "Delete eligible items"}
            </button>
          ) : null}
        </div>
      </div>
    </dialog>
  )
}

function EventButton({
  event,
  onSelect,
  compact = false,
  fill = false,
}: {
  event: CalendarDemoEvent
  onSelect: () => void
  compact?: boolean
  fill?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${event.title} · ${timeRange(event)}`}
      aria-label={`${event.title}, ${formatDate(event.date, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })}, ${timeRange(event)}`}
      className={`block w-full min-w-0 rounded-lg border text-left font-medium transition hover:brightness-[0.98] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${eventTone(event)} ${
        fill ? "h-full box-border overflow-hidden" : ""
      } ${
        compact ? "truncate px-1.5 py-1 text-xs leading-4" : "px-2 py-1.5 text-xs leading-4"
      }`}
    >
      {compact ? event.title : (
        <>
          <span className="block truncate">{event.title}</span>
          <span className="block truncate text-xs opacity-80">{timeRange(event)}</span>
          <span className="block truncate text-xs opacity-80">
            {event.location || "Location not set"} · {eventStatusLabel(event)}
          </span>
        </>
      )}
    </button>
  )
}

function FilterToggle({
  label,
  count,
  checked,
  onChange,
  swatch,
}: {
  label: string
  count: number
  checked: boolean
  onChange: () => void
  swatch: string
}) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-ink transition hover:bg-page-bg focus-within:outline-2 focus-within:outline-primary">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />
      <span className={`size-2.5 shrink-0 rounded-full ${swatch}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">{label}</span>
      <span className="text-xs tabular-nums text-muted">{count}</span>
    </label>
  )
}

function miniMonthDays(month: string) {
  return monthGridDates(month)
}

function miniMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number)
  return `${year}-${String(monthNumber).padStart(2, "0")}-01`
}

export function FacultyCalendarDemoView({
  state,
  dispatch,
  loading,
  loadError,
  onRetryLoad,
  saving,
  facultyName,
  onSimulateSaveFailure,
  onDismissFailedSave,
}: Props) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set())
  const [selectedDayView, setSelectedDayView] = useState<SelectedDayView>("list")
  const [creationDialog, setCreationDialog] = useState<{
    date: string
    type: CalendarCreationDraft["type"]
    initialDraft?: CalendarCreationDraft
    editEventId?: string
    editScope?: CalendarEditScope
  } | null>(null)
  const [lifecycleDialog, setLifecycleDialog] = useState<{
    mode:
      | "scope"
      | "archive"
      | "delete"
      | "booked"
      | "decline-consultation"
      | "confirm-decline"
      | "cancel-consultation"
      | "confirm-cancel"
      | "reschedule-consultation"
    eventId: string
    reason?: string
  } | null>(null)
  const [lifecycleAnnouncement, setLifecycleAnnouncement] = useState("")
  const [undoArchiveId, setUndoArchiveId] = useState<string | null>(null)
  const [bulkUndoArchiveIds, setBulkUndoArchiveIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeSearchIndex, setActiveSearchIndex] = useState(0)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(() => new Set())
  const [bulkDialog, setBulkDialog] = useState<CalendarBulkOperation | null>(null)
  const [rulesDialogOpen, setRulesDialogOpen] = useState(false)
  const [dayActionDialog, setDayActionDialog] = useState<"copy-day" | "block-day" | null>(null)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [failureSimulationArmed, setFailureSimulationArmed] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchResultsRef = useRef<HTMLDivElement>(null)
  const calendarViewState = state
  const selectedEvent = useMemo(() => {
    if (!state.selectedEventId) return null
    return getVisibleEvents(calendarViewState, state.selectedDate, state.selectedDate)
      .find((event) => event.id === state.selectedEventId) ?? null
  }, [calendarViewState, state.selectedDate, state.selectedEventId])
  const allSelectedDayEvents = calendarEventsInRange(calendarViewState.events, state.selectedDate, state.selectedDate)
  const selectedDayEvents = allSelectedDayEvents
    .filter((event) => isCalendarEventVisible(event, state.filters))
  const searchResults = useMemo(
    () => searchCalendarEvents(calendarViewState, searchQuery),
    [calendarViewState, searchQuery],
  )
  const groupedSearchResults = useMemo(() => {
    const groups = new Map<string, CalendarDemoEvent[]>()
    for (const event of searchResults) {
      groups.set(event.date, [...(groups.get(event.date) ?? []), event])
    }
    return [...groups.entries()]
  }, [searchResults])
  const selectedEvents = selectedDayEvents.filter((event) => selectedEventIds.has(event.id))
  const selectedEligibility = bulkDialog
    ? getBulkCalendarEligibility(state.events, bulkDialog, selectedEvents.map((event) => event.id))
    : { eligibleIds: [], protectedEvents: [] }
  useEffect(() => {
    if (selectionMode) setSelectedDayView("list")
    setSelectedEventIds((current) => new Set([...current].filter((id) =>
      selectedDayEvents.some((event) => event.id === id) &&
      !isCalendarEventBooked(state.events, id),
    )))
  }, [state.selectedDate, state.events, state.filters, selectionMode])
  useEffect(() => {
    setActiveSearchIndex(0)
  }, [searchQuery, state.events, state.filters, state.filters.showArchived])
  useEffect(() => {
    if (!searchOpen) return
    searchResultsRef.current
      ?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" })
  }, [activeSearchIndex, searchOpen, searchResults])
  const selectedDaySummary = calendarDaySummary(calendarViewState.events, state.selectedDate)
  const summary = calendarDemoWeekSummary(calendarViewState)
  const todayIso = isoDateInTimeZone(new Date(), CALENDAR_TIME_ZONE)
  const weekStart = startOfIsoWeek(state.selectedDate)
  const weekEnd = addIsoDays(weekStart, 6)
  const currentMonth = state.visibleMonth
  const countRange = state.activeView === "day"
    ? { from: state.selectedDate, to: state.selectedDate }
    : state.activeView === "week"
      ? { from: weekStart, to: weekEnd }
      : state.activeView === "year"
        ? { from: `${currentMonth.slice(0, 4)}-01-01`, to: `${currentMonth.slice(0, 4)}-12-31` }
        : monthRange(currentMonth)
  const eventsInView = calendarEventsInRange(calendarViewState.events, countRange.from, countRange.to)
  const visibleEvents = useMemo(() => {
    if (state.activeView === "day") {
      return getVisibleEvents(calendarViewState, state.selectedDate, state.selectedDate)
    }
    if (state.activeView === "week") {
      const start = startOfIsoWeek(state.selectedDate)
      return getVisibleEvents(calendarViewState, start, addIsoDays(start, 6))
    }
    const range = monthRange(currentMonth)
    return getVisibleEvents(calendarViewState, range.from, range.to)
  }, [calendarViewState, currentMonth, state.activeView, state.selectedDate])
  const mainWeekDates = Array.from({ length: 7 }, (_, index) => addIsoDays(weekStart, index))
  const monthDates = monthGridDates(currentMonth)
  const year = Number(currentMonth.slice(0, 4))

  useEffect(() => {
    if (saving && failureSimulationArmed) setFailureSimulationArmed(false)
  }, [saving, failureSimulationArmed])

  if (loading) {
    return (
      <section className="min-w-0 rounded-2xl border border-border-card bg-white p-5 shadow-card" aria-busy="true" aria-label="Loading calendar schedule">
        <p className="sr-only" role="status" aria-live="polite">Loading schedule.</p>
        <div className="animate-pulse space-y-4" aria-hidden="true">
          <div className="h-7 w-56 rounded bg-slate-100" />
          <div className="h-4 w-80 max-w-full rounded bg-slate-100" />
          <div className="grid gap-4 xl:grid-cols-[248px_minmax(0,1fr)]">
            <div className="h-64 rounded-xl bg-slate-100" />
            <div className="h-[420px] rounded-xl bg-slate-100" />
          </div>
          <div className="h-44 rounded-xl bg-slate-100" />
        </div>
      </section>
    )
  }

  const setDate = (date: string) => {
    setExpandedDays(new Set())
    dispatch({ type: "select-date", date })
  }

  const selectToday = () => setDate(todayIso)
  const shiftSelectedDay = (amount: -1 | 1) => setDate(addIsoDays(state.selectedDate, amount))
  const requestDayAction = (action: CalendarDayAction) => {
    dispatch({ type: "clear-day-action" })
    if (action === "copy-day" || action === "block-day") setDayActionDialog(action)
  }
  const openCreationDialog = (
    type: CalendarCreationDraft["type"],
    date = state.selectedDate,
  ) => {
    dispatch({ type: "clear-day-action" })
    setCreationDialog({ date, type })
  }
  const openEditDialog = (event: CalendarDemoEvent, scope: CalendarEditScope) => {
    const baseId = event.id.includes("@") ? event.id.slice(0, event.id.lastIndexOf("@")) : event.id
    const base = state.events.find((item) => item.id === baseId) ?? event
    const seriesIdentity = base.slotSeriesId ?? base.seriesId ?? base.id
    const seriesTemplates = state.events.filter((item) =>
      item.recurrence === "weekly" &&
      (item.slotSeriesId ?? item.seriesId ?? item.id) === seriesIdentity,
    )
    const allSeriesStart = seriesTemplates.reduce(
      (earliest, item) => item.date < earliest ? item.date : earliest,
      base.date,
    )
    const allSeriesEnds = seriesTemplates.map((item) => item.recurrenceEnd)
    const isUnboundedSeries = allSeriesEnds.some((end) => end === undefined)
    const allSeriesEnd = isUnboundedSeries
      ? addIsoDays(allSeriesStart, 365)
      : allSeriesEnds.reduce<string>(
        (latest, end) => end && end > latest ? end : latest,
        allSeriesStart,
      )
    const repeatEnd = scope === "all"
      ? allSeriesEnd
      : isUnboundedSeries
        ? addIsoDays(event.date, 365)
        : allSeriesEnd
    const draft = calendarEventToCreationDraft(
      event,
      scope === "all" ? allSeriesStart : event.date,
    )
    if (!draft) return
    if (scope === "this") draft.repeat = "none"
    draft.repeatUntil = repeatEnd
    setLifecycleDialog(null)
    setCreationDialog({
      date: draft.date,
      type: draft.type,
      initialDraft: draft,
      editEventId: event.id,
      editScope: scope,
    })
  }
  const startEditing = (event: CalendarDemoEvent) => {
    if (event.recurrence === "weekly") {
      setLifecycleDialog({ mode: "scope", eventId: event.id })
    } else {
      openEditDialog(event, "all")
    }
  }
  const activeBookingFor = (eventId: string) => {
    const occurrenceDate = eventId.includes("@")
      ? eventId.slice(eventId.lastIndexOf("@") + 1)
      : state.selectedDate
    const slot = calendarEventsInRange(state.events, occurrenceDate, occurrenceDate)
      .find((item) => item.id === eventId)
      ?? state.events.find((item) => item.id === eventId)
    if (!slot || slot.type !== "open-slot") return null
    return calendarEventsInRange(state.events, slot.date, slot.date).find((item) =>
      item.type === "consultation" &&
      (item.status === "pending" || item.status === "confirmed") &&
      item.startMinutes < slot.endMinutes &&
      slot.startMinutes < item.endMinutes,
    ) ?? null
  }
  const validateEditDraft = (draft: CalendarCreationDraft) => {
    if (!creationDialog?.editEventId || !creationDialog.editScope) return null
    if (isCalendarEventBooked(state.events, creationDialog.editEventId)) {
      return "This slot is booked. Cancel the appointment with a written reason before editing it."
    }
    const change = prepareCalendarEventEdit(
      state.events,
      creationDialog.editEventId,
      creationDialog.editScope,
      draft,
      "calendar-edit-validation",
    )
    if (!change) return "This event can no longer be edited."
    const remaining = state.events.filter((event) => !change.removeIds.includes(event.id))
    const validationError = validateCalendarCreationDraft(draft, remaining, state.availabilityRules)
    if (validationError) return validationError
    const conflict = findCalendarEventConflict(remaining, change.addEvents)
    return conflict ? `This time overlaps with ${conflict.title}.` : null
  }
  const requestArchive = (event: CalendarDemoEvent) => {
    if (isCalendarEventBooked(state.events, event.id)) {
      setLifecycleDialog({ mode: "booked", eventId: event.id })
    } else {
      setLifecycleDialog({ mode: "archive", eventId: event.id })
    }
  }
  const requestDelete = (event: CalendarDemoEvent) => {
    if (isCalendarEventBooked(state.events, event.id)) {
      setLifecycleDialog({ mode: "booked", eventId: event.id })
    } else {
      setLifecycleDialog({ mode: "delete", eventId: event.id })
    }
  }
  const archiveSelectedEvent = async (eventId: string): Promise<boolean> => {
    if (isCalendarEventBooked(state.events, eventId)) {
      setLifecycleDialog({ mode: "booked", eventId })
      return true
    }
    const nextEvents = archiveCalendarEvent(state.events, eventId)
    if (!nextEvents) {
      setLifecycleAnnouncement("Unable to archive this slot.")
      return false
    }
    const archived = nextEvents.find((event) =>
      event.type === "open-slot" &&
      event.archived &&
      !state.events.some((saved) => saved.id === event.id),
    )
    if (!await dispatch({ type: "archive-event", eventId })) return false
    setUndoArchiveId(archived?.id ?? eventId)
    setLifecycleDialog(null)
    setLifecycleAnnouncement("Slot archived.")
    return true
  }
  const restoreArchivedEvent = async (eventId: string) => {
    const change = restoreCalendarEvent(state.events, eventId)
    if (!change) {
      setLifecycleAnnouncement("Unable to restore this slot.")
      return
    }
    const remaining = state.events.filter((event) => !change.removeIds.includes(event.id))
    if (findCalendarEventConflict(remaining, change.addEvents)) {
      setLifecycleAnnouncement("This slot cannot be restored because it now conflicts with another event.")
      return
    }
    if (!await dispatch({ type: "restore-event", eventId })) return
    setUndoArchiveId(null)
    setLifecycleAnnouncement("Slot restored.")
  }
  const deleteSelectedEvent = async (eventId: string): Promise<boolean> => {
    if (isCalendarEventBooked(state.events, eventId)) {
      setLifecycleDialog({ mode: "booked", eventId })
      return true
    }
    const change = deleteCalendarEvent(state.events, eventId)
    if (!change) {
      setLifecycleAnnouncement("Unable to delete this event.")
      return false
    }
    if (!await dispatch({ type: "delete-event", eventId })) return false
    setLifecycleDialog(null)
    setLifecycleAnnouncement("Event permanently deleted.")
    return true
  }
  const acceptConsultation = async (event: ConsultationCalendarEvent) => {
    if (event.status !== "pending") return
    const conflict = findConsultationConflict(calendarViewState.events, event, event.id, false)
    if (conflict) {
      setLifecycleAnnouncement(`Cannot accept this request because it overlaps with ${conflict.title}.`)
      return
    }
    if (!await dispatch({ type: "accept-demo-appointment", eventId: event.id })) return
    setLifecycleAnnouncement("Consultation request accepted and confirmed in this local demo.")
  }
  const submitConsultationReason = (reason: string) => {
    if (!lifecycleDialog) return
    setLifecycleDialog({
      ...lifecycleDialog,
      mode: lifecycleDialog.mode === "decline-consultation"
        ? "confirm-decline"
        : "confirm-cancel",
      reason,
    })
  }
  const confirmConsultationResolution = async (): Promise<boolean> => {
    if (!lifecycleDialog?.reason) return false
    const target = state.events.find((event) => event.id === lifecycleDialog.eventId)
    if (target?.type !== "consultation") {
      setLifecycleAnnouncement("This consultation is no longer available.")
      setLifecycleDialog(null)
      return false
    }
    if (lifecycleDialog.mode === "confirm-decline") {
      if (target.status !== "pending") {
        setLifecycleAnnouncement("This request is no longer pending.")
      } else {
        if (!await dispatch({
          type: "decline-demo-appointment",
          eventId: target.id,
          reason: lifecycleDialog.reason,
        })) return false
        setLifecycleAnnouncement("Consultation request declined in this local demo.")
      }
    } else if (lifecycleDialog.mode === "confirm-cancel") {
      if (target.status !== "pending" && target.status !== "confirmed") {
        setLifecycleAnnouncement("This consultation is no longer active.")
      } else {
        if (!await dispatch({
          type: "cancel-demo-appointment",
          eventId: target.id,
          reason: lifecycleDialog.reason,
        })) return false
        setLifecycleAnnouncement("Consultation canceled in this local demo with the written reason saved.")
      }
    }
    setLifecycleDialog(null)
    return true
  }
  const rescheduleConsultation = async (
    event: CalendarDemoEvent,
    draft: { date: string; startMinutes: number; endMinutes: number; location: string },
  ): Promise<string | null> => {
    if (event.type !== "consultation" || event.status !== "confirmed") {
      return "Only confirmed consultations can be rescheduled."
    }
    const candidate: ConsultationCalendarEvent = {
      ...event,
      date: draft.date,
      startMinutes: draft.startMinutes,
      endMinutes: draft.endMinutes,
      location: draft.location,
    }
    const conflict = findConsultationConflict(calendarViewState.events, candidate, event.id, true)
    if (conflict) return `This time overlaps with ${conflict.title}.`
    if (!await dispatch({
      type: "reschedule-demo-appointment",
      eventId: event.id,
      ...draft,
    })) return "Could not save. Try again."
    setLifecycleAnnouncement("Consultation rescheduled in this local demo.")
    return null
  }
  const saveEditedEvent = async (draft: CalendarCreationDraft) => {
    if (!creationDialog?.editEventId || !creationDialog.editScope) return false
    const change = prepareCalendarEventEdit(
      state.events,
      creationDialog.editEventId,
      creationDialog.editScope,
      draft,
      `edit-${Date.now()}`,
    )
    if (!change) {
      setLifecycleAnnouncement("Unable to update this event.")
      return false
    }
    if (isCalendarEventBooked(state.events, creationDialog.editEventId)) {
      setCreationDialog(null)
      setLifecycleDialog({ mode: "booked", eventId: creationDialog.editEventId })
      return false
    }
    const remaining = state.events.filter((event) => !change.removeIds.includes(event.id))
    const validationError = validateCalendarCreationDraft(draft, remaining, state.availabilityRules)
    const proposedConflict = findCalendarEventConflict(remaining, change.addEvents)
    const conflict = validationError || (proposedConflict ? `This time overlaps with ${proposedConflict.title}.` : null)
    if (conflict) {
      setLifecycleAnnouncement(conflict)
      return false
    }
    if (!await dispatch({
      type: "replace-events",
      change,
      selectDate: draft.date,
    })) return false
    setLifecycleAnnouncement("Event updated.")
    return true
  }
  const saveCreatedEvents = async (draft: CalendarCreationDraft) => {
    const events = createCalendarDemoEvents(draft, `demo-series-${Date.now()}`)
    const validationError = validateCalendarCreationDraft(draft, calendarViewState.events, state.availabilityRules)
    if (validationError) {
      setLifecycleAnnouncement(validationError)
      return false
    }
    if (findCalendarEventConflict(calendarViewState.events, events)) {
      setLifecycleAnnouncement("Unable to save because this time now conflicts with another event.")
      return false
    }
    if (!await dispatch({ type: "add-events", events, selectDate: draft.date })) return false
    setLifecycleAnnouncement(
      draft.type === "open-slot" ? "Availability saved." :
        draft.type === "class" ? "Class hours saved." : "Blocked time saved.",
    )
    return true
  }
  const saveAvailabilityRules = async (rules: CalendarDemoState["availabilityRules"]) => {
    const validationError = validateAvailabilityRules(rules)
    if (validationError) return validationError
    const conflicts = availabilityRulesConflicts(rules, calendarViewState.events)
    if (conflicts.length) {
      return `${conflicts.length} existing schedule ${conflicts.length === 1 ? "item conflicts" : "items conflict"} with these rules. Adjust the rules before saving.`
    }
    if (!await dispatch({ type: "save-availability-rules", rules })) {
      return "Could not save. Try again."
    }
    setLifecycleAnnouncement("Availability rules saved.")
    return null
  }
  const confirmDayCopy = async (copies: CalendarDemoEvent[]) => {
    const plan = prepareCalendarDayCopies(
      calendarViewState.events,
      state.selectedDate,
      [...new Set(copies.map((event) => event.date))],
      state.availabilityRules,
    )
    if (plan.errors.length || plan.copies.some((event) =>
      calendarViewState.events.some((saved) => saved.id === event.id),
    )) {
      setLifecycleAnnouncement("Copy could not be completed because the schedule changed. Review the conflicts and try again.")
      setDayActionDialog(null)
      return false
    }
    if (plan.copies.length !== copies.length) {
      setLifecycleAnnouncement("Copy could not be completed because the preview is out of date.")
      setDayActionDialog(null)
      return false
    }
    const firstDestination = copies[0]?.date
    if (!firstDestination) return false
    if (!await dispatch({ type: "add-events", events: copies, selectDate: firstDestination })) return false
    setDayActionDialog(null)
    setLifecycleAnnouncement(`${copies.length} schedule ${copies.length === 1 ? "item copied" : "items copied"} to ${new Set(copies.map((event) => event.date)).size} ${new Set(copies.map((event) => event.date)).size === 1 ? "date" : "dates"}.`)
    return true
  }
  const confirmWholeDayBlock = async (slotIds: string[]) => {
    const plan = wholeDayBlockPlan(calendarViewState.events, state.selectedDate)
    if (plan.commitments.length || plan.bookedSlots.length || plan.alreadyBlocked ||
      plan.slotsToRemove.map((event) => event.id).sort().join("|") !== [...slotIds].sort().join("|")) {
      setLifecycleAnnouncement("The day could not be blocked because the schedule changed. Review it and try again.")
      setDayActionDialog(null)
      return false
    }
    const eventId = `blocked-all-day-${state.selectedDate}-${Date.now()}`
    if (!await dispatch({
      type: "block-whole-day",
      date: state.selectedDate,
      removeSlotIds: slotIds,
      eventId,
    })) return false
    setDayActionDialog(null)
    setLifecycleAnnouncement(`Whole day blocked for ${formatDate(state.selectedDate, { month: "long", day: "numeric", year: "numeric" })}.`)
    return true
  }
  const eventForLifecycleDialog = lifecycleDialog
    ? selectedEvent?.id === lifecycleDialog.eventId
      ? selectedEvent
      : lifecycleDialog.eventId.includes("@")
        ? calendarEventsInRange(
          state.events,
          lifecycleDialog.eventId.slice(lifecycleDialog.eventId.lastIndexOf("@") + 1),
          lifecycleDialog.eventId.slice(lifecycleDialog.eventId.lastIndexOf("@") + 1),
        ).find((event) => event.id === lifecycleDialog.eventId) ?? null
        : state.events.find((event) => event.id === lifecycleDialog.eventId) ?? null
    : null
  const bookingForLifecycleDialog = lifecycleDialog?.mode === "booked"
    ? activeBookingFor(lifecycleDialog.eventId)
    : null
  const shift = (amount: -1 | 1) => {
    setExpandedDays(new Set())
    dispatch({ type: "shift-period", amount })
  }
  const selectEvent = (event: CalendarDemoEvent) => {
    dispatch({ type: "select-event", eventId: event.id, date: event.date })
  }
  const renderRowActions = (event: CalendarDemoEvent) => {
    const quietActionClass = "min-h-9 rounded-full border border-border px-3 text-xs font-semibold text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
    const destructiveActionClass = "min-h-9 rounded-full border border-rose-200 px-3 text-xs font-semibold text-rose-800 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-700"
    if (event.type === "consultation") {
      if (event.status === "pending") return (
        <>
          <button type="button" onClick={() => acceptConsultation(event)} className={quietActionClass}>Accept</button>
          <button
            type="button"
            onClick={() => setLifecycleDialog({ mode: "decline-consultation", eventId: event.id, reason: "" })}
            className={destructiveActionClass}
          >Decline</button>
        </>
      )
      if (event.status === "confirmed") return (
        <>
          <button
            type="button"
            onClick={() => setLifecycleDialog({ mode: "reschedule-consultation", eventId: event.id })}
            className={quietActionClass}
          >Reschedule</button>
          <button
            type="button"
            onClick={() => setLifecycleDialog({ mode: "cancel-consultation", eventId: event.id, reason: "" })}
            className={destructiveActionClass}
          >Cancel</button>
        </>
      )
      return null
    }
    return (
      <>
        <button type="button" onClick={() => startEditing(event)} className={quietActionClass}>Edit</button>
        {event.type === "open-slot" ? (
          event.archived ? (
            <button type="button" onClick={() => restoreArchivedEvent(event.id)} className={quietActionClass}>Restore</button>
          ) : (
            <button type="button" onClick={() => requestArchive(event)} className={quietActionClass}>Archive</button>
          )
        ) : null}
        <button type="button" onClick={() => requestDelete(event)} className={destructiveActionClass}>Delete</button>
      </>
    )
  }
  const searchEventAt = (index: number) => {
    const event = searchResults[index]
    if (!event) return
    selectEvent(event)
    setSearchOpen(false)
    setSearchQuery("")
  }
  const toggleEventSelection = (eventId: string) => {
    setSelectedEventIds((current) => {
      const next = new Set(current)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }
  const applyBulkAction = async () => {
    if (!bulkDialog) return false
    const result = applyBulkCalendarOperation(
      state.events,
      bulkDialog,
      selectedEvents.map((event) => event.id),
    )
    if (!result || !result.eligibleIds.length) {
      setLifecycleAnnouncement("No eligible items were changed.")
      setBulkDialog(null)
      return true
    }
    let newlyArchivedIds: string[] = []
    if (bulkDialog === "archive") {
      const beforeArchivedIds = new Set(state.events
        .filter((event) => event.type === "open-slot" && event.archived)
        .map((event) => event.id))
      const newlyArchived = result.events
        .filter((event) => event.type === "open-slot" && event.archived && !beforeArchivedIds.has(event.id))
        .map((event) => event.id)
      const newlyFlagged = result.events
        .filter((event) => event.type === "open-slot" && event.archived)
        .filter((event) => {
          const previous = state.events.find((saved) => saved.id === event.id)
          return previous?.type === "open-slot" && !previous.archived
        })
        .map((event) => event.id)
      newlyArchivedIds = [...new Set([...newlyArchived, ...newlyFlagged])]
    }
    if (!await dispatch({
      type: "bulk-calendar-events",
      operation: bulkDialog,
      eventIds: selectedEvents.map((event) => event.id),
    })) return false
    if (bulkDialog === "archive") {
      setBulkUndoArchiveIds(newlyArchivedIds)
      setUndoArchiveId(null)
    }
    setBulkDialog(null)
    setSelectionMode(false)
    setSelectedEventIds(new Set())
    setLifecycleAnnouncement(
      bulkDialog === "archive"
        ? `${result.eligibleIds.length} eligible ${result.eligibleIds.length === 1 ? "slot" : "slots"} archived.`
        : `${result.eligibleIds.length} eligible ${result.eligibleIds.length === 1 ? "event" : "events"} permanently deleted.`,
    )
    return true
  }
  const undoBulkArchive = async () => {
    const restored = applyBulkRestore(state.events, bulkUndoArchiveIds)
    if (!restored) {
      setLifecycleAnnouncement("Unable to undo bulk archive because one or more slots now conflict.")
      return
    }
    if (!await dispatch({ type: "bulk-restore-archived", eventIds: bulkUndoArchiveIds })) return
    setBulkUndoArchiveIds([])
    setLifecycleAnnouncement("Bulk archive undone; slots restored.")
  }

  const sidebarCounts = {
    classes: eventsInView.filter((event) => event.type === "class").length,
    consultations: eventsInView.filter((event) =>
      event.type === "consultation" &&
      (event.status === "pending" || event.status === "confirmed"),
    ).length,
    pending: eventsInView.filter((event) => event.type === "consultation" && event.status === "pending").length,
    openSlots: eventsInView.filter((event) => event.type === "open-slot" && !event.archived).length,
    blockedTime: eventsInView.filter((event) => event.type === "blocked-time").length,
    archived: eventsInView.filter((event) => event.type === "open-slot" && event.archived).length,
  }

  const calendarTitle = state.activeView === "day"
    ? formatDate(state.selectedDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : state.activeView === "week"
      ? `${formatDate(weekStart, { month: "short", day: "numeric" })} – ${formatDate(weekEnd, { month: "short", day: "numeric", year: "numeric" })}`
      : state.activeView === "year"
        ? String(year)
        : monthLabel(currentMonth)

  const todayButton = (
    <button
      type="button"
      onClick={selectToday}
      className="inline-flex h-9 items-center rounded-full border border-border px-3 text-xs font-semibold text-primary transition hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
    >
      Today
    </button>
  )

  const dateNavigation = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Previous calendar period"
        onClick={() => shift(-1)}
        className="inline-flex size-9 items-center justify-center rounded-full border border-border text-primary transition hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
      >
        <ChevronLeft size={17} />
      </button>
      <button
        type="button"
        aria-label="Next calendar period"
        onClick={() => shift(1)}
        className="inline-flex size-9 items-center justify-center rounded-full border border-border text-primary transition hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
      >
        <ChevronRight size={17} />
      </button>
    </div>
  )

  const viewSwitch = (
    <div className="inline-flex rounded-full border border-border bg-page-bg p-1" role="group" aria-label="Calendar view">
      {VIEW_LABELS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={state.activeView === value}
          onClick={() => dispatch({ type: "set-view", view: value })}
          className={`min-h-8 rounded-full px-3 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-primary ${
            state.activeView === value ? "bg-primary text-white shadow-sm" : "text-muted hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  const renderMonthCell = (date: string) => {
    const inMonth = date.slice(0, 7) === currentMonth.slice(0, 7)
    const events = visibleEvents.filter((event) => event.date === date)
    const expanded = expandedDays.has(date)
    const shown = expanded ? events : events.slice(0, 3)
    return (
      <div
        key={date}
        className={`min-h-[132px] min-w-0 border-b border-r border-divider p-1.5 sm:p-2 ${
          inMonth ? "bg-white" : "bg-slate-50/70"
        }`}
      >
        <button
          type="button"
          aria-label={`Select ${formatDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`}
          aria-pressed={state.selectedDate === date}
          onClick={() => setDate(date)}
          className={`mb-1 inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-primary ${
            date === todayIso
              ? "bg-primary text-white"
              : state.selectedDate === date
                ? "bg-soft text-primary ring-1 ring-primary/40"
                : inMonth
                  ? "text-ink hover:bg-soft"
                  : "text-slate-400 hover:bg-white"
          }`}
        >
          {Number(date.slice(-2))}
        </button>
        <div className="space-y-1">
          {shown.map((event) => (
            <EventButton
              key={event.id}
              event={event}
              compact
              onSelect={() => selectEvent(event)}
            />
          ))}
          {events.length > 3 ? (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpandedDays((current) => {
                const next = new Set(current)
                if (next.has(date)) next.delete(date)
                else next.add(date)
                return next
              })}
              className="px-1 text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              {expanded ? "Show less" : `+${events.length - 3} more`}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  const renderTimeGrid = () => {
    const days = state.activeView === "day" ? [state.selectedDate] : mainWeekDates
    const gridEvents = visibleEvents
    const allDayEvents = gridEvents.filter((event) =>
      event.type === "blocked-time" && event.allDay,
    )
    const timedGridEvents = gridEvents.filter((event) =>
      !(event.type === "blocked-time" && event.allDay),
    )
    const gridMinWidth = state.activeView === "day" ? "min-w-[420px]" : "min-w-[760px]"
    return (
      <div className="max-h-[680px] overflow-auto overscroll-contain rounded-b-2xl">
        <div className={gridMinWidth}>
          <div
            className="sticky top-0 z-10 grid border-b border-divider bg-white/95 backdrop-blur"
            style={{ gridTemplateColumns: `84px repeat(${days.length}, minmax(0, 1fr))` }}
          >
            <div className="sticky left-0 z-20 bg-white" />
            {days.map((date) => (
              <div key={date} className="flex min-h-[58px] flex-col items-center justify-center gap-0.5 border-l border-divider px-1 py-1 text-xs font-semibold text-muted">
                <button
                  type="button"
                  onClick={() => setDate(date)}
                  aria-pressed={state.selectedDate === date}
                  className="flex flex-col items-center gap-0.5 rounded-lg px-2 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span>{formatDate(date, { weekday: "short" })}</span>
                  <span className={`inline-flex size-7 items-center justify-center rounded-full tabular-nums ${
                    date === todayIso ? "bg-primary text-white" : state.selectedDate === date ? "bg-soft text-primary" : "text-ink"
                  }`}>
                    {Number(date.slice(-2))}
                  </span>
                </button>
                {allDayEvents.filter((event) => event.date === date).map((event) => (
                  <EventButton key={event.id} event={event} compact onSelect={() => selectEvent(event)} />
                ))}
              </div>
            ))}
          </div>
            <div
              className="grid"
              style={{ gridTemplateColumns: `84px repeat(${days.length}, minmax(0, 1fr))` }}
            >
              <div className="relative sticky left-0 z-[2] border-r border-divider bg-white" style={{ height: (HOUR_END - HOUR_START) * HOUR_HEIGHT }}>
                {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, index) => {
                  const hour = HOUR_START + index
                  return (
                    <span
                      key={hour}
                      style={{
                        top: timeToPosition(hour * 60, HOUR_START * 60, HOUR_HEIGHT / 60),
                      }}
                      className={`absolute right-2 text-xs tabular-nums text-muted ${
                        index === 0 ? "" : index === HOUR_END - HOUR_START ? "-translate-y-full" : "-translate-y-1/2"
                      }`}
                    >
                      {formatTime(hour * 60)}
                    </span>
                  )
                })}
              </div>
              {days.map((date) => (
                <div
                  key={date}
                  className={`relative overflow-hidden border-r border-divider ${
                    date === todayIso ? "bg-violet-50/30" : "bg-white"
                  }`}
                  style={{ height: (HOUR_END - HOUR_START) * HOUR_HEIGHT }}
                >
                  {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, index) => (
                    <div
                      key={index}
                      style={{
                        top: timeToPosition((HOUR_START + index) * 60, HOUR_START * 60, HOUR_HEIGHT / 60),
                      }}
                      className="pointer-events-none absolute inset-x-0 border-t border-divider/80"
                    />
                  ))}
                  {(() => {
                    const dayEvents = timedGridEvents.filter((event) => event.date === date)
                    const layout = timelineLayout(dayEvents)
                    return dayEvents.map((event) => {
                    const position = layout.get(event.id) ?? { lane: 0, lanes: 1 }
                    const width = 100 / position.lanes
                    const top = timeToPosition(event.startMinutes, HOUR_START * 60, HOUR_HEIGHT / 60)
                    const height = (event.endMinutes - event.startMinutes) * HOUR_HEIGHT / 60
                    return (
                      <div
                        key={event.id}
                        style={{
                          top,
                          height,
                          left: `calc(${position.lane * width}% + 3px)`,
                          width: `calc(${width}% - 6px)`,
                        }}
                        className="absolute z-[1] box-border"
                      >
                        <EventButton event={event} onSelect={() => selectEvent(event)} fill />
                      </div>
                    )
                  })})()}
                </div>
              ))}
          </div>
        </div>
      </div>
    )
  }

  const renderMonthView = (month: string, compact = false) => {
    const dates = miniMonthDays(month)
    const events = compact
      ? getVisibleEvents(state, dates[0], dates[dates.length - 1])
      : visibleEvents
    return (
      <div className="min-w-0">
        <div className="grid grid-cols-7 border-l border-t border-divider text-center">
          {WEEKDAYS.map((day) => (
            <span key={day} className="border-b border-r border-divider bg-page-bg py-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {day}
            </span>
          ))}
          {dates.map((date) => {
            const inMonth = date.slice(0, 7) === month.slice(0, 7)
            const dayEvents = events.filter((event) => event.date === date)
            const visible = compact ? dayEvents.slice(0, 1) : dayEvents.slice(0, 2)
            return (
              <div key={date} className={`min-h-[50px] border-b border-r border-divider p-0.5 ${inMonth ? "bg-white" : "bg-slate-50"}`}>
                <button
                  type="button"
                  onClick={() => {
                    setDate(date)
                    if (compact) dispatch({ type: "set-view", view: "day" })
                  }}
                  aria-label={`Select ${formatDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`}
                  aria-pressed={state.selectedDate === date}
                  className={`mx-auto flex size-7 items-center justify-center rounded-full text-xs font-semibold ${
                    date === todayIso ? "bg-primary text-white" : state.selectedDate === date ? "bg-soft text-primary" : inMonth ? "text-ink" : "text-slate-400"
                  } focus-visible:outline-2 focus-visible:outline-primary`}
                >
                  {Number(date.slice(-2))}
                </button>
                {dayEvents.length > 0 ? (
                  <div className="mt-0.5 flex justify-center gap-0.5" aria-hidden="true">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span key={event.id} className={`size-1.5 rounded-full ${
                        event.type === "class" ? "bg-sky-500" :
                        event.type === "consultation" && event.status === "confirmed" ? "bg-emerald-500" :
                        event.type === "consultation" ? "bg-amber-500" :
                        event.type === "open-slot" ? "bg-violet-500" : "bg-slate-500"
                      }`} />
                    ))}
                    {dayEvents.length > 3 ? <span className="text-xs font-semibold text-muted">+{dayEvents.length - 3}</span> : null}
                  </div>
                ) : null}
                {visible.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => selectEvent(event)}
                    aria-label={`${event.title}, ${timeRange(event)}`}
                    className={`mt-0.5 block w-full truncate rounded px-1 py-0.5 text-left text-xs leading-4 ${eventTone(event)} focus-visible:outline-2 focus-visible:outline-primary`}
                  >
                    {event.title}
                  </button>
                ))}
                {!compact && dayEvents.length > 2 ? (
                  <button
                    type="button"
                    onClick={() => setExpandedDays((current) => new Set(current).add(date))}
                    className="text-xs font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    +{dayEvents.length - 2} more
                  </button>
                ) : null}
                {!compact && expandedDays.has(date) ? (
                  <div className="space-y-0.5">
                    {dayEvents.slice(2).map((event) => (
                      <EventButton key={event.id} compact event={event} onSelect={() => selectEvent(event)} />
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderYearView = () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 12 }, (_, index) => {
        const month = miniMonth(`${year}-${String(index + 1).padStart(2, "0")}`)
        return (
          <section key={month} className="rounded-xl border border-border-card bg-white p-3">
            <button
              type="button"
              onClick={() => {
                setDate(`${month.slice(0, 7)}-01`)
                dispatch({ type: "set-view", view: "month" })
              }}
              className="mb-2 rounded-md px-1 text-sm font-semibold text-ink hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              {monthLabel(month, { month: "long" })}
            </button>
            {renderMonthView(month, true)}
          </section>
        )
      })}
    </div>
  )

  return (
    <div className="min-w-0">
      {lifecycleAnnouncement ? (
        <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950" role="status" aria-live="polite" aria-atomic="true">
          {lifecycleAnnouncement}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-end gap-4">
        <div className="relative min-w-[220px] flex-1">
          <label htmlFor="calendar-demo-search" className="sr-only">Search dates or events</label>
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={searchInputRef}
            id="calendar-demo-search"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={searchOpen && Boolean(searchQuery.trim())}
            aria-controls="calendar-search-results"
            aria-activedescendant={searchOpen && searchResults.length
              ? `calendar-search-result-${activeSearchIndex}`
              : undefined}
            placeholder="Search names, topics, rooms, dates"
            value={searchQuery}
            onFocus={() => {
              if (searchQuery.trim()) setSearchOpen(true)
            }}
            onChange={(event) => {
              setSearchQuery(event.target.value)
              setSearchOpen(Boolean(event.target.value.trim()))
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                if (searchOpen) {
                  event.preventDefault()
                  setSearchOpen(false)
                }
                return
              }
              if (event.key === "ArrowDown" && searchResults.length) {
                event.preventDefault()
                setSearchOpen(true)
                setActiveSearchIndex((index) => (index + 1) % searchResults.length)
              } else if (event.key === "ArrowUp" && searchResults.length) {
                event.preventDefault()
                setSearchOpen(true)
                setActiveSearchIndex((index) => (index - 1) % searchResults.length)
              } else if (event.key === "Enter" && searchOpen && searchResults.length) {
                event.preventDefault()
                searchEventAt(activeSearchIndex)
              }
            }}
            className="h-10 w-full rounded-full border border-border-card bg-white pl-9 pr-10 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
          {searchQuery ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearchQuery("")
                setSearchOpen(false)
                setActiveSearchIndex(0)
                searchInputRef.current?.focus()
              }}
              className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
            >
              <X size={15} />
            </button>
          ) : null}
          {searchOpen && searchQuery.trim() ? (
            <div
              ref={searchResultsRef}
              id="calendar-search-results"
              role="listbox"
              aria-label="Calendar search results"
              className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[min(55dvh,420px)] overflow-y-auto overscroll-contain rounded-xl border border-border-card bg-white shadow-card"
            >
              <p className="sticky top-0 z-10 border-b border-divider bg-page-bg px-3 py-2 text-xs text-muted">
                Search is restricted by active filters:
                {" "}{[
                  !state.filters.classes ? "Classes hidden" : "",
                  !state.filters.consultations ? "Consultations hidden" : "",
                  !state.filters.pending ? "Pending hidden" : "",
                  !state.filters.openSlots ? "Open slots hidden" : "",
                  !state.filters.blockedTime ? "Blocked time hidden" : "",
                  !(state.filters.showArchived && state.filters.openSlots) ? "Archived slots hidden" : "",
                ].filter(Boolean).join(" · ") || "No category filters"}
              </p>
              {searchResults.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted" role="status">
                  No results for ‘{searchQuery.trim()}’
                </p>
              ) : (
                <div className="divide-y divide-divider">
                  {(() => {
                    let resultIndex = 0
                    return groupedSearchResults.map(([date, events]) => (
                        <div key={date} role="group" aria-label={formatDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}>
                        <h3 className="bg-white px-3 pt-3 text-xs font-semibold text-ink">
                          {formatDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                        </h3>
                          <div className="py-1">
                          {events.map((event) => {
                            const index = resultIndex++
                            return (
                                <div key={event.id}>
                                <button
                                  id={`calendar-search-result-${index}`}
                                  type="button"
                                  role="option"
                                  aria-selected={activeSearchIndex === index}
                                  onMouseEnter={() => setActiveSearchIndex(index)}
                                  onClick={() => searchEventAt(index)}
                                  className={`w-full px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary ${
                                    activeSearchIndex === index ? "bg-soft" : "hover:bg-page-bg"
                                  }`}
                                >
                                  <span className="block break-words text-sm font-semibold text-ink">{event.title}</span>
                                  <span className="mt-0.5 block text-xs text-muted">
                                    {timeRange(event)} · {eventStatusLabel(event)}
                                  </span>
                                </button>
                                </div>
                            )
                          })}
                          </div>
                        </div>
                    ))
                  })()}
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => openCreationDialog("open-slot")} className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Create
          </button>
          <button type="button" onClick={() => setPrintDialogOpen(true)} className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-semibold text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary">
            Print schedule
          </button>
          {onSimulateSaveFailure ? (
            <button
              type="button"
              onClick={() => {
                onSimulateSaveFailure()
                setFailureSimulationArmed(true)
              }}
              className="inline-flex h-10 items-center rounded-full border border-border px-3 text-xs font-semibold text-muted hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
            >
              Dev: simulate save failure
            </button>
          ) : null}
          <button type="button" onClick={() => setRulesDialogOpen(true)} className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-semibold text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary">
            Rules
          </button>
        </div>
      </div>

      {failureSimulationArmed ? (
        <p className="mt-2 text-xs text-muted" role="status" aria-live="polite">Development only: next calendar save will fail.</p>
      ) : null}
      {!state.events.some((event) => event.type === "class") ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-card bg-white px-4 py-3 shadow-card">
          <p className="text-sm font-semibold text-ink">No classes scheduled</p>
          <button
            type="button"
            onClick={() => openCreationDialog("class")}
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            + Create class schedule
          </button>
        </div>
      ) : null}
      {undoArchiveId || bulkUndoArchiveIds.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {undoArchiveId ? (
            <div className="flex flex-1 flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm text-ink shadow-card" role="status">
              <span>Slot archived</span>
              <button
                type="button"
                onClick={() => restoreArchivedEvent(undoArchiveId)}
                className="min-h-9 rounded-full px-3 font-semibold text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
              >
                Undo
              </button>
            </div>
          ) : null}
          {bulkUndoArchiveIds.length ? (
            <div className="flex flex-1 flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm text-ink shadow-card" role="status">
              <span>{bulkUndoArchiveIds.length} {bulkUndoArchiveIds.length === 1 ? "slot" : "slots"} archived</span>
              <button
                type="button"
                onClick={undoBulkArchive}
                className="min-h-9 rounded-full px-3 font-semibold text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
              >
                Undo
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 grid min-w-0 items-start gap-4 xl:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-border-card bg-white p-4 shadow-card" aria-label="Date picker">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">{monthLabel(currentMonth)}</h2>
              <div className="flex gap-1">
                {([-1, 1] as const).map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    aria-label={`${amount < 0 ? "Previous" : "Next"} month`}
                    onClick={() => {
                      const [y, m] = currentMonth.split("-").map(Number)
                      const date = new Date(Date.UTC(y, m - 1 + amount, 1))
                      setDate(formatIsoDate(date))
                    }}
                    className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-soft hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {amount < 0 ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-7 text-center">
              {WEEKDAYS.map((day) => (
                <span key={day} className="py-1 text-xs font-semibold text-muted">{day.slice(0, 1)}</span>
              ))}
              {miniMonthDays(currentMonth).map((date) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => setDate(date)}
                  aria-label={formatDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  aria-pressed={state.selectedDate === date}
                  className={`mx-auto my-0.5 inline-flex size-8 items-center justify-center rounded-full text-xs tabular-nums focus-visible:outline-2 focus-visible:outline-primary ${
                    date === todayIso ? "bg-primary text-white" : state.selectedDate === date ? "bg-soft font-semibold text-primary ring-1 ring-primary/40" : date.slice(0, 7) === currentMonth.slice(0, 7) ? "text-ink hover:bg-page-bg" : "text-slate-400 hover:bg-page-bg"
                  }`}
                >
                  {Number(date.slice(-2))}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border-card bg-white p-4 shadow-card">
            <h2 className="text-sm font-semibold text-ink">Filters</h2>
            <p className="mt-1 text-xs text-muted">Counts for the current view period</p>
            <div className="mt-2 space-y-0.5">
              <FilterToggle label="Classes" count={sidebarCounts.classes} checked={state.filters.classes} swatch="bg-sky-500" onChange={() => dispatch({ type: "set-filter", filter: "classes", value: !state.filters.classes })} />
              <FilterToggle label="Consultations" count={sidebarCounts.consultations} checked={state.filters.consultations} swatch="bg-emerald-500" onChange={() => dispatch({ type: "set-filter", filter: "consultations", value: !state.filters.consultations })} />
              <FilterToggle label="Pending" count={sidebarCounts.pending} checked={state.filters.pending} swatch="bg-amber-500" onChange={() => dispatch({ type: "set-filter", filter: "pending", value: !state.filters.pending })} />
              <FilterToggle label="Open slots" count={sidebarCounts.openSlots} checked={state.filters.openSlots} swatch="bg-violet-500" onChange={() => dispatch({ type: "set-filter", filter: "openSlots", value: !state.filters.openSlots })} />
              <FilterToggle label="Blocked time" count={sidebarCounts.blockedTime} checked={state.filters.blockedTime} swatch="bg-slate-500" onChange={() => dispatch({ type: "set-filter", filter: "blockedTime", value: !state.filters.blockedTime })} />
              <FilterToggle label="Show archived slots" count={sidebarCounts.archived} checked={state.filters.showArchived} swatch="bg-slate-300" onChange={() => dispatch({ type: "set-filter", filter: "showArchived", value: !state.filters.showArchived })} />
            </div>
          </section>

          <section className="rounded-2xl border border-border-card bg-white p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">This week</p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {formatDate(weekStart, { month: "short", day: "numeric" })} – {formatDate(weekEnd, { month: "short", day: "numeric" })}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["Classes", summary.classes],
                ["Confirmed", summary.confirmed],
                ["Pending", summary.pending],
                ["Open slots", summary.openSlots],
                ["Blocked", summary.blocked],
              ].map(([label, count]) => (
                <div key={label} className="rounded-lg bg-page-bg px-2.5 py-2">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{count}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl border border-border-card bg-white p-4 shadow-card">
            <h2 className="text-sm font-semibold text-ink">Day summary</h2>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["Classes", selectedDaySummary.classes],
                ["Consultations", selectedDaySummary.consultations],
                ["Pending requests", selectedDaySummary.pendingRequests],
                ["Total appointments", selectedDaySummary.totalAppointments],
                ["Available time", formatDuration(selectedDaySummary.availableMinutes)],
                ["Conflict status", selectedDaySummary.conflicts ? `${selectedDaySummary.conflicts} ${selectedDaySummary.conflicts === 1 ? "conflict" : "conflicts"}` : "No conflicts"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-page-bg px-2.5 py-2">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>

        <main className="min-w-0">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-border-card bg-white shadow-card" aria-label="Calendar">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider p-3 sm:p-4">
              <div className="flex min-w-0 items-center gap-2">
                {dateNavigation}
                <div className="min-w-0">
                  <h2 className="truncate font-[var(--font-display)] text-lg font-semibold text-ink">{calendarTitle}</h2>
                  <p className="text-xs text-muted">Dates use Asia/Shanghai (GMT+8)</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {todayButton}
                {viewSwitch}
              </div>
            </div>

            {state.activeView === "month" ? (
              <div className="overflow-x-auto">
                <div className="min-w-[700px]">
                  <div className="grid grid-cols-7 border-l border-t border-divider text-center">
                    {WEEKDAYS.map((day) => (
                      <span key={day} className="border-b border-r border-divider bg-page-bg py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                        {day}
                      </span>
                    ))}
                    {monthDates.map(renderMonthCell)}
                  </div>
                </div>
              </div>
            ) : state.activeView === "year" ? (
              <div className="max-h-[760px] overflow-y-auto p-3 sm:p-4">{renderYearView()}</div>
            ) : (
              renderTimeGrid()
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-divider px-3 py-3 text-xs text-muted sm:px-4">
              {[
                ["bg-sky-500", "Classes"],
                ["bg-emerald-500", "Confirmed"],
                ["bg-amber-500", "Pending"],
                ["bg-violet-500", "Open slots"],
                ["bg-slate-500", "Blocked time"],
              ].map(([swatch, label]) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${swatch}`} aria-hidden="true" /> {label}
                </span>
              ))}
            </div>
          </section>

          <section className="mt-4 min-w-0 rounded-2xl border border-border-card bg-white p-4 shadow-card" aria-labelledby="selected-day-heading">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous day"
                  onClick={() => shiftSelectedDay(-1)}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Selected day</p>
                  <h2 id="selected-day-heading" className="mt-1 font-[var(--font-display)] text-lg font-semibold text-ink">
                    {formatDate(state.selectedDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Next day"
                  onClick={() => shiftSelectedDay(1)}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <ChevronRight size={18} />
                </button>
                {state.selectedDate === todayIso ? (
                  <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-white">Today</span>
                ) : null}
                <span className="shrink-0 rounded-full bg-soft px-2.5 py-1 text-xs font-semibold text-primary">
                  {selectedDayEvents.length} {selectedDayEvents.length === 1 ? "event" : "events"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full border border-border bg-page-bg p-1" role="group" aria-label="Selected-day schedule view">
                  {(["timeline", "list"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={selectedDayView === mode}
                      onClick={() => setSelectedDayView(mode)}
                      className={`min-h-9 rounded-full px-3 text-sm font-semibold capitalize focus-visible:outline-2 focus-visible:outline-primary ${
                        selectedDayView === mode ? "bg-primary text-white shadow-sm" : "text-muted hover:text-ink"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  aria-pressed={selectionMode}
                  onClick={() => {
                    if (selectionMode) setSelectedEventIds(new Set())
                    setSelectionMode((active) => !active)
                  }}
                  className={`inline-flex min-h-9 items-center justify-center rounded-full border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary ${
                    selectionMode ? "border-primary bg-soft text-primary" : "border-border text-ink hover:bg-soft"
                  }`}
                >
                  {selectionMode ? "Exit selection" : "Select events"}
                </button>
                <button
                  type="button"
                  onClick={() => openCreationDialog("class")}
                  className="inline-flex min-h-10 items-center justify-center rounded-full border border-border px-4 text-sm font-semibold text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
                >
                  + Create class schedule
                </button>
                <button
                  type="button"
                  onClick={() => openCreationDialog("open-slot")}
                  className="inline-flex min-h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Add to this day
                </button>
              </div>
            </div>

            {selectionMode ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-soft p-3" aria-label="Bulk event selection">
                <span className="mr-auto text-sm font-semibold text-ink">
                  {selectedEventIds.size} selected
                </span>
                <button
                  type="button"
                  disabled={!selectedEventIds.size}
                  onClick={() => setBulkDialog("archive")}
                  className="min-h-10 rounded-full border border-border bg-white px-4 text-sm font-semibold text-ink enabled:hover:bg-page-bg disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  Archive
                </button>
                <button
                  type="button"
                  disabled={!selectedEventIds.size}
                  onClick={() => setBulkDialog("delete")}
                  className="min-h-10 rounded-full border border-red-200 bg-white px-4 text-sm font-semibold text-red-800 enabled:hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-red-700"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEventIds(new Set())
                    setSelectionMode(false)
                  }}
                  className="min-h-10 rounded-full px-3 text-sm font-semibold text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  Cancel selection
                </button>
              </div>
            ) : null}

            {allSelectedDayEvents.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <p className="font-semibold text-ink">No schedule for this date</p>
                <p className="mt-1 text-sm text-muted">Start planning this day by creating an availability slot.</p>
                <button
                  type="button"
                  onClick={() => openCreationDialog("open-slot")}
                  className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Create slot
                </button>
              </div>
            ) : selectedDayEvents.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-border px-3 py-5 text-center text-sm text-muted">
                No events match the selected date and filters.
              </p>
            ) : selectedDayView === "list" ? (
              <div className="mt-4 overflow-x-auto rounded-xl border border-divider">
                <table className="w-full min-w-[680px] border-collapse text-left">
                  <thead className="sticky top-0 bg-page-bg text-xs font-semibold text-muted">
                    <tr>
                      {selectionMode ? <th scope="col" className="w-12 px-3 py-3"><span className="sr-only">Select</span></th> : null}
                      <th scope="col" className="px-3 py-3">Time</th>
                      <th scope="col" className="px-3 py-3">Item/details</th>
                      <th scope="col" className="px-3 py-3">Status</th>
                      <th scope="col" className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDayEvents.map((event) => (
                      <tr key={event.id} className="border-t border-divider align-top">
                        {selectionMode ? (
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedEventIds.has(event.id)}
                              onChange={() => toggleEventSelection(event.id)}
                              aria-label={`Select ${event.title} for bulk action`}
                              className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            />
                          </td>
                        ) : null}
                        <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold tabular-nums text-ink">{timeRange(event)}</td>
                        <td className="min-w-0 px-3 py-3">
                          <p className="break-words text-sm font-semibold text-ink">
                            {event.title}{event.type === "class" && event.section ? ` · ${event.section}` : ""}
                          </p>
                          {event.type === "consultation" ? (
                            <p className="mt-1 break-words text-sm text-muted">
                              {event.student || "Student not specified"} · {event.topic || "Consultation"}
                            </p>
                          ) : eventDescription(event) ? (
                            <p className="mt-1 break-words text-sm text-muted">{eventDescription(event)}</p>
                          ) : null}
                          <p className="mt-1 text-xs text-muted">{eventTypeLabel(event)} · {event.location || "Location not set"}</p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                            event.type === "consultation" && event.status === "pending"
                              ? "bg-amber-100 text-amber-900"
                              : event.type === "open-slot" && !event.archived
                                ? "bg-violet-100 text-violet-900"
                                : "bg-soft text-ink"
                          }`}>
                            {eventStatusLabel(event)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {renderRowActions(event)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 max-h-[520px] overflow-auto overscroll-contain rounded-xl border border-divider" aria-label="Selected-day timeline">
                <div className="min-w-[620px]">
                  <div
                    className="relative grid overflow-hidden"
                    style={{
                      gridTemplateColumns: "84px minmax(0, 1fr)",
                      height: (HOUR_END - HOUR_START) * DAY_HOUR_HEIGHT,
                    }}
                  >
                    <div className="relative sticky left-0 z-10 border-r border-divider bg-white">
                      {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, index) => {
                        const hour = HOUR_START + index
                        return (
                        <span
                          key={hour}
                          className={`absolute right-2 text-xs tabular-nums text-muted ${
                            index === 0 ? "" : index === HOUR_END - HOUR_START ? "-translate-y-full" : "-translate-y-1/2"
                          }`}
                          style={{ top: timeToPosition(hour * 60, HOUR_START * 60, DAY_HOUR_HEIGHT / 60) }}
                        >
                          {formatTime(hour * 60)}
                        </span>
                      )})}
                    </div>
                    <div className="relative overflow-hidden">
                      {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, index) => (
                        <div
                          key={index}
                          className="absolute left-0 right-0 border-t border-divider"
                          style={{ top: timeToPosition((HOUR_START + index) * 60, HOUR_START * 60, DAY_HOUR_HEIGHT / 60) }}
                          aria-hidden="true"
                        />
                      ))}
                      {(() => {
                        const layout = timelineLayout(selectedDayEvents)
                        return selectedDayEvents.map((event) => {
                          const position = layout.get(event.id) ?? { lane: 0, lanes: 1 }
                          const width = 100 / position.lanes
                          const top = timeToPosition(event.startMinutes, HOUR_START * 60, DAY_HOUR_HEIGHT / 60)
                          const height = (event.endMinutes - event.startMinutes) * DAY_HOUR_HEIGHT / 60
                          return (
                            <button
                              key={event.id}
                              type="button"
                              onClick={() => selectEvent(event)}
                              aria-label={`${event.title}, ${timeRange(event)}, ${eventStatusLabel(event)}. Select event.`}
                              className={`absolute z-[1] box-border overflow-hidden rounded-lg border p-1.5 text-left text-xs leading-4 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${eventTone(event)}`}
                              style={{
                                top,
                                height,
                                left: `calc(${position.lane * width}% + 3px)`,
                                width: `calc(${width}% - 6px)`,
                              }}
                            >
                              <span className="block truncate font-semibold">{event.title}</span>
                              <span className="block truncate">{timeRange(event)}</span>
                              <span className="block truncate text-xs">{event.location || "Location not set"} · {eventStatusLabel(event)}</span>
                            </button>
                          )
                        })
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

        </main>
      </div>
      {creationDialog ? (
        <CalendarEventCreationDialog
          date={creationDialog.date}
          initialType={creationDialog.type}
          initialDraft={creationDialog.initialDraft}
          events={calendarViewState.events}
          availabilityRules={state.availabilityRules}
          validateDraft={creationDialog.editEventId ? validateEditDraft : undefined}
          onSave={creationDialog.editEventId ? saveEditedEvent : saveCreatedEvents}
          onClose={() => {
            setCreationDialog(null)
            onDismissFailedSave()
          }}
          saving={saving}
        />
      ) : null}
      {rulesDialogOpen ? (
        <AvailabilityRulesDialog
          initialRules={state.availabilityRules}
          events={calendarViewState.events}
          selectedDate={state.selectedDate}
          onClose={() => {
            setRulesDialogOpen(false)
            onDismissFailedSave()
          }}
          onSave={saveAvailabilityRules}
          saving={saving}
        />
      ) : null}
      {dayActionDialog === "copy-day" ? (
        <CopyCalendarDayDialog
          events={calendarViewState.events}
          sourceDate={state.selectedDate}
          rules={state.availabilityRules}
          onClose={() => {
            setDayActionDialog(null)
            onDismissFailedSave()
          }}
          onConfirm={confirmDayCopy}
        />
      ) : null}
      {dayActionDialog === "block-day" ? (
        <BlockWholeDayDialog
          events={calendarViewState.events}
          date={state.selectedDate}
          onClose={() => {
            setDayActionDialog(null)
            onDismissFailedSave()
          }}
          onConfirm={confirmWholeDayBlock}
        />
      ) : null}
      {bulkDialog ? (
        <CalendarBulkActionDialog
          operation={bulkDialog}
          selectedEvents={selectedEvents}
          eligibleIds={selectedEligibility.eligibleIds}
          protectedEvents={selectedEligibility.protectedEvents}
          onClose={() => {
            setBulkDialog(null)
            onDismissFailedSave()
          }}
          onConfirm={applyBulkAction}
        />
      ) : null}
      {lifecycleDialog && eventForLifecycleDialog ? (
        <CalendarEventLifecycleDialog
          mode={lifecycleDialog.mode}
          event={eventForLifecycleDialog}
          booking={bookingForLifecycleDialog ?? undefined}
          reason={lifecycleDialog.reason}
          onClose={() => {
            setLifecycleDialog(null)
            onDismissFailedSave()
          }}
          onContinue={(scope) => openEditDialog(eventForLifecycleDialog, scope)}
          onConfirm={async () => {
            if (lifecycleDialog.mode === "archive") {
              return await archiveSelectedEvent(lifecycleDialog.eventId)
            } else if (lifecycleDialog.mode === "delete") {
              return await deleteSelectedEvent(lifecycleDialog.eventId)
            } else if (lifecycleDialog.mode === "confirm-decline" ||
              lifecycleDialog.mode === "confirm-cancel") {
              return await confirmConsultationResolution()
            }
            return true
          }}
          onBackToForm={() => {
            if (lifecycleDialog.mode === "confirm-decline") {
              setLifecycleDialog({ ...lifecycleDialog, mode: "decline-consultation" })
            } else if (lifecycleDialog.mode === "confirm-cancel") {
              setLifecycleDialog({ ...lifecycleDialog, mode: "cancel-consultation" })
            }
          }}
          onGoToAppointment={() => {
            if (bookingForLifecycleDialog?.type === "consultation") {
              dispatch({
                type: "select-event",
                eventId: bookingForLifecycleDialog.id,
                date: bookingForLifecycleDialog.date,
              })
            }
            setLifecycleDialog(null)
          }}
          onSubmitReason={submitConsultationReason}
          onReschedule={async (draft) => {
            if (!eventForLifecycleDialog) return "This consultation is no longer available."
            return await rescheduleConsultation(eventForLifecycleDialog, draft)
          }}
        />
      ) : null}
      {printDialogOpen ? (
        <CalendarSchedulePrintDialog
          initialDate={state.selectedDate}
          facultyName={facultyName}
          events={state.events}
          loading={loading}
          loadError={loadError}
          onRetryLoad={onRetryLoad}
          onClose={() => setPrintDialogOpen(false)}
        />
      ) : null}
    </div>
  )
}
