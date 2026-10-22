import { useContext, useEffect, useState, type FormEvent } from "react"
import { LockKeyhole, X } from "lucide-react"
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
}: {
  open: boolean
  onClose: () => void
  onUpdated: (user: User) => void
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
  }, [open, user?.id])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!open || !user) return null

  const role = roleFromId(user.role_id) ?? user.role_id

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-settings-title"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-purple-600">
              Account
            </p>
            <h2
              id="account-settings-title"
              className="mt-1 text-xl font-bold tracking-tight text-slate-900"
            >
              Settings
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {user.email} · {role}
            </p>
          </div>
          <Button
            onClick={onClose}
            title="Close account settings"
            className="size-9 shrink-0 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </Button>
        </div>

        <div className="flex gap-2 border-b border-slate-100 px-6 pt-4">
          {(["profile", "password", "privacy"] as const).map((value) => (
            <Button
              key={value}
              onClick={() => setSection(value)}
              className={`rounded-t-xl border-b-2 px-3 py-2 text-sm font-semibold ${
                section === value
                  ? "border-purple-600 text-purple-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {value === "profile" ? "Profile" : value === "password" ? "Password" : "Privacy"}
            </Button>
          ))}
        </div>

        {section === "privacy" ? <div className="px-6 py-2"><PrivacyNotice /></div> : section === "profile" ? (
          <form onSubmit={saveProfile} className="grid gap-4 px-6 py-6 sm:grid-cols-2">
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

            <div className="flex justify-end sm:col-span-2">
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
          <form onSubmit={savePassword} className="grid gap-4 px-6 py-6">
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

            <div className="flex justify-end">
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
