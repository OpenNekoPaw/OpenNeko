import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ToolCall } from '@neko/agent-contracts';
import { MessageActionsProvider } from '../MessageActionsContext';
import { ToolCallDisplay } from './ToolCallDisplay';

vi.mock('../../../host-runtime-context', () => ({
  useAgentHostMessages: () => ({
    openFile: vi.fn(),
    revealDocumentLocator: vi.fn(),
  }),
}));

vi.mock('../../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'toolCalls.awaitingApproval': 'Awaiting approval',
        'toolCalls.approve': 'Approve',
        'toolCalls.deny': 'Deny',
      })[key] ?? key,
  }),
}));

describe('ToolCallDisplay approval history', () => {
  it('keeps the waiting fact but exposes no approval actions in transcript history', () => {
    render(
      <MessageActionsProvider>
        <ToolCallDisplay toolCall={pendingToolCall()} conversationId="conversation-a" />
      </MessageActionsProvider>,
    );

    expect(screen.getByText('Awaiting approval')).toBeTruthy();
    expect(screen.getByText('GenerateImage')).toBeTruthy();
    expect(screen.getByText('blueberries')).toBeTruthy();
    expect(screen.queryByText('Generate fresh blueberries.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Args' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull();
  });
});

function pendingToolCall(): ToolCall {
  return {
    id: 'tool-a',
    name: 'GenerateImage',
    arguments: { prompt: 'blueberries' },
    pendingConfirmation: true,
    confirmation: {
      action: 'Generate image',
      description: 'Generate fresh blueberries.',
      details: {},
    },
  };
}
