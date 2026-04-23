import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { PlanFrontmatter } from '@craft-agent/shared/plans'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  planRel: string
  plan: PlanFrontmatter
  defaultBaseBranch: string
  defaultStrategy: 'squash' | 'fast-forward'
  defaultAppendChangelog: boolean
  onMerged: (result: { mergeCommitSha: string; cleanupWarnings: string[] }) => void
}

export function MergeConfirmationModal({
  open,
  onOpenChange,
  workspaceId,
  planRel,
  plan,
  defaultBaseBranch,
  defaultStrategy,
  defaultAppendChangelog,
  onMerged,
}: Props) {
  const [baseBranch, setBaseBranch] = useState(defaultBaseBranch)
  const [strategy, setStrategy] = useState<'squash' | 'fast-forward'>(defaultStrategy)
  const [subject, setSubject] = useState(`${plan.type}: ${plan.title}`)
  const [body, setBody] = useState(
    `${plan.validationSummary ?? ''}\n\nPlan: ${planRel}\nIssue: ${plan.issueId ?? 'none'}`.trim(),
  )
  const [deleteBranchAfter, setDeleteBranchAfter] = useState(true)
  const [deleteWorktreeAfter, setDeleteWorktreeAfter] = useState(plan.worktreePath !== null)
  const [appendChangelog, setAppendChangelog] = useState(defaultAppendChangelog)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setBaseBranch(defaultBaseBranch)
    setStrategy(defaultStrategy)
    setSubject(`${plan.type}: ${plan.title}`)
    setBody(`${plan.validationSummary ?? ''}\n\nPlan: ${planRel}\nIssue: ${plan.issueId ?? 'none'}`.trim())
    setDeleteBranchAfter(true)
    setDeleteWorktreeAfter(plan.worktreePath !== null)
    setAppendChangelog(defaultAppendChangelog)
    setError(null)
  }, [open, plan, planRel, defaultBaseBranch, defaultStrategy, defaultAppendChangelog])

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      const result = await window.electronAPI.plansLifecycle.merge(workspaceId, planRel, {
        baseBranch,
        strategy,
        subject,
        body,
        deleteBranchAfter,
        deleteWorktreeAfter,
        appendChangelog,
      })
      onMerged(result)
      onOpenChange(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge plan to {baseBranch}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="merge-base">Target branch</Label>
            <Input id="merge-base" value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} disabled={busy} />
          </div>

          <div className="space-y-1">
            <Label>Strategy</Label>
            <RadioGroup value={strategy} onValueChange={(v) => setStrategy(v as 'squash' | 'fast-forward')}>
              <div className="flex items-center gap-2">
                <RadioGroupItem 
                  id="strategy-squash" 
                  value="squash" 
                  name="merge-strategy"
                  checked={strategy === "squash"}
                  onChange={() => setStrategy("squash")}
                />
                <Label htmlFor="strategy-squash">Squash (one commit on {baseBranch})</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem 
                  id="strategy-ff" 
                  value="fast-forward" 
                  name="merge-strategy"
                  checked={strategy === "fast-forward"}
                  onChange={() => setStrategy("fast-forward")}
                />
                <Label htmlFor="strategy-ff">Fast-forward</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-1">
            <Label htmlFor="merge-subject">Commit subject</Label>
            <Input id="merge-subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="merge-body">Commit body</Label>
            <Textarea id="merge-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} />
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={deleteBranchAfter} onCheckedChange={(v) => setDeleteBranchAfter(!!v)} disabled={busy} />
              Delete branch after merge
            </label>
            {plan.worktreePath !== null && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={deleteWorktreeAfter} onCheckedChange={(v) => setDeleteWorktreeAfter(!!v)} disabled={busy} />
                Delete worktree after merge
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={appendChangelog} onCheckedChange={(v) => setAppendChangelog(!!v)} disabled={busy} />
              Append to CHANGELOG.md
            </label>
          </div>

          {error && <div className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || subject.trim().length === 0}>
            {busy ? 'Merging…' : 'Merge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
