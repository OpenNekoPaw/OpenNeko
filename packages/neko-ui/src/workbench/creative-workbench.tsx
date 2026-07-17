import type React from 'react';
import { usePersistedResize, useResizable } from '../hooks';
import type { PersistedResizeOptions } from '../hooks';
import {
  ResizeHandle,
  SegmentedControl,
  ToolbarButton,
  ToolbarSeparator,
  ToolbarSpacer,
  VerticalToolbar,
} from '../primitives';
import { cn } from '../utils';

export type CreativeWorkbenchMainKind =
  'preview-timeline' | 'viewport-timeline' | 'waveform-timeline' | 'canvas' | 'drawing-canvas';

export type CreativeLeftRailActionKind = 'common-action' | 'visibility-toggle';

export type CreativeLeftRailVisibilityTarget = 'right-panel' | 'main-panel' | 'hud';

export type MainPanelControlPlacement =
  | 'overlay-top-left'
  | 'overlay-top-right'
  | 'overlay-bottom-left'
  | 'timeline-header'
  | 'transport'
  | 'contextual';

export interface CreativeWorkbenchShellProps {
  readonly leftRail?: React.ReactNode;
  readonly main: React.ReactNode;
  readonly mainKind: CreativeWorkbenchMainKind;
  readonly rightDock?: CreativeWorkbenchRightDockProps;
  readonly bottomPanel?: React.ReactNode;
  readonly className?: string;
  readonly bodyClassName?: string;
  readonly leftRailClassName?: string;
  readonly mainClassName?: string;
  readonly bottomPanelClassName?: string;
}

export type CreativeWorkbenchRightDockContainerProps = Omit<
  React.HTMLAttributes<HTMLElement> & Record<`data-${string}`, string | undefined>,
  'aria-label' | 'children' | 'className' | 'id' | 'role' | 'style'
>;

interface CreativeWorkbenchRightDockBaseProps {
  readonly id: string;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly resizeHandleClassName?: string;
  readonly containerProps?: CreativeWorkbenchRightDockContainerProps;
  readonly groups?: CreativeWorkbenchRightDockGroupsProps;
  readonly label?: string;
  readonly role?: React.AriaRole;
  readonly minSize?: number;
  readonly maxSize?: number;
  readonly disabled?: boolean;
}

export interface CreativeWorkbenchRightDockGroup {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface CreativeWorkbenchRightDockGroupsProps {
  readonly label: string;
  readonly activeId: string;
  readonly items: readonly CreativeWorkbenchRightDockGroup[];
  readonly onActiveIdChange: (id: string) => void;
  readonly className?: string;
}

export interface CreativeWorkbenchResizePersistenceApi {
  getState(): unknown;
  setState(state: unknown): void;
}

export interface CreativeWorkbenchRightDockResizePersistenceOptions {
  readonly api?: CreativeWorkbenchResizePersistenceApi | null;
  readonly persistDebounceMs?: number;
}

export interface CreativeWorkbenchControlledRightDockProps extends CreativeWorkbenchRightDockBaseProps {
  readonly size: number;
  readonly onSizeChange: (size: number) => void;
  readonly panelId?: never;
  readonly defaultSize?: never;
}

export interface CreativeWorkbenchPersistedRightDockProps extends CreativeWorkbenchRightDockBaseProps {
  readonly panelId: string;
  readonly defaultSize: number;
  readonly resizePersistence?: CreativeWorkbenchRightDockResizePersistenceOptions;
  readonly size?: never;
  readonly onSizeChange?: never;
}

export type CreativeWorkbenchRightDockProps =
  CreativeWorkbenchControlledRightDockProps | CreativeWorkbenchPersistedRightDockProps;

interface CreativeLeftRailBaseAction {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly active?: boolean;
  readonly expanded?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onClick: () => void;
}

export interface CreativeLeftRailCommonAction extends CreativeLeftRailBaseAction {
  readonly kind: 'common-action';
  readonly controls?: string;
  readonly visibilityTarget?: never;
}

export interface CreativeLeftRailVisibilityAction extends CreativeLeftRailBaseAction {
  readonly kind: 'visibility-toggle';
  readonly controls: string;
  readonly visibilityTarget: CreativeLeftRailVisibilityTarget;
}

export type CreativeLeftRailAction =
  CreativeLeftRailCommonAction | CreativeLeftRailVisibilityAction;

export interface CreativeLeftRailProps {
  readonly actions?: readonly CreativeLeftRailAction[];
  readonly bottomActions?: readonly CreativeLeftRailAction[];
  readonly children?: React.ReactNode;
  readonly className?: string;
  readonly width?: number;
  readonly label?: string;
}

export interface MainPanelControlLayerProps {
  readonly id: string;
  readonly visible: boolean;
  readonly placement: MainPanelControlPlacement;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly label?: string;
  readonly role?: React.AriaRole;
}

export function CreativeWorkbenchShell({
  bodyClassName,
  bottomPanel,
  bottomPanelClassName,
  className,
  leftRail,
  leftRailClassName,
  main,
  mainClassName,
  mainKind,
  rightDock,
}: CreativeWorkbenchShellProps): React.ReactElement {
  return (
    <div className={cn('neko-creative-workbench-shell', className)}>
      <div className={cn('neko-creative-workbench-body', bodyClassName)}>
        {leftRail ? (
          <aside className={cn('neko-creative-workbench-left-rail', leftRailClassName)}>
            {leftRail}
          </aside>
        ) : null}
        <main
          className={cn('neko-creative-workbench-main', mainClassName)}
          data-main-kind={mainKind}
        >
          {main}
          {bottomPanel ? (
            <div className={cn('neko-creative-workbench-bottom-panel', bottomPanelClassName)}>
              {bottomPanel}
            </div>
          ) : null}
        </main>
        {rightDock ? <CreativeWorkbenchRightDock {...rightDock} /> : null}
      </div>
    </div>
  );
}

function CreativeWorkbenchRightDock(props: CreativeWorkbenchRightDockProps): React.ReactElement {
  if (props.panelId !== undefined) {
    return <CreativeWorkbenchPersistedRightDock {...props} />;
  }

  return <CreativeWorkbenchControlledRightDock {...props} />;
}

function CreativeWorkbenchPersistedRightDock(
  props: CreativeWorkbenchPersistedRightDockProps,
): React.ReactElement {
  const { resizePersistence, ...surfaceProps } = props;
  const resize = usePersistedResize(
    props.panelId,
    props.defaultSize,
    {
      minSize: props.minSize,
      maxSize: props.maxSize,
    },
    toPersistedResizeOptions(resizePersistence),
  );

  return (
    <CreativeWorkbenchRightDockSurface
      {...surfaceProps}
      size={resize.size}
      onSizeChange={resize.setSize}
    />
  );
}

function toPersistedResizeOptions(
  options: CreativeWorkbenchRightDockResizePersistenceOptions | undefined,
): PersistedResizeOptions | undefined {
  if (!options) {
    return undefined;
  }

  const { api, persistDebounceMs } = options;
  if (api === undefined || api === null) {
    return { api, persistDebounceMs };
  }

  return {
    persistDebounceMs,
    api: {
      getState: <T = unknown,>() => api.getState() as T | undefined,
      setState: <T = unknown,>(state: T) => api.setState(state),
    },
  };
}

function CreativeWorkbenchControlledRightDock(
  props: CreativeWorkbenchControlledRightDockProps,
): React.ReactElement {
  return (
    <CreativeWorkbenchRightDockSurface
      {...props}
      size={props.size}
      onSizeChange={props.onSizeChange}
    />
  );
}

interface CreativeWorkbenchRightDockSurfaceProps extends CreativeWorkbenchRightDockBaseProps {
  readonly size: number;
  readonly onSizeChange: (size: number) => void;
}

function CreativeWorkbenchRightDockSurface({
  children,
  className,
  contentClassName,
  containerProps,
  disabled,
  groups,
  id,
  label,
  maxSize,
  minSize,
  onSizeChange,
  resizeHandleClassName,
  role,
  size,
}: CreativeWorkbenchRightDockSurfaceProps): React.ReactElement {
  const { containerRef, handleProps, isResizing } = useResizable<HTMLElement>({
    edge: 'right',
    mode: 'pixel',
    size,
    minSize,
    maxSize,
    disabled,
    onSizeChange,
  });

  return (
    <aside
      {...containerProps}
      id={id}
      ref={containerRef}
      aria-label={label}
      className={cn('neko-creative-workbench-right-panel', className)}
      data-resizing={isResizing ? 'true' : 'false'}
      role={role}
      style={{ width: size }}
    >
      <ResizeHandle
        handleProps={handleProps}
        className={cn('neko-creative-workbench-right-resize-handle', resizeHandleClassName)}
      />
      <div className="neko-creative-workbench-right-panel-body" style={RIGHT_DOCK_BODY_STYLE}>
        {groups ? <CreativeWorkbenchRightDockGroups groups={groups} dockId={id} /> : null}
        <div
          className={cn('neko-creative-workbench-right-panel-content', contentClassName)}
          data-right-dock-group={groups?.activeId}
          style={RIGHT_DOCK_CONTENT_STYLE}
        >
          {children}
        </div>
      </div>
    </aside>
  );
}

function CreativeWorkbenchRightDockGroups({
  dockId,
  groups,
}: {
  readonly dockId: string;
  readonly groups: CreativeWorkbenchRightDockGroupsProps;
}): React.ReactElement {
  return (
    <div
      className="neko-creative-workbench-right-panel-groups-shell"
      style={RIGHT_DOCK_GROUPS_SHELL_STYLE}
    >
      <SegmentedControl
        className={cn('neko-creative-workbench-right-panel-groups', groups.className)}
        controls={dockId}
        label={groups.label}
        value={groups.activeId}
        onValueChange={groups.onActiveIdChange}
        options={groups.items.map((item) => ({
          value: item.id,
          label: item.label,
          description: item.description,
          disabled: item.disabled,
        }))}
      />
    </div>
  );
}

const RIGHT_DOCK_BODY_STYLE: React.CSSProperties = {
  display: 'flex',
  flex: '1 1 auto',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
};

const RIGHT_DOCK_CONTENT_STYLE: React.CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
};

const RIGHT_DOCK_GROUPS_SHELL_STYLE: React.CSSProperties = {
  flexShrink: 0,
  padding: '8px 14px 10px',
  borderBottom: '1px solid var(--vscode-panel-border, var(--neko-border, #3c3c3c))',
  background: 'var(--vscode-sideBar-background, var(--neko-surface, #f3f3f3))',
};

export function CreativeLeftRail({
  actions = [],
  bottomActions = [],
  children,
  className,
  label,
  width = 48,
}: CreativeLeftRailProps): React.ReactElement {
  return (
    <VerticalToolbar
      className={cn('neko-creative-left-rail', className)}
      width={width}
      aria-label={label}
    >
      {actions.map((action) => (
        <CreativeLeftRailButton key={action.id} action={action} />
      ))}
      {children}
      {bottomActions.length > 0 ? (
        <>
          <ToolbarSpacer />
          <ToolbarSeparator />
          {bottomActions.map((action) => (
            <CreativeLeftRailButton key={action.id} action={action} />
          ))}
        </>
      ) : null}
    </VerticalToolbar>
  );
}

export function MainPanelControlLayer({
  children,
  className,
  id,
  label,
  placement,
  role,
  visible,
}: MainPanelControlLayerProps): React.ReactElement | null {
  if (!visible) {
    return null;
  }

  return (
    <div
      id={id}
      aria-label={label}
      className={cn('neko-main-panel-control-layer', className)}
      data-placement={placement}
      role={role}
    >
      {children}
    </div>
  );
}

function CreativeLeftRailButton({
  action,
}: {
  readonly action: CreativeLeftRailAction;
}): React.ReactElement {
  const expanded = action.expanded ?? action.active ?? false;
  const visibilityProps =
    action.kind === 'visibility-toggle'
      ? {
          'aria-controls': action.controls,
          'aria-expanded': expanded,
        }
      : {};
  const visibilityTarget =
    action.kind === 'visibility-toggle' ? action.visibilityTarget : undefined;

  return (
    <ToolbarButton
      {...visibilityProps}
      active={action.active}
      className={action.className}
      data-creative-left-rail-action={action.id}
      data-creative-left-rail-kind={action.kind}
      data-creative-left-rail-target={visibilityTarget}
      disabled={action.disabled}
      icon={action.icon}
      title={action.label}
      onClick={action.onClick}
    />
  );
}
