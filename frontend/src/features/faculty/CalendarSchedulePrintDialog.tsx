import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  CALENDAR_TIME_ZONE,
  addIsoDays,
  calendarPrintEvents,
  calendarPrintRange,
  type CalendarDemoEvent,
  type CalendarPrintPeriod,
} from "./calendarDemoState"

type Props = {
  initialDate: string
  facultyName: string
  events: CalendarDemoEvent[]
  loading: boolean
  loadError?: string
  onRetryLoad: () => void
  onClose: () => void
}

function dateLabel(isoDate: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T12:00:00Z`))
}

function timeLabel(minutes: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 1, 0, minutes)))
}

function eventTypeAndStatus(event: CalendarDemoEvent) {
  if (event.type === "consultation") {
    const rawStatus = event.status?.replace(/_/g, " ")
    const label = rawStatus === "cancelled"
      ? "Canceled"
      : rawStatus
        ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1)
        : ""
    const status = label ? ` · ${label}` : ""
    return `Consultation${status}`
  }
  if (event.type === "class") return "Class"
  if (event.type === "open-slot") return "Availability"
  return "Blocked time"
}

function eventActivity(event: CalendarDemoEvent) {
  if (event.type === "class" && event.section) {
    return `${event.title} · ${event.section}`
  }
  if (event.type === "consultation") {
    const student = event.student?.trim()
    const topic = event.topic?.trim()
    if (student && topic) return `${event.title} · ${student} · ${topic}`
    if (student) return `${event.title} · ${student}`
    if (topic) return `${event.title} · ${topic}`
  }
  return event.title
}

export function CalendarSchedulePrintDialog({
  initialDate,
  facultyName,
  events,
  loading,
  loadError = "",
  onRetryLoad,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const printingRef = useRef(false)
  const printTimeoutRef = useRef<number | null>(null)
  const closeRef = useRef(onClose)
  const [period, setPeriod] = useState<CalendarPrintPeriod>("day")
  const [date, setDate] = useState(initialDate)
  const [preparing, setPreparing] = useState(true)
  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState("")
  const range = useMemo(() => calendarPrintRange(date, period), [date, period])
  const printEvents = useMemo(() => calendarPrintEvents(events, range), [events, range])
  const dates = useMemo(() => {
    const result: string[] = []
    for (let day = range.start; day <= range.end; day = addIsoDays(day, 1)) {
      result.push(day)
    }
    return result
  }, [range])
  const summary = period === "day"
    ? dateLabel(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : `${dateLabel(range.start, { month: "short", day: "numeric", year: "numeric" })} – ${dateLabel(range.end, { month: "short", day: "numeric", year: "numeric" })}`
  const eventsByDate = useMemo(() => {
    const byDate = new Map<string, CalendarDemoEvent[]>()
    for (const event of printEvents) {
      const current = byDate.get(event.date) ?? []
      current.push(event)
      byDate.set(event.date, current)
    }
    return byDate
  }, [printEvents])

  closeRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    dialog.showModal()
    dialog.querySelector<HTMLInputElement>("input")?.focus()
    const handleCancel = (event: Event) => {
      event.preventDefault()
      closeRef.current()
    }
    dialog.addEventListener("cancel", handleCancel)
    return () => {
      dialog.removeEventListener("cancel", handleCancel)
      if (dialog.open) dialog.close()
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus({ preventScroll: true })
      }
    }
  }, [])

  useEffect(() => {
    if (loading || loadError) {
      setPreparing(true)
      return
    }
    setPreparing(true)
    const frame = window.requestAnimationFrame(() => setPreparing(false))
    return () => window.cancelAnimationFrame(frame)
  }, [loading, loadError, period, date, events])

  useEffect(() => {
    const finishPrint = () => {
      if (printTimeoutRef.current !== null) {
        window.clearTimeout(printTimeoutRef.current)
        printTimeoutRef.current = null
      }
      printingRef.current = false
      setPrinting(false)
    }
    window.addEventListener("afterprint", finishPrint)
    return () => {
      window.removeEventListener("afterprint", finishPrint)
      if (printTimeoutRef.current !== null) {
        window.clearTimeout(printTimeoutRef.current)
      }
    }
  }, [])

  const handlePrint = () => {
    if (printingRef.current || preparing || loading || loadError || printEvents.length === 0) return
    printingRef.current = true
    setPrinting(true)
    setPrintError("")
    try {
      printTimeoutRef.current = window.setTimeout(() => {
        printingRef.current = false
        setPrinting(false)
        printTimeoutRef.current = null
      }, 15000)
      window.print()
    } catch {
      if (printTimeoutRef.current !== null) {
        window.clearTimeout(printTimeoutRef.current)
        printTimeoutRef.current = null
      }
      printingRef.current = false
      setPrinting(false)
      setPrintError("Unable to open the print dialog. Try again.")
    }
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        aria-labelledby="calendar-print-heading"
        aria-describedby="calendar-print-note"
        className="m-auto max-h-[min(90dvh,42rem)] w-[min(440px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-border-card bg-white p-0 text-ink shadow-2xl backdrop:bg-slate-950/40"
      >
        <form method="dialog" onSubmit={(event) => event.preventDefault()} className="p-5 sm:p-6">
          <h2 id="calendar-print-heading" className="font-[var(--font-display)] text-xl font-bold">
            Print schedule
          </h2>
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">Period</legend>
            <div className="mt-2 flex gap-3">
              {(["day", "week"] as const).map((value) => (
                <label key={value} className="flex min-h-10 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium">
                  <input
                    type="radio"
                    name="calendar-print-period"
                    value={value}
                    checked={period === value}
                    onChange={() => setPeriod(value)}
                    className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  />
                  {value === "day" ? "Day" : "Week"}
                </label>
              ))}
            </div>
          </fieldset>
          <label htmlFor="calendar-print-date" className="mt-4 block text-sm font-semibold">
            Date
          </label>
          <input
            id="calendar-print-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1 min-h-10 w-full rounded-lg border border-border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
          <p className="mt-3 rounded-lg bg-soft px-3 py-2 text-sm" aria-live="polite">
            <span className="font-semibold">Printing: </span>{summary}
          </p>
          <p id="calendar-print-note" className="mt-2 text-xs text-muted">
            Includes all non-archived schedule items. Time zone: {CALENDAR_TIME_ZONE}.
          </p>
          {loading || preparing ? (
            <p className="mt-3 text-sm text-muted" role="status" aria-live="polite">
              Preparing schedule…
            </p>
          ) : null}
          {loadError ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900" role="alert">
              <p>Could not load the complete schedule. {loadError}</p>
              <button
                type="button"
                onClick={onRetryLoad}
                className="mt-2 min-h-10 rounded-full border border-rose-800 px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-800"
              >
                Retry
              </button>
            </div>
          ) : null}
          {!loading && !loadError && !preparing && printEvents.length === 0 ? (
            <p className="mt-3 text-sm text-muted" role="status">
              No schedule to print for this period.
            </p>
          ) : null}
          {printError ? <p className="mt-3 text-sm text-rose-800" role="alert">{printError}</p> : null}
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 flex-1 rounded-full border border-border px-4 text-sm font-semibold text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || Boolean(loadError) || preparing || printing || printEvents.length === 0}
              className="min-h-10 flex-1 rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {printing ? "Preparing…" : "Print"}
            </button>
          </div>
        </form>
      </dialog>
      {createPortal(
        <div id="calendar-schedule-print-document" aria-hidden="true">
          <header className="calendar-print-header">
            <p className="calendar-print-brand">SchedWise</p>
            <p className="calendar-print-demo">Demo</p>
            <h1>Faculty Schedule</h1>
            <p><strong>Faculty:</strong> {facultyName}</p>
            <p><strong>Period:</strong> {summary}</p>
            <p><strong>Time zone:</strong> {CALENDAR_TIME_ZONE}</p>
          </header>
          {dates.map((day) => {
            const dayEvents = eventsByDate.get(day) ?? []
            return (
              <section key={day} className="calendar-print-day">
                {period === "week" ? (
                  <h2>{dateLabel(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h2>
                ) : null}
                {dayEvents.length === 0 ? (
                  <p className="calendar-print-empty">No scheduled activities</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Time</th>
                        <th scope="col">Class / Activity</th>
                        <th scope="col">Room / Location</th>
                        <th scope="col">Type / Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayEvents.map((event) => (
                        <tr key={event.id}>
                          <td className="calendar-print-time">
                            {event.type === "blocked-time" && event.allDay
                              ? "All day"
                              : `${timeLabel(event.startMinutes)} – ${timeLabel(event.endMinutes)}`}
                          </td>
                          <td>{eventActivity(event)}</td>
                          <td>{event.location || "—"}</td>
                          <td>{eventTypeAndStatus(event)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
