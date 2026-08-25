import { parseWorldActionIntent, type WorldActionIntent } from './world';
import {
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireJsonValue,
  requireNonNegativeInteger,
  requireString,
  requireUniqueIdentities,
  type WorldJsonValue,
} from './codec';

export const WORLD_RUNTIME_HOST_CHANNEL = 'neko:world:runtime' as const;

export interface WorldRuntimeBinding {
  readonly worldProjectId: string;
  readonly worldVersionId: string;
  readonly worldRunId: string;
  readonly worldSaveId: string;
  readonly branchId: string;
  readonly participantId: string;
  readonly actorId?: string;
}

export interface WorldRuntimeLaunch {
  readonly worldProjectId: string;
  readonly worldVersionId: string;
  readonly worldRunId: string;
  readonly worldSaveId: string;
  readonly branchId: string;
  readonly saveLabel: string;
  readonly participantId: string;
  readonly actorId?: string;
}

export interface WorldRuntimeProjection {
  readonly binding: WorldRuntimeBinding;
  readonly status: 'ready';
  readonly background: string;
  readonly locations: readonly {
    readonly definitionId: string;
    readonly name: string;
    readonly description: string;
  }[];
  readonly facts: readonly {
    readonly factId: string;
    readonly key: string;
    readonly value: WorldJsonValue;
  }[];
  readonly availableActions: readonly string[];
  readonly participants: readonly { readonly participantId: string; readonly actorId?: string }[];
  readonly worldStateRevision: number;
  readonly timepoint: number;
  readonly branches: readonly {
    readonly branchId: string;
    readonly active: boolean;
    readonly parentBranchId?: string;
    readonly eventCount: number;
  }[];
  readonly timeline: readonly {
    readonly worldEventId: string;
    readonly actorId: string;
    readonly action: string;
    readonly timepoint: number;
    readonly committedAt: string;
  }[];
  readonly diagnostics: readonly { readonly code: string; readonly message: string }[];
}

export type WorldRuntimeHostRequest =
  | {
      readonly requestId: string;
      readonly rendererSessionId: string;
      readonly windowId: string;
      readonly operation: 'runtime-launch';
      readonly launch: WorldRuntimeLaunch;
    }
  | {
      readonly requestId: string;
      readonly rendererSessionId: string;
      readonly windowId: string;
      readonly operation: 'runtime-snapshot-get';
      readonly binding: WorldRuntimeBinding;
    }
  | {
      readonly requestId: string;
      readonly rendererSessionId: string;
      readonly windowId: string;
      readonly operation: 'runtime-action-submit';
      readonly binding: WorldRuntimeBinding;
      readonly intent: WorldActionIntent;
    };

export interface WorldRuntimeHostResult {
  readonly requestId: string;
  readonly projection: WorldRuntimeProjection;
}

export interface OpenNekoDesktopWorldRuntimeBridge {
  readonly worldRuntime: {
    launch(windowId: string, launch: WorldRuntimeLaunch): Promise<WorldRuntimeProjection>;
    getSnapshot(windowId: string, binding: WorldRuntimeBinding): Promise<WorldRuntimeProjection>;
    submitAction(
      windowId: string,
      binding: WorldRuntimeBinding,
      intent: WorldActionIntent,
    ): Promise<WorldRuntimeProjection>;
  };
}

export function createWorldRuntimeLaunchRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly launch: WorldRuntimeLaunch;
}): Extract<WorldRuntimeHostRequest, { readonly operation: 'runtime-launch' }> {
  const request = parseWorldRuntimeHostRequest({ ...input, operation: 'runtime-launch' });
  if (request.operation !== 'runtime-launch') {
    throw new Error('World runtime launch request decoded to another operation.');
  }
  return request;
}

export function createWorldRuntimeSnapshotRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly binding: WorldRuntimeBinding;
}): Extract<WorldRuntimeHostRequest, { readonly operation: 'runtime-snapshot-get' }> {
  const request = parseWorldRuntimeHostRequest({ ...input, operation: 'runtime-snapshot-get' });
  if (request.operation !== 'runtime-snapshot-get') {
    throw new Error('World runtime snapshot request decoded to another operation.');
  }
  return request;
}

export function createWorldRuntimeActionRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly binding: WorldRuntimeBinding;
  readonly intent: WorldActionIntent;
}): Extract<WorldRuntimeHostRequest, { readonly operation: 'runtime-action-submit' }> {
  const request = parseWorldRuntimeHostRequest({ ...input, operation: 'runtime-action-submit' });
  if (request.operation !== 'runtime-action-submit') {
    throw new Error('World runtime action request decoded to another operation.');
  }
  return request;
}

export function parseWorldRuntimeHostRequest(value: unknown): WorldRuntimeHostRequest {
  const record = requireExactRecord(
    value,
    ['requestId', 'rendererSessionId', 'windowId', 'operation', 'launch', 'binding', 'intent'],
    'World runtime Host request',
  );
  const base = {
    requestId: requireIdentity(record['requestId'], 'World runtime request'),
    rendererSessionId: requireIdentity(record['rendererSessionId'], 'Renderer session'),
    windowId: requireIdentity(record['windowId'], 'Window'),
  };
  if (record['operation'] === 'runtime-launch') {
    if (record['binding'] !== undefined || record['intent'] !== undefined) {
      throw new Error('World runtime launch cannot carry binding or intent fields.');
    }
    return {
      ...base,
      operation: 'runtime-launch',
      launch: parseWorldRuntimeLaunch(record['launch']),
    };
  }
  if (record['operation'] === 'runtime-snapshot-get') {
    if (record['launch'] !== undefined || record['intent'] !== undefined) {
      throw new Error('World runtime snapshot cannot carry launch or intent fields.');
    }
    return {
      ...base,
      operation: 'runtime-snapshot-get',
      binding: parseWorldRuntimeBinding(record['binding']),
    };
  }
  if (record['operation'] === 'runtime-action-submit') {
    if (record['launch'] !== undefined) {
      throw new Error('World runtime action cannot carry launch fields.');
    }
    const binding = parseWorldRuntimeBinding(record['binding']);
    const intent = parseWorldActionIntent(record['intent']);
    if (
      intent.worldRunId !== binding.worldRunId ||
      intent.worldSaveId !== binding.worldSaveId ||
      intent.branchId !== binding.branchId
    ) {
      throw new Error('World runtime action intent does not match its exact binding.');
    }
    return { ...base, operation: 'runtime-action-submit', binding, intent };
  }
  throw new Error(`Unknown World runtime operation '${String(record['operation'])}'.`);
}

export function parseWorldRuntimeHostResult(
  value: unknown,
  expectedRequestId: string,
): WorldRuntimeHostResult {
  const record = requireExactRecord(
    value,
    ['requestId', 'projection'],
    'World runtime Host result',
  );
  const requestId = requireIdentity(record['requestId'], 'World runtime response request');
  if (requestId !== expectedRequestId) throw new Error('World runtime response request mismatch.');
  return { requestId, projection: parseWorldRuntimeProjection(record['projection']) };
}

export function parseWorldRuntimeBinding(value: unknown): WorldRuntimeBinding {
  const record = requireExactRecord(
    value,
    [
      'worldProjectId',
      'worldVersionId',
      'worldRunId',
      'worldSaveId',
      'branchId',
      'participantId',
      'actorId',
    ],
    'World runtime binding',
  );
  return {
    worldProjectId: requireIdentity(record['worldProjectId'], 'WorldProject'),
    worldVersionId: requireIdentity(record['worldVersionId'], 'WorldVersion'),
    worldRunId: requireIdentity(record['worldRunId'], 'WorldRun'),
    worldSaveId: requireIdentity(record['worldSaveId'], 'WorldSave'),
    branchId: requireIdentity(record['branchId'], 'World branch'),
    participantId: requireIdentity(record['participantId'], 'World participant'),
    ...(record['actorId'] === undefined
      ? {}
      : { actorId: requireIdentity(record['actorId'], 'World actor') }),
  };
}

export function parseWorldRuntimeLaunch(value: unknown): WorldRuntimeLaunch {
  const record = requireExactRecord(
    value,
    [
      'worldProjectId',
      'worldVersionId',
      'worldRunId',
      'worldSaveId',
      'branchId',
      'saveLabel',
      'participantId',
      'actorId',
    ],
    'World runtime launch',
  );
  const binding = parseWorldRuntimeBinding({
    worldProjectId: record['worldProjectId'],
    worldVersionId: record['worldVersionId'],
    worldRunId: record['worldRunId'],
    worldSaveId: record['worldSaveId'],
    branchId: record['branchId'],
    participantId: record['participantId'],
    actorId: record['actorId'],
  });
  return { ...binding, saveLabel: requireIdentity(record['saveLabel'], 'World save label') };
}

export function parseWorldRuntimeProjection(value: unknown): WorldRuntimeProjection {
  const record = requireExactRecord(
    value,
    [
      'binding',
      'status',
      'background',
      'locations',
      'facts',
      'availableActions',
      'participants',
      'worldStateRevision',
      'timepoint',
      'branches',
      'timeline',
      'diagnostics',
    ],
    'World runtime projection',
  );
  if (record['status'] !== 'ready') throw new Error('World runtime projection must be ready.');
  return {
    binding: parseWorldRuntimeBinding(record['binding']),
    status: 'ready',
    background: requireString(record['background'], 'World runtime background'),
    locations: requireUniqueIdentities(
      requireArray(record['locations'], parseLocation, 'World runtime locations'),
      (entry) => entry.definitionId,
      'World runtime locations',
    ),
    facts: requireUniqueIdentities(
      requireArray(record['facts'], parseFact, 'World runtime facts'),
      (entry) => entry.factId,
      'World runtime facts',
    ),
    availableActions: identityList(record['availableActions'], 'World runtime actions'),
    participants: requireUniqueIdentities(
      requireArray(record['participants'], parseParticipant, 'World runtime participants'),
      (entry) => entry.participantId,
      'World runtime participants',
    ),
    worldStateRevision: requireNonNegativeInteger(
      record['worldStateRevision'],
      'World runtime state revision',
    ),
    timepoint: requireNonNegativeInteger(record['timepoint'], 'World runtime timepoint'),
    branches: requireUniqueIdentities(
      requireArray(record['branches'], parseBranch, 'World runtime branches'),
      (entry) => entry.branchId,
      'World runtime branches',
    ),
    timeline: requireUniqueIdentities(
      requireArray(record['timeline'], parseTimelineEvent, 'World runtime timeline'),
      (entry) => entry.worldEventId,
      'World runtime timeline',
    ),
    diagnostics: requireArray(record['diagnostics'], parseDiagnostic, 'World runtime diagnostics'),
  };
}

function parseLocation(value: unknown) {
  const record = requireExactRecord(
    value,
    ['definitionId', 'name', 'description'],
    'World location',
  );
  return {
    definitionId: requireIdentity(record['definitionId'], 'World location'),
    name: requireIdentity(record['name'], 'World location name'),
    description: requireString(record['description'], 'World location description'),
  };
}

function parseFact(value: unknown) {
  const record = requireExactRecord(value, ['factId', 'key', 'value'], 'World runtime fact');
  return {
    factId: requireIdentity(record['factId'], 'World fact'),
    key: requireIdentity(record['key'], 'World fact key'),
    value: requireJsonValue(record['value'], 'World fact value'),
  };
}

function parseParticipant(value: unknown) {
  const record = requireExactRecord(value, ['participantId', 'actorId'], 'World participant');
  return {
    participantId: requireIdentity(record['participantId'], 'World participant'),
    ...(record['actorId'] === undefined
      ? {}
      : { actorId: requireIdentity(record['actorId'], 'World actor') }),
  };
}

function parseBranch(value: unknown) {
  const record = requireExactRecord(
    value,
    ['branchId', 'active', 'parentBranchId', 'eventCount'],
    'World runtime branch',
  );
  if (typeof record['active'] !== 'boolean')
    throw new Error('World branch active must be boolean.');
  return {
    branchId: requireIdentity(record['branchId'], 'World branch'),
    active: record['active'],
    ...(record['parentBranchId'] === undefined
      ? {}
      : { parentBranchId: requireIdentity(record['parentBranchId'], 'World parent branch') }),
    eventCount: requireNonNegativeInteger(record['eventCount'], 'World branch event count'),
  };
}

function parseTimelineEvent(value: unknown) {
  const record = requireExactRecord(
    value,
    ['worldEventId', 'actorId', 'action', 'timepoint', 'committedAt'],
    'World runtime timeline event',
  );
  return {
    worldEventId: requireIdentity(record['worldEventId'], 'WorldEvent'),
    actorId: requireIdentity(record['actorId'], 'World event actor'),
    action: requireIdentity(record['action'], 'World event action'),
    timepoint: requireNonNegativeInteger(record['timepoint'], 'World event timepoint'),
    committedAt: requireIdentity(record['committedAt'], 'World event committed time'),
  };
}

function parseDiagnostic(value: unknown) {
  const record = requireExactRecord(value, ['code', 'message'], 'World runtime diagnostic');
  return {
    code: requireIdentity(record['code'], 'World runtime diagnostic code'),
    message: requireIdentity(record['message'], 'World runtime diagnostic message'),
  };
}

function identityList(value: unknown, label: string): readonly string[] {
  return requireUniqueIdentities(
    requireArray(value, (item) => requireIdentity(item, label), label),
    (identity) => identity,
    label,
  );
}
