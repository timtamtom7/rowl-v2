import { atom, useAtom } from 'jotai';
import { useEffect, useMemo } from 'react';

/**
 * Pure reconciler — exported for unit tests.
 *
 * Given a persisted order and a live list of workspace ids, returns a new
 * ordered id list:
 *   - drops ids that are no longer present in `workspaceIds`
 *   - appends ids present in `workspaceIds` but missing from the order
 *
 * Pure — no React, no I/O.
 */
export function reconcileRailOrder(order: string[], workspaceIds: string[]): string[] {
  const liveSet = new Set(workspaceIds);
  const kept = order.filter((id) => liveSet.has(id));
  const keptSet = new Set(kept);
  const appended = workspaceIds.filter((id) => !keptSet.has(id));
  return [...kept, ...appended];
}

/**
 * Jotai atom — persisted order. Seeded on boot from preferences.json
 * via the hook effect below. Writes are fire-and-forget IPC.
 */
export const workspaceRailOrderAtom = atom<string[]>([]);

// Module-scope guard — ensures the atom is seeded from preferences.json
// exactly once per renderer-process lifetime, even across component
// unmount/remount cycles (e.g. Strict Mode double-invoke, navigation).
let seeded = false;

/**
 * React hook: returns the reconciled-against-live order and a setter that
 * persists changes. Seeds the atom from `electronAPI.readPreferences()` on
 * first mount. Writes through on every setter call.
 */
export function useWorkspaceRailOrder(workspaceIds: string[]): {
  order: string[];
  setOrder: (next: string[]) => void;
} {
  const [rawOrder, setRawOrder] = useAtom(workspaceRailOrderAtom);

  // Seed from preferences on first mount (process-wide).
  useEffect(() => {
    if (seeded) return;
    seeded = true;
    const api = window.electronAPI as unknown as {
      readPreferences?: () => Promise<unknown>;
    };
    if (!api?.readPreferences) return;
    void api.readPreferences().then((raw) => {
      if (!raw || typeof raw !== 'object') return;
      const json = (raw as { json?: string }).json;
      if (typeof json !== 'string') return;
      try {
        const parsed = JSON.parse(json) as { workspaceRailOrder?: string[] };
        if (Array.isArray(parsed.workspaceRailOrder)) {
          setRawOrder(parsed.workspaceRailOrder);
        }
      } catch {
        // ignore malformed JSON
      }
    }).catch(() => undefined);
  }, [setRawOrder]);

  // Reconciled view — cheap, no I/O.
  const order = useMemo(
    () => reconcileRailOrder(rawOrder, workspaceIds),
    [rawOrder, workspaceIds],
  );

  // Known limitation: two windows calling setOrder concurrently will
  // race — each reads the same snapshot, and the last writer wins. A
  // main-process IPC handler owning the merge would fix this, but
  // per spec the rail is local/single-owner so the race is accepted.
  const setOrder = (next: string[]): void => {
    setRawOrder(next);
    // Fire-and-forget write-through.
    const api = window.electronAPI as unknown as {
      readPreferences?: () => Promise<{ json?: string } | null>;
      writePreferences?: (json: string) => Promise<{ ok?: boolean; error?: string }>;
    };
    if (!api?.readPreferences || !api?.writePreferences) return;
    void (async () => {
      try {
        const current = await api.readPreferences!();
        const currentJson = current?.json ?? '{}';
        const parsed = (() => {
          try { return JSON.parse(currentJson) as Record<string, unknown>; }
          catch { return {}; }
        })();
        parsed.workspaceRailOrder = next;
        await api.writePreferences!(JSON.stringify(parsed, null, 2));
      } catch (err) {
        console.warn('[workspace-rail] failed to persist order', err);
      }
    })();
  };

  return { order, setOrder };
}
