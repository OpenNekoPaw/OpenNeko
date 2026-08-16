import { describe, expect, it } from 'vitest';
import {
  buildAgentRuntimeStateSnapshotMessage,
  createAgentStateRuntime,
} from '../agent-state-runtime';

describe('agent-state-runtime', () => {
  it('stores non-idle state by conversation', async () => {
    const runtime = createAgentStateRuntime();

    await runtime.update({
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

  it('clears only the targeted conversation', async () => {
    const runtime = createAgentStateRuntime();

    await runtime.update({ conversationId: 'conv-1', phase: 'thinking', startedAt: 100 });
    await runtime.update({ conversationId: 'conv-2', phase: 'streaming', startedAt: 200 });
    await runtime.clear('conv-1');

    expect(runtime.snapshot()).toEqual([
      {
        conversationId: 'conv-2',
        phase: 'streaming',
        startedAt: 200,
      },
    ]);
  });

  it('treats idle phase as state removal', async () => {
    const runtime = createAgentStateRuntime();

    await runtime.update({ conversationId: 'conv-1', phase: 'thinking', startedAt: 100 });
    await runtime.update({ conversationId: 'conv-1', phase: 'idle', startedAt: 200 });

    expect(runtime.snapshot()).toEqual([]);
  });

  it('publishes running and terminal removal snapshots to late-bound presentation owners', async () => {
    const runtime = createAgentStateRuntime();
    await runtime.update({ conversationId: 'conv-1', phase: 'thinking', startedAt: 100 });
    const snapshots: unknown[] = [];
    const unsubscribe = runtime.subscribe((snapshot) => snapshots.push(snapshot));

    expect(runtime.snapshot()).toEqual([
      { conversationId: 'conv-1', phase: 'thinking', startedAt: 100 },
    ]);
    await runtime.update({ conversationId: 'conv-1', phase: 'idle', startedAt: 200 });
    unsubscribe();
    await runtime.update({ conversationId: 'conv-2', phase: 'acting', startedAt: 300 });

    expect(snapshots).toEqual([[]]);
  });

  it('waits for ordered snapshot publication before resolving an update', async () => {
    const runtime = createAgentStateRuntime();
    const publications: string[] = [];
    let releaseFirst: (() => void) | undefined;
    runtime.subscribe(async (snapshot) => {
      const label = snapshot.map((state) => state.conversationId).join(',');
      publications.push(`start:${label}`);
      if (label === 'conv-1') {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      publications.push(`end:${label}`);
    });

    const first = runtime.update({ conversationId: 'conv-1', phase: 'thinking', startedAt: 100 });
    const second = runtime.update({ conversationId: 'conv-2', phase: 'thinking', startedAt: 200 });
    await Promise.resolve();
    expect(publications).toEqual(['start:conv-1']);

    releaseFirst?.();
    await Promise.all([first, second]);
    expect(publications).toEqual([
      'start:conv-1',
      'end:conv-1',
      'start:conv-1,conv-2',
      'end:conv-1,conv-2',
    ]);
  });

  it('rejects an update when authoritative snapshot publication fails', async () => {
    const runtime = createAgentStateRuntime();
    runtime.subscribe(async () => {
      throw new Error('connection post failed');
    });

    await expect(
      runtime.update({ conversationId: 'conv-1', phase: 'thinking', startedAt: 100 }),
    ).rejects.toThrow('connection post failed');
  });
});
