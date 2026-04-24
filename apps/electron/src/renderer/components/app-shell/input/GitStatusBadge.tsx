import * as React from 'react'
import { GitCommit } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@craft-agent/ui'
import { FreeFormInputContextBadge } from './FreeFormInputContextBadge'
import type { GitDetailedStatus } from '@/hooks/useGit'

export interface GitStatusBadgeProps {
  status: GitDetailedStatus | null
  loading: boolean
  onClick: () => void
}

export function GitStatusBadge({ status, loading, onClick }: GitStatusBadgeProps) {
  const { t } = useTranslation()

  if (!status?.isRepo) return null

  const hasModified = status.modified.length > 0
  const hasStaged = status.staged.length > 0
  const hasUntracked = status.untracked.length > 0
  const isClean = status.isClean

  // Determine color
  let dotColor = 'bg-emerald-500'
  let label = t('git.clean')
  if (hasModified) {
    dotColor = 'bg-destructive'
    label = t('git.modifiedCount', { count: status.modified.length })
  } else if (hasStaged) {
    dotColor = 'bg-amber-500'
    label = t('git.stagedCount', { count: status.staged.length })
  } else if (hasUntracked) {
    dotColor = 'bg-sky-500'
    label = t('git.untrackedCount', { count: status.untracked.length })
  }

  if (isClean) {
    label = t('git.clean')
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="shrink min-w-0 overflow-hidden">
          <FreeFormInputContextBadge
            icon={
              <span className="relative flex items-center">
                <GitCommit className="h-4 w-4" />
                {!isClean && !loading && (
                  <span className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${dotColor}`} />
                )}
                {loading && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-muted-foreground animate-pulse" />
                )}
              </span>
            }
            label={label}
            isExpanded={false}
            hasSelection={!isClean}
            showChevron={false}
            onClick={onClick}
            tooltip={
              <span className="flex flex-col gap-0.5 text-xs">
                <span className="font-medium">{t('git.status')}</span>
                {isClean ? (
                  <span className="opacity-70">{t('git.workingTreeClean')}</span>
                ) : (
                  <>
                    {status.ahead > 0 && <span>{t('git.ahead', { count: status.ahead })}</span>}
                    {status.behind > 0 && <span>{t('git.behind', { count: status.behind })}</span>}
                    {hasModified && <span className="text-destructive">{t('git.modifiedCount', { count: status.modified.length })}</span>}
                    {hasStaged && <span className="text-amber-500">{t('git.stagedCount', { count: status.staged.length })}</span>}
                    {hasUntracked && <span className="text-sky-500">{t('git.untrackedCount', { count: status.untracked.length })}</span>}
                  </>
                )}
              </span>
            }
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {isClean ? t('git.clickToCommit') : t('git.clickToReviewChanges')}
      </TooltipContent>
    </Tooltip>
  )
}
