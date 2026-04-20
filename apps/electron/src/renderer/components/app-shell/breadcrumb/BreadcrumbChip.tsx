import * as React from 'react';
import { ChevronDown, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbChipProps {
  id: string;
  label: string;
  icon?: LucideIcon;
  focused: boolean;
  closable: boolean;
  variant: 'chip' | 'trigger';
  maxWidth: number;
  onClick: () => void;
  onClose?: () => void;
}

export function BreadcrumbChip({
  id,
  label,
  icon: Icon,
  focused,
  closable,
  variant,
  maxWidth,
  onClick,
  onClose,
}: BreadcrumbChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      data-panel-id={id}
      data-chip-variant={variant}
      style={{ maxWidth }}
      className={cn(
        'group inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-sm shrink min-w-0',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'transition-colors',
        focused
          ? 'bg-accent text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span className="truncate min-w-0">{label}</span>
      {variant === 'trigger' ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : closable ? (
        <span
          role="button"
          aria-label="Close panel"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          className={cn(
            'ml-0.5 shrink-0 inline-flex items-center justify-center rounded-sm',
            'h-4 w-4 hover:bg-foreground/10',
            focused ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70 hover:opacity-100',
            'transition-opacity',
          )}
        >
          <X className="h-3 w-3" />
        </span>
      ) : null}
    </button>
  );
}
