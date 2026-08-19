import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentInputCatalogMessage } from '@neko/agent-contracts';
import { useSlashCommands } from '../useSlashCommands';

const hostMocks = vi.hoisted(() => ({
  invokeAgentInput: vi.fn(),
}));

vi.mock('../../host-runtime-context', () => ({
  useAgentHostMessages: () => ({
    invokeAgentInput: hostMocks.invokeAgentInput,
  }),
}));

const inputCatalog: AgentInputCatalogMessage = {
  type: 'agentInputCatalog',
  conversationId: 'conv-1',
  phase: 'session',
  bindingKind: 'assistant',
  entries: [
    {
      id: 'command:builtin:help',
      name: 'help',
      description: 'Show help',
      trigger: 'command',
      prefix: '/',
      phaseRequirement: 'session',
      bindingRequirement: 'any',
      source: { kind: 'builtin', sourceId: 'help' },
      availability: { status: 'available' },
      executable: { kind: 'command', commandId: 'help', handlerId: 'builtin:help' },
    },
  ],
};

describe('useSlashCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes the exact command catalog entry instead of handling help in Renderer', () => {
    const clearInput = vi.fn();
    const { result } = renderHook(() =>
      useSlashCommands({
        inputCatalog,
        inputValue: '/help',
        activeConversationId: 'conv-1',
        clearInput,
      }),
    );

    act(() => {
      result.current.handleSlashCommand({
        id: 'command:builtin:help',
        commandId: 'help',
        name: '/help',
        descriptionKey: 'chat.commands.help',
        icon: '',
        source: 'builtin',
      });
    });

    expect(clearInput).toHaveBeenCalledTimes(1);
    expect(hostMocks.invokeAgentInput).toHaveBeenCalledWith(
      {
        kind: 'command',
        catalogEntryId: 'command:builtin:help',
        commandId: 'help',
        handlerId: 'builtin:help',
      },
      'conv-1',
    );
  });

  it('reports a stale selected command without clearing or invoking it', () => {
    const clearInput = vi.fn();
    const reportInputDiagnostic = vi.fn();
    const { result } = renderHook(() =>
      useSlashCommands({
        inputCatalog,
        inputValue: '/removed',
        activeConversationId: 'conv-1',
        clearInput,
        reportInputDiagnostic,
      }),
    );

    act(() => {
      result.current.handleSlashCommand({
        id: 'command:removed',
        commandId: 'removed',
        name: '/removed',
        descriptionKey: 'Removed command',
        icon: '',
        source: 'builtin',
      });
    });

    expect(reportInputDiagnostic).toHaveBeenCalledWith(
      "Agent command '/removed' is stale or unavailable.",
    );
    expect(clearInput).not.toHaveBeenCalled();
    expect(hostMocks.invokeAgentInput).not.toHaveBeenCalled();
  });
});
