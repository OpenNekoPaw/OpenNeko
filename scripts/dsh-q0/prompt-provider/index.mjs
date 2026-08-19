import { appendFile, readFile } from 'node:fs/promises';

import { LlmAdapter } from '@deepseek-ai/dsh-llm';

const provider = 'openneko-q0-prompt';
const model = 'deterministic';
const pollIntervalMs = 10;
const releaseTimeoutMs = 10_000;
let active = 0;
let observationTail = Promise.resolve();

export const name = 'openneko-dsh-q0-prompt-provider';
export const inject = ['llm'];

export function apply(ctx) {
  const observationsPath = requireEnvironmentPath('DSH_Q0_PROMPT_OBSERVATIONS');
  const releasesPath = requireEnvironmentPath('DSH_Q0_PROMPT_RELEASES');

  class QualificationAdapter extends LlmAdapter {
    async *stream(options) {
      if (options.provider !== provider || options.model !== model) {
        throw new Error('DSH Q0 prompt provider received an unexpected route.');
      }
      if (options.purpose !== undefined) {
        throw new Error(`DSH Q0 prompt provider received an unexpected purpose: ${options.purpose}`);
      }
      if (typeof options.sessionId !== 'string' || options.sessionId.length === 0) {
        throw new Error('DSH Q0 prompt provider requires an exact Session identity.');
      }

      const sessionId = options.sessionId;
      active += 1;
      await observe(observationsPath, { kind: 'start', sessionId, active });
      try {
        await waitForRelease(releasesPath, sessionId, options.signal);
        const text = `Deterministic response for ${sessionId}`;
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'text-delta', index: 0, text };
        yield { type: 'block-end', index: 0, block: { type: 'text', text } };
        yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } };
        yield { type: 'finish', reason: { kind: 'stop' } };
      } finally {
        active -= 1;
        await observe(observationsPath, { kind: 'end', sessionId, active });
      }
    }
  }

  ctx.llm.registerAdapter([provider], new QualificationAdapter());
}

async function waitForRelease(path, sessionId, signal) {
  const deadline = Date.now() + releaseTimeoutMs;
  while (true) {
    if (signal?.aborted) throw signal.reason ?? new Error('DSH Q0 prompt was aborted.');
    const releases = (await readFile(path, 'utf8')).split('\n');
    if (releases.includes(sessionId)) return;
    if (Date.now() >= deadline) {
      throw new Error(`DSH Q0 prompt release timed out for Session ${sessionId}.`);
    }
    await delay(pollIntervalMs, signal);
  }
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(signal?.reason ?? new Error('DSH Q0 prompt was aborted.'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function observe(path, event) {
  observationTail = observationTail.then(() =>
    appendFile(path, `${JSON.stringify(event)}\n`, 'utf8'),
  );
  await observationTail;
}

function requireEnvironmentPath(name) {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required by the isolated DSH Q0 prompt provider.`);
  }
  return value;
}
