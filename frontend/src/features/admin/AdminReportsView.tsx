import { useEffect, useState } from "react"
import {
  BarChart3,
  CalendarDays,
  Clock3,
  Download,
  RefreshCw,
  UsersRound,
} from "lucide-react"
import {
  facultyApi,
  reportsApi,
  type FacultyDirectoryEntry,
} from "../../api"
import {
  Button,
  EmptyState,
  InputTag,
  PageTitle,
  SelectTag,
  errorMessage,
  fieldClass,
  fullName,
} from "../../shared"

export const currentMonthValue = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export const monthLabel = (value: string): string => {
  const [year, month] = value.split("-").map(Number)
  if (!year || !month) return value
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })
}

export function AdminReportsView() {
  const thisMonth = currentMonthValue()
  const [monthlyData, setMonthlyData] = useState<Array<{ month: string; value: number }>>([])
  const [stats, setStats] = useState<{
    totalAppointments: number;
    pendingRequests: number;
  } | null>(null)
  const [facultyList, setFacultyList] = useState<FacultyDirectoryEntry[]>([])
  const [selectedMonth, setSelectedMonth] = useState(thisMonth)
  const [departmentId, setDepartmentId] = useState("")
  const [facultyId, setFacultyId] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    facultyApi.list()
      .then((faculty) => {
        if (live) setFacultyList(faculty)
      })
      .catch(() => {
        // Faculty labels are supplementary; report data can still render.
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    let live = true
    const [yearText, monthText] = selectedMonth.split("-")
    const year = Number(yearText)
    const month = Number(monthText)
    if (!year || !month) return

    const fetchReportsData = async () => {
      setLoading(true)
      setError(null)
      try {
        const filters = {
          year,
          month,
          department_id: departmentId || undefined,
          faculty_id: facultyId || undefined,
        }
        const [summaryData, monthly] = await Promise.all([
          reportsApi.summary(filters),
          reportsApi.monthly(6, {
            end_month: selectedMonth,
            department_id: departmentId || undefined,
            faculty_id: facultyId || undefined,
          }),
        ])
        if (!live) return

        const statistics = summaryData?.statistics ?? {}
        setStats({
          totalAppointments: Number(statistics.total_appointments ?? 0),
          pendingRequests: Number(statistics.pending_appointments ?? 0),
        })

        const maxCompleted = Math.max(
          1,
          ...monthly.series.map((point) => point.completed),
        )
        setMonthlyData(
          monthly.series.map((point) => ({
            month: point.month,
            value: Math.round((point.completed / maxCompleted) * 100),
          })),
        )
      } catch (err) {
        if (!live) return
        setError(errorMessage(err, "Failed to load reports data"))
        setStats(null)
        setMonthlyData([])
      } finally {
        if (live) setLoading(false)
      }
    }

    void fetchReportsData()
    return () => {
      live = false
    }
  }, [selectedMonth, departmentId, facultyId])

  const departments: Array<{ id: string; name: string }> = []
  for (const member of facultyList) {
    if (member.department_id && !departments.some((department) => department.id === member.department_id)) {
      departments.push({
        id: member.department_id,
        name: member.department_name || member.department_id,
      })
    }
  }

  const facultyOptions = facultyList.filter(
    (member) => !departmentId || member.department_id === departmentId,
  )
  const filteredFacultyCount = facultyId
    ? facultyOptions.some((member) => member.id === facultyId) ? 1 : 0
    : facultyOptions.length
  const activeFaculty = facultyList.length === 0 ? 0 : filteredFacultyCount
  const hasFilters = selectedMonth !== thisMonth || Boolean(departmentId) || Boolean(facultyId)

  const exportUrl = reportsApi.exportUrl({
    year: Number(selectedMonth.split("-")[0]),
    month: Number(selectedMonth.split("-")[1]),
    department_id: departmentId || undefined,
    faculty_id: facultyId || undefined,
  })

  return (
    <div>
      <PageTitle
        eyebrow="Reports"
        title="System Analytics"
        description="A concise university-wide view of appointment activity and consultation demand."
      />

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Month</span>
            <InputTag
              type="month"
              value={selectedMonth}
              max={thisMonth}
              onChange={(event) => {
                if (event.target.value) setSelectedMonth(event.target.value)
              }}
              className={`${fieldClass} mt-1`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Department</span>
            <SelectTag
              value={departmentId}
              onChange={(event) => {
                setDepartmentId(event.target.value)
                setFacultyId("")
              }}
              className={`${fieldClass} mt-1`}
            >
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </SelectTag>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Faculty</span>
            <SelectTag
              value={facultyId}
              onChange={(event) => setFacultyId(event.target.value)}
              className={`${fieldClass} mt-1`}
            >
              <option value="">All faculty</option>
              {facultyOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {[member.first_name, member.last_name].filter(Boolean).join(" ") || member.email}
                </option>
              ))}
            </SelectTag>
          </label>
          <div className="flex items-end gap-2">
            {hasFilters && (
              <Button
                onClick={() => {
                  setSelectedMonth(thisMonth)
                  setDepartmentId("")
                  setFacultyId("")
                }}
                className="flex-1 rounded-[4px] border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-700"
              >
                Clear
              </Button>
            )}
            <a
              href={exportUrl}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-[4px] bg-purple-600 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-purple-700"
            >
              <Download size={14} />
              Export CSV
            </a>
          </div>
        </div>
        <p aria-live="polite" className="mt-3 text-xs text-slate-500">
          Showing {monthLabel(selectedMonth)}
          {departmentId ? " for the selected department" : ""}
          {facultyId ? " for the selected faculty member" : ""}.
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {stats ? (
          <>
            <div
              key="totalAppointments"
              className="rounded-2xl bg-white p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
            >
              <CalendarDays size={19} className="text-slate-500" />
              <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">
                {stats.totalAppointments}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                Total Appointments
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {monthLabel(selectedMonth)}
              </p>
            </div>
            <div
              key="pendingRequests"
              className="rounded-2xl bg-white p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
            >
              <Clock3 size={19} className="text-slate-500" />
              <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">
                {stats.pendingRequests}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                Pending Requests
              </p>
              <p className="mt-1 text-xs text-slate-400">
                In the selected scope
              </p>
            </div>
            <div
              key="activeFaculty"
              className="rounded-2xl bg-white p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
            >
              <UsersRound size={19} className="text-slate-500" />
              <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">
                {activeFaculty}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                Active Faculty
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Accepting consultations
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            {loading ? "Loading statistics..." : "Statistics unavailable. Please retry."}
          </p>
        )}
      </div>
      <div className="mt-6 rounded-2xl bg-white p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-900">
              Monthly Consultation Statistics
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Completed appointments during the six months ending {monthLabel(selectedMonth)}
            </p>
          </div>
          {loading && <RefreshCw size={15} className="animate-spin text-slate-400" />}
        </div>
        <div className="mt-10 flex h-64 items-end gap-4 border-b border-slate-200 sm:gap-8">
          {monthlyData.length > 0 ? (
            monthlyData.map(({ month, value }) => (
              <div
                key={month}
                className="flex h-full flex-1 flex-col justify-end gap-3"
              >
                <div
                  className="w-full rounded-t-md bg-slate-200 transition-colors hover:bg-slate-700"
                  style={{ height: `${Math.max(value, 4)}%` }}
                  title={`${value}% of peak month`}
                />
                <span className="pb-3 text-center text-xs font-semibold text-slate-400">
                  {month}
                </span>
              </div>
            ))
          ) : (
            <div className="w-full self-center">
              {loading ? (
                <p className="text-center text-sm text-slate-400">Loading chart…</p>
              ) : (
                <EmptyState
                  className="border-0 bg-transparent py-6"
                  icon={BarChart3}
                  title="No completed consultations yet"
                  description="Completed appointments in the selected scope will populate this six-month activity chart."
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
