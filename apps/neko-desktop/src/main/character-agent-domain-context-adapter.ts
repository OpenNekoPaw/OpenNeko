import type { AgentContextPayload } from '@neko/agent-contracts';
import type {
  CharacterAgentTurnContext,
  PreparedCharacterAgentTurn,
} from '@neko/chara/application';

export interface CharacterAgentDomainContextPort {
  prepareTurn(
    input:
      | {
          readonly topology: 'dialogue';
          readonly dialogueRunId: string;
          readonly characterRunId: string;
        }
      | {
          readonly topology: 'chatroom';
          readonly roomRunId: string;
          readonly primaryAgentSessionId: string;
        },
    signal?: AbortSignal,
  ): Promise<PreparedCharacterAgentTurn>;
  freezePreparedTurn(
    prepared: PreparedCharacterAgentTurn,
    turnId: string,
    signal?: AbortSignal,
  ): Promise<void>;
}

export async function prepareCharacterRoomAgentTurnContext(input: {
  readonly interactions: CharacterAgentDomainContextPort;
  readonly roomRunId: string;
  readonly primaryAgentSessionId: string;
  readonly characterRunId: string;
  readonly signal?: AbortSignal;
}): Promise<PreparedCharacterAgentDomainTurnContext> {
  const prepared = await input.interactions.prepareTurn(
    {
      topology: 'chatroom',
      roomRunId: input.roomRunId,
      primaryAgentSessionId: input.primaryAgentSessionId,
    },
    input.signal,
  );
  if (
    prepared.characterRunId !== input.characterRunId ||
    prepared.primaryAgentSessionId !== input.primaryAgentSessionId
  ) {
    throw new Error('Chara Room context provider prepared a different participant owner.');
  }
  return {
    contextPayloads: [
      projectCharacterAgentContextPayload(input.characterRunId, prepared.mode, prepared.context),
    ],
    onTurnStarted: (turnId) =>
      input.interactions.freezePreparedTurn(prepared, turnId, input.signal),
  };
}

export interface PreparedCharacterAgentDomainTurnContext {
  readonly contextPayloads: readonly AgentContextPayload[];
  readonly onTurnStarted: (turnId: string) => Promise<void>;
}

export async function prepareCharacterAgentTurnContext(input: {
  readonly interactions: CharacterAgentDomainContextPort;
  readonly characterRunId: string;
  readonly dialogueRunId: string;
  readonly signal?: AbortSignal;
}): Promise<PreparedCharacterAgentDomainTurnContext> {
  const prepared = await input.interactions.prepareTurn(
    {
      topology: 'dialogue',
      dialogueRunId: input.dialogueRunId,
      characterRunId: input.characterRunId,
    },
    input.signal,
  );
  if (prepared.characterRunId !== input.characterRunId) {
    throw new Error('Chara context provider prepared a different Character Run.');
  }
  return {
    contextPayloads: [
      projectCharacterAgentContextPayload(input.characterRunId, prepared.mode, prepared.context),
    ],
    onTurnStarted: (turnId) =>
      input.interactions.freezePreparedTurn(prepared, turnId, input.signal),
  };
}

export async function resolveCharacterAgentTurnContext(input: {
  readonly interactions: CharacterAgentDomainContextPort;
  readonly characterRunId: string;
  readonly dialogueRunId: string;
  readonly turnId: string;
  readonly signal?: AbortSignal;
}): Promise<readonly AgentContextPayload[]> {
  const prepared = await prepareCharacterAgentTurnContext(input);
  await prepared.onTurnStarted(input.turnId);
  return prepared.contextPayloads;
}

function projectCharacterAgentContextPayload(
  characterRunId: string,
  mode: 'companion' | 'narrative',
  context: CharacterAgentTurnContext,
): AgentContextPayload {
  return {
    type: 'character',
    id: characterRunId,
    label: context.characterVersion.label,
    summary: `Frozen Character context for ${context.characterVersion.label}.`,
    data: {
      text: JSON.stringify({
        kind: 'character-primary-turn-context',
        characterRunId,
        mode,
        instruction:
          mode === 'narrative'
            ? 'Respond only as this Character within the selected narrative context and knowledge boundary.'
            : 'Respond as this Character while acting as an identity-bearing companion assistant.',
        characterPublication: context.characterVersion,
        ...(context.narrative === undefined ? {} : { narrative: context.narrative }),
        ...(context.companionContinuity === undefined
          ? {}
          : { companionContinuity: context.companionContinuity }),
        ...(context.relationship === undefined ? {} : { relationship: context.relationship }),
        ...(context.roomView === undefined ? {} : { roomView: context.roomView }),
        ...(context.presentationConfiguration === undefined
          ? {}
          : { presentationConfiguration: context.presentationConfiguration }),
      }),
    },
  };
}
