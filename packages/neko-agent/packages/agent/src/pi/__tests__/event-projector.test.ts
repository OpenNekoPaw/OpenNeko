import type { AgentEvent } from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { describe, expect, it } from 'vitest';

import { PiEventProjector, type PiProductAgentEvent } from '../event-projector';

const identity = {
  workspaceId: 'workspace-1',
  conversationId: 'conversation-1',
  branchId: 'branch-main',
  turnId: 'turn-1',
  runId: 'run-1',
} as const;

function assistant(
  stopReason: AssistantMessage['stopReason'],
  errorMessage?: string,
): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'final' }],
    api: 'openai-completions',
    provider: 'newapi',
    model: 'main',
    usage: {
      input: 10,
      output: 5,
      cacheRead: 2,
      cacheWrite: 0,
      totalTokens: 17,
      cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 },
    },
    stopReason,
    ...(errorMessage === undefined ? {} : { errorMessage }),
    timestamp: 1,
  };
}

describe('PiEventProjector', () => {
  it('projects streaming, thinking, tool, usage, task, and terminal events', async () => {
    const events: PiProductAgentEvent[] = [];
    let timestamp = 10;
    const projector = new PiEventProjector(
      identity,
      {
        emit: (event) => {
          events.push(event);
        },
      },
      () => timestamp++,
      (wireName) => (wireName === 'read_image_a1b2c3d4' ? 'perception.image.read' : wireName),
    );
    const final = assistant('stop');

    await projector.project({ type: 'agent_start' });
    await projector.project(messageUpdate('text_delta', 'hello', final));
    await projector.project(messageUpdate('thinking_delta', 'reason', final));
    await projector.project({
      type: 'tool_execution_start',
      toolCallId: 'tool-1',
      toolName: 'read_image_a1b2c3d4',
      args: { path: 'virtual' },
    });
    await projector.project({
      type: 'tool_execution_update',
      toolCallId: 'tool-1',
      toolName: 'read_image_a1b2c3d4',
      args: { path: 'virtual' },
      partialResult: { progress: 50 },
    });
    await projector.project({
      type: 'tool_execution_end',
      toolCallId: 'tool-1',
      toolName: 'read_image_a1b2c3d4',
      result: { content: [{ type: 'text', text: 'ok' }], details: {} },
      isError: false,
    });
    await projector.confirmationRequired({
      confirmationId: 'confirmation-1',
      toolCallId: 'tool-2',
      toolName: 'write',
      summary: 'Write project',
    });
    await projector.taskObserved('task:1', { status: 'running' });
    await projector.project({ type: 'message_end', message: final });
    await projector.project({ type: 'agent_end', messages: [final] });

    expect(events.map((event) => event.type)).toEqual([
      'turn.started',
      'assistant.text.delta',
      'assistant.thinking.delta',
      'tool.started',
      'tool.updated',
      'tool.completed',
      'confirmation.required',
      'task.observed',
      'assistant.message.completed',
      'usage',
      'turn.completed',
    ]);
    expect(events.every((event) => event.identity === identity)).toBe(true);
    expect(events.find((event) => event.type === 'usage')).toMatchObject({
      provider: 'newapi',
      model: 'main',
      usage: { totalTokens: 17 },
    });
    expect(events.filter((event) => event.type.startsWith('tool.'))).toEqual([
      expect.objectContaining({ toolName: 'perception.image.read' }),
      expect.objectContaining({ toolName: 'perception.image.read' }),
      expect.objectContaining({ toolName: 'perception.image.read' }),
    ]);
  });

  it.each([
    ['aborted', 'turn.cancelled'],
    ['error', 'turn.failed'],
  ] as const)('maps %s stop state to %s', async (stopReason, expectedType) => {
    const events: PiProductAgentEvent[] = [];
    const message = assistant(stopReason, 'fixture failure');
    const projector = new PiEventProjector(identity, {
      emit: (event) => {
        events.push(event);
      },
    });

    await projector.project({ type: 'agent_end', messages: [message] });

    expect(events).toEqual([expect.objectContaining({ type: expectedType })]);
    await expect(projector.project({ type: 'turn_start' })).rejects.toThrow(
      'arrived after terminal turn state',
    );
  });
});

function messageUpdate(
  type: 'text_delta' | 'thinking_delta',
  delta: string,
  partial: AssistantMessage,
): Extract<AgentEvent, { type: 'message_update' }> {
  return {
    type: 'message_update',
    message: partial,
    assistantMessageEvent: { type, contentIndex: 0, delta, partial },
  };
}
