import { useEffect, useRef, useState } from "react"
import { BrandLogo } from "../../shared"
import { Button } from "../../shared/ui"
import { RoleCard, FeaturePill } from "./RoleCard"

type WelcomePageProps = {
  onSignUp: (role: "student" | "faculty") => void
  onLogin: (role: "student" | "faculty") => void
}

export function WelcomePage({ onSignUp, onLogin }: WelcomePageProps) {
  const [selectedRole, setSelectedRole] = useState<"student" | "faculty" | null>(null)
  const lastFocusedRef = useRef<HTMLButtonElement | null>(null)
  const groupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!groupRef.current) return
      const radios = Array.from(
        groupRef.current.querySelectorAll<HTMLElement>('[role="radio"]'),
      )
      if (radios.length === 0) return
      const currentIndex = radios.findIndex((r) => r === document.activeElement)
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault()
        const next = radios[(currentIndex + 1 + radios.length) % radios.length]
        next.focus()
        const role = next.getAttribute("data-role") as "student" | "faculty"
        if (role) setSelectedRole(role)
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault()
        const prev = radios[(currentIndex - 1 + radios.length) % radios.length]
        prev.focus()
        const role = prev.getAttribute("data-role") as "student" | "faculty"
        if (role) setSelectedRole(role)
      } else if (e.key === "Escape") {
        e.preventDefault()
        if (selectedRole) {
          const active = document.activeElement as HTMLElement
          lastFocusedRef.current = active as HTMLButtonElement
        }
        setSelectedRole(null)
        setTimeout(() => {
          lastFocusedRef.current?.focus()
        }, 0)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [selectedRole])

  const handleSelect = (role: "student" | "faculty") => {
    if (selectedRole === role) {
      setSelectedRole(null)
      return
    }
    setSelectedRole(role)
  }

  const handleBack = () => {
    if (selectedRole) {
      const active = document.activeElement as HTMLElement
      lastFocusedRef.current = active as HTMLButtonElement
    }
    setSelectedRole(null)
    setTimeout(() => {
      lastFocusedRef.current?.focus()
    }, 0)
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#EDE9FE]">
      <div className="mx-auto flex min-h-screen max-w-[1100px] flex-col items-center px-4 py-6 sm:px-6 lg:px-8">
        <div className="relative w-full overflow-hidden rounded-2xl border border-purple-200 bg-[#EDE9FE] shadow-sm">
          <div aria-hidden="true" className="pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-[#E4DAFB]/70" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-[#E4DAFB]/70" />
          <div aria-hidden="true" className="pointer-events-none absolute -left-40 -bottom-40 h-[28rem] w-[28rem] rounded-full bg-[#E4DAFB]/70" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-40 -bottom-40 h-[28rem] w-[28rem] rounded-full bg-[#E4DAFB]/70" />
          <div className="relative z-10 flex flex-col px-6 py-8 sm:px-10 lg:px-16">
            <header className="flex items-center">
              <BrandLogo />
            </header>
            <div className="mt-6 flex flex-col items-center text-center">
              <div className="w-full max-w-4xl">
                <div className="flex items-center justify-center">
                  <div className="flex size-14 items-center justify-center rounded-full bg-white/80 text-schedwise-purple shadow-sm">
                    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
                      <path
                        d="M12 3L3 7V17L12 21L21 17V7L12 3Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                      />
                    </svg>
                  </div>
                </div>
                <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
                  <span className="text-schedwise-purple">Welcome to </span>
                  <span className="text-schedwise-purple">Sched</span>
                  <span className="text-schedwise-amber">Wise</span>
                  <span className="text-schedwise-navy">!</span>
                </h1>
                <p className="mx-auto mt-3 max-w-[680px] text-base leading-relaxed text-schedwise-body">
                  SchedWise helps students and faculty schedule consultations. Students view faculty availability, request appointments, and track them. Faculty set schedules, approve or reschedule requests, and keep consultation records.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <FeaturePill>Easy booking</FeaturePill>
                  <FeaturePill>Real-time availability</FeaturePill>
                  <FeaturePill>Consultation records</FeaturePill>
                </div>
                <div className="mt-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-schedwise-body">ARE YOU A...</p>
                  <div
                    ref={groupRef}
                    role="radiogroup"
                    aria-label="I am a"
                    className="mt-4 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2"
                  >
                    <RoleCard role="student" selected={selectedRole === "student"} onSelect={handleSelect} />
                    <RoleCard role="faculty" selected={selectedRole === "faculty"} onSelect={handleSelect} />
                  </div>
                </div>
                <div
                  aria-live="polite"
                  className={`mt-6 transition-all duration-200 motion-reduce:transition-none ${
                    selectedRole ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
                  }`}
                >
                  {selectedRole ? (
                    <div className="flex flex-col items-center gap-3">
                      {selectedRole === "faculty" && <p className="text-sm text-schedwise-body">Faculty accounts are created by your administrator. Sign in with the email and initial password provided.</p>}
                      <div className="flex flex-col items-center gap-3 sm:flex-row">
                        {selectedRole === "student" && <Button
                          onClick={() => onSignUp("student")}
                          className="w-full rounded-[999px] bg-schedwise-purple px-8 py-3 text-sm font-semibold text-white shadow-schedwise transition hover:bg-purple-700 focus-visible:ring-2 focus-visible:ring-schedwise-purple sm:w-auto"
                        >
                          Sign Up as a Student
                        </Button>}
                        <Button
                          onClick={() => selectedRole && onLogin(selectedRole)}
                          className="w-full rounded-[999px] border border-schedwise-purple/70 px-8 py-3 text-sm font-semibold text-schedwise-purple transition hover:bg-schedwise-lavender-100 focus-visible:ring-2 focus-visible:ring-schedwise-purple sm:w-auto"
                        >
                          Login
                        </Button>
                      </div>
                      <Button
                        onClick={handleBack}
                        className="text-sm font-medium text-schedwise-purple underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-schedwise-purple"
                      >
                        Back
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
