export const pad = (n: number) => String(n).padStart(2, "0")
export const toIso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (d: Date, n: number) => {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  copy.setDate(copy.getDate() + n)
  return copy
}
export const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7))
export const formatDate = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  d.toLocaleDateString("en-US", opts)
export const dateTimeInTimeZone = (value: string, timeZone?: string) => {
  if (!value) return null
  const normalized = value.replace(" ", "T")
  if (!timeZone || /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized)) {
    const date = new Date(normalized)
    return Number.isFinite(date.getTime()) ? date : null
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(normalized)
  if (!match) return null
  const [, year, month, day, hour, minute, second = "0"] = match
  const wallTime = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second)
  let timestamp = wallTime

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const parts = formatter.formatToParts(new Date(timestamp))
      const part = (type: string) => Number(parts.find((item) => item.type === type)?.value)
      const zonedWallTime = Date.UTC(
        part("year"),
        part("month") - 1,
        part("day"),
        part("hour"),
        part("minute"),
        part("second"),
      )
      timestamp = wallTime - (zonedWallTime - timestamp)
    }
    return new Date(timestamp)
  } catch {
    const date = new Date(normalized)
    return Number.isFinite(date.getTime()) ? date : null
  }
}
export const relativeTime = (value: string, timeZone?: string) => {
  const date = dateTimeInTimeZone(value, timeZone)
  if (!date) return "Time unavailable"
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return "Just now"
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  }).format(date)
}
export const clock = (min: number, meridiem = true) => {
  const h24 = Math.floor(min / 60)
  const h = h24 % 12 || 12
  return `${h}:${pad(min % 60)}${meridiem ? ` ${h24 >= 12 ? "PM" : "AM"}` : ""}`
}
export const timeRange = (start: number, end: number) =>
  `${clock(start, start >= 720 !== end >= 720)} – ${clock(end)}`
export const datePartsInTimeZone = (timeZone?: string, now = new Date()) => {
  let date = toIso(now)
  let minutes = now.getHours() * 60 + now.getMinutes()
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(now)
      const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ""
      const year = value("year")
      const month = value("month")
      const day = value("day")
      const hour = Number(value("hour"))
      const minute = Number(value("minute"))
      if (year && month && day && Number.isFinite(hour) && Number.isFinite(minute)) {
        date = `${year}-${month}-${day}`
        minutes = hour * 60 + minute
      }
    } catch {
      // Fall back to the browser clock when the configured zone is invalid.
    }
  }
  return { date, minutes }
}
export const todayInTimeZone = (timeZone?: string, now = new Date()) =>
  datePartsInTimeZone(timeZone, now).date
export const dateKeyInTimeZone = (value: string, timeZone?: string) => {
  const date = dateTimeInTimeZone(value, timeZone)
  if (!date) return ""
  return datePartsInTimeZone(timeZone, date).date
}
export const relativeDateHeading = (dateKey: string, timeZone?: string, now = new Date()) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "Date unavailable"
  const date = new Date(`${dateKey}T00:00:00Z`)
  if (!Number.isFinite(date.getTime())) return "Date unavailable"

  const today = todayInTimeZone(timeZone, now)
  if (dateKey === today) return "Today"
  const todayDate = fromIso(today)
  if (dateKey === toIso(addDays(todayDate, -1))) return "Yesterday"
  if (dateKey < today && dateKey >= toIso(startOfWeek(todayDate))) {
    return "Earlier this week"
  }
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}
export const consultationHasEnded = (date: string, endMinutes: number, timeZone?: string) => {
  const now = datePartsInTimeZone(timeZone)
  if (date < now.date) return true
  if (date > now.date) return false
  return now.minutes >= endMinutes
}

export const localZone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
})()
export const zones = Array.from(
  new Set([
    localZone,
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "Europe/London",
    "Asia/Manila",
    "Asia/Singapore",
    "Australia/Sydney",
  ]),
)
export const zoneLabel = (tz: string) => {
  let offset = ""
  try {
    offset =
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        timeZoneName: "shortOffset",
      } as unknown as Intl.DateTimeFormatOptions)
        .formatToParts(new Date())
        .find((part) => part.type === "timeZoneName")?.value ?? ""
  } catch {
    offset = ""
  }
  return `${tz.replace(/_/g, " ")}${offset ? ` (${offset})` : ""}`
}
