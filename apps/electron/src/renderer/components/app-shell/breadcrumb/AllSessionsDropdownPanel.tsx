/**
 * AllSessionsDropdownPanel - Popover chrome for the "All Sessions" dropdown variant.
 *
 * Thin Radix Popover wrapper that renders a header row with the "Sessions"
 * label and a Columns3 toggle button (which switches the All Sessions chip
 * back into panel mode). The body is a `children` slot — the caller
 * constructs and passes `<AllSessionsView variant="dropdown" {...props} />`
 * itself.
 *
 * Composition choice (option c from Task 10 spec): a `children` slot was
 * chosen over forwarding `viewProps` (option b) because the `AllSessionsView`
 * prop surface is wide (`ComponentProps<typeof SessionList>`) and
 * transitively pulls heavy modules (i18n, theme context, pdfjs) into any
 * test that touches this chrome. Children-based composition keeps the
 * popover mechanics trivially testable and defers the real view mount to the
 * caller in Task 11.
 *
 * Auto-close behaviour: when the active workspace id changes while the
 * popover is open, we fire `onOpenChange(false)` so the dropdown does not
 * linger across workspace switches.
 */

import * as React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useAtomValue } from 'jotai';
import { Columns3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { windowWorkspaceIdAtom } from '../../../atoms/sessions';

export interface AllSessionsDropdownPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleToPanelMode: () => void;
  anchor: React.ReactElement;
  width?: number;
  maxHeight?: number;
  /** Body content — typically `<AllSessionsView variant="dropdown" {...props} />`. */
  children?: React.ReactNode;
}

export function AllSessionsDropdownPanel({
  open,
  onOpenChange,
  onToggleToPanelMode,
  anchor,
  width = 360,
  maxHeight = 640,
  children,
}: AllSessionsDropdownPanelProps) {
  const activeWorkspaceId = useAtomValue(windowWorkspaceIdAtom);
  const prevWorkspaceRef = React.useRef(activeWorkspaceId);

  React.useEffect(() => {
    if (prevWorkspaceRef.current !== activeWorkspaceId) {
      prevWorkspaceRef.current = activeWorkspaceId;
      if (open) onOpenChange(false);
    }
  }, [activeWorkspaceId, open, onOpenChange]);

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{anchor}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="dialog"
          sideOffset={8}
          align="start"
          className={cn(
            'rounded-lg border border-border bg-popover shadow-lg overflow-hidden',
            'flex flex-col',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
          )}
          style={{ width, maxHeight: `min(${maxHeight}px, 70vh)` }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <span className="text-sm font-medium">Sessions</span>
            <button
              type="button"
              aria-label="Expand to panel"
              onClick={onToggleToPanelMode}
              className={cn(
                'inline-flex items-center justify-center h-6 w-6 rounded-md',
                'text-muted-foreground hover:text-foreground hover:bg-accent/40',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              )}
            >
              <Columns3 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {children ?? (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                No sessions
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
