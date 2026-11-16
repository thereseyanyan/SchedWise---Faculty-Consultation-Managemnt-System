export type CalendarViewMode = "day" | "week" | "month" | "year"
export type CalendarDayAction = "create-slot" | "copy-day" | "block-day" | "add-class-hours"

export type CalendarDayActionIntent = {
  action: CalendarDayAction
  date: string
}
export type CalendarEditScope = "this" | "following" | "all"
export type CalendarEventChange = { removeIds: string[]; addEvents: CalendarDemoEvent[] }
export type CalendarBulkOperation = "archive" | "delete"
export type CalendarBulkProtection = { event: CalendarDemoEvent; reason: string }
export type AvailabilityInterval = { startMinutes: number; endMinutes: number }
export type AvailabilityDayRule = { enabled: boolean; intervals: AvailabilityInterval[] }
export type AvailabilityDateOverride = {
  date: string
  unavailable: boolean
  intervals: AvailabilityInterval[]
}
export type AvailabilityRules = {
  timeZone: typeof CALENDAR_TIME_ZONE
  defaultSlotDuration: number
  defaultLocation: string
  weekly: AvailabilityDayRule[]
  dateOverrides: AvailabilityDateOverride[]
}

export type CalendarEventBase = {
  id: string
  seriesId?: string
  slotSeriesId?: string
  excludedDates?: string[]
  date: string
  startMinutes: number
  endMinutes: number
  title: string
  description?: string
  recurrence?: "weekly"
  recurrenceEnd?: string
}

export type ClassCalendarEvent = CalendarEventBase & {
  type: "class"
  location: string
  section?: string
}

export type ConsultationCalendarEvent = CalendarEventBase & {
  type: "consultation"
  student: string
  topic: string
  location: string
  status: "confirmed" | "pending" | "cancelled" | "declined"
  cancellationReason?: string
  declineReason?: string
}

export type OpenSlotCalendarEvent = CalendarEventBase & {
  type: "open-slot"
  location: string
  archived?: boolean
}

export type BlockedTimeCalendarEvent = CalendarEventBase & {
  type: "blocked-time"
  location: string
  allDay?: boolean
}

export type CalendarDemoEvent =
  | ClassCalendarEvent
  | ConsultationCalendarEvent
  | OpenSlotCalendarEvent
  | BlockedTimeCalendarEvent

export type CalendarDemoFilters = {
  classes: boolean
  consultations: boolean
  pending: boolean
  openSlots: boolean
  blockedTime: boolean
  showArchived: boolean
}

export type CalendarDemoState = {
  events: CalendarDemoEvent[]
  selectedDate: string
  visibleMonth: string
  activeView: CalendarViewMode
  selectedEventId: string | null
  filters: CalendarDemoFilters
  acceptingRequests: boolean
  availabilityRules: AvailabilityRules
  dayActionIntent?: CalendarDayActionIntent | null
}

export type CalendarDemoAction =
  | { type: "replace-state"; state: CalendarDemoState }
  | { type: "select-date"; date: string }
  | { type: "select-event"; eventId: string; date: string }
  | { type: "set-view"; view: CalendarViewMode }
  | { type: "shift-period"; amount: -1 | 1 }
  | { type: "set-filter"; filter: keyof CalendarDemoFilters; value: boolean }
  | { type: "set-accepting-requests"; value: boolean }
  | { type: "request-day-action"; action: CalendarDayAction }
  | { type: "clear-day-action" }
  | { type: "add-events"; events: CalendarDemoEvent[]; selectDate: string }
  | { type: "replace-events"; change: CalendarEventChange; selectDate: string }
  | { type: "archive-event"; eventId: string }
  | { type: "restore-event"; eventId: string }
  | { type: "delete-event"; eventId: string }
  | { type: "bulk-calendar-events"; operation: CalendarBulkOperation; eventIds: string[] }
  | { type: "bulk-restore-archived"; eventIds: string[] }
  | { type: "save-availability-rules"; rules: AvailabilityRules }
  | { type: "block-whole-day"; date: string; removeSlotIds: string[]; eventId: string }
  | { type: "accept-demo-appointment"; eventId: string }
  | { type: "decline-demo-appointment"; eventId: string; reason: string }
  | {
    type: "reschedule-demo-appointment"
    eventId: string
    date: string
    startMinutes: number
    endMinutes: number
    location: string
  }
  | { type: "cancel-demo-appointment"; eventId: string; reason: string }

export type CalendarDemoDispatcher = (action: CalendarDemoAction) => Promise<boolean>

export type CalendarCreationDraft = {
  type: "open-slot" | "class" | "blocked-time"
  date: string
  startMinutes: number
  endMinutes: number
  slotDuration: number
  location: string
  repeat: "none" | "weekly"
  repeatUntil: string
  notes: string
  className: string
  classSection?: string
}

export const CALENDAR_DEMO_STORAGE_KEY = "schedwise.calendar-demo.v1"
export const CALENDAR_TIME_ZONE = "Asia/Shanghai"
const DEFAULT_WORKING_INTERVAL: AvailabilityInterval = { startMinutes: 7 * 60, endMinutes: 17 * 60 }

export function createDefaultAvailabilityRules(): AvailabilityRules {
  return {
    timeZone: CALENDAR_TIME_ZONE,
    defaultSlotDuration: 30,
    defaultLocation: "Room 302",
    weekly: Array.from({ length: 7 }, () => ({
      enabled: true,
      intervals: [{ ...DEFAULT_WORKING_INTERVAL }],
    })),
    dateOverrides: [],
  }
}

export function validateAvailabilityRules(rules: AvailabilityRules): string | null {
  if (rules.timeZone !== CALENDAR_TIME_ZONE) return "The time zone is fixed to GMT+8 · Asia/Shanghai."
  if (!Number.isInteger(rules.defaultSlotDuration) || rules.defaultSlotDuration < 5 ||
    rules.defaultSlotDuration > 240) return "Default slot duration must be between 5 and 240 minutes."
  if (!rules.defaultLocation.trim()) return "Enter a default location or room."
  if (rules.weekly.length !== 7) return "Add weekly rules for all seven days."
  for (const [dayIndex, day] of rules.weekly.entries()) {
    if (day.enabled && !day.intervals.length) {
      return `${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][dayIndex]}: add a working interval or disable this day.`
    }
    const error = validateAvailabilityIntervals(day.intervals)
    if (error) return `${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][dayIndex]}: ${error}`
  }
  const overrideDates = new Set<string>()
  for (const override of rules.dateOverrides) {
    if (!isIsoDate(override.date)) return "Choose a valid date for each override."
    if (overrideDates.has(override.date)) return `There is more than one override for ${override.date}.`
    overrideDates.add(override.date)
    if (override.unavailable && override.intervals.length) {
      return `Unavailable date ${override.date} cannot also have working intervals.`
    }
    if (!override.unavailable && !override.intervals.length) {
      return `Add at least one working interval or mark ${override.date} unavailable.`
    }
    const error = validateAvailabilityIntervals(override.intervals)
    if (error) return `${override.date}: ${error}`
  }
  return null
}

export function validateAvailabilityIntervals(intervals: AvailabilityInterval[]) {
  const sorted = [...intervals].sort((left, right) =>
    left.startMinutes - right.startMinutes || left.endMinutes - right.endMinutes,
  )
  for (let index = 0; index < sorted.length; index += 1) {
    const interval = sorted[index]
    if (!Number.isInteger(interval.startMinutes) || !Number.isInteger(interval.endMinutes) ||
      interval.startMinutes < 0 || interval.endMinutes > 24 * 60 ||
      interval.startMinutes >= interval.endMinutes) return "Each end time must be after its start time."
    if (index > 0 && interval.startMinutes < sorted[index - 1].endMinutes) {
      return "Working intervals cannot overlap."
    }
  }
  return null
}

export function effectiveAvailabilityIntervals(rules: AvailabilityRules, date: string) {
  const override = rules.dateOverrides.find((item) => item.date === date)
  if (override) return override.unavailable ? [] : override.intervals
  const [year, month, day] = date.split("-").map(Number)
  const dayIndex = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
  const rule = rules.weekly[dayIndex]
  return rule?.enabled ? rule.intervals : []
}

export function availabilityIntervalsContain(
  intervals: AvailabilityInterval[],
  startMinutes: number,
  endMinutes: number,
) {
  let coveredUntil = startMinutes
  for (const interval of [...intervals].sort((left, right) =>
    left.startMinutes - right.startMinutes || left.endMinutes - right.endMinutes,
  )) {
    if (interval.endMinutes <= coveredUntil) continue
    if (interval.startMinutes > coveredUntil) return false
    coveredUntil = interval.endMinutes
    if (coveredUntil >= endMinutes) return true
  }
  return false
}

export function availabilityRulesConflicts(
  rules: AvailabilityRules,
  events: CalendarDemoEvent[],
): CalendarDemoEvent[] {
  const conflicts = new Map<string, CalendarDemoEvent>()
  const dates = new Set<string>()
  for (const event of events) {
    if (event.recurrence === "weekly") {
      const end = event.recurrenceEnd ?? addIsoDays(event.date, 365)
      for (let date = event.date; date <= end && date <= addIsoDays(event.date, 365); date = addIsoDays(date, 7)) {
        dates.add(date)
      }
    } else dates.add(event.date)
  }
  for (const override of rules.dateOverrides) dates.add(override.date)
  for (const date of dates) {
    const intervals = effectiveAvailabilityIntervals(rules, date)
    for (const event of calendarEventsInRange(events, date, date)) {
      if (event.type === "blocked-time" ||
        (event.type === "open-slot" && event.archived)) continue
      if (event.type === "consultation" &&
        (event.status === "cancelled" || event.status === "declined")) continue
      const outside = !availabilityIntervalsContain(intervals, event.startMinutes, event.endMinutes)
      if (outside) conflicts.set(event.id, event)
    }
  }
  return [...conflicts.values()]
}

const initialEvents: CalendarDemoEvent[] = [
  {
    id: "open-oct22",
    type: "open-slot",
    date: "2026-10-22",
    startMinutes: 9 * 60,
    endMinutes: 9 * 60 + 45,
    title: "Open availability",
    description: "45-minute booking slot.",
    location: "Room 302",
  },
  {
    id: "consult-maria",
    type: "consultation",
    date: "2026-10-22",
    startMinutes: 11 * 60 + 30,
    endMinutes: 12 * 60 + 15,
    title: "Consultation with Maria Santos",
    description: "Thesis chapter feedback",
    student: "Maria Santos",
    topic: "Thesis chapter feedback",
    location: "Room 302",
    status: "confirmed",
  },
  {
    id: "consult-irene",
    type: "consultation",
    date: "2026-10-22",
    startMinutes: 13 * 60,
    endMinutes: 13 * 60 + 45,
    title: "Consultation with Irene Reyes",
    description: "Scholarship review",
    student: "Irene Reyes",
    topic: "Scholarship review",
    location: "Room 302",
    status: "pending",
  },
  {
    id: "consult-oct29",
    type: "consultation",
    date: "2026-10-29",
    startMinutes: 15 * 60,
    endMinutes: 15 * 60 + 45,
    title: "Consultation with Noah Lim",
    student: "Noah Lim",
    topic: "Capstone planning",
    location: "Room 302",
    status: "confirmed",
  },
  {
    id: "open-oct24",
    type: "open-slot",
    date: "2026-10-24",
    startMinutes: 10 * 60,
    endMinutes: 11 * 60,
    title: "Weekend availability",
    location: "Online",
  },
  {
    id: "consult-nov03",
    type: "consultation",
    date: "2026-11-03",
    startMinutes: 9 * 60 + 30,
    endMinutes: 10 * 60 + 15,
    title: "Consultation with Ava Dela Cruz",
    student: "Ava Dela Cruz",
    topic: "Project feedback",
    location: "Room 302",
    status: "pending",
  },
  {
    id: "blocked-nov05",
    type: "blocked-time",
    date: "2026-11-05",
    startMinutes: 12 * 60,
    endMinutes: 13 * 60,
    title: "Department meeting",
    location: "Faculty conference room",
  },
  {
    id: "open-archived-sep30",
    type: "open-slot",
    date: "2026-09-30",
    startMinutes: 14 * 60,
    endMinutes: 14 * 60 + 45,
    title: "Archived availability",
    location: "Room 302",
    archived: true,
  },
]

export function createInitialCalendarDemoState(): CalendarDemoState {
  return {
    events: initialEvents.map((event) => ({ ...event })),
    selectedDate: "2026-10-22",
    visibleMonth: "2026-10-01",
    activeView: "month",
    selectedEventId: null,
    filters: {
      classes: true,
      consultations: true,
      pending: true,
      openSlots: true,
      blockedTime: true,
      showArchived: false,
    },
    acceptingRequests: true,
    availabilityRules: createDefaultAvailabilityRules(),
    dayActionIntent: null,
  }
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
}

export function addIsoDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return formatIsoDate(date)
}

export function formatIsoDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-")
}

export function isoDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function startOfIsoWeek(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const mondayOffset = (date.getUTCDay() + 6) % 7
  return addIsoDays(iso, -mondayOffset)
}

export function monthGridDates(monthIso: string) {
  const [year, month] = monthIso.split("-").map(Number)
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`
  const firstWeekDate = startOfIsoWeek(firstDay)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const weeks = Math.ceil((((new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7) + daysInMonth) / 7)
  return Array.from({ length: weeks * 7 }, (_, index) => addIsoDays(firstWeekDate, index))
}

export function shiftCalendarPeriod(
  state: CalendarDemoState,
  amount: -1 | 1,
): CalendarDemoState {
  let selectedDate = state.selectedDate
  if (state.activeView === "day") {
    selectedDate = addIsoDays(selectedDate, amount)
  } else if (state.activeView === "week") {
    selectedDate = addIsoDays(selectedDate, amount * 7)
  } else if (state.activeView === "month") {
    const [year, month] = state.visibleMonth.split("-").map(Number)
    const nextMonth = new Date(Date.UTC(year, month - 1 + amount, 1))
    selectedDate = formatIsoDate(nextMonth)
  } else {
    const [year] = state.visibleMonth.split("-").map(Number)
    selectedDate = `${year + amount}-01-01`
  }
  return {
    ...state,
    selectedDate,
    visibleMonth: `${selectedDate.slice(0, 7)}-01`,
    selectedEventId: null,
  }
}

export function calendarDemoReducer(
  state: CalendarDemoState,
  action: CalendarDemoAction,
): CalendarDemoState {
  switch (action.type) {
    case "replace-state":
      return action.state
    case "select-date":
      if (!isIsoDate(action.date)) return state
      return {
        ...state,
        selectedDate: action.date,
        visibleMonth: `${action.date.slice(0, 7)}-01`,
        selectedEventId: null,
        dayActionIntent: action.date === state.selectedDate ? state.dayActionIntent : null,
      }
    case "select-event":
      if (!isIsoDate(action.date)) return state
      return {
        ...state,
        selectedDate: action.date,
        visibleMonth: `${action.date.slice(0, 7)}-01`,
        selectedEventId: action.eventId,
        dayActionIntent: action.date === state.selectedDate ? state.dayActionIntent : null,
      }
    case "set-view":
      return { ...state, activeView: action.view, selectedEventId: null }
    case "shift-period":
      return { ...shiftCalendarPeriod(state, action.amount), dayActionIntent: null }
    case "set-filter":
      return { ...state, filters: { ...state.filters, [action.filter]: action.value } }
    case "set-accepting-requests":
      return { ...state, acceptingRequests: action.value }
    case "request-day-action":
      return {
        ...state,
        dayActionIntent: { action: action.action, date: state.selectedDate },
      }
    case "clear-day-action":
      return { ...state, dayActionIntent: null }
    case "add-events": {
      if (!isIsoDate(action.selectDate) || action.events.length === 0) return state
      if (new Set(action.events.map((event) => event.id)).size !== action.events.length) return state
      if (action.events.some((event) => state.events.some((saved) => saved.id === event.id))) return state
      if (findCalendarEventConflict(state.events, action.events)) return state
      return {
        ...state,
        events: [...state.events, ...action.events],
        selectedDate: action.selectDate,
        visibleMonth: `${action.selectDate.slice(0, 7)}-01`,
        selectedEventId: null,
        dayActionIntent: null,
      }
    }
    case "replace-events": {
      if (!isIsoDate(action.selectDate)) return state
      const { removeIds, addEvents } = action.change
      if (addEvents.length === 0 || new Set(removeIds).size !== removeIds.length) return state
      if (new Set(addEvents.map((event) => event.id)).size !== addEvents.length) return state
      if (addEvents.some((event) => state.events.some(
        (saved) => !removeIds.includes(saved.id) && saved.id === event.id,
      ))) return state
      if (removeIds.some((id) => {
        const event = state.events.find((item) => item.id === id)
        return event?.type === "consultation" ||
          (event?.type === "open-slot" && isSlotBooked(state.events, event))
      })) return state
      const remaining = state.events.filter((event) => !removeIds.includes(event.id))
      if (findCalendarEventConflict(remaining, addEvents)) return state
      return {
        ...state,
        events: [...remaining, ...addEvents],
        selectedDate: action.selectDate,
        visibleMonth: `${action.selectDate.slice(0, 7)}-01`,
        selectedEventId: null,
        dayActionIntent: null,
      }
    }
    case "archive-event": {
      const change = archiveCalendarEvent(state.events, action.eventId)
      if (!change || isCalendarEventBooked(state.events, action.eventId)) return state
      return { ...state, events: change, selectedEventId: null }
    }
    case "restore-event": {
      const change = restoreCalendarEvent(state.events, action.eventId)
      if (!change || findCalendarEventConflict(
        state.events.filter((event) => !change.removeIds.includes(event.id)),
        change.addEvents,
      )) return state
      return {
        ...state,
        events: [
          ...state.events.filter((event) => !change.removeIds.includes(event.id)),
          ...change.addEvents,
        ],
        selectedEventId: null,
      }
    }
    case "delete-event": {
      if (isCalendarEventBooked(state.events, action.eventId)) return state
      const change = deleteCalendarEvent(state.events, action.eventId)
      if (!change) return state
      return {
        ...state,
        events: [
          ...state.events.filter((event) => !change.removeIds.includes(event.id)),
          ...change.addEvents,
        ],
        selectedEventId: null,
      }
    }
    case "bulk-calendar-events": {
      const result = applyBulkCalendarOperation(state.events, action.operation, action.eventIds)
      if (!result || !result.eligibleIds.length) return state
      return { ...state, events: result.events, selectedEventId: null }
    }
    case "bulk-restore-archived": {
      const restored = applyBulkRestore(state.events, action.eventIds)
      if (!restored) return state
      return { ...state, events: restored, selectedEventId: null }
    }
    case "save-availability-rules": {
      if (validateAvailabilityRules(action.rules)) return state
      if (availabilityRulesConflicts(action.rules, state.events).length) return state
      return { ...state, availabilityRules: action.rules }
    }
    case "block-whole-day": {
      if (!isIsoDate(action.date) || !action.eventId || state.events.some((event) => event.id === action.eventId)) return state
      const dayEvents = calendarEventsInRange(state.events, action.date, action.date)
      const activeCommitment = dayEvents.find((event) =>
        event.type === "class" ||
        (event.type === "consultation" &&
          (event.status === "pending" || event.status === "confirmed")),
      )
      if (activeCommitment) return state
      const slots = dayEvents.filter((event) => event.type === "open-slot" && !event.archived)
      if (slots.some((slot) => slot.type !== "open-slot" || isSlotBooked(state.events, slot))) return state
      const expectedSlotIds = slots.map((slot) => slot.id).sort()
      if (expectedSlotIds.join("|") !== [...action.removeSlotIds].sort().join("|")) return state
      let remaining = [...state.events]
      for (const slotId of action.removeSlotIds) {
        const change = deleteCalendarEvent(remaining, slotId)
        if (!change) return state
        remaining = [
          ...remaining.filter((event) => !change.removeIds.includes(event.id)),
          ...change.addEvents,
        ]
      }
      const allDayBlock: BlockedTimeCalendarEvent = {
        id: action.eventId,
        type: "blocked-time",
        date: action.date,
        startMinutes: 0,
        endMinutes: 24 * 60,
        title: "Unavailable all day",
        location: "",
        allDay: true,
      }
      if (remaining.some((event) => event.type === "blocked-time" && event.date === action.date && event.allDay)) return state
      return {
        ...state,
        events: [...remaining, allDayBlock],
        selectedDate: action.date,
        visibleMonth: `${action.date.slice(0, 7)}-01`,
        selectedEventId: allDayBlock.id,
        dayActionIntent: null,
      }
    }
    case "accept-demo-appointment": {
      const target = resolveCalendarEvent(state.events, action.eventId)
      if (!target || target.isOccurrence || target.event.type !== "consultation" ||
        target.event.status !== "pending" ||
        findConsultationConflict(state.events, target.event, target.event.id, false)) return state
      return {
        ...state,
        events: state.events.map((event) => event.id === target.event.id
          ? { ...event, status: "confirmed" }
          : event),
        selectedEventId: target.event.id,
      }
    }
    case "decline-demo-appointment": {
      const reason = action.reason.trim()
      const target = resolveCalendarEvent(state.events, action.eventId)
      if (!reason || !target || target.isOccurrence || target.event.type !== "consultation" ||
        target.event.status !== "pending") return state
      return {
        ...state,
        events: state.events.map((event) => event.id === target.event.id
          ? { ...event, status: "declined", declineReason: reason }
          : event),
        selectedEventId: target.event.id,
      }
    }
    case "reschedule-demo-appointment": {
      const target = resolveCalendarEvent(state.events, action.eventId)
      if (!target || target.isOccurrence || target.event.type !== "consultation" ||
        target.event.status !== "confirmed" || !isIsoDate(action.date) ||
        !Number.isInteger(action.startMinutes) || !Number.isInteger(action.endMinutes) ||
        action.startMinutes < 0 || action.endMinutes > 24 * 60 ||
        action.startMinutes >= action.endMinutes || !action.location.trim()) return state
      const candidate: ConsultationCalendarEvent = {
        ...target.event,
        date: action.date,
        startMinutes: action.startMinutes,
        endMinutes: action.endMinutes,
        location: action.location.trim(),
      }
      if (findConsultationConflict(state.events, candidate, target.event.id, true)) return state
      return {
        ...state,
        events: state.events.map((event) => event.id === target.event.id ? candidate : event),
        selectedDate: candidate.date,
        visibleMonth: `${candidate.date.slice(0, 7)}-01`,
        selectedEventId: candidate.id,
      }
    }
    case "cancel-demo-appointment": {
      const reason = action.reason.trim()
      if (!reason) return state
      const target = resolveCalendarEvent(state.events, action.eventId)
      if (!target || target.event.type !== "consultation" ||
        !["pending", "confirmed"].includes(target.event.status)) return state
      if (target.isOccurrence) {
        const base = target.baseEvent
        if (base.type !== "consultation") return state
        const date = target.date
        const canceled: ConsultationCalendarEvent = {
          ...base,
          id: `${base.id}-cancelled-${date}`,
          date,
          recurrence: undefined,
          recurrenceEnd: undefined,
          excludedDates: undefined,
          status: "cancelled",
          cancellationReason: reason,
        }
        return {
          ...state,
          events: [
            ...state.events.map((event) => event.id === base.id
              ? appendExcludedDate(event, date)
              : event),
            canceled,
          ],
          selectedEventId: canceled.id,
        }
      }
      return {
        ...state,
        events: state.events.map((event) => event.id === target.event.id
          ? { ...event, status: "cancelled", cancellationReason: reason }
          : event),
      }
    }
  }
}

function eventOccurrencesInRange(
  event: CalendarDemoEvent,
  from: string,
  to: string,
) {
  if (event.recurrence !== "weekly") {
    return event.date >= from && event.date <= to ? [event] : []
  }
  const occurrences: CalendarDemoEvent[] = []
  const lastDate = event.recurrenceEnd && event.recurrenceEnd < to
    ? event.recurrenceEnd
    : to
  for (let date = event.date; date <= lastDate; date = addIsoDays(date, 7)) {
    if (date >= from && !event.excludedDates?.includes(date)) {
      occurrences.push({ ...event, id: `${event.id}@${date}`, date })
    }
  }
  return occurrences
}

export function calendarEventsInRange(
  events: CalendarDemoEvent[],
  from: string,
  to: string,
): CalendarDemoEvent[] {
  const occurrences: CalendarDemoEvent[] = []
  for (const event of events) {
    occurrences.push(...eventOccurrencesInRange(event, from, to))
  }
  return occurrences.sort((left, right) =>
    left.date.localeCompare(right.date) ||
    left.startMinutes - right.startMinutes ||
    left.id.localeCompare(right.id),
  )
}

export type CalendarPrintPeriod = "day" | "week"

export function calendarPrintRange(date: string, period: CalendarPrintPeriod) {
  const start = period === "week" ? startOfIsoWeek(date) : date
  return {
    start,
    end: period === "week" ? addIsoDays(start, 6) : start,
  }
}

export function calendarPrintEvents(
  events: CalendarDemoEvent[],
  range: { start: string; end: string },
) {
  return calendarEventsInRange(events, range.start, range.end)
    .filter((event) => !(event.type === "open-slot" && event.archived))
}

export function findCalendarEventConflict(
  existingEvents: CalendarDemoEvent[],
  candidates: CalendarDemoEvent[],
): CalendarDemoEvent | null {
  if (candidates.length === 0) return null
  const from = candidates.reduce(
    (first, event) => event.date < first ? event.date : first,
    candidates[0].date,
  )
  const to = candidates.reduce(
    (last, event) => {
      const end = event.recurrence === "weekly" ? event.recurrenceEnd ?? event.date : event.date
      return end > last ? end : last
    },
    from,
  )
  const savedOccurrences = calendarEventsInRange(existingEvents, from, to)
    .filter((event) =>
      !(event.type === "consultation" &&
        (event.status === "cancelled" || event.status === "declined")) &&
      !(event.type === "open-slot" && event.archived),
    )
  const candidateOccurrences = candidates.flatMap((event) =>
    eventOccurrencesInRange(event, from, to),
  )
  for (const candidate of candidateOccurrences) {
    const savedConflict = savedOccurrences.find((saved) =>
      saved.id !== candidate.id &&
      !(saved.type === "consultation" &&
        (saved.status === "cancelled" || saved.status === "declined")) &&
      saved.startMinutes < candidate.endMinutes &&
      candidate.startMinutes < saved.endMinutes,
    )
    if (savedConflict) return savedConflict
  }

  for (let left = 0; left < candidateOccurrences.length; left += 1) {
    for (let right = left + 1; right < candidateOccurrences.length; right += 1) {
      const first = candidateOccurrences[left]
      const second = candidateOccurrences[right]
      if (
        first.date === second.date &&
        first.id !== second.id &&
        first.startMinutes < second.endMinutes &&
        second.startMinutes < first.endMinutes
      ) return second
    }
  }
  return null
}

export function findConsultationConflict(
  events: CalendarDemoEvent[],
  consultation: ConsultationCalendarEvent,
  excludeEventId: string,
  includePending: boolean,
) {
  return calendarEventsInRange(events, consultation.date, consultation.date).find((event) => {
    const blockingConsultation = event.type === "consultation" &&
      (event.status === "confirmed" || (includePending && event.status === "pending"))
    if (
      event.id === excludeEventId ||
      !(event.type === "class" || event.type === "blocked-time" || blockingConsultation) ||
      event.startMinutes >= consultation.endMinutes ||
      consultation.startMinutes >= event.endMinutes
    ) return false
    return true
  }) ?? null
}

type ResolvedCalendarEvent = {
  event: CalendarDemoEvent
  baseEvent: CalendarDemoEvent
  date: string
  isOccurrence: boolean
}

function resolveCalendarEvent(
  events: CalendarDemoEvent[],
  eventId: string,
): ResolvedCalendarEvent | null {
  const exact = events.find((event) => event.id === eventId)
  if (exact) return { event: exact, baseEvent: exact, date: exact.date, isOccurrence: false }
  const separator = eventId.lastIndexOf("@")
  if (separator < 0) return null
  const baseId = eventId.slice(0, separator)
  const date = eventId.slice(separator + 1)
  if (!isIsoDate(date)) return null
  const base = events.find((event) => event.id === baseId)
  if (!base || base.recurrence !== "weekly") return null
  if (!eventOccurrencesInRange(base, date, date).length) return null
  return { event: { ...base, id: eventId, date }, baseEvent: base, date, isOccurrence: true }
}

function getSeriesIdentity(event: CalendarDemoEvent) {
  return event.slotSeriesId ?? event.seriesId ?? event.id
}

export function isSlotBooked(events: CalendarDemoEvent[], slot: CalendarDemoEvent) {
  if (slot.type !== "open-slot") return false
  return calendarEventsInRange(events, slot.date, slot.date).some((event) =>
    event.type === "consultation" &&
    (event.status === "pending" || event.status === "confirmed") &&
    event.startMinutes < slot.endMinutes &&
    slot.startMinutes < event.endMinutes,
  )
}

export function isCalendarEventBooked(events: CalendarDemoEvent[], eventId: string) {
  const target = resolveCalendarEvent(events, eventId)
  return target?.event.type === "open-slot" && isSlotBooked(events, target.event)
}

function appendExcludedDate(event: CalendarDemoEvent, date: string) {
  return {
    ...event,
    excludedDates: [...new Set([...(event.excludedDates ?? []), date])].sort(),
  }
}

function removeExcludedDate(event: CalendarDemoEvent, date: string) {
  const excludedDates = event.excludedDates?.filter((item) => item !== date) ?? []
  const { excludedDates: _old, ...rest } = event
  return excludedDates.length ? { ...rest, excludedDates } : rest
}

export function archiveCalendarEvent(
  events: CalendarDemoEvent[],
  eventId: string,
): CalendarDemoEvent[] | null {
  const target = resolveCalendarEvent(events, eventId)
  if (!target || target.event.type !== "open-slot" || target.event.archived) return null
  if (target.isOccurrence) {
    const baseId = target.event.id.slice(0, target.event.id.lastIndexOf("@"))
    const base = events.find((event) => event.id === baseId)
    if (!base) return null
    const archived: OpenSlotCalendarEvent = {
      ...target.event,
      id: `${base.id}-archived-${target.date}`,
      date: target.date,
      recurrence: undefined,
      recurrenceEnd: undefined,
      excludedDates: undefined,
      archived: true,
    }
    return events.map((event) => event.id === base.id
      ? appendExcludedDate(event, target.date)
      : event).concat(archived)
  }
  return events.map((event) => event.id === target.event.id
    ? { ...event, archived: true }
    : event)
}

type EventMutation = { removeIds: string[]; addEvents: CalendarDemoEvent[] }

export function restoreCalendarEvent(
  events: CalendarDemoEvent[],
  eventId: string,
): EventMutation | null {
  const archived = events.find((event) => event.id === eventId)
  if (archived?.type !== "open-slot" || !archived.archived) return null
  const template = getSeriesIdentity(archived)
    ? events.find((event) =>
      event.id !== archived.id &&
      getSeriesIdentity(event) === getSeriesIdentity(archived) &&
      event.recurrence === "weekly" &&
      event.excludedDates?.includes(archived.date),
    )
    : undefined
  if (template) {
    return {
      removeIds: [archived.id, template.id],
      addEvents: [removeExcludedDate(template, archived.date)],
    }
  }
  return {
    removeIds: [archived.id],
    addEvents: [{ ...archived, archived: false }],
  }
}

export function deleteCalendarEvent(
  events: CalendarDemoEvent[],
  eventId: string,
): EventMutation | null {
  const target = resolveCalendarEvent(events, eventId)
  if (!target || target.event.type === "consultation") return null
  if (target.isOccurrence) {
    const baseId = target.event.id.slice(0, target.event.id.lastIndexOf("@"))
    const base = events.find((event) => event.id === baseId)
    if (!base) return null
    return {
      removeIds: [base.id],
      addEvents: [appendExcludedDate(base, target.date)],
    }
  }
  return { removeIds: [target.event.id], addEvents: [] }
}

export function getBulkCalendarEligibility(
  events: CalendarDemoEvent[],
  operation: CalendarBulkOperation,
  eventIds: string[],
): { eligibleIds: string[]; protectedEvents: CalendarBulkProtection[] } {
  const eligibleIds: string[] = []
  const protectedEvents: CalendarBulkProtection[] = []
  const seen = new Set<string>()
  for (const eventId of eventIds) {
    if (seen.has(eventId)) continue
    seen.add(eventId)
    const target = resolveCalendarEvent(events, eventId)
    if (!target) continue
    if (target.event.type === "consultation") {
      protectedEvents.push({
        event: target.event,
        reason: "Consultations are appointment history; use the cancel or decline workflow.",
      })
    } else if (target.event.type === "open-slot" && isSlotBooked(events, target.event)) {
      protectedEvents.push({
        event: target.event,
        reason: "This slot is booked. Cancel the appointment with a written reason first.",
      })
    } else if (operation === "archive" &&
      (target.event.type !== "open-slot" || target.event.archived)) {
      protectedEvents.push({
        event: target.event,
        reason: target.event.type === "open-slot"
          ? "This slot is already archived."
          : "Only open availability slots can be archived.",
      })
    } else {
      eligibleIds.push(eventId)
    }
  }
  return { eligibleIds, protectedEvents }
}

export function applyBulkCalendarOperation(
  events: CalendarDemoEvent[],
  operation: CalendarBulkOperation,
  eventIds: string[],
) {
  const eligibility = getBulkCalendarEligibility(events, operation, eventIds)
  let nextEvents = [...events]
  for (const eventId of eligibility.eligibleIds) {
    if (operation === "archive") {
      const archived = archiveCalendarEvent(nextEvents, eventId)
      if (!archived) return null
      nextEvents = archived
    } else {
      const change = deleteCalendarEvent(nextEvents, eventId)
      if (!change) return null
      nextEvents = [
        ...nextEvents.filter((event) => !change.removeIds.includes(event.id)),
        ...change.addEvents,
      ]
    }
  }
  return { events: nextEvents, ...eligibility }
}

export function applyBulkRestore(
  events: CalendarDemoEvent[],
  eventIds: string[],
): CalendarDemoEvent[] | null {
  let nextEvents = [...events]
  for (const eventId of new Set(eventIds)) {
    const change = restoreCalendarEvent(nextEvents, eventId)
    if (!change) return null
    const remaining = nextEvents.filter((event) => !change.removeIds.includes(event.id))
    if (findCalendarEventConflict(remaining, change.addEvents)) return null
    nextEvents = [...remaining, ...change.addEvents]
  }
  return nextEvents
}

export function prepareCalendarDayCopies(
  events: CalendarDemoEvent[],
  sourceDate: string,
  destinationDates: string[],
  rules: AvailabilityRules,
) {
  const sourceEvents = calendarEventsInRange(events, sourceDate, sourceDate)
    .filter((event) =>
      event.type === "class" ||
      event.type === "blocked-time" ||
      (event.type === "open-slot" && !event.archived && !isCalendarEventBooked(events, event.id)),
    )
  const errors: { date: string; message: string }[] = []
  const copies: CalendarDemoEvent[] = []
  const destinations = [...new Set(destinationDates)]
  if (destinations.length !== destinationDates.length) {
    errors.push({ date: sourceDate, message: "Remove duplicate destination dates." })
  }
  for (const date of destinations) {
    if (!isIsoDate(date)) {
      errors.push({ date, message: "Choose a valid destination date." })
      continue
    }
    if (date === sourceDate) {
      errors.push({ date, message: "Choose a different date from the source day." })
      continue
    }
    const proposed = sourceEvents.map((event) => {
      const {
        recurrence: _recurrence,
        recurrenceEnd: _recurrenceEnd,
        excludedDates: _excludedDates,
        seriesId: _seriesId,
        slotSeriesId: _slotSeriesId,
        ...copy
      } = event
      const copiedEvent = {
        ...copy,
        id: `copy-${date}-${event.id}`,
        date,
      }
      return event.type === "open-slot" ? { ...copiedEvent, archived: false } : copiedEvent
    })
    for (const copy of proposed) {
      if (copy.type === "open-slot") {
        const intervals = effectiveAvailabilityIntervals(rules, date)
        if (!availabilityIntervalsContain(intervals, copy.startMinutes, copy.endMinutes)) {
          errors.push({
            date,
            message: `${copy.title} is outside the working intervals for this date.`,
          })
        }
      }
    }
    const conflict = findCalendarEventConflict([...events, ...copies], proposed)
    if (conflict) {
      errors.push({
        date,
        message: `A copied item overlaps with ${conflict.title}.`,
      })
    }
    copies.push(...proposed)
  }
  return { copies, errors, sourceEvents }
}

export function wholeDayBlockPlan(events: CalendarDemoEvent[], date: string) {
  const dayEvents = calendarEventsInRange(events, date, date)
  const commitments = dayEvents.filter((event) =>
    event.type === "class" ||
    (event.type === "consultation" &&
      (event.status === "pending" || event.status === "confirmed")),
  )
  const openSlots = dayEvents.filter((event) => event.type === "open-slot" && !event.archived)
  const bookedSlots = openSlots.filter((event) => isCalendarEventBooked(events, event.id))
  const slotsToRemove = openSlots.filter((event) => !bookedSlots.includes(event))
  const alreadyBlocked = dayEvents.some((event) =>
    event.type === "blocked-time" && event.allDay,
  )
  return { commitments, slotsToRemove, bookedSlots, alreadyBlocked }
}

export function calendarEventToCreationDraft(
  event: CalendarDemoEvent,
  date: string,
): CalendarCreationDraft | null {
  if (event.type === "consultation") return null
  return {
    type: event.type,
    date,
    startMinutes: event.startMinutes,
    endMinutes: event.endMinutes,
    slotDuration: event.endMinutes - event.startMinutes,
    location: event.location,
    repeat: event.recurrence === "weekly" ? "weekly" : "none",
    repeatUntil: event.recurrenceEnd ?? addIsoDays(date, 28),
    notes: event.description ?? "",
    className: event.type === "class" ? event.title : "",
    classSection: event.type === "class" ? event.section ?? "" : "",
  }
}

export function prepareCalendarEventEdit(
  events: CalendarDemoEvent[],
  eventId: string,
  scope: CalendarEditScope,
  draft: CalendarCreationDraft,
  newSeriesId: string,
): EventMutation | null {
  const target = resolveCalendarEvent(events, eventId)
  if (!target || target.event.type === "consultation") return null
  const baseId = target.isOccurrence
    ? target.event.id.slice(0, target.event.id.lastIndexOf("@"))
    : target.event.id
  const base = events.find((event) => event.id === baseId)
  if (!base) return null
  const recurring = base.recurrence === "weekly"
  if (recurring && scope !== "this" && !target.isOccurrence) return null
  const seriesIdentity = getSeriesIdentity(base)
  const rootSeriesId = base.seriesId ?? base.id
  const sameSeries = events.filter((event) =>
    event.recurrence === "weekly" && getSeriesIdentity(event) === seriesIdentity,
  )
  const seriesExceptions = events.filter((event) =>
    event.recurrence !== "weekly" && getSeriesIdentity(event) === seriesIdentity,
  )
  const preservedDates = [
    ...sameSeries.flatMap((event) => event.excludedDates ?? []),
    ...seriesExceptions.map((event) => event.date),
  ]
  let removeIds: string[]
  let preserved: CalendarDemoEvent[] = []
  let effectiveDraft: CalendarCreationDraft & { excludedDates?: string[] } = { ...draft }
  let editedId = base.id

  if (!recurring) {
    removeIds = [base.id]
  } else if (scope === "this") {
    removeIds = [base.id]
    preserved = [appendExcludedDate(base, target.date)]
    effectiveDraft = { ...effectiveDraft, repeat: "none" }
    editedId = `${base.id}-exception-${target.date}`
  } else if (scope === "following") {
    const affectedTemplates = sameSeries.filter((event) =>
      !event.recurrenceEnd || event.recurrenceEnd >= target.date,
    )
    removeIds = affectedTemplates.map((event) => event.id)
    for (const template of affectedTemplates) {
      if (template.date >= target.date) continue
      const previousDate = addIsoDays(target.date, -1)
      const lastPreviousOccurrence = addIsoDays(target.date, -7)
      if (lastPreviousOccurrence < template.date) continue
      const previousExcludedDates = (template.excludedDates ?? [])
        .filter((date) => date < target.date)
      preserved.push({
        ...template,
        recurrenceEnd: previousDate,
        excludedDates: previousExcludedDates.length ? previousExcludedDates : undefined,
      })
    }
    effectiveDraft = {
      ...effectiveDraft,
      repeat: "weekly",
      excludedDates: preservedDates.filter((date) => date >= target.date),
    }
    editedId = `${base.id}-following-${target.date}`
  } else {
    removeIds = sameSeries.map((event) => event.id)
    effectiveDraft = {
      ...effectiveDraft,
      date: sameSeries.reduce(
        (earliest, event) => event.date < earliest ? event.date : earliest,
        base.date,
      ),
      repeat: "weekly",
      repeatUntil: draft.repeatUntil || base.recurrenceEnd || addIsoDays(base.date, 28),
      excludedDates: preservedDates,
    }
  }

  const proposed = createCalendarDemoEvents(effectiveDraft, newSeriesId)
  const built = proposed.map((event, index): CalendarDemoEvent => {
    const id = index === 0 ? editedId : `${editedId}-edited-${index + 1}`
    const next = {
      ...event,
      id,
      seriesId: rootSeriesId,
    }
    if (event.recurrence === "weekly" && effectiveDraft.excludedDates?.length) {
      next.excludedDates = [...new Set(effectiveDraft.excludedDates)].sort()
    }
    if (event.type === "open-slot") {
      return {
        ...next,
        title: target.event.type === "open-slot" ? target.event.title : event.title,
        slotSeriesId: proposed.length > 1
          ? `${newSeriesId}-slot-${index + 1}`
          : seriesIdentity,
        ...(scope === "this" && target.event.type === "open-slot"
          ? { archived: target.event.archived }
          : {}),
      }
    }
    return next
  })
  return { removeIds, addEvents: [...preserved, ...built] }
}

export function createCalendarDemoEvents(
  draft: CalendarCreationDraft & { excludedDates?: string[] },
  seriesId: string,
): CalendarDemoEvent[] {
  const recurring = draft.repeat === "weekly"
    ? {
      recurrence: "weekly" as const,
      recurrenceEnd: draft.repeatUntil,
      excludedDates: draft.excludedDates,
    }
    : {}
  const shared = {
    seriesId,
    date: draft.date,
    location: draft.location.trim(),
    description: draft.notes.trim() || undefined,
    ...recurring,
  }
  if (draft.type === "open-slot") {
    const duration = draft.slotDuration
    const slotCount = Math.floor((draft.endMinutes - draft.startMinutes) / duration)
    return Array.from({ length: slotCount }, (_, index) => {
      const startMinutes = draft.startMinutes + index * duration
      const itemSeriesId = slotCount > 1 ? `${seriesId}-slot-${index + 1}` : seriesId
      return {
        ...shared,
        id: `${seriesId}-slot-${index + 1}`,
        slotSeriesId: itemSeriesId,
        type: "open-slot",
        startMinutes,
        endMinutes: startMinutes + duration,
        title: "Consultation availability",
      }
    })
  }
  if (draft.type === "class") {
    return [{
      ...shared,
      id: `${seriesId}-class`,
      type: "class",
      startMinutes: draft.startMinutes,
      endMinutes: draft.endMinutes,
      title: draft.className.trim(),
      section: draft.classSection?.trim() || undefined,
    }]
  }
  return [{
    ...shared,
    id: `${seriesId}-blocked`,
    type: "blocked-time",
    startMinutes: draft.startMinutes,
    endMinutes: draft.endMinutes,
    title: "Blocked time",
  }]
}

export function validateCalendarCreationDraft(
  draft: CalendarCreationDraft,
  events: CalendarDemoEvent[],
  rules?: AvailabilityRules,
): string | null {
  if (!isIsoDate(draft.date)) return "Choose a valid date."
  if (
    !Number.isInteger(draft.startMinutes) ||
    !Number.isInteger(draft.endMinutes) ||
    draft.startMinutes < 0 ||
    draft.endMinutes > 24 * 60 ||
    draft.startMinutes >= draft.endMinutes
  ) return "End time must be after start time."
  if (!draft.location.trim()) return "Enter a location or room."
  if (draft.type === "class" && !draft.className.trim()) return "Enter a class name or course."
  if (draft.type === "open-slot") {
    if (!Number.isInteger(draft.slotDuration) || draft.slotDuration < 1) {
      return "Choose a valid slot duration."
    }
    if ((draft.endMinutes - draft.startMinutes) % draft.slotDuration !== 0) {
      return "The time range must divide evenly by the selected slot duration. Adjust the end time or duration."
    }
  }
  if (draft.repeat === "weekly" && (
    !isIsoDate(draft.repeatUntil) ||
    draft.repeatUntil < draft.date ||
    draft.repeatUntil > addIsoDays(draft.date, 365)
  )) return "Repeat until must be on or after the first date and within one year."
  const candidates = createCalendarDemoEvents(draft, "calendar-creation-validation")
  if (!candidates.length) return "The selected time range does not contain a complete slot."
  if (draft.type === "open-slot" && rules) {
    const lastDate = draft.repeat === "weekly" ? draft.repeatUntil : draft.date
    for (let date = draft.date; date <= lastDate; date = addIsoDays(date, draft.repeat === "weekly" ? 7 : 1)) {
      const intervals = effectiveAvailabilityIntervals(rules, date)
      const insideWorkingTime = availabilityIntervalsContain(intervals, draft.startMinutes, draft.endMinutes)
      if (!insideWorkingTime) {
        return `Availability on ${date} must fit within that date's working intervals.`
      }
    }
  }
  const conflict = findCalendarEventConflict(events, candidates)
  if (conflict) {
    const conflictDate = conflict.date
    return `This time overlaps with ${conflict.title} on ${conflictDate}.`
  }
  return null
}

export function isCalendarEventVisible(
  event: CalendarDemoEvent,
  filters: CalendarDemoFilters,
): boolean {
  if (event.type === "class") return filters.classes
  if (event.type === "consultation") {
    return filters.consultations &&
      (event.status !== "pending" || filters.pending)
  }
  if (event.type === "open-slot") {
    return filters.openSlots && (!event.archived || filters.showArchived)
  }
  return filters.blockedTime
}

export function calendarDemoWeekSummary(state: CalendarDemoState) {
  const start = startOfIsoWeek(state.selectedDate)
  const end = addIsoDays(start, 6)
  const events = calendarEventsInRange(state.events, start, end)
    .filter((event) => isCalendarEventVisible(event, state.filters))
  return {
    classes: events.filter((event) => event.type === "class").length,
    confirmed: events.filter((event) => event.type === "consultation" && event.status === "confirmed").length,
    pending: events.filter((event) => event.type === "consultation" && event.status === "pending").length,
    openSlots: events.filter((event) => event.type === "open-slot" && !event.archived).length,
    blocked: events.filter((event) => event.type === "blocked-time").length,
  }
}

type TimeInterval = { start: number; end: number }

function mergeTimeIntervals(intervals: TimeInterval[]) {
  const sorted = intervals
    .filter((interval) => interval.start < interval.end)
    .map((interval) => ({
      start: Math.max(0, interval.start),
      end: Math.min(24 * 60, interval.end),
    }))
    .filter((interval) => interval.start < interval.end)
    .sort((left, right) => left.start - right.start || left.end - right.end)
  const merged: TimeInterval[] = []
  for (const interval of sorted) {
    const previous = merged.at(-1)
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end)
    } else {
      merged.push({ ...interval })
    }
  }
  return merged
}

function subtractTimeIntervals(
  available: TimeInterval[],
  occupied: TimeInterval[],
) {
  let remaining = available
  for (const cut of occupied) {
    const next: TimeInterval[] = []
    for (const interval of remaining) {
      if (cut.end <= interval.start || cut.start >= interval.end) {
        next.push(interval)
        continue
      }
      if (cut.start > interval.start) next.push({ start: interval.start, end: cut.start })
      if (cut.end < interval.end) next.push({ start: cut.end, end: interval.end })
    }
    remaining = next
  }
  return remaining
}

/**
 * Appointments count consultation events only. Available minutes are the union
 * of unarchived open slots minus classes, consultations, and blocked time;
 * open-slot overlaps therefore never inflate the total.
 */
export function calendarDaySummary(events: CalendarDemoEvent[], date: string) {
  const dayEvents = calendarEventsInRange(events, date, date)
  const consultations = dayEvents.filter((event): event is ConsultationCalendarEvent =>
    event.type === "consultation" &&
    event.status !== "cancelled" &&
    event.status !== "declined",
  )
  const openSlots = mergeTimeIntervals(
    dayEvents
      .filter((event) => event.type === "open-slot" && !event.archived)
      .map(({ startMinutes, endMinutes }) => ({ start: startMinutes, end: endMinutes })),
  )
  const occupied = mergeTimeIntervals(
    dayEvents
      .filter((event) =>
        event.type !== "open-slot" &&
        !(event.type === "consultation" &&
          (event.status === "cancelled" || event.status === "declined")),
      )
      .map(({ startMinutes, endMinutes }) => ({ start: startMinutes, end: endMinutes })),
  )
  const availableMinutes = subtractTimeIntervals(openSlots, occupied)
    .reduce((total, interval) => total + interval.end - interval.start, 0)
  const conflictEvents = dayEvents.filter((event) =>
    event.type !== "open-slot" &&
    !(event.type === "consultation" &&
      (event.status === "cancelled" || event.status === "declined")),
  )
  let conflicts = 0
  for (let left = 0; left < conflictEvents.length; left += 1) {
    for (let right = left + 1; right < conflictEvents.length; right += 1) {
      const bothBlocked =
        conflictEvents[left].type === "blocked-time" &&
        conflictEvents[right].type === "blocked-time"
      if (!bothBlocked &&
        conflictEvents[left].startMinutes < conflictEvents[right].endMinutes &&
        conflictEvents[right].startMinutes < conflictEvents[left].endMinutes) conflicts += 1
    }
  }
  return {
    classes: dayEvents.filter((event) => event.type === "class").length,
    consultations: consultations.length,
    pendingRequests: consultations.filter((event) => event.status === "pending").length,
    totalAppointments: consultations.length,
    availableMinutes,
    conflicts,
  }
}

function isCalendarDemoEvent(value: unknown): value is CalendarDemoEvent {
  if (!value || typeof value !== "object") return false
  const event = value as Partial<CalendarDemoEvent>
  if (
    typeof event.id !== "string" ||
    !isIsoDate(event.date) ||
    typeof event.startMinutes !== "number" ||
    typeof event.endMinutes !== "number" ||
    event.startMinutes < 0 ||
    event.endMinutes > 24 * 60 ||
    event.startMinutes >= event.endMinutes ||
    typeof event.title !== "string"
  ) return false
  if (event.type === "blocked-time" && event.allDay !== undefined &&
    typeof event.allDay !== "boolean") return false
  if (event.description !== undefined && typeof event.description !== "string") return false
  if (
    event.excludedDates !== undefined &&
    (!Array.isArray(event.excludedDates) || !event.excludedDates.every(isIsoDate))
  ) return false
  if (
    (event.recurrence !== undefined && event.recurrence !== "weekly") ||
    (event.recurrenceEnd !== undefined &&
      (!isIsoDate(event.recurrenceEnd) || event.recurrenceEnd < event.date)) ||
    (event.recurrenceEnd !== undefined && event.recurrence !== "weekly") ||
    (event.seriesId !== undefined && typeof event.seriesId !== "string") ||
    (event.slotSeriesId !== undefined && typeof event.slotSeriesId !== "string")
  ) return false
  if (event.type === "class" || event.type === "open-slot" || event.type === "blocked-time") {
    return typeof event.location === "string"
  }
  return event.type === "consultation" &&
    typeof event.student === "string" &&
    typeof event.topic === "string" &&
    typeof event.location === "string" &&
    (event.status === "confirmed" || event.status === "pending" ||
      event.status === "cancelled" || event.status === "declined") &&
    (event.cancellationReason === undefined || typeof event.cancellationReason === "string") &&
    (event.declineReason === undefined || typeof event.declineReason === "string") &&
    (event.status !== "declined" || Boolean(event.declineReason?.trim())) &&
    (event.status !== "cancelled" || Boolean(event.cancellationReason?.trim()))
}

function isAvailabilityRules(value: unknown): value is AvailabilityRules {
  if (!value || typeof value !== "object") return false
  const rules = value as Partial<AvailabilityRules>
  if (
    rules.timeZone !== CALENDAR_TIME_ZONE ||
    !Number.isInteger(rules.defaultSlotDuration) ||
    typeof rules.defaultLocation !== "string" ||
    !Array.isArray(rules.weekly) ||
    rules.weekly.length !== 7 ||
    !Array.isArray(rules.dateOverrides)
  ) return false
  const validIntervals = (intervals: unknown): intervals is AvailabilityInterval[] =>
    Array.isArray(intervals) && intervals.every((interval) =>
      Boolean(interval) &&
      typeof interval === "object" &&
      Number.isInteger((interval as AvailabilityInterval).startMinutes) &&
      Number.isInteger((interval as AvailabilityInterval).endMinutes),
    )
  if (!rules.weekly.every((day) =>
    Boolean(day) &&
    typeof day.enabled === "boolean" &&
    validIntervals(day.intervals) &&
    !validateAvailabilityIntervals(day.intervals),
  )) return false
  if (!rules.dateOverrides.every((override) =>
    Boolean(override) &&
    isIsoDate(override.date) &&
    typeof override.unavailable === "boolean" &&
    validIntervals(override.intervals) &&
    !validateAvailabilityIntervals(override.intervals) &&
    (override.unavailable
      ? override.intervals.length === 0
      : override.intervals.length > 0),
  )) return false
  return !validateAvailabilityRules(rules as AvailabilityRules)
}

export function isCalendarDemoState(value: unknown): value is CalendarDemoState {
  if (!value || typeof value !== "object") return false
  const state = value as Partial<CalendarDemoState>
  const filters = state.filters
  return Array.isArray(state.events) &&
    state.events.every(isCalendarDemoEvent) &&
    isIsoDate(state.selectedDate) &&
    isIsoDate(state.visibleMonth) &&
    state.visibleMonth.endsWith("-01") &&
    (state.activeView === "day" ||
      state.activeView === "week" ||
      state.activeView === "month" ||
      state.activeView === "year") &&
    (state.selectedEventId === null || typeof state.selectedEventId === "string") &&
    typeof state.acceptingRequests === "boolean" &&
    (state.availabilityRules === undefined || isAvailabilityRules(state.availabilityRules)) &&
    (state.dayActionIntent === undefined ||
      state.dayActionIntent === null ||
      (
        typeof state.dayActionIntent === "object" &&
        ["create-slot", "copy-day", "block-day", "add-class-hours"]
          .includes(state.dayActionIntent.action) &&
        isIsoDate(state.dayActionIntent.date)
      )) &&
    !!filters &&
    ["classes", "consultations", "pending", "openSlots", "blockedTime", "showArchived"]
      .every((key) => typeof filters[key as keyof CalendarDemoFilters] === "boolean")
}

const LEGACY_DEMO_CLASS_IDS = new Set(["class-cs301", "class-cs412", "class-cs301-extra"])

function isLegacyDemoClass(event: unknown): event is CalendarDemoEvent {
  if (!event || typeof event !== "object") return false
  const candidate = event as Partial<CalendarDemoEvent>
  if (candidate.type !== "class" || typeof candidate.id !== "string") return false
  const baseId = candidate.id.split("@", 1)[0]
  return LEGACY_DEMO_CLASS_IDS.has(baseId)
}

export function hasLegacyDemoClasses(events: unknown): boolean {
  return Array.isArray(events) && events.some(isLegacyDemoClass)
}

export function loadCalendarDemoState(storage: Pick<Storage, "getItem"> | null) {
  if (!storage) return createInitialCalendarDemoState()
  const saved = storage.getItem(CALENDAR_DEMO_STORAGE_KEY)
  if (saved === null) return createInitialCalendarDemoState()
  const parsed: unknown = JSON.parse(saved)
  if (!isCalendarDemoState(parsed)) {
    throw new Error("Saved calendar demo data is invalid. The saved data was left unchanged.")
  }
  const events = parsed.events.filter((event) => !isLegacyDemoClass(event))
  const removedIds = new Set(parsed.events.filter(isLegacyDemoClass).map((event) => event.id))
  return {
    ...parsed,
    events,
    selectedEventId: parsed.selectedEventId && removedIds.has(parsed.selectedEventId)
      ? null
      : parsed.selectedEventId,
    availabilityRules: parsed.availabilityRules ?? createDefaultAvailabilityRules(),
  }
}

export function saveCalendarDemoState(
  storage: Pick<Storage, "setItem"> | null,
  state: CalendarDemoState,
) {
  if (!storage) return
  storage.setItem(CALENDAR_DEMO_STORAGE_KEY, JSON.stringify(state))
}
