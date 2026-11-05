import { useContext, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Bell, CheckCheck, X } from "lucide-react"
import type { AppNotification } from "../api"
import { CurrentUserContext } from "./contexts"
import { dateTimeInTimeZone } from "./datetime"
import {
  markAllNotificationsRead,
  markNotificationRead,
  refreshNotifications,
  useNotifications,
} from "./notificationsStore"

export function NotificationsButton() {
  const currentUser = useContext(CurrentUserContext)
  const userId = currentUser?.id ?? ""
  const notifications = useNotifications(userId)
  const [open, setOpen] = useState(false)
  const items = notifications.items
  const unread = notifications.unreadCount ?? 0
  const error = notifications.loadError || notifications.actionError

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  const openPanel = () => {
    setOpen(true)
    void refreshNotifications(userId, true)
  }

  const markAllRead = () => void markAllNotificationsRead(userId)
  const markRead = (notification: AppNotification) =>
    void markNotificationRead(userId, notification)

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        title="Notifications"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative inline-flex size-10 items-center justify-center rounded-[4px] border border-white/70 text-white transition hover:bg-white hover:text-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-950 ring-2 ring-purple-700">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="notifications-title"
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-purple-600">
                  Inbox
                </p>
                <h2 id="notifications-title" className="mt-1 text-xl font-bold tracking-tight text-slate-900">
                  Notifications
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {unread > 0 ? `${unread} unread ${unread === 1 ? "message" : "messages"}` : "You're all caught up."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Close notifications"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5">
              {notifications.notice && (
                <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
                  {notifications.notice}
                </p>
              )}
              {error && (
                <div role="alert" className="mb-4 space-y-2 rounded-xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
                  <p>{error}</p>
                  <button
                    type="button"
                    onClick={() => { void refreshNotifications(userId, true) }}
                    className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Retry
                  </button>
                </div>
              )}

              {notifications.loading && !notifications.loaded ? (
                <p className="py-6 text-center text-sm text-slate-500">Loading notifications…</p>
              ) : items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
                  <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-white text-slate-400 ring-1 ring-slate-200">
                    <Bell size={19} />
                  </span>
                  <p className="mt-4 text-sm font-semibold text-slate-800">No notifications yet</p>
                  <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-slate-500">
                    Appointment updates, faculty decisions, and account notices will appear here.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className={`rounded-2xl border px-4 py-4 ${
                        item.read_at
                          ? "border-slate-200 bg-white"
                          : "border-purple-200 bg-purple-50/60"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className={`mt-1.5 size-2 shrink-0 rounded-full ${
                            item.read_at ? "bg-slate-300" : "bg-purple-600"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-600">{item.message}</p>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[12px] text-slate-500">
                              {(() => {
                                const createdAt = dateTimeInTimeZone(
                                  item.created_at,
                                  currentUser?.timezone,
                                )
                                return createdAt
                                  ? new Intl.DateTimeFormat("en-US", {
                                      month: "short",
                                      day: "numeric",
                                      hour: "numeric",
                                      minute: "2-digit",
                                      timeZone: currentUser?.timezone,
                                    }).format(createdAt)
                                  : "Time unavailable"
                              })()}
                            </p>
                            {!item.read_at && (
                              <button
                                type="button"
                                disabled={notifications.busyId === item.id || notifications.markingAll}
                                onClick={() => { void markRead(item) }}
                                className="rounded-lg border border-purple-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-60"
                              >
                                {notifications.busyId === item.id ? "Saving…" : "Mark as read"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                disabled={unread === 0 || notifications.markingAll || notifications.busyId !== ""}
                onClick={markAllRead}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCheck size={14} />
                {notifications.markingAll ? "Saving…" : "Mark all read"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-purple-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
