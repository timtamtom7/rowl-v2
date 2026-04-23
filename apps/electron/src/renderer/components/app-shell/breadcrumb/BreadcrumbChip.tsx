import * as React from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbChipProps {
  id: string;
  label: string;
  icon?: LucideIcon;
  focused: boolean;
  variant: 'chip' | 'trigger';
  maxWidth: number;
}

export function BreadcrumbChip({
  id,
  label,
  icon: Icon,
  focused,
  variant,
  maxWidth,
}: BreadcrumbChipProps) {
  return (
    <span
      title={label}
      data-panel-id={id}
      data-chip-variant={variant}
      style={{ maxWidth }}
      className={cn(
        'group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm shrink min-w-0',
        'select-none',
        focused
          ? 'text-foreground font-medium'
          : 'text-muted-foreground',
      )}
    >
      <span className="truncate min-w-0">{label}</span>
      {variant === 'trigger' ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : null}
    </span>
  );
}
