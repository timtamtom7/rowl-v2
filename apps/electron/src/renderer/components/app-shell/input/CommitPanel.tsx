import * as React from 'react'
import { Check, FilePlus, FileEdit, Loader2, GitCommit } from 'lucide-react'
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
}

export function CommitPanel({ open, onOpenChange, status, commit, diff, committing }: CommitPanelProps) {
  const { t } = useTranslation()
  const [message, setMessage] = React.useState('')
  const [selectedFile, setSelectedFile] = React.useState<string | null>(null)
  const [diffText, setDiffText] = React.useState('')
  const [diffLoading, setDiffLoading] = React.useState(false)
  const [selectedFiles, setSelectedFiles] = React.useState<Set<string>>(new Set())

  const hasChanges = status && !status.isClean
  const allFiles = hasChanges
    ? [
        ...status!.modified.map((f) => ({ path: f, type: 'modified' as const })),
        ...status!.staged.map((f) => ({ path: f, type: 'staged' as const })),
        ...status!.untracked.map((f) => ({ path: f, type: 'untracked' as const })),
      ]
    : []

  // Reset state when panel opens/closes
  React.useEffect(() => {
    if (!open) {
      setMessage('')
      setSelectedFile(null)
      setDiffText('')
      setSelectedFiles(new Set())
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

  const toggleFile = (path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const selectAll = () => setSelectedFiles(new Set(allFiles.map((f) => f.path)))
  const selectNone = () => setSelectedFiles(new Set())

  const handleCommit = async () => {
    const trimmed = message.trim()
    if (!trimmed) { toast.error(t('git.commitMessageRequired')); return }
    const files = selectedFiles.size > 0 ? Array.from(selectedFiles) : undefined
    const result = await commit(trimmed, files)
    if (result.success) {
      toast.success(t('git.committed', { sha: result.commitSha?.slice(0, 7) || '' }))
      setMessage('')
      setSelectedFiles(new Set())
      onOpenChange(false)
    } else {
      toast.error(result.error || t('git.commitFailed'))
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
    selectedFiles: Set<string>
    selectedFile: string | null
    toggleFile: (path: string) => void
    setSelectedFile: (path: string | null) => void
  }

  function FileRow({ path, type, selectedFiles, selectedFile, toggleFile, setSelectedFile }: FileRowProps) {
    return (
      <button
        key={path}
        type="button"
        onClick={() => { toggleFile(path); setSelectedFile(path) }}
        className={cn(
          'flex items-center gap-2 w-full text-left px-3 py-1.5 text-[13px] rounded-[6px] transition-colors',
          selectedFiles.has(path) ? 'bg-foreground/5' : 'hover:bg-foreground/5',
          selectedFile === path && 'ring-1 ring-foreground/10',
        )}
      >
        <input
          type="checkbox"
          checked={selectedFiles.has(path)}
          onChange={() => toggleFile(path)}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 h-3.5 w-3.5 rounded"
        />
        {fileIcon(type)}
        <span className="flex-1 min-w-0 truncate">{path}</span>
      </button>
    )
  }

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
              <div className="flex gap-1">
                <button type="button" onClick={selectAll} className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-foreground/5">
                  {t('git.selectAll')}
                </button>
                <button type="button" onClick={selectNone} className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-foreground/5">
                  {t('git.selectNone')}
                </button>
              </div>
            </div>

            {/* File list */}
            <div className="max-h-[380px] overflow-y-auto p-1 space-y-1">
              {/* Modified */}
              {status!.modified.length > 0 && (
                <div>
                  <div className="px-3 py-0.5 text-[11px] font-medium text-destructive uppercase tracking-wider">{t('git.modified')}</div>
                  {status!.modified.map((path) => (
                    <FileRow key={path} path={path} type="modified" selectedFiles={selectedFiles} selectedFile={selectedFile} toggleFile={toggleFile} setSelectedFile={setSelectedFile} />
                  ))}
                </div>
              )}
              {/* Staged */}
              {status!.staged.length > 0 && (
                <div>
                  <div className="px-3 py-0.5 text-[11px] font-medium text-amber-500 uppercase tracking-wider">{t('git.staged')}</div>
                  {status!.staged.map((path) => (
                    <FileRow key={path} path={path} type="staged" selectedFiles={selectedFiles} selectedFile={selectedFile} toggleFile={toggleFile} setSelectedFile={setSelectedFile} />
                  ))}
                </div>
              )}
              {/* Untracked */}
              {status!.untracked.length > 0 && (
                <div>
                  <div className="px-3 py-0.5 text-[11px] font-medium text-sky-500 uppercase tracking-wider">{t('git.untracked')}</div>
                  {status!.untracked.map((path) => (
                    <FileRow key={path} path={path} type="untracked" selectedFiles={selectedFiles} selectedFile={selectedFile} toggleFile={toggleFile} setSelectedFile={setSelectedFile} />
                  ))}
                </div>
              )}
            </div>

            {/* Diff preview */}
            {selectedFile && (
              <div className="border-t border-border/50">
                <div className="px-3 py-1 text-xs text-muted-foreground bg-foreground/[0.02]">
                  {selectedFile}
                </div>
                <div className="max-h-[280px] overflow-y-auto px-3 py-2 text-xs font-mono bg-foreground/[0.02]">
                  {diffLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : diffText ? (
                    <pre className="whitespace-pre-wrap break-all text-muted-foreground">{diffText.slice(0, 2000)}{diffText.length > 2000 && '...'}</pre>
                  ) : (
                    <span className="text-muted-foreground/50">{t('git.noDiff')}</span>
                  )}
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
                disabled={committing || !message.trim() || selectedFiles.size === 0}
                className={cn(
                  'w-full flex items-center justify-center gap-1.5 h-8 rounded-[6px] text-sm font-medium transition-colors',
                  committing || !message.trim() || selectedFiles.size === 0
                    ? 'bg-foreground/5 text-muted-foreground cursor-not-allowed'
                    : 'bg-foreground text-background hover:bg-foreground/90',
                )}
              >
                {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCommit className="h-4 w-4" />}
                {selectedFiles.size > 0
                  ? `${t('git.commitButton')} · ${t('git.filesSelected', { count: selectedFiles.size })}`
                  : t('git.commitButton')}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
