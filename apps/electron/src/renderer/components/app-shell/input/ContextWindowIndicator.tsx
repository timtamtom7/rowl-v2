import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@craft-agent/ui'
import { Spinner } from '@craft-agent/ui'
import { cn } from '@/lib/utils'

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(tokens >= 10_000 ? 0 : 1)}k`
  return `${tokens}`
}

export interface ContextWindowIndicatorProps {
  inputTokens?: number
  contextWindow?: number
  isCompacting?: boolean
  isProcessing?: boolean
  onCompact?: () => void
}

export function ContextWindowIndicator({
  inputTokens,
  contextWindow,
  isCompacting,
  isProcessing,
  onCompact,
}: ContextWindowIndicatorProps) {
  const { t } = useTranslation()

  // Don't show if we have no token data
  if (inputTokens == null || inputTokens <= 0) return null

  const effectiveWindow = contextWindow ?? 200_000
  const pct = Math.min(100, Math.round((inputTokens / effectiveWindow) * 100))

  // Color based on usage
  const isHigh = pct >= 80
  const isMedium = pct >= 50
  const barColor = isHigh ? 'bg-destructive' : isMedium ? 'bg-amber-500' : 'bg-emerald-500'
  const textColor = isHigh
    ? 'text-destructive'
    : isMedium
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-muted-foreground'

  const canCompact = isHigh && !isCompacting && !isProcessing && onCompact

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={canCompact ? onCompact : undefined}
          disabled={!canCompact}
          className={cn(
            'inline-flex items-center gap-1.5 h-6 px-2 rounded-[6px] text-[11px] font-medium select-none transition-colors',
            canCompact && 'cursor-pointer hover:bg-foreground/5',
            !canCompact && 'cursor-default',
          )}
        >
          {isCompacting && <Spinner className="h-3 w-3" />}

          {/* Mini progress bar */}
          <div className="w-8 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', barColor)}
              style={{ width: `${pct}%` }}
            />
          </div>

          <span className={cn('tabular-nums', textColor)}>{pct}%</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{t('chat.contextUsage')}</span>
          <span className="opacity-70">
            {formatTokenCount(inputTokens)} / {formatTokenCount(effectiveWindow)} {t('chat.tokens')}
          </span>
          {isCompacting && <span className="text-info">{t('chat.compacting')}</span>}
          {canCompact && <span className="text-muted-foreground">{t('chat.clickToCompact')}</span>}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
