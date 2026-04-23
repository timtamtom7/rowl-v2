import { useCallback, useEffect, useState } from 'react'
import type { PlanFrontmatter } from '@craft-agent/shared/plans'

export interface SessionPlanChip {
  plan: PlanFrontmatter | null
  planRel: string | null
  branches: string[]
  refresh: () => Promise<void>
}

/**
 * Loads the most-recent plan associated with `sessionId` (by matching
 * frontmatter.sessionId) and the local git branch list. Used to drive the
 * session-header chip and its dialogs.
 */
export function useSessionPlanChip(workspaceId: string | null, sessionId: string | null): SessionPlanChip {
  const [plan, setPlan] = useState<PlanFrontmatter | null>(null)
  const [planRel, setPlanRel] = useState<string | null>(null)
  const [branches, setBranches] = useState<string[]>([])

  const refresh = useCallback(async () => {
    if (!workspaceId || !sessionId) {
      setPlan(null); setPlanRel(null); return
    }
    const list = await window.electronAPI.plans.list(workspaceId)
    const mine = list.filter((e) => e.frontmatter.sessionId === sessionId)
      .sort((a, b) => b.frontmatter.acceptedAt.localeCompare(a.frontmatter.acceptedAt))
    const latest = mine[0]
    setPlan(latest ? latest.frontmatter : null)
    setPlanRel(latest ? latest.workspaceRelativePath : null)
    try {
      setBranches(await window.electronAPI.plansLifecycle.listBranches(workspaceId))
    } catch { setBranches([]) }
  }, [workspaceId, sessionId])

  useEffect(() => { void refresh() }, [refresh])

  return { plan, planRel, branches, refresh }
}
