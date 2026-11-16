import { useEffect, useState } from "react"
import { Bell, CheckCheck } from "lucide-react"
import { notificationsApi, type AppNotification } from "../../api"
import {
  Button,
  EmptyState,
  Segmented,
  errorMessage,
  formatDate,
} from "../../shared"
import { StudentPageHeader } from "./studentUi"

type Filter = "all" | "unread"

/** Full notifications page for students (the bell in the top bar opens the quick panel). */
export function StudentNotificationsView({
  onNavigate,
  onUnreadChange,
}: {
  onNavigate: (view: string) => void
  onUnreadChange?: (count: number) => void
}) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [actingId, setActingId] = useState("")
  const [markingAll, setMarkingAll] = useState(false)

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      setItems(await notificationsApi.list())
    } catch (err) {
      setError(errorMessage(err, "Unable to load notifications."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const unread = items.filter((item) => !item.read_at).length
  useEffect(() => {
    onUnreadChange?.(unread)
  }, [unread, onUnreadChange])

  const visible = filter === "unread" ? items.filter((item) => !item.read_at) : items

  const markRead = async (item: AppNotification) => {
    if (item.read_at) return
    setActingId(item.id)
    setError("")
    try {
      await notificationsApi.markRead(item.id)
      setItems((current) => current.map((row) => (row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row)))
    } catch (err) {
      setError(errorMessage(err, "Unable to mark this notification as read."))
    } finally {
      setActingId("")
    }
  }

  const markAll = async () => {
    setMarkingAll(true)
    setError("")
    setNotice("")
    try {
      await notificationsApi.markAllRead()
      const stamp = new Date().toISOString()
      setItems((current) => current.map((row) => (row.read_at ? row : { ...row, read_at: stamp })))
      setNotice("All notifications marked as read.")
    } catch (err) {
      setError(errorMessage(err, "Unable to mark notifications as read."))
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <div>
      <StudentPageHeader
        title="Notifications"
        actions={
          <Button
            onClick={markAll}
            disabled={markingAll || unread === 0}
            className="gap-2 rounded-full border border-purple-300 bg-white px-4 py-2.5 text-sm font-semibold text-schedwise-purple hover:bg-schedwise-lavender-50"
          >
            <CheckCheck size={16} /> Mark all read
          </Button>
        }
      />

      <div className="mt-6 flex items-center gap-3">
        <Segmented
          className="w-64"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All (${items.length})` },
            { value: "unread", label: `Unread (${unread})` },
          ]}
        />
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>}

      <div className="mt-4 overflow-hidden rounded-2xl border border-[#e4defa] bg-white shadow-[0_5px_18px_rgba(109,40,217,0.10)]">
        {loading ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">Loading notifications…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            className="m-5"
            icon={Bell}
            title={filter === "unread" ? "No unread notifications" : "You're all caught up"}
            description="New updates about your appointments will appear here."
            action={<Button onClick={() => onNavigate("Book a Consultation")} className="rounded-full bg-schedwise-purple px-4 py-2 text-sm font-semibold text-white">Book a consultation</Button>}
          />
        ) : (
          <ul>
            {visible.map((item) => (
              <li key={item.id} className={`flex items-start gap-3 border-b border-schedwise-lavender-100 px-5 py-4 last:border-b-0 ${item.read_at ? "" : "bg-schedwise-lavender-50"}`}>
                <span className={`mt-1 size-2.5 shrink-0 rounded-full ${item.read_at ? "bg-transparent" : "bg-schedwise-purple"}`} aria-label={item.read_at ? "Read" : "Unread"} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-brand-deep-purple">{item.title}</p>
                  <p className="mt-0.5 text-sm text-[#5b5078]">{item.message}</p>
                  <p className="mt-1 text-xs text-[#8a80a8]">
                    {formatDate(new Date(item.created_at.replace(" ", "T")), { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {item.related_appointment_id && (
                    <Button onClick={() => onNavigate("My Appointments")} className="text-[13px] font-semibold text-schedwise-purple hover:underline">
                      View appointment
                    </Button>
                  )}
                  {!item.read_at && (
                    <Button
                      onClick={() => markRead(item)}
                      disabled={actingId === item.id}
                      className="rounded-full border border-purple-300 px-3 py-1 text-xs font-semibold text-schedwise-purple hover:bg-schedwise-lavender-50"
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
