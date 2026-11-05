import { useContext } from "react"
import { Bell, CalendarDays, CheckCircle2, Clock3, Info } from "lucide-react"
import type { AppNotification } from "../../api"
import { errorMessage, relativeTime } from "../../shared"
import { CurrentUserContext } from "../../shared/contexts"
import {
  markAllNotificationsRead,
  markNotificationRead,
  refreshNotifications,
  useNotifications,
} from "../../shared/notificationsStore"

const MAX_VISIBLE = 4

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

export function RecentNotificationsCard() {
  const currentUser = useContext(CurrentUserContext)
  const userId = currentUser?.id ?? ""
  const notifications = useNotifications(userId)
  const { items, unreadCount, loaded, loading } = notifications
  const unread = unreadCount ?? 0
  const error = notifications.loadError || notifications.actionError
  const visible = items.slice(0, MAX_VISIBLE)

  const markAllRead = () => void markAllNotificationsRead(userId)
  const markRead = (notification: AppNotification) =>
    void markNotificationRead(userId, notification)

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
          disabled={unread === 0 || notifications.markingAll || notifications.busyId !== "" || loading}
          aria-busy={notifications.markingAll}
          onClick={markAllRead}
          className="min-w-0 shrink-0 text-[14px] font-semibold text-primary transition enabled:hover:underline disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary max-sm:w-full max-sm:shrink max-sm:text-left"
        >
          Mark all read
        </button>
      </div>
      <div className="-mx-5 mt-3 border-t border-divider max-sm:-mx-1" />

      {loading && !loaded ? (
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
              onClick={() => { void refreshNotifications(userId, true) }}
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
            const saving = notifications.busyId === item.id
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
                  {relativeTime(item.created_at, currentUser?.timezone)}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {notifications.notice ? (
        <p role="status" className="mt-2 rounded-[8px] bg-green-tint px-2.5 py-1.5 text-[12px] text-green max-sm:break-words">
          {notifications.notice}
        </p>
      ) : null}
      {notifications.actionError ? (
        <p role="alert" className="mt-2 rounded-[8px] bg-amber-tint/60 px-2.5 py-1.5 text-[12px] text-ink max-sm:break-words">
          {notifications.actionError}
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
