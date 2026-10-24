import { useEffect, useState } from "react"
import { AlertTriangle, GraduationCap } from "lucide-react"
import { authApi, type User } from "./api"
import { confirmAction } from "./confirmation"
import { AuthenticationGate } from "./features/auth/AuthenticationGate"
import { StudentPortal } from "./features/student/StudentPortal"
import { FacultyPortal } from "./features/faculty/FacultyPortal"
import { AdminPortal } from "./features/admin/AdminPortal"
import { AccountSettingsDialog } from "./features/account/AccountSettingsDialog"
import { Button, CurrentUserContext, roleFromId } from "./shared"

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
    window.addEventListener("schedwise:session-expired", expireSession)
    return () => window.removeEventListener("schedwise:session-expired", expireSession)
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
