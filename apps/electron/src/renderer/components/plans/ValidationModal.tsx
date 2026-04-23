import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  planRel: string
  onValidated: (summary: string) => void
}

const CHECKLIST_ITEMS: { id: string; label: string }[] = [
  { id: 'tests', label: 'Tests pass locally' },
  { id: 'smoke', label: 'Manual smoke test done' },
  { id: 'docs', label: 'Docs updated if applicable' },
  { id: 'scope', label: 'No unrelated changes' },
]

export function ValidationModal({ open, onOpenChange, workspaceId, planRel, onValidated }: Props) {
  const [summary, setSummary] = useState('')
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setChecks({})
    setBusy(true)
    void (async () => {
      try {
        const { draft } = await window.electronAPI.plansLifecycle.startValidation(workspaceId, planRel)
        setSummary(draft)
      } catch (err) {
        setError((err as Error).message)
        setSummary('')
      } finally {
        setBusy(false)
      }
    })()
  }, [open, workspaceId, planRel])

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await window.electronAPI.plansLifecycle.markValidated(workspaceId, planRel, summary)
      onValidated(summary)
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
          <DialogTitle>Validate plan</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="validation-summary">Summary</Label>
            <Textarea
              id="validation-summary"
              rows={8}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What changed, what was verified. This text becomes the merge commit body + changelog entry."
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <Label>Sanity check</Label>
            <div className="space-y-1">
              {CHECKLIST_ITEMS.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!!checks[item.id]}
                    onCheckedChange={(v) => setChecks((c) => ({ ...c, [item.id]: !!v }))}
                    disabled={busy}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>

          {error && <div className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || summary.trim().length === 0}>
            {busy ? 'Saving…' : 'Approve & continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
