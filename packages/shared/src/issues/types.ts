/**
 * Issue Types
 *
 * Issues are lightweight task containers for capturing ideas without starting a session.
 * They are workspace-scoped and stored locally.
 */

export type IssueStatus = 'backlog' | 'todo' | 'in_progress' | 'done';
export type IssuePriority = 'low' | 'medium' | 'high';

export interface Issue {
  id: string;
  title: string;
  description?: string;           // markdown body
  status: IssueStatus;
  priority: IssuePriority;
  createdAt: string;              // ISO 8601
  updatedAt: string;              // ISO 8601
  linkedSessionIds: string[];     // required; [] when none
  linkedPlanPaths: string[];      // required; [] when none (workspace-relative paths)
  attachments?: string[];         // optional; workspace-relative paths under issues/{id}/attachments/
}

/**
 * Create a new issue with default values
 */
export function createIssue(
  title: string,
  options?: Partial<Pick<Issue, 'description' | 'priority'>>,
): Omit<Issue, 'id'> {
  const now = new Date().toISOString();
  return {
    title,
    description: options?.description,
    status: 'backlog',
    priority: options?.priority ?? 'medium',
    createdAt: now,
    updatedAt: now,
    linkedSessionIds: [],
    linkedPlanPaths: [],
  };
}

/**
 * Generate a unique issue ID
 */
export function generateIssueId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `issue_${hex}`;
}

/**
 * Status display info
 */
export const ISSUE_STATUS_INFO: Record<IssueStatus, { label: string; icon: string; color: string }> = {
  backlog: { label: 'Backlog', icon: '○', color: 'text-muted-foreground' },
  todo: { label: 'Todo', icon: '●', color: 'text-muted-foreground' },
  in_progress: { label: 'In Progress', icon: '◐', color: 'text-yellow-500' },
  done: { label: 'Done', icon: '✓', color: 'text-green-500' },
};

/**
 * Get the next status in the workflow
 */
export function getNextStatus(current: IssueStatus): IssueStatus {
  const order: IssueStatus[] = ['backlog', 'todo', 'in_progress', 'done'];
  const idx = order.indexOf(current);
  if (idx === -1 || idx === order.length - 1) return current;
  return order[idx + 1] ?? current;
}

/**
 * Get the previous status in the workflow
 */
export function getPreviousStatus(current: IssueStatus): IssueStatus {
  const order: IssueStatus[] = ['backlog', 'todo', 'in_progress', 'done'];
  const idx = order.indexOf(current);
  if (idx <= 0) return current;
  return order[idx - 1] ?? current;
}
