import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatBreadcrumbText } from './WorkspaceBreadcrumb.helpers';
import { BreadcrumbChipRow } from './breadcrumb/BreadcrumbChipRow';
import type { Workspace } from '../../../shared/types';
import type { PanelStackEntry } from '../../atoms/panel-stack';

// Re-export so downstream code that follows the spec's import path still works.
export { formatBreadcrumbText };

export interface WorkspaceBreadcrumbProps {
  workspace: Workspace | null;
  /** Resolves a human label for a panel (session title, source name, etc.). */
  labelFor: (panel: PanelStackEntry) => string;
  /** Opens the All Sessions popover when the first chip is in dropdown-trigger mode. */
  onOpenAllSessionsDropdown?: () => void;
}

export function WorkspaceBreadcrumb({
  workspace,
  labelFor,
  onOpenAllSessionsDropdown,
}: WorkspaceBreadcrumbProps) {
  const workspaceName = workspace?.name ?? null;

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <span
        className={cn(
          'max-w-[240px] px-2 py-1 text-sm font-medium truncate shrink-0',
        )}
      >
        {workspaceName ?? 'No workspace'}
      </span>
      <span className="text-muted-foreground/60 shrink-0" aria-hidden="true">›</span>
      <BreadcrumbChipRow
        labelFor={labelFor}
        onOpenAllSessionsDropdown={onOpenAllSessionsDropdown}
      />
    </div>
  );
}
