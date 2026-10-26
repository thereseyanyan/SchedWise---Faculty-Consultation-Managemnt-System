import { useContext, useEffect, useMemo, useState } from "react"
import { CalendarDays } from "lucide-react"
import {
  facultyAvailabilityApi,
  facultyScheduleOverridesApi,
  type Appointment,
  type FacultyAvailability,
  type ScheduleOverride,
} from "../../api"
import {
  CurrentUserContext,
  clock,
  errorMessage,
  fullName,
  toIso,
} from "../../shared"
import {
  DAY_END,
  DAY_START,
  HOUR_PX,
  todayOpenTime,
  type TimeBlock,
} from "./facultyCalendar"

const MIN_BAR_PX = 40
const BAR_GAP_PX = 6
const MIN_BAR_MINUTES = (MIN_BAR_PX / HOUR_PX) * 60
const OPEN_GAP_MINUTES = (2 / HOUR_PX) * 60
const ACTIVE_STATUSES = ["pending", "confirmed", "reschedule_requested"] as const

type TodayScheduleCardProps = {
  appointments: Appointment[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpenAppointment: (appointment: Appointment) => void
}

type EventItem = {
  appointment: Appointment
  start: number
  end: number
}

type LaidOutEvent = EventItem & {
  top: number
  height: number
  lane: number
  lanes: number
}

function isActive(appointment: Appointment) {
  return ACTIVE_STATUSES.includes(appointment.status as (typeof ACTIVE_STATUSES)[number])
}

function formatOpenDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0 && mins > 0) return `${hours}hr ${mins}m`
  if (hours > 0) return `${hours}hr`
  return `${mins}m`
}

function cutBlocks(blocks: TimeBlock[], cuts: TimeBlock[]) {
  let result = blocks
  for (const cut of cuts) {
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

function layoutEvents(events: EventItem[], windowStart: number, windowEnd: number) {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end)
  const laidOut: LaidOutEvent[] = []
  let cluster: EventItem[] = []
  let clusterEnd = 0

  const flush = () => {
    if (cluster.length === 0) return
    const laneEnds: number[] = []
    const assigned = cluster.map((item) => {
      let lane = laneEnds.findIndex((end) => end <= item.start)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(item.end)
      } else {
        laneEnds[lane] = item.end
      }
      return { item, lane }
    })
    const lanes = laneEnds.length
    for (const { item, lane } of assigned) {
      const top = ((item.start - windowStart) / 60) * HOUR_PX
      const bottom = ((Math.min(item.end, windowEnd) - windowStart) / 60) * HOUR_PX
      laidOut.push({
        ...item,
        top,
        height: Math.max(MIN_BAR_PX, bottom - top),
        lane,
        lanes,
      })
    }
    cluster = []
    clusterEnd = 0
  }

  for (const item of sorted) {
    if (cluster.length > 0 && item.start >= clusterEnd) flush()
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  flush()
  return laidOut
}

function countConflicts(events: EventItem[]) {
  let conflicts = 0
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      if (events[i].start < events[j].end && events[j].start < events[i].end) {
        conflicts += 1
      }
    }
  }
  return conflicts
}

function currentMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes()
}

export function TodayScheduleCard({
  appointments,
  loading,
  error,
  onRetry,
  onOpenAppointment,
}: TodayScheduleCardProps) {
  const currentUser = useContext(CurrentUserContext)
  const facultyId = currentUser?.id ?? ""
  const [availability, setAvailability] = useState<FacultyAvailability[]>([])
  const [overrides, setOverrides] = useState<ScheduleOverride[]>([])
  const [availabilityLoading, setAvailabilityLoading] = useState(true)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!facultyId) {
      setAvailability([])
      setOverrides([])
      setAvailabilityLoading(false)
      setAvailabilityError(null)
      return
    }
    setAvailabilityLoading(true)
    setAvailabilityError(null)
    void Promise.all([
      facultyAvailabilityApi.list({ faculty_id: facultyId }),
      facultyScheduleOverridesApi.list({ faculty_id: facultyId }),
    ])
      .then(([availabilityRows, overrideRows]) => {
        if (cancelled) return
        setAvailability(availabilityRows)
        setOverrides(overrideRows)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setAvailability([])
        setOverrides([])
        setAvailabilityError(errorMessage(err, "Failed to load availability"))
      })
      .finally(() => {
        if (!cancelled) setAvailabilityLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [facultyId, reloadKey])

  const today = toIso(now)
  const nowMinutes = currentMinutes(now)

  const todayAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => appointment.appointment_date === today && isActive(appointment))
        .sort((a, b) => a.start_minutes - b.start_minutes || a.end_minutes - b.end_minutes),
    [appointments, today],
  )

  const timelineAppointments = useMemo(
    () =>
      todayAppointments.filter(
        (appointment) =>
          appointment.end_minutes > DAY_START && appointment.start_minutes < DAY_END,
      ),
    [todayAppointments],
  )

  const openTime = useMemo(
    () =>
      todayOpenTime(
        availability,
        overrides,
        appointments,
        today,
        now.getDay(),
      ),
    [availability, overrides, appointments, today, now],
  )

  const timelineOpenBlocks = useMemo(
    () =>
      openTime.blocks
        .filter((block) => block.end > DAY_START && block.start < DAY_END)
        .map((block) => ({
          start: Math.max(DAY_START, block.start),
          end: Math.min(DAY_END, block.end),
        })),
    [openTime.blocks],
  )

  const eventItems = useMemo<EventItem[]>(
    () =>
      timelineAppointments.map((appointment) => ({
        appointment,
        start: appointment.start_minutes,
        end: Math.max(appointment.end_minutes, appointment.start_minutes + MIN_BAR_MINUTES),
      })),
    [timelineAppointments],
  )

  const windowBounds = useMemo(() => {
    const starts = [
      ...timelineAppointments.map((appointment) => appointment.start_minutes),
      ...timelineOpenBlocks.map((block) => block.start),
    ]
    const ends = [
      ...timelineAppointments.map((appointment) => appointment.end_minutes),
      ...timelineOpenBlocks.map((block) => block.end),
    ]
    if (starts.length === 0 || ends.length === 0) {
      return { start: DAY_START, end: DAY_START + 60 }
    }
    const first = Math.min(...starts)
    const last = Math.max(...ends)
    const start = Math.max(DAY_START, Math.min(first - 60, DAY_END - 60))
    const end = Math.min(DAY_END, Math.max(last + 60, start + 60))
    return { start, end }
  }, [timelineAppointments, timelineOpenBlocks])

  const laidOutEvents = useMemo(
    () => layoutEvents(eventItems, windowBounds.start, windowBounds.end),
    [eventItems, windowBounds],
  )

  const visibleOpenBlocks = useMemo(() => {
    const cuts = eventItems.map((event) => ({
      start: event.appointment.start_minutes - OPEN_GAP_MINUTES,
      end: event.end + OPEN_GAP_MINUTES,
    }))
    return cutBlocks(timelineOpenBlocks, cuts)
      .filter((block) => block.end > block.start)
      .map((block) => {
        const source = timelineOpenBlocks.find(
          (candidate) => candidate.start <= block.start && candidate.end >= block.end,
        )
        return {
          ...block,
          duration: (source?.end ?? block.end) - (source?.start ?? block.start),
        }
      })
  }, [eventItems, timelineOpenBlocks])

  const conflicts = useMemo(
    () =>
      countConflicts(
        todayAppointments.map((appointment) => ({
          appointment,
          start: appointment.start_minutes,
          end: appointment.end_minutes,
        })),
      ),
    [todayAppointments],
  )

  const needsClosing = todayAppointments.filter(
    (appointment) => appointment.status === "confirmed" && appointment.end_minutes <= nowMinutes,
  ).length

  const hasTimelineItems =
    timelineAppointments.length > 0 || timelineOpenBlocks.length > 0
  const showNow =
    hasTimelineItems && nowMinutes >= windowBounds.start && nowMinutes <= windowBounds.end
  const nowTop = ((nowMinutes - windowBounds.start) / 60) * HOUR_PX
  const timelineHeight = ((windowBounds.end - windowBounds.start) / 60) * HOUR_PX
  const hourMarks = []
  for (
    let minute = Math.ceil(windowBounds.start / 60) * 60;
    minute <= windowBounds.end;
    minute += 60
  ) {
    hourMarks.push(minute)
  }
  const nearestHourTop = hourMarks.reduce((nearest, minute) => {
    const top = ((minute - windowBounds.start) / 60) * HOUR_PX
    return Math.abs(top - nowTop) < Math.abs(nearest - nowTop) ? top : nearest
  }, hourMarks[0] === undefined ? nowTop : ((hourMarks[0] - windowBounds.start) / 60) * HOUR_PX)
  const minLabelGap = 6 + 6 + 8
  let nowLabelTop = nowTop
  if (Math.abs(nearestHourTop - nowTop) < minLabelGap) {
    nowLabelTop = nearestHourTop < nowTop ? nearestHourTop + minLabelGap : nearestHourTop - minLabelGap
    if (nowLabelTop < 6) nowLabelTop = nearestHourTop + minLabelGap
    if (nowLabelTop > timelineHeight - 6) nowLabelTop = nearestHourTop - minLabelGap
  }

  const isLoading = loading || availabilityLoading
  const displayError = error || availabilityError
  const retry = () => {
    setReloadKey((current) => current + 1)
    onRetry()
  }

  return (
    <section
      aria-labelledby="today-schedule-title"
      className="flex flex-col rounded-[16px] border border-border-card bg-card p-5 pb-4 shadow-card max-sm:p-2 max-sm:pb-4"
    >
      <div className="overflow-x-auto">
        <div className="min-w-[360px]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2
              id="today-schedule-title"
              className="font-display text-[20px] leading-[28px] font-semibold text-ink"
            >
              Today's schedule
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap ${
                  conflicts === 0
                    ? "bg-green-tint text-green"
                    : "bg-amber-tint text-amber"
                }`}
              >
                {conflicts === 0 ? "No conflicts" : `${conflicts} conflict${conflicts === 1 ? "" : "s"}`}
              </span>
              <span className="inline-flex h-7 items-center rounded-full bg-soft px-2.5 text-[12px] font-semibold whitespace-nowrap text-muted">
                Needs closing · {needsClosing}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="-mx-5 mt-4 border-t border-divider max-sm:-mx-2" />

      <div className="overflow-x-auto">
        <div className="min-w-[360px]">
          {isLoading ? (
            <div aria-busy="true" className="mt-4">
              <div className="flex gap-3">
                <div className="w-14 shrink-0 space-y-7 pt-1">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div key={index} className="h-3 w-9 animate-pulse rounded bg-soft" />
                  ))}
                </div>
                <div className="relative min-h-[224px] flex-1 rounded-[8px] bg-page-bg/40">
                  <div className="absolute left-3 top-4 h-[40px] w-[26%] animate-pulse rounded-[12px] bg-soft" />
                  <div className="absolute left-0 top-[92px] h-[64px] w-full animate-pulse bg-soft/50" />
                  <div className="absolute right-3 top-[176px] h-[40px] w-[38%] animate-pulse rounded-[12px] bg-soft" />
                </div>
              </div>
            </div>
          ) : displayError ? (
            <div
              role="alert"
              title={displayError}
              className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-amber bg-amber-tint/60 px-4 py-3 text-[13px] text-ink"
            >
              <span>Couldn't load today's schedule.</span>
              <button
                type="button"
                onClick={retry}
                className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
              >
                Retry
              </button>
            </div>
          ) : !hasTimelineItems ? (
            <div className="flex min-h-[190px] flex-col items-center justify-center py-8 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-soft text-primary">
                <CalendarDays size={18} />
              </div>
              <p className="mt-3 font-display text-[18px] text-ink">Nothing scheduled today</p>
            </div>
          ) : (
            <>
              <div className="relative mt-4" style={{ height: timelineHeight }}>
                <div className="absolute inset-y-0 left-0 w-14">
                  {hourMarks.map((minute) => {
                    const top = ((minute - windowBounds.start) / 60) * HOUR_PX
                    return (
                      <span
                        key={minute}
                        className="absolute right-0 -translate-y-1/2 text-[12px] leading-none text-muted"
                        style={{ top }}
                      >
                        {clock(minute).replace(":00", "")}
                      </span>
                    )
                  })}
                  {showNow ? (
                    <span
                      className="absolute left-0 -translate-y-1/2 rounded-full bg-ink px-1 py-0.5 text-[8px] font-bold leading-none tracking-tight text-white"
                      style={{ top: nowLabelTop }}
                    >
                      NOW
                    </span>
                  ) : null}
                </div>

                <div className="absolute inset-y-0 left-14 right-0 border-l border-border-card">
                  {hourMarks.map((minute) => {
                    const top = ((minute - windowBounds.start) / 60) * HOUR_PX
                    return (
                      <div
                        key={`line-${minute}`}
                        className="pointer-events-none absolute inset-x-0 border-t border-divider"
                        style={{ top }}
                      />
                    )
                  })}

                  {visibleOpenBlocks.map((block) => {
                    const top = ((block.start - windowBounds.start) / 60) * HOUR_PX
                    const height = ((block.end - block.start) / 60) * HOUR_PX
                    return (
                      <div
                        key={`open-${block.start}-${block.end}`}
                        className="absolute inset-x-1 z-0 rounded-[8px] bg-soft/50"
                        style={{ top: top + 1, height: Math.max(0, height - 2) }}
                      >
                        {block.duration >= 30 && height >= 20 ? (
                          <span className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center rounded-full border border-dashed border-primary/45 bg-card/70 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-primary/80">
                            Free · {formatOpenDuration(block.duration)}
                          </span>
                        ) : null}
                      </div>
                    )
                  })}

                  {showNow ? (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 z-[5] border-t border-primary"
                      style={{ top: nowTop }}
                    />
                  ) : null}

                  {laidOutEvents.map(({ appointment, top, height, lane, lanes }) => {
                    const student = fullName(
                      appointment.student_first_name,
                      appointment.student_last_name,
                      appointment.student_id,
                    )
                    const pending = appointment.status !== "confirmed"
                    const pendingLabel =
                      appointment.status === "reschedule_requested" ? "Reschedule" : "Pending"
                    const room = appointment.location
                      ? ` · ${/^room\b/i.test(appointment.location) ? appointment.location : `Room ${appointment.location}`}`
                      : ""
                    const text = `${clock(appointment.start_minutes)} - ${clock(appointment.end_minutes)}   Consultation · ${student}${room}`
                    const laneWidth = `calc(${100 / lanes}% - ${((lanes - 1) * BAR_GAP_PX) / lanes}px)`
                    const laneLeft = `calc(${(lane * 100) / lanes}% + ${(lane * BAR_GAP_PX) / lanes}px)`
                    return (
                      <button
                        key={appointment.id}
                        type="button"
                        onClick={() => onOpenAppointment(appointment)}
                        title={text}
                        className={`absolute z-10 flex items-start justify-between gap-2 overflow-hidden rounded-[12px] border px-3 py-1.5 text-left text-[14px] leading-[18px] text-ink transition hover:brightness-[0.98] focus-visible:outline-2 focus-visible:outline-primary ${
                          pending
                            ? "border-dashed border-amber bg-amber-tint/70"
                            : "border-amber bg-amber-tint"
                        }`}
                        style={{ top, height, left: laneLeft, width: laneWidth }}
                      >
                        <span className="min-w-0 flex-1 truncate">{text}</span>
                        {pending ? (
                          <span className="shrink-0 rounded-full bg-card/75 px-2 py-0.5 text-[11px] font-semibold leading-[14px] text-amber">
                            {pendingLabel}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-[12px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-3 rounded-[3px] bg-amber-tint ring-1 ring-amber" />
                  Consultation
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-full border border-dashed border-primary/60 bg-soft/50"
                  />
                  Open availability
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
