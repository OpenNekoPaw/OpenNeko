import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAssistantMessageEventStream,
  createModels,
  createProvider,
  type Api,
  type AssistantMessage,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from '@earendil-works/pi-ai';
import {
  CharacterInteractionService,
  type CharacterInteractionRepository,
  type CharacterRoomViewPort,
  type CharacterWorldViewPort,
} from '@neko/chara/application';
import {
  parseCharacterRun,
  parseDialogueRun,
  parseRoomRun,
  type CharacterRun,
  type CharacterVersion,
  type DialogueRun,
  type RoomRun,
  type RoomView,
  type UserCharacterRelationship,
} from '@neko/chara/contracts';
import {
  EFFECTIVE_AGENT_CONFIG_DIMENSIONS,
  type EffectiveAgentConfigurationProjection,
  type Tool,
} from '@neko/agent-contracts';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodePiConversationCatalogReader, resolveAgentModelPolicy } from '@neko/agent-runtime/pi';
import {
  createAgentAppHost,
  type AgentAppHost,
  type AgentTurnConfigurationSnapshot,
  type AgentWorkspaceRuntime,
} from '@neko/agent-runtime/application';
import {
  createCharacterPrimaryAgentSessionAdapter,
  type CharacterPrimaryAgentTurnRuntimeSnapshot,
} from './character-primary-agent-session-adapter';
import { createAgentCredentialRuntime } from '@neko/agent-runtime/pi';

const NOW = '2026-08-09T10:00:00.000Z';
const MODEL: Model<'openai-completions'> = {
  id: 'character-main',
  name: 'Character Main',
  api: 'openai-completions',
  provider: 'character-fixture',
  baseUrl: 'https://fixture.invalid/api',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8_192,
  maxTokens: 2_048,
};

describe('Character primary AgentSession adapter', () => {
  const roots: string[] = [];
  const hosts: AgentAppHost[] = [];

  afterEach(async () => {
    await Promise.allSettled(hosts.splice(0).map((host) => host.dispose()));
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('keeps Dialogue Tool, Approval, transcript and compaction on one primary Pi session', async () => {
    const approval = deferred<boolean>();
    let approvalRequested = false;
    let toolExecutions = 0;
    const prompts: string[] = [];
    const fixture = await createFixture((model, context) => {
      if ((context.systemPrompt ?? '').includes('context summarization assistant')) {
        return completedStream(assistant('Pi-owned Character summary'));
      }
      const prompt = lastUserPrompt(context);
      prompts.push(prompt);
      if (context.messages.some((message) => message.role === 'toolResult')) {
        return completedStream(assistant('Dialogue completed through Pi'));
      }
      return completedStream(assistantToolCall(model, 'CharacterFixtureTool'));
    });
    fixture.workspace.tools.register({
      ...fixtureTool(),
      execute: async () => {
        toolExecutions += 1;
        return { success: true, data: { source: 'pi-tool-registry' } };
      },
    });
    const repository = interactionRepository();
    repository.versions.set('character-version-a', publication('character-version-a'));
    repository.relationships.set(
      'relationship-a',
      relationship('relationship-a', 'character-version-a'),
    );
    const service = interactionService(repository, fixture, async () => ({
      ...turnRuntime(),
      permissionPolicy: {
        preflight: async ({ signal }) => {
          approvalRequested = true;
          if (signal?.aborted) return { allowed: false, reason: 'cancelled' };
          const allowed = await Promise.race([
            approval.promise,
            new Promise<false>((resolve) =>
              signal?.addEventListener('abort', () => resolve(false), { once: true }),
            ),
          ]);
          return allowed ? { allowed: true } : { allowed: false, reason: 'fixture-denied' };
        },
      },
    }));
    const created = await service.createDialogue({
      dialogueRunId: 'dialogue-run-a',
      characterRunId: 'character-run-a',
      characterVersionId: 'character-version-a',
      userParticipantId: 'participant-user',
      characterParticipantId: 'participant-character-a',
      controller: { kind: 'agent' },
      runtimeKind: 'companion',
      relationshipId: 'relationship-a',
    });
    const primaryAgentSessionId = requireAgentSessionId(created.characterRun);
    const turn = service.submitTurn({
      topology: 'dialogue',
      dialogueRunId: 'dialogue-run-a',
      characterRunId: 'character-run-a',
      message: 'Use the approved Character Tool.',
    });

    await vi.waitFor(() => expect(approvalRequested).toBe(true));
    expect(toolExecutions).toBe(0);
    expect(fixture.workspace.readActiveTurn(primaryAgentSessionId)).toBeDefined();
    approval.resolve(true);
    await expect(turn).resolves.toMatchObject({ content: 'Dialogue completed through Pi' });

    const evidence = fixture.workspace.readConversationEvidence(primaryAgentSessionId);
    expect(evidence).toMatchObject({
      conversationId: primaryAgentSessionId,
      branchId: 'main',
      piSessionId: expect.any(String),
    });
    expect(toolExecutions).toBe(1);
    expect(prompts[0]).toContain('"characterVersionId":"character-version-a"');
    expect(prompts[0]).toContain('"relationshipId":"relationship-a"');
    const transcript = JSON.stringify(
      await fixture.workspace.readConversationEntries(primaryAgentSessionId),
    );
    expect(transcript).toContain('Use the approved Character Tool.');
    expect(transcript).toContain('pi-tool-registry');

    const compacted = await fixture.workspace.compactContext(primaryAgentSessionId, 10);
    expect(compacted.performed).toBe(true);
    expect(
      (await fixture.workspace.readConversationEntries(primaryAgentSessionId)).some(
        (entry) => entry.type === 'compaction',
      ),
    ).toBe(true);
  });

  it('cancels only the exact Chatroom participant Pi turn and preserves a sibling session', async () => {
    const roomStarted = deferred<void>();
    const fixture = await createFixture((_model, context, options) => {
      const prompt = lastUserPrompt(context);
      if (prompt.includes('wait in room')) {
        const stream = createAssistantMessageEventStream();
        queueMicrotask(() => {
          stream.push({ type: 'start', partial: assistant('waiting') });
          roomStarted.resolve();
          options?.signal?.addEventListener(
            'abort',
            () => {
              stream.push({
                type: 'error',
                reason: 'aborted',
                error: { ...assistant('cancelled'), stopReason: 'aborted' },
              });
            },
            { once: true },
          );
        });
        return stream;
      }
      return completedStream(assistant('Sibling dialogue remains available'));
    });
    const repository = interactionRepository();
    for (const suffix of ['a', 'b']) {
      repository.versions.set(
        `character-version-${suffix}`,
        publication(`character-version-${suffix}`),
      );
      repository.relationships.set(
        `relationship-${suffix}`,
        relationship(`relationship-${suffix}`, `character-version-${suffix}`),
      );
    }
    const conversationContexts = memoryConversationContexts();
    const adapter = createCharacterPrimaryAgentSessionAdapter({
      workspace: fixture.workspace,
      conversationContexts,
      resolveTurnRuntime: async () => turnRuntime(),
      baseSystemPrompt: (characterRunId) => `Primary Character Agent for ${characterRunId}`,
    });
    const service = new CharacterInteractionService({
      repository,
      agentSessions: adapter,
      roomViews: roomViews(repository),
      worldViews: noWorldViews(),
      now: () => NOW,
    });
    const sibling = await service.createDialogue({
      dialogueRunId: 'dialogue-run-a',
      characterRunId: 'character-run-a',
      characterVersionId: 'character-version-a',
      userParticipantId: 'participant-user',
      characterParticipantId: 'participant-character-a',
      controller: { kind: 'agent' },
      runtimeKind: 'companion',
      relationshipId: 'relationship-a',
    });
    const roomSession = await adapter.createPrimarySession({
      characterRunId: 'character-run-b',
      purpose: 'character.primary',
      owner: { kind: 'room', roomId: 'character-room-a', roomRunId: 'room-run-a' },
    });
    await expect(
      conversationContexts.readContext(requireAgentSessionId(sibling.characterRun)),
    ).resolves.toMatchObject({
      kind: 'character',
      characterId: 'project:character-version-a',
      characterRunId: 'character-run-a',
    });
    await expect(
      conversationContexts.readContext(roomSession.primaryAgentSessionId),
    ).resolves.toMatchObject({
      kind: 'room',
      roomId: 'character-room-a',
      roomRunId: 'room-run-a',
    });
    repository.characterRuns.set(
      'character-run-b',
      parseCharacterRun({
        characterRunId: 'character-run-b',
        characterVersionId: 'character-version-b',
        participantId: 'participant-character-b',
        controller: { kind: 'agent', ...roomSession },
        runtimeBinding: { kind: 'companion', relationshipId: 'relationship-b' },
        createdAt: NOW,
      }),
    );
    repository.rooms.set(
      'room-run-a',
      parseRoomRun({
        topology: 'chatroom',
        roomRunId: 'room-run-a',
        characterRoomId: 'character-room-a',
        roomRevision: 0,
        participants: [
          {
            participantId: 'participant-user',
            displayName: 'User',
            controller: { kind: 'human', userId: 'user-a' },
          },
          {
            participantId: 'participant-character-b',
            displayName: 'Character B',
            characterVersionId: 'character-version-b',
            controller: {
              kind: 'agent',
              characterRunId: 'character-run-b',
              primaryAgentSessionId: roomSession.primaryAgentSessionId,
            },
          },
        ],
        schedulingPolicy: { kind: 'mentioned' },
        events: [],
        runtimeKind: 'companion',
        relationshipIds: ['relationship-b'],
        createdAt: NOW,
      }),
    );
    const controller = new AbortController();
    const roomTurn = service.submitTurn(
      {
        topology: 'chatroom',
        roomRunId: 'room-run-a',
        primaryAgentSessionId: roomSession.primaryAgentSessionId,
        message: 'wait in room',
      },
      controller.signal,
    );

    await roomStarted.promise;
    controller.abort();
    await expect(roomTurn).rejects.toMatchObject({ code: 'character-agent-turn-cancelled' });
    const roomProjection = fixture.workspace.readConversationProjection(
      roomSession.primaryAgentSessionId,
    );
    expect(roomProjection.turns.at(-1)?.completion?.status).toBe('cancelled');

    const siblingSessionId = requireAgentSessionId(sibling.characterRun);
    expect(roomSession.primaryAgentSessionId).not.toBe(siblingSessionId);
    expect(
      fixture.workspace.readConversationEvidence(roomSession.primaryAgentSessionId).piSessionId,
    ).not.toBe(fixture.workspace.readConversationEvidence(siblingSessionId).piSessionId);
    await expect(
      service.submitTurn({
        topology: 'dialogue',
        dialogueRunId: 'dialogue-run-a',
        characterRunId: 'character-run-a',
        message: 'continue sibling',
      }),
    ).resolves.toMatchObject({ content: 'Sibling dialogue remains available' });
  });

  async function createFixture(
    streamSimple: (
      model: Model<Api>,
      context: Context,
      options?: SimpleStreamOptions,
    ) => ReturnType<typeof createAssistantMessageEventStream>,
  ) {
    const root = await mkdtemp(join(tmpdir(), 'neko-character-agent-'));
    roots.push(root);
    const userHome = join(root, 'home');
    const userDataRoot = join(userHome, '.neko');
    const workspacePath = join(root, 'workspace');
    await mkdir(workspacePath, { recursive: true });
    const host = createAgentAppHost({
      userDataRoot,
      userHome,
      hostId: 'character-agent-host',
      credentialRuntime: createAgentCredentialRuntime({
        secrets: {
          get: async () => undefined,
          set: async () => undefined,
          delete: async () => undefined,
        },
        configCredentials: { read: async () => undefined },
        prompt: { text: async () => null, select: async () => null, notify: () => undefined },
      }),
      catalogReader: await NodePiConversationCatalogReader.create({ userDataRoot }),
      createIdentity: (() => {
        let identity = 0;
        return () => `character-agent-identity-${(identity += 1)}`;
      })(),
    });
    hosts.push(host);
    const workspaceResolution: AssetWorkspaceResolution = {
      workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      workspacePath,
      displayName: 'Character Agent Fixture',
      locator: { kind: 'variable', value: '${HOME}/character-agent-fixture' },
    };
    const workspace = await host.attachWorkspace(workspaceResolution);
    const models = createModels();
    models.setProvider(
      createProvider({
        id: MODEL.provider,
        models: [MODEL],
        auth: {
          apiKey: {
            name: 'Fixture',
            resolve: async () => ({ auth: { apiKey: 'redacted-character-fixture' } }),
          },
        },
        api: { stream: streamSimple, streamSimple },
      }),
    );
    workspace.models.setProvider(models.getProvider(MODEL.provider)!);
    return { host, workspace };
  }
});

function interactionService(
  repository: ReturnType<typeof interactionRepository>,
  fixture: { readonly workspace: AgentWorkspaceRuntime },
  resolveTurnRuntime: (
    characterRunId: string,
    signal?: AbortSignal,
  ) => Promise<CharacterPrimaryAgentTurnRuntimeSnapshot>,
): CharacterInteractionService {
  return new CharacterInteractionService({
    repository,
    agentSessions: createCharacterPrimaryAgentSessionAdapter({
      workspace: fixture.workspace,
      conversationContexts: memoryConversationContexts(),
      resolveTurnRuntime,
      baseSystemPrompt: (characterRunId) => `Primary Character Agent for ${characterRunId}`,
    }),
    roomViews: roomViews(repository),
    worldViews: noWorldViews(),
    now: () => NOW,
  });
}

function memoryConversationContexts() {
  const contexts = new Map<string, import('@neko/agent-contracts').AgentConversationContext>();
  return {
    async bindContext(
      conversationId: string,
      context: import('@neko/agent-contracts').AgentConversationContext,
    ) {
      const existing = contexts.get(conversationId);
      if (existing && JSON.stringify(existing) !== JSON.stringify(context)) {
        throw new Error(`Conversation '${conversationId}' context changed.`);
      }
      contexts.set(conversationId, structuredClone(context));
    },
    async releaseContext(conversationId: string) {
      if (!contexts.delete(conversationId)) {
        throw new Error(`Conversation '${conversationId}' context is not present.`);
      }
    },
    async readContext(conversationId: string) {
      const context = contexts.get(conversationId);
      return context ? structuredClone(context) : undefined;
    },
  };
}

function interactionRepository() {
  return new (class implements CharacterInteractionRepository {
    readonly versions = new Map<string, CharacterVersion>();
    readonly relationships = new Map<string, UserCharacterRelationship>();
    readonly characterRuns = new Map<string, CharacterRun>();
    readonly dialogues = new Map<string, DialogueRun>();
    readonly rooms = new Map<string, RoomRun>();

    async readPublication(characterVersionId: string) {
      return cloneOptional(this.versions.get(characterVersionId));
    }
    async readRelationship(relationshipId: string) {
      return cloneOptional(this.relationships.get(relationshipId));
    }
    async createDialogue(input: {
      readonly characterRun: CharacterRun;
      readonly dialogueRun: DialogueRun;
    }) {
      this.characterRuns.set(
        input.characterRun.characterRunId,
        structuredClone(input.characterRun),
      );
      this.dialogues.set(input.dialogueRun.dialogueRunId, structuredClone(input.dialogueRun));
    }
    async readCharacterRun(characterRunId: string) {
      return cloneOptional(this.characterRuns.get(characterRunId));
    }
    async readDialogueRun(dialogueRunId: string) {
      return cloneOptional(this.dialogues.get(dialogueRunId));
    }
    async readRoomRun(roomRunId: string) {
      return cloneOptional(this.rooms.get(roomRunId));
    }
  })();
}

function roomViews(repository: ReturnType<typeof interactionRepository>): CharacterRoomViewPort {
  return {
    async materializeRoomView(roomRunId, participantId): Promise<RoomView> {
      const room = repository.rooms.get(roomRunId);
      if (!room) throw new Error(`RoomRun '${roomRunId}' is unavailable.`);
      return {
        roomRunId,
        roomRevision: room.roomRevision,
        participantId,
        participants: structuredClone(room.participants),
        events: structuredClone(room.events),
      };
    },
  };
}

function noWorldViews(): CharacterWorldViewPort {
  return {
    validateBinding: async () => undefined,
    materializeWorldView: async () => {
      throw new Error('WorldView is not expected in the companion fixture.');
    },
  };
}

function publication(characterVersionId: string): CharacterVersion {
  return {
    characterVersionId,
    characterProjectId: `project:${characterVersionId}`,
    label: characterVersionId,
    definition: {
      summary: `Profile ${characterVersionId}`,
      canon: [],
      knowledgeBoundary: [],
      behaviorPolicy: [],
      expressionPolicy: [],
      representationRefs: [],
    },
    acceptedEvidenceIds: [],
    publishedAt: NOW,
  };
}

function relationship(
  relationshipId: string,
  characterVersionId: string,
): UserCharacterRelationship {
  return {
    relationshipId,
    userId: 'user-a',
    characterVersionId,
    memories: [],
    candidates: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function turnRuntime(): CharacterPrimaryAgentTurnRuntimeSnapshot {
  return {
    modelPolicy: resolveAgentModelPolicy({
      catalog: [
        { model: MODEL, capabilities: ['llm.chat', 'tools'], credentialState: 'configured' },
      ],
      userBindings: { 'agent.main': { providerId: MODEL.provider, modelId: MODEL.id } },
    }),
    configuration: fixtureConfiguration(),
    permissionPolicy: { preflight: () => ({ allowed: true }) },
    workspaceTrusted: true,
    locale: 'en',
  };
}

function fixtureConfiguration(): AgentTurnConfigurationSnapshot {
  const projection: EffectiveAgentConfigurationProjection = Object.freeze({
    profileId: 'effective-character-agent-fixture',
    digest: `sha256:${'a'.repeat(64)}`,
    values: Object.freeze({
      modelBinding: Object.freeze({
        purpose: 'agent.main',
        providerId: MODEL.provider,
        modelId: MODEL.id,
      }),
      temperature: 0.7,
      maxTokens: MODEL.maxTokens,
      thinkingBudget: 0,
      executionMode: 'ask',
      outputFormat: 'markdown',
    }),
    sources: Object.freeze({
      modelBinding: 'runtime',
      temperature: 'default',
      maxTokens: 'default',
      thinkingBudget: 'default',
      executionMode: 'default',
      outputFormat: 'default',
    }),
    dimensions: EFFECTIVE_AGENT_CONFIG_DIMENSIONS,
  });
  return Object.freeze({ requested: projection, effective: projection, diagnostics: [] });
}

function fixtureTool(): Tool {
  return {
    name: 'CharacterFixtureTool',
    description: 'Exercises the canonical Pi Tool and Approval path for a Character turn.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    category: 'system',
    isReadOnly: false,
    execute: async () => ({ success: true }),
  };
}

function assistant(text: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'openai-completions',
    provider: MODEL.provider,
    model: MODEL.id,
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  };
}

function assistantToolCall(model: Model<Api>, name: string): AssistantMessage {
  return {
    ...assistant(''),
    api: model.api,
    provider: model.provider,
    model: model.id,
    content: [{ type: 'toolCall', id: 'character-fixture-tool-call', name, arguments: {} }],
    stopReason: 'toolUse',
  };
}

function completedStream(message: AssistantMessage) {
  const stream = createAssistantMessageEventStream();
  queueMicrotask(() => {
    stream.push({ type: 'start', partial: message });
    stream.push({ type: 'done', reason: 'stop', message });
  });
  return stream;
}

function lastUserPrompt(context: Context): string {
  const message = [...context.messages].reverse().find((candidate) => candidate.role === 'user');
  if (!message) throw new Error('Character fixture received no user prompt.');
  if (typeof message.content === 'string') return message.content;
  return message.content
    .filter((content) => content.type === 'text')
    .map((content) => content.text)
    .join('');
}

function requireAgentSessionId(run: CharacterRun): string {
  if (run.controller.kind !== 'agent')
    throw new Error('Expected an agent-controlled CharacterRun.');
  return run.controller.primaryAgentSessionId;
}

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
