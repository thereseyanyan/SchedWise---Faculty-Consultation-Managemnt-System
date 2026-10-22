import { useEffect, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react"
import { auditApi, type AuditLogEntry } from "../../api"
import {
  Button,
  EmptyState,
  InputTag,
  PageTitle,
  SelectTag,
  StatusBadge,
  errorMessage,
} from "../../shared"

export const auditActionTone = (action: string): "success" | "warning" | "danger" => {
  if (["create", "login", "approve", "approve_faculty", "verify_email", "password_reset", "change_password"].includes(action)) {
    return "success"
  }
  if (["delete", "reject_faculty", "failed_login", "login_unverified", "login_pending_faculty_approval",
    "login_rejected_faculty", "failed_login_inactive", "change_password_failed"].includes(action)) {
    return "danger"
  }
  return "warning"
}

export const auditValueLabel = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export const auditSummary = (entry: AuditLogEntry): string => {
  const oldValues = entry.old_values ?? {}
  const newValues = entry.new_values ?? {}
  const keys = Array.from(new Set([...Object.keys(oldValues), ...Object.keys(newValues)]))
  const changes = keys
    .filter((key) => JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key]))
    .map((key) => {
      if (key in oldValues && key in newValues) {
        return `${key}: ${auditValueLabel(oldValues[key])} → ${auditValueLabel(newValues[key])}`
      }
      if (key in newValues) return `${key}: ${auditValueLabel(newValues[key])}`
      return `${key}: ${auditValueLabel(oldValues[key])} (removed)`
    })
  return changes.length > 0 ? changes.join(" · ") : "No field changes recorded."
}

export const auditDateLabel = (value: string): string => {
  const parsed = new Date(value.replace(" ", "T"))
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function AdminAuditView() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [pagination, setPagination] = useState({ page: 1, per_page: 25, total: 0, total_pages: 1 })
  const [options, setOptions] = useState<{ actions: string[]; entity_types: string[] }>({ actions: [], entity_types: [] })
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [action, setAction] = useState("")
  const [entityType, setEntityType] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [page, setPage] = useState(1)
  const [reloadKey, setReloadKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
      setPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    let live = true
    setLoading(true)
    setError("")
    auditApi.list({
      page,
      per_page: 25,
      q: debouncedQuery || undefined,
      action: action || undefined,
      entity_type: entityType || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }).then((result) => {
      if (!live) return
      setEntries(result.entries)
      setPagination(result.pagination)
      setOptions(result.options)
      if (result.pagination.page !== page) setPage(result.pagination.page)
    }).catch((err) => {
      if (live) setError(errorMessage(err, "Unable to load the audit log."))
    }).finally(() => {
      if (live) setLoading(false)
    })
    return () => { live = false }
  }, [page, debouncedQuery, action, entityType, dateFrom, dateTo, reloadKey])

  const hasFilters = Boolean(query.trim() || action || entityType || dateFrom || dateTo)
  const clearFilters = () => {
    setQuery("")
    setDebouncedQuery("")
    setAction("")
    setEntityType("")
    setDateFrom("")
    setDateTo("")
    setPage(1)
  }

  return (
    <div>
      <PageTitle
        eyebrow="Security"
        title="Audit Log"
        description="Review authentication, account, appointment, and configuration events. Entries are read-only."
        action={
          <Button
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={loading}
            className="gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        }
      />
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">{error}</p>}
      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-end">
        <label className="block min-w-[190px] flex-1">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Search</span>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <InputTag
              type="search"
              aria-label="Search audit log"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Actor, action, entity, or IP"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15"
            />
          </div>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Action</span>
          <SelectTag
            aria-label="Filter audit log by action"
            value={action}
            onChange={(event) => { setAction(event.target.value); setPage(1) }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 outline-none focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15"
          >
            <option value="">All actions</option>
            {options.actions.map((value) => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}
          </SelectTag>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Entity</span>
          <SelectTag
            aria-label="Filter audit log by entity"
            value={entityType}
            onChange={(event) => { setEntityType(event.target.value); setPage(1) }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 outline-none focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15"
          >
            <option value="">All entities</option>
            {options.entity_types.map((value) => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}
          </SelectTag>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">From</span>
          <InputTag
            type="date"
            aria-label="Audit entries from date"
            value={dateFrom}
            onChange={(event) => { setDateFrom(event.target.value); setPage(1) }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 outline-none focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">To</span>
          <InputTag
            type="date"
            aria-label="Audit entries to date"
            value={dateTo}
            onChange={(event) => { setDateTo(event.target.value); setPage(1) }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 outline-none focus:border-purple-600 focus:ring-[3px] focus:ring-purple-600/15"
          />
        </label>
        {hasFilters && (
          <Button onClick={clearFilters} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            Clear filters
          </Button>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-slate-500">
          {loading ? "Loading audit entries…" : `${pagination.total} audit ${pagination.total === 1 ? "entry" : "entries"}`}
        </p>
        {pagination.total_pages > 1 && <p className="text-xs text-slate-400">Page {pagination.page} of {pagination.total_pages}</p>}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <div className="min-w-[1000px]">
            <div className="grid grid-cols-[1.1fr_1.3fr_0.85fr_1fr_1.9fr_0.9fr] gap-4 border-b border-slate-100 bg-slate-50 px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <span>When</span>
              <span>Actor</span>
              <span>Action</span>
              <span>Entity</span>
              <span>Details</span>
              <span>IP address</span>
            </div>
            {entries.map((entry) => {
              const summary = auditSummary(entry)
              return (
                <div
                  key={entry.id}
                  className="grid grid-cols-[1.1fr_1.3fr_0.85fr_1fr_1.9fr_0.9fr] items-start gap-4 border-b border-slate-100 px-6 py-4 last:border-b-0 hover:bg-slate-50"
                >
                  <p className="text-xs text-slate-600">{auditDateLabel(entry.created_at)}</p>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{entry.actor_name || "Anonymous"}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{entry.actor_email || "No authenticated actor"}</p>
                  </div>
                  <StatusBadge tone={auditActionTone(entry.action)}>{entry.action.replace(/_/g, " ")}</StatusBadge>
                  <div>
                    <p className="text-xs font-medium capitalize text-slate-700">{entry.entity_type?.replace(/_/g, " ") || "—"}</p>
                    {entry.entity_id && <p className="mt-0.5 font-mono text-[10px] text-slate-400" title={entry.entity_id}>{entry.entity_id.slice(0, 12)}…</p>}
                  </div>
                  <p className="text-xs leading-5 text-slate-600" title={summary}>
                    {summary.length > 180 ? `${summary.slice(0, 180)}…` : summary}
                  </p>
                  <p className="font-mono text-[11px] text-slate-500">{entry.ip_address || "—"}</p>
                </div>
              )
            })}
            {!loading && entries.length === 0 && (
              <div className="p-4">
                <EmptyState
                  icon={ShieldCheck}
                  title="No audit entries match these filters"
                  description="Try clearing the search or date filters, or wait for new account and appointment activity."
                  action={hasFilters
                    ? <Button onClick={clearFilters} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Clear filters</Button>
                    : undefined}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {pagination.total_pages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <Button
            disabled={pagination.page <= 1 || loading}
            onClick={() => setPage(pagination.page - 1)}
            className="gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <ChevronLeft size={14} /> Previous
          </Button>
          <Button
            disabled={pagination.page >= pagination.total_pages || loading}
            onClick={() => setPage(pagination.page + 1)}
            className="gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Next <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  )
}
