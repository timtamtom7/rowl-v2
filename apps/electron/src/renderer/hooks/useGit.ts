import { useState, useEffect, useCallback, useRef } from 'react'

export interface GitBranch {
  name: string
  current: boolean
}

export interface GitDetailedStatus {
  branch: string | null
  ahead: number
  behind: number
  modified: string[]
  staged: string[]
  untracked: string[]
  isClean: boolean
  isRepo: boolean
}

export interface UseGitResult {
  // Branch ops
  branch: string | null
  branches: GitBranch[]
  isRepo: boolean
  isClean: boolean
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  checkoutBranch: (branchName: string) => Promise<{ success: boolean; error?: string }>
  createBranch: (branchName: string) => Promise<{ success: boolean; error?: string }>

  // Detailed status
  detailedStatus: GitDetailedStatus | null
  statusLoading: boolean
  refreshStatus: () => Promise<void>

  // Commit
  commit: (message: string, files?: string[]) => Promise<{ success: boolean; error?: string; commitSha?: string }>
  committing: boolean

  // Diff
  diff: (filePath?: string) => Promise<{ diff: string; error?: string }>
  diffLoading: boolean

  // Stage / unstage / discard
  stage: (files: string[]) => Promise<{ success: boolean; error?: string }>
  unstage: (files: string[]) => Promise<{ success: boolean; error?: string }>
  discard: (files: string[]) => Promise<{ success: boolean; error?: string }>
}

export function useGit(cwd: string | undefined): UseGitResult {
  const [branch, setBranch] = useState<string | null>(null)
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [isRepo, setIsRepo] = useState(false)
  const [isClean, setIsClean] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [detailedStatus, setDetailedStatus] = useState<GitDetailedStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)

  const [committing, setCommitting] = useState(false)
  const [diffLoading, setDiffLoading] = useState(false)

  const cwdRef = useRef(cwd)
  useEffect(() => { cwdRef.current = cwd }, [cwd])

  const refresh = useCallback(async () => {
    const currentCwd = cwdRef.current
    if (!currentCwd) {
      setBranch(null); setBranches([]); setIsRepo(false); setIsClean(true); setError(null)
      return
    }
    setLoading(true); setError(null)
    try {
      const [statusResult, branchesResult] = await Promise.all([
        window.electronAPI?.getGitStatus?.(currentCwd) ?? Promise.resolve({ branch: null, isClean: true, isRepo: false }),
        window.electronAPI?.listGitBranches?.(currentCwd) ?? Promise.resolve({ branches: [], isRepo: false }),
      ])
      if (cwdRef.current === currentCwd) {
        setBranch(statusResult.branch)
        setIsClean(statusResult.isClean)
        setIsRepo(statusResult.isRepo)
        setBranches(branchesResult.branches)
      }
    } catch (err) {
      if (cwdRef.current === currentCwd) {
        setError(err instanceof Error ? err.message : 'Failed to fetch git status')
      }
    } finally {
      if (cwdRef.current === currentCwd) setLoading(false)
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    const currentCwd = cwdRef.current
    if (!currentCwd) { setDetailedStatus(null); return }
    setStatusLoading(true)
    try {
      const result = await window.electronAPI?.getGitDetailedStatus?.(currentCwd)
      if (cwdRef.current === currentCwd && result) setDetailedStatus(result)
    } catch (err) {
      // silently fail for status polling
    } finally {
      if (cwdRef.current === currentCwd) setStatusLoading(false)
    }
  }, [])

  // Auto-refresh branches when cwd changes
  useEffect(() => { refresh() }, [cwd, refresh])

  // Poll detailed status every 10s when repo is active
  useEffect(() => {
    if (!cwd || !isRepo) { setDetailedStatus(null); return }
    refreshStatus()
    const interval = setInterval(refreshStatus, 10_000)
    return () => clearInterval(interval)
  }, [cwd, isRepo, refreshStatus])

  const checkoutBranch = useCallback(async (branchName: string) => {
    const currentCwd = cwdRef.current
    if (!currentCwd) return { success: false, error: 'No working directory set' }
    try {
      const result = await window.electronAPI?.checkoutGitBranch?.(currentCwd, branchName)
      if (result?.success) { await refresh(); await refreshStatus() }
      return result ?? { success: false, error: 'Git API not available' }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Checkout failed' }
    }
  }, [refresh, refreshStatus])

  const createBranch = useCallback(async (branchName: string) => {
    const currentCwd = cwdRef.current
    if (!currentCwd) return { success: false, error: 'No working directory set' }
    try {
      const result = await window.electronAPI?.createGitBranch?.(currentCwd, branchName)
      if (result?.success) { await refresh(); await refreshStatus() }
      return result ?? { success: false, error: 'Git API not available' }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Create branch failed' }
    }
  }, [refresh, refreshStatus])

  const commit = useCallback(async (message: string, files?: string[]) => {
    const currentCwd = cwdRef.current
    if (!currentCwd) return { success: false, error: 'No working directory set' }
    setCommitting(true)
    try {
      const result = await window.electronAPI?.commitGitChanges?.(currentCwd, message, files)
      if (result?.success) { await refreshStatus() }
      return result ?? { success: false, error: 'Git API not available' }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Commit failed' }
    } finally {
      setCommitting(false)
    }
  }, [refreshStatus])

  const diff = useCallback(async (filePath?: string) => {
    const currentCwd = cwdRef.current
    if (!currentCwd) return { diff: '', error: 'No working directory set' }
    setDiffLoading(true)
    try {
      const result = await window.electronAPI?.getGitDiff?.(currentCwd, filePath)
      return result ?? { diff: '', error: 'Git API not available' }
    } catch (err) {
      return { diff: '', error: err instanceof Error ? err.message : 'Diff failed' }
    } finally {
      setDiffLoading(false)
    }
  }, [])

  const stage = useCallback(async (files: string[]) => {
    const currentCwd = cwdRef.current
    if (!currentCwd) return { success: false, error: 'No working directory set' }
    try {
      const result = await window.electronAPI?.stageGitFiles?.(currentCwd, files)
      if (result?.success) { await refreshStatus() }
      return result ?? { success: false, error: 'Git API not available' }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Stage failed' }
    }
  }, [refreshStatus])

  const unstage = useCallback(async (files: string[]) => {
    const currentCwd = cwdRef.current
    if (!currentCwd) return { success: false, error: 'No working directory set' }
    try {
      const result = await window.electronAPI?.unstageGitFiles?.(currentCwd, files)
      if (result?.success) { await refreshStatus() }
      return result ?? { success: false, error: 'Git API not available' }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unstage failed' }
    }
  }, [refreshStatus])

  const discard = useCallback(async (files: string[]) => {
    const currentCwd = cwdRef.current
    if (!currentCwd) return { success: false, error: 'No working directory set' }
    try {
      const result = await window.electronAPI?.discardGitFiles?.(currentCwd, files)
      if (result?.success) { await refreshStatus() }
      return result ?? { success: false, error: 'Git API not available' }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Discard failed' }
    }
  }, [refreshStatus])

  return {
    branch, branches, isRepo, isClean, loading, error, refresh,
    checkoutBranch, createBranch,
    detailedStatus, statusLoading, refreshStatus,
    commit, committing,
    diff, diffLoading,
    stage, unstage, discard,
  }
}
