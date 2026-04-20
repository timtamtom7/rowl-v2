import * as React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PanelStackEntry } from '../../../atoms/panel-stack';

export interface OverflowMenuProps {
  hiddenPanels: PanelStackEntry[];
  labelFor: (panel: PanelStackEntry) => string;
  onFocusPanel: (id: string) => void;
  onClosePanel: (id: string) => void;
}

export function OverflowMenu({ hiddenPanels, labelFor, onFocusPanel, onClosePanel }: OverflowMenuProps) {
  if (hiddenPanels.length === 0) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="More panels"
          className={cn(
            'inline-flex items-center justify-center h-7 w-7 rounded-md shrink-0',
            'text-muted-foreground hover:text-foreground hover:bg-accent/40',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="min-w-[220px] max-w-[320px] rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {hiddenPanels.map((p) => (
            <DropdownMenu.Item
              key={p.id}
              onSelect={() => onFocusPanel(p.id)}
              className={cn(
                'group flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm text-sm outline-none',
                'data-[highlighted]:bg-accent data-[highlighted]:text-foreground',
                'text-muted-foreground',
              )}
            >
              <span className="truncate min-w-0">{labelFor(p)}</span>
              <button
                type="button"
                aria-label="Close panel"
                onClick={(e) => {
                  e.stopPropagation();
                  onClosePanel(p.id);
                }}
                className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-sm opacity-0 group-hover:opacity-70 hover:opacity-100 hover:bg-foreground/10"
              >
                <X className="h-3 w-3" />
              </button>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
