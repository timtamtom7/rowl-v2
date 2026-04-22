import { describe, expect, it } from 'bun:test';
import type { Issue } from './types.ts';
import { formatFirstTurnContext } from './first-turn-context.ts';

const BASE: Issue = {
  id: 'issue_abc',
  title: 'Add Letta memory sync',
  description: 'We want to replace the in-memory store with Letta.',
  status: 'todo',
  priority: 'high',
  createdAt: '2026-04-22T14:30:00.000Z',
  updatedAt: '2026-04-22T14:30:00.000Z',
  linkedSessionIds: [],
  linkedPlanPaths: [],
};

describe('formatFirstTurnContext', () => {
  it('includes title, metadata, description, and SubmitPlan reminder', () => {
    const out = formatFirstTurnContext(BASE);
    expect(out).toContain('## Issue: Add Letta memory sync');
    expect(out).toContain('**Status:** todo');
    expect(out).toContain('**Priority:** high');
    expect(out).toContain('**ID:** issue_abc');
    expect(out).toContain('We want to replace the in-memory store with Letta.');
    expect(out).toContain('SubmitPlan');
    expect(out).toContain('safe permission mode');
  });

  it('omits the Description section when description is empty', () => {
    const out = formatFirstTurnContext({ ...BASE, description: undefined });
    expect(out).not.toContain('### Description');
  });

  it('omits the Attachments section when none', () => {
    const out = formatFirstTurnContext(BASE);
    expect(out).not.toContain('### Attachments');
  });

  it('renders image attachments as markdown image refs and non-images as links', () => {
    const out = formatFirstTurnContext({
      ...BASE,
      attachments: [
        'issues/issue_abc/attachments/a1b2c3.png',
        'issues/issue_abc/attachments/d4e5f6.pdf',
      ],
    });
    expect(out).toContain('![attachment](issues/issue_abc/attachments/a1b2c3.png)');
    expect(out).toContain('[d4e5f6.pdf](issues/issue_abc/attachments/d4e5f6.pdf)');
  });

  it('is deterministic (snapshot-style)', () => {
    const out1 = formatFirstTurnContext(BASE);
    const out2 = formatFirstTurnContext(BASE);
    expect(out1).toBe(out2);
  });
});
