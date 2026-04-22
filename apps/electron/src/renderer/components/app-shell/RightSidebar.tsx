import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

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
 */
export function RightSidebar({ width, children }: RightSidebarProps) {
  return (
    <div
      id="right-sidebar-region"
      role="region"
      aria-label="Right sidebar"
      className="h-full relative bg-background shadow-middle overflow-hidden"
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
