import { useEffect, useSyncExternalStore } from "react"
import { notificationsApi, type AppNotification } from "../api"
import { errorMessage } from "./utils"

type NotificationsState = {
  userId: string
  items: AppNotification[]
  unreadCount: number | null
  loaded: boolean
  loading: boolean
  loadError: string
  busyId: string
  markingAll: boolean
  actionError: string
  actionErrorId: string
  notice: string
  revision: number
}

const emptyState = (userId = ""): NotificationsState => ({
  userId,
  items: [],
  unreadCount: null,
  loaded: false,
  loading: false,
  loadError: "",
  busyId: "",
  markingAll: false,
  actionError: "",
  actionErrorId: "",
  notice: "",
  revision: 0,
})

let state = emptyState()
const serverState = emptyState()
let requestId = 0
const listeners = new Set<() => void>()
let pollTimer = 0
let focusRefresh: (() => void) | null = null

function publish(next: NotificationsState) {
  state = next
  listeners.forEach((listener) => listener())
}

function activate(userId: string) {
  if (state.userId === userId) return
  requestId += 1
  publish(emptyState(userId))
}

export function resetNotifications() {
  requestId += 1
  publish(emptyState())
}

export async function refreshNotifications(userId: string, force = false) {
  if (!userId) return
  activate(userId)
  if ((state.loading && !force) || (state.loaded && !force)) return

  const currentRequest = ++requestId
  publish({
    ...state,
    loading: true,
    loadError: "",
  })

  try {
    const result = await notificationsApi.search({ page: 1, per_page: 100 })
    if (state.userId !== userId || requestId !== currentRequest) return
    publish({
      ...state,
      items: result.items,
      unreadCount: result.counts.unread,
      loaded: true,
      loading: false,
      loadError: "",
    })
  } catch (error) {
    if (state.userId !== userId || requestId !== currentRequest) return
    publish({
      ...state,
      loading: false,
      loadError: errorMessage(error, "Unable to load notifications."),
    })
  }
}

export function syncNotificationCounts(
  userId: string,
  counts: { unread: number },
) {
  if (!userId || state.userId !== userId) return
  if (state.busyId || state.markingAll) return
  if (state.unreadCount === counts.unread) return
  publish({ ...state, unreadCount: counts.unread })
}

export async function markNotificationRead(userId: string, notification: AppNotification) {
  if (
    !userId ||
    notification.read_at ||
    state.userId !== userId ||
    state.busyId ||
    state.markingAll
  ) {
    return
  }

  publish({ ...state, busyId: notification.id, actionError: "", actionErrorId: "", notice: "" })
  const currentRequest = ++requestId
  try {
    await notificationsApi.markRead(notification.id)
    if (state.userId !== userId || requestId !== currentRequest) {
      if (state.userId === userId && state.busyId === notification.id) {
        publish({ ...state, busyId: "" })
      }
      return
    }
    const now = new Date().toISOString()
    publish({
      ...state,
      items: state.items.map((item) =>
        item.id === notification.id ? { ...item, read_at: now } : item,
      ),
      unreadCount:
        state.unreadCount === null ? null : Math.max(0, state.unreadCount - 1),
      busyId: "",
      loading: false,
      actionError: "",
      actionErrorId: "",
      notice: "Notification marked as read.",
      revision: state.revision + 1,
    })
    if (state.unreadCount === null) void refreshNotifications(userId, true)
  } catch (error) {
    if (state.userId !== userId || requestId !== currentRequest) {
      if (state.userId === userId && state.busyId === notification.id) {
        publish({ ...state, busyId: "" })
      }
      return
    }
    publish({
      ...state,
      busyId: "",
      actionError: errorMessage(error, "Unable to mark this notification as read."),
      actionErrorId: notification.id,
      notice: "",
    })
  }
}

export async function markAllNotificationsRead(userId: string) {
  if (!userId || state.userId !== userId || state.markingAll || state.busyId) return

  publish({ ...state, markingAll: true, actionError: "", actionErrorId: "", notice: "" })
  const currentRequest = ++requestId
  try {
    await notificationsApi.markAllRead()
    if (state.userId !== userId || requestId !== currentRequest) {
      if (state.userId === userId && state.markingAll) {
        publish({ ...state, markingAll: false })
      }
      return
    }
    const now = new Date().toISOString()
    publish({
      ...state,
      items: state.items.map((item) =>
        item.read_at ? item : { ...item, read_at: now },
      ),
      unreadCount: 0,
      markingAll: false,
      loading: false,
      actionError: "",
      actionErrorId: "",
      notice: "All notifications marked as read.",
      revision: state.revision + 1,
    })
  } catch (error) {
    if (state.userId !== userId || requestId !== currentRequest) {
      if (state.userId === userId && state.markingAll) {
        publish({ ...state, markingAll: false })
      }
      return
    }
    publish({
      ...state,
      markingAll: false,
      actionError: errorMessage(error, "Unable to mark notifications as read."),
      actionErrorId: "",
      notice: "",
    })
  }
}

function subscribe(listener: () => void) {
  const wasEmpty = listeners.size === 0
  listeners.add(listener)
  if (wasEmpty && typeof window !== "undefined") {
    focusRefresh = () => {
      if (state.userId) void refreshNotifications(state.userId, true)
    }
    window.addEventListener("focus", focusRefresh)
    pollTimer = window.setInterval(focusRefresh, 60_000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && focusRefresh) {
      window.removeEventListener("focus", focusRefresh)
      window.clearInterval(pollTimer)
      pollTimer = 0
      focusRefresh = null
    }
  }
}

export function useNotifications(userId: string) {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => serverState,
  )

  useEffect(() => {
    activate(userId)
    void refreshNotifications(userId)
  }, [userId])

  return current.userId === userId ? current : emptyState(userId)
}
