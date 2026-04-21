import { useTranslation } from "react-i18next"
import { Circle, Clock, CheckCircle, ArrowRight, PlayCircle } from "lucide-react"
import type { Issue, IssueStatus } from "@craft-agent/shared/issues"
import { ISSUE_STATUS_INFO, getNextStatus } from "@craft-agent/shared/issues"
import { cn } from "@/lib/utils"

interface IssueCardProps {
  issue: Issue
  onSelect: () => void
  onStatusChange: (status: IssueStatus) => void
  onConvertToSession: () => void
}

const STATUS_ICONS: Record<IssueStatus, React.ReactNode> = {
  backlog: <Circle className="h-3 w-3 text-muted-foreground" />,
  todo: <Circle className="h-3 w-3 text-muted-foreground" fill="currentColor" />,
  in_progress: <Clock className="h-3 w-3 text-yellow-500" />,
  done: <CheckCircle className="h-3 w-3 text-green-500" />,
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-green-500",
  medium: "bg-yellow-500",
  high: "bg-red-500",
}

export function IssueCard({
  issue,
  onSelect,
  onStatusChange,
  onConvertToSession,
}: IssueCardProps) {
  const { t } = useTranslation()
  const statusInfo = ISSUE_STATUS_INFO[issue.status]
  const nextStatus = getNextStatus(issue.status)
  const nextStatusInfo = ISSUE_STATUS_INFO[nextStatus]
  const priorityColor = PRIORITY_COLORS[issue.priority] || PRIORITY_COLORS.medium

  const handleMoveToNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    onStatusChange(nextStatus)
  }

  const handleStartSession = (e: React.MouseEvent) => {
    e.stopPropagation()
    onConvertToSession()
  }

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative p-3 rounded-lg border border-border bg-background",
        "hover:border-primary/30 hover:shadow-sm cursor-pointer",
        "transition-all duration-150"
      )}
    >
      {/* Status and Priority Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {STATUS_ICONS[issue.status]}
          <span className="text-[10px] font-medium text-muted-foreground">
            {statusInfo.label}
          </span>
        </div>
        <span
          className={cn("w-2 h-2 rounded-full", priorityColor)}
          title={t(`issues.priority.${issue.priority}`, issue.priority)}
        />
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-foreground line-clamp-2 mb-1">
        {issue.title}
      </h4>

      {/* Description Preview */}
      {issue.description && (
        <p className="text-xs text-muted-foreground line-clamp-3 mb-3">
          {issue.description}
        </p>
      )}

      {/* Actions Row */}
      <div className="flex items-center gap-1 mt-auto pt-2">
        {issue.status !== "done" && (
          <button
            onClick={handleMoveToNext}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium",
              "bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
            )}
            title={`Move to ${nextStatusInfo.label}`}
          >
            {nextStatusInfo.label}
            <ArrowRight className="h-2.5 w-2.5" />
          </button>
        )}

        <button
          onClick={handleStartSession}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium",
            "bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
          )}
          title={t("issues.startSession", "Start a session with this issue")}
        >
          <PlayCircle className="h-2.5 w-2.5" />
          {t("issues.session", "Session")}
        </button>
      </div>
    </div>
  )
}
