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

type SignUpFormProps = {
  onSuccess: (email: string) => void
  onLogin: () => void
  initialRole?: "student" | "faculty"
}

export function SignUpForm({ onSuccess, onLogin, initialRole = "student" }: SignUpFormProps) {
  const [role, setRole] = useState<"student" | "faculty">(initialRole)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [department, setDepartment] = useState("")
  const [major, setMajor] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [generalError, setGeneralError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const newErrors: Record<string, string> = {}
    const nameParts = fullName.trim().split(/\s+/)
    if (nameParts.length < 2) newErrors.fullName = "Enter your first and last name."
    if (!institutionalEmailPattern.test(email.trim())) newErrors.email = "Use an institutional email address, such as name@schedwise.edu."
    if (!isStrongPassword(password)) newErrors.password = passwordPolicyMessage
    if (password !== confirmPassword) newErrors.confirmPassword = "Passwords do not match."
    const deptId = departmentIds[department]
    if (!deptId) newErrors.department = "Select a valid department."
    if (role === "student" && !major.trim()) newErrors.major = "Select your course."
    setErrors(newErrors)
    setGeneralError("")
    if (Object.keys(newErrors).length > 0) return

    setLoading(true)
    try {
      const result = await authApi.register({
        email: email.trim().toLowerCase(),
        password,
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(" "),
        role_id: role,
        department_id: deptId,
        program: role === "student" ? major.trim() : undefined,
      })
      onSuccess(email.trim().toLowerCase())
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErrors: Record<string, string> = {}
        if (err.fields.first_name) fieldErrors.fullName = err.fields.first_name
        if (err.fields.last_name && !fieldErrors.fullName) fieldErrors.fullName = err.fields.last_name
        if (err.fields.email) fieldErrors.email = err.fields.email
        if (err.fields.password) fieldErrors.password = err.fields.password
        if (err.fields.department_id) fieldErrors.department = err.fields.department_id
        if (err.fields.department) fieldErrors.department = err.fields.department
        if (err.fields.program) fieldErrors.major = err.fields.program
        if (err.fields.role_id) fieldErrors.general = err.fields.role_id
        setErrors({ ...err.fields, ...fieldErrors })
        if (Object.keys(err.fields).length === 0 && err.message) {
          setGeneralError(err.message)
        } else if (Object.keys(fieldErrors).length === 0 && Object.keys(err.fields).length > 0) {
          // map all fields
          setErrors({ ...err.fields, fullName: err.fields.first_name || err.fields.last_name || "", department: err.fields.department_id || err.fields.department || "", major: err.fields.program || "" })
          setGeneralError("")
        } else if (Object.keys(fieldErrors).length === 0) {
          setGeneralError(err.message || "Registration failed. Please try again.")
        } else {
          setGeneralError("")
        }
      } else {
        setGeneralError("Registration failed. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col max-h-[70vh] md:max-h-[90vh] overflow-y-auto pr-1">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-schedwise-navy" id="signup-title">Create Account</h1>
        <p className="mt-1 text-sm text-schedwise-body">Sign up to get started with SchedWise</p>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-schedwise-navy">Full Name</label>
          <InputTag
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value)
              setErrors((prev) => ({ ...prev, fullName: "" }))
            }}
            placeholder="Enter full name"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-schedwise-purple focus:outline-none focus:ring-2 focus:ring-schedwise-purple/20"
          />
          {errors.fullName ? <FieldError message={errors.fullName} /> : null}
        </div>
        <div>
          <label className="block text-sm font-medium text-schedwise-navy">Email</label>
          <InputTag
            type="text"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            name="schedwise_registration_email"
            autoComplete="off"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setErrors((prev) => ({ ...prev, email: "" }))
            }}
            placeholder="name@university.edu"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-schedwise-purple focus:outline-none focus:ring-2 focus:ring-schedwise-purple/20"
          />
          {errors.email ? <FieldError message={errors.email} /> : null}
        </div>
        <div>
          <label className="block text-sm font-medium text-schedwise-navy">Role</label>
          <SelectTag
            value={role}
            onChange={(e) => {
              setRole(e.target.value as "student" | "faculty")
              setErrors((prev) => ({ ...prev, major: "" }))
            }}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-schedwise-purple focus:outline-none focus:ring-2 focus:ring-schedwise-purple/20"
          >
            <option value="student">Student</option>
            <option value="faculty">Faculty</option>
          </SelectTag>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-schedwise-navy">Password</label>
            <div className="relative mt-1">
              <InputTag
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setErrors((prev) => ({ ...prev, password: "" }))
                }}
                placeholder="Enter password"
                autoComplete="new-password"
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
            {errors.password ? <FieldError message={errors.password} /> : null}
          </div>
          <div>
            <label className="block text-sm font-medium text-schedwise-navy">Confirm Password</label>
            <div className="relative mt-1">
              <InputTag
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setErrors((prev) => ({ ...prev, confirmPassword: "" }))
                }}
                placeholder="Confirm password"
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-10 text-sm focus:border-schedwise-purple focus:outline-none focus:ring-2 focus:ring-schedwise-purple/20"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                aria-pressed={showConfirm}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-schedwise-purple"
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.confirmPassword ? <FieldError message={errors.confirmPassword} /> : null}
          </div>
        </div>
        <div className={role === "student" ? "grid grid-cols-1 gap-3 md:grid-cols-2" : ""}>
          <div>
            <label className="block text-sm font-medium text-schedwise-navy">Department / College</label>
            <SelectTag
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value)
                setMajor("")
                setErrors((prev) => ({ ...prev, department: "", major: "" }))
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-schedwise-purple focus:outline-none focus:ring-2 focus:ring-schedwise-purple/20"
            >
              <option value="">Select department</option>
              {Object.keys(departments).map((d) => (
                <option key={d}>{d}</option>
              ))}
            </SelectTag>
            {errors.department ? <FieldError message={errors.department} /> : null}
          </div>
          {role === "student" ? (
            <div>
              <label className="block text-sm font-medium text-schedwise-navy">Major / Course</label>
              <SelectTag
                value={major}
                disabled={!department}
                onChange={(e) => {
                  setMajor(e.target.value)
                  setErrors((prev) => ({ ...prev, major: "" }))
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-schedwise-purple focus:outline-none focus:ring-2 focus:ring-schedwise-purple/20 disabled:bg-slate-50"
              >
                <option value="">Select course</option>
                {(departments[department] ?? []).map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </SelectTag>
              {errors.major ? <FieldError message={errors.major} /> : null}
            </div>
          ) : null}
        </div>
        {(generalError || errors.general) ? <FieldError message={generalError || errors.general} /> : null}
      </div>
      <Button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-[999px] bg-schedwise-purple py-2.5 text-sm font-semibold uppercase tracking-wide text-white shadow-schedwise transition hover:bg-purple-700"
      >
        {loading ? "Signing up..." : "SIGN UP"}
      </Button>
      <p className="mt-4 text-center text-xs text-schedwise-body">
        Already have an account?{" "}
        <button type="button" onClick={onLogin} className="font-medium text-schedwise-purple hover:underline">
          Login
        </button>
      </p>
      <p className="mt-2 text-center text-xs text-slate-400">
        {role === "faculty" ? "Faculty accounts need administrator approval after email verification." : "Student accounts activate after email verification."}
      </p>
    </form>
  )
}
