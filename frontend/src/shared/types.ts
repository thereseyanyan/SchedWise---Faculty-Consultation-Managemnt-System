import type { ComponentType } from "react"

export type Role = "Student" | "Faculty" | "Admin"
export type Icon = ComponentType<{
  size?: number
  strokeWidth?: number
  className?: string
}>

export type Stat = {
  label: string
  value: string
  hint: string
  icon: Icon
  onClick: () => void
  attention?: boolean
}

export type Professor = {
  id: string
  name: string
  department: string
  location: string
  next: string
}

export type SlotKind = "available" | "blocked"
export type AvailabilityBlock = {
  id: string
  kind: SlotKind
  start: number
  end: number
  weekday?: number
  date?: string
  dayLocations?: Record<string, string>
}
export type CalendarView = "day" | "week" | "month"
export type RuleMode = "weekly" | "overrides"

export type Selection =
  | { type: "rules" }
  | { type: "appt"; id: string }
  | { type: "block"; id: string; iso: string }
  | {
      type: "new"
      iso: string
      start: number
      end: number
      kind: SlotKind
      repeat: boolean
    }
  | null
