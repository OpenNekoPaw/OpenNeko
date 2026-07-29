import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ToolCall } from '@neko-agent/types';
import { MessageActionsProvider } from '@/components/ChatView/MessageActionsContext';
import { ToolCallDisplay } from './ToolCallDisplay';

const { mockPostMessage } = vi.hoisted(() => ({
  mockPostMessage: vi.fn(),
}));

vi.mock('@neko/shared/vscode', () => ({
  getVSCodeAPI: () => ({
    postMessage: mockPostMessage,
    getState: vi.fn(),
    setState: vi.fn(),
  }),
  postMessage: (message: unknown) => mockPostMessage(message),
}));

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('ToolCallDisplay Canvas authoring results', () => {
  it('renders structured Canvas feedback without executing approval-gated next actions', () => {
    mockPostMessage.mockClear();

    render(
      <MessageActionsProvider>
        <ToolCallDisplay conversationId="conv-1" toolCall={createCanvasAuthoringToolCall()} />
      </MessageActionsProvider>,
    );

    expect(screen.getByText('Canvas authoring')).toBeTruthy();
    expect(screen.getByText('blocked')).toBeTruthy();
    expect(screen.getByText('node:scene-1')).toBeTruthy();
    expect(screen.getAllByText('Unsupported child preset "shot.magic".')).toHaveLength(2);
    expect(screen.getByText('/storyboardPrompt')).toBeTruthy();
    expect(screen.getByText('scene.environment:prompt-overridden')).toBeTruthy();
    expect(screen.getByText('Create replacement shot')).toBeTruthy();
    expect(screen.getByText('canvas_create_node')).toBeTruthy();
    expect(screen.getByText('Approval required')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Create replacement shot/ })).toBeNull();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });
});

describe('ToolCallDisplay Tool confirmation', () => {
  it('renders inline approval controls and returns the originating conversation identity', () => {
    mockPostMessage.mockClear();

    render(
      <MessageActionsProvider>
        <ToolCallDisplay
          conversationId="conv-1"
          toolCall={{
            id: 'tool-generate-1',
            name: 'GenerateImage',
            arguments: { prompt: 'two cats playing' },
            pendingConfirmation: true,
            confirmation: {
              action: 'GenerateImage',
              description: 'Generate an image using the configured media provider.',
              details: { confirmationId: 'confirmation:tool-generate-1' },
            },
          }}
        />
      </MessageActionsProvider>,
    );

    expect(screen.getByText('toolCalls.awaitingApproval')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'toolCalls.approve' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'toolCalls.deny' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'toolCalls.approve' }));

    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'confirmTool',
      toolCallId: 'tool-generate-1',
      approved: true,
      conversationId: 'conv-1',
    });
  });
});

describe('ToolCallDisplay Generation Job card', () => {
  it('renders revisioned progress for direct image generation', () => {
    render(
      <MessageActionsProvider>
        <ToolCallDisplay
          conversationId="conv-1"
          toolCall={{
            id: 'generation-1',
            name: 'GenerateImage',
            arguments: {
              prompt: '雨中的霓虹街道',
              providerId: 'image-provider',
              modelId: 'image-model',
            },
          }}
          progress={{
            summary: 'waiting-provider 45%',
            data: {
              kind: 'generation-job',
              jobId: 'generation-1',
              revision: 2,
              phase: 'running',
              stage: 'waiting-provider',
              percent: 45,
              providerId: 'image-provider',
              modelId: 'image-model',
            },
          }}
        />
      </MessageActionsProvider>,
    );

    expect(screen.getByTestId('generation-job-card')).toBeTruthy();
    expect(screen.getByText('toolCalls.generation.title')).toBeTruthy();
    expect(screen.getByText('image-provider/image-model')).toBeTruthy();
    expect(screen.getByText('generation-1 · r2')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('45');
  });

  it('renders the committed image and Board delivery status in the same card', () => {
    render(
      <MessageActionsProvider>
        <ToolCallDisplay
          conversationId="conv-1"
          toolCall={{
            id: 'generation-1',
            name: 'GenerateImage',
            arguments: { prompt: '雨中的霓虹街道' },
            result: {
              success: true,
              data: {
                generationJob: {
                  kind: 'generation-job',
                  jobId: 'generation-1',
                  revision: 3,
                  phase: 'succeeded',
                  stage: 'completed',
                  percent: 100,
                  providerId: 'image-provider',
                  modelId: 'image-model',
                },
                outputs: [
                  {
                    type: 'image',
                    contentLocator: {
                      kind: 'generated-output',
                      outputId: 'generated-1',
                      revision: 'revision-generated-1',
                      digest: 'sha256:generated-1',
                      path: 'neko/generated/images/generated-1.png',
                    },
                    renderUri: 'webview://generated/image.png',
                  },
                ],
                boardDelivery: {
                  status: 'projected',
                  nodeIds: ['node-1'],
                  diagnostics: [],
                },
              },
            },
          }}
        />
      </MessageActionsProvider>,
    );

    expect(screen.getByRole('img', { name: 'toolCalls.generation.result' })).toBeTruthy();
    expect(document.querySelectorAll('video')).toHaveLength(0);
    expect(document.querySelectorAll('audio')).toHaveLength(0);
    expect(screen.getByText('toolCalls.generation.boardSaved')).toBeTruthy();
  });

  it('does not report queued Board delivery as completed', () => {
    render(
      <MessageActionsProvider>
        <ToolCallDisplay
          conversationId="conv-1"
          toolCall={{
            id: 'generation-queued',
            name: 'GenerateImage',
            arguments: { prompt: '雨中的霓虹街道' },
            result: {
              success: true,
              data: {
                generationJob: {
                  kind: 'generation-job',
                  jobId: 'generation-queued',
                  revision: 3,
                  phase: 'succeeded',
                  stage: 'completed',
                  percent: 100,
                },
                boardDelivery: {
                  status: 'queued',
                  nodeIds: [],
                  diagnostics: [],
                },
              },
            },
          }}
        />
      </MessageActionsProvider>,
    );

    expect(screen.getByText('toolCalls.generation.boardPending')).toBeTruthy();
    expect(screen.queryByText('toolCalls.generation.boardSaved')).toBeNull();
    expect(screen.queryByText('toolCalls.generation.boardBlocked')).toBeNull();
  });
});

function createCanvasAuthoringToolCall(): ToolCall {
  return {
    id: 'tool-canvas-1',
    name: 'canvas_create_composite',
    arguments: {},
    result: {
      success: false,
      data: {
        authoringResult: {
          version: 1,
          status: 'blocked',
          summary: 'Composite needs a supported shot preset.',
          refs: [
            {
              kind: 'node',
              id: 'scene-1',
              canvasId: 'canvas-1',
              label: 'Scene',
            },
          ],
          diagnostics: [
            {
              severity: 'error',
              code: 'unsupported-child-preset',
              message: 'Unsupported child preset "shot.magic".',
              target: 'children[0].preset',
              requiredQuery: 'canvas_describe_authoring_capabilities',
              retryable: true,
            },
          ],
          changedFields: ['/storyboardPrompt'],
          blockedReason: 'Unsupported child preset "shot.magic".',
          nextActions: [
            {
              id: 'create-replacement-shot',
              label: 'Create replacement shot',
              toolName: 'canvas_create_node',
              requiresApproval: true,
              arguments: { preset: 'shot.basic' },
            },
          ],
        },
        semanticPrompt: {
          text: 'Wide rain street with @hero.',
          fieldProjections: [
            {
              fieldId: 'scene.environment',
              sourceSpanId: 'span-scene',
              alignmentState: 'prompt-overridden',
              userOverride: true,
            },
          ],
        },
      },
    },
  };
}
