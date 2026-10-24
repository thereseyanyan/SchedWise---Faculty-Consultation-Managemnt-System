import { useEffect, useState } from "react"
import { Mail } from "lucide-react"
import { ApiError, authApi, type User } from "../../api"
import { WaveHeader } from "../../shared"
import { WelcomePage } from "./WelcomePage"
import { AuthModals } from "./AuthModals"

export type AuthScreen = "welcome" | "login" | "forgot" | "register"

export function AuthenticationGate({ onLogin }: { onLogin: (user: User) => void }) {
  const initialVerifyToken = new URLSearchParams(window.location.search).get(
    "verify_token",
  )
  const [screen, setScreen] = useState<AuthScreen>(
    initialVerifyToken ? "login" : "welcome",
  )
  const [verifying, setVerifying] = useState(Boolean(initialVerifyToken))
  const [modalOpen, setModalOpen] = useState(initialVerifyToken ? true : false)
  const [modalMode, setModalMode] = useState<"login" | "signup">("login")
  const [initialRole, setInitialRole] = useState<"student" | "faculty">("student")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get("verify_token")
    if (!token) return

    let cancelled = false
    setScreen("login")
    setModalOpen(true)
    setModalMode("login")
    setVerifying(true)

    authApi
      .verifyEmail(token)
      .then(() => {
        if (cancelled) return
      })
      .catch(() => {
        if (cancelled) return
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

  // keep for compatibility with old code paths if needed; new flow uses modals
  const go = (next: AuthScreen) => {
    setScreen(next)
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
      <>
        <div className={modalOpen ? "transition-all duration-300" : ""}>
          <WelcomePage
            onSignUp={(role) => {
              setInitialRole(role)
              setModalMode("signup")
              setModalOpen(true)
              setScreen("welcome")
            }}
            onLogin={() => {
              setModalMode("login")
              setModalOpen(true)
              setScreen("welcome")
            }}
          />
        </div>
        <AuthModals
          open={modalOpen}
          mode={modalMode}
          onClose={() => setModalOpen(false)}
          onSwitchMode={(m) => setModalMode(m)}
          onLoginSuccess={onLogin}
          initialRole={initialRole}
        />
      </>
    )
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

  return (
    <>
      <div className={modalOpen ? "transition-all duration-300" : "transition-all duration-300"}>
        <WelcomePage
          onSignUp={(role) => {
            setInitialRole(role)
            setModalMode("signup")
            setModalOpen(true)
            setScreen("welcome")
          }}
          onLogin={() => {
            setModalMode("login")
            setModalOpen(true)
            setScreen("welcome")
          }}
        />
      </div>
      <AuthModals
        open={modalOpen}
        mode={modalMode}
        onClose={() => setModalOpen(false)}
        onSwitchMode={(m) => setModalMode(m)}
        onLoginSuccess={onLogin}
        initialRole={initialRole}
      />
    </>
  )
}
