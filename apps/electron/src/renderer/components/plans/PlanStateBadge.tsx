import { cn } from '@/lib/utils'
import type { PlanState } from '@craft-agent/shared/plans'

const STATE_STYLES: Record<PlanState, { label: string; className: string }> = {
  accepted: { label: 'Accepted', className: 'bg-muted text-muted-foreground' },
  'in-progress': { label: 'In progress', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  validated: { label: 'Validated', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  merged: { label: 'Merged', className: 'bg-green-500/15 text-green-700 dark:text-green-400' },
}

export function PlanStateBadge({ state, className }: { state: PlanState; className?: string }) {
  const { label, className: stateClass } = STATE_STYLES[state]
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', stateClass, className)}>
      {label}
    </span>
  )
}
