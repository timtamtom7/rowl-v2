import { useState, useEffect, useCallback } from "react"
import type { Issue, IssueStatus, IssuePriority } from "@craft-agent/shared/issues"

const STORAGE_KEY = "craft-agent-issues"

function generateId(): string {
  return `issue_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function loadFromStorage(): Issue[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Issue[]
  } catch {
    return []
  }
}

function saveToStorage(issues: Issue[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(issues))
}

export function useIssues() {
  const [issues, setIssues] = useState<Issue[]>([])

  // Load from storage on mount
  useEffect(() => {
    setIssues(loadFromStorage())
  }, [])

  const addIssue = useCallback((
    title: string,
    options?: { description?: string; priority?: IssuePriority }
  ): Issue => {
    const now = new Date().toISOString()
    const issue: Issue = {
      id: generateId(),
      title,
      description: options?.description,
      status: "backlog",
      priority: options?.priority ?? "medium",
      createdAt: now,
      updatedAt: now,
    }

    setIssues(prev => {
      const updated = [issue, ...prev]
      saveToStorage(updated)
      return updated
    })

    return issue
  }, [])

  const updateIssue = useCallback((
    id: string,
    updates: Partial<Pick<Issue, "title" | "description" | "status" | "priority">>
  ): Issue | null => {
    let updated: Issue | null = null

    setIssues(prev => {
      const index = prev.findIndex(i => i.id === id)
      if (index === -1) return prev

      const issue = prev[index]
      updated = {
        ...issue,
        ...updates,
        updatedAt: new Date().toISOString(),
      }

      const next = [...prev]
      next[index] = updated
      saveToStorage(next)
      return next
    })

    return updated
  }, [])

  const updateIssueStatus = useCallback((
    id: string,
    status: IssueStatus
  ): Issue | null => {
    return updateIssue(id, { status })
  }, [updateIssue])

  const deleteIssue = useCallback((id: string): boolean => {
    let found = false

    setIssues(prev => {
      const index = prev.findIndex(i => i.id === id)
      if (index === -1) return prev
      found = true

      const next = prev.filter(i => i.id !== id)
      saveToStorage(next)
      return next
    })

    return found
  }, [])

  const getIssue = useCallback((id: string): Issue | null => {
    return issues.find(i => i.id === id) ?? null
  }, [issues])

  const getOpenCount = useCallback((): number => {
    return issues.filter(i => i.status !== "done").length
  }, [issues])

  const getIssuesByStatus = useCallback((status: IssueStatus): Issue[] => {
    return issues.filter(i => i.status === status)
  }, [issues])

  return {
    issues,
    addIssue,
    updateIssue,
    updateIssueStatus,
    deleteIssue,
    getIssue,
    getOpenCount,
    getIssuesByStatus,
  }
}
