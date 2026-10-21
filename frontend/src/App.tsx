import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

import { confirmAction } from "./confirmation"

// Import API functions
import {
  ApiError,
  authApi,
  appointmentApi,
  facultyApi,
  facultyAvailabilityApi,
  facultyScheduleOverridesApi,
  consultationApi,
  reportsApi,
  usersApi,
  type Appointment,
  type ApptStatus,
  type FacultyAvailability,
  type ManagedUser,
  type ScheduleOverride,
  type UiAppointment,
  type User,
} from "./api"
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  Globe,
  GraduationCap,
  History,
  Link2,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  NotebookPen,
  Pencil,
  AlertTriangle,
  Plus,
  Repeat,
  Search,
  Settings,
  ShieldCheck,
  Timer,
  UserCog,
  UsersRound,
  X,
} from "lucide-react"

type Role = "Student" | "Faculty" | "Admin"
type Icon = ComponentType<{
  size?: number
  strokeWidth?: number
  className?: string
}>

const roleFromId = (roleId: string): Role | null => {
  switch (roleId.toLowerCase()) {
    case "student":
      return "Student"
    case "faculty":
      return "Faculty"
    case "admin":
      return "Admin"
    default:
      return null
  }
}

const CurrentUserContext = createContext<User | null>(null)
const CalendarErrorContext = createContext<string | null>(null)

const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "??"

const errorMessage = (err: unknown, fallback: string) => {
  if (err instanceof ApiError) {
    const fieldMessages = Object.values(err.fields).filter(Boolean)
    return fieldMessages.length > 0
      ? fieldMessages.join(" ")
      : err.message || fallback
  }
  return err instanceof Error && err.message ? err.message : fallback
}

const fullName = (first?: string | null, last?: string | null, fallback = "") =>
  [first, last].filter(Boolean).join(" ") || fallback

const ButtonTag = "button"
const InputTag = "input"
const SelectTag = "select"
const TextareaTag = "textarea"

const fieldClass =
  "w-full rounded-xl border border-purple-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15"

function Button({
  children,
  className = "",
  onClick,
  title,
  disabled,
  type = "button",
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  title?: string
  disabled?: boolean
  type?: "button" | "submit"
}) {
  return (
    <ButtonTag
      type={type}
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`inline-flex cursor-pointer items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </ButtonTag>
  )
}

function FieldError({ message, id }: { message?: string; id?: string }) {
  return message ? <p id={id} role="alert" className="mt-1.5 text-xs font-medium text-rose-700">{message}</p> : null
}

function Avatar({
  initials,
  dark = false,
}: {
  initials: string
  dark?: boolean
}) {
  return (
    <div
      className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${
        dark ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
      }`}
    >
      {initials}
    </div>
  )
}

function WaveHeader({ className = "h-64" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 top-0 overflow-hidden ${className}`}
    >
      <svg
        viewBox="0 0 1440 320"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id="wave-royal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7e22ce" />
            <stop offset="1" stopColor="#9333ea" />
          </linearGradient>
        </defs>
        <path
          fill="#d8b4fe"
          fillOpacity="0.5"
          d="M0,0H1440V262C1290,312 1110,196 930,236C750,276 590,330 410,292C250,258 115,214 0,250Z"
        />
        <path
          fill="#c084fc"
          fillOpacity="0.75"
          d="M0,0H1440V212C1280,262 1095,160 900,198C715,234 555,286 375,256C225,230 105,182 0,212Z"
        />
        <path
          fill="url(#wave-royal)"
          d="M0,0H1440V158C1270,208 1080,116 880,156C700,192 540,236 360,210C210,188 100,146 0,166Z"
        />
      </svg>
    </div>
  )
}

function GroundWave() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 220"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-44 w-full"
    >
      <path
        fill="#d8b4fe"
        fillOpacity="0.55"
        d="M0,90C220,30 420,150 700,110C980,70 1180,10 1440,60V220H0Z"
      />
      <path
        fill="#9333ea"
        d="M0,140C260,90 470,190 760,150C1040,112 1220,80 1440,118V220H0Z"
      />
    </svg>
  )
}

const pillField =
  "w-full rounded-2xl border border-purple-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:ring-[3px] focus:ring-purple-500/15"
const pillLabel =
  "mb-1.5 block px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
const primaryCta =
  "gap-2 rounded-[4px] border border-purple-700 bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
const textLink = "text-xs font-semibold text-slate-500 hover:text-purple-700"

type AuthScreen = "welcome" | "login" | "forgot" | "register"

const departments: Record<string, string[]> = {
  "College of Computer Studies": [
    "BS Computer Science",
    "BS Information Technology",
    "BS Information Systems",
  ],
  "College of Engineering": [
    "BS Civil Engineering",
    "BS Electrical Engineering",
    "BS Mechanical Engineering",
  ],
  "College of Business": [
    "BS Accountancy",
    "BS Business Administration",
    "BS Marketing",
  ],
  "College of Arts & Sciences": ["BA Psychology", "BS Biology", "BA English"],
}

// The database stores department IDs, not display labels. Keep this mapping in
// sync with the demo departments seeded by database.sql.
const departmentIds: Record<string, string> = {
  "College of Computer Studies": "ccs",
  "College of Engineering": "coe",
  "College of Business": "cba",
  "College of Arts & Sciences": "cas",
}

const institutionalEmailPattern =
  /@([a-z0-9-]+\.)+(edu|ac|sch|school|college|university)(\.[a-z]{2,})?$/i

const passwordPolicyMessage =
  "Use at least 8 characters with an uppercase letter, lowercase letter, number, and special character."

const isStrongPassword = (password: string) =>
  password.length >= 8 &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /[0-9]/.test(password) &&
  /[\W_]/.test(password)

function AuthenticationGate({ onLogin }: { onLogin: (user: User) => void }) {
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
  const [verificationUrl, setVerificationUrl] = useState("")
  const [resetEmail, setResetEmail] = useState("")
  const [resetCode, setResetCode] = useState("")
  const [resetPassword, setResetPassword] = useState("")
  const [resetStep, setResetStep] = useState<"request" | "confirm">("request")
  const [regErrors, setRegErrors] = useState<Record<string, string>>({})
  const [resetErrors, setResetErrors] = useState<Record<string, string>>({})
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
    setVerificationUrl("")
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
    setVerificationUrl("")
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
      const mailFailed = result.debug_mail_sent === false
      setNeedsVerification(true)
      setVerificationUrl(
        mailFailed ? result.debug_verification_url ?? "" : "",
      )
      setNotice(
        [
          result.message,
          mailFailed && result.debug_verification_url
            ? "A local debug verification link is available below."
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      )
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
        const details = result.debug_code
          ? [
              `Dev code: ${result.debug_code} (${
                result.debug_mail_sent
                  ? "also sent to the local inbox"
                  : "email delivery failed"
              }).`,
            ]
          : []
        setNotice([result.message, ...details].join(" "))
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
    const nameParts = reg.name.trim().split(/\s+/)
    const departmentId = departmentIds[reg.department]
    const fields: Record<string, string> = {}
    if (nameParts.length < 2) fields.name = "Enter your first and last name."
    if (!institutionalEmailPattern.test(reg.email.trim())) fields.email = "Use an institutional email address, such as name@fcams.edu."
    if (!isStrongPassword(reg.password)) fields.password = passwordPolicyMessage
    if (!departmentId) fields.department = "Select a valid department."
    if (!reg.major.trim()) fields.major = "Select your course."
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
        role_id: "student",
        department_id: departmentId,
        program: reg.major,
      })
      setNotice(
        [
          result.message,
          result.student_number ? `Your Student ID is ${result.student_number}.` : "",
          result.email_sent === false
            ? "The verification email could not be sent. Use Resend below after checking Mailpit."
            : "Open the link in your email to activate the account.",
        ].join(" "),
      )
      setVerificationUrl(
        result.email_sent === false ? result.debug_verification_url ?? "" : "",
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
            Faculty Consultation
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
              Faculty Consultation System
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
                      setVerificationUrl("")
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
                    {verificationUrl && (
                      <a
                        href={verificationUrl}
                        className="mt-2 block break-all text-[11px] font-semibold text-purple-700 underline underline-offset-2"
                      >
                        Open local debug verification link
                      </a>
                    )}
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
              <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-500">
                Dev admin: admin@fcams.edu / Admin123!
              </p>
              {import.meta.env.DEV && (
                <p className="mt-2 px-1 text-[11px] leading-5 text-slate-500">
                  Verification and reset emails appear in the{" "}
                  <a
                    href="http://localhost:8025"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-purple-600 underline underline-offset-2"
                  >
                    Mailpit inbox
                  </a>
                  .
                </p>
              )}
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
              {import.meta.env.DEV && (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Local demo: reset emails appear in the{" "}
                  <a
                    href="http://localhost:8025"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-purple-600 underline underline-offset-2"
                  >
                    Mailpit inbox
                  </a>
                  .
                </p>
              )}
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
                Create your student account to book faculty consultations.
                We&apos;ll email a verification link before your first sign-in.
              </p>
              <PrivacyNotice />
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
                    name="fcams_registration_email"
                    aria-invalid={!!regErrors.email} aria-describedby="register-email-error" value={reg.email}
                    onChange={(e) => { setReg({ ...reg, email: e.target.value }); setRegErrors((f) => ({ ...f, email: "" })) }}
                    placeholder="name@university.edu"
                    autoComplete="off"
                    className={pillField}
                  />
                  <FieldError id="register-email-error" message={regErrors.email} />
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    Use your school-issued address, e.g. name@fcams.edu.
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className={pillLabel}>Department / College</span>
                    <SelectTag
                      aria-invalid={!!regErrors.department} aria-describedby="register-department-error" value={reg.department}
                      onChange={(e) =>
                        { setReg({ ...reg, department: e.target.value, major: "" }); setRegErrors((f) => ({ ...f, department: "", major: "" })) }
                      }
                      className={`${pillField} cursor-pointer ${reg.department ? "" : "text-slate-400"}`}
                    >
                      <option value="">Select college</option>
                      {Object.keys(departments).map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </SelectTag>
                  <FieldError id="register-department-error" message={regErrors.department} />
                  </label>
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

function StatusBadge({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger"
  children: ReactNode
}) {
  const tones = {
    success: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
    warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
    danger: "bg-rose-50 text-rose-700 ring-rose-600/15",
  }
  const dots = {
    success: "bg-emerald-600/70",
    warning: "bg-amber-600/70",
    danger: "bg-rose-600/70",
  }
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-xl px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      <span className={`size-1.5 rounded-full ${dots[tone]}`} />
      {children}
    </span>
  )
}

type Stat = { label: string; value: string; hint: string; icon: Icon; onClick: () => void }

function PortalShell({
  role,
  name,
  detail,
  navItems,
  active,
  onNavigate,
  onOpenAccount,
  onSignOut,
  stats,
  children,
}: {
  role: Role
  name: string
  detail: string
  navItems: { label: string; icon: Icon }[]
  active: string
  onNavigate: (view: string) => void
  onOpenAccount: () => void
  onSignOut: () => void
  stats: Stat[]
  children: ReactNode
}) {
  const initials = name
    .replace(/^Dr\.\s*/, "")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-white text-[#1E293B]">
      <WaveHeader className="h-56" />
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 pt-5 sm:px-8">
        <div className="flex items-center gap-3 text-white">
          <div className="flex size-10 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30">
            <GraduationCap size={19} />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold tracking-tight">Consult</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-purple-100">
              {role === "Admin" ? "Admin Control Panel" : `${role} Portal`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2.5 rounded-2xl bg-white/15 py-1.5 pl-1.5 pr-4 text-white ring-1 ring-white/25">
            <span className="flex size-8 items-center justify-center rounded-xl bg-white text-xs font-semibold text-purple-700">
              {initials}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-semibold">{name}</p>
              <p className="hidden truncate text-[11px] text-purple-100 sm:block">
                {detail}
              </p>
            </div>
          </div>
          <Button
            onClick={onOpenAccount}
            title="Account settings"
            className="gap-2 rounded-[4px] border border-white/70 px-3 py-2 text-xs font-semibold text-white hover:bg-white hover:text-purple-700"
          >
            <Settings size={14} />
            <span className="hidden sm:inline">Account</span>
          </Button>
          <Button
            onClick={onSignOut}
            title="Sign out"
            className="gap-2 rounded-[4px] border border-white/70 px-3 py-2 text-xs font-semibold text-white hover:bg-white hover:text-purple-700"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-5 pb-16 pt-40 sm:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-purple-600">
              Welcome back
            </p>
            <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-[#1E293B]">
              {role} Dashboard
            </h1>
          </div>
          <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {navItems.map(({ label, icon: IconComponent }) => (
              <Button
                key={label}
                onClick={() => onNavigate(label)}
                className={`shrink-0 gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium ${
                  active === label
                    ? "border-purple-600 bg-purple-600 text-white"
                    : "border-transparent text-slate-500 hover:border-purple-100 hover:bg-purple-50 hover:text-purple-700"
                }`}
              >
                <IconComponent size={16} strokeWidth={1.9} />
                {label}
              </Button>
            ))}
          </nav>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map(({ label, value, hint, icon: IconComponent, onClick }) => (
            <button type="button" onClick={onClick}
              key={label}
              className="cursor-pointer rounded-2xl border border-purple-100 bg-white p-5 text-left shadow-sm transition hover:border-purple-400 hover:bg-purple-50 focus-visible:outline-2 focus-visible:outline-purple-600"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <span className="flex size-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                  <IconComponent size={15} />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight">
                {value}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
            </button>
          ))}
        </div>

        <div className="mt-10 border-t border-slate-100 pt-8">{children}</div>
      </main>
    </div>
  )
}

function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>
      {action}
    </div>
  )
}

type Professor = {
  id: string
  name: string
  department: string
  location: string
  next: string
}

function StudentBookingView() {
  const currentUser = useContext(CurrentUserContext)
  const [query, setQuery] = useState("")
  const [professor, setProfessor] = useState<Professor | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appointments] = useAppointments()
  const [slots, setSlots] = useState<{ faculty_id: string; date: string; start_minutes: number }[]>([])
  const hasPendingRequest = (facultyId: string) => appointments.some((a) => a.faculty_id === facultyId && ["pending", "reschedule_requested"].includes(a.status))
  const selectableSlots = slots.filter((slot) => !appointments.some((a) =>
    ["pending", "confirmed", "reschedule_requested"].includes(a.status) && a.appointment_date === slot.date
    && a.start_minutes < slot.start_minutes + 30 && a.end_minutes > slot.start_minutes))
  const bookDates = [...new Set(selectableSlots.filter((slot) => !professor || slot.faculty_id === professor.id).map((slot) => slot.date))].map(fromIso)
  const timesFor = (facultyId: string, date: string) => selectableSlots.filter((slot) => slot.faculty_id === facultyId && slot.date === date).map((slot) => slot.start_minutes)
  const [booking, setBooking] = useState({
    date: toIso(new Date()),
    start: 600,
    topic: "",
    reason: "",
  })
  const [bookError, setBookError] = useState("")
  const [bookingErrors, setBookingErrors] = useState<Record<string, string>>({})
  const [facultyList, setFacultyList] = useState<Professor[]>([])

  // Fetch the active faculty directory along with their availability
  useEffect(() => {
    const fetchFaculty = async () => {
      setLoading(true)
      setError(null)
      try {
        const [directory, availableSlots] = await Promise.all([
          facultyApi.list(), facultyApi.slots(),
        ])
        setSlots(availableSlots)

        const list: Professor[] = directory
          .filter((entry) => availableSlots.some((slot) => slot.faculty_id === entry.id))
          .map((entry) => {
            const slot = availableSlots.find((slot) => slot.faculty_id === entry.id)
            return {
              id: entry.id,
              name: fullName(entry.first_name, entry.last_name, entry.email),
              department: entry.department_name || "Department not set",
              location: "See faculty schedule",
              next: slot ? `${slot.date} · ${clock(slot.start_minutes)}` : "No available times",
            }
          })

        setFacultyList(list)
      } catch (err) {
        setError(errorMessage(err, "Failed to load faculty list"))
        setFacultyList([])
      } finally {
        setLoading(false)
      }
    }
    fetchFaculty()
  }, [])

  const requestAppointment = async () => {
    if (!professor) return
    if (hasPendingRequest(professor.id)) { setBookError("You already have a pending request with this faculty. You can request another faculty at a different time."); return }
    if (!timesFor(professor.id, booking.date).includes(booking.start)) { setBookError("Select an available time."); return }
    if (!currentUser) {
      setBookError("Your session has expired. Please sign in again.")
      return
    }
    const fields: Record<string, string> = {}
    if (!booking.topic.trim()) fields.topic = "Enter a consultation topic."
    if (!booking.reason.trim()) fields.reason = "Enter a short reason for the consultation."
    setBookingErrors(fields)
    if (Object.keys(fields).length) return
    const end = booking.start + 30

    // Check for conflicts using real API data
    const clash = appointments.some(
      (a) =>
        a.faculty_id === professor.id &&
        a.appointment_date === booking.date &&
        a.status !== "cancelled" &&
        a.status !== "rejected" &&
        a.start_minutes < end &&
        booking.start < a.end_minutes,
    )
    if (clash) {
      setBookError("That time was just taken. Please choose another slot.")
      return
    }

    setLoading(true)
    setBookError("")
    try {
      if (!await confirmAction(`Request an appointment with ${professor.name} on ${booking.date}, ${timeRange(booking.start, end)}?`)) return
      const created = await appointmentApi.create({
        student_id: currentUser.id,
        faculty_id: professor.id,
        appointment_date: booking.date,
        start_minutes: booking.start,
        end_minutes: end,
        topic: booking.topic.trim(),
        reason: booking.reason.trim(),
        status: "pending",
      })
      mergeAppointment(created)
      setSent(true)
      // Reset form
      setBooking({ date: toIso(new Date()), start: 600, topic: "", reason: "" })
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setBookingErrors(err.fields)
      else setBookError(errorMessage(err, "Failed to request appointment"))
    } finally {
      setLoading(false)
    }
  }

  const visible = facultyList.filter((item) =>
    `${item.name} ${item.department}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )

  return (
    <div>
      <PageTitle
        eyebrow="Appointments"
        title="Book an Appointment"
        description="Choose a faculty member, select an available time, and briefly describe your academic concern."
      />
      {loading && (
        <div className="text-center py-8">
          <p className="text-sm text-slate-500">Loading faculty list...</p>
        </div>
      )}
      {error && (
        <div className="text-center py-8">
          <p className="text-sm text-rose-500">{error}</p>
        </div>
      )}
      <p className="mt-5 rounded-xl bg-purple-50 p-4 text-sm text-purple-800">You can request different faculty at different times. Only one pending request per faculty is allowed, and appointment times must not overlap.</p>
      {!loading && !error && facultyList.length === 0 && <p className="mt-5 text-sm text-slate-500">No faculty have bookable times in the next 14 days.</p>}
      <div className="relative mt-8 max-w-xl">
        <Search
          size={17}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <InputTag
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search professor or department"
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15"
        />
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {visible.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl bg-white p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
          >
            <div className="flex gap-4">
              <Avatar initials={item.name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(-2)} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {item.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">{item.department}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <Clock3 size={13} className="text-slate-400" /> {item.next}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin size={13} className="text-slate-400" /> {item.location}
              </span>
            </div>
            <Button
              disabled={hasPendingRequest(item.id) || loading || !selectableSlots.some((slot) => slot.faculty_id === item.id)}
              onClick={() => {
                setProfessor(item)
                setBookingErrors({})
                setSent(false)
                setBookError("")
                const first = selectableSlots.find((slot) => slot.faculty_id === item.id)!
                setBooking({ date: first.date, start: first.start_minutes, topic: "", reason: "" })
              }}
              className="mt-5 w-full gap-2 rounded-[4px] bg-purple-600 py-2.5 text-xs font-semibold text-white hover:bg-purple-700"
            >
              {hasPendingRequest(item.id) ? "Request pending with this faculty" : "View Available Times"} <ChevronRight size={14} />
            </Button>
          </div>
        ))}
      </div>

      {professor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Button
            onClick={() => setProfessor(null)}
            title="Close"
            className="absolute inset-0 rounded-none bg-slate-900/40"
          >
            <span className="sr-only">Close</span>
          </Button>
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-7 shadow-[0_10px_40px_-10px_rgba(15,23,42,0.25)]">
            {sent ? (
              <div className="py-5 text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <Check size={25} />
                </div>
                <p className="mt-5 text-xl font-semibold text-slate-900">
                  Request submitted
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {professor.name} will review your request. It now appears on their calendar as pending.
                </p>
                <Button
                  onClick={() => setProfessor(null)}
                  className="mt-7 w-full rounded-[4px] bg-purple-600 py-3 text-sm font-semibold text-white"
                >
                  Done
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {professor.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {professor.department}
                    </p>
                  </div>
                  <Button
                    onClick={() => setProfessor(null)}
                    className="size-9 rounded-xl text-slate-400 hover:bg-slate-100"
                  >
                    <X size={18} />
                  </Button>
                </div>
                <div className="mt-7 space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className={pillLabel}>Date</span>
                      <SelectTag
                        value={booking.date}
                        onChange={(e) => {
                          setBooking({ ...booking, date: e.target.value, start: timesFor(professor.id, e.target.value)[0] })
                          setBookError("")
                        }}
                        className={`${pillField} cursor-pointer`}
                      >
                        {bookDates.map((d) => (
                          <option key={toIso(d)} value={toIso(d)}>
                            {formatDate(d, { weekday: "short", month: "short", day: "numeric" })}
                          </option>
                        ))}
                      </SelectTag>
                    </label>
                    <label className="block">
                      <span className={pillLabel}>Time (30 min)</span>
                      <SelectTag
                        value={booking.start}
                        onChange={(e) => {
                          setBooking({ ...booking, start: Number(e.target.value) })
                          setBookError("")
                        }}
                        className={`${pillField} cursor-pointer`}
                      >
                        {timesFor(professor.id, booking.date)
                          .map((t) => (
                            <option key={t} value={t}>
                              {clock(t)}
                            </option>
                          ))}
                      </SelectTag>
                    </label>
                  </div>
                  <label className="block">
                    <span className={pillLabel}>Topic</span>
                    <InputTag
                      aria-invalid={!!bookingErrors.topic} aria-describedby="booking-topic-error" value={booking.topic}
                      onChange={(e) => {
                        setBooking({ ...booking, topic: e.target.value })
                        setBookError(""); setBookingErrors((f) => ({ ...f, topic: "" }))
                      }}
                      placeholder="e.g. Capstone project review"
                      className={pillField}
                    />
                    <FieldError id="booking-topic-error" message={bookingErrors.topic} />
                  </label>
                  <label className="block">
                    <span className={pillLabel}>Consultation reason</span>
                    <TextareaTag
                      rows={4}
                      aria-invalid={!!bookingErrors.reason} aria-describedby="booking-reason-error" value={booking.reason}
                      onChange={(e) => {
                        setBooking({ ...booking, reason: e.target.value })
                        setBookError(""); setBookingErrors((f) => ({ ...f, reason: "" }))
                      }}
                      placeholder="Briefly describe what you would like to discuss..."
                      className={`${pillField} resize-none`}
                    />
                    <FieldError id="booking-reason-error" message={bookingErrors.reason} />
                  </label>
                  {bookError && (
                    <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
                      {bookError}
                    </p>
                  )}
                  <Button
                    onClick={requestAppointment}
                    disabled={loading || hasPendingRequest(professor.id)}
                    className="w-full rounded-[4px] bg-purple-600 py-3 text-sm font-semibold text-white hover:bg-purple-700"
                  >
                    {loading ? "Requesting..." : "Request Appointment"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function AppointmentListView({ filter = "Total" }: { filter?: string }) {
  const [rows, setRows] = useState<Appointment[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    appointmentApi.list().then((data) => { if (live) setRows(data) })
      .catch((err) => { if (live) setError(errorMessage(err, "Unable to load appointments.")) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [filter])
  const today = toIso(new Date())
  const visible = rows.filter((a) => filter === "Today" ? a.appointment_date === today && a.status !== "cancelled"
    : filter === "Upcoming" ? a.status === "confirmed" && a.appointment_date >= today
    : filter.startsWith("Pending") ? ["pending", "reschedule_requested"].includes(a.status)
    : filter === "Completed" ? a.status === "completed" : true)
  return <div>
    <PageTitle eyebrow="Appointments" title={`${filter} Appointments`} description="View appointment dates, participants, and status." />
    {error && <p role="alert" className="mt-4 text-rose-700">{error}</p>}
    {loading ? <p className="mt-6">Loading appointments…</p> : <>
      <p className="mt-4 text-sm text-slate-500">{visible.length} appointments</p>
      <div className="mt-4 divide-y divide-purple-100 rounded-2xl border border-purple-100 bg-white">
        {visible.map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div><p className="font-semibold">{a.topic}</p>
            <p className="text-sm text-slate-500">{fullName(a.student_first_name, a.student_last_name)} · {fullName(a.faculty_first_name, a.faculty_last_name)}</p>
            <p className="text-xs text-slate-500">{a.appointment_date} · {timeRange(a.start_minutes, a.end_minutes)}</p></div>
          <StatusBadge tone={a.status === "completed" ? "success" : "warning"}>{a.status.replace(/_/g, " ")}</StatusBadge>
        </div>)}
        {visible.length === 0 && <p className="p-5 text-sm text-slate-500">No appointments match this filter.</p>}
      </div>
    </>}
  </div>
}

function StudentHistoryView() {
  const [feedback, setFeedback] = useState<string | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [, updateAppointments] = useAppointments()

  // Fetch appointment history for the current student
  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true)
      setError(null)
      try {
        // The API scopes results to the authenticated student
        const allAppointments = await appointmentApi.list()
        setAppointments(allAppointments)
      } catch (err) {
        setError(errorMessage(err, "Failed to load appointment history"))
        setAppointments([])
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [])

  // Convert API appointment objects to the format expected by the view
  const formattedAppointments = appointments.map(appt => ({
    date: formatDate(fromIso(appt.appointment_date), { month: "short", day: "numeric", year: "numeric" }),
    faculty: fullName(appt.faculty_first_name, appt.faculty_last_name, `Faculty ID: ${appt.faculty_id}`),
    topic: appt.topic || "Consultation",
    status: appt.status.charAt(0).toUpperCase() + appt.status.slice(1), // Capitalize first letter
    feedback: appt.summary || "" // Assuming summary field contains feedback
  }))

  return (
    <div>
      {loading && (
        <div className="text-center py-8">
          <p className="text-sm text-slate-500">Loading consultation history...</p>
        </div>
      )}
      {error && (
        <div className="text-center py-8">
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
                key={`${item.date}-${item.faculty}`}
                className="grid grid-cols-[1.3fr_1.4fr_1fr_0.9fr_1.2fr] items-center gap-5 border-b border-slate-100 px-6 py-4 transition-colors last:border-b-0 hover:bg-slate-50"
              >
                <p className="text-sm font-medium text-slate-900">
                  {item.faculty}
                </p>
                <p className="text-sm text-slate-600">{item.topic}</p>
                <p className="text-sm text-slate-500">{item.date}</p>
                <StatusBadge
                  tone={item.status === "Completed" ? "success" : "danger"}
                >
                  {item.status}
                </StatusBadge>
                <div className="flex justify-end">
                  {item.status === "Completed" && (
                    <Button
                      onClick={() => setFeedback(item.feedback)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      View feedback
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {feedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Button
            onClick={() => setFeedback(null)}
            className="absolute inset-0 rounded-none bg-slate-900/40"
          >
            <span className="sr-only">Close</span>
          </Button>
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-7 shadow-[0_10px_40px_-10px_rgba(15,23,42,0.25)]">
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold text-slate-900">
                Faculty Feedback
              </p>
              <Button
                onClick={() => setFeedback(null)}
                className="size-9 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </Button>
            </div>
            <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm leading-7 text-slate-600">
              {feedback}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function StudentPortal({
  onSignOut,
  onOpenAccount,
}: {
  onSignOut: () => void
  onOpenAccount: () => void
}) {
  const [drilldown, setDrilldown] = useState<string | null>(null)
  const currentUser = useContext(CurrentUserContext)
  const [view, setView] = useState("Book Appointment")
  const [appointments] = useAppointments()
  const name = fullName(currentUser?.first_name, currentUser?.last_name, currentUser?.email ?? "Student")
  const studentNumber = currentUser?.student_number
  const now = toIso(new Date())
  const upcoming = appointments.filter((a) => a.date >= now && a.status === "confirmed").length
  const pending = appointments.filter((a) => ["pending", "reschedule_requested"].includes(a.status)).length
  const completed = appointments.filter((a) => a.status === "completed").length
  const nav = [
    { label: "Book Appointment", icon: CalendarDays },
    { label: "My History", icon: History },
  ]
  return (
    <PortalShell
      role="Student"
      stats={[
        { label: "Upcoming", value: String(upcoming), hint: "Confirmed appointments", icon: CalendarDays, onClick: () => setDrilldown("Upcoming") },
        { label: "Pending", value: String(pending), hint: "Awaiting faculty", icon: Clock3, onClick: () => setDrilldown("Pending") },
        { label: "Completed", value: String(completed), hint: "Consultations held", icon: History, onClick: () => setDrilldown("Completed") },
        { label: "Total", value: String(appointments.length), hint: "All requests", icon: Check, onClick: () => setDrilldown("Total") },
      ]}
      name={name}
      detail={studentNumber ? `Student ID: ${studentNumber}` : currentUser?.email ?? ""}
      navItems={nav}
      active={view}
      onNavigate={(next) => { setView(next); setDrilldown(null) }}
      onOpenAccount={onOpenAccount}
      onSignOut={onSignOut}
    >
      {drilldown ? <AppointmentListView key={drilldown} filter={drilldown} /> : view === "Book Appointment" ? (
        <StudentBookingView />
      ) : (
        <StudentHistoryView />
      )}
    </PortalShell>
  )
}

function FacultyTodayView() {
  const [requests, setRequests] = useState<{ id: string; student_name: string; reason: string; time: string; initials: string }[]>([])
  const [confirmedToday, setConfirmedToday] = useState<{ time: string; name: string; reason: string; location: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch today's appointments and pending requests
  useEffect(() => {
    const fetchTodayData = async () => {
      setLoading(true)
      setError(null)
      try {
        // Get today's date in YYYY-MM-DD format
        const today = new Date()
        const todayDate = toIso(today)

        // Fetch appointments for today
        const appointments = await appointmentApi.list()

        const studentName = (appt: Appointment) =>
          fullName(appt.student_first_name, appt.student_last_name, `Student ID: ${appt.student_id}`)

        // Separate pending requests and confirmed appointments
        const pendingRequests = appointments
          .filter(appt => ['pending', 'reschedule_requested'].includes(appt.status))
          .map(appt => ({
            id: appt.id,
            student_name: studentName(appt),
            reason: appt.topic || "Consultation request",
            time: `${appt.appointment_date} · ${formatTime(appt.start_minutes)}`,
            initials: getInitials(studentName(appt))
          }))

        const confirmedAppointments = appointments
          .filter(appt => appt.status === 'confirmed' && appt.appointment_date === todayDate)
          .map(appt => ({
            time: formatTime(appt.start_minutes),
            name: studentName(appt),
            reason: appt.topic || "Consultation",
            location: appt.location || "TBD"
          }))

        setRequests(pendingRequests)
        setConfirmedToday(confirmedAppointments)
      } catch (err) {
        setError(errorMessage(err, "Failed to load today's schedule"))
        setRequests([])
        setConfirmedToday([])
      } finally {
        setLoading(false)
      }
    }
    fetchTodayData()
  }, [])

  // Helper functions
  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '??'
  }

  return (
    <div>
      {loading && (
        <div className="text-center py-8">
          <p className="text-sm text-slate-500">Loading today's schedule...</p>
        </div>
      )}
      {error && (
        <div className="text-center py-8">
          <p className="text-sm text-rose-500">{error}</p>
        </div>
      )}
      <PageTitle
        eyebrow="Schedule"
        title="Today’s Schedule"
        description="Review incoming requests and keep track of your confirmed consultations."
      />
      <div className="mt-10 grid gap-12 xl:grid-cols-2 xl:gap-20">
        <section>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-base font-semibold text-slate-900">
                Incoming Requests
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {requests.length} requests need your response
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {requests.map((request) => (
              <div
                key={request.id}
                className="rounded-2xl bg-white p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
              >
                <div className="flex gap-3">
                  <Avatar initials={request.initials} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {request.student_name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{request.reason}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                      <Clock3 size={12} /> Requested for {request.time}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-5 border-t border-slate-100 pt-4">
                  <Button
                    onClick={async () => {
                      if (!await confirmAction(`Approve the appointment request from ${request.student_name}?`)) return
                      // Approve the appointment
                      appointmentApi.approve(request.id).then((approved) => {
                        mergeAppointment(approved)
                        if (approved.appointment_date === toIso(new Date())) setConfirmedToday((current) => [...current, {
                          time: formatTime(approved.start_minutes), name: request.student_name,
                          reason: approved.topic, location: approved.location || "TBD",
                        }])
                        setRequests(prev => prev.filter(req => req.id !== request.id))
                      }).catch(err => {
                        setError(err.message || "Failed to approve request")
                      })
                    }}
                    className="rounded-[4px] bg-purple-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
                  >
                    Accept
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!await confirmAction(`Decline the appointment request from ${request.student_name}?`)) return
                      // Reject the appointment (in a real app, this would ask for a reason)
                      appointmentApi.reject(request.id, "No reason provided").then((rejected) => {
                        mergeAppointment(rejected)
                        setRequests(prev => prev.filter(req => req.id !== request.id))
                      }).catch(err => {
                        setError(err.message || "Failed to reject request")
                      })
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <p className="text-base font-semibold text-slate-900">
            Confirmed Today
          </p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(new Date(), { weekday: "long", month: "long", day: "numeric" })}</p>
          <div className="mt-7 space-y-8">
            {confirmedToday.map((appointment, index) => (
              <div key={appointment.time} className="relative flex gap-5">
                {index < 2 && (
                  <span className="absolute left-1 top-4 h-16 w-px bg-slate-200" />
                )}
                <span className="relative mt-1 size-2.5 shrink-0 rounded-full bg-slate-900 ring-4 ring-slate-50" />
                <div>
                  <p className="text-xs font-semibold tabular-nums text-slate-900">
                    {appointment.time}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {appointment.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{appointment.reason}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                    <MapPin size={12} /> {appointment.location}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

type SlotKind = "available" | "blocked"
type AvailabilityBlock = {
  id: string
  kind: SlotKind
  start: number
  end: number
  weekday?: number
  date?: string
  dayLocations?: Record<string, string>
}
type CalendarView = "day" | "week" | "month"
type RuleMode = "weekly" | "overrides"

const HOUR_PX = 56
const DAY_START = 7 * 60
const DAY_END = 18 * 60
const SNAP = 15
const GRID_HEIGHT = ((DAY_END - DAY_START) / 60) * HOUR_PX
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]
const hourLabels = Array.from(
  { length: (DAY_END - DAY_START) / 60 + 1 },
  (_, i) => DAY_START / 60 + i,
)
const timeOptions = Array.from(
  { length: (DAY_END - DAY_START) / SNAP + 1 },
  (_, i) => DAY_START + i * SNAP,
)

const pad = (n: number) => String(n).padStart(2, "0")
const toIso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}
const addDays = (d: Date, n: number) => {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  copy.setDate(copy.getDate() + n)
  return copy
}
const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7))
const formatDate = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  d.toLocaleDateString("en-US", opts)
const clock = (min: number, meridiem = true) => {
  const h24 = Math.floor(min / 60)
  const h = h24 % 12 || 12
  return `${h}:${pad(min % 60)}${meridiem ? ` ${h24 >= 12 ? "PM" : "AM"}` : ""}`
}
const timeRange = (start: number, end: number) =>
  `${clock(start, start >= 720 !== end >= 720)} – ${clock(end)}`

const localZone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
})()
const zones = Array.from(
  new Set([
    localZone,
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "Europe/London",
    "Asia/Manila",
    "Asia/Singapore",
    "Australia/Sydney",
  ]),
)
const zoneLabel = (tz: string) => {
  let offset = ""
  try {
    offset =
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        timeZoneName: "shortOffset",
      } as unknown as Intl.DateTimeFormatOptions)
        .formatToParts(new Date())
        .find((part) => part.type === "timeZoneName")?.value ?? ""
  } catch {
    offset = ""
  }
  return `${tz.replace(/_/g, " ")}${offset ? ` (${offset})` : ""}`
}

const cardShadow = "border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"

function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={`flex rounded-xl bg-slate-100 p-0.5 ${className}`}>
      {options.map((option) => (
        <ButtonTag
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 cursor-pointer rounded-[5px] px-3 py-2 text-center text-xs font-medium leading-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 ${
            value === option.value
              ? "bg-white text-purple-700 shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          {option.label}
        </ButtonTag>
      ))}
    </div>
  )
}

const EMPTY_APPOINTMENTS: UiAppointment[] = []

let apptCache: UiAppointment[] | null = null
const apptListeners = new Set<() => void>()
let remoteLoadStarted = false

const toUiAppointment = (row: Appointment): UiAppointment => {
  const student = fullName(row.student_first_name, row.student_last_name, row.student_id)
  return {
    ...row,
    faculty: fullName(row.faculty_first_name, row.faculty_last_name, row.faculty_id),
    student,
    initials: initialsOf(student),
    date: row.appointment_date,
    start: row.start_minutes,
    end: row.end_minutes,
    notes: "",
  }
}

const readAppts = (): UiAppointment[] => apptCache ?? EMPTY_APPOINTMENTS

const writeAppts = (next: UiAppointment[]) => {
  apptCache = next
  apptListeners.forEach((listener) => listener())
}

const mergeAppointment = (row: Appointment) => {
  const next = apptCache ? [...apptCache] : []
  const uiRow = toUiAppointment(row)
  const index = next.findIndex((a) => a.id === row.id)
  if (index >= 0) next[index] = uiRow
  else next.push(uiRow)
  writeAppts(next)
}

const subscribeAppts = (listener: () => void) => {
  apptListeners.add(listener)
  return () => {
    apptListeners.delete(listener)
  }
}

function useAppointments() {
  useEffect(() => {
    if (remoteLoadStarted) return
    remoteLoadStarted = true
    void appointmentApi
      .list()
      .then((rows) => {
        apptCache = rows.map(toUiAppointment)
        apptListeners.forEach((listener) => listener())
      })
      .catch((error: unknown) => {
        console.error("Unable to load appointments from the PHP API.", error)
        apptListeners.forEach((listener) => listener())
      })
  }, [])
  const list = useSyncExternalStore(subscribeAppts, readAppts)
  const update = (fn: (current: UiAppointment[]) => UiAppointment[]) =>
    writeAppts(fn(readAppts()))
  return [list, update] as const
}

const statusTone = {
  confirmed: "success",
  pending: "warning",
  rejected: "danger",
  reschedule_requested: "warning",
  cancelled: "danger",
  completed: "success",
  no_show: "danger",
} as const
const statusLabel: Record<ApptStatus, string> = {
  confirmed: "Confirmed",
  pending: "Pending approval",
  rejected: "Rejected",
  reschedule_requested: "Reschedule requested",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
}

const pillButton =
  "gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold transition"
const readOnlyPill =
  "w-full truncate rounded-2xl border border-purple-100 bg-slate-50/60 px-4 py-2.5 text-sm text-slate-800"

function PanelFrame({
  eyebrow,
  title,
  subtitle,
  onClose,
  children,
}: {
  eyebrow: string
  title: string
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const panelError = useContext(CalendarErrorContext)
  return (
    <section
      className={`panel-in overflow-hidden rounded-2xl bg-white ${cardShadow}`}
    >
      <div className="relative h-32 overflow-hidden">
        <WaveHeader className="h-32" />
        <div className="relative flex items-start justify-between gap-3 p-5 text-white">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-purple-100">
              {eyebrow}
            </p>
            <p className="mt-1 truncate text-lg font-bold tracking-tight">
              {title}
            </p>
            {subtitle && (
              <div className="mt-0.5 truncate text-xs text-purple-100">
                {subtitle}
              </div>
            )}
          </div>
          <ButtonTag
            type="button"
            aria-label="Close panel"
            title="Back to availability rules"
            onClick={onClose}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/20 transition hover:bg-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X size={15} />
          </ButtonTag>
        </div>
      </div>
      <div className="space-y-5 px-5 pb-5"><FieldError message={panelError || undefined} />{children}</div>
    </section>
  )
}

function TimeSelects({
  start,
  end,
  onChange,
}: {
  start: number
  end: number
  onChange: (range: { start: number; end: number }) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className={pillLabel}>Start</span>
        <SelectTag
          value={start}
          onChange={(e) => {
            const s = Number(e.target.value)
            onChange({
              start: s,
              end: end <= s ? Math.min(DAY_END, s + (end - start)) : end,
            })
          }}
          className={`${pillField} cursor-pointer`}
        >
          {timeOptions
            .filter((t) => t < DAY_END)
            .map((t) => (
              <option key={t} value={t}>
                {clock(t)}
              </option>
            ))}
        </SelectTag>
      </label>
      <label className="block">
        <span className={pillLabel}>End</span>
        <SelectTag
          value={end}
          onChange={(e) => onChange({ start, end: Number(e.target.value) })}
          className={`${pillField} cursor-pointer`}
        >
          {timeOptions
            .filter((t) => t > start)
            .map((t) => (
              <option key={t} value={t}>
                {clock(t)}
              </option>
            ))}
        </SelectTag>
      </label>
    </div>
  )
}

function ConflictNote({ show, text }: { show: boolean; text: string }) {
  if (!show) return null
  return (
    <p
      role="alert"
      className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700"
    >
      {text}
    </p>
  )
}

function AppointmentPanel({
  appointment,
  onClose,
  onUpdate,
  hasClash,
}: {
  appointment: UiAppointment
  onClose: () => void
  onUpdate: (patch: Partial<UiAppointment>) => void | Promise<void>
  hasClash: (iso: string, start: number, end: number) => boolean
}) {
  const studentId = appointment.student_number ?? appointment.student_id
  const course = appointment.student_program ?? "Not on file"
  const [summary, setSummary] = useState(appointment.summary ?? "")
  const [saveError, setSaveError] = useState("")
  const [savingNotes, setSavingNotes] = useState(false)
  const [notes, setNotes] = useState(appointment.notes)
  const [savedNotes, setSavedNotes] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const [slot, setSlot] = useState({
    date: appointment.date,
    start: appointment.start,
    end: appointment.end,
  })
  const clash = rescheduling && hasClash(slot.date, slot.start, slot.end)
  const confirmUpdate = async (patch: Partial<UiAppointment>, message: string) => {
    if (!await confirmAction(message)) return false
    try { await onUpdate(patch); return true }
    catch (err) { setSaveError(errorMessage(err, "Unable to update appointment.")); return false }
  }
  const isPending = appointment.status === "pending"
  const isCancelled = appointment.status === "cancelled"

  return (
    <PanelFrame
      eyebrow="Consultation request"
      title={appointment.student}
      subtitle={`Student ID ${studentId}`}
      onClose={onClose}
    >
      <div className="flex items-center justify-between">
        <StatusBadge tone={statusTone[appointment.status]}>
          {statusLabel[appointment.status]}
        </StatusBadge>
        <span className="text-xs tabular-nums text-slate-500">
          {timeRange(appointment.start, appointment.end)}
        </span>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <span className={pillLabel}>Student ID</span>
            <p className={readOnlyPill}>{studentId}</p>
          </div>
          <div className="min-w-0">
            <span className={pillLabel}>Date</span>
            <p className={readOnlyPill}>
              {formatDate(fromIso(appointment.date), {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
        </div>
        <div>
          <span className={pillLabel}>Course</span>
          <p className={readOnlyPill} title={course}>
            {course}
          </p>
        </div>
        <div>
          <span className={pillLabel}>Topic</span>
          <p className={readOnlyPill} title={appointment.topic}>
            {appointment.topic}
          </p>
        </div>
        <div>
          <span className={pillLabel}>Consultation reason</span>
          <p className="rounded-2xl border border-purple-100 bg-slate-50/60 px-4 py-3 text-sm leading-6 text-slate-700">
            {appointment.reason}
          </p>
        </div>
      </div>

      {!isCancelled && (
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-purple-100 px-4 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-800">
              Approve Request
            </span>
            <span className="block text-xs text-slate-500">
              {isPending
                ? "Slide to confirm this consultation"
                : "Confirmed — slide to revert to pending"}
            </span>
          </span>
          <InputTag
            type="checkbox"
            role="switch"
            checked={!isPending}
            disabled={!isPending}
            onChange={() => { void confirmUpdate({ status: "confirmed" }, "Approve this appointment request?") }}
            className="peer sr-only"
          />
          <span className="relative h-7 w-12 shrink-0 rounded-full bg-slate-200 transition peer-checked:bg-[#10B981] peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 peer-focus-visible:ring-offset-2 after:absolute after:left-0.5 after:top-0.5 after:size-6 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
        </label>
      )}

      {appointment.status === "confirmed" && <Button className={pillButton}
        onClick={() => { void confirmUpdate({ status: "completed" }, "Mark this consultation as completed?") }}>
        Mark consultation completed
      </Button>}
      <div className="flex flex-wrap gap-2">
        {isCancelled ? (
          <Button
            disabled
            className={`${pillButton} flex-1 border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
          >
            <Repeat size={14} /> Cancelled request
          </Button>
        ) : (
          <>
            <Button
              onClick={() => setRescheduling((v) => !v)}
              className={`${pillButton} flex-1 border-purple-200 ${rescheduling ? "bg-purple-50 text-purple-700" : "bg-white text-slate-700 hover:bg-purple-50"}`}
            >
              <CalendarDays size={14} /> Reschedule
            </Button>
            <Button
              onClick={() => { void confirmUpdate({ status: "cancelled" }, "Cancel this appointment?") }}
              className={`${pillButton} flex-1 border-rose-300 bg-white text-rose-700 hover:bg-rose-50`}
            >
              <X size={14} /> Cancel
            </Button>
          </>
        )}
      </div>

      {rescheduling && !isCancelled && (
        <div className="panel-in space-y-3 rounded-2xl border border-purple-100 bg-purple-50/40 p-4">
          <label className="block">
            <span className={pillLabel}>New date</span>
            <InputTag
              type="date"
              value={slot.date}
              onChange={(e) => e.target.value && setSlot({ ...slot, date: e.target.value })}
              className={pillField}
            />
          </label>
          <TimeSelects
            start={slot.start}
            end={slot.end}
            onChange={(range) => setSlot({ ...slot, ...range })}
          />
          <ConflictNote show={clash} text="Another consultation already occupies this time." />
          <Button
            disabled={clash}
            onClick={async () => {
              if (await confirmUpdate(slot, `Move this appointment to ${slot.date}, ${timeRange(slot.start, slot.end)}?`)) setRescheduling(false)
            }}
            className="w-full gap-2 rounded-[4px] border border-purple-700 bg-purple-600 py-2.5 text-xs font-semibold text-white hover:bg-purple-700"
          >
            Move to {formatDate(fromIso(slot.date), { month: "short", day: "numeric" })},{" "}
            {clock(slot.start)}
          </Button>
        </div>
      )}

      <div className="border-t border-slate-100 pt-5">
        <label className="mb-4 block">
          <span className={pillLabel}>Summary shared with the student</span>
          <TextareaTag rows={3} value={summary} maxLength={10000}
            onChange={(event) => { setSummary(event.target.value); setSavedNotes(false) }}
            placeholder="Agreed actions and follow-up instructions" className={pillField} />
        </label>
        {saveError && <p role="alert" className="mb-3 text-sm text-rose-600">{saveError}</p>}
        <label className="block">
          <span className={pillLabel}>Private faculty notes</span>
          <TextareaTag
            rows={6}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
              setSavedNotes(false)
            }}
            placeholder="Confidential notes for the assigned faculty member only..."
            className={`${pillField} resize-y leading-6`}
          />
        </label>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">Private notes are visible only to you. Save a record after completing the appointment.</p>
          <Button
            onClick={async () => {
              if (!await confirmAction("Save this consultation summary and private notes?")) return
              setSavingNotes(true)
              setSaveError("")
              try {
                await onUpdate({ notes, summary })
                setSavedNotes(true)
              } catch (err) {
                setSavedNotes(false)
                setSaveError(errorMessage(err, "Unable to save consultation record."))
              } finally { setSavingNotes(false) }
            }}
            disabled={savingNotes || !summary.trim() || appointment.status !== "completed" || savedNotes}
            className="gap-2 rounded-[4px] border border-purple-700 bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700"
          >
            {savedNotes ? (
              <>
                <Check size={14} /> Saved
              </>
            ) : (
              "Save Notes"
            )}
          </Button>
        </div>
      </div>
    </PanelFrame>
  )
}

function BlockPanel({
  block,
  iso,
  duration,
  defaultLocation,
  onClose,
  onSave,
  onDelete,
  overlaps,
}: {
  block: AvailabilityBlock
  iso: string
  duration: number
  defaultLocation: string
  onClose: () => void
  onSave: (patch: Partial<AvailabilityBlock>) => void | Promise<void>
  onDelete: () => void
  overlaps: (start: number, end: number) => boolean
}) {
  const dayLocation = block.dayLocations?.[iso]
  const [range, setRange] = useState({ start: block.start, end: block.end })
  const [customOn, setCustomOn] = useState(dayLocation !== undefined)
  const [custom, setCustom] = useState(dayLocation ?? defaultLocation)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [busy, setBusy] = useState(false)
  const clash = overlaps(range.start, range.end)
  const available = block.kind === "available"
  const minutes = range.end - range.start
  const date = fromIso(iso)

  const save = async () => {
    if (busy || clash) return
    setBusy(true)
    setSaveError("")
    try {
      if (!await confirmAction(`Save changes to this ${block.date ? "one-time" : "weekly recurring"} schedule, ${timeRange(range.start, range.end)}?`)) return
      const nextLocations = { ...(block.dayLocations ?? {}) }
      if (available && customOn && custom.trim()) nextLocations[iso] = custom.trim()
      else delete nextLocations[iso]
      await onSave({ ...range, dayLocations: nextLocations })
      setSaved(true)
    } catch (err) { setSaveError(errorMessage(err, "Unable to save schedule changes.")) }
    finally { setBusy(false) }
  }

  return (
    <PanelFrame
      eyebrow={available ? "Availability block" : "Blocked time"}
      title={available ? "Available for Consultation" : "Blocked / Class Hours"}
      subtitle={
        <span className="flex items-center gap-1.5">
          {block.date ? <CalendarDays size={11} /> : <Repeat size={11} />}
          {block.date
            ? `Only on ${formatDate(date, { month: "short", day: "numeric" })}`
            : `Repeats every ${WEEKDAYS[date.getDay()]}`}
        </span>
      }
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className={pillLabel}>Duration</span>
          <p className={readOnlyPill}>
            {minutes >= 60 ? `${minutes / 60} hr` : `${minutes} min`}
          </p>
        </div>
        <div>
          <span className={pillLabel}>{available ? "Bookable slots" : "Status"}</span>
          <p className={readOnlyPill}>
            {available
              ? `${Math.floor(minutes / duration)} × ${duration} min`
              : "No bookings"}
          </p>
        </div>
      </div>

      <TimeSelects
        start={range.start}
        end={range.end}
        onChange={(r) => {
          setRange(r)
          setSaved(false)
        }}
      />

      {available && (
        <div className="space-y-3">
          <div>
            <span className={pillLabel}>Location / room</span>
            <p className={`${readOnlyPill} flex items-center gap-2`}>
              <MapPin size={14} className="shrink-0 text-slate-400" />
              <span className="truncate">
                {customOn && custom ? custom : defaultLocation || "Not set"}
              </span>
            </p>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-purple-100 px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-slate-800">
                Different location this day
              </span>
              <span className="block text-xs text-slate-500">
                Only {formatDate(date, { weekday: "short", month: "short", day: "numeric" })}
              </span>
            </span>
            <InputTag
              type="checkbox"
              role="switch"
              checked={customOn}
              onChange={(e) => {
                setCustomOn(e.target.checked)
                setSaved(false)
              }}
              className="peer sr-only"
            />
            <span className="relative h-6 w-10 shrink-0 rounded-full bg-slate-200 transition peer-checked:bg-purple-600 peer-focus-visible:ring-2 peer-focus-visible:ring-purple-500 peer-focus-visible:ring-offset-2 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4" />
          </label>
          {customOn && (
            <InputTag
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value)
                setSaved(false)
              }}
              placeholder="e.g. Room 118 or https://meet…"
              className={`${pillField} panel-in`}
            />
          )}
        </div>
      )}

      <ConflictNote show={clash} text="This range overlaps another block on this day." />
      <FieldError message={saveError} />

      <div className="space-y-2 border-t border-slate-100 pt-5">
        <Button
          onClick={save}
          disabled={clash || busy}
          className="w-full gap-2 rounded-[4px] border border-purple-700 bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
        >
          {saved ? (
            <>
              <Check size={15} /> Changes saved
            </>
          ) : (
            "Save changes"
          )}
        </Button>
        <Button
          onClick={onDelete}
          className="w-full gap-2 rounded-[4px] border border-red-800 bg-red-700 py-2.5 text-sm font-semibold text-white hover:bg-red-800"
        >
          <X size={15} /> Delete / Remove Time Slot
        </Button>
        {!block.date && (
          <p className="text-center text-[11px] text-slate-400">
            Removes this block from every {WEEKDAYS[date.getDay()]}.
          </p>
        )}
      </div>
    </PanelFrame>
  )
}

type Selection =
  | { type: "rules" }
  | { type: "appt"; id: string }
  | { type: "block"; id: string; iso: string }
  | {
      type: "new"
      iso: string
      start: number
      end: number
      kind: SlotKind
      repeat: boolean
    }
  | null

function FacultyAvailabilityView() {
  const currentUser = useContext(CurrentUserContext)
  const [mode, setMode] = useState<RuleMode>("weekly")
  const [timezone, setTimezone] = useState(localZone)
  const [duration, setDuration] = useState(30)
  const [location, setLocation] = useState("Room 302")
  const [saved, setSaved] = useState(false)
  const [view, setView] = useState<CalendarView>("week")
  const [anchor, setAnchor] = useState(() => new Date())
  const [drag, setDrag] = useState<{
    iso: string
    anchor: number
    current: number
  } | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [filters, setFilters] = useState({
    slots: true,
    blocked: true,
    pending: true,
    approved: true,
    cancelled: true,
  })
  const [miniMonth, setMiniMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  )
  const [appointments, updateAppointments] = useAppointments()
  const [facultyAvailability, setFacultyAvailability] = useState<FacultyAvailability[]>([])
  const [facultyOverrides, setFacultyOverrides] = useState<ScheduleOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const facultyId = currentUser?.id ?? ""
  const myAppts = appointments.filter((a) => a.faculty_id === facultyId)
  const apptsFor = (iso: string) => myAppts.filter((a) => a.date === iso)
  const pendingCount = myAppts.filter((a) => ["pending", "reschedule_requested"].includes(a.status)).length
  const idRef = useRef(100)

  // Convert faculty availability and overrides to AvailabilityBlock format
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([])

  // Fetch data when component loads or when faculty changes
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        if (!facultyId) {
          throw new Error("Unable to determine the signed-in faculty account.")
        }

        // Fetch faculty availability
        const availabilityData = await facultyAvailabilityApi.list({ faculty_id: facultyId })
        setFacultyAvailability(availabilityData)

        // Fetch faculty schedule overrides
        const overridesData = await facultyScheduleOverridesApi.list({ faculty_id: facultyId })
        setFacultyOverrides(overridesData)

        // Convert to AvailabilityBlock format
        const availabilityBlocks: AvailabilityBlock[] = []

        // Convert weekly availability
        availabilityData.forEach(avail => {
          availabilityBlocks.push({
            id: avail.id,
            kind: avail.active ? "available" : "blocked",
            start: avail.start_minutes,
            end: avail.end_minutes,
            weekday: avail.weekday
          })
        })

        // Convert schedule overrides (date-specific)
        overridesData.forEach(override => {
          availabilityBlocks.push({
            id: override.id,
            kind: override.kind,
            start: override.start_minutes ?? 0,
            end: override.end_minutes ?? 0,
            date: override.date
          })
        })

        setBlocks(availabilityBlocks)
      } catch (err) {
        setError(errorMessage(err, "Failed to load availability data"))
        setBlocks([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [facultyId])

  // Refetch data when faculty changes (if we had a way to detect faculty changes)
  // For now, we'll rely on manual refresh or implementing faculty context later

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelection(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const todayIso = toIso(new Date())
  const itemsFor = (date: Date) => {
    const iso = toIso(date)
    return blocks
      .filter((b) => (b.date ? b.date === iso : b.weekday === date.getDay()))
      .sort((a, b) => a.start - b.start)
  }
  const overlapsBlock = (iso: string, start: number, end: number, ignore?: string) =>
    itemsFor(fromIso(iso)).some(
      (b) => b.id !== ignore && b.start < end && start < b.end,
    )

  const columns =
    view === "day"
      ? [anchor]
      : Array.from({ length: 5 }, (_, i) => addDays(startOfWeek(anchor), i))

  const monthDates = (() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const gridStart = startOfWeek(first)
    const daysInMonth = new Date(
      anchor.getFullYear(),
      anchor.getMonth() + 1,
      0,
    ).getDate()
    const weeks = Math.ceil((((first.getDay() + 6) % 7) + daysInMonth) / 7)
    return Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i))
  })()

  const shift = (dir: 1 | -1) =>
    setAnchor((current) =>
      view === "month"
        ? new Date(current.getFullYear(), current.getMonth() + dir, 1)
        : addDays(current, (view === "week" ? 7 : 1) * dir),
    )

  const rangeLabel =
    view === "week"
      ? `${formatDate(columns[0], { month: "short", day: "numeric" })} – ${formatDate(columns[4], { month: "short", day: "numeric" })}`
      : view === "day"
        ? formatDate(anchor, { weekday: "long", month: "long", day: "numeric" })
        : `${monthDates.length / 7} weeks`

  const minutesAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const raw = DAY_START + ((event.clientY - rect.top) / HOUR_PX) * 60
    const clamped = Math.min(DAY_END - SNAP, Math.max(DAY_START, raw))
    return Math.floor(clamped / SNAP) * SNAP
  }

  const rangeFor = (a: number, b: number) => {
    let start = Math.min(a, b)
    let end = Math.max(a, b) + SNAP
    if (end - start < duration) end = start + duration
    if (end > DAY_END) {
      end = DAY_END
      start = Math.min(start, Math.max(DAY_START, end - duration))
    }
    return { start, end }
  }

  const removeBlock = async (id: string) => {
    // Find the block to determine if it's availability or override
    const blockToRemove = blocks.find(b => b.id === id)
    if (!blockToRemove) return
    if (!await confirmAction(blockToRemove.date ? "Delete this time slot?" : "Delete this recurring time slot for every week?")) return

    try {
      // Determine if it's an availability or override based on whether it has a date
      if (blockToRemove.date) {
        // It's a schedule override
        await facultyScheduleOverridesApi.delete(id)
      } else {
        // It's a faculty availability
        await facultyAvailabilityApi.delete(id)
      }

      // Remove from local state
      setBlocks((current) => current.filter((b) => b.id !== id))
      setSelection((s) => (s?.type === "block" && s.id === id ? null : s))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete block")
      // Optionally revert the local state change on error
    }
  }

  const selectNew = (iso: string, start: number, end: number) =>
    setSelection({
      type: "new",
      iso,
      start,
      end,
      kind: "available",
      repeat: mode === "weekly",
    })

  const newConflict =
    selection?.type === "new" &&
    overlapsBlock(selection.iso, selection.start, selection.end)

  const createBlock = async () => {
    if (selection?.type !== "new" || newConflict) return
    if (!await confirmAction(`Save this ${selection.repeat ? "weekly recurring" : "one-time"} ${selection.kind} schedule on ${selection.iso}, ${timeRange(selection.start, selection.end)}?`)) return
    const date = fromIso(selection.iso)

    try {
      if (!facultyId) {
        throw new Error("Unable to determine the signed-in faculty account.")
      }

      let createdId: string

      // Determine if it's a recurring availability or a date-specific override
      if (selection.repeat) {
        // Create recurring faculty availability
        const availabilityData = await facultyAvailabilityApi.create({
          faculty_id: facultyId,
          weekday: date.getDay(),
          start_minutes: selection.start,
          end_minutes: selection.end,
          location: location,
          active: selection.kind === "available"
        })
        createdId = availabilityData.id
      } else {
        // Create date-specific schedule override
        const overrideData = await facultyScheduleOverridesApi.create({
          faculty_id: facultyId,
          date: selection.iso,
          kind: selection.kind,
          start_minutes: selection.kind === "available" ? selection.start : undefined,
          end_minutes: selection.kind === "available" ? selection.end : undefined,
          location: selection.kind === "available" ? location : undefined,
          reason: selection.kind === "blocked" ? "Blocked time" : undefined
        })
        createdId = overrideData.id
      }

      // Add to local state with the real ID from the API
      const createdBlock: AvailabilityBlock = {
        id: createdId,
        kind: selection.kind,
        start: selection.start,
        end: selection.end,
        ...(selection.repeat ? { weekday: date.getDay() } : { date: selection.iso }),
      }
      setBlocks((current) => [...current, createdBlock])
      setSelection({ type: "block", id: createdId, iso: selection.iso })
    } catch (err) {
      setError(errorMessage(err, "Failed to create block"))
    }
  }

  // Calculate weekly slots and override count from API data for accuracy
  const weeklySlots = facultyAvailability
    .filter(avail => avail.active)
    .reduce((sum, avail) => sum + Math.floor((avail.end_minutes - avail.start_minutes) / duration), 0)
  const overrideCount = facultyOverrides.length

  const gridCols = {
    gridTemplateColumns: `52px repeat(${columns.length}, minmax(0, 1fr))`,
  }
  const monthTitle = formatDate(view === "week" ? columns[2] : anchor, {
    month: "long",
    year: "numeric",
  })
  const LocationIcon = /^https?:\/\//i.test(location) ? Link2 : MapPin

  const selectedAppt =
    selection?.type === "appt"
      ? (myAppts.find((a) => a.id === selection.id) ?? null)
      : null
  const selectedBlock =
    selection?.type === "block"
      ? (blocks.find((b) => b.id === selection.id) ?? null)
      : null

  const renderColumn = (date: Date, index: number) => {
    const iso = toIso(date)
    const preview =
      drag && drag.iso === iso
        ? rangeFor(drag.anchor, drag.current)
        : selection?.type === "new" && selection.iso === iso
          ? { start: selection.start, end: selection.end }
          : null

    return (
      <div
        key={iso}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          const minute = minutesAt(event)
          setDrag({ iso, anchor: minute, current: minute })
        }}
        onPointerMove={(event) => {
          if (!drag || drag.iso !== iso) return
          const minute = minutesAt(event)
          if (minute !== drag.current) setDrag({ ...drag, current: minute })
        }}
        onPointerUp={(event) => {
          if (!drag || drag.iso !== iso) return
          const range = rangeFor(drag.anchor, minutesAt(event))
          setDrag(null)
          selectNew(iso, range.start, range.end)
        }}
        onPointerCancel={() => setDrag(null)}
        style={{ height: GRID_HEIGHT }}
        className={`relative cursor-cell select-none border-b border-l border-slate-200 ${
          iso === todayIso ? "bg-purple-50/30" : "bg-white"
        } ${index === columns.length - 1 ? "border-r" : ""}`}
      >
        {hourLabels.slice(0, -1).map((hour, i) => (
          <div key={hour} className="pointer-events-none">
            {i > 0 && (
              <div
                style={{ top: i * HOUR_PX }}
                className="absolute inset-x-0 border-t border-[#E2E8F0]"
              />
            )}
            <div
              style={{ top: i * HOUR_PX + HOUR_PX / 2 }}
              className="absolute inset-x-0 border-t border-[#F1F5F9]"
            />
          </div>
        ))}

        {itemsFor(date)
          .filter((b) => (b.kind === "available" ? filters.slots : filters.blocked))
          .map((block) => {
          const height = ((block.end - block.start) / 60) * HOUR_PX - 2
          const top = ((block.start - DAY_START) / 60) * HOUR_PX + 1
          const compact = height < 40
          const isSelected =
            selection?.type === "block" &&
            selection.id === block.id &&
            selection.iso === iso
          const blockLocation = block.dayLocations?.[iso] ?? location
          const available = block.kind === "available"
          const actionClass = `flex size-5 cursor-pointer items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 ${
            available
              ? "bg-purple-800/80 text-white hover:bg-purple-900 focus-visible:ring-white"
              : "bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-900 focus-visible:ring-purple-600"
          }`
          return (
            <div
              key={block.id}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setSelection({ type: "block", id: block.id, iso })}
              style={{ top, height }}
              className={`group absolute inset-x-1 cursor-pointer overflow-hidden rounded-xl px-2 py-1 transition ${
                available
                  ? "bg-purple-600 text-white ring-1 ring-inset ring-purple-700/50 hover:bg-purple-700"
                  : "striped-block border border-slate-200 text-slate-500"
              } ${isSelected ? "outline-2 outline-offset-1 outline-purple-500" : ""}`}
            >
              <p
                className={`text-[11px] leading-4 ${available ? "font-semibold" : "font-medium"} ${
                  compact ? "truncate" : "pr-6"
                }`}
              >
                {available ? "Available for Consultation" : "Blocked / Class Hours"}
              </p>
              {!compact && (
                <p
                  className={`mt-0.5 flex items-center gap-1 text-[11px] tabular-nums ${available ? "text-purple-100" : "text-slate-400"}`}
                >
                  {!block.date && <Repeat size={10} />}
                  {timeRange(block.start, block.end)}
                </p>
              )}
              {available && height >= 76 && (
                <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-purple-100">
                  <LocationIcon size={11} className="shrink-0" />
                  <span className="truncate">{blockLocation}</span>
                </p>
              )}
              <div className="pointer-events-none absolute inset-1 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                <ButtonTag
                  type="button"
                  aria-label="Edit block"
                  title="Edit"
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelection({ type: "block", id: block.id, iso })
                  }}
                  className={`${actionClass} pointer-events-auto absolute bottom-0 right-0 ${compact ? "hidden" : ""}`}
                >
                  <Pencil size={11} />
                </ButtonTag>
                <ButtonTag
                  type="button"
                  aria-label="Delete block"
                  title={block.date ? "Delete" : "Delete (repeats weekly)"}
                  onClick={(event) => {
                    event.stopPropagation()
                    removeBlock(block.id)
                  }}
                  className={`${actionClass} pointer-events-auto absolute right-0 top-0`}
                >
                  <X size={12} />
                </ButtonTag>
              </div>
            </div>
          )
        })}

        {apptsFor(iso)
          .filter((a) =>
            a.status === "pending"
              ? filters.pending
              : a.status === "confirmed"
                ? filters.approved
                : filters.cancelled,
          )
          .map((appt) => {
          const height = ((appt.end - appt.start) / 60) * HOUR_PX - 2
          const top = ((appt.start - DAY_START) / 60) * HOUR_PX + 1
          const compact = height < 40
          const tone =
            appt.status === "confirmed"
              ? "bg-[#10B981] text-white ring-emerald-700/30 hover:bg-emerald-600"
              : appt.status === "pending"
                ? "bg-[#F59E0B] text-amber-950 ring-amber-700/40 hover:bg-amber-500"
                : "striped-block text-slate-500 ring-slate-200"
          const isSelected = selection?.type === "appt" && selection.id === appt.id
          return (
            <ButtonTag
              key={appt.id}
              type="button"
              aria-label={`${statusLabel[appt.status]}: ${appt.student}, ${timeRange(appt.start, appt.end)}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setSelection({ type: "appt", id: appt.id })}
              style={{ top, height }}
              className={`inject-in absolute left-2 right-1 z-10 cursor-pointer overflow-hidden rounded-xl px-2 py-1 text-left ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700 ${tone} ${
                isSelected ? "outline-2 outline-offset-1 outline-purple-600" : ""
              }`}
            >
              {appt.status === "cancelled" ? (
                <>
                  <p className="truncate text-[11px] font-medium leading-4">
                    Unavailable
                  </p>
                  {!compact && (
                    <p className="truncate text-[11px] text-slate-400 line-through">
                      {appt.student}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="flex items-center gap-1 truncate text-[11px] font-semibold leading-4">
                    {appt.status === "pending" && (
                      <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-amber-950/70" />
                    )}
                    <span className="truncate">Consultation: {appt.student}</span>
                  </p>
                  {!compact && (
                    <p className="truncate text-[11px] opacity-90">{appt.topic}</p>
                  )}
                  {height >= 70 && (
                    <p className="mt-0.5 truncate text-[11px] tabular-nums opacity-80">
                      {timeRange(appt.start, appt.end)}
                      {appt.status === "pending" ? " · Needs review" : ""}
                    </p>
                  )}
                </>
              )}
            </ButtonTag>
          )
        })}

        {preview && (
          <div
            style={{
              top: ((preview.start - DAY_START) / 60) * HOUR_PX + 1,
              height: ((preview.end - preview.start) / 60) * HOUR_PX - 2,
            }}
            className="pointer-events-none absolute inset-x-1 z-20 overflow-hidden rounded-xl border-2 border-dashed border-purple-600 bg-purple-600/10 px-2 py-1"
          >
            <p className="text-[11px] font-semibold tabular-nums text-purple-700">
              {timeRange(preview.start, preview.end)}
            </p>
          </div>
        )}
      </div>
    )
  }

  const close = () => { setError(null); setSelection(null) }
  const rulesPanel = (
    <PanelFrame
      eyebrow="Defaults"
      title="Availability Rules"
      subtitle="Applied to every new block"
      onClose={close}
    >
      <p className="text-xs leading-5 text-slate-500">
        Select any block, request, or open time on the calendar to see its
        details here.
      </p>
      <div>
        <span className={pillLabel}>Availability type</span>
        <Segmented<RuleMode>
          value={mode}
          onChange={setMode}
          className="rounded-full"
          options={[
            { value: "weekly", label: "Fixed Weekly" },
            { value: "overrides", label: "Date Overrides" },
          ]}
        />
      </div>
      <label className="block">
        <span className={pillLabel}>Time zone</span>
        <div className="relative">
          <Globe
            size={15}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <SelectTag
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className={`${pillField} cursor-pointer pl-10`}
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zoneLabel(zone)}
              </option>
            ))}
          </SelectTag>
        </div>
      </label>
      <label className="block">
        <span className={pillLabel}>Slot duration</span>
        <div className="relative">
          <Timer
            size={15}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <SelectTag
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            className={`${pillField} cursor-pointer pl-10`}
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>1 hour</option>
          </SelectTag>
        </div>
      </label>
      <label className="block">
        <span className={pillLabel}>Default location</span>
        <div className="relative">
          <LocationIcon
            size={15}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <InputTag
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Room number or meeting link"
            className={`${pillField} pl-10`}
          />
        </div>
      </label>
      <Button
        onClick={async () => {
          if (!await confirmAction("Apply these availability defaults for new time slots?")) return
          setSaved(true)
          window.setTimeout(() => setSaved(false), 2000)
        }}
        className="w-full gap-2 rounded-[4px] border border-purple-700 bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
      >
        {saved ? (
          <>
            <Check size={15} /> Rules saved
          </>
        ) : (
          "Save availability rules"
        )}
      </Button>
    </PanelFrame>
  )

  let sidebar: ReactNode = selection?.type === "rules" ? rulesPanel : null
  if (selectedAppt) {
    sidebar = (
      <AppointmentPanel
        key={`appt-${selectedAppt.id}`}
        appointment={selectedAppt}
        onClose={close}
        onUpdate={async (patch) => {
          await applyAppointmentPatch(selectedAppt, patch)
          updateAppointments((current) =>
            current.map((a) => (a.id === selectedAppt.id ? { ...a, ...patch } : a)),
          )
        }}
        hasClash={(iso, start, end) =>
          myAppts.some(
            (a) =>
              a.id !== selectedAppt.id &&
              a.status !== "cancelled" &&
              a.date === iso &&
              a.start < end &&
              start < a.end,
          )
        }
      />
    )
  } else if (selectedBlock && selection?.type === "block") {
    const iso = selection.iso
    sidebar = (
      <BlockPanel
        key={`block-${selectedBlock.id}-${iso}`}
        block={selectedBlock}
        iso={iso}
        duration={duration}
        defaultLocation={location}
        onClose={close}
        onDelete={() => removeBlock(selectedBlock.id)}
        onSave={async (patch) => {
          const changes = { start_minutes: patch.start ?? selectedBlock.start, end_minutes: patch.end ?? selectedBlock.end }
          if (selectedBlock.date) {
            await facultyScheduleOverridesApi.update(selectedBlock.id, changes)
          } else {
            await facultyAvailabilityApi.update(selectedBlock.id, changes)
          }
          setBlocks((current) =>
            current.map((b) => (b.id === selectedBlock.id ? { ...b, ...patch } : b)),
          )
        }}
        overlaps={(start, end) => overlapsBlock(iso, start, end, selectedBlock.id)}
      />
    )
  } else if (selection?.type === "new") {
    const s = selection
    const date = fromIso(s.iso)
    const patch = (p: Partial<typeof s>) => { setError(null); setSelection({ ...s, ...p }) }
    sidebar = (
      <PanelFrame
        key={`new-${s.iso}`}
        eyebrow="Open time"
        title="New time block"
        subtitle={formatDate(date, { weekday: "long", month: "long", day: "numeric" })}
        onClose={close}
      >
        <label className="block">
          <span className={pillLabel}>Date</span>
          <InputTag
            type="date"
            value={s.iso}
            onChange={(e) => e.target.value && patch({ iso: e.target.value })}
            className={pillField}
          />
        </label>
        <TimeSelects
          start={s.start}
          end={s.end}
          onChange={(range) => patch(range)}
        />
        <label className="block">
          <span className={pillLabel}>Block type</span>
          <SelectTag
            value={s.kind}
            onChange={(e) => patch({ kind: e.target.value as SlotKind })}
            className={`${pillField} cursor-pointer`}
          >
            <option value="available">Set Custom Availability Block</option>
            <option value="blocked">Mark as Blocked / Class Hours</option>
          </SelectTag>
        </label>
        <label className="block">
          <span className={pillLabel}>Recurrence</span>
          <SelectTag
            value={s.repeat ? "weekly" : "once"}
            onChange={(e) => patch({ repeat: e.target.value === "weekly" })}
            className={`${pillField} cursor-pointer`}
          >
            <option value="weekly">Every {WEEKDAYS[date.getDay()]}</option>
            <option value="once">
              Only on {formatDate(date, { month: "short", day: "numeric" })}
            </option>
          </SelectTag>
        </label>
        <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
          {s.kind === "available"
            ? `${Math.floor((s.end - s.start) / duration)} × ${duration}-minute slots${location ? ` · ${location}` : ""}`
            : "Students cannot request appointments during this time."}
        </p>
        <ConflictNote show={!!newConflict} text="This range overlaps an existing block." />
        <div className="flex gap-2 border-t border-slate-100 pt-5">
          <Button
            onClick={close}
            className="rounded-[4px] border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Discard
          </Button>
          <Button
            onClick={createBlock}
            disabled={!!newConflict}
            className="flex-1 gap-2 rounded-[4px] border border-purple-700 bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
          >
            {s.kind === "available" ? "Confirm Time Slot" : "Save Range"}
          </Button>
        </div>
      </PanelFrame>
    )
  }

  const miniStart = startOfWeek(miniMonth)
  const miniWeeks = Math.ceil(
    (((miniMonth.getDay() + 6) % 7) +
      new Date(miniMonth.getFullYear(), miniMonth.getMonth() + 1, 0).getDate()) /
      7,
  )
  const miniDays = Array.from({ length: miniWeeks * 7 }, (_, i) => addDays(miniStart, i))
  const anchorIso = toIso(anchor)
  const visibleIsos = new Set(
    view === "month" ? [] : columns.map((d) => toIso(d)),
  )
  const filterRows: {
    key: keyof typeof filters
    label: string
    swatch: string
    count: number
  }[] = [
    { key: "slots", label: "My Consultation Slots", swatch: "bg-purple-600", count: blocks.filter((b) => b.kind === "available").length },
    { key: "blocked", label: "Blocked / Class Hours", swatch: "striped-block border border-slate-300", count: blocks.filter((b) => b.kind === "blocked").length },
    { key: "pending", label: "Pending Student Requests", swatch: "bg-[#F59E0B]", count: pendingCount },
    { key: "approved", label: "Approved Appointments", swatch: "bg-[#10B981]", count: myAppts.filter((a) => a.status === "confirmed").length },
    { key: "cancelled", label: "Cancelled / Unavailable", swatch: "bg-slate-300", count: myAppts.filter((a) => a.status === "cancelled").length },
  ]
  const createSlot = () => {
    let day = anchor
    while (day.getDay() === 0 || day.getDay() === 6) day = addDays(day, 1)
    if (view === "month") setView("week")
    setAnchor(day)
    selectNew(toIso(day), 540, 540 + Math.max(duration, 60))
  }
  const panelOpen = sidebar !== null

  return (
    <div>
      <PageTitle
        eyebrow="Schedule"
        title="Set Consultation Availability"
        description="Create slots, review student requests, and manage class hours. Select anything on the calendar to open its action panel."
      />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,4fr)]">
        <aside className="space-y-5 lg:sticky lg:top-6">
          <Button
            onClick={createSlot}
            className="w-full gap-2 rounded-full bg-purple-600 py-3 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(147,51,234,0.3)] hover:bg-purple-700"
          >
            <Plus size={17} strokeWidth={2.4} /> Create Slot
          </Button>

          <section className={`rounded-2xl bg-white p-4 ${cardShadow}`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                {formatDate(miniMonth, { month: "long", year: "numeric" })}
              </p>
              <div className="flex">
                {([-1, 1] as const).map((dir) => (
                  <ButtonTag
                    key={dir}
                    type="button"
                    aria-label={dir < 0 ? "Previous month" : "Next month"}
                    onClick={() =>
                      setMiniMonth(
                        new Date(miniMonth.getFullYear(), miniMonth.getMonth() + dir, 1),
                      )
                    }
                    className="flex size-7 cursor-pointer items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600"
                  >
                    {dir < 0 ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
                  </ButtonTag>
                ))}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-7 text-center">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span key={i} className="pb-1.5 text-[10px] font-semibold text-slate-400">
                  {d}
                </span>
              ))}
              {miniDays.map((d) => {
                const iso = toIso(d)
                const inMonth = d.getMonth() === miniMonth.getMonth()
                const isToday = iso === todayIso
                const isSelected = iso === anchorIso
                const inRange = visibleIsos.has(iso)
                const hasAppt = apptsFor(iso).some((a) => a.status !== "cancelled")
                return (
                  <ButtonTag
                    key={iso}
                    type="button"
                    aria-label={formatDate(d, { weekday: "long", month: "long", day: "numeric" })}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setAnchor(d)
                      if (!inMonth) setMiniMonth(new Date(d.getFullYear(), d.getMonth(), 1))
                    }}
                    className={`relative flex h-8 cursor-pointer items-center justify-center text-xs tabular-nums transition focus-visible:outline-none ${
                      inRange ? "bg-purple-50/70" : ""
                    }`}
                  >
                    <span
                      className={`flex size-7 items-center justify-center rounded-full transition ${
                        isToday
                          ? "bg-purple-600 font-semibold text-white"
                          : isSelected
                            ? "bg-purple-100 font-semibold text-purple-700 ring-1 ring-purple-300"
                            : inMonth
                              ? "text-slate-700 hover:bg-slate-100"
                              : "text-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    {hasAppt && (
                      <span className="absolute bottom-0.5 size-1 rounded-full bg-[#F59E0B]" />
                    )}
                  </ButtonTag>
                )
              })}
            </div>
          </section>

          <section className={`rounded-2xl bg-white p-4 ${cardShadow}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Show on calendar
            </p>
            <div className="mt-3 space-y-1">
              {filterRows.map((row) => (
                <label
                  key={row.key}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50"
                >
                  <InputTag
                    type="checkbox"
                    checked={filters[row.key]}
                    onChange={(e) => setFilters({ ...filters, [row.key]: e.target.checked })}
                    className="peer sr-only"
                  />
                  <span className="flex size-[18px] shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-white transition peer-checked:border-purple-600 peer-checked:bg-purple-600 peer-focus-visible:ring-2 peer-focus-visible:ring-purple-500 peer-focus-visible:ring-offset-1">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <span className={`size-2.5 shrink-0 rounded-full ${row.swatch}`} />
                  <span className="min-w-0 flex-1 text-xs font-medium leading-4 text-slate-700">
                    {row.label}
                  </span>
                  <span className="text-[11px] tabular-nums text-slate-400">{row.count}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-base font-bold tabular-nums">{weeklySlots}</p>
                <p className="text-[10px] text-slate-500">Slots / week</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-base font-bold tabular-nums">{overrideCount}</p>
                <p className="text-[10px] text-slate-500">Overrides</p>
              </div>
            </div>
          </section>
        </aside>

        <div className="flex min-w-0 flex-col items-start lg:flex-row">
        <section className={`min-w-0 flex-1 rounded-2xl bg-white ${cardShadow}`}>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5">
            <div className="flex items-center gap-4">
              <div className="flex gap-1">
                {([-1, 1] as const).map((dir) => (
                  <ButtonTag
                    key={dir}
                    type="button"
                    aria-label={dir < 0 ? "Previous" : "Next"}
                    onClick={() => shift(dir)}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600"
                  >
                    {dir < 0 ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                  </ButtonTag>
                ))}
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {monthTitle}
                </h2>
                <p className="text-xs text-slate-500">{rangeLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() =>
                  setSelection(selection?.type === "rules" ? null : { type: "rules" })
                }
                title="Availability rules"
                className={`gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium ${
                  selection?.type === "rules"
                    ? "border-purple-200 bg-purple-50 text-purple-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Globe size={13} /> Rules
              </Button>
              <Button
                onClick={() => {
                  setAnchor(new Date())
                  setMiniMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
                }}
                className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Today
              </Button>
              <Segmented<CalendarView>
                value={view}
                onChange={setView}
                className="w-52"
                options={[
                  { value: "day", label: "Day" },
                  { value: "week", label: "Week" },
                  { value: "month", label: "Month" },
                ]}
              />
            </div>
          </div>

          {view === "month" ? (
            <div className="overflow-x-auto p-5">
              <div className="min-w-[600px]">
                <div className="grid grid-cols-7 border-l border-t border-slate-200">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => (
                    <div
                      key={name}
                      className="border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {name}
                    </div>
                  ))}
                  {monthDates.map((date) => {
                    const iso = toIso(date)
                    const items = itemsFor(date)
                    const open = items.filter((i) => i.kind === "available")
                    const hasBlocked = items.some((i) => i.kind === "blocked")
                    const inMonth = date.getMonth() === anchor.getMonth()
                    const today = iso === todayIso
                    const picked =
                      selection?.type === "new" && selection.iso === iso
                    return (
                      <ButtonTag
                        key={iso}
                        type="button"
                        onClick={() => selectNew(iso, 540, 540 + Math.max(duration, 60))}
                        className={`min-h-28 cursor-pointer border-b border-r border-slate-200 p-2 text-left align-top transition-colors hover:bg-purple-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-600 ${
                          picked ? "bg-purple-50/60" : inMonth ? "bg-white" : "bg-[#F8FAFC]"
                        }`}
                      >
                        <div className="flex min-h-24 flex-col items-start">
                          <span
                            className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-medium ${
                              today
                                ? "bg-purple-600 text-white"
                                : inMonth
                                  ? "text-slate-700"
                                  : "text-slate-400"
                            }`}
                          >
                            {date.getDate()}
                          </span>
                          <div className="mt-1.5 w-full space-y-1">
                            {open.slice(0, 1).map((item) => (
                              <div
                                key={item.id}
                                className="truncate rounded-full bg-purple-600 px-2 py-0.5 text-[11px] font-medium text-white"
                              >
                                {clock(item.start)}
                              </div>
                            ))}
                            {apptsFor(iso)
                              .filter((a) => a.status !== "cancelled")
                              .slice(0, 2)
                              .map((a) => (
                                <span
                                  key={a.id}
                                  role="link"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setSelection({ type: "appt", id: a.id })
                                  }}
                                  className={`block truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    a.status === "confirmed"
                                      ? "bg-[#10B981] text-white"
                                      : "bg-[#F59E0B] text-amber-950"
                                  }`}
                                >
                                  {clock(a.start)} {a.student.split(" ")[0]}
                                </span>
                              ))}
                            {hasBlocked && (
                              <div className="striped-block truncate rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
                                Class Hours
                              </div>
                            )}
                          </div>
                        </div>
                      </ButtonTag>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className={view === "week" ? "min-w-[620px]" : "min-w-[340px]"}>
                <div style={gridCols} className="grid border-b border-slate-200 bg-white">
                  <div />
                  {columns.map((date) => {
                    const today = toIso(date) === todayIso
                    return (
                      <div
                        key={toIso(date)}
                        className="flex items-center justify-center gap-2 py-3"
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          {formatDate(date, { weekday: "short" })}
                        </span>
                        <span
                          className={`inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold ${
                            today ? "bg-purple-600 text-white" : "text-slate-900"
                          }`}
                        >
                          {date.getDate()}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div style={gridCols} className="grid pb-5 pt-4">
                  <div className="relative" style={{ height: GRID_HEIGHT }}>
                    {hourLabels.map((hour, i) => (
                      <span
                        key={hour}
                        style={{ top: i * HOUR_PX }}
                        className="absolute right-2.5 -translate-y-1/2 text-[11px] tabular-nums text-slate-400"
                      >
                        {clock(hour * 60).replace(":00", "")}
                      </span>
                    ))}
                  </div>
                  {columns.map(renderColumn)}
                </div>
              </div>
            </div>
          )}
        </section>

          <div
            aria-live="polite"
            className={`w-full min-w-0 transition-[width,margin,opacity] duration-300 ease-out lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:overflow-x-hidden lg:rounded-2xl ${
              panelOpen
                ? "mt-6 opacity-100 lg:ml-6 lg:mt-0 lg:w-[30%] lg:shrink-0"
                : "pointer-events-none hidden opacity-0 lg:block lg:w-0"
            }`}
          >
            <div className="lg:min-w-[280px]"><CalendarErrorContext.Provider value={error}>{sidebar}</CalendarErrorContext.Provider></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FacultyRecordsView() {
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

function FacultyPortal({
  onSignOut,
  onOpenAccount,
}: {
  onSignOut: () => void
  onOpenAccount: () => void
}) {
  const [drilldown, setDrilldown] = useState<string | null>(null)
  const currentUser = useContext(CurrentUserContext)
  const [view, setView] = useState("Today's Schedule")
  const [appointments] = useAppointments()
  const name = fullName(currentUser?.first_name, currentUser?.last_name, currentUser?.email ?? "Faculty")
  const facultyNumber = currentUser?.faculty_number
  const today = toIso(new Date())
  const todayCount = appointments.filter((a) => a.date === today && a.status !== "cancelled").length
  const pendingCount = appointments.filter((a) => ["pending", "reschedule_requested"].includes(a.status)).length
  const completedCount = appointments.filter((a) => a.status === "completed").length
  const nav = [
    { label: "Today's Schedule", icon: Clock3 },
    { label: "Set Availability", icon: CalendarDays },
    { label: "Student Records", icon: NotebookPen },
  ]
  return (
    <PortalShell
      role="Faculty"
      stats={[
        { label: "Today", value: String(todayCount), hint: "Consultations scheduled", icon: Clock3, onClick: () => setDrilldown("Today") },
        { label: "Pending Requests", value: String(pendingCount), hint: "Needs your review", icon: UsersRound, onClick: () => setDrilldown("Pending Requests") },
        { label: "Completed", value: String(completedCount), hint: "Consultations held", icon: Check, onClick: () => setDrilldown("Completed") },
        { label: "Total", value: String(appointments.length), hint: "All requests", icon: NotebookPen, onClick: () => setDrilldown("Total") },
      ]}
      name={name}
      detail={facultyNumber ? `Faculty ID: ${facultyNumber}` : currentUser?.email ?? ""}
      navItems={nav}
      active={view}
      onNavigate={(next) => { setView(next); setDrilldown(null) }}
      onOpenAccount={onOpenAccount}
      onSignOut={onSignOut}
    >
      {drilldown && <><AppointmentListView key={drilldown} filter={drilldown} /><Button onClick={() => { setDrilldown(null); setView("Set Availability") }} className="mt-5 text-purple-700 underline">Manage requests in calendar</Button></>}
      {!drilldown && view === "Today's Schedule" && <FacultyTodayView />}
      {!drilldown && view === "Set Availability" && <FacultyAvailabilityView />}
      {!drilldown && view === "Student Records" && <FacultyRecordsView />}
    </PortalShell>
  )
}

async function applyAppointmentPatch(
  appointment: UiAppointment,
  patch: Partial<UiAppointment>,
) {
  if (patch.status === "completed") {
    mergeAppointment(await appointmentApi.complete(appointment.id))
    return
  }
  if (patch.status === "confirmed" && ["pending", "reschedule_requested"].includes(appointment.status)) {
    mergeAppointment(await appointmentApi.approve(appointment.id))
    return
  }
  if (patch.status === "cancelled") {
    mergeAppointment(
      await appointmentApi.cancel(appointment.id, "Cancelled by faculty"),
    )
    return
  }
  if (
    patch.date !== undefined ||
    patch.start !== undefined ||
    patch.end !== undefined
  ) {
    mergeAppointment(
      await appointmentApi.reschedule(appointment.id, {
        appointment_date: patch.date ?? appointment.date,
        start_minutes: patch.start ?? appointment.start,
        end_minutes: patch.end ?? appointment.end,
        reason: "Rescheduled by faculty",
      }),
    )
    return
  }
  if (patch.summary !== undefined || patch.notes !== undefined) {
    await consultationApi.create({
      appointment_id: appointment.id,
      faculty_id: appointment.faculty_id,
      student_id: appointment.student_id,
      private_notes: patch.notes,
      summary: patch.summary?.trim() ?? "",
    })
    writeAppts(
      readAppts().map((row) =>
        row.id === appointment.id ? { ...row, notes: patch.notes ?? "" } : row,
      ),
    )
  }
}

const roleLabel = (roleId: string): Role => {
  if (roleId === "faculty") return "Faculty"
  if (roleId === "admin") return "Admin"
  return "Student"
}

function AdminUsersView({ roleFilter }: { roleFilter?: string }) {
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

  const loadUsers = async (q?: string) => {
    setLoading(true)
    setError(null)
    try {
      const rows = await usersApi.list({ q, role_id: roleFilter })
      setUsers(rows)
    } catch (err) {
      setError(errorMessage(err, "Failed to load users"))
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  const deleteAccount = async (id: string) => {
    if (!await confirmAction("Delete this account? The account will lose access; appointment history will be preserved.")) return
    try {
      await usersApi.delete(id)
      setUsers((current) => current.filter((u) => u.id !== id))
      window.dispatchEvent(new Event("fcams:users-changed"))
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

  const createAccount = async () => {
    const fields: Record<string, string> = {}
    if (!form.first_name.trim()) fields.first_name = "Enter a first name."
    if (!form.last_name.trim()) fields.last_name = "Enter a last name."
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) fields.email = "Enter a valid email address."
    if (!isStrongPassword(form.password)) fields.password = passwordPolicyMessage
    const prefix = createType === "Faculty" ? "FAC" : "STU"
    if (form.id_number && !new RegExp(`^${prefix}-\\d{4,}$`).test(form.id_number.toUpperCase())) fields.id_number = `Use ${prefix}- followed by at least four digits.`
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
        faculty_number: createType === "Faculty" ? form.id_number || undefined : undefined,
        student_number: createType === "Student" ? form.id_number || undefined : undefined,
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
      window.dispatchEvent(new Event("fcams:users-changed"))
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
      <div className="mt-8 overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Master User List</p>
            <p className="mt-1 text-xs text-slate-500">
              {loading ? "Loading…" : `${users.length} registered accounts`}
            </p>
          </div>
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault()
              void loadUsers(search.trim() || undefined)
            }}
          >
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <InputTag
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15 sm:w-56"
            />
          </form>
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
              <p className="px-6 py-8 text-sm text-slate-500">No accounts found.</p>
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
              <InputTag aria-label="id number" aria-invalid={!!createErrors.id_number} aria-describedby="create-id_number-error"
                placeholder={createType === "Faculty" ? "FAC-0111 (blank to generate)" : "STU-0124 (blank to generate)"}
                value={form.id_number}
                onChange={(e) => { setForm((f) => ({ ...f, id_number: e.target.value })); setCreateErrors((f) => ({ ...f, id_number: "" })) } }
                className={fieldClass}
              />
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

function AdminReportsView() {
  const [monthlyData, setMonthlyData] = useState<Array<{ month: string; value: number }>>([])
  const [stats, setStats] = useState<{
    totalAppointments: number;
    pendingRequests: number;
    activeFaculty: number;
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchReportsData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [summaryData, faculty, monthly] = await Promise.all([
          reportsApi.summary(),
          facultyApi.list(),
          reportsApi.monthly(6),
        ])
        const statistics = summaryData?.statistics ?? {}

        setStats({
          totalAppointments: Number(statistics.total_appointments ?? 0),
          pendingRequests: Number(statistics.pending_appointments ?? 0),
          activeFaculty: faculty.length,
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
        setError(errorMessage(err, "Failed to load reports data"))
        setStats(null)
        setMonthlyData([])
      } finally {
        setLoading(false)
      }
    }

    void fetchReportsData()
  }, [])

  return (
    <div>
      {loading && (
        <div className="text-center py-8">
          <p className="text-sm text-slate-500">Loading reports data...</p>
        </div>
      )}
      {error && (
        <div className="text-center py-8">
          <p className="text-sm text-rose-500">{error}</p>
        </div>
      )}
      <PageTitle
        eyebrow="Reports"
        title="System Analytics"
        description="A concise university-wide view of appointment activity and consultation demand."
      />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
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
                This month
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
                Across all departments
              </p>
            </div>
            <div
              key="activeFaculty"
              className="rounded-2xl bg-white p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
            >
              <UsersRound size={19} className="text-slate-500" />
              <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">
                {stats.activeFaculty}
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
          <p className="text-sm text-slate-500">{loading ? "Loading statistics..." : "Statistics unavailable. Please retry."}</p>
        )}
      </div>
      <div className="mt-6 rounded-2xl bg-white p-6 border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-900">
              Monthly Consultation Statistics
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Completed appointments during the last six months
            </p>
          </div>

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
            <p className="w-full self-center text-center text-sm text-slate-400">
              {loading ? "Loading chart…" : "No monthly consultation data yet."}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function AdminPortal({
  onSignOut,
  onOpenAccount,
}: {
  onSignOut: () => void
  onOpenAccount: () => void
}) {
  const [drilldown, setDrilldown] = useState<string | null>(null)
  const currentUser = useContext(CurrentUserContext)
  const [view, setView] = useState("User Management")
  const [counts, setCounts] = useState<{ users: number; faculty: number; appointments: number; completion: number } | null>(null)
  const name = fullName(currentUser?.first_name, currentUser?.last_name, currentUser?.email ?? "Administrator")
  const nav = [
    { label: "User Management", icon: UserCog },
    { label: "System Analytics", icon: BarChart3 },
  ]

  useEffect(() => {
    const loadCounts = async () => {
      try {
        const [all, faculty, appointments] = await Promise.all([
          usersApi.list(), usersApi.list({ role_id: "faculty" }), appointmentApi.list(),
        ])
        setCounts({ users: all.length, faculty: faculty.length, appointments: appointments.length,
          completion: appointments.length ? Math.round(100 * appointments.filter((a) => a.status === "completed").length / appointments.length) : 0 })
      } catch (err) {
        console.error("Unable to load admin counts.", err)
      }
    }
    void loadCounts()
    window.addEventListener("fcams:users-changed", loadCounts)
    return () => window.removeEventListener("fcams:users-changed", loadCounts)
  }, [])

  return (
    <PortalShell
      role="Admin"
      stats={[
        { label: "Total Users", value: counts ? String(counts.users) : "—", hint: "Registered accounts", icon: UsersRound, onClick: () => setDrilldown("Total Users") },
        { label: "Faculty", value: counts ? String(counts.faculty) : "—", hint: "Faculty accounts", icon: GraduationCap, onClick: () => setDrilldown("Faculty") },
        { label: "Appointments", value: counts ? String(counts.appointments) : "—", hint: "All appointments", icon: CalendarDays, onClick: () => setDrilldown("Appointments") },
        { label: "Completion Rate", value: counts ? `${counts.completion}%` : "—", hint: "Completed / all appointments", icon: BarChart3, onClick: () => setDrilldown("Completion Rate") },
      ]}
      name={name}
      detail={currentUser?.email ?? ""}
      navItems={nav}
      active={view}
      onNavigate={(next) => { setView(next); setDrilldown(null) }}
      onOpenAccount={onOpenAccount}
      onSignOut={onSignOut}
    >
      {drilldown === "Total Users" || drilldown === "Faculty" ? <AdminUsersView key={drilldown} roleFilter={drilldown === "Faculty" ? "faculty" : undefined} />
        : drilldown === "Appointments" ? <AppointmentListView />
        : drilldown === "Completion Rate" ? <AdminReportsView />
        : view === "User Management" ? <AdminUsersView /> : <AdminReportsView />}
    </PortalShell>
  )
}

function AccountSettingsDialog({
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

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)

  useEffect(() => {
    const expireSession = () => {
      setAccountOpen(false)
      setUser(null)
    }
    window.addEventListener("fcams:session-expired", expireSession)
    return () => window.removeEventListener("fcams:session-expired", expireSession)
  }, [])

  // Check authentication status on load
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const { user: currentUser } = await authApi.me()
        setUser(currentUser)
      } catch {
        // Not authenticated or error fetching user data
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    checkAuthStatus()
  }, [])

  const role = user ? roleFromId(user.role_id) : null

  const handleSignOut = async () => {
    if (!await confirmAction("Are you sure you want to sign out?")) return
    try {
      await authApi.logout()
    } catch (err) {
      console.error("Logout request failed.", err)
    }
    setAccountOpen(false)
    setUser(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            <GraduationCap size={32} className="text-purple-600" />
          </div>
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            <AlertTriangle size={32} className="text-rose-500" />
          </div>
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      </div>
    )
  }

  if (!user) return <AuthenticationGate onLogin={setUser} />

  if (!role) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-center">
        <div>
          <AlertTriangle size={32} className="mx-auto text-rose-500" />
          <p className="mt-4 text-sm text-rose-700">
            This account does not have a supported role. Contact an administrator.
          </p>
          <Button
            onClick={handleSignOut}
            className="mt-5 rounded-[4px] bg-purple-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Sign out
          </Button>
        </div>
      </main>
    )
  }

  return (
    <CurrentUserContext.Provider value={user}>
      {role === "Student" ? (
        <StudentPortal
          onSignOut={handleSignOut}
          onOpenAccount={() => setAccountOpen(true)}
        />
      ) : role === "Faculty" ? (
        <FacultyPortal
          onSignOut={handleSignOut}
          onOpenAccount={() => setAccountOpen(true)}
        />
      ) : (
        <AdminPortal
          onSignOut={handleSignOut}
          onOpenAccount={() => setAccountOpen(true)}
        />
      )}
      <AccountSettingsDialog
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        onUpdated={setUser}
      />
    </CurrentUserContext.Provider>
  )
}

function PrivacyNotice() {
  return <details className="my-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
    <summary className="cursor-pointer font-semibold">Privacy and access to your data</summary>
    <p className="mt-3">FCAMS stores account details, schedules, appointment reasons, consultation summaries, and security audit activity to manage academic consultations. Students can access their own records; assigned faculty can access their consultations; administrators can manage accounts and view shared records and reports. Private faculty notes are available only to the assigned faculty through the app. Authorized database and backup operators can still access stored data.</p>
    <p className="mt-3">Avoid including unnecessary sensitive information in appointment reasons. Contact your school administrator to request a correction, a copy of your information, or a retention/deletion review. No automatic deletion period is configured; the school must establish its retention policy before real student data is collected. Local demo email is captured in the Mailpit inbox, which anyone with access to this computer may view.</p>
  </details>
}
