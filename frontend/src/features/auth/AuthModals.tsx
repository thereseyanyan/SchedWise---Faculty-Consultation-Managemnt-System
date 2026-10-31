import { useState } from "react"
import { AuthModal } from "./AuthModal"
import { IllustrationPanel } from "./IllustrationPanel"
import { LoginForm } from "./LoginForm"
import { SignUpForm } from "./SignUpForm"
import { BrandLogo } from "../../shared"
import { ApiError, authApi } from "../../api"
import { Button, InputTag } from "../../shared"

type AuthModalsProps = {
  open: boolean
  mode: "login" | "signup"
  onClose: () => void
  onSwitchMode: (mode: "login" | "signup") => void
  onLoginSuccess: (user: any) => void
  initialRole?: "student" | "faculty"
  loginRole?: "student" | "faculty"
}

export function AuthModals({
  open,
  mode,
  onClose,
  onSwitchMode,
  onLoginSuccess,
  initialRole = "student",
  loginRole = "student",
}: AuthModalsProps) {
  const [forgotOpen, setForgotOpen] = useState(false)
  const [signupEmail, setSignupEmail] = useState("")
  const [showSignupNotice, setShowSignupNotice] = useState(false)
  const [signupEmailSent, setSignupEmailSent] = useState(false)

  const handleSignupSuccess = (email: string, emailSent: boolean) => {
    setSignupEmailSent(emailSent)
    setSignupEmail(email)
    setShowSignupNotice(true)
    onSwitchMode("login")
  }

  if (!open) return null

  return (
    <>
      <AuthModal open={open} onClose={onClose} ariaLabelledby={mode === "login" ? "login-title" : "signup-title"}>
        <div className="flex flex-col md:flex-row">
          {mode === "login" ? <IllustrationPanel side="left" /> : null}
          <div className="flex w-full flex-col p-6 md:w-1/2 md:p-8">
            <div className="mb-4 flex items-center justify-between">
              <BrandLogo />
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-schedwise-body hover:text-schedwise-navy"
              >
                Back
              </button>
            </div>
            {mode === "login" ? (
              <>
                <LoginForm
                  onSuccess={onLoginSuccess}
                  onForgot={() => setForgotOpen(true)}
                  onRegister={() => onSwitchMode("signup")}
                  initialEmail={showSignupNotice ? signupEmail : ""}
                  expectedRole={loginRole}
                  onCloseModal={onClose}
                />
                {showSignupNotice ? (
                  <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    Application submitted. Your Student ID is <strong>{signupEmail}</strong>. Save it for login. Wait for administrator approval before signing in.
                    {signupEmailSent ? " A registration confirmation email was sent to your registered address." : " Your application was saved, but the confirmation email could not be sent. Contact the administrator."}
                  </p>
                ) : null}
              </>
            ) : (
              <SignUpForm
                onSuccess={handleSignupSuccess}
                onLogin={() => onSwitchMode("login")}
              />
            )}
          </div>
          {mode === "signup" ? <IllustrationPanel side="right" /> : null}
        </div>
      </AuthModal>
      {forgotOpen ? (
        <AuthModal open={forgotOpen} onClose={() => setForgotOpen(false)} ariaLabelledby="forgot-title">
          <ForgotPasswordForm onClose={() => setForgotOpen(false)} onBackToLogin={() => { setForgotOpen(false); onSwitchMode("login"); }} />
        </AuthModal>
      ) : null}
    </>
  )
}

function ForgotPasswordForm({ onClose, onBackToLogin }: { onClose: () => void; onBackToLogin: () => void }) {
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [step, setStep] = useState<"request" | "confirm">("request")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.")
      return
    }
    setLoading(true)
    setError("")
    setNotice("")
    try {
      const result = await authApi.forgotPassword(email.trim())
      setStep("confirm")
      setNotice(result.message)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError("Unable to reset password.")
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit reset code.")
      return
    }
    if (password.length < 8) {
      setError("Password does not meet requirements.")
      return
    }
    setLoading(true)
    setError("")
    setNotice("")
    try {
      const result = await authApi.resetPassword({ email: email.trim(), code: code.trim(), password })
      setNotice(result.message)
      setTimeout(() => onBackToLogin(), 1000)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError("Unable to reset password.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-4 flex items-center justify-between">
        <BrandLogo />
        <button type="button" onClick={onClose} className="text-sm text-schedwise-body hover:text-schedwise-navy">Back</button>
      </div>
      <h1 className="font-display text-2xl font-bold text-schedwise-navy" id="forgot-title">Reset Password</h1>
      <p className="mt-1 text-sm text-schedwise-body">
        {step === "request" ? "Enter your email to receive a reset code." : "Enter the code and your new password."}
      </p>
      <form onSubmit={step === "request" ? handleRequest : handleReset} className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-schedwise-navy">Email</label>
          <InputTag
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={step === "confirm"}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          />
        </div>
        {step === "confirm" ? (
          <>
            <div>
              <label className="block text-sm font-medium text-schedwise-navy">Reset Code</label>
              <InputTag
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-schedwise-navy">New Password</label>
              <InputTag
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </div>
          </>
        ) : null}
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        {notice ? <p className="text-xs text-emerald-700">{notice}</p> : null}
        <Button type="submit" disabled={loading} className="w-full rounded-[999px] bg-schedwise-purple py-2.5 text-sm font-semibold text-white">
          {loading ? "Processing..." : step === "request" ? "Send Code" : "Update Password"}
        </Button>
        <button type="button" onClick={onBackToLogin} className="w-full text-center text-sm text-schedwise-purple">
          Back to Login
        </button>
      </form>
    </div>
  )
}
