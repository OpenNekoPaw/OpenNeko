import { describe, expect, it, vi } from 'vitest';
import { createAssistantResourceService } from './assistant-resource-service';

describe('Assistant Resource service', () => {
  it('projects only grants and scratch owned by the exact Assistant Conversation', async () => {
    const preview = previewPort();
    const service = createAssistantResourceService({
      lifecycle: {
        readConversation: vi.fn(async () => conversationRecord()),
      },
      grants: {
        readConversationResourceGrants: vi.fn(() => [
          { resourceGrantId: 'grant:1', resourceKind: 'file', label: 'notes.txt' },
        ]),
      },
      preview,
    });

    await expect(service.snapshot(identity())).resolves.toMatchObject({
      identity: identity(),
      baseGrants: [{ resourceGrantId: 'grant:1', label: 'notes.txt' }],
      scratchArtifacts: [{ scratchArtifactId: 'scratch:1', label: 'result.txt' }],
    });
    await service.authorizePreview({
      identity: identity(),
      scratchArtifactId: 'scratch:1',
    });
    expect(preview.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: identity(),
        artifact: expect.objectContaining({ scratchArtifactId: 'scratch:1' }),
      }),
    );
  });

  it('fails visibly for another scope, missing grants and cross-Conversation scratch', async () => {
    const lifecycle = { readConversation: vi.fn(async () => conversationRecord()) };
    const service = createAssistantResourceService({
      lifecycle,
      grants: { readConversationResourceGrants: () => [] },
      preview: previewPort(),
    });

    await expect(service.snapshot(identity())).rejects.toThrow("grant 'grant:1' is missing");
    await expect(
      service.snapshot({ ...identity(), assistantSpaceId: 'assistant:other' }),
    ).rejects.toThrow('does not match its Conversation context');
    await expect(
      service.authorizePreview({
        identity: identity(),
        scratchArtifactId: 'scratch:other',
      }),
    ).rejects.toThrow('does not belong');
  });
});

function identity() {
  return {
    assistantSpaceId: 'assistant:1',
    conversationId: 'conversation:1',
    windowId: 'window:1',
  };
}

function conversationRecord() {
  return {
    conversationId: 'conversation:1',
    context: {
      kind: 'assistant' as const,
      assistantSpaceId: 'assistant:1',
      baseGrantIds: ['grant:1'],
    },
    createdAt: '2026-08-03T00:00:00.000Z',
    initialMessage: { messageId: 'message:1', text: 'Create', resourceGrantIds: ['grant:1'] },
    configuration: { providerId: 'openai', modelId: 'gpt-5', executionMode: 'ask' as const },
    pendingTurn: { requestId: 'request:1', turnId: 'turn:1', status: 'running' as const },
    scratchArtifacts: [
      {
        scratchArtifactId: 'scratch:1',
        assistantSpaceId: 'assistant:1',
        conversationId: 'conversation:1',
        label: 'result.txt',
        state: 'recoverable' as const,
      },
    ],
  };
}

function previewPort() {
  return {
    authorize: vi.fn(async () => previewProjection()),
    read: vi.fn(() => previewProjection()),
    release: vi.fn(),
  };
}

function previewProjection() {
  return {
    identity: {
      previewSessionId: 'preview:1',
      windowId: 'window:1',
      owner: {
        kind: 'assistant-scratch' as const,
        assistantSpaceId: 'assistant:1',
        conversationId: 'conversation:1',
        scratchArtifactId: 'scratch:1',
      },
      revision: 0,
    },
    status: 'unavailable' as const,
    diagnostic: { code: 'preview-unsupported-kind' as const, message: 'unsupported' },
  };
}
