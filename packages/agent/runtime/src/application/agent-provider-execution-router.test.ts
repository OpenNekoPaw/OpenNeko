import { describe, expect, it, vi } from 'vitest';
import type { AgentProviderExecutionInput } from './agent-conversation-lifecycle-service';
import { createAgentProviderExecutionRouter } from './agent-provider-execution-router';

describe('AgentProviderExecutionRouter', () => {
  it('routes only the outer Room interaction to the Room execution owner', async () => {
    const standard = vi.fn();
    const roomInteraction = vi.fn(async () => undefined);
    const router = createAgentProviderExecutionRouter({
      standard: { start: standard },
      roomInteraction: { start: roomInteraction },
    });
    const input = executionInput({
      kind: 'room',
      scope: 'interaction',
      roomId: 'room-1',
      roomRunId: 'room-run-1',
    });

    await router.start(input);

    expect(roomInteraction).toHaveBeenCalledWith(input);
    expect(standard).not.toHaveBeenCalled();
  });

  it('routes a Room participant through the canonical Agent provider path', async () => {
    const standard = vi.fn(async () => ({ turnId: 'turn-1', content: 'Hello' }));
    const roomInteraction = vi.fn();
    const router = createAgentProviderExecutionRouter({
      standard: { start: standard },
      roomInteraction: { start: roomInteraction },
    });
    const input = executionInput({
      kind: 'room',
      scope: 'participant',
      roomId: 'room-1',
      roomRunId: 'room-run-1',
      participantId: 'participant-1',
      characterRunId: 'character-run-1',
    });

    await expect(router.start(input)).resolves.toEqual({ turnId: 'turn-1', content: 'Hello' });
    expect(standard).toHaveBeenCalledWith(input);
    expect(roomInteraction).not.toHaveBeenCalled();
  });
});

function executionInput(
  context: AgentProviderExecutionInput['context'],
): AgentProviderExecutionInput {
  return {
    requestId: 'request-1',
    turnId: 'turn-1',
    conversationId: 'conversation-1',
    context,
    input: { kind: 'message', text: 'Hello' },
    entryTargetReceipt: null,
    resourceGrantIds: [],
    contextPayloads: [],
    configuration: {
      providerId: 'provider-1',
      modelId: 'model-1',
      systemPrompt: 'System',
      enabledSkillIds: [],
      toolAvailability: 'configured',
      externalReferences: 'configured',
    },
    capabilityConstraint: {
      owner: { kind: 'room', id: 'conversation-1' },
      skills: 'configured',
      tools: 'configured',
      references: 'configured',
    },
  };
}
