import type { CharacterRuntimeKind } from './character';
import {
  optionalIdentity,
  readDiagnosticIdentity,
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireIsoDate,
  requireNonNegativeInteger,
  requireOneOf,
  requirePositiveInteger,
  requireString,
  requireUniqueIdentities,
} from './codec';

export const INTERACTION_TOPOLOGIES = ['dialogue', 'chatroom'] as const;
export const ROOM_CONTROLLER_KINDS = ['human', 'agent', 'system'] as const;
export const ROOM_SCHEDULING_KINDS = ['mentioned', 'turn-based', 'bounded-autonomous'] as const;
export const ROOM_EVENT_KINDS = [
  'message',
  'membership',
  'moderation',
  'scheduling',
  'world-event-reference',
] as const;

export type InteractionTopology = (typeof INTERACTION_TOPOLOGIES)[number];
export type RoomControllerKind = (typeof ROOM_CONTROLLER_KINDS)[number];
export type RoomSchedulingKind = (typeof ROOM_SCHEDULING_KINDS)[number];
export type RoomEventKind = (typeof ROOM_EVENT_KINDS)[number];

export interface CompanionWorldBinding {
  readonly worldVersionId: string;
  readonly worldRunId: string;
}

export interface NarrativeWorldBinding extends CompanionWorldBinding {
  readonly worldSaveId: string;
  readonly branchId: string;
}

export interface CharacterRoomRelationshipBinding {
  readonly participantId: string;
  readonly relationshipId: string;
}

export interface CharacterRoomActorBinding {
  readonly participantId: string;
  readonly actorId: string;
}

export type CreateCharacterRoomRunInput =
  | {
      readonly roomRunId: string;
      readonly characterRoomId: string;
      readonly runtimeKind: 'companion';
      readonly relationshipBindings: readonly CharacterRoomRelationshipBinding[];
      readonly worldBinding?: CompanionWorldBinding;
    }
  | {
      readonly roomRunId: string;
      readonly characterRoomId: string;
      readonly runtimeKind: 'narrative';
      readonly actorBindings: readonly CharacterRoomActorBinding[];
      readonly worldBinding: NarrativeWorldBinding;
    };

export interface CompanionRunBinding {
  readonly runtimeKind: 'companion';
  readonly relationshipIds: readonly string[];
  readonly worldBinding?: CompanionWorldBinding;
}

export interface NarrativeRunBinding {
  readonly runtimeKind: 'narrative';
  readonly worldBinding: NarrativeWorldBinding;
}

export type InteractionRunBinding = CompanionRunBinding | NarrativeRunBinding;

export interface DialogueRunBase {
  readonly topology: 'dialogue';
  readonly dialogueRunId: string;
  readonly userParticipantId: string;
  readonly characterParticipantId: string;
  readonly characterRunId: string;
  readonly createdAt: string;
}

export type DialogueRun = DialogueRunBase & InteractionRunBinding;

export type CharacterRoomParticipantTemplate =
  | {
      readonly participantTemplateId: string;
      readonly displayName: string;
      readonly controllerKind: 'human';
      readonly userId: string;
      readonly characterVersionId?: string;
    }
  | {
      readonly participantTemplateId: string;
      readonly displayName: string;
      readonly controllerKind: 'agent';
      readonly characterVersionId: string;
    }
  | {
      readonly participantTemplateId: string;
      readonly displayName: string;
      readonly controllerKind: 'system';
      readonly systemId: string;
    };

export type RoomSchedulingPolicy =
  | { readonly kind: 'mentioned' }
  | { readonly kind: 'turn-based'; readonly participantOrder: readonly string[] }
  | {
      readonly kind: 'bounded-autonomous';
      readonly maxResponsesPerCycle: number;
      readonly eligibleParticipantIds: readonly string[];
    };

export interface CharacterRoom {
  readonly characterRoomId: string;
  readonly title: string;
  readonly defaultRuntimeKind: CharacterRuntimeKind;
  readonly participantTemplates: readonly CharacterRoomParticipantTemplate[];
  readonly schedulingPolicy: RoomSchedulingPolicy;
  readonly worldVersionId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type RoomParticipantController =
  | { readonly kind: 'human'; readonly userId: string }
  | {
      readonly kind: 'agent';
      readonly characterRunId: string;
      readonly primaryAgentSessionId: string;
    }
  | { readonly kind: 'system'; readonly systemId: string };

export interface RoomParticipant {
  readonly participantId: string;
  readonly displayName: string;
  readonly characterVersionId?: string;
  readonly controller: RoomParticipantController;
}

export type RoomEventVisibility =
  | { readonly kind: 'public' }
  | { readonly kind: 'private'; readonly participantId: string }
  | { readonly kind: 'participants'; readonly participantIds: readonly string[] };

interface RoomEventBase {
  readonly roomEventId: string;
  readonly roomRunId: string;
  readonly sequence: number;
  readonly createdAt: string;
  readonly visibility: RoomEventVisibility;
}

export interface RoomMessageEvent extends RoomEventBase {
  readonly kind: 'message';
  readonly authorParticipantId: string;
  readonly content: string;
  readonly mentionedParticipantIds: readonly string[];
}

export interface RoomMembershipEvent extends RoomEventBase {
  readonly kind: 'membership';
  readonly participantId: string;
  readonly action: 'joined' | 'left';
}

export interface RoomModerationEvent extends RoomEventBase {
  readonly kind: 'moderation';
  readonly moderatorParticipantId: string;
  readonly targetEventId: string;
  readonly action: 'hidden' | 'restored';
  readonly reason: string;
}

export interface RoomSchedulingEvent extends RoomEventBase {
  readonly kind: 'scheduling';
  readonly eligibleParticipantIds: readonly string[];
  readonly reason: 'mention' | 'turn' | 'autonomous';
}

export interface RoomWorldEventReference extends RoomEventBase {
  readonly kind: 'world-event-reference';
  readonly worldEventId: string;
}

export type RoomEvent =
  | RoomMessageEvent
  | RoomMembershipEvent
  | RoomModerationEvent
  | RoomSchedulingEvent
  | RoomWorldEventReference;

export interface RoomRunBase {
  readonly topology: 'chatroom';
  readonly roomRunId: string;
  readonly characterRoomId: string;
  readonly roomRevision: number;
  readonly participants: readonly RoomParticipant[];
  readonly schedulingPolicy: RoomSchedulingPolicy;
  readonly events: readonly RoomEvent[];
  readonly createdAt: string;
}

export type RoomRun = RoomRunBase & InteractionRunBinding;

export interface RoomView {
  readonly roomRunId: string;
  readonly roomRevision: number;
  readonly participantId: string;
  readonly participants: readonly RoomParticipant[];
  readonly events: readonly RoomEvent[];
}

export interface RoomRecordDiagnostic {
  readonly code: 'invalid-room-record';
  readonly recordKind: 'character-room' | 'room-run' | 'dialogue-run';
  readonly recordId?: string;
  readonly message: string;
}

export interface RoomRecordDecodeResult<T> {
  readonly records: readonly T[];
  readonly diagnostics: readonly RoomRecordDiagnostic[];
}

export function parseDialogueRun(value: unknown): DialogueRun {
  const record = requireExactRecord(
    value,
    [
      'topology',
      'dialogueRunId',
      'userParticipantId',
      'characterParticipantId',
      'characterRunId',
      'runtimeKind',
      'relationshipIds',
      'worldBinding',
      'createdAt',
    ],
    'DialogueRun',
  );
  if (record['topology'] !== 'dialogue') throw new Error('DialogueRun topology must be dialogue.');
  return {
    topology: 'dialogue',
    dialogueRunId: requireIdentity(record['dialogueRunId'], 'DialogueRun dialogueRunId'),
    userParticipantId: requireIdentity(
      record['userParticipantId'],
      'DialogueRun userParticipantId',
    ),
    characterParticipantId: requireIdentity(
      record['characterParticipantId'],
      'DialogueRun characterParticipantId',
    ),
    characterRunId: requireIdentity(record['characterRunId'], 'DialogueRun characterRunId'),
    ...parseInteractionRunBinding(record),
    createdAt: requireIsoDate(record['createdAt'], 'DialogueRun createdAt'),
  };
}

export function parseCharacterRoom(value: unknown): CharacterRoom {
  const record = requireExactRecord(
    value,
    [
      'characterRoomId',
      'title',
      'defaultRuntimeKind',
      'participantTemplates',
      'schedulingPolicy',
      'worldVersionId',
      'createdAt',
      'updatedAt',
    ],
    'CharacterRoom',
  );
  const participants = requireUniqueIdentities(
    requireArray(
      record['participantTemplates'],
      parseCharacterRoomParticipantTemplate,
      'CharacterRoom participantTemplates',
    ),
    (item) => item.participantTemplateId,
    'CharacterRoom participantTemplates',
  );
  const schedulingPolicy = parseRoomSchedulingPolicy(record['schedulingPolicy']);
  validateSchedulingParticipants(
    schedulingPolicy,
    new Set(participants.map((item) => item.participantTemplateId)),
    'CharacterRoom',
  );
  const worldVersionId = optionalIdentity(record['worldVersionId'], 'CharacterRoom worldVersionId');
  return {
    characterRoomId: requireIdentity(record['characterRoomId'], 'CharacterRoom characterRoomId'),
    title: requireIdentity(record['title'], 'CharacterRoom title'),
    defaultRuntimeKind: requireOneOf(
      record['defaultRuntimeKind'],
      ['companion', 'narrative'] as const,
      'CharacterRoom defaultRuntimeKind',
    ),
    participantTemplates: participants,
    schedulingPolicy,
    ...(worldVersionId === undefined ? {} : { worldVersionId }),
    createdAt: requireIsoDate(record['createdAt'], 'CharacterRoom createdAt'),
    updatedAt: requireIsoDate(record['updatedAt'], 'CharacterRoom updatedAt'),
  };
}

export function parseRoomRun(value: unknown): RoomRun {
  const record = requireExactRecord(
    value,
    [
      'topology',
      'roomRunId',
      'characterRoomId',
      'roomRevision',
      'participants',
      'schedulingPolicy',
      'events',
      'runtimeKind',
      'relationshipIds',
      'worldBinding',
      'createdAt',
    ],
    'RoomRun',
  );
  if (record['topology'] !== 'chatroom') throw new Error('RoomRun topology must be chatroom.');
  const roomRunId = requireIdentity(record['roomRunId'], 'RoomRun roomRunId');
  const participants = requireUniqueIdentities(
    requireArray(record['participants'], parseRoomParticipant, 'RoomRun participants'),
    (item) => item.participantId,
    'RoomRun participants',
  );
  const participantIds = new Set(participants.map((item) => item.participantId));
  const schedulingPolicy = parseRoomSchedulingPolicy(record['schedulingPolicy']);
  validateSchedulingParticipants(schedulingPolicy, participantIds, 'RoomRun');
  const events = requireUniqueIdentities(
    requireArray(record['events'], parseRoomEvent, 'RoomRun events'),
    (item) => item.roomEventId,
    'RoomRun events',
  );
  validateRoomEvents(events, roomRunId, participantIds, {
    contiguousSequence: true,
    requireLocalReferences: true,
  });
  const roomRevision = requireNonNegativeInteger(record['roomRevision'], 'RoomRun roomRevision');
  if (roomRevision !== events.length) {
    throw new Error('RoomRun roomRevision must equal the committed event count.');
  }
  return {
    topology: 'chatroom',
    roomRunId,
    characterRoomId: requireIdentity(record['characterRoomId'], 'RoomRun characterRoomId'),
    roomRevision,
    participants,
    schedulingPolicy,
    events,
    ...parseInteractionRunBinding(record),
    createdAt: requireIsoDate(record['createdAt'], 'RoomRun createdAt'),
  };
}

export function parseRoomView(value: unknown): RoomView {
  const record = requireExactRecord(
    value,
    ['roomRunId', 'roomRevision', 'participantId', 'participants', 'events'],
    'RoomView',
  );
  const roomRunId = requireIdentity(record['roomRunId'], 'RoomView roomRunId');
  const participantId = requireIdentity(record['participantId'], 'RoomView participantId');
  const participants = requireUniqueIdentities(
    requireArray(record['participants'], parseRoomParticipant, 'RoomView participants'),
    (item) => item.participantId,
    'RoomView participants',
  );
  const participantIds = new Set(participants.map((item) => item.participantId));
  if (!participantIds.has(participantId))
    throw new Error('RoomView participant is not in its roster.');
  const events = requireUniqueIdentities(
    requireArray(record['events'], parseRoomEvent, 'RoomView events'),
    (item) => item.roomEventId,
    'RoomView events',
  );
  validateRoomEvents(events, roomRunId, participantIds, {
    contiguousSequence: false,
    requireLocalReferences: false,
  });
  for (const event of events) {
    if (!isEventVisibleTo(event.visibility, participantId)) {
      throw new Error(
        `RoomView contains event '${event.roomEventId}' outside participant visibility.`,
      );
    }
  }
  const roomRevision = requireNonNegativeInteger(record['roomRevision'], 'RoomView roomRevision');
  if (events.some((event) => event.sequence > roomRevision)) {
    throw new Error('RoomView event sequence cannot exceed its Room revision.');
  }
  return {
    roomRunId,
    roomRevision,
    participantId,
    participants,
    events,
  };
}

export function parseCreateCharacterRoomRunInput(value: unknown): CreateCharacterRoomRunInput {
  const record = requireExactRecord(
    value,
    [
      'roomRunId',
      'characterRoomId',
      'runtimeKind',
      'relationshipBindings',
      'actorBindings',
      'worldBinding',
    ],
    'Create CharacterRoom run input',
  );
  const base = {
    roomRunId: requireIdentity(record['roomRunId'], 'Create RoomRun identity'),
    characterRoomId: requireIdentity(record['characterRoomId'], 'Create CharacterRoom identity'),
  };
  const runtimeKind = requireOneOf(
    record['runtimeKind'],
    ['companion', 'narrative'] as const,
    'Create RoomRun runtimeKind',
  );
  if (runtimeKind === 'companion') {
    if (record['actorBindings'] !== undefined) {
      throw new Error('Companion RoomRun cannot declare narrative actor bindings.');
    }
    const relationshipBindings = requireUniqueIdentities(
      requireArray(
        record['relationshipBindings'],
        parseCharacterRoomRelationshipBinding,
        'RoomRun relationship bindings',
      ),
      (binding) => binding.participantId,
      'RoomRun relationship bindings',
    );
    if (relationshipBindings.length === 0) {
      throw new Error('Companion RoomRun requires relationship bindings.');
    }
    return {
      ...base,
      runtimeKind,
      relationshipBindings,
      ...(record['worldBinding'] === undefined
        ? {}
        : { worldBinding: parseCompanionWorldBinding(record['worldBinding']) }),
    };
  }
  if (record['relationshipBindings'] !== undefined) {
    throw new Error('Narrative RoomRun cannot declare companion relationship bindings.');
  }
  return {
    ...base,
    runtimeKind,
    actorBindings: requireUniqueIdentities(
      requireArray(
        record['actorBindings'],
        parseCharacterRoomActorBinding,
        'RoomRun actor bindings',
      ),
      (binding) => binding.participantId,
      'RoomRun actor bindings',
    ),
    worldBinding: parseNarrativeWorldBinding(record['worldBinding']),
  };
}

export function decodeRoomRecords<T>(
  values: readonly unknown[],
  recordKind: RoomRecordDiagnostic['recordKind'],
  parser: (value: unknown) => T,
  identityKey: string,
): RoomRecordDecodeResult<T> {
  const records: T[] = [];
  const diagnostics: RoomRecordDiagnostic[] = [];
  for (const value of values) {
    try {
      records.push(parser(value));
    } catch (error) {
      const recordId = readDiagnosticIdentity(value, identityKey);
      diagnostics.push({
        code: 'invalid-room-record',
        recordKind,
        ...(recordId === undefined ? {} : { recordId }),
        message: error instanceof Error ? error.message : `Invalid ${recordKind} record.`,
      });
    }
  }
  return { records, diagnostics };
}

function parseInteractionRunBinding(
  record: Readonly<Record<string, unknown>>,
): InteractionRunBinding {
  const runtimeKind = requireOneOf(
    record['runtimeKind'],
    ['companion', 'narrative'] as const,
    'Interaction runtimeKind',
  );
  if (runtimeKind === 'companion') {
    const relationshipIds = requireUniqueStringArray(
      record['relationshipIds'],
      'Companion relationshipIds',
    );
    if (relationshipIds.length === 0) {
      throw new Error('Companion run requires at least one relationship identity.');
    }
    const worldBinding =
      record['worldBinding'] === undefined
        ? undefined
        : parseCompanionWorldBinding(record['worldBinding']);
    return {
      runtimeKind,
      relationshipIds,
      ...(worldBinding === undefined ? {} : { worldBinding }),
    };
  }
  if (record['relationshipIds'] !== undefined) {
    throw new Error('Narrative run cannot bind companion relationship identities.');
  }
  return {
    runtimeKind,
    worldBinding: parseNarrativeWorldBinding(record['worldBinding']),
  };
}

export function parseCompanionWorldBinding(value: unknown): CompanionWorldBinding {
  const record = requireExactRecord(
    value,
    ['worldVersionId', 'worldRunId'],
    'Companion World binding',
  );
  return {
    worldVersionId: requireIdentity(record['worldVersionId'], 'Companion WorldVersion identity'),
    worldRunId: requireIdentity(record['worldRunId'], 'Companion WorldRun identity'),
  };
}

export function parseNarrativeWorldBinding(value: unknown): NarrativeWorldBinding {
  const record = requireExactRecord(
    value,
    ['worldVersionId', 'worldRunId', 'worldSaveId', 'branchId'],
    'Narrative World binding',
  );
  return {
    worldVersionId: requireIdentity(record['worldVersionId'], 'Narrative WorldVersion identity'),
    worldRunId: requireIdentity(record['worldRunId'], 'Narrative WorldRun identity'),
    worldSaveId: requireIdentity(record['worldSaveId'], 'Narrative WorldSave identity'),
    branchId: requireIdentity(record['branchId'], 'Narrative World branch identity'),
  };
}

function parseCharacterRoomRelationshipBinding(value: unknown): CharacterRoomRelationshipBinding {
  const record = requireExactRecord(
    value,
    ['participantId', 'relationshipId'],
    'CharacterRoom relationship binding',
  );
  return {
    participantId: requireIdentity(record['participantId'], 'Relationship participant'),
    relationshipId: requireIdentity(record['relationshipId'], 'Relationship identity'),
  };
}

function parseCharacterRoomActorBinding(value: unknown): CharacterRoomActorBinding {
  const record = requireExactRecord(
    value,
    ['participantId', 'actorId'],
    'CharacterRoom actor binding',
  );
  return {
    participantId: requireIdentity(record['participantId'], 'Actor participant'),
    actorId: requireIdentity(record['actorId'], 'World actor identity'),
  };
}

function parseCharacterRoomParticipantTemplate(value: unknown): CharacterRoomParticipantTemplate {
  const record = requireExactRecord(
    value,
    [
      'participantTemplateId',
      'displayName',
      'controllerKind',
      'userId',
      'characterVersionId',
      'systemId',
    ],
    'CharacterRoom participant template',
  );
  const base = {
    participantTemplateId: requireIdentity(
      record['participantTemplateId'],
      'Room participant template identity',
    ),
    displayName: requireIdentity(record['displayName'], 'Room participant template displayName'),
  };
  const kind = requireOneOf(
    record['controllerKind'],
    ROOM_CONTROLLER_KINDS,
    'Room participant template controllerKind',
  );
  if (kind === 'human') {
    requireUndefined(record, ['systemId']);
    const characterVersionId = optionalIdentity(
      record['characterVersionId'],
      'Human participant CharacterVersion identity',
    );
    return {
      ...base,
      controllerKind: kind,
      userId: requireIdentity(record['userId'], 'Human participant userId'),
      ...(characterVersionId === undefined ? {} : { characterVersionId }),
    };
  }
  if (kind === 'agent') {
    requireUndefined(record, ['userId', 'systemId']);
    return {
      ...base,
      controllerKind: kind,
      characterVersionId: requireIdentity(
        record['characterVersionId'],
        'Agent participant CharacterVersion identity',
      ),
    };
  }
  requireUndefined(record, ['userId', 'characterVersionId']);
  return {
    ...base,
    controllerKind: kind,
    systemId: requireIdentity(record['systemId'], 'System participant systemId'),
  };
}

function parseRoomParticipant(value: unknown): RoomParticipant {
  const record = requireExactRecord(
    value,
    ['participantId', 'displayName', 'characterVersionId', 'controller'],
    'Room participant',
  );
  const controller = parseRoomParticipantController(record['controller']);
  const characterVersionId = optionalIdentity(
    record['characterVersionId'],
    'Room participant CharacterVersion identity',
  );
  if (controller.kind === 'agent' && characterVersionId === undefined) {
    throw new Error('Agent Room participant requires a CharacterVersion identity.');
  }
  if (controller.kind === 'system' && characterVersionId !== undefined) {
    throw new Error('System Room participant cannot bind a CharacterVersion.');
  }
  return {
    participantId: requireIdentity(record['participantId'], 'Room participant identity'),
    displayName: requireIdentity(record['displayName'], 'Room participant displayName'),
    ...(characterVersionId === undefined ? {} : { characterVersionId }),
    controller,
  };
}

function parseRoomParticipantController(value: unknown): RoomParticipantController {
  const record = requireExactRecord(
    value,
    ['kind', 'userId', 'characterRunId', 'primaryAgentSessionId', 'systemId'],
    'Room participant controller',
  );
  const kind = requireOneOf(record['kind'], ROOM_CONTROLLER_KINDS, 'Room controller kind');
  if (kind === 'human') {
    requireUndefined(record, ['characterRunId', 'primaryAgentSessionId', 'systemId']);
    return { kind, userId: requireIdentity(record['userId'], 'Room human controller userId') };
  }
  if (kind === 'agent') {
    requireUndefined(record, ['userId', 'systemId']);
    return {
      kind,
      characterRunId: requireIdentity(
        record['characterRunId'],
        'Room agent controller CharacterRun identity',
      ),
      primaryAgentSessionId: requireIdentity(
        record['primaryAgentSessionId'],
        'Room agent controller primary AgentSession identity',
      ),
    };
  }
  requireUndefined(record, ['userId', 'characterRunId', 'primaryAgentSessionId']);
  return { kind, systemId: requireIdentity(record['systemId'], 'Room system controller systemId') };
}

function parseRoomSchedulingPolicy(value: unknown): RoomSchedulingPolicy {
  const record = requireExactRecord(
    value,
    ['kind', 'participantOrder', 'maxResponsesPerCycle', 'eligibleParticipantIds'],
    'Room scheduling policy',
  );
  const kind = requireOneOf(record['kind'], ROOM_SCHEDULING_KINDS, 'Room scheduling kind');
  if (kind === 'mentioned') {
    requireUndefined(record, [
      'participantOrder',
      'maxResponsesPerCycle',
      'eligibleParticipantIds',
    ]);
    return { kind };
  }
  if (kind === 'turn-based') {
    requireUndefined(record, ['maxResponsesPerCycle', 'eligibleParticipantIds']);
    const participantOrder = requireUniqueStringArray(
      record['participantOrder'],
      'Turn-based participantOrder',
    );
    if (participantOrder.length === 0)
      throw new Error('Turn-based scheduling requires participants.');
    return { kind, participantOrder };
  }
  requireUndefined(record, ['participantOrder']);
  const eligibleParticipantIds = requireUniqueStringArray(
    record['eligibleParticipantIds'],
    'Autonomous eligibleParticipantIds',
  );
  if (eligibleParticipantIds.length === 0) {
    throw new Error('Bounded autonomous scheduling requires eligible participants.');
  }
  return {
    kind,
    maxResponsesPerCycle: requirePositiveInteger(
      record['maxResponsesPerCycle'],
      'Autonomous maxResponsesPerCycle',
    ),
    eligibleParticipantIds,
  };
}

function parseRoomEvent(value: unknown): RoomEvent {
  const record = requireExactRecord(
    value,
    [
      'kind',
      'roomEventId',
      'roomRunId',
      'sequence',
      'createdAt',
      'visibility',
      'authorParticipantId',
      'content',
      'mentionedParticipantIds',
      'participantId',
      'action',
      'moderatorParticipantId',
      'targetEventId',
      'reason',
      'eligibleParticipantIds',
      'worldEventId',
    ],
    'RoomEvent',
  );
  const base = {
    roomEventId: requireIdentity(record['roomEventId'], 'RoomEvent identity'),
    roomRunId: requireIdentity(record['roomRunId'], 'RoomEvent RoomRun identity'),
    sequence: requirePositiveInteger(record['sequence'], 'RoomEvent sequence'),
    createdAt: requireIsoDate(record['createdAt'], 'RoomEvent createdAt'),
    visibility: parseRoomEventVisibility(record['visibility']),
  };
  const kind = requireOneOf(record['kind'], ROOM_EVENT_KINDS, 'RoomEvent kind');
  if (kind === 'message') {
    requireUndefined(record, [
      'participantId',
      'action',
      'moderatorParticipantId',
      'targetEventId',
      'reason',
      'eligibleParticipantIds',
      'worldEventId',
    ]);
    return {
      ...base,
      kind,
      authorParticipantId: requireIdentity(record['authorParticipantId'], 'Room message author'),
      content: requireString(record['content'], 'Room message content'),
      mentionedParticipantIds: requireUniqueStringArray(
        record['mentionedParticipantIds'],
        'Room message mentions',
      ),
    };
  }
  if (kind === 'membership') {
    requireUndefined(record, [
      'authorParticipantId',
      'content',
      'mentionedParticipantIds',
      'moderatorParticipantId',
      'targetEventId',
      'reason',
      'eligibleParticipantIds',
      'worldEventId',
    ]);
    return {
      ...base,
      kind,
      participantId: requireIdentity(record['participantId'], 'Room membership participant'),
      action: requireOneOf(record['action'], ['joined', 'left'] as const, 'Room membership action'),
    };
  }
  if (kind === 'moderation') {
    requireUndefined(record, [
      'authorParticipantId',
      'content',
      'mentionedParticipantIds',
      'participantId',
      'eligibleParticipantIds',
      'worldEventId',
    ]);
    return {
      ...base,
      kind,
      moderatorParticipantId: requireIdentity(
        record['moderatorParticipantId'],
        'Room moderation participant',
      ),
      targetEventId: requireIdentity(record['targetEventId'], 'Room moderation target event'),
      action: requireOneOf(record['action'], ['hidden', 'restored'] as const, 'Moderation action'),
      reason: requireIdentity(record['reason'], 'Room moderation reason'),
    };
  }
  if (kind === 'scheduling') {
    requireUndefined(record, [
      'authorParticipantId',
      'content',
      'mentionedParticipantIds',
      'participantId',
      'action',
      'moderatorParticipantId',
      'targetEventId',
      'worldEventId',
    ]);
    return {
      ...base,
      kind,
      eligibleParticipantIds: requireUniqueStringArray(
        record['eligibleParticipantIds'],
        'Room scheduling eligible participants',
      ),
      reason: requireOneOf(
        record['reason'],
        ['mention', 'turn', 'autonomous'] as const,
        'Room scheduling reason',
      ),
    };
  }
  requireUndefined(record, [
    'authorParticipantId',
    'content',
    'mentionedParticipantIds',
    'participantId',
    'action',
    'moderatorParticipantId',
    'targetEventId',
    'reason',
    'eligibleParticipantIds',
  ]);
  return {
    ...base,
    kind,
    worldEventId: requireIdentity(record['worldEventId'], 'Room WorldEvent reference'),
  };
}

function parseRoomEventVisibility(value: unknown): RoomEventVisibility {
  const record = requireExactRecord(
    value,
    ['kind', 'participantId', 'participantIds'],
    'RoomEvent visibility',
  );
  const kind = requireOneOf(
    record['kind'],
    ['public', 'private', 'participants'] as const,
    'RoomEvent visibility kind',
  );
  if (kind === 'public') {
    requireUndefined(record, ['participantId', 'participantIds']);
    return { kind };
  }
  if (kind === 'private') {
    requireUndefined(record, ['participantIds']);
    return {
      kind,
      participantId: requireIdentity(record['participantId'], 'Private visibility participant'),
    };
  }
  requireUndefined(record, ['participantId']);
  const participantIds = requireUniqueStringArray(
    record['participantIds'],
    'Participant-scoped visibility identities',
  );
  if (participantIds.length === 0) {
    throw new Error('Participant-scoped visibility requires at least one participant.');
  }
  return { kind, participantIds };
}

function validateSchedulingParticipants(
  policy: RoomSchedulingPolicy,
  participants: ReadonlySet<string>,
  label: string,
): void {
  const scheduled =
    policy.kind === 'turn-based'
      ? policy.participantOrder
      : policy.kind === 'bounded-autonomous'
        ? policy.eligibleParticipantIds
        : [];
  const unknown = scheduled.find((participantId) => !participants.has(participantId));
  if (unknown) throw new Error(`${label} scheduling references unknown participant '${unknown}'.`);
}

function validateRoomEvents(
  events: readonly RoomEvent[],
  roomRunId: string,
  participants: ReadonlySet<string>,
  options: {
    readonly contiguousSequence: boolean;
    readonly requireLocalReferences: boolean;
  },
): void {
  const eventIds = new Set(events.map((event) => event.roomEventId));
  let previousSequence = 0;
  for (const [index, event] of events.entries()) {
    if (event.roomRunId !== roomRunId) throw new Error('RoomEvent owner does not match RoomRun.');
    if (
      (options.contiguousSequence && event.sequence !== index + 1) ||
      (!options.contiguousSequence && event.sequence <= previousSequence)
    ) {
      throw new Error(
        options.contiguousSequence
          ? 'RoomEvent sequence must be contiguous.'
          : 'RoomView event sequence must be strictly increasing.',
      );
    }
    previousSequence = event.sequence;
    const visibilityIds =
      event.visibility.kind === 'private'
        ? [event.visibility.participantId]
        : event.visibility.kind === 'participants'
          ? event.visibility.participantIds
          : [];
    if (visibilityIds.some((participantId) => !participants.has(participantId))) {
      throw new Error(`RoomEvent '${event.roomEventId}' has visibility outside the Room roster.`);
    }
    if (event.kind === 'message') {
      if (!participants.has(event.authorParticipantId)) {
        throw new Error(`Room message '${event.roomEventId}' has an unknown author.`);
      }
      if (event.mentionedParticipantIds.some((id) => !participants.has(id))) {
        throw new Error(`Room message '${event.roomEventId}' mentions an unknown participant.`);
      }
    } else if (event.kind === 'membership') {
      if (!participants.has(event.participantId)) {
        throw new Error(`Room membership event '${event.roomEventId}' has an unknown participant.`);
      }
    } else if (event.kind === 'moderation') {
      if (
        !participants.has(event.moderatorParticipantId) ||
        (options.requireLocalReferences && !eventIds.has(event.targetEventId))
      ) {
        throw new Error(`Room moderation event '${event.roomEventId}' has an invalid reference.`);
      }
    } else if (
      event.kind === 'scheduling' &&
      event.eligibleParticipantIds.some((id) => !participants.has(id))
    ) {
      throw new Error(`Room scheduling event '${event.roomEventId}' has an unknown participant.`);
    }
  }
}

function isEventVisibleTo(visibility: RoomEventVisibility, participantId: string): boolean {
  return (
    visibility.kind === 'public' ||
    (visibility.kind === 'private' && visibility.participantId === participantId) ||
    (visibility.kind === 'participants' && visibility.participantIds.includes(participantId))
  );
}

function requireUniqueStringArray(value: unknown, label: string): readonly string[] {
  return requireUniqueIdentities(
    requireArray(value, (item) => requireIdentity(item, label), label),
    (item) => item,
    label,
  );
}

function requireUndefined(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): void {
  const present = keys.filter((key) => record[key] !== undefined);
  if (present.length > 0) {
    throw new Error(
      `Room contract contains fields owned by another discriminated kind: ${present.join(', ')}.`,
    );
  }
}
