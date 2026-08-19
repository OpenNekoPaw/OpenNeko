import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Model,
} from '@earendil-works/pi-ai';
import { describe, expect, it, vi } from 'vitest';

import {
  createAgentProviderTurnScheduler,
  type AgentProviderTurnScheduler,
} from './agent-provider-turn-scheduler';
import type { PiToolRunIdentity } from '@neko/agent-runtime/pi';

const MODEL: Model<'openai-completions'> = {
  id: 'main',
  name: 'Main',
  api: 'openai-completions',
  provider: 'fixture',
  baseUrl: 'https://fixture.invalid/api',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8_192,
  maxTokens: 2_048,
};

describe('AgentProviderTurnScheduler', () => {
  it('admits at most two provider turns and advances eligible Conversations fairly', async () => {
    const scheduler = createAgentProviderTurnScheduler();
    const fixture = createControlledProviderStreams(scheduler);

    fixture.submit(identity('conversation-1', 'turn-1'));
    fixture.submit(identity('conversation-2', 'turn-2'));
    fixture.submit(identity('conversation-3', 'turn-3'));
    fixture.submit(identity('conversation-4', 'turn-4'));

    await vi.waitFor(() => expect(fixture.started).toEqual(['turn-1', 'turn-2']));
    expect(scheduler.snapshot()).toMatchObject({
      limit: 2,
      active: [{ turnId: 'turn-1' }, { turnId: 'turn-2' }],
      queued: [{ turnId: 'turn-3' }, { turnId: 'turn-4' }],
    });
    fixture.finish('turn-2');
    await vi.waitFor(() => expect(fixture.started).toEqual(['turn-1', 'turn-2', 'turn-3']));
    fixture.finish('turn-1');
    await vi.waitFor(() =>
      expect(fixture.started).toEqual(['turn-1', 'turn-2', 'turn-3', 'turn-4']),
    );
    expect(fixture.maximumActive).toBe(2);

    fixture.finish('turn-3');
    fixture.finish('turn-4');
    await vi.waitFor(() => expect(scheduler.snapshot().active).toEqual([]));
    scheduler.dispose();
  });

  it('never admits two provider turns for the same Conversation concurrently', async () => {
    const scheduler = createAgentProviderTurnScheduler();
    const fixture = createControlledProviderStreams(scheduler);

    fixture.submit(identity('conversation-1', 'turn-1'));
    fixture.submit(identity('conversation-1', 'turn-2'));
    fixture.submit(identity('conversation-2', 'turn-3'));

    await vi.waitFor(() => expect(fixture.started).toEqual(['turn-1', 'turn-3']));
    expect(scheduler.snapshot().queued).toEqual([
      expect.objectContaining({ conversationId: 'conversation-1', turnId: 'turn-2' }),
    ]);
    fixture.finish('turn-1');
    await vi.waitFor(() => expect(fixture.started).toEqual(['turn-1', 'turn-3', 'turn-2']));

    fixture.finish('turn-2');
    fixture.finish('turn-3');
    await vi.waitFor(() => expect(scheduler.snapshot().active).toEqual([]));
    scheduler.dispose();
  });

  it('cancels a queued provider turn without starting it or disturbing active siblings', async () => {
    const scheduler = createAgentProviderTurnScheduler();
    const fixture = createControlledProviderStreams(scheduler);
    const controller = new AbortController();

    fixture.submit(identity('conversation-1', 'turn-1'));
    fixture.submit(identity('conversation-2', 'turn-2'));
    const cancelled = fixture.submit(identity('conversation-3', 'turn-3'), controller.signal);
    await vi.waitFor(() => expect(scheduler.snapshot().queued).toHaveLength(1));

    controller.abort(new Error('cancel queued turn'));

    const events = await collectEvents(cancelled);
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', reason: 'aborted' }));
    expect(fixture.started).toEqual(['turn-1', 'turn-2']);
    expect(scheduler.snapshot().queued).toEqual([]);
    fixture.finish('turn-1');
    fixture.finish('turn-2');
    await vi.waitFor(() => expect(scheduler.snapshot().active).toEqual([]));
    scheduler.dispose();
  });
});

function createControlledProviderStreams(scheduler: AgentProviderTurnScheduler) {
  const active = new Set<string>();
  const streams = new Map<string, AssistantMessageEventStream>();
  const started: string[] = [];
  let maximumActive = 0;
  return {
    started,
    get maximumActive() {
      return maximumActive;
    },
    submit(identity: PiToolRunIdentity, signal?: AbortSignal) {
      return scheduler.stream({
        identity,
        model: MODEL,
        ...(signal === undefined ? {} : { signal }),
        start: () => {
          const stream = createAssistantMessageEventStream();
          active.add(identity.turnId);
          maximumActive = Math.max(maximumActive, active.size);
          started.push(identity.turnId);
          streams.set(identity.turnId, stream);
          stream.push({ type: 'start', partial: assistant(`started ${identity.turnId}`) });
          return stream;
        },
      });
    },
    finish(turnId: string) {
      const stream = streams.get(turnId);
      if (!stream) throw new Error(`Provider stream '${turnId}' is not active.`);
      active.delete(turnId);
      const message = assistant(`completed ${turnId}`);
      stream.push({ type: 'done', reason: 'stop', message });
      stream.end();
    },
  };
}

function identity(conversationId: string, turnId: string): PiToolRunIdentity {
  return {
    workspaceId: 'workspace-1',
    conversationId,
    branchId: 'main',
    turnId,
    runId: `run-${turnId}`,
  };
}

function assistant(text: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: MODEL.api,
    provider: MODEL.provider,
    model: MODEL.id,
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  };
}

async function collectEvents(stream: AssistantMessageEventStream) {
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
}
