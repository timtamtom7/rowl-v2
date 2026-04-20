import * as React from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { MessageSquare, FileText, Settings as SettingsIcon, Sparkles, Layers, type LucideIcon } from 'lucide-react';
import {
  panelStackAtom,
  focusedPanelIdAtom,
  closePanelAtom,
  type PanelStackEntry,
  type PanelType,
} from '../../../atoms/panel-stack';
import {
  activeWorkspaceAllSessionsModeAtom,
  toggleAllSessionsModeAtom,
} from '../../../hooks/useAllSessionsDropdownMode';
import { useBreadcrumbOverflow } from '../../../hooks/useBreadcrumbOverflow';
import { BreadcrumbChip } from './BreadcrumbChip';
import { OverflowMenu } from './OverflowMenu';

const ICON_FOR_TYPE: Record<PanelType, LucideIcon> = {
  session: MessageSquare,
  source: FileText,
  settings: SettingsIcon,
  skills: Sparkles,
  other: Layers,
};

export interface BreadcrumbChipRowProps {
  /** Resolve a human label for a panel. Typically reads session/source registries. */
  labelFor: (panel: PanelStackEntry) => string;
  /** Optional override: called when the All Sessions chip is clicked in dropdown mode. */
  onOpenAllSessionsDropdown?: () => void;
}

export function BreadcrumbChipRow({ labelFor, onOpenAllSessionsDropdown }: BreadcrumbChipRowProps) {
  const panels = useAtomValue(panelStackAtom);
  const [focusedId, setFocusedId] = useAtom(focusedPanelIdAtom);
  const closePanel = useSetAtom(closePanelAtom);
  const mode = useAtomValue(activeWorkspaceAllSessionsModeAtom);
  const toggleMode = useSetAtom(toggleAllSessionsModeAtom);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const { visibleIds, hiddenPanels, chipMaxWidth } = useBreadcrumbOverflow(
    panels,
    focusedId,
    containerRef,
  );

  // Before the ResizeObserver has reported a width (containerWidth === 0 in the
  // overflow hook) every panel except the focused one ends up hidden. Detect
  // that degenerate state by checking if every non-focused panel is missing
  // from visibleIds while the panel list is non-empty, and fall back to
  // rendering all panels. This also covers the initial SSR / test-env render
  // where happy-dom's getBoundingClientRect returns zero width.
  const measurementReady =
    panels.length === 0 || panels.some((p) => p.id !== focusedId && visibleIds.has(p.id)) || panels.every((p) => visibleIds.has(p.id));
  const effectiveVisibleIds = measurementReady
    ? visibleIds
    : new Set(panels.map((p) => p.id));
  const effectiveHiddenPanels = measurementReady ? hiddenPanels : [];

  const visiblePanels = panels.filter((p) => effectiveVisibleIds.has(p.id));

  const handleChipClick = React.useCallback(
    (panel: PanelStackEntry, isFirst: boolean) => {
      if (isFirst && mode === 'dropdown') {
        onOpenAllSessionsDropdown?.();
        return;
      }
      setFocusedId(panel.id);
    },
    [mode, onOpenAllSessionsDropdown, setFocusedId],
  );

  return (
    <div ref={containerRef} className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
      {visiblePanels.map((panel, idx) => {
        const isFirst = panels.indexOf(panel) === 0;
        const label = isFirst ? 'Sessions' : labelFor(panel);
        const variant: 'chip' | 'trigger' = isFirst && mode === 'dropdown' ? 'trigger' : 'chip';
        const closable = !isFirst; // All Sessions is pinned
        const chipEl = (
          <BreadcrumbChip
            id={panel.id}
            label={label}
            icon={ICON_FOR_TYPE[panel.panelType]}
            focused={panel.id === focusedId}
            closable={closable}
            variant={variant}
            maxWidth={chipMaxWidth}
            onClick={() => handleChipClick(panel, isFirst)}
            onClose={closable ? () => closePanel(panel.id) : undefined}
          />
        );
        return (
          <React.Fragment key={panel.id}>
            {idx > 0 && (
              <span
                aria-hidden="true"
                data-role="separator"
                className="text-muted-foreground/40 shrink-0 px-0.5 select-none"
              >
                ·
              </span>
            )}
            {isFirst ? (
              <ContextMenu.Root>
                <ContextMenu.Trigger asChild>{chipEl}</ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content
                    className="z-50 min-w-[200px] rounded-md border border-border bg-popover p-1 shadow-md"
                  >
                    <ContextMenu.Item
                      onSelect={() => toggleMode()}
                      className="flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                    >
                      {mode === 'panel' ? 'Collapse to dropdown' : 'Expand to panel'}
                    </ContextMenu.Item>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            ) : (
              chipEl
            )}
          </React.Fragment>
        );
      })}
      <OverflowMenu
        hiddenPanels={effectiveHiddenPanels}
        labelFor={labelFor}
        onFocusPanel={(id) => setFocusedId(id)}
        onClosePanel={(id) => closePanel(id)}
      />
    </div>
  );
}
