import { describe, expect, it, vi } from 'vitest';
import type { AgentBoundDomainBinding } from '@neko/agent-contracts';
import type { AgentConversationLifecycleRecord } from './agent-conversation-lifecycle-service';
import { createAgentDomainConversationService } from './agent-domain-conversation-service';

const participantContext: AgentBoundDomainBinding = {
  kind: 'room',
  scope: 'participant',
  roomId: 'room:one',
  roomRunId: 'room-run:one',
  participantId: 'participant:rin',
  characterRunId: 'character-run:rin',
};

describe('Agent domain Conversation application service', () => {
  it('reserves an exact domain owner and rejects duplicate reservations locally', async () => {
    const fixture = createFixture();

    await fixture.service.reserve({
      conversationId: 'conversation:rin',
      context: participantContext,
    });

    await expect(
      fixture.service.reserve({
        conversationId: 'conversation:rin',
        context: participantContext,
      }),
    ).rejects.toThrow('already reserved');
    expect(fixture.contexts.get('conversation:rin')).toEqual(participantContext);
  });

  it('commits and executes the first participant Turn through Agent lifecycle authority', async () => {
    const fixture = createFixture();
    await fixture.service.reserve({
      conversationId: 'conversation:rin',
      context: participantContext,
    });

    await expect(
      fixture.service.submitTurn({
        requestId: 'request:room:one:rin',
        conversationId: 'conversation:rin',
        message: 'Respond to the room.',
      }),
    ).resolves.toEqual({ turnId: 'turn:first', content: 'First response' });

    expect(fixture.firstSubmit).toHaveBeenCalledWith({
      requestId: 'request:room:one:rin',
      conversationId: 'conversation:rin',
      context: participantContext,
      input: { kind: 'message', text: 'Respond to the room.' },
      entryTargetReceipt: null,
      references: [],
      contextReferences: [],
      resourceGrantIds: [],
      configuration: fixture.initialConfiguration,
    });
    expect(fixture.executeProviderTurn).toHaveBeenCalledWith('conversation:rin');
    expect(fixture.startLaterTurn).not.toHaveBeenCalled();
  });

  it('submits later participant Turns with the exact stored Agent configuration and constraint', async () => {
    const fixture = createFixture({ existing: lifecycleRecord() });

    await expect(
      fixture.service.submitTurn({
        requestId: 'request:later',
        conversationId: 'conversation:rin',
        message: 'Continue.',
      }),
    ).resolves.toEqual({ turnId: 'turn:later', content: 'Later response' });

    expect(fixture.firstSubmit).not.toHaveBeenCalled();
    expect(fixture.startLaterTurn).toHaveBeenCalledWith({
      conversationId: 'conversation:rin',
      message: 'Continue.',
      context: participantContext,
      configuration: lifecycleRecord().configuration,
      entryTargetReceipt: null,
      capabilityConstraint: lifecycleRecord().pendingTurn.capabilityConstraint,
    });
  });

  it('fails visibly when a participant Turn has no assistant content', async () => {
    const fixture = createFixture({
      existing: lifecycleRecord(),
      laterResult: { turnId: 'turn:empty', content: '' },
    });

    await expect(
      fixture.service.submitTurn({
        requestId: 'request:empty',
        conversationId: 'conversation:rin',
        message: 'Continue.',
      }),
    ).rejects.toThrow('completed without assistant content');
  });

  it('keeps sibling participant configuration and capability receipts isolated', async () => {
    const first = lifecycleRecord({
      conversationId: 'conversation:first',
      providerId: 'provider:first',
    });
    const second = lifecycleRecord({
      conversationId: 'conversation:second',
      providerId: 'provider:second',
    });
    const records = new Map([
      [first.conversationId, first],
      [second.conversationId, second],
    ]);
    const start = vi.fn(async (input) => ({
      turnId: `turn:${input.conversationId}`,
      content: input.configuration.request.providerId,
    }));
    const service = createAgentDomainConversationService({
      contexts: {
        bindContext: vi.fn(),
        releaseContext: vi.fn(),
        readContext: vi.fn(),
      },
      lifecycle: {
        firstSubmit: vi.fn(),
        executeProviderTurn: vi.fn(),
        readFirstSubmitRecord: vi.fn(async (conversationId) => records.get(conversationId)),
        readConversationConfiguration: vi.fn(
          async (conversationId) => requireRecord(records, conversationId).configuration,
        ),
        readConversationEntryTargetReceipt: vi.fn(async () => null),
        readConversationCapabilityConstraint: vi.fn(
          async (conversationId) =>
            requireRecord(records, conversationId).pendingTurn.capabilityConstraint,
        ),
      },
      configuration: { createInitialConfiguration: vi.fn() },
      turns: { start },
    });

    await expect(
      service.submitTurn({
        requestId: 'request:first',
        conversationId: first.conversationId,
        message: 'First',
      }),
    ).resolves.toMatchObject({ content: 'provider:first' });
    await expect(
      service.submitTurn({
        requestId: 'request:second',
        conversationId: second.conversationId,
        message: 'Second',
      }),
    ).resolves.toMatchObject({ content: 'provider:second' });
    expect(start).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        conversationId: first.conversationId,
        configuration: first.configuration,
        capabilityConstraint: first.pendingTurn.capabilityConstraint,
      }),
    );
    expect(start).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        conversationId: second.conversationId,
        configuration: second.configuration,
        capabilityConstraint: second.pendingTurn.capabilityConstraint,
      }),
    );
  });
});

function createFixture(options?: {
  readonly existing?: AgentConversationLifecycleRecord;
  readonly laterResult?: { readonly turnId: string; readonly content: string };
}) {
  const contexts = new Map<string, AgentBoundDomainBinding>();
  const initialConfiguration = {
    request: {
      modelCatalogEntryId: 'model:one',
      providerId: 'provider:one',
      modelId: 'model:one',
      executionMode: 'default' as const,
      temperature: 0.7,
      maximumOutputTokens: 2048,
      thinkingBudget: 0,
    },
    projection: lifecycleRecord().configuration.projection,
  };
  const firstSubmit = vi.fn(async () => lifecycleRecord());
  const executeProviderTurn = vi.fn(async () => ({
    turnId: 'turn:first',
    content: 'First response',
  }));
  const startLaterTurn = vi.fn(
    async () => options?.laterResult ?? { turnId: 'turn:later', content: 'Later response' },
  );
  return {
    contexts,
    initialConfiguration,
    firstSubmit,
    executeProviderTurn,
    startLaterTurn,
    service: createAgentDomainConversationService({
      contexts: {
        bindContext: async (conversationId, context) => {
          contexts.set(conversationId, structuredClone(context));
        },
        releaseContext: async (conversationId) => {
          if (!contexts.delete(conversationId)) throw new Error('missing reservation');
        },
        readContext: async (conversationId) => contexts.get(conversationId),
      },
      lifecycle: {
        firstSubmit,
        executeProviderTurn,
        readFirstSubmitRecord: vi.fn(async () => options?.existing),
        readConversationConfiguration: vi.fn(async () => lifecycleRecord().configuration),
        readConversationEntryTargetReceipt: vi.fn(async () => null),
        readConversationCapabilityConstraint: vi.fn(
          async () => lifecycleRecord().pendingTurn.capabilityConstraint,
        ),
      },
      configuration: {
        createInitialConfiguration: vi.fn(async () => initialConfiguration),
      },
      turns: { start: startLaterTurn },
    }),
  };
}

function lifecycleRecord(input?: {
  readonly conversationId?: string;
  readonly providerId?: string;
}): AgentConversationLifecycleRecord {
  const conversationId = input?.conversationId ?? 'conversation:rin';
  const providerId = input?.providerId ?? 'provider:one';
  const request = {
    modelCatalogEntryId: 'model:one',
    providerId,
    modelId: 'model:one',
    executionMode: 'default' as const,
    temperature: 0.7,
    maximumOutputTokens: 2048,
    thinkingBudget: 0,
  };
  const projection = {
    request,
    fields: {
      modelCatalogEntryId: { value: 'model:one', source: 'user' as const },
      providerId: { value: providerId, source: 'user' as const },
      modelId: { value: 'model:one', source: 'user' as const },
      executionMode: { value: 'default' as const, source: 'user' as const },
      temperature: { value: 0.7, source: 'user' as const },
      maximumOutputTokens: { value: 2048, source: 'user' as const },
      thinkingBudget: { value: 0, source: 'user' as const },
    },
    diagnostics: [],
  };
  return {
    conversationId,
    context: participantContext,
    createdAt: '2026-08-12T00:00:00.000Z',
    initialInput: {
      messageId: 'message:first',
      entryTargetReceipt: null,
      intent: { kind: 'message', text: 'First' },
      references: [],
      contextReferences: [],
      resourceGrantIds: [],
    },
    configuration: { conversationId, request, projection },
    pendingTurn: {
      requestId: 'request:first',
      turnId: 'turn:first',
      status: 'completed',
      configuration: {
        conversationId: 'conversation:rin',
        turnId: 'turn:first',
        request,
        projection,
      },
      capabilityConstraint: {
        owner: { kind: 'room', id: 'conversation:rin' },
        skills: 'configured',
        tools: 'configured',
        references: 'configured',
      },
    },
    scratchArtifacts: [],
  };
}

function requireRecord(
  records: ReadonlyMap<string, AgentConversationLifecycleRecord>,
  conversationId: string,
): AgentConversationLifecycleRecord {
  const record = records.get(conversationId);
  if (!record) throw new Error(`Missing fixture Conversation '${conversationId}'.`);
  return record;
}
