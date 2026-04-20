import { describe, it, expect } from 'bun:test';
import { formatBreadcrumbText } from '../WorkspaceBreadcrumb.helpers';

describe('formatBreadcrumbText', () => {
  it('formats workspace + session with separator', () => {
    expect(formatBreadcrumbText({ workspaceName: 'Acme', sessionName: 'bugfix' }))
      .toBe('Acme › bugfix');
  });

  it('falls back to workspace only when session is null', () => {
    expect(formatBreadcrumbText({ workspaceName: 'Acme', sessionName: null }))
      .toBe('Acme');
  });

  it('renders "No workspace" when workspace is null', () => {
    expect(formatBreadcrumbText({ workspaceName: null, sessionName: 'x' }))
      .toBe('No workspace');
  });

  it('renders "No workspace" when both null', () => {
    expect(formatBreadcrumbText({ workspaceName: null, sessionName: null }))
      .toBe('No workspace');
  });
});
