import { useContext, useState, type ReactNode } from "react"
import {
  AlertTriangle,
  CalendarDays,
  Check,
  MapPin,
  Repeat,
  RotateCcw,
  X,
} from "lucide-react"
import { confirmAction } from "../../confirmation"
import { ApiError, type UiAppointment } from "../../api"
import {
  AvailabilityBlock,
  Button,
  ButtonTag,
  CalendarErrorContext,
  FieldError,
  InputTag,
  SelectTag,
  StatusBadge,
  TextareaTag,
  WaveHeader,
  clock,
  consultationHasEnded,
  errorMessage,
  formatDate,
  fromIso,
  pillButton,
  pillField,
  pillLabel,
  readOnlyPill,
  statusLabel,
  statusTone,
  timeRange,
} from "../../shared"
import { DAY_END, WEEKDAYS, cardShadow, timeOptions } from "./facultyCalendar"

export function PanelFrame({
  eyebrow,
  title,
  subtitle,
  onClose,
  children,
}: {
  eyebrow: string
  title: string
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const panelError = useContext(CalendarErrorContext)
  return (
    <section
      className={`panel-in overflow-hidden rounded-2xl bg-white ${cardShadow}`}
    >
      <div className="relative h-32 overflow-hidden">
        <WaveHeader className="h-32" />
        <div className="relative flex items-start justify-between gap-3 p-5 text-white">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-purple-100">
              {eyebrow}
            </p>
            <p className="mt-1 truncate text-lg font-bold tracking-tight">
              {title}
            </p>
            {subtitle && (
              <div className="mt-0.5 truncate text-xs text-purple-100">
                {subtitle}
              </div>
            )}
          </div>
          <ButtonTag
            type="button"
            aria-label="Close panel"
            title="Back to availability rules"
            onClick={onClose}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/20 transition hover:bg-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X size={15} />
          </ButtonTag>
        </div>
      </div>
      <div className="space-y-5 px-5 pb-5"><FieldError message={panelError || undefined} />{children}</div>
    </section>
  )
}

export function TimeSelects({
  start,
  end,
  onChange,
}: {
  start: number
  end: number
  onChange: (range: { start: number; end: number }) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className={pillLabel}>Start</span>
        <SelectTag
          value={start}
          onChange={(e) => {
            const s = Number(e.target.value)
            onChange({
              start: s,
              end: end <= s ? Math.min(DAY_END, s + (end - start)) : end,
            })
          }}
          className={`${pillField} cursor-pointer`}
        >
          {timeOptions
            .filter((t) => t < DAY_END)
            .map((t) => (
              <option key={t} value={t}>
                {clock(t)}
              </option>
            ))}
        </SelectTag>
      </label>
      <label className="block">
        <span className={pillLabel}>End</span>
        <SelectTag
          value={end}
          onChange={(e) => onChange({ start, end: Number(e.target.value) })}
          className={`${pillField} cursor-pointer`}
        >
          {timeOptions
            .filter((t) => t > start)
            .map((t) => (
              <option key={t} value={t}>
                {clock(t)}
              </option>
            ))}
        </SelectTag>
      </label>
    </div>
  )
}

export function ConflictNote({ show, text }: { show: boolean; text: string }) {
  if (!show) return null
  return (
    <p
      role="alert"
      className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700"
    >
      {text}
    </p>
  )
}

export function AppointmentPanel({
  appointment,
  onClose,
  onUpdate,
  onCancel,
  hasClash,
}: {
  appointment: UiAppointment
  onClose: () => void
  onUpdate: (patch: Partial<UiAppointment>) => void | Promise<void>
  onCancel: (reason: string) => Promise<void>
  hasClash: (iso: string, start: number, end: number) => boolean
}) {
  const studentId = appointment.student_number ?? appointment.student_id
  const course = appointment.student_program ?? "Not on file"
  const [summary, setSummary] = useState(appointment.summary ?? "")
  const [saveError, setSaveError] = useState("")
  const [savingNotes, setSavingNotes] = useState(false)
  const [notes, setNotes] = useState(appointment.notes)
  // A shared summary is only present when a consultation record already exists.
  // Freeze the form after saving so a second create cannot hit the 409 guard.
  const [savedNotes, setSavedNotes] = useState(() => Boolean(appointment.summary?.trim()))
  const [rescheduling, setRescheduling] = useState(false)
  const [rescheduleError, setRescheduleError] = useState<{
    message: string
    conflict: boolean
  } | null>(null)
  const [rescheduleBusy, setRescheduleBusy] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelError, setCancelError] = useState("")
  const [cancelBusy, setCancelBusy] = useState(false)
  const [slot, setSlot] = useState({
    date: appointment.date,
    start: appointment.start,
    end: appointment.end,
  })
  const clash = rescheduling && hasClash(slot.date, slot.start, slot.end)
  const confirmUpdate = async (patch: Partial<UiAppointment>, message: string) => {
    if (!await confirmAction(message)) return false
    try { await onUpdate(patch); setSaveError(""); return true }
    catch (err) { setSaveError(errorMessage(err, "Unable to update appointment.")); return false }
  }
  const moveAppointment = async (alreadyConfirmed = false) => {
    if (clash || rescheduleBusy) return
    if (!alreadyConfirmed && !await confirmAction(
      `Move this appointment to ${formatDate(fromIso(slot.date), { month: "short", day: "numeric" })}, ${timeRange(slot.start, slot.end)}?`,
    )) return
    setRescheduleBusy(true)
    setRescheduleError(null)
    try {
      await onUpdate(slot)
      setRescheduling(false)
    } catch (err) {
      setRescheduleError({
        message: errorMessage(err, "Unable to move this appointment. Check the new time and try again."),
        conflict: err instanceof ApiError && err.status === 409,
      })
    } finally {
      setRescheduleBusy(false)
    }
  }
  const cancelAppointment = async () => {
    if (cancelBusy) return
    if (!cancelReason.trim()) {
      setCancelError("Enter a reason so the student knows why the appointment was cancelled.")
      return
    }
    if (!await confirmAction("Cancel this appointment? The student will be notified with your reason.")) return
    setCancelBusy(true)
    setCancelError("")
    try {
      await onCancel(cancelReason.trim())
      setCancelling(false)
    } catch (err) {
      setCancelError(errorMessage(err, "Unable to cancel this appointment."))
    } finally {
      setCancelBusy(false)
    }
  }
  const isAwaitingApproval = ["pending", "reschedule_requested"].includes(appointment.status)
  const isCancelled = appointment.status === "cancelled"
  const isNoShow = appointment.status === "no_show"
  const isFinal = ["cancelled", "rejected", "completed", "no_show"].includes(appointment.status)
  const hasEnded = consultationHasEnded(appointment.date, appointment.end)

  return (
    <PanelFrame
      eyebrow="Consultation request"
      title={appointment.student}
      subtitle={`Student ID ${studentId}`}
      onClose={onClose}
    >
      <div className="flex items-center justify-between">
        <StatusBadge tone={statusTone[appointment.status]}>
          {statusLabel[appointment.status]}
        </StatusBadge>
        <span className="text-xs tabular-nums text-slate-500">
          {timeRange(appointment.start, appointment.end)}
        </span>
      </div>

      {appointment.status === "reschedule_requested" && (
        <div
          role="status"
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900"
        >
          <p className="text-sm font-semibold">Student requested a new time</p>
          <p className="mt-1 text-xs leading-5">
            Requested for{" "}
            {formatDate(fromIso(appointment.date), {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}{" "}
            at {timeRange(appointment.start, appointment.end)}. Approve below to
            confirm this time, or use Reschedule to offer a different slot.
          </p>
          {appointment.reschedule_reason && (
            <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-xs leading-5">
              Student note: “{appointment.reschedule_reason}”
            </p>
          )}
        </div>
      )}

      {appointment.status === "pending" && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
          This request is waiting for your decision. Approve it below, or
          reschedule or cancel it if the time no longer works.
        </p>
      )}

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <span className={pillLabel}>Student ID</span>
            <p className={readOnlyPill}>{studentId}</p>
          </div>
          <div className="min-w-0">
            <span className={pillLabel}>Date</span>
            <p className={readOnlyPill}>
              {formatDate(fromIso(appointment.date), {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
        </div>
        <div>
          <span className={pillLabel}>Course</span>
          <p className={readOnlyPill} title={course}>
            {course}
          </p>
        </div>
        <div>
          <span className={pillLabel}>Topic</span>
          <p className={readOnlyPill} title={appointment.topic}>
            {appointment.topic}
          </p>
        </div>
        <div>
          <span className={pillLabel}>Consultation reason</span>
          <p className="rounded-2xl border border-purple-100 bg-slate-50/60 px-4 py-3 text-sm leading-6 text-slate-700">
            {appointment.reason}
          </p>
        </div>
      </div>

      {!isFinal && (
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-purple-100 px-4 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-800">
              {appointment.status === "reschedule_requested"
                ? "Approve New Time"
                : "Approve Request"}
            </span>
            <span className="block text-xs text-slate-500">
              {isAwaitingApproval
                ? appointment.status === "reschedule_requested"
                  ? "Slide to confirm the student's requested time"
                  : "Slide to confirm this consultation"
                : "Confirmed — approval controls are locked"}
            </span>
          </span>
          <InputTag
            type="checkbox"
            role="switch"
            checked={!isAwaitingApproval}
            disabled={!isAwaitingApproval}
            onChange={() => { void confirmUpdate({ status: "confirmed" }, appointment.status === "reschedule_requested" ? "Approve this reschedule request?" : "Approve this appointment request?") }}
            className="peer sr-only"
          />
          <span className="relative h-7 w-12 shrink-0 rounded-full bg-slate-200 transition peer-checked:bg-[#10B981] peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 peer-focus-visible:ring-offset-2 after:absolute after:left-0.5 after:top-0.5 after:size-6 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
        </label>
      )}

      {appointment.status === "confirmed" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button className={pillButton}
            onClick={() => { void confirmUpdate({ status: "completed" }, "Mark this consultation as completed?") }}>
            <Check size={14} /> Mark completed
          </Button>
          <Button
            disabled={!hasEnded}
            title={hasEnded ? "Record that the student did not attend" : "Available after the consultation ends"}
            onClick={() => { void confirmUpdate({ status: "no_show" }, "Mark this appointment as a no-show?") }}
            className={`${pillButton} border-rose-200 bg-white text-rose-700 hover:bg-rose-50`}
          >
            <AlertTriangle size={14} /> Mark no-show
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {isFinal ? (
          <Button
            disabled
            className={`${pillButton} flex-1 border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
          >
            <Repeat size={14} /> {isCancelled ? "Cancelled request" : isNoShow ? "No-show recorded" : "Consultation closed"}
          </Button>
        ) : (
          <>
            <Button
              onClick={() => {
                setRescheduling((v) => !v)
                setCancelling(false)
                setRescheduleError(null)
              }}
              className={`${pillButton} flex-1 border-purple-200 ${rescheduling ? "bg-purple-50 text-purple-700" : "bg-white text-slate-700 hover:bg-purple-50"}`}
            >
              <CalendarDays size={14} /> Reschedule
            </Button>
            <Button
              onClick={() => {
                setCancelling((value) => !value)
                setRescheduling(false)
                setCancelError("")
              }}
              className={`${pillButton} flex-1 border-rose-300 bg-white text-rose-700 hover:bg-rose-50`}
            >
              <X size={14} /> Cancel
            </Button>
          </>
        )}
      </div>

      {rescheduling && !isFinal && (
        <div className="panel-in space-y-3 rounded-2xl border border-purple-100 bg-purple-50/40 p-4">
          <p className="text-xs leading-5 text-slate-500">
            Moving the appointment updates the calendar immediately and notifies
            the student. If the new time is no longer free, this form stays open
            so you can retry or choose another slot.
          </p>
          <label className="block">
            <span className={pillLabel}>New date</span>
            <InputTag
              type="date"
              value={slot.date}
              onChange={(e) => {
                if (!e.target.value) return
                setSlot({ ...slot, date: e.target.value })
                setRescheduleError(null)
              }}
              className={pillField}
            />
          </label>
          <TimeSelects
            start={slot.start}
            end={slot.end}
            onChange={(range) => {
              setSlot({ ...slot, ...range })
              setRescheduleError(null)
            }}
          />
          <ConflictNote
            show={clash}
            text="Another consultation already occupies this time. Pick another slot before moving the appointment."
          />
          {rescheduleError && (
            <div
              role="alert"
              className={`space-y-2 rounded-2xl border px-4 py-3 ${
                rescheduleError.conflict
                  ? "border-rose-300 bg-rose-50 text-rose-800"
                  : "border-amber-300 bg-amber-50 text-amber-900"
              }`}
            >
              <p className="text-xs font-semibold">
                {rescheduleError.conflict
                  ? "That time is no longer available"
                  : "Could not move this appointment"}
              </p>
              <p className="text-xs leading-5">{rescheduleError.message}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={rescheduleBusy || clash}
                  onClick={() => { void moveAppointment(true) }}
                  className="gap-1.5 rounded-xl border border-current bg-white px-3 py-1.5 text-[11px] font-semibold hover:bg-white/70 disabled:opacity-50"
                >
                  <RotateCcw size={12} />
                  {rescheduleBusy ? "Retrying…" : "Retry same time"}
                </Button>
                <Button
                  disabled={rescheduleBusy}
                  onClick={() => setRescheduleError(null)}
                  className="rounded-xl px-3 py-1.5 text-[11px] font-semibold underline underline-offset-2 disabled:opacity-50"
                >
                  Choose another time
                </Button>
              </div>
            </div>
          )}
          <Button
            disabled={clash || rescheduleBusy}
            onClick={() => { void moveAppointment() }}
            className="w-full gap-2 rounded-[4px] border border-purple-700 bg-purple-600 py-2.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {rescheduleBusy ? "Moving…" : <>Move to {formatDate(fromIso(slot.date), { month: "short", day: "numeric" })},{" "}
            {clock(slot.start)}</>}
          </Button>
        </div>
      )}

      {cancelling && !isFinal && (
        <div className="panel-in space-y-3 rounded-2xl border border-rose-200 bg-rose-50/40 p-4">
          <p className="text-xs leading-5 text-slate-600">
            The appointment will be cancelled and the student will be notified
            with your reason.
          </p>
          <label className="block">
            <span className={pillLabel}>Reason for cancelling</span>
            <TextareaTag
              rows={3}
              value={cancelReason}
              maxLength={5000}
              aria-invalid={Boolean(cancelError)}
              aria-describedby={cancelError ? "faculty-cancel-error" : undefined}
              onChange={(event) => {
                setCancelReason(event.target.value)
                setCancelError("")
              }}
              placeholder="Explain why this appointment cannot go ahead..."
              className={`${pillField} resize-none`}
            />
          </label>
          {cancelError && (
            <p id="faculty-cancel-error" role="alert" className="text-xs font-medium text-rose-700">
              {cancelError}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              onClick={() => setCancelling(false)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              Keep appointment
            </Button>
            <Button
              disabled={cancelBusy}
              onClick={() => { void cancelAppointment() }}
              className="rounded-[4px] bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {cancelBusy ? "Cancelling…" : "Confirm cancellation"}
            </Button>
          </div>
        </div>
      )}

      <div className="border-t border-slate-100 pt-5">
        <label className="mb-4 block">
          <span className={pillLabel}>Summary shared with the student</span>
          <TextareaTag
            rows={3}
            value={summary}
            maxLength={10000}
            readOnly={savedNotes}
            onChange={(event) => { setSummary(event.target.value); setSavedNotes(false) }}
            placeholder="Agreed actions and follow-up instructions"
            className={pillField}
          />
        </label>
        {saveError && <p role="alert" className="mb-3 text-sm text-rose-600">{saveError}</p>}
        <label className="block">
          <span className={pillLabel}>Private faculty notes</span>
          <TextareaTag
            rows={6}
            value={notes}
            readOnly={savedNotes}
            onChange={(e) => {
              setNotes(e.target.value)
              setSavedNotes(false)
            }}
            placeholder="Confidential notes for the assigned faculty member only..."
            className={`${pillField} resize-y leading-6`}
          />
        </label>
        {savedNotes && (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-800">
            This consultation record is already saved and cannot be edited here.
            Review the complete record, including private notes, in Consultation Records.
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">Private notes are visible only to you. Save a record after completing the appointment.</p>
          <Button
            onClick={async () => {
              if (!await confirmAction("Save this consultation summary and private notes?")) return
              setSavingNotes(true)
              setSaveError("")
              try {
                await onUpdate({ notes, summary })
                setSavedNotes(true)
              } catch (err) {
                setSavedNotes(false)
                setSaveError(errorMessage(err, "Unable to save consultation record."))
              } finally { setSavingNotes(false) }
            }}
            disabled={savingNotes || !summary.trim() || appointment.status !== "completed" || savedNotes}
            className="gap-2 rounded-[4px] border border-purple-700 bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700"
          >
            {savedNotes ? (
              <>
                <Check size={14} /> Saved
              </>
            ) : (
              "Save Notes"
            )}
          </Button>
        </div>
      </div>
    </PanelFrame>
  )
}

export function BlockPanel({
  block,
  iso,
  duration,
  defaultLocation,
  onClose,
  onSave,
  onDelete,
  overlaps,
}: {
  block: AvailabilityBlock
  iso: string
  duration: number
  defaultLocation: string
  onClose: () => void
  onSave: (patch: Partial<AvailabilityBlock>) => void | Promise<void>
  onDelete: () => void
  overlaps: (start: number, end: number) => boolean
}) {
  const dayLocation = block.dayLocations?.[iso]
  const [range, setRange] = useState({ start: block.start, end: block.end })
  const [customOn, setCustomOn] = useState(dayLocation !== undefined)
  const [custom, setCustom] = useState(dayLocation ?? defaultLocation)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [busy, setBusy] = useState(false)
  const clash = overlaps(range.start, range.end)
  const available = block.kind === "available"
  const minutes = range.end - range.start
  const date = fromIso(iso)

  const save = async () => {
    if (busy || clash) return
    setBusy(true)
    setSaveError("")
    try {
      if (!await confirmAction(`Save changes to this ${block.date ? "one-time" : "weekly recurring"} schedule, ${timeRange(range.start, range.end)}?`)) return
      const nextLocations = { ...(block.dayLocations ?? {}) }
      if (available && customOn && custom.trim()) nextLocations[iso] = custom.trim()
      else delete nextLocations[iso]
      await onSave({ ...range, dayLocations: nextLocations })
      setSaved(true)
    } catch (err) { setSaveError(errorMessage(err, "Unable to save schedule changes.")) }
    finally { setBusy(false) }
  }

  return (
    <PanelFrame
      eyebrow={available ? "Availability block" : "Blocked time"}
      title={available ? "Available for Consultation" : "Blocked / Class Hours"}
      subtitle={
        <span className="flex items-center gap-1.5">
          {block.date ? <CalendarDays size={11} /> : <Repeat size={11} />}
          {block.date
            ? `Only on ${formatDate(date, { month: "short", day: "numeric" })}`
            : `Repeats every ${WEEKDAYS[date.getDay()]}`}
        </span>
      }
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className={pillLabel}>Duration</span>
          <p className={readOnlyPill}>
            {minutes >= 60 ? `${minutes / 60} hr` : `${minutes} min`}
          </p>
        </div>
        <div>
          <span className={pillLabel}>{available ? "Bookable slots" : "Status"}</span>
          <p className={readOnlyPill}>
            {available
              ? `${Math.floor(minutes / duration)} × ${duration} min`
              : "No bookings"}
          </p>
        </div>
      </div>

      <TimeSelects
        start={range.start}
        end={range.end}
        onChange={(r) => {
          setRange(r)
          setSaved(false)
        }}
      />

      {available && (
        <div className="space-y-3">
          <div>
            <span className={pillLabel}>Location / room</span>
            <p className={`${readOnlyPill} flex items-center gap-2`}>
              <MapPin size={14} className="shrink-0 text-slate-400" />
              <span className="truncate">
                {customOn && custom ? custom : defaultLocation || "Not set"}
              </span>
            </p>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-purple-100 px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-slate-800">
                Different location this day
              </span>
              <span className="block text-xs text-slate-500">
                Only {formatDate(date, { weekday: "short", month: "short", day: "numeric" })}
              </span>
            </span>
            <InputTag
              type="checkbox"
              role="switch"
              checked={customOn}
              onChange={(e) => {
                setCustomOn(e.target.checked)
                setSaved(false)
              }}
              className="peer sr-only"
            />
            <span className="relative h-6 w-10 shrink-0 rounded-full bg-slate-200 transition peer-checked:bg-purple-600 peer-focus-visible:ring-2 peer-focus-visible:ring-purple-500 peer-focus-visible:ring-offset-2 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4" />
          </label>
          {customOn && (
            <InputTag
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value)
                setSaved(false)
              }}
              placeholder="e.g. Room 118 or https://meet…"
              className={`${pillField} panel-in`}
            />
          )}
        </div>
      )}

      <ConflictNote show={clash} text="This range overlaps another block on this day." />
      <FieldError message={saveError} />

      <div className="space-y-2 border-t border-slate-100 pt-5">
        <Button
          onClick={save}
          disabled={clash || busy}
          className="w-full gap-2 rounded-[4px] border border-purple-700 bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
        >
          {saved ? (
            <>
              <Check size={15} /> Changes saved
            </>
          ) : (
            "Save changes"
          )}
        </Button>
        <Button
          onClick={onDelete}
          className="w-full gap-2 rounded-[4px] border border-red-800 bg-red-700 py-2.5 text-sm font-semibold text-white hover:bg-red-800"
        >
          <X size={15} /> Delete / Remove Time Slot
        </Button>
        {!block.date && (
          <p className="text-center text-[11px] text-slate-400">
            Removes this block from every {WEEKDAYS[date.getDay()]}.
          </p>
        )}
      </div>
    </PanelFrame>
  )
}
