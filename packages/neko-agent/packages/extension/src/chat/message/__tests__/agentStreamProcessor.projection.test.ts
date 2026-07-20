import { createConversationProjectionStore } from '@neko/agent/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentStreamProcessor } from '../agentStreamProcessor';

vi.mock('vscode', () => ({
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
  },
  window: { showInformationMessage: vi.fn() },
  commands: { executeCommand: vi.fn() },
}));

vi.mock('../../../base', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

async function* events() {
  yield { type: 'text' as const, content: 'authoritative' };
  yield { type: 'done' as const };
}

describe('AgentStreamProcessor conversation projection ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('commits stream updates to the conversation store even when transport is unavailable', async () => {
    const projection = createConversationProjectionStore('conversation-a');
    const webview = {
      postMessage: vi.fn().mockResolvedValue(false),
      asWebviewUri: vi.fn((uri: { readonly fsPath: string }) => ({
        toString: () => `webview-uri:${uri.fsPath}`,
      })),
    };
    const processor = new AgentStreamProcessor({
      getConversationProjection: (conversationId: string) => {
        expect(conversationId).toBe('conversation-a');
        return projection;
      },
    });

    await processor.processStream(webview as never, 'conversation-a', events(), {
      messageId: 'message-a',
      onPhaseChange: vi.fn(),
    });

    expect(webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agentTurnTimeline' }),
    );
    expect(projection.projectionVersion).toBeGreaterThan(0);
    expect(projection.snapshot()).toMatchObject({
      conversationId: 'conversation-a',
      turns: [
        {
          turnId: 'turn-message-a',
          messageId: 'message-a',
          completion: { status: 'completed' },
          items: [
            {
              kind: 'assistant_text',
              payload: { content: 'authoritative' },
            },
          ],
        },
      ],
    });
    processor.dispose();
    projection.dispose();
  });
});
