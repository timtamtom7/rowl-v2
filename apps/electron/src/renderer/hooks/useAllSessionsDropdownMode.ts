import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { windowWorkspaceIdAtom } from '../atoms/sessions';

export type AllSessionsMode = 'panel' | 'dropdown';

/** Storage: per-workspace All Sessions mode. Persisted to preferences.json. */
export const allSessionsDropdownModeByWorkspaceAtom =
  atom<Record<string, AllSessionsMode>>({});

/** Derived read: mode for the active workspace (default 'panel'). */
export const activeWorkspaceAllSessionsModeAtom = atom<AllSessionsMode>((get) => {
  const wsId = get(windowWorkspaceIdAtom);
  if (!wsId) return 'panel';
  return get(allSessionsDropdownModeByWorkspaceAtom)[wsId] ?? 'panel';
});

/** Write atom: toggle active workspace mode. Persistence runs as side-effect
 *  via the hook (useEffect watches map changes), keeping this atom pure. */
export const toggleAllSessionsModeAtom = atom(null, (get, set) => {
  const wsId = get(windowWorkspaceIdAtom);
  if (!wsId) return;
  const map = get(allSessionsDropdownModeByWorkspaceAtom);
  const current = map[wsId] ?? 'panel';
  const next: AllSessionsMode = current === 'panel' ? 'dropdown' : 'panel';
  set(allSessionsDropdownModeByWorkspaceAtom, { ...map, [wsId]: next });
});

// Module-scope seed guard — mirrors useWorkspaceRailOrder.
let seeded = false;

/**
 * Hook: seeds the map from preferences.json on first mount (process-wide),
 * and persists subsequent writes back. Returns nothing — consumers read the
 * derived atom and dispatch the toggle atom directly.
 */
export function useAllSessionsDropdownModePersistence(): void {
  const [map, setMap] = useAtom(allSessionsDropdownModeByWorkspaceAtom);

  useEffect(() => {
    if (seeded) return;
    seeded = true;
    const api = window.electronAPI as unknown as {
      readPreferences?: () => Promise<{ json?: string } | null>;
    };
    if (!api?.readPreferences) return;
    void api
      .readPreferences()
      .then((raw) => {
        const json = raw?.json;
        if (typeof json !== 'string') return;
        try {
          const parsed = JSON.parse(json) as {
            allSessionsDropdownModeByWorkspace?: Record<string, AllSessionsMode>;
          };
          if (parsed.allSessionsDropdownModeByWorkspace) {
            setMap(parsed.allSessionsDropdownModeByWorkspace);
          }
        } catch {
          // ignore malformed
        }
      })
      .catch(() => undefined);
  }, [setMap]);

  // Write-through: fires when `map` changes.
  useEffect(() => {
    if (!seeded) return;
    const api = window.electronAPI as unknown as {
      readPreferences?: () => Promise<{ json?: string } | null>;
      writePreferences?: (json: string) => Promise<{ ok?: boolean }>;
    };
    if (!api?.readPreferences || !api?.writePreferences) return;
    void (async () => {
      try {
        const current = await api.readPreferences!();
        const currentJson = current?.json ?? '{}';
        const parsed: Record<string, unknown> = (() => {
          try {
            return JSON.parse(currentJson) as Record<string, unknown>;
          } catch {
            return {};
          }
        })();
        parsed.allSessionsDropdownModeByWorkspace = map;
        await api.writePreferences!(JSON.stringify(parsed, null, 2));
      } catch (err) {
        console.warn('[breadcrumbs] failed to persist dropdown mode', err);
      }
    })();
  }, [map]);
}

/** Convenience read hook for components that only need to know the mode. */
export function useActiveWorkspaceAllSessionsMode(): AllSessionsMode {
  return useAtomValue(activeWorkspaceAllSessionsModeAtom);
}

/** Convenience setter hook for components that only need to toggle. */
export function useToggleAllSessionsMode(): () => void {
  const toggle = useSetAtom(toggleAllSessionsModeAtom);
  return toggle;
}
