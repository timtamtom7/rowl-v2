import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { PlanFrontmatter } from '@craft-agent/shared/plans'

interface PlanViewerModalProps {
  workspaceId: string
  workspaceRelativePath: string
  onClose: () => void
  onOpenSession: (sessionId: string) => void
  onOpenIssue: (issueId: string) => void
}

interface PlanData {
  frontmatter: PlanFrontmatter
  body: string
}

export function PlanViewerModal({
  workspaceId,
  workspaceRelativePath,
  onClose,
  onOpenSession,
  onOpenIssue,
}: PlanViewerModalProps) {
  const [plan, setPlan] = useState<PlanData | null>(null)
  const [sessionExists, setSessionExists] = useState<boolean | null>(null)
  const [issueExists, setIssueExists] = useState<boolean | null>(null)

  useEffect(() => {
    ;(async () => {
      const data = await window.electronAPI.plans.read(workspaceId, workspaceRelativePath) as PlanData | null
      setPlan(data)
      if (data) {
        setSessionExists(await sessionExistsCheck(data.frontmatter.sessionId))
        setIssueExists(
          data.frontmatter.issueId
            ? (await window.electronAPI.issues.read(workspaceId, data.frontmatter.issueId)) !== null
            : false,
        )
      }
    })()
  }, [workspaceId, workspaceRelativePath])

  if (!plan) return null

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {plan.frontmatter.title} (v{plan.frontmatter.planVersion}) — {new Date(plan.frontmatter.acceptedAt).toLocaleString()}
          </DialogTitle>
        </DialogHeader>
        <pre className="whitespace-pre-wrap font-mono text-sm max-h-[60vh] overflow-auto p-3 bg-muted/20 rounded">
          {plan.body}
        </pre>
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            disabled={sessionExists === false}
            onClick={() => onOpenSession(plan.frontmatter.sessionId)}
          >
            {sessionExists === false ? 'Session deleted' : 'Go to session'}
          </Button>
          <Button
            variant="outline"
            disabled={!issueExists}
            onClick={() => plan.frontmatter.issueId && onOpenIssue(plan.frontmatter.issueId)}
          >
            {!plan.frontmatter.issueId
              ? 'No linked issue'
              : issueExists === false
                ? 'Issue deleted'
                : 'Open issue'}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigator.clipboard.writeText(workspaceRelativePath)}
          >
            Copy path
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

async function sessionExistsCheck(sessionId: string): Promise<boolean> {
  try {
    const s = await window.electronAPI.getSessionMessages(sessionId)
    return s !== null && s !== undefined
  } catch {
    return false
  }
}
