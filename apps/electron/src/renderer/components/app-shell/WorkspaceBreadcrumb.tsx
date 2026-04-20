import * as React from 'react';
import { useSetAtom } from 'jotai';
import { cn } from '@/lib/utils';
import { formatBreadcrumbText } from './WorkspaceBreadcrumb.helpers';
import { BreadcrumbChipRow } from './breadcrumb/BreadcrumbChipRow';
import { AllSessionsDropdownPanel } from './breadcrumb/AllSessionsDropdownPanel';
import { toggleAllSessionsModeAtom } from '../../hooks/useAllSessionsDropdownMode';
import type { Workspace } from '../../../shared/types';
import type { PanelStackEntry } from '../../atoms/panel-stack';

// Re-export so downstream code that follows the spec's import path still works.
export { formatBreadcrumbText };

export interface WorkspaceBreadcrumbProps {
  workspace: Workspace | null;
  /** Resolves a human label for a panel (session title, source name, etc.). */
  labelFor: (panel: PanelStackEntry) => string;
  /**
   * Body content rendered inside the dropdown popover when the first chip is
   * in trigger mode. Typically `<AllSessionsView variant="dropdown" {...sessionListProps} />`
   * constructed by AppShell. If omitted, a placeholder empty state is shown —
   * the popover chrome (header + Columns3 toggle) still works.
   */
  allSessionsDropdownBody?: React.ReactNode;
}

export function WorkspaceBreadcrumb({
  workspace,
  labelFor,
  allSessionsDropdownBody,
}: WorkspaceBreadcrumbProps) {
  const workspaceName = workspace?.name ?? null;
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const toggleMode = useSetAtom(toggleAllSessionsModeAtom);

  const handleToggleToPanel = React.useCallback(() => {
    toggleMode();
    setDropdownOpen(false);
  }, [toggleMode]);

  const handleOpenDropdown = React.useCallback(() => {
    setDropdownOpen((o) => !o);
  }, []);

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
      <div className="relative flex items-center gap-2 min-w-0 flex-1">
        <BreadcrumbChipRow
          labelFor={labelFor}
          onOpenAllSessionsDropdown={handleOpenDropdown}
        />
        {/* Invisible anchor pinned to the left edge of the chip row, which is
            where the first chip (All Sessions / Sessions ▾) lives. Radix
            anchors the popover to this span, so it opens below the first
            chip even though the chip itself is wrapped in a ContextMenu.Root
            that we don't want to also be the Popover.Trigger. */}
        <AllSessionsDropdownPanel
          open={dropdownOpen}
          onOpenChange={setDropdownOpen}
          onToggleToPanelMode={handleToggleToPanel}
          anchor={
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0 bottom-0 h-px w-px"
            />
          }
        >
          {allSessionsDropdownBody ?? (
            <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
              Sessions list wiring pending
            </div>
          )}
        </AllSessionsDropdownPanel>
      </div>
    </div>
  );
}
