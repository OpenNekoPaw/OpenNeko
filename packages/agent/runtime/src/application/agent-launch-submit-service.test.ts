import { describe, expect, it, vi } from 'vitest';
import {
  createAgentConversationLifecycleService,
  createInMemoryAgentConversationLifecycleRepository,
} from './agent-conversation-lifecycle-service';
import {
  createAgentLaunchDraftSubmissionApplicationService,
  isAgentLaunchConversationCreationCommand,
} from './agent-launch-submit-service';
import { projectAgentConfigurationPolicy } from './agent-launch-service';

const binding = {
  kind: 'assistant' as const,
  assistantSpaceId: 'assistant:local',
  baseGrantIds: [],
};
const connection = {
  applicationInstanceId: 'application:one',
  windowId: 'window:one',
  workbenchInstanceId: 'workbench:one',
  agentSurfaceId: 'surface:one',
  viewId: 'view:one',
  draftId: 'draft:one',
  connectionId: 'connection:one',
};
const draftInput = {
  draft: {
    phase: 'draft' as const,
    draftId: 'draft:one',
    binding,
    bindingReceipt: {
      bindingReceiptId: 'binding-receipt:one',
      draftId: 'draft:one',
      connectionId: 'connection:one',
      binding,
    },
  },
  entryTargetReceipt: null,
  input: { kind: 'message' as const, text: 'Hello' },
  references: [],
  resourceGrantIds: [],
  purposeModels: {
    'image.generate': {
      providerId: 'image-provider',
      modelId: 'image-model',
      category: 'image' as const,
    },
  },
  configuration: {
    modelCatalogEntryId: 'openai:gpt-5',
    providerId: 'openai',
    modelId: 'gpt-5',
    executionMode: 'ask' as const,
  },
};

describe('Agent launch Draft submission application service', () => {
  it('recognizes only the exact typed /new launch command', () => {
    expect(
      isAgentLaunchConversationCreationCommand({
        kind: 'command',
        catalogEntryId: 'command:builtin:new',
        commandId: 'new',
        handlerId: 'builtin:new',
      }),
    ).toBe(true);
    expect(
      isAgentLaunchConversationCreationCommand({
        kind: 'command',
        catalogEntryId: 'command:builtin:help',
        commandId: 'help',
        handlerId: 'builtin:help',
      }),
    ).toBe(false);
  });

  it('materializes the explicit default Assistant for an unbound Entry submit', async () => {
    const fixture = createFixture();
    const unboundInput = {
      ...draftInput,
      draft: {
        phase: 'draft' as const,
        draftId: draftInput.draft.draftId,
        binding: { kind: 'unbound' as const },
        bindingReceipt: null,
      },
    };

    await expect(
      fixture.service.submit({
        requestId: 'request:unbound-entry',
        connection,
        draftInput: unboundInput,
      }),
    ).resolves.toMatchObject({
      session: { phase: 'session', binding },
      turnStatus: 'running',
    });

    expect(fixture.entry.materialize).toHaveBeenCalledOnce();
    expect(fixture.bindings.resolve).not.toHaveBeenCalled();
    expect(fixture.scene.validate).toHaveBeenCalledWith(
      expect.objectContaining({ binding: { kind: 'unbound' } }),
    );
    await fixture.lifecycle.waitForProviderIdle();
  });

  it('commits, materializes, hands off and starts the exact pending Turn in order', async () => {
    const fixture = createFixture();
    const contextReferences = [
      {
        type: 'file' as const,
        id: 'reference:notes.fountain',
        label: 'notes.fountain',
        mediaType: 'text' as const,
        contentLocator: { file: { authority: 'workspace' as const, path: 'notes.fountain' } },
      },
    ];
    fixture.resources.validate.mockReturnValueOnce(contextReferences);

    const submitted = fixture.service.submit({ requestId: 'request:one', connection, draftInput });
    await expect(submitted).resolves.toMatchObject({
      session: { phase: 'session', binding },
      turnStatus: 'running',
    });

    expect(fixture.launch.validateDraftSubmit).toHaveBeenCalledWith(connection, draftInput);
    expect(fixture.bindings.resolve).toHaveBeenCalledWith(binding);
    expect(fixture.events).toEqual(['materialize', 'resource-commit', 'scene-handoff', 'execute']);
    await fixture.lifecycle.waitForProviderIdle();
    expect(fixture.provider.start).toHaveBeenCalledWith(
      expect.objectContaining({ purposeModels: draftInput.purposeModels }),
    );
    const result = await submitted;
    await expect(
      fixture.lifecycle.readConversation(result.session.conversationId),
    ).resolves.toEqual(
      expect.objectContaining({
        initialInput: expect.objectContaining({ contextReferences }),
      }),
    );
  });

  it('replays one request without resolving another owner or starting another provider call', async () => {
    const fixture = createFixture();
    const first = await fixture.service.submit({
      requestId: 'request:replay',
      connection,
      draftInput,
    });
    await fixture.lifecycle.waitForProviderIdle();
    const replay = await fixture.service.submit({
      requestId: 'request:replay',
      connection,
      draftInput,
    });

    expect(replay.session.conversationId).toBe(first.session.conversationId);
    expect(replay.turnId).toBe(first.turnId);
    expect(fixture.bindings.resolve).toHaveBeenCalledOnce();
    expect(fixture.provider.start).toHaveBeenCalledOnce();
    expect(fixture.scene.handoff).toHaveBeenCalledTimes(2);
  });

  it('materializes one exact Character Dialogue runtime before committing its Conversation', async () => {
    const fixture = createFixture();
    const characterBinding = {
      kind: 'character' as const,
      characterId: 'character-project-1',
      characterVersionId: 'character-version-1',
      characterRunId: 'character-run-1',
      roleProfileId: 'role-profile-1',
      dialogueRunId: 'dialogue-run-1',
    };
    fixture.runtimeEntry.materialize.mockImplementationOnce(async () => {
      fixture.events.push('runtime-materialize');
      return {
        conversationId: 'conversation:character:character-run-1',
        context: characterBinding,
      };
    });
    const runtimeInput = {
      ...draftInput,
      draft: {
        phase: 'draft' as const,
        draftId: draftInput.draft.draftId,
        binding: { kind: 'unbound' as const },
        bindingReceipt: null,
      },
      entryTargetReceipt: {
        targetReceiptId: 'target-receipt:character-1',
        draftId: draftInput.draft.draftId,
        connectionId: connection.connectionId,
        mode: 'character-dialogue' as const,
        binding: {
          kind: 'character-dialogue' as const,
          mode: 'companion' as const,
          participants: [
            {
              globalCharacterId: 'character-project-1',
              characterVersionId: 'character-version-1',
              roleProfileId: 'role-profile-1',
            },
          ],
        },
      },
    };

    const first = await fixture.service.submit({
      requestId: 'request:character-1',
      connection,
      draftInput: runtimeInput,
    });
    await fixture.lifecycle.waitForProviderIdle();
    const replay = await fixture.service.submit({
      requestId: 'request:character-1',
      connection,
      draftInput: runtimeInput,
    });

    expect(first.session.binding).toEqual(characterBinding);
    expect(first.session.conversationId).toBe('conversation:character:character-run-1');
    expect(replay.session.conversationId).toBe(first.session.conversationId);
    expect(fixture.runtimeEntry.validate).toHaveBeenCalledOnce();
    expect(fixture.runtimeEntry.materialize).toHaveBeenCalledOnce();
    expect(fixture.entry.materialize).not.toHaveBeenCalled();
    expect(fixture.bindings.resolve).not.toHaveBeenCalled();
    expect(fixture.events.slice(0, 2)).toEqual(['runtime-materialize', 'materialize']);
  });

  it('blocks an unavailable formal runtime owner before Conversation or provider commit', async () => {
    const fixture = createFixture();
    fixture.runtimeEntry.materialize.mockRejectedValueOnce(
      new Error(
        '[world/world-experience-provider-unavailable] World Experience launch is unavailable.',
      ),
    );
    const worldInput = {
      ...draftInput,
      draft: {
        phase: 'draft' as const,
        draftId: draftInput.draft.draftId,
        binding: { kind: 'unbound' as const },
        bindingReceipt: null,
      },
      entryTargetReceipt: {
        targetReceiptId: 'target-receipt:world-1',
        draftId: draftInput.draft.draftId,
        connectionId: connection.connectionId,
        mode: 'world-experience' as const,
        binding: {
          kind: 'world-experience' as const,
          globalWorldId: 'global-world-1',
          worldVersionId: 'world-version-1',
          participants: [],
          launch: { kind: 'new' as const },
        },
      },
    };

    await expect(
      fixture.service.submit({
        requestId: 'request:world-unavailable',
        connection,
        draftInput: worldInput,
      }),
    ).rejects.toThrow('[world/world-experience-provider-unavailable]');
    expect(fixture.session.materialize).not.toHaveBeenCalled();
    expect(fixture.provider.start).not.toHaveBeenCalled();
    expect(fixture.resources.commit).not.toHaveBeenCalled();
    expect(fixture.scene.handoff).not.toHaveBeenCalled();
  });

  it('rejects unavailable owners and unregistered commands before any local commit', async () => {
    const fixture = createFixture();
    fixture.bindings.resolve.mockResolvedValueOnce({
      status: 'unavailable',
      diagnostic: {
        code: 'assistant-space-unavailable',
        owner: 'assistant:missing',
        message: 'Assistant Space is unavailable.',
      },
    });
    await expect(
      fixture.service.submit({ requestId: 'request:unavailable', connection, draftInput }),
    ).rejects.toThrow('[assistant:missing/assistant-space-unavailable]');
    expect(fixture.session.materialize).not.toHaveBeenCalled();
    expect(fixture.resources.commit).not.toHaveBeenCalled();

    const commandInput = {
      ...draftInput,
      input: {
        kind: 'command' as const,
        catalogEntryId: 'command:builtin:help',
        commandId: 'help',
        handlerId: 'builtin:help',
      },
    };
    fixture.commands.validate.mockImplementationOnce(() => {
      throw new Error("Command handler 'builtin:help' is unavailable.");
    });
    await expect(
      fixture.service.submit({
        requestId: 'request:command',
        connection,
        draftInput: commandInput,
      }),
    ).rejects.toThrow("Command handler 'builtin:help' is unavailable");
    expect(fixture.bindings.resolve).toHaveBeenCalledOnce();
    expect(fixture.session.materialize).not.toHaveBeenCalled();
  });

  it('rejects a conflicting replay while preserving the committed sibling Conversation', async () => {
    const fixture = createFixture();
    const committed = await fixture.service.submit({
      requestId: 'request:conflict',
      connection,
      draftInput,
    });
    await fixture.lifecycle.waitForProviderIdle();

    await expect(
      fixture.service.submit({
        requestId: 'request:conflict',
        connection,
        draftInput: { ...draftInput, input: { kind: 'message', text: 'Different' } },
      }),
    ).rejects.toThrow('conflicts with its committed input');
    await expect(
      fixture.lifecycle.readConversation(committed.session.conversationId),
    ).resolves.toMatchObject({ pendingTurn: { status: 'completed' } });
    expect(fixture.provider.start).toHaveBeenCalledOnce();
  });

  it('preflights Resource commit and Scene handoff before materializing domain or Conversation state', async () => {
    const resourceFailure = createFixture();
    resourceFailure.resources.validate.mockImplementationOnce(() => {
      throw new Error('Resource grant belongs to another launch connection.');
    });
    await expect(
      resourceFailure.service.submit({
        requestId: 'request:resource-failure',
        connection,
        draftInput,
      }),
    ).rejects.toThrow('another launch connection');
    expect(resourceFailure.bindings.resolve).not.toHaveBeenCalled();
    expect(resourceFailure.session.materialize).not.toHaveBeenCalled();

    const sceneFailure = createFixture();
    sceneFailure.scene.validate.mockRejectedValueOnce(
      new Error('Draft is not the exact active presentation.'),
    );
    await expect(
      sceneFailure.service.submit({
        requestId: 'request:scene-failure',
        connection,
        draftInput,
      }),
    ).rejects.toThrow('exact active presentation');
    expect(sceneFailure.bindings.resolve).not.toHaveBeenCalled();
    expect(sceneFailure.session.materialize).not.toHaveBeenCalled();
    expect(sceneFailure.resources.commit).not.toHaveBeenCalled();
  });
});

function createFixture() {
  let identity = 0;
  const events: string[] = [];
  const launch = {
    validateDraftSubmit: vi.fn(() =>
      projectAgentConfigurationPolicy({
        models: [
          {
            id: draftInput.configuration.modelCatalogEntryId,
            label: 'GPT-5',
            providerId: draftInput.configuration.providerId,
            modelId: draftInput.configuration.modelId,
            modelType: 'llm',
            contextWindow: 128_000,
            maximumOutputTokens: 16_384,
            purposeCapabilities: ['agent.main'],
            availability: { status: 'available' },
          },
        ],
        request: draftInput.configuration,
        source: 'draft-request',
        defaults: {
          executionMode: 'ask',
          temperature: 0.7,
          maximumOutputTokens: 4096,
          thinkingBudget: 0,
        },
      }),
    ),
  };
  const bindings = {
    resolve: vi.fn(async () => ({ status: 'available' as const, binding, contextPayloads: [] })),
  };
  const entry = {
    materialize: vi.fn(async () => binding),
  };
  const runtimeEntry = {
    validate: vi.fn(async () => undefined),
    materialize: vi.fn(async () => {
      throw new Error('Formal runtime Entry owner is unavailable.');
    }),
  };
  const session = {
    materialize: vi.fn(async () => {
      events.push('materialize');
    }),
  };
  const provider = {
    start: vi.fn(async () => {
      events.push('execute');
    }),
  };
  const lifecycle = createAgentConversationLifecycleService({
    repository: createInMemoryAgentConversationLifecycleRepository(),
    grants: { validate: async () => undefined, resolveForTurn: async () => [] },
    domainContext: {
      resolveCapabilityConstraint: async ({ context }) => ({
        owner: { kind: context.kind, id: 'test-binding' },
        skills: 'configured' as const,
        tools: 'configured' as const,
        references: 'configured' as const,
      }),
      resolveForTurn: async () => [],
    },
    scratch: {
      create: async () => undefined,
      release: async () => undefined,
      authorizePreview: async () => ({ previewSessionId: 'preview:one', descriptorId: 'file:one' }),
    },
    publication: {
      publishToAssets: async () => ({ assetId: 'asset:one' }),
      publishToWorkspace: async () => ({ documentId: 'document:one' }),
    },
    session,
    provider,
    reportError: vi.fn(),
    createIdentity: () => `identity:${++identity}`,
    now: () => '2026-08-08T00:00:00.000Z',
  });
  const resources = {
    validate: vi.fn(() => []),
    commit: vi.fn(async () => {
      events.push('resource-commit');
    }),
  };
  const scene = {
    validate: vi.fn(async () => undefined),
    handoff: vi.fn(async () => {
      events.push('scene-handoff');
    }),
  };
  const commands = { validate: vi.fn() };
  return {
    events,
    launch,
    entry,
    runtimeEntry,
    bindings,
    lifecycle,
    session,
    provider,
    resources,
    scene,
    commands,
    service: createAgentLaunchDraftSubmissionApplicationService({
      launch,
      entry,
      runtimeEntry,
      bindings,
      lifecycle,
      resources,
      scene,
      commands,
    }),
  };
}
