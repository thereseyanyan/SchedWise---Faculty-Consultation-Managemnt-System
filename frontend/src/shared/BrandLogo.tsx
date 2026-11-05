type BrandLogoProps = {
  className?: string
  showMark?: boolean
}

export function BrandLogo({ className = "", showMark = false }: BrandLogoProps) {
  return (
    <div
      className={`inline-flex min-w-0 items-center gap-2.5 ${className}`}
      aria-label="SchedWise"
    >
      <span className="whitespace-nowrap text-[27px] font-extrabold leading-none tracking-[-1px]">
        <span className="text-schedwise-purple">Sched</span><span className="text-schedwise-amber">Wise</span>
      </span>
      <img
        src="/logoo.png"
        alt="SchedWise mark"
        className={`${showMark ? "h-11 w-11" : "h-9 w-9"} shrink-0 rounded-xl object-contain`}
      />
    </div>
  )
}
