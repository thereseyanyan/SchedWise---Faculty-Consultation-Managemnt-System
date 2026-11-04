import { useContext, useEffect, useMemo, useRef, useState } from "react"
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react"
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
  facultyAvailabilityApi,
  facultyScheduleOverridesApi,
  type Appointment,
  type ApptStatus,
} from "../../api"
import {
  Button,
  CurrentUserContext,
  clock,
  consultationHasEnded,
  errorMessage,
  formatDate,
  fromIso,
  fullName,
  mergeAppointment,
  statusLabel,
  todayInTimeZone,
} from "../../shared"
import { FacultyAppointmentDetailPanel } from "./FacultyAppointmentDetailPanel"
import {
  AcceptAppointmentDialog,
  BulkDeclineAppointmentsDialog,
  CancelAppointmentDialog,
  ChooseNewTimeDialog,
  ConfirmAppointmentDialog,
  DeclineAppointmentDialog,
} from "./FacultyAppointmentDialogs"
import {
  bulkEligibleAppointments,
  canBulkAct,
  nextAppointmentIndex,
  previousAppointmentIndex,
  resolveShortcutTarget,
  runBulkAppointmentAction,
  type BulkActionId,
  type BulkOutcome,
} from "./appointmentBulkState"
import {
  facultyScheduleAllows,
  findAppointmentConflict,
} from "./appointmentPanelState"

type TabKey = "all" | "pending" | "upcoming" | "past" | "closed"
type QuickView = "" | "response" | "closing" | "today"
type Density = "comfortable" | "compact"
type SortKey = "date-asc" | "date-desc" | "student" | "status"
type AppointmentDialog =
  | { kind: "accept"; appointment: Appointment }
  | { kind: "decline"; appointment: Appointment }
  | { kind: "cancel"; appointment: Appointment }
  | { kind: "reschedule"; appointment: Appointment }
  | { kind: "confirm"; appointment: Appointment; action: "complete" | "no-show" }

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

// Quick views are defined by the existing rules below:
// Needs my response: pending or reschedule_requested.
// Needs closing: confirmed appointments whose end time has passed in the application timezone.
// Today: appointment_date is today in the application timezone and the status is not cancelled.
function isPendingStatus(status: ApptStatus) {
  return PENDING_STATUSES.includes(status)
}

function isClosedStatus(status: ApptStatus) {
  return CLOSED_STATUSES.includes(status)
}

function needsClosing(appointment: Appointment, timeZone?: string) {
  return appointment.status === "confirmed" &&
    consultationHasEnded(appointment.appointment_date, appointment.end_minutes, timeZone)
}

function tabFor(appointment: Appointment, timeZone?: string): Exclude<TabKey, "all"> {
  if (isPendingStatus(appointment.status)) return "pending"
  if (isClosedStatus(appointment.status)) return "closed"
  if (appointment.status === "completed") return "past"
  if (needsClosing(appointment, timeZone)) return "past"
  return "upcoming"
}

function statusChipClass(status: ApptStatus) {
  if (isPendingStatus(status)) return "border-amber/25 bg-amber-tint text-amber-800"
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
  onOpenRecords,
  onOpenAppointment,
}: {
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
  const [selectedId, setSelectedId] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkDeclineTargets, setBulkDeclineTargets] = useState<Appointment[] | null>(null)
  const [bulkFeedback, setBulkFeedback] = useState<{
    tone: "success" | "error"
    message: string
  } | null>(null)
  const [panelConflict, setPanelConflict] = useState<string | null>(null)
  const [openPopover, setOpenPopover] = useState<"date" | "filter" | null>(null)
  const [dialog, setDialog] = useState<AppointmentDialog | null>(null)
  const [menu, setMenu] = useState<{
    appointment: Appointment
    top: number
    left: number
  } | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const pageFocusRef = useRef<HTMLDivElement>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const datePopoverTriggerRef = useRef<HTMLButtonElement>(null)
  const filterPopoverTriggerRef = useRef<HTMLButtonElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const menuItemsRef = useRef<HTMLDivElement>(null)
  const currentUser = useContext(CurrentUserContext)
  const timeZone = currentUser?.timezone
  const today = todayInTimeZone(timeZone)
  const pageSize = density === "comfortable" ? 8 : 10
  const canBulkManage = currentUser?.role_id === "faculty" || currentUser?.role_id === "admin"

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
        if (menu) {
          setMenu(null)
          window.requestAnimationFrame(() => menuTriggerRef.current?.focus())
          return
        }
        if (openPopover) {
          const trigger = openPopover === "date"
            ? datePopoverTriggerRef.current
            : filterPopoverTriggerRef.current
          setOpenPopover(null)
          trigger?.focus()
        }
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
  }, [menu, openPopover])

  useEffect(() => {
    if (!menu) return
    window.requestAnimationFrame(() => {
      menuItemsRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    })
  }, [menu])

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
    for (const appointment of dateScoped) result[tabFor(appointment, timeZone)] += 1
    return result
  }, [dateScoped, timeZone])

  const needsReviewCount = counts.pending
  const needsClosingCount = useMemo(
    () => dateScoped.filter((appointment) => needsClosing(appointment, timeZone)).length,
    [dateScoped, timeZone],
  )
  const todayViewCount = useMemo(
    () => dateScoped.filter((appointment) =>
      appointment.appointment_date === today && appointment.status !== "cancelled"
    ).length,
    [dateScoped, today],
  )

  const filtered = useMemo(() => {
    let result = dateScoped
    if (tab !== "all") result = result.filter((appointment) => tabFor(appointment, timeZone) === tab)
    if (quickView === "response") result = result.filter((appointment) => isPendingStatus(appointment.status))
    if (quickView === "closing") result = result.filter((appointment) => needsClosing(appointment, timeZone))
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
  }, [dateScoped, tab, quickView, statusFilter, sort, today, timeZone])

  useEffect(() => {
    setPage(1)
  }, [query, tab, quickView, dateFrom, dateTo, sort, density, statusFilter.join("|")])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [query, tab, quickView, dateFrom, dateTo, statusFilter.join("|")])

  const selectedIndex = selectedId
    ? filtered.findIndex((appointment) => appointment.id === selectedId)
    : -1
  const selectedAppointment = selectedIndex >= 0 ? filtered[selectedIndex] : null
  const bulkEligibleRows = useMemo(
    () => bulkEligibleAppointments(filtered, "accept"),
    [filtered],
  )
  const selectedAppointments = useMemo(
    () => filtered.filter((appointment) =>
      selectedIds.has(appointment.id) && canBulkAct("accept", appointment)
    ),
    [filtered, selectedIds],
  )
  const allEligibleSelected = bulkEligibleRows.length > 0 &&
    bulkEligibleRows.every((appointment) => selectedIds.has(appointment.id))
  const someEligibleSelected = bulkEligibleRows.some((appointment) =>
    selectedIds.has(appointment.id)
  )

  useEffect(() => {
    setSelectedIds((current) => {
      if (current.size === 0) return current
      const next = new Set<string>()
      for (const appointment of filtered) {
        if (current.has(appointment.id) && canBulkAct("accept", appointment)) {
          next.add(appointment.id)
        }
      }
      if (next.size === current.size) return current
      return next
    })
  }, [filtered])

  useEffect(() => {
    if (!selectAllRef.current) return
    selectAllRef.current.indeterminate = someEligibleSelected && !allEligibleSelected
  }, [someEligibleSelected, allEligibleSelected])

  useEffect(() => {
    if (selectedId && selectedIndex < 0) setSelectedId("")
  }, [selectedId, selectedIndex])

  useEffect(() => {
    if (!selectedAppointment || selectedAppointment.status !== "reschedule_requested") {
      setPanelConflict(null)
      return
    }
    const appointment = selectedAppointment
    let cancelled = false
    setPanelConflict(null)
    Promise.all([
      facultyAvailabilityApi.list({ faculty_id: appointment.faculty_id }),
      facultyScheduleOverridesApi.list({
        faculty_id: appointment.faculty_id,
        date: appointment.appointment_date,
      }),
    ]).then(([availability, overrides]) => {
      if (cancelled) return
      const conflict = findAppointmentConflict(appointment, rows)
      if (conflict) {
        const schedule = scheduleLabel(conflict)
        setPanelConflict(
          `Overlaps with ${studentName(conflict)} on ${schedule.date} at ${schedule.time}.`,
        )
        return
      }
      if (!facultyScheduleAllows(
        appointment.appointment_date,
        appointment.start_minutes,
        appointment.end_minutes,
        availability,
        overrides,
      )) {
        setPanelConflict("The requested time is outside your available schedule.")
        return
      }
      setPanelConflict("")
    }).catch((err) => {
      if (!cancelled) setPanelConflict(errorMessage(err, "Unable to check availability."))
    })
    return () => {
      cancelled = true
    }
  }, [
    selectedAppointment?.id,
    selectedAppointment?.status,
    selectedAppointment?.appointment_date,
    selectedAppointment?.start_minutes,
    selectedAppointment?.end_minutes,
    selectedAppointment?.faculty_id,
    rows,
  ])

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
      if (event.key !== "Escape" || dialog || menu || openPopover) return
      event.preventDefault()
      closePanel()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [selectedId, dialog, menu, openPopover])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (dialog || menu || openPopover || bulkDeclineTargets || bulkBusy) return
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable ||
          target.closest("button, a, [role='button'], [role='menuitem']")
        ) return
      }
      const key = event.key.toLowerCase()
      if (key === "j" || key === "k") {
        if (filtered.length === 0) return
        event.preventDefault()
        selectByIndex(
          key === "j"
            ? nextAppointmentIndex(selectedIndex, filtered.length)
            : previousAppointmentIndex(selectedIndex, filtered.length),
        )
        return
      }
      if (key !== "a" && key !== "d") return
      const action: BulkActionId = key === "a" ? "accept" : "decline"
      const appointment = resolveShortcutTarget(filtered, selectedId, action)
      if (!appointment) return
      event.preventDefault()
      setDialog({ kind: action, appointment })
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [dialog, menu, openPopover, bulkDeclineTargets, bulkBusy, filtered, selectedId, selectedIndex])

  const toggleSelection = (appointment: Appointment) => {
    if (!canBulkManage || !canBulkAct("accept", appointment)) return
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(appointment.id)) next.delete(appointment.id)
      else next.add(appointment.id)
      return next
    })
  }

  const toggleAllEligible = () => {
    if (!canBulkManage) return
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allEligibleSelected) {
        for (const appointment of bulkEligibleRows) next.delete(appointment.id)
      } else {
        for (const appointment of bulkEligibleRows) next.add(appointment.id)
      }
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const applyBulkOutcome = (action: BulkActionId, outcome: BulkOutcome) => {
    if (outcome.succeeded.length > 0) {
      const updatedById = new Map(
        outcome.succeeded.map((appointment) => [appointment.id, appointment]),
      )
      setRows((current) => current.map((row) => {
        const updated = updatedById.get(row.id)
        return updated ? { ...row, ...updated } : row
      }))
      for (const updated of outcome.succeeded) mergeAppointment(updated)
    }
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const updated of outcome.succeeded) next.delete(updated.id)
      return next
    })

    const total = outcome.succeeded.length + outcome.failed.length + outcome.skipped.length
    const done = action === "accept" ? "Accepted" : "Declined"
    const passive = action === "accept" ? "accepted" : "declined"
    if (outcome.failed.length === 0 && outcome.skipped.length === 0) {
      setBulkFeedback({
        tone: "success",
        message: `${done} ${outcome.succeeded.length} ${outcome.succeeded.length === 1 ? "request" : "requests"}.`,
      })
    } else if (outcome.succeeded.length === 0) {
      setBulkFeedback({
        tone: "error",
        message: outcome.failed.length > 0
          ? `No requests were ${passive}. ${outcome.failed[0].error}`
          : `No requests were ${passive} because they were no longer actionable.`,
      })
    } else {
      const failureDetails = outcome.failed.slice(0, 2)
        .map((failure) => `${studentName(failure.appointment)}: ${failure.error}`)
        .join(" ")
      setBulkFeedback({
        tone: "error",
        message: `${done} ${outcome.succeeded.length} of ${total} requests.${failureDetails ? ` ${failureDetails}` : ""}${outcome.skipped.length > 0 ? ` ${outcome.skipped.length} were no longer actionable.` : ""}`,
      })
    }
    if (outcome.failed.length > 0) void loadAppointments()
  }

  const runBulkAccept = async () => {
    if (bulkBusy || !canBulkManage) return
    const targets = selectedAppointments.filter((appointment) =>
      canBulkAct("accept", appointment)
    )
    if (targets.length === 0) return
    setBulkBusy(true)
    setBulkFeedback(null)
    setNotice("")
    setError("")
    try {
      const outcome = await runBulkAppointmentAction(
        targets,
        "accept",
        (appointment) => appointmentApi.approve(appointment.id),
        (appointment, err) => errorMessage(
          err,
          `Unable to accept ${studentName(appointment)}.`,
        ),
      )
      applyBulkOutcome("accept", outcome)
    } finally {
      setBulkBusy(false)
    }
  }

  const runBulkDecline = async (reason: string) => {
    const targets = bulkDeclineTargets ?? []
    return runBulkAppointmentAction(
      targets,
      "decline",
      (appointment) => appointmentApi.reject(appointment.id, reason),
      (appointment, err) => errorMessage(
        err,
        `Unable to decline ${studentName(appointment)}.`,
      ),
    )
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const firstRow = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const lastRow = Math.min(currentPage * pageSize, filtered.length)
  const hasFilters = Boolean(
    query.trim() || dateFrom || dateTo || quickView || tab !== "all" || statusFilter.length > 0,
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
    setSelectedIds((current) => {
      if (!current.has(updated.id) || canBulkAct("accept", updated)) return current
      const next = new Set(current)
      next.delete(updated.id)
      return next
    })
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
        { label: "Reschedule", icon: <CalendarClock size={15} />, run: () => setDialog({ kind: "reschedule", appointment }) },
        { label: "Cancel appointment", icon: <X size={15} />, danger: true, run: () => setDialog({ kind: "cancel", appointment }) },
      )
    } else if (appointment.status === "confirmed") {
      if (needsClosing(appointment, timeZone)) {
        items.push(
          { label: "Mark completed", icon: <Check size={15} />, run: () => setDialog({ kind: "confirm", appointment, action: "complete" }) },
          { label: "Mark no-show", icon: <AlertCircle size={15} />, danger: true, run: () => setDialog({ kind: "confirm", appointment, action: "no-show" }) },
        )
      }
      items.push(
        { label: "Reschedule", icon: <CalendarClock size={15} />, run: () => setDialog({ kind: "reschedule", appointment }) },
        { label: "Cancel appointment", icon: <X size={15} />, danger: true, run: () => setDialog({ kind: "cancel", appointment }) },
      )
    }
    return items
  }

  const openRowMenu = (event: ReactMouseEvent<HTMLButtonElement>, appointment: Appointment) => {
    menuTriggerRef.current = event.currentTarget
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
    const more = (
      <button
        type="button"
        aria-label={`More actions for ${studentName(appointment)}`}
        title={`More actions for ${studentName(appointment)}`}
        aria-haspopup="menu"
        aria-expanded={menu?.appointment.id === appointment.id}
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
              onClick={() => setDialog({ kind: "accept", appointment })}
            >
              <Check size={16} />
            </IconAction>
          </ActionSlot>
          <ActionSlot>
            <IconAction
              label={`${appointment.status === "reschedule_requested" ? "Reject requested time for" : "Decline appointment for"} ${studentName(appointment)}`}
              tone="danger"
              onClick={() => setDialog({ kind: "decline", appointment })}
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
              onClick={() => setDialog({ kind: "reschedule", appointment })}
            >
              <CalendarClock size={16} />
            </IconAction>
          </ActionSlot>
          <ActionSlot>
            <IconAction
              label={`Cancel appointment for ${studentName(appointment)}`}
              tone="danger"
              onClick={() => setDialog({ kind: "cancel", appointment })}
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Appointment categories"
          className="flex min-w-0 flex-wrap items-center gap-1 rounded-[12px] bg-white p-1 ring-1 ring-border-card"
        >
          {TABS.map((item, index) => {
            const active = tab === item.key
            return (
              <button
                key={item.key}
                ref={(element) => { tabRefs.current[index] = element }}
                type="button"
                role="tab"
                tabIndex={active ? 0 : -1}
                aria-selected={active}
                onClick={() => {
                  setTab(item.key)
                  setQuickView("")
                }}
                onKeyDown={(event) => {
                  let nextIndex = index
                  if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length
                  else if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length
                  else if (event.key === "Home") nextIndex = 0
                  else if (event.key === "End") nextIndex = TABS.length - 1
                  else return
                  event.preventDefault()
                  setTab(TABS[nextIndex].key)
                  setQuickView("")
                  tabRefs.current[nextIndex]?.focus()
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
          <span className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-amber-tint px-3 text-[12px] font-semibold text-amber-800">
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
              className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted transition hover:bg-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <X size={13} />
            </button>
          ) : null}
        </label>

        <div className="relative">
          <button
            ref={datePopoverTriggerRef}
            type="button"
            aria-label="Choose appointment date range"
            aria-expanded={openPopover === "date"}
            onClick={() => setOpenPopover(openPopover === "date" ? null : "date")}
            className={`inline-flex h-10 items-center gap-2 rounded-[10px] border px-3 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
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
                  className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] text-[12px] font-semibold text-muted underline-offset-2 hover:text-primary hover:underline"
                >
                  Clear dates
                </button>
                <button
                  type="button"
                  onClick={() => setOpenPopover(null)}
                  className="inline-flex h-8 items-center rounded-full bg-primary px-3 text-[12px] font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2"
                >
                  Done
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            ref={filterPopoverTriggerRef}
            type="button"
            aria-label="Filter appointments"
            aria-expanded={openPopover === "filter"}
            onClick={() => setOpenPopover(openPopover === "filter" ? null : "filter")}
            className={`inline-flex h-10 items-center gap-2 rounded-[10px] border px-3 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
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
                  className="w-full rounded-[8px] px-2 py-2 text-left text-[12px] font-semibold text-muted transition hover:bg-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
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
          {tab !== "all" ? (
            <FilterChip
              label={TABS.find((item) => item.key === tab)?.label ?? tab}
              onClear={() => setTab("all")}
            />
          ) : null}
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
            className="rounded text-[12px] font-semibold text-muted underline-offset-2 transition hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {canBulkManage && selectedAppointments.length > 0 ? (
        <div
          role="region"
          aria-label="Bulk appointment actions"
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-primary/20 bg-soft px-3 py-2"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink">
              {selectedAppointments.length} selected{" "}
              <span className="font-normal text-muted">in this filtered view</span>
            </p>
            <p className="mt-0.5 text-[12px] leading-4 text-muted">
              Only pending and reschedule requests can be changed. Final-state records are excluded.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={bulkBusy}
              onClick={() => { void runBulkAccept() }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {bulkBusy ? "Working..." : `Accept selected (${selectedAppointments.length})`}
            </Button>
            <Button
              type="button"
              disabled={bulkBusy}
              onClick={() => {
                setBulkFeedback(null)
                setBulkDeclineTargets(selectedAppointments)
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 text-[12px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X size={14} />
              Decline selected
            </Button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded text-[12px] font-semibold text-muted underline-offset-2 transition hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              Clear selection
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => { void loadAppointments() }}
            className="inline-flex items-center gap-1.5 rounded font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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
      {bulkFeedback ? (
        <div
          role={bulkFeedback.tone === "error" ? "alert" : "status"}
          className={`mt-3 rounded-[10px] border px-3 py-2 text-[13px] font-medium ${
            bulkFeedback.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-green/20 bg-green-tint text-green"
          }`}
        >
          {bulkFeedback.message}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
        <span className="font-semibold text-ink">Keyboard</span>
        <span><ShortcutKey>J</ShortcutKey> next</span>
        <span><ShortcutKey>K</ShortcutKey> previous</span>
        <span><ShortcutKey>A</ShortcutKey> accept</span>
        <span><ShortcutKey>D</ShortcutKey> decline</span>
        <span className="text-muted">A/D use the selected request or the first pending request.</span>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 gap-4">
        <div
          ref={pageFocusRef}
          data-dialog-focus-fallback=""
          tabIndex={-1}
          className="flex min-h-0 min-w-0 flex-1 flex-col outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <section className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-[16px] border border-border-card bg-white shadow-[0_1px_2px_rgba(45,27,105,0.06)]">
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[940px] table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[40px]" />
                  <col className="w-[23%]" />
                  <col className="w-[23%]" />
                  <col className="w-[19%]" />
                  <col className="w-[21%]" />
                  <col className="w-[132px]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-[#FBFAFF]">
                  <tr className="border-b border-border-card">
                    <th scope="col" className="h-11 pl-4 pr-2">
                      {canBulkManage ? (
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={allEligibleSelected}
                          disabled={bulkEligibleRows.length === 0}
                          onChange={toggleAllEligible}
                          aria-label={`Select all ${bulkEligibleRows.length} actionable appointments in this filtered view`}
                          title="Select all actionable appointments in this filtered view"
                          className="size-4 cursor-pointer rounded border-border text-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      ) : null}
                    </th>
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
                      <td colSpan={6} className="border-b border-divider px-4">
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
                      <td colSpan={6}>
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
                    const selectable = canBulkAct("accept", appointment)
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
                        <td
                          className="pl-4 pr-2 align-middle"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          {canBulkManage ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(appointment.id)}
                              disabled={!selectable}
                              onChange={() => toggleSelection(appointment)}
                              aria-label={`Select ${name}${selectable ? "" : " (not actionable)"}`}
                              title={selectable
                                ? `Select ${name}`
                                : "Final-state appointments cannot be changed"}
                              className="size-4 cursor-pointer rounded border-border text-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
                            />
                          ) : null}
                        </td>
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
                  className="flex size-8 items-center justify-center rounded-full border border-border-card bg-white text-muted transition hover:border-primary/30 hover:bg-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  className="flex size-8 items-center justify-center rounded-full border border-border-card bg-white text-muted transition hover:border-primary/30 hover:bg-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
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
            onPrevious={() => selectByIndex(selectedIndex - 1)}
            onNext={() => selectByIndex(selectedIndex + 1)}
            onClose={closePanel}
            onAccept={() => setDialog({ kind: "accept", appointment: selectedAppointment })}
            onDecline={() => setDialog({ kind: "decline", appointment: selectedAppointment })}
            onOpenRecords={onOpenRecords}
            onReschedule={() => setDialog({ kind: "reschedule", appointment: selectedAppointment })}
            onCancel={() => setDialog({ kind: "cancel", appointment: selectedAppointment })}
            onComplete={() => setDialog({ kind: "confirm", appointment: selectedAppointment, action: "complete" })}
            onMarkNoShow={() => setDialog({ kind: "confirm", appointment: selectedAppointment, action: "no-show" })}
            conflict={panelConflict}
            timeZone={timeZone}
          />
        ) : null}
      </div>


      {menu ? createPortal(
        <>
          <div className="fixed inset-0 z-[55]" onMouseDown={() => setMenu(null)} />
          <div
            ref={menuItemsRef}
            role="menu"
            aria-label={`Actions for ${studentName(menu.appointment)}`}
            style={{ top: menu.top, left: menu.left }}
            className="fixed z-[56] w-52 overflow-hidden rounded-[12px] border border-border-card bg-white p-1.5 shadow-[0_16px_40px_rgba(45,27,105,0.18)]"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              const items = Array.from(
                menuItemsRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
              )
              const currentIndex = items.findIndex((item) => item === document.activeElement)
              let nextIndex = currentIndex
              if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length
              else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length
              else if (event.key === "Home") nextIndex = 0
              else if (event.key === "End") nextIndex = items.length - 1
              else if (event.key === "Escape") {
                event.preventDefault()
                event.stopPropagation()
                setMenu(null)
                window.requestAnimationFrame(() => menuTriggerRef.current?.focus())
                return
              } else {
                return
              }
              event.preventDefault()
              items[nextIndex]?.focus()
            }}
          >
            {menuItemsFor(menu.appointment).map((item, index) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={index === 0 ? 0 : -1}
                onClick={() => {
                  setMenu(null)
                  item.run()
                }}
                className={`flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] font-medium transition hover:bg-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
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

      {bulkDeclineTargets ? (
        <BulkDeclineAppointmentsDialog
          appointments={bulkDeclineTargets}
          onClose={() => setBulkDeclineTargets(null)}
          onConfirm={runBulkDecline}
          onCompleted={(outcome) => applyBulkOutcome("decline", outcome)}
        />
      ) : null}

      {dialog?.kind === "accept" ? (
        <AcceptAppointmentDialog
          appointment={dialog.appointment}
          onClose={() => setDialog(null)}
          onUpdated={(updated) => {
            updateRow(updated)
            setNotice(`Appointment approved for ${studentName(updated)}.`)
          }}
        />
      ) : null}

      {dialog?.kind === "decline" ? (
        <DeclineAppointmentDialog
          appointment={dialog.appointment}
          onClose={() => setDialog(null)}
          onUpdated={(updated) => {
            updateRow(updated)
            setNotice(`Request declined for ${studentName(updated)}.`)
          }}
        />
      ) : null}

      {dialog?.kind === "cancel" ? (
        <CancelAppointmentDialog
          appointment={dialog.appointment}
          onClose={() => setDialog(null)}
          onUpdated={(updated) => {
            updateRow(updated)
            setNotice(`Appointment cancelled for ${studentName(updated)}.`)
          }}
        />
      ) : null}

      {dialog?.kind === "confirm" ? (
        <ConfirmAppointmentDialog
          appointment={dialog.appointment}
          action={dialog.action}
          onClose={() => setDialog(null)}
          onUpdated={(updated) => {
            updateRow(updated)
            setNotice(dialog.action === "complete"
              ? `Consultation completed for ${studentName(updated)}.`
              : `No-show recorded for ${studentName(updated)}.`)
          }}
        />
      ) : null}

      {dialog?.kind === "reschedule" ? (
        <ChooseNewTimeDialog
          appointment={dialog.appointment}
          appointments={rows}
          onClose={() => setDialog(null)}
          onUpdated={(updated) => {
            updateRow(updated)
            setNotice(`Appointment moved for ${studentName(updated)}.`)
          }}
        />
      ) : null}
    </div>
  )
}

function ShortcutKey({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-border-card bg-white px-1 text-[12px] font-bold text-ink shadow-[0_1px_0_rgba(45,27,105,0.08)]">
      {children}
    </kbd>
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
