import { ApiError } from "../api"
import type { Role } from "./types"

export const roleFromId = (roleId: string): Role | null => {
  switch (roleId.toLowerCase()) {
    case "student":
      return "Student"
    case "faculty":
      return "Faculty"
    case "admin":
      return "Admin"
    default:
      return null
  }
}

export const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "??"

export const errorMessage = (err: unknown, fallback: string) => {
  if (err instanceof ApiError) {
    const fieldMessages = Object.values(err.fields).filter(Boolean)
    return fieldMessages.length > 0
      ? fieldMessages.join(" ")
      : err.message || fallback
  }
  return err instanceof Error && err.message ? err.message : fallback
}

export const fullName = (first?: string | null, last?: string | null, fallback = "") =>
  [first, last].filter(Boolean).join(" ") || fallback

export const fieldClass =
  "w-full rounded-xl border border-purple-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15"

export const pillField =
  "w-full rounded-2xl border border-purple-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:ring-[3px] focus:ring-purple-500/15"
export const pillLabel =
  "mb-1.5 block px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
export const primaryCta =
  "gap-2 rounded-[4px] border border-purple-700 bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
export const textLink = "text-xs font-semibold text-slate-500 hover:text-purple-700"

export const roleLabel = (roleId: string): Role => {
  if (roleId === "faculty") return "Faculty"
  if (roleId === "admin") return "Admin"
  return "Student"
}
