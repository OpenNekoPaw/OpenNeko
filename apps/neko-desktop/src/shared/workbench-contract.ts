import type { PreviewContentKind } from '@neko-preview/contracts';

export const DESKTOP_WORKBENCH_CONTRACT_VERSION = 1 as const;
export const APPLICATION_PRIMARY_SIDEBAR_DEFAULT_WIDTH = 240;

export const DESKTOP_WORKBENCH_LIMITS = {
  primarySidebarWidth: { min: 208, max: 360 },
  dockWidth: { min: 280, max: 520 },
  timelineHeight: { min: 160, max: 480 },
  mainViewCount: { min: 0, max: 8 },
} as const;

export type DesktopWorkbenchDockPosition = 'left' | 'right';
export type DesktopWorkbenchDockPresentation = 'hidden' | 'docked' | 'overlay';
export type DesktopWorkbenchAgentPresentation = 'main' | 'dock';
export type DesktopWorkbenchMainSplit = 'none' | 'horizontal' | 'vertical';
export type DesktopPreviewViewPresentation = 'temporary' | 'pinned' | 'side';
export type DesktopWorkbenchLayoutPreset =
  | 'agent-focus'
  | 'preview-focus'
  | 'canvas-focus'
  | 'canvas-agent'
  | 'canvas-resources'
  | 'canvas-preview'
  | 'canvas-cut'
  | 'cut-focus';
export type DesktopWorkbenchViewKind = 'agent' | 'canvas' | 'preview' | 'cut';

export interface DesktopWorkbenchViewRef {
  readonly viewId: string;
  readonly viewEpoch: number;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly kind: DesktopWorkbenchViewKind;
  readonly ownerId: string;
  readonly documentId?: string;
  readonly previewPresentation?: DesktopPreviewViewPresentation;
  readonly previewContentKind?: PreviewContentKind;
}

export interface DesktopWorkbenchLayoutProjection {
  readonly schemaVersion: typeof DESKTOP_WORKBENCH_CONTRACT_VERSION;
  readonly windowId: string;
  readonly revision: number;
  readonly preset: DesktopWorkbenchLayoutPreset;
  readonly primarySidebar: {
    readonly visible: boolean;
    readonly width: number;
  };
  readonly resourceDock: {
    readonly presentation: DesktopWorkbenchDockPresentation;
    readonly position: DesktopWorkbenchDockPosition;
    readonly width: number;
  };
  readonly agent: {
    readonly presentation: DesktopWorkbenchAgentPresentation;
    readonly dockPresentation: DesktopWorkbenchDockPresentation;
    readonly dockPosition: DesktopWorkbenchDockPosition;
    readonly width: number;
  };
  readonly main: {
    readonly views: readonly DesktopWorkbenchViewRef[];
    readonly activeViewId?: string;
    readonly sideViewId?: string;
    readonly split: DesktopWorkbenchMainSplit;
  };
  readonly timeline: {
    readonly visible: boolean;
    readonly height: number;
  };
}

export class DesktopWorkbenchContractError extends Error {
  readonly code:
    | 'invalid-desktop-workbench-payload'
    | 'unsupported-desktop-workbench-version'
    | 'desktop-workbench-stale-identity';

  constructor(
    code: DesktopWorkbenchContractError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'DesktopWorkbenchContractError';
    this.code = code;
  }
}

export function createDefaultDesktopWorkbenchLayout(
  windowId: string,
): DesktopWorkbenchLayoutProjection {
  return {
    schemaVersion: DESKTOP_WORKBENCH_CONTRACT_VERSION,
    windowId: requireNonEmptyString(windowId, 'Desktop Workbench Window identity is required.'),
    revision: 0,
    preset: 'agent-focus',
    primarySidebar: {
      visible: true,
      width: APPLICATION_PRIMARY_SIDEBAR_DEFAULT_WIDTH,
    },
    resourceDock: {
      presentation: 'hidden',
      position: 'right',
      width: 320,
    },
    agent: {
      presentation: 'main',
      dockPresentation: 'hidden',
      dockPosition: 'left',
      width: 360,
    },
    main: {
      views: [],
      split: 'none',
    },
    timeline: {
      visible: false,
      height: 240,
    },
  };
}

export function applyDesktopWorkbenchLayoutPreset(
  current: DesktopWorkbenchLayoutProjection,
  preset: DesktopWorkbenchLayoutPreset,
): DesktopWorkbenchLayoutProjection {
  const agentView = current.main.views.find((view) => view.kind === 'agent');
  const canvasView = current.main.views.find((view) => view.kind === 'canvas');
  const previewView = current.main.views.find((view) => view.kind === 'preview');
  const cutView = current.main.views.find((view) => view.kind === 'cut');
  switch (preset) {
    case 'agent-focus':
      return createPresetProjection(current, preset, requirePresetView(agentView, 'agent'), {
        agentPresentation: 'main',
        agentDockPresentation: 'hidden',
        resourcePresentation: 'hidden',
        timelineVisible: false,
      });
    case 'preview-focus':
      return createPresetProjection(
        current,
        preset,
        requirePresetView(previewView, 'preview'),
        {
          agentPresentation: 'dock',
          agentDockPresentation: 'hidden',
          resourcePresentation: current.resourceDock.presentation,
          timelineVisible: false,
        },
      );
    case 'canvas-focus':
      return createPresetProjection(current, preset, requirePresetView(canvasView, 'canvas'), {
        agentPresentation: 'dock',
        agentDockPresentation: 'hidden',
        resourcePresentation: 'hidden',
        timelineVisible: false,
      });
    case 'canvas-agent':
      requirePresetView(agentView, 'agent');
      return createPresetProjection(current, preset, requirePresetView(canvasView, 'canvas'), {
        agentPresentation: 'dock',
        agentDockPresentation: 'docked',
        resourcePresentation: 'hidden',
        timelineVisible: false,
      });
    case 'canvas-resources':
      return createPresetProjection(current, preset, requirePresetView(canvasView, 'canvas'), {
        agentPresentation: 'dock',
        agentDockPresentation: 'hidden',
        resourcePresentation: 'docked',
        timelineVisible: false,
      });
    case 'canvas-preview': {
      const canvas = requirePresetView(canvasView, 'canvas');
      const preview = requirePresetView(previewView, 'preview');
      return {
        ...createPresetProjection(current, preset, canvas, {
          agentPresentation: 'dock',
          agentDockPresentation: 'hidden',
          resourcePresentation: 'hidden',
          timelineVisible: false,
        }),
        main: {
          views: mergeOpenViews(current.main.views, canvas, preview),
          activeViewId: canvas.viewId,
          sideViewId: preview.viewId,
          split: 'horizontal',
        },
      };
    }
    case 'canvas-cut':
      requirePresetView(cutView, 'cut');
      return createPresetProjection(current, preset, requirePresetView(canvasView, 'canvas'), {
        agentPresentation: 'dock',
        agentDockPresentation: 'hidden',
        resourcePresentation: 'hidden',
        timelineVisible: true,
      });
    case 'cut-focus':
      return createPresetProjection(current, preset, requirePresetView(cutView, 'cut'), {
        agentPresentation: 'dock',
        agentDockPresentation: 'hidden',
        resourcePresentation: current.resourceDock.presentation,
        timelineVisible: false,
      });
  }
}

export function parseDesktopWorkbenchLayout(
  value: unknown,
): DesktopWorkbenchLayoutProjection {
  const record = requireRecord(value, 'Desktop Workbench layout must be an object.');
  requireVersion(record['schemaVersion']);
  const primarySidebar = requireRecord(
    record['primarySidebar'],
    'Desktop Workbench primary sidebar projection is required.',
  );
  const resourceDock = requireRecord(
    record['resourceDock'],
    'Desktop Workbench Resource Dock projection is required.',
  );
  const agent = requireRecord(
    record['agent'],
    'Desktop Workbench Agent projection is required.',
  );
  const main = requireRecord(record['main'], 'Desktop Workbench Main projection is required.');
  const timeline = requireRecord(
    record['timeline'],
    'Desktop Workbench Timeline projection is required.',
  );
  const views = requireArray(
    main['views'],
    'Desktop Workbench Main Views must be an array.',
  ).map(parseDesktopWorkbenchViewRef);

  if (views.length > DESKTOP_WORKBENCH_LIMITS.mainViewCount.max) {
    throw invalidPayload('Desktop Workbench supports at most eight open Main Views.');
  }
  const viewIds = new Set(views.map((view) => view.viewId));
  if (viewIds.size !== views.length) {
    throw invalidPayload('Desktop Workbench Main View identities must be unique.');
  }
  const activeViewId = readOptionalNonEmptyString(
    main['activeViewId'],
    'Desktop Workbench active Main View identity is invalid.',
  );
  if (activeViewId !== undefined && !viewIds.has(activeViewId)) {
    throw new DesktopWorkbenchContractError(
      'desktop-workbench-stale-identity',
      'Desktop Workbench active Main View does not exist.',
    );
  }
  const sideViewId = readOptionalNonEmptyString(
    main['sideViewId'],
    'Desktop Workbench side Main View identity is invalid.',
  );
  if (sideViewId !== undefined && !viewIds.has(sideViewId)) {
    throw new DesktopWorkbenchContractError(
      'desktop-workbench-stale-identity',
      'Desktop Workbench side Main View does not exist.',
    );
  }
  if (sideViewId !== undefined && sideViewId === activeViewId) {
    throw invalidPayload('Desktop Workbench Main and side Views must be different.');
  }
  const split = requireOneOf(
    main['split'],
    ['none', 'horizontal', 'vertical'] as const,
    'Desktop Workbench Main split is invalid.',
  );
  if (sideViewId === undefined && split !== 'none') {
    throw invalidPayload('Desktop Workbench split requires an explicit side Main View.');
  }
  if (sideViewId !== undefined && split === 'none') {
    throw invalidPayload('Desktop Workbench side Main View requires an explicit split.');
  }

  return {
    schemaVersion: DESKTOP_WORKBENCH_CONTRACT_VERSION,
    windowId: requireNonEmptyString(
      record['windowId'],
      'Desktop Workbench Window identity is required.',
    ),
    revision: requireNonNegativeInteger(
      record['revision'],
      'Desktop Workbench revision must be a non-negative integer.',
    ),
    preset: requireOneOf(
      record['preset'],
      [
        'agent-focus',
        'preview-focus',
        'canvas-focus',
        'canvas-agent',
        'canvas-resources',
        'canvas-preview',
        'canvas-cut',
        'cut-focus',
      ] as const,
      'Desktop Workbench layout preset is invalid.',
    ),
    primarySidebar: {
      visible: requireBoolean(
        primarySidebar['visible'],
        'Desktop Workbench primary sidebar visibility is invalid.',
      ),
      width: requireBoundedNumber(
        primarySidebar['width'],
        DESKTOP_WORKBENCH_LIMITS.primarySidebarWidth,
        'Desktop Workbench primary sidebar width is invalid.',
      ),
    },
    resourceDock: {
      presentation: requireOneOf(
        resourceDock['presentation'],
        ['hidden', 'docked', 'overlay'] as const,
        'Desktop Workbench Resource Dock presentation is invalid.',
      ),
      position: requireOneOf(
        resourceDock['position'],
        ['left', 'right'] as const,
        'Desktop Workbench Resource Dock position is invalid.',
      ),
      width: requireBoundedNumber(
        resourceDock['width'],
        DESKTOP_WORKBENCH_LIMITS.dockWidth,
        'Desktop Workbench Resource Dock width is invalid.',
      ),
    },
    agent: {
      presentation: requireOneOf(
        agent['presentation'],
        ['main', 'dock'] as const,
        'Desktop Workbench Agent presentation is invalid.',
      ),
      dockPresentation: requireOneOf(
        agent['dockPresentation'],
        ['hidden', 'docked', 'overlay'] as const,
        'Desktop Workbench Agent Dock presentation is invalid.',
      ),
      dockPosition: requireOneOf(
        agent['dockPosition'],
        ['left', 'right'] as const,
        'Desktop Workbench Agent Dock position is invalid.',
      ),
      width: requireBoundedNumber(
        agent['width'],
        DESKTOP_WORKBENCH_LIMITS.dockWidth,
        'Desktop Workbench Agent Dock width is invalid.',
      ),
    },
    main: {
      views,
      ...(activeViewId === undefined ? {} : { activeViewId }),
      ...(sideViewId === undefined ? {} : { sideViewId }),
      split,
    },
    timeline: {
      visible: requireBoolean(
        timeline['visible'],
        'Desktop Workbench Timeline visibility is invalid.',
      ),
      height: requireBoundedNumber(
        timeline['height'],
        DESKTOP_WORKBENCH_LIMITS.timelineHeight,
        'Desktop Workbench Timeline height is invalid.',
      ),
    },
  };
}

function parseDesktopWorkbenchViewRef(value: unknown): DesktopWorkbenchViewRef {
  const record = requireRecord(value, 'Desktop Workbench Main View must be an object.');
  const kind = requireOneOf(
    record['kind'],
    ['agent', 'canvas', 'preview', 'cut'] as const,
    'Desktop Workbench Main View kind is invalid.',
  );
  const documentId = readOptionalNonEmptyString(
    record['documentId'],
    'Desktop Workbench document identity is invalid.',
  );
  const previewPresentation =
    record['previewPresentation'] === undefined
      ? undefined
      : requireOneOf(
          record['previewPresentation'],
          ['temporary', 'pinned', 'side'] as const,
          'Desktop Workbench Preview presentation is invalid.',
        );
  const previewContentKind =
    record['previewContentKind'] === undefined
      ? undefined
      : requireOneOf(
          record['previewContentKind'],
          [
            'text',
            'image',
            'audio',
            'video',
            'document',
            'model',
          ] as const,
          'Desktop Workbench Preview content kind is invalid.',
        );
  if (
    kind !== 'preview' &&
    (previewPresentation !== undefined || previewContentKind !== undefined)
  ) {
    throw invalidPayload(
      'Desktop Workbench Preview presentation metadata belongs only to Preview Views.',
    );
  }
  return {
    viewId: requireNonEmptyString(
      record['viewId'],
      'Desktop Workbench Main View identity is required.',
    ),
    viewEpoch: requireNonNegativeInteger(
      record['viewEpoch'],
      'Desktop Workbench Main View epoch must be a non-negative integer.',
    ),
    projectId: requireNonEmptyString(
      record['projectId'],
      'Desktop Workbench Main View Project identity is required.',
    ),
    workspaceId: requireNonEmptyString(
      record['workspaceId'],
      'Desktop Workbench Main View Workspace identity is required.',
    ),
    kind,
    ownerId: requireNonEmptyString(
      record['ownerId'],
      'Desktop Workbench Main View owner identity is required.',
    ),
    ...(documentId ? { documentId } : {}),
    ...(previewPresentation ? { previewPresentation } : {}),
    ...(previewContentKind ? { previewContentKind } : {}),
  };
}

function createPresetProjection(
  current: DesktopWorkbenchLayoutProjection,
  preset: DesktopWorkbenchLayoutPreset,
  mainView: DesktopWorkbenchViewRef,
  presentation: {
    readonly agentPresentation: DesktopWorkbenchAgentPresentation;
    readonly agentDockPresentation: DesktopWorkbenchDockPresentation;
    readonly resourcePresentation: DesktopWorkbenchDockPresentation;
    readonly timelineVisible: boolean;
  },
): DesktopWorkbenchLayoutProjection {
  return {
    ...current,
    revision: current.revision + 1,
    preset,
    resourceDock: {
      ...current.resourceDock,
      presentation: presentation.resourcePresentation,
    },
    agent: {
      ...current.agent,
      presentation: presentation.agentPresentation,
      dockPresentation: presentation.agentDockPresentation,
    },
    main: {
      views: mergeOpenViews(current.main.views, mainView),
      activeViewId: mainView.viewId,
      split: 'none',
    },
    timeline: {
      ...current.timeline,
      visible: presentation.timelineVisible,
    },
  };
}

function mergeOpenViews(
  current: readonly DesktopWorkbenchViewRef[],
  ...next: readonly DesktopWorkbenchViewRef[]
): readonly DesktopWorkbenchViewRef[] {
  const nextIds = new Set(next.map((view) => view.viewId));
  return [...current.filter((view) => !nextIds.has(view.viewId)), ...next].slice(
    -DESKTOP_WORKBENCH_LIMITS.mainViewCount.max,
  );
}

function requirePresetView(
  view: DesktopWorkbenchViewRef | undefined,
  kind: DesktopWorkbenchViewKind,
): DesktopWorkbenchViewRef {
  if (!view) {
    throw invalidPayload(`Desktop Workbench '${kind}' preset View is unavailable.`);
  }
  return view;
}

function requireVersion(value: unknown): void {
  if (value !== DESKTOP_WORKBENCH_CONTRACT_VERSION) {
    throw new DesktopWorkbenchContractError(
      'unsupported-desktop-workbench-version',
      `Unsupported Desktop Workbench contract version: ${String(value)}.`,
    );
  }
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidPayload(message);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, message: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw invalidPayload(message);
  }
  return value;
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidPayload(message);
  }
  return value;
}

function readOptionalNonEmptyString(value: unknown, message: string): string | undefined {
  return value === undefined ? undefined : requireNonEmptyString(value, message);
}

function requireNonNegativeInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw invalidPayload(message);
  }
  return value;
}

function requireBoolean(value: unknown, message: string): boolean {
  if (typeof value !== 'boolean') {
    throw invalidPayload(message);
  }
  return value;
}

function requireBoundedNumber(
  value: unknown,
  range: { readonly min: number; readonly max: number },
  message: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < range.min ||
    value > range.max
  ) {
    throw invalidPayload(message);
  }
  return value;
}

function requireOneOf<const T extends string>(
  value: unknown,
  allowed: readonly T[],
  message: string,
): T {
  if (typeof value !== 'string' || !allowed.some((candidate) => candidate === value)) {
    throw invalidPayload(message);
  }
  return value as T;
}

function invalidPayload(message: string): DesktopWorkbenchContractError {
  return new DesktopWorkbenchContractError('invalid-desktop-workbench-payload', message);
}
