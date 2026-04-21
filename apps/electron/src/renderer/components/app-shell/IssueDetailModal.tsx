import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Circle, Clock, CheckCircle, Trash2, PlayCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Issue, IssueStatus, IssuePriority } from "@craft-agent/shared/issues"
import { ISSUE_STATUS_INFO } from "@craft-agent/shared/issues"
import { cn } from "@/lib/utils"

type IssueUpdate = {
  title?: string
  description?: string
  status?: IssueStatus
  priority?: IssuePriority
}

interface IssueDetailModalProps {
  issue: Issue
  onClose: () => void
  onUpdate: (id: string, updates: IssueUpdate) => void
  onDelete: () => void
  onConvertToSession: () => void
  onStatusChange: (status: IssueStatus) => void
}

const STATUS_OPTIONS: { value: IssueStatus; label: string; icon: React.ReactNode }[] = [
  { value: "backlog", label: "Backlog", icon: <Circle className="h-3 w-3" /> },
  { value: "todo", label: "Todo", icon: <Circle className="h-3 w-3" /> },
  { value: "in_progress", label: "In Progress", icon: <Clock className="h-3 w-3" /> },
  { value: "done", label: "Done", icon: <CheckCircle className="h-3 w-3" /> },
]

const PRIORITY_OPTIONS: { value: IssuePriority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "bg-green-500" },
  { value: "medium", label: "Medium", color: "bg-yellow-500" },
  { value: "high", label: "High", color: "bg-red-500" },
]

export function IssueDetailModal({
  issue,
  onClose,
  onUpdate,
  onDelete,
  onConvertToSession,
  onStatusChange,
}: IssueDetailModalProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(issue.title)
  const [description, setDescription] = useState(issue.description || "")
  const [priority, setPriority] = useState<IssuePriority>(issue.priority)
  const [status, setStatus] = useState<IssueStatus>(issue.status)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleSave = () => {
    if (title.trim() !== issue.title || description !== (issue.description || "")) {
      onUpdate(issue.id, {
        title: title.trim() || issue.title,
        description: description.trim() || undefined,
      })
    }
    if (priority !== issue.priority) {
      onUpdate(issue.id, { priority })
    }
    if (status !== issue.status) {
      onStatusChange(status)
    }
    onClose()
  }

  const handleDelete = () => {
    onDelete()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-base">
            {t("issues.issueDetails", "Issue Details")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              {t("issues.title", "Title")}
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("issues.titlePlaceholder", "Issue title")}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              {t("issues.description", "Description")}
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("issues.descriptionPlaceholder", "Add a description...")}
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Status */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              {t("issues.status", "Status")}
            </label>
            <div className="flex gap-2 flex-wrap">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setStatus(option.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                    status === option.value
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "bg-muted hover:bg-muted/80 text-muted-foreground"
                  )}
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              {t("issues.priority.label", "Priority")}
            </label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setPriority(option.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                    priority === option.value
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "bg-muted hover:bg-muted/80 text-muted-foreground"
                  )}
                >
                  <span className={cn("w-2 h-2 rounded-full", option.color)} />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Metadata */}
          <div className="text-xs text-muted-foreground pt-2 border-t border-border">
            <p>
              Created: {new Date(issue.createdAt).toLocaleDateString()}
            </p>
            <p>
              Updated: {new Date(issue.updatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {showDeleteConfirm ? (
            <>
              <span className="text-xs text-muted-foreground flex-1">
                {t("issues.confirmDelete", "Are you sure?")}
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
              >
                {t("common.delete", "Delete")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
              >
                {t("common.cancel", "Cancel")}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-destructive hover:text-destructive mr-auto"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                {t("common.delete", "Delete")}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onConvertToSession}
              >
                <PlayCircle className="h-3 w-3 mr-1" />
                {t("issues.startSession", "Start Session")}
              </Button>

              <Button size="sm" onClick={handleSave}>
                {t("common.save", "Save")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
