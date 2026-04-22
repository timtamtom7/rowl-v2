import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useFocusZone } from '@/hooks/keyboard';
import { RADIUS_EDGE, RADIUS_INNER } from './panel-constants';

interface RightSidebarProps {
  /** Current width in pixels. Caller is responsible for clamping to bounds. */
  width: number;
  /**
   * Whether the sidebar is visually visible. AppShell keeps this component
   * mounted during the open/close animation so width/opacity can animate; we
   * use this to gate focus-zone registration (no zone when hidden) and to
   * avoid keeping the inner tree tabbable mid-collapse.
   */
  visible: boolean;
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
 * Registers itself as the `'right-sidebar'` focus zone only when visible so
 * Tab cycling and `Cmd+4` (`nav.focusRightSidebar`) skip it while hidden.
 * The registration is cleaned up automatically when `visible` flips false.
 *
 * Corners mirror PanelSlot's radius rules: interior corners (facing the
 * panel gap) use RADIUS_INNER; exterior corners (touching the window's
 * right edge) use RADIUS_EDGE.
 */
export function RightSidebar({ width, visible, children }: RightSidebarProps) {
  const { zoneRef, isFocused } = useFocusZone({
    zoneId: 'right-sidebar',
    enabled: visible,
  });
  return (
    <div
      ref={zoneRef}
      id="right-sidebar-region"
      role="region"
      aria-label="Right sidebar"
      tabIndex={visible && isFocused ? 0 : -1}
      className={cn(
        'h-full relative bg-background shadow-middle overflow-hidden',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
      )}
      style={{
        width,
        borderTopLeftRadius: RADIUS_INNER,
        borderBottomLeftRadius: RADIUS_INNER,
        borderTopRightRadius: RADIUS_EDGE,
        borderBottomRightRadius: RADIUS_EDGE,
      }}
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
        'flex flex-col items-center text-center',
        'px-6',
      )}
      style={{ marginTop: '40%' }}
    >
      <p className="text-sm text-muted-foreground/70 max-w-[240px] leading-relaxed">
        Memory, context, and session activity will appear here.
      </p>
    </div>
  );
}
