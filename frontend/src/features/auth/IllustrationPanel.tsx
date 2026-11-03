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
          <img src="/coding.png" alt="Coding Time" className="mx-auto h-32 w-full object-contain" />
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
