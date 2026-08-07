import { describe, expect, it, vi } from 'vitest';
import {
  createAgentConversationLifecycleService,
  createInMemoryAgentConversationLifecycleRepository,
  projectAgentConversationInitialMessage,
} from './agent-conversation-lifecycle-service';

describe('Agent Conversation lifecycle service', () => {
  it('commits Workspace context and the initial turn once before provider execution', async () => {
    const fixture = createFixture();
    const input = {
      requestId: 'request-1',
      context: {
        kind: 'workspace' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant:1',
      },
      messageText: 'Inspect this workspace',
      resourceGrantIds: [],
      configuration: configuration(),
    };
    const committed = await fixture.service.firstSubmit(input);
    const replay = await fixture.service.firstSubmit(input);
    expect(fixture.provider.start).not.toHaveBeenCalled();
    const first = await fixture.service.startProviderExecution(committed.conversationId);

    expect(first).toMatchObject({
      context: input.context,
      initialMessage: { text: input.messageText },
      pendingTurn: { requestId: input.requestId, status: 'running' },
    });
    expect(replay.conversationId).toBe(first.conversationId);
    expect(replay.pendingTurn.turnId).toBe(first.pendingTurn.turnId);
    expect(projectAgentConversationInitialMessage(first)).toEqual({
      id: first.initialMessage.messageId,
      role: 'user',
      content: 'Inspect this workspace',
      timestamp: Date.parse('2026-08-03T00:00:00.000Z'),
    });
    expect(fixture.session.materialize).toHaveBeenCalledTimes(2);
    expect(fixture.session.materialize).toHaveBeenLastCalledWith({
      conversationId: first.conversationId,
      context: input.context,
    });
    await fixture.service.waitForProviderIdle();
    expect(fixture.provider.start).toHaveBeenCalledOnce();
    expect(fixture.provider.start).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: input.requestId,
        turnId: first.pendingTurn.turnId,
        conversationId: first.conversationId,
        context: input.context,
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
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:default',
        baseGrantIds: ['resource-grant:1'],
      },
      messageText: 'Summarize the authorized file',
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

    await expect(fixture.service.readConversationContext('missing-conversation')).rejects.toThrow(
      "Agent Conversation 'missing-conversation' context is not present.",
    );

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
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:default',
        baseGrantIds: ['resource-grant:1'],
      },
      messageText: 'Summarize my note',
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
    });
    expect(replacement.provider.start).not.toHaveBeenCalled();
  });

  it('isolates scratch by Conversation and publishes before cleanup', async () => {
    const fixture = createFixture();
    const conversation = await fixture.service.firstSubmit({
      requestId: 'request-1',
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:default',
        baseGrantIds: [],
      },
      messageText: 'Create an image',
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
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:default',
        baseGrantIds: [],
      },
      messageText: 'Create an image',
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
});

function assistantInput(requestId: string) {
  return {
    requestId,
    context: {
      kind: 'assistant' as const,
      assistantSpaceId: 'assistant-space:default',
      baseGrantIds: [],
    },
    messageText: requestId,
    resourceGrantIds: [],
    configuration: configuration(),
  };
}

function configuration() {
  return { providerId: 'openai', modelId: 'gpt-5', executionMode: 'ask' as const };
}

function createFixture(options?: {
  readonly repository?: ReturnType<typeof createInMemoryAgentConversationLifecycleRepository>;
  readonly providerError?: Error;
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
      : vi.fn(async () => undefined),
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
