import { Link } from "lucide-react"
import type { ReactNode } from "react"

type BrandLogoProps = {
  className?: string
  showMark?: boolean
}

export function BrandLogo({ className = "", showMark = false }: BrandLogoProps) {
  return (
    <div className={`flex items-center ${className}`} aria-label="SchedWise">
      {showMark ? (
        <div className="mr-2 flex size-10 items-center justify-center rounded-xl border border-purple-200 bg-white/90 text-purple-600">
          <Link size={20} aria-hidden="true" />
        </div>
      ) : null}
      <span className="font-display text-xl font-bold tracking-tight sm:text-2xl">
        <span className="text-schedwise-purple">Sched</span>
        <span className="text-schedwise-yellow">Wise</span>
      </span>
    </div>
  )
}
