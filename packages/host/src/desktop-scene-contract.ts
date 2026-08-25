import {
  isSameAgentConversationOwner,
  parseAgentConversationOwnerRef,
  parseAgentHomeNavigationIdentity,
  type AgentConversationOwnerRef,
  type AgentHomeNavigationIdentity,
} from '@neko/agent-contracts';
import { parseWorldRuntimeBinding, type WorldRuntimeBinding } from '@neko/world-domain/contracts';

export const DESKTOP_APPLICATION_SIDEBAR_DEFAULT_WIDTH = 240;
export const DESKTOP_APPLICATION_SIDEBAR_WIDTH_LIMITS = { min: 208, max: 360 } as const;

export type DesktopAgentScopeProjection =
  | { readonly kind: 'unbound'; readonly draftId: string }
  | {
      readonly kind: 'assistant';
      readonly draftId: string;
      readonly assistantSpaceId: string;
      readonly conversationId?: string;
    }
  | {
      readonly kind: 'workspace';
      readonly draftId: string;
      readonly workspaceId: string;
      readonly workspaceGrantId: string;
      readonly conversationId?: string;
    };

export type DesktopWorkbenchSceneContext =
  | {
      readonly kind: 'agent';
      readonly agentViewId: string;
      readonly scope: DesktopAgentScopeProjection;
    }
  | {
      readonly kind: 'character-interaction';
      readonly agentViewId: string;
      readonly owner: Extract<AgentConversationOwnerRef, { readonly kind: 'character' | 'room' }>;
      readonly scope: Extract<DesktopAgentScopeProjection, { readonly kind: 'assistant' }>;
    }
  | { readonly kind: 'world-runtime'; readonly binding: WorldRuntimeBinding }
  | { readonly kind: 'asset-center'; readonly assetCenterSessionId: string }
  | {
      readonly kind: 'creative-management';
      readonly catalog: DesktopCreativeManagementCatalog;
      readonly detail?: DesktopCharacterDetailSelection | DesktopWorldDetailSelection;
    }
  | { readonly kind: 'extensions' };

export type DesktopCreativeManagementCatalog =
  'content-projects' | 'works' | 'characters' | 'worlds';

export interface DesktopAgentInteractionSurfaceRef {
  readonly kind: 'agent';
  readonly agentSurfaceId: string;
  readonly agentViewId: string;
  readonly phase: 'draft' | 'session';
  readonly scope: DesktopAgentScopeProjection;
}

export interface DesktopWorldRuntimeSurfaceIdentity {
  readonly worldRunId: string;
  readonly worldSaveId: string;
  readonly branchId: string;
  readonly participantId: string;
}

export interface DesktopWorldRuntimeInteractionSurfaceRef extends DesktopWorldRuntimeSurfaceIdentity {
  readonly kind: 'world-runtime-interaction';
}

export type DesktopWorkbenchInteractionSurfaceRef =
  DesktopAgentInteractionSurfaceRef | DesktopWorldRuntimeInteractionSurfaceRef;

export type DesktopCharacterDetailSelection = {
  readonly kind: 'global';
  readonly globalCharacterId: string;
};

export type DesktopWorldDetailSelection = {
  readonly kind: 'global';
  readonly globalWorldId: string;
};

export type DesktopCharacterPresentationSurfaceKind =
  'avatar' | 'authorized-web' | 'dynamic-scene' | 'gameplay';

export interface DesktopCharacterPresentationSurfaceRef {
  readonly kind: 'character-presentation';
  readonly owner: Extract<AgentConversationOwnerRef, { readonly kind: 'character' | 'room' }>;
  readonly surfaceKind: DesktopCharacterPresentationSurfaceKind;
  readonly providerId: string;
  readonly surfaceId: string;
}

export interface DesktopAuthoringAuthority {
  readonly kind: 'project';
  readonly projectId: string;
}

export type DesktopWorkbenchMainSurfaceRef =
  | {
      readonly kind: 'assistant-preview';
      readonly previewSessionId: string;
      readonly assistantSpaceId: string;
      readonly conversationId: string;
      readonly scratchArtifactId: string;
    }
  | {
      readonly kind: 'workspace-main';
      readonly workspaceId: string;
      readonly viewId: string;
      readonly viewInstanceId: string;
    }
  | {
      readonly kind: 'character-authoring';
      readonly workspaceId: string;
      readonly authority: DesktopAuthoringAuthority;
      readonly viewId: string;
      readonly viewInstanceId: string;
      readonly characterProjectId: string;
    }
  | {
      readonly kind: 'world-authoring';
      readonly workspaceId: string;
      readonly authority: DesktopAuthoringAuthority;
      readonly viewId: string;
      readonly viewInstanceId: string;
      readonly worldProjectId: string;
    }
  | ({ readonly kind: 'world-runtime-main' } & DesktopWorldRuntimeSurfaceIdentity)
  | {
      readonly kind: 'asset-preview';
      readonly assetCenterSessionId: string;
      readonly previewSessionId: string;
    }
  | { readonly kind: 'asset-management'; readonly assetCenterSessionId: string }
  | { readonly kind: 'creative-management'; readonly catalog: DesktopCreativeManagementCatalog }
  | { readonly kind: 'character-detail'; readonly selection: DesktopCharacterDetailSelection }
  | { readonly kind: 'world-detail'; readonly selection: DesktopWorldDetailSelection }
  | DesktopCharacterPresentationSurfaceRef
  | { readonly kind: 'extension-management' }
  | { readonly kind: 'project-detail' };

export type DesktopWorkbenchManagerSurfaceRef =
  | { readonly kind: 'workspace-resources'; readonly workspaceId: string }
  | {
      readonly kind: 'character-runtime-manager';
      readonly owner: Extract<AgentConversationOwnerRef, { readonly kind: 'character' | 'room' }>;
    }
  | ({ readonly kind: 'world-runtime-manager' } & DesktopWorldRuntimeSurfaceIdentity);

export type DesktopCharacterTimelineSurfaceRef =
  | {
      readonly kind: 'character-storyline-timeline';
      readonly owner: Extract<AgentConversationOwnerRef, { readonly kind: 'character' | 'room' }>;
      readonly timelineId: string;
    }
  | {
      readonly kind: 'character-room-event-timeline';
      readonly owner: Extract<AgentConversationOwnerRef, { readonly kind: 'room' }>;
      readonly timelineId: string;
    };

export type DesktopWorkbenchCutPanelSurfaceRef =
  | {
      readonly kind: 'workspace-cut';
      readonly workspaceId: string;
      readonly viewId: string;
      readonly viewInstanceId: string;
      readonly ownerId: string;
    }
  | {
      readonly kind: 'character-timeline-stack';
      readonly owner: Extract<AgentConversationOwnerRef, { readonly kind: 'character' | 'room' }>;
      readonly timelines: readonly DesktopCharacterTimelineSurfaceRef[];
    }
  | ({ readonly kind: 'world-runtime-timeline' } & DesktopWorldRuntimeSurfaceIdentity);

export type DesktopWorkbenchStatusSurfaceRef =
  | { readonly kind: 'scene-status'; readonly sceneId: string }
  | ({
      readonly kind: 'world-runtime-status';
      readonly sceneId: string;
    } & DesktopWorldRuntimeSurfaceIdentity);

export interface DesktopWorkbenchSceneProjection {
  readonly sceneId: string;
  readonly windowId: string;
  readonly context: DesktopWorkbenchSceneContext;
  readonly slots: {
    readonly interaction?: DesktopWorkbenchInteractionSurfaceRef;
    readonly main?: DesktopWorkbenchMainSurfaceRef;
    readonly secondaryMain?: DesktopWorkbenchMainSurfaceRef;
    readonly leftManager?: DesktopWorkbenchManagerSurfaceRef;
    readonly rightManager?: DesktopWorkbenchManagerSurfaceRef;
    readonly cutPanel?: DesktopWorkbenchCutPanelSurfaceRef;
    readonly status?: DesktopWorkbenchStatusSurfaceRef;
  };
}

export interface DesktopApplicationSidebarProjection {
  readonly windowId: string;
  readonly visible: boolean;
  readonly width: number;
}

export type DesktopSceneTransitionIntent =
  | { readonly kind: 'open-agent-entry' }
  | { readonly kind: 'new-agent-conversation' }
  | { readonly kind: 'open-workspace'; readonly workspaceGrantId: string }
  | { readonly kind: 'open-project-workspace'; readonly projectId: string }
  | {
      readonly kind: 'open-character-authoring';
      readonly workspaceGrantId: string;
      readonly authority: DesktopAuthoringAuthority;
      readonly characterProjectId: string;
    }
  | {
      readonly kind: 'open-world-authoring';
      readonly workspaceGrantId: string;
      readonly authority: DesktopAuthoringAuthority;
      readonly worldProjectId: string;
    }
  | { readonly kind: 'open-world-runtime'; readonly binding: WorldRuntimeBinding }
  | { readonly kind: 'open-asset-center' }
  | {
      readonly kind: 'open-creative-management';
      readonly catalog: DesktopCreativeManagementCatalog;
    }
  | {
      readonly kind: 'select-character-detail';
      readonly selection: DesktopCharacterDetailSelection;
    }
  | {
      readonly kind: 'select-world-detail';
      readonly selection: DesktopWorldDetailSelection;
    }
  | { readonly kind: 'open-extensions' }
  | { readonly kind: 'restore-conversation'; readonly navigation: AgentHomeNavigationIdentity };

export interface DesktopSceneTransitionRequest {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly sceneId: string;
  readonly intent: DesktopSceneTransitionIntent;
}

export interface DesktopSceneUnavailableDiagnostic {
  readonly code: 'desktop-scene-owner-unavailable';
  readonly severity: 'error';
  readonly message: string;
  readonly metadata: {
    readonly owner:
      | 'workspace-authority'
      | 'agent-conversation-authority'
      | 'character-product'
      | 'world-product';
    readonly intentKind:
      | 'open-workspace'
      | 'open-project-workspace'
      | 'open-character-authoring'
      | 'open-world-authoring'
      | 'open-world-runtime'
      | 'open-creative-management'
      | 'select-character-detail'
      | 'select-world-detail'
      | 'restore-conversation';
    readonly conversationOwnerKind?: AgentConversationOwnerRef['kind'] | 'world';
  };
}

export interface DesktopSceneTransitionRejectedDiagnostic {
  readonly code: 'new-conversation-required';
  readonly severity: 'error';
  readonly message: string;
  readonly metadata: {
    readonly owner: 'agent-conversation-authority';
    readonly intentKind:
      | 'open-workspace'
      | 'open-project-workspace'
      | 'open-character-authoring'
      | 'open-world-authoring';
    readonly conversationId: string;
  };
}

export type DesktopSceneTransitionResult =
  | {
      readonly status: 'transitioned';
      readonly requestId: string;
      readonly scene: DesktopWorkbenchSceneProjection;
    }
  | {
      readonly status: 'unavailable';
      readonly requestId: string;
      readonly diagnostic: DesktopSceneUnavailableDiagnostic;
    }
  | {
      readonly status: 'rejected';
      readonly requestId: string;
      readonly diagnostic: DesktopSceneTransitionRejectedDiagnostic;
    };

export function parseDesktopSceneTransitionResult(value: unknown): DesktopSceneTransitionResult {
  const record = requireRecord(value, 'Desktop Scene transition result must be an object.');
  const status = record['status'];
  if (status === 'transitioned') {
    requireExactKeys(record, ['status', 'requestId', 'scene'], 'Desktop Scene transition result');
    return {
      status,
      requestId: requireIdentity(record['requestId'], 'Desktop Scene request'),
      scene: parseDesktopWorkbenchSceneProjection(record['scene']),
    };
  }
  if (status === 'unavailable') {
    requireExactKeys(
      record,
      ['status', 'requestId', 'diagnostic'],
      'Desktop Scene transition result',
    );
    const diagnostic = requireRecord(
      record['diagnostic'],
      'Desktop Scene unavailable diagnostic must be an object.',
    );
    requireExactKeys(
      diagnostic,
      ['code', 'severity', 'message', 'metadata'],
      'Desktop Scene unavailable diagnostic',
    );
    if (
      diagnostic['code'] !== 'desktop-scene-owner-unavailable' ||
      diagnostic['severity'] !== 'error'
    ) {
      throw invalid('Desktop Scene unavailable diagnostic has an invalid code or severity.');
    }
    const metadata = requireRecord(
      diagnostic['metadata'],
      'Desktop Scene unavailable metadata must be an object.',
    );
    requireExactKeys(
      metadata,
      ['owner', 'intentKind', 'conversationOwnerKind'],
      'Desktop Scene unavailable metadata',
      ['conversationOwnerKind'],
    );
    const owner = metadata['owner'];
    const intentKind = metadata['intentKind'];
    const conversationOwnerKind = metadata['conversationOwnerKind'];
    if (
      owner !== 'workspace-authority' &&
      owner !== 'agent-conversation-authority' &&
      owner !== 'character-product' &&
      owner !== 'world-product'
    ) {
      throw invalid(`Unknown Desktop Scene unavailable owner '${String(owner)}'.`);
    }
    if (
      intentKind !== 'open-workspace' &&
      intentKind !== 'open-project-workspace' &&
      intentKind !== 'open-character-authoring' &&
      intentKind !== 'open-world-authoring' &&
      intentKind !== 'open-world-runtime' &&
      intentKind !== 'open-creative-management' &&
      intentKind !== 'select-character-detail' &&
      intentKind !== 'select-world-detail' &&
      intentKind !== 'restore-conversation'
    ) {
      throw invalid(`Unknown Desktop Scene unavailable intent '${String(intentKind)}'.`);
    }
    if (
      conversationOwnerKind !== undefined &&
      conversationOwnerKind !== 'assistant' &&
      conversationOwnerKind !== 'workspace' &&
      conversationOwnerKind !== 'character' &&
      conversationOwnerKind !== 'room' &&
      conversationOwnerKind !== 'world'
    ) {
      throw invalid(
        `Unknown Desktop Scene unavailable Conversation owner '${String(conversationOwnerKind)}'.`,
      );
    }
    return {
      status,
      requestId: requireIdentity(record['requestId'], 'Desktop Scene request'),
      diagnostic: {
        code: 'desktop-scene-owner-unavailable',
        severity: 'error',
        message: requireIdentity(diagnostic['message'], 'Desktop Scene unavailable message'),
        metadata: {
          owner,
          intentKind,
          ...(conversationOwnerKind === undefined ? {} : { conversationOwnerKind }),
        },
      },
    };
  }
  if (status === 'rejected') {
    requireExactKeys(
      record,
      ['status', 'requestId', 'diagnostic'],
      'Desktop Scene transition result',
    );
    const diagnostic = requireRecord(
      record['diagnostic'],
      'Desktop Scene rejected diagnostic must be an object.',
    );
    requireExactKeys(
      diagnostic,
      ['code', 'severity', 'message', 'metadata'],
      'Desktop Scene rejected diagnostic',
    );
    if (diagnostic['code'] !== 'new-conversation-required' || diagnostic['severity'] !== 'error') {
      throw invalid('Desktop Scene rejected diagnostic has an invalid code or severity.');
    }
    const metadata = requireRecord(
      diagnostic['metadata'],
      'Desktop Scene rejected metadata must be an object.',
    );
    requireExactKeys(
      metadata,
      ['owner', 'intentKind', 'conversationId'],
      'Desktop Scene rejected metadata',
    );
    if (
      metadata['owner'] !== 'agent-conversation-authority' ||
      (metadata['intentKind'] !== 'open-workspace' &&
        metadata['intentKind'] !== 'open-project-workspace' &&
        metadata['intentKind'] !== 'open-character-authoring' &&
        metadata['intentKind'] !== 'open-world-authoring')
    ) {
      throw invalid('Desktop Scene rejected metadata has an invalid owner or intent.');
    }
    return {
      status,
      requestId: requireIdentity(record['requestId'], 'Desktop Scene request'),
      diagnostic: {
        code: 'new-conversation-required',
        severity: 'error',
        message: requireIdentity(diagnostic['message'], 'Desktop Scene rejected message'),
        metadata: {
          owner: 'agent-conversation-authority',
          intentKind: metadata['intentKind'],
          conversationId: requireIdentity(
            metadata['conversationId'],
            'Desktop Scene rejected Conversation',
          ),
        },
      },
    };
  }
  throw invalid(`Unknown Desktop Scene transition status '${String(status)}'.`);
}

export interface DesktopApplicationSidebarMutationRequest {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly visible: boolean;
  readonly width: number;
}

export class DesktopSceneContractError extends Error {
  readonly code:
    | 'invalid-desktop-scene-payload'
    | 'desktop-scene-scope-mismatch'
    | 'desktop-scene-stale-identity';

  constructor(code: DesktopSceneContractError['code'], message: string) {
    super(message);
    this.name = 'DesktopSceneContractError';
    this.code = code;
  }
}

export function createDefaultDesktopApplicationSidebar(
  windowId: string,
): DesktopApplicationSidebarProjection {
  return {
    windowId: requireIdentity(windowId, 'Desktop Sidebar Window'),
    visible: true,
    width: DESKTOP_APPLICATION_SIDEBAR_DEFAULT_WIDTH,
  };
}

export function createDefaultDesktopAgentScene(
  windowId: string,
  draftId: string,
): DesktopWorkbenchSceneProjection {
  const exactWindowId = requireIdentity(windowId, 'Desktop Scene Window');
  const exactDraftId = requireIdentity(draftId, 'Agent Draft');
  const sceneId = `scene:${exactWindowId}:agent:${exactDraftId}`;
  const agentViewId = `agent-view:${exactWindowId}:${exactDraftId}`;
  const scope: DesktopAgentScopeProjection = { kind: 'unbound', draftId: exactDraftId };
  return {
    sceneId,
    windowId: exactWindowId,
    context: { kind: 'agent', agentViewId, scope },
    slots: {
      interaction: {
        kind: 'agent',
        agentSurfaceId: `agent-surface:${exactWindowId}:${exactDraftId}`,
        agentViewId,
        phase: 'draft',
        scope,
      },
      status: { kind: 'scene-status', sceneId },
    },
  };
}

export function createDesktopSceneTransitionRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly sceneId: string;
  readonly intent: DesktopSceneTransitionIntent;
}): DesktopSceneTransitionRequest {
  return parseDesktopSceneTransitionRequest(input);
}

export function createDesktopApplicationSidebarMutationRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly visible: boolean;
  readonly width: number;
}): DesktopApplicationSidebarMutationRequest {
  return parseDesktopApplicationSidebarMutationRequest(input);
}

export function applyDesktopApplicationSidebarMutation(input: {
  readonly projection: DesktopApplicationSidebarProjection;
  readonly request: DesktopApplicationSidebarMutationRequest;
  readonly rendererSessionId: string;
}): DesktopApplicationSidebarProjection {
  const projection = parseDesktopApplicationSidebarProjection(input.projection);
  const request = parseDesktopApplicationSidebarMutationRequest(input.request);
  const rendererSessionId = requireIdentity(
    input.rendererSessionId,
    'Desktop renderer session identity',
  );
  if (request.rendererSessionId !== rendererSessionId) {
    throw stale('Desktop Sidebar mutation renderer session is stale.');
  }
  if (request.windowId !== projection.windowId) {
    throw stale('Desktop Sidebar mutation Window identity does not match its projection.');
  }
  return {
    ...projection,
    visible: request.visible,
    width: request.width,
  };
}

export function parseDesktopWorkbenchSceneProjection(
  value: unknown,
): DesktopWorkbenchSceneProjection {
  const record = requireRecord(value, 'Desktop Workbench Scene projection must be an object.');
  requireExactKeys(
    record,
    ['sceneId', 'windowId', 'context', 'slots'],
    'Desktop Workbench Scene projection',
  );
  const projection: DesktopWorkbenchSceneProjection = {
    sceneId: requireIdentity(record['sceneId'], 'Desktop Scene'),
    windowId: requireIdentity(record['windowId'], 'Desktop Scene Window'),
    context: parseSceneContext(record['context']),
    slots: parseSceneSlots(record['slots']),
  };
  validateSceneProjection(projection);
  return projection;
}

export function parseDesktopApplicationSidebarProjection(
  value: unknown,
): DesktopApplicationSidebarProjection {
  const record = requireRecord(value, 'Desktop Application Sidebar projection must be an object.');
  requireExactKeys(
    record,
    ['windowId', 'visible', 'width'],
    'Desktop Application Sidebar projection',
  );
  return {
    windowId: requireIdentity(record['windowId'], 'Desktop Sidebar Window'),
    visible: requireBoolean(record['visible'], 'Desktop Sidebar visibility must be boolean.'),
    width: requireSidebarWidth(record['width']),
  };
}

export function parseDesktopSceneTransitionRequest(value: unknown): DesktopSceneTransitionRequest {
  const record = requireRecord(value, 'Desktop Scene transition request must be an object.');
  requireExactKeys(
    record,
    ['requestId', 'rendererSessionId', 'windowId', 'sceneId', 'intent'],
    'Desktop Scene transition request',
  );
  return {
    requestId: requireIdentity(record['requestId'], 'Desktop Scene request'),
    rendererSessionId: requireIdentity(
      record['rendererSessionId'],
      'Desktop renderer session identity',
    ),
    windowId: requireIdentity(record['windowId'], 'Desktop Scene Window'),
    sceneId: requireIdentity(record['sceneId'], 'Desktop Scene'),
    intent: parseSceneTransitionIntent(record['intent']),
  };
}

export function parseDesktopApplicationSidebarMutationRequest(
  value: unknown,
): DesktopApplicationSidebarMutationRequest {
  const record = requireRecord(value, 'Desktop Sidebar mutation request must be an object.');
  requireExactKeys(
    record,
    ['requestId', 'rendererSessionId', 'windowId', 'visible', 'width'],
    'Desktop Sidebar mutation request',
  );
  return {
    requestId: requireIdentity(record['requestId'], 'Desktop Sidebar request'),
    rendererSessionId: requireIdentity(
      record['rendererSessionId'],
      'Desktop renderer session identity',
    ),
    windowId: requireIdentity(record['windowId'], 'Desktop Sidebar Window'),
    visible: requireBoolean(record['visible'], 'Desktop Sidebar visibility must be boolean.'),
    width: requireSidebarWidth(record['width']),
  };
}

function parseSceneContext(value: unknown): DesktopWorkbenchSceneContext {
  const record = requireRecord(value, 'Desktop Scene context must be an object.');
  const kind = record['kind'];
  if (kind === 'agent') {
    requireExactKeys(record, ['kind', 'agentViewId', 'scope'], 'Agent Scene context');
    return {
      kind,
      agentViewId: requireIdentity(record['agentViewId'], 'Agent View'),
      scope: parseDesktopAgentScopeProjection(record['scope']),
    };
  }
  if (kind === 'character-interaction') {
    requireExactKeys(
      record,
      ['kind', 'agentViewId', 'owner', 'scope'],
      'Character Interaction Scene context',
    );
    const owner = parseAgentConversationOwnerRef(record['owner']);
    const scope = parseDesktopAgentScopeProjection(record['scope']);
    if ((owner.kind !== 'character' && owner.kind !== 'room') || scope.kind !== 'assistant') {
      throw invalid('Character Interaction Scene requires an exact Character or Room owner.');
    }
    return {
      kind,
      agentViewId: requireIdentity(record['agentViewId'], 'Agent View'),
      owner,
      scope,
    };
  }
  if (kind === 'world-runtime') {
    requireExactKeys(record, ['kind', 'binding'], 'World Runtime Scene context');
    return { kind, binding: parseWorldRuntimeBinding(record['binding']) };
  }
  if (kind === 'asset-center') {
    requireExactKeys(record, ['kind', 'assetCenterSessionId'], 'Asset Center Scene context');
    return {
      kind,
      assetCenterSessionId: requireIdentity(record['assetCenterSessionId'], 'Asset Center Session'),
    };
  }
  if (kind === 'creative-management') {
    requireExactKeys(record, ['kind', 'catalog', 'detail'], 'Creative Management Scene context', [
      'detail',
    ]);
    const catalog = parseCreativeManagementCatalog(record['catalog']);
    return {
      kind,
      catalog,
      ...(record['detail'] === undefined
        ? {}
        : catalog === 'characters'
          ? { detail: parseCharacterDetailSelection(record['detail']) }
          : catalog === 'worlds'
            ? { detail: parseWorldDetailSelection(record['detail']) }
            : (() => {
                throw invalid('Content Project management does not accept a detail selection.');
              })()),
    };
  }
  if (kind === 'extensions') {
    requireExactKeys(record, ['kind'], 'Extensions Scene context');
    return { kind };
  }
  throw unsupported(`Unknown Desktop Scene context kind '${String(kind)}'.`);
}

export function parseDesktopAgentScopeProjection(value: unknown): DesktopAgentScopeProjection {
  const record = requireRecord(value, 'Agent scope must be an object.');
  const kind = record['kind'];
  if (kind === 'unbound') {
    requireExactKeys(record, ['kind', 'draftId'], 'Unbound Agent scope');
    return { kind, draftId: requireIdentity(record['draftId'], 'Agent Draft') };
  }
  if (kind === 'assistant') {
    requireExactKeys(
      record,
      ['kind', 'draftId', 'assistantSpaceId', 'conversationId'],
      'Assistant scope',
      ['conversationId'],
    );
    return {
      kind,
      draftId: requireIdentity(record['draftId'], 'Agent Draft'),
      assistantSpaceId: requireIdentity(record['assistantSpaceId'], 'Assistant Space'),
      ...readConversationId(record),
    };
  }
  if (kind === 'workspace') {
    requireExactKeys(
      record,
      ['kind', 'draftId', 'workspaceId', 'workspaceGrantId', 'conversationId'],
      'Workspace scope',
      ['conversationId'],
    );
    return {
      kind,
      draftId: requireIdentity(record['draftId'], 'Agent Draft'),
      workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
      workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Workspace Grant'),
      ...readConversationId(record),
    };
  }
  throw unsupported(`Unknown Agent scope kind '${String(kind)}'.`);
}

function parseSceneSlots(value: unknown): DesktopWorkbenchSceneProjection['slots'] {
  const record = requireRecord(value, 'Desktop Scene slots must be an object.');
  requireExactKeys(
    record,
    ['interaction', 'main', 'secondaryMain', 'leftManager', 'rightManager', 'cutPanel', 'status'],
    'Desktop Scene slots',
    ['interaction', 'main', 'secondaryMain', 'leftManager', 'rightManager', 'cutPanel', 'status'],
  );
  return {
    ...(record['interaction'] === undefined
      ? {}
      : { interaction: parseInteractionSurface(record['interaction']) }),
    ...(record['main'] === undefined ? {} : { main: parseMainSurface(record['main']) }),
    ...(record['secondaryMain'] === undefined
      ? {}
      : { secondaryMain: parseMainSurface(record['secondaryMain']) }),
    ...(record['leftManager'] === undefined
      ? {}
      : { leftManager: parseManagerSurface(record['leftManager']) }),
    ...(record['rightManager'] === undefined
      ? {}
      : { rightManager: parseManagerSurface(record['rightManager']) }),
    ...(record['cutPanel'] === undefined
      ? {}
      : { cutPanel: parseCutPanelSurface(record['cutPanel']) }),
    ...(record['status'] === undefined ? {} : { status: parseStatusSurface(record['status']) }),
  };
}

function parseInteractionSurface(value: unknown): DesktopWorkbenchInteractionSurfaceRef {
  const record = requireRecord(value, 'Interaction Surface ref must be an object.');
  if (record['kind'] === 'world-runtime-interaction') {
    return {
      kind: 'world-runtime-interaction',
      ...parseWorldRuntimeSurfaceIdentity(record, 'World Runtime Interaction Surface ref'),
    };
  }
  requireExactKeys(
    record,
    ['kind', 'agentSurfaceId', 'agentViewId', 'phase', 'scope'],
    'Agent Interaction Surface ref',
  );
  if (record['kind'] !== 'agent') throw unsupported('Interaction slot only accepts Agent Surface.');
  const phase = record['phase'];
  if (phase !== 'draft' && phase !== 'session') {
    throw invalid('Agent Interaction phase must be draft or session.');
  }
  return {
    kind: 'agent',
    agentSurfaceId: requireIdentity(record['agentSurfaceId'], 'Agent Surface'),
    agentViewId: requireIdentity(record['agentViewId'], 'Agent View'),
    phase,
    scope: parseDesktopAgentScopeProjection(record['scope']),
  };
}

function parseMainSurface(value: unknown): DesktopWorkbenchMainSurfaceRef {
  const record = requireRecord(value, 'Main Surface ref must be an object.');
  const kind = record['kind'];
  if (kind === 'assistant-preview') {
    requireExactKeys(
      record,
      ['kind', 'previewSessionId', 'assistantSpaceId', 'conversationId', 'scratchArtifactId'],
      'Assistant Preview Surface ref',
    );
    return {
      kind,
      previewSessionId: requireIdentity(record['previewSessionId'], 'Preview Session'),
      assistantSpaceId: requireIdentity(record['assistantSpaceId'], 'Assistant Space'),
      conversationId: requireIdentity(record['conversationId'], 'Agent Conversation'),
      scratchArtifactId: requireIdentity(record['scratchArtifactId'], 'Agent Scratch artifact'),
    };
  }
  if (kind === 'workspace-main') {
    requireExactKeys(
      record,
      ['kind', 'workspaceId', 'viewId', 'viewInstanceId'],
      'Workspace Main Surface ref',
    );
    return {
      kind,
      workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
      viewId: requireIdentity(record['viewId'], 'Workspace View'),
      viewInstanceId: requireIdentity(record['viewInstanceId'], 'Workspace View instance identity'),
    };
  }
  if (kind === 'character-authoring') {
    requireExactKeys(
      record,
      ['kind', 'workspaceId', 'authority', 'viewId', 'viewInstanceId', 'characterProjectId'],
      'Character authoring Surface ref',
    );
    return {
      kind,
      workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
      authority: parseAuthoringAuthority(record['authority']),
      viewId: requireIdentity(record['viewId'], 'Workspace View'),
      viewInstanceId: requireIdentity(record['viewInstanceId'], 'Workspace View instance identity'),
      characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
    };
  }
  if (kind === 'world-authoring') {
    requireExactKeys(
      record,
      ['kind', 'workspaceId', 'authority', 'viewId', 'viewInstanceId', 'worldProjectId'],
      'World authoring Surface ref',
    );
    return {
      kind,
      workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
      authority: parseAuthoringAuthority(record['authority']),
      viewId: requireIdentity(record['viewId'], 'Workspace View'),
      viewInstanceId: requireIdentity(record['viewInstanceId'], 'Workspace View instance identity'),
      worldProjectId: requireIdentity(record['worldProjectId'], 'WorldProject'),
    };
  }
  if (kind === 'world-runtime-main') {
    return {
      kind,
      ...parseWorldRuntimeSurfaceIdentity(record, 'World Runtime Main Surface ref'),
    };
  }
  if (kind === 'asset-preview') {
    requireExactKeys(
      record,
      ['kind', 'assetCenterSessionId', 'previewSessionId'],
      'Asset Preview Surface ref',
    );
    return {
      kind,
      assetCenterSessionId: requireIdentity(record['assetCenterSessionId'], 'Asset Center Session'),
      previewSessionId: requireIdentity(record['previewSessionId'], 'Preview Session'),
    };
  }
  if (kind === 'asset-management') {
    requireExactKeys(record, ['kind', 'assetCenterSessionId'], 'Asset Management Surface ref');
    return {
      kind,
      assetCenterSessionId: requireIdentity(record['assetCenterSessionId'], 'Asset Center Session'),
    };
  }
  if (kind === 'creative-management') {
    requireExactKeys(record, ['kind', 'catalog'], 'Creative Management Surface ref');
    return { kind, catalog: parseCreativeManagementCatalog(record['catalog']) };
  }
  if (kind === 'character-detail') {
    requireExactKeys(record, ['kind', 'selection'], 'Character Detail Surface ref');
    return { kind, selection: parseCharacterDetailSelection(record['selection']) };
  }
  if (kind === 'world-detail') {
    requireExactKeys(record, ['kind', 'selection'], 'World Detail Surface ref');
    return { kind, selection: parseWorldDetailSelection(record['selection']) };
  }
  if (kind === 'character-presentation') {
    requireExactKeys(
      record,
      ['kind', 'owner', 'surfaceKind', 'providerId', 'surfaceId'],
      'Character Presentation Surface ref',
    );
    const owner = parseAgentConversationOwnerRef(record['owner']);
    if (owner.kind !== 'character' && owner.kind !== 'room') {
      throw invalid('Character Presentation Surface requires a Character or Room owner.');
    }
    return {
      kind,
      owner,
      surfaceKind: parseCharacterPresentationSurfaceKind(record['surfaceKind']),
      providerId: requireIdentity(record['providerId'], 'Character Presentation provider'),
      surfaceId: requireIdentity(record['surfaceId'], 'Character Presentation surface'),
    };
  }
  if (kind === 'extension-management') {
    requireExactKeys(record, ['kind'], 'Extension Management Surface ref');
    return { kind };
  }
  if (kind === 'project-detail') {
    requireExactKeys(record, ['kind'], 'Project Detail Surface ref');
    return { kind };
  }
  throw unsupported(`Unknown Main Surface kind '${String(kind)}'.`);
}

function parseAuthoringAuthority(value: unknown): DesktopAuthoringAuthority {
  const record = requireRecord(value, 'Desktop authoring authority must be an object.');
  if (record['kind'] !== 'project') {
    throw invalid(`Unknown Desktop authoring authority '${String(record['kind'])}'.`);
  }
  requireExactKeys(record, ['kind', 'projectId'], 'Project authoring authority');
  return {
    kind: 'project',
    projectId: requireIdentity(record['projectId'], 'Project'),
  };
}

function parseCharacterPresentationSurfaceKind(
  value: unknown,
): DesktopCharacterPresentationSurfaceKind {
  if (
    value !== 'avatar' &&
    value !== 'authorized-web' &&
    value !== 'dynamic-scene' &&
    value !== 'gameplay'
  ) {
    throw unsupported(`Unknown Character Presentation surface kind '${String(value)}'.`);
  }
  return value;
}

function parseManagerSurface(value: unknown): DesktopWorkbenchManagerSurfaceRef {
  const record = requireRecord(value, 'Manager Surface ref must be an object.');
  const kind = record['kind'];
  if (kind === 'workspace-resources') {
    requireExactKeys(record, ['kind', 'workspaceId'], 'Workspace Resources Surface ref');
    return { kind, workspaceId: requireIdentity(record['workspaceId'], 'Workspace') };
  }
  if (kind === 'character-runtime-manager') {
    requireExactKeys(record, ['kind', 'owner'], 'Character Runtime Manager Surface ref');
    const owner = parseAgentConversationOwnerRef(record['owner']);
    if (owner.kind !== 'character' && owner.kind !== 'room') {
      throw invalid('Character Runtime Manager requires a Character or Room owner.');
    }
    return { kind, owner };
  }
  if (kind === 'world-runtime-manager') {
    return {
      kind,
      ...parseWorldRuntimeSurfaceIdentity(record, 'World Runtime Manager Surface ref'),
    };
  }
  throw unsupported(`Unknown Manager Surface kind '${String(kind)}'.`);
}

function parseCutPanelSurface(value: unknown): DesktopWorkbenchCutPanelSurfaceRef {
  const record = requireRecord(value, 'Cut Panel Surface ref must be an object.');
  if (record['kind'] === 'world-runtime-timeline') {
    return {
      kind: 'world-runtime-timeline',
      ...parseWorldRuntimeSurfaceIdentity(record, 'World Runtime Timeline Surface ref'),
    };
  }
  if (record['kind'] === 'character-timeline-stack') {
    requireExactKeys(
      record,
      ['kind', 'owner', 'timelines'],
      'Character Timeline Stack Surface ref',
    );
    const owner = parseAgentConversationOwnerRef(record['owner']);
    if (owner.kind !== 'character' && owner.kind !== 'room') {
      throw invalid('Character Timeline Stack requires a Character or Room owner.');
    }
    if (!Array.isArray(record['timelines']) || record['timelines'].length === 0) {
      throw invalid('Character Timeline Stack requires at least one exact Timeline ref.');
    }
    const timelines = record['timelines'].map(parseCharacterTimelineSurface);
    const timelineIds = new Set(timelines.map((timeline) => timeline.timelineId));
    const timelineKinds = new Set(timelines.map((timeline) => timeline.kind));
    if (timelineIds.size !== timelines.length || timelineKinds.size !== timelines.length) {
      throw invalid('Character Timeline Stack requires unique Timeline identities and kinds.');
    }
    if (timelines.some((timeline) => !isSameAgentConversationOwner(timeline.owner, owner))) {
      throw mismatch('Character Timeline ref does not match its Stack owner.');
    }
    if (
      owner.kind !== 'room' &&
      timelines.some((timeline) => timeline.kind === 'character-room-event-timeline')
    ) {
      throw mismatch('Character Dialogue cannot mount a RoomEvent Timeline.');
    }
    return { kind: 'character-timeline-stack', owner, timelines };
  }
  requireExactKeys(
    record,
    ['kind', 'workspaceId', 'viewId', 'viewInstanceId', 'ownerId'],
    'Workspace Cut Panel Surface ref',
  );
  if (record['kind'] !== 'workspace-cut') {
    throw unsupported('Cut Panel slot only accepts Workspace Cut Surface.');
  }
  return {
    kind: 'workspace-cut',
    workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    viewId: requireIdentity(record['viewId'], 'Cut View'),
    viewInstanceId: requireIdentity(record['viewInstanceId'], 'Cut View instance identity'),
    ownerId: requireIdentity(record['ownerId'], 'Cut owner'),
  };
}

function parseCharacterTimelineSurface(value: unknown): DesktopCharacterTimelineSurfaceRef {
  const record = requireRecord(value, 'Character Timeline Surface ref must be an object.');
  requireExactKeys(record, ['kind', 'owner', 'timelineId'], 'Character Timeline Surface ref');
  const owner = parseAgentConversationOwnerRef(record['owner']);
  const timelineId = requireIdentity(record['timelineId'], 'Character Timeline');
  if (record['kind'] === 'character-storyline-timeline') {
    if (owner.kind !== 'character' && owner.kind !== 'room') {
      throw invalid('Storyline Timeline requires a Character or Room owner.');
    }
    return { kind: 'character-storyline-timeline', owner, timelineId };
  }
  if (record['kind'] === 'character-room-event-timeline') {
    if (owner.kind !== 'room') {
      throw invalid('RoomEvent Timeline requires a Room owner.');
    }
    return { kind: 'character-room-event-timeline', owner, timelineId };
  }
  throw unsupported(`Unknown Character Timeline kind '${String(record['kind'])}'.`);
}

function parseStatusSurface(value: unknown): DesktopWorkbenchStatusSurfaceRef {
  const record = requireRecord(value, 'Status Surface ref must be an object.');
  if (record['kind'] === 'world-runtime-status') {
    requireExactKeys(
      record,
      ['kind', 'sceneId', 'worldRunId', 'worldSaveId', 'branchId', 'participantId'],
      'World Runtime Status Surface ref',
    );
    return {
      kind: 'world-runtime-status',
      sceneId: requireIdentity(record['sceneId'], 'Desktop Scene'),
      ...parseWorldRuntimeSurfaceIdentity(record, 'World Runtime Status Surface ref'),
    };
  }
  requireExactKeys(record, ['kind', 'sceneId'], 'Scene Status Surface ref');
  if (record['kind'] !== 'scene-status') {
    throw unsupported('Status slot only accepts Scene Status Surface.');
  }
  return { kind: 'scene-status', sceneId: requireIdentity(record['sceneId'], 'Desktop Scene') };
}

function parseWorldRuntimeSurfaceIdentity(
  record: Readonly<Record<string, unknown>>,
  label: string,
): DesktopWorldRuntimeSurfaceIdentity {
  requireExactKeys(
    record,
    [
      'kind',
      'worldRunId',
      'worldSaveId',
      'branchId',
      'participantId',
      ...(record['kind'] === 'world-runtime-status' ? ['sceneId'] : []),
    ],
    label,
  );
  return {
    worldRunId: requireIdentity(record['worldRunId'], 'WorldRun'),
    worldSaveId: requireIdentity(record['worldSaveId'], 'WorldSave'),
    branchId: requireIdentity(record['branchId'], 'World branch'),
    participantId: requireIdentity(record['participantId'], 'World participant'),
  };
}

function parseSceneTransitionIntent(value: unknown): DesktopSceneTransitionIntent {
  const record = requireRecord(value, 'Desktop Scene transition intent must be an object.');
  const kind = record['kind'];
  if (
    kind === 'open-agent-entry' ||
    kind === 'new-agent-conversation' ||
    kind === 'open-asset-center' ||
    kind === 'open-extensions'
  ) {
    requireExactKeys(record, ['kind'], 'Desktop Scene transition intent');
    return { kind };
  }
  if (kind === 'open-creative-management') {
    requireExactKeys(record, ['kind', 'catalog'], 'Open Creative Management intent');
    return { kind, catalog: parseCreativeManagementCatalog(record['catalog']) };
  }
  if (kind === 'select-character-detail') {
    requireExactKeys(record, ['kind', 'selection'], 'Select Character Detail intent');
    return { kind, selection: parseCharacterDetailSelection(record['selection']) };
  }
  if (kind === 'select-world-detail') {
    requireExactKeys(record, ['kind', 'selection'], 'Select World Detail intent');
    return { kind, selection: parseWorldDetailSelection(record['selection']) };
  }
  if (kind === 'open-workspace') {
    requireExactKeys(record, ['kind', 'workspaceGrantId'], 'Open Workspace intent');
    return {
      kind,
      workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Workspace Grant'),
    };
  }
  if (kind === 'open-project-workspace') {
    requireExactKeys(record, ['kind', 'projectId'], 'Open Project Workspace intent');
    return {
      kind,
      projectId: requireIdentity(record['projectId'], 'Desktop Project'),
    };
  }
  if (kind === 'open-character-authoring') {
    requireExactKeys(
      record,
      ['kind', 'workspaceGrantId', 'authority', 'characterProjectId'],
      'Open Character authoring intent',
    );
    const authority = parseAuthoringAuthority(record['authority']);
    return {
      kind,
      workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Workspace Grant'),
      authority,
      characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
    };
  }
  if (kind === 'open-world-authoring') {
    requireExactKeys(
      record,
      ['kind', 'workspaceGrantId', 'authority', 'worldProjectId'],
      'Open World authoring intent',
    );
    const authority = parseAuthoringAuthority(record['authority']);
    return {
      kind,
      workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Workspace Grant'),
      authority,
      worldProjectId: requireIdentity(record['worldProjectId'], 'WorldProject'),
    };
  }
  if (kind === 'open-world-runtime') {
    requireExactKeys(record, ['kind', 'binding'], 'Open World Runtime intent');
    return { kind, binding: parseWorldRuntimeBinding(record['binding']) };
  }
  if (kind === 'restore-conversation') {
    requireExactKeys(record, ['kind', 'navigation'], 'Restore Conversation intent');
    return { kind, navigation: parseAgentHomeNavigationIdentity(record['navigation']) };
  }
  throw unsupported(`Unknown Desktop Scene transition intent '${String(kind)}'.`);
}

function validateSceneProjection(projection: DesktopWorkbenchSceneProjection): void {
  if (projection.slots.status?.sceneId !== projection.sceneId) {
    throw mismatch('Desktop Status Surface must match its Scene identity.');
  }
  const { context, slots } = projection;
  if (context.kind === 'agent') {
    if (
      slots.interaction?.kind !== 'agent' ||
      slots.interaction.agentViewId !== context.agentViewId
    ) {
      throw mismatch('Agent Scene requires its exact Agent Interaction Surface.');
    }
    if (!equalAgentScope(slots.interaction.scope, context.scope)) {
      throw mismatch('Agent Interaction scope does not match Scene context.');
    }
    const expectsSession =
      context.scope.kind !== 'unbound' && context.scope.conversationId !== undefined;
    if ((slots.interaction.phase === 'session') !== expectsSession) {
      throw mismatch('Agent presentation phase does not match Conversation binding.');
    }
    validateAgentMain(context.scope, slots.main);
    validateAgentMain(context.scope, slots.secondaryMain);
    validateAgentManager(context.scope, slots.leftManager);
    validateAgentManager(context.scope, slots.rightManager);
    if (context.scope.kind !== 'workspace' && slots.cutPanel) {
      throw mismatch('Assistant or unbound Agent Scene cannot mount a Workspace Cut Panel.');
    }
    if (
      context.scope.kind === 'workspace' &&
      slots.cutPanel &&
      slots.cutPanel.kind === 'workspace-cut' &&
      slots.cutPanel.workspaceId !== context.scope.workspaceId
    ) {
      throw mismatch('Workspace Cut Panel does not match Agent Workspace scope.');
    }
    return;
  }
  if (context.kind === 'character-interaction') {
    if (
      slots.interaction?.kind !== 'agent' ||
      slots.interaction.phase !== 'session' ||
      slots.interaction.agentViewId !== context.agentViewId ||
      slots.interaction.scope.kind !== 'assistant' ||
      slots.interaction.scope.assistantSpaceId !== context.scope.assistantSpaceId ||
      slots.interaction.scope.conversationId !== context.scope.conversationId
    ) {
      throw mismatch('Character Interaction Scene requires its exact Agent session Surface.');
    }
    if (
      slots.main?.kind !== 'character-presentation' ||
      !isSameAgentConversationOwner(slots.main.owner, context.owner)
    ) {
      throw mismatch('Character Interaction Scene requires its exact Presentation Main Surface.');
    }
    if (
      slots.rightManager?.kind !== 'character-runtime-manager' ||
      !isSameAgentConversationOwner(slots.rightManager.owner, context.owner)
    ) {
      throw mismatch('Character Interaction Scene requires its exact Runtime Manager Surface.');
    }
    if (slots.leftManager || slots.secondaryMain) {
      throw mismatch('Character Interaction Scene cannot mount unrelated manager or detail slots.');
    }
    if (slots.cutPanel) {
      if (
        slots.cutPanel.kind !== 'character-timeline-stack' ||
        !isSameAgentConversationOwner(slots.cutPanel.owner, context.owner) ||
        !slots.cutPanel.timelines.some(
          (timeline) => timeline.kind === 'character-storyline-timeline',
        )
      ) {
        throw mismatch('Character Interaction Timeline must include its exact Storyline ref.');
      }
    }
    return;
  }
  if (context.kind === 'world-runtime') {
    if (
      slots.main?.kind !== 'world-runtime-main' ||
      !equalWorldRuntimeSurface(slots.main, context.binding)
    ) {
      throw mismatch('World Runtime Scene requires its exact World Main Surface.');
    }
    if (
      slots.interaction?.kind !== 'world-runtime-interaction' ||
      !equalWorldRuntimeSurface(slots.interaction, context.binding)
    ) {
      throw mismatch('World Runtime Scene requires its exact Interaction Surface.');
    }
    if (
      slots.rightManager?.kind !== 'world-runtime-manager' ||
      !equalWorldRuntimeSurface(slots.rightManager, context.binding)
    ) {
      throw mismatch('World Runtime Scene requires its exact right Manager Surface.');
    }
    if (
      slots.cutPanel?.kind !== 'world-runtime-timeline' ||
      !equalWorldRuntimeSurface(slots.cutPanel, context.binding)
    ) {
      throw mismatch('World Runtime Scene requires its exact bottom Timeline Surface.');
    }
    if (
      slots.status?.kind !== 'world-runtime-status' ||
      !equalWorldRuntimeSurface(slots.status, context.binding)
    ) {
      throw mismatch('World Runtime Scene requires its exact Status Surface.');
    }
    if (slots.secondaryMain || slots.leftManager) {
      throw mismatch('World Runtime Scene cannot mount unrelated secondary or left surfaces.');
    }
    return;
  }
  if (slots.interaction || slots.cutPanel) {
    throw mismatch(`${context.kind} Scene cannot mount Agent Interaction or Workspace Cut Panel.`);
  }
  if (context.kind === 'asset-center') {
    assertManagerKinds(slots, []);
    if (
      slots.main?.kind !== 'asset-management' ||
      slots.main.assetCenterSessionId !== context.assetCenterSessionId
    ) {
      throw mismatch('Asset Center Scene requires its exact Asset Management Main Surface.');
    }
    if (
      slots.secondaryMain &&
      (slots.secondaryMain.kind !== 'asset-preview' ||
        slots.secondaryMain.assetCenterSessionId !== context.assetCenterSessionId)
    ) {
      throw mismatch('Asset Preview Surface does not match Asset Center Session.');
    }
    return;
  }
  if (context.kind === 'creative-management') {
    assertManagerKinds(slots, []);
    assertMainKinds(slots, ['creative-management', 'character-detail', 'world-detail']);
    if (slots.main?.kind !== 'creative-management' || slots.main.catalog !== context.catalog) {
      throw mismatch('Creative Management Scene requires its exact catalog Main Surface.');
    }
    if (context.detail === undefined) {
      if (slots.secondaryMain !== undefined) {
        throw mismatch('Creative Management Scene without selection cannot mount Detail.');
      }
    } else if (context.catalog === 'characters') {
      if (
        slots.secondaryMain?.kind !== 'character-detail' ||
        !isCharacterDetailSelection(context.detail) ||
        !equalCharacterDetailSelection(slots.secondaryMain.selection, context.detail)
      ) {
        throw mismatch('Character Detail Surface does not match Scene selection.');
      }
    } else if (context.catalog === 'worlds') {
      if (
        slots.secondaryMain?.kind !== 'world-detail' ||
        !isWorldDetailSelection(context.detail) ||
        !equalWorldDetailSelection(slots.secondaryMain.selection, context.detail)
      ) {
        throw mismatch('World Detail Surface does not match Scene selection.');
      }
    } else {
      throw mismatch('Content Project management cannot mount a Detail Surface.');
    }
    return;
  }
  if (context.kind === 'extensions') {
    assertManagerKinds(slots, []);
    assertMainKinds(slots, ['extension-management']);
    if (slots.main?.kind !== 'extension-management') {
      throw mismatch('Extensions Scene requires its Extension Management Main Surface.');
    }
    return;
  }
}

function parseCharacterDetailSelection(value: unknown): DesktopCharacterDetailSelection {
  const record = requireRecord(value, 'Character Detail selection must be an object.');
  const kind = record['kind'];
  if (kind === 'global') {
    requireExactKeys(record, ['kind', 'globalCharacterId'], 'Global Character Detail selection');
    return {
      kind,
      globalCharacterId: requireIdentity(record['globalCharacterId'], 'GlobalCharacter'),
    };
  }
  throw unsupported(`Unknown Character Detail selection '${String(kind)}'.`);
}

function parseWorldDetailSelection(value: unknown): DesktopWorldDetailSelection {
  const record = requireRecord(value, 'World Detail selection must be an object.');
  const kind = record['kind'];
  if (kind === 'global') {
    requireExactKeys(record, ['kind', 'globalWorldId'], 'Global World Detail selection');
    return {
      kind,
      globalWorldId: requireIdentity(record['globalWorldId'], 'GlobalWorld'),
    };
  }
  throw unsupported(`Unknown World Detail selection '${String(kind)}'.`);
}

function parseCreativeManagementCatalog(value: unknown): DesktopCreativeManagementCatalog {
  if (
    value === 'content-projects' ||
    value === 'works' ||
    value === 'characters' ||
    value === 'worlds'
  ) {
    return value;
  }
  throw invalid(`Unknown Creative Management catalog '${String(value)}'.`);
}

function equalCharacterDetailSelection(
  left: DesktopCharacterDetailSelection,
  right: DesktopCharacterDetailSelection,
): boolean {
  return left.globalCharacterId === right.globalCharacterId;
}

function isCharacterDetailSelection(
  selection: DesktopCharacterDetailSelection | DesktopWorldDetailSelection,
): selection is DesktopCharacterDetailSelection {
  return 'globalCharacterId' in selection;
}

function isWorldDetailSelection(
  selection: DesktopCharacterDetailSelection | DesktopWorldDetailSelection,
): selection is DesktopWorldDetailSelection {
  return 'globalWorldId' in selection;
}

function equalWorldDetailSelection(
  left: DesktopWorldDetailSelection,
  right: DesktopWorldDetailSelection,
): boolean {
  return left.globalWorldId === right.globalWorldId;
}

function equalWorldRuntimeSurface(
  surface: DesktopWorldRuntimeSurfaceIdentity,
  binding: WorldRuntimeBinding,
): boolean {
  return (
    surface.worldRunId === binding.worldRunId &&
    surface.worldSaveId === binding.worldSaveId &&
    surface.branchId === binding.branchId &&
    surface.participantId === binding.participantId
  );
}

function validateAgentMain(
  scope: DesktopAgentScopeProjection,
  ref: DesktopWorkbenchMainSurfaceRef | undefined,
): void {
  if (!ref) return;
  if (scope.kind === 'unbound') {
    throw mismatch(`Unbound Agent Scene cannot mount Main Surface '${ref.kind}'.`);
  }
  if (scope.kind === 'assistant') {
    if (
      ref.kind !== 'assistant-preview' ||
      ref.assistantSpaceId !== scope.assistantSpaceId ||
      ref.conversationId !== scope.conversationId
    ) {
      throw mismatch('Assistant Scene Main Surface does not match Assistant Space.');
    }
    return;
  }
  if (
    (ref.kind !== 'workspace-main' &&
      ref.kind !== 'character-authoring' &&
      ref.kind !== 'world-authoring') ||
    ref.workspaceId !== scope.workspaceId
  ) {
    throw mismatch('Workspace Scene Main Surface does not match Workspace identity.');
  }
}

function validateAgentManager(
  scope: DesktopAgentScopeProjection,
  ref: DesktopWorkbenchManagerSurfaceRef | undefined,
): void {
  if (!ref) return;
  if (scope.kind === 'unbound') {
    throw mismatch(`Unbound Agent Scene cannot mount Manager Surface '${ref.kind}'.`);
  }
  if (scope.kind === 'assistant') {
    throw mismatch(`Assistant Scene cannot mount Manager Surface '${ref.kind}'.`);
  }
  if (ref.kind !== 'workspace-resources' || ref.workspaceId !== scope.workspaceId) {
    throw mismatch('Workspace Manager Surface does not match Workspace identity.');
  }
}

function assertManagerKinds(
  slots: DesktopWorkbenchSceneProjection['slots'],
  allowed: readonly DesktopWorkbenchManagerSurfaceRef['kind'][],
): void {
  for (const ref of [slots.leftManager, slots.rightManager]) {
    if (ref && !allowed.includes(ref.kind)) {
      throw mismatch(`Manager Surface '${ref.kind}' is not valid for this Scene.`);
    }
  }
}

function assertMainKinds(
  slots: DesktopWorkbenchSceneProjection['slots'],
  allowed: readonly DesktopWorkbenchMainSurfaceRef['kind'][],
): void {
  for (const ref of [slots.main, slots.secondaryMain]) {
    if (ref && !allowed.includes(ref.kind)) {
      throw mismatch(`Main Surface '${ref.kind}' is not valid for this Scene.`);
    }
  }
}

function equalAgentScope(
  left: DesktopAgentScopeProjection,
  right: DesktopAgentScopeProjection,
): boolean {
  if (left.kind === 'unbound' || right.kind === 'unbound') {
    return left.kind === 'unbound' && right.kind === 'unbound' && left.draftId === right.draftId;
  }
  if (left.kind === 'assistant' || right.kind === 'assistant') {
    return (
      left.kind === 'assistant' &&
      right.kind === 'assistant' &&
      left.draftId === right.draftId &&
      left.conversationId === right.conversationId &&
      left.assistantSpaceId === right.assistantSpaceId
    );
  }
  return (
    left.draftId === right.draftId &&
    left.conversationId === right.conversationId &&
    left.workspaceId === right.workspaceId &&
    left.workspaceGrantId === right.workspaceGrantId
  );
}

function readConversationId(record: Record<string, unknown>): { readonly conversationId?: string } {
  return record['conversationId'] === undefined
    ? {}
    : { conversationId: requireIdentity(record['conversationId'], 'Conversation') };
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isUnknownRecord(value)) throw invalid(message);
  return value;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireExactKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
  optional: readonly string[] = [],
): void {
  const allowedSet = new Set(allowed);
  const optionalSet = new Set(optional);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) throw invalid(`${label} contains unknown field '${key}'.`);
  }
  for (const key of allowed) {
    if (!optionalSet.has(key) && !(key in record)) {
      throw invalid(`${label} is missing required field '${key}'.`);
    }
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalid(`${label} identity is required.`);
  }
  return value;
}

function requireBoolean(value: unknown, message: string): boolean {
  if (typeof value !== 'boolean') throw invalid(message);
  return value;
}

function requireSidebarWidth(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < DESKTOP_APPLICATION_SIDEBAR_WIDTH_LIMITS.min ||
    value > DESKTOP_APPLICATION_SIDEBAR_WIDTH_LIMITS.max
  ) {
    throw invalid(
      `Desktop Sidebar width must be between ${DESKTOP_APPLICATION_SIDEBAR_WIDTH_LIMITS.min} and ${DESKTOP_APPLICATION_SIDEBAR_WIDTH_LIMITS.max}.`,
    );
  }
  return value;
}

function invalid(message: string): DesktopSceneContractError {
  return new DesktopSceneContractError('invalid-desktop-scene-payload', message);
}

function unsupported(message: string): DesktopSceneContractError {
  return new DesktopSceneContractError('invalid-desktop-scene-payload', message);
}

function mismatch(message: string): DesktopSceneContractError {
  return new DesktopSceneContractError('desktop-scene-scope-mismatch', message);
}

function stale(message: string): DesktopSceneContractError {
  return new DesktopSceneContractError('desktop-scene-stale-identity', message);
}
