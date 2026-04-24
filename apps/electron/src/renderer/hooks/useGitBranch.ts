import { useState, useEffect, useCallback, useRef } from 'react'

export interface GitBranch {
  name: string
  current: boolean
}

export interface GitStatus {
  branch: string | null
  isClean: boolean
  isRepo: boolean
}

export interface UseGitBranchResult {
  branch: string | null
  branches: GitBranch[]
  isRepo: boolean
  isClean: boolean
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  checkoutBranch: (branchName: string) => Promise<{ success: boolean; error?: string }>
  createBranch: (branchName: string) => Promise<{ success: boolean; error?: string }>
}

export function useGitBranch(cwd: string | undefined): UseGitBranchResult {
  const [branch, setBranch] = useState<string | null>(null)
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [isRepo, setIsRepo] = useState(false)
  const [isClean, setIsClean] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => { refresh() }, [cwd, refresh])

  const checkoutBranch = useCallback(async (branchName: string) => {
    const currentCwd = cwdRef.current
    if (!currentCwd) return { success: false, error: 'No working directory set' }
    try {
      const result = await window.electronAPI?.checkoutGitBranch?.(currentCwd, branchName)
      if (result?.success) await refresh()
      return result ?? { success: false, error: 'Git API not available' }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Checkout failed' }
    }
  }, [refresh])

  const createBranch = useCallback(async (branchName: string) => {
    const currentCwd = cwdRef.current
    if (!currentCwd) return { success: false, error: 'No working directory set' }
    try {
      const result = await window.electronAPI?.createGitBranch?.(currentCwd, branchName)
      if (result?.success) await refresh()
      return result ?? { success: false, error: 'Git API not available' }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Create branch failed' }
    }
  }, [refresh])

  return { branch, branches, isRepo, isClean, loading, error, refresh, checkoutBranch, createBranch }
}
