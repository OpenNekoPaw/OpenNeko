import { parseRoomRun, type RoomRun } from '@neko/chara/contracts';
import type {
  CharacterAgentTurnResult,
  CharacterInteractionService,
  PreparedCharacterAgentTurn,
} from './character-interaction-service';
import type { CharacterRoomService } from './character-room-service';

export interface SubmitCharacterRoomMessageInput {
  readonly submissionId: string;
  readonly roomRunId: string;
  readonly userId: string;
  readonly message: string;
  readonly mentionedParticipantIds?: readonly string[];
}

export type CharacterRoomParticipantTurnOutcome =
  | {
      readonly status: 'accepted';
      readonly participantId: string;
      readonly characterRunId: string;
      readonly primaryAgentSessionId: string;
      readonly turnId: string;
      readonly roomEventId: string;
    }
  | {
      readonly status: 'rejected';
      readonly participantId: string;
      readonly characterRunId: string;
      readonly primaryAgentSessionId: string;
      readonly diagnostic: {
        readonly code: 'participant-turn-failed' | 'stale-participant-response';
        readonly message: string;
      };
    };

export interface CharacterRoomMessageSubmissionResult {
  readonly run: RoomRun;
  readonly outcomes: readonly CharacterRoomParticipantTurnOutcome[];
}

export class CharacterRoomConversationService {
  constructor(
    private readonly options: {
      readonly rooms: Pick<
        CharacterRoomService,
        'readRun' | 'commitUserMessageAndScheduling' | 'commitEvent'
      >;
      readonly interactions: Pick<
        CharacterInteractionService,
        'prepareTurn' | 'submitPreparedTurn'
      >;
    },
  ) {}

  async submitUserMessage(
    input: SubmitCharacterRoomMessageInput,
    signal?: AbortSignal,
  ): Promise<CharacterRoomMessageSubmissionResult> {
    const submissionId = requireIdentity(input.submissionId, 'Room submission');
    const roomRunId = requireIdentity(input.roomRunId, 'RoomRun');
    const userId = requireIdentity(input.userId, 'Room user');
    const message = requireText(input.message, 'Room message');
    const mentionedParticipantIds = requireUniqueIdentities(
      input.mentionedParticipantIds ?? [],
      'Room mentioned participants',
    );
    const current = await this.options.rooms.readRun(roomRunId, signal);
    const author = current.participants.find(
      (participant) =>
        participant.controller.kind === 'human' && participant.controller.userId === userId,
    );
    if (!author) {
      throw new Error(`RoomRun '${roomRunId}' has no human participant for User '${userId}'.`);
    }

    const scheduled = await this.options.rooms.commitUserMessageAndScheduling(
      {
        roomRunId,
        expectedRoomRevision: current.roomRevision,
        messageEvent: {
          kind: 'message',
          roomEventId: `room-event:${submissionId}:user`,
          visibility: { kind: 'public' },
          authorParticipantId: author.participantId,
          content: message,
          mentionedParticipantIds,
        },
        schedulingEventId: `room-event:${submissionId}:scheduling`,
      },
      signal,
    );

    const outcomes: CharacterRoomParticipantTurnOutcome[] = [];
    let run = scheduled.run;
    for (const participantId of scheduled.eligibleParticipantIds) {
      signal?.throwIfAborted();
      const participant = run.participants.find(
        (candidate) => candidate.participantId === participantId,
      );
      if (!participant || participant.controller.kind !== 'agent') {
        throw new Error(
          `Room scheduling selected non-Agent participant '${participantId}' in '${roomRunId}'.`,
        );
      }
      const controller = participant.controller;
      let prepared: PreparedCharacterAgentTurn;
      let response: CharacterAgentTurnResult;
      try {
        prepared = await this.options.interactions.prepareTurn(
          {
            topology: 'chatroom',
            roomRunId,
            primaryAgentSessionId: controller.primaryAgentSessionId,
          },
          signal,
        );
        response = await this.options.interactions.submitPreparedTurn(prepared, message, signal);
      } catch (error) {
        signal?.throwIfAborted();
        outcomes.push({
          status: 'rejected',
          participantId,
          characterRunId: controller.characterRunId,
          primaryAgentSessionId: controller.primaryAgentSessionId,
          diagnostic: {
            code: 'participant-turn-failed',
            message: describeError(error),
          },
        });
        continue;
      }
      const expectedRoomRevision = prepared.context.roomView?.roomRevision;
      if (expectedRoomRevision === undefined) {
        throw new Error(
          `Room participant '${participantId}' was prepared without an authoritative RoomView.`,
        );
      }
      const roomEventId = `room-event:${submissionId}:response:${participantId}`;
      try {
        run = await this.options.rooms.commitEvent(
          {
            roomRunId,
            expectedRoomRevision,
            event: {
              kind: 'message',
              roomEventId,
              visibility: { kind: 'public' },
              authorParticipantId: participantId,
              content: response.content,
              mentionedParticipantIds: [],
            },
          },
          signal,
        );
        outcomes.push({
          status: 'accepted',
          participantId,
          characterRunId: prepared.characterRunId,
          primaryAgentSessionId: prepared.primaryAgentSessionId,
          turnId: response.turnId,
          roomEventId,
        });
      } catch (error) {
        signal?.throwIfAborted();
        outcomes.push({
          status: 'rejected',
          participantId,
          characterRunId: prepared.characterRunId,
          primaryAgentSessionId: prepared.primaryAgentSessionId,
          diagnostic: {
            code: 'stale-participant-response',
            message: describeError(error),
          },
        });
        run = await this.options.rooms.readRun(roomRunId, signal);
      }
    }
    return { run: parseRoomRun(run), outcomes };
  }
}

function requireIdentity(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} identity is required.`);
  return value;
}

function requireText(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} is required.`);
  return value;
}

function requireUniqueIdentities(values: readonly string[], label: string): readonly string[] {
  const parsed = values.map((value) => requireIdentity(value, label));
  if (new Set(parsed).size !== parsed.length) throw new Error(`${label} contains duplicates.`);
  return parsed;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
