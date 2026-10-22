import { useContext, useEffect, useRef, useState } from "react"
import { Check, Plus, Search, UsersRound, X } from "lucide-react"
import { ApiError, usersApi, type ManagedUser } from "../../api"
import { confirmAction } from "../../confirmation"
import {
  Avatar,
  Button,
  CurrentUserContext,
  EmptyState,
  FieldError,
  InputTag,
  PageTitle,
  SelectTag,
  StatusBadge,
  errorMessage,
  fieldClass,
  fullName,
  initialsOf,
  isStrongPassword,
  passwordPolicyMessage,
  roleLabel,
} from "../../shared"

export function AdminUsersView({ roleFilter }: { roleFilter?: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [createType, setCreateType] = useState<"Faculty" | "Student" | null>(null)
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({})
  const [createError, setCreateError] = useState("")
  const currentUser = useContext(CurrentUserContext)
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    id_number: "",
    program: "Computer Science",
  })
  const [saving, setSaving] = useState(false)
  const [pendingFaculty, setPendingFaculty] = useState<ManagedUser[]>([])
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null)
  const [approvalNotice, setApprovalNotice] = useState("")
  const searchRequestId = useRef(0)

  const loadUsers = async (q?: string) => {
    const requestId = ++searchRequestId.current
    setLoading(true)
    setError(null)
    try {
      const rows = await usersApi.list({ q, role_id: roleFilter })
      if (requestId !== searchRequestId.current) return
      setUsers(rows)
    } catch (err) {
      if (requestId !== searchRequestId.current) return
      setError(errorMessage(err, "Failed to load users"))
      setUsers([])
    } finally {
      if (requestId === searchRequestId.current) setLoading(false)
    }
  }

  const loadPendingFaculty = async () => {
    try {
      const rows = await usersApi.list({ role_id: "faculty", status: "pending" })
      setPendingFaculty(
        rows.filter((row) => row.faculty_approval_status === "pending"),
      )
    } catch (err) {
      setError(errorMessage(err, "Failed to load faculty approvals"))
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers(search.trim() || undefined)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search, roleFilter])

  useEffect(() => {
    void loadPendingFaculty()
  }, [])

  const deleteAccount = async (id: string) => {
    if (!await confirmAction("Delete this account? The account will lose access; appointment history will be preserved.")) return
    try {
      await usersApi.delete(id)
      setUsers((current) => current.filter((u) => u.id !== id))
      window.dispatchEvent(new Event("schedwise:users-changed"))
    } catch (err) { setError(errorMessage(err, "Failed to delete account.")) }
  }

  const updateStatus = async (id: string, status: string) => {
    if (!await confirmAction(`Change this account status to ${status}?`)) return
    try {
      const updated = await usersApi.update(id, { status })
      setUsers((current) => current.map((u) => (u.id === id ? updated : u)))
    } catch (err) {
      setError(errorMessage(err, "Failed to update status"))
    }
  }

  const reviewFaculty = async (id: string, action: "approve" | "reject") => {
    const verb = action === "approve" ? "Approve" : "Reject"
    if (!await confirmAction(`${verb} this faculty registration?`)) return
    setApprovalBusy(id)
    setApprovalNotice("")
    setError(null)
    try {
      const updated = action === "approve"
        ? await usersApi.approveFaculty(id)
        : await usersApi.rejectFaculty(id)
      setPendingFaculty((current) => current.filter((user) => user.id !== id))
      setUsers((current) => current.map((user) => (user.id === id ? updated : user)))
      setApprovalNotice(
        action === "approve"
          ? "Faculty account approved. The teacher can now sign in."
          : "Faculty registration rejected.",
      )
      window.dispatchEvent(new Event("schedwise:users-changed"))
    } catch (err) {
      setError(errorMessage(err, "Failed to update faculty approval."))
    } finally {
      setApprovalBusy(null)
    }
  }

  const createAccount = async () => {
    const fields: Record<string, string> = {}
    if (!form.first_name.trim()) fields.first_name = "Enter a first name."
    if (!form.last_name.trim()) fields.last_name = "Enter a last name."
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) fields.email = "Enter a valid email address."
    if (!isStrongPassword(form.password)) fields.password = passwordPolicyMessage
    if (form.id_number && !/^\d{4,}$/.test(form.id_number)) fields.id_number = "Enter at least four digits, or leave blank to generate an ID."
    setCreateErrors(fields)
    setCreateError("")
    if (Object.keys(fields).length) return
    if (!await confirmAction(`Create this ${createType?.toLowerCase()} account for ${form.email.trim()}? Its role and ID will be permanent.`)) return
    setSaving(true)
    setError(null)
    try {
      await usersApi.create({
        email: form.email.trim(),
        password: form.password,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        role_id: createType === "Faculty" ? "faculty" : "student",
        status: "active",
        faculty_number: createType === "Faculty" && form.id_number ? `FAC-${form.id_number}` : undefined,
        student_number: createType === "Student" && form.id_number ? `STU-${form.id_number}` : undefined,
        program: form.program || undefined,
      })
      setCreateType(null)
      setForm({
        first_name: "",
        last_name: "",
        email: "",
        password: "",
        id_number: "",
        program: "Computer Science",
      })
      await loadUsers(search.trim() || undefined)
      window.dispatchEvent(new Event("schedwise:users-changed"))
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        setCreateErrors({ ...err.fields, id_number: err.fields.faculty_number || err.fields.student_number || "" })
      } else setCreateError(errorMessage(err, "Failed to create account"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageTitle
        eyebrow="Administration"
        title="User Management"
        description="Create accounts with permanent roles and manage account access."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => { setCreateErrors({}); setCreateError(""); setCreateType("Student") }}
              className="gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Plus size={15} /> Register Student
            </Button>
            <Button
              onClick={() => { setCreateErrors({}); setCreateError(""); setCreateType("Faculty") }}
              className="gap-2 rounded-[4px] bg-purple-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-purple-700"
            >
              <Plus size={15} /> Create Faculty Account
            </Button>
          </div>
        }
      />
      {error && (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          {error}
        </p>
      )}
      {(pendingFaculty.length > 0 || approvalNotice) && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/50 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Faculty approvals
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Self-registered faculty must verify their email before an
                administrator can approve them.
              </p>
            </div>
            {pendingFaculty.length > 0 && (
              <StatusBadge tone="warning">
                {pendingFaculty.length} pending
              </StatusBadge>
            )}
          </div>
          {approvalNotice && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
              <Check size={14} className="mt-0.5 shrink-0" /> {approvalNotice}
            </p>
          )}
          <div className="mt-4 space-y-3">
            {pendingFaculty.map((facultyUser) => {
              const name =
                [facultyUser.first_name, facultyUser.last_name]
                  .filter(Boolean)
                  .join(" ") || facultyUser.email
              const busy = approvalBusy === facultyUser.id
              return (
                <div
                  key={facultyUser.id}
                  className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {facultyUser.email}
                      {facultyUser.faculty_number
                        ? ` · ${facultyUser.faculty_number}`
                        : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {facultyUser.email_verified_at
                        ? "Email verified — ready for an administrator decision."
                        : "Email not verified yet. Approval is disabled until verification."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy || !facultyUser.email_verified_at}
                      onClick={() => void reviewFaculty(facultyUser.id, "approve")}
                      className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? "Saving…" : "Approve"}
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => void reviewFaculty(facultyUser.id, "reject")}
                      className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <div className="mt-8 overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Master User List</p>
            <p className="mt-1 text-xs text-slate-500">
              {loading ? "Loading…" : `${users.length} registered accounts`}
            </p>
          </div>
          <div className="relative" role="search">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <InputTag
              type="search"
              aria-label="Search accounts"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15 sm:w-56"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[1.5fr_1.2fr_1fr_1fr] gap-5 bg-slate-50 px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span>User</span>
              <span>Email / ID</span>
              <span>Permission Role</span>
              <span>Status</span>
            </div>
            {!loading && users.length === 0 && (
              <div className="p-4">
                <EmptyState
                  icon={UsersRound}
                  title={search.trim() ? "No accounts match your search" : roleFilter === "faculty" ? "No faculty accounts yet" : "No accounts yet"}
                  description={search.trim()
                    ? "Try a different name, email, or account ID."
                    : "Create an account using the buttons above, or wait for a new registration."}
                  action={search.trim()
                    ? <Button onClick={() => setSearch("")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Clear search</Button>
                    : undefined}
                />
              </div>
            )}
            {users.map((user) => {
              const name =
                [user.first_name, user.last_name].filter(Boolean).join(" ") ||
                user.email
              const accountId =
                (user.role_id === "faculty" ? user.faculty_number : user.student_number) || "—"
              return (
                <div
                  key={user.id}
                  className="grid grid-cols-[1.5fr_1.2fr_1fr_1fr] items-center gap-5 border-t border-slate-100 px-6 py-4 transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <Avatar initials={initialsOf(name)} />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{name}</p>
                      <p className="text-[11px] text-slate-400">{user.email}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">{accountId}</p>
                  <div className="flex items-center gap-3"><span className="text-xs font-semibold text-purple-700">{roleLabel(user.role_id)}</span>
                    <Button disabled={user.id === currentUser?.id} onClick={() => void deleteAccount(user.id)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs text-rose-700 hover:bg-rose-50">Delete</Button>
                  </div>
                  {user.role_id === "faculty" && user.faculty_approval_status === "pending" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone="warning">
                        {user.email_verified_at ? "Awaiting approval" : "Email unverified"}
                      </StatusBadge>
                      {user.email_verified_at && (
                        <Button
                          disabled={approvalBusy === user.id}
                          onClick={() => void reviewFaculty(user.id, "approve")}
                          className="rounded-lg bg-purple-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                        >
                          Approve
                        </Button>
                      )}
                      <Button
                        disabled={approvalBusy === user.id}
                        onClick={() => void reviewFaculty(user.id, "reject")}
                        className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        Reject
                      </Button>
                    </div>
                  ) : user.role_id === "faculty" && user.faculty_approval_status === "rejected" ? (
                    <StatusBadge tone="danger">Rejected</StatusBadge>
                  ) : (
                    <SelectTag
                      value={user.status}
                      onChange={(event) => void updateStatus(user.id, event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 outline-none focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15"
                    >
                      <option value="active">active</option>
                      <option value="pending">pending</option>
                      <option value="suspended">suspended</option>
                      <option value="disabled">disabled</option>
                    </SelectTag>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {createType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Button
            onClick={() => setCreateType(null)}
            className="absolute inset-0 rounded-none bg-slate-900/40"
          >
            <span className="sr-only">Close</span>
          </Button>
          <div className="relative z-10 max-h-[90vh] overflow-y-auto w-full max-w-md rounded-2xl bg-white p-7 shadow-[0_10px_40px_-10px_rgba(15,23,42,0.25)]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  {createType === "Faculty"
                    ? "Create Faculty Account"
                    : "Register Student"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  This account will receive {createType.toLowerCase()} permissions.
                </p>
              </div>
              <Button
                onClick={() => setCreateType(null)}
                className="size-9 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </Button>
            </div>
            <div className="mt-7 space-y-4">
              <InputTag aria-label="first name" aria-invalid={!!createErrors.first_name} aria-describedby="create-first_name-error"
                placeholder="First name"
                value={form.first_name}
                onChange={(e) => { setForm((f) => ({ ...f, first_name: e.target.value })); setCreateErrors((f) => ({ ...f, first_name: "" })) } }
                className={fieldClass}
              />
              <FieldError id="create-first_name-error" message={createErrors.first_name} />
              <InputTag aria-label="last name" aria-invalid={!!createErrors.last_name} aria-describedby="create-last_name-error"
                placeholder="Last name"
                value={form.last_name}
                onChange={(e) => { setForm((f) => ({ ...f, last_name: e.target.value })); setCreateErrors((f) => ({ ...f, last_name: "" })) } }
                className={fieldClass}
              />
              <FieldError id="create-last_name-error" message={createErrors.last_name} />
              <div>
                <label htmlFor="create-id-digits" className="mb-1.5 block text-xs font-semibold text-slate-600">
                  {createType === "Faculty" ? "Faculty ID" : "Student ID"}
                </label>
                <div className={`flex items-center overflow-hidden rounded-xl border bg-white focus-within:border-purple-600 focus-within:ring-[3px] focus-within:ring-purple-600/15 ${createErrors.id_number ? "border-rose-700" : "border-purple-200"}`}>
                  <span className="self-stretch border-r border-purple-100 bg-purple-50 px-3.5 py-3 text-sm font-semibold text-purple-700" aria-hidden="true">
                    {createType === "Faculty" ? "FAC-" : "STU-"}
                  </span>
                  <InputTag id="create-id-digits" aria-label={`${createType === "Faculty" ? "FAC-" : "STU-"} ID digits`}
                    aria-invalid={!!createErrors.id_number} aria-describedby="create-id-help create-id_number-error"
                    type="text" inputMode="numeric" pattern="[0-9]*" maxLength={96} autoComplete="off"
                    placeholder="0124"
                    value={form.id_number}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, id_number: e.target.value.replace(/[^0-9]/g, "") }))
                      setCreateErrors((f) => ({ ...f, id_number: "" }))
                    }}
                    className="min-w-0 w-full bg-white px-3.5 py-3 text-sm text-slate-800 outline-none"
                  />
                </div>
                <p id="create-id-help" className="mt-1.5 text-xs text-slate-500">Enter at least four digits, or leave blank to generate a unique ID.</p>
              </div>
              <FieldError id="create-id_number-error" message={createErrors.id_number} />
              <InputTag aria-label="email" aria-invalid={!!createErrors.email} aria-describedby="create-email-error"
                type="email"
                placeholder="University email"
                value={form.email}
                onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); setCreateErrors((f) => ({ ...f, email: "" })) } }
                className={fieldClass}
              />
              <FieldError id="create-email-error" message={createErrors.email} />
              <InputTag aria-label="password" aria-invalid={!!createErrors.password} aria-describedby="create-password-error"
                type="password"
                placeholder="Temporary password (min 8)"
                value={form.password}
                onChange={(e) => { setForm((f) => ({ ...f, password: e.target.value })); setCreateErrors((f) => ({ ...f, password: "" })) } }
                className={fieldClass}
              />
              <FieldError id="create-password-error" message={createErrors.password} />
              <SelectTag
                value={form.program}
                onChange={(e) => setForm((f) => ({ ...f, program: e.target.value }))}
                className={fieldClass}
              >
                <option>Computer Science</option>
                <option>Information Technology</option>
                <option>Information Systems</option>
              </SelectTag>
              <FieldError message={createError} />
              <Button
                onClick={() => void createAccount()}
                disabled={saving}
                className="w-full rounded-[4px] bg-purple-600 py-3 text-sm font-semibold text-white"
              >
                {saving ? "Creating…" : `Create ${createType} Account`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
