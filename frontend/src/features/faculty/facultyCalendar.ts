export const HOUR_PX = 56
export const DAY_START = 7 * 60
export const DAY_END = 18 * 60
export const SNAP = 15
export const GRID_HEIGHT = ((DAY_END - DAY_START) / 60) * HOUR_PX
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]
export const hourLabels = Array.from(
  { length: (DAY_END - DAY_START) / 60 + 1 },
  (_, i) => DAY_START / 60 + i,
)
export const timeOptions = Array.from(
  { length: (DAY_END - DAY_START) / SNAP + 1 },
  (_, i) => DAY_START + i * SNAP,
)

export const cardShadow = "border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
