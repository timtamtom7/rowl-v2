/**
 * Pure formatter for "Workspace › Session" single-string rendering.
 *
 * The `WorkspaceBreadcrumb` component itself does NOT use this helper — it
 * renders workspace and session as separate DOM elements so each can have
 * its own truncation, click target, and max-width. This helper exists for:
 *   (1) unit-testing the display-string fallback logic
 *   (2) downstream consumers that need a single flat string (e.g. window
 *       titles, breadcrumbs in menu items).
 */
export function formatBreadcrumbText({
  workspaceName,
  sessionName,
}: {
  workspaceName: string | null;
  sessionName: string | null;
}): string {
  if (!workspaceName) return 'No workspace';
  if (!sessionName) return workspaceName;
  return `${workspaceName} › ${sessionName}`;
}
