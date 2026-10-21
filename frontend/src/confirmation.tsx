import { useEffect, useRef, useSyncExternalStore } from "react"

type Confirmation = { message: string; resolve: (answer: boolean) => void }
const queue: Confirmation[] = []
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function confirmAction(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({ message, resolve })
    notify()
  })
}

export function ConfirmationDialog() {
  const active = useSyncExternalStore(subscribe, () => queue[0] ?? null)
  const dialog = useRef<HTMLDialogElement>(null)
  const noButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!active || !dialog.current) return
    const previousFocus = document.activeElement as HTMLElement | null
    const element = dialog.current
    element.showModal()
    noButton.current?.focus()
    return () => {
      element.close()
      previousFocus?.focus()
    }
  }, [active])

  const answer = (confirmed: boolean) => {
    if (!active || queue[0] !== active) return
    queue.shift()
    active.resolve(confirmed)
    notify()
  }

  if (!active) return null
  return <dialog ref={dialog} aria-labelledby="confirmation-title" aria-describedby="confirmation-message"
    className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-purple-100 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/50"
    onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation() }}
    onCancel={(event) => { event.preventDefault(); answer(false) }}>
    <div className="p-6">
      <h2 id="confirmation-title" className="text-lg font-bold text-purple-900">Confirm action</h2>
      <p id="confirmation-message" className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{active.message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button ref={noButton} type="button" onClick={() => answer(false)} className="cursor-pointer rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-purple-600">No</button>
        <button type="button" onClick={() => answer(true)} className="cursor-pointer rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 focus-visible:outline-2 focus-visible:outline-purple-600">Yes</button>
      </div>
    </div>
  </dialog>
}
