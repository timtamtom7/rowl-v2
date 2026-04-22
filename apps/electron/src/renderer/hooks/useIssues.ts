import { useState, useEffect, useCallback } from 'react';
import type { Issue, IssueStatus, IssuePriority } from '@craft-agent/shared/issues';
import { createIssue, generateIssueId } from '@craft-agent/shared/issues';

const LEGACY_LS_KEY = 'craft-agent-issues';
const MIGRATION_PROMPT_KEY = 'craft-agent-issues-migration-prompted';

export interface UseIssuesResult {
  issues: Issue[];
  loading: boolean;
  migrationPending: number | null;
  addIssue: (
    title: string,
    options?: { description?: string; priority?: IssuePriority }
  ) => Promise<Issue>;
  updateIssue: (
    id: string,
    updates: Partial<Pick<Issue, 'title' | 'description' | 'status' | 'priority' | 'linkedSessionIds' | 'linkedPlanPaths' | 'attachments'>>
  ) => Promise<Issue | null>;
  updateIssueStatus: (id: string, status: IssueStatus) => Promise<Issue | null>;
  deleteIssue: (id: string) => Promise<boolean>;
  getIssue: (id: string) => Issue | null;
  getOpenCount: () => number;
  getIssuesByStatus: (status: IssueStatus) => Issue[];
  runMigration: () => Promise<{ migrated: number; failed: number }>;
  dismissMigrationPrompt: () => void;
}

export function useIssues(workspaceId: string | null): UseIssuesResult {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setIssues([]);
      return;
    }
    const list = await window.electronAPI.issues.list(workspaceId);
    setIssues(list);
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setMigrationPending(null);
      try {
        await refresh();
        if (!cancelled && workspaceId) {
          const raw = localStorage.getItem(LEGACY_LS_KEY);
          const dismissed = localStorage.getItem(MIGRATION_PROMPT_KEY) === 'dismissed';
          if (raw && !dismissed) {
            try {
              const legacy = JSON.parse(raw) as Array<unknown>;
              if (Array.isArray(legacy) && legacy.length > 0) {
                setMigrationPending(legacy.length);
              }
            } catch {
              // Malformed legacy data; ignore.
            }
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refresh, workspaceId]);

  const addIssue = useCallback<UseIssuesResult['addIssue']>(async (title, options) => {
    if (!workspaceId) throw new Error('useIssues.addIssue called without active workspace');
    const base = createIssue(title, options);
    const issue: Issue = { ...base, id: generateIssueId() };
    await window.electronAPI.issues.write(workspaceId, issue);
    await refresh();
    return issue;
  }, [workspaceId, refresh]);

  const updateIssue = useCallback<UseIssuesResult['updateIssue']>(async (id, updates) => {
    if (!workspaceId) return null;
    const current = await window.electronAPI.issues.read(workspaceId, id);
    if (!current) return null;
    const next: Issue = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await window.electronAPI.issues.write(workspaceId, next);
    await refresh();
    return next;
  }, [workspaceId, refresh]);

  const updateIssueStatus = useCallback<UseIssuesResult['updateIssueStatus']>(async (id, status) => {
    return updateIssue(id, { status });
  }, [updateIssue]);

  const deleteIssue = useCallback<UseIssuesResult['deleteIssue']>(async (id) => {
    if (!workspaceId) return false;
    await window.electronAPI.issues.delete(workspaceId, id);
    await refresh();
    return true;
  }, [workspaceId, refresh]);

  const getIssue = useCallback<UseIssuesResult['getIssue']>((id) => {
    return issues.find(i => i.id === id) ?? null;
  }, [issues]);

  const getOpenCount = useCallback<UseIssuesResult['getOpenCount']>(() => {
    return issues.filter(i => i.status !== 'done').length;
  }, [issues]);

  const getIssuesByStatus = useCallback<UseIssuesResult['getIssuesByStatus']>((status) => {
    return issues.filter(i => i.status === status);
  }, [issues]);

  const runMigration = useCallback<UseIssuesResult['runMigration']>(async () => {
    if (!workspaceId) return { migrated: 0, failed: 0 };
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (!raw) return { migrated: 0, failed: 0 };
    let legacy: Array<{
      id: string;
      title: string;
      description?: string;
      status: IssueStatus;
      priority: IssuePriority;
      createdAt: string;
      updatedAt: string;
      linkedSessionId?: string;
    }>;
    try {
      legacy = JSON.parse(raw);
    } catch {
      return { migrated: 0, failed: 0 };
    }

    let migrated = 0;
    let failed = 0;
    const remaining: typeof legacy = [];

    for (const old of legacy) {
      const issue: Issue = {
        id: old.id,
        title: old.title,
        description: old.description,
        status: old.status,
        priority: old.priority,
        createdAt: old.createdAt,
        updatedAt: old.updatedAt,
        linkedSessionIds: old.linkedSessionId ? [old.linkedSessionId] : [],
        linkedPlanPaths: [],
      };
      try {
        await window.electronAPI.issues.write(workspaceId, issue);
        migrated++;
      } catch {
        failed++;
        remaining.push(old);
      }
    }

    if (remaining.length === 0) {
      localStorage.removeItem(LEGACY_LS_KEY);
    } else {
      localStorage.setItem(LEGACY_LS_KEY, JSON.stringify(remaining));
    }

    setMigrationPending(null);
    await refresh();
    return { migrated, failed };
  }, [workspaceId, refresh]);

  const dismissMigrationPrompt = useCallback(() => {
    localStorage.setItem(MIGRATION_PROMPT_KEY, 'dismissed');
    setMigrationPending(null);
  }, []);

  return {
    issues,
    loading,
    migrationPending,
    addIssue,
    updateIssue,
    updateIssueStatus,
    deleteIssue,
    getIssue,
    getOpenCount,
    getIssuesByStatus,
    runMigration,
    dismissMigrationPrompt,
  };
}
