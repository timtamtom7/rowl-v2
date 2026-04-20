import * as React from 'react';
// Import tooltip primitives directly to avoid @craft-agent/ui's barrel pulling
// in PDFPreviewOverlay (which uses a Vite ?url import incompatible with bun test).
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipContent = TooltipPrimitive.Content;
import { cn } from '@/lib/utils';
import { generateWorkspacePattern } from '@/lib/workspace-pattern/generateWorkspacePattern';
import { useWorkspaceAutoColor } from '@/hooks/useWorkspaceAutoColor';
import type { Workspace } from '../../../shared/types';

interface WorkspaceAvatarProps {
  workspace: Workspace;
  /** Resolved icon URL from useWorkspaceIcons (may be undefined if not set). */
  iconUrl?: string;
  isActive: boolean;
  isDragging?: boolean;
  unread?: boolean;
  processing?: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

/** Exported for unit tests — returns the avatar shell classNames. */
export function workspaceAvatarClasses({
  isActive,
  isDragging,
}: { isActive: boolean; isDragging: boolean }): string {
  return cn(
    'transition-[border-radius,box-shadow] duration-150 overflow-hidden w-9 h-9',
    isActive ? 'rounded-[12px]' : 'rounded-[18px] group-hover:rounded-[12px]',
    isDragging && 'shadow-lg',
  );
}

/** Exported for unit tests — returns the left-edge pill classNames. */
export function railPillClasses(isActive: boolean): string {
  return cn(
    'absolute left-[-14px] top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-foreground',
    'transition-[height] duration-150',
    isActive ? 'h-5' : 'h-0 group-hover:h-2',
  );
}

export function WorkspaceAvatar({
  workspace,
  iconUrl,
  isActive,
  isDragging = false,
  unread = false,
  processing = false,
  onClick,
  onContextMenu,
}: WorkspaceAvatarProps) {
  const autoColor = useWorkspaceAutoColor(workspace.id);
  const fallbackPattern = React.useMemo(
    () => (iconUrl ? null : generateWorkspacePattern(workspace.id, autoColor, 36)),
    [iconUrl, workspace.id, autoColor],
  );
  const displayUrl = iconUrl ?? fallbackPattern ?? '';
  const initial = workspace.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          onContextMenu={onContextMenu}
          aria-label={workspace.name}
          aria-current={isActive ? 'true' : undefined}
          className="relative flex items-center justify-center group overflow-visible bg-transparent border-0 p-0 cursor-pointer"
        >
          <span className={railPillClasses(isActive)} aria-hidden="true" />
          <span className={workspaceAvatarClasses({ isActive, isDragging })}>
            {displayUrl ? (
              <img
                src={displayUrl}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover"
                style={iconUrl ? undefined : { imageRendering: 'pixelated' }}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-muted text-sm font-semibold text-foreground">
                {initial}
              </span>
            )}
            {processing && (
              <span className="pointer-events-none absolute -right-0.5 -top-0.5 z-10">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-blue-400 opacity-80" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-background" />
                </span>
              </span>
            )}
            {unread && (
              <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 z-10 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background" />
            )}
          </span>
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
          {workspace.name}
        </TooltipContent>
      </TooltipPrimitive.Portal>
    </Tooltip>
  );
}
