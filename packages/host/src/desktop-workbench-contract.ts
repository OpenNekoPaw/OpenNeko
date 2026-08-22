import type { PreviewContentKind } from '@neko/preview-domain';
import { validateContentLocator, type ContentLocator } from '@neko/content';

export const DESKTOP_PRIMARY_MAIN_GROUP_ID = 'main:primary';
export const DESKTOP_SECONDARY_MAIN_GROUP_ID = 'main:secondary';

export const DESKTOP_WORKBENCH_LIMITS = {
  dockWidth: { min: 280 },
  cutPanelHeight: { min: 280, max: 680 },
  mainViewCount: { min: 0, max: 8 },
  mainGroupCount: { min: 1, max: 2 },
  mainSplitRatio: { min: 0.25, max: 0.75 },
} as const;

export type DesktopWorkbenchDockPosition = 'left' | 'right';
export type DesktopWorkbenchDockPresentation = 'hidden' | 'docked' | 'overlay';
export type DesktopWorkbenchDisplayMode = 'chat-main' | 'chat-only' | 'main-only' | 'empty-main';
export type DesktopWorkbenchMainSplitAxis = 'columns' | 'rows';
export type DesktopPreviewViewPresentation = 'temporary' | 'pinned' | 'side';
export type DesktopWorkbenchViewKind =
  | 'project-content'
  | 'canvas'
  | 'preview'
  | 'cut'
  | 'text-editor'
  | 'character-authoring'
  | 'world-authoring';

export interface DesktopWorkbenchViewRef {
  readonly viewId: string;
  readonly viewInstanceId: string;
  readonly projectId?: string;
  readonly workspaceId: string;
  readonly kind: DesktopWorkbenchViewKind;
  readonly ownerId: string;
  readonly displayLabel: string;
  readonly documentId?: string;
  readonly editorSessionId?: string;
  readonly characterProjectId?: string;
  readonly worldProjectId?: string;
  readonly previewPresentation?: DesktopPreviewViewPresentation;
  readonly previewContentKind?: PreviewContentKind;
  readonly previewContentLocator?: ContentLocator;
}

export interface DesktopWorkbenchMainGroup {
  readonly groupId: string;
  readonly viewIds: readonly string[];
  readonly activeViewId?: string;
}

export interface DesktopWorkbenchMainSplit {
  readonly axis: DesktopWorkbenchMainSplitAxis;
  readonly ratio: number;
}

export interface DesktopWorkbenchLayoutProjection {
  readonly windowId: string;
  readonly resourceDock: {
    readonly presentation: DesktopWorkbenchDockPresentation;
    readonly width: number;
  };
  readonly display: {
    readonly mode: DesktopWorkbenchDisplayMode;
    readonly chatPosition: DesktopWorkbenchDockPosition;
    readonly chatWidth: number;
  };
  readonly main: {
    readonly views: readonly DesktopWorkbenchViewRef[];
    readonly groups: readonly DesktopWorkbenchMainGroup[];
    readonly activeGroupId: string;
    readonly split?: DesktopWorkbenchMainSplit;
  };
  readonly cutPanel?: {
    readonly presentation: 'hidden' | 'docked';
    readonly height: number;
    readonly views: readonly DesktopWorkbenchViewRef[];
    readonly activeViewId: string;
  };
}

export interface DesktopOpenMainViewOptions {
  readonly groupId?: string;
  readonly splitAxis?: DesktopWorkbenchMainSplitAxis;
  readonly replaceTemporaryPreview?: boolean;
}

export class DesktopWorkbenchContractError extends Error {
  readonly code:
    | 'invalid-desktop-workbench-payload'
    | 'desktop-workbench-stale-identity'
    | 'desktop-workbench-main-view-capacity-reached';

  constructor(code: DesktopWorkbenchContractError['code'], message: string) {
    super(message);
    this.name = 'DesktopWorkbenchContractError';
    this.code = code;
  }
}

export function createDefaultDesktopWorkbenchLayout(
  windowId: string,
): DesktopWorkbenchLayoutProjection {
  return {
    windowId: requireNonEmptyString(windowId, 'Desktop Workbench Window identity is required.'),
    resourceDock: {
      presentation: 'docked',
      width: 320,
    },
    display: {
      mode: 'chat-main',
      chatPosition: 'left',
      chatWidth: 360,
    },
    main: {
      views: [],
      groups: [{ groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID, viewIds: [] }],
      activeGroupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
    },
  };
}

export function parseDesktopWorkbenchLayout(value: unknown): DesktopWorkbenchLayoutProjection {
  const record = requireRecord(value, 'Desktop Workbench layout must be an object.');
  requireExactKeys(
    record,
    [
      'windowId',
      'resourceDock',
      'display',
      'main',
      ...(record['cutPanel'] === undefined ? [] : ['cutPanel']),
    ],
    'Desktop Workbench layout',
  );
  const resourceDock = requireRecord(
    record['resourceDock'],
    'Desktop Workbench Resource Dock projection is required.',
  );
  const display = requireRecord(
    record['display'],
    'Desktop Workbench display projection is required.',
  );
  requireExactKeys(
    display,
    ['mode', 'chatPosition', 'chatWidth'],
    'Desktop Workbench display projection',
  );
  const main = requireRecord(record['main'], 'Desktop Workbench Main projection is required.');
  const views = requireArray(main['views'], 'Desktop Workbench Main Views must be an array.').map(
    parseDesktopWorkbenchViewRef,
  );
  if (views.some((view) => view.kind === 'cut')) {
    throw invalidPayload('Desktop Workbench Main accepts Canvas and Preview Views, not Cut Views.');
  }
  if (views.length > DESKTOP_WORKBENCH_LIMITS.mainViewCount.max) {
    throw mainViewCapacityReached();
  }
  const viewIds = new Set(views.map((view) => view.viewId));
  if (viewIds.size !== views.length) {
    throw invalidPayload('Desktop Workbench Main View identities must be unique.');
  }
  const groups = requireArray(
    main['groups'],
    'Desktop Workbench Main Groups must be an array.',
  ).map((group) => parseDesktopWorkbenchMainGroup(group, viewIds));
  validateMainGroups(groups, viewIds);
  const activeGroupId = requireNonEmptyString(
    main['activeGroupId'],
    'Desktop Workbench active Main Group identity is required.',
  );
  if (!groups.some((group) => group.groupId === activeGroupId)) {
    throw staleIdentity('Desktop Workbench active Main Group does not exist.');
  }
  const split =
    main['split'] === undefined ? undefined : parseDesktopWorkbenchMainSplit(main['split']);
  if (groups.length === 1 && split !== undefined) {
    throw invalidPayload('Desktop Workbench split requires two Main Groups.');
  }
  if (groups.length === 2 && split === undefined) {
    throw invalidPayload('Desktop Workbench two-Group layout requires a split.');
  }

  const cutPanel =
    record['cutPanel'] === undefined
      ? undefined
      : parseDesktopWorkbenchCutPanel(record['cutPanel']);
  const displayMode = requireOneOf(
    display['mode'],
    ['chat-main', 'chat-only', 'main-only', 'empty-main'] as const,
    'Desktop Workbench display mode is invalid.',
  );
  if (displayMode === 'empty-main' && cutPanel?.presentation !== 'docked') {
    throw invalidPayload("Desktop display mode 'empty-main' requires a docked Cut Panel.");
  }

  return {
    windowId: requireNonEmptyString(
      record['windowId'],
      'Desktop Workbench Window identity is required.',
    ),
    resourceDock: {
      presentation: requireOneOf(
        resourceDock['presentation'],
        ['hidden', 'docked', 'overlay'] as const,
        'Desktop Workbench Resource Dock presentation is invalid.',
      ),
      width: requireBoundedNumber(
        resourceDock['width'],
        DESKTOP_WORKBENCH_LIMITS.dockWidth,
        'Desktop Workbench Resource Dock width is invalid.',
      ),
    },
    display: {
      mode: displayMode,
      chatPosition: requireOneOf(
        display['chatPosition'],
        ['left', 'right'] as const,
        'Desktop Workbench Chat position is invalid.',
      ),
      chatWidth: requireBoundedNumber(
        display['chatWidth'],
        DESKTOP_WORKBENCH_LIMITS.dockWidth,
        'Desktop Workbench Chat width is invalid.',
      ),
    },
    main: {
      views,
      groups,
      activeGroupId,
      ...(split === undefined ? {} : { split }),
    },
    ...(cutPanel === undefined ? {} : { cutPanel }),
  };
}

export function setWorkbenchDisplayMode(
  workbench: DesktopWorkbenchLayoutProjection,
  mode: DesktopWorkbenchDisplayMode,
  chatPosition = workbench.display.chatPosition,
): DesktopWorkbenchLayoutProjection {
  if (mode === 'empty-main' && workbench.cutPanel?.presentation !== 'docked') {
    throw invalidPayload(`Desktop display mode '${mode}' requires a docked Cut Panel.`);
  }
  return {
    ...workbench,
    display: {
      ...workbench.display,
      mode,
      chatPosition,
    },
  };
}

export function openOrFocusMainView(
  workbench: DesktopWorkbenchLayoutProjection,
  view: DesktopWorkbenchViewRef,
  options: DesktopOpenMainViewOptions = {},
): DesktopWorkbenchLayoutProjection {
  const parsedView = parseDesktopWorkbenchViewRef(view);
  if (parsedView.kind === 'cut') {
    throw invalidPayload('Desktop Cut Views belong to the Cut Panel, not Main.');
  }
  const existingTextEditor =
    parsedView.kind === 'text-editor'
      ? workbench.main.views.find(
          (candidate) =>
            candidate.kind === 'text-editor' &&
            candidate.projectId === parsedView.projectId &&
            candidate.workspaceId === parsedView.workspaceId &&
            candidate.documentId === parsedView.documentId,
        )
      : undefined;
  if (existingTextEditor && existingTextEditor.viewId !== parsedView.viewId) {
    const group = findMainGroupForView(workbench, existingTextEditor.viewId);
    if (!group) {
      throw staleIdentity(
        `Desktop Text Editor View '${existingTextEditor.viewId}' has no Group membership.`,
      );
    }
    return parseDesktopWorkbenchLayout({
      ...workbench,
      main: {
        ...workbench.main,
        groups: workbench.main.groups.map((candidate) =>
          candidate.groupId === group.groupId
            ? { ...candidate, activeViewId: existingTextEditor.viewId }
            : candidate,
        ),
        activeGroupId: group.groupId,
      },
    });
  }
  const existing = workbench.main.views.find((candidate) => candidate.viewId === parsedView.viewId);
  const existingGroup = findMainGroupForView(workbench, parsedView.viewId);
  if (existing && !existingGroup) {
    throw staleIdentity(`Desktop Main View '${parsedView.viewId}' has no Group membership.`);
  }
  if (existingGroup) {
    if (
      options.splitAxis !== undefined &&
      existingGroup.groupId === DESKTOP_PRIMARY_MAIN_GROUP_ID
    ) {
      const sourceViewIds = existingGroup.viewIds.filter(
        (candidate) => candidate !== parsedView.viewId,
      );
      const source = {
        ...existingGroup,
        viewIds: sourceViewIds,
        ...(sourceViewIds.length === 0
          ? { activeViewId: undefined }
          : {
              activeViewId:
                existingGroup.activeViewId === parsedView.viewId
                  ? sourceViewIds.at(-1)
                  : existingGroup.activeViewId,
            }),
      };
      const currentSecondary = workbench.main.groups.find(
        (group) => group.groupId === DESKTOP_SECONDARY_MAIN_GROUP_ID,
      );
      const secondary = {
        ...(currentSecondary ?? {
          groupId: DESKTOP_SECONDARY_MAIN_GROUP_ID,
          viewIds: [],
        }),
        viewIds: [
          ...(currentSecondary?.viewIds.filter((candidate) => candidate !== parsedView.viewId) ??
            []),
          parsedView.viewId,
        ],
        activeViewId: parsedView.viewId,
      };
      return parseDesktopWorkbenchLayout({
        ...workbench,
        main: {
          views: workbench.main.views.map((candidate) =>
            candidate.viewId === parsedView.viewId ? parsedView : candidate,
          ),
          groups: [source, secondary],
          activeGroupId: DESKTOP_SECONDARY_MAIN_GROUP_ID,
          split: {
            axis: options.splitAxis,
            ratio: workbench.main.split?.ratio ?? 0.5,
          },
        },
      });
    }
    const next = {
      ...workbench,
      main: {
        ...workbench.main,
        views: workbench.main.views.map((candidate) =>
          candidate.viewId === parsedView.viewId ? parsedView : candidate,
        ),
        groups: workbench.main.groups.map((group) =>
          group.groupId === existingGroup.groupId
            ? { ...group, activeViewId: parsedView.viewId }
            : group,
        ),
        activeGroupId: existingGroup.groupId,
      },
    };
    return parseDesktopWorkbenchLayout(next);
  }

  const targetGroupId = options.groupId ?? workbench.main.activeGroupId;
  const targetGroup = workbench.main.groups.find((group) => group.groupId === targetGroupId);
  if (!targetGroup) {
    throw staleIdentity(`Desktop Main Group '${targetGroupId}' does not exist.`);
  }
  const withoutTemporary = options.replaceTemporaryPreview
    ? removeTemporaryPreviewFromGroup(workbench, targetGroupId)
    : workbench;
  const effectiveTarget = withoutTemporary.main.groups.find(
    (group) => group.groupId === targetGroupId,
  );
  if (!effectiveTarget) {
    throw staleIdentity(`Desktop Main Group '${targetGroupId}' disappeared.`);
  }
  let groups = withoutTemporary.main.groups.map((group) =>
    group.groupId === targetGroupId
      ? {
          ...group,
          viewIds: [...group.viewIds, parsedView.viewId],
          activeViewId: parsedView.viewId,
        }
      : group,
  );
  let split = withoutTemporary.main.split;
  let activeGroupId = targetGroupId;
  if (options.splitAxis !== undefined) {
    if (groups.length === 1) {
      groups = [
        effectiveTarget,
        {
          groupId: DESKTOP_SECONDARY_MAIN_GROUP_ID,
          viewIds: [parsedView.viewId],
          activeViewId: parsedView.viewId,
        },
      ];
      groups = groups.map((group) => (group.groupId === targetGroupId ? effectiveTarget : group));
      split = { axis: options.splitAxis, ratio: 0.5 };
      activeGroupId = DESKTOP_SECONDARY_MAIN_GROUP_ID;
    } else {
      const other = groups.find((group) => group.groupId !== targetGroupId);
      if (!other) throw invalidPayload('Desktop split target Group is unavailable.');
      groups = groups.map((group) =>
        group.groupId === targetGroupId
          ? effectiveTarget
          : {
              ...group,
              viewIds: [...group.viewIds, parsedView.viewId],
              activeViewId: parsedView.viewId,
            },
      );
      split = { ...(split ?? { ratio: 0.5 }), axis: options.splitAxis };
      activeGroupId = other.groupId;
    }
  }
  const next = {
    ...withoutTemporary,
    main: {
      views: [...withoutTemporary.main.views, parsedView],
      groups,
      activeGroupId,
      ...(split === undefined ? {} : { split }),
    },
  };
  return parseDesktopWorkbenchLayout(next);
}

export function closeMainView(
  workbench: DesktopWorkbenchLayoutProjection,
  viewId: string,
): DesktopWorkbenchLayoutProjection {
  const view = requireMainView(workbench, viewId);
  const sourceGroup = requireMainGroupForView(workbench, viewId);
  const remainingIds = sourceGroup.viewIds.filter((candidate) => candidate !== viewId);
  let groups = workbench.main.groups.map((group) =>
    group.groupId === sourceGroup.groupId
      ? {
          ...group,
          viewIds: remainingIds,
          ...(remainingIds.length === 0
            ? { activeViewId: undefined }
            : {
                activeViewId:
                  group.activeViewId === viewId ? remainingIds.at(-1) : group.activeViewId,
              }),
        }
      : group,
  );
  let split = workbench.main.split;
  let activeGroupId = workbench.main.activeGroupId;
  if (groups.length === 2 && remainingIds.length === 0) {
    groups = groups.filter((group) => group.groupId !== sourceGroup.groupId);
    const retained = groups[0];
    if (!retained) throw invalidPayload('Desktop Main requires one retained Group.');
    groups = [{ ...retained, groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID }];
    activeGroupId = DESKTOP_PRIMARY_MAIN_GROUP_ID;
    split = undefined;
  }
  const next = {
    ...workbench,
    main: {
      views: workbench.main.views.filter((candidate) => candidate.viewId !== view.viewId),
      groups,
      activeGroupId,
      ...(split === undefined ? {} : { split }),
    },
  };
  return parseDesktopWorkbenchLayout(next);
}

export function reorderMainView(
  workbench: DesktopWorkbenchLayoutProjection,
  groupId: string,
  sourceViewId: string,
  targetViewId: string,
): DesktopWorkbenchLayoutProjection {
  const group = requireMainGroup(workbench, groupId);
  const sourceIndex = group.viewIds.indexOf(sourceViewId);
  const targetIndex = group.viewIds.indexOf(targetViewId);
  if (sourceIndex < 0 || targetIndex < 0) {
    throw staleIdentity('Desktop Main Tab reorder requires two Views in the same Group.');
  }
  const viewIds = [...group.viewIds];
  const [source] = viewIds.splice(sourceIndex, 1);
  if (!source) throw staleIdentity('Desktop Main Tab reorder source is unavailable.');
  viewIds.splice(targetIndex, 0, source);
  return parseDesktopWorkbenchLayout({
    ...workbench,
    main: {
      ...workbench.main,
      groups: workbench.main.groups.map((candidate) =>
        candidate.groupId === groupId ? { ...candidate, viewIds } : candidate,
      ),
    },
  });
}

export function splitMainView(
  workbench: DesktopWorkbenchLayoutProjection,
  viewId: string,
  axis: DesktopWorkbenchMainSplitAxis,
): DesktopWorkbenchLayoutProjection {
  const view = requireMainView(workbench, viewId);
  const source = requireMainGroupForView(workbench, viewId);
  if (source.viewIds.length < 2) {
    throw invalidPayload('Desktop cannot split the only Main Tab into an empty source Group.');
  }
  const target = workbench.main.groups.find((group) => group.groupId !== source.groupId) ?? {
    groupId: DESKTOP_SECONDARY_MAIN_GROUP_ID,
    viewIds: [],
  };
  const sourceViewIds = source.viewIds.filter((candidate) => candidate !== viewId);
  const nextSource = {
    ...source,
    viewIds: sourceViewIds,
    activeViewId: source.activeViewId === viewId ? sourceViewIds.at(-1) : source.activeViewId,
  };
  const nextTarget = {
    ...target,
    viewIds: [...target.viewIds.filter((candidate) => candidate !== viewId), view.viewId],
    activeViewId: view.viewId,
  };
  const groups =
    workbench.main.groups.length === 1
      ? [nextSource, nextTarget]
      : workbench.main.groups.map((group) =>
          group.groupId === source.groupId ? nextSource : nextTarget,
        );
  return parseDesktopWorkbenchLayout({
    ...workbench,
    main: {
      ...workbench.main,
      groups,
      activeGroupId: nextTarget.groupId,
      split: {
        axis,
        ratio: workbench.main.split?.ratio ?? 0.5,
      },
    },
  });
}

export function resizeMainSplit(
  workbench: DesktopWorkbenchLayoutProjection,
  ratio: number,
): DesktopWorkbenchLayoutProjection {
  if (!workbench.main.split) {
    throw invalidPayload('Desktop Main split resize requires two Groups.');
  }
  return parseDesktopWorkbenchLayout({
    ...workbench,
    main: {
      ...workbench.main,
      split: {
        ...workbench.main.split,
        ratio,
      },
    },
  });
}

export function openOrFocusCutView(
  workbench: DesktopWorkbenchLayoutProjection,
  view: DesktopWorkbenchViewRef,
): DesktopWorkbenchLayoutProjection {
  const parsedView = parseDesktopWorkbenchViewRef(view);
  if (parsedView.kind !== 'cut') {
    throw invalidPayload('Desktop Cut Panel accepts only Cut Views.');
  }
  const current = workbench.cutPanel;
  const views = current?.views.some((candidate) => candidate.viewId === parsedView.viewId)
    ? current.views.map((candidate) =>
        candidate.viewId === parsedView.viewId ? parsedView : candidate,
      )
    : [...(current?.views ?? []), parsedView];
  return parseDesktopWorkbenchLayout({
    ...workbench,
    cutPanel: {
      presentation: 'docked',
      height: current?.height ?? 420,
      views,
      activeViewId: parsedView.viewId,
    },
  });
}

export function closeCutView(
  workbench: DesktopWorkbenchLayoutProjection,
  viewId: string,
): DesktopWorkbenchLayoutProjection {
  const panel = requireCutPanel(workbench);
  requireCutView(workbench, viewId);
  const views = panel.views.filter((view) => view.viewId !== viewId);
  if (views.length === 0) {
    const { cutPanel: _cutPanel, ...withoutCutPanel } = workbench;
    return parseDesktopWorkbenchLayout({
      ...withoutCutPanel,
      display:
        workbench.display.mode === 'empty-main'
          ? { ...workbench.display, mode: 'chat-only' }
          : workbench.display,
    });
  }
  return parseDesktopWorkbenchLayout({
    ...workbench,
    cutPanel: {
      ...panel,
      views,
      activeViewId: panel.activeViewId === viewId ? views.at(-1)?.viewId : panel.activeViewId,
    },
  });
}

export function reorderCutView(
  workbench: DesktopWorkbenchLayoutProjection,
  sourceViewId: string,
  targetViewId: string,
): DesktopWorkbenchLayoutProjection {
  const panel = requireCutPanel(workbench);
  const sourceIndex = panel.views.findIndex((view) => view.viewId === sourceViewId);
  const targetIndex = panel.views.findIndex((view) => view.viewId === targetViewId);
  if (sourceIndex < 0 || targetIndex < 0) {
    throw staleIdentity('Desktop Cut Tab reorder requires two attached Cut Views.');
  }
  const views = [...panel.views];
  const [source] = views.splice(sourceIndex, 1);
  if (!source) throw staleIdentity('Desktop Cut Tab reorder source is unavailable.');
  views.splice(targetIndex, 0, source);
  return parseDesktopWorkbenchLayout({
    ...workbench,
    cutPanel: { ...panel, views },
  });
}

export function setCutPanelPresentation(
  workbench: DesktopWorkbenchLayoutProjection,
  presentation: 'hidden' | 'docked',
): DesktopWorkbenchLayoutProjection {
  const panel = requireCutPanel(workbench);
  return parseDesktopWorkbenchLayout({
    ...workbench,
    cutPanel: { ...panel, presentation },
  });
}

export function resizeCutPanel(
  workbench: DesktopWorkbenchLayoutProjection,
  height: number,
): DesktopWorkbenchLayoutProjection {
  const panel = requireCutPanel(workbench);
  return parseDesktopWorkbenchLayout({
    ...workbench,
    cutPanel: { ...panel, height },
  });
}

export function getActiveCutView(
  workbench: DesktopWorkbenchLayoutProjection,
): DesktopWorkbenchViewRef | undefined {
  return workbench.cutPanel?.views.find((view) => view.viewId === workbench.cutPanel?.activeViewId);
}

export function getActiveMainView(
  workbench: DesktopWorkbenchLayoutProjection,
  groupId = workbench.main.activeGroupId,
): DesktopWorkbenchViewRef | undefined {
  const group = requireMainGroup(workbench, groupId);
  return workbench.main.views.find((view) => view.viewId === group.activeViewId);
}

export function findMainGroupForView(
  workbench: DesktopWorkbenchLayoutProjection,
  viewId: string,
): DesktopWorkbenchMainGroup | undefined {
  return workbench.main.groups.find((group) => group.viewIds.includes(viewId));
}

function parseDesktopWorkbenchViewRef(value: unknown): DesktopWorkbenchViewRef {
  const record = requireRecord(value, 'Desktop Workbench Main View must be an object.');
  requireExactKeys(
    record,
    [
      'viewId',
      'viewInstanceId',
      ...(record['projectId'] === undefined ? [] : ['projectId']),
      'workspaceId',
      'kind',
      'ownerId',
      'displayLabel',
      ...(record['documentId'] === undefined ? [] : ['documentId']),
      ...(record['editorSessionId'] === undefined ? [] : ['editorSessionId']),
      ...(record['characterProjectId'] === undefined ? [] : ['characterProjectId']),
      ...(record['worldProjectId'] === undefined ? [] : ['worldProjectId']),
      ...(record['previewPresentation'] === undefined ? [] : ['previewPresentation']),
      ...(record['previewContentKind'] === undefined ? [] : ['previewContentKind']),
      ...(record['previewContentLocator'] === undefined ? [] : ['previewContentLocator']),
    ],
    'Desktop Workbench Main View',
  );
  const kind = requireOneOf(
    record['kind'],
    [
      'project-content',
      'canvas',
      'preview',
      'cut',
      'text-editor',
      'character-authoring',
      'world-authoring',
    ] as const,
    'Desktop Workbench Main View kind is invalid.',
  );
  const documentId = readOptionalNonEmptyString(
    record['documentId'],
    'Desktop Workbench document identity is invalid.',
  );
  const editorSessionId = readOptionalNonEmptyString(
    record['editorSessionId'],
    'Desktop Text Editor session identity is invalid.',
  );
  const characterProjectId = readOptionalNonEmptyString(
    record['characterProjectId'],
    'Desktop Character authoring target identity is invalid.',
  );
  const worldProjectId = readOptionalNonEmptyString(
    record['worldProjectId'],
    'Desktop World authoring target identity is invalid.',
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
          ['text', 'image', 'audio', 'video', 'document', 'model'] as const,
          'Desktop Workbench Preview content kind is invalid.',
        );
  const previewContentLocatorResult =
    record['previewContentLocator'] === undefined
      ? undefined
      : validateContentLocator(record['previewContentLocator']);
  if (previewContentLocatorResult && !previewContentLocatorResult.ok) {
    throw invalidPayload('Desktop Workbench Preview ContentLocator is invalid.');
  }
  const previewContentLocator = previewContentLocatorResult?.locator;
  if (
    kind !== 'preview' &&
    (previewPresentation !== undefined ||
      previewContentKind !== undefined ||
      previewContentLocator !== undefined)
  ) {
    throw invalidPayload(
      'Desktop Workbench Preview presentation metadata belongs only to Preview Views.',
    );
  }
  if (kind === 'text-editor' && (!documentId || !editorSessionId)) {
    throw invalidPayload(
      'Desktop Text Editor View requires exact document and editor session identities.',
    );
  }
  if (kind !== 'text-editor' && editorSessionId !== undefined) {
    throw invalidPayload('Desktop Text Editor session identity belongs only to Text Editor Views.');
  }
  if (kind === 'character-authoring' && !characterProjectId) {
    throw invalidPayload('Desktop Character authoring View requires an exact CharacterProject.');
  }
  if (kind !== 'character-authoring' && characterProjectId !== undefined) {
    throw invalidPayload(
      'Desktop CharacterProject identity belongs only to Character authoring Views.',
    );
  }
  if (kind === 'world-authoring' && !worldProjectId) {
    throw invalidPayload('Desktop World authoring View requires an exact WorldProject.');
  }
  if (kind !== 'world-authoring' && worldProjectId !== undefined) {
    throw invalidPayload('Desktop WorldProject identity belongs only to World authoring Views.');
  }
  const projectId = readOptionalNonEmptyString(
    record['projectId'],
    'Desktop Workbench Main View Project identity is invalid.',
  );
  if (kind !== 'character-authoring' && kind !== 'world-authoring' && !projectId) {
    throw invalidPayload('Desktop Workbench Main View requires an exact Project identity.');
  }
  if (
    (kind === 'project-content' || kind === 'character-authoring' || kind === 'world-authoring') &&
    (documentId !== undefined || editorSessionId !== undefined)
  ) {
    throw invalidPayload(
      'Project and domain authoring Views cannot carry Content document identities.',
    );
  }
  return {
    viewId: requireNonEmptyString(
      record['viewId'],
      'Desktop Workbench Main View identity is required.',
    ),
    viewInstanceId: requireNonEmptyString(
      record['viewInstanceId'],
      'Desktop Workbench Main View instance identity is required.',
    ),
    ...(projectId === undefined ? {} : { projectId }),
    workspaceId: requireNonEmptyString(
      record['workspaceId'],
      'Desktop Workbench Main View Workspace identity is required.',
    ),
    kind,
    ownerId: requireNonEmptyString(
      record['ownerId'],
      'Desktop Workbench Main View owner identity is required.',
    ),
    displayLabel: requireNonEmptyString(
      record['displayLabel'],
      'Desktop Workbench Main View display label is required.',
    ),
    ...(documentId ? { documentId } : {}),
    ...(editorSessionId ? { editorSessionId } : {}),
    ...(characterProjectId ? { characterProjectId } : {}),
    ...(worldProjectId ? { worldProjectId } : {}),
    ...(previewPresentation ? { previewPresentation } : {}),
    ...(previewContentKind ? { previewContentKind } : {}),
    ...(previewContentLocator ? { previewContentLocator } : {}),
  };
}

function parseDesktopWorkbenchCutPanel(
  value: unknown,
): NonNullable<DesktopWorkbenchLayoutProjection['cutPanel']> {
  const record = requireRecord(value, 'Desktop Workbench Cut Panel projection is required.');
  requireExactKeys(
    record,
    ['presentation', 'height', 'views', 'activeViewId'],
    'Desktop Workbench Cut Panel projection',
  );
  const views = requireArray(record['views'], 'Desktop Cut Panel Views must be an array.').map(
    parseDesktopWorkbenchViewRef,
  );
  if (views.length === 0 || views.length > DESKTOP_WORKBENCH_LIMITS.mainViewCount.max) {
    throw invalidPayload('Desktop Cut Panel requires between one and eight Cut Views.');
  }
  if (views.some((view) => view.kind !== 'cut')) {
    throw invalidPayload('Desktop Cut Panel accepts only Cut Views.');
  }
  const viewIds = new Set(views.map((view) => view.viewId));
  if (viewIds.size !== views.length) {
    throw invalidPayload('Desktop Cut Panel View identities must be unique.');
  }
  const activeViewId = requireNonEmptyString(
    record['activeViewId'],
    'Desktop Cut Panel active View identity is required.',
  );
  if (!viewIds.has(activeViewId)) {
    throw staleIdentity('Desktop Cut Panel active View does not exist.');
  }
  return {
    presentation: requireOneOf(
      record['presentation'],
      ['hidden', 'docked'] as const,
      'Desktop Cut Panel presentation is invalid.',
    ),
    height: requireBoundedNumber(
      record['height'],
      DESKTOP_WORKBENCH_LIMITS.cutPanelHeight,
      'Desktop Cut Panel height is invalid.',
    ),
    views,
    activeViewId,
  };
}

function parseDesktopWorkbenchMainGroup(
  value: unknown,
  viewIds: ReadonlySet<string>,
): DesktopWorkbenchMainGroup {
  const record = requireRecord(value, 'Desktop Workbench Main Group must be an object.');
  const groupViewIds = requireArray(
    record['viewIds'],
    'Desktop Workbench Main Group View identities must be an array.',
  ).map((viewId) =>
    requireNonEmptyString(viewId, 'Desktop Workbench Main Group View identity is invalid.'),
  );
  if (new Set(groupViewIds).size !== groupViewIds.length) {
    throw invalidPayload('Desktop Workbench Main Group View identities must be unique.');
  }
  for (const viewId of groupViewIds) {
    if (!viewIds.has(viewId)) {
      throw staleIdentity(`Desktop Workbench Main Group references missing View '${viewId}'.`);
    }
  }
  const activeViewId = readOptionalNonEmptyString(
    record['activeViewId'],
    'Desktop Workbench active Main View identity is invalid.',
  );
  if (groupViewIds.length === 0 && activeViewId !== undefined) {
    throw invalidPayload('Empty Desktop Main Group cannot have an active View.');
  }
  if (groupViewIds.length > 0 && !activeViewId) {
    throw invalidPayload('Non-empty Desktop Main Group requires an active View.');
  }
  if (activeViewId !== undefined && !groupViewIds.includes(activeViewId)) {
    throw staleIdentity('Desktop Workbench active Main View is not in its Group.');
  }
  return {
    groupId: requireNonEmptyString(
      record['groupId'],
      'Desktop Workbench Main Group identity is required.',
    ),
    viewIds: groupViewIds,
    ...(activeViewId === undefined ? {} : { activeViewId }),
  };
}

function parseDesktopWorkbenchMainSplit(value: unknown): DesktopWorkbenchMainSplit {
  const record = requireRecord(value, 'Desktop Workbench Main split must be an object.');
  return {
    axis: requireOneOf(
      record['axis'],
      ['columns', 'rows'] as const,
      'Desktop Workbench Main split axis is invalid.',
    ),
    ratio: requireBoundedNumber(
      record['ratio'],
      DESKTOP_WORKBENCH_LIMITS.mainSplitRatio,
      'Desktop Workbench Main split ratio is invalid.',
    ),
  };
}

function validateMainGroups(
  groups: readonly DesktopWorkbenchMainGroup[],
  viewIds: ReadonlySet<string>,
): void {
  if (
    groups.length < DESKTOP_WORKBENCH_LIMITS.mainGroupCount.min ||
    groups.length > DESKTOP_WORKBENCH_LIMITS.mainGroupCount.max
  ) {
    throw invalidPayload('Desktop Workbench requires one or two Main Groups.');
  }
  const groupIds = new Set(groups.map((group) => group.groupId));
  if (groupIds.size !== groups.length) {
    throw invalidPayload('Desktop Workbench Main Group identities must be unique.');
  }
  if (
    groups[0]?.groupId !== DESKTOP_PRIMARY_MAIN_GROUP_ID ||
    (groups.length === 2 && groups[1]?.groupId !== DESKTOP_SECONDARY_MAIN_GROUP_ID)
  ) {
    throw invalidPayload(
      'Desktop Workbench Main Groups must use the stable primary/secondary order.',
    );
  }
  const memberships = groups.flatMap((group) => group.viewIds);
  if (new Set(memberships).size !== memberships.length) {
    throw invalidPayload('Each Desktop Main View must belong to exactly one Group.');
  }
  if (memberships.length !== viewIds.size || memberships.some((viewId) => !viewIds.has(viewId))) {
    throw staleIdentity('Each attached Desktop Main View requires one Group membership.');
  }
}

function removeTemporaryPreviewFromGroup(
  workbench: DesktopWorkbenchLayoutProjection,
  groupId: string,
): DesktopWorkbenchLayoutProjection {
  const group = requireMainGroup(workbench, groupId);
  const temporaryIds = new Set(
    workbench.main.views
      .filter(
        (view) =>
          group.viewIds.includes(view.viewId) &&
          view.kind === 'preview' &&
          view.previewPresentation === 'temporary',
      )
      .map((view) => view.viewId),
  );
  if (temporaryIds.size === 0) return workbench;
  const viewIds = group.viewIds.filter((viewId) => !temporaryIds.has(viewId));
  return {
    ...workbench,
    main: {
      ...workbench.main,
      views: workbench.main.views.filter((view) => !temporaryIds.has(view.viewId)),
      groups: workbench.main.groups.map((candidate) =>
        candidate.groupId === groupId
          ? {
              ...candidate,
              viewIds,
              ...(viewIds.length === 0
                ? { activeViewId: undefined }
                : {
                    activeViewId:
                      candidate.activeViewId && !temporaryIds.has(candidate.activeViewId)
                        ? candidate.activeViewId
                        : viewIds.at(-1),
                  }),
            }
          : candidate,
      ),
    },
  };
}

function requireMainView(
  workbench: DesktopWorkbenchLayoutProjection,
  viewId: string,
): DesktopWorkbenchViewRef {
  const view = workbench.main.views.find((candidate) => candidate.viewId === viewId);
  if (!view) throw staleIdentity(`Desktop Main View '${viewId}' does not exist.`);
  return view;
}

function requireCutPanel(
  workbench: DesktopWorkbenchLayoutProjection,
): NonNullable<DesktopWorkbenchLayoutProjection['cutPanel']> {
  if (!workbench.cutPanel) throw staleIdentity('Desktop Cut Panel does not exist.');
  return workbench.cutPanel;
}

function requireCutView(
  workbench: DesktopWorkbenchLayoutProjection,
  viewId: string,
): DesktopWorkbenchViewRef {
  const view = requireCutPanel(workbench).views.find((candidate) => candidate.viewId === viewId);
  if (!view) throw staleIdentity(`Desktop Cut View '${viewId}' does not exist.`);
  return view;
}

function requireMainGroup(
  workbench: DesktopWorkbenchLayoutProjection,
  groupId: string,
): DesktopWorkbenchMainGroup {
  const group = workbench.main.groups.find((candidate) => candidate.groupId === groupId);
  if (!group) throw staleIdentity(`Desktop Main Group '${groupId}' does not exist.`);
  return group;
}

function requireMainGroupForView(
  workbench: DesktopWorkbenchLayoutProjection,
  viewId: string,
): DesktopWorkbenchMainGroup {
  const group = findMainGroupForView(workbench, viewId);
  if (!group) throw staleIdentity(`Desktop Main View '${viewId}' has no Group membership.`);
  return group;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidPayload(message);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw invalidPayload(`${label} has unexpected fields: ${actual.join(', ')}.`);
  }
}

function requireArray(value: unknown, message: string): readonly unknown[] {
  if (!Array.isArray(value)) throw invalidPayload(message);
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

function requireBoundedNumber(
  value: unknown,
  bounds: { readonly min: number; readonly max?: number },
  message: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < bounds.min ||
    (bounds.max !== undefined && value > bounds.max)
  ) {
    throw invalidPayload(message);
  }
  return value;
}

function requireOneOf<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  message: string,
): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) {
    throw invalidPayload(message);
  }
  return value as T[number];
}

function invalidPayload(message: string): DesktopWorkbenchContractError {
  return new DesktopWorkbenchContractError('invalid-desktop-workbench-payload', message);
}

function staleIdentity(message: string): DesktopWorkbenchContractError {
  return new DesktopWorkbenchContractError('desktop-workbench-stale-identity', message);
}

function mainViewCapacityReached(): DesktopWorkbenchContractError {
  return new DesktopWorkbenchContractError(
    'desktop-workbench-main-view-capacity-reached',
    'Desktop Workbench supports at most eight open Main Views.',
  );
}
