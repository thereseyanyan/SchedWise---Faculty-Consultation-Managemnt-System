import { useState, type FormEvent } from "react"
import { authApi, type User } from "../../api"
import { Button, InputTag, FieldError, errorMessage, isStrongPassword, passwordPolicyMessage } from "../../shared"

export function RequiredPasswordChange({ onChanged, onSignOut }: { onChanged: (user: User) => void; onSignOut: () => void }) {
  const [current, setCurrent] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!current) { setError("Enter the initial password provided by your administrator."); return }
    if (!isStrongPassword(password)) { setError(passwordPolicyMessage); return }
    if (password !== confirmation) { setError("Passwords do not match."); return }
    setBusy(true)
    setError("")
    try {
      await authApi.changePassword({ current_password: current, new_password: password })
      const { user } = await authApi.me()
      onChanged(user)
    } catch (err) { setError(errorMessage(err, "Unable to change your password.")) }
    finally { setBusy(false) }
  }
  return <main className="flex min-h-screen items-center justify-center bg-purple-50 p-6">
    <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-purple-900">Change your initial password</h1>
      <p className="text-sm text-slate-600">Choose a personal password before accessing your faculty dashboard.</p>
      <label className="block text-sm">Initial password<InputTag required type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} className="mt-1 w-full rounded-lg border p-3" /></label>
      <label className="block text-sm">New password<InputTag required type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border p-3" /></label>
      <p className="text-xs text-slate-500">{passwordPolicyMessage}</p>
      <label className="block text-sm">Confirm new password<InputTag required type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} className="mt-1 w-full rounded-lg border p-3" /></label>
      <FieldError message={error} />
      <Button type="submit" disabled={busy} className="w-full rounded-lg bg-purple-600 p-3 text-white">{busy ? "Saving…" : "Change password"}</Button>
      <Button type="button" disabled={busy} onClick={onSignOut} className="w-full p-2 text-purple-700">Sign out</Button>
    </form>
  </main>
}
