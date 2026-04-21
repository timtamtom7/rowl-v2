import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, Circle, CheckCircle, Clock, Archive } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { IssueCard } from "./IssueCard"
import { IssueDetailModal } from "./IssueDetailModal"
import { useIssues } from "@/hooks/useIssues"
import type { Issue, IssueStatus } from "@craft-agent/shared/issues"
import { ISSUE_STATUS_INFO } from "@craft-agent/shared/issues"

type StatusFilter = "all" | IssueStatus

const STATUS_FILTERS: { key: StatusFilter; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "All", icon: <Circle className="h-3 w-3" /> },
  { key: "backlog", label: "Backlog", icon: <Archive className="h-3 w-3" /> },
  { key: "todo", label: "Todo", icon: <Circle className="h-3 w-3" /> },
  { key: "in_progress", label: "In Progress", icon: <Clock className="h-3 w-3" /> },
  { key: "done", label: "Done", icon: <CheckCircle className="h-3 w-3" /> },
]

interface IssuesPanelProps {
  onBack: () => void
  onCreateSession: (title: string) => void
}

export function IssuesPanel({ onBack, onCreateSession }: IssuesPanelProps) {
  const { t } = useTranslation()
  const { issues, addIssue, updateIssue, updateIssueStatus, deleteIssue, getIssue } = useIssues()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [newIssueTitle, setNewIssueTitle] = useState("")

  const filteredIssues = issues.filter((issue) => {
    // Status filter
    if (statusFilter !== "all" && issue.status !== statusFilter) {
      return false
    }
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        issue.title.toLowerCase().includes(query) ||
        issue.description?.toLowerCase().includes(query)
      )
    }
    return true
  })

  const handleCreateIssue = () => {
    if (newIssueTitle.trim()) {
      addIssue(newIssueTitle.trim())
      setNewIssueTitle("")
      setIsCreating(false)
    }
  }

  const handleStatusChange = (issueId: string, newStatus: IssueStatus) => {
    updateIssueStatus(issueId, newStatus)
  }

  const handleConvertToSession = (issue: Issue) => {
    onCreateSession(issue.title)
  }

  const handleDelete = (issueId: string) => {
    deleteIssue(issueId)
    setSelectedIssue(null)
  }

  const openCount = issues.filter((i) => i.status !== "done").length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        <div className="flex-1" />
        <h2 className="text-sm font-medium">
          {t("sidebar.issues", "Issues")} ({openCount})
        </h2>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setIsCreating(true)}>
          <Plus className="h-3 w-3 mr-1" />
          {t("issues.newIssue", "New Issue")}
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="px-4 py-3 border-b border-border space-y-3">
        {/* Search */}
        <Input
          placeholder={t("issues.searchPlaceholder", "Search issues...")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 text-sm"
        />

        {/* Status Filter Tabs */}
        <div className="flex gap-1 overflow-x-auto">
          {STATUS_FILTERS.map((filter) => {
            const count =
              filter.key === "all"
                ? issues.length
                : issues.filter((i) => i.status === filter.key).length

            return (
              <button
                key={filter.key}
                onClick={() => setStatusFilter(filter.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === filter.key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {filter.icon}
                {filter.label}
                {count > 0 && (
                  <span className="ml-1 text-[10px] opacity-60">({count})</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Create New Issue Form */}
      {isCreating && (
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex gap-2">
            <Input
              value={newIssueTitle}
              onChange={(e) => setNewIssueTitle(e.target.value)}
              placeholder={t("issues.titlePlaceholder", "Issue title")}
              className="flex-1 h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateIssue()
                if (e.key === "Escape") {
                  setIsCreating(false)
                  setNewIssueTitle("")
                }
              }}
            />
            <Button size="sm" onClick={handleCreateIssue} disabled={!newIssueTitle.trim()}>
              {t("common.add", "Add")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsCreating(false)
                setNewIssueTitle("")
              }}
            >
              {t("common.cancel", "Cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Issues Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredIssues.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">
              {searchQuery
                ? t("issues.noResults", "No issues match your search")
                : t("issues.noIssues", "No issues yet")}
            </p>
            {!searchQuery && (
              <p className="text-xs mt-1">
                {t("issues.noIssuesHint", "Create your first issue to get started")}
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filteredIssues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onSelect={() => setSelectedIssue(issue)}
                onStatusChange={(status) => handleStatusChange(issue.id, status)}
                onConvertToSession={() => handleConvertToSession(issue)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Issue Detail Modal */}
      {selectedIssue && (
        <IssueDetailModal
          issue={selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onUpdate={updateIssue}
          onDelete={() => handleDelete(selectedIssue.id)}
          onConvertToSession={() => handleConvertToSession(selectedIssue)}
          onStatusChange={(status) => handleStatusChange(selectedIssue.id, status)}
        />
      )}
    </div>
  )
}
