import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFocusZone } from '@/hooks/keyboard';

interface RightSidebarProps {
  /** Current width in pixels. Caller is responsible for clamping to bounds. */
  width: number;
  /** Optional content. When omitted, a friendly empty state is shown. */
  children?: ReactNode;
}

/**
 * Presentational container for the right-hand sidebar.
 *
 * Chrome only — width, visibility, toggling, resize, and auto-compact are
 * managed by AppShell. This component renders its own inner width and a
 * default empty state when no children are passed.
 *
 * Registers itself as the `'right-sidebar'` focus zone on mount so Tab
 * cycling and `Cmd+4` (`nav.focusRightSidebar`) can land here. Unregisters
 * automatically on unmount (when AppShell hides the sidebar).
 */
export function RightSidebar({ width, children }: RightSidebarProps) {
  const { zoneRef, isFocused } = useFocusZone({ zoneId: 'right-sidebar' });
  return (
    <div
      ref={zoneRef}
      id="right-sidebar-region"
      role="region"
      aria-label="Right sidebar"
      tabIndex={isFocused ? 0 : -1}
      className="h-full relative bg-background shadow-middle overflow-hidden outline-none"
      style={{ width }}
    >
      <div
        data-right-sidebar-inner
        className="h-full flex flex-col"
        style={{ width }}
      >
        {children ?? <RightSidebarEmptyState />}
      </div>
    </div>
  );
}

function RightSidebarEmptyState() {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center gap-2',
        'px-4',
      )}
      style={{ marginTop: '40%' }}
    >
      <Sparkles className="h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
      <p className="text-sm text-muted-foreground max-w-[220px]">
        Memory, context, and session activity will appear here.
      </p>
    </div>
  );
}
