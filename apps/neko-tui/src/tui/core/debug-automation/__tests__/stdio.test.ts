import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runTuiDebugAutomationJsonLineServer } from '../stdio';
import {
  TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA,
  TUI_DEBUG_AUTOMATION_RESPONSE_SCHEMA,
} from '../types';

describe('TUI debug automation stdio framing', () => {
  it('writes one JSON response per JSON line request without transitive console pollution', async () => {
    const originalConsole = globalThis.console;
    const input = new PassThrough();
    const output = new PassThrough();
    const diagnosticOutput = new PassThrough();
    const chunks: string[] = [];
    const diagnosticChunks: string[] = [];
    output.on('data', (chunk) => chunks.push(chunk.toString()));
    diagnosticOutput.on('data', (chunk) => diagnosticChunks.push(chunk.toString()));

    const done = runTuiDebugAutomationJsonLineServer({
      input,
      output,
      diagnosticOutput,
      handler: {
        async handle(request) {
          console.log('本地化终端横幅不得进入协议 stdout');
          return { method: request.method };
        },
      },
    });

    input.write(
      `${JSON.stringify({
        schema: TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA,
        id: '1',
        method: 'session.facts',
        params: { sessionId: 'debug-session-1' },
      })}\n`,
    );
    input.write('not-json\n');
    input.end();
    await done;

    const responses = chunks
      .join('')
      .trim()
      .split('\n')
      .map(
        (line) =>
          JSON.parse(line) as {
            readonly schema: string;
            readonly ok: boolean;
            readonly error?: unknown;
          },
      );
    expect(responses).toHaveLength(2);
    expect(
      responses.every((response) => response.schema === TUI_DEBUG_AUTOMATION_RESPONSE_SCHEMA),
    ).toBe(true);
    expect(chunks.join('')).not.toContain('本地化终端横幅不得进入协议 stdout');
    expect(responses[0]).toMatchObject({ ok: true, result: { method: 'session.facts' } });
    expect(responses[1]).toMatchObject({ ok: false, error: { code: 'invalid-json' } });
    expect(diagnosticChunks.join('')).toContain('本地化终端横幅不得进入协议 stdout');
    expect(globalThis.console).toBe(originalConsole);
  });

  it('keeps the active console reservation when concurrent servers close out of order', async () => {
    const originalConsole = globalThis.console;
    const firstInput = new PassThrough();
    const secondInput = new PassThrough();
    const firstDiagnostics = new PassThrough();
    const secondDiagnostics = new PassThrough();
    const secondDiagnosticChunks: string[] = [];
    secondDiagnostics.on('data', (chunk) => secondDiagnosticChunks.push(chunk.toString()));

    const firstDone = runTuiDebugAutomationJsonLineServer({
      input: firstInput,
      output: new PassThrough(),
      diagnosticOutput: firstDiagnostics,
      handler: {
        async handle() {
          return {};
        },
      },
    });
    const secondDone = runTuiDebugAutomationJsonLineServer({
      input: secondInput,
      output: new PassThrough(),
      diagnosticOutput: secondDiagnostics,
      handler: {
        async handle() {
          return {};
        },
      },
    });

    firstInput.end();
    await firstDone;
    console.log('second server remains reserved');
    expect(secondDiagnosticChunks.join('')).toContain('second server remains reserved');
    expect(globalThis.console).not.toBe(originalConsole);

    secondInput.end();
    await secondDone;
    expect(globalThis.console).toBe(originalConsole);
  });

  it('keeps stdout reserved until a pending handler settles after an input error', async () => {
    const originalConsole = globalThis.console;
    const input = new PassThrough();
    const output = new PassThrough();
    const diagnosticOutput = new PassThrough();
    const outputChunks: string[] = [];
    const diagnosticChunks: string[] = [];
    output.on('data', (chunk) => outputChunks.push(chunk.toString()));
    diagnosticOutput.on('data', (chunk) => diagnosticChunks.push(chunk.toString()));

    let resolveHandler: (() => void) | undefined;
    const handlerStarted = new Promise<void>((resolve) => {
      resolveHandler = resolve;
    });
    let releaseHandler: (() => void) | undefined;
    const handlerRelease = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });

    const done = runTuiDebugAutomationJsonLineServer({
      input,
      output,
      diagnosticOutput,
      handler: {
        async handle() {
          resolveHandler?.();
          await handlerRelease;
          console.log('pending handler diagnostic');
          return { settled: true };
        },
      },
    });

    input.write(
      `${JSON.stringify({
        schema: TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA,
        id: 'pending-request',
        method: 'session.facts',
        params: { sessionId: 'debug-session-pending' },
      })}\n`,
    );
    await handlerStarted;
    input.emit('error', new Error('input failed'));

    expect(globalThis.console).not.toBe(originalConsole);
    releaseHandler?.();
    await done;

    const responses = outputChunks
      .join('')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(responses).toEqual([
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ message: 'input failed' }),
      }),
      expect.objectContaining({ ok: true, result: { settled: true } }),
    ]);
    expect(diagnosticChunks.join('')).toContain('pending handler diagnostic');
    expect(globalThis.console).toBe(originalConsole);
  });
});
