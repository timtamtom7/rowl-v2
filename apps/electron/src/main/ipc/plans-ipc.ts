import { ipcMain } from 'electron'
import { readFileSync } from 'fs'
import { glob } from 'glob'
import { join, relative, resolve, sep } from 'path'
import type { Issue } from '@craft-agent/shared/issues'
import {
  copyPlanForward,
  readIssue,
} from '@craft-agent/shared/issues/node'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import { loadWorkspaceConfig } from '@craft-agent/shared/workspaces'
import { parsePlanFile } from '@craft-agent/shared/plans/node'
import type { PlanFrontmatter } from '@craft-agent/shared/plans'

function assertWithinWorkspace(rootPath: string, candidateAbs: string): string {
  const normalizedRoot = resolve(rootPath)
  const normalizedAbs = resolve(candidateAbs)
  if (normalizedAbs !== normalizedRoot && !normalizedAbs.startsWith(normalizedRoot + sep)) {
    throw new Error('Path escape rejected')
  }
  return normalizedAbs
}

export interface PlanListEntry {
  workspaceRelativePath: string;
  frontmatter: PlanFrontmatter;
}

function resolveWorkspace(workspaceId: string): { rootPath: string; planStoragePath: string } {
  const ws = getWorkspaceByNameOrId(workspaceId)
  if (!ws) throw new Error(`Workspace not found: ${workspaceId}`)
  const wsConfig = loadWorkspaceConfig(ws.rootPath)
  const planStoragePath = wsConfig?.defaults?.planStoragePath ?? '.craft-agent/plans'
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

      // Containment: sessionPlanPath MUST live under the workspace root.
      assertWithinWorkspace(rootPath, sessionPlanPath)

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
        const text = readFileSync(abs, 'utf-8')
        const { frontmatter } = parsePlanFile(text)
        entries.push({
          workspaceRelativePath: relative(rootPath, abs).split('\\').join('/'),
          frontmatter,
        })
      } catch (err) {
        console.warn(`[plans-ipc] Skipped ${abs}: ${(err as Error).message}`)
      }
    }
    return entries.sort((a, b) =>
      b.frontmatter.acceptedAt.localeCompare(a.frontmatter.acceptedAt),
    )
  })

  ipcMain.handle(
    'plans:read',
    async (
      _e,
      workspaceId: string,
      workspaceRelativePath: string,
    ): Promise<{ frontmatter: PlanFrontmatter; body: string; workspaceRelativePath: string } | null> => {
      const { rootPath } = resolveWorkspace(workspaceId)
      const abs = assertWithinWorkspace(rootPath, join(rootPath, workspaceRelativePath))
      try {
        const text = readFileSync(abs, 'utf-8')
        const { frontmatter, body } = parsePlanFile(text)
        return { frontmatter, body, workspaceRelativePath }
      } catch {
        return null
      }
    },
  )
}
