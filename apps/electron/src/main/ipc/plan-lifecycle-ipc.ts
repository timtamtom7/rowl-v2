import { ipcMain } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { PlanFrontmatter } from '@craft-agent/shared/plans'
import {
  markValidated,
  prependChangelogEntry,
  PlanLifecycleError,
  CHANGELOG_TEMPLATE,
} from '@craft-agent/shared/plans'
import { parsePlanFile, renderPlanFile } from '@craft-agent/shared/plans/node'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import { loadWorkspaceConfig } from '@craft-agent/shared/workspaces'
import {
  createBranchForPlan,
  mergePlan,
} from '../git/plan-git-flow.ts'
import type { BranchMode, MergeStrategy } from '../git/plan-git-flow.ts'
import { listBranches } from '../git/git-commands.ts'

interface ResolveResult {
  rootPath: string
}

function resolveWorkspace(workspaceId: string): ResolveResult {
  const ws = getWorkspaceByNameOrId(workspaceId)
  if (!ws) throw new Error(`Workspace not found: ${workspaceId}`)
  return { rootPath: ws.rootPath }
}

function resolvePlanAbs(rootPath: string, relPath: string): string {
  const abs = join(rootPath, relPath)
  // Minimal containment check.
  if (!abs.startsWith(rootPath)) {
    throw new Error('Plan path escapes workspace root')
  }
  return abs
}

function readPlanFrontmatter(planAbs: string): { frontmatter: PlanFrontmatter; body: string; extras: Record<string, unknown> } {
  return parsePlanFile(readFileSync(planAbs, 'utf-8'))
}

function writePlanFrontmatter(planAbs: string, fm: PlanFrontmatter, body: string, extras: Record<string, unknown>): void {
  writeFileSync(planAbs, renderPlanFile(fm, body, extras))
}

export interface CreateBranchArgs {
  branchName: string
  mode: BranchMode
  baseBranch: string
}

export interface MergeArgs {
  baseBranch: string
  strategy: MergeStrategy
  subject: string
  body: string
  deleteBranchAfter: boolean
  deleteWorktreeAfter: boolean
  appendChangelog: boolean
}

export function registerPlanLifecycleIpc(): void {
  ipcMain.handle(
    'plans:create-branch',
    async (_e, workspaceId: string, planRel: string, args: CreateBranchArgs) => {
      const { rootPath } = resolveWorkspace(workspaceId)
      const planAbs = resolvePlanAbs(rootPath, planRel)
      return createBranchForPlan({
        repoRoot: rootPath,
        planAbsPath: planAbs,
        branchName: args.branchName,
        mode: args.mode,
        baseBranch: args.baseBranch,
        now: new Date(),
      })
    },
  )

  ipcMain.handle(
    'plans:start-validation',
    async (_e, workspaceId: string, planRel: string): Promise<{ draft: string }> => {
      // v1: return an empty draft. The validation modal lets the user write the
      // summary manually. A future enhancement will invoke the session agent to
      // pre-fill the draft; tracked in spec §12.
      const { rootPath } = resolveWorkspace(workspaceId)
      resolvePlanAbs(rootPath, planRel) // containment check; throws on escape
      return { draft: '' }
    },
  )

  ipcMain.handle(
    'plans:mark-validated',
    async (_e, workspaceId: string, planRel: string, summary: string) => {
      const { rootPath } = resolveWorkspace(workspaceId)
      const planAbs = resolvePlanAbs(rootPath, planRel)
      const { frontmatter, body, extras } = readPlanFrontmatter(planAbs)
      let next: PlanFrontmatter
      try {
        next = markValidated(frontmatter, { validationSummary: summary, now: new Date() })
      } catch (err) {
        if (err instanceof PlanLifecycleError) throw new Error(err.message)
        throw err
      }
      writePlanFrontmatter(planAbs, next, body, extras)
      return { ok: true as const }
    },
  )

  ipcMain.handle(
    'plans:merge',
    async (_e, workspaceId: string, planRel: string, args: MergeArgs) => {
      const { rootPath } = resolveWorkspace(workspaceId)
      const planAbs = resolvePlanAbs(rootPath, planRel)

      const result = await mergePlan({
        repoRoot: rootPath,
        planAbsPath: planAbs,
        baseBranch: args.baseBranch,
        strategy: args.strategy,
        subject: args.subject,
        body: args.body,
        deleteBranchAfter: args.deleteBranchAfter,
        deleteWorktreeAfter: args.deleteWorktreeAfter,
        now: new Date(),
      })

      if (args.appendChangelog) {
        const { frontmatter } = readPlanFrontmatter(planAbs)
        const changelogAbs = join(rootPath, 'CHANGELOG.md')
        const existing = existsSync(changelogAbs) ? readFileSync(changelogAbs, 'utf-8') : CHANGELOG_TEMPLATE
        const next = prependChangelogEntry(existing, {
          type: frontmatter.type,
          title: frontmatter.title,
          sha: result.mergeCommitSha,
        })
        writeFileSync(changelogAbs, next)
      }

      return result
    },
  )

  ipcMain.handle('plans:list-branches', async (_e, workspaceId: string): Promise<string[]> => {
    const { rootPath } = resolveWorkspace(workspaceId)
    return listBranches(rootPath)
  })
}
