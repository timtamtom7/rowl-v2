import type { Issue } from './types.ts';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']);

function renderAttachment(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const basename = path.split('/').pop() ?? path;
  if (IMAGE_EXTS.has(ext)) {
    return `![attachment](${path})`;
  }
  return `[${basename}](${path})`;
}

export function formatFirstTurnContext(issue: Issue): string {
  const parts: string[] = [
    'You are being started to work on this issue.',
    '',
    `## Issue: ${issue.title}`,
    '',
    `**Status:** ${issue.status} | **Priority:** ${issue.priority} | **ID:** ${issue.id}`,
  ];

  if (issue.description && issue.description.trim().length > 0) {
    parts.push('', '### Description', '', issue.description.trim());
  }

  if (issue.attachments && issue.attachments.length > 0) {
    parts.push('', '### Attachments', '');
    for (const a of issue.attachments) parts.push(renderAttachment(a));
  }

  parts.push(
    '',
    '---',
    '',
    'You are in **safe permission mode**. Before implementing anything, you MUST call the `SubmitPlan` tool to propose a plan for this issue. The user will review and accept or refine it before execution begins.',
  );

  return parts.join('\n');
}
