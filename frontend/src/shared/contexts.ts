import { createContext } from "react"
import type { User } from "../api"

export const CurrentUserContext = createContext<User | null>(null)
export const CalendarErrorContext = createContext<string | null>(null)
