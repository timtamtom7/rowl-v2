import { useState, useMemo } from "react"
import { useTranslation } from "react-i18next"
import {
  Plus,
  Search,
  LayoutGrid,
  List as ListIcon,
  Lightbulb,
  Circle,
  CircleDot,
  Clock,
  CheckCircle2,
  Archive,
  PlayCircle,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { IssueCard } from "./IssueCard"
import { IssueDetailModal } from "./IssueDetailModal"
import { useIssues } from "@/hooks/useIssues"
import { useStartSessionFromIssue } from "@/hooks/useStartSessionFromIssue"
import type { Issue, IssueStatus } from "@craft-agent/shared/issues"
import { ISSUE_STATUS_INFO, getNextStatus } from "@craft-agent/shared/issues"
import { cn } from "@/lib/utils"

type StatusFilter = "all" | "open" | IssueStatus
type ViewMode = "list" | "grid"

const STATUS_FILTERS: { key: StatusFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "all", label: "All", icon: Lightbulb },
  { key: "open", label: "Open", icon: CircleDot },
  { key: "backlog", label: "Backlog", icon: Archive },
  { key: "todo", label: "Todo", icon: Circle },
  { key: "in_progress", label: "In progress", icon: Clock },
  { key: "done", label: "Done", icon: CheckCircle2 },
]

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
}

interface IssuesPanelProps {
  onBack?: () => void
  onOpenSession: (sessionId: string) => void
  workspaceId: string | null
}

export function IssuesPanel({ onOpenSession, workspaceId }: IssuesPanelProps) {
  const { t } = useTranslation()
  const {
    issues,
    addIssue,
    updateIssue,
    updateIssueStatus,
    deleteIssue,
    migrationPending,
    runMigration,
    dismissMigrationPrompt,
  } = useIssues(workspaceId)

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [newIssueTitle, setNewIssueTitle] = useState("")
  const [showCreate, setShowCreate] = useState(false)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: issues.length, open: 0, backlog: 0, todo: 0, in_progress: 0, done: 0 }
    for (const i of issues) {
      c[i.status] = (c[i.status] || 0) + 1
      if (i.status !== "done") c.open += 1
    }
    return c
  }, [issues])

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (statusFilter === "open" && issue.status === "done") return false
      if (statusFilter !== "all" && statusFilter !== "open" && issue.status !== statusFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          issue.title.toLowerCase().includes(q) ||
          issue.description?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [issues, statusFilter, searchQuery])

  const handleCreateIssue = () => {
    if (!workspaceId) return
    if (newIssueTitle.trim()) {
      void addIssue(newIssueTitle.trim())
      setNewIssueTitle("")
      setShowCreate(false)
    }
  }

  const handleStatusChange = (issueId: string, newStatus: IssueStatus) => {
    void updateIssueStatus(issueId, newStatus)
  }

  const startSessionFromIssue = useStartSessionFromIssue({
    workspaceId: workspaceId ?? "",
    updateIssue,
    onSessionCreated: onOpenSession,
  })

  const handleStartSession = async (issue: Issue) => {
    if (!workspaceId) return
    try {
      await startSessionFromIssue(issue)
    } catch (err) {
      console.error("[issues] Failed to start session", err)
    }
  }

  const handleOpenPlan = (path: string) => {
    console.warn("[issues] onOpenPlan not wired yet", path)
  }

  const handleDelete = (issueId: string) => {
    void deleteIssue(issueId)
    setSelectedIssue(null)
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Migration banner */}
      {migrationPending !== null && (
        <div className="mx-6 mt-3 border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-2 rounded-md flex items-center gap-3 text-sm">
          <span className="flex-1">
            {t("issues.migrationPrompt", {
              count: migrationPending,
              defaultValue: `Migrate ${migrationPending} issues from local storage to files?`,
            })}
          </span>
          <button
            type="button"
            className="underline font-medium"
            onClick={() => {
              void (async () => {
                const result = await runMigration()
                console.info(`[issues] Migrated ${result.migrated}, failed ${result.failed}`)
              })()
            }}
          >
            {t("issues.migrateNow", "Migrate")}
          </button>
          <button
            type="button"
            className="underline opacity-70"
            onClick={dismissMigrationPrompt}
          >
            {t("issues.migrateDismiss", "Not now")}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b border-border/40">
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              {t("sidebar.issues", "Issues")}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {counts.open === 0
                ? t("issues.allClear", "All clear — capture an idea below")
                : t("issues.openSummary", { count: counts.open, defaultValue: `${counts.open} open` })}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {/* View toggle */}
            <div className="flex items-center rounded-md border border-border/60 bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-label="List view"
                className={cn(
                  "p-1 rounded transition-colors",
                  viewMode === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ListIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                className={cn(
                  "p-1 rounded transition-colors",
                  viewMode === "grid" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button
              size="sm"
              onClick={() => setShowCreate(true)}
              className="h-8 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("issues.newIssue", "New issue")}
            </Button>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={t("issues.searchPlaceholder", "Search issues…")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>

          <div className="flex items-center gap-0.5 overflow-x-auto">
            {STATUS_FILTERS.map((f) => {
              const count = counts[f.key] ?? 0
              const Icon = f.icon
              const active = statusFilter === f.key
              return (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {f.label}
                  {count > 0 && (
                    <span className={cn(
                      "tabular-nums text-[10px]",
                      active ? "opacity-80" : "opacity-50"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Inline create form */}
      {showCreate && (
        <div className="px-6 py-3 border-b border-border/40 bg-muted/20">
          <div className="flex gap-2 items-center">
            <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
            <Input
              value={newIssueTitle}
              onChange={(e) => setNewIssueTitle(e.target.value)}
              placeholder={t("issues.titlePlaceholder", "What's the idea?")}
              className="flex-1 h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateIssue()
                if (e.key === "Escape") {
                  setShowCreate(false)
                  setNewIssueTitle("")
                }
              }}
            />
            <Button size="sm" onClick={handleCreateIssue} disabled={!newIssueTitle.trim()} className="h-8">
              {t("common.add", "Add")}
            </Button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false)
                setNewIssueTitle("")
              }}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {filteredIssues.length === 0 ? (
          <EmptyState
            hasSearch={!!searchQuery}
            hasIssues={issues.length > 0}
            onCreate={() => setShowCreate(true)}
          />
        ) : viewMode === "list" ? (
          <ul className="divide-y divide-border/30">
            {filteredIssues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                onSelect={() => setSelectedIssue(issue)}
                onStatusCycle={() => handleStatusChange(issue.id, getNextStatus(issue.status))}
                onStartSession={() => { void handleStartSession(issue) }}
              />
            ))}
          </ul>
        ) : (
          <div className="p-6 grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {filteredIssues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onSelect={() => setSelectedIssue(issue)}
                onStatusChange={(status) => handleStatusChange(issue.id, status)}
                onStartSession={() => { void handleStartSession(issue) }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedIssue && workspaceId && (
        <IssueDetailModal
          issue={selectedIssue}
          workspaceId={workspaceId}
          onClose={() => setSelectedIssue(null)}
          onUpdate={updateIssue}
          onDelete={() => handleDelete(selectedIssue.id)}
          onStartSession={(issue) => { void handleStartSession(issue); setSelectedIssue(null) }}
          onStatusChange={(status) => handleStatusChange(selectedIssue.id, status)}
          onOpenSession={onOpenSession}
          onOpenPlan={handleOpenPlan}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

interface IssueRowProps {
  issue: Issue
  onSelect: () => void
  onStatusCycle: () => void
  onStartSession: () => void
}

function IssueRow({ issue, onSelect, onStatusCycle, onStartSession }: IssueRowProps) {
  const { t } = useTranslation()
  const statusInfo = ISSUE_STATUS_INFO[issue.status]
  const priorityColor = PRIORITY_DOT[issue.priority] || PRIORITY_DOT.medium
  const StatusIcon = statusToIcon(issue.status)

  return (
    <li
      onClick={onSelect}
      className={cn(
        "group flex items-center gap-3 px-6 py-2.5 cursor-pointer",
        "hover:bg-muted/40 transition-colors"
      )}
    >
      {/* Status icon — click to cycle */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onStatusCycle()
        }}
        className="shrink-0 p-1 -m-1 rounded hover:bg-muted/60 transition-colors"
        title={`${statusInfo.label} — click to advance`}
      >
        <StatusIcon
          className={cn(
            "h-4 w-4",
            issue.status === "done" && "text-emerald-500",
            issue.status === "in_progress" && "text-amber-500",
            issue.status === "todo" && "text-blue-500",
            issue.status === "backlog" && "text-muted-foreground/60",
          )}
        />
      </button>

      {/* Priority dot */}
      <span
        className={cn("w-1.5 h-1.5 rounded-full shrink-0", priorityColor)}
        title={t(`issues.priority.${issue.priority}`, issue.priority)}
      />

      {/* Title + description */}
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <span
          className={cn(
            "text-sm truncate",
            issue.status === "done" && "line-through text-muted-foreground"
          )}
        >
          {issue.title}
        </span>
        {issue.description && (
          <span className="text-xs text-muted-foreground/70 truncate hidden md:inline">
            — {issue.description}
          </span>
        )}
      </div>

      {/* Status label (right) */}
      <span className="text-[11px] text-muted-foreground/70 shrink-0 hidden sm:inline">
        {statusInfo.label}
      </span>

      {/* Hover actions */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onStartSession()
        }}
        className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:bg-accent/10 px-2 py-1 rounded transition-all"
        title={t("issues.startSession", "Start a session with this issue")}
      >
        <PlayCircle className="h-3 w-3" />
        {t("issues.session", "Session")}
      </button>
    </li>
  )
}

function statusToIcon(status: IssueStatus) {
  switch (status) {
    case "done":
      return CheckCircle2
    case "in_progress":
      return Clock
    case "todo":
      return CircleDot
    case "backlog":
    default:
      return Circle
  }
}

/* -------------------------------------------------------------------------- */

interface EmptyStateProps {
  hasSearch: boolean
  hasIssues: boolean
  onCreate: () => void
}

function EmptyState({ hasSearch, hasIssues, onCreate }: EmptyStateProps) {
  const { t } = useTranslation()
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Search className="h-8 w-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          {t("issues.noResults", "No issues match your search")}
        </p>
      </div>
    )
  }
  if (hasIssues) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-500/60 mb-3" />
        <p className="text-sm text-muted-foreground">
          {t("issues.noneInFilter", "Nothing here in this filter")}
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
        <Lightbulb className="h-8 w-8 text-amber-500" />
      </div>
      <h3 className="text-base font-medium mb-1">
        {t("issues.emptyTitle", "Capture an idea")}
      </h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-4">
        {t("issues.emptyDescription", "Park ideas here without starting a session. Promote any issue to a real session when you're ready to work on it.")}
      </p>
      <Button onClick={onCreate} size="sm" className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        {t("issues.newIssue", "New issue")}
      </Button>
    </div>
  )
}
