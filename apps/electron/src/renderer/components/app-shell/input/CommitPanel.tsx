import * as React from 'react'
import { Check, FilePlus, FileEdit, Loader2, GitCommit, RotateCcw, Undo2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { GitDetailedStatus } from '@/hooks/useGit'

const MENU_CONTAINER_STYLE =
  'sm:max-w-[720px] max-w-[calc(100%-2rem)] overflow-hidden rounded-[8px] bg-background text-foreground shadow-modal-small p-0'

interface CommitPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: GitDetailedStatus | null
  commit: (message: string, files?: string[]) => Promise<{ success: boolean; error?: string; commitSha?: string }>
  diff: (filePath?: string) => Promise<{ diff: string; error?: string }>
  committing: boolean
  stage?: (files: string[]) => Promise<{ success: boolean; error?: string }>
  unstage?: (files: string[]) => Promise<{ success: boolean; error?: string }>
  discard?: (files: string[]) => Promise<{ success: boolean; error?: string }>
}

/** Simple colored diff renderer */
function DiffView({ diff, loading }: { diff: string; loading: boolean }) {
  if (loading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  }
  if (!diff) {
    return <span className="text-muted-foreground/50">No diff available</span>
  }
  const lines = diff.split('\n')
  return (
    <pre className="whitespace-pre-wrap break-all text-[11px] leading-4">
      {lines.map((line, i) => {
        let className = 'text-muted-foreground'
        if (line.startsWith('+') && !line.startsWith('+++')) className = 'text-emerald-600 dark:text-emerald-400'
        else if (line.startsWith('-') && !line.startsWith('---')) className = 'text-red-600 dark:text-red-400'
        else if (line.startsWith('@@')) className = 'text-blue-600 dark:text-blue-400 font-medium'
        else if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) className = 'text-foreground/70 font-medium'
        return (
          <span key={i} className={cn('block', className)}>
            {line || ' '}
          </span>
        )
      })}
    </pre>
  )
}

export function CommitPanel({ open, onOpenChange, status, commit, diff, committing, stage, unstage, discard }: CommitPanelProps) {
  const { t } = useTranslation()
  const [message, setMessage] = React.useState('')
  const [selectedFile, setSelectedFile] = React.useState<string | null>(null)
  const [diffText, setDiffText] = React.useState('')
  const [diffLoading, setDiffLoading] = React.useState(false)
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)

  const hasChanges = status && !status.isClean

  // Reset state when panel opens/closes
  React.useEffect(() => {
    if (!open) {
      setMessage('')
      setSelectedFile(null)
      setDiffText('')
    }
  }, [open])

  // Load diff when file selected
  React.useEffect(() => {
    if (!selectedFile || !open) { setDiffText(''); return }
    setDiffLoading(true)
    diff(selectedFile).then((result) => {
      setDiffText(result.diff || result.error || '')
      setDiffLoading(false)
    })
  }, [selectedFile, diff, open])

  const handleCommit = async () => {
    const trimmed = message.trim()
    if (!trimmed) { toast.error(t('git.commitMessageRequired')); return }
    const result = await commit(trimmed)
    if (result.success) {
      toast.success(t('git.committed', { sha: result.commitSha?.slice(0, 7) || '' }))
      setMessage('')
      onOpenChange(false)
    } else {
      toast.error(result.error || t('git.commitFailed'))
    }
  }

  const handleStage = async (path: string) => {
    if (!stage) return
    setActionLoading(`stage:${path}`)
    const result = await stage([path])
    setActionLoading(null)
    if (!result.success) toast.error(result.error || 'Stage failed')
  }

  const handleUnstage = async (path: string) => {
    if (!unstage) return
    setActionLoading(`unstage:${path}`)
    const result = await unstage([path])
    setActionLoading(null)
    if (!result.success) toast.error(result.error || 'Unstage failed')
  }

  const handleDiscard = async (path: string) => {
    if (!discard) return
    if (!confirm(`Discard changes to ${path}? This cannot be undone.`)) return
    setActionLoading(`discard:${path}`)
    const result = await discard([path])
    setActionLoading(null)
    if (result.success) {
      if (selectedFile === path) setSelectedFile(null)
    } else {
      toast.error(result.error || 'Discard failed')
    }
  }

  const fileIcon = (type: string) => {
    if (type === 'staged') return <Check className="h-3.5 w-3.5 text-amber-500" />
    if (type === 'untracked') return <FilePlus className="h-3.5 w-3.5 text-sky-500" />
    return <FileEdit className="h-3.5 w-3.5 text-destructive" />
  }

  interface FileRowProps {
    path: string
    type: 'modified' | 'staged' | 'untracked'
  }

  function FileRow({ path, type }: FileRowProps) {
    const isSelected = selectedFile === path
    const isLoading = actionLoading?.endsWith(`:${path}`)
    return (
      <div
        className={cn(
          'flex items-center gap-2 w-full text-left px-3 py-1.5 text-[13px] rounded-[6px] transition-colors cursor-pointer',
          isSelected ? 'bg-foreground/5 ring-1 ring-foreground/10' : 'hover:bg-foreground/5',
        )}
        onClick={() => setSelectedFile(isSelected ? null : path)}
      >
        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" /> : fileIcon(type)}
        <span className="flex-1 min-w-0 truncate">{path}</span>
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {type !== 'staged' && stage && (
            <button
              type="button"
              onClick={() => handleStage(path)}
              disabled={!!actionLoading}
              className="p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
              title="Stage"
            >
              <Check className="h-3 w-3" />
            </button>
          )}
          {type === 'staged' && unstage && (
            <button
              type="button"
              onClick={() => handleUnstage(path)}
              disabled={!!actionLoading}
              className="p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
              title="Unstage"
            >
              <Undo2 className="h-3 w-3" />
            </button>
          )}
          {type === 'modified' && discard && (
            <button
              type="button"
              onClick={() => handleDiscard(path)}
              disabled={!!actionLoading}
              className="p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Discard changes"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    )
  }

  const stagedCount = status?.staged.length ?? 0
  const totalChanges = (status?.modified.length ?? 0) + (status?.staged.length ?? 0) + (status?.untracked.length ?? 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className={MENU_CONTAINER_STYLE}>
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-sm font-medium">{t('git.commitChanges')}</DialogTitle>
        </DialogHeader>
        {!hasChanges ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t('git.noChangesToCommit')}
          </div>
        ) : (
          <div className="flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-4 pb-2 border-b border-border/50 flex items-center justify-between">
              <span className="text-sm font-medium">{t('git.changes')}</span>
              <span className="text-xs text-muted-foreground">{totalChanges} files</span>
            </div>

            {/* File list */}
            <div className="max-h-[380px] overflow-y-auto p-1 space-y-1">
              {/* Modified */}
              {status!.modified.length > 0 && (
                <div>
                  <div className="px-3 py-0.5 text-[11px] font-medium text-destructive uppercase tracking-wider">{t('git.modified')}</div>
                  {status!.modified.map((path) => (
                    <FileRow key={path} path={path} type="modified" />
                  ))}
                </div>
              )}
              {/* Staged */}
              {status!.staged.length > 0 && (
                <div>
                  <div className="px-3 py-0.5 text-[11px] font-medium text-amber-500 uppercase tracking-wider">{t('git.staged')}</div>
                  {status!.staged.map((path) => (
                    <FileRow key={path} path={path} type="staged" />
                  ))}
                </div>
              )}
              {/* Untracked */}
              {status!.untracked.length > 0 && (
                <div>
                  <div className="px-3 py-0.5 text-[11px] font-medium text-sky-500 uppercase tracking-wider">{t('git.untracked')}</div>
                  {status!.untracked.map((path) => (
                    <FileRow key={path} path={path} type="untracked" />
                  ))}
                </div>
              )}
            </div>

            {/* Diff preview */}
            {selectedFile && (
              <div className="border-t border-border/50">
                <div className="px-3 py-1 text-xs text-muted-foreground bg-foreground/[0.02] flex items-center justify-between">
                  <span>{selectedFile}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="text-[10px]">Hide diff</span>
                  </button>
                </div>
                <div className="max-h-[280px] overflow-y-auto px-3 py-2 text-xs font-mono bg-foreground/[0.02]">
                  <DiffView diff={diffText} loading={diffLoading} />
                </div>
              </div>
            )}

            {/* Commit message + button */}
            <div className="border-t border-border/50 p-3 space-y-2">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('git.commitMessagePlaceholder')}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 px-1"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommit() } }}
              />
              <button
                type="button"
                onClick={handleCommit}
                disabled={committing || !message.trim() || stagedCount === 0}
                className={cn(
                  'w-full flex items-center justify-center gap-1.5 h-8 rounded-[6px] text-sm font-medium transition-colors',
                  committing || !message.trim() || stagedCount === 0
                    ? 'bg-foreground/5 text-muted-foreground cursor-not-allowed'
                    : 'bg-foreground text-background hover:bg-foreground/90',
                )}
              >
                {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCommit className="h-4 w-4" />}
                {stagedCount > 0
                  ? `${t('git.commitButton')} · ${stagedCount} staged`
                  : t('git.commitButton')}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
