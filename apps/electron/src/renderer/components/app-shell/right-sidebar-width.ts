/**
 * Constants and helpers for the right-sidebar chrome width.
 * Extracted so AppShell and tests can both import without pulling React.
 */

export const RIGHT_SIDEBAR_MIN_WIDTH = 280;
export const RIGHT_SIDEBAR_MAX_WIDTH = 600;
export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 360;

/**
 * Clamp a proposed right-sidebar width to the allowed range.
 * Used during resize drag and when hydrating from localStorage.
 */
export function clampRightSidebarWidth(width: number): number {
  return Math.min(Math.max(width, RIGHT_SIDEBAR_MIN_WIDTH), RIGHT_SIDEBAR_MAX_WIDTH);
}
