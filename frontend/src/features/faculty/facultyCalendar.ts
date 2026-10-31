import type { Appointment, FacultyAvailability, ScheduleOverride } from "../../api"
import { addDays, startOfWeek } from "../../shared"

export const HOUR_PX = 56
export const DAY_START = 7 * 60
export const DAY_END = 18 * 60
export const SNAP = 15
export const GRID_HEIGHT = ((DAY_END - DAY_START) / 60) * HOUR_PX
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]
export const hourLabels = Array.from(
  { length: (DAY_END - DAY_START) / 60 + 1 },
  (_, i) => DAY_START / 60 + i,
)
export const timeOptions = Array.from(
  { length: (DAY_END - DAY_START) / SNAP + 1 },
  (_, i) => DAY_START + i * SNAP,
)

export const cardShadow = "border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"

const localeWeekStart = (() => {
  try {
    const locale = new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale) as Intl.Locale & {
      weekInfo?: { firstDay?: number }
      getWeekInfo?: () => { firstDay?: number }
    }
    const firstDay = locale.weekInfo?.firstDay ?? locale.getWeekInfo?.().firstDay
    if (typeof firstDay === "number" && firstDay >= 1 && firstDay <= 7) return firstDay % 7
  } catch {
    // Fall back to Monday for environments without Intl.Locale week info.
  }
  return 1
})()

export function startOfLocaleWeek(date: Date): Date {
  return addDays(date, -((date.getDay() - localeWeekStart + 7) % 7))
}

export function monthGridDates(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const gridStart = startOfWeek(first)
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
  const weeks = Math.ceil((((first.getDay() + 6) % 7) + daysInMonth) / 7)
  return Array.from({ length: weeks * 7 }, (_, index) => addDays(gridStart, index))
}

export type TimeBlock = {
  start: number
  end: number
}

const ACTIVE_STATUSES = ["pending", "confirmed", "reschedule_requested"] as const

function mergeBlocks(blocks: TimeBlock[]): TimeBlock[] {
  const sorted = blocks
    .filter((block) => block.end > block.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: TimeBlock[] = []
  for (const block of sorted) {
    const last = merged[merged.length - 1]
    if (last && block.start <= last.end) {
      last.end = Math.max(last.end, block.end)
    } else {
      merged.push({ ...block })
    }
  }
  return merged
}

function subtractBlocks(blocks: TimeBlock[], cuts: TimeBlock[]): TimeBlock[] {
  let result = blocks
  for (const cut of mergeBlocks(cuts)) {
    const next: TimeBlock[] = []
    for (const block of result) {
      if (cut.end <= block.start || cut.start >= block.end) {
        next.push(block)
        continue
      }
      if (cut.start > block.start) next.push({ start: block.start, end: cut.start })
      if (cut.end < block.end) next.push({ start: cut.end, end: block.end })
    }
    result = next
  }
  return result
}

export function todayOpenTime(
  availability: FacultyAvailability[],
  overrides: ScheduleOverride[],
  appointments: Appointment[],
  date: string,
  weekday: number,
): { blocks: TimeBlock[]; minutes: number } {
  const weekly = availability
    .filter((block) => block.active && block.weekday === weekday)
    .map((block) => ({ start: block.start_minutes, end: block.end_minutes }))
  const available = overrides
    .filter(
      (override) =>
        override.date === date &&
        override.kind === "available" &&
        override.start_minutes !== undefined &&
        override.end_minutes !== undefined,
    )
    .map((override) => ({
      start: override.start_minutes as number,
      end: override.end_minutes as number,
    }))
  const blocked = overrides
    .filter(
      (override) =>
        override.date === date &&
        override.kind === "blocked" &&
        override.start_minutes !== undefined &&
        override.end_minutes !== undefined,
    )
    .map((override) => ({
      start: override.start_minutes as number,
      end: override.end_minutes as number,
    }))
  const activeAppointments = appointments
    .filter((appointment) => appointment.appointment_date === date)
    .filter((appointment) => ACTIVE_STATUSES.includes(appointment.status as (typeof ACTIVE_STATUSES)[number]))
  const busy = activeAppointments.map((appointment) => ({
    start: appointment.start_minutes,
    end: appointment.end_minutes,
  }))

  const blocks = subtractBlocks(
    subtractBlocks(mergeBlocks([...weekly, ...available]), blocked),
    busy,
  )

  const free =
    weekly.reduce((total, block) => total + Math.max(0, block.end - block.start), 0) +
    available.reduce((total, block) => total + Math.max(0, block.end - block.start), 0) -
    blocked.reduce((total, block) => total + Math.max(0, block.end - block.start), 0)
  const busyMinutes = activeAppointments.reduce(
    (total, appointment) => total + Math.max(0, appointment.end_minutes - appointment.start_minutes),
    0,
  )

  return {
    blocks,
    minutes: Math.max(0, free - busyMinutes),
  }
}

export function openTimeTodayLabel(minutes: number): string | null {
  if (minutes <= 0) return null
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m of open time today`
  if (hours > 0) return `${hours}h of open time today`
  return `${mins}m of open time today`
}
