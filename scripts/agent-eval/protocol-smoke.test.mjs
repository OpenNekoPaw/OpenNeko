import process from 'node:process';
import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import {
  EXIT_CASE_FAIL,
  EXIT_CONFIG_INVALID,
  EXIT_INFRASTRUCTURE_FAIL,
  assertSuccessfulFacts,
  classifyError,
  createDryRunResult,
  createSessionParams,
  main,
  parseArgs,
  runSinglePromptProtocol,
} from './protocol-smoke.mjs';

describe('Agent Evaluation CLI handling', () => {
  it('parses direct prompt and v2 suite options', () => {
    expect(
      parseArgs(['--cwd', '/tmp/project', '--prompt', 'hello', '--timeout-ms', '1000']),
    ).toEqual({ cwd: '/tmp/project', prompt: 'hello', timeoutMs: 1000 });
    expect(
      parseArgs([
        '--suite',
        'agent-runtime.single-message-tui',
        '--case',
        'canonical-answer',
        '--dry-run',
        '--run-id',
        'run-1',
      ]),
    ).toEqual({
      suiteId: 'agent-runtime.single-message-tui',
      caseId: 'canonical-answer',
      dryRun: true,
      runId: 'run-1',
    });
  });

  it('rejects missing option values, invalid timeouts, and removed v1 manifests', () => {
    expect(() => parseArgs(['--prompt'])).toThrow('--prompt requires a value');
    expect(() => parseArgs(['--timeout-ms', '0'])).toThrow(
      '--timeout-ms must be a positive integer',
    );
    expect(() => parseArgs(['--manifest', 'legacy.json'])).toThrow('Unknown argument: --manifest');
  });

  it('dry-runs a direct prompt without spawning TUI', async () => {
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const spawn = vi.fn();
    const code = await main(
      ['--cwd', '/tmp/project', '--prompt', 'hello', '--timeout-ms', '1000', '--dry-run'],
      { stdout, stderr, env: {}, cwd: () => '/repo', spawn },
    );
    expect(code).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
    expect(stderr.text()).toBe('');
    expect(JSON.parse(stdout.text())).toEqual({
      ok: true,
      dryRun: true,
      mode: 'direct-prompt',
      cwd: '/tmp/project',
      prompt: 'hello',
      timeoutMs: 1000,
    });
  });

  it('dry-runs a v2 suite case without spawning TUI', async () => {
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const spawn = vi.fn();
    const code = await main(
      ['--suite', 'agent-runtime.single-message-tui', '--case', 'canonical-answer', '--dry-run'],
      { stdout, stderr, env: {}, cwd: () => '/repo', spawn },
    );
    expect(code).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
    expect(stderr.text()).toBe('');
    expect(JSON.parse(stdout.text())).toMatchObject({
      ok: true,
      dryRun: true,
      schema: 'neko.agent-eval.dry-run.v2',
      suiteId: 'agent-runtime.single-message-tui',
      caseId: 'canonical-answer',
    });
  });

  it('rejects removed v1 manifest input before spawning TUI', async () => {
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const spawn = vi.fn();
    const code = await main(
      ['--manifest', 'scripts/agent-eval/scenarios/legacy.json', '--case', 'legacy'],
      { stdout, stderr, env: {}, cwd: () => '/repo', spawn },
    );
    expect(code).toBe(EXIT_CONFIG_INVALID);
    expect(spawn).not.toHaveBeenCalled();
    expect(stderr.text()).toContain('configuration invalid: Unknown argument: --manifest');
  });

  it('requires a case when selecting a suite', async () => {
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const spawn = vi.fn();
    const code = await main(['--suite', 'agent-runtime.single-message-tui', '--dry-run'], {
      stdout,
      stderr,
      env: {},
      cwd: () => '/repo',
      spawn,
    });
    expect(code).toBe(EXIT_CONFIG_INVALID);
    expect(spawn).not.toHaveBeenCalled();
    expect(stderr.text()).toContain('--case is required');
  });

  it('launches direct prompts through the canonical app executable', async () => {
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const spawn = vi.fn(() => createProtocolChild());
    const code = await main(['--cwd', '/tmp/project', '--prompt', 'hello'], {
      stdout,
      stderr,
      env: {},
      cwd: () => '/repo',
      spawn,
    });
    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      ['apps/neko-tui/dist/main.js', 'debug', 'automation', '--stdio', '-C', '/tmp/project'],
      { cwd: '/repo', shell: false, stdio: ['pipe', 'pipe', 'inherit'] },
    );
  });

  it('preserves an explicit direct-prompt debug command override', async () => {
    const spawn = vi.fn(() => createProtocolChild());
    const code = await main(['--cwd', '/tmp/project', '--prompt', 'hello'], {
      stdout: createWritableCapture(),
      stderr: createWritableCapture(),
      env: { NEKO_DEBUG_COMMAND: 'custom-neko-debug' },
      cwd: () => '/repo',
      spawn,
    });
    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalledWith(
      'custom-neko-debug',
      ['debug', 'automation', '--stdio', '-C', '/tmp/project'],
      { cwd: '/repo', shell: true, stdio: ['pipe', 'pipe', 'inherit'] },
    );
  });
});

describe('direct prompt protocol sequencing', () => {
  it('runs create, submit, idle, resize, facts, and dispose in order', async () => {
    const child = createFakeChild();
    const facts = { turns: [{ role: 'assistant', content: 'done' }] };
    await expect(
      runSinglePromptProtocol(
        child,
        responseReader([
          { ok: true, result: { sessionId: 's1', conversationId: 'conversation-1' } },
          { ok: true, result: { submitted: true } },
          { ok: true, result: { fullyIdle: true } },
          { ok: true, result: { columns: 80, rows: 24 } },
          { ok: true, result: facts },
          { ok: true, result: { disposed: true } },
        ]),
        {
          prompt: 'hello',
          timeoutMs: 1234,
          model: { chat: { providerId: 'openai', modelId: 'gpt-5' } },
          terminalResizes: [{ columns: 80, rows: 24 }],
        },
      ),
    ).resolves.toBe(facts);
    expect(child.requests.map((request) => request.method)).toEqual([
      'session.create',
      'message.submit',
      'session.waitForIdle',
      'terminal.resize',
      'session.facts',
      'session.dispose',
    ]);
    expect(child.requests[0].params).toEqual({ provider: 'openai', model: 'gpt-5' });
    expect(child.requests[1].params).toEqual({ sessionId: 's1', prompt: 'hello' });
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it('retains generic cancellation control evidence', async () => {
    const child = createFakeChild();
    const facts = { idle: { fullyIdle: true }, turns: [] };
    const result = await runSinglePromptProtocol(
      child,
      responseReader([
        { ok: true, result: { sessionId: 's1', conversationId: 'conversation-1' } },
        { ok: true, result: { submitted: true } },
        { ok: true, result: { accepted: true } },
        { ok: true, result: { fullyIdle: true } },
        { ok: true, result: facts },
        { ok: true, result: { disposed: true } },
      ]),
      { prompt: 'long response', cancelAfterMs: 1 },
    );
    expect(child.requests.map((request) => request.method)).toEqual([
      'session.create',
      'message.submit',
      'message.cancel',
      'session.waitForIdle',
      'session.facts',
      'session.dispose',
    ]);
    expect(result.automation.messageCancellation).toEqual({ accepted: true });
  });
});

describe('direct prompt result gates', () => {
  it('classifies protocol and runtime failures', () => {
    expect(classifyError(errorWithCode('invalid-request'))).toEqual({
      label: 'configuration invalid',
      exitCode: EXIT_CONFIG_INVALID,
    });
    expect(classifyError(errorWithCode('session-timeout'))).toEqual({
      label: 'infrastructure fail',
      exitCode: EXIT_INFRASTRUCTURE_FAIL,
    });
    expect(classifyError(new Error('bad output'))).toEqual({
      label: 'case fail',
      exitCode: EXIT_CASE_FAIL,
    });
  });

  it('creates direct dry-run evidence and model session params', () => {
    expect(createDryRunResult({ cwd: '/workspace', prompt: 'hello', timeoutMs: 100 })).toEqual({
      ok: true,
      dryRun: true,
      mode: 'direct-prompt',
      cwd: '/workspace',
      prompt: 'hello',
      timeoutMs: 100,
    });
    expect(
      createSessionParams({
        model: {
          chat: { providerId: 'openai', modelId: 'gpt-5' },
          purposes: {
            'image.understand': { providerId: 'openai', modelId: 'gpt-5-vision' },
          },
        },
      }),
    ).toEqual({
      provider: 'openai',
      model: 'gpt-5',
      modelPurposes: {
        'image.understand': { providerId: 'openai', modelId: 'gpt-5-vision' },
      },
    });
  });

  it('fails runtime errors, error turns, internal-user continuations, and empty answers', () => {
    expect(() => assertSuccessfulFacts({ runtimeErrors: ['runtime failed'], turns: [] })).toThrow(
      'runtime errors',
    );
    expect(() =>
      assertSuccessfulFacts({
        runtimeErrors: [],
        turns: [{ role: 'system', isError: true, content: 'Error: bad runtime' }],
      }),
    ).toThrow('error turns');
    expect(() => assertSuccessfulFacts({ runtimeErrors: [], turns: [] })).toThrow(
      'without a non-empty assistant response',
    );
    expect(() =>
      assertSuccessfulFacts({
        runtimeErrors: [],
        turns: [
          { role: 'user', content: 'Continue from the completed async task result.' },
          { role: 'assistant', content: 'ok' },
        ],
      }),
    ).toThrow('internal continuation prompts');
  });

  it('accepts a non-empty assistant answer with no runtime errors', () => {
    expect(() =>
      assertSuccessfulFacts({
        runtimeErrors: [],
        turns: [{ role: 'assistant', content: 'ok' }],
      }),
    ).not.toThrow();
  });
});

function createWritableCapture() {
  let output = '';
  return {
    write(value) {
      output += value;
    },
    text() {
      return output;
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

function createProtocolChild() {
  const responses = [
    { ok: true, result: { sessionId: 's1', conversationId: 'conversation-1' } },
    { ok: true, result: { submitted: true } },
    { ok: true, result: { fullyIdle: true } },
    {
      ok: true,
      result: {
        runtimeErrors: [],
        idle: { fullyIdle: true },
        turns: [{ id: 'a1', role: 'assistant', content: 'done' }],
      },
    },
    { ok: true, result: { disposed: true } },
  ];
  return {
    stdout: Readable.from(responses.map((response) => `${JSON.stringify(response)}\n`)),
    stdin: { write: vi.fn(), end: vi.fn() },
    kill: vi.fn(),
  };
}

async function* responseReader(responses) {
  for (const response of responses) yield response;
}

function errorWithCode(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
