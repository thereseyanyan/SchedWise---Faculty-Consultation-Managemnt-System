import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { X } from "lucide-react"
import { confirmAction } from "../../confirmation"
import {
  addIsoDays,
  createCalendarDemoEvents,
  findCalendarEventConflict,
  validateCalendarCreationDraft,
  type AvailabilityRules,
  type CalendarCreationDraft,
  type CalendarDemoEvent,
} from "./calendarDemoState"

type Props = {
  date: string
  initialType: CalendarCreationDraft["type"]
  initialDraft?: CalendarCreationDraft
  events: CalendarDemoEvent[]
  availabilityRules: AvailabilityRules
  validateDraft?: (draft: CalendarCreationDraft) => string | null
  onSave: (draft: CalendarCreationDraft) => Promise<boolean>
  onClose: () => void
  saving: boolean
}

const TABS: { type: CalendarCreationDraft["type"]; label: string }[] = [
  { type: "open-slot", label: "Consultation Slot" },
  { type: "class", label: "Class schedule" },
  { type: "blocked-time", label: "Blocked Time" },
]

function timeInputValue(minutes: number) {
  if (minutes < 0) return ""
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function timeInputMinutes(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1
}

function createSeriesId() {
  return `demo-series-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function CalendarEventCreationDialog({
  date,
  initialType,
  initialDraft,
  events,
  availabilityRules,
  validateDraft,
  onSave,
  onClose,
  saving,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const closePendingRef = useRef(false)
  const submittingRef = useRef(false)
  const [dirty, setDirty] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [draft, setDraft] = useState<CalendarCreationDraft>(() => initialDraft ?? ({
    type: initialType,
    date,
    startMinutes: 14 * 60,
    endMinutes: 15 * 60,
    slotDuration: availabilityRules.defaultSlotDuration,
    location: availabilityRules.defaultLocation,
    repeat: "none",
    repeatUntil: addIsoDays(date, 28),
    notes: "",
    className: "",
    classSection: "",
  }))

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    dialog.showModal()
    dateInputRef.current?.focus()
    return () => {
      if (dialog.open) dialog.close()
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus({ preventScroll: true })
      }
    }
  }, [])

  const validationError = useMemo(
    () => validateDraft
      ? validateDraft(draft)
      : validateCalendarCreationDraft(draft, events, availabilityRules),
    [draft, events, validateDraft, availabilityRules],
  )
  const slotCount = draft.type === "open-slot" &&
    draft.slotDuration > 0 &&
    draft.endMinutes > draft.startMinutes &&
    (draft.endMinutes - draft.startMinutes) % draft.slotDuration === 0
    ? (draft.endMinutes - draft.startMinutes) / draft.slotDuration
    : 0
  const repeatCount = useMemo(() => {
    if (draft.repeat !== "weekly" || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(draft.repeatUntil) || draft.repeatUntil < draft.date) return 1
    let count = 0
    for (let occurrence = draft.date; occurrence <= draft.repeatUntil; occurrence = addIsoDays(occurrence, 7)) {
      count += 1
    }
    return count
  }, [draft.date, draft.repeat, draft.repeatUntil])
  const previewConflict = useMemo(() => {
    if (validationError) return null
    const candidates = createCalendarDemoEvents(draft, "calendar-creation-preview")
    return findCalendarEventConflict(events, candidates)
  }, [draft, events, validationError])

  const patch = <K extends keyof CalendarCreationDraft>(
    key: K,
    value: CalendarCreationDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setSubmitError("")
  }

  const closeDialog = () => {
    dialogRef.current?.close()
    onClose()
  }

  const requestClose = async () => {
    if (closePendingRef.current) return
    if (dirty) {
      closePendingRef.current = true
      const discard = await confirmAction("Discard your unsaved changes?")
      closePendingRef.current = false
      if (!discard) return
    }
    closeDialog()
  }

  const save = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (submittingRef.current || saving) return
    const currentError = validateDraft
      ? validateDraft(draft)
      : validateCalendarCreationDraft(draft, events, availabilityRules)
    if (currentError) {
      setSubmitError(currentError)
      return
    }
    if (!initialDraft && createCalendarDemoEvents(draft, createSeriesId()).length === 0) {
      setSubmitError("The selected time range does not contain a complete slot.")
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError("")
    try {
      if (!await onSave(draft)) {
        setSubmitError("Could not save. Try again.")
        return
      }
      closeDialog()
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }
  const saveInProgress = submitting || saving
  const classScheduleOnly = initialType === "class"

  const typeLabel = TABS.find((tab) => tab.type === draft.type)?.label ?? "Availability"
  const saveLabel = draft.type === "open-slot"
    ? "Save availability"
    : draft.type === "class"
      ? "Save class schedule"
      : "Save blocked time"

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="calendar-create-title"
      aria-describedby="calendar-create-description"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return
        event.preventDefault()
        event.stopPropagation()
        void requestClose()
      }}
      onCancel={(event) => {
        event.preventDefault()
        void requestClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) void requestClose()
      }}
      className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-[640px] overflow-hidden rounded-2xl border border-violet-100 bg-white p-0 text-ink shadow-2xl backdrop:bg-slate-950/50"
    >
      <form onSubmit={save} className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-divider px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Calendar &amp; Availability</p>
            <h2 id="calendar-create-title" className="mt-1 font-[var(--font-display)] text-xl font-semibold text-ink">
                {classScheduleOnly
                  ? `${initialDraft ? "Edit" : "Create"} class schedule`
                  : `${initialDraft ? "Edit" : "Create"} ${typeLabel.toLowerCase()}`}
            </h2>
            <p id="calendar-create-description" className="mt-1 text-sm text-muted">
              Local calendar
            </p>
          </div>
          <button
            type="button"
            aria-label="Close creation dialog"
            disabled={saveInProgress}
            onClick={() => void requestClose()}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-soft hover:text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {!classScheduleOnly ? <div className="grid grid-cols-3 gap-1 rounded-xl bg-page-bg p-1" role="tablist" aria-label="Schedule item type">
            {TABS.map((tab) => (
              <button
                key={tab.type}
                type="button"
                role="tab"
                id={`creation-tab-${tab.type}`}
                aria-selected={draft.type === tab.type}
                aria-controls="calendar-create-panel"
                tabIndex={draft.type === tab.type ? 0 : -1}
                onClick={() => patch("type", tab.type)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
                  event.preventDefault()
                  const direction = event.key === "ArrowRight" ? 1 : -1
                  const index = TABS.findIndex((item) => item.type === draft.type)
                  const next = TABS[(index + direction + TABS.length) % TABS.length]
                  patch("type", next.type)
                  requestAnimationFrame(() => {
                    dialogRef.current?.querySelector<HTMLButtonElement>(`[role="tab"][aria-selected="true"]`)?.focus()
                  })
                }}
                className={`min-h-10 rounded-lg px-2 text-xs font-semibold sm:text-sm focus-visible:outline-2 focus-visible:outline-primary ${
                  draft.type === tab.type ? "bg-white text-primary shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div> : null}

          <div
            id="calendar-create-panel"
            role={classScheduleOnly ? undefined : "tabpanel"}
            aria-labelledby={classScheduleOnly ? "calendar-create-title" : `creation-tab-${draft.type}`}
          >
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-ink">Date <span className="text-rose-700">Required</span></span>
              <input
                ref={dateInputRef}
                type="date"
                required
                value={draft.date}
                onChange={(event) => patch("date", event.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-ink">{classScheduleOnly ? "Room / Location" : "Location / Room"} <span className="text-rose-700">Required</span></span>
              <input
                required
                value={draft.location}
                onChange={(event) => patch("location", event.target.value)}
                maxLength={120}
                placeholder="e.g. Room 302 or Online"
                className="mt-1.5 h-11 w-full rounded-lg border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-ink">Start time <span className="text-rose-700">Required</span></span>
              <input
                type="time"
                required
                value={timeInputValue(draft.startMinutes)}
                onChange={(event) => patch("startMinutes", timeInputMinutes(event.target.value))}
                className="mt-1.5 h-11 w-full rounded-lg border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-ink">End time <span className="text-rose-700">Required</span></span>
              <input
                type="time"
                required
                value={timeInputValue(draft.endMinutes)}
                onChange={(event) => patch("endMinutes", timeInputMinutes(event.target.value))}
                className="mt-1.5 h-11 w-full rounded-lg border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </label>

            {draft.type === "open-slot" ? (
              <label className="block sm:col-span-2">
                <span className="text-sm font-semibold text-ink">Slot duration <span className="text-rose-700">Required</span></span>
                <select
                  required
                  value={draft.slotDuration}
                  onChange={(event) => patch("slotDuration", Number(event.target.value))}
                  className="mt-1.5 h-11 w-full rounded-lg border border-border bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                >
                  {[15, 20, 30, 45, 60, 90].map((minutes) => (
                    <option key={minutes} value={minutes}>{minutes} minutes</option>
                  ))}
                </select>
              </label>
            ) : null}

            {draft.type === "class" ? (
              <label className="block sm:col-span-2">
                <span className="text-sm font-semibold text-ink">Course / Subject <span className="text-rose-700">Required</span></span>
                <input
                  required
                  value={draft.className}
                  onChange={(event) => patch("className", event.target.value)}
                  maxLength={160}
                  placeholder="e.g. CS 301 Data Structures"
                  className="mt-1.5 h-11 w-full rounded-lg border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                />
              </label>
            ) : null}
            {draft.type === "class" ? (
              <label className="block sm:col-span-2">
                <span className="text-sm font-semibold text-ink">Class / Section <span className="font-normal text-muted">(Optional)</span></span>
                <input
                  value={draft.classSection ?? ""}
                  onChange={(event) => patch("classSection", event.target.value)}
                  maxLength={120}
                  placeholder="e.g. BSCS 3A"
                  className="mt-1.5 h-11 w-full rounded-lg border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                />
              </label>
            ) : null}

            {classScheduleOnly ? (
              <label className="flex min-h-11 items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.repeat === "weekly"}
                  onChange={(event) => patch("repeat", event.target.checked ? "weekly" : "none")}
                  className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-primary"
                />
                <span className="text-sm font-semibold text-ink">Repeat weekly</span>
              </label>
            ) : <label className="block sm:col-span-2">
              <span className="text-sm font-semibold text-ink">Repeat</span>
              <select
                value={draft.repeat}
                onChange={(event) => patch("repeat", event.target.value as CalendarCreationDraft["repeat"])}
                className="mt-1.5 h-11 w-full rounded-lg border border-border bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              >
                <option value="none">Does not repeat</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>}
            {draft.repeat === "weekly" ? (
              <label className="block sm:col-span-2">
                <span className="text-sm font-semibold text-ink">Repeat until <span className="text-rose-700">Required</span></span>
                <input
                  type="date"
                  required
                  min={draft.date}
                  max={draft.date ? addIsoDays(draft.date, 365) : undefined}
                  value={draft.repeatUntil}
                  onChange={(event) => patch("repeatUntil", event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                />
              </label>
            ) : null}
            {!classScheduleOnly ? <label className="block sm:col-span-2">
              <span className="text-sm font-semibold text-ink">Notes</span>
              <textarea
                rows={3}
                value={draft.notes}
                onChange={(event) => patch("notes", event.target.value)}
                maxLength={1000}
                placeholder="Optional details for this schedule item"
                className="mt-1.5 w-full resize-y rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </label> : null}
          </div>

          <section className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3" aria-labelledby="calendar-create-preview">
            <h3 id="calendar-create-preview" className="text-sm font-semibold text-violet-950">Live preview</h3>
            <p className="mt-1 text-sm text-violet-950">
              {draft.date || "Choose a date"} · {timeInputValue(draft.startMinutes) || "Start"}–{timeInputValue(draft.endMinutes) || "End"}
            </p>
            <p className="mt-1 text-sm text-violet-950">
              {draft.type === "open-slot"
                ? `${slotCount} slots${draft.repeat === "weekly" ? ` per week · ${slotCount * repeatCount} total` : ""}`
                : draft.type === "class"
                  ? draft.className.trim() || "Class name not set"
                  : "Blocked time"}
              {" · "}{draft.location.trim() || "Room not set"}
            </p>
            {validationError ? <p role="alert" className="mt-2 text-sm font-medium text-rose-800">{validationError}</p> : null}
          </section>
          {submitError ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
              <p>{submitError}</p>
              {submitError === "Could not save. Try again." ? (
                <>
                  <p className="mt-1">
                    {draft.type === "open-slot" ? "Your availability was not changed." : "Your schedule was not changed."}
                  </p>
                  <button type="button" disabled={saveInProgress} onClick={() => void save()} className="mt-2 min-h-9 rounded-full px-3 font-semibold underline underline-offset-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary">
                    {saveInProgress ? "Saving…" : "Try again"}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          </div>
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-divider bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            disabled={saveInProgress}
            onClick={() => void requestClose()}
            className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold text-primary hover:bg-soft disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
          >
            {classScheduleOnly ? "Cancel" : "Discard"}
          </button>
          <button
            type="submit"
            disabled={Boolean(validationError) || saveInProgress}
            className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {saveInProgress ? "Saving…" : initialDraft ? saveLabel.replace("Save", "Update") : saveLabel}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
