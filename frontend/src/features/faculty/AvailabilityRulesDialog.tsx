import { useEffect, useRef, useState } from "react"
import {
  CALENDAR_TIME_ZONE,
  availabilityRulesConflicts,
  effectiveAvailabilityIntervals,
  validateAvailabilityRules,
  type AvailabilityInterval,
  type AvailabilityRules,
  type CalendarDemoEvent,
} from "./calendarDemoState"

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

function formatTime(minutes: number) {
  const date = new Date(Date.UTC(2026, 0, 1, Math.floor(minutes / 60), minutes % 60))
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date)
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
}

function IntervalEditor({
  label,
  intervals,
  onChange,
}: {
  label: string
  intervals: AvailabilityInterval[]
  onChange: (intervals: AvailabilityInterval[]) => void
}) {
  const update = (index: number, property: keyof AvailabilityInterval, value: string) => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
    const minutes = match ? Number(match[1]) * 60 + Number(match[2]) : -1
    onChange(intervals.map((interval, position) => position === index
      ? { ...interval, [property]: minutes }
      : interval))
  }
  const addInterval = () => {
    const startMinutes = Math.max(8 * 60, ...intervals.map((interval) => interval.endMinutes))
    onChange([...intervals, {
      startMinutes,
      endMinutes: Math.min(24 * 60, startMinutes + 60),
    }])
  }
  const inputValue = (minutes: number) => minutes >= 0 && minutes < 24 * 60
    ? `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
    : ""
  return (
    <div className="space-y-2">
      {intervals.map((interval, index) => (
        <div key={`${label}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2">
          <label className="sr-only" htmlFor={`${label}-start-${index}`}>Start time, interval {index + 1}</label>
          <input
            id={`${label}-start-${index}`}
            type="time"
            value={inputValue(interval.startMinutes)}
            onChange={(event) => update(index, "startMinutes", event.target.value)}
            className="min-w-0 rounded-lg border border-border-card px-2 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary"
          />
          <span className="text-sm text-muted">to</span>
          <label className="sr-only" htmlFor={`${label}-end-${index}`}>End time, interval {index + 1}</label>
          <input
            id={`${label}-end-${index}`}
            type="time"
            value={inputValue(interval.endMinutes)}
            onChange={(event) => update(index, "endMinutes", event.target.value)}
            className="min-w-0 rounded-lg border border-border-card px-2 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary"
          />
          <button type="button" onClick={() => onChange(intervals.filter((_, position) => position !== index))} className="min-h-10 rounded-full px-3 text-sm font-semibold text-rose-800 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-700">
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={addInterval} className="min-h-9 rounded-full border border-border px-3 text-sm font-semibold text-primary hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary">
        Add interval
      </button>
    </div>
  )
}

type Props = {
  initialRules: AvailabilityRules
  events: CalendarDemoEvent[]
  selectedDate: string
  onClose: () => void
  onSave: (rules: AvailabilityRules) => Promise<string | null>
  saving: boolean
}

export function AvailabilityRulesDialog({
  initialRules,
  events,
  selectedDate,
  onClose,
  onSave,
  saving,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [rules, setRules] = useState<AvailabilityRules>(() => ({
    ...initialRules,
    weekly: initialRules.weekly.map((day) => ({
      enabled: day.enabled,
      intervals: day.intervals.map((interval) => ({ ...interval })),
    })),
    dateOverrides: initialRules.dateOverrides.map((override) => ({
      ...override,
      intervals: override.intervals.map((interval) => ({ ...interval })),
    })),
  }))
  const [tab, setTab] = useState<"weekly" | "overrides">("weekly")
  const [newOverrideDate, setNewOverrideDate] = useState("")
  const [error, setError] = useState("")
  const [savingRules, setSavingRules] = useState(false)
  const savingRef = useRef(false)
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
  }, [])

  const validationError = validateAvailabilityRules(rules)
  const conflicts = availabilityRulesConflicts(rules, events)
  const patchWeekday = (index: number, patch: Partial<AvailabilityRules["weekly"][number]>) => {
    setRules((current) => ({
      ...current,
      weekly: current.weekly.map((day, position) => position === index ? { ...day, ...patch } : day),
    }))
    setError("")
  }
  const patchOverride = (
    index: number,
    patch: Partial<AvailabilityRules["dateOverrides"][number]>,
  ) => {
    setRules((current) => ({
      ...current,
      dateOverrides: current.dateOverrides.map((override, position) =>
        position === index ? { ...override, ...patch } : override),
    }))
    setError("")
  }
  const addOverride = () => {
    if (!isValidDate(newOverrideDate) ||
      rules.dateOverrides.some((override) => override.date === newOverrideDate)) return
    setRules((current) => ({
      ...current,
      dateOverrides: [...current.dateOverrides, {
        date: newOverrideDate,
        unavailable: false,
        intervals: [{ startMinutes: 9 * 60, endMinutes: 17 * 60 }],
      }].sort((left, right) => left.date.localeCompare(right.date)),
    }))
    setNewOverrideDate("")
    setError("")
  }
  const save = async () => {
    if (savingRef.current || saving) return
    setError("")
    if (validationError) return setError(validationError)
    if (conflicts.length) {
      return setError("Resolve the listed conflicts by adjusting the rules before saving.")
    }
    savingRef.current = true
    setSavingRules(true)
    try {
      const saveError = await onSave(rules)
      if (saveError) return setError(saveError)
      onClose()
    } finally {
      savingRef.current = false
      setSavingRules(false)
    }
  }
  const saveInProgress = saving || savingRules
  const effectiveIntervals = effectiveAvailabilityIntervals(rules, newOverrideDate || selectedDate)

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="availability-rules-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className="m-auto w-[min(100%-1.5rem,680px)] max-h-[min(92dvh,820px)] overflow-hidden rounded-2xl border border-border-card bg-white p-0 text-ink shadow-2xl backdrop:bg-slate-950/40"
    >
      <div className="flex max-h-[min(92dvh,820px)] flex-col">
        <header className="shrink-0 border-b border-divider px-5 py-4">
          <h2 id="availability-rules-title" className="text-lg font-semibold">Availability rules</h2>
          <p className="mt-1 text-sm text-muted">Rules guide future availability creation; they do not create slots or alter existing events.</p>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium text-ink">
              Time zone
              <input readOnly value="GMT+8 · Asia/Shanghai" className="mt-1 block min-h-10 w-full rounded-lg border border-border-card bg-page-bg px-3 text-sm text-ink" />
            </label>
            <label className="text-sm font-medium text-ink">
              Default slot duration
              <select value={rules.defaultSlotDuration} onChange={(event) => setRules((current) => ({ ...current, defaultSlotDuration: Number(event.target.value) }))} className="mt-1 block min-h-10 w-full rounded-lg border border-border-card bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary">
                {[15, 20, 30, 45, 60, 90, 120].map((duration) => <option key={duration} value={duration}>{duration} minutes</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-ink">
              Default location
              <input value={rules.defaultLocation} onChange={(event) => setRules((current) => ({ ...current, defaultLocation: event.target.value }))} className="mt-1 block min-h-10 w-full rounded-lg border border-border-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary" />
            </label>
          </div>
          <div className="flex gap-2 border-b border-divider" role="tablist" aria-label="Availability rule type">
            {([
              ["weekly", "Fixed Weekly"],
              ["overrides", "Date Overrides"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                id={`availability-rules-tab-${value}`}
                type="button"
                role="tab"
                aria-selected={tab === value}
                aria-controls="availability-rules-panel"
                tabIndex={tab === value ? 0 : -1}
                onClick={() => setTab(value)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
                  event.preventDefault()
                  const nextTab = value === "weekly" ? "overrides" : "weekly"
                  setTab(nextTab)
                  requestAnimationFrame(() => {
                    document.getElementById(`availability-rules-tab-${nextTab}`)?.focus()
                  })
                }}
                className={`min-h-10 border-b-2 px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary ${tab === value ? "border-primary text-primary" : "border-transparent text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div id="availability-rules-panel" role="tabpanel" aria-labelledby={`availability-rules-tab-${tab}`}>
            {tab === "weekly" ? (
              <div className="space-y-3">
                {rules.weekly.map((day, index) => (
                  <section key={WEEKDAYS[index]} className="rounded-xl border border-divider p-3">
                    <label className="inline-flex min-h-8 items-center gap-2 text-sm font-semibold text-ink">
                      <input type="checkbox" checked={day.enabled} onChange={(event) => patchWeekday(index, { enabled: event.target.checked })} className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-primary" />
                      {WEEKDAYS[index]}
                    </label>
                    {day.enabled
                      ? <div className="mt-2"><IntervalEditor label={`weekly-${index}`} intervals={day.intervals} onChange={(intervals) => patchWeekday(index, { intervals })} /></div>
                      : <p className="mt-1 text-sm text-muted">Unavailable every {WEEKDAYS[index].toLowerCase()}.</p>}
                  </section>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-sm font-medium text-ink">
                    Add override date
                    <input type="date" value={newOverrideDate} onChange={(event) => setNewOverrideDate(event.target.value)} className="mt-1 block min-h-10 rounded-lg border border-border-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary" />
                  </label>
                  <button type="button" disabled={!isValidDate(newOverrideDate) || rules.dateOverrides.some((override) => override.date === newOverrideDate)} onClick={addOverride} className="min-h-10 rounded-full border border-border px-4 text-sm font-semibold text-primary enabled:hover:bg-soft disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">
                    Add date override
                  </button>
                </div>
                <p className="text-xs text-muted">
                  Effective rule for {newOverrideDate || selectedDate}: {effectiveIntervals.length
                    ? effectiveIntervals.map((interval) => `${formatTime(interval.startMinutes)}–${formatTime(interval.endMinutes)}`).join(", ")
                    : "Unavailable"}
                </p>
                {rules.dateOverrides.length ? rules.dateOverrides.map((override, index) => (
                  <section key={`${override.date}-${index}`} className="rounded-xl border border-divider p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-sm font-semibold text-ink">
                        Date
                        <input type="date" value={override.date} onChange={(event) => patchOverride(index, { date: event.target.value })} className="ml-2 min-h-9 rounded-lg border border-border-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-primary" />
                      </label>
                      <button type="button" onClick={() => setRules((current) => ({ ...current, dateOverrides: current.dateOverrides.filter((_, position) => position !== index) }))} className="min-h-9 rounded-full px-3 text-sm font-semibold text-rose-800 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-700">
                        Remove date
                      </button>
                    </div>
                    <label className="mt-2 inline-flex min-h-9 items-center gap-2 text-sm text-ink">
                      <input type="checkbox" checked={override.unavailable} onChange={(event) => patchOverride(index, {
                        unavailable: event.target.checked,
                        intervals: event.target.checked ? [] : override.intervals.length
                          ? override.intervals
                          : [{ startMinutes: 9 * 60, endMinutes: 17 * 60 }],
                      })} className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-primary" />
                      Unavailable for this date
                    </label>
                    {!override.unavailable ? (
                      <div className="mt-2"><IntervalEditor label={`override-${override.date}`} intervals={override.intervals} onChange={(intervals) => patchOverride(index, { intervals })} /></div>
                    ) : null}
                  </section>
                )) : <p className="rounded-xl border border-dashed border-divider p-4 text-sm text-muted">No date overrides yet.</p>}
              </div>
            )}
          </div>
          {conflicts.length ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3" role="alert">
              <p className="text-sm font-semibold text-amber-950">Existing schedule conflicts with these rules</p>
              <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-amber-900">
                {conflicts.slice(0, 30).map((event) => (
                  <li key={`${event.id}-${event.date}`}>{event.title} · {event.date} · {formatTime(event.startMinutes)}–{formatTime(event.endMinutes)}</li>
                ))}
              </ul>
              {conflicts.length > 30 ? <p className="mt-2 text-xs text-amber-900">{conflicts.length - 30} more conflicts.</p> : null}
            </div>
          ) : null}
          {validationError ? <p className="text-sm text-rose-800" role="alert">{validationError}</p> : null}
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
              <p>{error}</p>
              {error === "Could not save. Try again." ? (
                <>
                  <p className="mt-1">Your availability was not changed.</p>
                  <button type="button" disabled={saveInProgress} onClick={() => void save()} className="mt-2 min-h-9 rounded-full px-3 font-semibold underline underline-offset-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">
                    {saveInProgress ? "Saving…" : "Try again"}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        <footer className="flex shrink-0 justify-end gap-3 border-t border-divider p-4">
          <button type="button" disabled={saveInProgress} onClick={onClose} className="min-h-10 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">Cancel</button>
          <button type="button" disabled={Boolean(validationError) || conflicts.length > 0 || saveInProgress} onClick={() => void save()} className="min-h-10 rounded-full bg-primary px-4 text-sm font-semibold text-white enabled:hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{saveInProgress ? "Saving…" : "Save availability rules"}</button>
        </footer>
      </div>
    </dialog>
  )
}
