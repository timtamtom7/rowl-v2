import { ipcMain } from 'electron'
import { createHash } from 'crypto'
import type { Issue } from '@craft-agent/shared/issues'
import {
  deleteIssue,
  listIssues,
  readIssue,
  writeAttachment,
  writeIssue,
} from '@craft-agent/shared/issues/node'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'

function resolveRoot(workspaceId: string): string {
  const ws = getWorkspaceByNameOrId(workspaceId)
  if (!ws) throw new Error(`Workspace not found: ${workspaceId}`)
  return ws.rootPath
}

function sanitizeExt(ext: string): string {
  return ext.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase() || 'bin'
}

function assertSafeId(id: string, label: string = 'id'): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(id)}`)
  }
}

/**
 * Register issue-related IPC handlers on the main process.
 * Must be called after `app.whenReady()` (inside the same init scope as other
 * local `ipcMain.handle(...)` registrations).
 */
export function registerIssuesIpc(): void {
  ipcMain.handle('issues:list', async (_e, workspaceId: string): Promise<Issue[]> => {
    return listIssues(resolveRoot(workspaceId))
  })

  ipcMain.handle('issues:read', async (_e, workspaceId: string, issueId: string): Promise<Issue | null> => {
    assertSafeId(issueId, 'issueId')
    return readIssue(resolveRoot(workspaceId), issueId)
  })

  ipcMain.handle('issues:write', async (_e, workspaceId: string, issue: Issue): Promise<void> => {
    assertSafeId(issue.id, 'issue.id')
    writeIssue(resolveRoot(workspaceId), issue)
  })

  ipcMain.handle('issues:delete', async (_e, workspaceId: string, issueId: string): Promise<void> => {
    assertSafeId(issueId, 'issueId')
    deleteIssue(resolveRoot(workspaceId), issueId)
  })

  ipcMain.handle(
    'issues:write-attachment',
    async (
      _e,
      workspaceId: string,
      issueId: string,
      ext: string,
      bytes: Uint8Array,
    ): Promise<{ path: string; hash: string }> => {
      assertSafeId(issueId, 'issueId')
      if (bytes.byteLength > 10 * 1024 * 1024) {
        throw new Error('Attachment exceeds 10 MB limit')
      }
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
      const filename = `${hash}.${sanitizeExt(ext)}`
      const path = writeAttachment(resolveRoot(workspaceId), issueId, filename, bytes)
      return { path, hash }
    },
  )
}
