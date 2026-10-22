import { useEffect, useState, type FormEvent } from "react"
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Eye,
  EyeOff,
  GraduationCap,
  Mail,
} from "lucide-react"
import { ApiError, authApi, type User } from "../../api"
import {
  Button,
  FieldError,
  GroundWave,
  InputTag,
  SelectTag,
  TextareaTag,
  WaveHeader,
  departmentIds,
  departments,
  errorMessage,
  fieldClass,
  institutionalEmailPattern,
  isStrongPassword,
  passwordPolicyMessage,
  pillField,
  pillLabel,
  primaryCta,
  textLink,
} from "../../shared"
import { PrivacyNotice } from "../legal/PrivacyNotice"

export type AuthScreen = "welcome" | "login" | "forgot" | "register"

export function AuthenticationGate({ onLogin }: { onLogin: (user: User) => void }) {
  const initialVerifyToken = new URLSearchParams(window.location.search).get(
    "verify_token",
  )
  const [screen, setScreen] = useState<AuthScreen>(
    initialVerifyToken ? "login" : "welcome",
  )
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(Boolean(initialVerifyToken))
  const [needsVerification, setNeedsVerification] = useState(
    Boolean(initialVerifyToken),
  )
  const [resetEmail, setResetEmail] = useState("")
  const [resetCode, setResetCode] = useState("")
  const [resetPassword, setResetPassword] = useState("")
  const [resetStep, setResetStep] = useState<"request" | "confirm">("request")
  const [regErrors, setRegErrors] = useState<Record<string, string>>({})
  const [resetErrors, setResetErrors] = useState<Record<string, string>>({})
  const [regRole, setRegRole] = useState<"student" | "faculty">("student")
  const [reg, setReg] = useState({
    name: "",
    email: "",
    password: "",
    department: "",
    major: "",
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get("verify_token")
    if (!token) return

    let cancelled = false
    setScreen("login")
    setVerifying(true)
    setError("")
    setNotice("")

    authApi
      .verifyEmail(token)
      .then((result) => {
        if (cancelled) return
        setNotice(result.message)
        setNeedsVerification(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(errorMessage(err, "This verification link is invalid or has expired."))
        setNeedsVerification(true)
      })
      .finally(() => {
        if (cancelled) return
        setVerifying(false)
        params.delete("verify_token")
        const query = params.toString()
        window.history.replaceState(
          {},
          document.title,
          `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
        )
      })

    return () => {
      cancelled = true
    }
  }, [])

  const go = (next: AuthScreen) => {
    setScreen(next)
    setRegErrors({})
    setResetErrors({})
    setError("")
    setNotice("")
    if (next === "register") {
      setNeedsVerification(false)
    }
    if (next === "forgot") {
      setResetStep("request")
      setResetCode("")
      setResetPassword("")
    }
  }

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
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
    try {
      const { user } = await authApi.login({ email, password })
      onLogin(user)
    } catch (err) {
      setNeedsVerification(err instanceof ApiError && err.code === "email_unverified")
      setError(errorMessage(err, "Login failed. Please check your credentials."))
    } finally {
      setLoading(false)
    }
  }

  const handleResendVerification = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter the email address you registered with.")
      return
    }

    setLoading(true)
    setError("")
    setNotice("")
    try {
      const result = await authApi.resendVerification(email.trim())
      setNeedsVerification(true)
      setNotice(result.message)
    } catch (err) {
      setError(
        errorMessage(err, "Unable to resend the verification email right now."),
      )
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async (event: FormEvent) => {
    event.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(resetEmail)) {
      setResetErrors({ email: "Enter a valid email address." })
      return
    }

    setLoading(true)
    setError("")
    setNotice("")
    setResetErrors({})
    try {
      if (resetStep === "request") {
        const result = await authApi.forgotPassword(resetEmail.trim())
        setResetStep("confirm")
        setNotice(result.message)
      } else {
        if (!/^\d{6}$/.test(resetCode.trim())) {
          setResetErrors({ code: "Enter the 6-digit reset code." })
          return
        }
        if (!isStrongPassword(resetPassword)) {
          setResetErrors({ password: passwordPolicyMessage })
          return
        }
        const result = await authApi.resetPassword({
          email: resetEmail.trim(),
          code: resetCode.trim(),
          password: resetPassword,
        })
        setNotice(result.message)
        setTimeout(() => setScreen("login"), 1200)
      }
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setResetErrors(err.fields)
      else if (err instanceof ApiError && err.status === 400) setResetErrors({ code: err.message })
      else setError(errorMessage(err, "Unable to reset password."))
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault()
    const isFaculty = regRole === "faculty"
    const nameParts = reg.name.trim().split(/\s+/)
    const departmentId = departmentIds[reg.department]
    const fields: Record<string, string> = {}
    if (nameParts.length < 2) fields.name = "Enter your first and last name."
    if (!institutionalEmailPattern.test(reg.email.trim())) fields.email = "Use an institutional email address, such as name@schedwise.edu."
    if (!isStrongPassword(reg.password)) fields.password = passwordPolicyMessage
    if (!departmentId) fields.department = "Select a valid department."
    if (!isFaculty && !reg.major.trim()) fields.major = "Select your course."
    setRegErrors(fields)
    setError("")
    if (Object.keys(fields).length) return

    setLoading(true)
    setError("")
    setNotice("")
    try {
      const result = await authApi.register({
        email: reg.email.trim().toLowerCase(),
        password: reg.password,
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(" "),
        role_id: regRole,
        department_id: departmentId,
        program: isFaculty ? undefined : reg.major,
      })
      const accountNumber = isFaculty ? result.faculty_number : result.student_number
      setNotice(
        [
          result.message,
          accountNumber
            ? `Your ${isFaculty ? "Faculty" : "Student"} ID is ${accountNumber}.`
            : "",
          result.email_sent === false
            ? "The verification email could not be sent. Try Resend later or contact your administrator."
            : isFaculty
              ? "Open the link in your email to verify the account; an administrator will review it next."
              : "Open the link in your email to activate the account.",
        ].join(" "),
      )
      setNeedsVerification(true)
      setEmail(reg.email.trim().toLowerCase())
      setPassword("")
      setScreen("login")
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        setRegErrors({ ...err.fields, name: err.fields.first_name || err.fields.last_name || "", department: err.fields.department_id || "" })
      } else setError(errorMessage(err, "Registration failed. Please try again."))
    } finally {
      setLoading(false)
    }
  }

  if (verifying) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-6">
        <WaveHeader className="h-80" />
        <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-[0_10px_40px_rgba(30,41,59,0.08)]">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-purple-50 text-purple-600">
            <Mail size={22} />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-[#1E293B]">
            Verifying your email
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            One moment while we activate your account.
          </p>
        </div>
      </main>
    )
  }

  if (screen === "welcome") {
    return (
      <main className="relative flex min-h-screen flex-col overflow-hidden bg-white">
        <WaveHeader className="h-[46vh] min-h-72" />
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-48 pt-[30vh] text-center">
          <div className="flex size-24 items-center justify-center rounded-full border border-purple-100 bg-white text-purple-600 shadow-[0_8px_30px_rgba(147,51,234,0.15)]">
            <GraduationCap size={40} strokeWidth={1.8} />
          </div>
          <h1 className="mt-8 text-3xl font-bold tracking-tight text-[#1E293B] sm:text-4xl">
            SchedWise
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
            Book office hours, manage availability, and keep every consultation
            record in one trusted university workspace.
          </p>
        </div>
        <GroundWave />
        <div className="absolute bottom-8 right-6 z-10 sm:right-12">
          <Button
            onClick={() => go("login")}
            className="gap-2 rounded-[4px] border border-white px-6 py-2.5 text-sm font-semibold text-white hover:bg-white hover:text-purple-700"
          >
            Get Started <ArrowRight size={16} />
          </Button>
        </div>
      </main>
    )
  }

  const alert = error && (
    <p
      className="rounded-xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700"
      role="alert"
    >
      {error}
    </p>
  )

  return (
    <main className="relative min-h-screen overflow-hidden bg-white">
      <WaveHeader className="h-80" />
      <div className="relative z-10 flex min-h-screen justify-center px-5 pb-12 pt-40">
        <div
          className={`w-full self-start rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_10px_40px_rgba(30,41,59,0.08)] sm:p-9 ${
            screen === "register" ? "max-w-xl" : "max-w-md"
          }`}
        >
          <div className="mb-7 flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-purple-50 text-purple-600">
              <GraduationCap size={17} />
            </span>
            <span className="text-xs font-semibold text-slate-500">
              SchedWise · Faculty Consultation
            </span>
          </div>

          {screen === "login" && (
            <form onSubmit={handleLogin} noValidate>
              <h1 className="text-3xl font-bold tracking-tight text-[#1E293B]">
                Login
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Sign in with your university account.
              </p>
              <div className="mt-7 space-y-4">
                <label className="block">
                  <span className={pillLabel}>Email Address</span>
                  <InputTag
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setError("")
                      setNeedsVerification(false)
                                      }}
                    placeholder="name@university.edu"
                    autoComplete="email"
                    className={pillField}
                  />
                </label>
                <div>
                  <label className="block">
                    <span className={pillLabel}>Password</span>
                    <div className="relative">
                      <InputTag
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value)
                          setError("")
                        }}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        className={`${pillField} pr-12`}
                      />
                      <Button
                        onClick={() => setShowPassword((v) => !v)}
                        title={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-1.5 top-1/2 size-9 -translate-y-1/2 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                      >
                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </Button>
                    </div>
                  </label>
                  <div className="mt-2 flex justify-end">
                    <Button
                      onClick={() => go("forgot")}
                      className="text-xs font-semibold text-purple-500 hover:text-purple-700"
                    >
                      Forgot Password?
                    </Button>
                  </div>
                </div>
                {alert}
                {notice && (
                  <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
                    <Check size={14} className="mt-0.5 shrink-0" /> {notice}
                  </p>
                )}
                {needsVerification && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-xs leading-5 text-amber-800">
                      Your account needs email verification before you can sign
                      in.
                    </p>
                    <Button
                      onClick={handleResendVerification}
                      disabled={loading}
                      className="mt-2 text-xs font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700"
                    >
                      Resend verification email
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-8 flex items-center justify-between gap-4 border-t border-slate-100 pt-6">
                <Button onClick={() => go("register")} className={textLink}>
                  New Here?&nbsp;<span className="text-purple-600">Register</span>
                </Button>
                <Button type="submit" disabled={loading} className={primaryCta}>
                  {loading ? "Logging in..." : "Login"}
                </Button>
              </div>
              <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">
                Need help signing in? Contact your administrator.
              </p>
            </form>
          )}

          {screen === "forgot" && (
            <form onSubmit={handleReset} noValidate>
              <h1 className="text-3xl font-bold tracking-tight text-[#1E293B]">
                Reset Password
              </h1>
              <p className="mt-2 text-sm font-light leading-6 text-slate-500">
                {resetStep === "request"
                  ? "Enter the email linked to your account and we'll issue a verification code."
                  : "Enter the 6-digit code and choose a new password."}
              </p>
              <label className="mt-7 block">
                <span className={pillLabel}>Institutional Email Address</span>
                <InputTag
                  type="email"
                  aria-invalid={!!resetErrors.email} aria-describedby="reset-email-error" value={resetEmail}
                  onChange={(e) => {
                    setResetEmail(e.target.value)
                    setError(""); setResetErrors((f) => ({ ...f, email: "" }))
                    setNotice("")
                  }}
                  placeholder="name@university.edu"
                  className={pillField}
                  disabled={resetStep === "confirm"}
                />
                <FieldError id="reset-email-error" message={resetErrors.email} />
              </label>
              {resetStep === "confirm" && (
                <div className="mt-4 space-y-4">
                  <label className="block">
                    <span className={pillLabel}>Reset code</span>
                    <InputTag
                      aria-invalid={!!resetErrors.code} aria-describedby="reset-code-error" value={resetCode}
                      onChange={(e) => {
                        setResetCode(e.target.value)
                        setError(""); setResetErrors((f) => ({ ...f, code: "" }))
                      }}
                      placeholder="6-digit code"
                      className={pillField}
                    />
                <FieldError id="reset-code-error" message={resetErrors.code} />
                  </label>
                  <label className="block">
                    <span className={pillLabel}>New password</span>
                    <InputTag
                      type="password"
                      aria-invalid={!!resetErrors.password} aria-describedby="reset-password-error" value={resetPassword}
                      onChange={(e) => {
                        setResetPassword(e.target.value)
                        setError(""); setResetErrors((f) => ({ ...f, password: "" }))
                      }}
                      placeholder="Create a strong password"
                      className={pillField}
                    />
                <FieldError id="reset-password-error" message={resetErrors.password} />
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">
                      8+ characters with uppercase, lowercase, a number, and a
                      symbol.
                    </p>
                  </label>
                </div>
              )}
              <div className="mt-4 space-y-3">
                {alert}
                {notice && (
                  <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
                    <Check size={14} className="mt-0.5 shrink-0" /> {notice}
                  </p>
                )}
              </div>
              <div className="mt-10 flex items-center justify-between gap-4 border-t border-slate-100 pt-6">
                <Button onClick={() => go("login")} className={`${textLink} gap-1.5`}>
                  <ChevronLeft size={14} /> Back to Login
                </Button>
                <Button type="submit" disabled={loading} className={primaryCta}>
                  {loading
                    ? resetStep === "request"
                      ? "Sending..."
                      : "Updating..."
                    : resetStep === "request"
                      ? "Send Code"
                      : "Update Password"}
                </Button>
              </div>
            </form>
          )}

          {screen === "register" && (
            <form onSubmit={handleRegister} noValidate autoComplete="off">
              <h1 className="text-3xl font-bold tracking-tight text-[#1E293B]">
                Register
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {regRole === "faculty"
                  ? "Create your faculty account to manage consultations. Verify your email, then wait for administrator approval before signing in."
                  : "Create your student account to book faculty consultations. We'll email a verification link before your first sign-in."}
              </p>
              <PrivacyNotice />
              <div className="mt-7">
                <span className={pillLabel}>I am registering as</span>
                <div
                  className="mt-2 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1"
                  role="group"
                  aria-label="Registration type"
                >
                  <button
                    type="button"
                    aria-pressed={regRole === "student"}
                    onClick={() => {
                      setRegRole("student")
                      setRegErrors({})
                    }}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                      regRole === "student"
                        ? "bg-white text-purple-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Student
                  </button>
                  <button
                    type="button"
                    aria-pressed={regRole === "faculty"}
                    onClick={() => {
                      setRegRole("faculty")
                      setRegErrors({})
                      setReg({ ...reg, major: "" })
                    }}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                      regRole === "faculty"
                        ? "bg-white text-purple-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Faculty
                  </button>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-slate-500">
                  {regRole === "faculty"
                    ? "Faculty accounts need administrator approval after email verification."
                    : "Student accounts activate as soon as the email address is verified."}
                </p>
              </div>
              <div className="mt-7 space-y-4">
                <label className="block">
                  <span className={pillLabel}>Full Name</span>
                  <InputTag
                    aria-invalid={!!regErrors.name} aria-describedby="register-name-error" value={reg.name}
                    onChange={(e) => { setReg({ ...reg, name: e.target.value }); setRegErrors((f) => ({ ...f, name: "" })) }}
                    placeholder="Juan Dela Cruz"
                    autoComplete="name"
                    className={pillField}
                  />
                  <FieldError id="register-name-error" message={regErrors.name} />
                </label>
                <label className="block">
                  <span className={pillLabel}>Institutional Email Address</span>
                  {/* Brave 1.97 can crash in its autofill UI when an email suggestion opens here. */}
                  <InputTag
                    type="text"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    name="schedwise_registration_email"
                    aria-invalid={!!regErrors.email} aria-describedby="register-email-error" value={reg.email}
                    onChange={(e) => { setReg({ ...reg, email: e.target.value }); setRegErrors((f) => ({ ...f, email: "" })) }}
                    placeholder="name@university.edu"
                    autoComplete="off"
                    className={pillField}
                  />
                  <FieldError id="register-email-error" message={regErrors.email} />
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    Use your school-issued address, e.g. name@schedwise.edu.
                  </p>
                </label>
                <label className="block">
                  <span className={pillLabel}>Password Creation</span>
                  <InputTag
                    type="password"
                    aria-invalid={!!regErrors.password} aria-describedby="register-password-error" value={reg.password}
                    onChange={(e) => { setReg({ ...reg, password: e.target.value }); setRegErrors((f) => ({ ...f, password: "" })) }}
                    placeholder="Create a strong password"
                    autoComplete="new-password"
                    className={pillField}
                  />
                  <FieldError id="register-password-error" message={regErrors.password} />
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    8+ characters with uppercase, lowercase, a number, and a
                    symbol.
                  </p>
                </label>
                <div className={regRole === "student" ? "grid gap-4 sm:grid-cols-2" : ""}>
                  <label className="block">
                    <span className={pillLabel}>Department / College</span>
                    <SelectTag
                      aria-invalid={!!regErrors.department} aria-describedby="register-department-error" value={reg.department}
                      onChange={(e) =>
                        { setReg({ ...reg, department: e.target.value, major: "" }); setRegErrors((f) => ({ ...f, department: "", major: "" })) }
                      }
                      className={`${pillField} cursor-pointer ${reg.department ? "" : "text-slate-400"}`}
                    >
                      <option value="">{regRole === "faculty" ? "Select department" : "Select college"}</option>
                      {Object.keys(departments).map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </SelectTag>
                  <FieldError id="register-department-error" message={regErrors.department} />
                  </label>
                  {regRole === "student" && (
                    <label className="block">
                      <span className={pillLabel}>Major / Course</span>
                      <SelectTag
                        aria-invalid={!!regErrors.major} aria-describedby="register-major-error" value={reg.major}
                        disabled={!reg.department}
                        onChange={(e) => { setReg({ ...reg, major: e.target.value }); setRegErrors((f) => ({ ...f, major: "" })) }}
                        className={`${pillField} cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-50 ${reg.major ? "" : "text-slate-400"}`}
                      >
                        <option value="">Select course</option>
                        {(departments[reg.department] ?? []).map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </SelectTag>
                    <FieldError id="register-major-error" message={regErrors.major} />
                    </label>
                  )}
                </div>
                {alert}
              </div>
              <div className="mt-8 flex items-center justify-between gap-4 border-t border-slate-100 pt-6">
                <Button onClick={() => go("login")} className={textLink}>
                  Already a Member?&nbsp;<span className="text-purple-600">Login</span>
                </Button>
                <Button type="submit" disabled={loading} className={primaryCta}>
                  {loading ? "Registering..." : "Register"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
