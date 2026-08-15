import { describe, expect, it, vi } from 'vitest';
import { LocalMetadataError } from '@neko/local-metadata';
import {
  AgentConversationLifecycleUnavailableError,
  createAgentConversationLifecycleService,
  createInMemoryAgentConversationLifecycleRepository,
  projectAgentConversationInitialMessage,
  projectAgentConversationTitle,
} from './agent-conversation-lifecycle-service';
import { projectAgentConfigurationPolicy } from './agent-launch-service';

describe('Agent Conversation lifecycle service', () => {
  it('commits Workspace context and the initial turn once before provider execution', async () => {
    const fixture = createFixture();
    const entryTargetReceipt = authoringReceipt();
    const input = {
      requestId: 'request-1',
      entryTargetReceipt,
      context: {
        kind: 'workspace' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant:1',
      },
      input: { kind: 'message' as const, text: 'Inspect this workspace' },
      references: [],
      contextReferences: [
        {
          type: 'file' as const,
          id: 'file:notes.fountain',
          label: 'notes.fountain',
          mediaType: 'text' as const,
          contentLocator: { kind: 'workspace-file' as const, path: 'notes.fountain' },
        },
      ],
      resourceGrantIds: [],
      configuration: configuration(),
    };
    const committed = await fixture.service.firstSubmit(input);
    const replay = await fixture.service.firstSubmit(input);
    await expect(
      fixture.service.firstSubmit({
        ...input,
        entryTargetReceipt: {
          ...entryTargetReceipt,
          targetReceiptId: 'target-receipt-stale',
        },
      }),
    ).rejects.toThrow('conflicts with its committed input');
    const replacement = createFixture({ repository: fixture.repository });
    await expect(
      replacement.service.readConversationEntryTargetReceipt(committed.conversationId),
    ).resolves.toEqual(entryTargetReceipt);
    expect(fixture.provider.start).not.toHaveBeenCalled();
    const first = await fixture.service.startProviderExecution(committed.conversationId);

    expect(first).toMatchObject({
      context: input.context,
      initialInput: { intent: input.input },
      pendingTurn: { requestId: input.requestId, status: 'running' },
    });
    expect(replay.conversationId).toBe(first.conversationId);
    expect(replay.pendingTurn.turnId).toBe(first.pendingTurn.turnId);
    expect(projectAgentConversationInitialMessage(first)).toEqual({
      id: first.initialInput.messageId,
      role: 'user',
      content: 'Inspect this workspace',
      timestamp: Date.parse('2026-08-03T00:00:00.000Z'),
      contextReferences: input.contextReferences,
    });
    expect(fixture.session.materialize).toHaveBeenCalledTimes(2);
    expect(fixture.session.materialize).toHaveBeenLastCalledWith({
      conversationId: first.conversationId,
      context: input.context,
      title: 'Inspect this workspace',
    });
    await fixture.service.waitForProviderIdle();
    expect(fixture.provider.start).toHaveBeenCalledOnce();
    expect(fixture.provider.start).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: input.requestId,
        turnId: first.pendingTurn.turnId,
        conversationId: first.conversationId,
        context: input.context,
        entryTargetReceipt,
        contextPayloads: [],
      }),
    );
    await expect(fixture.service.readConversation(first.conversationId)).resolves.toMatchObject({
      pendingTurn: { requestId: input.requestId, status: 'completed' },
    });
  });

  it('resolves authorized Resource grants into provider context after the exactly-once claim', async () => {
    const fixture = createFixture();
    const committed = await fixture.service.firstSubmit({
      requestId: 'request-resource',
      entryTargetReceipt: null,
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:default',
        baseGrantIds: ['resource-grant:1'],
      },
      input: { kind: 'message', text: 'Summarize the authorized file' },
      references: [],
      contextReferences: [],
      resourceGrantIds: ['resource-grant:1'],
      configuration: configuration(),
    });
    await fixture.service.startProviderExecution(committed.conversationId);
    await fixture.service.waitForProviderIdle();

    expect(fixture.grants.resolveForTurn).toHaveBeenCalledWith({
      context: committed.context,
      resourceGrantIds: ['resource-grant:1'],
    });
    expect(fixture.provider.start).toHaveBeenCalledWith(
      expect.objectContaining({
        contextPayloads: [
          expect.objectContaining({
            id: 'resource-grant:1',
            data: { text: 'authorized contents' },
          }),
        ],
      }),
    );
  });

  it('restores exact generation purpose models before a pending first Turn starts', async () => {
    const repository = createInMemoryAgentConversationLifecycleRepository();
    const first = createFixture({ repository });
    const purposeModels = {
      'image.generate': {
        providerId: 'image-provider',
        modelId: 'image-model',
        category: 'image' as const,
      },
    };
    const committed = await first.service.firstSubmit({
      ...assistantInput('request-image'),
      purposeModels,
    });

    const replacement = createFixture({ repository });
    await replacement.service.startProviderExecution(committed.conversationId);
    await replacement.service.waitForProviderIdle();

    expect(replacement.provider.start).toHaveBeenCalledWith(
      expect.objectContaining({ purposeModels }),
    );
    await expect(
      replacement.service.readConversation(committed.conversationId),
    ).resolves.toMatchObject({
      initialInput: { purposeModels },
      pendingTurn: { status: 'completed' },
    });
  });

  it('awaits one locally claimed provider Turn and returns its exact result', async () => {
    const fixture = createFixture({
      providerResult: { turnId: 'turn:identity-2', content: 'Participant response' },
    });
    const committed = await fixture.service.firstSubmit(assistantInput('request-exact-provider'));

    await expect(fixture.service.executeProviderTurn(committed.conversationId)).resolves.toEqual({
      turnId: committed.pendingTurn.turnId,
      content: 'Participant response',
    });
    await expect(fixture.service.readConversation(committed.conversationId)).resolves.toMatchObject(
      { pendingTurn: { status: 'completed' } },
    );
  });

  it('rejects a provider result for another Turn identity', async () => {
    const fixture = createFixture({
      providerResult: { turnId: 'turn:other', content: 'Wrong response' },
    });
    const committed = await fixture.service.firstSubmit(assistantInput('request-wrong-provider'));

    await expect(fixture.service.executeProviderTurn(committed.conversationId)).rejects.toThrow(
      'for pending Turn',
    );
  });

  it('persists and executes the exact first-input Skill intent without prompt re-parsing', async () => {
    const fixture = createFixture();
    const input = {
      ...assistantInput('request-skill'),
      input: {
        kind: 'skill' as const,
        catalogEntryId: 'skill:project:fingerprint-one',
        skillName: 'storyboard',
        activationId: 'skill:project:fingerprint-one',
        args: 'Draft three beats',
      },
    };

    const committed = await fixture.service.firstSubmit(input);
    expect(committed.initialInput.intent).toEqual(input.input);
    expect(projectAgentConversationInitialMessage(committed).content).toBe(
      '$storyboard Draft three beats',
    );
    await fixture.service.startProviderExecution(committed.conversationId);
    await fixture.service.waitForProviderIdle();

    expect(fixture.provider.start).toHaveBeenCalledWith(
      expect.objectContaining({ input: input.input }),
    );
    expect(JSON.stringify(fixture.provider.start.mock.calls)).not.toContain(
      'kind":"message","text":"$storyboard',
    );
  });

  it('freezes an empty domain capability constraint and rejects Skill activation before commit', async () => {
    const capabilityConstraint = {
      owner: { kind: 'character' as const, id: 'character-run:1' },
      skills: 'none' as const,
      tools: 'none' as const,
      references: 'none' as const,
    };
    const fixture = createFixture({ capabilityConstraint });
    const message = await fixture.service.firstSubmit({
      ...assistantInput('request-narrative-message'),
      context: {
        kind: 'character' as const,
        characterId: 'character:1',
        characterVersionId: 'character-version:1',
        characterRunId: 'character-run:1',
        dialogueRunId: 'dialogue-run:1',
      },
    });

    expect(message.pendingTurn.capabilityConstraint).toEqual(capabilityConstraint);
    await expect(
      fixture.service.readConversationCapabilityConstraint(message.conversationId),
    ).resolves.toEqual(capabilityConstraint);
    await fixture.service.startProviderExecution(message.conversationId);
    await fixture.service.waitForProviderIdle();
    expect(fixture.provider.start).toHaveBeenCalledWith(
      expect.objectContaining({ capabilityConstraint }),
    );

    await expect(
      fixture.service.firstSubmit({
        ...assistantInput('request-narrative-skill'),
        context: {
          kind: 'character' as const,
          characterId: 'character:1',
          characterVersionId: 'character-version:1',
          characterRunId: 'character-run:1',
          dialogueRunId: 'dialogue-run:1',
        },
        input: {
          kind: 'skill' as const,
          catalogEntryId: 'skill:fixture',
          skillName: 'fixture',
          activationId: 'skill:fixture',
        },
      }),
    ).rejects.toThrow('forbids Skill or command activation');
  });

  it('activates the committed session before provider context resolution completes', async () => {
    const fixture = createFixture();
    let releaseContext: ((value: readonly []) => void) | undefined;
    fixture.grants.resolveForTurn.mockImplementationOnce(
      () =>
        new Promise<readonly []>((resolve) => {
          releaseContext = resolve;
        }),
    );

    const committed = await fixture.service.firstSubmit(assistantInput('request-context-pending'));
    const running = await fixture.service.startProviderExecution(committed.conversationId);

    expect(committed.pendingTurn.status).toBe('pending');
    expect(running.pendingTurn.status).toBe('running');
    expect(fixture.session.materialize).toHaveBeenCalledOnce();
    expect(fixture.provider.start).not.toHaveBeenCalled();
    if (!releaseContext) throw new Error('Expected provider context resolution to be pending.');
    releaseContext([]);
    await fixture.service.waitForProviderIdle();
    expect(fixture.provider.start).toHaveBeenCalledOnce();
    await expect(fixture.service.readConversation(committed.conversationId)).resolves.toMatchObject(
      {
        pendingTurn: { status: 'completed' },
      },
    );
  });

  it('records provider context resolution failure after session activation', async () => {
    const fixture = createFixture();
    fixture.grants.resolveForTurn.mockRejectedValueOnce(new Error('resource unavailable'));

    const committed = await fixture.service.firstSubmit(assistantInput('request-context-failure'));
    const running = await fixture.service.startProviderExecution(committed.conversationId);

    expect(committed.pendingTurn.status).toBe('pending');
    expect(running.pendingTurn.status).toBe('running');
    await fixture.service.waitForProviderIdle();
    await expect(fixture.service.readConversation(committed.conversationId)).resolves.toMatchObject(
      {
        pendingTurn: {
          status: 'failed',
          diagnostic: 'resource unavailable',
        },
      },
    );
    expect(fixture.provider.start).not.toHaveBeenCalled();
  });

  it('fails only the Conversation whose canonical context is absent', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.readConversationContext('missing-conversation'),
    ).rejects.toMatchObject({
      code: 'agent-conversation-lifecycle-unavailable',
      conversationId: 'missing-conversation',
      fieldNames: ['context'],
    });

    const valid = await fixture.service.firstSubmit(assistantInput('request-valid-sibling'));
    await expect(fixture.service.readConversationContext(valid.conversationId)).resolves.toEqual(
      valid.context,
    );
  });

  it('preserves a committed Assistant conversation when provider startup fails and reloads it', async () => {
    const repository = createInMemoryAgentConversationLifecycleRepository();
    const fixture = createFixture({ repository, providerError: new Error('provider unavailable') });
    const committed = await fixture.service.firstSubmit({
      requestId: 'request-assistant',
      entryTargetReceipt: null,
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:default',
        baseGrantIds: ['resource-grant:1'],
      },
      input: { kind: 'message', text: 'Summarize my note' },
      references: [],
      contextReferences: [],
      resourceGrantIds: ['resource-grant:1'],
      configuration: configuration(),
    });
    expect(committed.pendingTurn).toMatchObject({ status: 'pending' });
    await fixture.service.startProviderExecution(committed.conversationId);
    await fixture.service.waitForProviderIdle();
    const failed = await fixture.service.readConversation(committed.conversationId);
    expect(failed.pendingTurn).toMatchObject({
      status: 'failed',
      diagnostic: 'provider unavailable',
    });
    const reloaded = createFixture({ repository });
    await expect(reloaded.service.readConversation(committed.conversationId)).resolves.toEqual(
      failed,
    );
    expect(fixture.grants.validate).toHaveBeenCalledWith({
      context: committed.context,
      resourceGrantIds: ['resource-grant:1'],
    });
  });

  it('materializes a committed session after replacement without restarting its provider turn', async () => {
    const repository = createInMemoryAgentConversationLifecycleRepository();
    const first = createFixture({ repository });
    const committed = await first.service.firstSubmit(assistantInput('request-replay'));
    await first.service.startProviderExecution(committed.conversationId);
    await first.service.waitForProviderIdle();
    const completed = await first.service.readConversation(committed.conversationId);
    const replacement = createFixture({ repository });

    const replay = await replacement.service.firstSubmit(assistantInput('request-replay'));

    expect(replay).toEqual(completed);
    expect(replay.pendingTurn.status).toBe('completed');
    expect(replacement.session.materialize).toHaveBeenCalledOnce();
    expect(replacement.session.materialize).toHaveBeenCalledWith({
      conversationId: committed.conversationId,
      context: committed.context,
      title: 'request-replay',
    });
    expect(replacement.provider.start).not.toHaveBeenCalled();
  });

  it('derives bounded persisted titles from the canonical typed first input', () => {
    expect(
      projectAgentConversationTitle({ kind: 'message', text: '  请分析\n当前工作区的角色设定  ' }),
    ).toBe('请分析 当前工作区的角色设定');
    expect(
      projectAgentConversationTitle({
        kind: 'command',
        catalogEntryId: 'command:new',
        commandId: 'new',
        handlerId: 'builtin:new',
      }),
    ).toBe('/new');
    expect(
      projectAgentConversationTitle({
        kind: 'skill',
        catalogEntryId: 'skill:storyboard',
        skillName: 'storyboard',
        activationId: 'activation:storyboard',
      }),
    ).toBe('$storyboard');
    expect(
      projectAgentConversationTitle({
        kind: 'message',
        text: 'Create a storyboard shot list for the rainy rooftop chase with lighting notes',
      }),
    ).toBe('Create a storyboard shot list for the rainy...');
    expect(() => projectAgentConversationTitle({ kind: 'message', text: '   ' })).toThrow(
      'title source must not be empty',
    );
  });

  it('isolates scratch by Conversation and publishes before cleanup', async () => {
    const fixture = createFixture();
    const conversation = await fixture.service.firstSubmit({
      requestId: 'request-1',
      entryTargetReceipt: null,
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:default',
        baseGrantIds: [],
      },
      input: { kind: 'message', text: 'Create an image' },
      references: [],
      contextReferences: [],
      resourceGrantIds: [],
      configuration: configuration(),
    });
    const artifact = await fixture.service.createScratch({
      conversationId: conversation.conversationId,
      label: 'draft.png',
      mediaType: 'image/png',
    });
    await expect(
      fixture.service.authorizeScratchPreview({
        conversationId: conversation.conversationId,
        scratchArtifactId: artifact.scratchArtifactId,
      }),
    ).resolves.toEqual({ previewSessionId: 'preview-1', descriptorId: 'descriptor-1' });
    const published = await fixture.service.publishScratch({
      conversationId: conversation.conversationId,
      scratchArtifactId: artifact.scratchArtifactId,
      target: { kind: 'assets' },
      cleanupAfterPublish: true,
    });
    expect(published).toEqual({ kind: 'asset', assetId: 'asset-1' });
    expect(fixture.publication.publishToAssets.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.scratch.release.mock.invocationCallOrder[0]!,
    );
    expect(
      (await fixture.service.readConversation(conversation.conversationId)).scratchArtifacts,
    ).toEqual([]);
    await expect(
      fixture.service.authorizeScratchPreview({
        conversationId: 'conversation:other',
        scratchArtifactId: artifact.scratchArtifactId,
      }),
    ).rejects.toThrow(/Conversation 'conversation:other' is not present/);
  });

  it('does not clean scratch on publication failure or renderer-style service replacement', async () => {
    const repository = createInMemoryAgentConversationLifecycleRepository();
    const fixture = createFixture({ repository });
    const conversation = await fixture.service.firstSubmit({
      requestId: 'request-1',
      entryTargetReceipt: null,
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:default',
        baseGrantIds: [],
      },
      input: { kind: 'message', text: 'Create an image' },
      references: [],
      contextReferences: [],
      resourceGrantIds: [],
      configuration: configuration(),
    });
    const artifact = await fixture.service.createScratch({
      conversationId: conversation.conversationId,
      label: 'draft.png',
    });
    fixture.publication.publishToAssets.mockRejectedValueOnce(new Error('asset write failed'));
    await expect(
      fixture.service.publishScratch({
        conversationId: conversation.conversationId,
        scratchArtifactId: artifact.scratchArtifactId,
        target: { kind: 'assets' },
        cleanupAfterPublish: true,
      }),
    ).rejects.toThrow('asset write failed');
    expect(fixture.scratch.release).not.toHaveBeenCalled();
    const replacement = createFixture({ repository });
    expect(
      (await replacement.service.readConversation(conversation.conversationId)).scratchArtifacts,
    ).toEqual([artifact]);
    expect(replacement.scratch.release).not.toHaveBeenCalled();
  });

  it('cleans only the deleted Conversation scratch and preserves durable publications', async () => {
    const fixture = createFixture();
    const first = await fixture.service.firstSubmit(assistantInput('request-1'));
    const second = await fixture.service.firstSubmit(assistantInput('request-2'));
    const firstArtifact = await fixture.service.createScratch({
      conversationId: first.conversationId,
      label: 'first.txt',
    });
    const secondArtifact = await fixture.service.createScratch({
      conversationId: second.conversationId,
      label: 'second.txt',
    });
    await fixture.service.publishScratch({
      conversationId: second.conversationId,
      scratchArtifactId: secondArtifact.scratchArtifactId,
      target: {
        kind: 'workspace',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant:1',
      },
    });
    await fixture.service.deleteConversation(first.conversationId);
    expect(fixture.scratch.release).toHaveBeenCalledWith(firstArtifact);
    expect(fixture.scratch.release).not.toHaveBeenCalledWith(
      expect.objectContaining({ scratchArtifactId: secondArtifact.scratchArtifactId }),
    );
    expect(
      (await fixture.service.readConversation(second.conversationId)).scratchArtifacts[0],
    ).toMatchObject({ scratchArtifactId: secondArtifact.scratchArtifactId, state: 'published' });
  });

  it('updates only future-turn configuration and preserves the committed Turn snapshot', async () => {
    const fixture = createFixture();
    const committed = await fixture.service.firstSubmit(assistantInput('request-config-update'));
    const initialSnapshot = structuredClone(committed.pendingTurn.configuration);
    const next = configuration('anthropic', 'claude-sonnet-4');

    await fixture.service.updateConfiguration({
      conversationId: committed.conversationId,
      request: next.request,
      projection: next.projection,
    });

    const updated = await fixture.service.readConversation(committed.conversationId);
    expect(updated.configuration.request).toEqual(next.request);
    expect(updated.pendingTurn.configuration).toEqual(initialSnapshot);
    expect(updated.pendingTurn.configuration.request.providerId).toBe('openai');
  });

  it('keeps future-turn configuration isolated by exact Conversation identity', async () => {
    const fixture = createFixture();
    const first = await fixture.service.firstSubmit(assistantInput('request-config-first'));
    const second = await fixture.service.firstSubmit(assistantInput('request-config-second'));
    const next = configuration('anthropic', 'claude-sonnet-4');

    await fixture.service.updateConfiguration({
      conversationId: first.conversationId,
      request: next.request,
      projection: next.projection,
    });

    await expect(
      fixture.service.readConversationConfiguration(first.conversationId),
    ).resolves.toMatchObject({
      conversationId: first.conversationId,
      request: { providerId: 'anthropic', modelId: 'claude-sonnet-4' },
    });
    await expect(
      fixture.service.readConversationConfiguration(second.conversationId),
    ).resolves.toMatchObject({
      conversationId: second.conversationId,
      request: { providerId: 'openai', modelId: 'gpt-5' },
    });
  });

  it('translates an exact persisted lifecycle decode failure without accepting obsolete data', async () => {
    const decodeFailure = new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'decode-agent-conversation-lifecycle',
      message: 'Agent initial input contains unsupported fields.',
    });
    const repository = {
      ...createInMemoryAgentConversationLifecycleRepository(),
      readConversation: vi.fn(async () => {
        throw decodeFailure;
      }),
    };
    const fixture = createFixture({ repository });
    const error = await fixture.service
      .readFirstSubmitRecord('conversation-invalid')
      .catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(AgentConversationLifecycleUnavailableError);
    expect(error).toMatchObject({
      code: 'agent-conversation-lifecycle-unavailable',
      conversationId: 'conversation-invalid',
      fieldNames: ['lifecycle'],
      cause: decodeFailure,
    });
  });
});

function assistantInput(requestId: string) {
  return {
    requestId,
    entryTargetReceipt: null,
    context: {
      kind: 'assistant' as const,
      assistantSpaceId: 'assistant-space:default',
      baseGrantIds: [],
    },
    input: { kind: 'message' as const, text: requestId },
    references: [],
    contextReferences: [],
    resourceGrantIds: [],
    configuration: configuration(),
  };
}

function authoringReceipt() {
  return {
    targetReceiptId: 'target-receipt-1',
    draftId: 'draft-1',
    connectionId: 'connection-1',
    mode: 'authoring' as const,
    binding: {
      kind: 'authoring' as const,
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant:1',
      authority: { kind: 'project' as const, projectId: 'project-1' },
      target: { kind: 'content-document' as const, documentId: 'documents/story.md' },
    },
  };
}

function configuration(providerId = 'openai', modelId = 'gpt-5') {
  const request = {
    modelCatalogEntryId: `${providerId}:${modelId}`,
    providerId,
    modelId,
    executionMode: 'ask' as const,
    temperature: 0.7,
    maximumOutputTokens: 4096,
    thinkingBudget: 0,
  };
  return {
    request,
    projection: projectAgentConfigurationPolicy({
      models: [
        {
          id: request.modelCatalogEntryId,
          label: 'GPT-5',
          providerId: request.providerId,
          modelId: request.modelId,
          modelType: 'llm',
          contextWindow: 128_000,
          maximumOutputTokens: 16_384,
          purposeCapabilities: ['agent.main'],
          availability: { status: 'available' },
        },
      ],
      request,
      source: 'draft-request',
      defaults: {
        executionMode: 'ask',
        temperature: 0.7,
        maximumOutputTokens: 4096,
        thinkingBudget: 0,
      },
    }),
  };
}

function createFixture(options?: {
  readonly repository?: ReturnType<typeof createInMemoryAgentConversationLifecycleRepository>;
  readonly providerError?: Error;
  readonly providerResult?: { readonly turnId: string; readonly content: string };
  readonly capabilityConstraint?: import('@neko/agent-contracts').AgentTurnCapabilityConstraint;
}) {
  let identity = 0;
  const repository = options?.repository ?? createInMemoryAgentConversationLifecycleRepository();
  const grants = {
    validate: vi.fn(async () => undefined),
    resolveForTurn: vi.fn(async ({ resourceGrantIds }: { resourceGrantIds: readonly string[] }) =>
      resourceGrantIds.map((resourceGrantId) => ({
        type: 'file' as const,
        id: resourceGrantId,
        label: resourceGrantId,
        summary: 'Authorized file',
        data: { text: 'authorized contents' },
      })),
    ),
  };
  const scratch = {
    create: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
    authorizePreview: vi.fn(async () => ({
      previewSessionId: 'preview-1',
      descriptorId: 'descriptor-1',
    })),
  };
  const publication = {
    publishToAssets: vi.fn(async () => ({ assetId: 'asset-1' })),
    publishToWorkspace: vi.fn(async () => ({ documentId: 'document-1' })),
  };
  const provider = {
    start: options?.providerError
      ? vi.fn(async () => {
          throw options.providerError;
        })
      : vi.fn(async () => options?.providerResult),
  };
  const session = {
    materialize: vi.fn(async () => undefined),
  };
  return {
    repository,
    grants,
    scratch,
    publication,
    provider,
    session,
    service: createAgentConversationLifecycleService({
      repository,
      grants,
      domainContext: {
        resolveCapabilityConstraint: vi.fn(
          async ({ context }) =>
            options?.capabilityConstraint ?? {
              owner: { kind: context.kind, id: 'test-binding' },
              skills: 'configured' as const,
              tools: 'configured' as const,
              references: 'configured' as const,
            },
        ),
        resolveForTurn: vi.fn(async () => []),
      },
      scratch,
      publication,
      session,
      provider,
      reportError: vi.fn(),
      createIdentity: () => `identity-${(identity += 1)}`,
      now: () => '2026-08-03T00:00:00.000Z',
    }),
  };
}
