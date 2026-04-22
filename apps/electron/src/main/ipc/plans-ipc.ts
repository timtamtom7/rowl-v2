import { ipcMain } from 'electron'
import { readFileSync } from 'fs'
import { glob } from 'glob'
import { join, relative } from 'path'
import matter from 'gray-matter'
import {
  copyPlanForward,
  readIssue,
  type Issue,
} from '@craft-agent/shared/issues'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import { loadWorkspaceConfig } from '@craft-agent/shared/workspaces'

export interface PlanListEntry {
  workspaceRelativePath: string
  issueId: string | null
  issueSlug: string | null
  sessionId: string
  acceptedAt: string
  planVersion: number
}

function resolveWorkspace(workspaceId: string): { rootPath: string; planStoragePath: string } {
  const ws = getWorkspaceByNameOrId(workspaceId)
  if (!ws) throw new Error(`Workspace not found: ${workspaceId}`)
  const wsConfig = loadWorkspaceConfig(ws.rootPath)
  const planStoragePath = wsConfig?.defaults?.planStoragePath ?? 'docs/plans'
  return { rootPath: ws.rootPath, planStoragePath }
}

/**
 * Register plan-related IPC handlers on the main process.
 * Must be called after `app.whenReady()` (inside the same init scope as other
 * local `ipcMain.handle(...)` registrations).
 */
export function registerPlansIpc(): void {
  ipcMain.handle(
    'plans:copy-forward',
    async (
      _e,
      workspaceId: string,
      sessionPlanPath: string,
      sessionId: string,
      issueId: string | undefined,
    ): Promise<string> => {
      const { rootPath, planStoragePath } = resolveWorkspace(workspaceId)
      const issue: Issue | undefined = issueId ? readIssue(rootPath, issueId) ?? undefined : undefined

      return copyPlanForward({
        sessionPlanPath,
        sessionId,
        issue,
        workspaceRoot: rootPath,
        planStoragePath,
        tz: 'local',
      })
    },
  )

  ipcMain.handle('plans:list', async (_e, workspaceId: string): Promise<PlanListEntry[]> => {
    const { rootPath, planStoragePath } = resolveWorkspace(workspaceId)
    const pattern = join(rootPath, planStoragePath, '**', 'plan-*.md')
    const files = await glob(pattern, { nodir: true })

    const entries: PlanListEntry[] = []
    for (const abs of files) {
      try {
        const content = readFileSync(abs, 'utf-8')
        const fm = matter(content).data as Record<string, unknown>
        entries.push({
          workspaceRelativePath: relative(rootPath, abs).split('\\').join('/'),
          issueId: (fm.issueId as string | null) ?? null,
          issueSlug: (fm.issueSlug as string | null) ?? null,
          sessionId: String(fm.sessionId ?? ''),
          acceptedAt: String(fm.acceptedAt ?? ''),
          planVersion: Number(fm.planVersion ?? 1),
        })
      } catch {
        // Skip malformed plan files — don't crash the list call.
      }
    }
    return entries.sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt))
  })

  ipcMain.handle(
    'plans:read',
    async (
      _e,
      workspaceId: string,
      workspaceRelativePath: string,
    ): Promise<{ frontmatter: PlanListEntry; body: string } | null> => {
      const { rootPath } = resolveWorkspace(workspaceId)
      const abs = join(rootPath, workspaceRelativePath)
      try {
        const text = readFileSync(abs, 'utf-8')
        const parsed = matter(text)
        const fm = parsed.data as Record<string, unknown>
        const frontmatter: PlanListEntry = {
          workspaceRelativePath,
          issueId: (fm.issueId as string | null) ?? null,
          issueSlug: (fm.issueSlug as string | null) ?? null,
          sessionId: String(fm.sessionId ?? ''),
          acceptedAt: String(fm.acceptedAt ?? ''),
          planVersion: Number(fm.planVersion ?? 1),
        }
        return { frontmatter, body: parsed.content }
      } catch {
        return null
      }
    },
  )
}
