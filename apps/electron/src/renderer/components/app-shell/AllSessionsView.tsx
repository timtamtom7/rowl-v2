/**
 * AllSessionsView - Reusable "All Sessions" body for the sessions navigator.
 *
 * Structural extraction of the inline render previously in AppShell.tsx
 * (`isSessionsNavigation(navState)` branch). The visible output is byte-identical
 * to the previous inline tree — this is a pure refactor so the same component
 * tree can be mounted in both the panel stack and (in Task 10) a dropdown popover.
 *
 * All state continues to live in its existing atoms / parent hooks; every
 * parent-owned callback flows through as a prop, matching the previous mount.
 * The only net-new knob is `variant`, which is plumbed through for Task 10/11
 * divergence — today both variants render identically.
 *
 * Note on composition: `SessionSearchHeader` is already rendered internally by
 * `SessionList`, so this component does not need to render it explicitly. The
 * plan's scaffold showed them as siblings, but the existing inline tree only
 * mounts `<SessionList>` directly — preserving that shape here.
 */

import * as React from 'react'
import { SessionList } from './SessionList'
import type { ComponentProps } from 'react'

/** Props forwarded 1:1 to the underlying SessionList. */
export type AllSessionsViewProps = ComponentProps<typeof SessionList> & {
  /**
   * Variant affects padding/height constraints only. Currently both variants
   * render identically; they diverge in later tasks (dropdown popover mount).
   */
  variant?: 'panel' | 'dropdown'
}

export function AllSessionsView({
  variant: _variant = 'panel',
  ...sessionListProps
}: AllSessionsViewProps) {
  // variant is plumbed through for future divergence; currently unused.
  return <SessionList {...sessionListProps} />
}
