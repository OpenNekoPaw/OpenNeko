import {
  parseCharacterRoom,
  parseRoomRun,
  parseRoomView,
  type CharacterRoom,
  type CharacterRun,
  type RoomEvent,
  type RoomRun,
  type RoomView,
} from '@neko/chara-domain/contracts';
import {
  projectCharacterAgentModeConstraint,
  type CharacterAgentModeConstraint,
} from './character-agent-mode-constraint';

export type RoomEventDraft = RoomEvent extends infer TEvent
  ? TEvent extends RoomEvent
    ? Omit<TEvent, 'roomRunId' | 'sequence' | 'createdAt'> & { readonly createdAt?: string }
    : never
  : never;

export interface CharacterRoomRepository {
  createRoom(room: CharacterRoom, signal?: AbortSignal): Promise<void>;
  readRoom(characterRoomId: string, signal?: AbortSignal): Promise<CharacterRoom | undefined>;
  createRun(run: RoomRun, signal?: AbortSignal): Promise<void>;
  createRunAggregate(
    input: { readonly run: RoomRun; readonly characterRuns: readonly CharacterRun[] },
    signal?: AbortSignal,
  ): Promise<void>;
  readRun(roomRunId: string, signal?: AbortSignal): Promise<RoomRun | undefined>;
  mutateRun(
    roomRunId: string,
    mutation: (current: RoomRun) => RoomRun,
    signal?: AbortSignal,
  ): Promise<RoomRun>;
}

export type CharacterRoomDiagnosticCode =
  | 'character-room-unavailable'
  | 'room-run-unavailable'
  | 'stale-room-revision'
  | 'room-event-invalid'
  | 'room-scheduling-unavailable';

export class CharacterRoomError extends Error {
  constructor(
    readonly code: CharacterRoomDiagnosticCode,
    message: string,
    readonly roomRunId?: string,
  ) {
    super(message);
    this.name = 'CharacterRoomError';
  }
}

export class CharacterRoomService {
  private readonly now: () => string;
  private readonly userViewSubscribers = new Map<
    string,
    Set<{
      readonly userId: string;
      readonly listener: (view: RoomView) => void;
    }>
  >();

  constructor(
    private readonly repository: CharacterRoomRepository,
    options: {
      readonly now?: () => string;
    } = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async createRoom(room: CharacterRoom, signal?: AbortSignal): Promise<CharacterRoom> {
    const canonical = parseCharacterRoom(room);
    await this.repository.createRoom(canonical, signal);
    return structuredClone(canonical);
  }

  async createRun(run: RoomRun, signal?: AbortSignal): Promise<RoomRun> {
    const canonical = await this.validateRun(run, signal);
    await this.repository.createRun(canonical, signal);
    const committed = structuredClone(canonical);
    this.publishUserViews(committed);
    return committed;
  }

  async createPreparedRun(
    input: { readonly run: RoomRun; readonly characterRuns: readonly CharacterRun[] },
    signal?: AbortSignal,
  ): Promise<RoomRun> {
    const canonical = await this.validateRun(input.run, signal);
    validatePreparedCharacterRuns(canonical, input.characterRuns);
    await this.repository.createRunAggregate(
      { run: canonical, characterRuns: input.characterRuns },
      signal,
    );
    const committed = structuredClone(canonical);
    this.publishUserViews(committed);
    return committed;
  }

  private async validateRun(run: RoomRun, signal?: AbortSignal): Promise<RoomRun> {
    const canonical = parseRoomRun(run);
    const room = await this.repository.readRoom(canonical.characterRoomId, signal);
    if (!room) {
      throw roomError(
        'character-room-unavailable',
        `CharacterRoom '${canonical.characterRoomId}' is unavailable.`,
        canonical.roomRunId,
      );
    }
    const source = parseCharacterRoom(room);
    validateRoomRoster(source, canonical);
    return canonical;
  }

  async commitEvent(
    input: {
      readonly roomRunId: string;
      readonly expectedRoomRevision: number;
      readonly event: RoomEventDraft;
    },
    signal?: AbortSignal,
  ): Promise<RoomRun> {
    const committed = await this.repository.mutateRun(
      input.roomRunId,
      (current) => {
        if (current.roomRevision !== input.expectedRoomRevision) {
          throw roomError(
            'stale-room-revision',
            `Room commit expected revision ${String(input.expectedRoomRevision)} but current revision is ${String(current.roomRevision)}.`,
            current.roomRunId,
          );
        }
        if (current.events.some((event) => event.roomEventId === input.event.roomEventId)) {
          throw roomError(
            'room-event-invalid',
            `RoomEvent '${input.event.roomEventId}' is already committed.`,
            current.roomRunId,
          );
        }
        return parseRoomRun({
          ...current,
          roomRevision: current.roomRevision + 1,
          events: [
            ...current.events,
            {
              ...input.event,
              roomRunId: current.roomRunId,
              sequence: current.events.length + 1,
              createdAt: input.event.createdAt ?? this.now(),
            },
          ],
        });
      },
      signal,
    );
    this.publishUserViews(committed);
    return committed;
  }

  async readRun(roomRunId: string, signal?: AbortSignal): Promise<RoomRun> {
    return structuredClone(await this.requireRun(roomRunId, signal));
  }

  async resolveAgentModeConstraint(
    roomRunId: string,
    signal?: AbortSignal,
  ): Promise<CharacterAgentModeConstraint> {
    const run = await this.requireRun(roomRunId, signal);
    return projectCharacterAgentModeConstraint(run.mode);
  }

  async commitUserMessageAndScheduling(
    input: {
      readonly roomRunId: string;
      readonly expectedRoomRevision: number;
      readonly messageEvent: Extract<RoomEventDraft, { readonly kind: 'message' }>;
      readonly schedulingEventId: string;
    },
    signal?: AbortSignal,
  ): Promise<{ readonly run: RoomRun; readonly eligibleParticipantIds: readonly string[] }> {
    let eligibleParticipantIds: readonly string[] = [];
    const run = await this.repository.mutateRun(
      input.roomRunId,
      (current) => {
        if (current.roomRevision !== input.expectedRoomRevision) {
          throw roomError(
            'stale-room-revision',
            `Room commit expected revision ${String(input.expectedRoomRevision)} but current revision is ${String(current.roomRevision)}.`,
            current.roomRunId,
          );
        }
        const messageRun = appendEvent(current, input.messageEvent, this.now);
        eligibleParticipantIds = selectEligibleParticipants(messageRun);
        if (eligibleParticipantIds.length === 0) return messageRun;
        return appendEvent(
          messageRun,
          {
            kind: 'scheduling',
            roomEventId: input.schedulingEventId,
            visibility: { kind: 'public' },
            eligibleParticipantIds,
            reason:
              messageRun.schedulingPolicy.kind === 'mentioned'
                ? 'mention'
                : messageRun.schedulingPolicy.kind === 'turn-based'
                  ? 'turn'
                  : 'autonomous',
          },
          this.now,
        );
      },
      signal,
    );
    this.publishUserViews(run);
    return { run, eligibleParticipantIds };
  }

  async materializeView(
    input: { readonly roomRunId: string; readonly participantId: string },
    signal?: AbortSignal,
  ): Promise<RoomView> {
    const run = await this.requireRun(input.roomRunId, signal);
    return projectParticipantView(run, input.participantId);
  }

  async materializeUserView(
    input: { readonly roomRunId: string; readonly userId: string },
    signal?: AbortSignal,
  ): Promise<RoomView> {
    return projectUserView(await this.requireRun(input.roomRunId, signal), input.userId);
  }

  subscribeUserView(
    roomRunId: string,
    userId: string,
    listener: (view: RoomView) => void,
  ): () => void {
    const subscription = {
      userId: requireServiceIdentity(userId, 'Room user'),
      listener,
    };
    const identity = requireServiceIdentity(roomRunId, 'RoomRun');
    const subscribers = this.userViewSubscribers.get(identity) ?? new Set();
    subscribers.add(subscription);
    this.userViewSubscribers.set(identity, subscribers);
    return () => {
      subscribers.delete(subscription);
      if (subscribers.size === 0) this.userViewSubscribers.delete(identity);
    };
  }

  async selectEligibleParticipants(
    roomRunId: string,
    signal?: AbortSignal,
  ): Promise<readonly string[]> {
    return selectEligibleParticipants(await this.requireRun(roomRunId, signal));
  }

  private async requireRun(roomRunId: string, signal?: AbortSignal): Promise<RoomRun> {
    const run = await this.repository.readRun(roomRunId, signal);
    if (!run) {
      throw roomError('room-run-unavailable', `RoomRun '${roomRunId}' is unavailable.`, roomRunId);
    }
    return parseRoomRun(run);
  }

  private publishUserViews(run: RoomRun): void {
    const subscribers = this.userViewSubscribers.get(run.roomRunId);
    if (!subscribers) return;
    for (const subscription of subscribers) {
      subscription.listener(projectUserView(run, subscription.userId));
    }
  }
}

function projectUserView(run: RoomRun, userId: string): RoomView {
  const participant = run.participants.find(
    (candidate) => candidate.controller.kind === 'human' && candidate.controller.userId === userId,
  );
  if (!participant) {
    throw roomError(
      'room-event-invalid',
      `RoomRun '${run.roomRunId}' has no human participant for User '${userId}'.`,
      run.roomRunId,
    );
  }
  return projectParticipantView(run, participant.participantId);
}

function projectParticipantView(run: RoomRun, participantId: string): RoomView {
  if (!run.participants.some((participant) => participant.participantId === participantId)) {
    throw roomError(
      'room-event-invalid',
      `Participant '${participantId}' is not in RoomRun '${run.roomRunId}'.`,
      run.roomRunId,
    );
  }
  return parseRoomView({
    roomRunId: run.roomRunId,
    roomRevision: run.roomRevision,
    participantId,
    participants: run.participants,
    events: run.events.filter((event) => isVisibleTo(event, participantId)),
  });
}

function requireServiceIdentity(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} identity is required.`);
  return value;
}

function appendEvent(run: RoomRun, event: RoomEventDraft, now: () => string): RoomRun {
  if (run.events.some((candidate) => candidate.roomEventId === event.roomEventId)) {
    throw roomError(
      'room-event-invalid',
      `RoomEvent '${event.roomEventId}' is already committed.`,
      run.roomRunId,
    );
  }
  return parseRoomRun({
    ...run,
    roomRevision: run.roomRevision + 1,
    events: [
      ...run.events,
      {
        ...event,
        roomRunId: run.roomRunId,
        sequence: run.events.length + 1,
        createdAt: event.createdAt ?? now(),
      },
    ],
  });
}

function selectEligibleParticipants(run: RoomRun): readonly string[] {
  const agentParticipants = new Set(
    run.participants
      .filter((participant) => participant.controller.kind === 'agent')
      .map((participant) => participant.participantId),
  );
  if (run.schedulingPolicy.kind === 'mentioned') {
    const latestMessage = [...run.events]
      .reverse()
      .find((event): event is Extract<RoomEvent, { kind: 'message' }> => event.kind === 'message');
    return latestMessage?.mentionedParticipantIds.filter((id) => agentParticipants.has(id)) ?? [];
  }
  if (run.schedulingPolicy.kind === 'bounded-autonomous') {
    return run.schedulingPolicy.eligibleParticipantIds
      .filter((id) => agentParticipants.has(id))
      .slice(0, run.schedulingPolicy.maxResponsesPerCycle);
  }
  const order = run.schedulingPolicy.participantOrder.filter((id) => agentParticipants.has(id));
  if (order.length === 0) return [];
  const latestScheduledAuthor = [...run.events]
    .reverse()
    .find(
      (event): event is Extract<RoomEvent, { kind: 'message' }> =>
        event.kind === 'message' && order.includes(event.authorParticipantId),
    );
  const currentIndex = latestScheduledAuthor
    ? order.indexOf(latestScheduledAuthor.authorParticipantId)
    : -1;
  return [order[(currentIndex + 1) % order.length]!];
}

function validatePreparedCharacterRuns(run: RoomRun, characterRuns: readonly CharacterRun[]): void {
  const byId = new Map(
    characterRuns.map((characterRun) => [characterRun.characterRunId, characterRun]),
  );
  if (byId.size !== characterRuns.length) {
    throw roomError(
      'room-event-invalid',
      'Prepared RoomRun contains duplicate CharacterRuns.',
      run.roomRunId,
    );
  }
  const expected = run.participants.filter(
    (participant) => participant.controller.kind === 'agent',
  );
  if (expected.length !== characterRuns.length) {
    throw roomError(
      'room-event-invalid',
      'Prepared RoomRun must persist exactly one CharacterRun for every agent participant.',
      run.roomRunId,
    );
  }
  for (const participant of expected) {
    if (participant.controller.kind !== 'agent') continue;
    const characterRun = byId.get(participant.controller.characterRunId);
    if (
      !characterRun ||
      characterRun.participantId !== participant.participantId ||
      characterRun.characterVersionId !== participant.characterVersionId ||
      characterRun.controller.kind !== 'agent' ||
      characterRun.controller.primaryAgentSessionId !== participant.controller.primaryAgentSessionId
    ) {
      throw roomError(
        'room-event-invalid',
        `Room participant '${participant.participantId}' does not match its prepared CharacterRun.`,
        run.roomRunId,
      );
    }
  }
}

function isVisibleTo(event: RoomEvent, participantId: string): boolean {
  return (
    event.visibility.kind === 'public' ||
    (event.visibility.kind === 'private' && event.visibility.participantId === participantId) ||
    (event.visibility.kind === 'participants' &&
      event.visibility.participantIds.includes(participantId))
  );
}

function validateRoomRoster(room: CharacterRoom, run: RoomRun): void {
  if (room.participantTemplates.length !== run.participants.length) {
    throw roomError(
      'room-event-invalid',
      'RoomRun participant roster does not match its CharacterRoom template.',
      run.roomRunId,
    );
  }
  for (const template of room.participantTemplates) {
    const participant = run.participants.find(
      (candidate) => candidate.participantId === template.participantTemplateId,
    );
    if (!participant || participant.controller.kind !== template.controllerKind) {
      throw roomError(
        'room-event-invalid',
        `RoomRun participant '${template.participantTemplateId}' does not match its template controller.`,
        run.roomRunId,
      );
    }
    if (
      template.controllerKind === 'human' &&
      (participant.controller.kind !== 'human' ||
        participant.controller.userId !== template.userId ||
        participant.characterVersionId !== template.characterVersionId)
    ) {
      throw roomError(
        'room-event-invalid',
        `Human Room participant '${template.participantTemplateId}' does not match its template.`,
        run.roomRunId,
      );
    }
    if (
      template.controllerKind === 'agent' &&
      participant.characterVersionId !== template.characterVersionId
    ) {
      throw roomError(
        'room-event-invalid',
        `Agent Room participant '${template.participantTemplateId}' does not match its CharacterVersion.`,
        run.roomRunId,
      );
    }
    if (
      template.controllerKind === 'system' &&
      (participant.controller.kind !== 'system' ||
        participant.controller.systemId !== template.systemId)
    ) {
      throw roomError(
        'room-event-invalid',
        `System Room participant '${template.participantTemplateId}' does not match its template.`,
        run.roomRunId,
      );
    }
  }
}

function roomError(
  code: CharacterRoomDiagnosticCode,
  message: string,
  roomRunId?: string,
): CharacterRoomError {
  return new CharacterRoomError(code, message, roomRunId);
}
