import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatBreadcrumbText } from './WorkspaceBreadcrumb.helpers';
import type { Workspace } from '../../../shared/types';

// Re-export so downstream code that follows the spec's import path still works.
export { formatBreadcrumbText };

export interface WorkspaceBreadcrumbProps {
  workspace: Workspace | null;
  sessionName: string | null;
  onRenameSession?: () => void;
}

export function WorkspaceBreadcrumb({
  workspace,
  sessionName,
  onRenameSession,
}: WorkspaceBreadcrumbProps) {
  const workspaceName = workspace?.name ?? null;

  return (
    <div className="flex items-center gap-1 min-w-0">
      <span
        className={cn(
          'max-w-[240px] px-2 py-1 text-sm font-medium truncate',
        )}
      >
        {workspaceName ?? 'No workspace'}
      </span>

      {sessionName && (
        <>
          <span className="text-muted-foreground/60 shrink-0" aria-hidden="true">›</span>
          <button
            type="button"
            onClick={onRenameSession}
            className={cn(
              'max-w-[320px] px-2 py-1 rounded-md text-sm truncate hover:bg-accent',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'text-muted-foreground hover:text-foreground',
            )}
            aria-label="Rename session"
          >
            {sessionName}
          </button>
        </>
      )}
    </div>
  );
}
