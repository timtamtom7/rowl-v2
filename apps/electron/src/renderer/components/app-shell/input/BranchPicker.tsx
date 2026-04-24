import * as React from 'react'
import { GitBranch, Check, Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { FreeFormInputContextBadge } from './FreeFormInputContextBadge'
import { cn } from '@/lib/utils'
import type { GitBranch as GitBranchType } from '@/hooks/useGitBranch'

const MENU_CONTAINER_STYLE =
  'min-w-[240px] max-w-[360px] overflow-hidden rounded-[8px] bg-background text-foreground shadow-modal-small p-0'
const MENU_LIST_STYLE = 'max-h-[280px] overflow-y-auto p-1 space-y-px'
const MENU_ITEM_STYLE =
  'flex cursor-pointer select-none items-center gap-2 rounded-[6px] px-3 py-1.5 text-[13px] outline-none'

export interface BranchPickerProps {
  cwd: string | undefined
  branch: string | null
  branches: GitBranchType[]
  isRepo: boolean
  isClean: boolean
  loading: boolean
  onCheckout: (branchName: string) => Promise<{ success: boolean; error?: string }>
  onCreate: (branchName: string) => Promise<{ success: boolean; error?: string }>
}

export function BranchPicker({
  cwd,
  branch,
  branches,
  isRepo,
  isClean,
  loading,
  onCheckout,
  onCreate,
}: BranchPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [filter, setFilter] = React.useState('')
  const [isCreating, setIsCreating] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const hasBranch = !!branch
  const displayBranch = branch ?? t('chat.noBranch')
  const showFilter = branches.length > 8

  // Focus input when popover opens
  React.useEffect(() => {
    if (open && showFilter) {
      const timer = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(timer)
    }
  }, [open, showFilter])

  // Reset filter when popover closes
  React.useEffect(() => {
    if (!open) setFilter('')
  }, [open])

  const handleSelect = React.useCallback(
    async (branchName: string) => {
      if (branchName === branch) {
        setOpen(false)
        return
      }
      setIsCreating(false)
      const result = await onCheckout(branchName)
      if (result.success) {
        toast.success(t('git.switchedToBranch', { branch: branchName }))
        setOpen(false)
      } else {
        toast.error(result.error || t('git.checkoutFailed'))
      }
    },
    [branch, onCheckout, t],
  )

  const handleCreate = React.useCallback(async () => {
    const name = filter.trim()
    if (!name) return
    setIsCreating(true)
    const result = await onCreate(name)
    setIsCreating(false)
    if (result.success) {
      toast.success(t('git.createdBranch', { branch: name }))
      setFilter('')
      setOpen(false)
    } else {
      toast.error(result.error || t('git.createFailed'))
    }
  }, [filter, onCreate, t])

  // If not a git repo, show disabled state
  if (!cwd || !isRepo) {
    return (
      <FreeFormInputContextBadge
        icon={<GitBranch className="h-4 w-4" />}
        label={t('chat.branch')}
        isExpanded={false}
        hasSelection={false}
        showChevron={false}
        disabled
        tooltip={!cwd ? t('chat.chooseFolderFirst') : t('chat.notAGitRepo')}
      />
    )
  }

  const filtered = branches.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()))
  const currentBranch = branches.find((b) => b.current)
  const otherBranches = filtered.filter((b) => !b.current)
  const canCreate = filter.trim().length > 0 && !branches.some((b) => b.name === filter.trim())

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span className="shrink min-w-0 overflow-hidden">
          <FreeFormInputContextBadge
            icon={<GitBranch className="h-4 w-4" />}
            label={displayBranch}
            isExpanded={false}
            hasSelection={hasBranch}
            showChevron={true}
            isOpen={open}
            tooltip={
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{t('chat.currentBranch')}</span>
                <span className="text-xs opacity-70">{branch ?? t('chat.unknownBranch')}</span>
                {!isClean && <span className="text-xs text-amber-500">{t('git.uncommittedChanges')}</span>}
              </span>
            }
          />
        </span>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className={MENU_CONTAINER_STYLE}>
        {/* Filter input */}
        {showFilter && (
          <div className="border-b border-border/50 px-3 py-2">
            <input
              ref={inputRef}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('git.filterBranches')}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 placeholder:select-none"
            />
          </div>
        )}

        {/* Branch list */}
        <div className={MENU_LIST_STYLE}>
          {/* Loading state */}
          {loading && (
            <div className={cn(MENU_ITEM_STYLE, 'text-muted-foreground pointer-events-none')}>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span className="flex-1 min-w-0 truncate">{t('git.loadingBranches')}</span>
            </div>
          )}

          {/* Current branch */}
          {!loading && currentBranch && (
            <div className={cn(MENU_ITEM_STYLE, 'pointer-events-none bg-foreground/5 opacity-70')}>
              <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 min-w-0 truncate">{currentBranch.name}</span>
              <Check className="h-4 w-4 shrink-0" />
            </div>
          )}

          {/* Separator */}
          {!loading && currentBranch && otherBranches.length > 0 && (
            <div className="h-px bg-border my-1 mx-1" />
          )}

          {/* Other branches */}
          {!loading && otherBranches.map((b) => (
            <button
              key={b.name}
              type="button"
              onClick={() => handleSelect(b.name)}
              className={cn(MENU_ITEM_STYLE, 'w-full text-left hover:bg-foreground/5')}
            >
              <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 min-w-0 truncate">{b.name}</span>
            </button>
          ))}

          {/* Empty state */}
          {!loading && filtered.length === 0 && (
            <div className="py-3 text-center text-sm text-muted-foreground">
              {filter ? t('git.noBranchesFound') : t('git.noOtherBranches')}
            </div>
          )}
        </div>

        {/* Create new branch */}
        {canCreate && (
          <div className="border-t border-border/50 p-1">
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating}
              className={cn(
                MENU_ITEM_STYLE,
                'w-full text-left text-muted-foreground hover:text-foreground hover:bg-foreground/5',
                isCreating && 'opacity-50 pointer-events-none',
              )}
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="flex-1 min-w-0 truncate">
                {t('git.createBranch')}: <span className="text-foreground font-medium">{filter.trim()}</span>
              </span>
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
