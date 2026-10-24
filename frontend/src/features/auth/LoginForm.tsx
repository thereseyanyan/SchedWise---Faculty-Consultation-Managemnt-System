import { useState, type FormEvent } from "react"
import { Eye, EyeOff } from "lucide-react"
import { ApiError, authApi } from "../../api"
import {
  Button,
  FieldError,
  InputTag,
  SelectTag,
  departmentIds,
  departments,
  errorMessage,
  institutionalEmailPattern,
  isStrongPassword,
  passwordPolicyMessage,
} from "../../shared"

type LoginFormProps = {
  onSuccess: (user: any) => void
  onForgot: () => void
  onRegister: () => void
  initialEmail?: string
}

export function LoginForm({ onSuccess, onForgot, onRegister, initialEmail = "" }: LoginFormProps) {
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError("Enter your email address and password.")
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.")
      return
    }
    setLoading(true)
    setError("")
    setNotice("")
    setNeedsVerification(false)
    try {
      const { user } = await authApi.login({ email: email.trim(), password })
      onSuccess(user)
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_unverified") {
        setNeedsVerification(true)
        setError("Your account needs email verification before you can sign in.")
      } else if (err instanceof ApiError && err.code === "faculty_approval_pending") {
        setError("Your email is verified, but your faculty account is awaiting administrator approval.")
      } else if (err instanceof ApiError && err.code === "faculty_approval_rejected") {
        setError("Your faculty account registration was not approved. Contact the administrator for details.")
      } else {
        setError(errorMessage(err, "Login failed. Please check your credentials."))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter the email address you registered with.")
      return
    }
    setLoading(true)
    setError("")
    setNotice("")
    try {
      const result = await authApi.resendVerification(email.trim())
      setNotice(result.message)
      setNeedsVerification(true)
    } catch (err) {
      setError(errorMessage(err, "Unable to resend the verification email right now."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-schedwise-navy" id="login-title">Login</h1>
        <p className="mt-1 text-sm text-schedwise-body">Sign in to access your dashboard</p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-schedwise-navy">Email</label>
          <InputTag
            type="text"
            inputMode="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError("")
              setNeedsVerification(false)
            }}
            placeholder="Enter your email"
            autoComplete="email"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-schedwise-purple focus:outline-none focus:ring-2 focus:ring-schedwise-purple/20"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-schedwise-navy">Password</label>
          <div className="relative mt-1">
            <InputTag
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError("")
              }}
              placeholder="Enter your password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-10 text-sm focus:border-schedwise-purple focus:outline-none focus:ring-2 focus:ring-schedwise-purple/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-schedwise-purple"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div className="mt-1 text-right">
            <button type="button" onClick={onForgot} className="text-sm font-medium text-schedwise-purple hover:underline">
              Forgot Password?
            </button>
          </div>
        </div>
        {error ? <FieldError message={error} /> : null}
        {notice ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p> : null}
        {needsVerification ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <button type="button" onClick={handleResend} disabled={loading} className="text-xs font-semibold text-amber-900 underline">
              Resend verification email
            </button>
          </div>
        ) : null}
      </div>
      <Button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-[999px] bg-schedwise-purple py-2.5 text-sm font-semibold uppercase tracking-wide text-white shadow-schedwise transition hover:bg-purple-700"
      >
        {loading ? "Logging in..." : "LOGIN"}
      </Button>
      <p className="mt-4 text-center text-xs text-schedwise-body">
        Don't have an account?{" "}
        <button type="button" onClick={onRegister} className="font-medium text-schedwise-purple hover:underline">
          Register
        </button>
      </p>
      <p className="mt-3 text-center text-xs text-slate-400">If there's a problem, contact your Administrator.</p>
    </form>
  )
}
