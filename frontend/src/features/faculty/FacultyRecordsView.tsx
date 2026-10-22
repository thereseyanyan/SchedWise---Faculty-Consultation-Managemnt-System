import { useContext, useEffect, useState } from "react"
import { Search } from "lucide-react"
import { consultationApi } from "../../api"
import {
  Avatar,
  Button,
  CurrentUserContext,
  InputTag,
  PageTitle,
  TextareaTag,
  errorMessage,
  fullName,
  initialsOf,
} from "../../shared"

export function FacultyRecordsView() {
  const currentUser = useContext(CurrentUserContext)
  const [students, setStudents] = useState<Array<{ id: string; name: string; initials: string; lastConsultationDate: string; lastTopic: string }>>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ id: string; name: string; initials: string; lastConsultationDate: string; lastTopic: string } | null>(null)

  // Fetch consultation records and process them to get student data
  useEffect(() => {
    const fetchConsultationData = async () => {
      setLoading(true)
      setError(null)
      try {
        const facultyId = currentUser?.id ?? ""
        if (!facultyId) {
          throw new Error("Unable to determine the signed-in faculty account.")
        }

        // Get consultation records for this faculty
        const consultations = await consultationApi.list({ faculty_id: facultyId })

        // Process consultations to get unique students with their latest consultation
        const studentMap = new Map<string, {
          id: string;
          name: string;
          initials: string;
          lastConsultationDate: string;
          lastTopic: string;
          notes: string;
        }>()

        consultations.forEach(consultation => {
          const studentId = consultation.student_id
          const studentName = fullName(
            consultation.student_first_name,
            consultation.student_last_name,
            `Student ID: ${studentId}`,
          )
          const initials = initialsOf(studentName)
          const date = consultation.updated_at || consultation.created_at || new Date().toISOString()
          const formattedDate = formatDate(new Date(date), { month: "short", day: "numeric", year: "numeric" })
          const topic = consultation.topic || "Consultation"
          const notes = consultation.summary || consultation.action_items || ""

          // Keep only the latest consultation for each student
          if (!studentMap.has(studentId) || new Date(date) > new Date(studentMap.get(studentId)?.lastConsultationDate || 0)) {
            studentMap.set(studentId, {
              id: studentId,
              name: studentName,
              initials,
              lastConsultationDate: formattedDate,
              lastTopic: topic,
              notes: notes || ""
            })
          }
        })

        // Convert map to array
        const studentList = Array.from(studentMap.values())

        setStudents(studentList)
        // Initialize notes with consultation summaries
        const initialNotes: Record<string, string> = {}
        studentList.forEach(student => {
          initialNotes[student.id] = student.notes || ""
        })
        setNotes(initialNotes)
        setSelected(studentList[0] ?? null)
      } catch (err) {
        setError(errorMessage(err, "Failed to load consultation records"))
        setStudents([])
        setNotes({})
        setSelected(null)
      } finally {
        setLoading(false)
      }
    }

    fetchConsultationData()
  }, [currentUser?.id])

  // Helper function to format date
  const formatDate = (d: Date, opts: Intl.DateTimeFormatOptions) => {
    return d.toLocaleDateString("en-US", opts)
  }

  return (
    <div>
      {loading && (
        <div className="text-center py-8">
          <p className="text-sm text-slate-500">Loading consultation records...</p>
        </div>
      )}
      {error && (
        <div className="text-center py-8">
          <p className="text-sm text-rose-500">{error}</p>
        </div>
      )}
      <PageTitle
        eyebrow="Consultation records"
        title="Student Records"
        description="Review completed consultations and keep concise summary notes."
      />
      <div className="mt-8 overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)] lg:grid lg:min-h-[620px] lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-slate-50/70 p-4 lg:border-b-0 lg:border-r">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <InputTag
              placeholder="Find a student"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15"
            />
          </div>
          <div className="mt-5 space-y-1">
            {students.map((student) => (
              <Button
                key={student.id}
                onClick={() => setSelected(student)}
                className={`w-full justify-start gap-3 rounded-xl p-3 text-left ${
                  selected?.id === student.id
                    ? "bg-white shadow-sm ring-1 ring-slate-200"
                    : "hover:bg-white/70"
                }`}
              >
                <Avatar initials={student.initials} />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-slate-800">
                    {student.name}
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    {student.lastConsultationDate}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        </aside>
        <section className="flex min-h-[580px] flex-col p-6 sm:p-10">
          {selected ? (
            <>
              <div className="border-b border-slate-100 pb-6">
                <p className="text-xl font-semibold text-slate-900">
                  {selected.name}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {selected.lastTopic} · {selected.lastConsultationDate}
                </p>
              </div>
              <div className="mt-7 flex flex-1 flex-col">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">
                    Consultation Summary
                  </p>
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    Read-only record
                  </span>
                </div>
                <TextareaTag
                  key={selected.id}
                  value={notes[selected.id] || ""}
                  readOnly
                  className="mt-4 min-h-80 flex-1 resize-none rounded-xl border-0 bg-slate-50 p-6 text-sm leading-8 text-slate-700 outline-none ring-1 ring-slate-100 focus:bg-white focus:ring-2 focus:ring-purple-600/30"
                />
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-slate-500">No students found</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
