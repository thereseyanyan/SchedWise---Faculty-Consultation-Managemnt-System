import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  AlertCircle,
  ArrowUpDown,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  LayoutList,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  Rows3,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react"
import {
  appointmentApi,
  type Appointment,
  type ApptStatus,
} from "../../api"
import { confirmAction } from "../../confirmation"
import {
  Button,
  TextareaTag,
  clock,
  consultationHasEnded,
  errorMessage,
  formatDate,
  fromIso,
  fullName,
  mergeAppointment,
  statusLabel,
  toIso,
} from "../../shared"
import { FacultyAppointmentDetailPanel } from "./FacultyAppointmentDetailPanel"

type TabKey = "all" | "pending" | "upcoming" | "past" | "closed"
type QuickView = "" | "response" | "closing" | "today"
type Density = "comfortable" | "compact"
type SortKey = "date-asc" | "date-desc" | "student" | "status"
type ReasonAction = {
  appointment: Appointment
  kind: "decline" | "reject" | "cancel"
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "closed", label: "Cancelled/Declined" },
]

const STATUS_OPTIONS: ApptStatus[] = [
  "pending",
  "reschedule_requested",
  "confirmed",
  "completed",
  "cancelled",
  "rejected",
  "no_show",
]

const PENDING_STATUSES: ApptStatus[] = ["pending", "reschedule_requested"]
const CLOSED_STATUSES: ApptStatus[] = ["cancelled", "rejected", "no_show"]

function isPendingStatus(status: ApptStatus) {
  return PENDING_STATUSES.includes(status)
}

function isClosedStatus(status: ApptStatus) {
  return CLOSED_STATUSES.includes(status)
}

function needsClosing(appointment: Appointment) {
  return appointment.status === "confirmed" &&
    consultationHasEnded(appointment.appointment_date, appointment.end_minutes)
}

function tabFor(appointment: Appointment): Exclude<TabKey, "all"> {
  if (isPendingStatus(appointment.status)) return "pending"
  if (isClosedStatus(appointment.status)) return "closed"
  if (appointment.status === "completed") return "past"
  if (needsClosing(appointment)) return "past"
  return "upcoming"
}

function statusChipClass(status: ApptStatus) {
  if (isPendingStatus(status)) return "border-amber/25 bg-amber-tint text-amber"
  if (status === "confirmed") return "border-green/20 bg-green-tint text-green"
  if (status === "completed") return "border-border bg-soft text-primary"
  return "border-rose-200 bg-rose-50 text-rose-700"
}

function rangeLabel(from: string, to: string) {
  const format = (iso: string, includeYear: boolean) =>
    formatDate(fromIso(iso), {
      month: "short",
      day: "numeric",
      ...(includeYear ? { year: "numeric" as const } : {}),
    })
  if (!from && !to) return "All dates"
  if (from && to) {
    const sameYear = from.slice(0, 4) === to.slice(0, 4)
    return `${format(from, !sameYear)} \u2013 ${format(to, true)}`
  }
  if (from) return `From ${format(from, true)}`
  return `Until ${format(to, true)}`
}

function scheduleLabel(appointment: Appointment) {
  const date = formatDate(fromIso(appointment.appointment_date), {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
  const start = clock(
    appointment.start_minutes,
    (appointment.start_minutes >= 720) !== (appointment.end_minutes >= 720),
  )
  return { date, time: `${start} \u2013 ${clock(appointment.end_minutes)}` }
}

function studentName(appointment: Appointment) {
  return fullName(
    appointment.student_first_name,
    appointment.student_last_name,
    appointment.student_id,
  )
}

function studentMeta(appointment: Appointment) {
  return [
    appointment.student_number || appointment.student_id,
    appointment.student_program,
  ].filter(Boolean).join(" \u00b7 ")
}

function IconAction({
  label,
  tone = "neutral",
  disabled,
  onClick,
  children,
}: {
  label: string
  tone?: "neutral" | "primary" | "success" | "danger"
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const tones = {
    neutral: "border-border-card bg-white text-muted hover:border-primary/30 hover:bg-soft hover:text-primary",
    primary: "border-border bg-soft text-primary hover:border-primary/40 hover:bg-border",
    success: "border-green/20 bg-green-tint text-green hover:border-green/40 hover:bg-green-tint/80",
    danger: "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100",
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  )
}

function ActionSlot({ children }: { children?: ReactNode }) {
  return (
    <span className="flex size-8 items-center justify-center" aria-hidden={!children}>
      {children}
    </span>
  )
}

export function FacultyAppointmentsView({
  onOpenSchedule,
  onOpenRecords,
  onOpenAppointment,
}: {
  onOpenSchedule?: (appointment?: Appointment) => void
  onOpenRecords?: (appointment?: Appointment) => void
  onOpenAppointment?: (appointment: Appointment) => void
}) {
  const [rows, setRows] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [tab, setTab] = useState<TabKey>("all")
  const [quickView, setQuickView] = useState<QuickView>("")
  const [query, setQuery] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [statusFilter, setStatusFilter] = useState<ApptStatus[]>([])
  const [sort, setSort] = useState<SortKey>("date-asc")
  const [density, setDensity] = useState<Density>("comfortable")
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState("")
  const [selectedId, setSelectedId] = useState("")
  const [openPopover, setOpenPopover] = useState<"date" | "filter" | null>(null)
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null)
  const [reason, setReason] = useState("")
  const [reasonError, setReasonError] = useState("")
  const [menu, setMenu] = useState<{
    appointment: Appointment
    top: number
    left: number
  } | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const pageFocusRef = useRef<HTMLDivElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const today = toIso(new Date())
  const pageSize = density === "comfortable" ? 8 : 10

  const loadAppointments = async () => {
    setLoading(true)
    setError("")
    try {
      setRows(await appointmentApi.list())
    } catch (err) {
      setError(errorMessage(err, "Unable to load appointments."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAppointments()
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(""), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) setOpenPopover(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenPopover(null)
        setMenu(null)
      }
    }
    const closeMenu = () => setMenu(null)
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    window.addEventListener("scroll", closeMenu, true)
    window.addEventListener("resize", closeMenu)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("scroll", closeMenu, true)
      window.removeEventListener("resize", closeMenu)
    }
  }, [])

  useEffect(() => {
    if (reasonAction) reasonRef.current?.focus()
  }, [reasonAction])

  const searchNormalized = query.trim().toLowerCase()
  const searched = useMemo(() => rows.filter((appointment) => {
    if (!searchNormalized) return true
    const haystack = [
      studentName(appointment),
      appointment.student_number,
      appointment.student_program,
      appointment.topic,
      appointment.reason,
      appointment.location,
      appointment.appointment_date,
      statusLabel[appointment.status],
    ].map((value) => String(value ?? "").toLowerCase()).join(" ")
    return haystack.includes(searchNormalized)
  }), [rows, searchNormalized])

  const dateScoped = useMemo(() => searched.filter((appointment) => {
    if (dateFrom && appointment.appointment_date < dateFrom) return false
    if (dateTo && appointment.appointment_date > dateTo) return false
    return true
  }), [searched, dateFrom, dateTo])

  const counts = useMemo(() => {
    const result: Record<TabKey, number> = {
      all: dateScoped.length,
      pending: 0,
      upcoming: 0,
      past: 0,
      closed: 0,
    }
    for (const appointment of dateScoped) result[tabFor(appointment)] += 1
    return result
  }, [dateScoped])

  const needsReviewCount = counts.pending
  const needsClosingCount = useMemo(
    () => dateScoped.filter(needsClosing).length,
    [dateScoped],
  )
  const todayViewCount = useMemo(
    () => dateScoped.filter((appointment) =>
      appointment.appointment_date === today && appointment.status !== "cancelled"
    ).length,
    [dateScoped, today],
  )

  const filtered = useMemo(() => {
    let result = dateScoped
    if (tab !== "all") result = result.filter((appointment) => tabFor(appointment) === tab)
    if (quickView === "response") result = result.filter((appointment) => isPendingStatus(appointment.status))
    if (quickView === "closing") result = result.filter(needsClosing)
    if (quickView === "today") {
      result = result.filter((appointment) =>
        appointment.appointment_date === today && appointment.status !== "cancelled"
      )
    }
    if (statusFilter.length > 0) {
      result = result.filter((appointment) => statusFilter.includes(appointment.status))
    }
    return [...result].sort((a, b) => {
      if (sort === "student") return studentName(a).localeCompare(studentName(b))
      if (sort === "status") {
        return statusLabel[a.status].localeCompare(statusLabel[b.status]) ||
          a.appointment_date.localeCompare(b.appointment_date)
      }
      const direction = sort === "date-desc" ? -1 : 1
      return (a.appointment_date.localeCompare(b.appointment_date) ||
        a.start_minutes - b.start_minutes) * direction
    })
  }, [dateScoped, tab, quickView, statusFilter, sort, today])

  useEffect(() => {
    setPage(1)
  }, [query, tab, quickView, dateFrom, dateTo, sort, density, statusFilter.join("|")])

  const selectedIndex = selectedId
    ? filtered.findIndex((appointment) => appointment.id === selectedId)
    : -1
  const selectedAppointment = selectedIndex >= 0 ? filtered[selectedIndex] : null

  useEffect(() => {
    if (selectedId && selectedIndex < 0) setSelectedId("")
  }, [selectedId, selectedIndex])

  const selectAppointment = (appointment: Appointment) => {
    const index = filtered.findIndex((row) => row.id === appointment.id)
    setSelectedId(appointment.id)
    if (index >= 0) setPage(Math.floor(index / pageSize) + 1)
  }

  const selectByIndex = (index: number) => {
    const appointment = filtered[index]
    if (!appointment) return
    setSelectedId(appointment.id)
    setPage(Math.floor(index / pageSize) + 1)
  }

  const closePanel = () => {
    const closingId = selectedId
    setSelectedId("")
    window.requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`tr[data-appointment-id="${closingId}"]`)
      if (row) row.focus({ preventScroll: true })
      else pageFocusRef.current?.focus({ preventScroll: true })
    })
  }

  useEffect(() => {
    if (!selectedId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || reasonAction || menu || openPopover) return
      event.preventDefault()
      closePanel()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [selectedId, reasonAction, menu, openPopover])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const firstRow = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const lastRow = Math.min(currentPage * pageSize, filtered.length)
  const hasFilters = Boolean(
    query.trim() || dateFrom || dateTo || quickView || statusFilter.length > 0,
  )
  const filterCount = statusFilter.length

  const clearFilters = () => {
    setQuery("")
    setDateFrom("")
    setDateTo("")
    setQuickView("")
    setStatusFilter([])
    setTab("all")
  }

  const updateRow = (updated: Appointment) => {
    setRows((current) => current.map((row) => row.id === updated.id ? { ...row, ...updated } : row))
    mergeAppointment(updated)
  }

  const openAppointment = (appointment: Appointment) => {
    selectAppointment(appointment)
    if (onOpenAppointment) onOpenAppointment(appointment)
    else {
      window.dispatchEvent(new CustomEvent("schedwise:appointment-open", {
        detail: { appointmentId: appointment.id },
      }))
    }
  }

  const openSchedule = (appointment: Appointment) => {
    if (onOpenSchedule) onOpenSchedule(appointment)
    else {
      window.dispatchEvent(new CustomEvent("schedwise:appointment-reschedule", {
        detail: { appointmentId: appointment.id },
      }))
    }
  }

  const approve = async (appointment: Appointment) => {
    const label = appointment.status === "reschedule_requested"
      ? "Approve the requested time"
      : "Accept this appointment request"
    if (!await confirmAction(`${label} from ${studentName(appointment)}?`)) return
    setBusyId(appointment.id)
    setError("")
    try {
      updateRow(await appointmentApi.approve(appointment.id))
      setNotice(`Appointment approved for ${studentName(appointment)}.`)
    } catch (err) {
      setError(errorMessage(err, "Unable to approve this appointment."))
    } finally {
      setBusyId("")
    }
  }

  const complete = async (appointment: Appointment) => {
    if (!await confirmAction(`Mark this consultation with ${studentName(appointment)} as completed?`)) return
    setBusyId(appointment.id)
    setError("")
    try {
      updateRow(await appointmentApi.complete(appointment.id))
      setNotice(`Consultation completed for ${studentName(appointment)}.`)
    } catch (err) {
      setError(errorMessage(err, "Unable to complete this appointment."))
    } finally {
      setBusyId("")
    }
  }

  const markNoShow = async (appointment: Appointment) => {
    if (!await confirmAction(`Mark ${studentName(appointment)} as a no-show for this consultation?`)) return
    setBusyId(appointment.id)
    setError("")
    try {
      updateRow(await appointmentApi.noShow(appointment.id))
      setNotice(`No-show recorded for ${studentName(appointment)}.`)
    } catch (err) {
      setError(errorMessage(err, "Unable to record this no-show."))
    } finally {
      setBusyId("")
    }
  }

  const openReasonDialog = (appointment: Appointment, kind: ReasonAction["kind"]) => {
    setReason("")
    setReasonError("")
    setReasonAction({ appointment, kind })
  }

  const submitReason = async (event: FormEvent) => {
    event.preventDefault()
    if (!reasonAction) return
    if (!reason.trim()) {
      setReasonError("Enter a short reason so the student knows what changed.")
      return
    }
    setBusyId(reasonAction.appointment.id)
    setReasonError("")
    try {
      const updated = reasonAction.kind === "cancel"
        ? await appointmentApi.cancel(reasonAction.appointment.id, reason.trim())
        : await appointmentApi.reject(reasonAction.appointment.id, reason.trim())
      updateRow(updated)
      setNotice(
        reasonAction.kind === "cancel"
          ? `Appointment cancelled for ${studentName(reasonAction.appointment)}.`
          : `Request declined for ${studentName(reasonAction.appointment)}.`,
      )
      setReasonAction(null)
      setReason("")
    } catch (err) {
      setReasonError(errorMessage(err, "Unable to update this appointment."))
    } finally {
      setBusyId("")
    }
  }

  const menuItemsFor = (appointment: Appointment) => {
    const items: {
      label: string
      icon: ReactNode
      danger?: boolean
      run: () => void
    }[] = [
      { label: "View details", icon: <Eye size={15} />, run: () => openAppointment(appointment) },
    ]
    if (appointment.status === "pending" || appointment.status === "reschedule_requested") {
      items.push(
        { label: "Reschedule", icon: <CalendarClock size={15} />, run: () => openSchedule(appointment) },
        { label: "Cancel appointment", icon: <X size={15} />, danger: true, run: () => openReasonDialog(appointment, "cancel") },
      )
    } else if (appointment.status === "confirmed") {
      items.push(
        { label: "Mark completed", icon: <Check size={15} />, run: () => { void complete(appointment) } },
      )
      if (consultationHasEnded(appointment.appointment_date, appointment.end_minutes)) {
        items.push(
          { label: "Mark no-show", icon: <AlertCircle size={15} />, danger: true, run: () => { void markNoShow(appointment) } },
        )
      }
      items.push(
        { label: "Reschedule", icon: <CalendarClock size={15} />, run: () => openSchedule(appointment) },
        { label: "Cancel appointment", icon: <X size={15} />, danger: true, run: () => openReasonDialog(appointment, "cancel") },
      )
    }
    return items
  }

  const openRowMenu = (event: ReactMouseEvent<HTMLButtonElement>, appointment: Appointment) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const itemCount = menuItemsFor(appointment).length
    const width = 208
    const estimatedHeight = itemCount * 38 + 12
    let top = rect.bottom + 6
    if (top + estimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - estimatedHeight - 6)
    }
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
    setMenu({ appointment, top, left })
  }

  const renderActions = (appointment: Appointment) => {
    const isBusy = busyId === appointment.id
    const more = (
      <button
        type="button"
        aria-label={`More actions for ${studentName(appointment)}`}
        title={`More actions for ${studentName(appointment)}`}
        disabled={isBusy}
        onClick={(event) => openRowMenu(event, appointment)}
        className="flex size-8 items-center justify-center rounded-full border border-border-card bg-white text-muted transition hover:border-primary/30 hover:bg-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MoreHorizontal size={16} />
      </button>
    )

    if (isPendingStatus(appointment.status)) {
      return (
        <div className="flex items-center justify-end gap-1">
          <ActionSlot>
            <IconAction
              label={`${appointment.status === "reschedule_requested" ? "Approve requested time" : "Accept appointment for"} ${studentName(appointment)}`}
              tone="success"
              disabled={isBusy}
              onClick={() => { void approve(appointment) }}
            >
              {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            </IconAction>
          </ActionSlot>
          <ActionSlot>
            <IconAction
              label={`${appointment.status === "reschedule_requested" ? "Reject requested time for" : "Decline appointment for"} ${studentName(appointment)}`}
              tone="danger"
              disabled={isBusy}
              onClick={() => openReasonDialog(appointment, appointment.status === "reschedule_requested" ? "reject" : "decline")}
            >
              <X size={16} />
            </IconAction>
          </ActionSlot>
          <ActionSlot>{more}</ActionSlot>
        </div>
      )
    }

    if (appointment.status === "confirmed") {
      return (
        <div className="flex items-center justify-end gap-1">
          <ActionSlot>
            <IconAction
              label={`Reschedule appointment for ${studentName(appointment)}`}
              tone="primary"
              disabled={isBusy}
              onClick={() => openSchedule(appointment)}
            >
              <CalendarClock size={16} />
            </IconAction>
          </ActionSlot>
          <ActionSlot>
            <IconAction
              label={`Cancel appointment for ${studentName(appointment)}`}
              tone="danger"
              disabled={isBusy}
              onClick={() => openReasonDialog(appointment, "cancel")}
            >
              <X size={16} />
            </IconAction>
          </ActionSlot>
          <ActionSlot>{more}</ActionSlot>
        </div>
      )
    }

    if (appointment.status === "completed") {
      return (
        <div className="flex items-center justify-end gap-1">
          <ActionSlot>
            <IconAction
              label={`View consultation record for ${studentName(appointment)}`}
              tone="primary"
              onClick={() => {
                if (onOpenRecords) onOpenRecords(appointment)
                else openAppointment(appointment)
              }}
            >
              <FileText size={16} />
            </IconAction>
          </ActionSlot>
          <ActionSlot />
          <ActionSlot>{more}</ActionSlot>
        </div>
      )
    }

    return (
      <div className="flex items-center justify-end gap-1">
        <ActionSlot>
          <IconAction
            label={`View appointment for ${studentName(appointment)}`}
            tone="primary"
            onClick={() => openAppointment(appointment)}
          >
            <Eye size={16} />
          </IconAction>
        </ActionSlot>
        <ActionSlot />
        <ActionSlot>{more}</ActionSlot>
      </div>
    )
  }

  const reasonTitle = reasonAction?.kind === "cancel"
    ? "Cancel appointment"
    : reasonAction?.kind === "reject"
      ? "Reject requested time"
      : "Decline appointment request"
  const reasonDescription = reasonAction
    ? `${studentName(reasonAction.appointment)} \u00b7 ${scheduleLabel(reasonAction.appointment).date} \u00b7 ${scheduleLabel(reasonAction.appointment).time}`
    : ""

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Appointment categories"
          className="flex min-w-0 flex-wrap items-center gap-1 rounded-[12px] bg-white p-1 ring-1 ring-border-card"
        >
          {TABS.map((item) => {
            const active = tab === item.key
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setTab(item.key)
                  setQuickView("")
                }}
                className={`inline-flex h-9 items-center gap-2 rounded-[8px] px-3 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                  active ? "bg-primary text-white" : "text-muted hover:bg-soft hover:text-ink"
                }`}
              >
                <span className="whitespace-nowrap">{item.label}</span>
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[12px] font-bold tabular-nums ${
                    active ? "bg-white/20 text-white" : "bg-soft text-ink"
                  }`}
                >
                  {counts[item.key]}
                </span>
              </button>
            )
          })}
        </div>
        {needsReviewCount > 0 ? (
          <span className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-amber-tint px-3 text-[12px] font-semibold text-amber">
            <AlertCircle size={14} />
            {needsReviewCount} need your review
          </span>
        ) : null}
      </div>

      <div
        ref={toolbarRef}
        className="relative mt-4 flex flex-wrap items-center gap-2 xl:flex-nowrap xl:gap-3"
      >
        <label className="relative min-w-[220px] flex-1 xl:max-w-[330px]">
          <span className="sr-only">Search appointments</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search student, topic, or reason"
            className="h-10 w-full rounded-[10px] border border-border-card bg-white pl-9 pr-9 text-[13px] text-ink outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear appointment search"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted transition hover:bg-soft hover:text-ink"
            >
              <X size={13} />
            </button>
          ) : null}
        </label>

        <div className="relative">
          <button
            type="button"
            aria-label="Choose appointment date range"
            aria-expanded={openPopover === "date"}
            onClick={() => setOpenPopover(openPopover === "date" ? null : "date")}
            className={`inline-flex h-10 items-center gap-2 rounded-[10px] border px-3 text-[13px] font-semibold transition ${
              dateFrom || dateTo
                ? "border-primary bg-soft text-primary"
                : "border-border-card bg-white text-muted hover:border-primary/30 hover:text-primary"
            }`}
          >
            <CalendarDays size={16} />
            <span className="max-w-[190px] truncate">{rangeLabel(dateFrom, dateTo)}</span>
            <ChevronDown size={14} />
          </button>
          {openPopover === "date" ? (
            <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-[280px] rounded-[12px] border border-border-card bg-white p-3 shadow-[0_16px_40px_rgba(45,27,105,0.16)]">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[12px] font-semibold text-muted">From</span>
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className="h-10 w-full rounded-[8px] border border-border-card px-2 text-[13px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[12px] font-semibold text-muted">To</span>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(event) => setDateTo(event.target.value)}
                    className="h-10 w-full rounded-[8px] border border-border-card px-2 text-[13px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </label>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom("")
                    setDateTo("")
                  }}
                  className="text-[12px] font-semibold text-muted underline-offset-2 hover:text-primary hover:underline"
                >
                  Clear dates
                </button>
                <button
                  type="button"
                  onClick={() => setOpenPopover(null)}
                  className="inline-flex h-8 items-center rounded-full bg-primary px-3 text-[12px] font-semibold text-white transition hover:opacity-90"
                >
                  Done
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            type="button"
            aria-label="Filter appointments"
            aria-expanded={openPopover === "filter"}
            onClick={() => setOpenPopover(openPopover === "filter" ? null : "filter")}
            className={`inline-flex h-10 items-center gap-2 rounded-[10px] border px-3 text-[13px] font-semibold transition ${
              filterCount > 0
                ? "border-primary bg-soft text-primary"
                : "border-border-card bg-white text-muted hover:border-primary/30 hover:text-primary"
            }`}
          >
            <SlidersHorizontal size={16} />
            Filter
            {filterCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[12px] font-bold text-white">
                {filterCount}
              </span>
            ) : null}
          </button>
          {openPopover === "filter" ? (
            <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-[250px] rounded-[12px] border border-border-card bg-white p-2 shadow-[0_16px_40px_rgba(45,27,105,0.16)]">
              <p className="px-2 py-1.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">
                Status
              </p>
              {STATUS_OPTIONS.map((status) => {
                const checked = statusFilter.includes(status)
                return (
                  <label
                    key={status}
                    className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-2 text-[13px] text-ink hover:bg-soft"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setStatusFilter((current) =>
                          current.includes(status)
                            ? current.filter((value) => value !== status)
                            : [...current, status]
                        )
                      }}
                      className="size-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span>{statusLabel[status]}</span>
                  </label>
                )
              })}
              <div className="mt-1 border-t border-divider pt-2">
                <button
                  type="button"
                  disabled={filterCount === 0}
                  onClick={() => setStatusFilter([])}
                  className="w-full rounded-[8px] px-2 py-2 text-left text-[12px] font-semibold text-muted transition hover:bg-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear status filters
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <label className="relative">
          <span className="sr-only">Sort appointments</span>
          <ArrowUpDown size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="h-10 w-[168px] cursor-pointer appearance-none rounded-[10px] border border-border-card bg-white pl-9 pr-8 text-[13px] font-semibold text-muted outline-none transition hover:border-primary/30 hover:text-primary focus:border-primary focus:ring-2 focus:ring-primary/15"
          >
            <option value="date-asc">Date: soonest</option>
            <option value="date-desc">Date: latest</option>
            <option value="student">Student: A-Z</option>
            <option value="status">Status: A-Z</option>
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
        </label>

        <label className="relative">
          <span className="sr-only">Choose an appointment view</span>
          <LayoutList size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <select
            value={quickView}
            onChange={(event) => {
              const value = event.target.value as QuickView
              setQuickView(value)
              if (value) setTab("all")
            }}
            className={`h-10 w-[150px] cursor-pointer appearance-none rounded-[10px] border bg-white pl-9 pr-8 text-[13px] font-semibold outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 ${
              quickView ? "border-primary text-primary" : "border-border-card text-muted hover:border-primary/30 hover:text-primary"
            }`}
          >
            <option value="">Views</option>
            <option value="response">Needs my response ({needsReviewCount})</option>
            <option value="closing">Needs closing ({needsClosingCount})</option>
            <option value="today">Today ({todayViewCount})</option>
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
        </label>

        <button
          type="button"
          aria-label={`Switch to ${density === "comfortable" ? "compact" : "comfortable"} density`}
          title={`Density: ${density === "comfortable" ? "Comfortable" : "Compact"}`}
          onClick={() => setDensity(density === "comfortable" ? "compact" : "comfortable")}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-card bg-white px-3 text-[13px] font-semibold text-muted transition hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <Rows3 size={16} />
          <span className="hidden 2xl:inline">{density === "comfortable" ? "Comfortable" : "Compact"}</span>
        </button>
      </div>

      {hasFilters ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {quickView ? (
            <FilterChip
              label={
                quickView === "response" ? "Needs my response" :
                quickView === "closing" ? "Needs closing" : "Today"
              }
              onClear={() => setQuickView("")}
            />
          ) : null}
          {dateFrom || dateTo ? (
            <FilterChip label={rangeLabel(dateFrom, dateTo)} onClear={() => { setDateFrom(""); setDateTo("") }} />
          ) : null}
          {statusFilter.map((status) => (
            <FilterChip
              key={status}
              label={statusLabel[status]}
              onClear={() => setStatusFilter((current) => current.filter((value) => value !== status))}
            />
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="text-[12px] font-semibold text-muted underline-offset-2 transition hover:text-primary hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => { void loadAppointments() }}
            className="inline-flex items-center gap-1.5 font-semibold underline"
          >
            <RotateCcw size={13} /> Retry
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="mt-3 rounded-[10px] border border-green/20 bg-green-tint px-3 py-2 text-[13px] font-medium text-green" role="status">
          {notice}
        </div>
      ) : null}

      <div className="mt-4 flex min-h-0 flex-1 gap-4">
        <div
          ref={pageFocusRef}
          tabIndex={-1}
          className="flex min-h-0 min-w-0 flex-1 flex-col outline-none"
        >
          <section className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-[16px] border border-border-card bg-white shadow-[0_1px_2px_rgba(45,27,105,0.06)]">
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[780px] table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[26%]" />
                  <col className="w-[28%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                  <col className="w-[132px]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-[#FBFAFF]">
                  <tr className="border-b border-border-card">
                    <th scope="col" className="h-11 px-4 text-[12px] font-bold uppercase tracking-[0.05em] text-muted">Student</th>
                    <th scope="col" className="h-11 px-4 text-[12px] font-bold uppercase tracking-[0.05em] text-muted">Consultation</th>
                    <th scope="col" className="h-11 px-4 text-[12px] font-bold uppercase tracking-[0.05em] text-muted">Schedule</th>
                    <th scope="col" className="h-11 px-4 text-[12px] font-bold uppercase tracking-[0.05em] text-muted">Status</th>
                    <th scope="col" className="h-11 px-4 text-right text-[12px] font-bold uppercase tracking-[0.05em] text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? Array.from({ length: 6 }).map((_, index) => (
                    <tr key={`skeleton-${index}`} className={density === "comfortable" ? "h-16" : "h-[52px]"}>
                      <td colSpan={5} className="border-b border-divider px-4">
                        <div className="flex animate-pulse items-center gap-3">
                          <div className="size-9 rounded-full bg-soft" />
                          <div className="flex-1">
                            <div className="h-3.5 w-1/4 rounded bg-soft" />
                            <div className="mt-2 h-3 w-1/3 rounded bg-soft" />
                          </div>
                          <div className="h-7 w-24 rounded-full bg-soft" />
                        </div>
                      </td>
                    </tr>
                  )) : pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="flex min-h-[260px] flex-col items-center justify-center px-6 py-10 text-center">
                          <span className="flex size-11 items-center justify-center rounded-full bg-soft text-primary">
                            <CalendarClock size={20} />
                          </span>
                          <p className="mt-3 font-[var(--font-display)] text-[18px] font-semibold text-ink">
                            {rows.length === 0 ? "No appointments yet" : "No appointments match these filters"}
                          </p>
                          <p className="mt-1 max-w-md text-[13px] leading-5 text-muted">
                            {rows.length === 0
                              ? "New consultation requests will appear here after students book a time."
                              : "Try another search, date range, or category."}
                          </p>
                          {hasFilters ? (
                            <Button
                              onClick={clearFilters}
                              className="mt-4 h-9 rounded-full border border-primary bg-white px-4 text-[13px] font-semibold text-primary hover:bg-soft"
                            >
                              Clear filters
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : pageRows.map((appointment) => {
                    const schedule = scheduleLabel(appointment)
                    const name = studentName(appointment)
                    const meta = studentMeta(appointment)
                    const rowHeight = density === "comfortable" ? "h-16" : "h-[52px]"
                    const isSelected = selectedId === appointment.id
                    return (
                      <tr
                        key={appointment.id}
                        data-appointment-id={appointment.id}
                        tabIndex={0}
                        aria-label={`Open appointment details for ${name}`}
                        onClick={() => openAppointment(appointment)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return
                          event.preventDefault()
                          openAppointment(appointment)
                        }}
                        className={`group cursor-pointer border-b border-divider transition last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${rowHeight} ${
                          isSelected ? "bg-soft/80" : "hover:bg-soft/40"
                        }`}
                      >
                        <td className="px-4 align-middle">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-soft text-[12px] font-bold text-primary">
                              {name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "??"}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-semibold text-ink" title={name}>{name}</p>
                              <p className="mt-0.5 truncate text-[12px] text-muted" title={meta}>{meta || "Student details not on file"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 align-middle">
                          <p className="truncate text-[13px] font-semibold text-ink" title={appointment.topic}>{appointment.topic || "Consultation"}</p>
                          <p className="mt-0.5 truncate text-[12px] text-muted" title={appointment.reason}>{appointment.reason || "No reason provided"}</p>
                        </td>
                        <td className="px-4 align-middle">
                          <p className="truncate text-[13px] font-semibold text-ink">{schedule.date}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted">
                            <Clock3 size={12} className="shrink-0" />
                            <span className="truncate">{schedule.time}</span>
                          </p>
                        </td>
                        <td className="px-4 align-middle">
                          <span className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-semibold ${statusChipClass(appointment.status)}`}>
                            <span className="size-1.5 rounded-full bg-current opacity-70" />
                            {statusLabel[appointment.status]}
                          </span>
                        </td>
                        <td
                          className="px-4 align-middle"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          {renderActions(appointment)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-card bg-white px-4 py-3">
              <p aria-live="polite" className="text-[12px] text-muted">
                {filtered.length === 0
                  ? "Showing 0 appointments"
                  : `Showing ${firstRow}\u2013${lastRow} of ${filtered.length} appointments`}
                {(dateFrom || dateTo) ? ` \u00b7 ${rangeLabel(dateFrom, dateTo)}` : ""}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-muted">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  className="flex size-8 items-center justify-center rounded-full border border-border-card bg-white text-muted transition hover:border-primary/30 hover:bg-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  className="flex size-8 items-center justify-center rounded-full border border-border-card bg-white text-muted transition hover:border-primary/30 hover:bg-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </footer>
          </section>
        </div>

        {selectedAppointment ? (
          <FacultyAppointmentDetailPanel
            appointment={selectedAppointment}
            position={selectedIndex + 1}
            total={filtered.length}
            busy={busyId === selectedAppointment.id}
            onPrevious={() => selectByIndex(selectedIndex - 1)}
            onNext={() => selectByIndex(selectedIndex + 1)}
            onClose={closePanel}
            onAccept={() => { void approve(selectedAppointment) }}
            onDecline={() => openReasonDialog(
              selectedAppointment,
              selectedAppointment.status === "reschedule_requested" ? "reject" : "decline",
            )}
            onOpenRecords={onOpenRecords}
            onReschedule={() => openSchedule(selectedAppointment)}
            onCancel={() => openReasonDialog(selectedAppointment, "cancel")}
            onComplete={() => { void complete(selectedAppointment) }}
            onMarkNoShow={() => { void markNoShow(selectedAppointment) }}
          />
        ) : null}
      </div>


      {menu ? createPortal(
        <>
          <div className="fixed inset-0 z-[55]" onMouseDown={() => setMenu(null)} />
          <div
            role="menu"
            aria-label={`Actions for ${studentName(menu.appointment)}`}
            style={{ top: menu.top, left: menu.left }}
            className="fixed z-[56] w-52 overflow-hidden rounded-[12px] border border-border-card bg-white p-1.5 shadow-[0_16px_40px_rgba(45,27,105,0.18)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {menuItemsFor(menu.appointment).map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null)
                  item.run()
                }}
                className={`flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] font-medium transition hover:bg-soft ${
                  item.danger ? "text-rose-700 hover:bg-rose-50" : "text-ink"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>,
        document.body,
      ) : null}

      {reasonAction ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(45,27,105,0.30)] p-4 backdrop-blur-[6px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReasonAction(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointment-reason-title"
            className="w-full max-w-[440px] rounded-[16px] border border-border-card bg-white p-6 shadow-[0_20px_60px_rgba(45,27,105,0.18)]"
          >
            <form onSubmit={submitReason}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="appointment-reason-title" className="font-[var(--font-display)] text-[20px] font-semibold text-ink">
                    {reasonTitle}
                  </h2>
                  <p className="mt-1 text-[13px] text-muted">{reasonDescription}</p>
                </div>
                <button
                  type="button"
                  aria-label="Close dialog"
                  onClick={() => setReasonAction(null)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-soft text-ink transition hover:opacity-80"
                >
                  <X size={16} />
                </button>
              </div>
              <label className="mt-4 block">
                <span className="text-[13px] font-semibold text-ink">Reason &middot; Required</span>
                <TextareaTag
                  ref={reasonRef}
                  rows={4}
                  maxLength={5000}
                  value={reason}
                  aria-invalid={Boolean(reasonError)}
                  aria-describedby={reasonError ? "appointment-reason-error" : undefined}
                  onChange={(event) => {
                    setReason(event.target.value)
                    setReasonError("")
                  }}
                  placeholder="Share a short reason with the student"
                  className="mt-2 w-full resize-none rounded-[12px] border border-border bg-white px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </label>
              {reasonError ? (
                <p id="appointment-reason-error" role="alert" className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-rose-700">
                  <AlertCircle size={14} /> {reasonError}
                </p>
              ) : null}
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  onClick={() => setReasonAction(null)}
                  className="h-10 rounded-full border border-primary bg-white px-4 text-[13px] font-semibold text-primary hover:bg-soft"
                >
                  Keep appointment
                </Button>
                <Button
                  type="submit"
                  disabled={busyId === reasonAction.appointment.id}
                  className={`h-10 rounded-full px-4 text-[13px] font-semibold text-white disabled:opacity-60 ${
                    reasonAction.kind === "cancel" ? "bg-rose-600 hover:bg-rose-700" : "bg-primary hover:opacity-90"
                  }`}
                >
                  {busyId === reasonAction.appointment.id ? "Saving..." : reasonTitle}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-full bg-soft pl-2.5 pr-1 text-[12px] font-semibold text-primary">
      {label}
      <button
        type="button"
        aria-label={`Remove ${label} filter`}
        onClick={onClear}
        className="flex size-5 items-center justify-center rounded-full transition hover:bg-white"
      >
        <X size={12} />
      </button>
    </span>
  )
}

