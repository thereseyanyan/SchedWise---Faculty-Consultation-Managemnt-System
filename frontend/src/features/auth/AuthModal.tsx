import { ReactNode, useEffect, useRef } from "react"

type AuthModalProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  ariaLabelledby?: string
}

export function AuthModal({ open, onClose, children, ariaLabelledby }: AuthModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      lastFocusedRef.current = document.activeElement as HTMLElement
      // focus first focusable element
      const timer = setTimeout(() => {
        const focusable = modalRef.current?.querySelector<HTMLElement>(
          'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        focusable?.focus()
      }, 0)
      document.body.style.overflow = "hidden"
      return () => {
        clearTimeout(timer)
        document.body.style.overflow = ""
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusableElements = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement)
        if (focusableElements.length === 0) return
        const first = focusableElements[0]
        const last = focusableElements[focusableElements.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open && lastFocusedRef.current) {
      lastFocusedRef.current.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledby}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="absolute inset-0 bg-[rgba(45,27,105,0.30)] backdrop-blur-[6px] motion-reduce:backdrop-blur-none" aria-hidden="true" />
      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-purple-200 bg-white shadow-[0_30px_80px_rgba(76,29,149,0.25)] animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
