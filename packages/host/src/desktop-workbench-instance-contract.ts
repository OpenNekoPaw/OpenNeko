import {
  parseDesktopWorkbenchLayout,
  type DesktopWorkbenchLayoutProjection,
} from './desktop-workbench-contract';
import {
  parseDesktopAgentScopeProjection,
  parseDesktopWorkbenchSceneProjection,
  type DesktopAgentInteractionSurfaceRef,
  type DesktopWorkbenchSceneProjection,
} from './desktop-scene-contract';

export type DesktopWorkbenchInstanceOwner =
  | { readonly kind: 'entry-draft'; readonly draftId: string }
  | { readonly kind: 'assistant-space'; readonly assistantSpaceId: string }
  | { readonly kind: 'workspace'; readonly workspaceId: string }
  | { readonly kind: 'asset-center'; readonly assetCenterSessionId: string }
  | { readonly kind: 'extensions'; readonly extensionManagementSessionId: string }
  | { readonly kind: 'project-management'; readonly projectManagementSessionId: string }
  | { readonly kind: 'settings' };

export type DesktopSurfaceLifecyclePolicy = 'hot-retained' | 'suspendable' | 'ephemeral';

export interface DesktopWorkbenchInstanceProjection {
  readonly workbenchInstanceId: string;
  readonly windowId: string;
  readonly owner: DesktopWorkbenchInstanceOwner;
  readonly layout: DesktopWorkbenchLayoutProjection;
  readonly scene: DesktopWorkbenchSceneProjection;
  readonly activeAgentSurfaceId?: string;
  readonly agentSurfaces: readonly DesktopAgentSurfaceProjection[];
}

export interface DesktopAgentSurfaceProjection {
  readonly agentSurfaceId: string;
  readonly lifecycle: 'hot-retained';
  readonly interaction: DesktopAgentInteractionSurfaceRef;
}

export interface DesktopWorkbenchInstanceDiagnostic {
  readonly code:
    'desktop-workbench-instance-invalid' | 'desktop-workbench-instance-owner-duplicate';
  readonly severity: 'error';
  readonly workbenchInstanceId: string;
  readonly message: string;
}

export interface DesktopWindowWorkbenchCatalogProjection {
  readonly windowId: string;
  readonly activeWorkbenchInstanceId: string;
  readonly instances: readonly DesktopWorkbenchInstanceProjection[];
  readonly diagnostics: readonly DesktopWorkbenchInstanceDiagnostic[];
}

interface DesktopRetainedInvalidWorkbenchInstance {
  readonly record: unknown;
  readonly diagnostic: DesktopWorkbenchInstanceDiagnostic;
}

const RETAINED_INVALID_WORKBENCH_INSTANCES: unique symbol = Symbol(
  'desktop-retained-invalid-workbench-instances',
);

type DesktopWindowWorkbenchCatalogWithRetainedInvalidInstances =
  DesktopWindowWorkbenchCatalogProjection & {
    readonly [RETAINED_INVALID_WORKBENCH_INSTANCES]: readonly DesktopRetainedInvalidWorkbenchInstance[];
  };

export function createDesktopWorkbenchInstance(
  value: DesktopWorkbenchInstanceProjection,
): DesktopWorkbenchInstanceProjection {
  return parseDesktopWorkbenchInstance(value);
}

export function createDesktopWorkbenchInstanceFromScene(input: {
  readonly workbenchInstanceId: string;
  readonly agentSurfaceId?: string;
  readonly layout: DesktopWorkbenchLayoutProjection;
  readonly scene: DesktopWorkbenchSceneProjection;
}): DesktopWorkbenchInstanceProjection {
  const scene = parseDesktopWorkbenchSceneProjection(input.scene);
  const interaction = scene.slots.interaction;
  if ((interaction === undefined) !== (input.agentSurfaceId === undefined)) {
    throw new DesktopWorkbenchInstanceContractError(
      'Desktop Workbench Scene and Agent Surface identity must be provided together.',
    );
  }
  const agentSurfaceId =
    interaction === undefined
      ? undefined
      : requireIdentity(input.agentSurfaceId, 'Desktop Agent Surface');
  return parseDesktopWorkbenchInstance({
    workbenchInstanceId: requireIdentity(input.workbenchInstanceId, 'Desktop Workbench instance'),
    windowId: scene.windowId,
    owner: projectDesktopWorkbenchInstanceOwner(scene),
    layout: input.layout,
    scene,
    ...(agentSurfaceId === undefined ? {} : { activeAgentSurfaceId: agentSurfaceId }),
    agentSurfaces:
      interaction === undefined || agentSurfaceId === undefined
        ? []
        : [{ agentSurfaceId, lifecycle: 'hot-retained', interaction }],
  });
}

export function projectDesktopWorkbenchInstanceOwner(
  sceneValue: DesktopWorkbenchSceneProjection,
): DesktopWorkbenchInstanceOwner {
  const scene = parseDesktopWorkbenchSceneProjection(sceneValue);
  switch (scene.context.kind) {
    case 'agent':
      switch (scene.context.scope.kind) {
        case 'unbound':
          return { kind: 'entry-draft', draftId: scene.context.scope.draftId };
        case 'assistant':
          return {
            kind: 'assistant-space',
            assistantSpaceId: scene.context.scope.assistantSpaceId,
          };
        case 'workspace':
          return { kind: 'workspace', workspaceId: scene.context.scope.workspaceId };
      }
      throw new Error('Unsupported Desktop Agent scope.');
    case 'asset-center':
      return {
        kind: 'asset-center',
        assetCenterSessionId: scene.context.assetCenterSessionId,
      };
    case 'extensions':
      return {
        kind: 'extensions',
        extensionManagementSessionId: scene.context.extensionManagementSessionId,
      };
    case 'project-management':
      return {
        kind: 'project-management',
        projectManagementSessionId: scene.context.projectManagementSessionId,
      };
    case 'settings':
      return { kind: 'settings' };
  }
}

export function activateDesktopWorkbenchInstance(
  catalog: DesktopWindowWorkbenchCatalogProjection,
  workbenchInstanceId: string,
): DesktopWindowWorkbenchCatalogProjection {
  const exactCatalog = requireValidCatalog(catalog);
  const exactWorkbenchInstanceId = requireIdentity(
    workbenchInstanceId,
    'Active Desktop Workbench instance',
  );
  if (
    !exactCatalog.instances.some(
      (instance) => instance.workbenchInstanceId === exactWorkbenchInstanceId,
    )
  ) {
    throw new DesktopWorkbenchInstanceContractError(
      `Desktop Workbench instance '${exactWorkbenchInstanceId}' is unavailable.`,
    );
  }
  return { ...exactCatalog, activeWorkbenchInstanceId: exactWorkbenchInstanceId };
}

export function resolveActiveDesktopWorkbenchInstance(
  catalog: DesktopWindowWorkbenchCatalogProjection,
): DesktopWorkbenchInstanceProjection {
  const exactCatalog = requireValidCatalog(catalog);
  return requireWorkbenchInstance(exactCatalog, exactCatalog.activeWorkbenchInstanceId);
}

export function resolveDesktopWorkbenchInstanceByOwner(
  catalog: DesktopWindowWorkbenchCatalogProjection,
  owner: DesktopWorkbenchInstanceOwner,
): DesktopWorkbenchInstanceProjection | undefined {
  const exactCatalog = requireValidCatalog(catalog);
  const exactOwner = parseOwner(owner);
  return exactCatalog.instances.find(
    (instance) => ownerKey(instance.owner) === ownerKey(exactOwner),
  );
}

export function replaceDesktopWorkbenchInstance(
  catalog: DesktopWindowWorkbenchCatalogProjection,
  instanceValue: DesktopWorkbenchInstanceProjection,
): DesktopWindowWorkbenchCatalogProjection {
  const exactCatalog = requireValidCatalog(catalog);
  const instance = parseDesktopWorkbenchInstance(instanceValue);
  const current = requireWorkbenchInstance(exactCatalog, instance.workbenchInstanceId);
  if (
    instance.windowId !== exactCatalog.windowId ||
    ownerKey(instance.owner) !== ownerKey(current.owner)
  ) {
    throw new DesktopWorkbenchInstanceContractError(
      `Desktop Workbench instance '${instance.workbenchInstanceId}' cannot change its Window or owner.`,
    );
  }
  return requireValidCatalog({
    ...exactCatalog,
    instances: exactCatalog.instances.map((candidate) =>
      candidate.workbenchInstanceId === instance.workbenchInstanceId ? instance : candidate,
    ),
  });
}

export function openOrFocusDesktopWorkbenchInstance(
  catalog: DesktopWindowWorkbenchCatalogProjection,
  instanceValue: DesktopWorkbenchInstanceProjection,
): DesktopWindowWorkbenchCatalogProjection {
  const exactCatalog = requireValidCatalog(catalog);
  const instance = parseDesktopWorkbenchInstance(instanceValue);
  if (instance.windowId !== exactCatalog.windowId) {
    throw new DesktopWorkbenchInstanceContractError(
      `Desktop Workbench instance '${instance.workbenchInstanceId}' belongs to another Window.`,
    );
  }
  const existing = exactCatalog.instances.find(
    (candidate) => ownerKey(candidate.owner) === ownerKey(instance.owner),
  );
  if (existing) {
    if (existing.workbenchInstanceId !== instance.workbenchInstanceId) {
      throw new DesktopWorkbenchInstanceContractError(
        `Desktop Workbench owner '${ownerKey(instance.owner)}' is already open as '${existing.workbenchInstanceId}'.`,
      );
    }
    return { ...exactCatalog, activeWorkbenchInstanceId: existing.workbenchInstanceId };
  }
  return requireValidCatalog({
    ...exactCatalog,
    activeWorkbenchInstanceId: instance.workbenchInstanceId,
    instances: [...exactCatalog.instances, instance],
  });
}

export function putDesktopAgentSurface(input: {
  readonly catalog: DesktopWindowWorkbenchCatalogProjection;
  readonly workbenchInstanceId: string;
  readonly surface: DesktopAgentSurfaceProjection;
  readonly scene: DesktopWorkbenchSceneProjection;
}): DesktopWindowWorkbenchCatalogProjection {
  const exactCatalog = requireValidCatalog(input.catalog);
  const workbenchInstanceId = requireIdentity(
    input.workbenchInstanceId,
    'Desktop Workbench instance',
  );
  const surface = parseAgentSurface(input.surface);
  const scene = parseDesktopWorkbenchSceneProjection(input.scene);
  const instance = requireWorkbenchInstance(exactCatalog, workbenchInstanceId);
  assertAgentSurfaceOwner(instance.owner, surface, workbenchInstanceId);
  const conversationId = readAgentConversationId(surface.interaction);
  const conversationSurface =
    conversationId === undefined
      ? undefined
      : instance.agentSurfaces.find(
          (candidate) => readAgentConversationId(candidate.interaction) === conversationId,
        );
  if (conversationSurface && conversationSurface.agentSurfaceId !== surface.agentSurfaceId) {
    throw new DesktopWorkbenchInstanceContractError(
      `Agent Conversation '${conversationId}' is already open as Surface '${conversationSurface.agentSurfaceId}'.`,
    );
  }
  const surfaceIndex = instance.agentSurfaces.findIndex(
    (candidate) => candidate.agentSurfaceId === surface.agentSurfaceId,
  );
  const agentSurfaces = [...instance.agentSurfaces];
  if (surfaceIndex === -1) agentSurfaces.push(surface);
  else agentSurfaces[surfaceIndex] = surface;
  const nextInstance = parseDesktopWorkbenchInstance({
    ...instance,
    scene,
    activeAgentSurfaceId: surface.agentSurfaceId,
    agentSurfaces,
  });
  return requireValidCatalog({
    ...exactCatalog,
    activeWorkbenchInstanceId: workbenchInstanceId,
    instances: exactCatalog.instances.map((candidate) =>
      candidate.workbenchInstanceId === workbenchInstanceId ? nextInstance : candidate,
    ),
  });
}

export function handoffDesktopAgentSurface(input: {
  readonly catalog: DesktopWindowWorkbenchCatalogProjection;
  readonly sourceWorkbenchInstanceId: string;
  readonly agentSurfaceId: string;
  readonly targetScene: DesktopWorkbenchSceneProjection;
  readonly targetLayout?: DesktopWorkbenchLayoutProjection;
}): DesktopWindowWorkbenchCatalogProjection {
  const exactCatalog = requireValidCatalog(input.catalog);
  const sourceWorkbenchInstanceId = requireIdentity(
    input.sourceWorkbenchInstanceId,
    'Source Desktop Workbench instance',
  );
  const agentSurfaceId = requireIdentity(input.agentSurfaceId, 'Desktop Agent Surface');
  const targetScene = parseDesktopWorkbenchSceneProjection(input.targetScene);
  const targetInteraction = targetScene.slots.interaction;
  if (!targetInteraction) {
    throw new DesktopWorkbenchInstanceContractError(
      'Desktop Agent Surface handoff requires a target Agent interaction.',
    );
  }
  const source = requireWorkbenchInstance(exactCatalog, sourceWorkbenchInstanceId);
  const sourceSurface = source.agentSurfaces.find(
    (surface) => surface.agentSurfaceId === agentSurfaceId,
  );
  if (!sourceSurface || source.activeAgentSurfaceId !== agentSurfaceId) {
    throw new DesktopWorkbenchInstanceContractError(
      `Desktop Agent Surface '${agentSurfaceId}' is not the active Surface of Workbench '${sourceWorkbenchInstanceId}'.`,
    );
  }
  if (
    sourceSurface.interaction.scope.draftId !== targetInteraction.scope.draftId ||
    sourceSurface.interaction.phase !== 'draft'
  ) {
    throw new DesktopWorkbenchInstanceContractError(
      `Desktop Agent Surface '${agentSurfaceId}' cannot hand off a different or committed draft.`,
    );
  }
  if (source.agentSurfaces.length !== 1) {
    throw new DesktopWorkbenchInstanceContractError(
      `Desktop Workbench '${sourceWorkbenchInstanceId}' cannot hand off while it owns sibling Agent Surfaces.`,
    );
  }

  const targetOwner = projectDesktopWorkbenchInstanceOwner(targetScene);
  const target = resolveDesktopWorkbenchInstanceByOwner(exactCatalog, targetOwner);
  const nextSurface: DesktopAgentSurfaceProjection = {
    ...sourceSurface,
    interaction: targetInteraction,
  };
  if (!target || target.workbenchInstanceId === sourceWorkbenchInstanceId) {
    const handedOff = parseDesktopWorkbenchInstance({
      ...source,
      owner: targetOwner,
      layout: input.targetLayout ?? source.layout,
      scene: targetScene,
      activeAgentSurfaceId: agentSurfaceId,
      agentSurfaces: [nextSurface],
    });
    return requireValidCatalog({
      ...exactCatalog,
      activeWorkbenchInstanceId: handedOff.workbenchInstanceId,
      instances: exactCatalog.instances.map((candidate) =>
        candidate.workbenchInstanceId === sourceWorkbenchInstanceId ? handedOff : candidate,
      ),
    });
  }

  const withoutSource = requireValidCatalog({
    ...exactCatalog,
    activeWorkbenchInstanceId: target.workbenchInstanceId,
    instances: exactCatalog.instances.filter(
      (candidate) => candidate.workbenchInstanceId !== sourceWorkbenchInstanceId,
    ),
  });
  const targetCatalog = input.targetLayout
    ? replaceDesktopWorkbenchInstance(withoutSource, { ...target, layout: input.targetLayout })
    : withoutSource;
  return putDesktopAgentSurface({
    catalog: targetCatalog,
    workbenchInstanceId: target.workbenchInstanceId,
    surface: nextSurface,
    scene: targetScene,
  });
}

export function closeDesktopWorkbenchInstance(
  catalog: DesktopWindowWorkbenchCatalogProjection,
  workbenchInstanceId: string,
  nextActiveWorkbenchInstanceId?: string,
): DesktopWindowWorkbenchCatalogProjection {
  const exactCatalog = requireValidCatalog(catalog);
  const exactWorkbenchInstanceId = requireIdentity(
    workbenchInstanceId,
    'Desktop Workbench instance',
  );
  requireWorkbenchInstance(exactCatalog, exactWorkbenchInstanceId);
  const instances = exactCatalog.instances.filter(
    (candidate) => candidate.workbenchInstanceId !== exactWorkbenchInstanceId,
  );
  if (instances.length === 0) {
    throw new DesktopWorkbenchInstanceContractError(
      'Desktop Window cannot close its final Workbench instance without an explicit Window teardown.',
    );
  }
  const closesActive = exactCatalog.activeWorkbenchInstanceId === exactWorkbenchInstanceId;
  if (!closesActive && nextActiveWorkbenchInstanceId !== undefined) {
    throw new DesktopWorkbenchInstanceContractError(
      'Closing an inactive Desktop Workbench cannot replace the active Workbench.',
    );
  }
  const activeWorkbenchInstanceId = closesActive
    ? requireIdentity(nextActiveWorkbenchInstanceId, 'Next active Desktop Workbench instance')
    : exactCatalog.activeWorkbenchInstanceId;
  if (!instances.some((instance) => instance.workbenchInstanceId === activeWorkbenchInstanceId)) {
    throw new DesktopWorkbenchInstanceContractError(
      `Next Desktop Workbench instance '${activeWorkbenchInstanceId}' is unavailable.`,
    );
  }
  return requireValidCatalog({
    ...exactCatalog,
    activeWorkbenchInstanceId,
    instances,
  });
}

export function closeDesktopAgentSurface(input: {
  readonly catalog: DesktopWindowWorkbenchCatalogProjection;
  readonly workbenchInstanceId: string;
  readonly agentSurfaceId: string;
  readonly nextActiveAgentSurfaceId?: string;
  readonly scene?: DesktopWorkbenchSceneProjection;
}): DesktopWindowWorkbenchCatalogProjection {
  const exactCatalog = requireValidCatalog(input.catalog);
  const workbenchInstanceId = requireIdentity(
    input.workbenchInstanceId,
    'Desktop Workbench instance',
  );
  const agentSurfaceId = requireIdentity(input.agentSurfaceId, 'Desktop Agent Surface');
  const instance = requireWorkbenchInstance(exactCatalog, workbenchInstanceId);
  if (!instance.agentSurfaces.some((surface) => surface.agentSurfaceId === agentSurfaceId)) {
    throw new DesktopWorkbenchInstanceContractError(
      `Desktop Agent Surface '${agentSurfaceId}' is unavailable in Workbench '${workbenchInstanceId}'.`,
    );
  }
  const agentSurfaces = instance.agentSurfaces.filter(
    (surface) => surface.agentSurfaceId !== agentSurfaceId,
  );
  if (agentSurfaces.length === 0) {
    throw new DesktopWorkbenchInstanceContractError(
      `Desktop Workbench '${workbenchInstanceId}' cannot close its final Agent Surface without an explicit replacement or Workbench close.`,
    );
  }
  const closesActive = instance.activeAgentSurfaceId === agentSurfaceId;
  if (
    !closesActive &&
    (input.nextActiveAgentSurfaceId !== undefined || input.scene !== undefined)
  ) {
    throw new DesktopWorkbenchInstanceContractError(
      'Closing an inactive Desktop Agent Surface cannot replace the active Scene.',
    );
  }
  let nextInstance: DesktopWorkbenchInstanceProjection;
  if (closesActive) {
    const nextActiveAgentSurfaceId = requireIdentity(
      input.nextActiveAgentSurfaceId,
      'Next active Desktop Agent Surface',
    );
    if (!agentSurfaces.some((surface) => surface.agentSurfaceId === nextActiveAgentSurfaceId)) {
      throw new DesktopWorkbenchInstanceContractError(
        `Next Desktop Agent Surface '${nextActiveAgentSurfaceId}' is unavailable in Workbench '${workbenchInstanceId}'.`,
      );
    }
    if (input.scene === undefined) {
      throw new DesktopWorkbenchInstanceContractError(
        'Closing the active Desktop Agent Surface requires its exact replacement Scene.',
      );
    }
    nextInstance = parseDesktopWorkbenchInstance({
      ...instance,
      scene: input.scene,
      activeAgentSurfaceId: nextActiveAgentSurfaceId,
      agentSurfaces,
    });
  } else {
    nextInstance = parseDesktopWorkbenchInstance({ ...instance, agentSurfaces });
  }
  return requireValidCatalog({
    ...exactCatalog,
    instances: exactCatalog.instances.map((candidate) =>
      candidate.workbenchInstanceId === workbenchInstanceId ? nextInstance : candidate,
    ),
  });
}

export function parseDesktopWindowWorkbenchCatalog(
  value: unknown,
): DesktopWindowWorkbenchCatalogProjection {
  const record = requireRecord(value, 'Desktop Window Workbench catalog must be an object.');
  requireExactKeys(
    record,
    Object.hasOwn(record, 'diagnostics')
      ? ['windowId', 'activeWorkbenchInstanceId', 'instances', 'diagnostics']
      : ['windowId', 'activeWorkbenchInstanceId', 'instances'],
    'Desktop Window Workbench catalog',
  );
  const windowId = requireIdentity(record['windowId'], 'Desktop Window');
  const activeWorkbenchInstanceId = requireIdentity(
    record['activeWorkbenchInstanceId'],
    'Active Desktop Workbench instance',
  );
  const instances: DesktopWorkbenchInstanceProjection[] = [];
  const diagnostics = Object.hasOwn(record, 'diagnostics')
    ? requireArray(
        record['diagnostics'],
        'Desktop Window Workbench diagnostics must be an array.',
      ).map(parseWorkbenchInstanceDiagnostic)
    : [];
  const instanceIds = new Set<string>();
  const ownerKeys = new Set<string>();
  const retainedInvalidInstances = [...readRetainedInvalidWorkbenchInstances(value)];

  for (const candidate of requireArray(
    record['instances'],
    'Desktop Window Workbench instances must be an array.',
  )) {
    const candidateId = readCandidateIdentity(candidate);
    let instance: DesktopWorkbenchInstanceProjection;
    try {
      instance = parseDesktopWorkbenchInstance(candidate);
    } catch (error) {
      const diagnostic: DesktopWorkbenchInstanceDiagnostic = {
        code: 'desktop-workbench-instance-invalid',
        severity: 'error',
        workbenchInstanceId: candidateId,
        message: error instanceof Error ? error.message : String(error),
      };
      diagnostics.push(diagnostic);
      retainedInvalidInstances.push({ record: candidate, diagnostic });
      continue;
    }
    if (instance.windowId !== windowId) {
      const diagnostic: DesktopWorkbenchInstanceDiagnostic = {
        code: 'desktop-workbench-instance-invalid',
        severity: 'error',
        workbenchInstanceId: instance.workbenchInstanceId,
        message: `Desktop Workbench instance '${instance.workbenchInstanceId}' belongs to another Window.`,
      };
      diagnostics.push(diagnostic);
      retainedInvalidInstances.push({ record: candidate, diagnostic });
      continue;
    }
    if (instanceIds.has(instance.workbenchInstanceId)) {
      const diagnostic: DesktopWorkbenchInstanceDiagnostic = {
        code: 'desktop-workbench-instance-invalid',
        severity: 'error',
        workbenchInstanceId: instance.workbenchInstanceId,
        message: `Desktop Workbench instance '${instance.workbenchInstanceId}' is duplicated.`,
      };
      diagnostics.push(diagnostic);
      retainedInvalidInstances.push({ record: candidate, diagnostic });
      continue;
    }
    const key = ownerKey(instance.owner);
    if (ownerKeys.has(key)) {
      const diagnostic: DesktopWorkbenchInstanceDiagnostic = {
        code: 'desktop-workbench-instance-owner-duplicate',
        severity: 'error',
        workbenchInstanceId: instance.workbenchInstanceId,
        message: `Desktop Workbench owner '${key}' already has an open instance in Window '${windowId}'.`,
      };
      diagnostics.push(diagnostic);
      retainedInvalidInstances.push({ record: candidate, diagnostic });
      continue;
    }
    instanceIds.add(instance.workbenchInstanceId);
    ownerKeys.add(key);
    instances.push(instance);
  }

  if (!instanceIds.has(activeWorkbenchInstanceId)) {
    throw new DesktopWorkbenchInstanceContractError(
      `Desktop Window active Workbench instance '${activeWorkbenchInstanceId}' is unavailable.`,
    );
  }
  const catalog: DesktopWindowWorkbenchCatalogProjection = {
    windowId,
    activeWorkbenchInstanceId,
    instances,
    diagnostics,
  };
  if (retainedInvalidInstances.length === 0) return catalog;
  const retainedCatalog: DesktopWindowWorkbenchCatalogWithRetainedInvalidInstances = {
    ...catalog,
    [RETAINED_INVALID_WORKBENCH_INSTANCES]: retainedInvalidInstances,
  };
  return retainedCatalog;
}

export function serializeDesktopWindowWorkbenchCatalog(
  value: DesktopWindowWorkbenchCatalogProjection,
): unknown {
  const catalog = parseDesktopWindowWorkbenchCatalog(value);
  return {
    windowId: catalog.windowId,
    activeWorkbenchInstanceId: catalog.activeWorkbenchInstanceId,
    instances: [
      ...catalog.instances,
      ...readRetainedInvalidWorkbenchInstances(catalog).map((invalid) => invalid.record),
    ],
  };
}

function parseWorkbenchInstanceDiagnostic(value: unknown): DesktopWorkbenchInstanceDiagnostic {
  const record = requireRecord(value, 'Desktop Workbench instance diagnostic must be an object.');
  requireExactKeys(
    record,
    ['code', 'severity', 'workbenchInstanceId', 'message'],
    'Desktop Workbench instance diagnostic',
  );
  if (
    record['code'] !== 'desktop-workbench-instance-invalid' &&
    record['code'] !== 'desktop-workbench-instance-owner-duplicate'
  ) {
    throw new DesktopWorkbenchInstanceContractError(
      `Unknown Desktop Workbench instance diagnostic '${String(record['code'])}'.`,
    );
  }
  if (record['severity'] !== 'error') {
    throw new DesktopWorkbenchInstanceContractError(
      'Desktop Workbench instance diagnostic severity must be error.',
    );
  }
  return {
    code: record['code'],
    severity: 'error',
    workbenchInstanceId: requireIdentity(
      record['workbenchInstanceId'],
      'Desktop Workbench diagnostic instance',
    ),
    message: requireIdentity(record['message'], 'Desktop Workbench diagnostic message'),
  };
}

export function parseDesktopWorkbenchInstance(value: unknown): DesktopWorkbenchInstanceProjection {
  const record = requireRecord(value, 'Desktop Workbench instance must be an object.');
  requireExactKeys(
    record,
    Object.hasOwn(record, 'activeAgentSurfaceId')
      ? [
          'workbenchInstanceId',
          'windowId',
          'owner',
          'layout',
          'scene',
          'activeAgentSurfaceId',
          'agentSurfaces',
        ]
      : ['workbenchInstanceId', 'windowId', 'owner', 'layout', 'scene', 'agentSurfaces'],
    'Desktop Workbench instance',
  );
  const workbenchInstanceId = requireIdentity(
    record['workbenchInstanceId'],
    'Desktop Workbench instance',
  );
  const windowId = requireIdentity(record['windowId'], 'Desktop Window');
  const owner = parseOwner(record['owner']);
  const layout = parseDesktopWorkbenchLayout(record['layout']);
  const scene = parseDesktopWorkbenchSceneProjection(record['scene']);
  if (layout.windowId !== windowId || scene.windowId !== windowId) {
    throw new DesktopWorkbenchInstanceContractError(
      `Desktop Workbench instance '${workbenchInstanceId}' contains a cross-Window layout or Scene.`,
    );
  }
  assertSceneOwner(owner, scene, workbenchInstanceId);

  const agentSurfaces = requireArray(
    record['agentSurfaces'],
    'Desktop Workbench Agent Surfaces must be an array.',
  ).map(parseAgentSurface);
  const agentSurfaceIds = new Set(agentSurfaces.map((surface) => surface.agentSurfaceId));
  if (agentSurfaceIds.size !== agentSurfaces.length) {
    throw new DesktopWorkbenchInstanceContractError(
      `Desktop Workbench instance '${workbenchInstanceId}' contains duplicate Agent Surface identities.`,
    );
  }
  for (const surface of agentSurfaces) {
    assertAgentSurfaceOwner(owner, surface, workbenchInstanceId);
  }
  const activeAgentSurfaceId = readOptionalIdentity(
    record['activeAgentSurfaceId'],
    'Active Desktop Agent Surface',
  );
  if (activeAgentSurfaceId !== undefined && !agentSurfaceIds.has(activeAgentSurfaceId)) {
    throw new DesktopWorkbenchInstanceContractError(
      `Desktop Workbench instance '${workbenchInstanceId}' active Agent Surface is unavailable.`,
    );
  }
  const interaction = scene.slots.interaction;
  const activeAgentSurface = agentSurfaces.find(
    (surface) => surface.agentSurfaceId === activeAgentSurfaceId,
  );
  if (
    (activeAgentSurfaceId === undefined) !== (interaction === undefined) ||
    (activeAgentSurface !== undefined &&
      !sameInteraction(activeAgentSurface.interaction, interaction))
  ) {
    throw new DesktopWorkbenchInstanceContractError(
      `Desktop Workbench instance '${workbenchInstanceId}' Scene must project its active Agent Surface.`,
    );
  }
  return {
    workbenchInstanceId,
    windowId,
    owner,
    layout,
    scene,
    ...(activeAgentSurfaceId === undefined ? {} : { activeAgentSurfaceId }),
    agentSurfaces,
  };
}

export class DesktopWorkbenchInstanceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesktopWorkbenchInstanceContractError';
  }
}

function parseOwner(value: unknown): DesktopWorkbenchInstanceOwner {
  const record = requireRecord(value, 'Desktop Workbench owner must be an object.');
  switch (record['kind']) {
    case 'entry-draft':
      requireExactKeys(record, ['kind', 'draftId'], 'Entry Draft Workbench owner');
      return { kind: 'entry-draft', draftId: requireIdentity(record['draftId'], 'Agent draft') };
    case 'assistant-space':
      requireExactKeys(record, ['kind', 'assistantSpaceId'], 'Assistant Workbench owner');
      return {
        kind: 'assistant-space',
        assistantSpaceId: requireIdentity(record['assistantSpaceId'], 'Assistant Space'),
      };
    case 'workspace':
      requireExactKeys(record, ['kind', 'workspaceId'], 'Workspace Workbench owner');
      return {
        kind: 'workspace',
        workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
      };
    case 'asset-center':
      requireExactKeys(record, ['kind', 'assetCenterSessionId'], 'Asset Center Workbench owner');
      return {
        kind: 'asset-center',
        assetCenterSessionId: requireIdentity(
          record['assetCenterSessionId'],
          'Asset Center session',
        ),
      };
    case 'extensions':
      requireExactKeys(
        record,
        ['kind', 'extensionManagementSessionId'],
        'Extensions Workbench owner',
      );
      return {
        kind: 'extensions',
        extensionManagementSessionId: requireIdentity(
          record['extensionManagementSessionId'],
          'Extension management session',
        ),
      };
    case 'project-management':
      requireExactKeys(
        record,
        ['kind', 'projectManagementSessionId'],
        'Project Management Workbench owner',
      );
      return {
        kind: 'project-management',
        projectManagementSessionId: requireIdentity(
          record['projectManagementSessionId'],
          'Project management session',
        ),
      };
    case 'settings':
      requireExactKeys(record, ['kind'], 'Settings Workbench owner');
      return { kind: 'settings' };
    default:
      throw new DesktopWorkbenchInstanceContractError('Desktop Workbench owner kind is invalid.');
  }
}

function parseAgentSurface(value: unknown): DesktopAgentSurfaceProjection {
  const record = requireRecord(value, 'Desktop Agent Surface must be an object.');
  requireExactKeys(record, ['agentSurfaceId', 'lifecycle', 'interaction'], 'Desktop Agent Surface');
  if (record['lifecycle'] !== 'hot-retained') {
    throw new DesktopWorkbenchInstanceContractError(
      'Desktop Agent Surface lifecycle must be hot-retained.',
    );
  }
  const interactionRecord = requireRecord(
    record['interaction'],
    'Desktop Agent Surface interaction must be an object.',
  );
  requireExactKeys(
    interactionRecord,
    ['kind', 'agentViewId', 'phase', 'scope'],
    'Desktop Agent Surface interaction',
  );
  if (interactionRecord['kind'] !== 'agent') {
    throw new DesktopWorkbenchInstanceContractError(
      'Desktop Agent Surface interaction kind is invalid.',
    );
  }
  return {
    agentSurfaceId: requireIdentity(record['agentSurfaceId'], 'Desktop Agent Surface'),
    lifecycle: 'hot-retained',
    interaction: {
      kind: 'agent',
      agentViewId: requireIdentity(interactionRecord['agentViewId'], 'Desktop Agent View'),
      phase: requireOneOf(
        interactionRecord['phase'],
        ['draft', 'session'] as const,
        'Desktop Agent phase',
      ),
      scope: parseDesktopAgentScopeProjection(interactionRecord['scope']),
    },
  };
}

function assertSceneOwner(
  owner: DesktopWorkbenchInstanceOwner,
  scene: DesktopWorkbenchSceneProjection,
  workbenchInstanceId: string,
): void {
  const matches =
    (owner.kind === 'entry-draft' &&
      scene.context.kind === 'agent' &&
      scene.context.scope.kind === 'unbound' &&
      scene.context.scope.draftId === owner.draftId) ||
    (owner.kind === 'assistant-space' &&
      scene.context.kind === 'agent' &&
      scene.context.scope.kind === 'assistant' &&
      scene.context.scope.assistantSpaceId === owner.assistantSpaceId) ||
    (owner.kind === 'workspace' &&
      scene.context.kind === 'agent' &&
      scene.context.scope.kind === 'workspace' &&
      scene.context.scope.workspaceId === owner.workspaceId) ||
    (owner.kind === 'asset-center' &&
      scene.context.kind === 'asset-center' &&
      scene.context.assetCenterSessionId === owner.assetCenterSessionId) ||
    (owner.kind === 'extensions' &&
      scene.context.kind === 'extensions' &&
      scene.context.extensionManagementSessionId === owner.extensionManagementSessionId) ||
    (owner.kind === 'project-management' &&
      scene.context.kind === 'project-management' &&
      scene.context.projectManagementSessionId === owner.projectManagementSessionId) ||
    (owner.kind === 'settings' && scene.context.kind === 'settings');
  if (!matches) {
    throw new DesktopWorkbenchInstanceContractError(
      `Desktop Workbench instance '${workbenchInstanceId}' Scene does not match its owner.`,
    );
  }
}

function assertAgentSurfaceOwner(
  owner: DesktopWorkbenchInstanceOwner,
  surface: DesktopAgentSurfaceProjection,
  workbenchInstanceId: string,
): void {
  const matches =
    (owner.kind === 'entry-draft' &&
      surface.interaction.scope.kind === 'unbound' &&
      surface.interaction.scope.draftId === owner.draftId) ||
    (owner.kind === 'assistant-space' &&
      surface.interaction.scope.kind === 'assistant' &&
      surface.interaction.scope.assistantSpaceId === owner.assistantSpaceId) ||
    (owner.kind === 'workspace' &&
      surface.interaction.scope.kind === 'workspace' &&
      surface.interaction.scope.workspaceId === owner.workspaceId);
  if (!matches) {
    throw new DesktopWorkbenchInstanceContractError(
      `Desktop Agent Surface '${surface.agentSurfaceId}' does not match Workbench '${workbenchInstanceId}' owner.`,
    );
  }
}

function sameInteraction(
  left: DesktopAgentInteractionSurfaceRef,
  right: DesktopAgentInteractionSurfaceRef | undefined,
): boolean {
  return (
    right !== undefined &&
    left.agentViewId === right.agentViewId &&
    left.phase === right.phase &&
    sameAgentScope(left.scope, right.scope)
  );
}

function sameAgentScope(
  left: DesktopAgentInteractionSurfaceRef['scope'],
  right: DesktopAgentInteractionSurfaceRef['scope'],
): boolean {
  if (left.kind !== right.kind || left.draftId !== right.draftId) return false;
  if (left.kind === 'unbound' || right.kind === 'unbound') return true;
  if (left.kind === 'assistant' && right.kind === 'assistant') {
    return (
      left.assistantSpaceId === right.assistantSpaceId &&
      left.conversationId === right.conversationId
    );
  }
  return (
    left.kind === 'workspace' &&
    right.kind === 'workspace' &&
    left.workspaceId === right.workspaceId &&
    left.workspaceGrantId === right.workspaceGrantId &&
    left.conversationId === right.conversationId
  );
}

function readAgentConversationId(
  interaction: DesktopAgentInteractionSurfaceRef,
): string | undefined {
  return interaction.scope.kind === 'unbound' ? undefined : interaction.scope.conversationId;
}

function requireValidCatalog(
  value: DesktopWindowWorkbenchCatalogProjection,
): DesktopWindowWorkbenchCatalogProjection {
  return parseDesktopWindowWorkbenchCatalog(value);
}

function readRetainedInvalidWorkbenchInstances(
  value: unknown,
): readonly DesktopRetainedInvalidWorkbenchInstance[] {
  if (!isRecord(value) || !(RETAINED_INVALID_WORKBENCH_INSTANCES in value)) return [];
  const retained = value[RETAINED_INVALID_WORKBENCH_INSTANCES];
  if (!Array.isArray(retained)) {
    throw new DesktopWorkbenchInstanceContractError(
      'Desktop retained invalid Workbench instances must be an array.',
    );
  }
  return retained.map((candidate) => {
    if (!isRetainedInvalidWorkbenchInstance(candidate)) {
      throw new DesktopWorkbenchInstanceContractError(
        'Desktop retained invalid Workbench instance is invalid.',
      );
    }
    return candidate;
  });
}

function isRetainedInvalidWorkbenchInstance(
  value: unknown,
): value is DesktopRetainedInvalidWorkbenchInstance {
  if (!isRecord(value)) return false;
  const diagnostic = value['diagnostic'];
  return 'record' in value && isRecord(diagnostic) && isWorkbenchInstanceDiagnostic(diagnostic);
}

function isWorkbenchInstanceDiagnostic(value: Readonly<Record<string, unknown>>): boolean {
  return (
    (value['code'] === 'desktop-workbench-instance-invalid' ||
      value['code'] === 'desktop-workbench-instance-owner-duplicate') &&
    value['severity'] === 'error' &&
    typeof value['workbenchInstanceId'] === 'string' &&
    value['workbenchInstanceId'].trim().length > 0 &&
    typeof value['message'] === 'string' &&
    value['message'].trim().length > 0
  );
}

function requireWorkbenchInstance(
  catalog: DesktopWindowWorkbenchCatalogProjection,
  workbenchInstanceId: string,
): DesktopWorkbenchInstanceProjection {
  const instance = catalog.instances.find(
    (candidate) => candidate.workbenchInstanceId === workbenchInstanceId,
  );
  if (!instance) {
    throw new DesktopWorkbenchInstanceContractError(
      `Desktop Workbench instance '${workbenchInstanceId}' is unavailable.`,
    );
  }
  return instance;
}

function ownerKey(owner: DesktopWorkbenchInstanceOwner): string {
  switch (owner.kind) {
    case 'entry-draft':
      return `${owner.kind}:${owner.draftId}`;
    case 'assistant-space':
      return `${owner.kind}:${owner.assistantSpaceId}`;
    case 'workspace':
      return `${owner.kind}:${owner.workspaceId}`;
    case 'asset-center':
      return `${owner.kind}:${owner.assetCenterSessionId}`;
    case 'extensions':
      return `${owner.kind}:${owner.extensionManagementSessionId}`;
    case 'project-management':
      return `${owner.kind}:${owner.projectManagementSessionId}`;
    case 'settings':
      return owner.kind;
  }
}

function readCandidateIdentity(value: unknown): string {
  if (isRecord(value) && typeof value['workbenchInstanceId'] === 'string') {
    return value['workbenchInstanceId'];
  }
  return 'unknown-workbench-instance';
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new DesktopWorkbenchInstanceContractError(message);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireArray(value: unknown, message: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new DesktopWorkbenchInstanceContractError(message);
  return value;
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DesktopWorkbenchInstanceContractError(`${label} identity is required.`);
  }
  return value;
}

function readOptionalIdentity(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : requireIdentity(value, label);
}

function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new DesktopWorkbenchInstanceContractError(`${label} is invalid.`);
  }
  return match;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new DesktopWorkbenchInstanceContractError(`${label} contains unexpected fields.`);
  }
}
