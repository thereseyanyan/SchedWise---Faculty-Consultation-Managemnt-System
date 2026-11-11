import { useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { AlertTriangle, Check, Eye, LockKeyhole, X } from "lucide-react"
import {
  ApiError,
  authApi,
  usersApi,
  type User,
} from "../../api"
import { confirmAction } from "../../confirmation"
import {
  Button,
  CurrentUserContext,
  FieldError,
  InputTag,
  SelectTag,
  departmentIds,
  emailPattern,
  errorMessage,
  fullName,
  isStrongPassword,
  passwordPolicyMessage,
  pillField,
  pillLabel,
  roleFromId,
} from "../../shared"
import { PrivacyNotice } from "../legal/PrivacyNotice"

export function AccountSettingsDialog({
  open,
  onClose,
  onUpdated,
  variant = "default",
  preview = false,
}: {
  open: boolean
  onClose: () => void
  onUpdated: (user: User) => void
  variant?: "default" | "faculty"
  preview?: boolean
}) {
  const user = useContext(CurrentUserContext)
  const [section, setSection] = useState<"profile" | "password" | "privacy">("profile")
  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    college: "",
    program: "",
  })
  const [passwords, setPasswords] = useState({
    current: "",
    next: "",
    confirm: "",
  })
  const [profileBusy, setProfileBusy] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [profileError, setProfileError] = useState("")
  const [profileMessage, setProfileMessage] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [passwordFields, setPasswordFields] = useState<Record<string, string>>({})
  const [passwordMessage, setPasswordMessage] = useState("")
  const [activeDialog, setActiveDialog] = useState<"email" | "password" | "delete" | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState("")
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !user) return
    const college =
      Object.entries(departmentIds).find(
        ([, id]) => id === user.department_id,
      )?.[0] ?? ""
    setProfile({
      firstName: user.first_name ?? "",
      lastName: user.last_name ?? "",
      phone: user.phone ?? "",
      college,
      program: user.program ?? "",
    })
    setPasswords({ current: "", next: "", confirm: "" })
    setProfileError("")
    setProfileMessage("")
    setPasswordError("")
    setPasswordMessage("")
    setSection("profile")
    setActiveDialog(null)
    setAvatarUrl(null)
    setAvatarError("")
  }, [open, user?.id])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (activeDialog) setActiveDialog(null)
        else onClose()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose, activeDialog])

  useEffect(
    () => () => {
      if (avatarUrl) URL.revokeObjectURL(avatarUrl)
    },
    [avatarUrl],
  )

  if (!open || !user) return null

  if (preview) {
    return <AccountSettingsDialogPreview user={user} />
  }

  const role = roleFromId(user.role_id) ?? user.role_id
  const facultyVariant = variant === "faculty"
  const displayName = fullName(user.first_name, user.last_name, user.email)
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    setProfileError("")
    setProfileMessage("")

    if (!profile.firstName.trim() || !profile.lastName.trim()) {
      setProfileError("Enter both your first and last name.")
      return
    }

    const departmentId = profile.college
      ? departmentIds[profile.college]
      : ""
    if (profile.college && !departmentId) {
      setProfileError("Select a valid department.")
      return
    }

    if (!await confirmAction("Save these profile changes?")) return
    setProfileBusy(true)
    try {
      const updated = await usersApi.update(user.id, {
        first_name: profile.firstName.trim(),
        last_name: profile.lastName.trim(),
        phone: profile.phone.trim(),
        program: profile.program.trim(),
        department_id: departmentId,
      })
      onUpdated(updated as User)
      setProfileMessage("Profile updated.")
    } catch (err) {
      setProfileError(errorMessage(err, "Unable to update your profile."))
    } finally {
      setProfileBusy(false)
    }
  }

  const savePassword = async (event: FormEvent) => {
    event.preventDefault()
    setPasswordError("")
    setPasswordMessage("")
    setPasswordFields({})

    if (!passwords.current) {
      setPasswordFields({ current: "Enter your current password." })
      return
    }
    if (!isStrongPassword(passwords.next)) {
      setPasswordFields({ next: passwordPolicyMessage })
      return
    }
    if (passwords.next !== passwords.confirm) {
      setPasswordFields({ confirm: "The new passwords do not match." })
      return
    }

    if (!await confirmAction("Change your password? Other signed-in sessions will be invalidated.")) return
    setPasswordBusy(true)
    try {
      const result = await authApi.changePassword({
        current_password: passwords.current,
        new_password: passwords.next,
      })
      setPasswords({ current: "", next: "", confirm: "" })
      setPasswordMessage(result.message)
    } catch (err) {
      if (err instanceof ApiError && (err.fields.current_password || err.fields.new_password)) {
        setPasswordFields({ current: err.fields.current_password || "", next: err.fields.new_password || "" })
      } else setPasswordError(errorMessage(err, "Unable to change your password."))
    } finally {
      setPasswordBusy(false)
    }
  }

  const handleAvatarSelected = (file: File | undefined | null) => {
    setAvatarError("")
    if (!file) return
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setAvatarError("Choose a PNG or JPEG image.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("Images must be smaller than 5 MB.")
      return
    }
    setAvatarUrl(URL.createObjectURL(file))
  }

  const removeAvatar = () => {
    setAvatarUrl(null)
    setAvatarError("")
  }

  if (facultyVariant && section === "profile") {
    const facultyId = user.faculty_number || user.id
    const roleLabel = roleFromId(user.role_id) ?? user.role_id

    return (
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-ink/35 p-0 sm:p-6"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <div className="mx-auto min-h-full w-full max-w-[960px] overflow-hidden bg-page-bg shadow-card sm:rounded-card sm:border sm:border-border-card">
          <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-6 sm:px-8">
            <div>
              <h1 className="font-display text-2xl font-bold text-ink">Account settings</h1>
              <p className="mt-1 text-xs text-muted">Manage your profile and password in one place.</p>
            </div>
            <Button
              onClick={onClose}
              aria-label="Close account settings"
              title="Close account settings"
              className="size-9 shrink-0 rounded-xl text-muted hover:bg-soft hover:text-ink"
            >
              <X size={18} />
            </Button>
          </div>

          <form onSubmit={saveProfile} className="space-y-3 px-5 pb-5 sm:px-8 sm:pb-8">
            <section className="rounded-card border border-border-card bg-card p-4 shadow-card sm:p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-soft text-sm font-semibold text-primary">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile photo preview" className="size-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(event) => {
                      handleAvatarSelected(event.target.files?.[0])
                      event.target.value = ""
                    }}
                  />
                  <Button
                    onClick={() => avatarInputRef.current?.click()}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white"
                  >
                    Upload image
                  </Button>
                  <Button
                    onClick={removeAvatar}
                    disabled={!avatarUrl}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary"
                  >
                    Remove
                  </Button>
                  <p className="basis-full text-[12px] text-muted">PNG or JPEG, under 5 MB</p>
                  {avatarError ? (
                    <p role="alert" className="basis-full text-[12px] font-medium text-schedwise-danger">{avatarError}</p>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-card border border-border-card bg-card p-4 shadow-card sm:p-5">
              <h2 className="text-[14px] font-semibold text-ink">Personal information</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={pillLabel}>First name *</span>
                  <InputTag
                    value={profile.firstName}
                    onChange={(event) => {
                      setProfile({ ...profile, firstName: event.target.value })
                      setProfileError("")
                    }}
                    autoComplete="given-name"
                    className={pillField}
                  />
                </label>
                <label className="block">
                  <span className={pillLabel}>Last name *</span>
                  <InputTag
                    value={profile.lastName}
                    onChange={(event) => {
                      setProfile({ ...profile, lastName: event.target.value })
                      setProfileError("")
                    }}
                    autoComplete="family-name"
                    className={pillField}
                  />
                </label>
                <div>
                  <span className={pillLabel}>Faculty ID</span>
                  <InputTag value={facultyId} readOnly className={`${pillField} bg-soft`} />
                  <p className="mt-1 text-[12px] text-muted">Assigned by the system and cannot be changed.</p>
                </div>
                <div>
                  <span className={pillLabel}>Role</span>
                  <p className="mt-2 inline-flex rounded-full bg-soft px-2.5 py-1 text-[12px] font-semibold text-primary">{roleLabel}</p>
                </div>
                <label className="block">
                  <span className={pillLabel}>Department *</span>
                  <SelectTag
                    value={profile.college}
                    onChange={(event) => setProfile({ ...profile, college: event.target.value })}
                    className={`${pillField} cursor-pointer`}
                  >
                    <option value="">Not set</option>
                    {Object.keys(departmentIds).map((college) => <option key={college}>{college}</option>)}
                  </SelectTag>
                </label>
                <label className="block">
                  <span className={pillLabel}>Phone number</span>
                  <InputTag
                    value={profile.phone}
                    onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                    autoComplete="tel"
                    placeholder="Optional"
                    className={pillField}
                  />
                  <p className="mt-1 text-[12px] text-muted">Include country code</p>
                </label>
              </div>
            </section>

            <section className="rounded-card border border-border-card bg-card p-4 shadow-card sm:p-5">
              <h2 className="text-[14px] font-semibold text-ink">Email address</h2>
              <span className={pillLabel}>Email</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <InputTag value={user.email} readOnly className={`${pillField} min-w-0 flex-1 bg-soft`} />
                <Button onClick={() => setActiveDialog("email")} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary">Edit email</Button>
                <span className="rounded-full bg-green-tint px-2.5 py-1 text-[12px] font-semibold text-green">✓ Verified</span>
              </div>
              <p className="mt-1 text-[12px] text-muted">Used to log in and receive notifications.</p>
            </section>

            <section className="rounded-card border border-border-card bg-card p-4 shadow-card sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-[14px] font-semibold text-ink">Security &amp; privacy</h2>
                </div>
                <span className="rounded-full bg-soft px-2.5 py-1 text-[12px] font-semibold text-muted">Last changed: Not available</span>
              </div>
              <div className="mt-4 grid gap-3">
                <div>
                  <span className={pillLabel}>Password</span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <div className={`${pillField} flex min-w-0 flex-1 items-center bg-card text-muted`}>••••••••••••</div>
                    <Button onClick={() => setActiveDialog("password")} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary">Change password</Button>
                  </div>
                  <p className="mt-1 text-[12px] text-muted">Use a strong password that you do not use on other sites.</p>
                </div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-ink">Delete account</p>
                    <p className="mt-1 text-[12px] text-muted">Permanently remove your account and hide your profile from students.</p>
                  </div>
                  <Button onClick={() => setActiveDialog("delete")} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary">Delete account</Button>
                </div>
              </div>
            </section>

            {profileError ? <p className="rounded-lg bg-schedwise-danger/10 px-3 py-2 text-xs text-schedwise-danger">{profileError}</p> : null}
            {profileMessage ? <p className="rounded-lg bg-green-tint px-3 py-2 text-xs text-green">{profileMessage}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-3">
              <p className="text-[12px] text-muted">Changes are saved only when you select Save changes.</p>
              <div className="flex gap-2">
                <Button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary">Cancel</Button>
                <Button type="submit" disabled={profileBusy} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white">{profileBusy ? "Saving…" : "Save changes"}</Button>
              </div>
            </div>
          </form>
          {activeDialog === "email" ? (
            <EditEmailDialog currentEmail={user.email} onClose={() => setActiveDialog(null)} />
          ) : null}
          {activeDialog === "password" ? (
            <ChangePasswordDialog email={user.email} onClose={() => setActiveDialog(null)} />
          ) : null}
          {activeDialog === "delete" ? (
            <DeleteAccountDialog
              userId={user.id}
              onClose={() => setActiveDialog(null)}
              onReviewAppointments={() => {
                setActiveDialog(null)
                onClose()
              }}
            />
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6 ${
        facultyVariant ? "bg-ink/35" : "bg-slate-950/55"
      }`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-settings-title"
        className={`max-h-[92vh] w-full overflow-y-auto sm:rounded-3xl ${
          facultyVariant
            ? "max-w-[960px] rounded-t-card border border-border-card bg-page-bg shadow-card"
            : "max-w-2xl rounded-t-3xl bg-white shadow-2xl"
        }`}
      >
        <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 sm:px-8 sm:py-6 ${
          facultyVariant ? "border-divider bg-white" : "border-slate-100"
        }`}>
          <div className="flex min-w-0 items-center gap-4">
            {facultyVariant ? (
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-soft text-[18px] font-semibold text-primary ring-4 ring-page-bg">
                {initials}
              </div>
            ) : null}
            <div className="min-w-0">
            <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
              facultyVariant ? "text-primary" : "text-purple-600"
            }`}>
              Account
            </p>
            <h2
              id="account-settings-title"
              className={`mt-1 text-xl font-bold tracking-tight ${facultyVariant ? "font-[var(--font-display)] text-ink" : "text-slate-900"}`}
            >
              {facultyVariant ? "Account settings" : "Settings"}
            </h2>
            <p className={`mt-1 truncate text-sm ${facultyVariant ? "text-muted" : "text-slate-500"}`}>
              {user.email} · {role}
            </p>
            </div>
          </div>
          <Button
            onClick={onClose}
            aria-label="Close account settings"
            title="Close account settings"
            className={`size-9 shrink-0 rounded-xl ${facultyVariant ? "text-muted hover:bg-soft hover:text-ink" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
          >
            <X size={18} />
          </Button>
        </div>

        <div className={`flex gap-2 overflow-x-auto border-b px-6 pt-4 sm:px-8 ${
          facultyVariant ? "border-divider bg-white" : "border-slate-100"
        }`}>
          {(["profile", "password", "privacy"] as const).map((value) => (
            <Button
              key={value}
              onClick={() => setSection(value)}
              className={`shrink-0 rounded-t-xl border-b-2 px-3 py-2 text-sm font-semibold ${
                section === value
                  ? facultyVariant ? "border-primary text-primary" : "border-purple-600 text-purple-700"
                  : facultyVariant ? "border-transparent text-muted hover:text-ink" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {value === "profile" ? "Profile" : value === "password" ? "Password" : "Privacy"}
            </Button>
          ))}
        </div>

        {section === "privacy" ? (
          <div className={`px-6 py-6 sm:px-8 sm:py-8 ${facultyVariant ? "bg-page-bg" : ""}`}>
            {facultyVariant ? (
              <div className="mb-4">
                <p className="text-[16px] font-semibold text-ink">Security &amp; privacy</p>
                <p className="mt-1 text-[13px] leading-5 text-muted">Review how your account information is handled.</p>
              </div>
            ) : null}
            <PrivacyNotice />
          </div>
        ) : section === "profile" ? (
          <form onSubmit={saveProfile} className={`grid gap-4 px-6 py-6 sm:grid-cols-2 sm:px-8 sm:py-8 ${facultyVariant ? "bg-page-bg" : ""}`}>
            {facultyVariant ? (
              <div className="sm:col-span-2">
                <p className="text-[16px] font-semibold text-ink">Personal information</p>
                <p className="mt-1 text-[13px] leading-5 text-muted">Keep your account details up to date.</p>
              </div>
            ) : null}
            <label className="block">
              <span className={pillLabel}>First name</span>
              <InputTag
                value={profile.firstName}
                onChange={(event) => {
                  setProfile({ ...profile, firstName: event.target.value })
                  setProfileError("")
                }}
                autoComplete="given-name"
                className={pillField}
              />
            </label>
            <label className="block">
              <span className={pillLabel}>Last name</span>
              <InputTag
                value={profile.lastName}
                onChange={(event) => {
                  setProfile({ ...profile, lastName: event.target.value })
                  setProfileError("")
                }}
                autoComplete="family-name"
                className={pillField}
              />
            </label>
            <label className="block">
              <span className={pillLabel}>Phone</span>
              <InputTag
                value={profile.phone}
                onChange={(event) =>
                  setProfile({ ...profile, phone: event.target.value })
                }
                autoComplete="tel"
                placeholder="Optional"
                className={pillField}
              />
            </label>
            <label className="block">
              <span className={pillLabel}>Department / College</span>
              <SelectTag
                value={profile.college}
                onChange={(event) =>
                  setProfile({ ...profile, college: event.target.value })
                }
                className={`${pillField} cursor-pointer`}
              >
                <option value="">Not set</option>
                {Object.keys(departmentIds).map((college) => (
                  <option key={college}>{college}</option>
                ))}
              </SelectTag>
            </label>
            <label className="block sm:col-span-2">
              <span className={pillLabel}>Program</span>
              <InputTag
                value={profile.program}
                onChange={(event) =>
                  setProfile({ ...profile, program: event.target.value })
                }
                placeholder="Optional"
                className={pillField}
              />
            </label>
            {facultyVariant ? (
              <div className="rounded-card border border-border-card bg-white px-4 py-4 sm:col-span-2">
                <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Email address</p>
                <p className="mt-1 break-words text-[14px] font-medium text-ink">{user.email}</p>
              </div>
            ) : null}

            {profileError && (
              <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:col-span-2">
                {profileError}
              </p>
            )}
            {profileMessage && (
              <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 sm:col-span-2">
                {profileMessage}
              </p>
            )}

            <div className={`flex justify-end border-t pt-4 sm:col-span-2 ${facultyVariant ? "border-divider" : "border-transparent"}`}>
              <Button
                type="submit"
                disabled={profileBusy}
                className="gap-2 rounded-[4px] border border-purple-700 bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
              >
                {profileBusy ? "Saving…" : "Save Profile"}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={savePassword} className={`grid gap-4 px-6 py-6 sm:px-8 sm:py-8 ${facultyVariant ? "bg-page-bg" : ""}`}>
            {facultyVariant ? (
              <div>
                <p className="text-[16px] font-semibold text-ink">Security &amp; privacy</p>
                <p className="mt-1 text-[13px] leading-5 text-muted">Protect your account with a strong password.</p>
              </div>
            ) : null}
            <label className="block">
              <span className={pillLabel}>Current password</span>
              <InputTag
                type="password"
                aria-invalid={!!passwordFields.current} aria-describedby="password-current-error" value={passwords.current}
                onChange={(event) => {
                  setPasswords({ ...passwords, current: event.target.value })
                  setPasswordError(""); setPasswordFields((f) => ({ ...f, current: "" }))
                }}
                autoComplete="current-password"
                className={pillField}
              />
              <FieldError id="password-current-error" message={passwordFields.current} />
            </label>
            <label className="block">
              <span className={pillLabel}>New password</span>
              <InputTag
                type="password"
                aria-invalid={!!passwordFields.next} aria-describedby="password-next-error" value={passwords.next}
                onChange={(event) => {
                  setPasswords({ ...passwords, next: event.target.value })
                  setPasswordError(""); setPasswordFields((f) => ({ ...f, next: "" }))
                }}
                autoComplete="new-password"
                className={pillField}
              />
              <FieldError id="password-next-error" message={passwordFields.next} />
              <span className="mt-1.5 block px-1 text-xs leading-5 text-slate-500">
                {passwordPolicyMessage}
              </span>
            </label>
            <label className="block">
              <span className={pillLabel}>Confirm new password</span>
              <InputTag
                type="password"
                aria-invalid={!!passwordFields.confirm} aria-describedby="password-confirm-error" value={passwords.confirm}
                onChange={(event) => {
                  setPasswords({ ...passwords, confirm: event.target.value })
                  setPasswordError(""); setPasswordFields((f) => ({ ...f, confirm: "" }))
                }}
                autoComplete="new-password"
                className={pillField}
              />
              <FieldError id="password-confirm-error" message={passwordFields.confirm} />
            </label>

            {passwordError && (
              <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {passwordError}
              </p>
            )}
            {passwordMessage && (
              <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {passwordMessage}
              </p>
            )}

            <div className={`flex justify-end border-t pt-4 ${facultyVariant ? "border-divider" : "border-transparent"}`}>
              <Button
                type="submit"
                disabled={passwordBusy}
                className="gap-2 rounded-[4px] border border-purple-700 bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
              >
                <LockKeyhole size={15} />
                {passwordBusy ? "Updating…" : "Update Password"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function AccountSettingsDialogPreview({ user }: { user: User }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-page-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-full max-w-[1112px] items-start gap-6 xl:grid-cols-[minmax(0,352px)_minmax(0,352px)_minmax(0,352px)]">
        <EditEmailDialog embedded currentEmail={user.email} onClose={() => {}} />
        <ChangePasswordDialog embedded email={user.email} onClose={() => {}} />
        <DeleteAccountDialog embedded userId={user.id} onClose={() => {}} onReviewAppointments={() => {}} />
      </div>
    </div>
  )
}

function DialogSurface({
  embedded,
  onClose,
  title,
  description,
  danger = false,
  children,
}: {
  embedded: boolean
  onClose: () => void
  title: string
  description: string
  danger?: boolean
  children: ReactNode
}) {
  const body = (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={`font-display text-[14px] font-bold ${danger ? "text-schedwise-danger" : "text-ink"}`}>{title}</h2>
          <p className="mt-1 text-[12px] leading-4 text-muted">{description}</p>
        </div>
        {embedded ? null : (
          <Button
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()}`}
            title={`Close ${title.toLowerCase()}`}
            className="size-8 shrink-0 rounded-lg text-muted hover:bg-soft hover:text-ink"
          >
            <X size={16} />
          </Button>
        )}
      </div>
      {children}
    </div>
  )

  if (embedded) {
    return (
      <section
        role="dialog"
        aria-label={title}
        className={`rounded-card border bg-card p-4 shadow-card ${danger ? "border-schedwise-danger" : "border-border-card"}`}
      >
        {body}
      </section>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-card border bg-card p-4 shadow-card sm:rounded-card ${danger ? "border-schedwise-danger" : "border-border-card"}`}
      >
        {body}
      </div>
    </div>
  )
}

function DialogField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  error,
  eye = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: "text" | "password"
  placeholder?: string
  autoComplete?: string
  error?: string
  eye?: boolean
}) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="block text-xs font-medium text-ink">
      <span>{label}</span>
      <span className="relative mt-1 block">
        <InputTag
          type={eye ? (visible ? "text" : "password") : type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          onChange={(event) => onChange(event.target.value)}
          className={`h-9 w-full rounded-lg border bg-card px-3 text-xs text-ink outline-none transition placeholder:text-muted focus:border-primary ${error ? "border-schedwise-danger" : "border-border"} ${eye ? "pr-9" : ""}`}
        />
        {eye ? (
          <Button
            type="button"
            aria-label={visible ? "Hide password" : "Show password"}
            title={visible ? "Hide password" : "Show password"}
            onClick={() => setVisible((current) => !current)}
            className="absolute right-1.5 top-1/2 size-7 -translate-y-1/2 rounded-md text-muted hover:text-ink"
          >
            <Eye size={14} />
          </Button>
        ) : null}
      </span>
      <FieldError message={error} />
    </label>
  )
}

function EditEmailDialog({
  embedded = false,
  currentEmail,
  onClose,
}: {
  embedded?: boolean
  currentEmail: string
  onClose: () => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [pendingEmail, setPendingEmail] = useState("")

  const reset = () => {
    setEmail("")
    setPassword("")
    setFields({})
    setPendingEmail("")
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextEmail = email.trim()
    const nextFields: Record<string, string> = {}
    if (!emailPattern.test(nextEmail)) {
      nextFields.email = "Enter a valid email address."
    } else if (nextEmail.toLowerCase() === currentEmail.toLowerCase()) {
      nextFields.email = "This is already your email address."
    }
    if (!password) {
      nextFields.password = "Enter your current password."
    }
    setFields(nextFields)
    if (Object.keys(nextFields).length > 0) return
    setPendingEmail(nextEmail)
    setEmail("")
    setPassword("")
  }

  return (
    <DialogSurface
      embedded={embedded}
      onClose={onClose}
      title="Update email address"
      description="Your login email changes after you verify the new address."
    >
      <form onSubmit={submit} className="mt-1">
        <DialogField
          label="New email address *"
          value={email}
          placeholder="name@university.edu"
          autoComplete="email"
          error={fields.email}
          onChange={(value) => {
            setEmail(value)
            setFields((current) => ({ ...current, email: "" }))
          }}
        />
        <DialogField
          label="Current password *"
          value={password}
          type="password"
          autoComplete="current-password"
          error={fields.password}
          onChange={(value) => {
            setPassword(value)
            setFields((current) => ({ ...current, password: "" }))
          }}
        />
        <p className="mt-1 text-[12px] leading-4 text-muted">We'll send a verification link. Your email stays unchanged until verified.</p>
        {pendingEmail ? (
          <p className="mt-2 rounded-lg bg-amber-tint px-3 py-2 text-[12px] leading-4 text-ink">
            <span className="font-semibold">Pending verification for {pendingEmail}.</span>{" "}
            Sign-in and notifications still use {currentEmail} until the new address is verified.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {pendingEmail ? (
            <span className="rounded-full bg-amber-tint px-2.5 py-1 text-[12px] font-semibold text-amber">Pending verification</span>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" onClick={() => { reset(); onClose() }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary">Cancel</Button>
            <Button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">{pendingEmail ? "Resend link" : "Send link"}</Button>
          </div>
        </div>
      </form>
    </DialogSurface>
  )
}

function ChangePasswordDialog({
  embedded = false,
  email,
  onClose,
}: {
  embedded?: boolean
  email: string
  onClose: () => void
}) {
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" })
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const requirements = [
    { label: "At least 8 characters", met: passwords.next.length >= 8 },
    { label: "One uppercase letter", met: /[A-Z]/.test(passwords.next) },
    { label: "One lowercase letter", met: /[a-z]/.test(passwords.next) },
    { label: "One number", met: /[0-9]/.test(passwords.next) },
    { label: "One symbol", met: /[\W_]/.test(passwords.next) },
  ]
  const metCount = requirements.filter((requirement) => requirement.met).length
  const strengthLabel = passwords.next
    ? metCount <= 2 ? "Weak" : metCount === 3 ? "Fair" : metCount === 4 ? "Good" : "Strong"
    : ""
  const strengthBarColor = metCount <= 2 ? "bg-schedwise-danger" : metCount === 3 ? "bg-amber" : "bg-green"
  const strengthTextColor = metCount <= 2 ? "text-schedwise-danger" : metCount === 3 ? "text-amber" : "text-green"

  const reset = () => {
    setPasswords({ current: "", next: "", confirm: "" })
    setFields({})
    setError("")
    setMessage("")
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFields({})
    setError("")
    setMessage("")

    if (!passwords.current) {
      setFields({ current: "Enter your current password." })
      return
    }
    if (!isStrongPassword(passwords.next)) {
      setFields({ next: passwordPolicyMessage })
      return
    }
    if (passwords.next !== passwords.confirm) {
      setFields({ confirm: "The new passwords do not match." })
      return
    }

    if (!await confirmAction("Change your password? Other signed-in sessions will be invalidated.")) return
    setBusy(true)
    try {
      const result = await authApi.changePassword({
        current_password: passwords.current,
        new_password: passwords.next,
      })
      setPasswords({ current: "", next: "", confirm: "" })
      setMessage(result.message)
    } catch (err) {
      if (err instanceof ApiError && (err.fields.current_password || err.fields.new_password)) {
        setFields({ current: err.fields.current_password || "", next: err.fields.new_password || "" })
      } else {
        setError(errorMessage(err, "Unable to change your password."))
      }
    } finally {
      setBusy(false)
    }
  }

  const sendResetLink = async () => {
    if (busy) return
    if (!await confirmAction(`Send a password reset link to ${email}?`)) return
    setBusy(true)
    try {
      const result = await authApi.forgotPassword(email)
      setMessage(result.message)
    } catch (err) {
      setError(errorMessage(err, "Unable to send a password reset link."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogSurface
      embedded={embedded}
      onClose={onClose}
      title="Change password"
      description="Use a strong password that you do not use on other sites."
    >
      <form onSubmit={submit} className="mt-1">
        <DialogField
          label="Current password *"
          value={passwords.current}
          type="password"
          eye
          autoComplete="current-password"
          error={fields.current}
          onChange={(value) => {
            setPasswords((current) => ({ ...current, current: value }))
            setFields((current) => ({ ...current, current: "" }))
          }}
        />
        <Button
          type="button"
          onClick={sendResetLink}
          className="mt-1.5 text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
        >
          Forgot your current password?
        </Button>
        <DialogField
          label="New password *"
          value={passwords.next}
          type="password"
          eye
          autoComplete="new-password"
          error={fields.next}
          onChange={(value) => {
            setPasswords((current) => ({ ...current, next: value }))
            setFields((current) => ({ ...current, next: "" }))
          }}
        />
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Password strength</span>
            <span className={strengthTextColor}>{strengthLabel || "—"}</span>
          </div>
          <div className="mt-1 h-1 rounded-full bg-divider">
            <div
              className={`h-1 rounded-full transition-all ${strengthBarColor}`}
              style={{ width: `${(metCount / 5) * 100}%` }}
            />
          </div>
        </div>
        <div className="mt-3">
          <p className="text-xs font-semibold text-ink">Password requirements</p>
          <ul className="mt-1 space-y-1 text-xs text-muted">
            {requirements.map((requirement) => (
              <li key={requirement.label} className={`flex items-center gap-1.5 ${requirement.met ? "text-green" : ""}`}>
                {requirement.met ? (
                  <Check aria-hidden="true" size={13} />
                ) : (
                  <span aria-hidden="true">○</span>
                )}
                {requirement.label}
              </li>
            ))}
          </ul>
        </div>
        <DialogField
          label="Confirm new password *"
          value={passwords.confirm}
          type="password"
          eye
          autoComplete="new-password"
          error={fields.confirm}
          onChange={(value) => {
            setPasswords((current) => ({ ...current, confirm: value }))
            setFields((current) => ({ ...current, confirm: "" }))
          }}
        />
        {error ? (
          <p className="mt-2 rounded-lg bg-schedwise-danger/10 px-3 py-2 text-xs text-schedwise-danger">{error}</p>
        ) : null}
        {message ? (
          <p className="mt-2 rounded-lg bg-green-tint px-3 py-2 text-xs text-green">{message}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-start gap-2">
          <Button type="button" onClick={() => { reset(); onClose() }} className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-primary">Cancel</Button>
          <Button type="submit" disabled={busy} className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white">{busy ? "Updating…" : "Update password"}</Button>
        </div>
      </form>
    </DialogSurface>
  )
}

function DeleteAccountDialog({
  embedded = false,
  userId,
  onClose,
  onReviewAppointments,
}: {
  embedded?: boolean
  userId: string
  onClose: () => void
  onReviewAppointments: () => void
}) {
  const [password, setPassword] = useState("")
  const [confirmText, setConfirmText] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const ready = password !== "" && confirmText === "DELETE"

  const reset = () => {
    setPassword("")
    setConfirmText("")
    setError("")
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready || busy) return
    if (!await confirmAction("Permanently delete your account? This cannot be undone.")) return
    setBusy(true)
    try {
      await usersApi.delete(userId)
      try {
        await authApi.logout()
      } catch (err) {
        console.error("Logout request failed.", err)
      }
      window.dispatchEvent(new Event("schedwise:session-expired"))
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("Self-service account deletion is not enabled on the server yet. Ask an administrator to remove this account.")
      } else {
        setError(errorMessage(err, "Unable to delete your account."))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogSurface
      embedded={embedded}
      onClose={onClose}
      danger
      title="Delete account"
      description="You will lose access. Appointment and audit history is retained for university records."
    >
      <form onSubmit={submit} className="mt-1">
        <div className="mt-3 flex gap-2 rounded-lg bg-schedwise-danger/10 p-3 text-xs leading-5 text-schedwise-danger">
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
          <span>Upcoming confirmed consultations must be cancelled first.</span>
        </div>
        <Button
          type="button"
          onClick={() => { reset(); onReviewAppointments() }}
          className="mt-3 text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
        >
          Review appointments →
        </Button>
        <p className="mt-4 text-xs font-medium text-ink">Type "DELETE" and enter your password</p>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <DialogField
            label="Password"
            value={password}
            type="password"
            autoComplete="current-password"
            onChange={(value) => {
              setPassword(value)
              setError("")
            }}
          />
          <DialogField
            label="Confirmation"
            value={confirmText}
            placeholder="Type DELETE"
            onChange={(value) => {
              setConfirmText(value)
              setError("")
            }}
          />
        </div>
        {error ? (
          <p className="mt-2 rounded-lg bg-schedwise-danger/10 px-3 py-2 text-xs text-schedwise-danger">{error}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" onClick={() => { reset(); onClose() }} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary">Cancel</Button>
          <Button type="submit" disabled={!ready || busy} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white">{busy ? "Deleting…" : "Delete account"}</Button>
        </div>
      </form>
    </DialogSurface>
  )
}
