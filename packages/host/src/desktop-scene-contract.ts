import {
  isSameAgentConversationOwner,
  parseAgentConversationOwnerRef,
  parseAgentHomeNavigationIdentity,
  type AgentConversationOwnerRef,
  type AgentHomeNavigationIdentity,
} from '@neko/agent-contracts';

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
  | { readonly kind: 'asset-center'; readonly assetCenterSessionId: string }
  | { readonly kind: 'character-management'; readonly detail?: DesktopCharacterDetailSelection }
  | { readonly kind: 'world-management' }
  | { readonly kind: 'extensions' }
  | { readonly kind: 'project-management' }
  | { readonly kind: 'settings'; readonly settingsSectionId: string };

export interface DesktopAgentInteractionSurfaceRef {
  readonly kind: 'agent';
  readonly agentSurfaceId: string;
  readonly agentViewId: string;
  readonly phase: 'draft' | 'session';
  readonly scope: DesktopAgentScopeProjection;
}

export type DesktopCharacterDetailSelection =
  { readonly kind: 'create' } | { readonly kind: 'project'; readonly characterProjectId: string };

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
      readonly kind: 'asset-preview';
      readonly assetCenterSessionId: string;
      readonly previewSessionId: string;
    }
  | { readonly kind: 'asset-management'; readonly assetCenterSessionId: string }
  | { readonly kind: 'character-management' }
  | { readonly kind: 'character-detail'; readonly selection: DesktopCharacterDetailSelection }
  | { readonly kind: 'world-management' }
  | {
      readonly kind: 'character-avatar';
      readonly owner: Extract<AgentConversationOwnerRef, { readonly kind: 'character' | 'room' }>;
    }
  | { readonly kind: 'extension-management' }
  | { readonly kind: 'extension-detail' }
  | { readonly kind: 'project-management' }
  | { readonly kind: 'project-detail' }
  | { readonly kind: 'settings-main'; readonly settingsSectionId: string };

export type DesktopWorkbenchManagerSurfaceRef =
  | { readonly kind: 'workspace-resources'; readonly workspaceId: string }
  | {
      readonly kind: 'character-runtime-manager';
      readonly owner: Extract<AgentConversationOwnerRef, { readonly kind: 'character' | 'room' }>;
    }
  | { readonly kind: 'settings-navigation'; readonly settingsSectionId: string };

export type DesktopWorkbenchCutPanelSurfaceRef =
  | {
      readonly kind: 'workspace-cut';
      readonly workspaceId: string;
      readonly viewId: string;
      readonly viewInstanceId: string;
      readonly ownerId: string;
    }
  | {
      readonly kind: 'character-room-timeline';
      readonly owner: Extract<AgentConversationOwnerRef, { readonly kind: 'room' }>;
    };

export interface DesktopWorkbenchStatusSurfaceRef {
  readonly kind: 'scene-status';
  readonly sceneId: string;
}

export interface DesktopWorkbenchSceneProjection {
  readonly sceneId: string;
  readonly windowId: string;
  readonly context: DesktopWorkbenchSceneContext;
  readonly slots: {
    readonly interaction?: DesktopAgentInteractionSurfaceRef;
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
  | { readonly kind: 'bind-agent-assistant'; readonly draftId: string }
  | { readonly kind: 'open-workspace'; readonly workspaceGrantId: string }
  | { readonly kind: 'open-project-workspace'; readonly projectId: string }
  | { readonly kind: 'open-asset-center' }
  | { readonly kind: 'open-character-management' }
  | { readonly kind: 'open-world-management' }
  | {
      readonly kind: 'select-character-detail';
      readonly selection: DesktopCharacterDetailSelection;
    }
  | { readonly kind: 'open-extensions' }
  | { readonly kind: 'open-project-management' }
  | { readonly kind: 'open-settings'; readonly sectionId?: string }
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
    readonly owner: 'workspace-authority' | 'agent-conversation-authority';
    readonly intentKind: 'open-workspace' | 'open-project-workspace' | 'restore-conversation';
    readonly conversationOwnerKind?: AgentConversationOwnerRef['kind'] | 'world';
  };
}

export interface DesktopSceneTransitionRejectedDiagnostic {
  readonly code: 'new-conversation-required';
  readonly severity: 'error';
  readonly message: string;
  readonly metadata: {
    readonly owner: 'agent-conversation-authority';
    readonly intentKind: 'open-workspace' | 'open-project-workspace';
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
    if (owner !== 'workspace-authority' && owner !== 'agent-conversation-authority') {
      throw invalid(`Unknown Desktop Scene unavailable owner '${String(owner)}'.`);
    }
    if (
      intentKind !== 'open-workspace' &&
      intentKind !== 'open-project-workspace' &&
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
        metadata['intentKind'] !== 'open-project-workspace')
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
  if (kind === 'asset-center') {
    requireExactKeys(record, ['kind', 'assetCenterSessionId'], 'Asset Center Scene context');
    return {
      kind,
      assetCenterSessionId: requireIdentity(record['assetCenterSessionId'], 'Asset Center Session'),
    };
  }
  if (kind === 'character-management') {
    requireExactKeys(record, ['kind', 'detail'], 'Character Management Scene context', ['detail']);
    return {
      kind,
      ...(record['detail'] === undefined
        ? {}
        : { detail: parseCharacterDetailSelection(record['detail']) }),
    };
  }
  if (kind === 'world-management') {
    requireExactKeys(record, ['kind'], 'World Management Scene context');
    return { kind };
  }
  if (kind === 'extensions') {
    requireExactKeys(record, ['kind'], 'Extensions Scene context');
    return { kind };
  }
  if (kind === 'project-management') {
    requireExactKeys(record, ['kind'], 'Project Management Scene context');
    return { kind };
  }
  if (kind === 'settings') {
    requireExactKeys(record, ['kind', 'settingsSectionId'], 'Settings Scene context');
    return {
      kind,
      settingsSectionId: requireIdentity(record['settingsSectionId'], 'Settings Section'),
    };
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

function parseInteractionSurface(value: unknown): DesktopAgentInteractionSurfaceRef {
  const record = requireRecord(value, 'Interaction Surface ref must be an object.');
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
  if (kind === 'character-management') {
    requireExactKeys(record, ['kind'], 'Character Management Surface ref');
    return { kind };
  }
  if (kind === 'character-detail') {
    requireExactKeys(record, ['kind', 'selection'], 'Character Detail Surface ref');
    return { kind, selection: parseCharacterDetailSelection(record['selection']) };
  }
  if (kind === 'world-management') {
    requireExactKeys(record, ['kind'], 'World Management Surface ref');
    return { kind };
  }
  if (kind === 'character-avatar') {
    requireExactKeys(record, ['kind', 'owner'], 'Character Avatar Surface ref');
    const owner = parseAgentConversationOwnerRef(record['owner']);
    if (owner.kind !== 'character' && owner.kind !== 'room') {
      throw invalid('Character Avatar Surface requires a Character or Room owner.');
    }
    return { kind, owner };
  }
  if (kind === 'extension-management') {
    requireExactKeys(record, ['kind'], 'Extension Management Surface ref');
    return { kind };
  }
  if (kind === 'extension-detail') {
    requireExactKeys(record, ['kind'], 'Extension Detail Surface ref');
    return { kind };
  }
  if (kind === 'project-detail') {
    requireExactKeys(record, ['kind'], 'Project Detail Surface ref');
    return { kind };
  }
  if (kind === 'project-management') {
    requireExactKeys(record, ['kind'], 'Project Management Surface ref');
    return { kind };
  }
  if (kind === 'settings-main') {
    requireExactKeys(record, ['kind', 'settingsSectionId'], 'Settings Main Surface ref');
    return {
      kind,
      settingsSectionId: requireIdentity(record['settingsSectionId'], 'Settings Section'),
    };
  }
  throw unsupported(`Unknown Main Surface kind '${String(kind)}'.`);
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
  if (kind === 'settings-navigation') {
    requireExactKeys(record, ['kind', 'settingsSectionId'], 'Settings Navigation Surface ref');
    return {
      kind,
      settingsSectionId: requireIdentity(record['settingsSectionId'], 'Settings Section'),
    };
  }
  throw unsupported(`Unknown Manager Surface kind '${String(kind)}'.`);
}

function parseCutPanelSurface(value: unknown): DesktopWorkbenchCutPanelSurfaceRef {
  const record = requireRecord(value, 'Cut Panel Surface ref must be an object.');
  if (record['kind'] === 'character-room-timeline') {
    requireExactKeys(record, ['kind', 'owner'], 'Character Room Timeline Surface ref');
    const owner = parseAgentConversationOwnerRef(record['owner']);
    if (owner.kind !== 'room') {
      throw invalid('Character Room Timeline requires a Room owner.');
    }
    return { kind: 'character-room-timeline', owner };
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

function parseStatusSurface(value: unknown): DesktopWorkbenchStatusSurfaceRef {
  const record = requireRecord(value, 'Status Surface ref must be an object.');
  requireExactKeys(record, ['kind', 'sceneId'], 'Scene Status Surface ref');
  if (record['kind'] !== 'scene-status') {
    throw unsupported('Status slot only accepts Scene Status Surface.');
  }
  return { kind: 'scene-status', sceneId: requireIdentity(record['sceneId'], 'Desktop Scene') };
}

function parseSceneTransitionIntent(value: unknown): DesktopSceneTransitionIntent {
  const record = requireRecord(value, 'Desktop Scene transition intent must be an object.');
  const kind = record['kind'];
  if (
    kind === 'open-agent-entry' ||
    kind === 'new-agent-conversation' ||
    kind === 'open-asset-center' ||
    kind === 'open-character-management' ||
    kind === 'open-world-management' ||
    kind === 'open-extensions' ||
    kind === 'open-project-management'
  ) {
    requireExactKeys(record, ['kind'], 'Desktop Scene transition intent');
    return { kind };
  }
  if (kind === 'select-character-detail') {
    requireExactKeys(record, ['kind', 'selection'], 'Select Character Detail intent');
    return { kind, selection: parseCharacterDetailSelection(record['selection']) };
  }
  if (kind === 'bind-agent-assistant') {
    requireExactKeys(record, ['kind', 'draftId'], 'Desktop Scene transition intent');
    return { kind, draftId: requireIdentity(record['draftId'], 'Agent Draft') };
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
  if (kind === 'open-settings') {
    requireExactKeys(record, ['kind', 'sectionId'], 'Open Settings intent', ['sectionId']);
    return {
      kind,
      ...(record['sectionId'] === undefined
        ? {}
        : { sectionId: requireIdentity(record['sectionId'], 'Settings Section') }),
    };
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
    if (!slots.interaction || slots.interaction.agentViewId !== context.agentViewId) {
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
      slots.main?.kind !== 'character-avatar' ||
      !isSameAgentConversationOwner(slots.main.owner, context.owner)
    ) {
      throw mismatch('Character Interaction Scene requires its exact Avatar Main Surface.');
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
    if (context.owner.kind === 'room') {
      if (
        slots.cutPanel?.kind !== 'character-room-timeline' ||
        !isSameAgentConversationOwner(slots.cutPanel.owner, context.owner)
      ) {
        throw mismatch('Room Interaction Scene requires its exact Room Timeline Surface.');
      }
    } else if (slots.cutPanel) {
      throw mismatch('Character Dialogue Scene cannot mount a Room Timeline Surface.');
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
  if (context.kind === 'character-management') {
    assertManagerKinds(slots, []);
    assertMainKinds(slots, ['character-management', 'character-detail']);
    if (slots.main?.kind !== 'character-management') {
      throw mismatch('Character Management Scene requires its catalog Main Surface.');
    }
    if (context.detail === undefined) {
      if (slots.secondaryMain !== undefined) {
        throw mismatch('Character Management Scene without selection cannot mount Detail.');
      }
    } else if (
      slots.secondaryMain?.kind !== 'character-detail' ||
      !equalCharacterDetailSelection(slots.secondaryMain.selection, context.detail)
    ) {
      throw mismatch('Character Detail Surface does not match Scene selection.');
    }
    return;
  }
  if (context.kind === 'world-management') {
    assertManagerKinds(slots, []);
    assertMainKinds(slots, ['world-management']);
    if (slots.main?.kind !== 'world-management') {
      throw mismatch('World Management Scene requires its Foundation Main Surface.');
    }
    return;
  }
  if (context.kind === 'extensions') {
    assertManagerKinds(slots, []);
    assertMainKinds(slots, ['extension-management', 'extension-detail']);
    if (slots.main?.kind !== 'extension-management') {
      throw mismatch('Extensions Scene requires its Extension Management Main Surface.');
    }
    return;
  }
  if (context.kind === 'project-management') {
    assertManagerKinds(slots, []);
    assertMainKinds(slots, ['project-management', 'project-detail']);
    if (slots.main?.kind !== 'project-management') {
      throw mismatch('Project Management Scene requires its Management Main Surface.');
    }
    return;
  }
  assertManagerKinds(slots, ['settings-navigation']);
  assertMainKinds(slots, ['settings-main']);
  validateManagementIdentity(slots, context.settingsSectionId);
}

function parseCharacterDetailSelection(value: unknown): DesktopCharacterDetailSelection {
  const record = requireRecord(value, 'Character Detail selection must be an object.');
  const kind = record['kind'];
  if (kind === 'create') {
    requireExactKeys(record, ['kind'], 'Create Character Detail selection');
    return { kind };
  }
  if (kind === 'project') {
    requireExactKeys(record, ['kind', 'characterProjectId'], 'Project Character Detail selection');
    return {
      kind,
      characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
    };
  }
  throw unsupported(`Unknown Character Detail selection '${String(kind)}'.`);
}

function equalCharacterDetailSelection(
  left: DesktopCharacterDetailSelection,
  right: DesktopCharacterDetailSelection,
): boolean {
  return (
    left.kind === right.kind &&
    (left.kind === 'create' ||
      (right.kind === 'project' && left.characterProjectId === right.characterProjectId))
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
  if (ref.kind !== 'workspace-main' || ref.workspaceId !== scope.workspaceId) {
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

function validateManagementIdentity(
  slots: DesktopWorkbenchSceneProjection['slots'],
  expected: string,
): void {
  for (const ref of [slots.leftManager, slots.rightManager, slots.main, slots.secondaryMain]) {
    if (ref && readManagementIdentity(ref) !== expected) {
      throw mismatch(`Management Surface '${ref.kind}' does not match its Scene identity.`);
    }
  }
}

function readManagementIdentity(
  ref: DesktopWorkbenchMainSurfaceRef | DesktopWorkbenchManagerSurfaceRef,
): string | undefined {
  return 'settingsSectionId' in ref ? ref.settingsSectionId : undefined;
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
