export const DESKTOP_SCENE_CONTRACT_VERSION = 1 as const;
export const DESKTOP_APPLICATION_SIDEBAR_CONTRACT_VERSION = 1 as const;
export const DESKTOP_APPLICATION_SIDEBAR_DEFAULT_WIDTH = 240;
export const DESKTOP_APPLICATION_SIDEBAR_WIDTH_LIMITS = { min: 208, max: 360 } as const;

export type DesktopAgentScopeProjection =
  | {
      readonly kind: 'assistant';
      readonly assistantSpaceId: string;
      readonly conversationId?: string;
    }
  | {
      readonly kind: 'workspace';
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
  | { readonly kind: 'asset-center'; readonly assetCenterSessionId: string }
  | { readonly kind: 'extensions'; readonly extensionManagementSessionId: string }
  | { readonly kind: 'project-management'; readonly projectManagementSessionId: string }
  | { readonly kind: 'settings'; readonly settingsSectionId: string };

export interface DesktopAgentInteractionSurfaceRef {
  readonly kind: 'agent';
  readonly agentViewId: string;
  readonly phase: 'draft' | 'session';
  readonly scope: DesktopAgentScopeProjection;
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
      readonly viewEpoch: number;
    }
  | {
      readonly kind: 'asset-preview';
      readonly assetCenterSessionId: string;
      readonly previewSessionId: string;
    }
  | { readonly kind: 'asset-management'; readonly assetCenterSessionId: string }
  | {
      readonly kind: 'extension-management';
      readonly extensionManagementSessionId: string;
    }
  | { readonly kind: 'extension-detail'; readonly extensionManagementSessionId: string }
  | { readonly kind: 'project-management'; readonly projectManagementSessionId: string }
  | { readonly kind: 'project-detail'; readonly projectManagementSessionId: string }
  | { readonly kind: 'settings-main'; readonly settingsSectionId: string };

export type DesktopWorkbenchManagerSurfaceRef =
  | { readonly kind: 'workspace-resources'; readonly workspaceId: string }
  | { readonly kind: 'settings-navigation'; readonly settingsSectionId: string };

export interface DesktopWorkbenchTimelineSurfaceRef {
  readonly kind: 'workspace-timeline';
  readonly workspaceId: string;
  readonly viewId: string;
  readonly viewEpoch: number;
  readonly ownerId: string;
}

export interface DesktopWorkbenchStatusSurfaceRef {
  readonly kind: 'scene-status';
  readonly sceneId: string;
}

export interface DesktopWorkbenchSceneProjection {
  readonly schemaVersion: typeof DESKTOP_SCENE_CONTRACT_VERSION;
  readonly sceneId: string;
  readonly windowId: string;
  readonly revision: number;
  readonly context: DesktopWorkbenchSceneContext;
  readonly slots: {
    readonly interaction?: DesktopAgentInteractionSurfaceRef;
    readonly main?: DesktopWorkbenchMainSurfaceRef;
    readonly secondaryMain?: DesktopWorkbenchMainSurfaceRef;
    readonly leftManager?: DesktopWorkbenchManagerSurfaceRef;
    readonly rightManager?: DesktopWorkbenchManagerSurfaceRef;
    readonly timeline?: DesktopWorkbenchTimelineSurfaceRef;
    readonly status?: DesktopWorkbenchStatusSurfaceRef;
  };
}

export interface DesktopApplicationSidebarProjection {
  readonly schemaVersion: typeof DESKTOP_APPLICATION_SIDEBAR_CONTRACT_VERSION;
  readonly windowId: string;
  readonly revision: number;
  readonly visible: boolean;
  readonly width: number;
}

export type DesktopSceneTransitionIntent =
  | { readonly kind: 'open-agent-assistant' }
  | { readonly kind: 'open-workspace'; readonly workspaceGrantId: string }
  | { readonly kind: 'open-project-workspace'; readonly projectId: string }
  | { readonly kind: 'open-asset-center' }
  | { readonly kind: 'open-extensions' }
  | { readonly kind: 'open-project-management' }
  | { readonly kind: 'open-settings'; readonly sectionId?: string }
  | { readonly kind: 'restore-conversation'; readonly conversationId: string };

export interface DesktopSceneTransitionRequest {
  readonly schemaVersion: typeof DESKTOP_SCENE_CONTRACT_VERSION;
  readonly requestId: string;
  readonly expectedEndpointEpoch: string;
  readonly windowId: string;
  readonly expectedWindowRevision: number;
  readonly expectedSceneRevision: number;
  readonly intent: DesktopSceneTransitionIntent;
}

export interface DesktopSceneUnavailableDiagnostic {
  readonly code: 'desktop-scene-owner-unavailable';
  readonly severity: 'error';
  readonly message: string;
  readonly metadata: {
    readonly owner: 'workspace-authority' | 'agent-conversation-authority';
    readonly intentKind: 'open-workspace' | 'open-project-workspace' | 'restore-conversation';
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
    requireExactKeys(metadata, ['owner', 'intentKind'], 'Desktop Scene unavailable metadata');
    const owner = metadata['owner'];
    const intentKind = metadata['intentKind'];
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
    return {
      status,
      requestId: requireIdentity(record['requestId'], 'Desktop Scene request'),
      diagnostic: {
        code: 'desktop-scene-owner-unavailable',
        severity: 'error',
        message: requireIdentity(diagnostic['message'], 'Desktop Scene unavailable message'),
        metadata: { owner, intentKind },
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
  readonly schemaVersion: typeof DESKTOP_APPLICATION_SIDEBAR_CONTRACT_VERSION;
  readonly requestId: string;
  readonly expectedEndpointEpoch: string;
  readonly windowId: string;
  readonly expectedSidebarRevision: number;
  readonly visible: boolean;
  readonly width: number;
}

export class DesktopSceneContractError extends Error {
  readonly code:
    | 'invalid-desktop-scene-payload'
    | 'unsupported-desktop-scene-version'
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
    schemaVersion: DESKTOP_APPLICATION_SIDEBAR_CONTRACT_VERSION,
    windowId: requireIdentity(windowId, 'Desktop Sidebar Window'),
    revision: 0,
    visible: true,
    width: DESKTOP_APPLICATION_SIDEBAR_DEFAULT_WIDTH,
  };
}

export function createDefaultDesktopAgentScene(
  windowId: string,
  assistantSpaceId: string,
): DesktopWorkbenchSceneProjection {
  const exactWindowId = requireIdentity(windowId, 'Desktop Scene Window');
  const exactAssistantSpaceId = requireIdentity(assistantSpaceId, 'Assistant Space');
  const sceneId = `scene:${exactWindowId}:agent`;
  const agentViewId = `agent-view:${exactWindowId}`;
  const scope: DesktopAgentScopeProjection = {
    kind: 'assistant',
    assistantSpaceId: exactAssistantSpaceId,
  };
  return {
    schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
    sceneId,
    windowId: exactWindowId,
    revision: 0,
    context: { kind: 'agent', agentViewId, scope },
    slots: {
      interaction: { kind: 'agent', agentViewId, phase: 'draft', scope },
      status: { kind: 'scene-status', sceneId },
    },
  };
}

export function createDesktopSceneTransitionRequest(input: {
  readonly requestId: string;
  readonly expectedEndpointEpoch: string;
  readonly windowId: string;
  readonly expectedWindowRevision: number;
  readonly expectedSceneRevision: number;
  readonly intent: DesktopSceneTransitionIntent;
}): DesktopSceneTransitionRequest {
  return parseDesktopSceneTransitionRequest({
    schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
    ...input,
  });
}

export function createDesktopApplicationSidebarMutationRequest(input: {
  readonly requestId: string;
  readonly expectedEndpointEpoch: string;
  readonly windowId: string;
  readonly expectedSidebarRevision: number;
  readonly visible: boolean;
  readonly width: number;
}): DesktopApplicationSidebarMutationRequest {
  return parseDesktopApplicationSidebarMutationRequest({
    schemaVersion: DESKTOP_APPLICATION_SIDEBAR_CONTRACT_VERSION,
    ...input,
  });
}

export function applyDesktopApplicationSidebarMutation(input: {
  readonly projection: DesktopApplicationSidebarProjection;
  readonly request: DesktopApplicationSidebarMutationRequest;
  readonly endpointEpoch: string;
}): DesktopApplicationSidebarProjection {
  const projection = parseDesktopApplicationSidebarProjection(input.projection);
  const request = parseDesktopApplicationSidebarMutationRequest(input.request);
  const endpointEpoch = requireIdentity(input.endpointEpoch, 'Desktop endpoint epoch');
  if (request.expectedEndpointEpoch !== endpointEpoch) {
    throw stale('Desktop Sidebar mutation endpoint epoch is stale.');
  }
  if (request.windowId !== projection.windowId) {
    throw stale('Desktop Sidebar mutation Window identity does not match its projection.');
  }
  if (request.expectedSidebarRevision !== projection.revision) {
    throw stale(
      `Desktop Sidebar revision ${request.expectedSidebarRevision} is stale; current revision is ${projection.revision}.`,
    );
  }
  return {
    ...projection,
    revision: projection.revision + 1,
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
    ['schemaVersion', 'sceneId', 'windowId', 'revision', 'context', 'slots'],
    'Desktop Workbench Scene projection',
  );
  requireVersion(record['schemaVersion'], DESKTOP_SCENE_CONTRACT_VERSION, 'Scene');
  const projection: DesktopWorkbenchSceneProjection = {
    schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
    sceneId: requireIdentity(record['sceneId'], 'Desktop Scene'),
    windowId: requireIdentity(record['windowId'], 'Desktop Scene Window'),
    revision: requireRevision(record['revision'], 'Desktop Scene revision'),
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
    ['schemaVersion', 'windowId', 'revision', 'visible', 'width'],
    'Desktop Application Sidebar projection',
  );
  requireVersion(
    record['schemaVersion'],
    DESKTOP_APPLICATION_SIDEBAR_CONTRACT_VERSION,
    'Application Sidebar',
  );
  return {
    schemaVersion: DESKTOP_APPLICATION_SIDEBAR_CONTRACT_VERSION,
    windowId: requireIdentity(record['windowId'], 'Desktop Sidebar Window'),
    revision: requireRevision(record['revision'], 'Desktop Sidebar revision'),
    visible: requireBoolean(record['visible'], 'Desktop Sidebar visibility must be boolean.'),
    width: requireSidebarWidth(record['width']),
  };
}

export function parseDesktopSceneTransitionRequest(value: unknown): DesktopSceneTransitionRequest {
  const record = requireRecord(value, 'Desktop Scene transition request must be an object.');
  requireExactKeys(
    record,
    [
      'schemaVersion',
      'requestId',
      'expectedEndpointEpoch',
      'windowId',
      'expectedWindowRevision',
      'expectedSceneRevision',
      'intent',
    ],
    'Desktop Scene transition request',
  );
  requireVersion(record['schemaVersion'], DESKTOP_SCENE_CONTRACT_VERSION, 'Scene');
  return {
    schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
    requestId: requireIdentity(record['requestId'], 'Desktop Scene request'),
    expectedEndpointEpoch: requireIdentity(
      record['expectedEndpointEpoch'],
      'Desktop endpoint epoch',
    ),
    windowId: requireIdentity(record['windowId'], 'Desktop Scene Window'),
    expectedWindowRevision: requireRevision(
      record['expectedWindowRevision'],
      'Desktop Window revision',
    ),
    expectedSceneRevision: requireRevision(
      record['expectedSceneRevision'],
      'Desktop Scene revision',
    ),
    intent: parseSceneTransitionIntent(record['intent']),
  };
}

export function parseDesktopApplicationSidebarMutationRequest(
  value: unknown,
): DesktopApplicationSidebarMutationRequest {
  const record = requireRecord(value, 'Desktop Sidebar mutation request must be an object.');
  requireExactKeys(
    record,
    [
      'schemaVersion',
      'requestId',
      'expectedEndpointEpoch',
      'windowId',
      'expectedSidebarRevision',
      'visible',
      'width',
    ],
    'Desktop Sidebar mutation request',
  );
  requireVersion(
    record['schemaVersion'],
    DESKTOP_APPLICATION_SIDEBAR_CONTRACT_VERSION,
    'Application Sidebar',
  );
  return {
    schemaVersion: DESKTOP_APPLICATION_SIDEBAR_CONTRACT_VERSION,
    requestId: requireIdentity(record['requestId'], 'Desktop Sidebar request'),
    expectedEndpointEpoch: requireIdentity(
      record['expectedEndpointEpoch'],
      'Desktop endpoint epoch',
    ),
    windowId: requireIdentity(record['windowId'], 'Desktop Sidebar Window'),
    expectedSidebarRevision: requireRevision(
      record['expectedSidebarRevision'],
      'Desktop Sidebar revision',
    ),
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
      scope: parseAgentScope(record['scope']),
    };
  }
  if (kind === 'asset-center') {
    requireExactKeys(record, ['kind', 'assetCenterSessionId'], 'Asset Center Scene context');
    return {
      kind,
      assetCenterSessionId: requireIdentity(record['assetCenterSessionId'], 'Asset Center Session'),
    };
  }
  if (kind === 'extensions') {
    requireExactKeys(record, ['kind', 'extensionManagementSessionId'], 'Extensions Scene context');
    return {
      kind,
      extensionManagementSessionId: requireIdentity(
        record['extensionManagementSessionId'],
        'Extension Management Session',
      ),
    };
  }
  if (kind === 'project-management') {
    requireExactKeys(
      record,
      ['kind', 'projectManagementSessionId'],
      'Project Management Scene context',
    );
    return {
      kind,
      projectManagementSessionId: requireIdentity(
        record['projectManagementSessionId'],
        'Project Management Session',
      ),
    };
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

function parseAgentScope(value: unknown): DesktopAgentScopeProjection {
  const record = requireRecord(value, 'Agent scope must be an object.');
  const kind = record['kind'];
  if (kind === 'assistant') {
    requireExactKeys(record, ['kind', 'assistantSpaceId', 'conversationId'], 'Assistant scope', [
      'conversationId',
    ]);
    return {
      kind,
      assistantSpaceId: requireIdentity(record['assistantSpaceId'], 'Assistant Space'),
      ...readConversationId(record),
    };
  }
  if (kind === 'workspace') {
    requireExactKeys(
      record,
      ['kind', 'workspaceId', 'workspaceGrantId', 'conversationId'],
      'Workspace scope',
      ['conversationId'],
    );
    return {
      kind,
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
    ['interaction', 'main', 'secondaryMain', 'leftManager', 'rightManager', 'timeline', 'status'],
    'Desktop Scene slots',
    ['interaction', 'main', 'secondaryMain', 'leftManager', 'rightManager', 'timeline', 'status'],
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
    ...(record['timeline'] === undefined
      ? {}
      : { timeline: parseTimelineSurface(record['timeline']) }),
    ...(record['status'] === undefined ? {} : { status: parseStatusSurface(record['status']) }),
  };
}

function parseInteractionSurface(value: unknown): DesktopAgentInteractionSurfaceRef {
  const record = requireRecord(value, 'Interaction Surface ref must be an object.');
  requireExactKeys(
    record,
    ['kind', 'agentViewId', 'phase', 'scope'],
    'Agent Interaction Surface ref',
  );
  if (record['kind'] !== 'agent') throw unsupported('Interaction slot only accepts Agent Surface.');
  const phase = record['phase'];
  if (phase !== 'draft' && phase !== 'session') {
    throw invalid('Agent Interaction phase must be draft or session.');
  }
  return {
    kind: 'agent',
    agentViewId: requireIdentity(record['agentViewId'], 'Agent View'),
    phase,
    scope: parseAgentScope(record['scope']),
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
      ['kind', 'workspaceId', 'viewId', 'viewEpoch'],
      'Workspace Main Surface ref',
    );
    return {
      kind,
      workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
      viewId: requireIdentity(record['viewId'], 'Workspace View'),
      viewEpoch: requireRevision(record['viewEpoch'], 'Workspace View epoch'),
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
  if (kind === 'extension-management') {
    requireExactKeys(
      record,
      ['kind', 'extensionManagementSessionId'],
      'Extension Management Surface ref',
    );
    return {
      kind,
      extensionManagementSessionId: requireIdentity(
        record['extensionManagementSessionId'],
        'Extension Management Session',
      ),
    };
  }
  if (kind === 'extension-detail') {
    requireExactKeys(
      record,
      ['kind', 'extensionManagementSessionId'],
      'Extension Detail Surface ref',
    );
    return {
      kind,
      extensionManagementSessionId: requireIdentity(
        record['extensionManagementSessionId'],
        'Extension Management Session',
      ),
    };
  }
  if (kind === 'project-detail') {
    requireExactKeys(record, ['kind', 'projectManagementSessionId'], 'Project Detail Surface ref');
    return {
      kind,
      projectManagementSessionId: requireIdentity(
        record['projectManagementSessionId'],
        'Project Management Session',
      ),
    };
  }
  if (kind === 'project-management') {
    requireExactKeys(
      record,
      ['kind', 'projectManagementSessionId'],
      'Project Management Surface ref',
    );
    return {
      kind,
      projectManagementSessionId: requireIdentity(
        record['projectManagementSessionId'],
        'Project Management Session',
      ),
    };
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
  if (kind === 'settings-navigation') {
    requireExactKeys(record, ['kind', 'settingsSectionId'], 'Settings Navigation Surface ref');
    return {
      kind,
      settingsSectionId: requireIdentity(record['settingsSectionId'], 'Settings Section'),
    };
  }
  throw unsupported(`Unknown Manager Surface kind '${String(kind)}'.`);
}

function parseTimelineSurface(value: unknown): DesktopWorkbenchTimelineSurfaceRef {
  const record = requireRecord(value, 'Timeline Surface ref must be an object.');
  requireExactKeys(
    record,
    ['kind', 'workspaceId', 'viewId', 'viewEpoch', 'ownerId'],
    'Workspace Timeline Surface ref',
  );
  if (record['kind'] !== 'workspace-timeline') {
    throw unsupported('Timeline slot only accepts Workspace Timeline Surface.');
  }
  return {
    kind: 'workspace-timeline',
    workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    viewId: requireIdentity(record['viewId'], 'Workspace View'),
    viewEpoch: requireRevision(record['viewEpoch'], 'Workspace View epoch'),
    ownerId: requireIdentity(record['ownerId'], 'Timeline owner'),
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
    kind === 'open-agent-assistant' ||
    kind === 'open-asset-center' ||
    kind === 'open-extensions' ||
    kind === 'open-project-management'
  ) {
    requireExactKeys(record, ['kind'], 'Desktop Scene transition intent');
    return { kind };
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
    requireExactKeys(record, ['kind', 'conversationId'], 'Restore Conversation intent');
    return { kind, conversationId: requireIdentity(record['conversationId'], 'Conversation') };
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
    const expectsSession = context.scope.conversationId !== undefined;
    if ((slots.interaction.phase === 'session') !== expectsSession) {
      throw mismatch('Agent presentation phase does not match Conversation binding.');
    }
    validateAgentMain(context.scope, slots.main);
    validateAgentMain(context.scope, slots.secondaryMain);
    validateAgentManager(context.scope, slots.leftManager);
    validateAgentManager(context.scope, slots.rightManager);
    if (context.scope.kind === 'assistant' && slots.timeline) {
      throw mismatch('Assistant Scene cannot mount a Workspace Timeline.');
    }
    if (
      context.scope.kind === 'workspace' &&
      slots.timeline &&
      slots.timeline.workspaceId !== context.scope.workspaceId
    ) {
      throw mismatch('Workspace Timeline does not match Agent Workspace scope.');
    }
    return;
  }
  if (slots.interaction || slots.timeline) {
    throw mismatch(`${context.kind} Scene cannot mount Agent Interaction or Workspace Timeline.`);
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
  if (context.kind === 'extensions') {
    assertManagerKinds(slots, []);
    assertMainKinds(slots, ['extension-management', 'extension-detail']);
    if (slots.main?.kind !== 'extension-management') {
      throw mismatch('Extensions Scene requires its Extension Management Main Surface.');
    }
    return validateManagementIdentity(
      slots,
      'extensionManagementSessionId',
      context.extensionManagementSessionId,
    );
  }
  if (context.kind === 'project-management') {
    assertManagerKinds(slots, []);
    assertMainKinds(slots, ['project-management', 'project-detail']);
    if (slots.main?.kind !== 'project-management') {
      throw mismatch('Project Management Scene requires its Management Main Surface.');
    }
    return validateManagementIdentity(
      slots,
      'projectManagementSessionId',
      context.projectManagementSessionId,
    );
  }
  assertManagerKinds(slots, ['settings-navigation']);
  assertMainKinds(slots, ['settings-main']);
  validateManagementIdentity(slots, 'settingsSectionId', context.settingsSectionId);
}

function validateAgentMain(
  scope: DesktopAgentScopeProjection,
  ref: DesktopWorkbenchMainSurfaceRef | undefined,
): void {
  if (!ref) return;
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
  key: 'extensionManagementSessionId' | 'projectManagementSessionId' | 'settingsSectionId',
  expected: string,
): void {
  for (const ref of [slots.leftManager, slots.rightManager, slots.main, slots.secondaryMain]) {
    if (ref && readManagementIdentity(ref, key) !== expected) {
      throw mismatch(`Management Surface '${ref.kind}' does not match its Scene identity.`);
    }
  }
}

function readManagementIdentity(
  ref: DesktopWorkbenchMainSurfaceRef | DesktopWorkbenchManagerSurfaceRef,
  key: 'extensionManagementSessionId' | 'projectManagementSessionId' | 'settingsSectionId',
): string | undefined {
  if (key === 'extensionManagementSessionId') {
    return 'extensionManagementSessionId' in ref ? ref.extensionManagementSessionId : undefined;
  }
  if (key === 'projectManagementSessionId') {
    return 'projectManagementSessionId' in ref ? ref.projectManagementSessionId : undefined;
  }
  return 'settingsSectionId' in ref ? ref.settingsSectionId : undefined;
}

function equalAgentScope(
  left: DesktopAgentScopeProjection,
  right: DesktopAgentScopeProjection,
): boolean {
  return (
    left.kind === right.kind &&
    left.conversationId === right.conversationId &&
    (left.kind === 'assistant'
      ? right.kind === 'assistant' && left.assistantSpaceId === right.assistantSpaceId
      : right.kind === 'workspace' &&
        left.workspaceId === right.workspaceId &&
        left.workspaceGrantId === right.workspaceGrantId)
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

function requireRevision(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw invalid(`${label} must be a non-negative integer.`);
  }
  return value as number;
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

function requireVersion(value: unknown, expected: number, label: string): void {
  if (value !== expected) {
    throw new DesktopSceneContractError(
      'unsupported-desktop-scene-version',
      `Unsupported Desktop ${label} contract version '${String(value)}'.`,
    );
  }
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
