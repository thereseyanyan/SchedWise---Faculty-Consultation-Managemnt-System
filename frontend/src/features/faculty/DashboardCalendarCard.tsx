import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { Appointment } from "../../api"
import { formatDate, toIso } from "../../shared"
import { monthGridDates } from "./facultyCalendar"

const WEEKDAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

type DashboardCalendarCardProps = {
  appointments: Appointment[]
  loading: boolean
  error: string | null
  onRetry: () => void
}

type DayCounts = {
  confirmed: number
  pending: number
}

function openFullCalendar() {
  const navButton = Array.from(
    document.querySelectorAll<HTMLButtonElement>("aside nav button"),
  ).find((button) => button.textContent?.trim() === "Calendar & Availability")
  navButton?.click()
}

export function DashboardCalendarCard({
  appointments,
  loading,
  error,
  onRetry,
}: DashboardCalendarCardProps) {
  const [anchor, setAnchor] = useState(() => new Date())
  const todayIso = toIso(new Date())
  const gridDates = useMemo(() => monthGridDates(anchor), [anchor])
  const monthTitle = formatDate(anchor, { month: "long", year: "numeric" })

  const countsByDate = useMemo(() => {
    const counts = new Map<string, DayCounts>()
    for (const appointment of appointments) {
      if (
        appointment.status !== "confirmed" &&
        appointment.status !== "pending" &&
        appointment.status !== "reschedule_requested"
      ) {
        continue
      }
      const current = counts.get(appointment.appointment_date) ?? { confirmed: 0, pending: 0 }
      if (appointment.status === "confirmed") current.confirmed += 1
      else current.pending += 1
      counts.set(appointment.appointment_date, current)
    }
    return counts
  }, [appointments])

  const shiftMonth = (direction: number) => {
    setAnchor((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1))
  }

  return (
    <section className="flex h-full flex-col rounded-[16px] border border-border-card bg-card p-5 shadow-card max-sm:p-1">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start max-sm:gap-1">
        <h2 className="min-w-0 font-display text-[20px] leading-[28px] font-semibold text-ink max-sm:w-full max-sm:break-words">
          {monthTitle}
        </h2>
        <div className="flex items-center gap-2 max-sm:flex-wrap">
          <button
            type="button"
            onClick={() => setAnchor(new Date())}
            className="inline-flex h-8 items-center rounded-full border border-border-card px-3 text-[12px] font-semibold text-primary transition hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary max-sm:px-2"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
            className="flex size-8 items-center justify-center rounded-full border border-border-card text-ink transition hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
            className="flex size-8 items-center justify-center rounded-full border border-border-card text-ink transition hover:bg-soft focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="-mx-5 mt-3 border-t border-divider max-sm:-mx-1" />

      {loading ? (
        <div className="mt-4 flex-1 overflow-x-auto" aria-busy="true">
          <div className="min-w-[360px]">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_LABELS.map((label) => (
                <span
                  key={label}
                  className="text-center text-[12px] font-semibold uppercase text-muted"
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: gridDates.length }, (_, index) => (
                <div
                  key={index}
                  className="min-h-12 animate-pulse rounded-[8px] border border-divider bg-soft max-sm:p-1"
                />
              ))}
            </div>
          </div>
        </div>
      ) : error ? (
        <div
          role="alert"
          title={error}
          className="mt-4 flex flex-1 flex-col items-center justify-center rounded-[12px] border border-amber bg-amber-tint/60 px-4 py-6 text-center max-sm:px-2"
        >
          <p className="text-[13px] text-ink max-sm:break-words">
            Couldn't load calendar ·{" "}
            <button
              type="button"
              onClick={onRetry}
              className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Retry
            </button>
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex-1 overflow-x-auto">
            <div className="min-w-[360px]">
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_LABELS.map((label) => (
                  <span
                    key={label}
                    className="text-center text-[12px] font-semibold uppercase text-muted"
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {gridDates.map((date) => {
                  const iso = toIso(date)
                  const counts = countsByDate.get(iso)
                  const confirmed = counts?.confirmed ?? 0
                  const pending = counts?.pending ?? 0
                  const total = confirmed + pending
                  const inMonth =
                    date.getMonth() === anchor.getMonth() &&
                    date.getFullYear() === anchor.getFullYear()
                  const isToday = iso === todayIso
                  const dots = [
                    ...Array.from({ length: Math.min(confirmed, 3) }, () => "confirmed" as const),
                    ...Array.from(
                      { length: Math.min(pending, 3 - Math.min(confirmed, 3)) },
                      () => "pending" as const,
                    ),
                  ]

                  return (
                    <div
                      key={iso}
                      title={
                        total > 0
                          ? `${total} consultation${total === 1 ? "" : "s"}`
                          : undefined
                      }
                      className={`relative min-h-12 rounded-[8px] border border-divider p-2 max-sm:p-1 ${
                        inMonth ? "" : "opacity-50"
                      }`}
                    >
                      {isToday ? (
                        <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-[13px] font-semibold leading-none text-white">
                          {date.getDate()}
                        </span>
                      ) : (
                        <span className="text-[13px] font-semibold text-ink">
                          {date.getDate()}
                        </span>
                      )}
                      {total > 0 ? (
                        <>
                          <span className="absolute bottom-2 left-2 flex items-center gap-1 max-sm:bottom-1 max-sm:left-1">
                            {dots.map((dot, index) => (
                              <span
                                key={`${dot}-${index}`}
                                aria-hidden="true"
                                className={`size-1.5 rounded-full ${
                                  dot === "confirmed" ? "bg-amber" : "border border-amber"
                                }`}
                              />
                            ))}
                          </span>
                          {total > 3 ? (
                            <span className="absolute right-2 top-2 text-[12px] leading-none text-muted max-sm:right-1 max-sm:top-1">
                              +{total - 3}
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-[12px] text-muted">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-amber" />
              <span className="max-sm:break-all">Consultations</span>
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full border border-amber" />
              <span className="max-sm:break-all">Pending</span>
            </span>
          </div>
        </>
      )}

      <div className="mt-auto pt-4 text-center">
        <button
          type="button"
          onClick={openFullCalendar}
          className="inline-flex items-center gap-1 text-[14px] font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary max-sm:block max-sm:w-full max-sm:break-words"
        >
          Open full calendar <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}
