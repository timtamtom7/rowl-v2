import { describe, it, expect } from 'bun:test';
import { workspaceAvatarClasses, railPillClasses } from '../WorkspaceAvatar';

describe('workspaceAvatarClasses', () => {
  it('uses rounded-[14px] when active', () => {
    expect(workspaceAvatarClasses({ isActive: true, isDragging: false }))
      .toContain('rounded-[14px]');
  });

  it('uses rounded-[22px] when idle', () => {
    const cls = workspaceAvatarClasses({ isActive: false, isDragging: false });
    expect(cls).toContain('rounded-[22px]');
    expect(cls).toContain('group-hover:rounded-[14px]');
  });

  it('adds shadow-lg when dragging', () => {
    expect(workspaceAvatarClasses({ isActive: false, isDragging: true }))
      .toContain('shadow-lg');
  });
});

describe('railPillClasses', () => {
  it('active pill is tall (h-5)', () => {
    expect(railPillClasses(true)).toContain('h-5');
  });

  it('idle pill is hidden (h-0) and grows on hover', () => {
    const cls = railPillClasses(false);
    expect(cls).toContain('h-0');
    expect(cls).toContain('group-hover:h-2');
  });
});
