import { useCallback } from 'react';
import type { Issue } from '@craft-agent/shared/issues';
import { formatFirstTurnContext } from '@craft-agent/shared/issues';

type IssueUpdates = Partial<
  Pick<Issue, 'title' | 'description' | 'status' | 'priority' | 'linkedSessionIds' | 'linkedPlanPaths' | 'attachments'>
>;

export interface StartSessionFromIssueDeps {
  workspaceId: string;
  updateIssue: (id: string, updates: IssueUpdates) => Promise<Issue | null>;
  onSessionCreated?: (sessionId: string) => void;
}

export function useStartSessionFromIssue(deps: StartSessionFromIssueDeps) {
  const { workspaceId, updateIssue, onSessionCreated } = deps;

  return useCallback(
    async (issue: Issue): Promise<string> => {
      const summary = formatFirstTurnContext(issue);
      const session = await window.electronAPI.createSession(workspaceId, {
        name: issue.title,
        permissionMode: 'safe',
        transferredSessionSummary: summary,
        linkedIssueId: issue.id,
      });

      const sessionId = session.id;

      await updateIssue(issue.id, {
        linkedSessionIds: [...issue.linkedSessionIds, sessionId],
        status: issue.status === 'backlog' ? 'in_progress' : issue.status,
      });

      onSessionCreated?.(sessionId);
      return sessionId;
    },
    [workspaceId, updateIssue, onSessionCreated]
  );
}
