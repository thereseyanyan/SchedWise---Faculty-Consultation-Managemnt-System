import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import {
  addIsoDays,
  prepareCalendarDayCopies,
  wholeDayBlockPlan,
  type AvailabilityRules,
  type CalendarDemoEvent,
} from "./calendarDemoState"

function dateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}

function timeLabel(minutes: number) {
  const date = new Date(Date.UTC(2026, 0, 1, Math.floor(minutes / 60), minutes % 60))
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date)
}

function useDialogFocus(dialogRef: RefObject<HTMLDialogElement | null>) {
  const previousFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    dialog.querySelector<HTMLButtonElement>("button")?.focus()
    return () => {
      if (dialog.open) dialog.close()
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus({ preventScroll: true })
    }
  }, [dialogRef])
}

export function CopyCalendarDayDialog({
  events,
  sourceDate,
  rules,
  onClose,
  onConfirm,
}: {
  events: CalendarDemoEvent[]
  sourceDate: string
  rules: AvailabilityRules
  onClose: () => void
  onConfirm: (copies: CalendarDemoEvent[]) => Promise<boolean>
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useDialogFocus(dialogRef)
  const [dateInput, setDateInput] = useState(addIsoDays(sourceDate, 1))
  const [destinations, setDestinations] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const plan = useMemo(
    () => prepareCalendarDayCopies(events, sourceDate, destinations, rules),
    [events, sourceDate, destinations, rules],
  )
  const addDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput) || destinations.includes(dateInput)) return
    setDestinations((current) => [...current, dateInput].sort())
    setDateInput("")
  }
  const confirm = async () => {
    if (saving) return
    setSaving(true)
    setSaveError("")
    try {
      if (!await onConfirm(plan.copies)) setSaveError("Could not save. Try again.")
    } finally {
      setSaving(false)
    }
  }
  const validDate = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
    const [year, month, day] = date.split("-").map(Number)
    const parsed = new Date(Date.UTC(year, month - 1, day))
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
  }
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="copy-calendar-day-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className="m-auto w-[min(100%-1.5rem,560px)] max-h-[min(92dvh,760px)] overflow-hidden rounded-2xl border border-border-card bg-white p-0 text-ink shadow-2xl backdrop:bg-slate-950/40"
    >
      <div className="flex max-h-[min(92dvh,760px)] flex-col">
        <header className="shrink-0 border-b border-divider px-5 py-4">
          <h2 id="copy-calendar-day-title" className="text-lg font-semibold">Copy this day to…</h2>
          <p className="mt-1 text-sm text-muted">Copy classes, unbooked availability, and blocked time from {dateLabel(sourceDate)}. Student consultations and pending requests are never copied.</p>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium text-ink">
              Destination date
              <input type="date" value={dateInput} onChange={(event) => setDateInput(event.target.value)} className="mt-1 block min-h-10 rounded-lg border border-border-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary" />
            </label>
            <button type="button" disabled={!validDate(dateInput) || destinations.includes(dateInput)} onClick={addDate} className="min-h-10 rounded-full border border-border px-4 text-sm font-semibold text-primary enabled:hover:bg-soft disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">
              Add date
            </button>
          </div>
          {destinations.length ? (
            <ul className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-divider p-3">
              {destinations.map((date) => (
                <li key={date} className="flex items-center justify-between gap-2 text-sm">
                  <span>{dateLabel(date)}</span>
                  <button type="button" aria-label={`Remove ${dateLabel(date)}`} onClick={() => setDestinations((current) => current.filter((item) => item !== date))} className="min-h-9 rounded-full px-3 font-semibold text-rose-800 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-700">Remove</button>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-xl border border-dashed border-divider p-4 text-sm text-muted">Add one or more destination dates to preview the copies.</p>}
          <section className="rounded-xl border border-divider p-3">
            <h3 className="text-sm font-semibold text-ink">Preview</h3>
            <p className="mt-1 text-sm text-muted">{plan.sourceEvents.length} eligible source {plan.sourceEvents.length === 1 ? "item" : "items"} · {plan.copies.length} proposed copies across {destinations.length} destination {destinations.length === 1 ? "date" : "dates"}.</p>
            {plan.sourceEvents.length ? (
              <ul className="mt-2 max-h-36 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-ink">
                {plan.sourceEvents.slice(0, 30).map((event) => <li key={event.id}>{event.title} · {timeLabel(event.startMinutes)}–{timeLabel(event.endMinutes)}</li>)}
              </ul>
            ) : <p className="mt-2 text-sm text-muted">No classes, unbooked availability, or blocked time are available to copy.</p>}
          </section>
          {plan.errors.length ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3" role="alert">
              <p className="text-sm font-semibold text-rose-900">Copies need attention</p>
              <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-rose-900">
                {plan.errors.map((error, index) => <li key={`${error.date}-${index}`}>{error.date}: {error.message}</li>)}
              </ul>
            </div>
          ) : null}
          {saveError ? (
            <p className="text-sm text-rose-800" role="alert">
              {saveError} Your schedule was not changed.
              <button type="button" disabled={saving} onClick={() => void confirm()} className="ml-2 min-h-9 rounded-full px-2 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary">
                Try again
              </button>
            </p>
          ) : null}
        </div>
        <footer className="flex shrink-0 justify-end gap-3 border-t border-divider p-4">
          <button type="button" disabled={saving} onClick={onClose} className="min-h-10 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">Cancel</button>
          <button type="button" disabled={!destinations.length || !plan.copies.length || plan.errors.length > 0 || saving} onClick={() => void confirm()} className="min-h-10 rounded-full bg-primary px-4 text-sm font-semibold text-white enabled:hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{saving ? "Saving…" : "Copy day"}</button>
        </footer>
      </div>
    </dialog>
  )
}

export function BlockWholeDayDialog({
  events,
  date,
  onClose,
  onConfirm,
}: {
  events: CalendarDemoEvent[]
  date: string
  onClose: () => void
  onConfirm: (slotIds: string[]) => Promise<boolean>
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useDialogFocus(dialogRef)
  const plan = useMemo(() => wholeDayBlockPlan(events, date), [events, date])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const canBlock = !plan.commitments.length && !plan.bookedSlots.length && !plan.alreadyBlocked
  const confirm = async () => {
    if (saving) return
    setSaving(true)
    setSaveError("")
    try {
      if (!await onConfirm(plan.slotsToRemove.map((event) => event.id))) {
        setSaveError("Could not save. Try again.")
      }
    } finally {
      setSaving(false)
    }
  }
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="block-whole-day-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className="m-auto w-[min(100%-1.5rem,520px)] max-h-[min(92dvh,680px)] overflow-hidden rounded-2xl border border-border-card bg-white p-0 text-ink shadow-2xl backdrop:bg-slate-950/40"
    >
      <div className="flex max-h-[min(92dvh,680px)] flex-col">
        <header className="shrink-0 border-b border-divider px-5 py-4">
          <h2 id="block-whole-day-title" className="text-lg font-semibold">Block whole day?</h2>
          <p className="mt-1 text-sm text-muted">{dateLabel(date)} will be unavailable for the full calendar day.</p>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {plan.commitments.length ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3" role="alert">
              <p className="text-sm font-semibold text-rose-900">Resolve these classes or active appointments first.</p>
              <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-rose-900">
                {plan.commitments.map((event) => <li key={event.id}>{event.title} · {timeLabel(event.startMinutes)}–{timeLabel(event.endMinutes)}</li>)}
              </ul>
            </div>
          ) : null}
          {plan.bookedSlots.length ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900" role="alert">A booked availability slot remains. Cancel or decline its appointment with a written reason before blocking this day.</p>
          ) : null}
          {plan.alreadyBlocked ? (
            <p className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900" role="status">This date already has a whole-day block.</p>
          ) : null}
          {!plan.commitments.length && plan.slotsToRemove.length ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-950">The following {plan.slotsToRemove.length} unbooked {plan.slotsToRemove.length === 1 ? "availability slot will" : "availability slots will"} be removed:</p>
              <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-amber-900">
                {plan.slotsToRemove.map((event) => <li key={event.id}>{event.title} · {timeLabel(event.startMinutes)}–{timeLabel(event.endMinutes)}</li>)}
              </ul>
              <p className="mt-2 text-sm text-amber-950">Confirming removes only these unbooked slots and adds an explicit all-day block. Other records are left unchanged.</p>
            </section>
          ) : null}
          {!plan.commitments.length && !plan.slotsToRemove.length && !plan.alreadyBlocked ? (
            <p className="text-sm text-muted">No availability slots need to be removed.</p>
          ) : null}
          {saveError ? (
            <p className="text-sm text-rose-800" role="alert">
              {saveError} Your availability was not changed.
              <button type="button" disabled={saving} onClick={() => void confirm()} className="ml-2 min-h-9 rounded-full px-2 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary">
                Try again
              </button>
            </p>
          ) : null}
        </div>
        <footer className="flex shrink-0 justify-end gap-3 border-t border-divider p-4">
          <button type="button" disabled={saving} onClick={onClose} className="min-h-10 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">Cancel</button>
          {canBlock ? <button type="button" disabled={saving} onClick={() => void confirm()} className="min-h-10 rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{saving ? "Saving…" : "Confirm whole-day block"}</button> : null}
        </footer>
      </div>
    </dialog>
  )
}
