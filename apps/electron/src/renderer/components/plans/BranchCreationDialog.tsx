import { useEffect, useMemo, useState } from 'react'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { resolveBranchName, type PlanFrontmatter } from '@craft-agent/shared/plans'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  planRel: string
  plan: PlanFrontmatter
  existingBranches: string[]
  defaultBranchMode: 'worktree' | 'inline'
  defaultBaseBranch: string
  onCreated: (result: { branchName: string; worktreePath: string | null }) => void
}

export function BranchCreationDialog({
  open,
  onOpenChange,
  workspaceId,
  planRel,
  plan,
  existingBranches,
  defaultBranchMode,
  defaultBaseBranch,
  onCreated,
}: Props) {
  const defaultName = useMemo(
    () => resolveBranchName({ type: plan.type, title: plan.title }, existingBranches),
    [plan.type, plan.title, existingBranches],
  )

  const [branchName, setBranchName] = useState(defaultName)
  const [mode, setMode] = useState<'worktree' | 'inline'>(defaultBranchMode)
  const [baseBranch, setBaseBranch] = useState(defaultBaseBranch)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setBranchName(defaultName)
      setMode(defaultBranchMode)
      setBaseBranch(defaultBaseBranch)
      setError(null)
    }
  }, [open, defaultName, defaultBranchMode, defaultBaseBranch])

  const collides = existingBranches.map((b) => b.toLowerCase()).includes(branchName.toLowerCase())

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      const result = await window.electronAPI.plansLifecycle.createBranch(
        workspaceId,
        planRel,
        { branchName, mode, baseBranch },
      )
      onCreated(result)
      onOpenChange(false)
    } catch (err) {
      setError((err as Error).message ?? 'Branch creation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create branch for plan</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="branch-name">Branch name</Label>
            <Input
              id="branch-name"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              disabled={busy}
            />
            {collides && (
              <p className="text-xs text-destructive">A branch with this name already exists locally.</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Mode</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'worktree' | 'inline')}>
              <div className="flex items-start gap-2">
                <RadioGroupItem 
                  id="mode-worktree" 
                  value="worktree" 
                  name="branch-mode"
                  checked={mode === "worktree"}
                  onChange={() => setMode("worktree")}
                />
                <div>
                  <Label htmlFor="mode-worktree" className="font-medium">Worktree (default)</Label>
                  <p className="text-xs text-muted-foreground">
                    Isolated checkout at <code>.worktrees/{branchName.replace(/\//g, '-')}/</code>. Your current
                    working tree keeps its state.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem 
                  id="mode-inline" 
                  value="inline" 
                  name="branch-mode"
                  checked={mode === "inline"}
                  onChange={() => setMode("inline")}
                />
                <div>
                  <Label htmlFor="mode-inline" className="font-medium">Inline</Label>
                  <p className="text-xs text-muted-foreground">
                    Check out in the main working tree. Faster but your current tree switches branches.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-1">
            <Label htmlFor="base-branch">Base branch</Label>
            <Input
              id="base-branch"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              disabled={busy}
            />
          </div>

          {error && <div className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || collides || branchName.trim().length === 0}>
            {busy ? 'Creating…' : 'Create & switch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
