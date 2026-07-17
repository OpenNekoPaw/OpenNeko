import { describe, expect, it, vi } from 'vitest';
import { runSingleMessageTuiDriver } from './single-message-driver.mjs';

describe('canonical single-message TUI driver cleanup', () => {
  it('disposes a created session when idle wait fails', async () => {
    const child = createFakeChild();
    const failure = { ok: false, error: { code: 'session-timeout', message: 'timed out' } };
    await expect(
      runSingleMessageTuiDriver(
        child,
        responseReader([
          { ok: true, result: { sessionId: 's1', conversationId: 'conversation-1' } },
          { ok: true, result: { submitted: true } },
          failure,
          { ok: true, result: { disposed: true } },
        ]),
        { prompt: 'hello', timeoutMs: 10 },
      ),
    ).rejects.toMatchObject({ code: 'session-timeout', message: 'timed out' });
    expect(child.requests.map((request) => request.method)).toEqual([
      'session.create',
      'message.submit',
      'session.waitForIdle',
      'session.dispose',
    ]);
    expect(child.stdin.end).toHaveBeenCalledOnce();
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('preserves the primary failure when cleanup also fails', async () => {
    const child = createFakeChild();
    await expect(
      runSingleMessageTuiDriver(
        child,
        responseReader([
          { ok: true, result: { sessionId: 's1', conversationId: 'conversation-1' } },
          { ok: false, error: { code: 'internal-error', message: 'submit failed' } },
          { ok: false, error: { code: 'session-disposed', message: 'dispose failed' } },
        ]),
        { prompt: 'hello' },
      ),
    ).rejects.toMatchObject({ code: 'internal-error', message: 'submit failed' });
    expect(child.stdin.end).toHaveBeenCalledOnce();
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('fails visibly when successful execution cannot dispose the session', async () => {
    const child = createFakeChild();
    await expect(
      runSingleMessageTuiDriver(
        child,
        responseReader([
          { ok: true, result: { sessionId: 's1', conversationId: 'conversation-1' } },
          { ok: true, result: { submitted: true } },
          { ok: true, result: { fullyIdle: true } },
          { ok: true, result: { turns: [] } },
          { ok: false, error: { code: 'internal-error', message: 'dispose failed' } },
        ]),
        { prompt: 'hello' },
      ),
    ).rejects.toMatchObject({ code: 'internal-error', message: 'dispose failed' });
  });
});

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

async function* responseReader(responses) {
  for (const response of responses) yield response;
}
