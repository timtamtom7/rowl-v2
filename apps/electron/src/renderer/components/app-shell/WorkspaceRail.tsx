import * as React from 'react';
import { Plus, Settings, Home } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
// Import tooltip primitives directly to avoid @craft-agent/ui's barrel pulling
// in PDFPreviewOverlay (which uses a Vite ?url import incompatible with bun test).
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipContent = TooltipPrimitive.Content;
import { useWorkspaceIcons } from '@/hooks/useWorkspaceIcon';
import { useWorkspaceRailOrder } from '@/hooks/useWorkspaceRailOrder';
import { cn } from '@/lib/utils';
import { WorkspaceAvatar } from './WorkspaceAvatar';
import type { Workspace } from '../../../shared/types';

export interface WorkspaceRailProps {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  workspaceUnreadMap?: Record<string, boolean>;
  workspaceProcessingMap?: Record<string, boolean>;
  isOverviewActive?: boolean;
  onSelect: (workspaceId: string) => void;
  onSelectOverview: () => void;
  onCreate: () => void;
  onSettings?: () => void;
  onContextMenu?: (workspaceId: string, e: React.MouseEvent) => void;
}

/**
 * Exported for unit tests. Given the current ordered id list and a dnd-kit
 * dragEnd event's active/over ids, returns the new order or null if no move
 * should be persisted.
 */
import { computeOrderAfterDrag } from './workspace-rail-dnd'

function SortableAvatar({
  workspace,
  iconUrl,
  isActive,
  unread,
  processing,
  onClick,
  onContextMenu,
}: {
  workspace: Workspace;
  iconUrl?: string;
  isActive: boolean;
  unread: boolean;
  processing: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: workspace.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <WorkspaceAvatar
        workspace={workspace}
        iconUrl={iconUrl}
        isActive={isActive}
        isDragging={isDragging}
        unread={unread}
        processing={processing}
        onClick={() => {
          if (isDragging) return;
          onClick();
        }}
        onContextMenu={onContextMenu}
      />
    </div>
  );
}

export function WorkspaceRail({
  workspaces,
  activeWorkspaceId,
  workspaceUnreadMap,
  workspaceProcessingMap,
  isOverviewActive = false,
  onSelect,
  onSelectOverview,
  onCreate,
  onSettings,
  onContextMenu,
}: WorkspaceRailProps) {
  const workspaceIds = React.useMemo(() => workspaces.map((w) => w.id), [workspaces]);
  const { order, setOrder } = useWorkspaceRailOrder(workspaceIds);
  const byId = React.useMemo(() => {
    const m = new Map<string, Workspace>();
    for (const w of workspaces) m.set(w.id, w);
    return m;
  }, [workspaces]);
  const ordered = React.useMemo(
    () => order.map((id) => byId.get(id)).filter((w): w is Workspace => Boolean(w)),
    [order, byId],
  );

  const iconMap = useWorkspaceIcons(ordered);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : null;
      const next = computeOrderAfterDrag(order, activeId, overId);
      if (next) setOrder(next);
    },
    [order, setOrder],
  );

  return (
    <div
      data-testid="workspace-rail"
      className={cn(
        'flex flex-col items-center w-16 shrink-0 h-full select-none',
      )}
    >

      {/* Overview entry - home icon at top */}
      <div className="mb-2">
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onSelectOverview}
              aria-label="Overview"
              aria-current={isOverviewActive ? 'true' : undefined}
              className={cn(
                'relative flex items-center justify-center w-10 h-10',
                'rounded-[12px] transition-all duration-150',
                'hover:bg-accent/20',
                isOverviewActive && 'bg-accent/20 ring-2 ring-accent',
              )}
            >
              <Home className={cn(
                'h-5 w-5',
                isOverviewActive ? 'text-accent' : 'text-muted-foreground'
              )} />
            </button>
          </TooltipTrigger>
          <TooltipPrimitive.Portal>
            <TooltipContent
              side="right"
              sideOffset={8}
              className={cn(
                'z-[100] overflow-hidden rounded-[8px] px-2.5 py-1.5 text-xs',
                'bg-popover border border-border/50 text-popover-foreground shadow-md',
                'animate-in fade-in-0 duration-100 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-75',
              )}
            >
              Overview
            </TooltipContent>
          </TooltipPrimitive.Portal>
        </Tooltip>
      </div>

      {/* Separator */}
      <div className="w-8 h-px bg-border/60 mx-auto mb-2 shrink-0" aria-hidden="true" />

      {/* Sortable avatar list */}
      <div className="flex-1 flex flex-col items-center gap-2 w-full overflow-y-auto overflow-x-hidden scrollbar-none">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {ordered.map((w) => (
              <SortableAvatar
                key={w.id}
                workspace={w}
                iconUrl={iconMap.get(w.id)}
                isActive={w.id === activeWorkspaceId}
                unread={Boolean(workspaceUnreadMap?.[w.id])}
                processing={Boolean(workspaceProcessingMap?.[w.id])}
                onClick={() => onSelect(w.id)}
                onContextMenu={(e) => onContextMenu?.(w.id, e)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Separator + add button */}
      <div className="w-8 h-px bg-border/60 mx-auto my-2 shrink-0" aria-hidden="true" />
      <div className="flex flex-col items-center justify-center gap-2 py-4 shrink-0">
        {/* Add workspace */}
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onCreate}
              aria-label="Add workspace"
              className={cn(
                'flex items-center justify-center w-10 h-10',
                'rounded-[16px] hover:rounded-[12px]',
                'border-2 border-foreground/30 text-muted-foreground',
                'hover:border-accent hover:text-accent',
                'hover:bg-accent/10',
                'transition-[border-color,color,border-radius,background] duration-150',
              )}
            >
              <Plus className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipPrimitive.Portal>
            <TooltipContent
              side="right"
              sideOffset={8}
              className={cn(
                'z-[100] overflow-hidden rounded-[8px] px-2.5 py-1.5 text-xs',
                'bg-popover border border-border/50 text-popover-foreground shadow-md',
                'animate-in fade-in-0 duration-100 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-75',
              )}
            >
              Add workspace
            </TooltipContent>
          </TooltipPrimitive.Portal>
        </Tooltip>

        {/* Settings */}
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onSettings}
              aria-label="Settings"
              className={cn(
                'flex items-center justify-center w-10 h-10',
                'rounded-[16px] hover:rounded-[12px]',
                'text-muted-foreground',
                'hover:text-accent hover:bg-accent/10',
                'transition-[color,border-radius,background] duration-150',
              )}
            >
              <Settings className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipPrimitive.Portal>
            <TooltipContent
              side="right"
              sideOffset={8}
              className={cn(
                'z-[100] overflow-hidden rounded-[8px] px-2.5 py-1.5 text-xs',
                'bg-popover border border-border/50 text-popover-foreground shadow-md',
                'animate-in fade-in-0 duration-100 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-75',
              )}
            >
              Settings
            </TooltipContent>
          </TooltipPrimitive.Portal>
        </Tooltip>
      </div>
    </div>
  );
}
