import { useCallback, useEffect, useState } from "react"
import { Bell, CalendarDays, CheckCircle2, Clock3, Info } from "lucide-react"
import { notificationsApi, type AppNotification } from "../../api"
import { errorMessage, formatDate } from "../../shared"

const MAX_VISIBLE = 4

function parseCreatedAt(value: string) {
  return new Date(value.replace(" ", "T"))
}

function relativeTime(value: string) {
  const date = parseCreatedAt(value)
  const diff = Date.now() - date.getTime()
  if (!Number.isFinite(diff) || diff < 60_000) return "Just now"
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return formatDate(date, { month: "short", day: "numeric" })
}

function iconForType(type: string) {
  if (type === "appointment_approved") return CalendarDays
  if (type === "appointment_completed") return CheckCircle2
  if (type === "appointment_rescheduled") return Clock3
  if (type.startsWith("appointment_")) return Info
  return Bell
}

function toneForType(type: string) {
  if (type === "appointment_approved" || type === "appointment_completed") {
    return "bg-green-tint text-green"
  }
  if (type.startsWith("appointment_")) return "bg-amber-tint text-amber"
  return "bg-soft text-primary"
}

function notifyHeaderInbox() {
  window.dispatchEvent(new Event("focus"))
}

export function RecentNotificationsCard() {
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [actionError, setActionError] = useState("")
  const [actingId, setActingId] = useState("")
  const [markingAll, setMarkingAll] = useState(false)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) {
      setLoading(true)
      setError("")
    }
    try {
      const data = await notificationsApi.list()
      setItems(
        [...data].sort(
          (a, b) => parseCreatedAt(b.created_at).getTime() - parseCreatedAt(a.created_at).getTime(),
        ),
      )
      if (!quiet) setError("")
    } catch (err) {
      if (!quiet) setError(errorMessage(err, "Unable to load notifications."))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const onFocus = () => { void load(true) }
    const timer = window.setInterval(() => { void load(true) }, 60_000)
    window.addEventListener("focus", onFocus)
    return () => {
      window.removeEventListener("focus", onFocus)
      window.clearInterval(timer)
    }
  }, [load])

  const unread = items.filter((item) => !item.read_at).length
  const visible = items.slice(0, MAX_VISIBLE)

  const markAllRead = async () => {
    setMarkingAll(true)
    setActionError("")
    try {
      await notificationsApi.markAllRead()
      const now = new Date().toISOString()
      setItems((current) =>
        current.map((item) => item.read_at ? item : { ...item, read_at: now }),
      )
      notifyHeaderInbox()
    } catch (err) {
      setActionError(errorMessage(err, "Unable to mark notifications as read."))
    } finally {
      setMarkingAll(false)
    }
  }

  const markRead = async (notification: AppNotification) => {
    if (notification.read_at) return
    setActingId(notification.id)
    setActionError("")
    try {
      await notificationsApi.markRead(notification.id)
      const now = new Date().toISOString()
      setItems((current) =>
        current.map((item) => item.id === notification.id ? { ...item, read_at: now } : item),
      )
      notifyHeaderInbox()
    } catch (err) {
      setActionError(errorMessage(err, "Unable to mark this notification as read."))
    } finally {
      setActingId("")
    }
  }

  const openInbox = () => {
    document.querySelector<HTMLButtonElement>('button[aria-label^="Notifications"]')?.click()
  }

  return (
    <section className="mt-0 w-full h-full min-h-0 flex flex-col rounded-[16px] border border-border-card bg-card p-5 shadow-card max-sm:p-1">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start max-sm:gap-1">
        <h2 className="min-w-0 font-[var(--font-display)] text-[18px] leading-[24px] font-semibold text-ink max-sm:w-full max-sm:break-words">
          Recent notifications
        </h2>
        <button
          type="button"
          disabled={unread === 0 || markingAll || loading}
          aria-busy={markingAll}
          onClick={() => { void markAllRead() }}
          className="min-w-0 shrink-0 text-[14px] font-semibold text-primary transition enabled:hover:underline disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary max-sm:w-full max-sm:shrink max-sm:text-left"
        >
          Mark all read
        </button>
      </div>
      <div className="-mx-5 mt-3 border-t border-divider max-sm:-mx-1" />

      {loading ? (
        <div className="mt-4 flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: MAX_VISIBLE }, (_, index) => (
            <div key={index} className="animate-pulse rounded-[12px] border border-divider p-3 max-sm:p-1">
              <div className="flex items-center gap-2 max-sm:flex-wrap">
                <div className="size-8 shrink-0 rounded-[8px] bg-soft" />
                <div className="min-w-0 flex-1 max-sm:basis-full">
                  <div className="h-3.5 w-1/3 rounded bg-soft" />
                  <div className="mt-2 h-3 w-2/3 rounded bg-soft" />
                </div>
                <div className="h-3 w-[72px] shrink-0 rounded bg-soft max-sm:w-auto max-sm:basis-full" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="mt-4 rounded-[12px] border border-amber bg-amber-tint/60 px-4 py-6 text-center max-sm:px-2">
          <p className="text-[13px] text-ink max-sm:break-words">
            Couldn't load notifications ·{" "}
            <button
              type="button"
              onClick={() => { void load() }}
              className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Retry
            </button>
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-4 flex flex-1 min-h-0 flex-col items-center justify-center rounded-[12px] border border-dashed border-border-card bg-page-bg px-4 py-8 text-center max-sm:px-2">
          <span className="mx-auto flex size-8 items-center justify-center rounded-[8px] bg-soft text-primary">
            <Bell size={16} />
          </span>
          <p className="mt-3 text-[14px] font-semibold text-ink max-sm:break-words">No notifications yet</p>
          <p className="mt-1 text-[13px] text-muted max-sm:break-words">
            Appointment updates and account notices will appear here.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-1 min-h-0 flex-col gap-2">
          {visible.map((item) => {
            const Icon = iconForType(item.type)
            const unreadItem = !item.read_at
            const saving = actingId === item.id
            return (
              <button
                key={item.id}
                type="button"
                disabled={saving}
                aria-busy={saving}
                onClick={() => { void markRead(item) }}
                className={`flex w-full items-start gap-2 rounded-[12px] border border-divider p-4 text-left transition focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-wait max-sm:flex-wrap max-sm:p-1 ${
                  unreadItem
                    ? "border-l-[3px] border-l-primary bg-page-bg hover:bg-soft/60"
                    : "bg-card hover:bg-soft/40"
                } ${saving ? "opacity-70" : ""}`}
              >
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-[8px] ${toneForType(item.type)}`}>
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1 max-sm:basis-full">
                  <span className="block truncate text-[14px] font-semibold text-ink">{item.title}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted">{item.message}</span>
                </span>
                <span className="w-[72px] shrink-0 whitespace-nowrap pt-0.5 text-right text-[12px] text-muted max-sm:w-auto max-sm:basis-full">
                  {relativeTime(item.created_at)}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {actionError ? (
        <p role="alert" className="mt-2 rounded-[8px] bg-amber-tint/60 px-2.5 py-1.5 text-[12px] text-ink max-sm:break-words">
          {actionError}
        </p>
      ) : null}

      <div className="mt-auto pt-4 text-center">
        <button
          type="button"
          onClick={openInbox}
          className="inline-flex items-center gap-1 text-[14px] font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary max-sm:block max-sm:w-full max-sm:break-words"
        >
          See all notifications <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}
