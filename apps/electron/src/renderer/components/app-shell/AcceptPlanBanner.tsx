import { useEffect, useState } from 'react'
import type { PlanFrontmatter } from '@craft-agent/shared/plans'
import { Button } from '@/components/ui/button'
import { BranchCreationDialog } from '@/components/plans/BranchCreationDialog'
import { ValidationModal } from '@/components/plans/ValidationModal'
import { MergeConfirmationModal } from '@/components/plans/MergeConfirmationModal'
import { PlanStateBadge } from '@/components/plans/PlanStateBadge'

interface Props {
  sessionId: string
  workspaceId: string
}

export function AcceptPlanBanner({ sessionId, workspaceId }: Props) {
  const [planRel, setPlanRel] = useState<string | null>(null)
  const [plan, setPlan] = useState<PlanFrontmatter | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [dialog, setDialog] = useState<'branch' | 'validate' | 'merge' | null>(null)

  useEffect(() => {
    async function handler(e: Event) {
      const detail = (e as CustomEvent<{ sessionId: string; workspaceRelativePath: string }>).detail
      if (!detail || detail.sessionId !== sessionId) return
      setPlanRel(detail.workspaceRelativePath)
      const res = await window.electronAPI.plans.read(workspaceId, detail.workspaceRelativePath)
      if (res) setPlan(res.frontmatter)
      try {
        setBranches(await window.electronAPI.plansLifecycle.listBranches(workspaceId))
      } catch { setBranches([]) }
    }
    window.addEventListener('craft:plan-accepted', handler)
    return () => window.removeEventListener('craft:plan-accepted', handler)
  }, [sessionId, workspaceId])

  async function refreshPlan() {
    if (!planRel) return
    const res = await window.electronAPI.plans.read(workspaceId, planRel)
    if (res) setPlan(res.frontmatter)
  }

  if (!planRel || !plan) return null

  return (
    <div className="mx-4 my-2 rounded border bg-muted/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <PlanStateBadge state={plan.state} />
        <span className="text-sm font-medium">{plan.title}</span>
        <div className="ml-auto flex gap-2">
          {plan.state === 'accepted' && (
            <Button size="sm" variant="outline" onClick={() => setDialog('branch')}>Create branch</Button>
          )}
          {plan.state === 'in-progress' && (
            <Button size="sm" variant="outline" onClick={() => setDialog('validate')}>Validate</Button>
          )}
          {plan.state === 'validated' && (
            <Button size="sm" onClick={() => setDialog('merge')}>Merge</Button>
          )}
          {plan.state === 'merged' && plan.mergeCommitSha && (
            <code className="text-xs bg-muted px-1 rounded">{plan.mergeCommitSha}</code>
          )}
        </div>
      </div>

      {dialog === 'branch' && (
        <BranchCreationDialog
          open
          onOpenChange={(o) => { if (!o) setDialog(null) }}
          workspaceId={workspaceId}
          planRel={planRel}
          plan={plan}
          existingBranches={branches}
          defaultBranchMode="worktree"
          defaultBaseBranch="main"
          onCreated={() => { void refreshPlan() }}
        />
      )}
      {dialog === 'validate' && (
        <ValidationModal
          open
          onOpenChange={(o) => { if (!o) setDialog(null) }}
          workspaceId={workspaceId}
          planRel={planRel}
          onValidated={() => { void refreshPlan() }}
        />
      )}
      {dialog === 'merge' && (
        <MergeConfirmationModal
          open
          onOpenChange={(o) => { if (!o) setDialog(null) }}
          workspaceId={workspaceId}
          planRel={planRel}
          plan={plan}
          defaultBaseBranch="main"
          defaultStrategy="squash"
          defaultAppendChangelog={true}
          onMerged={() => { void refreshPlan() }}
        />
      )}
    </div>
  )
}
