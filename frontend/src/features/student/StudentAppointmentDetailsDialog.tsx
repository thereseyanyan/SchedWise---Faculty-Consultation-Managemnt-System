import type { ReactNode } from "react"
import { CalendarClock, X } from "lucide-react"
import type { Appointment, ConsultationRecord } from "../../api"
import { Button, formatDate, fromIso, fullName, timeRange } from "../../shared"
import {
  FacultyAvatar,
  StatusChip,
  StudentDialog,
  sizeMd,
  studentButton,
} from "./studentUi"

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-[#5b5078]">{label}</dt>
      <dd className="mt-1 break-words text-sm text-brand-deep-purple">{children}</dd>
    </div>
  )
}

/** "View" action on My Appointments: everything about one consultation in one place. */
export function StudentAppointmentDetailsDialog({
  appointment,
  record,
  canManage,
  onRequestNewTime,
  onCancel,
  onClose,
}: {
  appointment: Appointment
  record?: ConsultationRecord
  canManage: boolean
  onRequestNewTime: () => void
  onCancel: () => void
  onClose: () => void
}) {
  const faculty = fullName(appointment.faculty_first_name, appointment.faculty_last_name, "Faculty")
  const summary = record?.summary?.trim() || appointment.summary?.trim() || ""
  const actionItems = (record?.action_items ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean)

  return (
    <StudentDialog
      titleId="student-appointment-details-title"
      title={appointment.topic || "Consultation"}
      subtitle={
        <>
          {formatDate(fromIso(appointment.appointment_date), { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          {" · "}
          {timeRange(appointment.start_minutes, appointment.end_minutes)}
        </>
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} className={`${studentButton.secondary} ${sizeMd}`}>
            Close
          </Button>
          {canManage && (
            <>
              <Button onClick={onRequestNewTime} className={`${studentButton.secondary} ${sizeMd} gap-1.5`}>
                <CalendarClock size={15} /> Request new time
              </Button>
              <Button onClick={onCancel} className={`${studentButton.dangerOutline} ${sizeMd} gap-1.5`}>
                <X size={15} /> Cancel appointment
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-xl bg-schedwise-lavender-50 p-3">
        <FacultyAvatar name={faculty} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-brand-deep-purple">{faculty}</p>
          {appointment.faculty_number && <p className="truncate text-xs text-[#5b5078]">{appointment.faculty_number}</p>}
        </div>
        <StatusChip status={appointment.status} />
      </div>

      <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Detail label="Room">{appointment.location || "Room to be announced"}</Detail>
        <Detail label="Requested on">
          {formatDate(new Date(appointment.requested_at.replace(" ", "T")), { month: "short", day: "numeric", year: "numeric" })}
        </Detail>
        {appointment.meeting_link && (
          <Detail label="Meeting link">
            <a href={appointment.meeting_link} target="_blank" rel="noreferrer" className="font-semibold text-schedwise-purple hover:underline">
              Open link
            </a>
          </Detail>
        )}
        <div className="sm:col-span-2">
          <Detail label="Reason for consultation">{appointment.reason || "No reason provided."}</Detail>
        </div>
      </dl>

      {appointment.status === "reschedule_requested" && appointment.reschedule_reason && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Requested-time note: </span>
          {appointment.reschedule_reason}
        </p>
      )}

      {summary && (
        <div className="mt-5 rounded-xl border border-[#e4defa] p-4">
          <p className="text-[13px] font-semibold text-brand-deep-purple">Faculty summary</p>
          <p className="mt-1.5 text-sm leading-6 text-[#5b5078]">{summary}</p>
          {actionItems.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {actionItems.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-brand-deep-purple">
                  <span className="size-[18px] shrink-0 rounded-[5px] border-2 border-purple-300 bg-white" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          )}
          {record?.follow_up_date && (
            <p className="mt-3 text-xs font-semibold text-amber-800">
              Follow-up · {formatDate(fromIso(record.follow_up_date), { weekday: "short", month: "short", day: "numeric" })}
            </p>
          )}
        </div>
      )}
    </StudentDialog>
  )
}
