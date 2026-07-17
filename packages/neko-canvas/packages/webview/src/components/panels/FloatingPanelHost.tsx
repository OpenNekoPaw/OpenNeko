import type React from 'react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import { CloseIcon } from '@neko/ui/icons';
import type { FloatingPanelDefinition } from '../../subsystems';
import { t } from '../../i18n';

export interface FloatingPanelHostProps {
  panels: readonly FloatingPanelDefinition[];
}

interface PanelPosition {
  x: number;
  y: number;
}

export function FloatingPanelHost({ panels }: FloatingPanelHostProps) {
  const [visiblePanelIds, setVisiblePanelIds] = useState<Set<string>>(() => new Set());
  const [positions, setPositions] = useState<Record<string, PanelPosition>>({});

  const activePanelIds = useMemo(() => new Set(panels.map((panel) => panel.id)), [panels]);

  useEffect(() => {
    setVisiblePanelIds((current) => {
      const next = new Set(current);
      for (const panel of panels) {
        if (next.size < 2) {
          next.add(panel.id);
        }
      }
      for (const panelId of next) {
        if (!activePanelIds.has(panelId)) {
          next.delete(panelId);
        }
      }
      return next;
    });
  }, [activePanelIds, panels]);

  if (panels.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="pointer-events-auto absolute right-3 top-3 flex gap-1">
        {panels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            className="rounded px-2 py-1 text-xs"
            style={{
              border: '1px solid var(--control-border)',
              backgroundColor: visiblePanelIds.has(panel.id)
                ? 'var(--control-active)'
                : 'var(--control-bg)',
              color: 'var(--control-fg)',
            }}
            onClick={() =>
              setVisiblePanelIds((current) => {
                const next = new Set(current);
                if (next.has(panel.id)) next.delete(panel.id);
                else next.add(panel.id);
                return next;
              })
            }
          >
            {resolvePanelTitle(panel)}
          </button>
        ))}
      </div>

      {panels
        .filter((panel) => visiblePanelIds.has(panel.id))
        .map((panel, index) => (
          <FloatingPanelFrame
            key={panel.id}
            panel={panel}
            position={positions[panel.id] ?? { x: 260 + index * 24, y: 68 + index * 24 }}
            onMove={(position) => setPositions((current) => ({ ...current, [panel.id]: position }))}
            onClose={() =>
              setVisiblePanelIds((current) => {
                const next = new Set(current);
                next.delete(panel.id);
                return next;
              })
            }
          />
        ))}
    </div>
  );
}

function FloatingPanelFrame({
  panel,
  position,
  onMove,
  onClose,
}: {
  panel: FloatingPanelDefinition;
  position: PanelPosition;
  onMove: (position: PanelPosition) => void;
  onClose: () => void;
}) {
  const Component = panel.component;
  const title = resolvePanelTitle(panel);
  const cleanupDragRef = useRef<(() => void) | null>(null);

  const cleanupDrag = useCallback(() => {
    cleanupDragRef.current?.();
    cleanupDragRef.current = null;
  }, []);

  useEffect(() => cleanupDrag, [cleanupDrag]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      cleanupDrag();
      event.currentTarget.setPointerCapture(event.pointerId);
      const origin = { x: event.clientX, y: event.clientY };
      const start = position;
      const handleMove = (moveEvent: PointerEvent) => {
        onMove({
          x: Math.max(8, start.x + moveEvent.clientX - origin.x),
          y: Math.max(8, start.y + moveEvent.clientY - origin.y),
        });
      };
      const handleEnd = () => cleanupDrag();
      cleanupDragRef.current = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleEnd);
        window.removeEventListener('pointercancel', handleEnd);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleEnd);
      window.addEventListener('pointercancel', handleEnd);
    },
    [cleanupDrag, onMove, position],
  );

  return (
    <div
      className="pointer-events-auto absolute w-[320px] overflow-hidden rounded-lg"
      {...getKeyboardBoundaryMetadata({
        scope: 'property-panel',
        ownerId: `floating-panel:${panel.id}`,
        priority: 20,
        ownedKeys: [
          'Enter',
          'Escape',
          'Space',
          'Tab',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
        ],
      })}
      style={{
        left: position.x,
        top: position.y,
        backgroundColor: 'var(--toolbar-bg)',
        border: '1px solid var(--toolbar-border)',
        boxShadow: 'var(--neko-shadow-lg)',
        color: 'var(--toolbar-fg)',
      }}
    >
      <div
        className="flex cursor-move items-center gap-2 px-3 py-2"
        style={{
          borderBottom: '1px solid var(--toolbar-border)',
          backgroundColor: 'var(--node-header-bg)',
        }}
        onPointerDown={handlePointerDown}
      >
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{title}</span>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded"
          style={{ color: 'var(--toolbar-fg-secondary)' }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          aria-label={t('panel.close')}
        >
          <CloseIcon size={14} />
        </button>
      </div>
      <div className="max-h-[360px] overflow-auto p-3">
        <Suspense fallback={<div className="h-20" />}>
          <Component onClose={onClose} />
        </Suspense>
      </div>
    </div>
  );
}

function resolvePanelTitle(panel: FloatingPanelDefinition): string {
  return panel.titleKey ? t(panel.titleKey) : panel.title;
}
