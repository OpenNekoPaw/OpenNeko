import React, { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import type {
  ISceneController,
  ViewportContextMenuRequest,
  ViewportFrameMeta,
  ViewportMenuItem,
  ViewportOverlayDescriptor,
  ViewportToolbarItem,
} from '@neko/shared';
import { OverlayRenderer } from './OverlayRenderer';
import { ViewportToolbar } from './ViewportToolbar';
import {
  DEFAULT_VIEWPORT_LOCAL_STATE,
  createViewportKeyInput,
  createViewportPointerInput,
  createViewportWheelInput,
  reduceViewportLocalState,
  type ViewportLocalCommand,
  type ViewportLocalState,
} from './viewport-state';

export type ViewportSurfaceDescriptor =
  | { readonly kind: 'canvas'; readonly label?: string }
  | { readonly kind: 'video'; readonly url: string; readonly label?: string }
  | { readonly kind: 'custom'; readonly node: React.ReactNode; readonly label?: string };

export interface ViewportShellProps {
  readonly sceneId: string;
  readonly viewportId: string;
  readonly controller: ISceneController;
  readonly frameMeta?: ViewportFrameMeta | null;
  readonly surface?: ViewportSurfaceDescriptor;
  readonly className?: string;
  readonly initialLocalState?: ViewportLocalState;
  readonly onLocalStateChange?: (state: ViewportLocalState, command: ViewportLocalCommand) => void;
  readonly onToolbarAction?: (item: ViewportToolbarItem) => void;
  readonly onContextMenuAction?: (item: ViewportMenuItem) => void;
  readonly renderOverlayLayer?: (props: {
    readonly frameMeta: ViewportFrameMeta | null;
    readonly overlays: readonly ViewportOverlayDescriptor[];
  }) => React.ReactNode;
  readonly renderToolbar?: (props: {
    readonly items: readonly ViewportToolbarItem[];
    readonly onAction: (item: ViewportToolbarItem) => void;
  }) => React.ReactNode;
}

export function ViewportShell({
  sceneId,
  viewportId,
  controller,
  frameMeta = null,
  surface = { kind: 'canvas' },
  className,
  initialLocalState = DEFAULT_VIEWPORT_LOCAL_STATE,
  onLocalStateChange,
  onToolbarAction,
  onContextMenuAction,
  renderOverlayLayer,
  renderToolbar,
}: ViewportShellProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    readonly position: readonly [number, number];
    readonly items: readonly ViewportMenuItem[];
  } | null>(null);
  const [localState, dispatchLocal] = useReducer(
    (state: ViewportLocalState, command: ViewportLocalCommand) => {
      const next = reduceViewportLocalState(state, command);
      onLocalStateChange?.(next, command);
      return next;
    },
    initialLocalState,
  );

  const dispatchShellLocal = useCallback((command: ViewportLocalCommand) => {
    dispatchLocal(command);
  }, []);

  const readRootRect = useCallback((): DOMRect => {
    return rootRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1);
  }, []);

  const overlays = controller.getOverlays(frameMeta ?? undefined);
  const toolbarItems = useMemo(
    () => createSharedToolbarItems(localState).concat(controller.getToolbarExtensions()),
    [controller, localState],
  );
  const handleToolbarAction = useCallback(
    (item: ViewportToolbarItem) => {
      handleSharedToolbarAction(item, dispatchShellLocal);
      onToolbarAction?.(item);
    },
    [dispatchShellLocal, onToolbarAction],
  );
  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      const rect = readRootRect();
      const position = [event.clientX - rect.left, event.clientY - rect.top] as const;
      const request: ViewportContextMenuRequest = {
        sceneId,
        viewportId,
        timestamp: event.timeStamp,
        modifiers: {
          alt: event.altKey,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
          shift: event.shiftKey,
        },
        position,
      };
      const items = controller.getContextMenu(request);
      setContextMenu(items.length > 0 ? { position, items } : null);
    },
    [controller, readRootRect, sceneId, viewportId],
  );
  const handleContextMenuAction = useCallback(
    (item: ViewportMenuItem) => {
      setContextMenu(null);
      onContextMenuAction?.(item);
    },
    [onContextMenuAction],
  );

  return (
    <div
      ref={rootRef}
      className={className ?? 'neko-viewport-shell'}
      data-neko-viewport-shell="true"
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.defaultPrevented) return;
        if (isViewportChromeEventTarget(event.target, event.currentTarget)) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        void controller.onPointerDown(
          createViewportPointerInput(sceneId, viewportId, 'down', event, readRootRect()),
        );
      }}
      onPointerMove={(event) => {
        if (event.defaultPrevented) return;
        if (isViewportChromeEventTarget(event.target, event.currentTarget)) return;
        void controller.onPointerMove(
          createViewportPointerInput(sceneId, viewportId, 'move', event, readRootRect()),
        );
      }}
      onPointerUp={(event) => {
        if (event.defaultPrevented) return;
        if (isViewportChromeEventTarget(event.target, event.currentTarget)) return;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        void controller.onPointerUp(
          createViewportPointerInput(sceneId, viewportId, 'up', event, readRootRect()),
        );
      }}
      onPointerCancel={(event) => {
        if (event.defaultPrevented) return;
        if (isViewportChromeEventTarget(event.target, event.currentTarget)) return;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        void controller.onPointerCancel?.(
          createViewportPointerInput(sceneId, viewportId, 'cancel', event, readRootRect()),
        );
      }}
      onWheel={(event) => {
        if (event.defaultPrevented) return;
        if (isViewportChromeEventTarget(event.target, event.currentTarget)) return;
        event.preventDefault();
        const input = createViewportWheelInput(sceneId, viewportId, event, readRootRect());
        dispatchShellLocal({ type: 'zoomBy', origin: input.position, delta: input.delta[1] });
        void controller.onWheel(input);
      }}
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        if (isViewportChromeEventTarget(event.target, event.currentTarget)) return;
        void controller.onKeyDown(createViewportKeyInput(sceneId, viewportId, 'down', event));
      }}
      onKeyUp={(event) => {
        if (event.defaultPrevented) return;
        if (isViewportChromeEventTarget(event.target, event.currentTarget)) return;
        void controller.onKeyUp?.(createViewportKeyInput(sceneId, viewportId, 'up', event));
      }}
      onContextMenu={handleContextMenu}
    >
      <div className="neko-viewport-surface" data-neko-viewport-surface="true">
        {renderSurface(surface)}
        {renderOverlayLayer ? (
          renderOverlayLayer({ frameMeta, overlays })
        ) : (
          <OverlayRenderer frameMeta={frameMeta} overlays={overlays} />
        )}
      </div>
      {renderToolbar ? (
        renderToolbar({ items: toolbarItems, onAction: handleToolbarAction })
      ) : (
        <ViewportToolbar items={toolbarItems} onAction={handleToolbarAction} />
      )}
      {contextMenu ? (
        <ViewportContextMenu
          position={contextMenu.position}
          items={contextMenu.items}
          onAction={handleContextMenuAction}
        />
      ) : null}
    </div>
  );
}

interface ViewportContextMenuProps {
  readonly position: readonly [number, number];
  readonly items: readonly ViewportMenuItem[];
  readonly onAction: (item: ViewportMenuItem) => void;
}

function ViewportContextMenu({
  position,
  items,
  onAction,
}: ViewportContextMenuProps): React.JSX.Element {
  return (
    <div
      className="neko-viewport-context-menu"
      role="menu"
      style={{ left: position[0], top: position[1] }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className="neko-viewport-context-menu-item"
          disabled={item.disabled}
          data-action={item.action}
          onClick={() => onAction(item)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function renderSurface(surface: ViewportSurfaceDescriptor): React.ReactNode {
  if (surface.kind === 'custom') return surface.node;
  if (surface.kind === 'video') {
    return (
      <video
        className="neko-viewport-video"
        src={surface.url}
        aria-label={surface.label}
        muted
        playsInline
      />
    );
  }
  return <canvas className="neko-viewport-canvas" aria-label={surface.label} />;
}

function isViewportChromeEventTarget(target: EventTarget | null, root: HTMLElement): boolean {
  if (!(target instanceof Element) || target === root) {
    return false;
  }
  return (
    target.closest(
      'button, input, select, textarea, [role="button"], [role="menu"], [role="toolbar"]',
    ) !== null
  );
}

function createSharedToolbarItems(state: ViewportLocalState): ViewportToolbarItem[] {
  return [
    {
      id: 'viewport-zoom-out',
      kind: 'button',
      icon: '-',
      action: 'viewport:zoom:out',
      group: 'viewport',
      order: 0,
      payload: { zoom: state.zoom },
    },
    {
      id: 'viewport-zoom-in',
      kind: 'button',
      icon: '+',
      action: 'viewport:zoom:in',
      group: 'viewport',
      order: 1,
      payload: { zoom: state.zoom },
    },
    {
      id: 'viewport-quality',
      kind: 'select',
      icon: state.quality,
      action: 'viewport:quality',
      group: 'viewport',
      order: 2,
      value: state.quality,
      options: [
        { id: 'auto', label: 'Auto' },
        { id: 'low', label: 'Low' },
        { id: 'medium', label: 'Medium' },
        { id: 'high', label: 'High' },
      ],
    },
  ];
}

function handleSharedToolbarAction(
  item: ViewportToolbarItem,
  dispatchLocal: (command: ViewportLocalCommand) => void,
): void {
  if (item.action === 'viewport:zoom:in') {
    dispatchLocal({ type: 'zoomBy', origin: [0, 0], delta: -120 });
  }
  if (item.action === 'viewport:zoom:out') {
    dispatchLocal({ type: 'zoomBy', origin: [0, 0], delta: 120 });
  }
  if (item.action === 'viewport:quality') {
    const quality = typeof item.value === 'string' ? item.value : 'auto';
    if (quality === 'auto' || quality === 'low' || quality === 'medium' || quality === 'high') {
      dispatchLocal({ type: 'quality', quality });
    }
  }
}
