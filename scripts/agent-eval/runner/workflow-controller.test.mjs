import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { runTuiWorkflowController } from './workflow-controller.mjs';

describe('external TUI workflow controller', () => {
  it('has no direct Agent runner or legacy single-message orchestration fallback', async () => {
    const [controllerSource, v2RunnerSource] = await Promise.all([
      fs.readFile('scripts/agent-eval/runner/workflow-controller.mjs', 'utf8'),
      fs.readFile('scripts/agent-eval/runner/run-v2-case.mjs', 'utf8'),
    ]);
    expect(controllerSource).not.toMatch(/@neko\/agent|AgentSession|turn-runner/u);
    expect(v2RunnerSource).not.toContain('single-message-driver');
    expect(v2RunnerSource).toContain('runTuiWorkflowController');
  });

  it('routes sequential, queued, and closed-loop feedback inputs through message.submit', async () => {
    const child = createFakeChild();
    const result = await runTuiWorkflowController(
      child,
      dynamicResponses(child, (request) => {
        if (request.method === 'session.create') {
          return ok({ sessionId: 's1', conversationId: 'conversation-1' });
        }
        if (request.method === 'message.submit') {
          return ok({ queued: request.id.startsWith('queue:') });
        }
        if (request.method === 'session.waitForIdle') return ok({ fullyIdle: true });
        if (request.method === 'session.facts') {
          return ok(
            facts({
              pendingCount: request.id.startsWith('queue:') ? 1 : 0,
              assistantContent: 'draft output',
            }),
          );
        }
        if (request.method === 'session.dispose') return ok({ disposed: true });
        throw new Error(`unexpected method ${request.method}`);
      }),
      {
        steps: [
          { id: 'initial', kind: 'submit', prompt: 'Create a draft.' },
          { id: 'queue', kind: 'queue', prompt: 'Check the draft.', afterStepId: 'initial' },
          { id: 'first-idle', kind: 'wait-for-idle', timeoutMs: 1_000 },
          {
            id: 'feedback',
            kind: 'feedback',
            prompt: 'Revise this output:\n${lastAssistant}',
            afterStepId: 'first-idle',
          },
          { id: 'final-idle', kind: 'wait-for-idle', timeoutMs: 1_000 },
        ],
      },
    );

    const submissions = child.requests.filter((request) => request.method === 'message.submit');
    expect(submissions.map((request) => request.params.prompt)).toEqual([
      'Create a draft.',
      'Check the draft.',
      'Revise this output:\ndraft output',
    ]);
    expect(result.automation.steps.find((step) => step.id === 'queue')).toMatchObject({
      method: 'message.submit',
      queued: true,
      snapshot: {
        messageQueue: { pendingCount: 1 },
        workspaceBoardDelivery: {
          canonicalSubmissionCount: 1,
          resumeScanCount: 1,
          legacyFallbackCounts: {
            activeCanvas: 0,
            recentCanvas: 0,
            directWriter: 0,
            genericSendToCanvas: 0,
          },
        },
      },
    });
    expect(result.automation.steps.find((step) => step.id === 'feedback')).toMatchObject({
      method: 'message.submit',
      feedbackSource: { turnId: 'assistant-1' },
    });
    expect(child.requests.at(-1).method).toBe('session.dispose');
  });

  it('keeps one TUI session open while delaying a later submit step', async () => {
    vi.useFakeTimers();
    const child = createFakeChild();
    try {
      const operation = runTuiWorkflowController(
        child,
        dynamicResponses(child, (request) => {
          if (request.method === 'session.create') {
            return ok({ sessionId: 's1', conversationId: 'conversation-1' });
          }
          if (request.method === 'message.submit') return ok({ queued: false });
          if (request.method === 'session.waitForIdle') return ok({ fullyIdle: true });
          if (request.method === 'session.facts') return ok(facts());
          if (request.method === 'session.dispose') return ok({ disposed: true });
          throw new Error(`unexpected method ${request.method}`);
        }),
        {
          steps: [
            { id: 'first', kind: 'submit', prompt: 'First turn.' },
            { id: 'first-idle', kind: 'wait-for-idle', timeoutMs: 1_000 },
            { id: 'second', kind: 'submit', prompt: 'Second turn.', delayMs: 35_000 },
            { id: 'second-idle', kind: 'wait-for-idle', timeoutMs: 1_000 },
          ],
        },
      );

      await vi.advanceTimersByTimeAsync(34_999);
      expect(child.requests.filter((request) => request.method === 'message.submit')).toHaveLength(
        1,
      );
      expect(child.requests.filter((request) => request.method === 'session.create')).toHaveLength(
        1,
      );

      await vi.advanceTimersByTimeAsync(1);
      await operation;
      expect(child.requests.filter((request) => request.method === 'message.submit')).toHaveLength(
        2,
      );
      expect(child.requests.filter((request) => request.method === 'session.create')).toHaveLength(
        1,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('disposes the old session before resume and supports cancellation recovery', async () => {
    const child = createFakeChild();
    let sessionSequence = 0;
    const result = await runTuiWorkflowController(
      child,
      dynamicResponses(child, (request) => {
        if (request.method === 'session.create' || request.method === 'session.resume') {
          sessionSequence += 1;
          return ok({ sessionId: `s${sessionSequence}`, conversationId: 'conversation-1' });
        }
        if (request.method === 'message.submit') return ok({ queued: false });
        if (request.method === 'message.cancel') return ok({ accepted: true });
        if (request.method === 'session.waitForIdle') return ok({ fullyIdle: true });
        if (request.method === 'session.facts') return ok(facts());
        if (request.method === 'session.dispose') return ok({ disposed: true });
        throw new Error(`unexpected method ${request.method}`);
      }),
      {
        steps: [
          { id: 'initial', kind: 'submit', prompt: 'Start long work.' },
          { id: 'cancel', kind: 'cancel', afterStepId: 'initial' },
          { id: 'cancelled-idle', kind: 'wait-for-idle', timeoutMs: 1_000 },
          { id: 'resume', kind: 'resume', conversationRef: 'current' },
          { id: 'recover', kind: 'submit', prompt: 'Recover with a smaller task.' },
          { id: 'recovered-idle', kind: 'wait-for-idle', timeoutMs: 1_000 },
        ],
      },
    );

    expect(child.requests.map((request) => request.method)).toEqual(
      expect.arrayContaining(['session.create', 'message.cancel', 'session.resume']),
    );
    const resumeIndex = child.requests.findIndex((request) => request.method === 'session.resume');
    expect(child.requests[resumeIndex - 1]).toMatchObject({
      method: 'session.dispose',
      params: { sessionId: 's1' },
    });
    expect(child.requests[resumeIndex]).toMatchObject({
      method: 'session.resume',
      params: { conversationId: 'conversation-1' },
    });
    expect(result.automation.steps.find((step) => step.id === 'cancel')).toMatchObject({
      accepted: true,
    });
    expect(
      child.requests
        .filter((request) => request.method === 'session.dispose')
        .map((request) => request.params.sessionId),
    ).toEqual(['s1', 's2']);
  });

  it('routes terminal resize through the generic TUI control and captures its facts', async () => {
    const child = createFakeChild();
    const result = await runTuiWorkflowController(
      child,
      dynamicResponses(child, (request) => {
        if (request.method === 'session.create') {
          return ok({ sessionId: 's1', conversationId: 'conversation-1' });
        }
        if (request.method === 'message.submit') return ok({ queued: false });
        if (request.method === 'session.waitForIdle') return ok({ fullyIdle: true });
        if (request.method === 'terminal.resize') {
          return ok({ columns: request.params.columns, rows: request.params.rows });
        }
        if (request.method === 'session.facts') return ok(facts());
        if (request.method === 'session.dispose') return ok({ disposed: true });
        throw new Error(`unexpected method ${request.method}`);
      }),
      {
        resizeSettleMs: 0,
        steps: [
          { id: 'initial', kind: 'submit', prompt: 'Write Markdown.' },
          { id: 'initial-idle', kind: 'wait-for-idle', timeoutMs: 1_000 },
          { id: 'resize', kind: 'resize', columns: 48, rows: 24 },
          { id: 'final-idle', kind: 'wait-for-idle', timeoutMs: 1_000 },
        ],
      },
    );
    expect(child.requests.find((request) => request.method === 'terminal.resize')).toMatchObject({
      params: { sessionId: 's1', columns: 48, rows: 24 },
    });
    expect(result.automation.steps.find((step) => step.id === 'resize')).toMatchObject({
      method: 'terminal.resize',
      columns: 48,
      rows: 24,
      snapshot: { conversationId: 'conversation-1' },
    });
  });

  it('preserves timeout failure and disposes the active session', async () => {
    const child = createFakeChild();
    await expect(
      runTuiWorkflowController(
        child,
        dynamicResponses(child, (request) => {
          if (request.method === 'session.create') {
            return ok({ sessionId: 's1', conversationId: 'conversation-1' });
          }
          if (request.method === 'message.submit') return ok({ queued: false });
          if (request.method === 'session.facts') return ok(facts());
          if (request.method === 'session.waitForIdle') {
            return fail('session-timeout', 'timed out');
          }
          if (request.method === 'session.dispose') return ok({ disposed: true });
          throw new Error(`unexpected method ${request.method}`);
        }),
        {
          steps: [
            { id: 'initial', kind: 'submit', prompt: 'Start.' },
            { id: 'idle', kind: 'wait-for-idle', timeoutMs: 10 },
          ],
        },
      ),
    ).rejects.toMatchObject({ code: 'session-timeout' });
    expect(child.requests.at(-1)).toMatchObject({ method: 'session.dispose' });
    expect(child.stdin.end).toHaveBeenCalledOnce();
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('preserves the allowlisted TUI initialization diagnostic', async () => {
    const child = createFakeChild();

    await expect(
      runTuiWorkflowController(
        child,
        dynamicResponses(child, (request) => {
          if (request.method === 'session.create') {
            return fail('internal-error', 'TUI session initialization failed.', {
              sessionId: 's1',
              diagnostic: 'Workspace locator must be relative or variable-based.',
              ignored: { apiKey: 'must-not-propagate' },
            });
          }
          throw new Error(`unexpected method ${request.method}`);
        }),
        { steps: [] },
      ),
    ).rejects.toMatchObject({
      code: 'internal-error',
      message:
        'TUI session initialization failed. Workspace locator must be relative or variable-based.',
    });
  });

  it('fails closed-loop feedback on incomplete evidence and still disposes', async () => {
    const child = createFakeChild();
    await expect(
      runTuiWorkflowController(
        child,
        dynamicResponses(child, (request) => {
          if (request.method === 'session.create') {
            return ok({ sessionId: 's1', conversationId: 'conversation-1' });
          }
          if (request.method === 'message.submit') return ok({ queued: false });
          if (request.method === 'session.waitForIdle') return ok({ fullyIdle: true });
          if (request.method === 'session.facts') {
            return ok(facts({ droppedTurns: 1 }));
          }
          if (request.method === 'session.dispose') return ok({ disposed: true });
          throw new Error(`unexpected method ${request.method}`);
        }),
        {
          steps: [
            { id: 'initial', kind: 'submit', prompt: 'Start.' },
            { id: 'idle', kind: 'wait-for-idle', timeoutMs: 10 },
            {
              id: 'feedback',
              kind: 'feedback',
              prompt: 'Revise: ${lastAssistant}',
              afterStepId: 'idle',
            },
          ],
        },
      ),
    ).rejects.toMatchObject({ code: 'incomplete-evidence' });
    expect(child.requests.at(-1)).toMatchObject({ method: 'session.dispose' });
  });

  it('preserves the primary failure when session disposal also fails', async () => {
    const child = createFakeChild();
    await expect(
      runTuiWorkflowController(
        child,
        dynamicResponses(child, (request) => {
          if (request.method === 'session.create') {
            return ok({ sessionId: 's1', conversationId: 'conversation-1' });
          }
          if (request.method === 'message.submit') {
            return fail('internal-error', 'submit failed');
          }
          if (request.method === 'session.dispose') {
            return fail('session-disposed', 'dispose failed');
          }
          throw new Error(`unexpected method ${request.method}`);
        }),
        { steps: [{ id: 'initial', kind: 'submit', prompt: 'Start.' }] },
      ),
    ).rejects.toMatchObject({ code: 'internal-error', message: 'submit failed' });
    expect(child.requests.at(-1)).toMatchObject({ method: 'session.dispose' });
  });

  it('fails visibly when a successful workflow cannot dispose its session', async () => {
    const child = createFakeChild();
    await expect(
      runTuiWorkflowController(
        child,
        dynamicResponses(child, (request) => {
          if (request.method === 'session.create') {
            return ok({ sessionId: 's1', conversationId: 'conversation-1' });
          }
          if (request.method === 'message.submit') return ok({ queued: false });
          if (request.method === 'session.facts') return ok(facts());
          if (request.method === 'session.waitForIdle') return ok({ fullyIdle: true });
          if (request.method === 'session.dispose') {
            return fail('internal-error', 'dispose failed');
          }
          throw new Error(`unexpected method ${request.method}`);
        }),
        {
          steps: [
            { id: 'initial', kind: 'submit', prompt: 'Start.' },
            { id: 'idle', kind: 'wait-for-idle', timeoutMs: 10 },
          ],
        },
      ),
    ).rejects.toMatchObject({ code: 'internal-error', message: 'dispose failed' });
  });
});

function facts(options = {}) {
  return {
    conversationId: 'conversation-1',
    model: { providerId: 'openai', modelId: 'gpt-5' },
    configuration: {
      digest: `sha256:${'a'.repeat(64)}`,
      runtime: {},
      chat: { providerId: 'openai', modelId: 'gpt-5' },
    },
    idle: { fullyIdle: true },
    messageQueue: {
      conversationId: 'conversation-1',
      version: 1,
      pendingCount: options.pendingCount ?? 0,
      pausedAfterCancel: false,
      items: options.pendingCount ? [{ id: 'queued-1', source: 'user' }] : [],
    },
    turns: [
      { id: 'user-1', role: 'user', source: 'user', content: 'request' },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: options.assistantContent ?? 'done',
        toolCalls: [],
        timeline: [],
      },
    ],
    tasks: [],
    continuations: [],
    workspaceBoardProjections: [],
    workspaceBoardDelivery: {
      canonicalSubmissionCount: 1,
      resumeScanCount: 1,
      legacyFallbackCounts: {
        activeCanvas: 0,
        recentCanvas: 0,
        directWriter: 0,
        genericSendToCanvas: 0,
      },
    },
    retries: { taskRetryCount: 0, tasksWithRetries: 0 },
    runtimeErrors: [],
    evidenceCompleteness: {
      turns: { limit: 512, droppedCount: options.droppedTurns ?? 0 },
    },
  };
}

function createFakeChild() {
  const requests = [];
  return {
    requests,
    stdin: {
      write: vi.fn((line) => requests.push(JSON.parse(line))),
      end: vi.fn(),
    },
    kill: vi.fn(),
  };
}

async function* dynamicResponses(child, respond) {
  let index = 0;
  for (;;) {
    const request = child.requests[index];
    if (!request) throw new Error(`response requested before request ${index}`);
    index += 1;
    yield respond(request);
  }
}

function ok(result) {
  return { ok: true, result };
}

function fail(code, message, details) {
  return { ok: false, error: { code, message, ...(details ? { details } : {}) } };
}
