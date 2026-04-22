import { useState, useRef } from "react"
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
import type { Issue, IssueStatus, IssuePriority } from "@craft-agent/shared/issues"
import { cn } from "@/lib/utils"

interface IssueDetailModalProps {
  issue: Issue
  workspaceId: string
  onClose: () => void
  onUpdate: (
    id: string,
    updates: Partial<Pick<Issue, "title" | "description" | "status" | "priority" | "linkedSessionIds" | "linkedPlanPaths" | "attachments">>
  ) => Promise<Issue | null>
  onDelete: () => void
  onStartSession: (issue: Issue) => void
  onStatusChange: (status: IssueStatus) => void
  onOpenSession: (sessionId: string) => void
  onOpenPlan: (workspaceRelativePath: string) => void
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
  workspaceId,
  onClose,
  onUpdate,
  onDelete,
  onStartSession,
  onStatusChange,
  onOpenSession,
  onOpenPlan,
}: IssueDetailModalProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(issue.title)
  const [description, setDescription] = useState(issue.description || "")
  const [priority, setPriority] = useState<IssuePriority>(issue.priority)
  const [status, setStatus] = useState<IssueStatus>(issue.status)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [attachments, setAttachments] = useState<string[]>(issue.attachments ?? [])
  const [inlineError, setInlineError] = useState<string | null>(null)

  async function insertAttachment(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setInlineError("Image exceeds 10 MB limit")
      return
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const ext = (file.name.split(".").pop() || "png").toLowerCase()
    try {
      const { path } = await window.electronAPI.issues.writeAttachment(workspaceId, issue.id, ext, bytes)
      const filename = path.split("/").pop()
      const ref = `![attachment](./${issue.id}/attachments/${filename})`
      const textarea = textareaRef.current
      if (!textarea) return
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const next = description.slice(0, start) + ref + description.slice(end)
      setDescription(next)
      setAttachments((prev) => [...prev, path])
    } catch (err) {
      setInlineError(`Couldn't save image: ${(err as Error).message}`)
    }
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find((it) => it.type.startsWith("image/"))
    if (!imageItem) return
    e.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) return
    await insertAttachment(file)
  }

  async function handleDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    e.preventDefault()
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"))
    if (!file) return
    await insertAttachment(file)
  }

  const handleSave = async () => {
    await onUpdate(issue.id, {
      title: title.trim() || issue.title,
      description: description.trim() || undefined,
      priority,
      attachments: attachments.length > 0 ? attachments : undefined,
    })
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
            <textarea
              ref={textareaRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onPaste={handlePaste}
              onDrop={handleDrop}
              className="w-full min-h-[160px] font-mono text-sm p-2 rounded border bg-background"
              placeholder="Markdown supported. Paste or drop images to attach."
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

          {/* Linked sessions */}
          {issue.linkedSessionIds.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Linked sessions</div>
              <ul className="text-sm space-y-1">
                {issue.linkedSessionIds.map((sid) => (
                  <li key={sid}>
                    <button
                      type="button"
                      className="underline text-left hover:text-primary"
                      onClick={() => onOpenSession(sid)}
                    >
                      {sid}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Linked plans */}
          {issue.linkedPlanPaths.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Linked plans</div>
              <ul className="text-sm space-y-1">
                {issue.linkedPlanPaths.map((p) => (
                  <li key={p}>
                    <button
                      type="button"
                      className="underline text-left hover:text-primary"
                      onClick={() => onOpenPlan(p)}
                    >
                      {p.split("/").pop()}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Metadata */}
          <div className="text-xs text-muted-foreground pt-2 border-t border-border">
            <p>
              Created: {new Date(issue.createdAt).toLocaleDateString()}
            </p>
            <p>
              Updated: {new Date(issue.updatedAt).toLocaleDateString()}
            </p>
          </div>

          {inlineError && (
            <div className="text-xs text-destructive">{inlineError}</div>
          )}
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
                variant="default"
                size="sm"
                onClick={() => onStartSession(issue)}
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
