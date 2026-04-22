import { useCallback, useEffect, useState } from 'react'
import { PlanViewerModal } from './PlanViewerModal'

interface PlansPanelProps {
  workspaceId: string
  onOpenSession: (sessionId: string) => void
  onOpenIssue: (issueId: string) => void
}

interface PlanEntry {
  workspaceRelativePath: string
  issueId: string | null
  issueSlug: string | null
  sessionId: string
  acceptedAt: string
  planVersion: number
}

export function PlansPanel({ workspaceId, onOpenSession, onOpenIssue }: PlansPanelProps) {
  const [plans, setPlans] = useState<PlanEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setPlans(await window.electronAPI.plans.list(workspaceId))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Group by issueSlug, preserve newest-first order inside each group.
  const groups = plans.reduce<Record<string, PlanEntry[]>>((acc, p) => {
    const key = p.issueSlug ?? '_orphaned'
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  return (
    <div className="p-3 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Plans</h2>
        <button className="text-xs underline" onClick={refresh}>
          Refresh
        </button>
      </div>
      {loading && <div className="text-xs text-muted-foreground">Loading…</div>}
      {!loading && plans.length === 0 && (
        <div className="text-xs text-muted-foreground">
          No plans yet. Accept a plan in a session to see it here.
        </div>
      )}
      {Object.entries(groups).map(([slug, entries]) => (
        <div key={slug} className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">{slug}</div>
          <ul className="space-y-0.5">
            {entries.map((p) => (
              <li key={p.workspaceRelativePath}>
                <button
                  className="text-xs underline text-left"
                  onClick={() => setSelected(p.workspaceRelativePath)}
                >
                  v{p.planVersion} — {new Date(p.acceptedAt).toLocaleString()}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {selected && (
        <PlanViewerModal
          workspaceId={workspaceId}
          workspaceRelativePath={selected}
          onClose={() => setSelected(null)}
          onOpenSession={onOpenSession}
          onOpenIssue={onOpenIssue}
        />
      )}
    </div>
  )
}
