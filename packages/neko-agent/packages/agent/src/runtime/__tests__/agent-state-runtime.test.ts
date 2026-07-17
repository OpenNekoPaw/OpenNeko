import { describe, expect, it } from 'vitest';
import {
  buildAgentRuntimeStateSnapshotMessage,
  createAgentStateRuntime,
} from '../agent-state-runtime';

describe('agent-state-runtime', () => {
  it('stores non-idle state by conversation', () => {
    const runtime = createAgentStateRuntime();

    runtime.update({
      conversationId: 'conv-1',
      phase: 'acting',
      toolName: 'task',
      startedAt: 100,
    });

    expect(runtime.snapshot()).toEqual([
      {
        conversationId: 'conv-1',
        phase: 'acting',
        toolName: 'task',
        startedAt: 100,
      },
    ]);
  });

  it('builds a webview snapshot from runtime state entries', () => {
    expect(
      buildAgentRuntimeStateSnapshotMessage([
        {
          conversationId: 'conv-1',
          phase: 'acting',
          toolName: 'GenerateImage',
          startedAt: 100,
        },
      ]),
    ).toEqual({
      type: 'agentStateSnapshot',
      agentStates: [
        {
          conversationId: 'conv-1',
          phase: 'acting',
          toolName: 'GenerateImage',
          startedAt: 100,
        },
      ],
    });
  });

  it('clears only the targeted conversation', () => {
    const runtime = createAgentStateRuntime();

    runtime.update({ conversationId: 'conv-1', phase: 'thinking', startedAt: 100 });
    runtime.update({ conversationId: 'conv-2', phase: 'streaming', startedAt: 200 });
    runtime.clear('conv-1');

    expect(runtime.snapshot()).toEqual([
      {
        conversationId: 'conv-2',
        phase: 'streaming',
        startedAt: 200,
      },
    ]);
  });

  it('treats idle phase as state removal', () => {
    const runtime = createAgentStateRuntime();

    runtime.update({ conversationId: 'conv-1', phase: 'thinking', startedAt: 100 });
    runtime.update({ conversationId: 'conv-1', phase: 'idle', startedAt: 200 });

    expect(runtime.snapshot()).toEqual([]);
  });
});
