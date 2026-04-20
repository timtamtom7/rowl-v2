import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { StyledDropdownMenuContent, StyledDropdownMenuItem } from '@/components/ui/styled-dropdown';
import { cn } from '@/lib/utils';
import { formatBreadcrumbText } from './WorkspaceBreadcrumb.helpers';
import type { Workspace } from '../../../shared/types';

// Re-export so downstream code that follows the spec's import path still works.
export { formatBreadcrumbText };

export interface WorkspaceBreadcrumbProps {
  workspace: Workspace | null;
  sessionName: string | null;
  workspaces: Workspace[];
  onSelectWorkspace: (workspaceId: string) => void | Promise<void>;
  onRenameSession?: () => void;
}

export function WorkspaceBreadcrumb({
  workspace,
  sessionName,
  workspaces,
  onSelectWorkspace,
  onRenameSession,
}: WorkspaceBreadcrumbProps) {
  const workspaceName = workspace?.name ?? null;

  return (
    <div className="flex items-center gap-1 min-w-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Switch workspace"
            className={cn(
              'flex items-center gap-1 max-w-[240px] px-2 py-1 rounded-md',
              'text-sm font-medium truncate hover:bg-accent',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            )}
          >
            <span className="truncate">{workspaceName ?? 'No workspace'}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <StyledDropdownMenuContent align="start" minWidth="min-w-56">
          {workspaces.map((w) => (
            <StyledDropdownMenuItem
              key={w.id}
              onClick={() => {
                Promise.resolve(onSelectWorkspace(w.id)).catch((err: unknown) => {
                  console.error('[WorkspaceBreadcrumb] onSelectWorkspace failed', err);
                });
              }}
            >
              {w.name}
            </StyledDropdownMenuItem>
          ))}
        </StyledDropdownMenuContent>
      </DropdownMenu>

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
