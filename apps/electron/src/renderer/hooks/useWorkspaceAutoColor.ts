import { useMemo } from 'react';

/**
 * 12-hue palette — hand-picked for contrast against both light and dark app backgrounds.
 * Tailwind `-500` hex values.
 */
export const WORKSPACE_COLOR_PALETTE = [
  '#ef4444', // red-500
  '#f97316', // orange-500
  '#f59e0b', // amber-500
  '#eab308', // yellow-500
  '#84cc16', // lime-500
  '#22c55e', // green-500
  '#14b8a6', // teal-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#6366f1', // indigo-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
] as const;

function fnv1a(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Pure deterministic: hashes id to one of WORKSPACE_COLOR_PALETTE entries.
 * Empty string always returns the first palette entry.
 */
export function workspaceColorFromId(id: string): string {
  if (id.length === 0) return WORKSPACE_COLOR_PALETTE[0]!;
  const idx = fnv1a(id) % WORKSPACE_COLOR_PALETTE.length;
  return WORKSPACE_COLOR_PALETTE[idx]!;
}

/** React hook wrapper — memoized per id. */
export function useWorkspaceAutoColor(workspaceId: string): string {
  return useMemo(() => workspaceColorFromId(workspaceId), [workspaceId]);
}
