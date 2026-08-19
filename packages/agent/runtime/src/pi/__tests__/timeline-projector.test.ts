import type { AssistantMessage } from '@earendil-works/pi-ai';
import { describe, expect, it } from 'vitest';

import { createConversationProjectionStore } from '../../runtime/projection/conversation-projection-store';
import type { PiProductAgentEvent, PiProductEventPayload } from '../event-projector';
import { createPiTimelineProjector } from '../timeline-projector';

const identity = {
  workspaceId: 'workspace-a',
  conversationId: 'conversation-a',
  branchId: 'branch-a',
  turnId: 'turn-a',
  runId: 'run-a',
} as const;

function event(payload: PiProductEventPayload): PiProductAgentEvent {
  return {
    ...payload,
    identity,
    timestamp: 10,
  };
}

function assistantMessage(content: AssistantMessage['content']): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'test-model',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: 10,
  };
}

describe('Pi Timeline projector', () => {
  it('projects one exact run into ordered immutable Timeline updates', () => {
    const store = createConversationProjectionStore(identity.conversationId);
    const projector = createPiTimelineProjector({
      conversationId: identity.conversationId,
      messageId: 'message-a',
      projection: store,
    });

    projector.emit(event({ type: 'turn.started' }));
    projector.emit(
      event({
        type: 'skill.activated',
        skillName: 'fixture-skill',
        source: 'project',
        fingerprint: 'sha256:fixture-skill',
      }),
    );
    projector.emit(event({ type: 'assistant.thinking.delta', delta: 'plan', sourceIndex: 0 }));
    projector.emit(event({ type: 'assistant.text.delta', delta: 'answer', sourceIndex: 1 }));
    projector.emit(
      event({
        type: 'assistant.message.completed',
        message: assistantMessage([
          { type: 'thinking', thinking: 'plan' },
          { type: 'text', text: 'answer' },
          { type: 'toolCall', id: 'tool-1', name: 'read_document', arguments: { path: 'a.md' } },
        ]),
      }),
    );
    projector.emit(
      event({
        type: 'tool.started',
        toolCallId: 'tool-1',
        toolName: 'read_document',
        args: { path: 'a.md' },
      }),
    );
    projector.emit(
      event({
        type: 'tool.updated',
        toolCallId: 'tool-1',
        toolName: 'read_document',
        update: {
          content: [{ type: 'text', text: 'reading' }],
          details: { success: true, data: { stage: 'reading' } },
        },
      }),
    );
    projector.emit(
      event({
        type: 'confirmation.required',
        confirmationId: 'confirmation-1',
        toolCallId: 'tool-1',
        toolName: 'read_document',
        summary: 'Read a.md',
      }),
    );
    projector.emit(
      event({
        type: 'tool.completed',
        toolCallId: 'tool-1',
        toolName: 'read_document',
        result: {
          details: {
            success: true,
            data: { text: 'document' },
            attachments: [
              { type: 'image', path: 'preview.png' },
              {
                type: 'image',
                contentLocator: {
                  kind: 'generated-output',
                  outputId: 'generated-image',
                  digest: 'a'.repeat(64),
                  path: 'neko/generated/image/generated-image.png',
                },
              },
            ],
            perceptionCards: [
              {
                assetId: 'generated-image',
                modality: 'image',
                createdAt: 30,
                layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
                structural: { format: 'png', mimeType: 'image/png', byteSize: 42 },
              },
            ],
            backfillDiagnostics: [{ path: 'data.status', reason: 'conflict' }],
          },
        },
        isError: false,
      }),
    );
    projector.emit(event({ type: 'turn.completed' }));

    const snapshot = store.snapshot();
    expect(snapshot.turns).toHaveLength(1);
    expect(snapshot.turns[0]).toMatchObject({
      turnId: identity.turnId,
      runId: identity.runId,
      messageId: 'message-a',
      completion: { status: 'completed' },
    });
    expect(snapshot.turns[0]?.items.map((item) => item.kind)).toEqual([
      'thinking',
      'assistant_text',
      'tool_call',
    ]);
    expect(snapshot.turns[0]?.items.every((item) => item.runId === identity.runId)).toBe(true);
    expect(snapshot.turns[0]?.items[2]).toMatchObject({
      itemId: 'tool-tool-1',
      status: 'succeeded',
      payload: {
        toolCall: {
          id: 'tool-1',
          result: {
            success: true,
            data: { text: 'document' },
            attachments: [
              { type: 'image', path: 'preview.png' },
              {
                type: 'image',
                contentLocator: {
                  kind: 'generated-output',
                  outputId: 'generated-image',
                  digest: 'a'.repeat(64),
                  path: 'neko/generated/image/generated-image.png',
                },
              },
            ],
            perceptionCards: [
              expect.objectContaining({ assetId: 'generated-image', modality: 'image' }),
            ],
            backfillDiagnostics: [{ path: 'data.status', reason: 'conflict' }],
          },
          pendingConfirmation: false,
        },
        progress: { summary: 'reading', data: { stage: 'reading' } },
      },
    });
    expect(Object.isFrozen(snapshot.turns[0]?.items[0])).toBe(true);
  });

  it('reconciles provider-final text through an explicit replacement', () => {
    const store = createConversationProjectionStore(identity.conversationId);
    const projector = createPiTimelineProjector({
      conversationId: identity.conversationId,
      messageId: 'message-a',
      projection: store,
    });

    projector.emit(event({ type: 'turn.started' }));
    projector.emit(event({ type: 'assistant.text.delta', delta: 'draft', sourceIndex: 0 }));
    projector.emit(
      event({
        type: 'assistant.message.completed',
        message: assistantMessage([{ type: 'text', text: 'final' }]),
      }),
    );

    expect(store.snapshot().turns[0]?.items[0]).toMatchObject({
      status: 'complete',
      payload: { content: 'final' },
    });
  });

  it('rejects mismatched identity, unsupported final content, and late events', () => {
    const store = createConversationProjectionStore(identity.conversationId);
    const projector = createPiTimelineProjector({
      conversationId: identity.conversationId,
      messageId: 'message-a',
      projection: store,
    });

    projector.emit(event({ type: 'turn.started' }));
    expect(() =>
      projector.emit({
        ...event({ type: 'assistant.text.delta', delta: 'wrong run', sourceIndex: 0 }),
        identity: { ...identity, runId: 'run-b' },
      }),
    ).toThrow(/identity mismatch/i);

    expect(() =>
      projector.emit(
        event({
          type: 'assistant.message.completed',
          message: assistantMessage([
            { type: 'image', data: 'unsupported', mimeType: 'image/png' },
          ] as never),
        }),
      ),
    ).toThrow(/unsupported assistant content/i);

    projector.emit(event({ type: 'turn.cancelled', reason: 'cancelled by user' }));
    expect(() =>
      projector.emit(event({ type: 'assistant.text.delta', delta: 'late', sourceIndex: 0 })),
    ).toThrow(/after terminal/i);
  });
});
