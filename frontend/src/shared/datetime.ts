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
