import {
  loadCalendarDemoState,
  saveCalendarDemoState,
  hasLegacyDemoClasses,
  CALENDAR_DEMO_STORAGE_KEY,
  type CalendarDemoState,
} from "./calendarDemoState.ts"

type CalendarDemoStorage = Pick<Storage, "getItem" | "setItem">

let failNextSave = false

function localServiceDelay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

export function simulateNextCalendarDemoSaveFailure() {
  failNextSave = true
}

export async function loadCalendarDemoData(
  storage: CalendarDemoStorage | null,
): Promise<CalendarDemoState> {
  await localServiceDelay(200)
  if (!storage) throw new Error("Browser storage is unavailable.")
  const saved = storage.getItem(CALENDAR_DEMO_STORAGE_KEY)
  const state = loadCalendarDemoState({ getItem: () => saved })
  if (saved !== null && hasLegacyDemoClasses(JSON.parse(saved).events)) {
    await localServiceDelay(50)
    saveCalendarDemoState(storage, state)
  }
  return state
}

export async function saveCalendarDemoData(
  storage: CalendarDemoStorage | null,
  state: CalendarDemoState,
): Promise<void> {
  await localServiceDelay(50)
  if (failNextSave) {
    failNextSave = false
    throw new Error("The requested development save failure was simulated.")
  }
  if (!storage) throw new Error("Browser storage is unavailable.")
  saveCalendarDemoState(storage, state)
}
