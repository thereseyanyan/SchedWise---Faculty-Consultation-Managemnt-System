import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"
import type { ApptStatus } from "../../api"
import { Button, initialsOf } from "../../shared"

/**
 * Shared building blocks for the redesigned student pages.
 * Colors and radii follow the Figma "Student" frames, which reuse the
 * faculty dashboard style (lavender surfaces, white cards, pill buttons).
 */

export const studentCard =
  "overflow-hidden rounded-2xl border border-[#e4defa] bg-white shadow-[0_5px_18px_rgba(109,40,217,0.10)]"

export const studentButton = {
  primary:
    "rounded-full bg-schedwise-purple font-semibold text-white hover:bg-purple-800 disabled:hover:bg-schedwise-purple",
  secondary:
    "rounded-full border border-purple-300 bg-white font-semibold text-schedwise-purple hover:bg-schedwise-lavender-50",
  danger: "rounded-full bg-rose-600 font-semibold text-white hover:bg-rose-700",
  dangerOutline:
    "rounded-full border border-rose-200 bg-white font-semibold text-rose-700 hover:bg-rose-50",
} as const

export const sizeMd = "h-10 px-[22px] text-sm"
export const sizeSm = "h-8 px-4 text-[13px]"

export const studentField =
  "w-full rounded-xl border border-[#ddd6fe] bg-white px-3.5 text-sm text-brand-deep-purple outline-none transition placeholder:text-[#8a80a8] focus:border-schedwise-purple focus:ring-[3px] focus:ring-purple-600/15 aria-[invalid=true]:border-rose-600"

export const studentLabel = "mb-1.5 block text-[13px] font-semibold text-brand-deep-purple"

export function StudentPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1 basis-72">
        <h2 className="text-[30px] font-semibold leading-9 tracking-tight text-brand-deep-purple">{title}</h2>
        {subtitle ? <p className="mt-1 text-[15px] text-[#5b5078]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  )
}

export function StudentCard({
  title,
  right,
  children,
  className = "",
  bodyClassName = "p-5",
}: {
  title?: string
  right?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`${studentCard} ${className}`}>
      {title ? (
        <div className="flex h-[60px] items-center gap-2.5 border-b border-schedwise-lavender-100 px-5">
          <h3 className="text-lg font-semibold text-brand-deep-purple">{title}</h3>
          {right ? <div className="ml-auto">{right}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

const chipStyles: Record<ApptStatus, { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "bg-[#e8f7ef] text-[#16845b]" },
  pending: { label: "Pending", className: "bg-amber-100 text-amber-800" },
  completed: { label: "Completed", className: "bg-schedwise-lavender-100 text-schedwise-purple" },
  cancelled: { label: "Cancelled", className: "bg-[#f1edfb] text-[#5b5078]" },
  rejected: { label: "Declined", className: "bg-[#fdecec] text-[#d64545]" },
  reschedule_requested: { label: "Reschedule requested", className: "bg-[#fff1e6] text-[#c2410c]" },
  no_show: { label: "No-show", className: "bg-[#fdecec] text-[#d64545]" },
}

export function StatusChip({ status }: { status: ApptStatus }) {
  const { label, className } = chipStyles[status]
  return (
    <span className={`inline-flex h-6 w-fit items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ${className}`}>
      {label}
    </span>
  )
}

export function FacultyAvatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-schedwise-lavender-100 text-xs font-semibold text-schedwise-purple"
      aria-hidden
    >
      {initialsOf(name.replace(/^(Prof\.|Dr\.)\s*/, ""))}
    </span>
  )
}

export function StudentTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      onClick={onClick}
      aria-pressed={active}
      className={`h-11 gap-2 rounded-xl px-3.5 text-sm font-semibold ${
        active ? "bg-schedwise-lavender-100 text-schedwise-purple" : "text-[#5b5078] hover:bg-schedwise-lavender-100/60"
      }`}
    >
      {label}
      <span
        className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums ${
          active ? "bg-schedwise-purple text-white" : "bg-[#f1edfb] text-[#5b5078]"
        }`}
      >
        {count}
      </span>
    </Button>
  )
}

export function StudentDialog({
  title,
  subtitle,
  titleId,
  onClose,
  children,
  footer,
  width = "max-w-lg",
}: {
  title: string
  subtitle?: ReactNode
  titleId: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-brand-deep-purple/45 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`max-h-[92vh] w-full ${width} overflow-y-auto rounded-t-3xl bg-white shadow-[0_20px_60px_rgba(45,27,105,0.30)] sm:rounded-3xl`}
      >
        <div className="flex items-start gap-4 border-b border-schedwise-lavender-100 px-6 py-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-xl font-semibold tracking-tight text-brand-deep-purple">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-sm leading-6 text-[#5b5078]">{subtitle}</p> : null}
          </div>
          <Button
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="size-9 shrink-0 rounded-xl text-[#5b5078] hover:bg-schedwise-lavender-100"
          >
            <X size={18} />
          </Button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-3 border-t border-schedwise-lavender-100 px-6 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}
