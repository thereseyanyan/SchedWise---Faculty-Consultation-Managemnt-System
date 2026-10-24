export function IllustrationPanel({ side = "left" }: { side?: "left" | "right" }) {
  return (
    <div
      className={`relative hidden md:flex md:w-1/2 flex-col items-center justify-center overflow-hidden bg-schedwise-lavender-100 p-8 ${
        side === "right" ? "order-2" : "order-1"
      }`}
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute -left-10 top-10 h-32 w-32 rounded-full bg-schedwise-lavender-200/80" />
      <div className="pointer-events-none absolute -right-16 bottom-16 h-40 w-40 rounded-full bg-schedwise-lavender-200/70" />
      <div className="pointer-events-none absolute left-1/4 top-1/3 h-16 w-16 rounded-full bg-schedwise-lavender-200/60" />
      <div className="relative z-10 text-center">
        <h2 className="font-display text-2xl font-bold text-schedwise-navy">Meet Your Study Companion</h2>
        <p className="mt-2 text-sm text-schedwise-body">SchedWise helps you stay on track</p>
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-schedwise-soft">
          <svg viewBox="0 0 200 140" className="h-32 w-full" aria-hidden="true">
            <rect x="20" y="30" width="160" height="90" rx="12" fill="#F5F3FF" />
            <rect x="30" y="40" width="40" height="12" rx="6" fill="#EDE9FE" />
            <rect x="30" y="60" width="140" height="8" rx="4" fill="#EDE9FE" />
            <rect x="30" y="75" width="120" height="8" rx="4" fill="#EDE9FE" />
            <rect x="30" y="90" width="90" height="8" rx="4" fill="#EDE9FE" />
            <circle cx="150" cy="50" r="6" fill="#F59E0B" />
            <rect x="145" y="45" width="10" height="10" rx="2" fill="#F59E0B" />
          </svg>
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-schedwise-body">
            <span className="h-2 w-2 rounded-full bg-schedwise-yellow" />
            <span>Coding Time</span>
          </div>
        </div>
        <div className="mt-4 inline-flex items-center gap-2 rounded-[999px] bg-white px-3 py-1.5 shadow-sm">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-schedwise-lavender-100">
            <span className="text-xs font-bold">
              <span className="text-schedwise-purple">S</span>
              <span className="text-schedwise-yellow">W</span>
            </span>
          </div>
          <span className="text-xs font-medium text-schedwise-navy">Smart University Scheduler</span>
        </div>
      </div>
    </div>
  )
}
