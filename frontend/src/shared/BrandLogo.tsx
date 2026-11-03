type BrandLogoProps = {
  className?: string
  showMark?: boolean
}

export function BrandLogo({ className = "", showMark = false }: BrandLogoProps) {
  return (
    <div
      className={`flex min-w-0 items-center ${className}`}
      aria-label="SchedWise"
    >
      <img
        src="/logo.png"
        alt="SchedWise"
        className={`${showMark ? "h-11" : "h-10"} w-auto max-w-none shrink-0 object-contain`}
      />
    </div>
  )
}