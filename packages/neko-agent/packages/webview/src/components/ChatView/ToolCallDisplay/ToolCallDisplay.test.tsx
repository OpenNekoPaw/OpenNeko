import { render, screen } from '@testing-library/react';
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
