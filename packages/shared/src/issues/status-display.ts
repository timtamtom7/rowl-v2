/**
 * Status and Priority Display
 *
 * Single source of truth for all status/priority visual presentation.
 * Used by IssuesPanel, OverviewPanel, IssueCard, and any other component
 * that needs to render issue status or priority.
 */

import type { IssueStatus, IssuePriority } from './types.ts'
import {
  Circle,
  CircleDot,
  CheckCircle2,
  Clock,
} from 'lucide-react'

// ─── Status ─────────────────────────────────────────────────────────────────

export type StatusInfo = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string       // text color class
  dotColor: string    // bg color class for dots
}

export const STATUS_INFO: Record<IssueStatus, StatusInfo> = {
  backlog: {
    label: 'Backlog',
    icon: Circle,
    color: 'text-muted-foreground/60',
    dotColor: 'bg-muted-foreground/40',
  },
  todo: {
    label: 'Todo',
    icon: CircleDot,
    color: 'text-blue-500',
    dotColor: 'bg-blue-500',
  },
  in_progress: {
    label: 'In Progress',
    icon: Clock,
    color: 'text-amber-500',
    dotColor: 'bg-amber-500',
  },
  done: {
    label: 'Done',
    icon: CheckCircle2,
    color: 'text-emerald-500',
    dotColor: 'bg-emerald-500',
  },
}

export const STATUS_LABELS: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  done: 'Done',
}

export const STATUS_ICONS: Record<IssueStatus, React.ComponentType<{ className?: string }>> = {
  backlog: Circle,
  todo: CircleDot,
  in_progress: Clock,
  done: CheckCircle2,
}

export const STATUS_COLORS: Record<IssueStatus, string> = {
  backlog: 'text-muted-foreground/60',
  todo: 'text-blue-500',
  in_progress: 'text-amber-500',
  done: 'text-emerald-500',
}

export const STATUS_DOT: Record<string, string> = {
  backlog: 'bg-muted-foreground/40',
  todo: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  done: 'bg-emerald-500',
  cancelled: 'bg-muted-foreground/20',
}

// ─── Priority ────────────────────────────────────────────────────────────────

export const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
}

export const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
}
