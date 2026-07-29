import type { PreviewContentKind } from '@neko-preview/contracts';

export const DESKTOP_WORKBENCH_CONTRACT_VERSION = 2 as const;
export const APPLICATION_PRIMARY_SIDEBAR_DEFAULT_WIDTH = 240;
export const DESKTOP_PRIMARY_MAIN_GROUP_ID = 'main:primary';
export const DESKTOP_SECONDARY_MAIN_GROUP_ID = 'main:secondary';

export const DESKTOP_WORKBENCH_LIMITS = {
  primarySidebarWidth: { min: 208, max: 360 },
  dockWidth: { min: 280, max: 520 },
  timelineHeight: { min: 160, max: 480 },
  mainViewCount: { min: 0, max: 8 },
  mainGroupCount: { min: 1, max: 2 },
  mainSplitRatio: { min: 0.25, max: 0.75 },
} as const;

export type DesktopWorkbenchDockPosition = 'left' | 'right';
export type DesktopWorkbenchDockPresentation = 'hidden' | 'docked' | 'overlay';
export type DesktopWorkbenchDisplayMode = 'chat-main' | 'chat-only' | 'main-only';
export type DesktopWorkbenchMainSplitAxis = 'columns' | 'rows';
export type DesktopPreviewViewPresentation = 'temporary' | 'pinned' | 'side';
export type DesktopWorkbenchViewKind = 'canvas' | 'preview' | 'cut';

export interface DesktopWorkbenchViewRef {
  readonly viewId: string;
  readonly viewEpoch: number;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly kind: DesktopWorkbenchViewKind;
  readonly ownerId: string;
  readonly displayLabel: string;
  readonly documentId?: string;
  readonly previewPresentation?: DesktopPreviewViewPresentation;
  readonly previewContentKind?: PreviewContentKind;
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
  readonly schemaVersion: typeof DESKTOP_WORKBENCH_CONTRACT_VERSION;
  readonly windowId: string;
  readonly revision: number;
  readonly primarySidebar: {
    readonly visible: boolean;
    readonly width: number;
  };
  readonly resourceDock: {
    readonly presentation: DesktopWorkbenchDockPresentation;
    readonly position: DesktopWorkbenchDockPosition;
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
  readonly timeline: {
    readonly presentation: 'hidden' | 'docked';
    readonly ownerViewId?: string;
    readonly height: number;
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
    | 'unsupported-desktop-workbench-version'
    | 'desktop-workbench-stale-identity';

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
    schemaVersion: DESKTOP_WORKBENCH_CONTRACT_VERSION,
    windowId: requireNonEmptyString(windowId, 'Desktop Workbench Window identity is required.'),
    revision: 0,
    primarySidebar: {
      visible: true,
      width: APPLICATION_PRIMARY_SIDEBAR_DEFAULT_WIDTH,
    },
    resourceDock: {
      presentation: 'hidden',
      position: 'right',
      width: 320,
    },
    display: {
      mode: 'chat-only',
      chatPosition: 'left',
      chatWidth: 360,
    },
    main: {
      views: [],
      groups: [{ groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID, viewIds: [] }],
      activeGroupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
    },
    timeline: {
      presentation: 'hidden',
      height: 240,
    },
  };
}

export function parseDesktopWorkbenchLayout(value: unknown): DesktopWorkbenchLayoutProjection {
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
  const display = requireRecord(
    record['display'],
    'Desktop Workbench display projection is required.',
  );
  const main = requireRecord(record['main'], 'Desktop Workbench Main projection is required.');
  const timeline = requireRecord(
    record['timeline'],
    'Desktop Workbench Timeline projection is required.',
  );
  const views = requireArray(main['views'], 'Desktop Workbench Main Views must be an array.').map(
    parseDesktopWorkbenchViewRef,
  );
  if (views.length > DESKTOP_WORKBENCH_LIMITS.mainViewCount.max) {
    throw invalidPayload('Desktop Workbench supports at most eight open Main Views.');
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

  const timelinePresentation = requireOneOf(
    timeline['presentation'],
    ['hidden', 'docked'] as const,
    'Desktop Workbench Timeline presentation is invalid.',
  );
  const ownerViewId = readOptionalNonEmptyString(
    timeline['ownerViewId'],
    'Desktop Workbench Timeline owner identity is invalid.',
  );
  if (timelinePresentation === 'hidden' && ownerViewId !== undefined) {
    throw invalidPayload('Hidden Desktop Timeline cannot retain an owner View.');
  }
  if (timelinePresentation === 'docked') {
    const owner = views.find((view) => view.viewId === ownerViewId);
    if (!owner || owner.kind !== 'cut') {
      throw staleIdentity('Desktop Timeline owner must be an attached Cut View.');
    }
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
    display: {
      mode: requireOneOf(
        display['mode'],
        ['chat-main', 'chat-only', 'main-only'] as const,
        'Desktop Workbench display mode is invalid.',
      ),
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
    timeline: {
      presentation: timelinePresentation,
      ...(ownerViewId === undefined ? {} : { ownerViewId }),
      height: requireBoundedNumber(
        timeline['height'],
        DESKTOP_WORKBENCH_LIMITS.timelineHeight,
        'Desktop Workbench Timeline height is invalid.',
      ),
    },
  };
}

export function migrateDesktopWorkbenchV1(value: unknown): DesktopWorkbenchLayoutProjection {
  const record = requireRecord(value, 'Desktop Workbench v1 layout must be an object.');
  if (record['schemaVersion'] !== 1) {
    throw new DesktopWorkbenchContractError(
      'unsupported-desktop-workbench-version',
      `Desktop Workbench v1 migration received version: ${String(record['schemaVersion'])}.`,
    );
  }
  const primarySidebar = requireRecord(
    record['primarySidebar'],
    'Desktop Workbench v1 primary sidebar projection is required.',
  );
  const resourceDock = requireRecord(
    record['resourceDock'],
    'Desktop Workbench v1 Resource Dock projection is required.',
  );
  const agent = requireRecord(
    record['agent'],
    'Desktop Workbench v1 Agent projection is required.',
  );
  const main = requireRecord(record['main'], 'Desktop Workbench v1 Main projection is required.');
  const timeline = requireRecord(
    record['timeline'],
    'Desktop Workbench v1 Timeline projection is required.',
  );
  const v1Views = requireArray(
    main['views'],
    'Desktop Workbench v1 Main Views must be an array.',
  ).map(parseWorkbenchV1ViewRef);
  const allV1Ids = new Set(v1Views.map((view) => view.viewId));
  const activeViewId = readOptionalNonEmptyString(
    main['activeViewId'],
    'Desktop Workbench v1 active View identity is invalid.',
  );
  const sideViewId = readOptionalNonEmptyString(
    main['sideViewId'],
    'Desktop Workbench v1 side View identity is invalid.',
  );
  if (activeViewId !== undefined && !allV1Ids.has(activeViewId)) {
    throw staleIdentity('Desktop Workbench v1 active View does not exist.');
  }
  if (sideViewId !== undefined && !allV1Ids.has(sideViewId)) {
    throw staleIdentity('Desktop Workbench v1 side View does not exist.');
  }
  const views = v1Views.flatMap((view) =>
    view.kind === 'agent'
      ? []
      : [
          {
            ...view,
            kind: view.kind,
          },
        ],
  );
  const creativeIds = new Set(views.map((view) => view.viewId));
  const secondaryViewId =
    sideViewId !== undefined && creativeIds.has(sideViewId) ? sideViewId : undefined;
  const primaryIds = views
    .map((view) => view.viewId)
    .filter((viewId) => viewId !== secondaryViewId);
  const primaryActive =
    activeViewId !== undefined && primaryIds.includes(activeViewId)
      ? activeViewId
      : primaryIds.at(-1);
  const groups: DesktopWorkbenchMainGroup[] = [
    {
      groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
      viewIds: primaryIds,
      ...(primaryActive === undefined ? {} : { activeViewId: primaryActive }),
    },
  ];
  if (secondaryViewId !== undefined) {
    groups.push({
      groupId: DESKTOP_SECONDARY_MAIN_GROUP_ID,
      viewIds: [secondaryViewId],
      activeViewId: secondaryViewId,
    });
  }
  const agentPresentation = requireOneOf(
    agent['presentation'],
    ['main', 'dock'] as const,
    'Desktop Workbench v1 Agent presentation is invalid.',
  );
  const agentDockPresentation = requireOneOf(
    agent['dockPresentation'],
    ['hidden', 'docked', 'overlay'] as const,
    'Desktop Workbench v1 Agent dock presentation is invalid.',
  );
  const v1Split = requireOneOf(
    main['split'],
    ['none', 'horizontal', 'vertical'] as const,
    'Desktop Workbench v1 Main split is invalid.',
  );
  if (groups.length === 2 && v1Split === 'none') {
    throw invalidPayload('Desktop Workbench v1 side View requires a split.');
  }
  const timelineVisible = requireBoolean(
    timeline['visible'],
    'Desktop Workbench v1 Timeline visibility is invalid.',
  );
  const cutOwner =
    views.find((view) => view.viewId === activeViewId && view.kind === 'cut') ??
    [...views].reverse().find((view) => view.kind === 'cut');
  const next: DesktopWorkbenchLayoutProjection = {
    schemaVersion: DESKTOP_WORKBENCH_CONTRACT_VERSION,
    windowId: requireNonEmptyString(
      record['windowId'],
      'Desktop Workbench v1 Window identity is required.',
    ),
    revision: requireNonNegativeInteger(
      record['revision'],
      'Desktop Workbench v1 revision is invalid.',
    ),
    primarySidebar: {
      visible: requireBoolean(
        primarySidebar['visible'],
        'Desktop Workbench v1 primary sidebar visibility is invalid.',
      ),
      width: requireBoundedNumber(
        primarySidebar['width'],
        DESKTOP_WORKBENCH_LIMITS.primarySidebarWidth,
        'Desktop Workbench v1 primary sidebar width is invalid.',
      ),
    },
    resourceDock: {
      presentation: requireOneOf(
        resourceDock['presentation'],
        ['hidden', 'docked', 'overlay'] as const,
        'Desktop Workbench v1 Resource Dock presentation is invalid.',
      ),
      position: requireOneOf(
        resourceDock['position'],
        ['left', 'right'] as const,
        'Desktop Workbench v1 Resource Dock position is invalid.',
      ),
      width: requireBoundedNumber(
        resourceDock['width'],
        DESKTOP_WORKBENCH_LIMITS.dockWidth,
        'Desktop Workbench v1 Resource Dock width is invalid.',
      ),
    },
    display: {
      mode:
        agentPresentation === 'main'
          ? 'chat-only'
          : agentDockPresentation === 'hidden'
            ? 'main-only'
            : 'chat-main',
      chatPosition: requireOneOf(
        agent['dockPosition'],
        ['left', 'right'] as const,
        'Desktop Workbench v1 Agent dock position is invalid.',
      ),
      chatWidth: requireBoundedNumber(
        agent['width'],
        DESKTOP_WORKBENCH_LIMITS.dockWidth,
        'Desktop Workbench v1 Agent width is invalid.',
      ),
    },
    main: {
      views,
      groups,
      activeGroupId:
        secondaryViewId === activeViewId
          ? DESKTOP_SECONDARY_MAIN_GROUP_ID
          : DESKTOP_PRIMARY_MAIN_GROUP_ID,
      ...(groups.length === 2
        ? {
            split: {
              axis: v1Split === 'vertical' ? 'rows' : 'columns',
              ratio: 0.5,
            } satisfies DesktopWorkbenchMainSplit,
          }
        : {}),
    },
    timeline:
      timelineVisible && cutOwner
        ? {
            presentation: 'docked',
            ownerViewId: cutOwner.viewId,
            height: requireBoundedNumber(
              timeline['height'],
              DESKTOP_WORKBENCH_LIMITS.timelineHeight,
              'Desktop Workbench v1 Timeline height is invalid.',
            ),
          }
        : {
            presentation: 'hidden',
            height: requireBoundedNumber(
              timeline['height'],
              DESKTOP_WORKBENCH_LIMITS.timelineHeight,
              'Desktop Workbench v1 Timeline height is invalid.',
            ),
          },
  };
  return parseDesktopWorkbenchLayout(next);
}

export function setWorkbenchDisplayMode(
  workbench: DesktopWorkbenchLayoutProjection,
  mode: DesktopWorkbenchDisplayMode,
  chatPosition = workbench.display.chatPosition,
): DesktopWorkbenchLayoutProjection {
  if (mode !== 'chat-only' && workbench.main.views.length === 0) {
    throw invalidPayload(`Desktop display mode '${mode}' requires an attached Main View.`);
  }
  return {
    ...workbench,
    revision: workbench.revision + 1,
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
  const existing = workbench.main.views.find((candidate) => candidate.viewId === parsedView.viewId);
  const existingGroup = findMainGroupForView(workbench, parsedView.viewId);
  if (existing && !existingGroup) {
    throw staleIdentity(`Desktop Main View '${parsedView.viewId}' has no Group membership.`);
  }
  if (existingGroup) {
    const next = {
      ...workbench,
      revision: workbench.revision + 1,
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
    if (effectiveTarget.viewIds.length === 0) {
      throw invalidPayload('Desktop side-open requires an existing Main View.');
    }
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
    revision: workbench.revision + 1,
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
    revision: workbench.revision + 1,
    main: {
      views: workbench.main.views.filter((candidate) => candidate.viewId !== view.viewId),
      groups,
      activeGroupId,
      ...(split === undefined ? {} : { split }),
    },
    timeline:
      workbench.timeline.ownerViewId === viewId
        ? {
            presentation: 'hidden' as const,
            height: workbench.timeline.height,
          }
        : workbench.timeline,
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
    revision: workbench.revision + 1,
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
    revision: workbench.revision + 1,
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
    revision: workbench.revision + 1,
    main: {
      ...workbench.main,
      split: {
        ...workbench.main.split,
        ratio,
      },
    },
  });
}

export function showWorkbenchTimeline(
  workbench: DesktopWorkbenchLayoutProjection,
  ownerViewId: string,
): DesktopWorkbenchLayoutProjection {
  const owner = requireMainView(workbench, ownerViewId);
  if (owner.kind !== 'cut') {
    throw staleIdentity('Desktop Timeline owner must be an attached Cut View.');
  }
  return parseDesktopWorkbenchLayout({
    ...workbench,
    revision: workbench.revision + 1,
    timeline: {
      ...workbench.timeline,
      presentation: 'docked',
      ownerViewId,
    },
  });
}

export function hideWorkbenchTimeline(
  workbench: DesktopWorkbenchLayoutProjection,
): DesktopWorkbenchLayoutProjection {
  return parseDesktopWorkbenchLayout({
    ...workbench,
    revision: workbench.revision + 1,
    timeline: {
      presentation: 'hidden',
      height: workbench.timeline.height,
    },
  });
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
  const kind = requireOneOf(
    record['kind'],
    ['canvas', 'preview', 'cut'] as const,
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
          ['text', 'image', 'audio', 'video', 'document', 'model'] as const,
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
    displayLabel: requireNonEmptyString(
      record['displayLabel'],
      'Desktop Workbench Main View display label is required.',
    ),
    ...(documentId ? { documentId } : {}),
    ...(previewPresentation ? { previewPresentation } : {}),
    ...(previewContentKind ? { previewContentKind } : {}),
  };
}

function parseWorkbenchV1ViewRef(value: unknown):
  | DesktopWorkbenchViewRef
  | {
      readonly viewId: string;
      readonly viewEpoch: number;
      readonly projectId: string;
      readonly workspaceId: string;
      readonly kind: 'agent';
      readonly ownerId: string;
      readonly displayLabel: string;
      readonly documentId?: string;
    } {
  const record = requireRecord(value, 'Desktop Workbench v1 Main View must be an object.');
  const kind = requireOneOf(
    record['kind'],
    ['agent', 'canvas', 'preview', 'cut'] as const,
    'Desktop Workbench v1 Main View kind is invalid.',
  );
  const documentId = readOptionalNonEmptyString(
    record['documentId'],
    'Desktop Workbench v1 document identity is invalid.',
  );
  const common = {
    viewId: requireNonEmptyString(
      record['viewId'],
      'Desktop Workbench v1 Main View identity is required.',
    ),
    viewEpoch: requireNonNegativeInteger(
      record['viewEpoch'],
      'Desktop Workbench v1 Main View epoch is invalid.',
    ),
    projectId: requireNonEmptyString(
      record['projectId'],
      'Desktop Workbench v1 Main View Project identity is required.',
    ),
    workspaceId: requireNonEmptyString(
      record['workspaceId'],
      'Desktop Workbench v1 Main View Workspace identity is required.',
    ),
    ownerId: requireNonEmptyString(
      record['ownerId'],
      'Desktop Workbench v1 Main View owner identity is required.',
    ),
    displayLabel:
      readOptionalNonEmptyString(
        record['displayLabel'],
        'Desktop Workbench v1 Main View display label is invalid.',
      ) ?? workbenchV1DisplayLabel(kind, documentId),
    ...(documentId === undefined ? {} : { documentId }),
  };
  if (kind === 'agent') return { ...common, kind };
  return parseDesktopWorkbenchViewRef({
    ...record,
    ...common,
    kind,
  });
}

function workbenchV1DisplayLabel(
  kind: 'agent' | DesktopWorkbenchViewKind,
  documentId: string | undefined,
): string {
  if (documentId) {
    const label = documentId.split(/[\\/]/u).at(-1);
    if (label) return label;
  }
  if (kind === 'agent') return 'Chat';
  if (kind === 'canvas') return 'Canvas';
  if (kind === 'cut') return 'Timeline';
  return 'Preview';
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

function requireNonNegativeInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw invalidPayload(message);
  }
  return value;
}

function requireBoolean(value: unknown, message: string): boolean {
  if (typeof value !== 'boolean') throw invalidPayload(message);
  return value;
}

function requireBoundedNumber(
  value: unknown,
  bounds: { readonly min: number; readonly max: number },
  message: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < bounds.min ||
    value > bounds.max
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
