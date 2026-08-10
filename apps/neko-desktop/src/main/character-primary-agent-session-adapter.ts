import type {
  CharacterAgentTurnContext,
  CharacterPrimaryAgentSessionPort,
} from '@neko/chara/application';
import type { AgentContextPayload } from '@neko/agent-contracts';
import type {
  AgentConversationContextAuthorityPort,
  AgentTurnConfigurationSnapshot,
  AgentWorkspaceRuntime,
} from '@neko/agent-runtime/application';
import type {
  AgentModelPolicy,
  PiProductEventSink,
  PiToolPermissionPolicy,
} from '@neko/agent-runtime/pi';

export interface CharacterPrimaryAgentTurnRuntimeSnapshot {
  readonly modelPolicy: AgentModelPolicy;
  readonly configuration: AgentTurnConfigurationSnapshot;
  readonly permissionPolicy:
    PiToolPermissionPolicy | ((events: PiProductEventSink) => PiToolPermissionPolicy);
  readonly workspaceTrusted: boolean;
  readonly locale: 'en' | 'zh';
  readonly systemPrompt?: string;
  readonly events?: PiProductEventSink;
}

export interface CharacterPrimaryAgentSessionAdapterOptions {
  readonly workspace: AgentWorkspaceRuntime;
  readonly conversationContexts: AgentConversationContextAuthorityPort;
  readonly resolveTurnRuntime: (
    characterRunId: string,
    signal?: AbortSignal,
  ) => Promise<CharacterPrimaryAgentTurnRuntimeSnapshot>;
  readonly baseSystemPrompt: (characterRunId: string) => string;
  readonly createConversationId?: (characterRunId: string) => string;
}

export type CharacterPrimaryAgentSessionAdapterDiagnosticCode =
  | 'character-agent-session-already-exists'
  | 'character-agent-session-authority-mismatch'
  | 'character-agent-session-not-unbound'
  | 'character-agent-turn-cancelled'
  | 'character-agent-turn-failed'
  | 'character-agent-turn-empty';

class CharacterPrimaryAgentSessionAdapterError extends Error {
  constructor(
    readonly code: CharacterPrimaryAgentSessionAdapterDiagnosticCode,
    message: string,
    readonly characterRunId?: string,
  ) {
    super(message);
    this.name = 'CharacterPrimaryAgentSessionAdapterError';
  }
}

export function createCharacterPrimaryAgentSessionAdapter(
  options: CharacterPrimaryAgentSessionAdapterOptions,
): CharacterPrimaryAgentSessionPort {
  const createConversationId =
    options.createConversationId ??
    ((characterRunId: string) => `conversation:character:${characterRunId}`);
  const unboundSessions = new Map<string, string>();

  return {
    async createPrimarySession(input, signal) {
      signal?.throwIfAborted();
      const primaryAgentSessionId = requireSessionIdentity(
        createConversationId(input.characterRunId),
      );
      if (
        options.workspace
          .listConversations()
          .some((record) => record.conversationId === primaryAgentSessionId)
      ) {
        throw adapterError(
          'character-agent-session-already-exists',
          `Primary AgentSession '${primaryAgentSessionId}' already exists for CharacterRun '${input.characterRunId}'.`,
          input.characterRunId,
        );
      }
      const runtime = await options.resolveTurnRuntime(input.characterRunId, signal);
      let created = false;
      let contextBound = false;
      try {
        await options.workspace.openConversation({
          conversationId: primaryAgentSessionId,
          models: options.workspace.models,
          initialModelPolicy: runtime.modelPolicy,
          baseSystemPrompt: requirePrompt(options.baseSystemPrompt(input.characterRunId)),
        });
        created = true;
        await options.conversationContexts.bindContext(
          primaryAgentSessionId,
          input.owner.kind === 'character'
            ? {
                kind: 'character',
                characterId: input.owner.characterId,
                characterVersionId: input.characterVersionId,
                characterRunId: requireMatchingCharacterRunId(
                  input.characterRunId,
                  input.owner.characterRunId,
                ),
                dialogueRunId: input.owner.dialogueRunId,
              }
            : {
                kind: 'room',
                roomId: input.owner.roomId,
                roomRunId: input.owner.roomRunId,
              },
        );
        contextBound = true;
        signal?.throwIfAborted();
        unboundSessions.set(primaryAgentSessionId, input.characterRunId);
        return { primaryAgentSessionId };
      } catch (error) {
        if (created) await options.workspace.deleteConversation(primaryAgentSessionId);
        if (contextBound) await options.conversationContexts.releaseContext(primaryAgentSessionId);
        throw error;
      }
    },

    async releaseUnboundSession(primaryAgentSessionId) {
      const characterRunId = unboundSessions.get(primaryAgentSessionId);
      if (!characterRunId) {
        throw adapterError(
          'character-agent-session-not-unbound',
          `Primary AgentSession '${primaryAgentSessionId}' is not an unbound Character session.`,
        );
      }
      await options.workspace.deleteConversation(primaryAgentSessionId);
      await options.conversationContexts.releaseContext(primaryAgentSessionId);
      unboundSessions.delete(primaryAgentSessionId);
    },

    async submitTurn(input, signal) {
      signal?.throwIfAborted();
      const expectedSessionId = requireSessionIdentity(createConversationId(input.characterRunId));
      if (input.primaryAgentSessionId !== expectedSessionId) {
        throw adapterError(
          'character-agent-session-authority-mismatch',
          `CharacterRun '${input.characterRunId}' does not own primary AgentSession '${input.primaryAgentSessionId}'.`,
          input.characterRunId,
        );
      }
      const runtime = await options.resolveTurnRuntime(input.characterRunId, signal);
      await options.workspace.openConversation({
        conversationId: input.primaryAgentSessionId,
        models: options.workspace.models,
        initialModelPolicy: runtime.modelPolicy,
        baseSystemPrompt: requirePrompt(options.baseSystemPrompt(input.characterRunId)),
      });
      const operation = options.workspace.startTurn({
        conversationId: input.primaryAgentSessionId,
        prompt: requirePrompt(input.message),
        contextPayloads: [projectCharacterAgentContextPayload(input.characterRunId, input.context)],
        modelPolicy: runtime.modelPolicy,
        configuration: runtime.configuration,
        permissionPolicy: runtime.permissionPolicy,
        workspaceTrusted: runtime.workspaceTrusted,
        locale: runtime.locale,
        ...(runtime.systemPrompt === undefined ? {} : { systemPrompt: runtime.systemPrompt }),
        ...(runtime.events === undefined ? {} : { events: runtime.events }),
      });
      try {
        await input.onTurnStarted?.(operation.identity.turnId);
      } catch (error) {
        options.workspace.cancelTurn(input.primaryAgentSessionId, operation.identity);
        await operation.completion.catch(() => undefined);
        throw error;
      }
      const cancel = (): void => {
        options.workspace.cancelTurn(input.primaryAgentSessionId, operation.identity);
      };
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        const result = await operation.completion;
        const turn = result.projection.turns.find(
          (candidate) => candidate.turnId === result.identity.turnId,
        );
        if (turn?.completion?.status === 'cancelled') {
          throw adapterError(
            'character-agent-turn-cancelled',
            `Character Agent turn '${result.identity.turnId}' was cancelled.`,
            input.characterRunId,
          );
        }
        if (!turn || turn.completion?.status !== 'completed') {
          throw adapterError(
            'character-agent-turn-failed',
            `Character Agent turn '${result.identity.turnId}' did not complete successfully.`,
            input.characterRunId,
          );
        }
        const content = turn.items
          .filter((item) => item.kind === 'assistant_text')
          .map((item) => item.payload.content)
          .join('');
        if (content.trim().length === 0) {
          throw adapterError(
            'character-agent-turn-empty',
            `Character Agent turn '${result.identity.turnId}' completed without assistant content.`,
            input.characterRunId,
          );
        }
        unboundSessions.delete(input.primaryAgentSessionId);
        return { turnId: result.identity.turnId, content };
      } finally {
        signal?.removeEventListener('abort', cancel);
      }
    },
  };
}

function projectCharacterAgentContextPayload(
  characterRunId: string,
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
        characterVersion: context.characterVersion,
        ...(context.characterStorylineRun === undefined
          ? {}
          : { characterStorylineRun: context.characterStorylineRun }),
        ...(context.characterMemoryScope === undefined
          ? {}
          : { characterMemoryScope: context.characterMemoryScope }),
        ...(context.relationship === undefined ? {} : { relationship: context.relationship }),
        ...(context.roomView === undefined ? {} : { roomView: context.roomView }),
        ...(context.presentationConfiguration === undefined
          ? {}
          : { presentationConfiguration: context.presentationConfiguration }),
      }),
    },
  };
}

function requireSessionIdentity(value: string): string {
  if (value.trim().length === 0)
    throw new Error('Character primary AgentSession identity is required.');
  return value;
}

function requirePrompt(value: string): string {
  if (value.trim().length === 0) throw new Error('Character Agent prompt is required.');
  return value;
}

function requireMatchingCharacterRunId(
  characterRunId: string,
  ownerCharacterRunId: string,
): string {
  if (characterRunId !== ownerCharacterRunId) {
    throw adapterError(
      'character-agent-session-authority-mismatch',
      `Character owner Run '${ownerCharacterRunId}' does not match '${characterRunId}'.`,
      characterRunId,
    );
  }
  return ownerCharacterRunId;
}

function adapterError(
  code: CharacterPrimaryAgentSessionAdapterDiagnosticCode,
  message: string,
  characterRunId?: string,
): CharacterPrimaryAgentSessionAdapterError {
  return new CharacterPrimaryAgentSessionAdapterError(code, message, characterRunId);
}
