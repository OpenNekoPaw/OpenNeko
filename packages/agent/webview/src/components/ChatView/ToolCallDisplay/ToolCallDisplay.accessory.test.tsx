// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentHostRuntimeAdapter, ToolCall } from '@neko/agent-contracts';
import { AgentHostRuntimeProvider } from '../../../host-runtime-context';
import { ToolCallAccessoryProvider } from '../ToolCallAccessoryContext';
import { ToolCallDisplay } from './ToolCallDisplay';

vi.mock('../../../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ToolCallDisplay accessory', () => {
  it('renders a host accessory inside only its exact canonical Tool Call card', () => {
    const owner = toolCall('tool-call-owner');
    const sibling = toolCall('tool-call-sibling');
    const { container } = render(
      <AgentHostRuntimeProvider adapter={createAdapter()}>
        <ToolCallAccessoryProvider
          renderer={({ toolCall: candidate }) =>
            candidate.id === owner.id ? (
              <div data-testid="tool-call-accessory">Exact live control</div>
            ) : null
          }
        >
          <ToolCallDisplay conversationId="conversation-1" toolCall={owner} />
          <ToolCallDisplay conversationId="conversation-1" toolCall={sibling} />
        </ToolCallAccessoryProvider>
      </AgentHostRuntimeProvider>,
    );

    const accessory = screen.getByTestId('tool-call-accessory');
    const ownerCard = container.querySelector('[data-agent-tool-call-id="tool-call-owner"]');
    const siblingCard = container.querySelector('[data-agent-tool-call-id="tool-call-sibling"]');
    expect(ownerCard?.contains(accessory)).toBe(true);
    expect(siblingCard?.contains(accessory)).toBe(false);
    expect(container.querySelectorAll('[data-testid="tool-call-accessory"]')).toHaveLength(1);
  });
});

function toolCall(id: string): ToolCall {
  return {
    id,
    name: 'automation_cua-driver_screenshot',
    arguments: {},
  };
}

function createAdapter(): AgentHostRuntimeAdapter {
  return {
    hostKind: 'electron',
    runtimeId: 'tool-call-accessory-test',
    send: vi.fn(),
    submitMessage: vi.fn(),
    subscribe: vi.fn(() => ({ dispose: vi.fn() })),
    getState: vi.fn(),
    setState: vi.fn(),
  };
}
