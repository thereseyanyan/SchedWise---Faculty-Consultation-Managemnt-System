import { useEffect, useState } from "react"
import { History, X } from "lucide-react"
import {
  appointmentApi,
  consultationApi,
  type Appointment,
  type ConsultationRecord,
} from "../../api"
import {
  Button,
  EmptyState,
  PageTitle,
  StatusBadge,
  errorMessage,
  formatDate,
  fromIso,
  fullName,
  statusLabel,
  statusTone,
  toIso,
} from "../../shared"

type Feedback = {
  summary: string
  actionItems: string
  followUpDate: string
}

export function StudentHistoryView() {
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [consultations, setConsultations] = useState<ConsultationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Both endpoints are scoped to the signed-in student by the API.
  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true)
      setError(null)
      try {
        const [allAppointments, ownConsultations] = await Promise.all([
          appointmentApi.list(),
          consultationApi.list(),
        ])
        setAppointments(allAppointments)
        setConsultations(ownConsultations)
      } catch (err) {
        setError(errorMessage(err, "Failed to load appointment history"))
        setAppointments([])
        setConsultations([])
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [])

  const today = toIso(new Date())
  // Active future appointments belong in My Appointments; history shows
  // finished records and appointments whose date has already passed.
  const history = appointments
    .filter((appt) =>
      ["completed", "rejected", "cancelled", "no_show"].includes(appt.status) ||
      appt.appointment_date < today,
    )
    .sort((a, b) => b.appointment_date.localeCompare(a.appointment_date))

  const formattedAppointments = history.map((appt) => {
    const consultation = consultations.find((record) => record.appointment_id === appt.id)
    const summary = consultation?.summary?.trim() || ""
    return {
      id: appt.id,
      date: formatDate(fromIso(appt.appointment_date), { month: "short", day: "numeric", year: "numeric" }),
      faculty: fullName(appt.faculty_first_name, appt.faculty_last_name, `Faculty ID: ${appt.faculty_id}`),
      topic: appt.topic || "Consultation",
      status: statusLabel[appt.status],
      tone: statusTone[appt.status],
      feedback: summary
        ? {
            summary,
            actionItems: consultation?.action_items?.trim() || "",
            followUpDate: consultation?.follow_up_date || "",
          }
        : null,
    }
  })

  return (
    <div>
      {loading && (
        <div className="text-center py-8">
          <p className="text-sm text-slate-500">Loading consultation history...</p>
        </div>
      )}
      {error && (
        <div role="alert" className="text-center py-8">
          <p className="text-sm text-rose-500">{error}</p>
        </div>
      )}
      <PageTitle
        eyebrow="Consultation records"
        title="My Consultation History"
        description="Review your previous faculty consultations and feedback."
      />
      <div className="mt-8 overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[1.3fr_1.4fr_1fr_0.9fr_1.2fr] gap-5 border-b border-slate-100 bg-slate-50 px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span>Faculty</span>
              <span>Topic</span>
              <span>Date</span>
              <span>Status</span>
              <span className="text-right">Feedback</span>
            </div>
            {formattedAppointments.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1.3fr_1.4fr_1fr_0.9fr_1.2fr] items-center gap-5 border-b border-slate-100 px-6 py-4 transition-colors last:border-b-0 hover:bg-slate-50"
              >
                <p className="text-sm font-medium text-slate-900">
                  {item.faculty}
                </p>
                <p className="text-sm text-slate-600">{item.topic}</p>
                <p className="text-sm text-slate-500">{item.date}</p>
                <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
                <div className="flex justify-end">
                  {item.feedback ? (
                    <Button
                      onClick={() => setFeedback(item.feedback)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      View feedback
                    </Button>
                  ) : item.status === "Completed" ? (
                    <span className="text-xs text-slate-400">No feedback</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {!loading && !error && formattedAppointments.length === 0 && (
        <EmptyState
          className="mt-6"
          icon={History}
          title="No consultation history yet"
          description="Your completed and past consultation records will appear here after your first appointment."
        />
      )}
      {feedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Button
            onClick={() => setFeedback(null)}
            className="absolute inset-0 rounded-none bg-slate-900/40"
          >
            <span className="sr-only">Close</span>
          </Button>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-feedback-title"
            className="relative z-10 w-full max-w-md rounded-2xl bg-white p-7 shadow-[0_10px_40px_-10px_rgba(15,23,42,0.25)]"
          >
            <div className="flex items-center justify-between">
              <p id="student-feedback-title" className="text-lg font-semibold text-slate-900">
                Faculty Feedback
              </p>
              <Button
                onClick={() => setFeedback(null)}
                title="Close feedback"
                aria-label="Close feedback"
                className="size-9 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </Button>
            </div>
            <div className="mt-5 space-y-4">
              <p className="rounded-xl bg-slate-50 p-5 text-sm leading-7 text-slate-600">
                {feedback.summary}
              </p>
              {feedback.actionItems && (
                <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-purple-700">
                    Action items
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
                    {feedback.actionItems}
                  </p>
                </div>
              )}
              {feedback.followUpDate && (
                <p className="text-xs font-medium text-slate-500">
                  Follow-up: {formatDate(fromIso(feedback.followUpDate), {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
