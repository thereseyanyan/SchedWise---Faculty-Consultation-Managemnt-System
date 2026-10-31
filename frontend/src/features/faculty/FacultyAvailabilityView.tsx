import {
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  Link2,
  MapPin,
  Pencil,
  Plus,
  Repeat,
  Timer,
  X,
} from "lucide-react"
import {
  appointmentApi,
  facultyAvailabilityApi,
  facultyScheduleOverridesApi,
  type FacultyAvailability,
  type ScheduleOverride,
} from "../../api"
import { confirmAction } from "../../confirmation"
import {
  AppointmentPanel,
  BlockPanel,
  ConflictNote,
  PanelFrame,
  TimeSelects,
} from "./AppointmentPanels"
import {
  DAY_END,
  DAY_START,
  GRID_HEIGHT,
  HOUR_PX,
  SNAP,
  WEEKDAYS,
  cardShadow,
  hourLabels,
} from "./facultyCalendar"
import {
  Button,
  ButtonTag,
  CalendarErrorContext,
  CurrentUserContext,
  FieldError,
  InputTag,
  PageTitle,
  Segmented,
  SelectTag,
  addDays,
  applyAppointmentPatch,
  clock,
  errorMessage,
  formatDate,
  fromIso,
  fullName,
  localZone,
  mergeAppointment,
  pillField,
  pillLabel,
  startOfWeek,
  statusLabel,
  timeRange,
  toIso,
  useAppointments,
  zoneLabel,
  zones,
  type AvailabilityBlock,
  type CalendarView,
  type RuleMode,
  type Selection,
  type SlotKind,
} from "../../shared"

export function FacultyAvailabilityView() {
  const currentUser = useContext(CurrentUserContext)
  const [mode, setMode] = useState<RuleMode>("weekly")
  const [timezone, setTimezone] = useState(localZone)
  const [duration, setDuration] = useState(30)
  const [location, setLocation] = useState("Room 302")
  const [saved, setSaved] = useState(false)
  const [view, setView] = useState<CalendarView>("week")
  const [anchor, setAnchor] = useState(() => new Date())
  const [drag, setDrag] = useState<{
    iso: string
    anchor: number
    current: number
  } | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [filters, setFilters] = useState({
    slots: true,
    blocked: true,
    pending: true,
    approved: true,
    cancelled: true,
  })
  const [miniMonth, setMiniMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  )
  const [appointments, updateAppointments] = useAppointments()
  const [facultyAvailability, setFacultyAvailability] = useState<FacultyAvailability[]>([])
  const [facultyOverrides, setFacultyOverrides] = useState<ScheduleOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const facultyId = currentUser?.id ?? ""
  const myAppts = appointments.filter((a) => a.faculty_id === facultyId)
  const apptsFor = (iso: string) => myAppts.filter((a) => a.date === iso)
  const pendingCount = myAppts.filter((a) => ["pending", "reschedule_requested"].includes(a.status)).length
  const idRef = useRef(100)

  // Convert faculty availability and overrides to AvailabilityBlock format
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([])

  // Fetch data when component loads or when faculty changes
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        if (!facultyId) {
          throw new Error("Unable to determine the signed-in faculty account.")
        }

        // Fetch faculty availability
        const availabilityData = await facultyAvailabilityApi.list({ faculty_id: facultyId })
        setFacultyAvailability(availabilityData)

        // Fetch faculty schedule overrides
        const overridesData = await facultyScheduleOverridesApi.list({ faculty_id: facultyId })
        setFacultyOverrides(overridesData)

        // Convert to AvailabilityBlock format
        const availabilityBlocks: AvailabilityBlock[] = []

        // Convert weekly availability
        availabilityData.forEach(avail => {
          availabilityBlocks.push({
            id: avail.id,
            kind: avail.active ? "available" : "blocked",
            start: avail.start_minutes,
            end: avail.end_minutes,
            weekday: avail.weekday
          })
        })

        // Convert schedule overrides (date-specific)
        overridesData.forEach(override => {
          availabilityBlocks.push({
            id: override.id,
            kind: override.kind,
            start: override.start_minutes ?? 0,
            end: override.end_minutes ?? 0,
            date: override.date
          })
        })

        setBlocks(availabilityBlocks)
      } catch (err) {
        setError(errorMessage(err, "Failed to load availability data"))
        setBlocks([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [facultyId])

  // Refetch data when faculty changes (if we had a way to detect faculty changes)
  // For now, we'll rely on manual refresh or implementing faculty context later

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelection(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const todayIso = toIso(new Date())
  const itemsFor = (date: Date) => {
    const iso = toIso(date)
    return blocks
      .filter((b) => (b.date ? b.date === iso : b.weekday === date.getDay()))
      .sort((a, b) => a.start - b.start)
  }
  const overlapsBlock = (iso: string, start: number, end: number, ignore?: string) =>
    itemsFor(fromIso(iso)).some(
      (b) => b.id !== ignore && b.start < end && start < b.end,
    )

  const columns =
    view === "day"
      ? [anchor]
      : Array.from({ length: 5 }, (_, i) => addDays(startOfWeek(anchor), i))

  const monthDates = (() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const gridStart = startOfWeek(first)
    const daysInMonth = new Date(
      anchor.getFullYear(),
      anchor.getMonth() + 1,
      0,
    ).getDate()
    const weeks = Math.ceil((((first.getDay() + 6) % 7) + daysInMonth) / 7)
    return Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i))
  })()

  const shift = (dir: 1 | -1) =>
    setAnchor((current) =>
      view === "month"
        ? new Date(current.getFullYear(), current.getMonth() + dir, 1)
        : addDays(current, (view === "week" ? 7 : 1) * dir),
    )

  const rangeLabel =
    view === "week"
      ? `${formatDate(columns[0], { month: "short", day: "numeric" })} – ${formatDate(columns[4], { month: "short", day: "numeric" })}`
      : view === "day"
        ? formatDate(anchor, { weekday: "long", month: "long", day: "numeric" })
        : `${monthDates.length / 7} weeks`

  const minutesAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const raw = DAY_START + ((event.clientY - rect.top) / HOUR_PX) * 60
    const clamped = Math.min(DAY_END - SNAP, Math.max(DAY_START, raw))
    return Math.floor(clamped / SNAP) * SNAP
  }

  const rangeFor = (a: number, b: number) => {
    let start = Math.min(a, b)
    let end = Math.max(a, b) + SNAP
    if (end - start < duration) end = start + duration
    if (end > DAY_END) {
      end = DAY_END
      start = Math.min(start, Math.max(DAY_START, end - duration))
    }
    return { start, end }
  }

  const removeBlock = async (id: string) => {
    // Find the block to determine if it's availability or override
    const blockToRemove = blocks.find(b => b.id === id)
    if (!blockToRemove) return
    if (!await confirmAction(blockToRemove.date ? "Delete this time slot?" : "Delete this recurring time slot for every week?")) return

    try {
      // Determine if it's an availability or override based on whether it has a date
      if (blockToRemove.date) {
        // It's a schedule override
        await facultyScheduleOverridesApi.delete(id)
      } else {
        // It's a faculty availability
        await facultyAvailabilityApi.delete(id)
      }

      // Remove from local state
      setBlocks((current) => current.filter((b) => b.id !== id))
      setSelection((s) => (s?.type === "block" && s.id === id ? null : s))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete block")
      // Optionally revert the local state change on error
    }
  }

  const selectNew = (iso: string, start: number, end: number) =>
    setSelection({
      type: "new",
      iso,
      start,
      end,
      kind: "available",
      repeat: mode === "weekly",
    })

  const newConflict =
    selection?.type === "new" &&
    overlapsBlock(selection.iso, selection.start, selection.end)

  const createBlock = async () => {
    if (selection?.type !== "new" || newConflict) return
    if (!await confirmAction(`Save this ${selection.repeat ? "weekly recurring" : "one-time"} ${selection.kind} schedule on ${selection.iso}, ${timeRange(selection.start, selection.end)}?`)) return
    const date = fromIso(selection.iso)

    try {
      if (!facultyId) {
        throw new Error("Unable to determine the signed-in faculty account.")
      }

      let createdId: string

      // Determine if it's a recurring availability or a date-specific override
      if (selection.repeat) {
        // Create recurring faculty availability
        const availabilityData = await facultyAvailabilityApi.create({
          faculty_id: facultyId,
          weekday: date.getDay(),
          start_minutes: selection.start,
          end_minutes: selection.end,
          location: location,
          active: selection.kind === "available"
        })
        createdId = availabilityData.id
      } else {
        // Create date-specific schedule override
        const overrideData = await facultyScheduleOverridesApi.create({
          faculty_id: facultyId,
          date: selection.iso,
          kind: selection.kind,
          start_minutes: selection.kind === "available" ? selection.start : undefined,
          end_minutes: selection.kind === "available" ? selection.end : undefined,
          location: selection.kind === "available" ? location : undefined,
          reason: selection.kind === "blocked" ? "Blocked time" : undefined
        })
        createdId = overrideData.id
      }

      // Add to local state with the real ID from the API
      const createdBlock: AvailabilityBlock = {
        id: createdId,
        kind: selection.kind,
        start: selection.start,
        end: selection.end,
        ...(selection.repeat ? { weekday: date.getDay() } : { date: selection.iso }),
      }
      setBlocks((current) => [...current, createdBlock])
      setSelection({ type: "block", id: createdId, iso: selection.iso })
    } catch (err) {
      setError(errorMessage(err, "Failed to create block"))
    }
  }

  // Calculate weekly slots and override count from API data for accuracy
  const weeklySlots = facultyAvailability
    .filter(avail => avail.active)
    .reduce((sum, avail) => sum + Math.floor((avail.end_minutes - avail.start_minutes) / duration), 0)
  const overrideCount = facultyOverrides.length

  const gridCols = {
    gridTemplateColumns: `52px repeat(${columns.length}, minmax(0, 1fr))`,
  }
  const monthTitle = formatDate(view === "week" ? columns[2] : anchor, {
    month: "long",
    year: "numeric",
  })
  const LocationIcon = /^https?:\/\//i.test(location) ? Link2 : MapPin

  const selectedAppt =
    selection?.type === "appt"
      ? (myAppts.find((a) => a.id === selection.id) ?? null)
      : null
  const selectedBlock =
    selection?.type === "block"
      ? (blocks.find((b) => b.id === selection.id) ?? null)
      : null

  const renderColumn = (date: Date, index: number) => {
    const iso = toIso(date)
    const preview =
      drag && drag.iso === iso
        ? rangeFor(drag.anchor, drag.current)
        : selection?.type === "new" && selection.iso === iso
          ? { start: selection.start, end: selection.end }
          : null

    return (
      <div
        key={iso}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          const minute = minutesAt(event)
          setDrag({ iso, anchor: minute, current: minute })
        }}
        onPointerMove={(event) => {
          if (!drag || drag.iso !== iso) return
          const minute = minutesAt(event)
          if (minute !== drag.current) setDrag({ ...drag, current: minute })
        }}
        onPointerUp={(event) => {
          if (!drag || drag.iso !== iso) return
          const range = rangeFor(drag.anchor, minutesAt(event))
          setDrag(null)
          selectNew(iso, range.start, range.end)
        }}
        onPointerCancel={() => setDrag(null)}
        style={{ height: GRID_HEIGHT }}
        className={`relative cursor-cell select-none border-b border-l border-slate-200 ${
          iso === todayIso ? "bg-purple-50/30" : "bg-white"
        } ${index === columns.length - 1 ? "border-r" : ""}`}
      >
        {hourLabels.slice(0, -1).map((hour, i) => (
          <div key={hour} className="pointer-events-none">
            {i > 0 && (
              <div
                style={{ top: i * HOUR_PX }}
                className="absolute inset-x-0 border-t border-[#E2E8F0]"
              />
            )}
            <div
              style={{ top: i * HOUR_PX + HOUR_PX / 2 }}
              className="absolute inset-x-0 border-t border-[#F1F5F9]"
            />
          </div>
        ))}

        {itemsFor(date)
          .filter((b) => (b.kind === "available" ? filters.slots : filters.blocked))
          .map((block) => {
          const height = ((block.end - block.start) / 60) * HOUR_PX - 2
          const top = ((block.start - DAY_START) / 60) * HOUR_PX + 1
          const compact = height < 40
          const isSelected =
            selection?.type === "block" &&
            selection.id === block.id &&
            selection.iso === iso
          const blockLocation = block.dayLocations?.[iso] ?? location
          const available = block.kind === "available"
          const actionClass = `flex size-5 cursor-pointer items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 ${
            available
              ? "bg-purple-800/80 text-white hover:bg-purple-900 focus-visible:ring-white"
              : "bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-900 focus-visible:ring-purple-600"
          }`
          return (
            <div
              key={block.id}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setSelection({ type: "block", id: block.id, iso })}
              style={{ top, height }}
              className={`group absolute inset-x-1 cursor-pointer overflow-hidden rounded-xl px-2 py-1 transition ${
                available
                  ? "bg-purple-600 text-white ring-1 ring-inset ring-purple-700/50 hover:bg-purple-700"
                  : "striped-block border border-slate-200 text-slate-500"
              } ${isSelected ? "outline-2 outline-offset-1 outline-purple-500" : ""}`}
            >
              <p
                className={`text-[11px] leading-4 ${available ? "font-semibold" : "font-medium"} ${
                  compact ? "truncate" : "pr-6"
                }`}
              >
                {available ? "Available for Consultation" : "Blocked / Class Hours"}
              </p>
              {!compact && (
                <p
                  className={`mt-0.5 flex items-center gap-1 text-[11px] tabular-nums ${available ? "text-purple-100" : "text-slate-400"}`}
                >
                  {!block.date && <Repeat size={10} />}
                  {timeRange(block.start, block.end)}
                </p>
              )}
              {available && height >= 76 && (
                <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-purple-100">
                  <LocationIcon size={11} className="shrink-0" />
                  <span className="truncate">{blockLocation}</span>
                </p>
              )}
              <div className="pointer-events-none absolute inset-1 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                <ButtonTag
                  type="button"
                  aria-label="Edit block"
                  title="Edit"
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelection({ type: "block", id: block.id, iso })
                  }}
                  className={`${actionClass} pointer-events-auto absolute bottom-0 right-0 ${compact ? "hidden" : ""}`}
                >
                  <Pencil size={11} />
                </ButtonTag>
                <ButtonTag
                  type="button"
                  aria-label="Delete block"
                  title={block.date ? "Delete" : "Delete (repeats weekly)"}
                  onClick={(event) => {
                    event.stopPropagation()
                    removeBlock(block.id)
                  }}
                  className={`${actionClass} pointer-events-auto absolute right-0 top-0`}
                >
                  <X size={12} />
                </ButtonTag>
              </div>
            </div>
          )
        })}

        {apptsFor(iso)
          .filter((a) =>
            a.status === "pending"
              ? filters.pending
              : a.status === "confirmed"
                ? filters.approved
                : filters.cancelled,
          )
          .map((appt) => {
          const height = ((appt.end - appt.start) / 60) * HOUR_PX - 2
          const top = ((appt.start - DAY_START) / 60) * HOUR_PX + 1
          const compact = height < 40
          const tone =
            appt.status === "confirmed"
              ? "bg-[#10B981] text-white ring-emerald-700/30 hover:bg-emerald-600"
              : appt.status === "pending"
                ? "bg-[#F59E0B] text-amber-950 ring-amber-700/40 hover:bg-amber-500"
                : "striped-block text-slate-500 ring-slate-200"
          const isSelected = selection?.type === "appt" && selection.id === appt.id
          return (
            <ButtonTag
              key={appt.id}
              type="button"
              aria-label={`${statusLabel[appt.status]}: ${appt.student}, ${timeRange(appt.start, appt.end)}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setSelection({ type: "appt", id: appt.id })}
              style={{ top, height }}
              className={`inject-in absolute left-2 right-1 z-10 cursor-pointer overflow-hidden rounded-xl px-2 py-1 text-left ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700 ${tone} ${
                isSelected ? "outline-2 outline-offset-1 outline-purple-600" : ""
              }`}
            >
              {appt.status === "cancelled" ? (
                <>
                  <p className="truncate text-[11px] font-medium leading-4">
                    Unavailable
                  </p>
                  {!compact && (
                    <p className="truncate text-[11px] text-slate-400 line-through">
                      {appt.student}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="flex items-center gap-1 truncate text-[11px] font-semibold leading-4">
                    {appt.status === "pending" && (
                      <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-amber-950/70" />
                    )}
                    <span className="truncate">Consultation: {appt.student}</span>
                  </p>
                  {!compact && (
                    <p className="truncate text-[11px] opacity-90">{appt.topic}</p>
                  )}
                  {height >= 70 && (
                    <p className="mt-0.5 truncate text-[11px] tabular-nums opacity-80">
                      {timeRange(appt.start, appt.end)}
                      {appt.status === "pending" ? " · Needs review" : ""}
                    </p>
                  )}
                </>
              )}
            </ButtonTag>
          )
        })}

        {preview && (
          <div
            style={{
              top: ((preview.start - DAY_START) / 60) * HOUR_PX + 1,
              height: ((preview.end - preview.start) / 60) * HOUR_PX - 2,
            }}
            className="pointer-events-none absolute inset-x-1 z-20 overflow-hidden rounded-xl border-2 border-dashed border-purple-600 bg-purple-600/10 px-2 py-1"
          >
            <p className="text-[11px] font-semibold tabular-nums text-purple-700">
              {timeRange(preview.start, preview.end)}
            </p>
          </div>
        )}
      </div>
    )
  }

  const close = () => { setError(null); setSelection(null) }
  const rulesPanel = (
    <PanelFrame
      eyebrow="Defaults"
      title="Availability Rules"
      subtitle="Applied to every new block"
      onClose={close}
    >
      <p className="text-xs leading-5 text-slate-500">
        Select any block, request, or open time on the calendar to see its
        details here.
      </p>
      <div>
        <span className={pillLabel}>Availability type</span>
        <Segmented<RuleMode>
          value={mode}
          onChange={setMode}
          className="rounded-full"
          options={[
            { value: "weekly", label: "Fixed Weekly" },
            { value: "overrides", label: "Date Overrides" },
          ]}
        />
      </div>
      <label className="block">
        <span className={pillLabel}>Time zone</span>
        <div className="relative">
          <Globe
            size={15}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <SelectTag
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className={`${pillField} cursor-pointer pl-10`}
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zoneLabel(zone)}
              </option>
            ))}
          </SelectTag>
        </div>
      </label>
      <label className="block">
        <span className={pillLabel}>Slot duration</span>
        <div className="relative">
          <Timer
            size={15}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <SelectTag
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            className={`${pillField} cursor-pointer pl-10`}
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>1 hour</option>
          </SelectTag>
        </div>
      </label>
      <label className="block">
        <span className={pillLabel}>Default location</span>
        <div className="relative">
          <LocationIcon
            size={15}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <InputTag
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Room number or meeting link"
            className={`${pillField} pl-10`}
          />
        </div>
      </label>
      <Button
        onClick={async () => {
          if (!await confirmAction("Apply these availability defaults for new time slots?")) return
          setSaved(true)
          window.setTimeout(() => setSaved(false), 2000)
        }}
        className="w-full gap-2 rounded-[4px] border border-purple-700 bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
      >
        {saved ? (
          <>
            <Check size={15} /> Rules saved
          </>
        ) : (
          "Save availability rules"
        )}
      </Button>
    </PanelFrame>
  )

  let sidebar: ReactNode = selection?.type === "rules" ? rulesPanel : null
  if (selectedAppt) {
    sidebar = (
      <AppointmentPanel
        key={`appt-${selectedAppt.id}`}
        appointment={selectedAppt}
        onClose={close}
        onUpdate={async (patch) => {
          await applyAppointmentPatch(selectedAppt, patch)
          updateAppointments((current) =>
            current.map((a) => (a.id === selectedAppt.id ? { ...a, ...patch } : a)),
          )
        }}
        onCancel={async (reason) => {
          const updated = await appointmentApi.cancel(selectedAppt.id, reason)
          mergeAppointment(updated)
          updateAppointments((current) =>
            current.map((a) => (a.id === selectedAppt.id ? { ...a, ...updated } : a)),
          )
          close()
        }}
        hasClash={(iso, start, end) =>
          myAppts.some(
            (a) =>
              a.id !== selectedAppt.id &&
              a.status !== "cancelled" &&
              a.date === iso &&
              a.start < end &&
              start < a.end,
          )
        }
      />
    )
  } else if (selectedBlock && selection?.type === "block") {
    const iso = selection.iso
    sidebar = (
      <BlockPanel
        key={`block-${selectedBlock.id}-${iso}`}
        block={selectedBlock}
        iso={iso}
        duration={duration}
        defaultLocation={location}
        onClose={close}
        onDelete={() => removeBlock(selectedBlock.id)}
        onSave={async (patch) => {
          const changes = { start_minutes: patch.start ?? selectedBlock.start, end_minutes: patch.end ?? selectedBlock.end }
          if (selectedBlock.date) {
            await facultyScheduleOverridesApi.update(selectedBlock.id, changes)
          } else {
            await facultyAvailabilityApi.update(selectedBlock.id, changes)
          }
          setBlocks((current) =>
            current.map((b) => (b.id === selectedBlock.id ? { ...b, ...patch } : b)),
          )
        }}
        overlaps={(start, end) => overlapsBlock(iso, start, end, selectedBlock.id)}
      />
    )
  } else if (selection?.type === "new") {
    const s = selection
    const date = fromIso(s.iso)
    const patch = (p: Partial<typeof s>) => { setError(null); setSelection({ ...s, ...p }) }
    sidebar = (
      <PanelFrame
        key={`new-${s.iso}`}
        eyebrow="Open time"
        title="New time block"
        subtitle={formatDate(date, { weekday: "long", month: "long", day: "numeric" })}
        onClose={close}
      >
        <label className="block">
          <span className={pillLabel}>Date</span>
          <InputTag
            type="date"
            value={s.iso}
            onChange={(e) => e.target.value && patch({ iso: e.target.value })}
            className={pillField}
          />
        </label>
        <TimeSelects
          start={s.start}
          end={s.end}
          onChange={(range) => patch(range)}
        />
        <label className="block">
          <span className={pillLabel}>Block type</span>
          <SelectTag
            value={s.kind}
            onChange={(e) => patch({ kind: e.target.value as SlotKind })}
            className={`${pillField} cursor-pointer`}
          >
            <option value="available">Set Custom Availability Block</option>
            <option value="blocked">Mark as Blocked / Class Hours</option>
          </SelectTag>
        </label>
        <label className="block">
          <span className={pillLabel}>Recurrence</span>
          <SelectTag
            value={s.repeat ? "weekly" : "once"}
            onChange={(e) => patch({ repeat: e.target.value === "weekly" })}
            className={`${pillField} cursor-pointer`}
          >
            <option value="weekly">Every {WEEKDAYS[date.getDay()]}</option>
            <option value="once">
              Only on {formatDate(date, { month: "short", day: "numeric" })}
            </option>
          </SelectTag>
        </label>
        <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
          {s.kind === "available"
            ? `${Math.floor((s.end - s.start) / duration)} × ${duration}-minute slots${location ? ` · ${location}` : ""}`
            : "Students cannot request appointments during this time."}
        </p>
        <ConflictNote show={!!newConflict} text="This range overlaps an existing block." />
        <div className="flex gap-2 border-t border-slate-100 pt-5">
          <Button
            onClick={close}
            className="rounded-[4px] border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Discard
          </Button>
          <Button
            onClick={createBlock}
            disabled={!!newConflict}
            className="flex-1 gap-2 rounded-[4px] border border-purple-700 bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
          >
            {s.kind === "available" ? "Confirm Time Slot" : "Save Range"}
          </Button>
        </div>
      </PanelFrame>
    )
  }

  const miniStart = startOfWeek(miniMonth)
  const miniWeeks = Math.ceil(
    (((miniMonth.getDay() + 6) % 7) +
      new Date(miniMonth.getFullYear(), miniMonth.getMonth() + 1, 0).getDate()) /
      7,
  )
  const miniDays = Array.from({ length: miniWeeks * 7 }, (_, i) => addDays(miniStart, i))
  const anchorIso = toIso(anchor)
  const visibleIsos = new Set(
    view === "month" ? [] : columns.map((d) => toIso(d)),
  )
  const filterRows: {
    key: keyof typeof filters
    label: string
    swatch: string
    count: number
  }[] = [
    { key: "slots", label: "My Consultation Slots", swatch: "bg-purple-600", count: blocks.filter((b) => b.kind === "available").length },
    { key: "blocked", label: "Blocked / Class Hours", swatch: "striped-block border border-slate-300", count: blocks.filter((b) => b.kind === "blocked").length },
    { key: "pending", label: "Pending Student Requests", swatch: "bg-[#F59E0B]", count: pendingCount },
    { key: "approved", label: "Approved Appointments", swatch: "bg-[#10B981]", count: myAppts.filter((a) => a.status === "confirmed").length },
    { key: "cancelled", label: "Cancelled / Unavailable", swatch: "bg-slate-300", count: myAppts.filter((a) => a.status === "cancelled").length },
  ]
  const createSlot = () => {
    let day = anchor
    while (day.getDay() === 0 || day.getDay() === 6) day = addDays(day, 1)
    if (view === "month") setView("week")
    setAnchor(day)
    selectNew(toIso(day), 540, 540 + Math.max(duration, 60))
  }
  const panelOpen = sidebar !== null

  return (
    <div>
      <PageTitle
        eyebrow="Schedule"
        title="Set Consultation Availability"
        description="Create slots, review student requests, and manage class hours. Select anything on the calendar to open its action panel."
      />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,4fr)]">
        <aside className="space-y-5 lg:sticky lg:top-6">
          <Button
            onClick={createSlot}
            className="w-full gap-2 rounded-full bg-purple-600 py-3 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(147,51,234,0.3)] hover:bg-purple-700"
          >
            <Plus size={17} strokeWidth={2.4} /> Create Slot
          </Button>

          <section className={`rounded-2xl bg-white p-4 ${cardShadow}`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                {formatDate(miniMonth, { month: "long", year: "numeric" })}
              </p>
              <div className="flex">
                {([-1, 1] as const).map((dir) => (
                  <ButtonTag
                    key={dir}
                    type="button"
                    aria-label={dir < 0 ? "Previous month" : "Next month"}
                    onClick={() =>
                      setMiniMonth(
                        new Date(miniMonth.getFullYear(), miniMonth.getMonth() + dir, 1),
                      )
                    }
                    className="flex size-7 cursor-pointer items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600"
                  >
                    {dir < 0 ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
                  </ButtonTag>
                ))}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-7 text-center">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span key={i} className="pb-1.5 text-[10px] font-semibold text-slate-400">
                  {d}
                </span>
              ))}
              {miniDays.map((d) => {
                const iso = toIso(d)
                const inMonth = d.getMonth() === miniMonth.getMonth()
                const isToday = iso === todayIso
                const isSelected = iso === anchorIso
                const inRange = visibleIsos.has(iso)
                const hasAppt = apptsFor(iso).some((a) => a.status !== "cancelled")
                return (
                  <ButtonTag
                    key={iso}
                    type="button"
                    aria-label={formatDate(d, { weekday: "long", month: "long", day: "numeric" })}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setAnchor(d)
                      if (!inMonth) setMiniMonth(new Date(d.getFullYear(), d.getMonth(), 1))
                    }}
                    className={`relative flex h-8 cursor-pointer items-center justify-center text-xs tabular-nums transition focus-visible:outline-none ${
                      inRange ? "bg-purple-50/70" : ""
                    }`}
                  >
                    <span
                      className={`flex size-7 items-center justify-center rounded-full transition ${
                        isToday
                          ? "bg-purple-600 font-semibold text-white"
                          : isSelected
                            ? "bg-purple-100 font-semibold text-purple-700 ring-1 ring-purple-300"
                            : inMonth
                              ? "text-slate-700 hover:bg-slate-100"
                              : "text-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    {hasAppt && (
                      <span className="absolute bottom-0.5 size-1 rounded-full bg-[#F59E0B]" />
                    )}
                  </ButtonTag>
                )
              })}
            </div>
          </section>

          <section className={`rounded-2xl bg-white p-4 ${cardShadow}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Show on calendar
            </p>
            <div className="mt-3 space-y-1">
              {filterRows.map((row) => (
                <label
                  key={row.key}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50"
                >
                  <InputTag
                    type="checkbox"
                    checked={filters[row.key]}
                    onChange={(e) => setFilters({ ...filters, [row.key]: e.target.checked })}
                    className="peer sr-only"
                  />
                  <span className="flex size-[18px] shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-white transition peer-checked:border-purple-600 peer-checked:bg-purple-600 peer-focus-visible:ring-2 peer-focus-visible:ring-purple-500 peer-focus-visible:ring-offset-1">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <span className={`size-2.5 shrink-0 rounded-full ${row.swatch}`} />
                  <span className="min-w-0 flex-1 text-xs font-medium leading-4 text-slate-700">
                    {row.label}
                  </span>
                  <span className="text-[11px] tabular-nums text-slate-400">{row.count}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-base font-bold tabular-nums">{weeklySlots}</p>
                <p className="text-[10px] text-slate-500">Slots / week</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-base font-bold tabular-nums">{overrideCount}</p>
                <p className="text-[10px] text-slate-500">Overrides</p>
              </div>
            </div>
          </section>
        </aside>

        <div className="flex min-w-0 flex-col items-start lg:flex-row">
        <section className={`min-w-0 flex-1 rounded-2xl bg-white ${cardShadow}`}>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5">
            <div className="flex items-center gap-4">
              <div className="flex gap-1">
                {([-1, 1] as const).map((dir) => (
                  <ButtonTag
                    key={dir}
                    type="button"
                    aria-label={dir < 0 ? "Previous" : "Next"}
                    onClick={() => shift(dir)}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600"
                  >
                    {dir < 0 ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                  </ButtonTag>
                ))}
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {monthTitle}
                </h2>
                <p className="text-xs text-slate-500">{rangeLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() =>
                  setSelection(selection?.type === "rules" ? null : { type: "rules" })
                }
                title="Availability rules"
                className={`gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium ${
                  selection?.type === "rules"
                    ? "border-purple-200 bg-purple-50 text-purple-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Globe size={13} /> Rules
              </Button>
              <Button
                onClick={() => {
                  setAnchor(new Date())
                  setMiniMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
                }}
                className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Today
              </Button>
              <Segmented<CalendarView>
                value={view}
                onChange={setView}
                className="w-52"
                options={[
                  { value: "day", label: "Day" },
                  { value: "week", label: "Week" },
                  { value: "month", label: "Month" },
                ]}
              />
            </div>
          </div>

          {view === "month" ? (
            <div className="overflow-x-auto p-5">
              <div className="min-w-[600px]">
                <div className="grid grid-cols-7 border-l border-t border-slate-200">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => (
                    <div
                      key={name}
                      className="border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {name}
                    </div>
                  ))}
                  {monthDates.map((date) => {
                    const iso = toIso(date)
                    const items = itemsFor(date)
                    const open = items.filter((i) => i.kind === "available")
                    const hasBlocked = items.some((i) => i.kind === "blocked")
                    const inMonth = date.getMonth() === anchor.getMonth()
                    const today = iso === todayIso
                    const picked =
                      selection?.type === "new" && selection.iso === iso
                    return (
                      <ButtonTag
                        key={iso}
                        type="button"
                        onClick={() => selectNew(iso, 540, 540 + Math.max(duration, 60))}
                        className={`min-h-28 cursor-pointer border-b border-r border-slate-200 p-2 text-left align-top transition-colors hover:bg-purple-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-600 ${
                          picked ? "bg-purple-50/60" : inMonth ? "bg-white" : "bg-[#F8FAFC]"
                        }`}
                      >
                        <div className="flex min-h-24 flex-col items-start">
                          <span
                            className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-medium ${
                              today
                                ? "bg-purple-600 text-white"
                                : inMonth
                                  ? "text-slate-700"
                                  : "text-slate-400"
                            }`}
                          >
                            {date.getDate()}
                          </span>
                          <div className="mt-1.5 w-full space-y-1">
                            {open.slice(0, 1).map((item) => (
                              <div
                                key={item.id}
                                className="truncate rounded-full bg-purple-600 px-2 py-0.5 text-[11px] font-medium text-white"
                              >
                                {clock(item.start)}
                              </div>
                            ))}
                            {apptsFor(iso)
                              .filter((a) => a.status !== "cancelled")
                              .slice(0, 2)
                              .map((a) => (
                                <span
                                  key={a.id}
                                  role="link"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setSelection({ type: "appt", id: a.id })
                                  }}
                                  className={`block truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    a.status === "confirmed"
                                      ? "bg-[#10B981] text-white"
                                      : "bg-[#F59E0B] text-amber-950"
                                  }`}
                                >
                                  {clock(a.start)} {a.student.split(" ")[0]}
                                </span>
                              ))}
                            {hasBlocked && (
                              <div className="striped-block truncate rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
                                Class Hours
                              </div>
                            )}
                          </div>
                        </div>
                      </ButtonTag>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className={view === "week" ? "min-w-[620px]" : "min-w-[340px]"}>
                <div style={gridCols} className="grid border-b border-slate-200 bg-white">
                  <div />
                  {columns.map((date) => {
                    const today = toIso(date) === todayIso
                    return (
                      <div
                        key={toIso(date)}
                        className="flex items-center justify-center gap-2 py-3"
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          {formatDate(date, { weekday: "short" })}
                        </span>
                        <span
                          className={`inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold ${
                            today ? "bg-purple-600 text-white" : "text-slate-900"
                          }`}
                        >
                          {date.getDate()}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div style={gridCols} className="grid pb-5 pt-4">
                  <div className="relative" style={{ height: GRID_HEIGHT }}>
                    {hourLabels.map((hour, i) => (
                      <span
                        key={hour}
                        style={{ top: i * HOUR_PX }}
                        className="absolute right-2.5 -translate-y-1/2 text-[11px] tabular-nums text-slate-400"
                      >
                        {clock(hour * 60).replace(":00", "")}
                      </span>
                    ))}
                  </div>
                  {columns.map(renderColumn)}
                </div>
              </div>
            </div>
          )}
        </section>

          <div
            aria-live="polite"
            className={`w-full min-w-0 transition-[width,margin,opacity] duration-300 ease-out lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:overflow-x-hidden lg:rounded-2xl ${
              panelOpen
                ? "mt-6 opacity-100 lg:ml-6 lg:mt-0 lg:w-[30%] lg:shrink-0"
                : "pointer-events-none hidden opacity-0 lg:block lg:w-0"
            }`}
          >
            <div className="lg:min-w-[280px]"><CalendarErrorContext.Provider value={error}>{sidebar}</CalendarErrorContext.Provider></div>
          </div>
        </div>
      </div>
    </div>
  )
}
